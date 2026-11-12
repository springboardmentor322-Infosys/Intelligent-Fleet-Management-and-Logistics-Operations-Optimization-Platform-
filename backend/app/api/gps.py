
import asyncio
import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.dependencies import get_db, require_roles
from app.models.gps_location import GPSLocation
from app.models.driver import Driver
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.trip import Trip
from app.models.shipment import Shipment
from app.schemas.gps import GPSIngestionRequest, GPSLocationAuthMessage, GPSLocationCreate, GPSLocationResponse
from app.core.security import decode_access_token
from app.core.config import settings
from app.services.tracking import publish_location, serialize_location, vehicle_location_hub
from datetime import datetime, timezone

router = APIRouter(prefix="/gps", tags=["GPS Tracking"])

FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")


def _require_vehicle_tracking_access(db: Session, user: User, vehicle: Vehicle) -> None:
    if user.role in FLEET_ROLES:
        return
    driver_id = db.scalar(select(Driver.id).where(Driver.user_id == user.id))
    operational_assignment = False
    if driver_id is not None:
        operational_assignment = bool(
            db.scalar(select(Trip.id).where(
                Trip.vehicle_id == vehicle.id,
                Trip.driver_id == driver_id,
                Trip.status.in_(("scheduled", "in_progress")),
            ).limit(1))
            or db.scalar(select(Shipment.id).where(
                Shipment.vehicle_id == vehicle.id,
                Shipment.driver_id == driver_id,
                Shipment.status.in_(("assigned", "in_transit", "delayed")),
            ).limit(1))
        )
    if user.role != "driver" or driver_id is None or (vehicle.assigned_driver_id != driver_id and not operational_assignment):
        raise HTTPException(status_code=403, detail="You may track only your currently assigned vehicle")

@router.get("/vehicles/{vehicle_id}/context")
def vehicle_tracking_context(vehicle_id:int,db:Session=Depends(get_db),current_user:User=Depends(require_roles(*FLEET_ROLES, "driver"))):
    vehicle = db.get(Vehicle,vehicle_id)
    if vehicle is None: raise HTTPException(404,"Vehicle not found")
    _require_vehicle_tracking_access(db, current_user, vehicle)
    trip=db.scalar(select(Trip).where(Trip.vehicle_id==vehicle_id,Trip.status.in_(("scheduled","in_progress"))).order_by(Trip.scheduled_departure).limit(1))
    if trip is None: return {"trip_id":None,"estimated_arrival":None,"shipments":[]}
    shipments=db.scalars(select(Shipment).where(Shipment.trip_id==trip.id)).all()
    return {"trip_id":trip.id,"estimated_arrival":trip.estimated_arrival,"shipments":[{"id":s.id,"tracking_number":s.tracking_number,"estimated_arrival":s.estimated_arrival,"status":s.status} for s in shipments]}


@router.post(
    "/vehicles/{vehicle_id}/locations",
    response_model=GPSLocationResponse,
    status_code=201,
)
async def record_location(
    vehicle_id: int,
    payload: GPSLocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    location = GPSLocation(
        vehicle_id=vehicle_id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed_kph=payload.speed_kph,
        heading_degrees=payload.heading_degrees,
        device_id=payload.device_id,
        device_connected=payload.device_connected,
        recorded_at=(payload.recorded_at.replace(tzinfo=timezone.utc) if payload.recorded_at and payload.recorded_at.tzinfo is None else payload.recorded_at) or datetime.now(timezone.utc),
        source=payload.source,
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    await publish_location(location, db)
    return location


@router.post("/ingest", response_model=GPSLocationResponse, status_code=201)
async def ingest_provider_location(
    payload: GPSIngestionRequest,
    db: Session = Depends(get_db),
    api_key: str | None = Header(default=None, alias="X-GPS-API-Key"),
):
    """Accept signed-by-configuration GPS provider/device readings; disabled until keyed."""
    configured_key = settings.GPS_INGESTION_API_KEY
    if not configured_key or len(configured_key) < 32:
        raise HTTPException(status_code=503, detail="GPS ingestion requires a configured key of at least 32 characters")
    if api_key is None or not hmac.compare_digest(api_key, configured_key):
        raise HTTPException(status_code=401, detail="Invalid GPS ingestion credentials")

    vehicle = db.get(Vehicle, payload.vehicle_id) if payload.vehicle_id is not None else None
    if payload.vehicle_id is not None and vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    if payload.device_id:
        device_vehicle = db.scalar(select(Vehicle).where(Vehicle.gps_device_id == payload.device_id))
        if device_vehicle is None:
            raise HTTPException(status_code=404, detail="GPS device is not registered to a vehicle")
        if vehicle is not None and device_vehicle.id != vehicle.id:
            raise HTTPException(status_code=422, detail="vehicle_id and device_id identify different vehicles")
        vehicle = device_vehicle
    if vehicle is None:
        raise HTTPException(status_code=422, detail="Provide a registered vehicle_id or device_id")

    location = GPSLocation(
        vehicle_id=vehicle.id,
        latitude=payload.latitude,
        longitude=payload.longitude,
        speed_kph=payload.speed_kph,
        heading_degrees=payload.heading_degrees,
        recorded_at=payload.recorded_at,
        source=payload.source,
        device_id=payload.device_id or vehicle.gps_device_id,
        device_connected=payload.device_connected,
    )
    db.add(location)
    db.commit()
    db.refresh(location)
    await publish_location(location, db)
    return location


@router.websocket("/ws/vehicles/{vehicle_id}")
async def stream_vehicle_locations(
    websocket: WebSocket,
    vehicle_id: int,
    db: Session = Depends(get_db),
):
    await websocket.accept()
    queue = None
    db_open = True
    try:
        try:
            auth_message = await asyncio.wait_for(websocket.receive_json(), timeout=5)
            token = GPSLocationAuthMessage.model_validate(auth_message).token
        except asyncio.TimeoutError:
            await websocket.close(code=1008, reason="Authentication required")
            return
        except (ValueError, TypeError):
            await websocket.close(code=1008, reason="Malformed authentication message")
            return
        try:
            payload = decode_access_token(token)
            user_id = int(payload["sub"])
        except Exception:
            await websocket.close(code=1008, reason="Invalid access token")
            return

        user = db.get(User, user_id)
        vehicle = db.get(Vehicle, vehicle_id)
        if user is None or not user.is_active:
            await websocket.close(code=1008, reason="Insufficient permission")
            return
        if vehicle is None:
            await websocket.close(code=1008, reason="Vehicle not found")
            return
        try:
            _require_vehicle_tracking_access(db, user, vehicle)
        except HTTPException:
            await websocket.close(code=1008, reason="Insufficient permission")
            return

        db.close()
        db_open = False

        queue = vehicle_location_hub.subscribe(vehicle_id)
        driver_scope = user.role == "driver"
        await websocket.send_json({"type": "ready", "vehicle_id": vehicle_id, "scope": "vehicle"})
        while True:
            try:
                location = await asyncio.wait_for(queue.get(), timeout=25)
                if driver_scope and location.get("type") == "location":
                    location = {**location, "location": {**location["location"], "device_id": None}}
                await websocket.send_json(location)
            except asyncio.TimeoutError:
                await websocket.send_json({"type": "ping"})
    except (WebSocketDisconnect, asyncio.TimeoutError, RuntimeError, OSError):
        pass
    finally:
        if queue is not None:
            vehicle_location_hub.unsubscribe(vehicle_id, queue)
        if db_open:
            db.close()


@router.get(
    "/vehicles/{vehicle_id}/latest",
    response_model=GPSLocationResponse,
)
def latest_location(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES, "driver")),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    _require_vehicle_tracking_access(db, current_user, vehicle)

    location = db.scalars(
        select(GPSLocation)
        .where(GPSLocation.vehicle_id == vehicle_id)
        .order_by(GPSLocation.recorded_at.desc(), GPSLocation.id.desc())
        .limit(1)
    ).first()

    if location is None:
        raise HTTPException(
            status_code=404,
            detail="No GPS locations recorded for this vehicle",
        )

    if current_user.role == "driver":
        return {**serialize_location(location), "device_id": None}
    return location


@router.get(
    "/vehicles/{vehicle_id}/history",
    response_model=list[GPSLocationResponse],
)
def location_history(
    vehicle_id: int,
    limit: int = Query(default=50, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES, "driver")),
):
    vehicle = db.get(Vehicle, vehicle_id)
    if vehicle is None:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    _require_vehicle_tracking_access(db, current_user, vehicle)

    locations = db.scalars(
        select(GPSLocation)
        .where(GPSLocation.vehicle_id == vehicle_id)
        .order_by(GPSLocation.recorded_at.desc(), GPSLocation.id.desc())
        .limit(limit)
    ).all()
    if current_user.role == "driver":
        return [{**serialize_location(location), "device_id": None} for location in locations]
    return locations

from app.models.shipment import Shipment
from app.services.gps_simulator import simulate_shipment_positions


@router.post("/shipments/{shipment_id}/simulate")
async def simulate_gps(
    shipment_id: int,
    points: int = Query(default=5, ge=2, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)

    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")

    locations = simulate_shipment_positions(
        db=db,
        shipment=shipment,
        points=points,
    )

    for location in locations:
        await publish_location(location, db)

    return {
        "shipment_id": shipment.id,
        "tracking_number": shipment.tracking_number,
        "vehicle_id": shipment.vehicle_id,
        "points_created": len(locations),
        "locations": [serialize_location(location) for location in locations],
        "simulation": True,
    }


from app.services.live_gps_simulator import (
    get_live_simulation_status,
    start_live_simulation,
    stop_live_simulation,
)


@router.post("/shipments/{shipment_id}/simulate-live")
async def start_live_gps(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)

    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")

    if shipment.vehicle_id is None:
        raise HTTPException(
            status_code=409,
            detail="Assign a vehicle before starting live GPS simulation",
        )

    started = start_live_simulation(shipment_id, 5)

    if not started:
        return {
            "message": "Live GPS simulation is already running",
            "shipment_id": shipment.id,
            "vehicle_id": shipment.vehicle_id,
        }

    return {
        "message": "Live GPS simulation started",
        "shipment_id": shipment.id,
        "tracking_number": shipment.tracking_number,
        "vehicle_id": shipment.vehicle_id,
        "interval_seconds": 5,
        "points_to_generate": 20,
    }


@router.post("/shipments/{shipment_id}/stop-live")
async def stop_live_gps(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)

    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")

    stopped = await stop_live_simulation(shipment_id)

    return {
        "message": (
            "Live GPS simulation stopped"
            if stopped
            else "No live GPS simulation is running"
        ),
        "shipment_id": shipment.id,
        "vehicle_id": shipment.vehicle_id,
        "stopped": stopped,
    }



@router.get("/shipments/{shipment_id}/simulation-status")
def live_gps_status(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)

    if shipment is None:
        raise HTTPException(status_code=404, detail="Shipment not found")

    status = get_live_simulation_status(shipment_id)

    return {
        "shipment_id": shipment.id,
        "vehicle_id": shipment.vehicle_id,
        **status,
    }
import asyncio

from fastapi import WebSocket, WebSocketDisconnect
