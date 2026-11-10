"""Driver profile: personal and licence details, vehicle, trips and shipments, GPS and ETA,
duty status, performance, and the actions the current user may take.

ACCESS: admin, fleet manager and dispatcher can open any driver. A driver (a login linked to a
driver record through drivers.user_id) can open only their own profile.
"""
import re
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

import driver_stats
import logistics
import models
import shipments
from database import get_db
from logistics import iso
from security import get_current_user, require_roles

router = APIRouter(tags=["driver profile"])

MANAGE = require_roles("admin", "fleet_manager")
STAFF_ROLES = ("admin", "fleet_manager", "dispatcher")
MANAGE_ROLES = ("admin", "fleet_manager")
EMAIL = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"
HISTORY_LIMIT = 20  # finished trips shown on the profile


# ---------- access ----------
def own_driver(db, user):
    """The driver record linked to this login, or None."""
    return db.query(models.Driver).filter_by(user_id=user.id).first()


def load_driver_for(db, user, driver_id):
    """The driver the user is allowed to see. Staff see anyone; a driver only themselves.
    A driver asking for anyone else gets the same 403 whether or not that id exists."""
    d = db.get(models.Driver, driver_id)
    if user.role not in STAFF_ROLES and (d is None or d.user_id != user.id):
        raise HTTPException(403, "You can only open your own driver profile")
    if d is None:
        raise HTTPException(404, "Driver not found")
    return d


# ---------- output ----------
def document_out(doc, driver_id):
    return {
        "id": doc.id, "doc_type": doc.doc_type, "original_name": doc.original_name,
        "size_bytes": doc.size_bytes, "uploaded_at": iso(doc.uploaded_at),
        "verified": doc.verified, "verified_by": doc.verified_by,
        "verified_at": iso(doc.verified_at),
        "url": f"/drivers/{driver_id}/documents/{doc.id}/file",
    }


def build_profile(db: Session, d, user):
    now = datetime.now(timezone.utc)
    today = date.today()
    Trip, Shipment = models.Trip, models.Shipment

    trips = db.query(Trip).filter(Trip.driver_id == d.id).order_by(Trip.id.desc()).all()
    current = next((t for t in trips if t.status == "In Progress"), None)
    upcoming = sorted((t for t in trips if t.status == "Planned"), key=lambda t: t.scheduled_start)
    completed = [t for t in trips if t.status == "Completed"]
    finished = [t for t in trips if t.status in ("Completed", "Cancelled")][:HISTORY_LIMIT]

    open_ids = [t.id for t in ([current] if current else []) + upcoming]
    active_shipments = (
        db.query(Shipment).filter(Shipment.trip_id.in_(open_ids)).order_by(Shipment.id).all()
        if open_ids else [])
    delivered = (
        db.query(func.count(Shipment.id)).join(Trip, Shipment.trip_id == Trip.id)
        .filter(Trip.driver_id == d.id, Shipment.status == "Delivered").scalar() or 0)

    # Duty status
    attendance = db.query(models.AttendanceLog).filter_by(driver_id=d.id, log_date=today).first()
    pings = []
    if current:
        since = now - timedelta(minutes=driver_stats.AT_STOP_WINDOW_MIN)
        pings = [(r.recorded_at, r.speed_kmh) for r in
                 db.query(models.LocationPing.recorded_at, models.LocationPing.speed_kmh)
                 .filter(models.LocationPing.vehicle_id == current.vehicle_id,
                         models.LocationPing.recorded_at >= since)]
    duty = driver_stats.duty_status(
        d.user.is_active if d.user else None,
        attendance.status if attendance else None,
        current is not None, pings, now)

    # Performance
    states = [logistics.delay_info(t, now)["state"] for t in completed]
    delayed_now = sum(1 for t in ([current] if current else []) + upcoming
                      if logistics.delay_info(t, now)["delayed"])
    perf = driver_stats.performance(states, delivered, delayed_now)

    # GPS: the vehicle on the current trip, else the one assigned to the driver
    veh = current.vehicle if current else d.vehicle
    gps = None
    if veh is not None:
        cur_delay = logistics.delay_info(current, now) if current else None
        gps = {
            "vehicle_id": veh.id, "registration_number": veh.registration_number,
            "lat": veh.last_lat, "lng": veh.last_lng, "speed_kmh": veh.last_speed_kmh,
            "heading": veh.last_heading, "last_seen": iso(veh.last_seen),
            "trip_id": current.id if current else None,
            "route_type": current.route_type if current else None,
            "eta": iso(current.eta) if current else None,
            "planned_eta": iso(current.planned_eta) if current else None,
            "delay": cur_delay,
        }

    manage = user.role in MANAGE_ROLES
    own = d.user_id is not None and d.user_id == user.id
    return {
        "id": d.id,
        "duty_status": duty,
        "personal": {
            "id": d.id, "name": d.name, "phone": d.phone, "email": d.email,
            "photo_url": f"/drivers/{d.id}/photo" if d.photo_name else None,
        },
        "account": {
            "linked": d.user is not None,
            "user_id": d.user.id if d.user else None,
            "username": d.user.username if d.user else None,
            "email": d.user.email if d.user else None,
            "is_active": d.user.is_active if d.user else None,
        },
        "licence": {
            "number": d.license_number,
            "expiry": d.license_expiry.isoformat() if d.license_expiry else None,
            "status": driver_stats.licence_status(d.license_expiry, today),
            "documents": [document_out(x, d.id) for x in d.documents],
            "all_verified": bool(d.documents) and all(x.verified for x in d.documents),
        },
        "vehicle": None if d.vehicle is None else {
            "id": d.vehicle.id, "registration_number": d.vehicle.registration_number,
            "vehicle_type": d.vehicle.vehicle_type, "status": d.vehicle.status,
        },
        "trips": {
            "current": logistics.trip_out(current, now) if current else None,
            "upcoming": [logistics.trip_out(t, now) for t in upcoming[:5]],
            "shipments": [shipments.shipment_out(s) for s in active_shipments],
            "history": [logistics.trip_out(t, now) for t in finished],
        },
        "gps": gps,
        "performance": perf,
        "actions": {
            "edit": manage,
            "assign_vehicle": manage,
            "verify_documents": manage,
            "upload": manage or own,
            "link_account": manage,
            "deactivate": user.role == "admin" and d.user is not None,
        },
    }


# ---------- endpoints ----------
# NOTE: /drivers/me/profile must be declared before /drivers/{driver_id}/profile, otherwise
# "me" would be read as a driver id.
@router.get("/drivers/me/profile")
def my_profile(user=Depends(get_current_user), db: Session = Depends(get_db)):
    d = own_driver(db, user)
    if d is None:
        raise HTTPException(
            404, "Your login is not linked to a driver record yet. Ask an administrator to link it.")
    return build_profile(db, d, user)


@router.get("/drivers/{driver_id}/profile")
def driver_profile(driver_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return build_profile(db, load_driver_for(db, user, driver_id), user)


class DriverEdit(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    license_number: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=5, max_length=20)
    email: Optional[str] = Field(default=None, max_length=120)
    license_expiry: Optional[date] = None

    @field_validator("name", "license_number", "phone")
    @classmethod
    def _not_blank(cls, v):
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v is None or not v.strip():
            return None
        v = v.strip()
        if not re.match(EMAIL, v):
            raise ValueError("is not a valid email address")
        return v


@router.put("/drivers/{driver_id}")
def edit_driver(driver_id: int, data: DriverEdit, user=Depends(MANAGE),
                db: Session = Depends(get_db)):
    d = db.get(models.Driver, driver_id)
    if d is None:
        raise HTTPException(404, "Driver not found")
    clash = db.query(models.Driver).filter(
        models.Driver.license_number == data.license_number,
        models.Driver.id != d.id).first()
    if clash:
        raise HTTPException(409, "Driver licence number already exists")
    d.name, d.phone, d.license_number = data.name, data.phone, data.license_number
    d.email, d.license_expiry = data.email, data.license_expiry
    db.commit()
    return build_profile(db, d, user)


# ---------- linking a login account to a driver ----------
# Assign vehicle (PUT /vehicles/{id}/assign-driver/{driver_id}) and activate / deactivate
# (PUT /users/{id}, admin only) already exist and are reused by the profile page as they are.
class AccountLink(BaseModel):
    user_id: int


@router.get("/drivers/linkable-accounts")
def linkable_accounts(_=Depends(MANAGE), db: Session = Depends(get_db)):
    """Driver-role logins that are not linked to any driver yet."""
    linked = [row[0] for row in db.query(models.Driver.user_id)
              .filter(models.Driver.user_id.isnot(None))]
    users = (db.query(models.User)
             .filter(models.User.role == "driver", models.User.id.notin_(linked))
             .order_by(models.User.username))
    return [{"id": u.id, "username": u.username, "email": u.email, "is_active": u.is_active}
            for u in users]


@router.put("/drivers/{driver_id}/account")
def link_account(driver_id: int, data: AccountLink, user=Depends(MANAGE),
                 db: Session = Depends(get_db)):
    d = db.get(models.Driver, driver_id)
    if d is None:
        raise HTTPException(404, "Driver not found")
    if d.user_id is not None:
        raise HTTPException(409, "This driver already has a login linked. Unlink it first.")
    target = db.get(models.User, data.user_id)
    if target is None:
        raise HTTPException(404, "User not found")
    if target.role != "driver":
        raise HTTPException(400, "Only a login with the driver role can be linked to a driver")
    if db.query(models.Driver).filter(models.Driver.user_id == target.id).first():
        raise HTTPException(409, "This login is already linked to another driver")
    d.user_id = target.id
    db.commit()
    return build_profile(db, d, user)


@router.delete("/drivers/{driver_id}/account")
def unlink_account(driver_id: int, user=Depends(MANAGE), db: Session = Depends(get_db)):
    d = db.get(models.Driver, driver_id)
    if d is None:
        raise HTTPException(404, "Driver not found")
    d.user_id = None
    db.commit()
    return build_profile(db, d, user)
