"""ETA and delay logic for trips (Milestone 2, plan step 2).

The maths works on plain objects and needs no database, so it can be tested with
a fixed route (see test_logistics.py). main.py calls these helpers.

    ETA = now + remaining route distance / planned average speed + accumulated delay

  * planned average speed = chosen route length / planned driving time
  * accumulated delay     = trip.delay_minutes (traffic estimate taken when the trip starts)
  * planned_eta           = the original promise, set when the trip starts and never moved
"""
import json
import math
from datetime import datetime, timedelta, timezone

DELAY_THRESHOLD_MIN = 15  # a trip counts as delayed once it is this far behind plan
ACTIVE_SHIPMENT = ("Assigned", "In Transit", "Delayed")
_geo_cache = {}  # (trip id, hash of the geometry text) -> RouteGeometry


def iso(dt):
    return dt.isoformat() if dt else None


def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


class RouteGeometry:
    """A route polyline with cumulative distances."""

    def __init__(self, points):
        self.points = points
        self.cum = [0.0]
        for i in range(1, len(points)):
            self.cum.append(self.cum[-1] + haversine_km(points[i - 1], points[i]))
        self.length_km = self.cum[-1]
        self.progress = 0  # index matched by the last ping

    def _nearest(self, lat, lng, lo, hi):
        k = math.cos(math.radians(lat))
        best, bi = float("inf"), lo
        for i in range(lo, hi):
            a, b = self.points[i]
            d = (a - lat) ** 2 + ((b - lng) * k) ** 2
            if d < best:
                best, bi = d, i
        return bi

    def locate(self, lat, lng):
        """Index of the route point nearest to the position. Searches around the
        last known progress first, so a route that passes close to itself cannot
        make a vehicle jump; falls back to the whole route when it is >2 km away."""
        n = len(self.points)
        i = self._nearest(lat, lng, max(0, self.progress - 100), min(n, self.progress + 3000))
        if haversine_km(self.points[i], (lat, lng)) > 2:
            i = self._nearest(lat, lng, 0, n)
        self.progress = i
        return i

    def remaining_km(self, lat, lng):
        return self.length_km - self.cum[self.locate(lat, lng)]


def load_route(trip):
    """The trip's chosen route as a RouteGeometry, or None when it has none."""
    text = trip.route_geometry
    if not text:
        return None
    key = (trip.id, hash(text))
    route = _geo_cache.get(key)
    if route is None:
        try:
            points = json.loads(text)
        except ValueError:
            return None
        if len(points) < 2:
            return None
        if len(_geo_cache) >= 50:
            _geo_cache.pop(next(iter(_geo_cache)))
        route = _geo_cache[key] = RouteGeometry(points)
    return route


def planned_speed_kmh(trip, route):
    if not trip.route_duration_min or trip.route_duration_min <= 0:
        return None
    return route.length_km / (trip.route_duration_min / 60)


def compute_eta(trip, lat, lng, now):
    """Current ETA for a vehicle at (lat, lng), or None when the trip has no usable route."""
    route = load_route(trip)
    speed = planned_speed_kmh(trip, route) if route else None
    if not speed:
        return None
    minutes = route.remaining_km(lat, lng) / speed * 60 + (trip.delay_minutes or 0)
    return now + timedelta(minutes=minutes)


def update_eta(trip, lat, lng, now):
    """Recalculate the trip's ETA from a position, and pass it on to its open shipments."""
    eta = compute_eta(trip, lat, lng, now)
    if eta is None:
        return False
    trip.eta = eta
    for s in trip.shipments:
        if s.status in ACTIVE_SHIPMENT:
            s.eta = eta
    return True


def ensure_route(trip):
    """Give a trip without a chosen route the fastest road route. Best effort: never raises."""
    if trip.route_geometry:
        return True
    try:
        from routeplan import get_trip_routes
        routes = get_trip_routes(trip)["routes"]
        r = next((x for x in routes if "fastest" in x["tags"]), routes[0])
    except Exception:
        return False
    trip.route_type = "fastest"
    trip.route_geometry = json.dumps(r["geometry"])
    trip.route_duration_min = r["duration_min"]
    return True


def prepare_start(trip, now):
    """When a trip starts: make sure it has a route, take the current traffic delay
    (when live traffic is configured) and fix the planned ETA that delay is judged against."""
    if not ensure_route(trip) or not trip.route_duration_min:
        return
    trip.delay_minutes = 0
    route = load_route(trip)
    try:
        from routeplan import estimate_delay
        delay = estimate_delay(route.points, trip.route_duration_min) if route else None
    except Exception:
        delay = None
    trip.delay_minutes = delay or 0
    trip.planned_eta = now + timedelta(minutes=trip.route_duration_min)
    trip.eta = trip.planned_eta + timedelta(minutes=trip.delay_minutes)


def delay_info(trip, now):
    """Is the trip behind plan? Rules by status:
      In Progress: delayed when the current ETA is more than the threshold past the planned ETA
      Planned:     late_to_start when the scheduled start passed more than the threshold ago
      Completed:   finished_late when it arrived more than the threshold after the planned ETA"""
    late = None
    if trip.status == "In Progress" and trip.eta and trip.planned_eta:
        late, bad = (trip.eta - trip.planned_eta).total_seconds() / 60, "delayed"
    elif trip.status == "Planned":
        late, bad = (now - trip.scheduled_start).total_seconds() / 60, "late_to_start"
    elif trip.status == "Completed" and trip.completed_at and trip.planned_eta:
        late, bad = (trip.completed_at - trip.planned_eta).total_seconds() / 60, "finished_late"
    if late is None:
        return {"state": None, "late_minutes": 0, "delayed": False}
    over = late > DELAY_THRESHOLD_MIN
    return {"state": bad if over else "on_time", "late_minutes": round(max(late, 0)),
            "delayed": over and bad != "finished_late"}


def arrival_comparison(trip):
    """Estimated vs actual arrival of a completed trip, in minutes (positive = later), or None.
    The actual arrival is completed_at, stored when the trip is completed.
      vs_plan: actual - planned ETA (the promise made when the trip started)
      vs_last_eta: actual - the last ETA shown before arrival (how good the live estimate was)"""
    if trip.status != "Completed" or not trip.completed_at or not trip.planned_eta:
        return None
    vs_plan = (trip.completed_at - trip.planned_eta).total_seconds() / 60
    vs_last = (trip.completed_at - trip.eta).total_seconds() / 60 if trip.eta else None
    return {"actual_arrival": iso(trip.completed_at), "vs_plan_min": round(vs_plan),
            "vs_last_eta_min": None if vs_last is None else round(vs_last),
            "on_time": vs_plan <= DELAY_THRESHOLD_MIN}


def route_performance(trips):
    """Route performance for analytics, from completed trips that have a planned ETA:
    per route type, the number of trips, share on time, and the average lateness against
    the plan and against the last live ETA."""
    groups = {}
    for t in trips:
        c = arrival_comparison(t)
        if c:
            groups.setdefault(t.route_type or "unspecified", []).append(c)
    out = []
    for route_type, rows in sorted(groups.items()):
        etas = [r["vs_last_eta_min"] for r in rows if r["vs_last_eta_min"] is not None]
        out.append({
            "route_type": route_type, "trips": len(rows),
            "on_time_pct": round(100 * sum(r["on_time"] for r in rows) / len(rows)),
            "avg_vs_plan_min": round(sum(r["vs_plan_min"] for r in rows) / len(rows), 1),
            "avg_eta_error_min": round(sum(abs(e) for e in etas) / len(etas), 1) if etas else None,
        })
    return out


def trip_brief(trip, now=None):
    """Small trip summary used in live-tracking messages."""
    d = delay_info(trip, now or datetime.now(timezone.utc))
    return {
        "id": trip.id, "origin": trip.origin, "destination": trip.destination,
        "eta": iso(trip.eta), "planned_eta": iso(trip.planned_eta),
        "delay_minutes": trip.delay_minutes or 0,
        "late_minutes": d["late_minutes"], "delayed": d["delayed"],
    }


def trip_out(t, now=None):
    """The one serializer every trip endpoint uses."""
    return {
        "id": t.id,
        "vehicle_id": t.vehicle_id, "vehicle": t.vehicle.registration_number,
        "driver_id": t.driver_id, "driver": t.driver.name,
        "origin": t.origin, "destination": t.destination,
        "cargo_description": t.cargo_description, "cargo_weight": t.cargo_weight,
        "scheduled_start": iso(t.scheduled_start),
        "started_at": iso(t.started_at), "completed_at": iso(t.completed_at),
        "distance_km": t.distance_km, "status": t.status,
        "created_by": t.creator.username if t.creator else None,
        "route_type": t.route_type, "route_duration_min": t.route_duration_min,
        "has_route": bool(t.route_geometry),
        "planned_eta": iso(t.planned_eta), "eta": iso(t.eta),
        "delay_minutes": t.delay_minutes or 0,
        "delay": delay_info(t, now or datetime.now(timezone.utc)),
        "shipment_count": len(t.shipments),
        "arrival": arrival_comparison(t),
    }
