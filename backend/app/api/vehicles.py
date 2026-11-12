
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.driver import Driver
from app.models.shipment import Shipment
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.vehicle import (
    VehicleCreate,
    VehicleResponse,
    VehicleUpdate,
)

router = APIRouter(prefix="/vehicles", tags=["Vehicles"])

FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")


@router.post(
    "",
    response_model=VehicleResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    if payload.assigned_driver_id is not None:
        driver = db.get(Driver, payload.assigned_driver_id)
        if not driver:
            raise HTTPException(
                status_code=404,
                detail="Assigned driver not found",
            )
        if db.scalar(select(Vehicle).where(Vehicle.assigned_driver_id == payload.assigned_driver_id)):
            raise HTTPException(status_code=409, detail="Driver is already assigned to another vehicle")

    vehicle = Vehicle(**payload.model_dump())
    db.add(vehicle)

    try:
        db.commit()
        db.refresh(vehicle)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Vehicle ID or registration number already exists",
        )

    return vehicle


@router.get("", response_model=list[VehicleResponse])
def list_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    return db.scalars(select(Vehicle).order_by(Vehicle.id)).all()


@router.get("/{vehicle_id}", response_model=VehicleResponse)
def get_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    return vehicle


@router.patch("/{vehicle_id}", response_model=VehicleResponse)
def update_vehicle(
    vehicle_id: int,
    payload: VehicleUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    changes = payload.model_dump(exclude_unset=True)

    if (
        "assigned_driver_id" in changes
        and changes["assigned_driver_id"] is not None
        and not db.get(Driver, changes["assigned_driver_id"])
    ):
        raise HTTPException(status_code=404, detail="Assigned driver not found")

    if "assigned_driver_id" in changes and changes["assigned_driver_id"] is not None:
        other_vehicle = db.scalar(select(Vehicle).where(
            Vehicle.assigned_driver_id == changes["assigned_driver_id"],
            Vehicle.id != vehicle.id,
        ))
        if other_vehicle:
            raise HTTPException(status_code=409, detail="Driver is already assigned to another vehicle")

    if changes.get("status") == "maintenance":
        active_shipment = db.scalar(select(Shipment.id).where(
            Shipment.vehicle_id == vehicle.id,
            Shipment.status.in_(("assigned", "in_transit")),
        ).limit(1))
        if active_shipment:
            raise HTTPException(status_code=409, detail="Vehicle has an active shipment and cannot enter maintenance")

    new_capacity = changes.get("capacity", vehicle.capacity)
    overweight_shipment = db.scalar(select(Shipment.id).where(
        Shipment.vehicle_id == vehicle.id,
        Shipment.status.in_(("assigned", "in_transit")),
        Shipment.weight > new_capacity,
    ).limit(1))
    if overweight_shipment:
        raise HTTPException(status_code=409, detail="Capacity cannot be reduced below an active shipment's weight")

    for field, value in changes.items():
        setattr(vehicle, field, value)

    try:
        db.commit()
        db.refresh(vehicle)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Registration number already exists",
        )

    return vehicle
