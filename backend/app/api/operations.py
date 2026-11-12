from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.user import User
from app.models.notification import NotificationEvent
from app.models.driver import Driver
from app.models.fuel_log import FuelLog
from app.models.maintenance_record import MaintenanceRecord
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.user import User
from app.models.vehicle import Vehicle
from sqlalchemy import select
from app.services.operations import build_alerts, build_analytics

router = APIRouter(tags=["Operations"])
FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")


@router.get("/alerts")
def list_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    alerts = build_alerts(db)
    represented = {(alert["type"], alert["entity_id"]) for alert in alerts}
    persisted = db.scalars(
        select(NotificationEvent)
        .where(NotificationEvent.is_active.is_(True))
        .order_by(NotificationEvent.created_at.desc())
    ).all()
    for event in persisted:
        key = (event.type, event.entity_id)
        if key in represented:
            continue
        alerts.append({
            "id": f"notification-{event.id}",
            "type": event.type,
            "severity": event.severity,
            "title": event.title,
            "detail": event.detail,
            "entity_type": event.entity_type,
            "entity_id": event.entity_id,
            "created_at": event.created_at,
        })
        represented.add(key)
    return {"delivery": "in_app_only", "alerts": alerts}


@router.get("/analytics/summary")
def analytics_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    return build_analytics(db)


@router.get("/analytics/dashboard")
def analytics_dashboard(
    start_date: date = Query(...),
    end_date: date = Query(...),
    timezone_offset_minutes: int = Query(default=0, ge=-840, le=840),
    driver_id: int | None = Query(default=None, gt=0),
    vehicle_id: int | None = Query(default=None, gt=0),
    status: str | None = Query(default=None, pattern="^(pending|assigned|in_transit|delayed|delivered|cancelled)$"),
    q: str | None = Query(default=None, max_length=100),
    sort: str = Query(default="created_at", pattern="^(reference|driver|vehicle|origin|status|created_at|planned_at|delivered_at|delay_minutes)$"),
    sort_direction: str = Query(default="desc", pattern="^(asc|desc)$"),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=10, ge=5, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    """Return period-scoped fleet analytics and a paginated shipment ledger."""
    if end_date < start_date:
        raise HTTPException(status_code=422, detail="End date must be on or after start date")
    if (end_date - start_date).days > 366:
        raise HTTPException(status_code=422, detail="Analytics date range cannot exceed 367 days")
    offset = timedelta(minutes=timezone_offset_minutes)
    start = datetime.combine(start_date, time.min, tzinfo=timezone.utc) - offset
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=timezone.utc) - offset
    period_days = (end_date - start_date).days + 1
    bucket_mode = "day" if period_days <= 45 else "week"

    shipment_query = select(Shipment).where(Shipment.created_at >= start, Shipment.created_at < end)
    if driver_id is not None:
        shipment_query = shipment_query.where(Shipment.driver_id == driver_id)
    if vehicle_id is not None:
        shipment_query = shipment_query.where(Shipment.vehicle_id == vehicle_id)
    if status:
        shipment_query = shipment_query.where(Shipment.status == status)
    table_query = shipment_query
    if q and q.strip():
        term = f"%{q.strip()}%"
        matching_drivers = select(Driver.id).join(User, User.id == Driver.user_id).where(User.full_name.ilike(term))
        matching_vehicles = select(Vehicle.id).where(Vehicle.registration_number.ilike(term))
        table_query = table_query.where(or_(Shipment.tracking_number.ilike(term), Shipment.origin.ilike(term), Shipment.destination.ilike(term), Shipment.driver_id.in_(matching_drivers), Shipment.vehicle_id.in_(matching_vehicles)))
    shipments = db.scalars(shipment_query.order_by(Shipment.created_at.desc(), Shipment.id.desc())).all()
    table_shipments = db.scalars(table_query.order_by(Shipment.created_at.desc(), Shipment.id.desc())).all()
    shipment_ids = [item.id for item in shipments]
    driver_vehicle_ids = set()
    if driver_id is not None:
        driver_vehicle_ids.update(db.scalars(select(Vehicle.id).where(Vehicle.assigned_driver_id == driver_id)).all())
        driver_vehicle_ids.update(value for value in db.scalars(select(Shipment.vehicle_id).where(
            Shipment.driver_id == driver_id, Shipment.vehicle_id.is_not(None)
        )).all() if value is not None)

    def bucket_key(value):
        value = (value + offset).date() if isinstance(value, datetime) else value
        if bucket_mode == "week":
            value -= timedelta(days=value.weekday())
        return value.isoformat()

    first_bucket = start_date
    if bucket_mode == "week":
        first_bucket -= timedelta(days=first_bucket.weekday())
    buckets = []
    cursor = first_bucket
    while cursor <= end_date:
        buckets.append(cursor.isoformat())
        cursor += timedelta(days=7 if bucket_mode == "week" else 1)
    trend = {key: {"date": key, "created": 0, "delivered": 0, "delayed": 0} for key in buckets}
    timeliness_buckets = {key: {"date": key, "on_time": 0, "late": 0, "failed": 0} for key in buckets}
    for shipment in shipments:
        key = bucket_key(shipment.created_at)
        if key in trend:
            trend[key]["created"] += 1
    status_counts = {}
    for shipment in shipments:
        status_counts[shipment.status] = status_counts.get(shipment.status, 0) + 1

    histories = db.scalars(select(ShipmentStatusHistory).where(
        ShipmentStatusHistory.shipment_id.in_(shipment_ids),
        ShipmentStatusHistory.changed_at >= start,
        ShipmentStatusHistory.changed_at < end,
        ShipmentStatusHistory.status.in_(("delivered", "delayed")),
    ).order_by(ShipmentStatusHistory.changed_at, ShipmentStatusHistory.id)).all() if shipment_ids else []
    delivered_by_shipment = {}
    shipments_by_id = {item.id: item for item in shipments}
    on_time_count = 0
    on_time_samples = 0
    late_samples = 0
    driver_metrics = {}
    for event in histories:
        key = bucket_key(event.changed_at)
        if key in trend:
            trend[key][event.status] += 1
        shipment = shipments_by_id.get(event.shipment_id)
        if shipment is None:
            continue
        if event.status == "delivered":
            delivered_by_shipment[event.shipment_id] = event.changed_at
            if shipment.estimated_arrival is not None:
                expected = shipment.estimated_arrival
                actual = event.changed_at
                expected = expected.replace(tzinfo=timezone.utc) if expected.tzinfo is None else expected.astimezone(timezone.utc)
                actual = actual.replace(tzinfo=timezone.utc) if actual.tzinfo is None else actual.astimezone(timezone.utc)
                on_time_samples += 1
                is_on_time = actual <= expected
                on_time_count += int(is_on_time)
                late_samples += int(actual > expected)
                if key in timeliness_buckets:
                    timeliness_buckets[key]["on_time" if is_on_time else "late"] += 1
            if shipment.driver_id:
                metric = driver_metrics.setdefault(shipment.driver_id, {"delivered": 0, "on_time": 0, "samples": 0, "exceptions": 0})
                metric["delivered"] += 1
                if shipment.estimated_arrival is not None:
                    metric["samples"] += 1
                    metric["on_time"] += int(actual <= expected)
        elif event.status == "delayed" and shipment.driver_id:
            driver_metrics.setdefault(shipment.driver_id, {"delivered": 0, "on_time": 0, "samples": 0, "exceptions": 0})["exceptions"] += 1

    driver_rows = db.execute(select(Driver.id, User.full_name, Driver.attendance_status).join(User, User.id == Driver.user_id).order_by(User.full_name)).all()
    drivers = [{"id": row.id, "name": row.full_name, "attendance_status": row.attendance_status} for row in driver_rows]
    vehicles = db.scalars(select(Vehicle).order_by(Vehicle.registration_number)).all()
    vehicle_options = [{"id": row.id, "name": row.registration_number} for row in vehicles]
    vehicle_activity = {}
    for shipment in shipments:
        if shipment.vehicle_id is not None:
            vehicle_activity[shipment.vehicle_id] = vehicle_activity.get(shipment.vehicle_id, 0) + 1
    vehicle_chart = [{"vehicle_id": v.id, "label": v.registration_number, "shipments": vehicle_activity.get(v.id, 0)} for v in vehicles
        if (vehicle_id is None or v.id == vehicle_id) and (driver_id is None or v.id in driver_vehicle_ids)]
    driver_chart = []
    for row in driver_rows:
        metrics = driver_metrics.get(row.id, {"delivered": 0, "on_time": 0, "samples": 0, "exceptions": 0})
        if driver_id is not None and row.id != driver_id:
            continue
        driver_chart.append({"driver_id": row.id, "label": row.full_name, **metrics,
            "on_time_rate": round(metrics["on_time"] * 100 / metrics["samples"], 1) if metrics["samples"] >= 5 else None})

    fuel_query = select(FuelLog).where(FuelLog.logged_at >= start, FuelLog.logged_at < end)
    if vehicle_id is not None:
        fuel_query = fuel_query.where(FuelLog.vehicle_id == vehicle_id)
    if driver_id is not None:
        fuel_query = fuel_query.where(FuelLog.vehicle_id.in_(driver_vehicle_ids)) if driver_vehicle_ids else fuel_query.where(FuelLog.vehicle_id == -1)
    fuel_logs = db.scalars(fuel_query.order_by(FuelLog.logged_at, FuelLog.id)).all()
    fuel_buckets = {key: {"date": key, "liters": 0.0, "cost": 0.0} for key in buckets}
    for log in fuel_logs:
        key = bucket_key(log.logged_at)
        if key in fuel_buckets:
            fuel_buckets[key]["liters"] += float(log.liters)
            fuel_buckets[key]["cost"] += float(log.total_cost)
    maintenance_query = select(MaintenanceRecord).where(MaintenanceRecord.service_date >= start, MaintenanceRecord.service_date < end)
    if vehicle_id is not None:
        maintenance_query = maintenance_query.where(MaintenanceRecord.vehicle_id == vehicle_id)
    if driver_id is not None:
        maintenance_query = maintenance_query.where(MaintenanceRecord.vehicle_id.in_(driver_vehicle_ids)) if driver_vehicle_ids else maintenance_query.where(MaintenanceRecord.vehicle_id == -1)
    maintenance_records = db.scalars(maintenance_query.order_by(MaintenanceRecord.service_date, MaintenanceRecord.id)).all()
    maintenance_buckets = {key: {"date": key, "events": 0, "cost": 0.0} for key in buckets}
    for record in maintenance_records:
        key = bucket_key(record.service_date)
        if key in maintenance_buckets:
            maintenance_buckets[key]["events"] += 1
            maintenance_buckets[key]["cost"] += float(record.cost or 0)

    total = len(shipments)
    previous_start = start - timedelta(days=period_days)
    previous_query = select(func.count()).select_from(Shipment).where(Shipment.created_at >= previous_start, Shipment.created_at < start)
    if driver_id is not None:
        previous_query = previous_query.where(Shipment.driver_id == driver_id)
    if vehicle_id is not None:
        previous_query = previous_query.where(Shipment.vehicle_id == vehicle_id)
    if status:
        previous_query = previous_query.where(Shipment.status == status)
    previous_shipments = db.scalar(previous_query) or 0
    delivered = status_counts.get("delivered", 0)
    active_vehicles = sum(1 for vehicle in vehicles if vehicle.status == "active")
    active_drivers = sum(1 for row in driver_rows if row.attendance_status == "present")
    delayed = status_counts.get("delayed", 0)
    table_rows = []
    for shipment in table_shipments:
        delivered_at = delivered_by_shipment.get(shipment.id) or shipment.actual_arrival
        delay_minutes = None
        if delivered_at and shipment.estimated_arrival:
            actual = delivered_at.replace(tzinfo=timezone.utc) if delivered_at.tzinfo is None else delivered_at.astimezone(timezone.utc)
            expected = shipment.estimated_arrival.replace(tzinfo=timezone.utc) if shipment.estimated_arrival.tzinfo is None else shipment.estimated_arrival.astimezone(timezone.utc)
            delay_minutes = max(0, round((actual - expected).total_seconds() / 60, 1))
        table_rows.append({"id": shipment.id, "reference": shipment.tracking_number,
            "driver": next((row.full_name for row in driver_rows if row.id == shipment.driver_id), None),
            "vehicle": next((row.registration_number for row in vehicles if row.id == shipment.vehicle_id), None),
            "origin": shipment.origin, "destination": shipment.destination, "status": shipment.status,
            "created_at": shipment.created_at, "planned_at": shipment.estimated_arrival,
            "delivered_at": delivered_at, "delay_minutes": delay_minutes})
    sort_values = [row for row in table_rows if row[sort] is not None]
    missing_values = [row for row in table_rows if row[sort] is None]
    sort_values.sort(key=lambda row: row[sort], reverse=sort_direction == "desc")
    table_rows = sort_values + missing_values
    total_pages = max(1, (len(table_rows) + page_size - 1) // page_size)
    page_rows = table_rows[(page - 1) * page_size:page * page_size]
    return {
        "period": {"start": start_date.isoformat(), "end": end_date.isoformat(), "bucket": bucket_mode},
        "filters": {"driver_id": driver_id, "vehicle_id": vehicle_id, "status": status},
        "kpis": {"shipments": total, "delivered": delivered, "in_transit": status_counts.get("in_transit", 0),
            "previous_shipments": previous_shipments,
            "shipments_change_percent": round((total - previous_shipments) * 100 / previous_shipments, 1) if previous_shipments else None,
            "delayed": delayed, "on_time_rate": round(on_time_count * 100 / on_time_samples, 1) if on_time_samples else None,
            "on_time_sample_size": on_time_samples, "active_vehicles": active_vehicles, "active_drivers": active_drivers,
            "maintenance_alerts": sum(1 for a in build_alerts(db) if a["type"].startswith("maintenance_")),
            "fuel_liters": round(sum(x["liters"] for x in fuel_buckets.values()), 2),
            "fuel_cost": round(sum(x["cost"] for x in fuel_buckets.values()), 2),
            "distance_km": None, "distance_reason": "No validated trip or odometer distance aggregation is available for this reporting period.",
            "utilization": None, "utilization_reason": "Assignment duration and vehicle operating-time history are not recorded."},
        "shipment_status": [{"status": key, "count": value} for key, value in status_counts.items()],
        "shipment_trend": list(trend.values()),
        "timeliness": {"on_time": on_time_count, "late": late_samples, "failed": 0, "sample_size": on_time_samples,
            "definition": "Delivery status-event time compared with the shipment's saved estimated arrival; missing ETA excluded. Failed delivery status is not tracked."},
        "timeliness_trend": list(timeliness_buckets.values()),
        "vehicle_activity": vehicle_chart, "driver_performance": driver_chart,
        "fuel_trend": list(fuel_buckets.values()), "fuel_available": bool(fuel_logs),
        "maintenance_trend": list(maintenance_buckets.values()), "maintenance_events": len(maintenance_records),
        "maintenance_cost": round(sum(float(r.cost or 0) for r in maintenance_records), 2),
        "drivers": drivers, "vehicles": vehicle_options,
        "table": {"rows": page_rows, "page": page, "page_size": page_size, "total": len(table_rows), "pages": total_pages},
        "insights": ([f"{delayed} of {total} shipments in this period are currently delayed."] if delayed else []) +
            ([f"{on_time_samples} deliveries had ETA data; {round(on_time_count * 100 / on_time_samples, 1)}% were delivered on time."] if on_time_samples else []) +
            ([f"{len(maintenance_records)} maintenance events recorded, totaling {sum(float(r.cost or 0) for r in maintenance_records):.2f} in recorded costs."] if maintenance_records else []),
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }
