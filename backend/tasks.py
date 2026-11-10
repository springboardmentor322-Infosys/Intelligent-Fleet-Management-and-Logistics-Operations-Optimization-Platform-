"""Background jobs (Milestone 3, Task 7). They reuse the same functions the API uses, so a job
and a page can never disagree. Each job opens and closes its own database session.

A database problem (connection lost, server restarting) is retried up to 3 times with a growing
delay. Any other error is not retried: it fails visibly in the worker log.
"""
import json
import logging
import os
from datetime import date, datetime, timezone
from pathlib import Path

from sqlalchemy.exc import InterfaceError, OperationalError

import analytics
import exports
import fuel
import maintenance
import maintenance_rules
from celery_app import REDIS_URL, app
from database import SessionLocal

log = logging.getLogger(__name__)
REPORT_DIR = Path(os.getenv("REPORT_DIR", Path(__file__).parent / "reports"))
ANALYTICS_KEY = "fleetflow:analytics:fleet-performance"

DB_RETRY = dict(autoretry_for=(OperationalError, InterfaceError), retry_backoff=True,
                retry_backoff_max=300, retry_kwargs={"max_retries": 3})


def _save(name, data):
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / name
    path.write_bytes(data)
    return str(path)


@app.task(name="tasks.ping")
def ping():
    """Proves a worker is running and connected to Redis."""
    return "pong"


@app.task(name="tasks.check_maintenance", **DB_RETRY)
def check_maintenance():
    """Create, escalate and resolve maintenance alerts from the scheduled dates."""
    db = SessionLocal()
    try:
        changed = maintenance.sync_alerts(db)
        db.commit()
        log.info("maintenance check: %s alert(s) changed", changed)
        return {"changed": changed}
    finally:
        db.close()


@app.task(name="tasks.notify_maintenance", **DB_RETRY)
def notify_maintenance():
    """List the vehicles that are approaching or past their service date.

    Notifications are written to the worker log and returned. Delivering them to users (in-app
    notification centre, email, SMS) belongs to the notifications module, which is not built yet.
    """
    db = SessionLocal()
    try:
        maintenance.sync_alerts(db)
        db.commit()
        alerts = db.query(maintenance.models.MaintenanceAlert).filter(
            maintenance.models.MaintenanceAlert.category.in_(("Upcoming", "Overdue"))).all()
        out = [{"vehicle": a.maintenance.vehicle.registration_number, "type": a.maintenance.category,
                "due": str(a.maintenance.scheduled_date), "alert": a.category} for a in alerts]
        for n in out:
            log.warning("MAINTENANCE %s: %s %s due %s", n["alert"].upper(), n["vehicle"], n["type"], n["due"])
        return out
    finally:
        db.close()


@app.task(name="tasks.generate_maintenance_report", **DB_RETRY)
def generate_maintenance_report():
    """Excel report of all maintenance records, saved in backend/reports/."""
    db = SessionLocal()
    try:
        records = maintenance.filtered(db)
        summary = maintenance_rules.summarize(maintenance.report_rows(records), date.today())
        rows = [maintenance.export_row(maintenance.record_out(m)) for m in records]
        path = _save(f"maintenance-report-{date.today()}.xlsx", maintenance.build_xlsx(rows, summary))
        log.info("maintenance report written: %s", path)
        return path
    finally:
        db.close()


@app.task(name="tasks.generate_fuel_report", **DB_RETRY)
def generate_fuel_report():
    """Excel report of all fuel records, saved in backend/reports/."""
    db = SessionLocal()
    try:
        records = fuel.filtered(db, None, None, None, None)
        s = fuel.analytics_for(db, records, None, None)
        cols = ["Date", "Vehicle", "Fuel type", "Litres", "Price/litre", "Total cost"]
        rows = [[str(r.fueled_on), r.vehicle.registration_number, r.fuel_type,
                 r.quantity_litres, r.price_per_litre, r.total_cost] for r in records]
        f = s["fleet"]
        footer = [[f"Records: {f['records']}"], [f"Litres: {f['litres']}"], [f"Total cost: {f['cost']}"]]
        path = _save(f"fuel-report-{date.today()}.xlsx", exports.to_xlsx("Fuel", cols, rows, footer))
        log.info("fuel report written: %s", path)
        return path
    finally:
        db.close()


@app.task(name="tasks.refresh_analytics", **DB_RETRY)
def refresh_analytics():
    """Calculate the fleet performance numbers (no filters) and keep the latest copy in Redis.

    The dashboard still calculates live for its filters; this snapshot is for reports and any
    consumer that wants the latest numbers without querying the database.
    """
    import redis

    db = SessionLocal()
    try:
        data = analytics.fleet_performance(
            start=None, end=None, vehicle=None, driver_id=None, status=None, _=None, db=db)
    finally:
        db.close()
    payload = {"calculated_at": datetime.now(timezone.utc).isoformat(), "data": data}
    redis.Redis.from_url(REDIS_URL).set(ANALYTICS_KEY, json.dumps(payload, default=str))
    return payload["calculated_at"]
