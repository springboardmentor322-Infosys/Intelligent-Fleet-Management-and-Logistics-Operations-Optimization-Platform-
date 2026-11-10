"""Simulate GPS trackers that DRIVE ALONG THE ROAD.

For every vehicle with a trip in progress, this fetches the route SAVED ON THE TRIP
(the one chosen on the Trips page, or a newer one after a reroute) from the API and
moves the vehicle along it. If the trip is rerouted while the simulator runs, the
vehicle carries on along the new route from where it is. It talks to the real API
exactly like a GPS device would:
  1. logs in as an admin,
  2. generates a tracker key for each vehicle (this REPLACES any existing key!),
  3. posts the vehicle's position along the route every few seconds.

Vehicles with no trip in progress are not simulated (start a trip first).
Because real trips take hours, movement is sped up (--speedup) so you can watch
it; the reported speed in km/h stays realistic.

Usage (backend must be running):
    python simulate_gps.py
    python simulate_gps.py --vehicles TRK101,TRK102 --interval 2 --speedup 40
Stop with Ctrl+C.
"""
import argparse
import json
import math
import random
import time
import urllib.error
import urllib.request


def call(base, path, method="GET", body=None, headers=None):
    req = urllib.request.Request(
        base + path, method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json", **(headers or {})},
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.loads(res.read() or "null")
    except urllib.error.HTTPError as e:
        raise SystemExit(f"{method} {path} failed: {e.code} {e.read().decode()[:200]}")
    except urllib.error.URLError as e:
        raise SystemExit(f"Cannot reach {base}: {e.reason}. Is the backend running?")


def haversine_km(a, b):
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * 6371.0 * math.asin(math.sqrt(h))


def bearing(a, b):
    la1, la2 = math.radians(a[0]), math.radians(b[0])
    dlo = math.radians(b[1] - a[1])
    y = math.sin(dlo) * math.cos(la2)
    x = math.cos(la1) * math.sin(la2) - math.sin(la1) * math.cos(la2) * math.cos(dlo)
    return (math.degrees(math.atan2(y, x)) + 360) % 360


def cumulative(geometry):
    cum = [0.0]
    for i in range(1, len(geometry)):
        cum.append(cum[-1] + haversine_km(geometry[i - 1], geometry[i]))
    return cum


def position_at(geometry, cum, km):
    """Point and heading `km` kilometres along the route."""
    if km >= cum[-1]:
        return geometry[-1], bearing(geometry[-2], geometry[-1])
    lo, hi = 0, len(cum) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if cum[mid] <= km:
            lo = mid
        else:
            hi = mid
    seg = cum[hi] - cum[lo]
    f = (km - cum[lo]) / seg if seg > 0 else 0
    a, b = geometry[lo], geometry[hi]
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], bearing(a, b)


def project_km(geometry, cum, point):
    """Distance along the route (km) of the spot on it closest to `point`. Used to carry on
    from the vehicle's position when its route is replaced by a rerouted one."""
    k = math.cos(math.radians(point[0]))

    def d2(p):
        return (p[0] - point[0]) ** 2 + ((p[1] - point[1]) * k) ** 2

    i = min(range(len(geometry)), key=lambda j: d2(geometry[j]))
    best_km, best = cum[i], d2(geometry[i])
    px, py = point[1] * k, point[0]
    for a, b in ((i - 1, i), (i, i + 1)):
        if a < 0 or b >= len(geometry):
            continue
        ax, ay = geometry[a][1] * k, geometry[a][0]
        bx, by = geometry[b][1] * k, geometry[b][0]
        sx, sy = bx - ax, by - ay
        length2 = sx * sx + sy * sy
        t = 0.0 if length2 == 0 else max(0.0, min(1.0, ((px - ax) * sx + (py - ay) * sy) / length2))
        d = (px - (ax + t * sx)) ** 2 + (py - (ay + t * sy)) ** 2
        if d < best:
            best, best_km = d, cum[a] + t * (cum[b] - cum[a])
    return best_km


def fetch_route(base, auth, trip_id):
    """The route saved on the trip. A trip with none gets the fastest road route instead.
    Returns None when there is no usable route."""
    saved = call(base, f"/trips/{trip_id}/route", headers=auth)
    if saved.get("has_route") and len(saved["geometry"]) >= 2:
        return {"geometry": saved["geometry"], "version": saved["version"],
                "route_type": saved["route_type"], "distance_km": saved["distance_km"]}
    info = call(base, f"/trips/{trip_id}/routes", headers=auth)
    route = next((r for r in info["routes"] if "fastest" in r["tags"]), info["routes"][0])
    if len(route["geometry"]) < 2:
        return None
    return {"geometry": route["geometry"], "version": "fallback", "route_type": "fastest",
            "distance_km": route["distance_km"]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--api", default="http://127.0.0.1:8000")
    ap.add_argument("--email", default="admin@fleetflow.com")
    ap.add_argument("--password", default="Admin@123")
    ap.add_argument("--interval", type=float, default=2.0, help="seconds between pings")
    ap.add_argument("--speedup", type=float, default=25.0,
                    help="how many times faster than real time the vehicles move")
    ap.add_argument("--vehicles", help="comma-separated registration numbers (default: all with a trip in progress)")
    args = ap.parse_args()

    token = call(args.api, "/auth/login", "POST",
                 {"email": args.email, "password": args.password})["access_token"]
    auth = {"Authorization": f"Bearer {token}"}
    wanted = {r.strip().upper() for r in args.vehicles.split(",")} if args.vehicles else None

    keys = {}    # vehicle_id -> tracker key (created once per run)
    fleet = {}   # vehicle_id -> state of a vehicle currently driving a trip
    print(f"Driving vehicles along their trip routes (movement x{args.speedup:g} faster than real time).")
    print("Start a trip on the Trips page to see a vehicle move. Press Ctrl+C to stop.")

    def refresh():
        vehicles = call(args.api, "/tracking/vehicles", headers=auth)
        active = {}
        for v in vehicles:
            if v.get("trip") is None:
                continue
            if wanted and v["registration_number"] not in wanted:
                continue
            active[v["vehicle_id"]] = v
        for vid in list(fleet):
            if vid not in active:
                print(f"{fleet[vid]['reg']}: no trip in progress, stopped.")
                del fleet[vid]
        for vid, v in active.items():
            trip_id = v["trip"]["id"]
            reg = v["registration_number"]
            if vid in fleet and fleet[vid]["trip_id"] == trip_id:
                # same trip: pick up a route change (a reroute) made since the last check
                f = fleet[vid]
                try:
                    r = fetch_route(args.api, auth, trip_id)
                except SystemExit as e:
                    print(f"{reg}: cannot re-check the route ({e}); keeping the current one.")
                    continue
                if r and r["version"] != f["version"]:
                    f["geometry"], f["version"] = r["geometry"], r["version"]
                    f["cum"] = cumulative(f["geometry"])
                    f["km"] = project_km(f["geometry"], f["cum"], f["pos"])
                    f["arrived"] = f["km"] >= f["cum"][-1] - 0.01
                    print(f"{reg}: route changed to {r['route_type']} ({r['distance_km']} km); "
                          "carrying on from the current position.")
                continue
            try:
                route = fetch_route(args.api, auth, trip_id)
            except SystemExit as e:
                print(f"{reg}: cannot get the route ({e}); skipped.")
                continue
            if not route:
                continue
            if vid not in keys:
                keys[vid] = call(args.api, f"/vehicles/{vid}/tracker-key", "POST",
                                 headers=auth)["tracker_key"]
            geometry = route["geometry"]
            fleet[vid] = {
                "reg": reg, "trip_id": trip_id, "key": keys[vid],
                "geometry": geometry, "cum": cumulative(geometry), "km": 0.0,
                "version": route["version"], "pos": geometry[0],
                "speed": random.uniform(50, 70), "arrived": False,
                "label": f"{v['trip']['origin']} -> {v['trip']['destination']}",
            }
            print(f"{reg}: driving {fleet[vid]['label']} on the {route['route_type']} route "
                  f"({route['distance_km']} km)")

    next_refresh = 0.0
    try:
        while True:
            if time.time() >= next_refresh:
                refresh()
                next_refresh = time.time() + 15
            for f in fleet.values():
                if not f["arrived"]:
                    f["speed"] = min(80, max(35, f["speed"] + random.uniform(-4, 4)))
                    f["km"] += f["speed"] * args.interval / 3600 * args.speedup
                    if f["km"] >= f["cum"][-1]:
                        f["arrived"] = True
                        print(f"{f['reg']}: arrived at {f['label']}. Complete the trip on the Trips page.")
                point, heading = position_at(f["geometry"], f["cum"], f["km"])
                f["pos"] = point
                call(args.api, "/tracking/ingest", "POST", {
                    "lat": round(point[0], 6), "lng": round(point[1], 6),
                    "speed_kmh": 0 if f["arrived"] else round(f["speed"], 1),
                    "heading": round(heading, 1),
                }, headers={"X-Tracker-Key": f["key"]})
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
