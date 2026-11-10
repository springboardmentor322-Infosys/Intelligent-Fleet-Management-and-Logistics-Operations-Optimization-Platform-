"""Driver assignment (Milestone 3, Task 2): put a driver and a vehicle on an existing trip.

The refusal rules and the derived states (a driver "On Trip", a vehicle "Assigned") live in
assignment_rules.py and are tested without a database. Overlap detection reuses scheduling.py,
the same code that checks conflicts when a trip is planned.
"""
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

import assignment_rules as rules
import models
import scheduling
from database import get_db
from security import require_roles

router = APIRouter(prefix="/assignments", tags=["assignments"])
DISPATCH = require_roles("admin", "fleet_manager", "dispatcher")
BOOKED = ("Assigned", "In Transit", "Delayed")  # shipments that count towards a trip's load


class AssignIn(BaseModel):
    trip_id: int
    driver_id: int
    vehicle_id: int


def iso(dt):
    return dt.isoformat() if dt else None


def overlapping_trip(db, column, owner, trip):
    """Id of another open trip of the same driver / vehicle at an overlapping time, or None."""
    candidate = scheduling.window(trip.scheduled_start, trip.route_duration_min)
    others = db.query(models.Trip).filter(
        column == owner, models.Trip.status.in_(rules.ACTIVE_TRIP), models.Trip.id != trip.id)
    return scheduling.find_conflict(
        candidate, [(t.id, t.scheduled_start, t.route_duration_min) for t in others])


def assignment_out(a):
    return {
        "id": a.id, "trip_id": a.trip_id,
        "origin": a.trip.origin, "destination": a.trip.destination,
        "driver_id": a.driver_id, "driver": a.driver.name,
        "vehicle_id": a.vehicle_id, "vehicle": a.vehicle.registration_number,
        "assigned_at": iso(a.assigned_at),
        "assigned_by": a.assigned_by.username if a.assigned_by else None,
        "trip_status": a.trip.status,
        "status": rules.assignment_status(a.trip.status),  # follows the trip
    }


@router.post("", status_code=201)
def assign(data: AssignIn, user=Depends(DISPATCH), db: Session = Depends(get_db)):
    trip = db.get(models.Trip, data.trip_id)
    driver = db.get(models.Driver, data.driver_id)
    vehicle = db.get(models.Vehicle, data.vehicle_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    if not driver:
        raise HTTPException(404, "Driver not found")
    if not vehicle:
        raise HTTPException(404, "Vehicle not found")

    day = scheduling.window(trip.scheduled_start)[0].date()
    log = db.query(models.AttendanceLog).filter_by(driver_id=driver.id, log_date=day).first()
    booked_kg = sum(s.weight_kg for s in trip.shipments if s.status in BOOKED)
    bad = rules.problem(
        trip_status=trip.status,
        same_pair=(trip.driver_id == driver.id and trip.vehicle_id == vehicle.id),
        vehicle_status=vehicle.status, capacity=vehicle.capacity,
        load_kg=max(trip.cargo_weight, booked_kg),
        attendance=log.status if log else None,
        vehicle_conflict=overlapping_trip(db, models.Trip.vehicle_id, vehicle.id, trip),
        driver_conflict=overlapping_trip(db, models.Trip.driver_id, driver.id, trip),
    )
    if bad:
        raise HTTPException(bad[0], bad[1])

    trip.driver_id, trip.vehicle_id = driver.id, vehicle.id
    row = models.DriverAssignment(
        trip_id=trip.id, driver_id=driver.id, vehicle_id=vehicle.id,
        assigned_by_id=user.id, assigned_at=datetime.now(timezone.utc))
    db.add(row)
    db.commit()
    db.refresh(row)
    return assignment_out(row)


@router.get("/history")
def history(driver_id: Optional[int] = None, vehicle_id: Optional[int] = None,
            trip_id: Optional[int] = None, _=Depends(DISPATCH),
            db: Session = Depends(get_db)):
    q = db.query(models.DriverAssignment)
    if driver_id:
        q = q.filter_by(driver_id=driver_id)
    if vehicle_id:
        q = q.filter_by(vehicle_id=vehicle_id)
    if trip_id:
        q = q.filter_by(trip_id=trip_id)
    rows = q.order_by(models.DriverAssignment.id.desc()).limit(200).all()
    return [assignment_out(a) for a in rows]


@router.get("/overview")
def overview(_=Depends(DISPATCH), db: Session = Depends(get_db)):
    """Everything the Driver Assignment page needs in one call."""
    open_trips = db.query(models.Trip).filter(
        models.Trip.status.in_(rules.ACTIVE_TRIP)).order_by(models.Trip.scheduled_start).all()
    by_driver, by_vehicle = {}, {}
    for t in open_trips:
        by_driver.setdefault(t.driver_id, []).append(t)
        by_vehicle.setdefault(t.vehicle_id, []).append(t)
    today = {l.driver_id: l.status for l in
             db.query(models.AttendanceLog).filter_by(log_date=date.today())}

    def brief(t):
        return {"id": t.id, "origin": t.origin, "destination": t.destination,
                "status": t.status, "scheduled_start": iso(t.scheduled_start)}

    drivers = []
    for d in db.query(models.Driver).order_by(models.Driver.id):
        trips = by_driver.get(d.id, [])
        drivers.append({
            "id": d.id, "name": d.name, "phone": d.phone, "license_number": d.license_number,
            "state": rules.driver_state(today.get(d.id), [t.status for t in trips]),
            "default_vehicle": d.vehicle.registration_number if d.vehicle else None,
            "trips": [brief(t) for t in trips],
        })
    vehicles = []
    for v in db.query(models.Vehicle).order_by(models.Vehicle.id):
        trips = by_vehicle.get(v.id, [])
        vehicles.append({
            "id": v.id, "registration_number": v.registration_number,
            "vehicle_type": v.vehicle_type, "capacity": v.capacity,
            "state": rules.vehicle_state(v.status, [t.status for t in trips]),
            "trips": [brief(t) for t in trips],
        })
    current = [{
        "trip_id": t.id, "origin": t.origin, "destination": t.destination,
        "status": t.status, "scheduled_start": iso(t.scheduled_start),
        "driver_id": t.driver_id, "driver": t.driver.name,
        "vehicle_id": t.vehicle_id, "vehicle": t.vehicle.registration_number,
    } for t in open_trips]
    count = lambda rows, s: sum(1 for r in rows if r["state"] == s)
    return {
        "stats": {
            "drivers": len(drivers),
            "drivers_available": count(drivers, "Available"),
            "drivers_on_trip": count(drivers, "On Trip"),
            "drivers_off_duty": count(drivers, "Off Duty"),
            "vehicles": len(vehicles),
            "vehicles_available": count(vehicles, "Available"),
            "vehicles_in_maintenance": count(vehicles, "In Maintenance"),
            "active_assignments": len(current),
        },
        "drivers": drivers, "vehicles": vehicles, "current": current,
        "planned_trips": [brief(t) | {"driver_id": t.driver_id, "vehicle_id": t.vehicle_id}
                          for t in open_trips if t.status == "Planned"],
    }
