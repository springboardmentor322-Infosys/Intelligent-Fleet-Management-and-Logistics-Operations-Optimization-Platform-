"""Checks for the maintenance rules in maintenance_rules.py (Milestone 3, Task 1 and 3).

No database, server or network needed. Run from the backend folder:
    python test_maintenance.py
(also works with pytest)
"""
from datetime import date, timedelta

import maintenance_rules as r

TODAY = date(2026, 11, 6)


def d(days):
    return TODAY + timedelta(days=days)


def test_status_changes():
    assert r.can_change("Scheduled", "In Progress")
    assert r.can_change("Scheduled", "Cancelled")
    assert r.can_change("In Progress", "Completed")
    assert r.can_change("In Progress", "Cancelled")
    assert not r.can_change("Scheduled", "Completed")  # must be started first
    assert not r.can_change("In Progress", "Scheduled")


def test_completed_and_cancelled_are_final():
    for final in ("Completed", "Cancelled"):
        for new in r.TRANSITIONS:
            assert not r.can_change(final, new), (final, new)


def test_classify():
    assert r.classify("Scheduled", d(-1), TODAY) == "Overdue"
    assert r.classify("Scheduled", d(0), TODAY) == "Upcoming"   # due today is not overdue
    assert r.classify("Scheduled", d(7), TODAY) == "Upcoming"   # last day of the window
    assert r.classify("Scheduled", d(8), TODAY) is None
    assert r.classify("In Progress", d(-3), TODAY) is None
    assert r.classify("Completed", d(-3), TODAY) is None
    assert r.classify("Cancelled", d(-3), TODAY) is None


def test_alert_created_then_idempotent():
    act = r.alert_action("Scheduled", d(2), TODAY, None)
    assert act == ("set", "Upcoming")
    assert r.alert_action("Scheduled", d(2), TODAY, "Upcoming") is None  # repeat run: no change


def test_alert_escalates_to_overdue():
    assert r.alert_action("Scheduled", d(-1), TODAY, "Upcoming") == ("set", "Overdue")


def test_alert_resolved_when_work_finishes():
    assert r.alert_action("Completed", d(-1), TODAY, "Overdue") == ("resolve",)
    assert r.alert_action("Cancelled", d(1), TODAY, "Upcoming") == ("resolve",)
    assert r.alert_action("Completed", d(-1), TODAY, "Resolved") is None
    assert r.alert_action("Completed", d(-1), TODAY, None) is None


def test_alert_cleared_when_rescheduled_far_away():
    assert r.alert_action("Scheduled", d(30), TODAY, "Upcoming") == ("clear",)
    assert r.alert_action("Scheduled", d(30), TODAY, None) is None


def test_date_range():
    assert r.date_range_ok(None, None)
    assert r.date_range_ok(d(0), None)
    assert r.date_range_ok(d(0), d(0))
    assert not r.date_range_ok(d(1), d(0))


def _rows():
    return [
        dict(registration_number="A", status="Completed", scheduled_date=d(-10),
             estimated_cost=100, actual_cost=120),
        dict(registration_number="A", status="Scheduled", scheduled_date=d(-2),
             estimated_cost=50, actual_cost=None),   # overdue
        dict(registration_number="B", status="In Progress", scheduled_date=d(-2),
             estimated_cost=200, actual_cost=None),  # started: not overdue
        dict(registration_number="B", status="Scheduled", scheduled_date=d(20),
             estimated_cost=75, actual_cost=None),
        dict(registration_number="B", status="Cancelled", scheduled_date=d(1),
             estimated_cost=999, actual_cost=None),
    ]


def test_summary_counts_and_totals():
    s = r.summarize(_rows(), TODAY)
    assert (s["scheduled"], s["in_progress"], s["completed"], s["cancelled"]) == (2, 1, 1, 1)
    assert s["pending"] == 3
    assert s["overdue"] == 1
    assert s["spent"] == 120            # only completed work, at its actual cost
    assert s["open_estimate"] == 325    # 50 + 200 + 75; the cancelled 999 is ignored
    assert s["per_vehicle"]["A"] == {"records": 2, "spent": 120.0, "open_estimate": 50.0}
    assert s["per_vehicle"]["B"]["records"] == 3
    assert s["per_vehicle"]["B"]["spent"] == 0


def test_summary_of_nothing():
    s = r.summarize([], TODAY)
    assert s["pending"] == 0 and s["spent"] == 0 and s["per_vehicle"] == {}


def test_must_fail_wrong_expectation_is_rejected():
    """Guards the tests themselves: this deliberately wrong claim must NOT hold."""
    assert r.classify("Scheduled", d(-1), TODAY) != "Upcoming"
    assert r.can_change("Completed", "Scheduled") is False


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items())
             if n.startswith("test_") and callable(f)]
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
