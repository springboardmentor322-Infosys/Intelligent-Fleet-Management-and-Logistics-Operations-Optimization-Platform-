from datetime import date, datetime, timedelta

from celery_app import celery_app
from database import SessionLocal
from models import (
    Maintenance,
    Notification,
    Vehicle,
    FuelLog,
    Trip,
)


def create_notification(db, vehicle_id, title, message, notification_type):
    """Prevent duplicate notifications on the same day."""

    start_of_day = datetime.combine(date.today(), datetime.min.time())

    existing = db.query(Notification).filter(
        Notification.vehicle_id == vehicle_id,
        Notification.title == title,
        Notification.message == message,
        Notification.created_at >= start_of_day
    ).first()

    if existing:
        return

    notification = Notification(
        vehicle_id=vehicle_id,
        title=title,
        message=message,
        notification_type=notification_type
    )

    db.add(notification)


@celery_app.task(
    name="tasks.check_maintenance_schedules",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3
)
def check_maintenance_schedules():
    db = SessionLocal()

    try:
        today = date.today()
        upcoming_limit = today + timedelta(days=7)

        records = db.query(Maintenance).filter(
            Maintenance.due_date <= upcoming_limit,
            Maintenance.status.notin_(["Completed", "Cancelled"])
        ).all()

        notifications_created = 0

        for record in records:
            vehicle = db.query(Vehicle).filter(
                Vehicle.id == record.vehicle_id
            ).first()

            vehicle_number = (
                vehicle.vehicle_number if vehicle else "Unknown vehicle"
            )

            if record.due_date < today:
                title = "Maintenance Overdue"
                message = (
                    f"Vehicle {vehicle_number}: "
                    f"{record.service_type} maintenance is overdue. "
                    f"Due date: {record.due_date}."
                )
                notification_type = "Warning"

            else:
                title = "Upcoming Maintenance"
                message = (
                    f"Vehicle {vehicle_number}: "
                    f"{record.service_type} maintenance is due on "
                    f"{record.due_date}."
                )
                notification_type = "Reminder"

            existing = db.query(Notification).filter(
                Notification.vehicle_id == record.vehicle_id,
                Notification.title == title,
                Notification.message == message,
                Notification.created_at >= datetime.combine(
                    today, datetime.min.time()
                )
            ).first()

            if not existing:
                create_notification(
                    db,
                    record.vehicle_id,
                    title,
                    message,
                    notification_type
                )
                notifications_created += 1

        db.commit()

        return {
            "status": "success",
            "checked_records": len(records),
            "notifications_created": notifications_created,
            "checked_on": str(today)
        }

    finally:
        db.close()


@celery_app.task(
    name="tasks.generate_maintenance_report",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3
)
def generate_maintenance_report():
    db = SessionLocal()

    try:
        today = date.today()

        total = db.query(Maintenance).count()

        scheduled = db.query(Maintenance).filter(
            Maintenance.status == "Scheduled"
        ).count()

        in_progress = db.query(Maintenance).filter(
            Maintenance.status == "In Progress"
        ).count()

        completed = db.query(Maintenance).filter(
            Maintenance.status == "Completed"
        ).count()

        overdue = db.query(Maintenance).filter(
            Maintenance.due_date < today,
            Maintenance.status.notin_(["Completed", "Cancelled"])
        ).count()

        return {
            "status": "success",
            "report": "Maintenance Summary",
            "generated_on": str(today),
            "total_records": total,
            "scheduled": scheduled,
            "in_progress": in_progress,
            "completed": completed,
            "overdue": overdue
        }

    finally:
        db.close()


@celery_app.task(
    name="tasks.generate_fuel_report",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3
)
def generate_fuel_report():
    db = SessionLocal()

    try:
        total_records = db.query(FuelLog).count()

        total_quantity = db.query(
            __import__("sqlalchemy").func.sum(FuelLog.quantity)
        ).scalar() or 0

        total_cost = db.query(
            __import__("sqlalchemy").func.sum(FuelLog.cost)
        ).scalar() or 0

        return {
            "status": "success",
            "report": "Fuel Consumption Summary",
            "generated_on": str(date.today()),
            "total_fuel_records": total_records,
            "total_quantity": round(float(total_quantity), 2),
            "total_fuel_cost": round(float(total_cost), 2)
        }

    finally:
        db.close()


@celery_app.task(
    name="tasks.update_fleet_analytics",
    autoretry_for=(Exception,),
    retry_backoff=True,
    max_retries=3
)
def update_fleet_analytics():
    db = SessionLocal()

    try:
        total_vehicles = db.query(Vehicle).count()

        available_vehicles = db.query(Vehicle).filter(
            Vehicle.status == "Available"
        ).count()

        total_trips = db.query(Trip).count()

        active_trips = db.query(Trip).filter(
            Trip.status == "In Progress"
        ).count()

        total_fuel_cost = db.query(
            __import__("sqlalchemy").func.sum(FuelLog.cost)
        ).scalar() or 0

        return {
            "status": "success",
            "generated_on": str(datetime.now()),
            "total_vehicles": total_vehicles,
            "available_vehicles": available_vehicles,
            "total_trips": total_trips,
            "active_trips": active_trips,
            "total_fuel_cost": round(float(total_fuel_cost), 2)
        }

    finally:
        db.close()