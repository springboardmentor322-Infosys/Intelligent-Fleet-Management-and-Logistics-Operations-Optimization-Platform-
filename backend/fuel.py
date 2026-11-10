"""Fuel monitoring (Milestone 3, Task 6): refuelling records, expenses and km/l efficiency.

The calculations are in fuel_rules.py (tested without a database). Distance for the efficiency
figure comes from completed trips (the distance entered when the trip was completed), so
efficiency is only shown for vehicles that have both fuel and distance records.
Admin and fleet manager only: fuel spend is business data.
"""
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

import exports
import fuel_rules as rules
import models
from database import get_db
from security import require_roles

router = APIRouter(prefix="/fuel", tags=["fuel"])
MANAGE = require_roles("admin", "fleet_manager")


class FuelIn(BaseModel):
    vehicle_id: int
    fuel_type: Optional[str] = Field(default=None, max_length=30)  # defaults to the vehicle's
    quantity_litres: float = Field(gt=0)
    price_per_litre: float = Field(ge=0)
    fueled_on: Optional[date] = None  # defaults to today


def record_out(r):
    return {
        "id": r.id, "vehicle_id": r.vehicle_id,
        "registration_number": r.vehicle.registration_number,
        "vehicle_type": r.vehicle.vehicle_type, "fuel_type": r.fuel_type,
        "quantity_litres": r.quantity_litres, "price_per_litre": r.price_per_litre,
        "total_cost": r.total_cost, "fueled_on": str(r.fueled_on),
    }


def filtered(db, vehicle, fuel_type, start, end):
    if start and end and start > end:
        raise HTTPException(422, "Start date must not be after end date")
    q = db.query(models.FuelRecord).join(models.Vehicle)
    if vehicle:
        q = q.filter(models.Vehicle.registration_number.ilike(f"%{vehicle}%"))
    if fuel_type:
        q = q.filter(models.FuelRecord.fuel_type == fuel_type)
    if start:
        q = q.filter(models.FuelRecord.fueled_on >= start)
    if end:
        q = q.filter(models.FuelRecord.fueled_on <= end)
    return q.order_by(models.FuelRecord.fueled_on.desc(), models.FuelRecord.id.desc()).all()


def distance_by_vehicle(db, start, end):
    """Kilometres of completed trips per vehicle in the period (trips without a distance add 0)."""
    out = {}
    trips = db.query(models.Trip).filter(
        models.Trip.status == "Completed", models.Trip.distance_km.isnot(None)).all()
    for t in trips:
        done = t.completed_at.date() if t.completed_at else None
        if (start and (done is None or done < start)) or (end and (done is None or done > end)):
            continue
        reg = t.vehicle.registration_number
        out[reg] = out.get(reg, 0) + t.distance_km
    return out


def analytics_for(db, records, start, end):
    rows = [dict(registration_number=r.vehicle.registration_number, litres=r.quantity_litres,
                 cost=r.total_cost, date=r.fueled_on) for r in records]
    return rules.summarize(rows, distance_by_vehicle(db, start, end))


@router.get("")
def list_records(vehicle: Optional[str] = None, fuel_type: Optional[str] = None,
                 start: Optional[date] = None, end: Optional[date] = None,
                 _=Depends(MANAGE), db: Session = Depends(get_db)):
    return [record_out(r) for r in filtered(db, vehicle, fuel_type, start, end)]


@router.post("", status_code=201)
def add_record(data: FuelIn, user=Depends(MANAGE), db: Session = Depends(get_db)):
    v = db.get(models.Vehicle, data.vehicle_id)
    if not v:
        raise HTTPException(404, "Vehicle not found")
    when = data.fueled_on or date.today()
    if when > date.today():
        raise HTTPException(422, "Refuelling date cannot be in the future")
    r = models.FuelRecord(
        vehicle_id=v.id, fuel_type=data.fuel_type or v.fuel_type,
        quantity_litres=data.quantity_litres, price_per_litre=data.price_per_litre,
        total_cost=rules.total_cost(data.quantity_litres, data.price_per_litre),  # never trusted from the client
        fueled_on=when, created_by_id=user.id)
    db.add(r)
    db.commit()
    db.refresh(r)
    return record_out(r)


@router.get("/analytics")
def analytics(vehicle: Optional[str] = None, fuel_type: Optional[str] = None,
              start: Optional[date] = None, end: Optional[date] = None,
              _=Depends(MANAGE), db: Session = Depends(get_db)):
    records = filtered(db, vehicle, fuel_type, start, end)
    return analytics_for(db, records, start, end)


@router.get("/export")
def export(format: str = "xlsx", vehicle: Optional[str] = None,
           fuel_type: Optional[str] = None, start: Optional[date] = None,
           end: Optional[date] = None, _=Depends(MANAGE), db: Session = Depends(get_db)):
    if format not in ("xlsx", "pdf"):
        raise HTTPException(422, "format must be xlsx or pdf")
    records = filtered(db, vehicle, fuel_type, start, end)
    s = analytics_for(db, records, start, end)
    cols = ["Date", "Vehicle", "Fuel type", "Litres", "Price/litre", "Total cost"]
    rows = [[str(r.fueled_on), r.vehicle.registration_number, r.fuel_type,
             r.quantity_litres, r.price_per_litre, r.total_cost] for r in records]
    f = s["fleet"]
    summary = [f"Records: {f['records']}", f"Litres: {f['litres']}", f"Total cost: {f['cost']}",
               f"Fleet efficiency (km/l): {f['km_per_litre'] if f['km_per_litre'] is not None else 'not enough distance data'}"]
    if format == "xlsx":
        data = exports.to_xlsx("Fuel", cols, rows, [[line] for line in summary])
    else:
        data = exports.to_pdf(f"FleetFlow fuel report - {date.today()}", cols, rows, summary)
    return exports.file_response(data, format, f"fuel-report-{date.today()}")


@router.delete("/{record_id}")
def delete_record(record_id: int, _=Depends(MANAGE), db: Session = Depends(get_db)):
    r = db.get(models.FuelRecord, record_id)
    if not r:
        raise HTTPException(404, "Fuel record not found")
    db.delete(r)
    db.commit()
    return {"message": "Fuel record deleted"}
