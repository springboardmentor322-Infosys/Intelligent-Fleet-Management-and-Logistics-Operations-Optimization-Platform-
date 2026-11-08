
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy import func
from pydantic import BaseModel
from openpyxl import Workbook
from fastapi.encoders import jsonable_encoder
import json
import urllib.parse
import asyncio
from fastapi import WebSocket, WebSocketDisconnect
import urllib.request
import urllib.error
from fastapi.responses import FileResponse
from models import (
    User,
    Vehicle,
    Driver,
    VehicleAssignment,
    Trip,
    Maintenance,
    Shipment,
    FuelLog,
    VehicleTracking,
    Notification,
    ShipmentStatusHistory
)
from database import engine, Base
from fastapi import HTTPException, Depends
from sqlalchemy.orm import Session
from fastapi.security import OAuth2PasswordRequestForm
from database import get_db
from auth import hash_password, verify_password, create_access_token
from fastapi.security import OAuth2PasswordBearer
from auth import verify_token
from models import Maintenance
from datetime import date
from datetime import datetime

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
import os

from database import get_db
import models
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="FleetFlow API",
    description="Fleet Management System API",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")


def get_current_user(token: str = Depends(oauth2_scheme)):
    payload = verify_token(token)

    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token"
        )

    return payload


def require_role(*allowed_roles):
    def role_checker(current_user: dict = Depends(get_current_user)):
        if current_user.get("role") not in allowed_roles:
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to access this resource"
            )

        return current_user

    return role_checker




def get_driver_vehicle_ids(db: Session, driver_id: int):
    assignments = db.query(VehicleAssignment).filter(
        VehicleAssignment.driver_id == driver_id
    ).all()

    return [item.vehicle_id for item in assignments]




@app.get("/")
def home():
    return {
        "message": "Welcome to FleetFlow API",
        "status": "running"
    }


@app.get("/api/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status": "healthy", "database": "connected"}
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed"
        ) from exc



@app.get("/api/dashboard")
def get_dashboard(db: Session = Depends(get_db),current_user: dict = Depends( require_role("Admin", "Manager", "Dispatcher"))):   
    try:
        vehicles = db.query(models.Vehicle).all()
        drivers = db.query(models.Driver).all()
        assignments = db.query(models.VehicleAssignment).count()

        available_vehicles = sum(
            1 for vehicle in vehicles
            if vehicle.status == "Available"
        )

        active_drivers = sum(
            1 for driver in drivers
            if driver.status == "Available"
        )

        vehicle_status = {}
        for vehicle in vehicles:
            status = vehicle.status or "Unknown"
            vehicle_status[status] = (
                vehicle_status.get(status, 0) + 1
            )

        return {
            "total_vehicles": len(vehicles),
            "available_vehicles": available_vehicles,
            "total_drivers": len(drivers),
            "active_drivers": active_drivers,
            "vehicle_assignments": assignments,
            "active_trips": 0,
            "maintenance_due": 0,
            "vehicle_status": vehicle_status
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail="Unable to load dashboard data"
        ) from exc



@app.get("/api/vehicles")
def get_vehicles(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):    return db.query(models.Vehicle).all()


@app.get("/api/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int,db: Session = Depends(get_db),current_user: dict = Depends(require_role("Admin", "Manager", "Dispatcher"))): 
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    return vehicle


@app.post("/api/vehicles")
def create_vehicle(vehicle_data: dict,db: Session = Depends(get_db),current_user: dict = Depends(require_role("Admin", "Manager"))):  
    vehicle_number = vehicle_data.get("vehicle_number")
    vehicle_type = vehicle_data.get("vehicle_type")

    if not vehicle_number or not vehicle_type:
        raise HTTPException(
            status_code=400,
            detail="vehicle_number and vehicle_type are required"
        )

    existing = db.query(models.Vehicle).filter(
        models.Vehicle.vehicle_number == vehicle_number
    ).first()

    if existing:
        raise HTTPException(
            status_code=409,
            detail="Vehicle number already exists"
        )

    try:
        vehicle = models.Vehicle(
           vehicle_number=vehicle_data["vehicle_number"],
           vehicle_type=vehicle_data["vehicle_type"],
           model=vehicle_data["model"],
           status=vehicle_data.get("status", "Available")
        )
        db.add(vehicle)
        db.commit()
        db.refresh(vehicle)
        return vehicle
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail="Could not create vehicle. Check the submitted fields."
        ) from exc

class DriverCreate(BaseModel):
    name: str
    phone_number: str
    license_number: str
    status: str = "Available"
    user_id: int | None = None

@app.post("/api/drivers")
def create_driver(
    driver: DriverCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin"))
):
    existing_driver = db.query(models.Driver).filter(
        (models.Driver.phone_number == driver.phone_number)
        | (models.Driver.license_number == driver.license_number)
    ).first()

    if existing_driver:
        raise HTTPException(
            status_code=400,
            detail="Phone number or license number already exists"
        )

    linked_user = None

    if driver.user_id is not None:
        linked_user = db.query(User).filter(
            User.id == driver.user_id
        ).first()

        if not linked_user:
            raise HTTPException(
                status_code=404,
                detail="User account not found"
            )

        if linked_user.role != "Driver":
            raise HTTPException(
                status_code=400,
                detail="Only Driver accounts can be linked"
            )

        already_linked = db.query(models.Driver).filter(
            models.Driver.user_id == driver.user_id
        ).first()

        if already_linked:
            raise HTTPException(
                status_code=400,
                detail="This user is already linked to a driver"
            )

    new_driver = models.Driver(
        name=driver.name,
        phone_number=driver.phone_number,
        license_number=driver.license_number,
        status=driver.status,
        user_id=driver.user_id
    )

    db.add(new_driver)
    db.commit()
    db.refresh(new_driver)

    return {
        "message": "Driver registered successfully",
        "id": new_driver.id,
        "name": new_driver.name,
        "phone_number": new_driver.phone_number,
        "license_number": new_driver.license_number,
        "status": new_driver.status,
        "user_id": new_driver.user_id
    }

@app.get("/api/drivers")
def get_drivers(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    drivers = db.query(models.Driver).all()

    return [
        {
            "id": driver.id,
            "name": driver.name,
            "phone_number": driver.phone_number,
            "license_number": driver.license_number,
            "status": driver.status
        }
        for driver in drivers
    ]


# ==========================================
# DRIVER-SPECIFIC APIs
# ==========================================

from fastapi import HTTPException


def get_linked_driver(current_user: dict, db: Session):

    # Get authenticated user ID
    user_id = current_user.get("user_id") or current_user.get("id")

    # If ID is not in token, find user using username
    if user_id is None:
        username = current_user.get("username") or current_user.get("sub")

        if username:
            user = db.query(models.User).filter(
                models.User.username == username
            ).first()

            if user:
                user_id = user.id

    if user_id is None:
        raise HTTPException(
            status_code=401,
            detail="Unable to identify logged-in user"
        )

    driver = db.query(models.Driver).filter(
        models.Driver.user_id == int(user_id)
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver profile not linked to this account"
        )

    return driver


# 1. Driver's own profile
@app.get("/api/driver/me")
def get_my_driver_profile(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Driver"))
):
    driver = get_linked_driver(current_user, db)

    return {
        "id": driver.id,
        "name": driver.name,
        "phone_number": driver.phone_number,
        "license_number": driver.license_number,
        "status": driver.status
    }


# 2. Driver's assigned vehicles
@app.get("/api/driver/my-vehicles")
def get_my_vehicles(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Driver"))
):
    driver = get_linked_driver(current_user, db)

    assignments = db.query(
        models.VehicleAssignment
    ).filter(
        models.VehicleAssignment.driver_id == driver.id
    ).all()

    return [
        {
            "assignment_id": assignment.id,
            "vehicle_id": assignment.vehicle.id,
            "vehicle_number": assignment.vehicle.vehicle_number,
            "model": assignment.vehicle.model,
            "vehicle_type": assignment.vehicle.vehicle_type,
            "status": assignment.vehicle.status
        }
        for assignment in assignments
    ]


# 3. Driver's own trips and assignments
@app.get("/api/driver/my-trips")
def get_my_trips(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Driver"))
):
    driver = get_linked_driver(current_user, db)

    trips = db.query(models.Trip).filter(
        models.Trip.driver_id == driver.id
    ).all()

    return [
        {
            "id": trip.id,
            "trip_name": trip.trip_name,
            "origin": trip.origin,
            "destination": trip.destination,
            "status": trip.status,
            "vehicle_id": trip.vehicle_id
        }
        for trip in trips
    ]


class AssignmentCreate(BaseModel):
    vehicle_id: int
    driver_id: int


@app.post("/api/assignments")
def create_assignment(
    assignment: AssignmentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == assignment.vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    driver = db.query(models.Driver).filter(
        models.Driver.id == assignment.driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found"
        )

    existing = db.query(models.VehicleAssignment).filter(
        models.VehicleAssignment.vehicle_id == assignment.vehicle_id
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Vehicle already has an assignment"
        )

    new_assignment = models.VehicleAssignment(
        vehicle_id=assignment.vehicle_id,
        driver_id=assignment.driver_id
    )

    db.add(new_assignment)
    db.commit()
    db.refresh(new_assignment)

    return {
        "message": "Driver assigned to vehicle successfully",
        "assignment_id": new_assignment.id,
        "vehicle_id": new_assignment.vehicle_id,
        "driver_id": new_assignment.driver_id
    }

@app.get("/api/assignments")
def get_assignments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    assignments = db.query(models.VehicleAssignment).all()

    return [
        {
            "assignment_id": item.id,
            "vehicle_id": item.vehicle_id,
            "driver_id": item.driver_id
        }
        for item in assignments
    ]
# Trip API



@app.post("/api/trips")
def create_trip(
    trip_name: str,
    origin: str,
    destination: str,
    vehicle_id: int,
    driver_id: int,

    scheduled_start: datetime = None,
    scheduled_end: datetime = None,
    actual_start: datetime = None,
    actual_end: datetime = None,
    route: str = None,
    estimated_arrival: datetime = None,

    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    # Check vehicle
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == vehicle_id
    ).first()

    # Check driver
    driver = db.query(models.Driver).filter(
        models.Driver.id == driver_id
    ).first()

    if not vehicle:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found"
        )

    # Validate trip schedule
    if scheduled_start and scheduled_end:

        if scheduled_end <= scheduled_start:
            raise HTTPException(
                status_code=400,
                detail="Trip end time must be after start time"
            )

        # Check driver conflict
        driver_conflict = db.query(models.Trip).filter(
            models.Trip.driver_id == driver_id,
            models.Trip.scheduled_start < scheduled_end,
            models.Trip.scheduled_end > scheduled_start
        ).first()

        if driver_conflict:
            raise HTTPException(
                status_code=409,
                detail="Driver already has another trip during this time"
            )

        # Check vehicle conflict
        vehicle_conflict = db.query(models.Trip).filter(
            models.Trip.vehicle_id == vehicle_id,
            models.Trip.scheduled_start < scheduled_end,
            models.Trip.scheduled_end > scheduled_start
        ).first()

        if vehicle_conflict:
            raise HTTPException(
                status_code=409,
                detail="Vehicle already has another trip during this time"
            )

    # Create trip
    trip = models.Trip(
        trip_name=trip_name,
        origin=origin,
        destination=destination,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        status="Planned",
        scheduled_start=scheduled_start,
        scheduled_end=scheduled_end,
        actual_start=actual_start,
        actual_end=actual_end,
        route=route,
        estimated_arrival=estimated_arrival
    )

    db.add(trip)
    db.commit()
    db.refresh(trip)

    return {
        "message": "Trip created successfully",
        "trip_id": trip.id,
        "trip_name": trip.trip_name,
        "origin": trip.origin,
        "destination": trip.destination,
        "vehicle_id": trip.vehicle_id,
        "driver_id": trip.driver_id,
        "status": trip.status,
        "scheduled_start": trip.scheduled_start,
        "scheduled_end": trip.scheduled_end,
        "actual_start": trip.actual_start,
        "actual_end": trip.actual_end,
        "route": trip.route,
        "estimated_arrival": trip.estimated_arrival
    }

@app.get("/api/trips")
def get_trips(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    role = current_user.get("role")

    if role in ["Admin", "Manager", "Dispatcher"]:
        return db.query(models.Trip).all()

    if role == "Driver":
        user = db.query(User).filter(
            User.username == current_user.get("sub")
        ).first()

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User account not found"
            )

        driver = db.query(models.Driver).filter(
            models.Driver.user_id == user.id
        ).first()

        if not driver:
            raise HTTPException(
                status_code=404,
                detail="Driver profile not found"
            )

        return db.query(models.Trip).filter(
            models.Trip.driver_id == driver.id
        ).all()

    raise HTTPException(
        status_code=403,
        detail="You do not have permission to access trips"
    )

def get_coordinates(place: str):
    """Get latitude and longitude for a place using OpenStreetMap."""

    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode({
        "q": place,
        "format": "json",
        "limit": 1
    })

    request = urllib.request.Request(
        url,
        headers={"User-Agent": "FleetFlow/1.0"}
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            data = json.loads(response.read().decode())

        if not data:
            raise HTTPException(
                status_code=404,
                detail=f"Location not found: {place}"
            )

        return float(data[0]["lat"]), float(data[0]["lon"])

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Unable to find location. Please try again."
        ) from exc


@app.get("/api/routes/optimize")
def optimize_route(
    origin: str,
    destination: str,
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    if not origin.strip() or not destination.strip():
        raise HTTPException(
            status_code=400,
            detail="Origin and destination are required"
        )

    origin_lat, origin_lon = get_coordinates(origin)
    dest_lat, dest_lon = get_coordinates(destination)

    route_url = (
        "https://router.project-osrm.org/route/v1/driving/"
        f"{origin_lon},{origin_lat};{dest_lon},{dest_lat}"
        "?overview=full&geometries=geojson"
    )

    request = urllib.request.Request(
        route_url,
        headers={"User-Agent": "FleetFlow/1.0"}
    )

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            route_data = json.loads(response.read().decode())

        if route_data.get("code") != "Ok" or not route_data.get("routes"):
            raise HTTPException(
                status_code=404,
                detail="No driving route found between these locations"
            )

        route = route_data["routes"][0]

        # OSRM returns [longitude, latitude].
        # Leaflet requires [latitude, longitude].
        coordinates = [
            [lat, lon]
            for lon, lat in route["geometry"]["coordinates"]
        ]

        return {
            "origin": origin,
            "destination": destination,
            "distance_km": round(route["distance"] / 1000, 2),
            "duration_minutes": round(route["duration"] / 60, 2),
            "route_coordinates": coordinates,
            "provider": "OpenStreetMap + OSRM"
        }

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Route service is temporarily unavailable"
        ) from exc


@app.get("/api/routes/traffic-plan")
def traffic_aware_route(
    origin: str,
    destination: str,
    traffic_level: str = "moderate",
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    traffic_factors = {
        "low": 1.10,
        "moderate": 1.25,
        "high": 1.60,
        "severe": 2.00
    }

    traffic_level = traffic_level.lower().strip()

    if traffic_level not in traffic_factors:
        raise HTTPException(
            status_code=400,
            detail="Invalid traffic level. Choose low, moderate, high, or severe."
        )

    # Reuse the existing Route Optimization API logic
    route = optimize_route(
        origin=origin,
        destination=destination,
        current_user=current_user
    )

    original_duration = route["duration_minutes"]

    estimated_duration = round(
        original_duration * traffic_factors[traffic_level], 2
    )

    delay = round(estimated_duration - original_duration, 2)

    return {
        **route,
        "traffic_level": traffic_level,
        "traffic_factor": traffic_factors[traffic_level],
        "original_duration_minutes": original_duration,
        "estimated_duration_minutes": estimated_duration,
        "delay_minutes": delay,
        "traffic_status": "Simulated traffic estimate",
        "message": "Travel time adjusted based on simulated traffic conditions."
    }

@app.websocket("/ws/tracking/{vehicle_id}")
async def vehicle_tracking(
    websocket: WebSocket,
    vehicle_id: int,
    latitude: float = 13.6288,
    longitude: float = 79.4192
):
    await websocket.accept()

    try:
        update_number = 0

        while True:
            update_number += 1

            await websocket.send_json({
                "vehicle_id": vehicle_id,
                "latitude": latitude,
                "longitude": longitude,
                "update_number": update_number,
                "status": "Simulated GPS update"
            })

            # Simulate vehicle movement
            latitude += 0.0005
            longitude += 0.0005

            await asyncio.sleep(3)

    except WebSocketDisconnect:
        print(f"Vehicle {vehicle_id} tracking disconnected")

@app.patch("/api/trips/{trip_id}/status")
def update_trip_status(
    trip_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    allowed_statuses = [
        "Planned",
        "In Progress",
        "Completed",
        "Delayed"
    ]

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid status. Use Planned, In Progress, Completed, or Delayed."
        )

    trip = db.query(models.Trip).filter(
        models.Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    role = current_user.get("role")

    if role == "Driver":
        user = db.query(User).filter(
            User.username == current_user.get("sub")
        ).first()

        if not user:
            raise HTTPException(
                status_code=401,
                detail="User account not found"
            )

        driver = db.query(models.Driver).filter(
            models.Driver.user_id == user.id
        ).first()

        if not driver or trip.driver_id != driver.id:
            raise HTTPException(
                status_code=403,
                detail="You can only update your own assigned trips"
            )

    elif role not in ["Admin", "Manager", "Dispatcher"]:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to update trip status"
        )

    trip.status = status
    db.commit()
    db.refresh(trip)

    return {
        "message": "Trip status updated successfully",
        "trip_id": trip.id,
        "status": trip.status
    }

@app.get("/api/users")
def get_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin"))
):
    users = db.query(User).all()

    return [
        {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": user.role
        }
        for user in users
    ]


# USER REGISTRATION

@app.post("/api/register")
def register_user(
    username: str,
    email: str,
    password: str,
    role: str = "Driver",
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin"))
):
    allowed_roles = ["Admin", "Manager", "Dispatcher", "Driver"]

    if role not in allowed_roles:
        raise HTTPException(status_code=400, detail="Invalid role")

    existing_user = db.query(User).filter(
        (User.username == username) | (User.email == email)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Username or email already exists"
        )

    new_user = User(
        username=username,
        email=email,
        hashed_password=hash_password(password),
        role=role
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User registered successfully",
        "username": new_user.username,
        "role": new_user.role
    }


# USER LOGIN
@app.post("/api/login")
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.username == form_data.username
    ).first()

    if not user or not verify_password(
        form_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid username or password"
        )

    access_token = create_access_token(
        data={
            "sub": user.username,
            "role": user.role
        }
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "username": user.username,
        "role": user.role
    } 

@app.get("/api/admin/dashboard")
def admin_dashboard(
    current_user: dict = Depends(require_role("Admin"))
):
    return {
        "message": "Welcome to Admin Dashboard",
        "username": current_user["sub"],
        "role": current_user["role"]
    }

# CREATE MAINTENANCE RECORD
@app.post("/api/maintenance")
def create_maintenance(
    vehicle_id: int,
    service_type: str,
    description: str,
    service_date: date,
    due_date: date,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if due_date < service_date:
        raise HTTPException(
            status_code=400,
            detail="Due date cannot be before service date"
        )

    maintenance = Maintenance(
        vehicle_id=vehicle_id,
        service_type=service_type,
        description=description,
        service_date=service_date,
        due_date=due_date,
        status="Scheduled"
    )

    db.add(maintenance)
    db.commit()
    db.refresh(maintenance)

    return {
        "message": "Maintenance record created successfully",
        "maintenance_id": maintenance.id,
        "vehicle_id": maintenance.vehicle_id,
        "service_type": maintenance.service_type,
        "status": maintenance.status
    }


@app.get("/api/maintenance")
def get_maintenance_records(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    records = db.query(Maintenance).all()

    return [
        {
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "service_type": record.service_type,
            "description": record.description,
            "service_date": record.service_date,
            "due_date": record.due_date,
            "status": record.status
        }
        for record in records
    ]


@app.get("/api/maintenance/upcoming")
def get_upcoming_maintenance(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    today = date.today()

    records = db.query(Maintenance).filter(
        Maintenance.due_date >= today,
        Maintenance.status != "Completed"
    ).order_by(Maintenance.due_date).all()

    return [
        {
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "service_type": record.service_type,
            "due_date": record.due_date,
            "status": record.status
        }
        for record in records
    ]


@app.patch("/api/maintenance/{maintenance_id}/status")
def update_maintenance_status(
    maintenance_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    maintenance = db.query(Maintenance).filter(
        Maintenance.id == maintenance_id
    ).first()

    if not maintenance:
        raise HTTPException(
            status_code=404,
            detail="Maintenance record not found"
        )

    allowed_statuses = ["Scheduled", "In Progress", "Completed"]

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid maintenance status"
        )

    maintenance.status = status
    db.commit()
    db.refresh(maintenance)

    return {
        "message": "Maintenance status updated successfully",
        "maintenance_id": maintenance.id,
        "status": maintenance.status
    }
# Create Shipment
@app.post("/api/shipments")
def create_shipment(
    shipment_number: str,
    origin: str,
    destination: str,
    customer_name: str,
    shipment_date: date,
    expected_delivery: date,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    if expected_delivery < shipment_date:
        raise HTTPException(
            status_code=400,
            detail="Expected delivery cannot be before shipment date"
        )

    existing = db.query(Shipment).filter(
        Shipment.shipment_number == shipment_number
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Shipment number already exists"
        )

    shipment = Shipment(
        shipment_number=shipment_number,
        origin=origin,
        destination=destination,
        customer_name=customer_name,
        shipment_date=shipment_date,
        expected_delivery=expected_delivery,
        status="Pending"
    )

    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    return {
        "message": "Shipment created successfully",
        "shipment_id": shipment.id,
        "shipment_number": shipment.shipment_number,
        "status": shipment.status
    }

@app.put("/api/shipments/{shipment_id}/assign-trip")
def assign_shipment_to_trip(
    shipment_id: int,
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    # Check whether shipment exists
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found"
        )

    # Check whether trip exists
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    # Assign shipment to existing trip
    shipment.trip_id = trip.id

    db.commit()
    db.refresh(shipment)

    return {
        "message": "Shipment assigned to trip successfully",
        "shipment_id": shipment.id,
        "shipment_number": shipment.shipment_number,
        "trip_id": shipment.trip_id
    }


@app.put("/api/shipments/{shipment_id}/status")
def update_shipment_status(
    shipment_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found"
        )

    if not status.strip():
        raise HTTPException(
            status_code=400,
            detail="Status cannot be empty"
        )

    # Define allowed status transitions
    allowed_transitions = {
        "Pending": ["In Transit", "Cancelled"],
        "In Transit": ["Delivered", "Delayed", "Cancelled"],
        "Delayed": ["In Transit", "Delivered", "Cancelled"],
        "Delivered": [],
        "Cancelled": []
    }

    current_status = shipment.status.strip()
    new_status = status.strip()

    # Check whether status exists
    if current_status not in allowed_transitions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid current shipment status: {current_status}"
        )

    if new_status not in allowed_transitions:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid shipment status: {new_status}"
        )

    # Validate status transition
    if new_status not in allowed_transitions[current_status]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change shipment status from {current_status} to {new_status}"
        )

    # Update shipment status
    shipment.status = new_status

    # Save status history
    history = ShipmentStatusHistory(
        shipment_id=shipment.id,
        status=new_status
    )

    db.add(history)
    db.commit()
    db.refresh(shipment)

    return {
        "message": "Shipment status updated successfully",
        "shipment_id": shipment.id,
        "previous_status": current_status,
        "status": shipment.status
    }

@app.get("/api/shipments")
def get_shipments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    shipments = db.query(Shipment).order_by(
        Shipment.id.desc()
    ).all()

    result = []

    for shipment in shipments:
        shipment_data = jsonable_encoder(shipment)

        trip = None

        if shipment.trip_id:
            trip = db.query(Trip).filter(
                Trip.id == shipment.trip_id
            ).first()

        shipment_data["eta"] = (
            trip.estimated_arrival if trip else None
        )

        result.append(shipment_data)

    return result

@app.get("/api/shipments/delayed")
def get_delayed_shipments(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    today = date.today()

    return db.query(Shipment).filter(
        Shipment.expected_delivery < today,
        Shipment.status != "Delivered"
    ).all()

@app.get("/api/shipments/{shipment_id}/history")
def get_shipment_status_history(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher", "Driver")
    )
):
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found"
        )

    history = db.query(ShipmentStatusHistory).filter(
        ShipmentStatusHistory.shipment_id == shipment_id
    ).order_by(
        ShipmentStatusHistory.changed_at.asc()
    ).all()

    return history


@app.patch("/api/shipments/{shipment_id}/status")
def update_shipment_status(
    shipment_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found"
        )

    allowed_statuses = [
        "Pending", "In Transit", "Delivered", "Delayed"
    ]

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid shipment status"
        )

    shipment.status = status

    if status == "Delivered":
        shipment.actual_delivery = date.today()

    db.commit()
    db.refresh(shipment)

    return {
        "message": "Shipment status updated successfully",
        "shipment_id": shipment.id,
        "status": shipment.status
    }
# Create Fuel Log
@app.post("/api/fuel")
def create_fuel_log(
    vehicle_id: int,
    fuel_type: str,
    quantity: float,
    cost: float,
    fuel_date: date,
    odometer_reading: float,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if quantity <= 0 or cost < 0 or odometer_reading < 0:
        raise HTTPException(
            status_code=400,
            detail="Invalid fuel quantity, cost, or odometer reading"
        )

    fuel_log = FuelLog(
        vehicle_id=vehicle_id,
        fuel_type=fuel_type,
        quantity=quantity,
        cost=cost,
        fuel_date=fuel_date,
        odometer_reading=odometer_reading
    )

    db.add(fuel_log)
    db.commit()
    db.refresh(fuel_log)

    return {
        "message": "Fuel log created successfully",
        "fuel_log_id": fuel_log.id,
        "vehicle_id": fuel_log.vehicle_id,
        "quantity": fuel_log.quantity,
        "cost": fuel_log.cost
    }


@app.get("/api/fuel")
def get_fuel_logs(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    return db.query(FuelLog).order_by(
        FuelLog.fuel_date.desc()
    ).all()


@app.get("/api/fuel/analytics")
def get_fuel_analytics(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    result = db.query(
        func.coalesce(func.sum(FuelLog.quantity), 0),
        func.coalesce(func.sum(FuelLog.cost), 0),
        func.count(FuelLog.id)
    ).first()

    return {
        "total_fuel_quantity": result[0],
        "total_fuel_cost": result[1],
        "total_fuel_records": result[2]
    }


@app.get("/api/fuel/analytics/{vehicle_id}")
def get_vehicle_fuel_analytics(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found"
        )

    result = db.query(
        func.coalesce(func.sum(FuelLog.quantity), 0),
        func.coalesce(func.sum(FuelLog.cost), 0),
        func.count(FuelLog.id)
    ).filter(
        FuelLog.vehicle_id == vehicle_id
    ).first()

    return {
        "vehicle_id": vehicle_id,
        "total_fuel_quantity": result[0],
        "total_fuel_cost": result[1],
        "total_fuel_records": result[2]
    }

# Add Vehicle GPS Location
@app.post("/api/tracking")
def add_vehicle_tracking(
    vehicle_id: int,
    latitude: float,
    longitude: float,
    location_name: str,
    speed: float,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    role = current_user.get("role")

    if role == "Driver":
        driver = get_linked_driver(current_user, db)
        vehicle_ids = get_driver_vehicle_ids(db, driver.id)

        if vehicle_id not in vehicle_ids:
            raise HTTPException(
                status_code=403,
                detail="You can update tracking only for your assigned vehicle"
            )

    elif role not in ["Admin", "Manager", "Dispatcher"]:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to update tracking"
        )

    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not (-90 <= latitude <= 90):
        raise HTTPException(status_code=400, detail="Invalid latitude")

    if not (-180 <= longitude <= 180):
        raise HTTPException(status_code=400, detail="Invalid longitude")

    if speed < 0:
        raise HTTPException(
            status_code=400,
            detail="Speed cannot be negative"
        )

    tracking = VehicleTracking(
        vehicle_id=vehicle_id,
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        speed=speed
    )

    db.add(tracking)
    db.commit()
    db.refresh(tracking)

    return {
        "message": "Vehicle location updated successfully",
        "tracking_id": tracking.id,
        "vehicle_id": tracking.vehicle_id,
        "latitude": tracking.latitude,
        "longitude": tracking.longitude,
        "location_name": tracking.location_name,
        "speed": tracking.speed
    }


@app.get("/api/tracking")
def get_all_tracking(
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    return db.query(VehicleTracking).order_by(
        VehicleTracking.recorded_at.desc()
    ).all()


@app.get("/api/tracking/{vehicle_id}")
def get_vehicle_tracking(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    role = current_user.get("role")

    if role == "Driver":
        driver = get_linked_driver(current_user, db)
        vehicle_ids = get_driver_vehicle_ids(db, driver.id)

        if vehicle_id not in vehicle_ids:
            raise HTTPException(
                status_code=403,
                detail="You can view tracking only for your assigned vehicle"
            )

    elif role not in ["Admin", "Manager", "Dispatcher"]:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view tracking"
        )

    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    tracking = db.query(VehicleTracking).filter(
        VehicleTracking.vehicle_id == vehicle_id
    ).order_by(
        VehicleTracking.recorded_at.desc()
    ).first()

    if not tracking:
        raise HTTPException(
            status_code=404,
            detail="No tracking information available"
        )

    return tracking


@app.get("/api/tracking/{vehicle_id}/eta")
def get_vehicle_eta(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    role = current_user.get("role")

    if role == "Driver":
        driver = get_linked_driver(current_user, db)
        vehicle_ids = get_driver_vehicle_ids(db, driver.id)

        if vehicle_id not in vehicle_ids:
            raise HTTPException(
                status_code=403,
                detail="You can view ETA only for your assigned vehicle"
            )

    elif role not in ["Admin", "Manager", "Dispatcher"]:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view ETA"
        )

    trip = db.query(Trip).filter(
        Trip.vehicle_id == vehicle_id,
        Trip.status == "In Progress"
    ).order_by(
        Trip.id.desc()
    ).first()

    if not trip:
        return {
            "vehicle_id": vehicle_id,
            "trip_id": None,
            "estimated_arrival": None,
            "status": "No active trip"
        }

    return {
        "vehicle_id": vehicle_id,
        "trip_id": trip.id,
        "trip_name": trip.trip_name,
        "origin": trip.origin,
        "destination": trip.destination,
        "estimated_arrival": trip.estimated_arrival,
        "status": trip.status
    }

@app.patch("/api/trips/{trip_id}/eta")
def update_trip_eta(
    trip_id: int,
    estimated_arrival: datetime,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager", "Dispatcher"))
):
    trip = db.query(Trip).filter(Trip.id == trip_id).first()

    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    trip.estimated_arrival = estimated_arrival
    db.commit()
    db.refresh(trip)

    return {
        "message": "Trip ETA updated successfully",
        "trip_id": trip.id,
        "estimated_arrival": trip.estimated_arrival
    }

# Create Notification
@app.post("/api/notifications")
def create_notification(
    title: str,
    message: str,
    notification_type: str = "Info",
    vehicle_id: int = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(
        require_role("Admin", "Manager", "Dispatcher")
    )
):
    if vehicle_id is not None:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == vehicle_id
        ).first()

        if not vehicle:
            raise HTTPException(
                status_code=404,
                detail="Vehicle not found"
            )

    notification = Notification(
        vehicle_id=vehicle_id,
        title=title,
        message=message,
        notification_type=notification_type
    )

    db.add(notification)
    db.commit()
    db.refresh(notification)

    return {
        "message": "Notification created successfully",
        "notification_id": notification.id,
        "title": notification.title
    }


@app.get("/api/notifications")
def get_notifications(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    role = current_user.get("role")

    query = db.query(Notification)

    if role == "Driver":
        driver = get_linked_driver(current_user, db)
        vehicle_ids = get_driver_vehicle_ids(db, driver.id)

        query = query.filter(
            (Notification.vehicle_id.in_(vehicle_ids))
            | (Notification.vehicle_id.is_(None))
        )

    elif role not in ["Admin", "Manager", "Dispatcher"]:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to view notifications"
        )

    return query.order_by(
        Notification.created_at.desc()
    ).all()


@app.patch("/api/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    notification = db.query(Notification).filter(
        Notification.id == notification_id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=404,
            detail="Notification not found"
        )

    role = current_user.get("role")

    if role == "Driver":
        driver = get_linked_driver(current_user, db)
        vehicle_ids = get_driver_vehicle_ids(db, driver.id)

        if (
            notification.vehicle_id is not None
            and notification.vehicle_id not in vehicle_ids
        ):
            raise HTTPException(
                status_code=403,
                detail="You cannot mark this notification as read"
            )

    elif role not in ["Admin", "Manager", "Dispatcher"]:
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to update notifications"
        )

    notification.is_read = True
    db.commit()
    db.refresh(notification)

    return {
        "message": "Notification marked as read",
        "notification_id": notification.id,
        "is_read": notification.is_read
    }

# Delivery Performance Report
# Delivery Performance Report
@app.get("/api/reports/delivery")
def delivery_report(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    total_shipments = db.query(Shipment).count()

    delivered = db.query(Shipment).filter(
        Shipment.status == "Delivered"
    ).count()

    pending = db.query(Shipment).filter(
        Shipment.status == "Pending"
    ).count()

    in_transit = db.query(Shipment).filter(
        Shipment.status == "In Transit"
    ).count()

    delayed = db.query(Shipment).filter(
        Shipment.expected_delivery < date.today(),
        Shipment.status != "Delivered"
    ).count()

    delivery_rate = (
        round((delivered / total_shipments) * 100, 2)
        if total_shipments > 0 else 0
    )

    return {
        "total_shipments": total_shipments,
        "delivered": delivered,
        "pending": pending,
        "in_transit": in_transit,
        "delayed": delayed,
        "delivery_rate_percentage": delivery_rate
    }


# Maintenance Report
@app.get("/api/reports/maintenance")
def maintenance_report(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    total_records = db.query(Maintenance).count()

    scheduled = db.query(Maintenance).filter(
        Maintenance.status == "Scheduled"
    ).count()

    in_progress = db.query(Maintenance).filter(
        Maintenance.status == "In Progress"
    ).count()

    completed = db.query(Maintenance).filter(
        Maintenance.status == "Completed"
    ).count()

    overdue = db.query(Maintenance).filter(
        Maintenance.due_date < date.today(),
        Maintenance.status != "Completed"
    ).count()

    return {
        "total_maintenance_records": total_records,
        "scheduled": scheduled,
        "in_progress": in_progress,
        "completed": completed,
        "overdue": overdue
    }


# PDF Delivery Report
@app.get("/api/reports/delivery/pdf")
def export_delivery_pdf(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    total = db.query(Shipment).count()

    delivered = db.query(Shipment).filter(
        Shipment.status == "Delivered"
    ).count()

    pending = db.query(Shipment).filter(
        Shipment.status == "Pending"
    ).count()

    delayed = db.query(Shipment).filter(
        Shipment.expected_delivery < date.today(),
        Shipment.status != "Delivered"
    ).count()

    file_path = "delivery_report.pdf"
    pdf = canvas.Canvas(file_path, pagesize=A4)

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(150, 800, "FleetFlow Delivery Report")

    pdf.setFont("Helvetica", 12)
    pdf.drawString(50, 750, f"Total Shipments: {total}")
    pdf.drawString(50, 720, f"Delivered: {delivered}")
    pdf.drawString(50, 690, f"Pending: {pending}")
    pdf.drawString(50, 660, f"Delayed: {delayed}")

    pdf.save()

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename="delivery_report.pdf"
    )


# PDF Maintenance Report
@app.get("/api/reports/maintenance/pdf")
def export_maintenance_pdf(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    total = db.query(Maintenance).count()

    scheduled = db.query(Maintenance).filter(
        Maintenance.status == "Scheduled"
    ).count()

    completed = db.query(Maintenance).filter(
        Maintenance.status == "Completed"
    ).count()

    overdue = db.query(Maintenance).filter(
        Maintenance.due_date < date.today(),
        Maintenance.status != "Completed"
    ).count()

    file_path = "maintenance_report.pdf"
    pdf = canvas.Canvas(file_path, pagesize=A4)

    pdf.setFont("Helvetica-Bold", 18)
    pdf.drawString(150, 800, "FleetFlow Maintenance Report")

    pdf.setFont("Helvetica", 12)
    pdf.drawString(50, 750, f"Total Records: {total}")
    pdf.drawString(50, 720, f"Scheduled: {scheduled}")
    pdf.drawString(50, 690, f"Completed: {completed}")
    pdf.drawString(50, 660, f"Overdue: {overdue}")

    pdf.save()

    return FileResponse(
        file_path,
        media_type="application/pdf",
        filename="maintenance_report.pdf"
    )


# Excel Delivery Report
@app.get("/api/reports/delivery/excel")
def export_delivery_excel(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    total = db.query(Shipment).count()

    delivered = db.query(Shipment).filter(
        Shipment.status == "Delivered"
    ).count()

    pending = db.query(Shipment).filter(
        Shipment.status == "Pending"
    ).count()

    in_transit = db.query(Shipment).filter(
        Shipment.status == "In Transit"
    ).count()

    delayed = db.query(Shipment).filter(
        Shipment.expected_delivery < date.today(),
        Shipment.status != "Delivered"
    ).count()

    delivery_rate = (
        round((delivered / total) * 100, 2)
        if total > 0 else 0
    )

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Delivery Report"

    sheet.append(["FleetFlow Delivery Performance Report"])
    sheet.append(["Metric", "Value"])
    sheet.append(["Total Shipments", total])
    sheet.append(["Delivered", delivered])
    sheet.append(["Pending", pending])
    sheet.append(["In Transit", in_transit])
    sheet.append(["Delayed", delayed])
    sheet.append(["Delivery Rate (%)", delivery_rate])

    file_path = "delivery_report.xlsx"
    workbook.save(file_path)

    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="delivery_report.xlsx"
    )


# Excel Maintenance Report
@app.get("/api/reports/maintenance/excel")
def export_maintenance_excel(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("Admin", "Manager"))
):
    total = db.query(Maintenance).count()

    scheduled = db.query(Maintenance).filter(
        Maintenance.status == "Scheduled"
    ).count()

    in_progress = db.query(Maintenance).filter(
        Maintenance.status == "In Progress"
    ).count()

    completed = db.query(Maintenance).filter(
        Maintenance.status == "Completed"
    ).count()

    overdue = db.query(Maintenance).filter(
        Maintenance.due_date < date.today(),
        Maintenance.status != "Completed"
    ).count()

    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Maintenance Report"

    sheet.append(["FleetFlow Maintenance Report"])
    sheet.append(["Metric", "Value"])
    sheet.append(["Total Records", total])
    sheet.append(["Scheduled", scheduled])
    sheet.append(["In Progress", in_progress])
    sheet.append(["Completed", completed])
    sheet.append(["Overdue", overdue])

    file_path = "maintenance_report.xlsx"
    workbook.save(file_path)

    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="maintenance_report.xlsx"
    )