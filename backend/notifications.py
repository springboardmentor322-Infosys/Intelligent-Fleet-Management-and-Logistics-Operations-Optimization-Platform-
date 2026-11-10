"""In-app notification feed (Milestone 4 plan, step 1; spec module 8).

The feed is built from data that already exists, so it can never disagree with it and no other
module has to remember to create notifications:
  * maintenance alerts (Upcoming / Overdue)          -> admin, fleet manager
  * shipment status changes and deliveries           -> staff; a driver sees their own trips'
  * driver assignment changes                        -> staff; a driver sees their own
  * route changes (reroutes)                         -> staff; a driver sees their own trips'
Which notifications a person has read is remembered in their browser (see Notifications.jsx).
Email, SMS and push delivery are NOT implemented: they need provider accounts.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

import models
from database import get_db
from security import get_current_user

router = APIRouter(prefix="/notifications", tags=["notifications"])
MAX_ITEMS = 100


def iso(dt):
    return dt.isoformat() if dt else None


@router.get("")
def feed(hours: int = 72, user=Depends(get_current_user), db: Session = Depends(get_db)):
    hours = max(1, min(hours, 24 * 14))
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    role = user.role
    driver = None
    if role == "driver":
        driver = db.query(models.Driver).filter_by(user_id=user.id).first()
        if driver is None:      # a login that is not linked to a driver record has no feed
            return []

    items = []

    def add(key, kind, title, message, at, page):
        items.append({"id": key, "kind": kind, "title": title, "message": message,
                      "at": iso(at), "page": page})

    if role in ("admin", "fleet_manager"):
        alerts = db.query(models.MaintenanceAlert).filter(
            models.MaintenanceAlert.category.in_(("Upcoming", "Overdue"))).all()
        for a in alerts:
            m = a.maintenance
            add(f"maint-{a.id}-{a.category}", "maintenance",
                f"Maintenance {a.category.lower()}: {m.vehicle.registration_number}",
                f"{m.category} scheduled for {m.scheduled_date}", a.created_at, "Maintenance")

    history = db.query(models.ShipmentHistory).filter(
        models.ShipmentHistory.changed_at >= since,
        models.ShipmentHistory.status != "Created").all()
    for h in history:
        s = h.shipment
        if driver and (s.trip is None or s.trip.driver_id != driver.id):
            continue
        kind = "delivery" if h.status == "Delivered" else "shipment"
        add(f"ship-{h.id}", kind, f"Shipment {s.code}: {h.status}",
            f"{s.origin} → {s.destination}" + (f" · {h.note}" if h.note else ""),
            h.changed_at, "Shipments")

    assignments = db.query(models.DriverAssignment).filter(
        models.DriverAssignment.assigned_at >= since).all()
    for a in assignments:
        if driver and a.driver_id != driver.id:
            continue
        add(f"assign-{a.id}", "assignment",
            f"Trip #{a.trip_id}: {a.driver.name} with {a.vehicle.registration_number}",
            f"{a.trip.origin} → {a.trip.destination}", a.assigned_at, "Driver Assignment")

    changes = db.query(models.RouteChange).filter(models.RouteChange.changed_at >= since).all()
    for c in changes:
        if driver and c.trip.driver_id != driver.id:
            continue
        add(f"route-{c.id}", "route", f"Route changed on trip #{c.trip_id}",
            c.reason or "The route was changed", c.changed_at, "Trips")

    items.sort(key=lambda i: i["at"] or "", reverse=True)
    return items[:MAX_ITEMS]
