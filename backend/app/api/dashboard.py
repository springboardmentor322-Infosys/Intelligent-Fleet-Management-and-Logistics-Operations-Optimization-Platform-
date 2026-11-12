
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.driver import Driver
from app.models.driver_attendance import DriverAttendanceRecord
from app.models.gps_location import GPSLocation
from app.models.maintenance_record import MaintenanceRecord
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_inspection import VehicleInspection
from app.models.trip import Trip
from app.schemas.shipment import ShipmentStatus, ShipmentUpdate
from app.services.operations import build_alerts

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


class DriverShipmentStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: ShipmentStatus

FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")
DRIVER_DASHBOARD_ROLES = (*FLEET_ROLES, "driver")


def _driver_management_rows(db: Session, driver_id: int | None = None):
    """Build the fleet driver view only from persisted driver, trip, shipment and GPS data."""
    statement = select(Driver, User).join(User, Driver.user_id == User.id).order_by(User.full_name, Driver.id)
    if driver_id is not None:
        statement = statement.where(Driver.id == driver_id)
    drivers = db.execute(statement).all()
    if not drivers:
        return []

    ids = [driver.id for driver, _ in drivers]
    trips = db.scalars(select(Trip).where(Trip.driver_id.in_(ids)).order_by(Trip.scheduled_departure.desc(), Trip.id.desc())).all()
    trips_by_driver: dict[int, list[Trip]] = {}
    for trip in trips:
        trips_by_driver.setdefault(trip.driver_id, []).append(trip)
    trip_vehicle_ids = [trip.vehicle_id for trip in trips]
    shipments = db.scalars(select(Shipment).where(Shipment.driver_id.in_(ids)).order_by(Shipment.id.desc())).all()
    shipments_by_driver: dict[int, list[Shipment]] = {}
    for shipment in shipments:
        shipments_by_driver.setdefault(shipment.driver_id, []).append(shipment)
    shipment_vehicle_ids = [shipment.vehicle_id for shipment in shipments if shipment.vehicle_id is not None]
    vehicle_condition = Vehicle.assigned_driver_id.in_(ids)
    if trip_vehicle_ids:
        vehicle_condition = vehicle_condition | Vehicle.id.in_(trip_vehicle_ids)
    if shipment_vehicle_ids:
        vehicle_condition = vehicle_condition | Vehicle.id.in_(shipment_vehicle_ids)
    vehicles = db.scalars(select(Vehicle).where(vehicle_condition)).all()
    vehicle_by_driver = {vehicle.assigned_driver_id: vehicle for vehicle in vehicles if vehicle.assigned_driver_id is not None}
    vehicle_by_id = {vehicle.id: vehicle for vehicle in vehicles}

    vehicle_ids = [vehicle.id for vehicle in vehicles]
    latest_locations = {}
    if vehicle_ids:
        ranked_locations = select(
            GPSLocation.id.label("location_id"),
            func.row_number().over(
                partition_by=GPSLocation.vehicle_id,
                order_by=(GPSLocation.recorded_at.desc(), GPSLocation.id.desc()),
            ).label("location_rank"),
        ).where(GPSLocation.vehicle_id.in_(vehicle_ids)).subquery()
        latest_locations = {point.vehicle_id: point for point in db.scalars(
            select(GPSLocation).join(ranked_locations, ranked_locations.c.location_id == GPSLocation.id)
            .where(ranked_locations.c.location_rank == 1)
        ).all()}

    result = []
    for driver, user in drivers:
        assigned_vehicle = vehicle_by_driver.get(driver.id)
        driver_trips = trips_by_driver.get(driver.id, [])
        active_trip = next((trip for trip in driver_trips if trip.status == "in_progress"), None)
        driver_shipments = shipments_by_driver.get(driver.id, [])
        active_shipments = [s for s in driver_shipments if s.status in ("assigned", "in_transit", "delayed")]
        if active_trip is not None:
            assigned_vehicle = vehicle_by_id.get(active_trip.vehicle_id) or assigned_vehicle
        if assigned_vehicle is None:
            associated_trip = active_trip or next((trip for trip in driver_trips if trip.status == "completed"), None)
            if associated_trip is not None:
                assigned_vehicle = vehicle_by_id.get(associated_trip.vehicle_id)
            if assigned_vehicle is None:
                associated_shipment = next((shipment for shipment in active_shipments if shipment.vehicle_id), None)
                if associated_shipment is not None:
                    assigned_vehicle = vehicle_by_id.get(associated_shipment.vehicle_id)
        current_trip = active_trip
        current_shipment = next((s for s in active_shipments if current_trip and s.trip_id == current_trip.id), None)
        if current_trip is None:
            current_shipment = next((s for s in active_shipments if s.status in ("in_transit", "delayed")), None)
        location = latest_locations.get(assigned_vehicle.id) if assigned_vehicle else None

        # Status is based on explicit attendance and operational records only.
        # No coordinate-based stop inference is made; the schema has no stop events.
        attendance = (driver.attendance_status or "unknown").lower()
        if not user.is_active or attendance in ("absent", "leave", "off_duty"):
            status_value = "off_duty"
        elif any(s.status == "delayed" for s in active_shipments):
            status_value = "delayed"
        elif (active_trip is not None and active_trip.status == "in_progress") or any(s.status == "in_transit" for s in active_shipments):
            status_value = "on_route"
        else:
            status_value = "available" if attendance == "present" else "unknown"

        completed_trips = [trip for trip in driver_trips if trip.status == "completed"]
        delivered = [s for s in driver_shipments if s.status == "delivered"]
        delayed_ids = set(db.scalars(select(ShipmentStatusHistory.shipment_id).where(
            ShipmentStatusHistory.shipment_id.in_([s.id for s in delivered]),
            ShipmentStatusHistory.status == "delayed",
        )).all()) if delivered else set()
        delayed_deliveries = [s for s in delivered if s.id in delayed_ids]
        on_time_sample = [s for s in delivered if s.actual_arrival and s.estimated_arrival]
        on_time = sum(1 for s in on_time_sample if
                      (s.actual_arrival.replace(tzinfo=timezone.utc) if s.actual_arrival.tzinfo is None else s.actual_arrival) <=
                      (s.estimated_arrival.replace(tzinfo=timezone.utc) if s.estimated_arrival.tzinfo is None else s.estimated_arrival))
        result.append({
            "id": driver.id, "user_id": user.id, "driver_id": driver.id,
            "full_name": user.full_name, "email": user.email, "phone": None, "photo_url": None,
            "is_active": user.is_active, "license_number": driver.license_number,
            "license_expiry": driver.license_expiry, "license_verification": None,
            "documents": [], "attendance_status": attendance, "region": None,
            "status": status_value,
            "vehicle": ({"id": assigned_vehicle.id, "vehicle_id": assigned_vehicle.vehicle_id,
                         "registration_number": assigned_vehicle.registration_number,
                         "vehicle_type": assigned_vehicle.vehicle_type, "fuel_type": assigned_vehicle.fuel_type,
                         "capacity": assigned_vehicle.capacity, "status": assigned_vehicle.status,
                         "assigned_driver_id": assigned_vehicle.assigned_driver_id}
                        if assigned_vehicle else None),
            "location": ({"latitude": float(location.latitude), "longitude": float(location.longitude),
                          "speed_kph": float(location.speed_kph) if location.speed_kph is not None else None,
                          "heading_degrees": float(location.heading_degrees) if location.heading_degrees is not None else None,
                          "device_id": location.device_id, "device_connected": location.device_connected,
                          "recorded_at": location.recorded_at, "source": location.source}
                         if location else None),
            "current_trip": ({"id": current_trip.id, "origin": current_trip.origin, "destination": current_trip.destination,
                              "status": current_trip.status, "estimated_arrival": current_trip.estimated_arrival}
                             if current_trip else None),
            "current_shipment": ({"id": current_shipment.id, "tracking_number": current_shipment.tracking_number,
                                  "origin": current_shipment.origin, "destination": current_shipment.destination,
                                  "status": current_shipment.status, "estimated_arrival": current_shipment.estimated_arrival}
                                 if current_shipment else None),
            "shipments": [{"id": s.id, "tracking_number": s.tracking_number, "origin": s.origin,
                           "destination": s.destination, "status": s.status,
                           "estimated_arrival": s.estimated_arrival, "actual_arrival": s.actual_arrival,
                           "trip_id": s.trip_id} for s in driver_shipments],
            "trips": [{"id": trip.id, "origin": trip.origin, "destination": trip.destination,
                       "status": trip.status, "scheduled_departure": trip.scheduled_departure,
                       "estimated_arrival": trip.estimated_arrival, "actual_arrival": trip.actual_arrival}
                      for trip in driver_trips],
            "next_stop": None,
            "performance": {"completed_trips": len(completed_trips), "successful_deliveries": len(delivered),
                            "delayed_deliveries": len(delayed_deliveries),
                            "on_time_delivery_rate": round(on_time * 100 / len(on_time_sample), 1) if on_time_sample else None},
        })
    return result


def _driver_dashboard_public_row(row: dict) -> dict:
    """Keep driver-role roster and profile responses to operational information."""
    return {
        **row,
        "email": None,
        "phone": None,
        "is_active": None,
        "license_number": None,
        "license_expiry": None,
        "license_verification": None,
        "documents": [],
        "location": ({**row["location"], "device_id": None} if row["location"] else None),
        "location": ({**row["location"], "device_id": None} if row["location"] else None),
        # Drivers need current operational context, not other drivers' full histories.
        "shipments": [shipment for shipment in row["shipments"] if shipment["status"] in ("assigned", "in_transit", "delayed")],
        "trips": [trip for trip in row["trips"] if trip["status"] in ("scheduled", "in_progress")],
        "performance": None,
    }


@router.get("/drivers")
def fleet_driver_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*DRIVER_DASHBOARD_ROLES)),
):
    rows = _driver_management_rows(db)
    if current_user.role == "driver":
        rows = [_driver_dashboard_public_row(row) for row in rows]
    counts = {key: sum(row["status"] == key for row in rows) for key in ("on_route", "at_stop", "delayed", "off_duty")}
    counts["total"] = len(rows)
    return {"drivers": rows, "summary": counts, "regions": []}


@router.get("/drivers/{driver_id}")
def fleet_driver_profile(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*DRIVER_DASHBOARD_ROLES)),
):
    rows = _driver_management_rows(db, driver_id)
    if not rows:
        raise HTTPException(status_code=404, detail="Driver not found")
    return _driver_dashboard_public_row(rows[0]) if current_user.role == "driver" else rows[0]


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    total_vehicles = db.scalar(
        select(func.count()).select_from(Vehicle)
    ) or 0

    active_vehicles = db.scalar(
        select(func.count()).select_from(Vehicle).where(
            Vehicle.status == "active"
        )
    ) or 0

    maintenance_vehicles = db.scalar(
        select(func.count()).select_from(Vehicle).where(
            Vehicle.status == "maintenance"
        )
    ) or 0

    assigned_driver_ids = select(Vehicle.assigned_driver_id).where(
        Vehicle.assigned_driver_id.is_not(None)
    )

    unassigned_drivers = db.scalar(
        select(func.count())
        .select_from(Driver)
        .where(~Driver.id.in_(assigned_driver_ids))
    ) or 0

    return {
        "total_vehicles": total_vehicles,
        "active_vehicles": active_vehicles,
        "maintenance_vehicles": maintenance_vehicles,
        "unassigned_drivers": unassigned_drivers,
    }


@router.get("/dispatcher")
def dispatcher_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator", "fleet_manager", "dispatcher")),
):
    """Operational dashboard backed by current fleet records."""
    now = datetime.now(timezone.utc)
    statuses = dict(db.execute(
        select(Shipment.status, func.count()).group_by(Shipment.status)
    ).all())
    shipments = db.scalars(select(Shipment).order_by(Shipment.scheduled_departure, Shipment.id)).all()
    drivers = db.execute(select(Driver, User).join(User, Driver.user_id == User.id).order_by(User.full_name)).all()
    vehicles = db.scalars(select(Vehicle).order_by(Vehicle.registration_number)).all()
    active_vehicle_ids = set(db.scalars(select(Shipment.vehicle_id).where(
        Shipment.vehicle_id.is_not(None), Shipment.status.in_(("assigned", "in_transit", "delayed"))
    )).all())
    load_by_driver = dict(db.execute(
        select(Shipment.driver_id, func.count()).where(
            Shipment.driver_id.is_not(None), Shipment.status.in_(("assigned", "in_transit", "delayed"))
        ).group_by(Shipment.driver_id)
    ).all())
    alerts = build_alerts(db, now)
    latest_inspection_ids = select(func.max(VehicleInspection.id)).group_by(VehicleInspection.vehicle_id)
    inspections = db.scalars(select(VehicleInspection).where(
        VehicleInspection.id.in_(latest_inspection_ids), VehicleInspection.result != "passed"
    ).order_by(VehicleInspection.inspected_at.desc()).limit(20)).all()
    history = db.scalars(select(ShipmentStatusHistory).order_by(
        ShipmentStatusHistory.changed_at.desc(), ShipmentStatusHistory.id.desc()
    ).limit(12)).all()
    return {
        "shipments_by_status": statuses,
        "shipments": [{"id": s.id, "tracking_number": s.tracking_number, "status": s.status,
            "origin": s.origin, "destination": s.destination, "driver_id": s.driver_id,
            "vehicle_id": s.vehicle_id, "scheduled_departure": s.scheduled_departure,
            "estimated_arrival": s.estimated_arrival} for s in shipments],
        "vehicles": [{"id": v.id, "vehicle_id": v.vehicle_id, "registration_number": v.registration_number,
            "status": v.status, "capacity": v.capacity, "assigned_driver_id": v.assigned_driver_id,
            "is_assigned": v.id in active_vehicle_ids} for v in vehicles],
        "drivers": [{"id": d.id, "full_name": u.full_name, "attendance_status": d.attendance_status,
            "active_shipments": load_by_driver.get(d.id, 0)} for d, u in drivers],
        "alerts": alerts,
        "inspection_alerts": [{"vehicle_id": i.vehicle_id, "category": i.category, "result": i.result,
            "notes": i.notes, "inspected_at": i.inspected_at} for i in inspections],
        "recent_activity": [{"shipment_id": h.shipment_id, "status": h.status, "changed_at": h.changed_at} for h in history],
    }


def _driver_for_user(db: Session, user: User) -> Driver:
    driver = db.scalar(select(Driver).where(Driver.user_id == user.id))
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver profile not found")
    return driver


@router.get("/driver")
def driver_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("driver")),
):
    driver = _driver_for_user(db, current_user)
    shipments = db.scalars(select(Shipment).where(Shipment.driver_id == driver.id).order_by(Shipment.scheduled_departure, Shipment.id)).all()
    shipment_vehicle_id = db.scalar(select(Shipment.vehicle_id).where(
        Shipment.driver_id == driver.id, Shipment.vehicle_id.is_not(None),
        Shipment.status.in_(("assigned", "in_transit", "delayed")),
    ).order_by(Shipment.scheduled_departure, Shipment.id).limit(1))
    linked_vehicle_id = shipment_vehicle_id or driver_vehicle_id(db, driver.id)
    vehicle = db.get(Vehicle, linked_vehicle_id) if linked_vehicle_id is not None else None
    shipment_ids = [s.id for s in shipments]
    histories = db.scalars(select(ShipmentStatusHistory).where(ShipmentStatusHistory.shipment_id.in_(shipment_ids)).order_by(ShipmentStatusHistory.changed_at.desc()).limit(20)).all() if shipment_ids else []
    inspections = db.scalars(select(VehicleInspection).where(VehicleInspection.vehicle_id == vehicle.id).order_by(VehicleInspection.inspected_at.desc()).limit(5)).all() if vehicle else []
    maintenance = db.scalars(select(MaintenanceRecord).where(MaintenanceRecord.vehicle_id == vehicle.id).order_by(MaintenanceRecord.next_due_date).limit(5)).all() if vehicle else []
    location = db.scalar(select(GPSLocation).where(GPSLocation.vehicle_id == vehicle.id).order_by(GPSLocation.recorded_at.desc()).limit(1)) if vehicle else None
    attendance = db.scalars(select(DriverAttendanceRecord).where(DriverAttendanceRecord.driver_id == driver.id).order_by(DriverAttendanceRecord.recorded_at.desc()).limit(10)).all()
    return {
        "driver": {"id": driver.id, "full_name": current_user.full_name, "email": current_user.email,
            "license_number": driver.license_number, "license_expiry": driver.license_expiry,
            "attendance_status": driver.attendance_status},
        "vehicle": ({"id": vehicle.id, "vehicle_id": vehicle.vehicle_id, "registration_number": vehicle.registration_number,
            "vehicle_type": vehicle.vehicle_type, "capacity": vehicle.capacity, "fuel_type": vehicle.fuel_type,
            "status": vehicle.status} if vehicle else None),
        "shipments": [{"id": s.id, "tracking_number": s.tracking_number, "origin": s.origin, "destination": s.destination,
            "cargo_description": s.cargo_description, "weight": s.weight,
            "status": s.status, "scheduled_departure": s.scheduled_departure, "estimated_arrival": s.estimated_arrival,
            "vehicle_id": s.vehicle_id} for s in shipments],
        "history": [{"shipment_id": h.shipment_id, "status": h.status, "changed_at": h.changed_at} for h in histories],
        "attendance": [{"status": a.status, "note": a.note, "recorded_at": a.recorded_at} for a in attendance],
        "inspections": [{"category": i.category, "result": i.result, "notes": i.notes, "inspected_at": i.inspected_at} for i in inspections],
        "maintenance": [{"service_type": m.service_type, "description": m.description, "next_due_date": m.next_due_date, "status": m.status} for m in maintenance],
        "location": ({"latitude": location.latitude, "longitude": location.longitude,
            "recorded_at": location.recorded_at, "source": location.source} if location else None),
        "alerts": [a for a in build_alerts(db) if a.get("entity_type") == "shipment" and a.get("entity_id") in shipment_ids],
    }


def driver_vehicle_id(db: Session, driver_id: int):
    return db.scalar(select(Vehicle.id).where(Vehicle.assigned_driver_id == driver_id).order_by(Vehicle.id).limit(1))


@router.patch("/driver/shipments/{shipment_id}")
def update_driver_shipment_status(
    shipment_id: int,
    payload: DriverShipmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("driver")),
):
    driver = _driver_for_user(db, current_user)
    shipment = db.get(Shipment, shipment_id)
    if shipment is None or shipment.driver_id != driver.id:
        raise HTTPException(status_code=404, detail="Shipment not found")
    allowed = {
        "assigned": {"in_transit"},
        "in_transit": {"delayed", "delivered"},
        "delayed": {"in_transit", "delivered"},
    }
    if payload.status not in allowed.get(shipment.status, set()):
        raise HTTPException(status_code=409, detail=f"Driver cannot change shipment status from {shipment.status} to {payload.status}")
    from app.api.shipments import update_shipment
    return update_shipment(shipment_id, ShipmentUpdate(status=payload.status), db, current_user)
