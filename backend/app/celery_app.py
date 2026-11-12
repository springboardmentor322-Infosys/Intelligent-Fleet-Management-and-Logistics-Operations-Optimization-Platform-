from celery import Celery
from celery.schedules import crontab

from app.core.config import settings

celery_app = Celery(
    "fleetflow",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=["app.tasks.maintenance_reminders"],
)
celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    beat_schedule={
        "daily-maintenance-reminder-scan": {
            "task": "app.tasks.maintenance_reminders.scan_maintenance_reminders",
            "schedule": crontab(hour=0, minute=15),
        },
    },
)
