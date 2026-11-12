from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.maintenance_record import MaintenanceRecord
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_inspection import VehicleInspection
from app.schemas.maintenance import MaintenanceCreate, MaintenanceResponse, MaintenanceUpdate
from app.schemas.vehicle_inspection import VehicleInspectionCreate, VehicleInspectionResponse

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])
FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")
MANAGEMENT_ROLES = ("administrator", "fleet_manager")


@router.get("", response_model=list[MaintenanceResponse])
def list_maintenance(
    vehicle_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    query = select(MaintenanceRecord).order_by(
        MaintenanceRecord.service_date.desc(), MaintenanceRecord.id.desc()
    )
    if vehicle_id is not None:
        if db.get(Vehicle, vehicle_id) is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        query = query.where(MaintenanceRecord.vehicle_id == vehicle_id)
    return db.scalars(query).all()


@router.post("", response_model=MaintenanceResponse, status_code=201)
def create_maintenance(
    payload: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    if db.get(Vehicle, payload.vehicle_id) is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    record = MaintenanceRecord(**payload.model_dump())
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/inspections", response_model=list[VehicleInspectionResponse])
def list_inspections(
    vehicle_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    query = select(VehicleInspection).order_by(VehicleInspection.inspected_at.desc(), VehicleInspection.id.desc())
    if vehicle_id is not None:
        if db.get(Vehicle, vehicle_id) is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        query = query.where(VehicleInspection.vehicle_id == vehicle_id)
    return db.scalars(query).all()


@router.post("/inspections", response_model=VehicleInspectionResponse, status_code=201)
def create_inspection(
    payload: VehicleInspectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    if db.get(Vehicle, payload.vehicle_id) is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    inspection = VehicleInspection(
        **payload.model_dump(exclude_none=True),
        inspector_user_id=current_user.id,
    )
    db.add(inspection)
    db.commit()
    db.refresh(inspection)
    return inspection


@router.get("/{record_id}", response_model=MaintenanceResponse)
def get_maintenance(
    record_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    record = db.get(MaintenanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    return record


@router.patch("/{record_id}", response_model=MaintenanceResponse)
def update_maintenance(
    record_id: int,
    payload: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    record = db.get(MaintenanceRecord, record_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Maintenance record not found")
    changes = payload.model_dump(exclude_unset=True)
    if any(value is None and key not in {"cost", "next_due_date"} for key, value in changes.items()):
        raise HTTPException(status_code=422, detail="Maintenance fields cannot be null")
    service_date = changes.get("service_date", record.service_date)
    due_date = changes.get("next_due_date", record.next_due_date)
    if due_date is not None:
        service_date = service_date.replace(tzinfo=timezone.utc) if service_date.tzinfo is None else service_date.astimezone(timezone.utc)
        due_date = due_date.replace(tzinfo=timezone.utc) if due_date.tzinfo is None else due_date.astimezone(timezone.utc)
    if due_date is not None and due_date <= service_date:
        raise HTTPException(status_code=422, detail="Next due date must be after service date")
    for field, value in changes.items():
        setattr(record, field, value)
    record.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)
    return record


@router.get("/vehicles/{vehicle_id}/health")
def vehicle_health_report(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    latest_service = db.scalar(
        select(MaintenanceRecord)
        .where(MaintenanceRecord.vehicle_id == vehicle_id, MaintenanceRecord.status == "completed")
        .order_by(MaintenanceRecord.service_date.desc(), MaintenanceRecord.id.desc())
        .limit(1)
    )
    latest_inspection = db.scalar(
        select(VehicleInspection)
        .where(VehicleInspection.vehicle_id == vehicle_id)
        .order_by(VehicleInspection.inspected_at.desc(), VehicleInspection.id.desc())
        .limit(1)
    )
    return {
        "vehicle_id": vehicle.id,
        "vehicle_status": vehicle.status,
        "last_completed_service": MaintenanceResponse.model_validate(latest_service) if latest_service else None,
        "latest_inspection": VehicleInspectionResponse.model_validate(latest_inspection) if latest_inspection else None,
        "health_assessment": (
            latest_inspection.result if latest_inspection else "not_assessed"
        ),
        "assessment_source": "latest recorded inspection only; no synthetic health score",
    }
