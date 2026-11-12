from collections import defaultdict
from itertools import combinations
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.driver import Driver
from app.models.fuel_log import FuelLog
from app.models.maintenance_record import MaintenanceRecord
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.user import User
from app.models.vehicle import Vehicle

ACTIVE_SHIPMENT_STATUSES = ("assigned", "in_transit", "delayed")
OPEN_SHIPMENT_STATUSES = ("pending", "assigned", "in_transit", "delayed")


def utc_datetime(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def latest_completed_maintenance(db: Session) -> list[MaintenanceRecord]:
    records = db.scalars(
        select(MaintenanceRecord)
        .where(MaintenanceRecord.status == "completed")
        .order_by(MaintenanceRecord.service_date.desc(), MaintenanceRecord.id.desc())
    ).all()
    latest = {}
    for record in records:
        latest.setdefault(record.vehicle_id, record)
    return list(latest.values())


def overlapping_shipment_ids(group: list[Shipment]) -> list[int]:
    involved = set()
    for first, second in combinations(group, 2):
        first_start, first_end = first.scheduled_departure, first.estimated_arrival
        second_start, second_end = second.scheduled_departure, second.estimated_arrival
        if all((first_start, first_end, second_start, second_end)):
            first_start, first_end = utc_datetime(first_start), utc_datetime(first_end)
            second_start, second_end = utc_datetime(second_start), utc_datetime(second_end)
            if first_start >= second_end or second_start >= first_end:
                continue
        involved.update((first.id, second.id))
    return sorted(involved)


def maintenance_due_summary(db: Session, now: datetime | None = None) -> dict:
    now = utc_datetime(now or datetime.now(timezone.utc))
    horizon = now + timedelta(days=30)
    records = latest_completed_maintenance(db)
    overdue = [r for r in records if r.next_due_date and utc_datetime(r.next_due_date) < now]
    upcoming = [r for r in records if r.next_due_date and now <= utc_datetime(r.next_due_date) <= horizon]
    scheduled = db.scalar(
        select(func.count()).select_from(MaintenanceRecord).where(
            MaintenanceRecord.status == "scheduled",
            MaintenanceRecord.service_date >= now,
            MaintenanceRecord.service_date <= horizon,
        )
    ) or 0
    return {
        "overdue": len(overdue),
        "upcoming": len(upcoming),
        "scheduled_next_30_days": scheduled,
        "next_due_records": overdue + upcoming,
    }


def build_alerts(db: Session, now: datetime | None = None) -> list[dict]:
    now = utc_datetime(now or datetime.now(timezone.utc))
    horizon = now + timedelta(days=30)
    alerts: list[dict] = []
    shipments = db.scalars(select(Shipment).order_by(Shipment.id)).all()
    vehicles = {v.id: v for v in db.scalars(select(Vehicle)).all()}
    drivers = {d.id: d for d in db.scalars(select(Driver)).all()}

    for shipment in shipments:
        if shipment.status not in OPEN_SHIPMENT_STATUSES:
            continue
        if shipment.vehicle_id is None or shipment.driver_id is None:
            missing = []
            if shipment.vehicle_id is None:
                missing.append("vehicle")
            if shipment.driver_id is None:
                missing.append("driver")
            alerts.append({
                "id": f"unassigned-shipment-{shipment.id}",
                "type": "unassigned_shipment",
                "severity": "warning",
                "title": "Shipment assignment incomplete",
                "detail": f"{shipment.tracking_number} has no assigned {' and '.join(missing)}.",
                "entity_type": "shipment",
                "entity_id": shipment.id,
            })
        if shipment.estimated_arrival and utc_datetime(shipment.estimated_arrival) < now:
            alerts.append({
                "id": f"overdue-shipment-{shipment.id}",
                "type": "overdue_shipment",
                "severity": "critical",
                "title": "Shipment is past its estimated arrival",
                "detail": f"{shipment.tracking_number} has an ETA earlier than now and is still {shipment.status.replace('_', ' ')}.",
                "entity_type": "shipment",
                "entity_id": shipment.id,
            })
        elif shipment.scheduled_departure and utc_datetime(shipment.scheduled_departure) < now and shipment.status in ("pending", "assigned"):
            alerts.append({
                "id": f"missed-departure-{shipment.id}",
                "type": "delayed_departure",
                "severity": "warning",
                "title": "Scheduled shipment departure has passed",
                "detail": f"{shipment.tracking_number} has not entered transit after its scheduled departure.",
                "entity_type": "shipment",
                "entity_id": shipment.id,
            })
        if shipment.vehicle_id in vehicles and vehicles[shipment.vehicle_id].status == "maintenance":
            alerts.append({
                "id": f"vehicle-maintenance-assignment-{shipment.id}",
                "type": "assignment_conflict",
                "severity": "critical",
                "title": "Shipment uses a vehicle in maintenance",
                "detail": f"{shipment.tracking_number} is assigned to {vehicles[shipment.vehicle_id].registration_number}, which is marked for maintenance.",
                "entity_type": "shipment",
                "entity_id": shipment.id,
            })
        driver = drivers.get(shipment.driver_id)
        if shipment.status in ACTIVE_SHIPMENT_STATUSES and driver and driver.license_expiry:
            if utc_datetime(driver.license_expiry) < now:
                alerts.append({
                    "id": f"expired-driver-license-{shipment.id}",
                    "type": "assignment_conflict",
                    "severity": "critical",
                    "title": "Active shipment has an expired driver license",
                    "detail": f"{shipment.tracking_number} is assigned to driver {driver.id}, whose recorded license expiry has passed.",
                    "entity_type": "shipment",
                    "entity_id": shipment.id,
                })

    vehicle_groups: dict[int, list[Shipment]] = defaultdict(list)
    driver_groups: dict[int, list[Shipment]] = defaultdict(list)
    for shipment in shipments:
        if shipment.status not in ACTIVE_SHIPMENT_STATUSES:
            continue
        if shipment.vehicle_id is not None:
            vehicle_groups[shipment.vehicle_id].append(shipment)
        if shipment.driver_id is not None:
            driver_groups[shipment.driver_id].append(shipment)

    for vehicle_id, group in vehicle_groups.items():
        ids = overlapping_shipment_ids(group)
        if len(ids) > 1:
            vehicle = vehicles.get(vehicle_id)
            alerts.append({
                "id": f"vehicle-assignment-conflict-{vehicle_id}-{'-'.join(map(str, ids))}",
                "type": "assignment_conflict",
                "severity": "critical",
                "title": "Vehicle has multiple active shipments",
                "detail": f"{vehicle.registration_number if vehicle else f'Vehicle {vehicle_id}'} is assigned to {len(ids)} overlapping or unscheduled active shipments.",
                "entity_type": "vehicle",
                "entity_id": vehicle_id,
            })
    for driver_id, group in driver_groups.items():
        ids = overlapping_shipment_ids(group)
        if len(ids) > 1:
            alerts.append({
                "id": f"driver-assignment-conflict-{driver_id}-{'-'.join(map(str, ids))}",
                "type": "assignment_conflict",
                "severity": "critical",
                "title": "Driver has multiple active shipments",
                "detail": f"Driver {driver_id} is assigned to {len(ids)} overlapping or unscheduled active shipments.",
                "entity_type": "driver",
                "entity_id": driver_id,
            })

    for record in latest_completed_maintenance(db):
        if record.next_due_date is None:
            continue
        due = utc_datetime(record.next_due_date)
        if due > horizon:
            continue
        vehicle = vehicles.get(record.vehicle_id)
        overdue = due < now
        alerts.append({
            "id": f"maintenance-{record.id}-{'overdue' if overdue else 'upcoming'}",
            "type": "maintenance_overdue" if overdue else "maintenance_upcoming",
            "severity": "critical" if overdue else "info",
            "title": "Vehicle maintenance overdue" if overdue else "Vehicle maintenance due soon",
            "detail": f"{vehicle.registration_number if vehicle else f'Vehicle {record.vehicle_id}'}: {record.service_type} due {due.date().isoformat()}.",
            "entity_type": "maintenance",
            "entity_id": record.id,
        })
    return alerts


def build_analytics(db: Session, now: datetime | None = None) -> dict:
    vehicle_counts = dict(db.execute(
        select(Vehicle.status, func.count()).group_by(Vehicle.status)
    ).all())
    shipment_counts = dict(db.execute(
        select(Shipment.status, func.count()).group_by(Shipment.status)
    ).all())
    due = maintenance_due_summary(db, now)
    fuel_logs = db.scalars(select(FuelLog).order_by(FuelLog.vehicle_id, FuelLog.logged_at, FuelLog.id)).all()
    total_liters = sum((log.liters for log in fuel_logs), start=0)
    total_fuel_cost = sum((log.total_cost for log in fuel_logs), start=0)
    prior_full_tank: dict[int, Decimal] = {}
    accrued_liters: dict[int, Decimal] = defaultdict(Decimal)
    efficiency_liters = Decimal("0")
    efficiency_distance = Decimal("0")
    efficiency_samples = 0
    for log in fuel_logs:
        accrued_liters[log.vehicle_id] += log.liters
        if log.is_full_tank:
            previous_odometer = prior_full_tank.get(log.vehicle_id)
            if previous_odometer is not None and log.odometer_km > previous_odometer:
                efficiency_liters += accrued_liters[log.vehicle_id]
                efficiency_distance += log.odometer_km - previous_odometer
                efficiency_samples += 1
            prior_full_tank[log.vehicle_id] = log.odometer_km
            accrued_liters[log.vehicle_id] = Decimal("0")

    delivered_events = db.execute(
        select(Shipment, ShipmentStatusHistory.changed_at)
        .join(ShipmentStatusHistory, ShipmentStatusHistory.shipment_id == Shipment.id)
        .where(ShipmentStatusHistory.status == "delivered", Shipment.driver_id.is_not(None))
    ).all()
    driver_rows = db.execute(
        select(Driver, User).join(User, Driver.user_id == User.id).order_by(Driver.id)
    ).all()
    performance = {}
    for driver, user in driver_rows:
        events = [(shipment, changed_at) for shipment, changed_at in delivered_events if shipment.driver_id == driver.id]
        with_eta = [
            (shipment, changed_at) for shipment, changed_at in events
            if shipment.estimated_arrival is not None
        ]
        on_time = sum(
            1 for shipment, changed_at in with_eta
            if utc_datetime(changed_at) <= utc_datetime(shipment.estimated_arrival)
        )
        performance[driver.id] = {
            "driver_id": driver.id,
            "driver_name": user.full_name,
            "delivered_count": len(events),
            "on_time_delivery_count": on_time,
            "on_time_delivery_rate": round(on_time / len(with_eta) * 100, 1) if with_eta else None,
            "on_time_sample_size": len(with_eta),
            "formula": "delivered status-event time <= saved estimated_arrival; excludes deliveries without a saved ETA",
        }
    return {
        "vehicles_by_status": vehicle_counts,
        "shipments_by_status": shipment_counts,
        "delivery_performance": {
            "available": bool(delivered_events),
            "delivered_count": shipment_counts.get("delivered", 0),
            "deliveries_with_history": len(delivered_events),
            "on_time_count": sum(item["on_time_delivery_count"] for item in performance.values()),
            "on_time_sample_size": sum(item["on_time_sample_size"] for item in performance.values()),
            "on_time_rate": (
                round(sum(item["on_time_delivery_count"] for item in performance.values()) /
                      sum(item["on_time_sample_size"] for item in performance.values()) * 100, 1)
                if sum(item["on_time_sample_size"] for item in performance.values()) else None
            ),
            "reason": None if delivered_events else "No delivery history events are recorded yet.",
            "formula": "delivered status-event time <= saved estimated_arrival; deliveries without an ETA are excluded",
        },
        "driver_performance": list(performance.values()),
        "maintenance": {
            "overdue": due["overdue"],
            "upcoming_next_30_days": due["upcoming"],
            "scheduled_next_30_days": due["scheduled_next_30_days"],
        },
        "vehicle_utilization": {
            "available": False,
            "reason": "The database has no assignment start/end history or operating-time data.",
        },
        "driver_utilization": {
            "available": False,
            "reason": "The database has no driver assignment duration or working-time data.",
        },
        "fuel_reporting": {
            "available": bool(fuel_logs),
            "log_count": len(fuel_logs),
            "total_liters_logged": float(total_liters),
            "total_cost_logged": float(total_fuel_cost),
            "full_tank_liters_per_100km": (
                round(float(efficiency_liters / efficiency_distance * 100), 2)
                if efficiency_distance > 0 else None
            ),
            "efficiency_sample_count": efficiency_samples,
            "formula": "sum of liters logged between full-tank readings / odometer distance between those readings × 100",
            "reason": None if fuel_logs else "No fuel logs are recorded yet.",
        },
    }
