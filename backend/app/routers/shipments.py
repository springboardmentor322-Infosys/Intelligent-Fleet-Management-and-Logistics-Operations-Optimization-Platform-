
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.db.dependencies import get_db
from app.models.driver import Driver
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.trip import Trip
from app.models.vehicle import Vehicle
from app.models.user import User
from app.schemas.shipment import (
    ShipmentCreate,
    ShipmentResponse,
    ShipmentStatus,
    ShipmentStatusHistoryResponse,
    ShipmentStatusUpdate,
)
from app.schemas.user import UserRole


router = APIRouter(
    prefix="/shipments",
    tags=["Shipments"],
)


shipment_managers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
)

shipment_viewers = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
)


ALLOWED_TRANSITIONS = {
    ShipmentStatus.CREATED: {
        ShipmentStatus.ASSIGNED,
        ShipmentStatus.CANCELLED,
    },
    ShipmentStatus.ASSIGNED: {
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.CANCELLED,
    },
    ShipmentStatus.IN_TRANSIT: {
        ShipmentStatus.DELAYED,
        ShipmentStatus.DELIVERED,
        ShipmentStatus.CANCELLED,
    },
    ShipmentStatus.DELAYED: {
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.DELIVERED,
        ShipmentStatus.CANCELLED,
    },
    ShipmentStatus.DELIVERED: set(),
    ShipmentStatus.CANCELLED: set(),
}


def get_shipment_or_404(db: Session, shipment_id: int) -> Shipment:
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id
    ).first()

    if shipment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shipment not found.",
        )

    return shipment


def check_driver_access(
    db: Session,
    shipment: Shipment,
    current_user: User,
) -> None:
    """Ensure a driver can access only shipments on their own trips."""

    driver = db.query(Driver).filter(
        Driver.user_id == current_user.id
    ).first()

    if driver is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Driver profile not found.",
        )

    if shipment.trip_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This shipment is not assigned to one of your trips.",
        )

    trip = db.query(Trip).filter(
        Trip.id == shipment.trip_id,
        Trip.driver_id == driver.id,
    ).first()

    if trip is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only access shipments on your own trips.",
        )


@router.post(
    "/",
    response_model=ShipmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_shipment(
    shipment_data: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(shipment_managers),
):
    existing = db.query(Shipment).filter(
        Shipment.tracking_number == shipment_data.tracking_number
    ).first()

    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This tracking number already exists.",
        )

    if shipment_data.trip_id is not None:
        trip = db.query(Trip).filter(
            Trip.id == shipment_data.trip_id
        ).first()

        if trip is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Trip not found.",
            )

        if trip.status != "assigned":
            raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
            "Shipments can only be assigned to trips "
            "that have the assigned status."
        ),
    )

    shipment = Shipment(
        tracking_number=shipment_data.tracking_number,
        origin=shipment_data.origin,
        destination=shipment_data.destination,
        description=shipment_data.description,
        trip_id=shipment_data.trip_id,
        estimated_delivery_at=shipment_data.estimated_delivery_at,
        status=(
            ShipmentStatus.ASSIGNED.value
            if shipment_data.trip_id is not None
            else ShipmentStatus.CREATED.value
        ),
    )

    initial_status = ShipmentStatus(shipment.status)

    try:
        db.add(shipment)
        db.flush()

        db.add(
            ShipmentStatusHistory(
                shipment_id=shipment.id,
                status=initial_status.value,
                notes="Shipment created.",
            )
        )

        db.commit()
        db.refresh(shipment)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shipment could not be created because of a database constraint.",
        )

    return shipment


@router.get(
    "/",
    response_model=list[ShipmentResponse],
)
def list_shipments(
    db: Session = Depends(get_db),
    current_user: User = Depends(shipment_viewers),
):
    return db.query(Shipment).order_by(Shipment.id).all()


@router.get(
    "/track/{tracking_number}",
    response_model=ShipmentResponse,
)
def track_shipment(
    tracking_number: str,
    db: Session = Depends(get_db),
):
    """Look up a shipment using its tracking number."""

    shipment = db.query(Shipment).filter(
        Shipment.tracking_number == tracking_number
    ).first()

    if shipment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shipment not found.",
        )

    return shipment


@router.get(
    "/{shipment_id}",
    response_model=ShipmentResponse,
)
def get_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shipment = get_shipment_or_404(db, shipment_id)

    if current_user.role not in {
        UserRole.ADMINISTRATOR.value,
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }:
        if current_user.role != UserRole.DRIVER.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to view this shipment.",
            )

        check_driver_access(db, shipment, current_user)

    return shipment


@router.delete(
    "/{shipment_id}",
    response_model=dict[str, str],
)
def delete_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(shipment_managers),
):
    shipment = get_shipment_or_404(db, shipment_id)
    tracking_number = shipment.tracking_number

    try:
        db.query(ShipmentStatusHistory).filter(
            ShipmentStatusHistory.shipment_id == shipment.id
        ).delete(synchronize_session=False)

        db.delete(shipment)
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Shipment could not be deleted because it is "
                "referenced by another database record."
            ),
        )

    return {
        "message": (
            f"Shipment {tracking_number} deleted successfully."
        )
    }


@router.patch(
    "/{shipment_id}/status",
    response_model=ShipmentResponse,
)
def update_shipment_status(
    shipment_id: int,
    status_data: ShipmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shipment = get_shipment_or_404(db, shipment_id)

    is_manager = current_user.role in {
        UserRole.ADMINISTRATOR.value,
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }

    is_driver = current_user.role == UserRole.DRIVER.value

    if not is_manager and not is_driver:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You are not allowed to update shipment status.",
        )

    if is_driver:
        check_driver_access(db, shipment, current_user)

        if status_data.status not in {
            ShipmentStatus.IN_TRANSIT,
            ShipmentStatus.DELAYED,
            ShipmentStatus.DELIVERED,
        }:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Drivers may only set status to in_transit, delayed, or delivered.",
            )

    current_status = ShipmentStatus(shipment.status)
    new_status = status_data.status

    if new_status not in ALLOWED_TRANSITIONS[current_status]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot change shipment status from "
                f"'{current_status.value}' to '{new_status.value}'."
            ),
        )


        # A shipment must have a valid assigned trip before
    # it can be marked as assigned or move further.
    if new_status in {
        ShipmentStatus.ASSIGNED,
        ShipmentStatus.IN_TRANSIT,
        ShipmentStatus.DELAYED,
        ShipmentStatus.DELIVERED,
    }:
        if shipment.trip_id is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The shipment must be assigned to a trip "
                    "with a driver before this status change."
                ),
            )

        trip = db.query(Trip).filter(
            Trip.id == shipment.trip_id
        ).first()

        if trip is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The shipment's assigned trip was not found.",
            )

        if new_status == ShipmentStatus.ASSIGNED:
            if trip.status != "assigned":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "The shipment's trip must have assigned "
                        "status before the shipment can be assigned."
                    ),
                )
        elif trip.status != "in_progress":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The assigned trip must be in progress "
                    "before the shipment can be in transit, "
                    "delayed, or delivered."
                ),
            )

    shipment.status = new_status.value

    if new_status == ShipmentStatus.DELIVERED:
        shipment.delivered_at = datetime.now().astimezone()

        # Automatically complete the trip when all its
        # assigned shipments have been delivered.

        trip = db.query(Trip).filter(
            Trip.id == shipment.trip_id
        ).first()

        if trip is not None and trip.status == "in_progress":

            trip_shipments = db.query(Shipment).filter(
                Shipment.trip_id == trip.id
            ).all()

            all_delivered = (
                len(trip_shipments) > 0
                and all(
                    item.status == ShipmentStatus.DELIVERED.value
                    for item in trip_shipments
                )
            )

            if all_delivered:

                trip.status = "completed"

                driver = db.query(Driver).filter(
                    Driver.id == trip.driver_id
                ).first()

                vehicle = db.query(Vehicle).filter(
                    Vehicle.id == trip.vehicle_id
                ).first()

                if driver is not None:
                    driver.status = "available"

                if vehicle is not None:
                    vehicle.status = "available"

    try:
        db.add(
            ShipmentStatusHistory(
                shipment_id=shipment.id,
                status=new_status.value,
                notes=status_data.notes,
            )
        )

        db.commit()
        db.refresh(shipment)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Shipment status could not be updated.",
        )

    return shipment


@router.get(
    "/{shipment_id}/history",
    response_model=list[ShipmentStatusHistoryResponse],
)
def get_shipment_history(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    shipment = get_shipment_or_404(db, shipment_id)

    if current_user.role not in {
        UserRole.ADMINISTRATOR.value,
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }:
        if current_user.role != UserRole.DRIVER.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not allowed to view shipment history.",
            )

        check_driver_access(db, shipment, current_user)

    return db.query(ShipmentStatusHistory).filter(
        ShipmentStatusHistory.shipment_id == shipment.id
    ).order_by(
        ShipmentStatusHistory.recorded_at,
        ShipmentStatusHistory.id,
    ).all()

@router.patch("/{shipment_id}/assign-trip")
def assign_trip_to_shipment(
    shipment_id: int,
    trip_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(shipment_managers),
):
    shipment = db.query(Shipment).filter(
        Shipment.id == shipment_id
    ).first()

    if not shipment:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found",
        )

    if shipment.status in ["delivered", "cancelled"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot assign a trip to a delivered or cancelled shipment.",
        )

    trip = db.query(Trip).filter(
        Trip.id == trip_id
    ).first()

    if not trip:
        raise HTTPException(
            status_code=404,
            detail="Trip not found",
        )

    if trip.status != "assigned":
        raise HTTPException(
            status_code=400,
            detail="Only scheduled trips can receive new shipments.",
        )

    if (
        shipment.origin.strip().lower() != trip.origin.strip().lower()
        or shipment.destination.strip().lower()
        != trip.destination.strip().lower()
    ):
        raise HTTPException(
            status_code=409,
            detail="Shipment route does not match the selected trip."
        )

    old_trip_id = shipment.trip_id

    shipment.trip_id = trip.id
    shipment.status = "assigned"

    db.add(
        ShipmentStatusHistory(
            shipment_id=shipment.id,
            status="assigned",
            notes=f"Shipment assigned to Trip #{trip.id}.",
        )
    )

    try:
        db.commit()
        db.refresh(shipment)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to assign trip.",
        )

    return {
        "message": "Trip assigned successfully.",
        "shipment_id": shipment.id,
        "trip_id": shipment.trip_id,
        "previous_trip_id": old_trip_id,
        "status": shipment.status,
    }