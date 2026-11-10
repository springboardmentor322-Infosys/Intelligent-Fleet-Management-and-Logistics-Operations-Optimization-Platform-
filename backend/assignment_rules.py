"""Pure rules for driver assignment (Milestone 3, Task 2). No database: see test_assignment.py.

Assignment puts a driver and a vehicle on an existing trip. The states shown on the page
(a driver "On Trip", a vehicle "Assigned") are worked out from the trips instead of being
stored, so they can never be left behind when a trip is completed or cancelled.
"""

ACTIVE_TRIP = ("Planned", "In Progress")


def assignment_status(trip_status):
    """Active while the trip is still to run or running, otherwise how the trip ended."""
    return "Active" if trip_status in ACTIVE_TRIP else trip_status


def driver_state(attendance, trip_statuses):
    """'Off Duty' (absent / on leave today), 'On Trip', 'Assigned' (a planned trip) or 'Available'."""
    if attendance in ("Absent", "On Leave"):
        return "Off Duty"
    if "In Progress" in trip_statuses:
        return "On Trip"
    if "Planned" in trip_statuses:
        return "Assigned"
    return "Available"


def vehicle_state(vehicle_status, trip_statuses):
    """'In Maintenance', 'On Trip', 'Assigned' (a planned trip) or 'Available'."""
    if vehicle_status == "In Maintenance":
        return "In Maintenance"
    if "In Progress" in trip_statuses:
        return "On Trip"
    if "Planned" in trip_statuses:
        return "Assigned"
    return "Available"


def problem(trip_status, same_pair, vehicle_status, capacity, load_kg,
            attendance, vehicle_conflict, driver_conflict):
    """The first reason this assignment must be refused, as (http_status, message), or None.

    vehicle_conflict / driver_conflict: id of another open trip at an overlapping time, or None.
    load_kg: the trip's cargo, or its booked shipments if heavier.
    """
    if trip_status != "Planned":
        return 409, "Only planned trips can be re-assigned"
    if same_pair:
        return 409, "This driver and vehicle are already assigned to the trip"
    if vehicle_status == "In Maintenance":
        return 409, "Vehicle is in maintenance and cannot be assigned"
    if load_kg > capacity:
        return 400, f"Load of {load_kg:g} kg exceeds vehicle capacity ({capacity:g} kg)"
    if attendance in ("Absent", "On Leave"):
        return 409, f"Driver is marked {attendance} on the trip date"
    if vehicle_conflict is not None:
        return 409, f"Vehicle already has trip #{vehicle_conflict} at an overlapping time"
    if driver_conflict is not None:
        return 409, f"Driver already has trip #{driver_conflict} at an overlapping time"
    return None
