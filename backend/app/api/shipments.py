
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.driver import Driver
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.trip import ShipmentEtaHistory
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.shipment import (
    ShipmentCreate,
    ShipmentResponse,
    ShipmentStatusHistoryResponse,
    ShipmentUpdate,
)

router = APIRouter(prefix="/shipments", tags=["Shipments"])

FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")


def validate_assignments(
    db: Session,
    vehicle_id: int | None,
    driver_id: int | None,
    *,
    weight=None,
    scheduled_departure=None,
    estimated_arrival=None,
    status: str = "pending",
    exclude_shipment_id: int | None = None,
) -> None:
    vehicle = db.get(Vehicle, vehicle_id) if vehicle_id is not None else None
    driver = db.get(Driver, driver_id) if driver_id is not None else None
    if vehicle_id is not None and vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if driver_id is not None and driver is None:
        raise HTTPException(status_code=404, detail="Driver not found")
    if status not in {"assigned", "in_transit", "delayed"}:
        return
    if vehicle is not None:
        if vehicle.status == "maintenance":
            raise HTTPException(status_code=409, detail="A vehicle in maintenance cannot be assigned to an active shipment")
        if weight is not None and weight > vehicle.capacity:
            raise HTTPException(status_code=422, detail="Shipment weight exceeds vehicle capacity")
    if driver is not None and driver.license_expiry is not None:
        expiry = driver.license_expiry
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if expiry < datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="Driver license has expired")

    if vehicle_id is None and driver_id is None:
        return
    query = select(Shipment).where(
        Shipment.status.in_(("assigned", "in_transit")),
        Shipment.id != (exclude_shipment_id or -1),
    )
    if vehicle_id is not None:
        query = query.where(Shipment.vehicle_id == vehicle_id)
    if driver_id is not None:
        query = query.where(Shipment.driver_id == driver_id)
    for existing in db.scalars(query).all():
        same_vehicle = vehicle_id is not None and existing.vehicle_id == vehicle_id
        same_driver = driver_id is not None and existing.driver_id == driver_id
        if not same_vehicle and not same_driver:
            continue
        candidate_start = scheduled_departure
        candidate_end = estimated_arrival
        existing_start = existing.scheduled_departure
        existing_end = existing.estimated_arrival
        if all((candidate_start, candidate_end, existing_start, existing_end)):
            normalize = lambda value: value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)
            if normalize(candidate_start) >= normalize(existing_end) or normalize(existing_start) >= normalize(candidate_end):
                continue
        resource = "vehicle" if same_vehicle else "driver"
        raise HTTPException(status_code=409, detail=f"The {resource} already has an overlapping active shipment")


@router.post(
    "",
    response_model=ShipmentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_shipment(
    payload: ShipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    assigned_status = "assigned" if payload.vehicle_id is not None or payload.driver_id is not None else "pending"
    validate_assignments(
        db, payload.vehicle_id, payload.driver_id, weight=payload.weight,
        scheduled_departure=payload.scheduled_departure, status=assigned_status,
    )

    shipment = Shipment(
        **payload.model_dump(),
        status=(
            assigned_status
        ),
    )
    db.add(shipment)
    db.flush()
    db.add(ShipmentStatusHistory(
        shipment_id=shipment.id,
        previous_status=None,
        status=assigned_status,
        changed_by_user_id=current_user.id,
    ))

    try:
        db.commit()
        db.refresh(shipment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Tracking number already exists or shipment data conflicts",
        )

    return shipment


@router.get("", response_model=list[ShipmentResponse])
def list_shipments(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    return db.scalars(
        select(Shipment).order_by(Shipment.id.desc())
    ).all()


@router.get("/{shipment_id}", response_model=ShipmentResponse)
def get_shipment(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return shipment


@router.get("/{shipment_id}/history", response_model=list[ShipmentStatusHistoryResponse])
def shipment_history(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    if db.get(Shipment, shipment_id) is None:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return db.scalars(
        select(ShipmentStatusHistory)
        .where(ShipmentStatusHistory.shipment_id == shipment_id)
        .order_by(ShipmentStatusHistory.changed_at, ShipmentStatusHistory.id)
    ).all()

@router.get("/{shipment_id}/eta-history")
def shipment_eta_history(shipment_id:int,db:Session=Depends(get_db),current_user:User=Depends(require_roles(*FLEET_ROLES))):
    if db.get(Shipment,shipment_id) is None: raise HTTPException(404,"Shipment not found")
    return db.scalars(select(ShipmentEtaHistory).where(ShipmentEtaHistory.shipment_id==shipment_id).order_by(ShipmentEtaHistory.created_at,ShipmentEtaHistory.id)).all()


@router.patch("/{shipment_id}", response_model=ShipmentResponse)
def update_shipment(
    shipment_id: int,
    payload: ShipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)
    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")

    changes = payload.model_dump(exclude_unset=True)
    if shipment.status in {"delivered", "cancelled"} and any(
        field in changes for field in ("vehicle_id", "driver_id")
    ):
        raise HTTPException(status_code=409, detail="A terminal shipment cannot be reassigned")
    
    scheduled_departure = changes.get(
        "scheduled_departure", shipment.scheduled_departure
    )
    estimated_arrival = changes.get(
        "estimated_arrival", shipment.estimated_arrival
    )

    if scheduled_departure is not None and estimated_arrival is not None:
        normalized_departure = scheduled_departure.replace(tzinfo=timezone.utc) if scheduled_departure.tzinfo is None else scheduled_departure.astimezone(timezone.utc)
        normalized_arrival = estimated_arrival.replace(tzinfo=timezone.utc) if estimated_arrival.tzinfo is None else estimated_arrival.astimezone(timezone.utc)
        if normalized_arrival <= normalized_departure:
            raise HTTPException(
                status_code=422,
                detail="Estimated arrival must be after scheduled departure",
            )

    if "status" in changes and changes["status"] is None:
        raise HTTPException(status_code=422, detail="Status cannot be null")

    if changes.get("status") == "delivered" and shipment.status == "cancelled":
        raise HTTPException(
            status_code=409,
            detail="A cancelled shipment cannot be delivered",
        )

    requested_status = changes.get("status", shipment.status)
    if requested_status == "pending" and (
        "vehicle_id" in changes or "driver_id" in changes
    ) and (changes.get("vehicle_id", shipment.vehicle_id) is not None or changes.get("driver_id", shipment.driver_id) is not None):
        requested_status = "assigned"
    allowed_transitions = {
        "pending": {"assigned", "cancelled"},
        "assigned": {"pending", "in_transit", "cancelled"},
        "in_transit": {"delayed", "delivered", "cancelled"},
        "delayed": {"in_transit", "delivered", "cancelled"},
        "delivered": set(),
        "cancelled": set(),
    }
    if requested_status != shipment.status and requested_status not in allowed_transitions.get(shipment.status, set()):
        raise HTTPException(status_code=409, detail=f"Cannot change shipment status from {shipment.status} to {requested_status}")

    merged_vehicle = changes.get("vehicle_id", shipment.vehicle_id)
    merged_driver = changes.get("driver_id", shipment.driver_id)
    merged_weight = changes.get("weight", shipment.weight)
    merged_departure = changes.get("scheduled_departure", shipment.scheduled_departure)
    merged_arrival = changes.get("estimated_arrival", shipment.estimated_arrival)
    if requested_status == "in_transit" and (merged_vehicle is None or merged_driver is None):
        raise HTTPException(status_code=409, detail="Assign both a vehicle and driver before dispatching a shipment")
    if any(key in changes for key in ("vehicle_id", "driver_id", "weight", "scheduled_departure", "estimated_arrival", "status")):
        validate_assignments(
            db, merged_vehicle, merged_driver, weight=merged_weight,
            scheduled_departure=merged_departure, estimated_arrival=merged_arrival,
            status=requested_status, exclude_shipment_id=shipment.id,
        )

    previous_status = shipment.status
    previous_eta = shipment.estimated_arrival
    for field, value in changes.items():
        setattr(shipment, field, value)
    if "estimated_arrival" in changes and changes["estimated_arrival"] is not None and changes["estimated_arrival"] != previous_eta:
        db.add(ShipmentEtaHistory(shipment_id=shipment.id,estimated_arrival=changes["estimated_arrival"],source="shipment_update"))

    if (
        "vehicle_id" in changes or "driver_id" in changes
    ) and shipment.status == "pending" and (
        shipment.vehicle_id is not None or shipment.driver_id is not None
    ):
        shipment.status = "assigned"
    elif (
        shipment.status == "assigned"
        and shipment.vehicle_id is None
        and shipment.driver_id is None
        and ("vehicle_id" in changes or "driver_id" in changes)
    ):
        shipment.status = "pending"

    shipment.updated_at = datetime.now(timezone.utc)
    if shipment.status == "delivered" and previous_status != "delivered":
        shipment.actual_arrival = datetime.now(timezone.utc)
    if shipment.status != previous_status:
        db.add(ShipmentStatusHistory(
            shipment_id=shipment.id,
            previous_status=previous_status,
            status=shipment.status,
            changed_by_user_id=current_user.id,
        ))

    try:
        db.commit()
        db.refresh(shipment)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Shipment update conflicts with existing data",
        )

    return shipment
