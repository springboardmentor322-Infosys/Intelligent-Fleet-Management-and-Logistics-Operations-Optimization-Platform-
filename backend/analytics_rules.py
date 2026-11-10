"""Pure operational-analytics calculations (Milestone 3, Tasks 4 and 5). No database: see
test_analytics.py. analytics.py loads the rows and calls summarize().

Definitions (kept in one place so the dashboard and any report agree):
  * A completed trip is "late" when it finished more than LATE_MIN minutes after its planned
    ETA. Trips with no planned ETA are not counted either way (unknown, not on time).
  * A delivery is "delayed" when its shipment was flagged Delayed at any point.
  * On-time % = deliveries that were never delayed / deliveries, empty (None) with no deliveries.
  * Utilisation = vehicles in use / operational vehicles (vehicles in maintenance are excluded).
"""

LATE_MIN = 15
FREQUENT_MAINTENANCE = 3   # this many records in the period flags a vehicle
REPEATED_DELAYS = 2        # this many delayed deliveries flags a driver
POOR_ROUTE_MIN_TRIPS = 2   # a route needs this many completed trips before it can be judged
POOR_ROUTE_LATE_SHARE = 0.5


def trip_late(completed_at, planned_eta, late_min=LATE_MIN):
    """True / False, or None when it cannot be known."""
    if completed_at is None or planned_eta is None:
        return None
    return (completed_at - planned_eta).total_seconds() / 60 > late_min


def pct(part, whole):
    return None if not whole else round(100 * part / whole, 1)


def utilisation(vehicles, busy):
    """vehicles: [{registration_number, status}], busy: set of registrations in use now."""
    maint = sum(1 for v in vehicles if v["status"] == "In Maintenance")
    operational = [v for v in vehicles if v["status"] != "In Maintenance"]
    used = sum(1 for v in operational if v["registration_number"] in busy or v["status"] == "Active")
    return {
        "total": len(vehicles), "used": used, "available": len(operational) - used,
        "in_maintenance": maint, "utilisation_pct": pct(used, len(operational)),
    }


def summarize(trips, shipments, maintenance, vehicles, busy):
    """
    trips: dicts id, vehicle, driver, origin, destination, status, distance_km,
           planned_eta, completed_at, delayed_now
    shipments: dicts trip_id, status, was_delayed
    maintenance: dicts vehicle, status, cost (actual cost of completed work)
    vehicles: dicts registration_number, status;  busy: set of registrations in use now
    """
    by_id = {t["id"]: t for t in trips}
    late = {t["id"]: trip_late(t["completed_at"], t["planned_eta"]) for t in trips
            if t["status"] == "Completed"}

    counts = {"completed": 0, "ongoing": 0, "planned": 0, "cancelled": 0}
    for t in trips:
        counts[{"Completed": "completed", "In Progress": "ongoing",
                "Planned": "planned", "Cancelled": "cancelled"}[t["status"]]] += 1
    counts["delayed"] = sum(1 for t in trips if t["status"] == "In Progress" and t["delayed_now"]) \
        + sum(1 for v in late.values() if v)

    mine = [s for s in shipments if s["trip_id"] in by_id]
    delivered = [s for s in mine if s["status"] == "Delivered"]
    delayed_deliveries = [s for s in delivered if s["was_delayed"]]
    delivery = {
        "delivered": len(delivered), "delayed": len(delayed_deliveries),
        "on_time_pct": pct(len(delivered) - len(delayed_deliveries), len(delivered)),
        "in_transit": sum(1 for s in mine if s["status"] in ("In Transit", "Delayed")),
        "cancelled": sum(1 for s in mine if s["status"] == "Cancelled"),
    }

    drivers = {}
    for t in trips:
        d = drivers.setdefault(t["driver"], {
            "driver": t["driver"], "completed_trips": 0, "deliveries": 0,
            "delayed_deliveries": 0, "distance_km": 0.0})
        if t["status"] == "Completed":
            d["completed_trips"] += 1
            d["distance_km"] += t["distance_km"] or 0
    for s in delivered:
        d = drivers[by_id[s["trip_id"]]["driver"]]
        d["deliveries"] += 1
        d["delayed_deliveries"] += 1 if s["was_delayed"] else 0
    driver_rows = []
    for d in drivers.values():
        d["distance_km"] = round(d["distance_km"], 1)
        d["on_time_pct"] = pct(d["deliveries"] - d["delayed_deliveries"], d["deliveries"])
        driver_rows.append(d)
    driver_rows.sort(key=lambda d: (-d["completed_trips"], d["driver"]))

    distance = {}
    for t in trips:
        if t["status"] == "Completed" and t["distance_km"]:
            distance[t["vehicle"]] = round(distance.get(t["vehicle"], 0) + t["distance_km"], 1)

    m = {"completed": 0, "pending": 0, "cancelled": 0, "spent": 0.0}
    per_vehicle_maint = {}
    for r in maintenance:
        key = {"Completed": "completed", "Cancelled": "cancelled"}.get(r["status"], "pending")
        m[key] += 1
        if r["status"] == "Completed":
            m["spent"] += r["cost"] or 0
        per_vehicle_maint[r["vehicle"]] = per_vehicle_maint.get(r["vehicle"], 0) + 1
    m["spent"] = round(m["spent"], 2)

    routes = {}
    for t in trips:
        if t["status"] == "Completed" and late.get(t["id"]) is not None:
            r = routes.setdefault((t["origin"], t["destination"]), [0, 0])
            r[0] += 1
            r[1] += 1 if late[t["id"]] else 0
    insights = []
    for reg, n in sorted(per_vehicle_maint.items()):
        if n >= FREQUENT_MAINTENANCE:
            insights.append({"kind": "vehicle", "subject": reg,
                             "message": f"{reg} had {n} maintenance records in this period"})
    for d in driver_rows:
        if d["delayed_deliveries"] >= REPEATED_DELAYS:
            insights.append({"kind": "driver", "subject": d["driver"],
                             "message": f"{d['driver']} had {d['delayed_deliveries']} delayed deliveries"})
    for (o, dest), (n, n_late) in sorted(routes.items()):
        if n >= POOR_ROUTE_MIN_TRIPS and n_late / n >= POOR_ROUTE_LATE_SHARE:
            insights.append({"kind": "route", "subject": f"{o} → {dest}",
                             "message": f"{o} → {dest}: {n_late} of {n} trips arrived late"})

    return {
        "utilisation": utilisation(vehicles, busy), "trips": counts, "delivery": delivery,
        "drivers": driver_rows, "distance_by_vehicle": distance,
        "total_distance_km": round(sum(distance.values()), 1),
        "maintenance": m, "insights": insights,
    }
