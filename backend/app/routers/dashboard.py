from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.db.dependencies import get_db

from app.models.driver import Driver
from app.models.trip import Trip
from app.models.user import User
from app.models.vehicle import Vehicle

from app.schemas.dashboard import DashboardOverview
from app.schemas.user import UserRole



router = APIRouter(
    prefix="/dashboard",
    tags=["Dashboard"],
)


dashboard_access = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
    UserRole.DISPATCHER,
)


@router.get(
    "/overview",
    response_model=DashboardOverview,
)
def get_dashboard_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    total_vehicles = db.query(Vehicle).filter(
        Vehicle.status != "inactive"
    ).count()

    available_vehicles = db.query(Vehicle).filter(
        Vehicle.status == "available"
    ).count()

    vehicles_on_trip = db.query(Vehicle).filter(
        Vehicle.status == "on_trip"
    ).count()

    vehicles_in_maintenance = db.query(Vehicle).filter(
        Vehicle.status == "maintenance"
    ).count()

    unassigned_vehicles = db.query(Vehicle).filter(
        Vehicle.assigned_driver_id.is_(None)
    ).count()

    total_drivers = db.query(Driver).count()

    available_drivers = db.query(Driver).filter(
        Driver.status == "available"
    ).count()

    drivers_on_trip = db.query(Driver).filter(
        Driver.status == "on_trip"
    ).count()

    total_trips = db.query(Trip).count()

    active_trips = db.query(Trip).filter(
        Trip.status.in_(["assigned", "in_progress"])
    ).count()

    completed_trips = db.query(Trip).filter(
        Trip.status == "completed"
    ).count()

    cancelled_trips = db.query(Trip).filter(
        Trip.status == "cancelled"
    ).count()

    return DashboardOverview(
        total_vehicles=total_vehicles,
        available_vehicles=available_vehicles,
        vehicles_on_trip=vehicles_on_trip,
        vehicles_in_maintenance=vehicles_in_maintenance,
        unassigned_vehicles=unassigned_vehicles,
        total_drivers=total_drivers,
        available_drivers=available_drivers,
        drivers_on_trip=drivers_on_trip,
        total_trips=total_trips,
        active_trips=active_trips,
        completed_trips=completed_trips,
        cancelled_trips=cancelled_trips,
    )



@router.get("/vehicles")
def get_dashboard_vehicles(
    vehicle_status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(dashboard_access),
):
    query = db.query(Vehicle).filter(
        Vehicle.status != "inactive"
    )

    if vehicle_status:
        query = query.filter(
            Vehicle.status == vehicle_status
        )

    vehicles = query.order_by(Vehicle.id).all()

    results = []

    for vehicle in vehicles:
        driver_name = None

        if vehicle.assigned_driver_id is not None:
            driver = db.query(Driver).filter(
                Driver.id == vehicle.assigned_driver_id
            ).first()

            if driver is not None:
                user = db.query(User).filter(
                    User.id == driver.user_id
                ).first()

                if user is not None:
                    driver_name = user.full_name

        results.append({
            "id": vehicle.id,
            "registration_number": vehicle.registration_number,
            "make": vehicle.make,
            "model": vehicle.model,
            "status": vehicle.status,
            "assigned_driver_id": vehicle.assigned_driver_id,
            "assigned_driver_name": driver_name,
            "vehicle_type": vehicle.vehicle_type,
            "fuel_type": vehicle.fuel_type,
            "fuel_capacity": vehicle.fuel_capacity,
            "fuel_efficiency": vehicle.fuel_efficiency,
            "capacity_kg": vehicle.capacity_kg,
        })

    return results
