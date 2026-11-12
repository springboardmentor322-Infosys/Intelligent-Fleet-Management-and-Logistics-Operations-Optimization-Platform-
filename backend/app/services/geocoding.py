
import httpx
from fastapi import HTTPException

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


def geocode_address(address: str) -> tuple[float, float]:
    try:
        response = httpx.get(
            NOMINATIM_URL,
            params={
                "q": address,
                "format": "jsonv2",
                "limit": 1,
            },
            headers={
                "User-Agent": "FleetFlow/1.0 (development project)"
            },
            timeout=10.0,
        )
        response.raise_for_status()
        results = response.json()
    except (httpx.HTTPError, ValueError):
        raise HTTPException(
            status_code=502,
            detail="Address lookup service is temporarily unavailable",
        )

    if not results:
        raise HTTPException(
            status_code=422,
            detail=f"Could not locate address: {address}",
        )

    return float(results[0]["lat"]), float(results[0]["lon"])
