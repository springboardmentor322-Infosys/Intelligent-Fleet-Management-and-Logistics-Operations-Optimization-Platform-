"""Road routes and live traffic for a trip.

Routes use OpenStreetMap data only: Nominatim turns the trip's place names into
coordinates and OSRM computes real road routes ("fastest" = quickest at normal
driving speeds). OSRM has no traffic data, so LIVE TRAFFIC comes from TomTom's
Traffic Flow API and is only available when TOMTOM_API_KEY is set in
backend/.env. Traffic is shown only along the routes: each route is cut into
sections and every section's current speed is compared with its free-flow speed.
The overall delay is an ESTIMATE added up from those section speeds.
"""
import bisect
import hashlib
import json
import math
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import logistics
import models
import route_types
import shipments
from database import get_db
from security import get_current_user, require_roles

router = APIRouter()

NOMINATIM_URL = os.getenv("NOMINATIM_URL", "https://nominatim.openstreetmap.org")
OSRM_URL = os.getenv("OSRM_URL", "https://router.project-osrm.org")
TOMTOM_URL = "https://api.tomtom.com"
HEADERS = {"User-Agent": "FleetFlow/1.0 (student project)"}

ROUTE_CACHE_SECONDS = 600     # keep the same routes so the map and simulator agree
TRAFFIC_CACHE_SECONDS = 180   # protects the TomTom daily quota
MAX_SAMPLES = 20              # traffic lookups per route
SECTION_KM = 5                # aim for one traffic section per ~5 km

_places = {}         # place name -> (lat, lng); keeps us within Nominatim's usage policy
_route_cache = {}    # (trip id, origin, destination) -> (time, info)
_traffic_cache = {}  # cache key -> (time, result)
_last_error = {}     # last HTTP status from TomTom, used only for a helpful message


def tomtom_key():
    return os.getenv("TOMTOM_API_KEY") or None


def _get_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as res:
        return json.load(res)


def _km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def geocode(name):
    key = name.strip().lower()
    if key in _places:
        return _places[key]
    query = urllib.parse.urlencode(
        {"q": name, "format": "json", "limit": 1, "countrycodes": "in"})
    try:
        data = _get_json(f"{NOMINATIM_URL}/search?{query}")
    except Exception:
        raise HTTPException(502, "The place-lookup service could not be reached")
    if not data:
        raise HTTPException(404, f"Could not find '{name}' on the map")
    _places[key] = (float(data[0]["lat"]), float(data[0]["lon"]))
    return _places[key]


def _downsample(points, limit=20000):
    """Keep the road geometry essentially complete so vehicles follow it exactly."""
    if len(points) <= limit:
        return points
    step = (len(points) - 1) / (limit - 1)
    return [points[round(i * step)] for i in range(limit)]


def road_routes(origin, dest):
    url = (f"{OSRM_URL}/route/v1/driving/{origin[1]},{origin[0]};{dest[1]},{dest[0]}"
           "?alternatives=true&overview=full&geometries=geojson")
    try:
        data = _get_json(url)
    except Exception:
        raise HTTPException(502, "The routing service could not be reached")
    if data.get("code") != "Ok" or not data.get("routes"):
        raise HTTPException(404, "No road route found between these places")
    routes = [{
        "distance_km": round(r["distance"] / 1000, 1),
        "duration_min": round(r["duration"] / 60),
        "geometry": _downsample([[lat, lng] for lng, lat in r["geometry"]["coordinates"]]),
        "tags": [],
    } for r in data["routes"]]
    min(routes, key=lambda r: r["distance_km"])["tags"].append("shortest")
    min(routes, key=lambda r: r["duration_min"])["tags"].append("fastest")
    return routes


def get_trip_routes(trip):
    """Routes for a trip, cached so every caller sees the same geometry."""
    ck = (trip.id, trip.origin, trip.destination)
    hit = _route_cache.get(ck)
    if hit and time.monotonic() - hit[0] < ROUTE_CACHE_SECONDS:
        return hit[1]
    o, d = geocode(trip.origin), geocode(trip.destination)
    info = {
        "trip_id": trip.id,
        "origin": {"name": trip.origin, "lat": o[0], "lng": o[1]},
        "destination": {"name": trip.destination, "lat": d[0], "lng": d[1]},
        "routes": road_routes(o, d),
    }
    _route_cache[ck] = (time.monotonic(), info)
    return info


# ---------------- Live traffic (TomTom Traffic Flow) ----------------
def _flow(point, key):
    """(level, current km/h, free-flow km/h) for the road nearest `point`, or None."""
    query = urllib.parse.urlencode(
        {"key": key, "point": f"{point[0]},{point[1]}", "unit": "KMPH"})
    url = f"{TOMTOM_URL}/traffic/services/4/flowSegmentData/absolute/10/json?{query}"
    try:
        d = _get_json(url)["flowSegmentData"]
        cur, free = d["currentSpeed"], d["freeFlowSpeed"]
    except urllib.error.HTTPError as e:   # never log the URL: it contains the key
        _last_error["code"] = e.code
        return None
    except Exception:
        return None
    if d.get("roadClosure"):
        return ("Heavy", 0, free)
    ratio = cur / free if free else 1
    level = "Light" if ratio >= 0.75 else "Moderate" if ratio >= 0.45 else "Heavy"
    return (level, cur, free)


def _sections(geometry, n):
    """Split a route into n sections of roughly equal length: (start, end, km)."""
    cum = [0.0]
    for i in range(1, len(geometry)):
        cum.append(cum[-1] + _km(geometry[i - 1], geometry[i]))
    total = cum[-1]
    bounds = [0] + [bisect.bisect_left(cum, total * k / n) for k in range(1, n)] + [len(geometry) - 1]
    return [(a, b, cum[b] - cum[a]) for a, b in zip(bounds, bounds[1:]) if b > a]


def route_flow(geometry, distance_km, key):
    n = max(1, min(MAX_SAMPLES, round(distance_km / SECTION_KM)))
    sections = _sections(geometry, n)
    points = [geometry[(a + b) // 2] for a, b, _ in sections]
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda p: _flow(p, key), points))
    return [{
        "start": a, "end": b, "km": round(km, 2),
        "level": res[0] if res else "Unknown",
        "current_kmh": res[1] if res else None,
        "free_kmh": res[2] if res else None,
    } for (a, b, km), res in zip(sections, results)]


def _failure_reason():
    code = _last_error.get("code")
    if code in (401, 403):
        return (f"TomTom refused the key (HTTP {code}). In your TomTom dashboard, "
                "make sure the key has the Traffic API enabled")
    if code == 429:
        return "TomTom's daily request limit was reached. Try again tomorrow"
    if code:
        return f"TomTom returned an error (HTTP {code})"
    return "The traffic service could not be reached"


def _summary(route, segs):
    """Estimated delay on a route, added up from its sections' current speeds."""
    delay = 0.0
    for s in segs:
        cur, free = s["current_kmh"], s["free_kmh"]
        if cur is None or not free:
            continue
        cur = max(cur, 5)  # a closed / standstill section counts as crawling
        delay += max(0.0, s["km"] / cur - s["km"] / free) * 60
    base = route["duration_min"]
    ratio = delay / base if base else 0
    level = "Light" if delay < 5 or ratio < 0.1 else "Moderate" if ratio < 0.3 else "Heavy"
    return {"level": level, "delay_min": round(delay), "travel_time_min": round(base + delay)}


def estimate_delay(points, duration_min):
    """Current traffic delay (whole minutes) along a route, or None when live traffic is
    unavailable. Never raises; used when a trip starts."""
    key = tomtom_key()
    if not key or len(points) < 2:
        return None
    km = sum(_km(points[i - 1], points[i]) for i in range(1, len(points)))
    segs = route_flow(points, km, key)
    if not any(s["level"] != "Unknown" for s in segs):
        return None
    return _summary({"duration_min": duration_min}, segs)["delay_min"]


# ---------------- Endpoints ----------------
@router.get("/trips/{trip_id}/routes")
def trip_routes(trip_id: int, _=Depends(get_current_user), db: Session = Depends(get_db)):
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    return get_trip_routes(trip)


@router.get("/trips/{trip_id}/route-traffic")
def trip_route_traffic(trip_id: int, _=Depends(get_current_user),
                       db: Session = Depends(get_db)):
    """Traffic along the shortest / fastest routes only (keys = index in /routes)."""
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    key = tomtom_key()
    if not key:
        return {"available": False, "routes": {},
                "reason": "Live traffic is not set up (add TOMTOM_API_KEY to backend/.env)"}
    info = get_trip_routes(trip)
    out = {}
    _last_error.clear()
    for i, r in enumerate(info["routes"]):
        ck = ("flow", trip.id, i, len(r["geometry"]))
        hit = _traffic_cache.get(ck)
        if hit and time.monotonic() - hit[0] < TRAFFIC_CACHE_SECONDS:
            out[str(i)] = hit[1]
            continue
        segs = route_flow(r["geometry"], r["distance_km"], key)
        if any(s["level"] != "Unknown" for s in segs):
            _traffic_cache[ck] = (time.monotonic(), segs)
        out[str(i)] = segs
    if not any(s["level"] != "Unknown" for segs in out.values() for s in segs):
        return {"available": False, "routes": {}, "reason": _failure_reason()}

    fastest = next(i for i, r in enumerate(info["routes"]) if "fastest" in r["tags"])
    return {"available": True, "routes": out, "source": "TomTom",
            "summary": _summary(info["routes"][fastest], out[str(fastest)]),
            # index of the lowest-total-time route, or null when traffic data is incomplete
            "traffic_avoidance_index": route_types.traffic_avoidance_index(info["routes"], out),
            # null: FleetFlow stores no fuel consumption per vehicle yet
            "fuel_efficient_index": route_types.fuel_efficient_index(info["routes"], None)}


@router.get("/analytics/route-performance")
def route_performance(_=Depends(get_current_user), db: Session = Depends(get_db)):
    """Completed trips: on-time share and estimated-vs-actual arrival, per route type."""
    done = db.query(models.Trip).filter(models.Trip.status == "Completed").all()
    return logistics.route_performance(done)


# ---------------- Choosing and changing a trip's route ----------------
DISPATCH = require_roles("admin", "fleet_manager", "dispatcher")
REROUTE_MIN_SAVING_MIN = 10   # only recommend a reroute that saves at least this long
_reroute_cache = {}           # trip id -> {"time", "options", "current_total"}


def _route_type(tags):
    for t in ("fastest", "shortest", route_types.TRAFFIC_AVOIDANCE, route_types.FUEL_EFFICIENT):
        if t in tags:
            return t
    return "alternative"


class RouteChoice(BaseModel):
    route_index: int = Field(ge=0)
    distance_km: float
    duration_min: float


class RerouteIn(BaseModel):
    option_index: int = Field(ge=0)
    reason: str = Field(default="", max_length=150)


def _trip(db, trip_id):
    trip = db.get(models.Trip, trip_id)
    if not trip:
        raise HTTPException(404, "Trip not found")
    return trip


@router.post("/trips/{trip_id}/route")
def choose_route(trip_id: int, data: RouteChoice, _=Depends(DISPATCH),
                 db: Session = Depends(get_db)):
    """Save one of the options from GET /trips/{id}/routes as the trip's route.
    The distance and time the person saw must still match, so the wrong route is never saved."""
    trip = _trip(db, trip_id)
    if trip.status != "Planned":
        raise HTTPException(409, "The route can only be chosen while the trip is planned")
    routes = get_trip_routes(trip)["routes"]
    if data.route_index >= len(routes):
        raise HTTPException(409, "That route option no longer exists. Reload the routes")
    r = routes[data.route_index]
    if abs(r["distance_km"] - data.distance_km) > 0.05 or abs(r["duration_min"] - data.duration_min) > 0.5:
        raise HTTPException(409, "The route options have changed. Reload the routes and choose again")
    trip.route_type = _route_type(r["tags"])
    trip.route_geometry = json.dumps(r["geometry"])
    trip.route_duration_min = r["duration_min"]
    trip.planned_eta = trip.eta = None   # set when the trip starts
    trip.delay_minutes = 0
    db.commit()
    db.refresh(trip)
    return logistics.trip_out(trip)


@router.get("/trips/{trip_id}/route")
def current_route(trip_id: int, _=Depends(get_current_user), db: Session = Depends(get_db)):
    """The route saved on the trip, i.e. the one the vehicle should follow. `version` changes
    whenever the route does (a new choice or a reroute), so a client can notice the change."""
    trip = _trip(db, trip_id)
    route = logistics.load_route(trip)
    if not route:
        return {"trip_id": trip.id, "has_route": False, "route_type": None, "version": None,
                "distance_km": None, "duration_min": None, "geometry": []}
    return {"trip_id": trip.id, "has_route": True, "route_type": trip.route_type,
            "version": hashlib.md5(trip.route_geometry.encode()).hexdigest()[:12],
            "distance_km": round(route.length_km, 1), "duration_min": trip.route_duration_min,
            "geometry": route.points}


def _remaining(trip):
    """Where an in-progress trip stands on its chosen route:
    (remaining points, remaining km, remaining minutes at the planned speed)."""
    route = logistics.load_route(trip)
    speed = logistics.planned_speed_kmh(trip, route) if route else None
    if not route or not speed:
        raise HTTPException(409, "This trip has no chosen route to compare against")
    v = trip.vehicle
    if v.last_lat is None or v.last_lng is None:
        raise HTTPException(409, "The vehicle has not reported a GPS position yet")
    i = route.locate(v.last_lat, v.last_lng)
    km = route.length_km - route.cum[i]
    return route.points[i:], km, km / speed * 60


@router.post("/trips/{trip_id}/reroute-check")
def reroute_check(trip_id: int, _=Depends(DISPATCH), db: Session = Depends(get_db)):
    """Compare the rest of the current route with fresh routes from the vehicle's position,
    both including today's traffic delay. Nothing is changed."""
    trip = _trip(db, trip_id)
    if trip.status != "In Progress":
        raise HTTPException(409, "Only trips in progress can be rerouted")
    pts, km, free_min = _remaining(trip)
    v = trip.vehicle
    here = (v.last_lat, v.last_lng)
    if len(pts) < 3 or km < 1:
        return {"trip_id": trip.id, "recommend": False, "best_option": None, "options": [],
                "traffic_available": False, "current": None,
                "min_saving_min": REROUTE_MIN_SAVING_MIN,
                "traffic_note": "The vehicle is almost at its destination"}

    cur_delay = estimate_delay(pts, free_min)
    traffic_ok = cur_delay is not None
    if traffic_ok:
        note = "Times include current traffic (TomTom)"
    elif not tomtom_key():
        note = ("Live traffic is not set up (add TOMTOM_API_KEY to backend/.env), so "
                "routes are compared on normal driving time only")
    else:
        note = "Live traffic could not be read right now, so routes are compared on normal driving time only"
    current_total = free_min + (cur_delay or 0)
    current = {"route_type": trip.route_type, "distance_km": round(km, 1),
               "free_flow_min": round(free_min), "traffic_delay_min": cur_delay or 0,
               "total_min": round(current_total)}

    alts = road_routes(here, geocode(trip.destination))
    options = []
    for i, r in enumerate(alts):
        d = estimate_delay(r["geometry"], r["duration_min"]) if traffic_ok else None
        total = r["duration_min"] + (d or 0)
        options.append({
            "index": i, "route_type": _route_type(r["tags"]), "tags": r["tags"],
            "distance_km": r["distance_km"], "free_flow_min": r["duration_min"],
            "traffic_delay_min": d or 0, "total_min": round(total),
            "saving_min": round(current_total - total), "geometry": r["geometry"],
        })
    best = max(options, key=lambda o: o["saving_min"])
    _reroute_cache[trip.id] = {"time": time.monotonic(), "options": options,
                               "current_total": round(current_total)}
    return {"trip_id": trip.id, "position": {"lat": here[0], "lng": here[1]},
            "traffic_available": traffic_ok, "traffic_note": note, "current": current,
            "options": options, "min_saving_min": REROUTE_MIN_SAVING_MIN,
            "recommend": traffic_ok and best["saving_min"] >= REROUTE_MIN_SAVING_MIN,
            "best_option": best["index"]}


@router.post("/trips/{trip_id}/reroute")
def reroute(trip_id: int, data: RerouteIn, user=Depends(DISPATCH),
            db: Session = Depends(get_db)):
    """Switch an in-progress trip to one of the options from the latest reroute-check."""
    trip = _trip(db, trip_id)
    if trip.status != "In Progress":
        raise HTTPException(409, "Only trips in progress can be rerouted")
    hit = _reroute_cache.get(trip.id)
    if not hit or time.monotonic() - hit["time"] > ROUTE_CACHE_SECONDS:
        raise HTTPException(409, "Run the reroute check again first; its results have expired")
    if data.option_index >= len(hit["options"]):
        raise HTTPException(409, "That route option does not exist")
    o = hit["options"][data.option_index]
    now = datetime.now(timezone.utc)
    old_type = trip.route_type

    trip.route_type = o["route_type"]
    trip.route_geometry = json.dumps(o["geometry"])
    trip.route_duration_min = o["free_flow_min"]
    trip.delay_minutes = o["traffic_delay_min"]
    v = trip.vehicle
    if v.last_lat is not None:
        logistics.update_eta(trip, v.last_lat, v.last_lng, now)
    change = models.RouteChange(
        trip_id=trip.id, old_route_type=old_type, new_route_type=trip.route_type,
        old_duration_min=hit["current_total"], new_duration_min=o["total_min"],
        reason=(data.reason.strip() or f"Dispatcher switched to a route about {o['saving_min']} min "
                                      f"{'faster' if o['saving_min'] >= 0 else 'slower'}")[:200],
        changed_at=now)
    db.add(change)
    shipments.sync_delay(trip, now, user.username)
    _reroute_cache.pop(trip.id, None)
    db.commit()
    db.refresh(trip)
    return {"trip": logistics.trip_out(trip),
            "route_change": {"old_route_type": change.old_route_type,
                             "new_route_type": change.new_route_type,
                             "old_duration_min": change.old_duration_min,
                             "new_duration_min": change.new_duration_min,
                             "reason": change.reason}}


@router.get("/trips/{trip_id}/route-changes")
def route_changes(trip_id: int, _=Depends(get_current_user), db: Session = Depends(get_db)):
    trip = _trip(db, trip_id)
    return [{"id": c.id, "old_route_type": c.old_route_type, "new_route_type": c.new_route_type,
             "old_duration_min": c.old_duration_min, "new_duration_min": c.new_duration_min,
             "reason": c.reason, "changed_at": logistics.iso(c.changed_at)}
            for c in trip.route_changes]
