"""Checks the fleet analytics calculations in analytics_rules.py (Milestone 3, Tasks 4 and 5).
No server or database needed.

    cd backend
    python test_analytics.py

The expected numbers were worked out by hand from the fixed data below.
"""
from datetime import datetime, timedelta, timezone

import analytics_rules as A

UTC = timezone.utc
results = []


def check(name, ok):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name)


PLAN = datetime(2026, 11, 5, 12, 0, tzinfo=UTC)


def minutes(n):
    return PLAN + timedelta(minutes=n)


def trip(i, status, vehicle, driver, origin, dest, km=None, planned=PLAN, done=None, delayed_now=False):
    return {"id": i, "status": status, "vehicle": vehicle, "driver": driver, "origin": origin,
            "destination": dest, "distance_km": km, "planned_eta": planned,
            "completed_at": done, "delayed_now": delayed_now}


def ship(trip_id, status, was_delayed=False):
    return {"trip_id": trip_id, "status": status, "was_delayed": was_delayed}


# ---- the rules on their own ----
check("on time: 10 minutes after the planned ETA", A.trip_late(minutes(10), PLAN) is False)
check("exactly 15 minutes after is still on time (the rule is 'more than')", A.trip_late(minutes(15), PLAN) is False)
check("16 minutes after is late", A.trip_late(minutes(16), PLAN) is True)
check("early is on time", A.trip_late(minutes(-60), PLAN) is False)
check("no planned ETA: unknown, not 'on time'", A.trip_late(minutes(5), None) is None)
check("not finished: unknown", A.trip_late(None, PLAN) is None)
check("pct rounds to one decimal", A.pct(2, 3) == 66.7)
check("must-fail: pct of nothing is None, not 0 %", A.pct(0, 0) is None)

# ---- fixed data ----
VEHICLES = [
    {"registration_number": "KA-01", "status": "Idle"},
    {"registration_number": "KA-02", "status": "Active"},
    {"registration_number": "KA-03", "status": "In Maintenance"},
    {"registration_number": "KA-04", "status": "Idle"},
]
BUSY = {"KA-01"}
TRIPS = [
    trip(1, "Completed", "KA-01", "Asha", "Kolkata", "Durgapur", 180, done=minutes(10)),   # on time
    trip(2, "Completed", "KA-01", "Asha", "Kolkata", "Durgapur", 170, done=minutes(40)),   # late
    trip(3, "Completed", "KA-02", "Ravi", "Howrah", "Siliguri", 560, done=minutes(15)),    # on time (exactly 15)
    trip(4, "Completed", "KA-02", "Ravi", "Howrah", "Siliguri", None, planned=None, done=minutes(5)),  # unknown
    trip(5, "Cancelled", "KA-02", "Ravi", "Howrah", "Siliguri"),
    trip(6, "Planned", "KA-01", "Asha", "Kolkata", "Asansol"),
    trip(7, "In Progress", "KA-02", "Ravi", "Howrah", "Siliguri", delayed_now=True),
    trip(8, "In Progress", "KA-01", "Asha", "Kolkata", "Durgapur", delayed_now=False),
]
SHIPS = [
    ship(1, "Delivered"), ship(1, "Delivered", was_delayed=True),
    ship(3, "Delivered"), ship(2, "Delivered"),
    ship(7, "Delayed", was_delayed=True), ship(5, "Cancelled"),
    ship(99, "Delivered"),                      # on no listed trip: left out
]
MAINT = [
    {"vehicle": "KA-03", "status": "Completed", "cost": 1000},
    {"vehicle": "KA-03", "status": "Completed", "cost": 2500.5},
    {"vehicle": "KA-03", "status": "Scheduled", "cost": None},
    {"vehicle": "KA-04", "status": "In Progress", "cost": None},
    {"vehicle": "KA-01", "status": "Cancelled", "cost": 999},     # cancelled work is not spend
]

R = A.summarize(TRIPS, SHIPS, MAINT, VEHICLES, BUSY)

# ---- utilisation ----
u = R["utilisation"]
check("4 vehicles, 1 in maintenance", u["total"] == 4 and u["in_maintenance"] == 1)
check("2 of 3 operational vehicles in use (KA-01 busy, KA-02 Active), 1 available",
      u["used"] == 2 and u["available"] == 1)
check("utilisation 2 / 3 = 66.7 %", u["utilisation_pct"] == 66.7)
check("must-fail: the vehicle in maintenance is not counted as available", u["available"] != 2)
check("no vehicles: utilisation is None",
      A.utilisation([], set())["utilisation_pct"] is None)
check("only vehicles in maintenance: utilisation is None, not a crash",
      A.utilisation([{"registration_number": "X", "status": "In Maintenance"}], set())["utilisation_pct"] is None)

# ---- trips ----
t = R["trips"]
check("trip counts: 4 completed, 2 ongoing, 1 planned, 1 cancelled",
      (t["completed"], t["ongoing"], t["planned"], t["cancelled"]) == (4, 2, 1, 1))
check("delayed trips = 1 running late + 1 finished late = 2", t["delayed"] == 2)
check("must-fail: a trip with no planned ETA is not counted as delayed", t["delayed"] != 3)

# ---- deliveries ----
d = R["delivery"]
check("4 delivered (the shipment on an unlisted trip is left out)", d["delivered"] == 4)
check("1 delivered late", d["delayed"] == 1)
check("on-time delivery 3 / 4 = 75 %", d["on_time_pct"] == 75.0)
check("1 shipment still moving (Delayed counts as in transit), 1 cancelled",
      d["in_transit"] == 1 and d["cancelled"] == 1)

# ---- drivers ----
dr = {x["driver"]: x for x in R["drivers"]}
check("Asha: 2 completed trips, 350 km, 3 deliveries, 1 delayed, 66.7 % on time",
      (dr["Asha"]["completed_trips"], dr["Asha"]["distance_km"], dr["Asha"]["deliveries"],
       dr["Asha"]["delayed_deliveries"], dr["Asha"]["on_time_pct"]) == (2, 350.0, 3, 1, 66.7))
check("Ravi: 2 completed trips, 560 km (a trip without km adds nothing), 1 delivery, 100 % on time",
      (dr["Ravi"]["completed_trips"], dr["Ravi"]["distance_km"], dr["Ravi"]["deliveries"],
       dr["Ravi"]["on_time_pct"]) == (2, 560.0, 1, 100.0))
check("drivers sorted by completed trips, then name", [x["driver"] for x in R["drivers"]] == ["Asha", "Ravi"])

# ---- distance ----
check("distance by vehicle", R["distance_by_vehicle"] == {"KA-01": 350.0, "KA-02": 560.0})
check("total distance 910 km", R["total_distance_km"] == 910.0)

# ---- maintenance ----
m = R["maintenance"]
check("maintenance: 2 completed, 2 pending (Scheduled + In Progress), 1 cancelled",
      (m["completed"], m["pending"], m["cancelled"]) == (2, 2, 1))
check("spent 3500.5 (only completed work)", m["spent"] == 3500.5)
check("must-fail: cancelled work is not added to the spend", m["spent"] != 4499.5)

# ---- insights ----
kinds = [(i["kind"], i["subject"]) for i in R["insights"]]
check("insight: KA-03 has 3 maintenance records", ("vehicle", "KA-03") in kinds)
check("no insight for vehicles with 1 record", ("vehicle", "KA-04") not in kinds)
check("insight: Kolkata → Durgapur, 1 of 2 trips late", ("route", "Kolkata → Durgapur") in kinds)
check("a route with a single trip is not judged", ("route", "Howrah → Siliguri") not in kinds)
check("no driver insight: nobody has 2 delayed deliveries", not any(k == "driver" for k, _ in kinds))
check("exactly 2 insights", len(R["insights"]) == 2)

more = A.summarize(
    [trip(1, "Completed", "KA-01", "Dev", "A", "B", 10, done=minutes(0))],
    [ship(1, "Delivered", True), ship(1, "Delivered", True)], [], VEHICLES, set())
check("insight: a driver with 2 delayed deliveries is flagged",
      [(i["kind"], i["subject"]) for i in more["insights"]] == [("driver", "Dev")])

# ---- nothing recorded ----
E = A.summarize([], [], [], [], set())
check("empty: zero counts and no crash",
      E["trips"] == {"completed": 0, "ongoing": 0, "planned": 0, "cancelled": 0, "delayed": 0}
      and E["drivers"] == [] and E["insights"] == [] and E["total_distance_km"] == 0)
check("empty: rates are None, not 0 %",
      E["delivery"]["on_time_pct"] is None and E["utilisation"]["utilisation_pct"] is None)

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
