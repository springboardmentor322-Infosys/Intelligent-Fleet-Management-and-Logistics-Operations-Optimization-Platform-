from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
from app.api.dependencies import get_db, require_roles
from app.api.shipments import validate_assignments
from app.api.routes import resolve_route
from app.models.trip import Trip, TripRouteHistory
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.trip import ShipmentEtaHistory
from app.models.gps_location import GPSLocation
from app.models.user import User
from app.models.vehicle import Vehicle
from app.schemas.trip import TripCreate, TripUpdate

router = APIRouter(prefix="/trips", tags=["Trips"])
FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")

def serialize(trip, db):
    return {"id":trip.id,"vehicle_id":trip.vehicle_id,"driver_id":trip.driver_id,"origin":trip.origin,"destination":trip.destination,
      "route_selection":trip.route_selection,"route_distance_km":trip.route_distance_km,"route_duration_minutes":trip.route_duration_minutes,
      "route_provider":trip.route_provider,"traffic_data":trip.traffic_data,"scheduled_departure":trip.scheduled_departure,
      "estimated_arrival":trip.estimated_arrival,"actual_departure":trip.actual_departure,"actual_arrival":trip.actual_arrival,
      "status":trip.status,"shipment_ids":list(db.scalars(select(Shipment.id).where(Shipment.trip_id==trip.id)).all())}

@router.post("", status_code=201)
def create_trip(payload: TripCreate, db: Session=Depends(get_db), user: User=Depends(require_roles(*FLEET_ROLES))):
    vehicle=db.get(Vehicle,payload.vehicle_id)
    if vehicle is None: raise HTTPException(404,"Vehicle not found")
    route=resolve_route(payload.origin,payload.destination,payload.route_selection)
    departure=payload.scheduled_departure
    if departure.tzinfo is None: departure=departure.replace(tzinfo=timezone.utc)
    arrival=departure+timedelta(minutes=route["duration_minutes"])
    validate_assignments(db,payload.vehicle_id,payload.driver_id,scheduled_departure=departure,estimated_arrival=arrival,status="assigned")
    if vehicle.status == "maintenance": raise HTTPException(409,"A vehicle in maintenance cannot be assigned to a trip")
    from app.models.driver import Driver
    driver=db.get(Driver,payload.driver_id)
    if driver is None: raise HTTPException(404,"Driver not found")
    if driver.license_expiry and driver.license_expiry < datetime.now(timezone.utc): raise HTTPException(409,"Driver license has expired")
    for active in db.scalars(select(Trip).where(Trip.status.in_(("scheduled","in_progress")), Trip.vehicle_id==payload.vehicle_id)).all():
        if departure < active.estimated_arrival and active.scheduled_departure < arrival:
            raise HTTPException(409,"Vehicle already has an overlapping trip")
    for active in db.scalars(select(Trip).where(Trip.status.in_(("scheduled","in_progress")), Trip.driver_id==payload.driver_id)).all():
        if departure < active.estimated_arrival and active.scheduled_departure < arrival:
            raise HTTPException(409,"Driver already has an overlapping trip")
    shipments=db.scalars(select(Shipment).where(Shipment.id.in_(payload.shipment_ids))).all() if payload.shipment_ids else []
    if len(shipments)!=len(set(payload.shipment_ids)): raise HTTPException(404,"One or more shipments not found")
    for shipment in shipments:
        if shipment.trip_id is not None: raise HTTPException(409,"A shipment is already assigned to a trip")
        if shipment.status in {"delivered","cancelled"}: raise HTTPException(409,"Terminal shipments cannot be assigned to a trip")
    if sum((shipment.weight for shipment in shipments), start=0) > vehicle.capacity:
        raise HTTPException(422,"Combined shipment weight exceeds vehicle capacity")
    trip=Trip(vehicle_id=payload.vehicle_id,driver_id=payload.driver_id,origin=payload.origin,destination=payload.destination,
      route_selection=payload.route_selection,route_distance_km=route["distance_km"],route_duration_minutes=route["duration_minutes"],
      route_provider=route["provider"],traffic_data=route["traffic_data"],scheduled_departure=departure,estimated_arrival=arrival)
    db.add(trip); db.flush()
    db.add(TripRouteHistory(trip_id=trip.id,route_selection=trip.route_selection,distance_km=trip.route_distance_km,duration_minutes=trip.route_duration_minutes,provider=trip.route_provider))
    for shipment in shipments:
        shipment.trip_id=trip.id; shipment.vehicle_id=trip.vehicle_id; shipment.driver_id=trip.driver_id
        if shipment.status=="pending":
            shipment.status="assigned"
            db.add(ShipmentStatusHistory(shipment_id=shipment.id,previous_status="pending",status="assigned",changed_by_user_id=user.id))
        shipment.estimated_arrival=arrival
        db.add(ShipmentEtaHistory(shipment_id=shipment.id,estimated_arrival=arrival,source="trip_schedule"))
    db.commit(); db.refresh(trip)
    return serialize(trip,db)

@router.get("")
def list_trips(db: Session=Depends(get_db), user: User=Depends(require_roles(*FLEET_ROLES))):
    return [serialize(t,db) for t in db.scalars(select(Trip).order_by(Trip.scheduled_departure)).all()]

@router.get("/{trip_id}")
def get_trip(trip_id:int,db:Session=Depends(get_db),user:User=Depends(require_roles(*FLEET_ROLES))):
    trip=db.get(Trip,trip_id)
    if trip is None: raise HTTPException(404,"Trip not found")
    return serialize(trip,db)

@router.get("/{trip_id}/history")
def route_history(trip_id:int,db:Session=Depends(get_db),user:User=Depends(require_roles(*FLEET_ROLES))):
    if db.get(Trip,trip_id) is None: raise HTTPException(404,"Trip not found")
    return db.scalars(select(TripRouteHistory).where(TripRouteHistory.trip_id==trip_id).order_by(TripRouteHistory.changed_at)).all()

@router.patch("/{trip_id}")
def update_trip(trip_id:int,payload:TripUpdate,db:Session=Depends(get_db),user:User=Depends(require_roles(*FLEET_ROLES))):
    trip=db.get(Trip,trip_id)
    if trip is None: raise HTTPException(404,"Trip not found")
    changes=payload.model_dump(exclude_unset=True)
    transitions={"scheduled":{"in_progress","cancelled"},"in_progress":{"completed","cancelled"},"completed":set(),"cancelled":set()}
    if "status" in changes and changes["status"]!=trip.status and changes["status"] not in transitions[trip.status]: raise HTTPException(409,"Invalid trip status transition")
    if "route_selection" in changes and changes["route_selection"]!=trip.route_selection:
        if trip.status not in {"scheduled","in_progress"}: raise HTTPException(409,"Completed or cancelled trips cannot change route")
        latest=db.scalar(select(GPSLocation).where(GPSLocation.vehicle_id==trip.vehicle_id).order_by(GPSLocation.recorded_at.desc(),GPSLocation.id.desc()).limit(1)) if trip.status=="in_progress" else None
        start=(float(latest.latitude),float(latest.longitude)) if latest else None
        route=resolve_route(trip.origin,trip.destination,changes["route_selection"],start_coordinates=start)
        trip.route_selection=changes["route_selection"]; trip.route_distance_km=route["distance_km"]; trip.route_duration_minutes=route["duration_minutes"]
        trip.route_provider=route["provider"]; trip.traffic_data=route["traffic_data"]
        trip.estimated_arrival=(datetime.now(timezone.utc) if trip.status=="in_progress" else trip.scheduled_departure)+timedelta(minutes=route["duration_minutes"])
        db.add(TripRouteHistory(trip_id=trip.id,route_selection=trip.route_selection,distance_km=trip.route_distance_km,duration_minutes=trip.route_duration_minutes,provider=trip.route_provider))
        for shipment in db.scalars(select(Shipment).where(Shipment.trip_id==trip.id)).all():
            shipment.estimated_arrival=trip.estimated_arrival
            db.add(ShipmentEtaHistory(shipment_id=shipment.id,estimated_arrival=trip.estimated_arrival,source="trip_route_change"))
    if changes.get("status")=="in_progress":
        trip.actual_departure=datetime.now(timezone.utc)
        for shipment in db.scalars(select(Shipment).where(Shipment.trip_id==trip.id)).all():
            if shipment.status=="assigned":
                shipment.status="in_transit"; db.add(ShipmentStatusHistory(shipment_id=shipment.id,previous_status="assigned",status="in_transit",changed_by_user_id=user.id))
    if changes.get("status")=="completed":
        trip.actual_arrival=datetime.now(timezone.utc)
        for shipment in db.scalars(select(Shipment).where(Shipment.trip_id==trip.id)).all():
            shipment.actual_arrival=trip.actual_arrival
            if shipment.status in {"in_transit","delayed"}:
                previous=shipment.status; shipment.status="delivered"
                db.add(ShipmentStatusHistory(shipment_id=shipment.id,previous_status=previous,status="delivered",changed_by_user_id=user.id))
    if "status" in changes: trip.status=changes["status"]
    db.commit(); db.refresh(trip)
    return serialize(trip,db)
