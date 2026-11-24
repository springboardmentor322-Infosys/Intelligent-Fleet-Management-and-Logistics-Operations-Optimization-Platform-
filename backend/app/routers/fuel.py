
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.dependencies import get_db
from app.models.fuel import Fuel
from app.models.vehicle import Vehicle
from app.schemas.fuel import (
    FuelRecordCreate,
    FuelRecordResponse,
    FuelAnalyticsSummary,
    VehicleFuelAnalytics,
)

router = APIRouter(
    prefix="/fuel",
    tags=["Fuel Analytics"],
)


# --------------------------------------------------
# HELPER: CALCULATE VEHICLE FUEL EFFICIENCY
# --------------------------------------------------

def calculate_vehicle_efficiency(records):

    valid_records = [
        record for record in records
        if record.odometer_reading_km is not None
    ]

    valid_records.sort(
        key=lambda record: (
            record.refuelled_at,
            record.id
        )
    )

    total_distance = 0
    total_fuel = 0

    for previous, current in zip(
        valid_records,
        valid_records[1:]
    ):

        distance = (
            current.odometer_reading_km
            - previous.odometer_reading_km
        )

        if distance > 0 and current.quantity_litres > 0:

            total_distance += distance
            total_fuel += current.quantity_litres

    if total_fuel == 0:
        return None

    return round(total_distance / total_fuel, 2)


# --------------------------------------------------
# 1. CREATE FUEL RECORD
# --------------------------------------------------

@router.post("/records", response_model=FuelRecordResponse)
def create_fuel_record(
    payload: FuelRecordCreate,
    db: Session = Depends(get_db),
):

    vehicle = db.query(Vehicle).filter(
        Vehicle.id == payload.vehicle_id
    ).first()

    if not vehicle:
        raise HTTPException(
            status_code=404,
            detail="Vehicle not found."
        )

    fuel_record = Fuel(
        vehicle_id=payload.vehicle_id,
        fuel_type=payload.fuel_type,
        quantity_litres=payload.quantity_litres,
        price_per_litre=payload.price_per_litre,
        total_cost=(
            payload.quantity_litres
            * payload.price_per_litre
        ),
        odometer_reading_km=payload.odometer_reading_km,
        refuelled_at=payload.refuelled_at,
        created_at=datetime.now(timezone.utc),
    )

    db.add(fuel_record)
    db.commit()
    db.refresh(fuel_record)

    return fuel_record


# --------------------------------------------------
# 2. GET FUEL RECORDS
# --------------------------------------------------

@router.get(
    "/records",
    response_model=list[FuelRecordResponse]
)
def get_fuel_records(
    vehicle_id: int | None = Query(default=None, gt=0),
    db: Session = Depends(get_db),
):

    query = db.query(Fuel)

    if vehicle_id is not None:
        query = query.filter(
            Fuel.vehicle_id == vehicle_id
        )

    return query.order_by(
        Fuel.refuelled_at.desc(),
        Fuel.id.desc()
    ).all()


# --------------------------------------------------
# 3. FUEL ANALYTICS SUMMARY
# --------------------------------------------------

@router.get(
    "/summary",
    response_model=FuelAnalyticsSummary
)
def get_fuel_summary(
    db: Session = Depends(get_db),
):

    records = db.query(
        func.coalesce(
            func.sum(Fuel.quantity_litres), 0
        ).label("total_fuel"),

        func.coalesce(
            func.sum(Fuel.total_cost), 0
        ).label("total_expense"),

        func.count(Fuel.id).label("record_count"),

        func.avg(
            Fuel.price_per_litre
        ).label("average_price"),

    ).first()

    vehicles = db.query(Vehicle).all()

    total_distance = 0
    total_efficiency_fuel = 0

    for vehicle in vehicles:

        vehicle_records = (
            db.query(Fuel)
            .filter(Fuel.vehicle_id == vehicle.id)
            .order_by(
                Fuel.refuelled_at.asc(),
                Fuel.id.asc()
            )
            .all()
        )

        valid_records = [
            r for r in vehicle_records
            if r.odometer_reading_km is not None
        ]

        for previous, current in zip(
            valid_records,
            valid_records[1:]
        ):

            distance = (
                current.odometer_reading_km
                - previous.odometer_reading_km
            )

            if distance > 0 and current.quantity_litres > 0:
                total_distance += distance
                total_efficiency_fuel += current.quantity_litres

    average_efficiency = (
        round(
            total_distance / total_efficiency_fuel,
            2
        )
        if total_efficiency_fuel > 0
        else None
    )

    return {
        "total_fuel_consumed": float(records.total_fuel),
        "total_fuel_expense": float(records.total_expense),
        "average_fuel_price": float(records.average_price or 0),
        "total_refuelling_records": int(records.record_count),
        "average_efficiency": average_efficiency,
    }


# --------------------------------------------------
# 4. VEHICLE-WISE FUEL ANALYTICS
# --------------------------------------------------

@router.get(
    "/vehicle-analytics",
    response_model=list[VehicleFuelAnalytics]
)
def get_vehicle_fuel_analytics(
    db: Session = Depends(get_db),
):

    vehicles = db.query(Vehicle).all()

    results = []

    for vehicle in vehicles:

        records = (
            db.query(Fuel)
            .filter(Fuel.vehicle_id == vehicle.id)
            .order_by(
                Fuel.refuelled_at.asc(),
                Fuel.id.asc()
            )
            .all()
        )

        total_fuel = sum(
            record.quantity_litres
            for record in records
        )

        total_expense = sum(
            record.total_cost
            for record in records
        )

        efficiency = calculate_vehicle_efficiency(records)

        results.append({
            "vehicle_id": vehicle.id,
            "registration_number": vehicle.registration_number,
            "fuel_type": vehicle.fuel_type,
            "total_fuel_consumed": round(total_fuel, 2),
            "total_fuel_expense": round(total_expense, 2),
            "refuelling_count": len(records),
            "average_efficiency": efficiency,
        })

    return results
