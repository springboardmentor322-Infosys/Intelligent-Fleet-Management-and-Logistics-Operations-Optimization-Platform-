"""Report downloads (Milestone 4 plan, step 2; spec module 9).

Fuel and maintenance reports are exported by their own modules (/fuel/export and
/maintenance/report/export). The three reports here are built from the analytics numbers, so a
report and the Fleet Performance page always agree. Admin and fleet manager only.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

import analytics
import exports
from database import get_db
from security import require_roles

router = APIRouter(prefix="/reports", tags=["reports"])
MANAGE = require_roles("admin", "fleet_manager")
KINDS = ("fleet-utilisation", "driver-performance", "delivery-performance")


def dash(v):
    return "n/a" if v is None else v


def table_for(kind, d):
    """(title, columns, rows, summary lines) for one report."""
    u, t, dl = d["utilisation"], d["trips"], d["delivery"]
    if kind == "fleet-utilisation":
        rows = [["Total vehicles", u["total"]], ["In use", u["used"]], ["Available", u["available"]],
                ["In maintenance", u["in_maintenance"]], ["Utilisation %", dash(u["utilisation_pct"])],
                ["Trips completed", t["completed"]], ["Trips ongoing", t["ongoing"]],
                ["Trips planned", t["planned"]], ["Trips delayed", t["delayed"]],
                ["Trips cancelled", t["cancelled"]], ["Total distance (km)", d["total_distance_km"]]]
        rows += [[f"Distance {reg} (km)", km] for reg, km in sorted(d["distance_by_vehicle"].items())]
        return "Fleet utilisation report", ["Metric", "Value"], rows, []
    if kind == "driver-performance":
        rows = [[r["driver"], r["completed_trips"], r["deliveries"], r["delayed_deliveries"],
                 dash(r["on_time_pct"]), r["distance_km"]] for r in d["drivers"]]
        return ("Driver performance report",
                ["Driver", "Completed trips", "Deliveries", "Delayed deliveries", "On time %", "Distance (km)"],
                rows, [])
    rows = [["Delivered", dl["delivered"]], ["Delivered late", dl["delayed"]],
            ["On-time %", dash(dl["on_time_pct"])], ["In transit", dl["in_transit"]],
            ["Cancelled", dl["cancelled"]], ["Trips completed", t["completed"]],
            ["Trips delayed", t["delayed"]]]
    return "Delivery performance report", ["Metric", "Value"], rows, [i["message"] for i in d["insights"] if i["kind"] == "route"]


@router.get("/{kind}/export")
def export(kind: str, format: str = "xlsx", start: Optional[date] = None,
           end: Optional[date] = None, _=Depends(MANAGE), db: Session = Depends(get_db)):
    if kind not in KINDS:
        raise HTTPException(404, f"Unknown report. Choose one of: {', '.join(KINDS)}")
    if format not in ("xlsx", "pdf"):
        raise HTTPException(422, "format must be xlsx or pdf")
    d = analytics.fleet_performance(start=start, end=end, vehicle=None, driver_id=None,
                                    status=None, _=None, db=db)
    title, cols, rows, lines = table_for(kind, d)
    period = f"{start or 'start'} to {end or 'today'}"
    if format == "xlsx":
        data = exports.to_xlsx(title, cols, rows, [[line] for line in lines])
    else:
        data = exports.to_pdf(f"{title} ({period})", cols, rows, lines)
    return exports.file_response(data, format, f"{kind}-{date.today()}")
