
import asyncio
import logging

from sqlalchemy import select

from app.core.database import SessionLocal
from app.models.gps_location import GPSLocation
from app.models.shipment import Shipment
from app.services.geocoding import geocode_address
from app.services.tracking import publish_location

logger = logging.getLogger(__name__)

live_simulation_tasks: dict[int, asyncio.Task] = {}


async def simulate_live_gps(shipment_id: int, interval: int = 5):
    """Generate simulated GPS points until stopped or the route finishes."""
    db = SessionLocal()

    try:
        shipment = db.get(Shipment, shipment_id)

        if shipment is None or shipment.vehicle_id is None:
            logger.warning(
                "Shipment missing or has no assigned vehicle: %s",
                shipment_id,
            )
            return

        vehicle_id = shipment.vehicle_id
        origin_lat, origin_lon = await asyncio.to_thread(
            geocode_address, shipment.origin
        )
        dest_lat, dest_lon = await asyncio.to_thread(
            geocode_address, shipment.destination
        )

        for step in range(1, 21):
            latitude = origin_lat + (dest_lat - origin_lat) * step / 20
            longitude = origin_lon + (dest_lon - origin_lon) * step / 20

            location = GPSLocation(
                vehicle_id=vehicle_id,
                latitude=latitude,
                longitude=longitude,
                source="simulated",
            )
            db.add(location)
            db.commit()
            db.refresh(location)
            await publish_location(location, db)

            if step < 20:
                await asyncio.sleep(interval)

        logger.info(
            "Live GPS simulation finished for shipment %s",
            shipment_id,
        )

    except asyncio.CancelledError:
        db.rollback()
        logger.info("Live GPS simulation stopped for shipment %s", shipment_id)
        raise
    except Exception:
        db.rollback()
        logger.exception(
            "Live GPS simulation failed for shipment %s",
            shipment_id,
        )
    finally:
        db.close()
        current_task = asyncio.current_task()
        if live_simulation_tasks.get(shipment_id) is current_task:
            live_simulation_tasks.pop(shipment_id, None)


def start_live_simulation(shipment_id: int, interval: int = 5) -> bool:
    """Start one simulation task per shipment."""
    current = live_simulation_tasks.get(shipment_id)

    if current is not None and not current.done():
        return False

    task = asyncio.create_task(simulate_live_gps(shipment_id, interval))
    live_simulation_tasks[shipment_id] = task
    return True


async def stop_live_simulation(shipment_id: int) -> bool:
    """Cancel a running simulation."""
    task = live_simulation_tasks.get(shipment_id)

    if task is None or task.done():
        return False

    task.cancel()

    try:
        await task
    except asyncio.CancelledError:
        pass

    return True


def get_live_simulation_status(shipment_id: int) -> dict:
    """Return the current in-process simulation status."""
    task = live_simulation_tasks.get(shipment_id)

    if task is None:
        return {"running": False, "status": "stopped"}

    if task.done():
        return {"running": False, "status": "stopped"}

    return {"running": True, "status": "running"}
