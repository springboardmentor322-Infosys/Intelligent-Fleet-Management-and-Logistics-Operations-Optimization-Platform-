
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from database import get_db
import models

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
def get_dashboard(db: Session = Depends(get_db)):
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
def get_vehicles(db: Session = Depends(get_db)):
    return db.query(models.Vehicle).all()


@app.get("/api/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int, db: Session = Depends(get_db)):
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
def create_vehicle(vehicle_data: dict, db: Session = Depends(get_db)):
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


@app.post("/api/drivers")
def create_driver(driver: DriverCreate, db: Session = Depends(get_db)):
    existing_driver = db.query(models.Driver).filter(
        (models.Driver.phone_number == driver.phone_number)
        | (models.Driver.license_number == driver.license_number)
    ).first()

    if existing_driver:
        raise HTTPException(
            status_code=400,
            detail="Phone number or license number already exists"
        )

    new_driver = models.Driver(
        name=driver.name,
        phone_number=driver.phone_number,
        license_number=driver.license_number,
        status=driver.status
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
        "status": new_driver.status
    }


@app.get("/api/drivers")
def get_drivers(db: Session = Depends(get_db)):
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

class AssignmentCreate(BaseModel):
    vehicle_id: int
    driver_id: int


@app.post("/api/assignments")
def create_assignment(
    assignment: AssignmentCreate,
    db: Session = Depends(get_db)
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == assignment.vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    driver = db.query(models.Driver).filter(
        models.Driver.id == assignment.driver_id
    ).first()

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

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
def get_assignments(db: Session = Depends(get_db)):
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
    db: Session = Depends(get_db)
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == vehicle_id
    ).first()

    driver = db.query(models.Driver).filter(
        models.Driver.id == driver_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")

    trip = models.Trip(
        trip_name=trip_name,
        origin=origin,
        destination=destination,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        status="Planned"
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
        "status": trip.status
    }


@app.get("/api/trips")
def get_trips(db: Session = Depends(get_db)):
    return db.query(models.Trip).all()

@app.patch("/api/trips/{trip_id}/status")
def update_trip_status(
    trip_id: int,
    status: str,
    db: Session = Depends(get_db)
):
    allowed_statuses = ["Planned", "In Progress", "Completed", "Delayed"]

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

    trip.status = status
    db.commit()
    db.refresh(trip)

    return {
        "message": "Trip status updated successfully",
        "trip_id": trip.id,
        "status": trip.status
    }
  
