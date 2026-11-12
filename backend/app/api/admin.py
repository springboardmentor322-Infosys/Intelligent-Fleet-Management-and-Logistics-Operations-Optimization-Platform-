
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.driver import Driver
from app.models.shipment import Shipment
from app.core.security import hash_password
from app.schemas.auth import AdminAccountCreate, AdminPasswordResetRequest, UserResponse
from app.schemas.driver import DriverProfileLinkRequest, DriverResponse

router = APIRouter(
    prefix="/admin",
    tags=["Administrator"],
)



@router.get("/overview")
def admin_overview(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("administrator")),
):
    vehicles = db.scalars(select(Vehicle)).all()

    return {
        "total_users": db.scalar(
            select(func.count()).select_from(User)
        ) or 0,
        "active_users": db.scalar(
            select(func.count())
            .select_from(User)
            .where(User.is_active.is_(True))
        ) or 0,
        "total_vehicles": len(vehicles),
        "active_vehicles": sum(
            1 for vehicle in vehicles
            if vehicle.status.lower() == "active"
        ),
        "vehicles_in_maintenance": sum(
            1 for vehicle in vehicles
            if vehicle.status.lower() in {"maintenance", "in_maintenance"}
        ),
        "unassigned_drivers": sum(
    1 for driver in db.scalars(select(Driver)).all()
    if not any(
        vehicle.assigned_driver_id == driver.id
        for vehicle in vehicles
    )
),
        "total_drivers": db.scalar(
            select(func.count()).select_from(Driver)
        ) or 0,
        "total_shipments": db.scalar(
            select(func.count()).select_from(Shipment)
        ) or 0,
    }



@router.get("/users")
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("administrator")),
):
    users = db.scalars(
        select(User).order_by(User.id)
    ).all()
    linked_user_ids = set(db.scalars(select(Driver.user_id)).all())

    return [
        {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role,
            "is_active": user.is_active,
            "created_at": user.created_at,
            "has_driver_profile": user.id in linked_user_ids,
        }
        for user in users
    ]


@router.post("/users", response_model=UserResponse, status_code=201)
def create_fleet_account(
    payload: AdminAccountCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("administrator")),
):
    email = str(payload.email).strip().lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role=payload.role,
        is_active=True,
    )
    db.add(user)
    try:
        db.commit()
        db.refresh(user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Email already registered")
    return user


@router.post("/users/{user_id}/reset-password", status_code=204)
def reset_user_password(
    user_id: int,
    payload: AdminPasswordResetRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("administrator")),
):
    if db.scalar(select(User.id).where(User.id == user_id)) is None:
        raise HTTPException(status_code=404, detail="User not found")
    try:
        db.execute(
            update(User)
            .where(User.id == user_id)
            .values(password_hash=hash_password(payload.new_password))
        )
        db.commit()
    except Exception:
        db.rollback()
        raise


@router.post("/users/{user_id}/driver-profile", response_model=DriverResponse, status_code=201)
def create_driver_profile_for_existing_account(
    user_id: int,
    payload: DriverProfileLinkRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("administrator")),
):
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=409, detail="A disabled account cannot be linked")
    if user.role != "driver":
        raise HTTPException(status_code=409, detail="Only a driver account can receive a driver profile")
    if db.scalar(select(Driver.id).where(Driver.user_id == user.id)):
        raise HTTPException(status_code=409, detail="This account already has a driver profile")
    if db.scalar(select(Driver.id).where(Driver.license_number == payload.license_number)):
        raise HTTPException(status_code=409, detail="License number already registered")
    driver = Driver(
        user_id=user.id,
        license_number=payload.license_number,
        license_expiry=payload.license_expiry,
        attendance_status="unknown",
    )
    db.add(driver)
    try:
        db.commit()
        db.refresh(driver)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Driver profile conflicts with existing data")
    return {
        "id": driver.id,
        "user_id": user.id,
        "full_name": user.full_name,
        "email": user.email,
        "license_number": driver.license_number,
        "license_expiry": driver.license_expiry,
        "attendance_status": driver.attendance_status,
    }
