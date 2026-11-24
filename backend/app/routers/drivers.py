from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.db.dependencies import get_db
from app.models.driver import Driver
from app.models.user import User
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.schemas.driver import (
    DriverCreate,
    DriverResponse,
    DriverUpdate,
    DriverProfileResponse,
)
from app.schemas.user import UserRole

router = APIRouter(
    prefix="/drivers",
    tags=["Drivers"],
)


# Only administrators and fleet managers can create or edit driver records.
driver_managers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
)

# The shared Driver login can view and select driver profiles.
driver_viewers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DRIVER,
)


@router.get(
    "/me",
    response_model=DriverProfileResponse,
)
def get_my_driver_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Preserve support for existing drivers with individual accounts.
    driver = (
        db.query(Driver)
        .filter(Driver.user_id == current_user.id)
        .first()
    )

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    return {
        "id": driver.id,
        "user_id": driver.user_id,
        "full_name": driver.full_name,
        "email": current_user.email,
        "license_number": driver.license_number,
        "license_expiry": driver.license_expiry,
        "phone_number": driver.phone_number,
        "status": driver.status,
    }


@router.post(
    "/",
    response_model=DriverResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_driver(
    driver_data: DriverCreate,
    db: Session = Depends(get_db),
    current_user=Depends(driver_managers),
):
    # A driver profile may optionally be linked to an existing user.
    if driver_data.user_id is not None:
        user = (
            db.query(User)
            .filter(User.id == driver_data.user_id)
            .first()
        )

        if user is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found.",
            )

        if user.role != UserRole.DRIVER.value:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The selected user does not have the driver role.",
            )

        existing_driver = (
            db.query(Driver)
            .filter(Driver.user_id == driver_data.user_id)
            .first()
        )

        if existing_driver:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This user already has a driver profile.",
            )

    # License numbers must be unique.
    existing_license = (
        db.query(Driver)
        .filter(Driver.license_number == driver_data.license_number)
        .first()
    )

    if existing_license:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This license number is already registered.",
        )

    driver = Driver(
        user_id=driver_data.user_id,
        full_name=driver_data.full_name,
        license_number=driver_data.license_number,
        license_expiry=driver_data.license_expiry,
        phone_number=driver_data.phone_number,
    )

    db.add(driver)

    try:
        db.commit()
        db.refresh(driver)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The driver could not be created because of a database constraint.",
        )

    return driver


@router.get(
    "/",
    response_model=list[DriverResponse],
)
def list_drivers(
    db: Session = Depends(get_db),
    current_user=Depends(driver_viewers),
):
    # Use the name stored in the driver profile.
    # The outer join also includes standalone profiles with no user account.
    drivers = (
        db.query(Driver)
        .order_by(Driver.id)
        .all()
    )

    return drivers


@router.get(
    "/{driver_id}",
    response_model=DriverProfileResponse,
)
def get_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(driver_viewers),
):
    driver = (
        db.query(Driver)
        .filter(Driver.id == driver_id)
        .first()
    )

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    user = None

    if driver.user_id is not None:
        user = (
            db.query(User)
            .filter(User.id == driver.user_id)
            .first()
        )

    return {
        "id": driver.id,
        "user_id": driver.user_id,
        "full_name": driver.full_name,
        "email": user.email if user else None,
        "license_number": driver.license_number,
        "license_expiry": driver.license_expiry,
        "phone_number": driver.phone_number,
        "status": driver.status,
    }


@router.put(
    "/{driver_id}",
    response_model=DriverResponse,
)
def update_driver(
    driver_id: int,
    driver_data: DriverUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(driver_managers),
):
    driver = (
        db.query(Driver)
        .filter(Driver.id == driver_id)
        .first()
    )

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    # Prevent duplicate license numbers.
    existing_license = (
        db.query(Driver)
        .filter(
            Driver.license_number == driver_data.license_number,
            Driver.id != driver_id,
        )
        .first()
    )

    if existing_license:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This license number is already registered to another driver.",
        )

    driver.full_name = driver_data.full_name
    driver.license_number = driver_data.license_number
    driver.license_expiry = driver_data.license_expiry
    driver.phone_number = driver_data.phone_number
    driver.status = driver_data.status

    try:
        db.commit()
        db.refresh(driver)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The driver could not be updated because of a database constraint.",
        )

    return driver

@router.delete(
    "/{driver_id}",
)
def deactivate_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(driver_managers),
):
    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    if driver.status == "inactive":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This driver is already inactive.",
        )

    active_trip = db.query(Trip).filter(
        Trip.driver_id == driver_id,
        Trip.status.in_(["assigned", "in_progress"]),
    ).first()

    if active_trip is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This driver cannot be removed while they have an assigned or in-progress trip.",
        )

    # Release any vehicle assigned to this driver.
    assigned_vehicles = db.query(Vehicle).filter(
        Vehicle.assigned_driver_id == driver_id
    ).all()

    for vehicle in assigned_vehicles:
        vehicle.assigned_driver_id = None

    driver.status = "inactive"

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The driver could not be removed.",
        )

    return {"message": "Driver deactivated successfully."}