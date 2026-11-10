"""Trip scheduling conflicts (Milestone 2 gap closure, step 2).

A trip occupies its vehicle and driver from scheduled_start for its planned driving time
(route_duration_min). Before a route is chosen the time is unknown, so DEFAULT_TRIP_HOURS
is assumed. Two open trips (Planned / In Progress) that share a vehicle or a driver and whose
time windows overlap are a conflict. Pure functions: see test_scheduling.py.
"""
from datetime import datetime, timedelta, timezone

DEFAULT_TRIP_HOURS = 8


def _utc(dt):
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)


def window(start, duration_min=None):
    """(start, end) of the time a trip occupies its vehicle and driver."""
    start = _utc(start)
    minutes = duration_min if duration_min and duration_min > 0 else DEFAULT_TRIP_HOURS * 60
    return start, start + timedelta(minutes=minutes)


def overlaps(a, b):
    """Windows that merely touch (one ends exactly when the next starts) do not overlap."""
    return a[0] < b[1] and b[0] < a[1]


def find_conflict(candidate, others):
    """First trip id in `others` ([(id, start, duration_min), ...]) overlapping `candidate`
    (a window), or None."""
    for trip_id, start, duration_min in others:
        if overlaps(candidate, window(start, duration_min)):
            return trip_id
    return None
