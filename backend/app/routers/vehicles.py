from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.db.dependencies import get_db
from app.models.driver import Driver
from app.models.vehicle import Vehicle
from app.schemas.user import UserRole
from app.schemas.vehicle import VehicleCreate, VehicleResponse
from app.models.trip import Trip

router = APIRouter(
    prefix="/vehicles",
    tags=["Vehicles"],
)


vehicle_managers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
)

vehicle_viewers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
    UserRole.DRIVER,
)

assignment_managers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
)


@router.post(
    "/",
    response_model=VehicleResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(vehicle_managers)],
)
def create_vehicle(
    vehicle_data: VehicleCreate,
    db: Session = Depends(get_db),
):
    vehicle = Vehicle(
        registration_number=vehicle_data.registration_number,
        make=vehicle_data.make,
        model=vehicle_data.model,
        manufacturing_year=vehicle_data.manufacturing_year,
        capacity_kg=vehicle_data.capacity_kg,
        insurance_expiry=vehicle_data.insurance_expiry,
        vehicle_type=vehicle_data.vehicle_type,
        fuel_type=vehicle_data.fuel_type,
        fuel_capacity=vehicle_data.fuel_capacity,
        fuel_efficiency=vehicle_data.fuel_efficiency,
    )

    db.add(vehicle)

    try:
        db.commit()
        db.refresh(vehicle)
    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A vehicle with this registration number may already exist.",
        )

    return vehicle


@router.get(
    "/",
    response_model=list[VehicleResponse],
)
def list_vehicles(
    db: Session = Depends(get_db),
    current_user=Depends(vehicle_viewers),
):
    return db.query(Vehicle).order_by(Vehicle.id).all()


@router.get(
    "/{vehicle_id}",
    response_model=VehicleResponse,
)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(vehicle_viewers),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )

    return vehicle


@router.put(
    "/{vehicle_id}/assign-driver/{driver_id}",
    response_model=VehicleResponse,
)
def assign_driver(
    vehicle_id: int,
    driver_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(assignment_managers),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).with_for_update().first()

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    if vehicle.status != "available":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only available vehicles can receive a driver assignment.",
        )

    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    if vehicle.assigned_driver_id == driver_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This driver is already assigned to this vehicle.",
        )

    if vehicle.assigned_driver_id is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This vehicle already has a driver. Unassign the current driver first.",
        )

    existing_assignment = db.query(Vehicle).filter(
        Vehicle.assigned_driver_id == driver_id
    ).first()

    if existing_assignment is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This driver is already assigned to another vehicle.",
        )

    if driver.status != "available":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only available drivers can be assigned.",
        )

    vehicle.assigned_driver_id = driver_id

    try:
        db.commit()
        db.refresh(vehicle)
    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The assignment could not be completed because of a database constraint.",
        )

    return vehicle


@router.delete(
    "/{vehicle_id}/assign-driver",
    response_model=VehicleResponse,
)
def unassign_driver(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(assignment_managers),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).with_for_update().first()

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )

    if vehicle.assigned_driver_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This vehicle does not have an assigned driver.",
        )

    vehicle.assigned_driver_id = None

    try:
        db.commit()
        db.refresh(vehicle)
    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The driver could not be unassigned.",
        )

    return vehicle

@router.delete(
    "/{vehicle_id}",
)
def deactivate_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user=Depends(vehicle_managers),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )

    if vehicle.status == "inactive":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This vehicle is already inactive.",
        )

    active_trip = db.query(Trip).filter(
        Trip.vehicle_id == vehicle_id,
        Trip.status.in_(["assigned", "in_progress"]),
    ).first()

    if active_trip is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This vehicle cannot be removed while it has an assigned or in-progress trip.",
        )

    vehicle.assigned_driver_id = None
    vehicle.status = "inactive"

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The vehicle could not be removed.",
        )

    return {"message": "Vehicle deactivated successfully."}