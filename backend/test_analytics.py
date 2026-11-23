"""Checks for analytics_rules.py (no database). Run: python test_analytics.py  (also works with pytest)."""
from datetime import datetime, timedelta

import analytics_rules as R

T0 = datetime(2026, 11, 1, 12, 0)


def trip(i, driver="Asha", vehicle="KA01", status="Completed", late_min=0, eta=True, km=100,
         o="A", d="B", delayed_now=False):
    planned = T0 if eta else None
    return {"id": i, "vehicle": vehicle, "driver": driver, "origin": o, "destination": d,
            "status": status, "distance_km": km, "planned_eta": planned,
            "completed_at": (T0 + timedelta(minutes=late_min)) if status == "Completed" else None,
            "delayed_now": delayed_now}


def ship(trip_id, status="Delivered", was_delayed=False):
    return {"trip_id": trip_id, "status": status, "was_delayed": was_delayed}


def test_late_threshold_is_more_than_15_minutes():
    assert R.trip_late(T0 + timedelta(minutes=15), T0) is False      # exactly 15 is on time
    assert R.trip_late(T0 + timedelta(minutes=16), T0) is True
    assert R.trip_late(T0 - timedelta(minutes=30), T0) is False      # early is not late


def test_late_unknown_without_data():
    assert R.trip_late(None, T0) is None
    assert R.trip_late(T0, None) is None


def test_percentage_none_not_zero_when_empty():
    assert R.pct(0, 0) is None
    assert R.pct(3, 4) == 75.0


def test_utilisation_excludes_maintenance():
    vs = [{"registration_number": "A", "status": "Active"},
          {"registration_number": "B", "status": "Idle"},
          {"registration_number": "C", "status": "In Maintenance"},
          {"registration_number": "D", "status": "Idle"}]
    u = R.utilisation(vs, {"D"})
    assert u == {"total": 4, "used": 2, "available": 1, "in_maintenance": 1,
                 "utilisation_pct": round(100 * 2 / 3, 1)}


def test_utilisation_no_operational_vehicles():
    u = R.utilisation([{"registration_number": "C", "status": "In Maintenance"}], set())
    assert u["utilisation_pct"] is None and u["used"] == 0


def test_trip_counts_and_delayed():
    trips = [trip(1), trip(2, late_min=40), trip(3, status="In Progress", delayed_now=True),
             trip(4, status="Planned"), trip(5, status="Cancelled")]
    c = R.summarize(trips, [], [], [], set())["trips"]
    assert (c["completed"], c["ongoing"], c["planned"], c["cancelled"]) == (2, 1, 1, 1)
    assert c["delayed"] == 2          # one finished late + one running late


def test_delivery_on_time_rate():
    trips = [trip(i) for i in range(1, 5)]
    ships = [ship(1), ship(2), ship(3), ship(4, was_delayed=True), ship(1, "In Transit")]
    d = R.summarize(trips, ships, [], [], set())["delivery"]
    assert d["delivered"] == 4 and d["delayed"] == 1
    assert d["on_time_pct"] == 75.0 and d["in_transit"] == 1


def test_no_deliveries_gives_no_rate():
    d = R.summarize([trip(1)], [], [], [], set())["delivery"]
    assert d["on_time_pct"] is None


def test_shipments_of_unknown_trips_are_ignored():
    d = R.summarize([trip(1)], [ship(99)], [], [], set())["delivery"]
    assert d["delivered"] == 0


def test_driver_rows_and_distance():
    trips = [trip(1, driver="Asha", km=120.5), trip(2, driver="Asha", km=80, vehicle="KA02"),
             trip(3, driver="Ravi", km=50)]
    out = R.summarize(trips, [ship(1), ship(2, was_delayed=True)], [], [], set())
    rows = {r["driver"]: r for r in out["drivers"]}
    assert rows["Asha"]["completed_trips"] == 2 and rows["Asha"]["distance_km"] == 200.5
    assert rows["Asha"]["on_time_pct"] == 50.0 and rows["Ravi"]["on_time_pct"] is None
    assert out["drivers"][0]["driver"] == "Asha"       # most completed trips first
    assert out["total_distance_km"] == 250.5


def test_maintenance_totals_use_completed_cost_only():
    m = [{"vehicle": "A", "status": "Completed", "cost": 1000},
         {"vehicle": "A", "status": "Scheduled", "cost": 999},
         {"vehicle": "B", "status": "Cancelled", "cost": 50},
         {"vehicle": "B", "status": "Completed", "cost": None}]
    out = R.summarize([], [], m, [], set())["maintenance"]
    assert out == {"completed": 2, "pending": 1, "cancelled": 1, "spent": 1000.0}


def test_insights_flag_vehicle_driver_and_route():
    trips = [trip(1, late_min=40), trip(2, late_min=50), trip(3, driver="Ravi")]
    ships = [ship(1, was_delayed=True), ship(2, was_delayed=True)]
    m = [{"vehicle": "KA01", "status": "Completed", "cost": 1} for _ in range(3)]
    kinds = {(i["kind"], i["subject"]) for i in R.summarize(trips, ships, m, [], set())["insights"]}
    assert ("vehicle", "KA01") in kinds and ("driver", "Asha") in kinds
    assert ("route", "A → B") in kinds


def test_route_needs_enough_trips_to_be_judged():
    out = R.summarize([trip(1, late_min=60)], [], [], [], set())["insights"]
    assert not [i for i in out if i["kind"] == "route"]


def test_trips_without_eta_are_counted_but_not_judged():
    out = R.summarize([trip(1, eta=False), trip(2, eta=False)], [], [], [], set())
    assert out["trips"]["completed"] == 2 and out["trips"]["delayed"] == 0
    assert not out["insights"]


def test_must_fail_wrong_expectation_is_rejected():
    # a deliberately wrong expectation must NOT pass: 3 of 4 on time is not 100 %
    assert R.pct(3, 4) != 100.0


def _run():
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print("PASS ", name)
        except AssertionError as e:
            failed += 1
            print("FAIL ", name, e)
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    _run()
