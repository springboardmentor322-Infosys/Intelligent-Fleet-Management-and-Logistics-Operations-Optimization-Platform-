"""Pure fuel calculations (Milestone 3, Task 6). No database: see test_fuel.py."""


def total_cost(quantity_litres, price_per_litre):
    """Cost of one refuelling: quantity x price per litre, to 2 decimals."""
    return round(quantity_litres * price_per_litre, 2)


def efficiency(distance_km, litres):
    """Kilometres per litre, or None when it cannot be known (no fuel or no distance)."""
    if not distance_km or not litres or distance_km <= 0 or litres <= 0:
        return None
    return round(distance_km / litres, 2)


def summarize(records, distance_by_vehicle):
    """Fuel totals for a set of refuellings.

    records: dicts with registration_number, litres, cost, date (a datetime.date).
    distance_by_vehicle: {registration_number: km driven in the same period}.

    Efficiency is only reported where both fuel and distance exist. The fleet figure uses
    just those vehicles, so a vehicle with no recorded distance cannot drag it down.
    """
    per = {}
    by_month = {}
    for r in records:
        v = per.setdefault(r["registration_number"], {"litres": 0.0, "cost": 0.0})
        v["litres"] += r["litres"]
        v["cost"] += r["cost"]
        key = r["date"].strftime("%Y-%m")
        by_month[key] = round(by_month.get(key, 0) + r["cost"], 2)

    rows = []
    for reg, v in per.items():
        km = distance_by_vehicle.get(reg) or 0
        rows.append({
            "registration_number": reg,
            "litres": round(v["litres"], 2), "cost": round(v["cost"], 2),
            "distance_km": round(km, 1) if km else None,
            "km_per_litre": efficiency(km, v["litres"]),
        })
    rows.sort(key=lambda x: x["cost"], reverse=True)

    litres = round(sum(r["litres"] for r in rows), 2)
    cost = round(sum(r["cost"] for r in rows), 2)
    avg_vehicle_cost = cost / len(rows) if rows else 0
    for r in rows:
        r["above_average_cost"] = len(rows) > 1 and r["cost"] > avg_vehicle_cost

    measurable = [r for r in rows if r["km_per_litre"] is not None]
    fleet_km = sum(r["distance_km"] for r in measurable)
    fleet_litres = sum(r["litres"] for r in measurable)
    return {
        "fleet": {
            "litres": litres, "cost": cost,
            "avg_price_per_litre": round(cost / litres, 2) if litres else None,
            "km_per_litre": efficiency(fleet_km, fleet_litres),
            "records": len(records),
        },
        "per_vehicle": rows,
        "highest_expense": rows[0]["registration_number"] if rows else None,
        "by_month": dict(sorted(by_month.items())),
    }
