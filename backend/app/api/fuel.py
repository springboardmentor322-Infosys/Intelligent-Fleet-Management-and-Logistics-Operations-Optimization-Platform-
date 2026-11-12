from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.fuel_log import FuelLog
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.fuel_log import FuelLogCreate, FuelLogResponse

router = APIRouter(prefix="/fuel-logs", tags=["Fuel Logs"])
FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")


@router.get("", response_model=list[FuelLogResponse])
def list_fuel_logs(
    vehicle_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    query = select(FuelLog).order_by(FuelLog.logged_at.desc(), FuelLog.id.desc())
    if vehicle_id is not None:
        if db.get(Vehicle, vehicle_id) is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        query = query.where(FuelLog.vehicle_id == vehicle_id)
    return db.scalars(query).all()


@router.post("", response_model=FuelLogResponse, status_code=201)
def create_fuel_log(
    payload: FuelLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator", "fleet_manager")),
):
    vehicle = db.get(Vehicle, payload.vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    latest = db.scalar(
        select(FuelLog)
        .where(FuelLog.vehicle_id == payload.vehicle_id)
        .order_by(FuelLog.logged_at.desc(), FuelLog.id.desc())
        .limit(1)
    )
    if latest and payload.odometer_km < latest.odometer_km:
        raise HTTPException(status_code=409, detail="Odometer reading cannot be lower than the latest fuel log")
    if latest and payload.logged_at and utc_datetime(payload.logged_at) < utc_datetime(latest.logged_at):
        raise HTTPException(status_code=409, detail="Fuel log time cannot precede the latest fuel log")

    log = FuelLog(**payload.model_dump(exclude_none=True))
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


def utc_datetime(value):
    from datetime import timezone
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
