"""Shipments for Milestone 2 (plan step 3).

A shipment is cargo that travels on a trip. Its status can only move along the
allowed changes in TRANSITIONS, and every change is written to shipment_history.

    Created --assign--> Assigned --trip starts--> In Transit --trip completes--> Delivered
    In Transit <--> Delayed    (flagged automatically while the trip runs late)
    Created / Assigned --cancel--> Cancelled
    trip cancelled: open shipments go back to Created (unassigned) to be re-planned

Delivered and Cancelled are final.
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import or_
from sqlalchemy.orm import Session

import logistics
import models
from database import get_db
from logistics import iso
from security import get_current_user, require_roles

router = APIRouter()
DISPATCH = require_roles("admin", "fleet_manager", "dispatcher")

OPEN = ("Assigned", "In Transit", "Delayed")  # on a trip and not finished
# Once flagged Delayed, a shipment goes back to In Transit only when the trip is clearly
# back on schedule (5 minutes inside the threshold), so it cannot flip back and forth.
RECOVER_BELOW_MIN = logistics.DELAY_THRESHOLD_MIN - 5

# Every change the system itself may make.
TRANSITIONS = {
    "Created": ("Assigned", "Cancelled"),
    "Assigned": ("In Transit", "Created", "Cancelled"),
    "In Transit": ("Delayed", "Delivered", "Created"),
    "Delayed": ("In Transit", "Delivered", "Created"),
    "Delivered": (),
    "Cancelled": (),
}
# What a person may do from the status endpoint. Assigning is done with /assign, starting
# with the trip, and Delayed is flagged automatically from the ETA.
MANUAL = {
    "Created": ("Cancelled",),
    "Assigned": ("Cancelled",),
    "In Transit": ("Delivered",),
    "Delayed": ("Delivered",),
}


# ---------------- Rules (no database needed, see test_shipments.py) ----------------
def set_status(s, status, note="", who=None):
    """Change a shipment's status if the change is allowed, and record it in the history."""
    if status not in TRANSITIONS.get(s.status, ()):
        raise HTTPException(409, f"A {s.status} shipment cannot become {status}")
    s.status = status
    now = models.utcnow()
    if status == "Delivered":
        s.delivered_at = now
    s.history.append(models.ShipmentHistory(
        status=status, note=note[:200], changed_by=who, changed_at=now))


def create_shipment(db, data, who=None):
    """The only place shipments are created: the code (SH-001 ...) comes from the id."""
    s = models.Shipment(
        code="TMP-" + uuid.uuid4().hex[:12], origin=data.origin,
        destination=data.destination, description=data.description,
        weight_kg=data.weight_kg, status="Created")
    db.add(s)
    db.flush()
    s.code = f"SH-{s.id:03d}"
    s.history.append(models.ShipmentHistory(
        status="Created", note="Shipment created", changed_by=who,
        changed_at=models.utcnow()))
    return s


def on_trip_start(trip, who=None):
    for s in list(trip.shipments):
        if s.status == "Assigned":
            set_status(s, "In Transit", f"Trip #{trip.id} started", who)
            s.eta = trip.eta


def on_trip_complete(trip, who=None):
    for s in list(trip.shipments):
        if s.status in ("In Transit", "Delayed"):
            set_status(s, "Delivered", f"Trip #{trip.id} completed", who)
            s.eta = None


def on_trip_cancel(trip, who=None):
    for s in list(trip.shipments):
        if s.status in OPEN:
            set_status(s, "Created",
                       f"Trip #{trip.id} was cancelled; shipment is unassigned again", who)
            s.trip = None
            s.eta = None


def sync_delay(trip, now, who="system"):
    """Flag a trip's shipments Delayed while the trip runs late, and clear the flag
    once it is clearly back on schedule. Called whenever the ETA is recalculated."""
    if trip.status != "In Progress":
        return
    info = logistics.delay_info(trip, now)
    for s in list(trip.shipments):
        if s.status == "In Transit" and info["delayed"]:
            set_status(s, "Delayed",
                       f"Trip #{trip.id} is running {info['late_minutes']} min behind plan", who)
        elif (s.status == "Delayed" and info["state"] == "on_time"
              and info["late_minutes"] <= RECOVER_BELOW_MIN):
            set_status(s, "In Transit", f"Trip #{trip.id} is back on schedule", who)


def _norm(text):
    return " ".join(text.split()).lower()


# ---------------- Schemas and serializer ----------------
class ShipmentIn(BaseModel):
    origin: str = Field(min_length=1, max_length=120)
    destination: str = Field(min_length=1, max_length=120)
    description: str = Field(min_length=1, max_length=200)
    weight_kg: float = Field(gt=0)


class AssignIn(BaseModel):
    trip_id: int


class StatusIn(BaseModel):
    status: str
    note: Optional[str] = Field(default=None, max_length=150)


def shipment_out(s, detail=False):
    trip = None
    if s.trip:
        brief = logistics.trip_brief(s.trip)
        trip = {**brief, "status": s.trip.status,
                "vehicle": s.trip.vehicle.registration_number,
                "driver": s.trip.driver.name}
    out = {
        "id": s.id, "code": s.code, "origin": s.origin, "destination": s.destination,
        "description": s.description, "weight_kg": s.weight_kg, "status": s.status,
        "trip_id": s.trip_id, "trip": trip, "eta": iso(s.eta),
        "created_at": iso(s.created_at), "delivered_at": iso(s.delivered_at),
        "can_assign": s.status == "Created",
        "next_statuses": list(MANUAL.get(s.status, ())),
    }
    if detail:
        out["history"] = [
            {"status": h.status, "note": h.note, "changed_by": h.changed_by,
             "changed_at": iso(h.changed_at)} for h in s.history]
    return out


def _clean(data):
    data.origin, data.destination = data.origin.strip(), data.destination.strip()
    data.description = data.description.strip()
    if not (data.origin and data.destination and data.description):
        raise HTTPException(400, "Origin, destination and description cannot be blank")
    return data


def _get(db, shipment_id):
    s = db.get(models.Shipment, shipment_id)
    if not s:
        raise HTTPException(404, "Shipment not found")
    return s


# ---------------- Endpoints ----------------
@router.get("/shipments")
def list_shipments(status: Optional[str] = None, trip_id: Optional[int] = None,
                   q: Optional[str] = None, _=Depends(get_current_user),
                   db: Session = Depends(get_db)):
    if status and status not in models.SHIPMENT_STATUSES:
        raise HTTPException(400, f"Status must be one of {', '.join(models.SHIPMENT_STATUSES)}")
    query = db.query(models.Shipment)
    if status:
        query = query.filter(models.Shipment.status == status)
    if trip_id:
        query = query.filter(models.Shipment.trip_id == trip_id)
    if q:
        like = f"%{q}%"
        query = query.filter(or_(models.Shipment.code.ilike(like),
                                 models.Shipment.description.ilike(like)))
    return [shipment_out(s) for s in query.order_by(models.Shipment.id.desc())]


@router.get("/shipments/{shipment_id}")
def read_shipment(shipment_id: int, _=Depends(get_current_user),
                  db: Session = Depends(get_db)):
    return shipment_out(_get(db, shipment_id), detail=True)


@router.post("/shipments", status_code=201)
def add_shipment(data: ShipmentIn, user=Depends(DISPATCH), db: Session = Depends(get_db)):
    s = create_shipment(db, _clean(data), user.username)
    db.commit()
    db.refresh(s)
    return shipment_out(s, detail=True)


@router.put("/shipments/{shipment_id}")
def edit_shipment(shipment_id: int, data: ShipmentIn, _=Depends(DISPATCH),
                  db: Session = Depends(get_db)):
    s = _get(db, shipment_id)
    if s.status != "Created":
        raise HTTPException(409, "Only unassigned (Created) shipments can be edited")
    data = _clean(data)
    s.origin, s.destination = data.origin, data.destination
    s.description, s.weight_kg = data.description, data.weight_kg
    db.commit()
    db.refresh(s)
    return shipment_out(s, detail=True)


@router.post("/shipments/{shipment_id}/assign")
def assign_shipment(shipment_id: int, data: AssignIn, user=Depends(DISPATCH),
                    db: Session = Depends(get_db)):
    s = _get(db, shipment_id)
    t = db.get(models.Trip, data.trip_id)
    if not t:
        raise HTTPException(404, "Trip not found")
    if s.status != "Created":
        raise HTTPException(409, "Only unassigned (Created) shipments can be assigned")
    if t.status != "Planned":
        raise HTTPException(409, "Shipments can only be assigned to planned trips")
    if _norm(s.origin) != _norm(t.origin) or _norm(s.destination) != _norm(t.destination):
        raise HTTPException(
            400, f"This shipment goes {s.origin} → {s.destination}, "
                 f"but the trip goes {t.origin} → {t.destination}")
    load = sum(x.weight_kg for x in t.shipments if x.status in OPEN)
    if load + s.weight_kg > t.vehicle.capacity:
        raise HTTPException(
            400, f"Vehicle capacity is {t.vehicle.capacity:g} kg and {load:g} kg is already "
                 f"assigned; this shipment ({s.weight_kg:g} kg) does not fit")
    s.trip = t
    set_status(s, "Assigned", f"Assigned to trip #{t.id} ({t.vehicle.registration_number})",
               user.username)
    db.commit()
    db.refresh(s)
    return shipment_out(s, detail=True)


@router.post("/shipments/{shipment_id}/unassign")
def unassign_shipment(shipment_id: int, user=Depends(DISPATCH),
                      db: Session = Depends(get_db)):
    s = _get(db, shipment_id)
    if s.status != "Assigned":
        raise HTTPException(409, "Only assigned shipments that have not left can be unassigned")
    trip_id = s.trip_id
    set_status(s, "Created", f"Removed from trip #{trip_id}", user.username)
    s.trip = None
    db.commit()
    db.refresh(s)
    return shipment_out(s, detail=True)


@router.post("/shipments/{shipment_id}/status")
def change_status(shipment_id: int, data: StatusIn, user=Depends(DISPATCH),
                  db: Session = Depends(get_db)):
    s = _get(db, shipment_id)
    if data.status not in MANUAL.get(s.status, ()):
        allowed = ", ".join(MANUAL.get(s.status, ())) or "none"
        raise HTTPException(
            409, f"A {s.status} shipment cannot be set to {data.status} here (allowed: {allowed})")
    note = (data.note or "").strip() or f"Marked {data.status}"
    set_status(s, data.status, note, user.username)
    if data.status == "Cancelled":
        s.trip = None
    s.eta = None
    db.commit()
    db.refresh(s)
    return shipment_out(s, detail=True)
