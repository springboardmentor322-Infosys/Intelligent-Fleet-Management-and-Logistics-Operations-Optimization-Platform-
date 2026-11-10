"""Checks driver duty status, licence status and performance (plan step 2). No server needed.

    cd backend
    python test_driver_stats.py
"""
from datetime import date, datetime, timedelta, timezone

from driver_stats import duty_status, is_stopped, licence_status, performance

NOW = datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)
TODAY = date(2026, 11, 7)
results = []


def check(name, ok):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name)


def pings(*minutes_ago_and_speed):
    """[(minutes ago, speed), ...] -> [(datetime, speed), ...]"""
    return [(NOW - timedelta(minutes=m), s) for m, s in minutes_ago_and_speed]


STANDING = pings((4.5, 0), (3, 1), (1, 0), (0.2, 2))       # slow for the whole window
MOVING = pings((4.5, 60), (3, 55), (1, 58), (0.2, 62))
BRIEF = pings((1.5, 0), (0.5, 0), (0.2, 0))                # slow, but only for ~1 minute

# ---- duty status ----
check("no trip, present -> Available", duty_status(True, "Present", False, [], NOW) == "Available")
check("no attendance record yet -> Available", duty_status(True, None, False, [], NOW) == "Available")
check("trip in progress and moving -> On Trip", duty_status(True, "Present", True, MOVING, NOW) == "On Trip")
check("trip in progress and standing still for the window -> At Stop",
      duty_status(True, "Present", True, STANDING, NOW) == "At Stop")
check("standing still but not on a trip is not At Stop", duty_status(True, "Present", False, STANDING, NOW) == "Available")
check("absent today -> Off Duty", duty_status(True, "Absent", False, [], NOW) == "Off Duty")
check("on leave today -> Off Duty", duty_status(True, "On Leave", False, [], NOW) == "Off Duty")
check("deactivated account -> Off Duty", duty_status(False, "Present", False, [], NOW) == "Off Duty")
check("a driver with no login (None) is not Off Duty by that alone",
      duty_status(None, "Present", False, [], NOW) == "Available")

# ---- the At Stop edges ----
check("slow for only ~1 minute is not a stop", not is_stopped(BRIEF, NOW))
check("a single ping is not a stop", not is_stopped(pings((0.2, 0)), NOW))
check("no pings is not a stop", not is_stopped([], NOW))
check("unknown speeds are ignored, not treated as 0",
      not is_stopped(pings((4.5, None), (3, None), (0.2, None)), NOW))
check("one fast ping inside the window cancels the stop",
      not is_stopped(pings((4.5, 0), (3, 40), (1, 0), (0.2, 0)), NOW))
check("a stale last ping (5 minutes old) is not a stop",
      not is_stopped(pings((12, 0), (9, 0), (5, 0)), NOW))
check("exactly 3 km/h counts as moving", not is_stopped(pings((4.5, 3), (0.2, 3)), NOW))

# ---- licence ----
check("no expiry -> Not set", licence_status(None, TODAY) == "Not set")
check("yesterday -> Expired", licence_status(TODAY - timedelta(days=1), TODAY) == "Expired")
check("today -> Expiring soon", licence_status(TODAY, TODAY) == "Expiring soon")
check("in 30 days -> Expiring soon", licence_status(TODAY + timedelta(days=30), TODAY) == "Expiring soon")
check("in 31 days -> Valid", licence_status(TODAY + timedelta(days=31), TODAY) == "Valid")

# ---- performance ----
p = performance(["on_time", "on_time", "finished_late", "on_time"], 7, 0)
check("completed trips counted", p["completed_trips"] == 4)
check("successful deliveries passed through", p["successful_deliveries"] == 7)
check("3 of 4 on time -> 75.0 %", p["on_time_rate_percent"] == 75.0)
check("one finished late -> 1 delay", p["delays"] == 1)
check("a trip late right now adds a delay", performance(["on_time"], 0, 1)["delays"] == 1)
e = performance([], 0, 0)
check("no completed trips -> no rate (None, not 0 %) and no crash", e["on_time_rate_percent"] is None and e["completed_trips"] == 0)
u = performance(["on_time", None, None], 0, 0)
check("trips with no planned ETA count as completed but are not judged",
      u["completed_trips"] == 3 and u["judged_trips"] == 1 and u["on_time_rate_percent"] == 100.0)
check("only unjudgeable trips -> no rate", performance([None, None], 0, 0)["on_time_rate_percent"] is None)

# ---- must-fail: wrong expectations have to be rejected ----
check("must-fail: a stopped vehicle is not 'On Trip'",
      duty_status(True, "Present", True, STANDING, NOW) != "On Trip")
check("must-fail: 3 of 4 on time is not 100 %", p["on_time_rate_percent"] != 100.0)

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
