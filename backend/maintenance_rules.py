"""Pure rules for vehicle maintenance (Milestone 3, Task 1 and 3).

No database, no FastAPI: everything works on plain values so it can be tested
without a server (see test_maintenance.py). maintenance.py applies these rules to
the database.
"""
from datetime import timedelta

UPCOMING_DAYS = 7  # a scheduled service within this many days raises an "Upcoming" alert

# Allowed status changes. Completed and Cancelled are final.
TRANSITIONS = {
    "Scheduled": ("In Progress", "Cancelled"),
    "In Progress": ("Completed", "Cancelled"),
    "Completed": (),
    "Cancelled": (),
}


def can_change(old, new):
    return new in TRANSITIONS.get(old, ())


def classify(status, scheduled, today, window=UPCOMING_DAYS):
    """Alert category a record deserves right now: 'Overdue', 'Upcoming' or None.

    Only work that is still Scheduled can be due: once it is In Progress somebody is
    already servicing the vehicle, and Completed / Cancelled work needs no alert.
    """
    if status != "Scheduled":
        return None
    if scheduled < today:
        return "Overdue"
    if scheduled <= today + timedelta(days=window):
        return "Upcoming"
    return None


def alert_action(status, scheduled, today, current, window=UPCOMING_DAYS):
    """What to do with a record's alert so that repeating the check changes nothing.

    `current` is the existing alert's category, or None when there is no alert.
    Returns None (leave as is), ("set", category), ("resolve",) or ("clear",).
    """
    if status in ("Completed", "Cancelled"):
        return ("resolve",) if current not in (None, "Resolved") else None
    wanted = classify(status, scheduled, today, window)
    if wanted is None:
        # e.g. it was rescheduled far into the future, or it is now In Progress
        return ("clear",) if current is not None else None
    return None if current == wanted else ("set", wanted)


def date_range_ok(start, end):
    return start is None or end is None or start <= end


def summarize(rows, today):
    """Report numbers. `rows` are dicts with: registration_number, status, scheduled_date,
    estimated_cost, actual_cost.

    spent = actual cost of Completed work (a completed record without an actual cost counts 0,
    the API always fills it in). open_estimate = estimated cost of work not yet finished.
    """
    out = {"scheduled": 0, "in_progress": 0, "completed": 0, "cancelled": 0,
           "pending": 0, "overdue": 0, "spent": 0.0, "open_estimate": 0.0,
           "per_vehicle": {}}
    for r in rows:
        status = r["status"]
        key = {"Scheduled": "scheduled", "In Progress": "in_progress",
               "Completed": "completed", "Cancelled": "cancelled"}[status]
        out[key] += 1
        pv = out["per_vehicle"].setdefault(
            r["registration_number"], {"records": 0, "spent": 0.0, "open_estimate": 0.0})
        pv["records"] += 1
        if status in ("Scheduled", "In Progress"):
            out["pending"] += 1
            out["open_estimate"] += r["estimated_cost"] or 0
            pv["open_estimate"] += r["estimated_cost"] or 0
            if classify(status, r["scheduled_date"], today) == "Overdue":
                out["overdue"] += 1
        elif status == "Completed":
            cost = r["actual_cost"] or 0
            out["spent"] += cost
            pv["spent"] += cost
    out["spent"] = round(out["spent"], 2)
    out["open_estimate"] = round(out["open_estimate"], 2)
    for pv in out["per_vehicle"].values():
        pv["spent"] = round(pv["spent"], 2)
        pv["open_estimate"] = round(pv["open_estimate"], 2)
    return out
