from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.notification import NotificationEvent
from app.services.operations import latest_completed_maintenance, utc_datetime


def refresh_maintenance_reminders(db: Session, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    horizon = now + timedelta(days=30)
    active: dict[str, dict] = {}
    for record in latest_completed_maintenance(db):
        if record.next_due_date is None:
            continue
        due = utc_datetime(record.next_due_date)
        if due > horizon:
            continue
        category = "maintenance_overdue" if due < now else "maintenance_upcoming"
        event_key = f"maintenance:{record.id}:{due.date().isoformat()}:{category}"
        active[event_key] = {
            "event_key": event_key,
            "type": category,
            "severity": "critical" if category == "maintenance_overdue" else "info",
            "title": "Vehicle maintenance overdue" if category == "maintenance_overdue" else "Vehicle maintenance due soon",
            "detail": f"Vehicle {record.vehicle_id}: {record.service_type} due {due.date().isoformat()}.",
            "entity_type": "maintenance",
            "entity_id": record.id,
        }

    existing = db.scalars(select(NotificationEvent)).all()
    by_key = {row.event_key: row for row in existing}
    for row in existing:
        row.is_active = row.event_key in active
    created = 0
    for event_key, values in active.items():
        record = by_key.get(event_key)
        if record is None:
            db.add(NotificationEvent(**values, is_active=True))
            created += 1
        else:
            for field, value in values.items():
                setattr(record, field, value)
            record.is_active = True
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return {"active_count": len(active), "created_count": created}
