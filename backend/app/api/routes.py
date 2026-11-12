
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select

from app.models.user import User
from app.api.dependencies import get_db, require_roles
from app.models.shipment import Shipment
from app.models.driver import Driver
from sqlalchemy.orm import Session
from app.services.geocoding import geocode_address
from app.api.shipments import validate_assignments
from app.models.trip import ShipmentEtaHistory
from app.models.gps_location import GPSLocation

router = APIRouter(prefix="/routes", tags=["Route Planning"])

FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"



def get_road_route(
    origin_lat: float,
    origin_lon: float,
    destination_lat: float,
    destination_lon: float,
) -> dict:
    coordinates = (
        f"{origin_lon},{origin_lat};"
        f"{destination_lon},{destination_lat}"
    )

    try:
        response = httpx.get(
            f"{OSRM_URL}/{coordinates}",
            params={
                "overview": "false",
                "alternatives": "true",
                "steps": "false",
            },
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Routing service is temporarily unavailable",
        )

    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(
            status_code=422,
            detail="No drivable route found for these coordinates",
        )

    routes = data["routes"]
    route = min(routes, key=lambda candidate: candidate["duration"])

    duration_seconds = route["duration"]
    shortest_route = min(data["routes"], key=lambda candidate: candidate["distance"])

    options = [
        {"id": index, "distance_km": round(item["distance"] / 1000, 2),
         "duration_minutes": round(item["duration"] / 60, 1)}
        for index, item in enumerate(routes)
    ]
    return {
        "distance_km": round(route["distance"] / 1000, 2),
        "shortest_distance_km": round(shortest_route["distance"] / 1000, 2),
        "fastest_route_distance_km": round(route["distance"] / 1000, 2),
        "duration_minutes": round(duration_seconds / 60, 1),
        "estimated_arrival_utc": (
            datetime.now(timezone.utc)
            + timedelta(seconds=duration_seconds)
        ).isoformat(),
        "traffic_aware": False,
        "provider": "OSRM",
        "alternatives_found": len(data["routes"]),
        "alternative_routes_count": max(0, len(data["routes"]) - 1),
        "route_selection": "fastest_available",
        "traffic_data": "unavailable",
        "route_options": options,
        "shortest_route": min(options,key=lambda option:option["distance_km"]),
        "fastest_route": min(options,key=lambda option:option["duration_minutes"]),
    }


def resolve_route(origin: str, destination: str, selection: str, start_coordinates: tuple[float, float] | None = None) -> dict:
    origin_lat, origin_lon = start_coordinates or geocode_address(origin)
    destination_lat, destination_lon = geocode_address(destination)
    coordinates=f"{origin_lon},{origin_lat};{destination_lon},{destination_lat}"
    try:
        response=httpx.get(f"{OSRM_URL}/{coordinates}",params={"overview":"false","alternatives":"true","steps":"false"},timeout=15.0)
        response.raise_for_status(); data=response.json()
    except (httpx.HTTPError,ValueError):
        raise HTTPException(502,"Routing service is temporarily unavailable")
    if data.get("code")!="Ok" or not data.get("routes"): raise HTTPException(422,"No drivable route found for these coordinates")
    candidates=data["routes"]
    route=min(candidates,key=lambda x:x["distance"] if selection=="shortest" else x["duration"])
    return {"distance_km":round(route["distance"]/1000,2),"duration_minutes":round(route["duration"]/60,1),"provider":"OSRM","traffic_data":"unavailable"}



@router.get("/plan")
def plan_route(
    origin_lat: float | None = Query(default=None, ge=-90, le=90),
    origin_lon: float | None = Query(default=None, ge=-180, le=180),
    destination_lat: float | None = Query(default=None, ge=-90, le=90),
    destination_lon: float | None = Query(default=None, ge=-180, le=180),
    origin: str | None = Query(default=None, min_length=1, max_length=255),
    destination: str | None = Query(default=None, min_length=1, max_length=255),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    coordinate_values = (
        origin_lat, origin_lon, destination_lat, destination_lon
    )

    if all(value is not None for value in coordinate_values):
        start_lat, start_lon, end_lat, end_lon = coordinate_values
    elif all(value is None for value in coordinate_values):
        if not origin or not destination:
            raise HTTPException(
                status_code=422,
                detail="Provide either all four coordinates or both addresses",
            )

        start_lat, start_lon = geocode_address(origin)
        end_lat, end_lon = geocode_address(destination)
    else:
        raise HTTPException(
            status_code=422,
            detail="Provide all four coordinates together, or use addresses",
        )

    result = get_road_route(
        start_lat, start_lon, end_lat, end_lon
    )
    result["shortest_route"] = min(result["route_options"], key=lambda option: option["distance_km"])
    result["fastest_route"] = min(result["route_options"], key=lambda option: option["duration_minutes"])
    result["origin"] = origin or {
        "latitude": start_lat,
        "longitude": start_lon,
    }
    result["destination"] = destination or {
        "latitude": end_lat,
        "longitude": end_lon,
    }
    return result


@router.get("/shipments/{shipment_id}")
def plan_shipment_route(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES, "driver")),
):
    shipment = db.get(Shipment, shipment_id)

    if shipment is None:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found",
        )

    if current_user.role == "driver":
        driver = db.scalar(select(Driver).where(Driver.user_id == current_user.id))
        if driver is None or shipment.driver_id != driver.id:
            raise HTTPException(status_code=404, detail="Shipment not found")

    origin_lat, origin_lon = geocode_address(shipment.origin)
    use_remaining_route = shipment.status in {"in_transit", "delayed"} and shipment.vehicle_id is not None
    latest = None
    if use_remaining_route:
        latest = db.scalar(select(GPSLocation).where(GPSLocation.vehicle_id==shipment.vehicle_id).order_by(GPSLocation.recorded_at.desc(),GPSLocation.id.desc()).limit(1))
    if latest is not None:
        origin_lat, origin_lon = float(latest.latitude), float(latest.longitude)
    destination_lat, destination_lon = geocode_address(
        shipment.destination
    )

    result = get_road_route(
        origin_lat,
        origin_lon,
        destination_lat,
        destination_lon,
    )

    return {
        "shipment_id": shipment.id,
        "tracking_number": shipment.tracking_number,
        "status": shipment.status,
        "origin": shipment.origin,
        "destination": shipment.destination,
        **result,
    }


@router.post("/shipments/{shipment_id}/calculate-eta")
def calculate_shipment_eta(
    shipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    shipment = db.get(Shipment, shipment_id)

    if shipment is None:
        raise HTTPException(
            status_code=404,
            detail="Shipment not found",
        )

    if shipment.scheduled_departure is None:
        raise HTTPException(
            status_code=409,
            detail="Set a scheduled departure before calculating ETA",
        )

    origin_lat, origin_lon = geocode_address(shipment.origin)
    latest = None
    if shipment.status in {"in_transit", "delayed"} and shipment.vehicle_id is not None:
        latest = db.scalar(select(GPSLocation).where(GPSLocation.vehicle_id==shipment.vehicle_id).order_by(GPSLocation.recorded_at.desc(),GPSLocation.id.desc()).limit(1))
        if latest is not None:
            origin_lat, origin_lon = float(latest.latitude), float(latest.longitude)
    destination_lat, destination_lon = geocode_address(
        shipment.destination
    )

    route = get_road_route(
        origin_lat,
        origin_lon,
        destination_lat,
        destination_lon,
    )

    departure = shipment.scheduled_departure

    # Treat timezone-naive values as UTC; preserve explicit timezones.
    if departure.tzinfo is None:
        departure = departure.replace(tzinfo=timezone.utc)

    arrival = (datetime.now(timezone.utc) if latest is not None else departure) + timedelta(minutes=route["duration_minutes"])

    if latest is None:
        validate_assignments(
            db, shipment.vehicle_id, shipment.driver_id, weight=shipment.weight,
            scheduled_departure=departure, estimated_arrival=arrival,
            status=shipment.status, exclude_shipment_id=shipment.id,
        )

    shipment.estimated_arrival = arrival
    db.add(ShipmentEtaHistory(shipment_id=shipment.id, estimated_arrival=arrival, source="osrm_remaining_route" if latest is not None else "osrm_scheduled_route"))
    shipment.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(shipment)

    return {
        "shipment_id": shipment.id,
        "tracking_number": shipment.tracking_number,
        "scheduled_departure": shipment.scheduled_departure,
        "estimated_arrival": shipment.estimated_arrival,
        "distance_km": route["distance_km"],
        "duration_minutes": route["duration_minutes"],
        "provider": route["provider"],
        "traffic_aware": route["traffic_aware"],
        "alternative_routes_count": route["alternative_routes_count"],
        "traffic_data": route["traffic_data"],
        "estimate_basis": "current_location_remaining_route" if latest is not None else "scheduled_departure_full_route",
    }
