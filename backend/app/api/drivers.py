
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.core.security import hash_password
from app.models.driver import Driver
from app.models.driver_attendance import DriverAttendanceRecord
from app.models.shipment import Shipment
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.trip import Trip
from app.schemas.driver import DriverCreate, DriverResponse, DriverUpdate
from app.schemas.driver_attendance import DriverAttendanceCreate, DriverAttendanceResponse

router = APIRouter(prefix="/drivers", tags=["Drivers"])

MANAGEMENT_ROLES = ("administrator", "fleet_manager")
DRIVER_READ_ROLES = (*MANAGEMENT_ROLES, "dispatcher")


class DriverVehicleAssignment(BaseModel):
    vehicle_id: int | None


@router.post("", response_model=DriverResponse, status_code=201)
def create_driver(
    payload: DriverCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    email = str(payload.email).strip().lower()

    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")

    if db.scalar(
        select(Driver).where(
            Driver.license_number == payload.license_number.strip()
        )
    ):
        raise HTTPException(
            status_code=409,
            detail="License number already registered",
        )

    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role="driver",
        is_active=True,
    )

    try:
        db.add(user)
        db.flush()

        driver = Driver(
            user_id=user.id,
            license_number=payload.license_number.strip(),
            license_expiry=payload.license_expiry,
            attendance_status="unknown",
        )
        db.add(driver)
        db.commit()
        db.refresh(driver)
        db.refresh(user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email or license number already exists",
        )

    return {
        "id": driver.id,
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "license_number": driver.license_number,
        "license_expiry": driver.license_expiry,
        "attendance_status": driver.attendance_status,
    }


@router.get("", response_model=list[DriverResponse])
def list_drivers(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*DRIVER_READ_ROLES)),
):
    rows = db.execute(
        select(Driver, User)
        .join(User, Driver.user_id == User.id)
        .order_by(Driver.id)
    ).all()

    return [
        {
            "id": driver.id,
            "user_id": user.id,
            "full_name": user.full_name,
            "email": user.email,
            "license_number": driver.license_number,
            "license_expiry": driver.license_expiry,
            "attendance_status": driver.attendance_status,
        }
        for driver, user in rows
    ]


@router.patch("/{driver_id}", response_model=DriverResponse)
def update_driver(
    driver_id: int,
    payload: DriverUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    user = db.get(User, driver.user_id)
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=422, detail="Provide at least one field to update")
    if any(value is None and key != "license_expiry" for key, value in changes.items()):
        raise HTTPException(status_code=422, detail="Driver fields cannot be null")
    email = str(changes.get("email", user.email)).strip().lower()
    license_number = changes.get("license_number", driver.license_number).strip()
    if db.scalar(select(User).where(User.email == email, User.id != user.id)):
        raise HTTPException(status_code=409, detail="Email already registered")
    if db.scalar(select(Driver).where(Driver.license_number == license_number, Driver.id != driver.id)):
        raise HTTPException(status_code=409, detail="License number already registered")
    expiry = changes.get("license_expiry")
    if expiry is not None:
        expiry = expiry.replace(tzinfo=timezone.utc) if expiry.tzinfo is None else expiry.astimezone(timezone.utc)
        if expiry < datetime.now(timezone.utc) and db.scalar(select(Shipment.id).where(
            Shipment.driver_id == driver.id,
            Shipment.status.in_(("assigned", "in_transit")),
        ).limit(1)):
            raise HTTPException(status_code=409, detail="Driver has an active shipment and cannot be given an expired license date")
    user.full_name = changes.get("full_name", user.full_name).strip()
    user.email = email
    driver.license_number = license_number
    if "license_expiry" in changes:
        driver.license_expiry = changes["license_expiry"]
    if "attendance_status" in changes:
        attendance_status = changes["attendance_status"].strip().lower()
        if attendance_status != driver.attendance_status:
            db.add(DriverAttendanceRecord(
                driver_id=driver.id,
                status=attendance_status,
                recorded_by_user_id=current_user.id,
            ))
        driver.attendance_status = attendance_status
    try:
        db.commit()
        db.refresh(driver)
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Driver email or license number already exists")
    return {
        "id": driver.id,
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "license_number": driver.license_number,
        "license_expiry": driver.license_expiry,
        "attendance_status": driver.attendance_status,
    }


@router.put("/{driver_id}/vehicle")
def assign_driver_vehicle(
    driver_id: int,
    payload: DriverVehicleAssignment,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if db.scalar(select(Trip.id).where(
        Trip.driver_id == driver.id, Trip.status.in_(("scheduled", "in_progress"))
    ).limit(1)):
        raise HTTPException(status_code=409, detail="Driver has a scheduled or active trip")
    current = db.scalar(select(Vehicle).where(Vehicle.assigned_driver_id == driver.id))
    active_shipment = db.scalar(select(Shipment.id).where(
        Shipment.driver_id == driver.id, Shipment.status.in_(("assigned", "in_transit", "delayed"))
    ).limit(1))
    if active_shipment and (current is None or current.id != payload.vehicle_id):
        raise HTTPException(status_code=409, detail="Driver has an active shipment")
    if payload.vehicle_id is None:
        if current:
            current.assigned_driver_id = None
    else:
        vehicle = db.get(Vehicle, payload.vehicle_id)
        if vehicle is None:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        if vehicle.status == "maintenance":
            raise HTTPException(status_code=409, detail="A vehicle in maintenance cannot be assigned")
        if vehicle.assigned_driver_id is not None and vehicle.assigned_driver_id != driver.id:
            raise HTTPException(status_code=409, detail="Vehicle is already assigned to another driver")
        if db.scalar(select(Trip.id).where(
            Trip.vehicle_id == vehicle.id, Trip.status.in_(("scheduled", "in_progress"))
        ).limit(1)):
            raise HTTPException(status_code=409, detail="Vehicle has a scheduled or active trip")
        other = db.scalar(select(Vehicle).where(
            Vehicle.assigned_driver_id == driver.id, Vehicle.id != vehicle.id
        ))
        if other:
            other.assigned_driver_id = None
        vehicle.assigned_driver_id = driver.id
    db.commit()
    return {"driver_id": driver.id, "vehicle_id": payload.vehicle_id}


@router.patch("/{driver_id}/account")
def set_driver_account_active(
    driver_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("administrator")),
):
    if set(payload) != {"is_active"} or not isinstance(payload.get("is_active"), bool):
        raise HTTPException(status_code=422, detail="Provide a boolean is_active value")
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    user = db.get(User, driver.user_id)
    user.is_active = payload["is_active"]
    db.commit()
    return {"driver_id": driver.id, "is_active": user.is_active}


@router.get("/{driver_id}/attendance", response_model=list[DriverAttendanceResponse])
def list_driver_attendance(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*DRIVER_READ_ROLES)),
):
    if db.get(Driver, driver_id) is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    return db.scalars(
        select(DriverAttendanceRecord)
        .where(DriverAttendanceRecord.driver_id == driver_id)
        .order_by(DriverAttendanceRecord.recorded_at.desc(), DriverAttendanceRecord.id.desc())
    ).all()


@router.post("/{driver_id}/attendance", response_model=DriverAttendanceResponse, status_code=201)
def record_driver_attendance(
    driver_id: int,
    payload: DriverAttendanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*MANAGEMENT_ROLES)),
):
    driver = db.get(Driver, driver_id)
    if driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    record = DriverAttendanceRecord(
        driver_id=driver.id,
        status=payload.status,
        note=payload.note.strip() if payload.note else None,
        recorded_by_user_id=current_user.id,
    )
    driver.attendance_status = payload.status
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
