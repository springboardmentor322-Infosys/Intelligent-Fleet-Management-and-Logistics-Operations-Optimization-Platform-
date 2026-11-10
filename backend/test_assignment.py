"""Checks for the driver assignment rules (Milestone 3, Task 2). No database needed.
Run from the backend folder:  python test_assignment.py   (also works with pytest)
"""
import assignment_rules as r


def ok(**kw):
    args = dict(trip_status="Planned", same_pair=False, vehicle_status="Idle", capacity=1000,
                load_kg=500, attendance="Present", vehicle_conflict=None, driver_conflict=None)
    args.update(kw)
    return r.problem(**args)


def test_valid_assignment_has_no_problem():
    assert ok() is None
    assert ok(attendance=None) is None  # no attendance record yet is fine


def test_only_planned_trips():
    for s in ("In Progress", "Completed", "Cancelled"):
        assert ok(trip_status=s)[0] == 409


def test_same_pair_refused():
    assert ok(same_pair=True)[0] == 409


def test_vehicle_in_maintenance_refused():
    code, msg = ok(vehicle_status="In Maintenance")
    assert code == 409 and "maintenance" in msg


def test_capacity():
    assert ok(load_kg=1000) is None          # exactly full is allowed
    assert ok(load_kg=1000.5)[0] == 400


def test_driver_off_duty_refused():
    assert ok(attendance="On Leave")[0] == 409
    assert ok(attendance="Absent")[0] == 409


def test_conflicts_name_the_other_trip():
    assert "#7" in ok(vehicle_conflict=7)[1]
    assert "#9" in ok(driver_conflict=9)[1]


def test_derived_states():
    assert r.driver_state("Present", []) == "Available"
    assert r.driver_state("Present", ["Planned"]) == "Assigned"
    assert r.driver_state("Present", ["Planned", "In Progress"]) == "On Trip"
    assert r.driver_state("Absent", ["In Progress"]) == "Off Duty"
    assert r.vehicle_state("Idle", []) == "Available"
    assert r.vehicle_state("Active", ["Planned"]) == "Assigned"
    assert r.vehicle_state("Active", ["In Progress"]) == "On Trip"
    assert r.vehicle_state("In Maintenance", ["Planned"]) == "In Maintenance"


def test_assignment_status_follows_trip():
    assert r.assignment_status("Planned") == "Active"
    assert r.assignment_status("In Progress") == "Active"
    assert r.assignment_status("Completed") == "Completed"
    assert r.assignment_status("Cancelled") == "Cancelled"


def test_must_fail_wrong_expectation_is_rejected():
    assert ok(vehicle_status="In Maintenance") is not None
    assert r.driver_state("Present", ["Planned"]) != "On Trip"


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except AssertionError as e:
            failed += 1
            print(f"FAIL  {name}  {e}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
