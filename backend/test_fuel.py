"""Checks for the fuel calculations in fuel_rules.py (Milestone 3, Task 6). No database needed.
Run from the backend folder:  python test_fuel.py   (also works with pytest)
"""
from datetime import date

import fuel_rules as f


def test_total_cost():
    assert f.total_cost(40, 95.5) == 3820.0
    assert f.total_cost(33.33, 1.1) == 36.66   # rounded to 2 decimals
    assert f.total_cost(10, 0) == 0


def test_efficiency():
    assert f.efficiency(300, 25) == 12.0
    assert f.efficiency(100, 30) == 3.33


def test_efficiency_unknown_not_zero_or_crash():
    assert f.efficiency(None, 10) is None
    assert f.efficiency(0, 10) is None
    assert f.efficiency(100, 0) is None      # no division by zero
    assert f.efficiency(100, None) is None


def _records():
    return [
        dict(registration_number="A", litres=50, cost=5000, date=date(2026, 10, 3)),
        dict(registration_number="A", litres=50, cost=5200, date=date(2026, 11, 2)),
        dict(registration_number="B", litres=20, cost=2000, date=date(2026, 11, 5)),
        dict(registration_number="C", litres=10, cost=1000, date=date(2026, 11, 6)),
    ]


def test_totals_and_ranking():
    s = f.summarize(_records(), {"A": 1200, "B": 300})
    assert s["fleet"]["litres"] == 130 and s["fleet"]["cost"] == 13200
    assert s["fleet"]["records"] == 4
    assert s["highest_expense"] == "A"
    assert [r["registration_number"] for r in s["per_vehicle"]] == ["A", "B", "C"]
    assert s["by_month"] == {"2026-10": 5000, "2026-11": 8200}


def test_efficiency_per_vehicle_and_fleet():
    s = f.summarize(_records(), {"A": 1200, "B": 300})
    by = {r["registration_number"]: r for r in s["per_vehicle"]}
    assert by["A"]["km_per_litre"] == 12.0
    assert by["B"]["km_per_litre"] == 15.0
    assert by["C"]["km_per_litre"] is None                 # no distance: unknown, not 0
    # fleet figure uses only A (100 L) and B (20 L): 1500 km / 120 L; C has no distance
    assert s["fleet"]["km_per_litre"] == round(1500 / 120, 2)


def test_above_average_flag():
    s = f.summarize(_records(), {})
    by = {r["registration_number"]: r for r in s["per_vehicle"]}
    assert by["A"]["above_average_cost"] is True           # 10200 vs average 4400
    assert by["C"]["above_average_cost"] is False
    one = f.summarize(_records()[:1], {})
    assert one["per_vehicle"][0]["above_average_cost"] is False  # a single vehicle is not "above"


def test_no_records():
    s = f.summarize([], {})
    assert s["fleet"]["litres"] == 0 and s["fleet"]["avg_price_per_litre"] is None
    assert s["fleet"]["km_per_litre"] is None and s["highest_expense"] is None
    assert s["per_vehicle"] == [] and s["by_month"] == {}


def test_must_fail_wrong_expectation_is_rejected():
    assert f.efficiency(100, 0) != 0
    assert f.total_cost(40, 95.5) != 3800
    assert f.summarize(_records(), {})["highest_expense"] != "B"


if __name__ == "__main__":
    tests = [(n, fn) for n, fn in sorted(globals().items()) if n.startswith("test_") and callable(fn)]
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
