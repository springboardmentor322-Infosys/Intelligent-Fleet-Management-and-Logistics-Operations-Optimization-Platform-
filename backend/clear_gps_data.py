"""Delete ALL stored GPS positions and history (test data only).

Run this once after switching to the route-following simulator, so old random
positions and trails from earlier test runs no longer show on the map:
    python clear_gps_data.py
"""
from sqlalchemy import text

from database import engine

with engine.begin() as conn:
    pings = conn.execute(text("DELETE FROM location_pings")).rowcount
    conn.execute(text(
        "UPDATE vehicles SET last_lat = NULL, last_lng = NULL, "
        "last_speed_kmh = NULL, last_heading = NULL, last_seen = NULL"))
print(f"Cleared {pings} stored GPS points and every vehicle's last position.")
