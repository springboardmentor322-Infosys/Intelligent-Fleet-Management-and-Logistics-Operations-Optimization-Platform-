import io
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from fastapi import (
    FastAPI,
    Depends,
    HTTPException,
    status,
    Body,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.security import (
    OAuth2PasswordBearer,
    OAuth2PasswordRequestForm,
)
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import Base, engine, get_db
import models
import requests


# =========================================================
# ENVIRONMENT CONFIGURATION
# =========================================================

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError(
        "SECRET_KEY is missing. Add a strong SECRET_KEY to backend/.env."
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
)

# Swagger obtains its JWT token from /token.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/token")


# =========================================================
# FASTAPI APPLICATION
# =========================================================

app = FastAPI(
    title="FleetFlow API",
    description="Fleet Management and Logistics Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Creates missing tables based on models.py.
# Existing tables are not dropped or recreated.
Base.metadata.create_all(bind=engine)


# =========================================================
# REQUEST SCHEMAS
# =========================================================

VALID_ROLES = {
    "Administrator",
    "Fleet Manager",
    "Dispatcher",
    "Driver",
}


class RegisterRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    role: str = "Driver"


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class VehicleCreate(BaseModel):
    vehicle_number: str = Field(
        min_length=2,
        max_length=30,
    )
    vehicle_type: str = Field(
        min_length=2,
        max_length=50,
    )
    capacity: int = Field(gt=0)
    status: str = "Active"
    driver_id: Optional[int] = None
    fuel_type: Optional[str] = None


class VehicleUpdate(BaseModel):
    vehicle_number: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=30,
    )
    vehicle_type: Optional[str] = Field(
        default=None,
        min_length=2,
        max_length=50,
    )
    status: Optional[str] = None
    driver_id: Optional[int] = None
    fuel_type: Optional[str] = None
# ==========================================
# MILESTONE 3 - PYDANTIC SCHEMAS
# ==========================================

class DriverAssignmentCreate(BaseModel):
    driver_id: int
    vehicle_id: int
    trip_id: int
    assignment_date: Optional[datetime] = None


class FuelRecordCreate(BaseModel):
    vehicle_id: int
    fuel_type: str
    quantity_litres: float
    price_per_litre: float
    refuel_date: date


class MaintenanceAlertCreate(BaseModel):
    maintenance_id: int
    alert_type: str
    vehicle_id: int
    scheduled_date: date
    message: str = Field(min_length=3)
    status: str = "Unresolved"


# =========================================================
# PASSWORD AND JWT HELPERS
# =========================================================

def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str,
) -> bool:
    return pwd_context.verify(
        plain_password,
        hashed_password,
    )


def create_access_token(
    user_id: int,
    email: str,
    role: str,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "email": email,
        "role": role,
        "exp": expire,
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def authenticate_user(
    email: str,
    password: str,
    db: Session,
):
    user = (
        db.query(models.User)
        .filter(models.User.email == email)
        .first()
    )

    if user is None:
        return None

    if not verify_password(
        password,
        user.hashed_password,
    ):
        return None

    return user


# =========================================================
# AUTHENTICATION AND ROLE HELPERS
# =========================================================

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired authentication token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception

        user_id = int(user_id)

    except (JWTError, ValueError, TypeError):
        raise credentials_exception

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id)
        .first()
    )

    if user is None:
        raise credentials_exception

    return user


def require_roles(*allowed_roles):
    def role_checker(
        current_user=Depends(get_current_user),
    ):
        if current_user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action",
            )

        return current_user

    return role_checker


# =========================================================
# HOME AND HEALTH CHECKS
# =========================================================

@app.get("/")
def home():
    return {
        "message": "Welcome to FleetFlow API",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/db-health")
def database_health(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))

        return {
            "status": "connected",
            "database": "fleetflow",
        }

    except Exception:
        raise HTTPException(
            status_code=503,
            detail="Database connection failed",
        )


# =========================================================
# USER REGISTRATION
# =========================================================

@app.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(
    user_data: RegisterRequest,
    db: Session = Depends(get_db),
):
    existing_user = (
        db.query(models.User)
        .filter(models.User.email == user_data.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="An account with this email already exists",
        )

    if user_data.role not in VALID_ROLES:
        raise HTTPException(
            status_code=400,
            detail="Invalid role",
        )

    # Public registration cannot create privileged accounts.
    if user_data.role != "Driver":
        raise HTTPException(
            status_code=403,
            detail="Public registration is limited to the Driver role",
        )

    new_user = models.User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return {
        "message": "User registered successfully",
        "id": new_user.id,
        "full_name": new_user.full_name,
        "email": new_user.email,
        "role": new_user.role,
    }


# =========================================================
# JSON LOGIN
# =========================================================

@app.post("/login")
def login_user(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    user = authenticate_user(
        login_data.email,
        login_data.password,
        db,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        },
    }


# =========================================================
# OAUTH2 LOGIN FOR SWAGGER AUTHORIZE
# =========================================================

@app.post("/token")
def issue_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # OAuth2PasswordRequestForm uses "username".
    # For FleetFlow, the username field contains the user's email.
    user = authenticate_user(
        form_data.username,
        form_data.password,
        db,
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token(
        user_id=user.id,
        email=user.email,
        role=user.role,
    )

    return {
        "access_token": token,
        "token_type": "bearer",
    }


# =========================================================
# CURRENT USER PROFILE
# =========================================================

@app.get("/me")
def get_my_profile(
    current_user=Depends(get_current_user),
):
    return {
        "id": current_user.id,
        "full_name": current_user.full_name,
        "email": current_user.email,
        "role": current_user.role,
    }


# =========================================================
# LIST VEHICLES
# =========================================================

@app.get("/vehicles")
def list_vehicles(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    vehicles = db.query(models.Vehicle).all()

    return [
        {
            "id": vehicle.id,
            "vehicle_number": vehicle.vehicle_number,
            "vehicle_type": vehicle.vehicle_type,
            "capacity": vehicle.capacity,
            "status": vehicle.status,
            "driver_id": vehicle.driver_id,
            "driver": vehicle.driver.full_name if vehicle.driver else None,
            "fuel_type": vehicle.fuel_type,
            "latitude": vehicle.latitude,
            "longitude": vehicle.longitude,
        }
        for vehicle in vehicles
    ]


# =========================================================
# CREATE VEHICLE
# =========================================================

@app.post("/vehicles", status_code=status.HTTP_201_CREATED)
def create_vehicle(
    vehicle_data: VehicleCreate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_roles("Administrator", "Fleet Manager")
    ),
):
    existing_vehicle = (
        db.query(models.Vehicle)
        .filter(
            models.Vehicle.vehicle_number
            == vehicle_data.vehicle_number
        )
        .first()
    )

    if existing_vehicle:
        raise HTTPException(
            status_code=409,
            detail="A vehicle with this registration number already exists",
        )

    if vehicle_data.status not in {
        "Active",
        "In Maintenance",
        "Inactive",
    }:
        raise HTTPException(
            status_code=400,
            detail="Invalid vehicle status",
        )

    if vehicle_data.driver_id is not None:
        driver = (
            db.query(models.Driver)
            .filter(models.Driver.id == vehicle_data.driver_id)
            .first()
        )

        if driver is None:
            raise HTTPException(
                status_code=404,
                detail="Driver not found",
            )

    new_vehicle = models.Vehicle(
        vehicle_number=vehicle_data.vehicle_number,
        vehicle_type=vehicle_data.vehicle_type,
        capacity=vehicle_data.capacity,
        status=vehicle_data.status,
        driver_id=vehicle_data.driver_id,
        fuel_type=vehicle_data.fuel_type,
    )

    db.add(new_vehicle)
    db.commit()
    db.refresh(new_vehicle)

    return {
        "message": "Vehicle created successfully",
        "vehicle": {
            "id": new_vehicle.id,
            "vehicle_number": new_vehicle.vehicle_number,
            "vehicle_type": new_vehicle.vehicle_type,
            "status": new_vehicle.status,
            "driver_id": new_vehicle.driver_id,
        },
    }


# =========================================================
# UPDATE VEHICLE
# =========================================================

@app.put("/vehicles/{vehicle_id}")
def update_vehicle(
    vehicle_id: int,
    vehicle_data: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(
        require_roles("Administrator", "Fleet Manager")
    ),
):
    vehicle = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.id == vehicle_id)
        .first()
    )

    if vehicle is None:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found",
        )

    updates = vehicle_data.model_dump(exclude_unset=True)

    if (
        "vehicle_number" in updates
        and updates["vehicle_number"] is not None
    ):
        duplicate = (
            db.query(models.Vehicle)
            .filter(
                models.Vehicle.vehicle_number
                == updates["vehicle_number"],
                models.Vehicle.id != vehicle_id,
            )
            .first()
        )

        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="That registration number is already in use",
            )

    if "status" in updates and updates["status"] is not None:
        if updates["status"] not in {
            "Active",
            "Assigned",
            "In Maintenance",
            "Inactive",
        }:
            raise HTTPException(
                status_code=400,
                detail="Invalid vehicle status",
            )

    if (
        "driver_id" in updates
        and updates["driver_id"] is not None
    ):
        driver = (
            db.query(models.Driver)
            .filter(models.Driver.id == updates["driver_id"])
            .first()
        )

        if driver is None:
            raise HTTPException(
                status_code=404,
                detail="Driver not found",
            )

    for field, value in updates.items():
        setattr(vehicle, field, value)

    db.commit()
    db.refresh(vehicle)

    return {
        "message": "Vehicle updated successfully",
        "vehicle": {
            "id": vehicle.id,
            "vehicle_number": vehicle.vehicle_number,
            "vehicle_type": vehicle.vehicle_type,
            "status": vehicle.status,
            "driver_id": vehicle.driver_id,
        },
    }


# =========================================================
# FLEET DASHBOARD
# =========================================================

@app.get("/dashboard")
def dashboard(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    total_vehicles = db.query(models.Vehicle).count()

    active_vehicles = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.status.in_(["Active", "Assigned"]))
        .count()
    )

    vehicles_in_maintenance = (
        db.query(models.Vehicle)
        .filter(models.Vehicle.status == "In Maintenance")
        .count()
    )

    total_drivers = db.query(models.Driver).count()

    assigned_driver_ids = (
        db.query(models.Vehicle.driver_id)
        .filter(models.Vehicle.driver_id.isnot(None))
        .distinct()
        .all()
    )

    assigned_driver_ids = {
        row[0] for row in assigned_driver_ids
    }

    unassigned_drivers = max(
        total_drivers - len(assigned_driver_ids),
        0,
    )

    return {
        "total_fleet": total_vehicles,
        "active_vehicles": active_vehicles,
        "vehicles_in_maintenance": vehicles_in_maintenance,
        "unassigned_drivers": unassigned_drivers,
    }


# =========================================================
# LIST USERS - ADMINISTRATOR ONLY
# =========================================================

@app.get("/users")
def list_users(
    db: Session = Depends(get_db),
    current_user=Depends(
        require_roles("Administrator")
    ),
):
    users = db.query(models.User).all()

    return [
        {
            "id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "role": user.role,
        }
        for user in users
    ]
@app.get("/drivers")
def get_drivers(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    drivers = db.query(models.Driver).all()

    return [
        {
            "id": driver.id,
            "full_name": driver.full_name,
            "phone": driver.phone,
            "license_number": driver.license_number,
            "status": driver.status
        }
        for driver in drivers
    ]




class DriverCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=100)
    phone: str = Field(..., min_length=10, max_length=20)
    license_number: str = Field(..., min_length=3, max_length=50)


class DriverUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    license_number: Optional[str] = None
    status: Optional[str] = None
@app.post("/drivers")
def create_driver(
    driver_data: DriverCreate = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles("Administrator", "Fleet Manager")
    )
):
    existing_driver = db.query(models.Driver).filter(
        (models.Driver.phone == driver_data.phone) |
        (models.Driver.license_number == driver_data.license_number)
    ).first()

    if existing_driver:
        raise HTTPException(
            status_code=400,
            detail="Phone number or license number already exists"
        )

    driver = models.Driver(
        full_name=driver_data.full_name,
        phone=driver_data.phone,
        license_number=driver_data.license_number,
        status="Available"
    )

    db.add(driver)
    db.commit()
    db.refresh(driver)

    return {
        "message": "Driver created successfully",
        "id": driver.id,
        "full_name": driver.full_name,
        "phone": driver.phone,
        "license_number": driver.license_number,
        "status": driver.status
    }
@app.put("/drivers/{driver_id}")
def update_driver(
    driver_id: int,
    driver_data: DriverUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles("Administrator", "Fleet Manager")
    )
):
    driver = db.query(models.Driver).filter(
        models.Driver.id == driver_id
    ).first()

    if not driver:
        raise HTTPException(
            status_code=404,
            detail="Driver not found"
        )

    existing_driver = db.query(models.Driver).filter(
        models.Driver.id != driver_id
    ).filter(
        (models.Driver.phone == driver_data.phone) |
        (models.Driver.license_number == driver_data.license_number)
    ).first()

    if existing_driver:
        raise HTTPException(
            status_code=400,
            detail="Phone number or license number already exists"
        )

    updates = driver_data.model_dump(exclude_unset=True)

    for field, value in updates.items():
        if value is not None:
            setattr(driver, field, value)

    db.commit()
    db.refresh(driver)

    return {
        "message": "Driver updated successfully",
        "id": driver.id,
        "full_name": driver.full_name,
        "phone": driver.phone,
        "license_number": driver.license_number,
        "status": driver.status
    }

# ==============================
# SHIPMENT MANAGEMENT API
# ==============================

from pydantic import BaseModel as PydanticBaseModel
from typing import Optional


class ShipmentCreate(PydanticBaseModel):
    shipment_number: str
    pickup_location: str
    delivery_location: str
    vehicle_id: Optional[int] = None
    driver_id: Optional[int] = None


class ShipmentStatusUpdate(PydanticBaseModel):
    status: str


@app.post("/shipments")
def create_shipment(
    shipment_data: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles("Administrator", "Fleet Manager")
    ),
):
    existing = db.query(models.Shipment).filter(
        models.Shipment.shipment_number == shipment_data.shipment_number
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="Shipment number already exists",
        )

    if shipment_data.vehicle_id is not None:
        vehicle = db.query(models.Vehicle).filter(
            models.Vehicle.id == shipment_data.vehicle_id
        ).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

    if shipment_data.driver_id is not None:
        driver = db.query(models.Driver).filter(
            models.Driver.id == shipment_data.driver_id
        ).first()
        if not driver:
            raise HTTPException(status_code=404, detail="Driver not found")

    shipment = models.Shipment(
        shipment_number=shipment_data.shipment_number,
        pickup_location=shipment_data.pickup_location,
        delivery_location=shipment_data.delivery_location,
        vehicle_id=shipment_data.vehicle_id,
        driver_id=shipment_data.driver_id,
        status="Pending",
    )

    db.add(shipment)
    db.commit()
    db.refresh(shipment)

    return {
        "message": "Shipment created successfully",
        "id": shipment.id,
        "shipment_number": shipment.shipment_number,
        "pickup_location": shipment.pickup_location,
        "delivery_location": shipment.delivery_location,
        "status": shipment.status,
        "vehicle_id": shipment.vehicle_id,
        "driver_id": shipment.driver_id,
    }


@app.get("/shipments")
def get_shipments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    shipments = db.query(models.Shipment).order_by(
        models.Shipment.id.desc()
    ).all()

    return [
        {
            "id": s.id,
            "shipment_number": s.shipment_number,
            "pickup_location": s.pickup_location,
            "delivery_location": s.delivery_location,
            "status": s.status,
            "vehicle_id": s.vehicle_id,
            "driver_id": s.driver_id,
        }
        for s in shipments
    ]


@app.get("/shipments/{shipment_id}")
def get_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    shipment = db.query(models.Shipment).filter(
        models.Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

    return {
        "id": shipment.id,
        "shipment_number": shipment.shipment_number,
        "pickup_location": shipment.pickup_location,
        "delivery_location": shipment.delivery_location,
        "status": shipment.status,
        "vehicle_id": shipment.vehicle_id,
        "driver_id": shipment.driver_id,
    }


@app.put("/shipments/{shipment_id}/status")
def update_shipment_status(
    shipment_id: int,
    status_data: ShipmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles("Administrator", "Fleet Manager")
    ),
):
    allowed_statuses = {"Pending", "In Transit", "Delivered", "Cancelled"}

    if status_data.status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(sorted(allowed_statuses))}",
        )

    shipment = db.query(models.Shipment).filter(
        models.Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")

        # Define valid status transitions
    valid_transitions = {
        "Pending": ["In Transit", "Cancelled"],
        "In Transit": ["Delivered", "Cancelled"],
        "Delivered": [],
        "Cancelled": []
    }

    current_status = shipment.status
    new_status = status_data.status

    if new_status not in valid_transitions.get(current_status, []):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change shipment status from {current_status} to {new_status}"
        )

    shipment.status = new_status
    db.commit()
    db.refresh(shipment)

    return {
        "message": "Shipment status updated successfully",
        "id": shipment.id,
        "status": shipment.status,
    }
def calculate_eta(start, destination):
    if start.strip().lower() == destination.strip().lower():
        return "0 minutes"

    try:
        locations = {
            "tirupati": (13.6288, 79.4192),
            "chennai": (13.0827, 80.2707),
            "hyderabad": (17.3850, 78.4867),
            "venkatagiri": (13.9667, 79.5833),
            "bangalore": (12.9716, 77.5946),
            "bengaluru": (12.9716, 77.5946),
            "nellore": (14.4426, 79.9865),
            "vijayawada": (16.5062, 80.6480),
            "kadapa": (14.4673, 78.8242),
            "srikalahashthi": (13.7498, 79.6982),
            "srikalahasthi": (13.7498, 79.6982),
            "srikalahasti": (13.7498, 79.6982),
        }

        start_key = start.strip().lower().replace(" ", "")
        destination_key = destination.strip().lower().replace(" ", "")

        start_coords = locations.get(start_key)
        end_coords = locations.get(destination_key)

        if not start_coords or not end_coords:
            return "Estimate unavailable - location not configured"

        url = (
            f"https://router.project-osrm.org/route/v1/driving/"
            f"{start_coords[1]},{start_coords[0]};"
            f"{end_coords[1]},{end_coords[0]}?overview=false"
        )

        response = requests.get(url, timeout=10)
        print("ETA route URL:", url)
        print("ETA HTTP status:", response.status_code)
        response.raise_for_status()
        data = response.json()

        if data.get("code") != "Ok" or not data.get("routes"):
            return "Estimate unavailable - route not found"

        duration_minutes = round(data["routes"][0]["duration"] / 60)
        distance_km = round(data["routes"][0]["distance"] / 1000, 1)

        return f"{duration_minutes} minutes ({distance_km} km)"

    except requests.RequestException:
        return "Estimate unavailable - routing service unreachable"
def extract_distance_km(start, destination):
    """Returns the route distance in km, or None if it cannot be calculated."""
    if start.strip().lower() == destination.strip().lower():
        return 0.0

    result = calculate_eta(start, destination)
    match = re.search(r"\(([\d.]+) km\)", result)

    return float(match.group(1)) if match else None


def release_trip_assignment(db, trip, final_status):
    """Frees the driver and vehicle when a trip is completed or cancelled."""
    A = models.DriverAssignment

    assignment = db.query(A).filter(
        A.trip_id == trip.id, A.status == "Active"
    ).first()

    if not assignment:
        return

    assignment.status = final_status
    assignment.completed_at = datetime.now(timezone.utc)

    driver = db.query(models.Driver).filter(
        models.Driver.id == assignment.driver_id
    ).first()
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == assignment.vehicle_id
    ).first()

    if driver and driver.status == "On Trip":
        driver.status = "Available"

    if vehicle and vehicle.status == "Assigned":
        vehicle.status = "Active"


@app.get("/route/estimate")
def estimate_route(start: str, destination: str):
    eta = calculate_eta(start, destination)

    return {
        "start": start,
        "destination": destination,
        "eta": eta
    }
# ================= TRIP SCHEDULING =================

class TripCreate(BaseModel):
    trip_number: str
    shipment_id: int
    vehicle_id: int
    driver_id: int
    start_location: str
    destination: str


@app.post("/trips")
def create_trip(
    trip_data: TripCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles("Administrator", "Fleet Manager")
    ),
):
    if db.query(models.Trip).filter(
        models.Trip.trip_number == trip_data.trip_number
    ).first():
        raise HTTPException(status_code=400, detail="Trip number already exists")

    shipment = db.query(models.Shipment).filter(
        models.Shipment.id == trip_data.shipment_id
    ).first()
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == trip_data.vehicle_id
    ).first()
    driver = db.query(models.Driver).filter(
        models.Driver.id == trip_data.driver_id
    ).first()

    if not shipment:
        raise HTTPException(status_code=404, detail="Shipment not found")
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if not driver:
        raise HTTPException(status_code=404, detail="Driver not found")
    if vehicle.status == "In Maintenance":
        raise HTTPException(
            status_code=400,
            detail="Vehicle is under maintenance and cannot be assigned to a trip",
        )

    trip = models.Trip(
        trip_number=trip_data.trip_number,
        shipment_id=trip_data.shipment_id,
        vehicle_id=trip_data.vehicle_id,
        driver_id=trip_data.driver_id,
        start_location=trip_data.start_location,
        destination=trip_data.destination,
        status="Scheduled",
    )

    db.add(trip)
    db.commit()
    db.refresh(trip)

    return {
        "message": "Trip scheduled successfully",
        "id": trip.id,
        "trip_number": trip.trip_number,
        "shipment_id": trip.shipment_id,
        "vehicle_id": trip.vehicle_id,
        "driver_id": trip.driver_id,
        "start_location": trip.start_location,
        "destination": trip.destination,
        "eta": "Not calculated",
        "status": trip.status,
    }


@app.get("/trips")
def get_trips(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    trips = db.query(models.Trip).all()

    return [
        {
            "id": trip.id,
            "trip_number": trip.trip_number,
            "shipment_id": trip.shipment_id,
            "vehicle_id": trip.vehicle_id,
            "driver_id": trip.driver_id,
            "start_location": trip.start_location,
            "destination": trip.destination,
            "eta": calculate_eta(
    trip.start_location,
    trip.destination
),
            "status": trip.status,
        }
        for trip in trips
    ]

@app.put("/trips/{trip_id}/status")
def update_trip_status(
    trip_id: int,
    status: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(
        require_roles("Administrator", "Fleet Manager")
    ),
):
    trip = db.query(models.Trip).filter(
        models.Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found"
        )

    allowed_statuses = [
        "Scheduled",
        "In Transit",
        "Completed",
        "Cancelled"
    ]

    if status not in allowed_statuses:
        raise HTTPException(
            status_code=400,
            detail="Invalid trip status"
        )

    trip.status = status

    if status == "Completed":
        if trip.distance_km is None:
            trip.distance_km = extract_distance_km(
                trip.start_location, trip.destination
            )
        release_trip_assignment(db, trip, "Completed")

    if status == "Cancelled":
        release_trip_assignment(db, trip, "Cancelled")

    db.commit()
    db.refresh(trip)

    return {
        "message": "Trip status updated successfully",
        "id": trip.id,
        "trip_number": trip.trip_number,
        "status": trip.status
    }
# ==============================
# GPS TRACKING API
# ==============================

@app.put("/vehicles/{vehicle_id}/location")
async def update_vehicle_location(
    vehicle_id: int,
    latitude: float = Body(..., ge=-90, le=90),
    longitude: float = Body(..., ge=-180, le=180),
    speed: Optional[float] = Body(default=None, ge=0),
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    # Save GPS information
    vehicle.latitude = latitude
    vehicle.longitude = longitude
    vehicle.speed = speed
    vehicle.location_updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(vehicle)

    # Prepare data for WebSocket
    location_data = {
        "vehicle_id": vehicle.id,
        "latitude": vehicle.latitude,
        "longitude": vehicle.longitude,
        "speed": vehicle.speed,
        "location_updated_at": vehicle.location_updated_at.isoformat(),
    }

    # Broadcast GPS update to connected clients
    disconnected = []

    for connection in active_gps_connections:
        try:
            await connection.send_json(location_data)
        except Exception:
            disconnected.append(connection)

    for connection in disconnected:
        if connection in active_gps_connections:
            active_gps_connections.remove(connection)

    return {
        "message": "Vehicle location updated successfully",
        **location_data,
    }
# ==============================
# GPS WEBSOCKET CONNECTION MANAGER
# ==============================

active_gps_connections = []

@app.websocket("/ws/gps")
async def gps_websocket(
    websocket: WebSocket,
    db: Session = Depends(get_db),
):
    await websocket.accept()

    try:
        # Receive JWT token from the frontend
        token = await websocket.receive_text()

        # Validate JWT token
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        user_id = int(payload.get("sub"))

        # Verify that the user exists
        user = (
            db.query(models.User)
            .filter(models.User.id == user_id)
            .first()
        )

        if user is None:
            await websocket.close(
                code=1008,
                reason="Unauthorized user",
            )
            return

    except (JWTError, ValueError, TypeError):
        await websocket.close(
            code=1008,
            reason="Invalid or expired token",
        )
        return

    active_gps_connections.append(websocket)

    try:
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        pass

    finally:
        if websocket in active_gps_connections:
            active_gps_connections.remove(websocket)


# ==============================
# MAINTENANCE MANAGEMENT API
# ==============================

MAINTENANCE_CATEGORIES = {
    "Engine Servicing",
    "Oil Change",
    "Tyre Replacement",
    "Brake Inspection",
    "General Servicing",
    "Unexpected Repairs",
}

MAINTENANCE_TRANSITIONS = {
    "Scheduled": ["In Progress", "Cancelled"],
    "In Progress": ["Completed", "Cancelled"],
    "Completed": [],
    "Cancelled": [],
}


class MaintenanceCreate(BaseModel):
    vehicle_id: int
    category: str
    description: str = Field(min_length=3, max_length=1000)
    scheduled_date: date
    service_centre: str = Field(min_length=2, max_length=150)
    estimated_cost: float = Field(ge=0)


class MaintenanceStatusUpdate(BaseModel):
    status: str
    completed_date: Optional[date] = None
    replacement_parts: Optional[str] = None
    actual_cost: Optional[float] = Field(default=None, ge=0)


def maintenance_to_dict(record, vehicle_number):
    return {
        "id": record.id,
        "vehicle_id": record.vehicle_id,
        "vehicle_number": vehicle_number,
        "category": record.category,
        "description": record.description,
        "scheduled_date": record.scheduled_date.isoformat(),
        "service_centre": record.service_centre,
        "estimated_cost": float(record.estimated_cost),
        "status": record.status,
        "completed_date": record.completed_date.isoformat() if record.completed_date else None,
        "replacement_parts": record.replacement_parts,
        "actual_cost": float(record.actual_cost) if record.actual_cost is not None else None,
    }


@app.post("/maintenance", status_code=status.HTTP_201_CREATED)
def create_maintenance(
    data: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == data.vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if data.category not in MAINTENANCE_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid maintenance category")

    if data.scheduled_date < date.today():
        raise HTTPException(status_code=400, detail="Scheduled date cannot be in the past")

    record = models.MaintenanceRecord(
        vehicle_id=data.vehicle_id,
        category=data.category,
        description=data.description,
        scheduled_date=data.scheduled_date,
        service_centre=data.service_centre,
        estimated_cost=data.estimated_cost,
        status="Scheduled",
        created_at=datetime.now(timezone.utc),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "message": "Maintenance scheduled successfully",
        "maintenance": maintenance_to_dict(record, vehicle.vehicle_number),
    }


@app.get("/maintenance/summary")
def maintenance_summary(
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    today = date.today()
    M = models.MaintenanceRecord

    return {
        "total_vehicles": db.query(models.Vehicle).count(),
        "under_maintenance": db.query(models.Vehicle).filter(
            models.Vehicle.status == "In Maintenance"
        ).count(),
        "upcoming_maintenance": db.query(M).filter(
            M.status == "Scheduled", M.scheduled_date >= today
        ).count(),
        "overdue_maintenance": db.query(M).filter(
            M.status.in_(["Scheduled", "In Progress"]),
            M.scheduled_date < today,
        ).count(),
    }


@app.get("/maintenance")
def list_maintenance(
    status_filter: Optional[str] = None,
    vehicle_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    M = models.MaintenanceRecord

    query = db.query(M, models.Vehicle.vehicle_number).join(
        models.Vehicle, models.Vehicle.id == M.vehicle_id
    )

    if status_filter:
        query = query.filter(M.status == status_filter)

    if vehicle_id:
        query = query.filter(M.vehicle_id == vehicle_id)

    rows = query.order_by(M.scheduled_date.desc()).all()

    return [maintenance_to_dict(record, number) for record, number in rows]


# ==============================
# MAINTENANCE REPORTS API
# ==============================

OPEN_STATUSES = ("Scheduled", "In Progress")


def filtered_maintenance_rows(
    db, vehicle_id, category, status_filter, start_date, end_date
):
    M = models.MaintenanceRecord
    today = date.today()

    query = db.query(M, models.Vehicle.vehicle_number).join(
        models.Vehicle, models.Vehicle.id == M.vehicle_id
    )

    if vehicle_id:
        query = query.filter(M.vehicle_id == vehicle_id)
    if category:
        query = query.filter(M.category == category)
    if start_date:
        query = query.filter(M.scheduled_date >= start_date)
    if end_date:
        query = query.filter(M.scheduled_date <= end_date)

    if status_filter == "Overdue":
        query = query.filter(
            M.status.in_(OPEN_STATUSES), M.scheduled_date < today
        )
    elif status_filter == "Pending":
        query = query.filter(M.status.in_(OPEN_STATUSES))
    elif status_filter:
        query = query.filter(M.status == status_filter)

    return query.order_by(M.scheduled_date.desc()).all()


def build_maintenance_report(rows):
    today = date.today()

    summary = {
        "total_records": len(rows),
        "scheduled": 0,
        "in_progress": 0,
        "completed": 0,
        "cancelled": 0,
        "pending": 0,
        "overdue": 0,
    }
    per_vehicle = {}
    records = []

    for record, number in rows:
        is_overdue = (
            record.status in OPEN_STATUSES and record.scheduled_date < today
        )
        key = record.status.lower().replace(" ", "_")

        if key in summary:
            summary[key] += 1
        if record.status in OPEN_STATUSES:
            summary["pending"] += 1
        if is_overdue:
            summary["overdue"] += 1

        estimated = float(record.estimated_cost or 0)
        actual = float(record.actual_cost or 0)

        entry = per_vehicle.setdefault(record.vehicle_id, {
            "vehicle_id": record.vehicle_id,
            "vehicle_number": number,
            "jobs": 0,
            "completed_jobs": 0,
            "total_estimated_cost": 0.0,
            "total_actual_cost": 0.0,
        })
        entry["jobs"] += 1

        if record.status == "Completed":
            entry["completed_jobs"] += 1
            entry["total_actual_cost"] += actual
        if record.status != "Cancelled":
            entry["total_estimated_cost"] += estimated

        records.append({
            "id": record.id,
            "vehicle_number": number,
            "category": record.category,
            "description": record.description,
            "service_centre": record.service_centre,
            "scheduled_date": record.scheduled_date,
            "status": record.status,
            "display_status": "Overdue" if is_overdue else record.status,
            "estimated_cost": estimated,
            "completed_date": record.completed_date,
            "actual_cost": float(record.actual_cost)
            if record.actual_cost is not None
            else None,
            "replacement_parts": record.replacement_parts,
        })

    vehicles = sorted(
        per_vehicle.values(),
        key=lambda item: item["total_actual_cost"],
        reverse=True,
    )

    for item in vehicles:
        item["total_estimated_cost"] = round(item["total_estimated_cost"], 2)
        item["total_actual_cost"] = round(item["total_actual_cost"], 2)

    return {
        "summary": summary,
        "expenses": {
            "fleet_estimated_cost": round(
                sum(v["total_estimated_cost"] for v in vehicles), 2
            ),
            "fleet_actual_cost": round(
                sum(v["total_actual_cost"] for v in vehicles), 2
            ),
            "vehicles": vehicles,
        },
        "records": records,
    }


def maintenance_report_excel(report):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill

    header_font = Font(bold=True, color="FFFFFF")
    header_fill = PatternFill("solid", fgColor="1D4ED8")

    def style_header(sheet):
        for cell in sheet[1]:
            cell.font = header_font
            cell.fill = header_fill
            cell.alignment = Alignment(horizontal="center")

    workbook = Workbook()

    sheet = workbook.active
    sheet.title = "Maintenance Records"
    sheet.append([
        "Vehicle", "Category", "Description", "Service Centre",
        "Scheduled Date", "Status", "Estimated Cost", "Completed Date",
        "Actual Cost", "Replacement Parts",
    ])
    style_header(sheet)

    for item in report["records"]:
        sheet.append([
            item["vehicle_number"], item["category"], item["description"],
            item["service_centre"], item["scheduled_date"],
            item["display_status"], item["estimated_cost"],
            item["completed_date"], item["actual_cost"],
            item["replacement_parts"] or "",
        ])

    for column, width in zip("ABCDEFGHIJ", [16, 20, 36, 24, 15, 14, 16, 15, 14, 28]):
        sheet.column_dimensions[column].width = width

    for row in sheet.iter_rows(min_row=2):
        row[6].number_format = "#,##0.00"
        row[8].number_format = "#,##0.00"

    expenses = workbook.create_sheet("Expenses by Vehicle")
    expenses.append([
        "Vehicle", "Total Jobs", "Completed Jobs",
        "Estimated Cost", "Actual Cost",
    ])
    style_header(expenses)

    for item in report["expenses"]["vehicles"]:
        expenses.append([
            item["vehicle_number"], item["jobs"], item["completed_jobs"],
            item["total_estimated_cost"], item["total_actual_cost"],
        ])

    expenses.append([
        "FLEET TOTAL", "", "",
        report["expenses"]["fleet_estimated_cost"],
        report["expenses"]["fleet_actual_cost"],
    ])

    for cell in expenses[expenses.max_row]:
        cell.font = Font(bold=True)

    for column, width in zip("ABCDE", [18, 12, 16, 18, 16]):
        expenses.column_dimensions[column].width = width

    for row in expenses.iter_rows(min_row=2):
        row[3].number_format = "#,##0.00"
        row[4].number_format = "#,##0.00"

    buffer = io.BytesIO()
    workbook.save(buffer)

    return buffer.getvalue()


def maintenance_report_pdf(report):
    from xml.sax.saxutils import escape

    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4, landscape
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import (
        Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
    )

    buffer = io.BytesIO()
    document = SimpleDocTemplate(
        buffer, pagesize=landscape(A4),
        leftMargin=24, rightMargin=24, topMargin=24, bottomMargin=24,
    )

    styles = getSampleStyleSheet()
    cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=8, leading=10)

    def para(value):
        return Paragraph(escape(str(value if value is not None else "-")), cell)

    def money(value):
        return "-" if value is None else f"Rs. {value:,.2f}"

    summary = report["summary"]
    expenses = report["expenses"]

    story = [
        Paragraph("FleetFlow - Maintenance Report", styles["Title"]),
        Paragraph(f"Generated on {date.today().isoformat()}", styles["Normal"]),
        Spacer(1, 8),
        Paragraph(
            f"Records: {summary['total_records']} | "
            f"Scheduled: {summary['scheduled']} | "
            f"In Progress: {summary['in_progress']} | "
            f"Completed: {summary['completed']} | "
            f"Pending: {summary['pending']} | "
            f"Overdue: {summary['overdue']}",
            styles["Normal"],
        ),
        Paragraph(
            f"Fleet estimated cost: {money(expenses['fleet_estimated_cost'])} | "
            f"Fleet actual cost: {money(expenses['fleet_actual_cost'])}",
            styles["Normal"],
        ),
        Spacer(1, 12),
    ]

    header_style = TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1D4ED8")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#CBD5E1")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F1F5F9")]),
    ])

    rows = [[
        "Vehicle", "Category", "Description", "Service Centre",
        "Scheduled", "Status", "Estimated", "Actual",
    ]]

    for item in report["records"]:
        rows.append([
            para(item["vehicle_number"]), para(item["category"]),
            para(item["description"]), para(item["service_centre"]),
            str(item["scheduled_date"]), item["display_status"],
            money(item["estimated_cost"]), money(item["actual_cost"]),
        ])

    if len(rows) == 1:
        rows.append(["No records for the selected filters"] + [""] * 7)

    records_table = Table(
        rows, repeatRows=1,
        colWidths=[70, 95, 200, 110, 65, 65, 75, 75],
    )
    records_table.setStyle(header_style)
    story.append(records_table)
    story.append(Spacer(1, 16))
    story.append(Paragraph("Maintenance expenses by vehicle", styles["Heading3"]))

    expense_rows = [["Vehicle", "Jobs", "Completed", "Estimated Cost", "Actual Cost"]]

    for item in expenses["vehicles"]:
        expense_rows.append([
            item["vehicle_number"], item["jobs"], item["completed_jobs"],
            money(item["total_estimated_cost"]), money(item["total_actual_cost"]),
        ])

    expense_rows.append([
        "FLEET TOTAL", "", "",
        money(expenses["fleet_estimated_cost"]),
        money(expenses["fleet_actual_cost"]),
    ])

    expense_table = Table(
        expense_rows, repeatRows=1, colWidths=[120, 60, 80, 120, 120],
    )
    expense_table.setStyle(header_style)
    story.append(expense_table)

    document.build(story)

    return buffer.getvalue()


@app.get("/maintenance/reports")
def maintenance_report(
    vehicle_id: Optional[int] = None,
    category: Optional[str] = None,
    status_filter: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    rows = filtered_maintenance_rows(
        db, vehicle_id, category, status_filter, start_date, end_date
    )

    return build_maintenance_report(rows)


@app.get("/maintenance/reports/export")
def export_maintenance_report(
    file_format: str = "excel",
    vehicle_id: Optional[int] = None,
    category: Optional[str] = None,
    status_filter: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    if file_format not in ("excel", "pdf"):
        raise HTTPException(
            status_code=400, detail="Export format must be excel or pdf"
        )

    rows = filtered_maintenance_rows(
        db, vehicle_id, category, status_filter, start_date, end_date
    )
    report = build_maintenance_report(rows)

    if file_format == "excel":
        content = maintenance_report_excel(report)
        media_type = (
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        )
        extension = "xlsx"
    else:
        content = maintenance_report_pdf(report)
        media_type = "application/pdf"
        extension = "pdf"

    filename = f"maintenance_report_{date.today().isoformat()}.{extension}"

    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.put("/maintenance/{maintenance_id}/status")
def update_maintenance_status(
    maintenance_id: int,
    data: MaintenanceStatusUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    M = models.MaintenanceRecord

    record = db.query(M).filter(M.id == maintenance_id).first()

    if not record:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    if data.status not in MAINTENANCE_TRANSITIONS:
        raise HTTPException(
            status_code=400,
            detail="Status must be Scheduled, In Progress, Completed or Cancelled",
        )

    previous_status = record.status

    if data.status not in MAINTENANCE_TRANSITIONS[previous_status]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot change maintenance status from {previous_status} to {data.status}",
        )

    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == record.vehicle_id
    ).first()

    if data.status == "In Progress":
        if db.query(models.DriverAssignment).filter(
            models.DriverAssignment.vehicle_id == vehicle.id,
            models.DriverAssignment.status == "Active",
        ).first():
            raise HTTPException(
                status_code=400,
                detail="Vehicle is assigned to an active trip. Complete the trip first.",
            )

        vehicle.status = "In Maintenance"

    if data.status == "Completed":
        record.completed_date = data.completed_date or date.today()
        record.replacement_parts = data.replacement_parts
        record.actual_cost = (
            data.actual_cost
            if data.actual_cost is not None
            else record.estimated_cost
        )

    record.status = data.status

    if data.status in ("Completed", "Cancelled"):
        for alert in db.query(models.MaintenanceAlert).filter(
            models.MaintenanceAlert.maintenance_id == record.id,
            models.MaintenanceAlert.status == "Unresolved",
        ).all():
            alert.status = "Resolved"

    db.flush()

    # Vehicle becomes available again only when no other job is in progress.
    if previous_status == "In Progress" and data.status in ("Completed", "Cancelled"):
        other_open = db.query(M).filter(
            M.vehicle_id == record.vehicle_id,
            M.status == "In Progress",
            M.id != record.id,
        ).count()

        if other_open == 0 and vehicle.status == "In Maintenance":
            vehicle.status = "Active"

    db.commit()
    db.refresh(record)

    return {
        "message": "Maintenance status updated successfully",
        "maintenance": maintenance_to_dict(record, vehicle.vehicle_number),
        "vehicle_status": vehicle.status,
    }


@app.get("/vehicles/{vehicle_id}/maintenance-history")
def vehicle_maintenance_history(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    M = models.MaintenanceRecord

    records = (
        db.query(M)
        .filter(M.vehicle_id == vehicle_id, M.status == "Completed")
        .order_by(M.completed_date.desc())
        .all()
    )

    history = [maintenance_to_dict(r, vehicle.vehicle_number) for r in records]

    return {
        "vehicle_number": vehicle.vehicle_number,
        "total_services": len(history),
        "total_cost": sum(h["actual_cost"] or 0 for h in history),
        "history": history,
    }            

# ==============================
# DRIVER ASSIGNMENT API
# ==============================

@app.get("/driver-assignments/options")
def driver_assignment_options(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    """Data for the Assign Driver form: only assignable drivers, vehicles and trips."""
    A = models.DriverAssignment

    busy_trip_ids = {
        row[0] for row in db.query(A.trip_id).filter(A.status == "Active").all()
    }

    drivers = db.query(models.Driver).filter(
        models.Driver.status == "Available"
    ).all()

    vehicles = db.query(models.Vehicle).filter(
        models.Vehicle.status.in_(["Active", "Available"])
    ).all()

    trips = db.query(models.Trip).filter(
        models.Trip.status == "Scheduled"
    ).all()

    return {
        "drivers": [
            {"id": d.id, "full_name": d.full_name, "phone": d.phone,
             "license_number": d.license_number, "status": d.status}
            for d in drivers
        ],
        "vehicles": [
            {"id": v.id, "vehicle_number": v.vehicle_number,
             "vehicle_type": v.vehicle_type, "status": v.status}
            for v in vehicles
        ],
        "trips": [
            {"id": t.id, "trip_number": t.trip_number,
             "start_location": t.start_location, "destination": t.destination}
            for t in trips if t.id not in busy_trip_ids
        ],
    }


@app.post("/driver-assignments", status_code=status.HTTP_201_CREATED)
def create_driver_assignment(
    data: DriverAssignmentCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    A = models.DriverAssignment

    driver = db.query(models.Driver).filter(models.Driver.id == data.driver_id).first()
    vehicle = db.query(models.Vehicle).filter(models.Vehicle.id == data.vehicle_id).first()
    trip = db.query(models.Trip).filter(models.Trip.id == data.trip_id).first()

    if not driver:
        raise HTTPException(404, "Driver not found")
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")
    if not trip:
        raise HTTPException(404, "Trip not found")

    if trip.status != "Scheduled":
        raise HTTPException(400, "Only scheduled trips can be assigned")

    if db.query(A).filter(A.trip_id == trip.id, A.status == "Active").first():
        raise HTTPException(400, "This trip already has an active assignment")

    if driver.status != "Available" or db.query(A).filter(
        A.driver_id == driver.id, A.status == "Active"
    ).first():
        raise HTTPException(
            400, "Driver is not available or is already on an active trip"
        )

    if vehicle.status == "In Maintenance":
        raise HTTPException(400, "Vehicle is under maintenance")

    if vehicle.status not in ("Active", "Available") or db.query(A).filter(
        A.vehicle_id == vehicle.id, A.status == "Active"
    ).first():
        raise HTTPException(
            400, "Vehicle is not available or is already allocated to a trip"
        )

    assignment = A(
        driver_id=driver.id,
        vehicle_id=vehicle.id,
        trip_id=trip.id,
        assignment_date=data.assignment_date or datetime.now(timezone.utc),
        status="Active",
    )

    driver.status = "On Trip"
    vehicle.status = "Assigned"

    db.add(assignment)
    db.commit()
    db.refresh(assignment)

    return {
        "message": "Driver assigned successfully",
        "id": assignment.id,
        "driver_id": assignment.driver_id,
        "vehicle_id": assignment.vehicle_id,
        "trip_id": assignment.trip_id,
        "status": assignment.status,
    }


@app.get("/driver-assignments")
def get_driver_assignments(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    """Assignment history with driver, vehicle and trip details."""
    A = models.DriverAssignment

    rows = (
        db.query(A, models.Driver, models.Vehicle, models.Trip)
        .join(models.Driver, models.Driver.id == A.driver_id)
        .join(models.Vehicle, models.Vehicle.id == A.vehicle_id)
        .join(models.Trip, models.Trip.id == A.trip_id)
        .order_by(A.assignment_date.desc())
        .all()
    )

    return [
        {
            "id": a.id,
            "driver_id": a.driver_id,
            "driver_name": d.full_name,
            "vehicle_id": a.vehicle_id,
            "vehicle_number": v.vehicle_number,
            "trip_id": a.trip_id,
            "trip_number": t.trip_number,
            "route": f"{t.start_location} to {t.destination}",
            "trip_status": t.status,
            "assignment_date": a.assignment_date,
            "status": a.status,
            "completed_at": a.completed_at,
        }
        for a, d, v, t in rows
    ]


@app.put("/driver-assignments/{assignment_id}/complete")
def complete_driver_assignment(
    assignment_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    """Manually finishes an assignment and frees the driver and vehicle."""
    A = models.DriverAssignment

    assignment = db.query(A).filter(A.id == assignment_id).first()

    if not assignment:
        raise HTTPException(404, "Assignment not found")

    if assignment.status != "Active":
        raise HTTPException(400, "Only active assignments can be completed")

    trip = db.query(models.Trip).filter(models.Trip.id == assignment.trip_id).first()
    release_trip_assignment(db, trip, "Completed")

    db.commit()

    return {"message": "Assignment completed", "id": assignment_id}


# ==============================
# FUEL MANAGEMENT API
# ==============================

@app.post("/fuel-records", status_code=status.HTTP_201_CREATED)
def create_fuel_record(
    data: FuelRecordCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == data.vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if not data.fuel_type.strip():
        raise HTTPException(status_code=400, detail="Fuel type is required")

    if data.quantity_litres <= 0 or data.price_per_litre <= 0:
        raise HTTPException(
            status_code=400, detail="Fuel quantity and price must be positive"
        )

    if data.refuel_date > date.today():
        raise HTTPException(
            status_code=400, detail="Refuelling date cannot be in the future"
        )

    record = models.FuelRecord(
        vehicle_id=data.vehicle_id,
        fuel_type=data.fuel_type.strip(),
        quantity_litres=data.quantity_litres,
        price_per_litre=data.price_per_litre,
        total_cost=round(data.quantity_litres * data.price_per_litre, 2),
        refuel_date=data.refuel_date,
        created_at=datetime.now(timezone.utc),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return {
        "message": "Fuel record created successfully",
        "id": record.id,
        "vehicle_id": record.vehicle_id,
        "fuel_type": record.fuel_type,
        "quantity_litres": record.quantity_litres,
        "total_cost": float(record.total_cost),
    }


def filtered_fuel_query(db, vehicle_id, fuel_type, start_date, end_date):
    F = models.FuelRecord

    query = db.query(F, models.Vehicle.vehicle_number).join(
        models.Vehicle, models.Vehicle.id == F.vehicle_id
    )

    if vehicle_id:
        query = query.filter(F.vehicle_id == vehicle_id)
    if fuel_type:
        query = query.filter(F.fuel_type == fuel_type)
    if start_date:
        query = query.filter(F.refuel_date >= start_date)
    if end_date:
        query = query.filter(F.refuel_date <= end_date)

    return query


@app.get("/fuel-records")
def get_fuel_records(
    vehicle_id: Optional[int] = None,
    fuel_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    F = models.FuelRecord

    rows = (
        filtered_fuel_query(db, vehicle_id, fuel_type, start_date, end_date)
        .order_by(F.refuel_date.desc())
        .all()
    )

    return [
        {
            "id": r.id,
            "vehicle_id": r.vehicle_id,
            "vehicle_number": number,
            "fuel_type": r.fuel_type,
            "quantity_litres": r.quantity_litres,
            "price_per_litre": r.price_per_litre,
            "total_cost": float(r.total_cost),
            "refuel_date": r.refuel_date,
        }
        for r, number in rows
    ]


@app.get("/fuel-records/summary")
def fuel_summary(
    vehicle_id: Optional[int] = None,
    fuel_type: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Vehicle-wise fuel consumption, expense and efficiency (km per litre).

    Distance is the total distance of the vehicle's completed trips.
    """
    rows = filtered_fuel_query(
        db, vehicle_id, fuel_type, start_date, end_date
    ).all()

    per_vehicle = {}

    for record, number in rows:
        entry = per_vehicle.setdefault(record.vehicle_id, {
            "vehicle_id": record.vehicle_id,
            "vehicle_number": number,
            "total_litres": 0.0,
            "total_cost": 0.0,
            "refuel_count": 0,
        })
        entry["total_litres"] += record.quantity_litres
        entry["total_cost"] += float(record.total_cost)
        entry["refuel_count"] += 1

    summary = []

    for vid, entry in per_vehicle.items():
        distance = sum(
            t.distance_km or 0
            for t in db.query(models.Trip).filter(
                models.Trip.vehicle_id == vid,
                models.Trip.status == "Completed",
            ).all()
        )

        entry["total_litres"] = round(entry["total_litres"], 2)
        entry["total_cost"] = round(entry["total_cost"], 2)
        entry["distance_km"] = round(distance, 1)
        entry["efficiency_km_per_litre"] = (
            round(distance / entry["total_litres"], 2)
            if distance > 0 and entry["total_litres"] > 0
            else None
        )
        summary.append(entry)

    summary.sort(key=lambda item: item["total_cost"], reverse=True)

    return {
        "fleet_total_litres": round(sum(s["total_litres"] for s in summary), 2),
        "fleet_total_cost": round(sum(s["total_cost"] for s in summary), 2),
        "vehicles": summary,
    }


# ==============================
# MAINTENANCE ALERTS API
# ==============================

ALERT_TYPES = {"Upcoming", "Overdue"}
ALERT_STATUSES = {"Unresolved", "Resolved"}
UPCOMING_ALERT_DAYS = 7


def generate_maintenance_alerts(db):
    """Creates Upcoming and Overdue alerts from the maintenance schedule.

    This function is reused later by the Celery background task.
    """
    M = models.MaintenanceRecord
    Alert = models.MaintenanceAlert
    today = date.today()
    window = today + timedelta(days=UPCOMING_ALERT_DAYS)
    created = {"upcoming": 0, "overdue": 0}

    records = db.query(M, models.Vehicle.vehicle_number).join(
        models.Vehicle, models.Vehicle.id == M.vehicle_id
    ).filter(M.status.in_(["Scheduled", "In Progress"])).all()

    for record, number in records:
        if record.scheduled_date < today:
            alert_type = "Overdue"
            message = (
                f"{number}: {record.category} was due on "
                f"{record.scheduled_date.isoformat()} and is not completed."
            )
        elif record.status == "Scheduled" and record.scheduled_date <= window:
            alert_type = "Upcoming"
            message = (
                f"{number}: {record.category} is scheduled for "
                f"{record.scheduled_date.isoformat()}."
            )
        else:
            continue

        exists = db.query(Alert).filter(
            Alert.maintenance_id == record.id,
            Alert.alert_type == alert_type,
            Alert.status == "Unresolved",
        ).first()

        if exists:
            continue

        if alert_type == "Overdue":
            for old in db.query(Alert).filter(
                Alert.maintenance_id == record.id,
                Alert.alert_type == "Upcoming",
                Alert.status == "Unresolved",
            ).all():
                old.status = "Resolved"

        db.add(Alert(
            maintenance_id=record.id,
            alert_type=alert_type,
            vehicle_id=record.vehicle_id,
            scheduled_date=record.scheduled_date,
            message=message,
            status="Unresolved",
            created_at=datetime.now(timezone.utc),
        ))
        created[alert_type.lower()] += 1

    db.commit()

    return created


@app.post("/maintenance-alerts/generate")
def run_alert_generation(
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    created = generate_maintenance_alerts(db)

    return {"message": "Maintenance alerts generated", "created": created}


@app.post("/maintenance-alerts", status_code=status.HTTP_201_CREATED)
def create_maintenance_alert(
    data: MaintenanceAlertCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    maintenance = db.query(models.MaintenanceRecord).filter(
        models.MaintenanceRecord.id == data.maintenance_id
    ).first()

    if not maintenance:
        raise HTTPException(status_code=404, detail="Maintenance record not found")

    vehicle = db.query(models.Vehicle).filter(
        models.Vehicle.id == data.vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    if maintenance.vehicle_id != data.vehicle_id:
        raise HTTPException(
            status_code=400, detail="Vehicle does not match maintenance record"
        )

    if data.alert_type not in ALERT_TYPES:
        raise HTTPException(
            status_code=400, detail="Alert type must be Upcoming or Overdue"
        )

    if data.status not in ALERT_STATUSES:
        raise HTTPException(
            status_code=400, detail="Alert status must be Unresolved or Resolved"
        )

    alert = models.MaintenanceAlert(
        maintenance_id=data.maintenance_id,
        alert_type=data.alert_type,
        vehicle_id=data.vehicle_id,
        scheduled_date=data.scheduled_date,
        message=data.message,
        status=data.status,
        created_at=datetime.now(timezone.utc),
    )

    db.add(alert)
    db.commit()
    db.refresh(alert)

    return {
        "message": "Maintenance alert created successfully",
        "id": alert.id,
        "maintenance_id": alert.maintenance_id,
        "vehicle_id": alert.vehicle_id,
        "alert_type": alert.alert_type,
        "status": alert.status,
    }


@app.get("/maintenance-alerts")
def get_maintenance_alerts(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user),
):
    Alert = models.MaintenanceAlert

    query = (
        db.query(Alert, models.Vehicle.vehicle_number, models.MaintenanceRecord.category)
        .join(models.Vehicle, models.Vehicle.id == Alert.vehicle_id)
        .join(models.MaintenanceRecord, models.MaintenanceRecord.id == Alert.maintenance_id)
    )

    if status_filter:
        query = query.filter(Alert.status == status_filter)

    rows = query.order_by(Alert.scheduled_date.asc()).all()

    return [
        {
            "id": alert.id,
            "maintenance_id": alert.maintenance_id,
            "vehicle_id": alert.vehicle_id,
            "vehicle_number": number,
            "category": category,
            "alert_type": alert.alert_type,
            "scheduled_date": alert.scheduled_date,
            "message": alert.message,
            "status": alert.status,
            "created_at": alert.created_at,
        }
        for alert, number, category in rows
    ]


@app.put("/maintenance-alerts/{alert_id}/resolve")
def resolve_maintenance_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("Administrator", "Fleet Manager")),
):
    alert = db.query(models.MaintenanceAlert).filter(
        models.MaintenanceAlert.id == alert_id
    ).first()

    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = "Resolved"
    db.commit()

    return {"message": "Alert marked as resolved", "id": alert.id}