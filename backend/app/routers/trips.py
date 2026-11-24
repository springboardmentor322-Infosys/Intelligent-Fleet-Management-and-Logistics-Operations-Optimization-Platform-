from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from datetime import timedelta

from app.core.dependencies import get_current_user, require_roles
from app.db.dependencies import get_db
from app.models.driver import Driver
from app.models.trip import Trip
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.trip import TripCreate, TripResponse, TripStatus, TripStatusUpdate
from app.schemas.user import UserRole
from app.core.trip_simulation import (
    initialize_trip_simulation,
    pause_trip_simulation,
    resume_trip_simulation,
)
from app.models.shipment import Shipment


router = APIRouter(
    prefix="/trips",
    tags=["Trips"],
)


trip_managers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
)

trip_viewers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
)

driver_viewers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
    UserRole.DRIVER,
)


ACTIVE_TRIP_STATUSES = {
    TripStatus.ASSIGNED.value,
    TripStatus.IN_PROGRESS.value,
}


def check_resource_availability(
    db: Session,
    driver_id: int,
    vehicle_id: int,
):
    """Reject a driver or vehicle that already has an active trip."""

    active_driver_trip = db.query(Trip).filter(
        Trip.driver_id == driver_id,
        Trip.status.in_(ACTIVE_TRIP_STATUSES),
    ).first()

    if active_driver_trip is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This driver already has an active trip.",
        )

    active_vehicle_trip = db.query(Trip).filter(
        Trip.vehicle_id == vehicle_id,
        Trip.status.in_(ACTIVE_TRIP_STATUSES),
    ).first()

    if active_vehicle_trip is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This vehicle already has an active trip.",
        )


def apply_driver_trip_status(
    db: Session,
    trip: Trip,
    driver: Driver,
    status_data: TripStatusUpdate,
):
    """Apply an allowed driver status update and release resources on completion."""

    if trip.status in {
        TripStatus.COMPLETED.value,
        TripStatus.CANCELLED.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A completed or cancelled trip cannot be updated.",
        )

    if status_data.status not in {
        TripStatus.IN_PROGRESS,
        TripStatus.COMPLETED,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Drivers may only set status to in_progress or completed.",
        )

        # A trip cannot be completed until all its shipments are delivered.
    if status_data.status == TripStatus.COMPLETED:

        undelivered_shipment = db.query(Shipment).filter(
            Shipment.trip_id == trip.id,
            Shipment.status != "delivered",
        ).first()

        if undelivered_shipment is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The trip cannot be completed until all "
                    "associated shipments are delivered."
                ),
            )

    trip.status = status_data.status.value

    if status_data.status == TripStatus.COMPLETED:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == trip.vehicle_id
        ).first()

        driver.status = "available"

        if vehicle is not None:
            vehicle.status = "available"

    try:
        db.commit()
        db.refresh(trip)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The trip status could not be updated.",
        )

    return trip


@router.post(
    "/",
    response_model=TripResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_trip(
    trip_data: TripCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(trip_managers),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == trip_data.vehicle_id
    ).first()

    if vehicle is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Vehicle not found.",
        )
    if vehicle.status != "available":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only available vehicles can be assigned to new trips.",
        )

    driver = db.query(Driver).filter(
        Driver.id == trip_data.driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    if vehicle.assigned_driver_id != driver.id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected driver is not assigned to this vehicle.",
        )

    if driver.status != "available":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The selected driver is not available.",
        )

    if trip_data.scheduled_at.utcoffset() is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="scheduled_at must include a timezone.",
        )

    check_resource_availability(
        db=db,
        driver_id=driver.id,
        vehicle_id=vehicle.id,
    )

    estimated_duration = trip_data.estimated_duration_minutes

    estimated_arrival = (
        trip_data.scheduled_at + timedelta(minutes=estimated_duration)
        if estimated_duration is not None
        else None
    )

    trip = Trip(
        origin=trip_data.origin,
        destination=trip_data.destination,
        description=trip_data.description,
        vehicle_id=vehicle.id,
        driver_id=driver.id,
        scheduled_at=trip_data.scheduled_at,
        estimated_duration_minutes=estimated_duration,
        estimated_arrival_at=estimated_arrival,
        selected_route_id=trip_data.selected_route_id,
        selected_route_distance_km=trip_data.selected_route_distance_km,
        selected_route_coordinates=trip_data.selected_route_coordinates,
        status=TripStatus.ASSIGNED.value,
    )

    driver.status = "on_trip"
    vehicle.status = "on_trip"

    try:
        db.add(trip)
        db.commit()
        db.refresh(trip)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The trip could not be created because of a database constraint.",
        )

    return trip



@router.post(
    "/{trip_id}/start-simulation",
    response_model=TripResponse,
)
def start_trip_simulation(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(trip_managers),
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=404,
            detail="Trip not found.",
        )

    if trip.status not in {
        TripStatus.ASSIGNED.value,
        TripStatus.IN_PROGRESS.value,
    }:
        raise HTTPException(
            status_code=409,
            detail="This trip cannot be simulated.",
        )

    if (
        not trip.selected_route_coordinates
        or len(trip.selected_route_coordinates) < 2
    ):
        raise HTTPException(
            status_code=400,
            detail="Valid route coordinates are required.",
        )

    if trip.status == TripStatus.ASSIGNED.value:
        trip.status = TripStatus.IN_PROGRESS.value

        db.commit()
        db.refresh(trip)

    resume_trip_simulation(trip.id)

    return trip


@router.post(
    "/{trip_id}/stop-simulation",
    response_model=TripResponse,
)
def stop_trip_simulation(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(trip_managers),
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=404,
            detail="Trip not found.",
        )

    if trip.status != TripStatus.IN_PROGRESS.value:
        raise HTTPException(
            status_code=409,
            detail="Only in-progress trips can be paused.",
        )

    pause_trip_simulation(trip.id)

    return trip


@router.get(
    "/",
    response_model=list[TripResponse],
)
def list_trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(trip_viewers),
):
    return db.query(Trip).order_by(Trip.id).all()


@router.get(
    "/my-trips",
    response_model=list[TripResponse],
)
def get_my_trips(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.DRIVER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is only available to drivers.",
        )

    driver = db.query(Driver).filter(
        Driver.user_id == current_user.id
    ).first()

    if driver is None:
        return []

    return db.query(Trip).filter(
        Trip.driver_id == driver.id
    ).order_by(Trip.id).all()


# New endpoint: retrieve trips belonging to a selected driver.
@router.get(
    "/by-driver/{driver_id}",
    response_model=list[TripResponse],
)
def get_trips_by_driver(
    driver_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(driver_viewers),
):
    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    return db.query(Trip).filter(
        Trip.driver_id == driver_id
    ).order_by(Trip.id).all()


# Existing endpoint: individual driver accounts update their own trips.
@router.patch(
    "/{trip_id}/status",
    response_model=TripResponse,
)
def update_trip_status(
    trip_id: int,
    status_data: TripStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.DRIVER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can update trip status.",
        )

    driver = db.query(Driver).filter(
        Driver.user_id == current_user.id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found.",
        )

    if trip.driver_id != driver.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only update your own trips.",
        )

    return apply_driver_trip_status(
        db=db,
        trip=trip,
        driver=driver,
        status_data=status_data,
    )


# New endpoint: shared Driver login updates a selected driver's trip.
@router.patch(
    "/by-driver/{driver_id}/{trip_id}/status",
    response_model=TripResponse,
)
def update_selected_driver_trip_status(
    driver_id: int,
    trip_id: int,
    status_data: TripStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != UserRole.DRIVER.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only drivers can update trip status.",
        )

    driver = db.query(Driver).filter(
        Driver.id == driver_id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver not found.",
        )

    trip = db.query(Trip).filter(
        Trip.id == trip_id,
        Trip.driver_id == driver_id,
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found for the selected driver.",
        )

    return apply_driver_trip_status(
        db=db,
        trip=trip,
        driver=driver,
        status_data=status_data,
    )


@router.patch(
    "/{trip_id}/cancel",
    response_model=TripResponse,
)
def cancel_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(trip_managers),
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found.",
        )

    if trip.status in {
        TripStatus.COMPLETED.value,
        TripStatus.CANCELLED.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This trip is already completed or cancelled.",
        )

    driver = db.query(Driver).filter(
        Driver.id == trip.driver_id
    ).first()

    trip.status = TripStatus.CANCELLED.value

    if driver is not None:
        driver.status = "available"

    vehicle = db.query(Vehicle).filter(
        Vehicle.id == trip.vehicle_id
    ).first()

    if vehicle is not None:
        vehicle.status = "available"

    try:
        db.commit()
        db.refresh(trip)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The trip could not be cancelled.",
        )

    return trip

@router.patch(
    "/{trip_id}/complete",
    response_model=TripResponse,
)
def complete_trip(
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(trip_managers),
):
    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trip not found.",
        )

    if trip.status != TripStatus.IN_PROGRESS.value:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only in-progress trips can be completed.",
        )

            # Prevent trip completion if any shipment is undelivered.
    undelivered_shipment = db.query(Shipment).filter(
        Shipment.trip_id == trip.id,
        Shipment.status != "delivered",
    ).first()

    if undelivered_shipment is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The trip cannot be completed until all "
                "associated shipments are delivered."
            ),
        )

    driver = db.query(Driver).filter(
        Driver.id == trip.driver_id
    ).first()

    vehicle = db.query(Vehicle).filter(
        Vehicle.id == trip.vehicle_id
    ).first()

    trip.status = TripStatus.COMPLETED.value

    if driver is not None:
        driver.status = "available"

    if vehicle is not None:
        vehicle.status = "available"

    try:
        db.commit()
        db.refresh(trip)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The trip could not be completed.",
        )

    return trip

