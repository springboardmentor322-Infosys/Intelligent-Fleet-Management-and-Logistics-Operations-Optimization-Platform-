
from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.gps_location import GPSLocation
from app.models.shipment import Shipment
from app.services.geocoding import geocode_address


def simulate_shipment_positions(
    db: Session,
    shipment: Shipment,
    points: int = 5,
) -> list[GPSLocation]:
    if shipment.vehicle_id is None:
        raise HTTPException(
            status_code=409,
            detail="Assign a vehicle to the shipment before simulating GPS",
        )

    origin_lat, origin_lon = geocode_address(shipment.origin)
    destination_lat, destination_lon = geocode_address(
        shipment.destination
    )

    locations = []

    # Generate intermediate points, including both endpoints.
    for index in range(points):
        fraction = index / (points - 1) if points > 1 else 0

        latitude = origin_lat + (
            destination_lat - origin_lat
        ) * fraction
        longitude = origin_lon + (
            destination_lon - origin_lon
        ) * fraction

        location = GPSLocation(
            vehicle_id=shipment.vehicle_id,
            latitude=latitude,
            longitude=longitude,
            source="simulated",
        )
        db.add(location)
        locations.append(location)

    db.commit()

    for location in locations:
        db.refresh(location)

    return locations
