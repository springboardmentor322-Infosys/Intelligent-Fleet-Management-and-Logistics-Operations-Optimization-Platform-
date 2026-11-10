"""Checks for the shipment rules in shipments.py (Milestone 2, plan step 3).

No database, server or network needed: the rules (status changes, trip hooks, delay
flagging) work on plain objects. shipments.py imports the models, database and
security modules, so small stand-ins are used for those while it is imported.
Run from the backend folder:
    python test_shipments.py
(also works with pytest)
"""
import sys
import types
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import HTTPException


class _Row:
    def __init__(self, **kw):
        self.__dict__.update(kw)


class _Shipment(_Row):
    def __init__(self, **kw):
        self.id = None
        self.history, self.trip, self.trip_id = [], None, None
        self.eta = self.delivered_at = None
        super().__init__(**kw)


def _install_stubs():
    saved = {n: sys.modules.get(n) for n in ("models", "database", "security")}
    for name, attrs in {
        "models": dict(Shipment=_Shipment, ShipmentHistory=_Row,
                       SHIPMENT_STATUSES=("Created", "Assigned", "In Transit",
                                          "Delayed", "Delivered", "Cancelled"),
                       utcnow=lambda: datetime.now(timezone.utc)),
        "database": dict(get_db=lambda: None),
        "security": dict(get_current_user=lambda: None,
                         require_roles=lambda *roles: (lambda: None)),
    }.items():
        mod = types.ModuleType(name)
        mod.__dict__.update(attrs)
        sys.modules[name] = mod
    return saved


_saved = _install_stubs()
import shipments  # noqa: E402

for _name, _mod in _saved.items():  # put the real modules back
    if _mod is None:
        sys.modules.pop(_name, None)
    else:
        sys.modules[_name] = _mod

NOW = datetime(2026, 11, 5, 12, 0, tzinfo=timezone.utc)
PLANNED = NOW + timedelta(minutes=120)


class FakeDB:
    def __init__(self):
        self.rows, self.next_id = [], 1

    def add(self, row):
        self.rows.append(row)

    def flush(self):
        for r in self.rows:
            if r.id is None:
                r.id, self.next_id = self.next_id, self.next_id + 1


def ship(status="Created", **kw):
    s = _Shipment(code="SH-001", origin="A", destination="B", description="x",
                  weight_kg=10, status=status, **kw)
    return s


def trip_with(*statuses, late_min=0, status="In Progress"):
    t = SimpleNamespace(id=7, status=status, planned_eta=PLANNED,
                        eta=PLANNED + timedelta(minutes=late_min),
                        scheduled_start=NOW, completed_at=None, shipments=[])
    for st in statuses:
        s = ship(st)
        s.trip, s.trip_id = t, 7
        t.shipments.append(s)
    return t


def raises_409(fn):
    try:
        fn()
    except HTTPException as e:
        return e.status_code == 409
    return False


def test_create_shipment_code_and_history():
    db = FakeDB()
    data = SimpleNamespace(origin="A", destination="B", description="Steel", weight_kg=5)
    s1 = shipments.create_shipment(db, data, "dispatcher")
    s2 = shipments.create_shipment(db, data, "dispatcher")
    assert (s1.code, s2.code) == ("SH-001", "SH-002")
    assert s1.status == "Created" and len(s1.history) == 1
    assert s1.history[0].changed_by == "dispatcher"


def test_allowed_change_is_recorded():
    s = ship("Created")
    shipments.set_status(s, "Assigned", "Assigned to trip #7", "me")
    assert s.status == "Assigned"
    assert [h.status for h in s.history] == ["Assigned"]
    assert s.history[0].note == "Assigned to trip #7" and s.history[0].changed_by == "me"


def test_disallowed_changes_are_rejected():
    assert raises_409(lambda: shipments.set_status(ship("Created"), "Delivered"))
    assert raises_409(lambda: shipments.set_status(ship("Created"), "In Transit"))
    assert raises_409(lambda: shipments.set_status(ship("Assigned"), "Delivered"))


def test_delivered_and_cancelled_are_final():
    for final in ("Delivered", "Cancelled"):
        for target in shipments.TRANSITIONS:
            s = ship(final)
            assert raises_409(lambda: shipments.set_status(s, target)), (final, target)
            assert s.status == final and s.history == []


def test_delivered_sets_delivery_time():
    s = ship("In Transit")
    shipments.set_status(s, "Delivered")
    assert s.delivered_at is not None


def test_manual_changes_are_limited():
    assert shipments.MANUAL["Created"] == ("Cancelled",)
    assert shipments.MANUAL["In Transit"] == ("Delivered",)
    assert "Delivered" not in shipments.MANUAL and "Cancelled" not in shipments.MANUAL
    for frm, targets in shipments.MANUAL.items():  # manual is a subset of what's allowed
        assert set(targets) <= set(shipments.TRANSITIONS[frm])


def test_trip_start_moves_only_assigned_shipments():
    t = trip_with("Assigned", "Created", "Cancelled", status="In Progress")
    shipments.on_trip_start(t, "me")
    assert [s.status for s in t.shipments] == ["In Transit", "Created", "Cancelled"]
    assert t.shipments[0].eta == t.eta


def test_trip_complete_delivers_moving_shipments():
    t = trip_with("In Transit", "Delayed", "Cancelled", status="Completed")
    shipments.on_trip_complete(t, "me")
    assert [s.status for s in t.shipments] == ["Delivered", "Delivered", "Cancelled"]
    assert t.shipments[0].delivered_at is not None and t.shipments[0].eta is None


def test_trip_cancel_returns_open_shipments_to_unassigned():
    t = trip_with("Assigned", "In Transit", "Delayed", "Delivered", status="Cancelled")
    delivered = t.shipments[3]
    shipments.on_trip_cancel(t, "me")
    assert [s.status for s in t.shipments] == ["Created", "Created", "Created", "Delivered"]
    assert all(s.trip is None for s in t.shipments[:3]) and delivered.trip is t


def test_late_trip_flags_shipments_delayed():
    t = trip_with("In Transit", "Assigned", late_min=30)
    shipments.sync_delay(t, NOW)
    assert [s.status for s in t.shipments] == ["Delayed", "Assigned"]
    assert "30 min" in t.shipments[0].history[-1].note


def test_on_time_trip_is_left_alone():
    t = trip_with("In Transit", late_min=10)
    shipments.sync_delay(t, NOW)
    assert t.shipments[0].status == "In Transit" and t.shipments[0].history == []


def test_delay_flag_does_not_flip_back_and_forth():
    t = trip_with("In Transit", late_min=30)
    s = t.shipments[0]
    shipments.sync_delay(t, NOW)
    assert s.status == "Delayed"
    t.eta = PLANNED + timedelta(minutes=12)   # under the 15 min threshold, not clearly recovered
    shipments.sync_delay(t, NOW)
    assert s.status == "Delayed"
    t.eta = PLANNED + timedelta(minutes=8)    # clearly back on schedule
    shipments.sync_delay(t, NOW)
    assert s.status == "In Transit"
    assert [h.status for h in s.history] == ["Delayed", "In Transit"]


def test_repeated_sync_does_not_repeat_history():
    t = trip_with("In Transit", late_min=40)
    for _ in range(5):
        shipments.sync_delay(t, NOW)
    assert len(t.shipments[0].history) == 1


def test_sync_ignores_trips_that_are_not_running():
    t = trip_with("In Transit", late_min=40, status="Completed")
    shipments.sync_delay(t, NOW)
    assert t.shipments[0].status == "In Transit"


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items())
             if n.startswith("test_") and callable(f)]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {name}: {e!r}")
    print(f"\n{len(tests) - failed}/{len(tests)} passed")
    raise SystemExit(1 if failed else 0)
