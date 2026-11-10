"""Maintenance scheduling, alerts and reports (Milestone 3, Task 1 and 3).

The rules (allowed status changes, which alerts a record deserves, report totals) live in
maintenance_rules.py and are tested without a database. This module applies them.

Only admin and fleet manager can use these endpoints: they show repair costs.
"""
import io
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import maintenance_rules as rules
import models
from database import get_db
from models import ALERT_CATEGORIES, MAINTENANCE_CATEGORIES, MAINTENANCE_STATUSES
from security import require_roles

router = APIRouter(prefix="/maintenance", tags=["maintenance"])
MANAGE = require_roles("admin", "fleet_manager")


# ---------- Schemas ----------
class MaintenanceIn(BaseModel):
    vehicle_id: int
    category: str
    description: str = Field(default="", max_length=300)
    scheduled_date: date
    service_centre: str = Field(default="", max_length=120)
    estimated_cost: float = Field(default=0, ge=0)


class StatusIn(BaseModel):
    status: str
    actual_cost: Optional[float] = Field(default=None, ge=0)   # Completed; defaults to the estimate
    parts_replaced: Optional[str] = Field(default=None, max_length=300)
    confirm_operational: bool = True  # Completed: put the vehicle back in service


# ---------- Helpers ----------
def iso(dt):
    return dt.isoformat() if dt else None


def today():
    return date.today()


def record_out(m):
    return {
        "id": m.id, "vehicle_id": m.vehicle_id,
        "registration_number": m.vehicle.registration_number,
        "vehicle_type": m.vehicle.vehicle_type,
        "category": m.category, "description": m.description,
        "scheduled_date": str(m.scheduled_date), "service_centre": m.service_centre,
        "estimated_cost": m.estimated_cost, "actual_cost": m.actual_cost,
        "parts_replaced": m.parts_replaced, "status": m.status,
        "started_at": iso(m.started_at), "completed_at": iso(m.completed_at),
        "alert": m.alert.category if m.alert else None,
    }


def alert_out(a):
    m = a.maintenance
    return {
        "id": a.id, "maintenance_id": m.id,
        "registration_number": m.vehicle.registration_number,
        "category": m.category, "scheduled_date": str(m.scheduled_date),
        "maintenance_status": m.status, "alert_category": a.category,
        "created_at": iso(a.created_at), "resolved_at": iso(a.resolved_at),
        "resolved_by": a.resolved_by,
    }


def get_record(db, maintenance_id):
    m = db.get(models.Maintenance, maintenance_id)
    if not m:
        raise HTTPException(404, "Maintenance record not found")
    return m


def check_input(db, data):
    if data.category not in MAINTENANCE_CATEGORIES:
        raise HTTPException(400, f"Category must be one of {', '.join(MAINTENANCE_CATEGORIES)}")
    if not db.get(models.Vehicle, data.vehicle_id):
        raise HTTPException(404, "Vehicle not found")


def filtered(db, vehicle=None, category=None, status=None, start=None, end=None):
    """Records matching the report / list filters (date range is on the scheduled date)."""
    if not rules.date_range_ok(start, end):
        raise HTTPException(422, "Start date must not be after end date")
    if category and category not in MAINTENANCE_CATEGORIES:
        raise HTTPException(422, f"Category must be one of {', '.join(MAINTENANCE_CATEGORIES)}")
    if status and status not in MAINTENANCE_STATUSES:
        raise HTTPException(422, f"Status must be one of {', '.join(MAINTENANCE_STATUSES)}")
    q = db.query(models.Maintenance).join(models.Vehicle)
    if vehicle:
        q = q.filter(models.Vehicle.registration_number.ilike(f"%{vehicle}%"))
    if category:
        q = q.filter(models.Maintenance.category == category)
    if status:
        q = q.filter(models.Maintenance.status == status)
    if start:
        q = q.filter(models.Maintenance.scheduled_date >= start)
    if end:
        q = q.filter(models.Maintenance.scheduled_date <= end)
    return q.order_by(models.Maintenance.scheduled_date.desc(), models.Maintenance.id.desc()).all()


# ---------- Alerts (also called by the Celery job) ----------
def sync_one(m, now_date, now):
    """Bring one record's alert up to date. Returns True when something changed."""
    current = m.alert.category if m.alert else None
    act = rules.alert_action(m.status, m.scheduled_date, now_date, current)
    if act is None:
        return False
    if act[0] == "set":
        if m.alert is None:
            m.alert = models.MaintenanceAlert(category=act[1], created_at=now)
        else:
            m.alert.category = act[1]
            m.alert.resolved_at = m.alert.resolved_by = None
    elif act[0] == "resolve":
        m.alert.category = "Resolved"
        m.alert.resolved_at = now
        m.alert.resolved_by = "system"
    elif act[0] == "clear":
        m.alert = None
    return True


def sync_alerts(db, now_date=None):
    """Create / escalate / resolve alerts for every record. Safe to run repeatedly.
    Returns the number of alerts changed. The caller commits."""
    now_date = now_date or today()
    now = datetime.now(timezone.utc)
    changed = 0
    for m in db.query(models.Maintenance).all():
        if m.status in ("Completed", "Cancelled") and (m.alert is None or m.alert.category == "Resolved"):
            continue  # nothing to do, skip the work
        changed += sync_one(m, now_date, now)
    return changed


# ---------- Vehicle availability ----------
def release_vehicle(db, vehicle, finished_id, confirm):
    """The vehicle leaves maintenance only when no other job on it is still in progress
    and somebody confirmed that it is operational."""
    other = db.query(models.Maintenance).filter(
        models.Maintenance.vehicle_id == vehicle.id,
        models.Maintenance.status == "In Progress",
        models.Maintenance.id != finished_id,
    ).first()
    if other is None and confirm and vehicle.status == "In Maintenance":
        vehicle.status = "Idle"


def apply_status(db, m, data):
    if data.status not in MAINTENANCE_STATUSES:
        raise HTTPException(400, f"Status must be one of {', '.join(MAINTENANCE_STATUSES)}")
    if not rules.can_change(m.status, data.status):
        raise HTTPException(409, f"A {m.status} record cannot change to {data.status}")
    v = m.vehicle
    now = datetime.now(timezone.utc)
    if data.status == "In Progress":
        on_trip = db.query(models.Trip).filter_by(vehicle_id=v.id, status="In Progress").first()
        if on_trip:
            raise HTTPException(409, f"Vehicle is on trip #{on_trip.id}; finish the trip first")
        m.started_at = now
        v.status = "In Maintenance"  # trips cannot be planned or started on it any more
    elif data.status == "Completed":
        m.completed_at = now
        m.actual_cost = m.estimated_cost if data.actual_cost is None else data.actual_cost
        m.parts_replaced = data.parts_replaced
        release_vehicle(db, v, m.id, data.confirm_operational)
    elif data.status == "Cancelled" and m.status == "In Progress":
        release_vehicle(db, v, m.id, True)
    m.status = data.status
    sync_one(m, today(), now)  # completing / cancelling resolves its alert


# ---------- Endpoints (fixed paths first, so "stats" is not read as an id) ----------
@router.get("")
def list_records(vehicle: Optional[str] = None, category: Optional[str] = None,
                 status: Optional[str] = None, start: Optional[date] = None,
                 end: Optional[date] = None, _=Depends(MANAGE),
                 db: Session = Depends(get_db)):
    return [record_out(m) for m in filtered(db, vehicle, category, status, start, end)]


@router.post("", status_code=201)
def schedule(data: MaintenanceIn, user=Depends(MANAGE), db: Session = Depends(get_db)):
    check_input(db, data)
    m = models.Maintenance(**data.model_dump(), created_by_id=user.id)
    db.add(m)
    db.flush()
    sync_one(m, today(), datetime.now(timezone.utc))
    db.commit()
    db.refresh(m)
    return record_out(m)


@router.get("/stats")
def stats(_=Depends(MANAGE), db: Session = Depends(get_db)):
    sync_alerts(db)
    db.commit()
    rows = db.query(models.Maintenance).all()
    return {
        "total_vehicles": db.query(models.Vehicle).count(),
        "under_maintenance": db.query(models.Vehicle).filter_by(status="In Maintenance").count(),
        "upcoming": sum(1 for m in rows if m.alert and m.alert.category == "Upcoming"),
        "overdue": sum(1 for m in rows if m.alert and m.alert.category == "Overdue"),
        "categories": list(MAINTENANCE_CATEGORIES),
    }


@router.get("/alerts")
def list_alerts(category: Optional[str] = None, _=Depends(MANAGE),
                db: Session = Depends(get_db)):
    """Alerts, refreshed on every call so the page is right even without the background job."""
    if category and category not in ALERT_CATEGORIES:
        raise HTTPException(422, f"Category must be one of {', '.join(ALERT_CATEGORIES)}")
    sync_alerts(db)
    db.commit()
    q = db.query(models.MaintenanceAlert).join(models.Maintenance)
    if category:
        q = q.filter(models.MaintenanceAlert.category == category)
    return [alert_out(a) for a in q.order_by(models.Maintenance.scheduled_date)]


@router.post("/alerts/refresh")
def refresh_alerts(_=Depends(MANAGE), db: Session = Depends(get_db)):
    changed = sync_alerts(db)
    db.commit()
    return {"changed": changed}


@router.post("/alerts/{alert_id}/resolve")
def resolve_alert(alert_id: int, user=Depends(MANAGE), db: Session = Depends(get_db)):
    a = db.get(models.MaintenanceAlert, alert_id)
    if not a:
        raise HTTPException(404, "Alert not found")
    if a.maintenance.status != "Completed":
        raise HTTPException(409, "Complete the maintenance before resolving its alert")
    if a.category != "Resolved":
        a.category, a.resolved_at, a.resolved_by = "Resolved", datetime.now(timezone.utc), user.username
        db.commit()
    return alert_out(a)


# ---------- Reports ----------
def report_rows(records):
    return [dict(registration_number=m.vehicle.registration_number, status=m.status,
                 scheduled_date=m.scheduled_date, estimated_cost=m.estimated_cost,
                 actual_cost=m.actual_cost) for m in records]


@router.get("/report")
def report(vehicle: Optional[str] = None, category: Optional[str] = None,
           status: Optional[str] = None, start: Optional[date] = None,
           end: Optional[date] = None, _=Depends(MANAGE), db: Session = Depends(get_db)):
    records = filtered(db, vehicle, category, status, start, end)
    return {"summary": rules.summarize(report_rows(records), today()),
            "records": [record_out(m) for m in records]}


COLUMNS = ["Vehicle", "Category", "Scheduled", "Status", "Service centre",
           "Estimated cost", "Actual cost", "Parts replaced"]


def export_row(r):
    return [r["registration_number"], r["category"], r["scheduled_date"], r["status"],
            r["service_centre"], r["estimated_cost"],
            "" if r["actual_cost"] is None else r["actual_cost"], r["parts_replaced"] or ""]


@router.get("/report/export")
def export_report(format: str = "xlsx", vehicle: Optional[str] = None,
                  category: Optional[str] = None, status: Optional[str] = None,
                  start: Optional[date] = None, end: Optional[date] = None,
                  _=Depends(MANAGE), db: Session = Depends(get_db)):
    if format not in ("xlsx", "pdf"):
        raise HTTPException(422, "format must be xlsx or pdf")
    records = filtered(db, vehicle, category, status, start, end)
    summary = rules.summarize(report_rows(records), today())
    rows = [export_row(record_out(m)) for m in records]
    stamp = today().isoformat()
    if format == "xlsx":
        data = build_xlsx(rows, summary)
        media, name = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", f"maintenance-report-{stamp}.xlsx"
    else:
        data = build_pdf(rows, summary, stamp)
        media, name = "application/pdf", f"maintenance-report-{stamp}.pdf"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{name}"'})


def build_xlsx(rows, summary):
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(503, "Excel export needs the openpyxl package: pip install openpyxl")
    wb = Workbook()
    ws = wb.active
    ws.title = "Maintenance"
    ws.append(COLUMNS)
    for r in rows:
        ws.append(r)
    ws.append([])
    ws.append(["Total spent (completed)", summary["spent"]])
    ws.append(["Estimated cost of open work", summary["open_estimate"]])
    ws.append(["Overdue", summary["overdue"]])
    per = wb.create_sheet("Per vehicle")
    per.append(["Vehicle", "Records", "Spent", "Open estimate"])
    for reg, v in sorted(summary["per_vehicle"].items()):
        per.append([reg, v["records"], v["spent"], v["open_estimate"]])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def build_pdf(rows, summary, stamp):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise HTTPException(503, "PDF export needs the reportlab package: pip install reportlab")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title="Maintenance report")
    styles = getSampleStyleSheet()
    parts = [Paragraph(f"FleetFlow maintenance report - {stamp}", styles["Title"]),
             Paragraph(
                 f"Records: {len(rows)} | Pending: {summary['pending']} | Overdue: {summary['overdue']} | "
                 f"Spent (completed): {summary['spent']:.2f} | Open estimate: {summary['open_estimate']:.2f}",
                 styles["Normal"]),
             Spacer(1, 12)]
    table = Table([COLUMNS] + [[str(c) for c in r] for r in rows], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    parts.append(table)
    doc.build(parts)
    return buf.getvalue()


# ---------- Per-vehicle history and availability ----------
@router.get("/vehicles/{vehicle_id}/history")
def vehicle_history(vehicle_id: int, _=Depends(MANAGE), db: Session = Depends(get_db)):
    """Completed services of one vehicle, newest first."""
    if not db.get(models.Vehicle, vehicle_id):
        raise HTTPException(404, "Vehicle not found")
    rows = db.query(models.Maintenance).filter_by(vehicle_id=vehicle_id, status="Completed") \
        .order_by(models.Maintenance.completed_at.desc()).all()
    return [record_out(m) for m in rows]


@router.post("/vehicles/{vehicle_id}/confirm-operational")
def confirm_operational(vehicle_id: int, _=Depends(MANAGE), db: Session = Depends(get_db)):
    """For a vehicle whose work was completed without confirming it is back in service."""
    v = db.get(models.Vehicle, vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    busy = db.query(models.Maintenance).filter_by(vehicle_id=vehicle_id, status="In Progress").first()
    if busy:
        raise HTTPException(409, f"Maintenance #{busy.id} is still in progress on this vehicle")
    if v.status == "In Maintenance":
        v.status = "Idle"
    db.commit()
    return {"vehicle_id": v.id, "status": v.status}


@router.get("/{maintenance_id}")
def read_record(maintenance_id: int, _=Depends(MANAGE), db: Session = Depends(get_db)):
    return record_out(get_record(db, maintenance_id))


@router.put("/{maintenance_id}")
def edit_record(maintenance_id: int, data: MaintenanceIn, _=Depends(MANAGE),
                db: Session = Depends(get_db)):
    m = get_record(db, maintenance_id)
    if m.status != "Scheduled":
        raise HTTPException(409, "Only scheduled maintenance can be edited")
    check_input(db, data)
    for field, value in data.model_dump().items():
        setattr(m, field, value)
    sync_one(m, today(), datetime.now(timezone.utc))
    db.commit()
    db.refresh(m)
    return record_out(m)


@router.post("/{maintenance_id}/status")
def update_status(maintenance_id: int, data: StatusIn, _=Depends(MANAGE),
                  db: Session = Depends(get_db)):
    m = get_record(db, maintenance_id)
    apply_status(db, m, data)
    db.commit()
    db.refresh(m)
    return record_out(m)
