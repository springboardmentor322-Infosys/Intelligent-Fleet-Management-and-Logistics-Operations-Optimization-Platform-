"""Extra route types for a trip (Milestone 2 gap closure, step 1).

Pure functions on plain data, so they can be tested with fixed numbers
(see test_route_types.py).

  * Traffic Avoidance: the route with the lowest total time once the current traffic
    delay is added. Only offered when live traffic data exists for the routes
    (TomTom, needs TOMTOM_API_KEY); without it nothing is invented.
  * Fuel Efficient: the route that uses the least fuel. Only offered when a fuel
    consumption figure (litres per 100 km) is known for the vehicle. FleetFlow does not
    store one yet, so today this type is not offered, rather than guessing.
"""

TRAFFIC_AVOIDANCE = "traffic_avoidance"
FUEL_EFFICIENT = "fuel_efficient"


def traffic_delay_min(segments, free_kmh_floor=5):
    """Estimated delay (minutes) from route sections, or None when no section has speed data."""
    known = [s for s in segments if s.get("current_kmh") is not None and s.get("free_kmh")]
    if not known:
        return None
    delay = 0.0
    for s in known:
        cur = max(s["current_kmh"], free_kmh_floor)
        delay += max(0.0, s["km"] / cur - s["km"] / s["free_kmh"]) * 60
    return delay


def traffic_avoidance_index(routes, flows):
    """Index of the route with the lowest time including traffic, or None.

    routes: list of {"duration_min": ...}; flows: {str(index): [section dicts]}.
    Every route needs traffic data, otherwise the comparison would be unfair."""
    if len(routes) < 2:
        return None
    totals = []
    for i, r in enumerate(routes):
        d = traffic_delay_min(flows.get(str(i), []))
        if d is None:
            return None
        totals.append(r["duration_min"] + d)
    return min(range(len(routes)), key=lambda i: totals[i])


def fuel_litres(distance_km, l_per_100km):
    return None if not l_per_100km or l_per_100km <= 0 else distance_km * l_per_100km / 100


def fuel_efficient_index(routes, l_per_100km=None):
    """Index of the route with the least fuel, or None when no consumption figure is known.
    With one flat figure fuel follows distance, so this is the shortest-distance route."""
    if len(routes) < 2 or fuel_litres(1, l_per_100km) is None:
        return None
    return min(range(len(routes)), key=lambda i: routes[i]["distance_km"])
