"""Checks the simulator's route-switching maths (plan step 4). No server needed.

    cd backend
    python test_simulator.py
"""
from simulate_gps import cumulative, project_km

# A straight east-west route at latitude 22, 1 degree of longitude = about 103 km.
ROUTE = [[22.0, 88.0], [22.0, 88.5], [22.0, 89.0]]
CUM = cumulative(ROUTE)
TOTAL = CUM[-1]

results = []


def check(name, ok):
    results.append(ok)
    print(("PASS  " if ok else "FAIL  ") + name)


def near(a, b, tol=0.5):
    return abs(a - b) <= tol


# On the route
check("a point on a vertex gives that vertex's distance",
      near(project_km(ROUTE, CUM, [22.0, 88.5]), CUM[1]))
check("a point halfway along a segment gives half that segment",
      near(project_km(ROUTE, CUM, [22.0, 88.25]), CUM[1] / 2))

# Off the route (GPS is never exactly on the line)
check("a point 1 km north of the route projects to the same distance along it",
      near(project_km(ROUTE, CUM, [22.009, 88.25]), CUM[1] / 2))

# Ends of the route
check("a point before the start gives 0", near(project_km(ROUTE, CUM, [22.0, 87.9]), 0))
check("a point past the end gives the full length", near(project_km(ROUTE, CUM, [22.0, 89.2]), TOTAL))

# A reroute: the new route begins where the vehicle is, so it carries on from the start
vehicle = [22.0, 88.25]
NEW = [[22.0, 88.25], [22.2, 88.6], [22.0, 89.0]]
new_cum = cumulative(NEW)
check("after a reroute the vehicle carries on from the start of the new route",
      near(project_km(NEW, new_cum, vehicle), 0))

# The same position on the old route is NOT the start, so the check above is meaningful
check("the same position is far from the start of the old route",
      project_km(ROUTE, CUM, vehicle) > 20)

# Must-fail: the wrong expectation has to be rejected
wrong = project_km(ROUTE, CUM, [22.0, 88.25])
check("must-fail: halfway along a segment is not 0 km", not near(wrong, 0))

print(f"\n{sum(results)}/{len(results)} passed")
raise SystemExit(0 if all(results) else 1)
