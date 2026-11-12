import logging

from sqlalchemy.exc import SQLAlchemyError

from app.celery_app import celery_app
from app.core.database import SessionLocal
from app.services.notification_jobs import refresh_maintenance_reminders

logger = logging.getLogger(__name__)


@celery_app.task(
    bind=True,
    name="app.tasks.maintenance_reminders.scan_maintenance_reminders",
    autoretry_for=(SQLAlchemyError,),
    retry_backoff=True,
    retry_jitter=True,
    max_retries=5,
)
def scan_maintenance_reminders(self):
    """Persist current overdue/upcoming reminders; repeated scans are idempotent."""
    try:
        with SessionLocal() as db:
            result = refresh_maintenance_reminders(db)
        logger.info("Maintenance reminder scan completed: %s active, %s new", result["active_count"], result["created_count"])
        return result
    except SQLAlchemyError:
        logger.exception("Maintenance reminder scan failed; Celery will retry")
        raise
