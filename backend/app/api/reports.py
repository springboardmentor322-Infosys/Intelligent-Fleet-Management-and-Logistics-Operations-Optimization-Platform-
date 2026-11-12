from datetime import datetime
from io import BytesIO
from typing import Literal
from xml.sax.saxutils import escape

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from openpyxl import Workbook
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape, letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Table, TableStyle
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_db, require_roles
from app.models.driver import Driver
from app.models.driver_attendance import DriverAttendanceRecord
from app.models.fuel_log import FuelLog
from app.models.maintenance_record import MaintenanceRecord
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.user import User
from app.models.vehicle import Vehicle
from app.models.vehicle_inspection import VehicleInspection
from app.services.operations import build_analytics, utc_datetime

router = APIRouter(prefix="/reports", tags=["Reports"])
FLEET_ROLES = ("administrator", "fleet_manager", "dispatcher")
REPORT_NAMES = ("fleet", "fuel", "maintenance", "inspections", "drivers", "deliveries")


def report_data(report_name: str, db: Session) -> tuple[list[str], list[list[object]]]:
    if report_name == "fleet":
        rows = db.scalars(select(Vehicle).order_by(Vehicle.id)).all()
        return ["Vehicle ID", "Registration", "Type", "Capacity", "Fuel type", "Status", "Assigned driver ID"], [
            [row.vehicle_id, row.registration_number, row.vehicle_type, row.capacity, row.fuel_type, row.status, row.assigned_driver_id]
            for row in rows
        ]

    if report_name == "fuel":
        rows = db.scalars(select(FuelLog).order_by(FuelLog.logged_at, FuelLog.id)).all()
        return ["Vehicle ID", "Logged at", "Odometer km", "Liters logged", "Cost logged", "Full tank"], [
            [row.vehicle_id, row.logged_at, row.odometer_km, row.liters, row.total_cost, row.is_full_tank]
            for row in rows
        ]

    if report_name == "maintenance":
        rows = db.scalars(select(MaintenanceRecord).order_by(MaintenanceRecord.service_date, MaintenanceRecord.id)).all()
        return ["Vehicle ID", "Service type", "Description", "Service date", "Next due", "Cost", "Status"], [
            [row.vehicle_id, row.service_type, row.description, row.service_date, row.next_due_date, row.cost, row.status]
            for row in rows
        ]

    if report_name == "inspections":
        rows = db.scalars(select(VehicleInspection).order_by(VehicleInspection.inspected_at, VehicleInspection.id)).all()
        return ["Vehicle ID", "Category", "Result", "Checklist", "Notes", "Inspected at", "Inspector user ID"], [
            [row.vehicle_id, row.category, row.result,
             "; ".join(f"{item}: {'pass' if passed else 'issue'}" for item, passed in row.checklist.items()),
             row.notes, row.inspected_at, row.inspector_user_id]
            for row in rows
        ]

    if report_name == "drivers":
        analytics = build_analytics(db)
        metrics = {row["driver_id"]: row for row in analytics["driver_performance"]}
        attendance = {}
        records = db.scalars(select(DriverAttendanceRecord).order_by(DriverAttendanceRecord.recorded_at.desc(), DriverAttendanceRecord.id.desc())).all()
        for record in records:
            attendance.setdefault(record.driver_id, record)
        people = db.execute(select(Driver, User).join(User, User.id == Driver.user_id).order_by(Driver.id)).all()
        return ["Driver ID", "Name", "Email", "License number", "License expiry", "Attendance status", "Last attendance at", "Delivered count", "On-time delivery rate %", "On-time sample size"], [
            [driver.id, user.full_name, user.email, driver.license_number, driver.license_expiry,
             driver.attendance_status, attendance.get(driver.id).recorded_at if driver.id in attendance else None,
             metrics.get(driver.id, {}).get("delivered_count", 0),
             metrics.get(driver.id, {}).get("on_time_delivery_rate"),
             metrics.get(driver.id, {}).get("on_time_sample_size", 0)]
            for driver, user in people
        ]

    if report_name == "deliveries":
        delivered = db.scalars(select(Shipment).where(Shipment.status == "delivered").order_by(Shipment.id)).all()
        delivery_events = {}
        events = db.scalars(select(ShipmentStatusHistory).where(ShipmentStatusHistory.status == "delivered")).all()
        for event in events:
            delivery_events[event.shipment_id] = event.changed_at
        headers = ["Tracking number", "Origin", "Destination", "Driver ID", "ETA", "Delivered at", "On time"]
        output = []
        for shipment in delivered:
            delivered_at = delivery_events.get(shipment.id)
            on_time = None
            if delivered_at is not None and shipment.estimated_arrival is not None:
                on_time = utc_datetime(delivered_at) <= utc_datetime(shipment.estimated_arrival)
            output.append([shipment.tracking_number, shipment.origin, shipment.destination,
                           shipment.driver_id, shipment.estimated_arrival, delivered_at, on_time])
        return headers, output

    raise HTTPException(status_code=404, detail="Unknown report type")


def make_xlsx(report_name: str, headers: list[str], rows: list[list[object]]) -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = report_name[:31].title()
    sheet.append(headers)
    for row in rows:
        excel_row = sheet.max_row + 1
        for column, value in enumerate(row, 1):
            cell = sheet.cell(row=excel_row, column=column, value=value)
            if isinstance(value, str):
                cell.data_type = "s"
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for column_cells in sheet.columns:
        width = min(48, max(12, max(len(str(cell.value or "")) for cell in column_cells) + 2))
        sheet.column_dimensions[column_cells[0].column_letter].width = width
    output = BytesIO()
    workbook.save(output)
    return output.getvalue()


def make_pdf(report_name: str, headers: list[str], rows: list[list[object]]) -> bytes:
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=landscape(letter), title=f"FleetFlow {report_name.title()} report")
    styles = getSampleStyleSheet()
    table_rows = [[Paragraph(f"<b>{escape(header)}</b>", styles["BodyText"]) for header in headers]]
    table_rows.extend([
        [Paragraph(escape("Not recorded" if value is None else str(value)), styles["BodyText"]) for value in row]
        for row in rows
    ])
    table = Table(table_rows, repeatRows=1, hAlign="LEFT")
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#d9eee7")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#102c25")),
        ("GRID", (0, 0), (-1, -1), 0.35, colors.HexColor("#93a6a0")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f2f6f4")]),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("FONTSIZE", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
    ]))
    document.build([Paragraph(f"FleetFlow · {escape(report_name.title())} report", styles["Title"]), table])
    return output.getvalue()


@router.get("/{report_name}.{extension}")
def export_report(
    report_name: str,
    extension: Literal["pdf", "xlsx"],
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(*FLEET_ROLES)),
):
    if report_name not in REPORT_NAMES:
        raise HTTPException(status_code=404, detail="Unknown report type")
    headers, rows = report_data(report_name, db)
    if extension == "pdf":
        content = make_pdf(report_name, headers, rows)
        media_type = "application/pdf"
    else:
        content = make_xlsx(report_name, headers, rows)
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    return StreamingResponse(
        BytesIO(content),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="fleetflow-{report_name}-report.{extension}"'},
    )
