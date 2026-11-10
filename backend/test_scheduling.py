"""Checks for scheduling.py. Run: python test_scheduling.py"""
from datetime import datetime, timedelta, timezone

import scheduling as S

T0 = datetime(2026, 11, 10, 9, 0, tzinfo=timezone.utc)
HOUR = timedelta(hours=1)

# 1. Window uses the planned driving time, or the default when unknown
assert S.window(T0, 120)[1] == T0 + 2 * HOUR
assert S.window(T0)[1] == T0 + S.DEFAULT_TRIP_HOURS * HOUR
assert S.window(T0, 0)[1] == T0 + S.DEFAULT_TRIP_HOURS * HOUR

# 2. Naive datetimes are treated as UTC, so naive vs aware never crashes
assert S.window(T0.replace(tzinfo=None), 60)[0] == T0

# 3. Overlap
others = [(7, T0, 120)]                                            # 09:00 - 11:00
assert S.find_conflict(S.window(T0 + HOUR, 60), others) == 7        # 10:00 - 11:00 overlaps
assert S.find_conflict(S.window(T0 - HOUR, 180), others) == 7       # 08:00 - 11:00 overlaps

# 4. Must-pass: back to back, and far apart, are fine
assert S.find_conflict(S.window(T0 + 2 * HOUR, 60), others) is None  # starts exactly at 11:00
assert S.find_conflict(S.window(T0 - 2 * HOUR, 120), others) is None  # ends exactly at 09:00
assert S.find_conflict(S.window(T0 + 24 * HOUR, 60), others) is None

# 5. A trip with no route yet blocks the default window (8 h)
assert S.find_conflict(S.window(T0 + 7 * HOUR, 60), [(9, T0, None)]) == 9
assert S.find_conflict(S.window(T0 + 8 * HOUR, 60), [(9, T0, None)]) is None

# 6. Nothing to clash with
assert S.find_conflict(S.window(T0, 60), []) is None

print("All scheduling checks passed.")
