"""
Milestone 3 API module.

Registers the additional FastAPI routes for maintenance management,
driver assignment, maintenance alerts and reports, operational analytics,
fleet performance dashboards and fuel monitoring on top of the existing
FleetFlow application (defined in main.py).

Imported from main.py at the bottom of that file.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

import models


# =========================================================
# SHARED CONSTANTS
# =========================================================

DRIVER_STATUSES = {
    "Available",
    "On Trip",
    "Off Duty",
}

VEHICLE_STATUSES = {
    "Active",
    "In Maintenance",
    "Inactive",
    "Assigned",
}

ASSIGNMENT_STATUSES = {
    "Active",
    "Completed",
    "Cancelled",
}

ALERT_TYPES = {
    "Upcoming",
    "Overdue",
}

ALERT_STATUSES = {
    "Unresolved",
    "Resolved",
}

FUEL_TYPES = {
    "Diesel",
    "Petrol",
    "CNG",
    "Electric",
    "Hybrid",
}


# =========================================================
# HELPERS
# =========================================================

def vehicle_summary(vehicle) -> dict:
    return {
        "id": vehicle.id,
        "vehicle_number": vehicle.vehicle_number,
        "vehicle_type": vehicle.vehicle_type,
        "capacity": vehicle.capacity,
        "status": vehicle.status,
        "fuel_type": vehicle.fuel_type,
        "driver_id": vehicle.driver_id,
        "driver": vehicle.driver.full_name if vehicle.driver else None,
    }


def driver_summary(driver) -> dict:
    return {
        "id": driver.id,
        "full_name": driver.full_name,
        "phone": driver.phone,
        "license_number": driver.license_number,
        "status": driver.status,
    }


def maintenance_dict(record, vehicle_number) -> dict:
    return {
        "id": record.id,
        "vehicle_id": record.vehicle_id,
        "vehicle_number": vehicle_number,
        "category": record.category,
        "description": record.description,
        "scheduled_date": record.scheduled_date.isoformat(),
        "service_centre": record.service_centre,
        "estimated_cost": float(record.estimated_cost),
        "status": record.status,
        "completed_date": record.completed_date.isoformat() if record.completed_date else None,
        "replacement_parts": record.replacement_parts,
        "actual_cost": float(record.actual_cost) if record.actual_cost is not None else None,
    }


def fuel_dict(record, vehicle_number) -> dict:
    return {
        "id": record.id,
        "vehicle_id": record.vehicle_id,
        "vehicle_number": vehicle_number,
        "fuel_type": record.fuel_type,
        "quantity_litres": record.quantity_litres,
        "price_per_litre": record.price_per_litre,
        "total_cost": float(record.total_cost),
        "refuel_date": record.refuel_date.isoformat(),
    }


def assignment_dict(a, driver_name, vehicle_number, trip_number, shipment_number) -> dict:
    return {
        "id": a.id,
        "driver_id": a.driver_id,
        "driver": driver_name,
        "vehicle_id": a.vehicle_id,
        "vehicle": vehicle_number,
        "trip_id": a.trip_id,
        "trip": trip_number,
        "shipment": shipment_number,
        "assignment_date": a.assignment_date.isoformat() if a.assignment_date else None,
        "status": a.status,
        "completed_at": a.completed_at.isoformat() if a.completed_at else None,
    }


def alert_dict(alert, vehicle_number, maintenance_category) -> dict:
    return {
        "id": alert.id,
        "maintenance_id": alert.maintenance_id,
        "vehicle_id": alert.vehicle_id,
        "vehicle_number": vehicle_number,
        "category": maintenance_category,
        "alert_type": alert.alert_type,
        "scheduled_date": alert.scheduled_date.isoformat(),
        "message": alert.message,
        "status": alert.status,
        "created_at": alert.created_at.isoformat() if alert.created_at else None,
    }


# =========================================================
# REQUEST SCHEMAS
# =========================================================

class DriverAssignmentCreate(BaseModel):
    driver_id: int
    vehicle_id: int
    trip_id: int
    assignment_date: Optional[datetime] = None
    status: str = "Active"


class DriverAssignmentUpdate(BaseModel):
    status: Optional[str] = None
    completed_at: Optional[datetime] = None


class MaintenanceAlertUpdate(BaseModel):
    status: str


class FuelRecordCreate(BaseModel):
    vehicle_id: int
    fuel_type: str
    quantity_litres: float = Field(ge=0)
    price_per_litre: float = Field(ge=0)
    refuel_date: date


class TripUpdate(BaseModel):
    distance_km: Optional[float] = None