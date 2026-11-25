from contextlib import asynccontextmanager
from fastapi import Depends, FastAPI, HTTPException, status, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from sqlalchemy import select
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from threading import Lock
import os
import json
import urllib.parse
import urllib.request
import urllib.error
from dotenv import load_dotenv

from .database import Base, engine, get_db
from .models import User
from .schemas import LoginRequest, RegisterRequest, TokenResponse, UserResponse, ROLES
from .security import (
    JWT_ALGORITHM, JWT_SECRET_KEY, create_access_token, hash_password, verify_password
)

load_dotenv()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Convenient for this learning starter. Use Alembic migrations for team/production workflows.
    Base.metadata.create_all(bind=engine)
    yield

app = FastAPI(title="FleetFlow API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+):\d+$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
bearer = HTTPBearer(auto_error=False)

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "FleetFlow API"}

@app.post("/api/auth/register", response_model=TokenResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if payload.role not in ROLES:
        raise HTTPException(status_code=400, detail="Invalid role.")
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    user = User(
        full_name=payload.full_name.strip(),
        email=email,
        password_hash=hash_password(payload.password),
        role=payload.role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.role)
    return {"access_token": token, "token_type": "bearer", "user": user}

@app.post("/api/auth/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Email or password is incorrect.")
    token = create_access_token(user.id, user.role)
    return {"access_token": token, "token_type": "bearer", "user": user}

@app.get("/api/auth/me", response_model=UserResponse)
def me(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    if not credentials:
        raise HTTPException(status_code=401, detail="Bearer token required.")
    try:
        claims = jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = int(claims["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found.")
    return user



# ROUTE PLANNING: Google Routes provides traffic-aware ETA when configured.
# Without a Google key, OSRM returns road routes; congestion is an estimate only.
class RoutePlanRequest(BaseModel):
    origin: str = Field(min_length=2, max_length=200)
    destination: str = Field(min_length=2, max_length=200)
    traffic_level: str = Field(default="moderate", pattern="^(low|moderate|heavy)$")


def _duration_text(seconds: float) -> str:
    minutes = max(1, round(seconds / 60))
    hours, mins = divmod(minutes, 60)
    return f"{hours}h {mins}m" if hours else f"{mins} min"


def _http_json(url: str, *, method: str = "GET", payload=None, headers=None):
    body = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=body, method=method, headers=headers or {})
    with urllib.request.urlopen(request, timeout=18) as response:
        return json.loads(response.read().decode("utf-8"))


def _geocode_place(place: str):
    query = urllib.parse.urlencode({"q": place, "format": "jsonv2", "limit": 1})
    data = _http_json(
        f"https://nominatim.openstreetmap.org/search?{query}",
        headers={"User-Agent": "FleetFlowStudentProject/1.0 (route planning demo)"},
    )
    if not data:
        raise HTTPException(status_code=422, detail=f"Could not locate '{place}'. Include city and state.")
    return float(data[0]["lon"]), float(data[0]["lat"])


@app.post("/api/routes/plan")
def plan_route(payload: RoutePlanRequest):
    traffic_label = {"low": "Low congestion", "moderate": "Moderate congestion", "heavy": "Heavy congestion"}[payload.traffic_level]
    google_key = os.getenv("GOOGLE_ROUTES_API_KEY", "").strip()

    # Actual traffic-aware route calculation (Google Routes API) when a key exists.
    if google_key:
        try:
            data = _http_json(
                "https://routes.googleapis.com/directions/v2:computeRoutes",
                method="POST",
                payload={
                    "origin": {"address": payload.origin},
                    "destination": {"address": payload.destination},
                    "travelMode": "DRIVE",
                    "routingPreference": "TRAFFIC_AWARE_OPTIMAL",
                    "computeAlternativeRoutes": True,
                    "routeModifiers": {"avoidTolls": False, "avoidHighways": False, "avoidFerries": True},
                },
                headers={
                    "Content-Type": "application/json",
                    "X-Goog-Api-Key": google_key,
                    "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline,routes.travelAdvisory",
                },
            )
            routes = data.get("routes", [])
            if not routes:
                raise HTTPException(status_code=422, detail="No driving route was found for these locations.")
            def secs(value):
                return float(str(value or "0s").rstrip("s"))
            routes.sort(key=lambda r: (r.get("distanceMeters", float("inf")), secs(r.get("duration"))))
            best = routes[0]
            duration = secs(best.get("duration"))
            static_duration = secs(best.get("staticDuration"))
            return {
                "origin": payload.origin, "destination": payload.destination,
                "distance_km": round(best.get("distanceMeters", 0) / 1000, 1),
                "duration_text": _duration_text(static_duration or duration),
                "traffic_duration_text": _duration_text(duration),
                "traffic_label": "Live traffic-aware route",
                "traffic_note": "Google Routes returned a traffic-aware driving estimate. Actual travel time can still change.",
                "provider": "google_routes_traffic_aware", "provider_label": "Live traffic-aware",
                "alternatives": [
                    {"distance_km": round(r.get("distanceMeters", 0) / 1000, 1), "duration_text": _duration_text(secs(r.get("duration")))}
                    for r in routes[1:4]
                ],
                "encoded_polyline": best.get("polyline", {}).get("encodedPolyline"),
            }
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"Google Routes request failed: {exc}")

    # Open-source fallback: select the shortest road-distance alternative from OSRM.
    try:
        start_lon, start_lat = _geocode_place(payload.origin)
        end_lon, end_lat = _geocode_place(payload.destination)
        coords = f"{start_lon},{start_lat};{end_lon},{end_lat}"
        url = f"https://router.project-osrm.org/route/v1/driving/{coords}?alternatives=true&overview=false&steps=false"
        data = _http_json(url, headers={"User-Agent": "FleetFlowStudentProject/1.0"})
        if data.get("code") != "Ok" or not data.get("routes"):
            raise HTTPException(status_code=422, detail="No driving route was found for these locations.")
        routes = sorted(data["routes"], key=lambda r: r.get("distance", float("inf")))
        best = routes[0]
        factor = {"low": 1.05, "moderate": 1.20, "heavy": 1.45}[payload.traffic_level]
        distance = best.get("distance", 0) / 1000
        base_seconds = best.get("duration", 0)
        estimated_seconds = base_seconds * factor
        return {
            "origin": payload.origin, "destination": payload.destination,
            "distance_km": round(distance, 1),
            "duration_text": _duration_text(base_seconds),
            "traffic_duration_text": _duration_text(estimated_seconds),
            "traffic_label": traffic_label,
            "traffic_note": f"OSRM road routing selected the shortest-distance alternative. {traffic_label} adds an estimated time buffer; this fallback does not receive live traffic feeds.",
            "provider": "osrm_shortest_distance_estimate", "provider_label": "Shortest road distance · traffic estimate",
            "alternatives": [
                {"distance_km": round(r.get("distance", 0) / 1000, 1), "duration_text": _duration_text(r.get("duration", 0))}
                for r in routes[1:4]
            ],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Route lookup failed. Check internet access or configure GOOGLE_ROUTES_API_KEY. Details: {exc}")


# Demo-only GPS simulation. Coordinates follow repeatable sample routes and are
# updated whenever the authenticated dashboard polls /api/tracking/vehicles.
_tracking_lock = Lock()
_tracking_step = 0
_device_positions = {}

class GPSDeviceUpdate(BaseModel):
    vehicle_id: str = Field(min_length=2, max_length=50)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed_kmh: float = Field(default=0, ge=0, le=250)
    driver: str = Field(default="GPS device", max_length=120)
    status: str = Field(default="In Transit", max_length=30)
_tracking_routes = [
    {
        "vehicle_id": "TRK-101", "driver": "Arjun Rao", "status": "In Transit",
        "speed_kmh": 58,
        "route": [
            (12.9716, 77.5946, 18, 70), (12.9850, 77.6100, 28, 60),
            (13.0050, 77.6250, 40, 52), (13.0250, 77.6400, 53, 42),
            (13.0450, 77.6550, 66, 32), (13.0600, 77.6700, 77, 22),
        ],
    },
    {
        "vehicle_id": "VAN-204", "driver": "Priya Reddy", "status": "Active",
        "speed_kmh": 32,
        "route": [
            (12.9352, 77.6245, 23, 82), (12.9420, 77.6100, 31, 75),
            (12.9510, 77.6000, 39, 69), (12.9600, 77.5900, 47, 62),
            (12.9680, 77.5800, 55, 56), (12.9760, 77.5700, 63, 50),
        ],
    },
    {
        "vehicle_id": "VAN-417", "driver": "Kiran Kumar", "status": "Idle",
        "speed_kmh": 0,
        "route": [
            (17.3850, 78.4867, 80, 72), (17.3850, 78.4867, 80, 72),
            (17.3850, 78.4867, 80, 72), (17.3850, 78.4867, 80, 72),
        ],
    },
]

@app.get("/api/tracking/vehicles")
def simulated_vehicle_locations(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
):
    """Return demo GPS positions; this is simulated data, not a physical tracker."""
    global _tracking_step
    if not credentials:
        raise HTTPException(status_code=401, detail="Bearer token required.")
    try:
        claims = jwt.decode(credentials.credentials, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        user_id = int(claims["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    if not db.get(User, user_id):
        raise HTTPException(status_code=401, detail="User not found.")

    now = datetime.now(timezone.utc).isoformat()
    with _tracking_lock:
        _tracking_step += 1
        step = _tracking_step
        vehicles = []
        for item in _tracking_routes:
            route = item["route"]
            point = route[(step // 2) % len(route)]
            lat, lon, x, y = point
            moving = item["status"] != "Idle"
            vehicles.append({
                "vehicle_id": item["vehicle_id"],
                "driver": item["driver"],
                "status": item["status"],
                "latitude": lat, "longitude": lon,
                "speed_kmh": max(0, item["speed_kmh"] + ((step % 5) - 2) * 2) if moving else 0,
                "map_x": x, "map_y": y, "updated_at": now,
                "source": "simulated",
            })
        # Prefer recent physical tracker readings over demo coordinates for the same vehicle.
        device_freshness = {}
        for vehicle_id, reading in list(_device_positions.items()):
            age = (datetime.now(timezone.utc) - reading["_received_at"]).total_seconds()
            if age <= 120:
                device_freshness[vehicle_id] = {
                    key: value for key, value in reading.items() if not key.startswith("_")
                }
        by_id = {vehicle["vehicle_id"]: vehicle for vehicle in vehicles}
        for vehicle_id, reading in device_freshness.items():
            by_id[vehicle_id] = reading
        result = list(by_id.values())
        return {
            "mode": "device" if device_freshness else "simulation",
            "updated_at": now,
            "vehicles": result
        }


@app.post("/api/tracking/ingest")
def ingest_gps_update(
    payload: GPSDeviceUpdate,
    x_device_key: str = Header(default=""),
):
    """Accept a hardware tracker reading; protect this endpoint with GPS_DEVICE_API_KEY."""
    expected_key = os.getenv("GPS_DEVICE_API_KEY", "")
    if not expected_key:
        raise HTTPException(status_code=503, detail="GPS_DEVICE_API_KEY is not configured.")
    if x_device_key != expected_key:
        raise HTTPException(status_code=401, detail="Invalid GPS device key.")
    now = datetime.now(timezone.utc)
    reading = {
        "vehicle_id": payload.vehicle_id,
        "driver": payload.driver,
        "status": payload.status,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "speed_kmh": payload.speed_kmh,
        "updated_at": now.isoformat(),
        "source": "device",
        "_received_at": now,
    }
    with _tracking_lock:
        _device_positions[payload.vehicle_id] = reading
    return {"status": "accepted", "vehicle_id": payload.vehicle_id, "received_at": now.isoformat()}
