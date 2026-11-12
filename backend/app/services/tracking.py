import asyncio
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import asin, cos, radians, sin, sqrt

from sqlalchemy import select

from app.models.shipment import Shipment
from app.models.trip import ShipmentEtaHistory, Trip, TripEtaHistory


class VehicleLocationHub:
    """In-process fanout for connected tracking clients on one API worker."""

    def __init__(self):
        self._subscribers: dict[int, set[asyncio.Queue]] = defaultdict(set)

    def subscribe(self, vehicle_id: int) -> asyncio.Queue:
        queue = asyncio.Queue(maxsize=100)
        self._subscribers[vehicle_id].add(queue)
        return queue

    def unsubscribe(self, vehicle_id: int, queue: asyncio.Queue) -> None:
        subscribers = self._subscribers.get(vehicle_id)
        if subscribers is None:
            return
        subscribers.discard(queue)
        if not subscribers:
            self._subscribers.pop(vehicle_id, None)

    async def publish(self, vehicle_id: int, location: dict) -> None:
        for queue in tuple(self._subscribers.get(vehicle_id, ())):
            if queue.full():
                try:
                    queue.get_nowait()
                except asyncio.QueueEmpty:
                    pass
            queue.put_nowait(location)


vehicle_location_hub = VehicleLocationHub()

_eta_recalculation_state: dict[int, tuple[datetime, float, float, int]] = {}


def serialize_location(location) -> dict:
    return {
        "id": location.id,
        "vehicle_id": location.vehicle_id,
        "latitude": float(location.latitude),
        "longitude": float(location.longitude),
        "speed_kph": float(location.speed_kph) if location.speed_kph is not None else None,
        "heading_degrees": float(location.heading_degrees) if location.heading_degrees is not None else None,
        "device_id": location.device_id,
        "device_connected": location.device_connected,
        "recorded_at": location.recorded_at.isoformat(),
        "timestamp": location.recorded_at.isoformat(),
        "source": location.source,
        "is_simulated": location.source == "simulated",
    }


def _distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius = 6_371_000
    d_lat, d_lon = radians(lat2 - lat1), radians(lon2 - lon1)
    value = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lon / 2) ** 2
    return 2 * earth_radius * asin(sqrt(value))


def recalculate_trip_eta_if_due(db, location, now: datetime | None = None) -> dict | None:
    """Refresh an in-progress trip ETA at most once per 30s, or after 500m/120s."""
    trip = db.scalar(select(Trip).where(Trip.vehicle_id == location.vehicle_id, Trip.status == "in_progress").limit(1))
    if trip is None:
        return None
    now = now or datetime.now(timezone.utc)
    previous = _eta_recalculation_state.get(location.vehicle_id)
    latitude, longitude = float(location.latitude), float(location.longitude)
    same_trip = previous is not None and previous[3] == trip.id
    distance = _distance_meters(previous[1], previous[2], latitude, longitude) if same_trip else float("inf")
    elapsed = (now - previous[0]).total_seconds() if same_trip else float("inf")
    if previous and (elapsed < 30 or (elapsed < 120 and distance < 500)):
        return None
    # Record the attempt time before calling the external provider so failures are throttled too.
    _eta_recalculation_state[location.vehicle_id] = (now, latitude, longitude, trip.id)
    try:
        from app.api.routes import get_road_route
        from app.services.geocoding import geocode_address

        destination_lat, destination_lon = geocode_address(trip.destination)
        route = get_road_route(latitude, longitude, destination_lat, destination_lon)
    except Exception:
        return {"type": "eta_unavailable", "vehicle_id": location.vehicle_id, "trip_id": trip.id,
                "reason": "Routing provider is unavailable; the saved ETA was not changed."}

    arrival = now + timedelta(minutes=route["duration_minutes"])
    old_eta = trip.estimated_arrival
    if old_eta is not None and old_eta.tzinfo is None:
        old_eta = old_eta.replace(tzinfo=timezone.utc)
    changed_by_at_least_minute = old_eta is None or abs((arrival - old_eta).total_seconds()) >= 60
    if not changed_by_at_least_minute:
        return None

    trip.estimated_arrival = arrival
    db.add(TripEtaHistory(trip_id=trip.id, estimated_arrival=arrival,
                          remaining_duration_minutes=route["duration_minutes"], location_id=location.id,
                          provider=route["provider"], traffic_data=route["traffic_data"]))
    for shipment in db.scalars(select(Shipment).where(Shipment.trip_id == trip.id)).all():
        shipment.estimated_arrival = arrival
        db.add(ShipmentEtaHistory(shipment_id=shipment.id, estimated_arrival=arrival,
                                  source="gps_remaining_route"))
    try:
        db.commit()
    except Exception:
        db.rollback()
        return {"type": "eta_unavailable", "vehicle_id": location.vehicle_id, "trip_id": trip.id,
                "reason": "ETA could not be saved; the previous ETA was retained."}
    return {"type": "eta", "vehicle_id": location.vehicle_id, "trip_id": trip.id,
            "estimated_arrival": arrival.isoformat(), "remaining_duration_minutes": route["duration_minutes"],
            "provider": route["provider"], "traffic_data": route["traffic_data"]}


async def publish_location(location, db=None) -> None:
    """Broadcast one canonical persisted location, then an ETA revision if due."""
    from app.schemas.gps import GPSLocationEvent

    event = GPSLocationEvent.from_location(location)
    await vehicle_location_hub.publish(location.vehicle_id, event.model_dump(mode="json"))
    if db is not None:
        eta_event = recalculate_trip_eta_if_due(db, location)
        if eta_event is not None:
            await vehicle_location_hub.publish(location.vehicle_id, eta_event)
