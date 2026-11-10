"""Checks for the ETA and delay maths in logistics.py. Run: python test_logistics.py"""
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace as NS

import logistics as L

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
# A straight north-south route of 11 points, 0.1 degree apart (about 11.1 km each hop)
POINTS = [[20.0 + i * 0.1, 80.0] for i in range(11)]
LENGTH = L.RouteGeometry(POINTS).length_km


def trip(**kw):
    base = dict(id=1, status="In Progress", route_geometry=json.dumps(POINTS),
                route_duration_min=120.0, delay_minutes=0, planned_eta=NOW + timedelta(hours=2),
                eta=NOW + timedelta(hours=2), scheduled_start=NOW, completed_at=None, shipments=[])
    base.update(kw)
    return NS(**base)


def close(a, b, tol=0.5):
    assert abs(a - b) <= tol, f"{a} is not within {tol} of {b}"


def minutes(eta):
    return (eta - NOW).total_seconds() / 60


# 1. At the start the ETA is the full planned time
close(minutes(L.compute_eta(trip(), 20.0, 80.0, NOW)), 120, 0.5)

# 2. Half way along, about half the time is left
close(minutes(L.compute_eta(trip(), 20.5, 80.0, NOW)), 60, 1.0)

# 3. At the destination, nothing is left
close(minutes(L.compute_eta(trip(), 21.0, 80.0, NOW)), 0, 0.5)

# 4. Accumulated delay is added on top
close(minutes(L.compute_eta(trip(delay_minutes=30), 20.5, 80.0, NOW)), 90, 1.0)

# 5. A ping partway along moves the ETA as the vehicle advances
t = trip(id=2)
first = minutes(L.compute_eta(t, 20.2, 80.0, NOW))
later = minutes(L.compute_eta(t, 20.6, 80.0, NOW))
assert later < first, "ETA must fall as the vehicle moves along the route"

# 6. update_eta also moves the ETA of open shipments, but not delivered ones
open_s, done_s = NS(status="In Transit", eta=None), NS(status="Delivered", eta="old")
t = trip(id=3, shipments=[open_s, done_s])
assert L.update_eta(t, 20.5, 80.0, NOW)
assert open_s.eta == t.eta and done_s.eta == "old"

# 7. No route -> no ETA, and nothing crashes
assert L.compute_eta(trip(id=4, route_geometry=None), 20.0, 80.0, NOW) is None
assert not L.update_eta(trip(id=5, route_geometry=None), 20.0, 80.0, NOW)

# 8. Delay rules
planned = NOW + timedelta(hours=2)
d = L.delay_info(trip(eta=planned + timedelta(minutes=10)), NOW)
assert d["state"] == "on_time" and not d["delayed"]          # inside the 15 min threshold
d = L.delay_info(trip(eta=planned + timedelta(minutes=20)), NOW)
assert d["state"] == "delayed" and d["delayed"] and d["late_minutes"] == 20
d = L.delay_info(trip(status="Planned", scheduled_start=NOW - timedelta(minutes=30)), NOW)
assert d["state"] == "late_to_start" and d["delayed"]
d = L.delay_info(trip(status="Planned", scheduled_start=NOW + timedelta(hours=1)), NOW)
assert d["state"] == "on_time" and not d["delayed"]
d = L.delay_info(trip(status="Completed", completed_at=planned + timedelta(minutes=40)), NOW)
assert d["state"] == "finished_late" and not d["delayed"]    # history, not a live alert
assert L.delay_info(trip(status="Cancelled"), NOW)["state"] is None

# 9. A route that doubles back on itself must not make the vehicle jump
loop = [[20.0, 80.0], [20.2, 80.0], [20.2, 80.0005], [20.0, 80.0005], [20.0, 80.0]]
r = L.RouteGeometry(loop)
r.progress = 1
assert r.locate(20.2, 80.0001) in (1, 2)

# 10. Estimated vs actual arrival, and route performance
done = dict(status="Completed", planned_eta=planned, eta=planned + timedelta(minutes=30))
late = trip(id=6, completed_at=planned + timedelta(minutes=40), route_type="fastest", **done)
okay = trip(id=7, completed_at=planned + timedelta(minutes=5), route_type="fastest", **done)
c = L.arrival_comparison(late)
assert c["vs_plan_min"] == 40 and c["vs_last_eta_min"] == 10 and not c["on_time"]
assert L.arrival_comparison(okay)["on_time"]
assert L.arrival_comparison(trip(status="In Progress")) is None            # not finished
assert L.arrival_comparison(trip(status="Completed", completed_at=NOW, planned_eta=None)) is None
perf = L.route_performance([late, okay, trip(status="Planned")])
assert len(perf) == 1 and perf[0]["route_type"] == "fastest" and perf[0]["trips"] == 2
assert perf[0]["on_time_pct"] == 50 and perf[0]["avg_vs_plan_min"] == 22.5
assert perf[0]["avg_eta_error_min"] == 17.5                                 # (10 + 25) / 2
assert L.route_performance([]) == []

print("All logistics checks passed.")
