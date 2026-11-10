"""Driver duty status, licence status and performance.

Pure functions (no database, no web framework), so they can be tested on their own with
plain values. The driver profile endpoints gather the inputs and call these.
"""
from datetime import timedelta

AT_STOP_SPEED_KMH = 3     # below this speed the vehicle counts as standing still
AT_STOP_WINDOW_MIN = 5    # the profile looks at the pings of the last 5 minutes ...
AT_STOP_SPAN_MIN = 4      # ... which must cover at least 4 of them (a vehicle that only just
                          #     started reporting is not "at a stop")
AT_STOP_FRESH_MIN = 2     # and the newest ping must be at most this old
LICENCE_SOON_DAYS = 30
OFF_DUTY_ATTENDANCE = ("Absent", "On Leave")


def is_stopped(pings, now):
    """pings: [(recorded_at, speed_kmh or None), ...] from the last AT_STOP_WINDOW_MIN minutes.

    True only when we have evidence the vehicle stood still for the whole window: every known
    speed is slow, the readings span at least AT_STOP_SPAN_MIN minutes, and the newest one is
    fresh. Anything less is not a stop (we do not guess)."""
    known = [(t, s) for t, s in pings if s is not None]
    if len(known) < 2:
        return False
    times = [t for t, _ in known]
    if now - max(times) > timedelta(minutes=AT_STOP_FRESH_MIN):
        return False
    if max(times) - min(times) < timedelta(minutes=AT_STOP_SPAN_MIN):
        return False
    return all(s < AT_STOP_SPEED_KMH for _, s in known)


def duty_status(account_active, attendance_today, on_trip, pings, now):
    """Available / On Trip / At Stop / Off Duty.

    Off Duty: the driver's login is deactivated, or today's attendance is Absent / On Leave.
    On Trip: a trip is In Progress. At Stop: on a trip and standing still (see is_stopped).
    Otherwise Available. account_active is None for a driver with no login (not Off Duty)."""
    if account_active is False or attendance_today in OFF_DUTY_ATTENDANCE:
        return "Off Duty"
    if not on_trip:
        return "Available"
    return "At Stop" if is_stopped(pings, now) else "On Trip"


def licence_status(expiry, today):
    """Not set / Expired / Expiring soon (within 30 days, today included) / Valid."""
    if expiry is None:
        return "Not set"
    if expiry < today:
        return "Expired"
    if (expiry - today).days <= LICENCE_SOON_DAYS:
        return "Expiring soon"
    return "Valid"


def performance(completed_states, delivered_shipments, delayed_now):
    """completed_states: logistics.delay_info(...)['state'] of each completed trip:
    'on_time', 'finished_late', or None when the trip had no planned ETA to compare with.

    delays = trips that finished late + trips running late right now.
    on_time_rate_percent counts only trips that can be judged, and is None (not 0) when none can."""
    on_time = sum(1 for s in completed_states if s == "on_time")
    late = sum(1 for s in completed_states if s == "finished_late")
    judged = on_time + late
    return {
        "completed_trips": len(completed_states),
        "successful_deliveries": delivered_shipments,
        "delays": late + delayed_now,
        "on_time_rate_percent": None if judged == 0 else round(100 * on_time / judged, 1),
        "judged_trips": judged,
    }
