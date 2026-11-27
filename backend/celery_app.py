
import os
from dotenv import load_dotenv
from celery import Celery
from celery.schedules import crontab

load_dotenv()

# Render Redis URL when deployed; preserve local Redis configuration.
REDIS_URL = os.getenv("REDIS_URL")

broker_url = REDIS_URL or "redis://localhost:6379/0"
result_backend = REDIS_URL or "redis://localhost:6379/1"

celery_app = Celery(
    "fleetflow",
    broker=broker_url,
    backend=result_backend,
    include=["tasks"]
)

celery_app.conf.update(
    timezone="Asia/Kolkata",
    enable_utc=True,
    task_track_started=True,
    broker_connection_retry_on_startup=True,
    result_expires=3600,
    beat_schedule={
        "daily-maintenance-check": {
            "task": "tasks.check_maintenance_schedules",
            "schedule": crontab(hour=8, minute=0),
        },
        "daily-maintenance-report": {
            "task": "tasks.generate_maintenance_report",
            "schedule": crontab(hour=8, minute=30),
        },
        "weekly-fuel-report": {
            "task": "tasks.generate_fuel_report",
            "schedule": crontab(
                day_of_week="monday",
                hour=9,
                minute=0
            ),
        },
        "fleet-analytics-update": {
            "task": "tasks.update_fleet_analytics",
            "schedule": crontab(hour="*/6", minute=0),
        },
    },
)
