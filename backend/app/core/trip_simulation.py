
import asyncio
import math
import time
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.models.trip import Trip
from app.models.driver import Driver
from app.models.vehicle import Vehicle
from app.models.driver_location import DriverLocation
from app.core.location_connections import location_manager


# ============================================================
# SIMULATION CONFIGURATION
# ============================================================

SIMULATION_INTERVAL_SECONDS = 1
DEFAULT_SIMULATION_DURATION_MINUTES = 5
SIMULATION_ACCURACY_METERS = 5.0

EARTH_RADIUS_KM = 6371.0

# Stores independent simulation states for each trip.
_trip_simulation_states = {}

def initialize_trip_simulation(trip_id: int):
    """Initialize a new trip simulation."""

    _trip_simulation_states[trip_id] = {
        "start_time": time.monotonic(),
        "elapsed_before_pause": 0,
        "paused": False,
    }


# ============================================================
# PAUSE AND RESUME
# ============================================================

def pause_trip_simulation(trip_id: int):
    """Pause simulation without losing elapsed progress."""

    state = _trip_simulation_states.get(trip_id)

    if state is None or state["paused"]:
        return

    state["elapsed_before_pause"] = (
        time.monotonic() - state["start_time"]
    )

    state["paused"] = True


def resume_trip_simulation(trip_id: int):
    """Resume simulation from its previous progress."""

    state = _trip_simulation_states.get(trip_id)

    if state is None or not state["paused"]:
        return

    state["start_time"] = (
        time.monotonic() - state["elapsed_before_pause"]
    )

    state["paused"] = False


# ============================================================
# DISTANCE CALCULATION
# ============================================================

def calculate_distance_km(point1, point2):

    lat1, lon1 = point1
    lat2, lon2 = point2

    lat1 = math.radians(lat1)
    lat2 = math.radians(lat2)

    delta_lat = lat2 - lat1
    delta_lon = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat1)
        * math.cos(lat2)
        * math.sin(delta_lon / 2) ** 2
    )

    return 2 * EARTH_RADIUS_KM * math.asin(
        math.sqrt(max(0.0, min(1.0, a)))
    )


# ============================================================
# ROUTE DISTANCES
# ============================================================

def calculate_route_distances(coordinates):

    cumulative_distances = [0.0]

    for index in range(len(coordinates) - 1):

        distance = calculate_distance_km(
            coordinates[index],
            coordinates[index + 1],
        )

        cumulative_distances.append(
            cumulative_distances[-1] + distance
        )

    return cumulative_distances


# ============================================================
# ROUTE INTERPOLATION
# ============================================================

def interpolate_route_position(
    coordinates,
    cumulative_distances,
    travelled_distance,
):

    total_distance = cumulative_distances[-1]

    if total_distance <= 0:
        return coordinates[-1]

    travelled_distance = max(
        0.0,
        min(travelled_distance, total_distance),
    )

    for index in range(len(coordinates) - 1):

        segment_start = cumulative_distances[index]
        segment_end = cumulative_distances[index + 1]

        if travelled_distance <= segment_end:

            segment_distance = (
                segment_end - segment_start
            )

            if segment_distance <= 0:
                return coordinates[index + 1]

            fraction = (
                travelled_distance - segment_start
            ) / segment_distance

            lat1, lon1 = coordinates[index]
            lat2, lon2 = coordinates[index + 1]

            latitude = lat1 + fraction * (lat2 - lat1)
            longitude = lon1 + fraction * (lon2 - lon1)

            return latitude, longitude

    return coordinates[-1]


# ============================================================
# INITIALIZE SIMULATION STATE
# ============================================================

def initialize_simulation(trip_id):

    if trip_id not in _trip_simulation_states:

        _trip_simulation_states[trip_id] = {
            "start_time": time.monotonic(),
            "elapsed_before_pause": 0.0,
            "paused": False,
        }

    return _trip_simulation_states[trip_id]


# ============================================================
# ACTIVE TRIP PROCESSING
# ============================================================

def process_active_trips(db: Session):

    active_trips = (
        db.query(Trip)
        .filter(Trip.status == "in_progress")
        .all()
    )

    location_updates = []

    active_trip_ids = {
        trip.id for trip in active_trips
    }

    # Remove inactive trip simulation states.
    for trip_id in list(_trip_simulation_states):

        if trip_id not in active_trip_ids:
            _trip_simulation_states.pop(trip_id, None)

    for trip in active_trips:

        # Initialize simulation automatically when a trip
        # enters in_progress status.
        simulation_state = initialize_simulation(trip.id)

        # Do not update a paused trip.
        if simulation_state["paused"]:
            continue

        # ----------------------------------------------------
        # VALIDATE ROUTE
        # ----------------------------------------------------

        coordinates = trip.selected_route_coordinates

        if not isinstance(coordinates, list) or len(coordinates) < 2:
            continue

        try:

            coordinates = [
                (float(point[0]), float(point[1]))
                for point in coordinates
                if isinstance(point, (list, tuple))
                and len(point) >= 2
            ]

        except (TypeError, ValueError, IndexError):
            continue

        if len(coordinates) < 2:
            continue

        # ----------------------------------------------------
        # GET DRIVER AND VEHICLE
        # ----------------------------------------------------

        driver = db.query(Driver).filter(
            Driver.id == trip.driver_id
        ).first()

        vehicle = db.query(Vehicle).filter(
            Vehicle.id == trip.vehicle_id
        ).first()

        if driver is None or vehicle is None:
            continue

        # ----------------------------------------------------
        # CALCULATE ROUTE DISTANCE
        # ----------------------------------------------------

        cumulative_distances = calculate_route_distances(
            coordinates
        )

        total_distance = cumulative_distances[-1]

        if total_distance <= 0:
            continue

        # ----------------------------------------------------
        # SIMULATION TIME
        # ----------------------------------------------------

        duration_minutes = (
            trip.estimated_duration_minutes
            or DEFAULT_SIMULATION_DURATION_MINUTES
        )

        duration_seconds = max(
            float(duration_minutes) * 60,
            1.0,
        )

        elapsed_seconds = (
            time.monotonic() - simulation_state["start_time"]
        )

        progress = min(
            elapsed_seconds / duration_seconds,
            1.0,
        )

        # ----------------------------------------------------
        # VEHICLE POSITION
        # ----------------------------------------------------

        travelled_distance = total_distance * progress

        remaining_distance = max(
            total_distance - travelled_distance,
            0.0,
        )

        latitude, longitude = interpolate_route_position(
            coordinates,
            cumulative_distances,
            travelled_distance,
        )

        now = datetime.now(timezone.utc)

        # ----------------------------------------------------
        # UPDATE DRIVER LOCATION
        # ----------------------------------------------------

        driver_location = db.query(DriverLocation).filter(
            DriverLocation.driver_id == driver.id
        ).first()

        if driver_location is None:

            driver_location = DriverLocation(
                driver_id=driver.id,
                latitude=latitude,
                longitude=longitude,
                accuracy=SIMULATION_ACCURACY_METERS,
                is_simulated=True,
                updated_at=now,
            )

            db.add(driver_location)

        else:

            driver_location.latitude = latitude
            driver_location.longitude = longitude

            driver_location.accuracy = (
                SIMULATION_ACCURACY_METERS
            )

            driver_location.is_simulated = True
            driver_location.updated_at = now

        # ----------------------------------------------------
        # PROGRESS INFORMATION
        # ----------------------------------------------------

        estimated_remaining_minutes = (
            remaining_distance / total_distance
        ) * duration_minutes

        location_message = {
            "driver_id": driver.id,
            "trip_id": trip.id,

            "latitude": latitude,
            "longitude": longitude,

            "accuracy": SIMULATION_ACCURACY_METERS,

            "updated_at": now.isoformat(),

            "is_simulated": True,

            "progress_percentage": round(
                progress * 100, 1
            ),

            "speed_kmh": round(
                total_distance / duration_seconds * 3600,
                2,
            ),

            "remaining_distance_km": round(
                remaining_distance, 2
            ),

            "estimated_remaining_minutes": round(
                estimated_remaining_minutes, 1
            ),

            "trip_status": trip.status,
        }

        # ----------------------------------------------------
        # AUTOMATIC TRIP COMPLETION
        # ----------------------------------------------------

        if progress >= 1.0:

            # Ensure final location is exactly the destination.
            latitude, longitude = coordinates[-1]

            driver_location.latitude = latitude
            driver_location.longitude = longitude
            driver_location.updated_at = now

            trip.status = "completed"

            driver.status = "available"
            vehicle.status = "available"

            location_message.update({
                "latitude": latitude,
                "longitude": longitude,
                "progress_percentage": 100.0,
                "remaining_distance_km": 0.0,
                "estimated_remaining_minutes": 0.0,
                "trip_status": "completed",
            })

            _trip_simulation_states.pop(trip.id, None)

        location_updates.append(location_message)

    # Commit all database changes.
    db.commit()

    return location_updates


# ============================================================
# BACKGROUND SIMULATION LOOP
# ============================================================

async def trip_simulation_loop():

    while True:

        db = SessionLocal()

        try:

            updates = await asyncio.to_thread(
                process_active_trips,
                db,
            )

            # Broadcast every updated vehicle location.
            for update in updates:

                await location_manager.broadcast_location(
                    update
                )

        except asyncio.CancelledError:
            raise

        except Exception as exc:

            print(
                f"FleetFlow trip simulation error: {exc}"
            )

        finally:

            db.close()

        await asyncio.sleep(
            SIMULATION_INTERVAL_SECONDS
        )


# ============================================================
# SERVICE STARTUP AND SHUTDOWN
# ============================================================

_simulation_task = None


async def start_trip_simulation_service():

    global _simulation_task

    if (
        _simulation_task is None
        or _simulation_task.done()
    ):

        _simulation_task = asyncio.create_task(
            trip_simulation_loop()
        )

        print(
            "FleetFlow trip simulation service started."
        )


async def stop_trip_simulation_service():

    global _simulation_task

    if _simulation_task is not None:

        _simulation_task.cancel()

        try:

            await _simulation_task

        except asyncio.CancelledError:
            pass

        _simulation_task = None

        _trip_simulation_states.clear()

        print(
            "FleetFlow trip simulation service stopped."
        )
