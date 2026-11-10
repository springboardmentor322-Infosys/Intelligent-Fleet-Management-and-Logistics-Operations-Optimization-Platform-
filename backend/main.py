import os
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import anyio.from_thread
from fastapi import (
    Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
from database import SessionLocal, get_db
from models import ROLES, VEHICLE_STATUSES
from security import (
    create_access_token, get_current_user, hash_password, require_roles,
    user_from_token, verify_password,
)
from tracking import hash_key, manager, new_key
import logistics
from logistics import trip_brief, trip_out  # one serializer for every trip endpoint
import shipments
import scheduling

# Browsers allowed to call the API and open the live-tracking socket. Override with a
# comma-separated ALLOWED_ORIGINS (e.g. the address the frontend is served from when deployed).
ALLOWED_ORIGINS = [o.strip() for o in os.getenv(
    "ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

app = FastAPI(title="FleetFlow API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Admin / Fleet Manager: full fleet access. Dispatcher / Driver: read-only,
# except that Dispatchers (and the above) can create and run trips.
from routeplan import router as routeplan_router  # shortest / fastest routes
app.include_router(routeplan_router)
app.include_router(shipments.router)  # shipments and their status rules
import maintenance
app.include_router(maintenance.router)  # maintenance scheduling, alerts, reports
import assignments
app.include_router(assignments.router)  # driver assignment to trips
import fuel
app.include_router(fuel.router)  # fuel records and analytics
import analytics
app.include_router(analytics.router)  # operational analytics for the performance dashboard
import notifications
app.include_router(notifications.router)  # in-app notification feed
import reports
app.include_router(reports.router)  # fleet / driver / delivery report downloads
import driver_profile
app.include_router(driver_profile.router)  # driver profile, edit, account link
import driver_files
app.include_router(driver_files.router)  # driver photo, documents, verification

ADMIN = require_roles("admin")
MANAGE = require_roles("admin", "fleet_manager")
DISPATCH = require_roles("admin", "fleet_manager", "dispatcher")

EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"


# ---------- Schemas ----------
class LoginIn(BaseModel):
    email: str
    password: str


class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(pattern=EMAIL, max_length=120)
    password: str = Field(min_length=8)
    role: str


class UserUpdate(BaseModel):
    role: Optional[str] = None
    is_active: Optional[bool] = None


class ProfileUpdate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str = Field(pattern=EMAIL, max_length=120)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class VehicleIn(BaseModel):
    registration_number: str = Field(min_length=1, max_length=20)
    vehicle_type: str = Field(min_length=1, max_length=50)
    capacity: float = Field(gt=0)
    fuel_type: str = Field(min_length=1, max_length=30)
    status: str = "Idle"


class DriverIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    license_number: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=5, max_length=20)


class AttendanceIn(BaseModel):
    status: str = "Present"


class TripIn(BaseModel):
    vehicle_id: int
    driver_id: int
    origin: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=120)
    cargo_description: Optional[str] = Field(default=None, max_length=200)
    cargo_weight: float = Field(ge=0)
    scheduled_start: datetime


class TripComplete(BaseModel):
    distance_km: Optional[float] = Field(default=None, ge=0)


class PingIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    speed_kmh: Optional[float] = Field(default=None, ge=0, le=400)
    heading: Optional[float] = Field(default=None, ge=0, le=360)
    recorded_at: Optional[datetime] = None


# ---------- Serializers ----------
def user_out(u):
    return {"id": u.id, "username": u.username, "email": u.email,
            "role": u.role, "is_active": u.is_active}


def vehicle_out(v):
    return {
        "id": v.id, "registration_number": v.registration_number,
        "vehicle_type": v.vehicle_type, "capacity": v.capacity,
        "fuel_type": v.fuel_type, "status": v.status,
        "assigned_driver_id": v.assigned_driver_id,
        "driver_name": v.driver.name if v.driver else None,
    }


def driver_out(d):
    return {
        "id": d.id, "name": d.name, "license_number": d.license_number,
        "phone": d.phone, "status": d.status,
        "vehicle_id": d.vehicle.id if d.vehicle else None,
        "vehicle": d.vehicle.registration_number if d.vehicle else None,
    }


def iso(dt):
    return dt.isoformat() if dt else None


def check_status(status: str):
    if status not in VEHICLE_STATUSES:
        raise HTTPException(400, f"Status must be one of {', '.join(VEHICLE_STATUSES)}")


def taken(db, username, email, exclude_id=None):
    q = db.query(models.User).filter(
        or_(models.User.username == username, models.User.email == email)
    )
    if exclude_id:
        q = q.filter(models.User.id != exclude_id)
    return q.first() is not None


# ---------- Auth ----------
@app.get("/")
def home():
    return {"message": "FleetFlow is running!"}


@app.post("/auth/login")
def login(data: LoginIn, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(
        models.User.email == data.email.strip().lower()
    ).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Invalid email or password")
    if not user.is_active:
        raise HTTPException(403, "Account is inactive")
    token = create_access_token({"sub": str(user.id), "role": user.role})
    return {"access_token": token, "token_type": "bearer", "user": user_out(user)}


@app.get("/auth/me")
def me(user=Depends(get_current_user)):
    return user_out(user)


@app.put("/auth/me")
def update_profile(data: ProfileUpdate, user=Depends(get_current_user),
                   db: Session = Depends(get_db)):
    email = data.email.strip().lower()
    if taken(db, data.username, email, user.id):
        raise HTTPException(409, "Username or email already exists")
    user.username, user.email = data.username, email
    db.commit()
    return user_out(user)


@app.post("/auth/change-password")
def change_password(data: PasswordChange, user=Depends(get_current_user),
                    db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    user.hashed_password = hash_password(data.new_password)
    db.commit()
    return {"message": "Password updated"}


# ---------- User management (admin only) ----------
@app.get("/users")
def list_users(_=Depends(ADMIN), db: Session = Depends(get_db)):
    return [user_out(u) for u in db.query(models.User).order_by(models.User.id)]


@app.post("/users", status_code=201)
def create_user(data: UserCreate, _=Depends(ADMIN), db: Session = Depends(get_db)):
    if data.role not in ROLES:
        raise HTTPException(400, f"Role must be one of {', '.join(ROLES)}")
    email = data.email.strip().lower()
    if taken(db, data.username, email):
        raise HTTPException(409, "Username or email already exists")
    user = models.User(username=data.username, email=email,
                       hashed_password=hash_password(data.password), role=data.role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user_out(user)


@app.put("/users/{user_id}")
def update_user(user_id: int, data: UserUpdate, admin=Depends(ADMIN),
                db: Session = Depends(get_db)):
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You cannot change your own role or status")
    if data.role is not None:
        if data.role not in ROLES:
            raise HTTPException(400, f"Role must be one of {', '.join(ROLES)}")
        user.role = data.role
    if data.is_active is not None:
        user.is_active = data.is_active
    db.commit()
    return user_out(user)


# ---------- Vehicles ----------
@app.get("/vehicles")
def list_vehicles(q: Optional[str] = None, status: Optional[str] = None,
                  vehicle_type: Optional[str] = None,
                  _=Depends(get_current_user), db: Session = Depends(get_db)):
    query = db.query(models.Vehicle)
    if q:
        query = query.filter(models.Vehicle.registration_number.ilike(f"%{q}%"))
    if status:
        query = query.filter(models.Vehicle.status == status)
    if vehicle_type:
        query = query.filter(models.Vehicle.vehicle_type == vehicle_type)
    return [vehicle_out(v) for v in query.order_by(models.Vehicle.id)]


@app.get("/vehicles/{vehicle_id}")
def get_vehicle(vehicle_id: int, _=Depends(get_current_user),
                db: Session = Depends(get_db)):
    v = db.get(models.Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    return vehicle_out(v)


@app.post("/vehicles", status_code=201)
def add_vehicle(data: VehicleIn, _=Depends(MANAGE), db: Session = Depends(get_db)):
    check_status(data.status)
    reg = data.registration_number.strip().upper()
    if db.query(models.Vehicle).filter_by(registration_number=reg).first():
        raise HTTPException(409, "Vehicle registration number already exists")
    v = models.Vehicle(**{**data.model_dump(), "registration_number": reg})
    db.add(v)
    db.commit()
    db.refresh(v)
    return vehicle_out(v)


@app.put("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: int, data: VehicleIn, _=Depends(MANAGE),
                   db: Session = Depends(get_db)):
    check_status(data.status)
    v = db.get(models.Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    reg = data.registration_number.strip().upper()
    dup = db.query(models.Vehicle).filter(
        models.Vehicle.registration_number == reg, models.Vehicle.id != vehicle_id
    ).first()
    if dup:
        raise HTTPException(409, "Registration number already exists")
    for field, value in {**data.model_dump(), "registration_number": reg}.items():
        setattr(v, field, value)
    db.commit()
    db.refresh(v)
    return vehicle_out(v)


@app.delete("/vehicles/{vehicle_id}")
def delete_vehicle(vehicle_id: int, _=Depends(MANAGE), db: Session = Depends(get_db)):
    v = db.get(models.Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if db.query(models.Trip).filter_by(vehicle_id=vehicle_id).first():
        raise HTTPException(409, "Vehicle has trip history and cannot be deleted")
    db.delete(v)
    db.commit()
    return {"message": "Vehicle deleted successfully"}


@app.put("/vehicles/{vehicle_id}/assign-driver/{driver_id}")
def assign_driver(vehicle_id: int, driver_id: int, _=Depends(MANAGE),
                  db: Session = Depends(get_db)):
    v = db.get(models.Vehicle, vehicle_id)
    d = db.get(models.Driver, driver_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if not d:
        raise HTTPException(404, "Driver not found")
    other = db.query(models.Vehicle).filter(
        models.Vehicle.assigned_driver_id == driver_id,
        models.Vehicle.id != vehicle_id,
    ).first()
    if other:
        raise HTTPException(409, "Driver is already assigned to another vehicle")
    v.assigned_driver_id = driver_id
    d.status = "Assigned"
    db.commit()
    db.refresh(v)
    return vehicle_out(v)


@app.delete("/vehicles/{vehicle_id}/assign-driver")
def unassign_driver(vehicle_id: int, _=Depends(MANAGE), db: Session = Depends(get_db)):
    v = db.get(models.Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if v.driver:
        v.driver.status = "Available"
    v.assigned_driver_id = None
    db.commit()
    db.refresh(v)
    return vehicle_out(v)


# ---------- Drivers ----------
@app.get("/drivers")
def list_drivers(_=Depends(get_current_user), db: Session = Depends(get_db)):
    return [driver_out(d) for d in db.query(models.Driver).order_by(models.Driver.id)]


@app.post("/drivers", status_code=201)
def add_driver(data: DriverIn, _=Depends(MANAGE), db: Session = Depends(get_db)):
    if db.query(models.Driver).filter_by(license_number=data.license_number).first():
        raise HTTPException(409, "Driver licence number already exists")
    d = models.Driver(**data.model_dump())
    db.add(d)
    db.commit()
    db.refresh(d)
    return driver_out(d)


@app.post("/drivers/{driver_id}/attendance")
def mark_attendance(driver_id: int, data: AttendanceIn, _=Depends(MANAGE),
                    db: Session = Depends(get_db)):
    if data.status not in ("Present", "Absent", "On Leave"):
        raise HTTPException(400, "Status must be Present, Absent or On Leave")
    if not db.get(models.Driver, driver_id):
        raise HTTPException(404, "Driver not found")
    log = db.query(models.AttendanceLog).filter_by(
        driver_id=driver_id, log_date=date.today()).first()
    if log:
        log.status = data.status
    else:
        db.add(models.AttendanceLog(driver_id=driver_id, status=data.status))
    db.commit()
    return {"driver_id": driver_id, "date": str(date.today()), "status": data.status}


@app.get("/drivers/{driver_id}/attendance")
def attendance_history(driver_id: int, _=Depends(get_current_user),
                       db: Session = Depends(get_db)):
    logs = db.query(models.AttendanceLog).filter_by(driver_id=driver_id) \
        .order_by(models.AttendanceLog.log_date.desc()).limit(30).all()
    return [{"date": str(l.log_date), "status": l.status} for l in logs]


# ---------- Trips & dispatch ----------
OPEN_TRIP = ("Planned", "In Progress")


def get_trip(db, trip_id):
    t = db.get(models.Trip, trip_id)
    if not t:
        raise HTTPException(404, "Trip not found")
    return t


def validate_trip(db, data, exclude_id=None):
    """Checks that hold when a trip is planned (create / edit)."""
    v = db.get(models.Vehicle, data.vehicle_id)
    d = db.get(models.Driver, data.driver_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    if not d:
        raise HTTPException(404, "Driver not found")
    if data.cargo_weight > v.capacity:
        raise HTTPException(
            400, f"Cargo weight exceeds vehicle capacity ({v.capacity:g} kg)")
    check_schedule(db, v, d, data.scheduled_start, exclude_id)


def check_schedule(db, v, d, start, exclude_id=None):
    """409 when the vehicle or driver cannot take a trip at this time."""
    if v.status == "In Maintenance":
        raise HTTPException(409, "Vehicle is in maintenance")
    day = scheduling.window(start)[0].date()
    log = db.query(models.AttendanceLog).filter_by(driver_id=d.id, log_date=day).first()
    if log and log.status != "Present":
        raise HTTPException(409, f"Driver is marked {log.status} on {day}")
    cand = scheduling.window(start)
    for column, owner, label in ((models.Trip.vehicle_id, v.id, "Vehicle"),
                                 (models.Trip.driver_id, d.id, "Driver")):
        q = db.query(models.Trip).filter(column == owner, models.Trip.status.in_(OPEN_TRIP))
        if exclude_id:
            q = q.filter(models.Trip.id != exclude_id)
        hit = scheduling.find_conflict(
            cand, [(t.id, t.scheduled_start, t.route_duration_min) for t in q])
        if hit:
            raise HTTPException(409, f"{label} already has trip #{hit} at an overlapping time")


def check_available(db, trip):
    """Checks that must hold at the moment a trip actually starts."""
    v, d = trip.vehicle, trip.driver
    if v.status == "In Maintenance":
        raise HTTPException(409, "Vehicle is in maintenance")
    for column, label in ((models.Trip.vehicle_id, "Vehicle"),
                          (models.Trip.driver_id, "Driver")):
        owner = v.id if label == "Vehicle" else d.id
        busy = db.query(models.Trip).filter(
            column == owner, models.Trip.status == "In Progress",
            models.Trip.id != trip.id,
        ).first()
        if busy:
            raise HTTPException(409, f"{label} is already on a trip in progress")
    log = db.query(models.AttendanceLog).filter_by(
        driver_id=d.id, log_date=date.today()).first()
    if log and log.status != "Present":
        raise HTTPException(409, f"Driver is marked {log.status} today")


@app.get("/trips")
def list_trips(status: Optional[str] = None, vehicle_id: Optional[int] = None,
               driver_id: Optional[int] = None, _=Depends(get_current_user),
               db: Session = Depends(get_db)):
    query = db.query(models.Trip)
    if status:
        query = query.filter(models.Trip.status == status)
    if vehicle_id:
        query = query.filter(models.Trip.vehicle_id == vehicle_id)
    if driver_id:
        query = query.filter(models.Trip.driver_id == driver_id)
    return [trip_out(t) for t in query.order_by(models.Trip.scheduled_start.desc())]


@app.get("/trips/{trip_id}")
def read_trip(trip_id: int, _=Depends(get_current_user),
              db: Session = Depends(get_db)):
    return trip_out(get_trip(db, trip_id))


@app.post("/trips", status_code=201)
def create_trip(data: TripIn, user=Depends(DISPATCH), db: Session = Depends(get_db)):
    validate_trip(db, data)
    t = models.Trip(**data.model_dump(), created_by_id=user.id)
    db.add(t)
    db.commit()
    db.refresh(t)
    return trip_out(t)


@app.put("/trips/{trip_id}")
def update_trip(trip_id: int, data: TripIn, _=Depends(DISPATCH),
                db: Session = Depends(get_db)):
    t = get_trip(db, trip_id)
    if t.status != "Planned":
        raise HTTPException(409, "Only planned trips can be edited")
    validate_trip(db, data, exclude_id=t.id)
    same_route = (t.origin.strip().lower(), t.destination.strip().lower()) == (
        data.origin.strip().lower(), data.destination.strip().lower())
    booked = [s for s in t.shipments if s.status in shipments.OPEN]
    if booked and not same_route:
        raise HTTPException(
            409, "Unassign this trip's shipments before changing its origin or destination")
    if sum(s.weight_kg for s in booked) > db.get(models.Vehicle, data.vehicle_id).capacity:
        raise HTTPException(400, "The assigned shipments exceed this vehicle's capacity")
    for field, value in data.model_dump().items():
        setattr(t, field, value)
    if not same_route:  # the chosen route no longer matches the trip
        t.route_type = t.route_geometry = t.route_duration_min = None
        t.planned_eta = t.eta = None
        t.delay_minutes = 0
    db.commit()
    db.refresh(t)
    return trip_out(t)


@app.post("/trips/{trip_id}/start")
def start_trip(trip_id: int, user=Depends(DISPATCH), db: Session = Depends(get_db)):
    t = get_trip(db, trip_id)
    if t.status != "Planned":
        raise HTTPException(409, "Only planned trips can be started")
    check_available(db, t)
    t.status = "In Progress"
    t.started_at = datetime.now(timezone.utc)
    t.vehicle.status = "Active"
    logistics.prepare_start(t, t.started_at)  # route, traffic delay, planned ETA
    shipments.on_trip_start(t, user.username)  # Assigned -> In Transit
    db.commit()
    db.refresh(t)
    return trip_out(t)


@app.post("/trips/{trip_id}/complete")
def complete_trip(trip_id: int, data: TripComplete = TripComplete(),
                  user=Depends(DISPATCH), db: Session = Depends(get_db)):
    t = get_trip(db, trip_id)
    if t.status != "In Progress":
        raise HTTPException(409, "Only trips in progress can be completed")
    t.status = "Completed"
    t.completed_at = datetime.now(timezone.utc)
    t.distance_km = data.distance_km
    shipments.on_trip_complete(t, user.username)  # In Transit / Delayed -> Delivered
    if t.vehicle.status == "Active":
        t.vehicle.status = "Idle"
    db.commit()
    db.refresh(t)
    return trip_out(t)


@app.post("/trips/{trip_id}/cancel")
def cancel_trip(trip_id: int, user=Depends(DISPATCH), db: Session = Depends(get_db)):
    t = get_trip(db, trip_id)
    if t.status not in OPEN_TRIP:
        raise HTTPException(409, "Only planned or in-progress trips can be cancelled")
    if t.status == "In Progress" and t.vehicle.status == "Active":
        t.vehicle.status = "Idle"
    t.status = "Cancelled"
    shipments.on_trip_cancel(t, user.username)  # open shipments become unassigned again
    db.commit()
    db.refresh(t)
    return trip_out(t)


# ---------- Live tracking ----------
PING_HISTORY_SECONDS = 10  # keep at most one history point per vehicle per 10 s


def position_out(v, trip=None):
    return {
        "vehicle_id": v.id, "registration_number": v.registration_number,
        "vehicle_type": v.vehicle_type, "status": v.status,
        "driver_name": v.driver.name if v.driver else None,
        "lat": v.last_lat, "lng": v.last_lng,
        "speed_kmh": v.last_speed_kmh, "heading": v.last_heading,
        "last_seen": iso(v.last_seen),
        "has_tracker": v.tracker_key_hash is not None,
        "trip": trip_brief(trip) if trip else None,
    }


@app.get("/tracking/vehicles")
def tracking_vehicles(_=Depends(get_current_user), db: Session = Depends(get_db)):
    """Latest position of every vehicle (lat/lng are null until a tracker reports)."""
    trips = {t.vehicle_id: t for t in
             db.query(models.Trip).filter(models.Trip.status == "In Progress")}
    vehicles = db.query(models.Vehicle).order_by(models.Vehicle.id).all()
    return [position_out(v, trips.get(v.id)) for v in vehicles]


@app.get("/tracking/vehicles/{vehicle_id}/history")
def tracking_history(vehicle_id: int, minutes: int = 60,
                     _=Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(models.Vehicle, vehicle_id):
        raise HTTPException(404, "Vehicle not found")
    minutes = max(1, min(minutes, 1440))
    since = datetime.now(timezone.utc) - timedelta(minutes=minutes)
    pings = db.query(models.LocationPing).filter(
        models.LocationPing.vehicle_id == vehicle_id,
        models.LocationPing.recorded_at >= since,
    ).order_by(models.LocationPing.recorded_at).limit(2000).all()
    return [{"lat": p.lat, "lng": p.lng, "speed_kmh": p.speed_kmh,
             "recorded_at": iso(p.recorded_at)} for p in pings]


@app.post("/vehicles/{vehicle_id}/tracker-key")
def rotate_tracker_key(vehicle_id: int, _=Depends(MANAGE),
                       db: Session = Depends(get_db)):
    """Create (or replace) the key the vehicle's GPS device uses. Shown only once."""
    v = db.get(models.Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    key = new_key()
    v.tracker_key_hash = hash_key(key)
    db.commit()
    return {"vehicle_id": v.id, "tracker_key": key}


@app.post("/tracking/ingest", status_code=202)
def ingest_position(data: PingIn, x_tracker_key: str = Header(...),
                    db: Session = Depends(get_db)):
    """Endpoint the GPS devices post to. Authenticated by the vehicle's tracker key."""
    v = db.query(models.Vehicle).filter_by(
        tracker_key_hash=hash_key(x_tracker_key)).first()
    if not v:
        raise HTTPException(401, "Invalid tracker key")

    now = datetime.now(timezone.utc)
    when = data.recorded_at or now
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    when = min(when, now)  # never trust timestamps from the future
    if v.last_seen and when < v.last_seen:
        return {"status": "ignored", "reason": "older than latest position"}

    v.last_lat, v.last_lng = data.lat, data.lng
    v.last_speed_kmh, v.last_heading = data.speed_kmh, data.heading
    v.last_seen = when

    trip = db.query(models.Trip).filter_by(
        vehicle_id=v.id, status="In Progress").first()
    if trip:  # ETA from the vehicle's position along the chosen route
        logistics.update_eta(trip, data.lat, data.lng, now)
        shipments.sync_delay(trip, now, "system")  # flag / clear Delayed on its shipments

    prev = db.query(models.LocationPing.recorded_at).filter_by(vehicle_id=v.id) \
        .order_by(models.LocationPing.recorded_at.desc()).first()
    if prev is None or (when - prev[0]).total_seconds() >= PING_HISTORY_SECONDS:
        db.add(models.LocationPing(
            vehicle_id=v.id, lat=data.lat, lng=data.lng,
            speed_kmh=data.speed_kmh, heading=data.heading, recorded_at=when))
    db.commit()
    db.refresh(v)

    try:  # a broken browser connection must never fail the device's request
        anyio.from_thread.run(
            manager.broadcast, {"type": "position", "vehicle": position_out(v, trip)})
    except Exception:
        pass
    return {"status": "ok"}


@app.websocket("/ws/tracking")
async def tracking_socket(ws: WebSocket, token: str = ""):
    """Browsers connect here (JWT in the query string) to receive live positions."""
    if ws.headers.get("origin") not in ALLOWED_ORIGINS:
        await ws.close(code=4403)
        return
    db = SessionLocal()
    try:
        user = user_from_token(token, db)
    finally:
        db.close()
    if not user:
        await ws.close(code=4401)
        return
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()  # keeps the connection open; client sends nothing
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ---------- Dashboard ----------
def delayed_trips(db):
    """Planned trips that are late to start plus in-progress trips running behind plan."""
    now = datetime.now(timezone.utc)
    open_trips = db.query(models.Trip).filter(models.Trip.status.in_(OPEN_TRIP)).all()
    return sum(1 for t in open_trips if logistics.delay_info(t, now)["delayed"])


@app.get("/dashboard/stats")
def dashboard_stats(_=Depends(get_current_user), db: Session = Depends(get_db)):
    V = models.Vehicle
    by_status = dict(db.query(V.status, func.count()).group_by(V.status).all())
    by_type = dict(db.query(V.vehicle_type, func.count()).group_by(V.vehicle_type).all())
    return {
        "total_fleet": sum(by_status.values()),
        "active_vehicles": by_status.get("Active", 0),
        "in_maintenance": by_status.get("In Maintenance", 0),
        "idle_vehicles": by_status.get("Idle", 0),
        "total_drivers": db.query(models.Driver).count(),
        "unassigned_drivers": db.query(models.Driver)
            .filter(~models.Driver.vehicle.has()).count(),
        "by_status": by_status,
        "by_type": by_type,
        "trips_by_status": dict(
            db.query(models.Trip.status, func.count())
            .group_by(models.Trip.status).all()
        ),
        "delayed_trips": delayed_trips(db),
        "shipments_by_status": dict(
            db.query(models.Shipment.status, func.count())
            .group_by(models.Shipment.status).all()
        ),
    }
