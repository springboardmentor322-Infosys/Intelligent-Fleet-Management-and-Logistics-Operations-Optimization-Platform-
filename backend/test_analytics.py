"""Checks the fleet analytics calculations (analytics plan, step 1). No server needed.

    cd backend
    python test_analytics.py

The expected numbers were worked out by hand from the fixed data below.
"""
from datetime import date, datetime, timedelta, timezone

import analytics as A

UTC = timezone.utc
results = []


def check(name, ok):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name)


def at(day, hour=0, minute=0):
    return datetime(2026, 11, day, hour, minute, tzinfo=UTC)


def trip(i, status, vehicle, driver, origin, dest, sched, started=None, done=None, km=None, punct=None):
    return {"id": i, "status": status, "vehicle_id": vehicle, "driver_id": driver,
            "origin": origin, "destination": dest, "scheduled_start": sched,
            "started_at": started, "completed_at": done, "distance_km": km, "punctuality": punct}


VEHICLES = [{"id": 1, "registration_number": "KA-01"}, {"id": 2, "registration_number": "KA-02"},
            {"id": 3, "registration_number": "KA-03"}, {"id": 4, "registration_number": "KA-04"}]
DRIVERS = [{"id": 1, "name": "Asha"}, {"id": 2, "name": "Ravi"}]
TRIPS = [
    trip(1, "Completed", 1, 1, "Kolkata", "Durgapur", at(2, 8), at(2, 8), at(2, 14), 180, "on_time"),   # 6 h
    trip(2, "Completed", 1, 1, "Kolkata", "Durgapur", at(4, 8), at(4, 8), at(4, 12), 170, "finished_late"),  # 4 h
    trip(3, "Completed", 2, 2, "Howrah", "Siliguri", at(5, 6), at(5, 6), at(5, 18), 560, "on_time"),   # 12 h
    trip(4, "Cancelled", 2, 2, "Howrah", "Siliguri", at(6, 8)),
    trip(5, "Planned", 1, 2, "Kolkata", "Asansol", at(9, 8)),
    trip(6, "In Progress", 3, 1, "Kolkata", "Durgapur", at(10, 8), at(10, 8)),
    trip(7, "Completed", 3, 2, "Salt Lake", "Barasat", datetime(2026, 10, 25, 8, tzinfo=UTC),
         datetime(2026, 10, 25, 8, tzinfo=UTC), datetime(2026, 10, 25, 10, tzinfo=UTC), 40, "on_time"),  # outside the period
    trip(8, "Completed", 3, 1, "Salt Lake", "Barasat", at(7, 9), at(7, 9), at(7, 10, 30), None, None),  # 1.5 h, no km
]
SHIPS = [
    {"id": 1, "status": "Delivered", "trip_id": 1}, {"id": 2, "status": "Delivered", "trip_id": 1},
    {"id": 3, "status": "Delivered", "trip_id": 3}, {"id": 4, "status": "Cancelled", "trip_id": 4},
    {"id": 5, "status": "Assigned", "trip_id": 5}, {"id": 6, "status": "Delayed", "trip_id": 6},
    {"id": 7, "status": "Delivered", "trip_id": 7},       # trip outside the period
    {"id": 8, "status": "Created", "trip_id": None},      # not on any trip
]
START, END = date(2026, 11, 1), date(2026, 11, 10)        # 10 days = 240 hours

R = A.build_report(VEHICLES, DRIVERS, TRIPS, SHIPS, START, END)

# ---- period and filters ----
check("period is 10 days", R["period"]["days"] == 10)
check("a trip outside the period is left out (7 of 8 trips)", R["trips"]["total"] == 7)
check("the last day is included (trip on 10 Nov)", any(t["id"] == 6 for t in A.filter_trips(TRIPS, START, END)))
check("the first day is included", [t["id"] for t in A.filter_trips(TRIPS, date(2026, 11, 2), date(2026, 11, 2))] == [1])
check("filter by vehicle", sorted(t["id"] for t in A.filter_trips(TRIPS, START, END, vehicle_id=1)) == [1, 2, 5])
check("filter by driver", sorted(t["id"] for t in A.filter_trips(TRIPS, START, END, driver_id=2)) == [3, 4, 5])
check("filter by status", sorted(t["id"] for t in A.filter_trips(TRIPS, START, END, status="Completed")) == [1, 2, 3, 8])
check("filters combine", [t["id"] for t in A.filter_trips(TRIPS, START, END, vehicle_id=1, driver_id=2)] == [5])

# ---- trips ----
c = R["trips"]
check("status counts", c["by_status"] == {"Planned": 1, "In Progress": 1, "Completed": 4, "Cancelled": 1})
check("completion rate = 4 / (4 + 1) = 80 %", c["completion_rate_percent"] == 80.0)
check("must-fail: a cancelled trip means the rate is not 100 %", c["completion_rate_percent"] != 100.0)

# ---- punctuality ----
p = R["punctuality"]
check("2 on time, 1 late, 3 judged (the trip without a planned ETA is not judged)",
      (p["on_time"], p["late"], p["judged"]) == (2, 1, 3))
check("on-time rate 66.7 %", p["on_time_rate_percent"] == 66.7)

# ---- distance ----
d = R["distance"]
check("total 910 km from the 3 trips that have a distance", d["total_km"] == 910.0 and d["trips_with_distance"] == 3)
check("average 303.3 km", d["average_km_per_trip"] == 303.3)
check("one completed trip has no distance and is reported", d["completed_without_distance"] == 1)
check("distance by day: 3 days, in date order, trip without km left out",
      [x["date"] for x in R["distance_by_day"]] == ["2026-11-02", "2026-11-04", "2026-11-05"]
      and [x["km"] for x in R["distance_by_day"]] == [180.0, 170.0, 560.0])

# ---- vehicle utilisation ----
u = R["vehicles"]
rows = {r["registration_number"]: r for r in u["vehicles"]}
check("KA-01: 10 h of 240 h = 4.2 %, 2 trips, 350 km",
      rows["KA-01"]["hours_driven"] == 10.0 and rows["KA-01"]["utilisation_percent"] == 4.2
      and rows["KA-01"]["completed_trips"] == 2 and rows["KA-01"]["km"] == 350.0)
check("KA-02: 12 h = 5.0 %", rows["KA-02"]["utilisation_percent"] == 5.0)
check("KA-03: 1.5 h = 0.6 %", rows["KA-03"]["utilisation_percent"] == 0.6)
check("KA-04 never moved: 0 %", rows["KA-04"]["utilisation_percent"] == 0.0 and rows["KA-04"]["completed_trips"] == 0)
check("sorted most used first", [r["registration_number"] for r in u["vehicles"]] == ["KA-02", "KA-01", "KA-03", "KA-04"])
check("3 vehicles used, 1 idle", (u["vehicles_used"], u["vehicles_idle"]) == (3, 1))
check("average utilisation about 2.45 %", abs(u["average_utilisation_percent"] - 2.45) <= 0.06)
check("must-fail: the idle count is not 0", u["vehicles_idle"] != 0)
big = [trip(9, "Completed", 1, 1, "A", "B", at(2, 0), at(2, 0), at(4, 0), 100, "on_time")]    # 48 h
check("utilisation is capped at 100 % (48 h in a 1-day period)",
      A.vehicle_utilisation(VEHICLES[:1], big, 1)["vehicles"][0]["utilisation_percent"] == 100.0)
check("a period of 0 days does not divide by zero", A.vehicle_utilisation(VEHICLES, TRIPS, 0)["vehicles"] is not None)

# ---- deliveries ----
dv = R["deliveries"]
check("only shipments on the filtered trips are counted (6 of 8)", dv["total"] == 6)
check("3 delivered, 1 delayed now", dv["delivered"] == 3 and dv["delayed_now"] == 1)
check("delivery success 3 / (3 + 1) = 75 %", dv["success_rate_percent"] == 75.0)

# ---- drivers ----
dr = {x["name"]: x for x in R["drivers"]}
check("Asha: 3 completed trips, 350 km, 1 late, 50 % on time",
      (dr["Asha"]["completed_trips"], dr["Asha"]["km"], dr["Asha"]["late_trips"], dr["Asha"]["on_time_rate_percent"]) == (3, 350.0, 1, 50.0))
check("Ravi: 1 completed trip, 560 km, 100 % on time",
      (dr["Ravi"]["completed_trips"], dr["Ravi"]["km"], dr["Ravi"]["on_time_rate_percent"]) == (1, 560.0, 100.0))
check("drivers sorted by completed trips", [x["name"] for x in R["drivers"]] == ["Asha", "Ravi"])

# ---- routes ----
rt = R["routes"]
check("busiest route: Kolkata -> Durgapur, 3 trips (cancelled trips do not count)",
      (rt[0]["origin"], rt[0]["destination"], rt[0]["trips"]) == ("Kolkata", "Durgapur", 3))
check("ties are broken alphabetically", [(r["origin"], r["destination"]) for r in rt[1:]] ==
      [("Howrah", "Siliguri"), ("Kolkata", "Asansol"), ("Salt Lake", "Barasat")])
check("routes are limited", len(A.busiest_routes(TRIPS, limit=2)) == 2)

# ---- insights ----
text = " | ".join(R["insights"])
check("insight: on-time rate", "66.7% of judged trips arrived on time (1 late of 3)" in text)
check("insight: most used vehicle", "KA-02 was the most used vehicle" in text)
check("insight: idle vehicle (singular)", "1 vehicle had no completed trips" in text)
check("insight: driver with most late trips", "Asha had the most late trips (1)" in text)
check("insight: delayed shipment (singular)", "1 shipment is delayed right now" in text)
check("insight: busiest route", "Busiest route: Kolkata to Durgapur (3 trips)" in text)

# ---- filters inside the report ----
Rv = A.build_report(VEHICLES, DRIVERS, TRIPS, SHIPS, START, END, vehicle_id=1)
check("vehicle filter: 3 trips, only that vehicle listed", Rv["trips"]["total"] == 3 and len(Rv["vehicles"]["vehicles"]) == 1)
check("vehicle filter narrows the deliveries too (trips 1, 2, 5: 3 shipments)", Rv["deliveries"]["total"] == 3)
Rd = A.build_report(VEHICLES, DRIVERS, TRIPS, SHIPS, START, END, driver_id=2)
check("driver filter: only that driver listed", [x["name"] for x in Rd["drivers"]] == ["Ravi"])

# ---- an empty period ----
E = A.build_report(VEHICLES, DRIVERS, [], [], START, END)
check("empty period: no rates (None, not 0 %) and no crash",
      E["trips"]["completion_rate_percent"] is None and E["punctuality"]["on_time_rate_percent"] is None
      and E["distance"]["average_km_per_trip"] is None and E["deliveries"]["success_rate_percent"] is None)
check("empty period: one honest insight", E["insights"] == ["No completed trips in this period yet."])
check("empty period: every vehicle idle", E["vehicles"]["vehicles_idle"] == 4 and E["vehicles"]["vehicles_used"] == 0)

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
