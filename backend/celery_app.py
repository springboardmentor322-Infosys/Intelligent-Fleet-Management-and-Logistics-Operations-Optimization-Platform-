"""Celery application and the Beat schedule (Milestone 3, Task 7).

Redis (REDIS_URL in backend/.env) is the message broker. Start with:
    celery -A celery_app worker --loglevel=info --pool=solo      (Windows needs --pool=solo)
    celery -A celery_app beat --loglevel=info
See CELERY.md. Set CELERY_BEAT_FAST=1 to run the schedule every 30 seconds while testing.
"""
import os

from celery import Celery
from celery.schedules import crontab
from dotenv import load_dotenv

load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

app = Celery("fleetflow", broker=REDIS_URL, include=["tasks"])
app.conf.update(
    timezone=os.getenv("CELERY_TIMEZONE", "Asia/Kolkata"),
    enable_utc=True,
    task_acks_late=True,           # a task is only taken off the queue once it has finished
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
)

if os.getenv("CELERY_BEAT_FAST") == "1":
    # Testing only: everything every 30 seconds so the result is visible straight away.
    _every = 30.0
    app.conf.beat_schedule = {
        "maintenance-check": {"task": "tasks.check_maintenance", "schedule": _every},
        "maintenance-notifications": {"task": "tasks.notify_maintenance", "schedule": _every},
        "analytics-refresh": {"task": "tasks.refresh_analytics", "schedule": _every},
    }
else:
    app.conf.beat_schedule = {
        # Maintenance dates are checked every morning, then the notifications are produced.
        "maintenance-check": {"task": "tasks.check_maintenance", "schedule": crontab(hour=6, minute=0)},
        "maintenance-notifications": {"task": "tasks.notify_maintenance", "schedule": crontab(hour=6, minute=5)},
        # Reports every Monday morning.
        "maintenance-report": {"task": "tasks.generate_maintenance_report",
                               "schedule": crontab(day_of_week=1, hour=7, minute=0)},
        "fuel-report": {"task": "tasks.generate_fuel_report",
                        "schedule": crontab(day_of_week=1, hour=7, minute=10)},
        # Fleet analytics snapshot every hour.
        "analytics-refresh": {"task": "tasks.refresh_analytics", "schedule": crontab(minute=0)},
    }
