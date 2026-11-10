"""Checks for route_types.py. Run: python test_route_types.py"""
import route_types as R

routes = [{"duration_min": 60, "distance_km": 50}, {"duration_min": 70, "distance_km": 45}]


def sec(km, cur, free=60):
    return {"km": km, "current_kmh": cur, "free_kmh": free}


# 1. Fastest road is jammed (+30 min), the slower one is clear -> traffic avoidance picks the second
flows = {"0": [sec(50, 30)], "1": [sec(45, 60)]}
assert R.traffic_avoidance_index(routes, flows) == 1

# 2. Clear roads -> the quickest one wins
flows = {"0": [sec(50, 60)], "1": [sec(45, 60)]}
assert R.traffic_avoidance_index(routes, flows) == 0

# 3. Must-fail: no traffic data -> not offered
assert R.traffic_avoidance_index(routes, {}) is None
assert R.traffic_avoidance_index(routes, {"0": [sec(50, 30)]}) is None      # one route unknown
assert R.traffic_avoidance_index(routes, {"0": [{"km": 5, "current_kmh": None, "free_kmh": None}],
                                          "1": [sec(45, 60)]}) is None
assert R.traffic_avoidance_index(routes[:1], {"0": [sec(50, 30)]}) is None   # nothing to choose from

# 4. A standstill section counts as crawling, not as infinite delay
assert 0 < R.traffic_delay_min([sec(10, 0)]) < 130

# 5. Fuel efficient: only with a consumption figure
assert R.fuel_efficient_index(routes) is None
assert R.fuel_efficient_index(routes, 0) is None
assert R.fuel_efficient_index(routes, 8.0) == 1                     # shorter distance, less fuel
assert abs(R.fuel_litres(50, 8.0) - 4.0) < 1e-9

print("All route type checks passed.")
