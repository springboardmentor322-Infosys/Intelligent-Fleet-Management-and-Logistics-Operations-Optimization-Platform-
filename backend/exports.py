"""Excel and PDF file builders shared by the fuel, analytics and report endpoints.

openpyxl / reportlab are imported only when a file is requested, so a missing package gives a
clear 503 message instead of stopping the whole API from starting.
"""
import io

from fastapi import HTTPException, Response

XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


def to_xlsx(sheet_title, columns, rows, footer=()):
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(503, "Excel export needs the openpyxl package: pip install openpyxl")
    wb = Workbook()
    ws = wb.active
    ws.title = sheet_title[:31]
    ws.append(list(columns))
    for r in rows:
        ws.append(list(r))
    if footer:
        ws.append([])
        for line in footer:
            ws.append(list(line))
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def to_pdf(title, columns, rows, lines=()):
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    except ImportError:
        raise HTTPException(503, "PDF export needs the reportlab package: pip install reportlab")
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=landscape(A4), title=title)
    styles = getSampleStyleSheet()
    parts = [Paragraph(title, styles["Title"])]
    for line in lines:
        parts.append(Paragraph(str(line), styles["Normal"]))
    parts.append(Spacer(1, 12))
    table = Table([list(columns)] + [[str(c) for c in r] for r in rows], repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1f2937")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.grey),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
    ]))
    parts.append(table)
    doc.build(parts)
    return buf.getvalue()


def file_response(data, fmt, basename):
    media = XLSX if fmt == "xlsx" else "application/pdf"
    return Response(content=data, media_type=media,
                    headers={"Content-Disposition": f'attachment; filename="{basename}.{fmt}"'})
