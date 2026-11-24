
import asyncio
import time
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/route-preview", tags=["Route Preview"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"

# Simple in-memory cache to reduce repeated geocoding requests.
_geocode_cache: dict[str, dict[str, Any]] = {}
_last_geocode_time = 0.0
_geocode_lock = asyncio.Lock()
CACHE_TTL_SECONDS = 60 * 60 * 24


async def geocode_location(client: httpx.AsyncClient, place: str) -> dict[str, Any]:
    global _last_geocode_time

    key = place.strip().casefold()
    cached = _geocode_cache.get(key)

    if cached and time.time() - cached["cached_at"] < CACHE_TTL_SECONDS:
        return cached["location"]

    async with _geocode_lock:
        # Check again in case another request filled the cache while we waited.
        cached = _geocode_cache.get(key)
        if cached and time.time() - cached["cached_at"] < CACHE_TTL_SECONDS:
            return cached["location"]

        # Respect the public Nominatim service's request rate.
        wait_time = 1.1 - (time.monotonic() - _last_geocode_time)
        if wait_time > 0:
            await asyncio.sleep(wait_time)

        try:
            response = await client.get(
                NOMINATIM_URL,
                params={"q": place, "format": "jsonv2", "limit": 1},
            )
            response.raise_for_status()
            results = response.json()
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429:
                raise HTTPException(
                    status_code=503,
                    detail="Location search is temporarily rate-limited. Please try again shortly.",
                ) from exc
            raise HTTPException(
                status_code=502,
                detail="The location search service is temporarily unavailable.",
            ) from exc
        except (httpx.RequestError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail="Could not contact the location search service.",
            ) from exc
        finally:
            _last_geocode_time = time.monotonic()

        if not results:
            raise HTTPException(
                status_code=404,
                detail=f"Location not found: {place}",
            )

        location = {
            "lat": float(results[0]["lat"]),
            "lon": float(results[0]["lon"]),
            "label": results[0]["display_name"],
        }
        _geocode_cache[key] = {
            "location": location,
            "cached_at": time.time(),
        }
        return location


@router.get("/")
async def preview_route(
    origin: str = Query(..., min_length=2, max_length=200),
    destination: str = Query(..., min_length=2, max_length=200),
):
    timeout = httpx.Timeout(15.0, connect=5.0)

    async with httpx.AsyncClient(
        timeout=timeout,
        headers={"User-Agent": "FleetFlow-RoutePreview/1.0"},
    ) as client:
        from_location, to_location = await asyncio.gather(
            geocode_location(client, origin),
            geocode_location(client, destination),
        )

        route_url = (
            f"{OSRM_URL}/"
            f"{from_location['lon']},{from_location['lat']};"
            f"{to_location['lon']},{to_location['lat']}"
        )

        try:
            response = await client.get(
                route_url,
                params={
                    "overview": "full",
                    "geometries": "geojson",
                    "alternatives": "true",
                    "steps": "false",
                },
            )
            response.raise_for_status()
            data = response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail="The road-routing service is temporarily unavailable.",
            ) from exc
        except (httpx.RequestError, ValueError) as exc:
            raise HTTPException(
                status_code=502,
                detail="Could not contact the road-routing service.",
            ) from exc

        if data.get("code") != "Ok" or not data.get("routes"):
            raise HTTPException(
                status_code=404,
                detail="No driving route was found for these locations.",
            )

    routes = []

    for index, route in enumerate(data["routes"]):
        routes.append({
            "id": index,
            "distance_km": route["distance"] / 1000,
            "duration_minutes": route["duration"] / 60,
            "coordinates": [
                [latitude, longitude]
                for longitude, latitude in route["geometry"]["coordinates"]
            ],
        })

    return {
        "from": from_location,
        "to": to_location,
        "routes": routes,
        "distance_km": routes[0]["distance_km"],
        "duration_minutes": routes[0]["duration_minutes"],
        "coordinates": routes[0]["coordinates"],
    }
    