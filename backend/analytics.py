"""Operational analytics API (Milestone 3, Tasks 4 and 5).

Loads the rows, applies the dashboard filters and hands them to analytics_rules.summarize(),
where every number is defined and tested without a database. Admin and fleet manager only.
"""
from datetime import date, datetime, time, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import analytics_rules as rules
import assignment_rules
import logistics
import models
from database import get_db
from security import require_roles

router = APIRouter(prefix="/analytics", tags=["analytics"])
MANAGE = require_roles("admin", "fleet_manager")
TRIP_STATUSES = ("Planned", "In Progress", "Completed", "Cancelled")


def day_start(d):
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def load_trips(db, start, end, vehicle, driver_id, status):
    q = db.query(models.Trip).join(models.Vehicle, models.Trip.vehicle_id == models.Vehicle.id)
    if start:
        q = q.filter(models.Trip.scheduled_start >= day_start(start))
    if end:
        q = q.filter(models.Trip.scheduled_start < day_start(end + timedelta(days=1)))
    if vehicle:
        q = q.filter(models.Vehicle.registration_number.ilike(f"%{vehicle}%"))
    if driver_id:
        q = q.filter(models.Trip.driver_id == driver_id)
    if status:
        q = q.filter(models.Trip.status == status)
    return q.order_by(models.Trip.scheduled_start).all()


@router.get("/fleet-performance")
def fleet_performance(start: Optional[date] = None, end: Optional[date] = None,
                      vehicle: Optional[str] = None, driver_id: Optional[int] = None,
                      status: Optional[str] = None, _=Depends(MANAGE),
                      db: Session = Depends(get_db)):
    if start and end and start > end:
        raise HTTPException(422, "Start date must not be after end date")
    if status and status not in TRIP_STATUSES:
        raise HTTPException(422, f"Status must be one of {', '.join(TRIP_STATUSES)}")
    now = datetime.now(timezone.utc)

    trips = load_trips(db, start, end, vehicle, driver_id, status)
    trip_rows = [dict(
        id=t.id, vehicle=t.vehicle.registration_number, driver=t.driver.name,
        origin=t.origin, destination=t.destination, status=t.status,
        distance_km=t.distance_km, planned_eta=t.planned_eta, completed_at=t.completed_at,
        delayed_now=(t.status == "In Progress" and logistics.delay_info(t, now)["delayed"]),
    ) for t in trips]

    trip_ids = [t.id for t in trips]
    shipments = db.query(models.Shipment).filter(models.Shipment.trip_id.in_(trip_ids)).all() if trip_ids else []
    shipment_rows = [dict(trip_id=s.trip_id, status=s.status,
                          was_delayed=any(h.status == "Delayed" for h in s.history)) for s in shipments]

    mq = db.query(models.Maintenance).join(models.Vehicle)
    if start:
        mq = mq.filter(models.Maintenance.scheduled_date >= start)
    if end:
        mq = mq.filter(models.Maintenance.scheduled_date <= end)
    if vehicle:
        mq = mq.filter(models.Vehicle.registration_number.ilike(f"%{vehicle}%"))
    maintenance_rows = [dict(vehicle=m.vehicle.registration_number, status=m.status,
                             cost=m.actual_cost) for m in mq]

    vehicles = db.query(models.Vehicle).all()
    in_progress = db.query(models.Trip).filter_by(status="In Progress").all()
    busy = {t.vehicle.registration_number for t in in_progress}
    result = rules.summarize(
        trip_rows, shipment_rows, maintenance_rows,
        [dict(registration_number=v.registration_number, status=v.status) for v in vehicles], busy)

    # Current driver snapshot (not affected by the date filters).
    open_trips = db.query(models.Trip).filter(
        models.Trip.status.in_(assignment_rules.ACTIVE_TRIP)).all()
    by_driver = {}
    for t in open_trips:
        by_driver.setdefault(t.driver_id, []).append(t.status)
    attendance = {l.driver_id: l.status for l in
                  db.query(models.AttendanceLog).filter_by(log_date=date.today())}
    states = [assignment_rules.driver_state(attendance.get(d.id), by_driver.get(d.id, []))
              for d in db.query(models.Driver)]
    result["driver_summary"] = {
        "total": len(states),
        "available": sum(1 for s in states if s in ("Available", "Assigned")),
        "on_trip": sum(1 for s in states if s == "On Trip"),
        "off_duty": sum(1 for s in states if s == "Off Duty"),
    }
    result["fleet_summary"] = {
        "total": len(vehicles),
        "active": sum(1 for v in vehicles if v.status == "Active"),
        "available": result["utilisation"]["available"],
        "in_maintenance": result["utilisation"]["in_maintenance"],
    }
    result["filters"] = {"start": str(start) if start else None, "end": str(end) if end else None,
                         "vehicle": vehicle, "driver_id": driver_id, "status": status}
    return result
