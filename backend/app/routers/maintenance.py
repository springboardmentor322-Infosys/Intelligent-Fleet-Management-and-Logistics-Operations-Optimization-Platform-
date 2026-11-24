from enum import Enum
from datetime import date, timedelta
from sqlalchemy.orm import joinedload
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.dependencies import require_roles
from app.db.dependencies import get_db
from app.models.maintenance import Maintenance
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.schemas.maintenance import (
    MaintenanceCreate,
    MaintenanceResponse,
    MaintenanceStatus,
    MaintenanceSummary,
    MaintenanceUpdate,
)
from app.schemas.user import UserRole


router = APIRouter(
    prefix="/maintenance",
    tags=["Maintenance"],
)

maintenance_managers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
)

maintenance_viewers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
)


ACTIVE_TRIP_STATUSES = ["assigned", "in_progress"]


@router.post(
    "/",
    response_model=MaintenanceResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(maintenance_managers)],
)
def schedule_maintenance(
    maintenance_data: MaintenanceCreate,
    db: Session = Depends(get_db),
):
    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.id == maintenance_data.vehicle_id)
        .with_for_update()
        .first()
    )

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )

    if vehicle.status == "inactive":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Maintenance cannot be scheduled for an inactive vehicle.",
        )

    maintenance = Maintenance(
        vehicle_id=maintenance_data.vehicle_id,
        maintenance_type=maintenance_data.maintenance_type.value,
        description=maintenance_data.description,
        scheduled_date=maintenance_data.scheduled_date,
        service_center=maintenance_data.service_center,
        estimated_cost=maintenance_data.estimated_cost,
        status=MaintenanceStatus.SCHEDULED.value,
    )

    db.add(maintenance)

    try:
        db.commit()
        db.refresh(maintenance)
    except Exception:
        db.rollback()
        raise

    return maintenance


@router.get(
    "/",
    response_model=list[MaintenanceResponse],
)
def list_maintenance(
    record_status: MaintenanceStatus | None = Query(default=None, alias="status"),
    vehicle_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user=Depends(maintenance_viewers),
):
    query = db.query(Maintenance)

    if record_status is not None:
        query = query.filter(
            Maintenance.status == record_status.value
        )

    if vehicle_id is not None:
        query = query.filter(
            Maintenance.vehicle_id == vehicle_id
        )

    return query.order_by(
        Maintenance.scheduled_date.desc(),
        Maintenance.id.desc(),
    ).all()


@router.get(
    "/summary",
    response_model=MaintenanceSummary,
)
def maintenance_summary(
    db: Session = Depends(get_db),
    current_user=Depends(maintenance_viewers),
):
    today = date.today()

    total_vehicles = db.query(Vehicle).filter(
        Vehicle.status != "inactive"
    ).count()

    under_maintenance = db.query(Vehicle).filter(
        Vehicle.status == "maintenance"
    ).count()

    upcoming_maintenance = db.query(Maintenance).filter(
        Maintenance.status == MaintenanceStatus.SCHEDULED.value,
        Maintenance.scheduled_date >= today,
    ).count()

    overdue_maintenance = db.query(Maintenance).filter(
        Maintenance.status == MaintenanceStatus.SCHEDULED.value,
        Maintenance.scheduled_date < today,
    ).count()

    return MaintenanceSummary(
        total_vehicles=total_vehicles,
        under_maintenance=under_maintenance,
        upcoming_maintenance=upcoming_maintenance,
        overdue_maintenance=overdue_maintenance,
    )


@router.get(
    "/vehicles/{vehicle_id}/history",
    response_model=list[MaintenanceResponse],
)
def vehicle_maintenance_history(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(maintenance_viewers),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )

    return db.query(Maintenance).filter(
        Maintenance.vehicle_id == vehicle_id
    ).order_by(
        Maintenance.scheduled_date.desc(),
        Maintenance.id.desc(),
    ).all()



@router.patch(
    "/{maintenance_id}",
    response_model=MaintenanceResponse,
    dependencies=[Depends(maintenance_managers)],
)
def update_maintenance(
    maintenance_id: int,
    update_data: MaintenanceUpdate,
    db: Session = Depends(get_db),
):
    maintenance = (
        db.query(Maintenance)
        .filter(Maintenance.id == maintenance_id)
        .with_for_update()
        .first()
    )

    if maintenance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Maintenance record not found.",
        )

    vehicle = (
        db.query(Vehicle)
        .filter(Vehicle.id == maintenance.vehicle_id)
        .with_for_update()
        .first()
    )

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Associated vehicle not found.",
        )

    changes = update_data.model_dump(exclude_unset=True)

    new_status = changes.get("status", maintenance.status)

    if isinstance(new_status, Enum):
        new_status = new_status.value

    if maintenance.status in [
        MaintenanceStatus.COMPLETED.value,
        MaintenanceStatus.CANCELLED.value,
    ]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completed or cancelled maintenance records cannot be modified.",
        )

    if new_status == MaintenanceStatus.IN_PROGRESS.value:
        if vehicle.status == "inactive":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Inactive vehicles cannot enter maintenance.",
            )

        active_trip = db.query(Trip).filter(
            Trip.vehicle_id == vehicle.id,
            Trip.status.in_(ACTIVE_TRIP_STATUSES),
        ).first()

        if active_trip is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Maintenance cannot start while the vehicle has an active trip.",
            )

        vehicle.status = "maintenance"

        existing_active_maintenance = db.query(Maintenance).filter(
            Maintenance.vehicle_id == vehicle.id,
            Maintenance.id != maintenance.id,
            Maintenance.status == MaintenanceStatus.IN_PROGRESS.value,
        ).first()

        if existing_active_maintenance is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This vehicle already has another maintenance job in progress.",
            )

    if new_status == MaintenanceStatus.CANCELLED.value:
        if maintenance.status == MaintenanceStatus.IN_PROGRESS.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="In-progress maintenance must be completed and the vehicle confirmed operational before it can be closed.",
            )

    if new_status == MaintenanceStatus.COMPLETED.value:
        if maintenance.status != MaintenanceStatus.IN_PROGRESS.value:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only in-progress maintenance can be completed.",
            )

        if changes.get("vehicle_operational") is not True:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Confirm that the vehicle is operational before completing maintenance.",
            )

        active_trip = db.query(Trip).filter(
            Trip.vehicle_id == vehicle.id,
            Trip.status.in_(ACTIVE_TRIP_STATUSES),
        ).first()

        if active_trip is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The vehicle still has an active trip and cannot be released.",
            )

    allowed_fields = {
        "status",
        "actual_service_date",
        "replacement_parts",
        "actual_cost",
    }

    for field, value in changes.items():
        if field in allowed_fields:
            if isinstance(value, Enum):
                value = value.value
            setattr(maintenance, field, value)

    if new_status == MaintenanceStatus.COMPLETED.value:
        other_active_maintenance = db.query(Maintenance).filter(
            Maintenance.vehicle_id == vehicle.id,
            Maintenance.id != maintenance.id,
            Maintenance.status == MaintenanceStatus.IN_PROGRESS.value,
        ).first()

        if other_active_maintenance is None:
            vehicle.status = "available"

    try:
        db.commit()
        db.refresh(maintenance)
    except Exception:
        db.rollback()
        raise

    return maintenance

@router.get(
    "/reports",
    dependencies=[Depends(maintenance_viewers)],
)
def maintenance_reports(
    vehicle_id: int | None = Query(default=None, gt=0),
    maintenance_type: str | None = Query(default=None),
    record_status: MaintenanceStatus | None = Query(
        default=None,
        alias="status",
    ),
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start date cannot be after end date.",
        )

    query = db.query(Maintenance)

    if vehicle_id is not None:
        query = query.filter(
            Maintenance.vehicle_id == vehicle_id
        )

    if maintenance_type:
        query = query.filter(
            Maintenance.maintenance_type == maintenance_type
        )

    if record_status:
        query = query.filter(
            Maintenance.status == record_status.value
        )

    if start_date:
        query = query.filter(
            Maintenance.scheduled_date >= start_date
        )

    if end_date:
        query = query.filter(
            Maintenance.scheduled_date <= end_date
        )

    records = query.order_by(
        Maintenance.scheduled_date.desc()
    ).all()

    today = date.today()

    scheduled = sum(
        1 for r in records
        if r.status == MaintenanceStatus.SCHEDULED.value
    )

    completed = sum(
        1 for r in records
        if r.status == MaintenanceStatus.COMPLETED.value
    )

    pending = sum(
        1 for r in records
        if r.status in [
            MaintenanceStatus.SCHEDULED.value,
            MaintenanceStatus.IN_PROGRESS.value,
        ]
    )

    overdue = sum(
        1 for r in records
        if r.status == MaintenanceStatus.SCHEDULED.value
        and r.scheduled_date < today
    )

    total_estimated_cost = sum(
        r.estimated_cost or 0 for r in records
    )

    total_actual_cost = sum(
        (
            r.actual_cost
            if r.actual_cost is not None
            else r.estimated_cost
        ) or 0
        for r in records
        if r.status == MaintenanceStatus.COMPLETED.value
    )

    vehicle_expenses = {}

    for record in records:
        if record.status != MaintenanceStatus.COMPLETED.value:
            continue

        vehicle = db.query(Vehicle).filter(
            Vehicle.id == record.vehicle_id
        ).first()

        registration = (
            vehicle.registration_number
            if vehicle
            else f"Vehicle #{record.vehicle_id}"
        )

        if registration not in vehicle_expenses:
            vehicle_expenses[registration] = 0

        vehicle_expenses[registration] += (
            record.actual_cost
            if record.actual_cost is not None
            else record.estimated_cost
        ) or 0

    return {
        "summary": {
            "total_records": len(records),
            "scheduled": scheduled,
            "completed": completed,
            "pending": pending,
            "overdue": overdue,
            "total_estimated_cost": round(
                total_estimated_cost, 2
            ),
            "total_actual_cost": round(
                total_actual_cost, 2
            ),
        },
        "vehicle_expenses": [
            {
                "registration_number": vehicle,
                "total_expenses": round(expense, 2),
            }
            for vehicle, expense in vehicle_expenses.items()
        ],
        "records": records,
    }

@router.get(
    "/alerts",
    response_model=list[dict],
)
def get_maintenance_alerts(
    days_ahead: int = Query(default=7, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user=Depends(maintenance_viewers),
):
    today = date.today()
    upcoming_limit = today + timedelta(days=days_ahead)

    records = db.query(Maintenance).order_by(
        Maintenance.scheduled_date.asc()
    ).all()

    alerts = []

    for record in records:

        alert_status = None

        if record.status == MaintenanceStatus.COMPLETED.value:
            alert_status = "resolved"

        elif record.status == MaintenanceStatus.CANCELLED.value:
            continue

        elif (
            record.status == MaintenanceStatus.SCHEDULED.value
            and record.scheduled_date < today
        ):
            alert_status = "overdue"

        elif (
            record.status == MaintenanceStatus.SCHEDULED.value
            and today <= record.scheduled_date <= upcoming_limit
        ):
            alert_status = "upcoming"

        if alert_status is None:
            continue

        alerts.append({
            "id": record.id,
            "vehicle_id": record.vehicle_id,
            "maintenance_type": record.maintenance_type,
            "description": record.description,
            "scheduled_date": record.scheduled_date,
            "actual_service_date": record.actual_service_date,
            "service_center": record.service_center,
            "estimated_cost": record.estimated_cost,
            "actual_cost": record.actual_cost,
            "maintenance_status": record.status,
            "alert_status": alert_status,
        })

    return alerts