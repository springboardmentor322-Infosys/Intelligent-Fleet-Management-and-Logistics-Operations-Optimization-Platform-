
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.core.dependencies import require_roles
from app.schemas.user import UserRole

from app.models.vehicle import Vehicle
from app.models.driver import Driver
from app.models.trip import Trip
from app.models.shipment import Shipment
from app.models.maintenance import Maintenance


router = APIRouter(
    prefix="/analytics",
    tags=["Operational Analytics"],
)

analytics_access = require_roles(
    UserRole.ADMINISTRATOR,
    UserRole.FLEET_MANAGER,
)


@router.get("/overview")
def get_analytics_overview(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    vehicle_id: int | None = Query(default=None, gt=0),
    driver_id: int | None = Query(default=None, gt=0),
    trip_status: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user=Depends(analytics_access),
):
    if start_date and end_date and start_date > end_date:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail="Start date cannot be later than end date.",
        )

    # -------------------------------------------------
    # VEHICLE ANALYTICS
    # -------------------------------------------------

    vehicles = db.query(Vehicle).filter(
        Vehicle.status != "inactive"
    ).all()

    total_vehicles = len(vehicles)

    available_vehicles = sum(
        v.status == "available" for v in vehicles
    )

    vehicles_on_trip = sum(
        v.status == "on_trip" for v in vehicles
    )

    vehicles_under_maintenance = sum(
        v.status == "maintenance" for v in vehicles
    )

    fleet_utilisation = (
        round(
            (vehicles_on_trip / total_vehicles) * 100, 2
        )
        if total_vehicles else 0
    )

    vehicle_status_data = [
        {"name": "On Trip", "value": vehicles_on_trip},
        {"name": "Available", "value": available_vehicles},
        {
            "name": "Maintenance",
            "value": vehicles_under_maintenance,
        },
    ]

    # -------------------------------------------------
    # TRIP ANALYTICS
    # -------------------------------------------------

    trip_query = db.query(Trip)

    if start_date:
        trip_query = trip_query.filter(
            Trip.scheduled_at >= datetime.combine(
                start_date, time.min
            )
        )

    if end_date:
        trip_query = trip_query.filter(
            Trip.scheduled_at < datetime.combine(
                end_date + timedelta(days=1), time.min
            )
        )

    if vehicle_id:
        trip_query = trip_query.filter(
            Trip.vehicle_id == vehicle_id
        )

    if driver_id:
        trip_query = trip_query.filter(
            Trip.driver_id == driver_id
        )

    if trip_status:
        trip_query = trip_query.filter(
            Trip.status == trip_status
        )

    trips = trip_query.all()

    trip_counts = {
        "completed": 0,
        "assigned": 0,
        "in_progress": 0,
        "delayed": 0,
        "cancelled": 0,
    }

    for trip in trips:
        status = (trip.status or "").lower()

        if status in trip_counts:
            trip_counts[status] += 1

    # -------------------------------------------------
    # SHIPMENT / DELIVERY ANALYTICS
    # -------------------------------------------------

    trip_ids = [trip.id for trip in trips]

    shipments = []

    if trip_ids:
        shipments = db.query(Shipment).filter(
            Shipment.trip_id.in_(trip_ids)
        ).all()

    delivered = [
        s for s in shipments
        if (s.status or "").lower() == "delivered"
    ]

    delayed_deliveries = [
        s for s in shipments
        if (
            (s.status or "").lower() == "delayed"
            or (
                s.delivered_at is not None
                and s.estimated_delivery_at is not None
                and s.delivered_at > s.estimated_delivery_at
            )
        )
    ]

    on_time_deliveries = [
        s for s in delivered
        if (
            s.estimated_delivery_at is None
            or s.delivered_at is None
            or s.delivered_at <= s.estimated_delivery_at
        )
    ]

    delivery_rate = (
        round(
            len(delivered) / len(shipments) * 100, 2
        )
        if shipments else 0
    )

    on_time_rate = (
        round(
            len(on_time_deliveries) / len(delivered) * 100,
            2,
        )
        if delivered else 0
    )

    # -------------------------------------------------
    # DRIVER PERFORMANCE
    # -------------------------------------------------

    drivers = db.query(Driver).filter(
        Driver.status != "inactive"
    ).all()

    driver_performance = []

    for driver in drivers:
        driver_trips = [
            t for t in trips
            if t.driver_id == driver.id
        ]

        driver_trip_ids = [t.id for t in driver_trips]

        driver_shipments = [
            s for s in shipments
            if s.trip_id in driver_trip_ids
        ]

        driver_delivered = [
            s for s in driver_shipments
            if (s.status or "").lower() == "delivered"
        ]

        driver_delayed = [
            s for s in driver_shipments
            if (
                (s.status or "").lower() == "delayed"
                or (
                    s.delivered_at is not None
                    and s.estimated_delivery_at is not None
                    and s.delivered_at > s.estimated_delivery_at
                )
            )
        ]

        if not driver_trips:
            continue

        driver_performance.append({
            "driver_id": driver.id,
            "driver_name": driver.full_name,
            "completed_trips": sum(
                t.status == "completed" for t in driver_trips
            ),
            "successful_deliveries": len(driver_delivered),
            "delayed_deliveries": len(driver_delayed),
            "distance_km": round(
                sum(
                    t.selected_route_distance_km or 0
                    for t in driver_trips
                ),
                2,
            ),
        })

    # -------------------------------------------------
    # DISTANCE ANALYTICS
    # -------------------------------------------------

    total_distance = round(
        sum(
            trip.selected_route_distance_km or 0
            for trip in trips
        ),
        2,
    )

    vehicle_distance = {}

    for trip in trips:
        vehicle_distance[trip.vehicle_id] = (
            vehicle_distance.get(trip.vehicle_id, 0)
            + (trip.selected_route_distance_km or 0)
        )

    distance_data = []

    for v_id, distance in vehicle_distance.items():
        vehicle = next(
            (v for v in vehicles if v.id == v_id),
            None,
        )

        distance_data.append({
            "vehicle_id": v_id,
            "registration_number": (
                vehicle.registration_number if vehicle else
                f"Vehicle #{v_id}"
            ),
            "distance_km": round(distance, 2),
        })

    # -------------------------------------------------
    # MAINTENANCE ANALYTICS
    # -------------------------------------------------

    maintenance_query = db.query(Maintenance)

    if start_date:
        maintenance_query = maintenance_query.filter(
            Maintenance.scheduled_date >= start_date
        )

    if end_date:
        maintenance_query = maintenance_query.filter(
            Maintenance.scheduled_date <= end_date
        )

    if vehicle_id:
        maintenance_query = maintenance_query.filter(
            Maintenance.vehicle_id == vehicle_id
        )

    maintenance_records = maintenance_query.all()

    maintenance_counts = {
        "completed": 0,
        "scheduled": 0,
        "in_progress": 0,
        "cancelled": 0,
        "overdue": 0,
    }

    maintenance_expenses = 0

    today = date.today()

    for record in maintenance_records:
        status = (record.status or "").lower()

        if status in maintenance_counts:
            maintenance_counts[status] += 1

        if (
            status == "scheduled"
            and record.scheduled_date < today
        ):
            maintenance_counts["overdue"] += 1

        maintenance_expenses += (
            record.actual_cost
            if record.actual_cost is not None
            else record.estimated_cost or 0
        )

    # -------------------------------------------------
    # OPERATIONAL INSIGHTS
    # -------------------------------------------------

    insights = []

    for vehicle in vehicles:
        vehicle_jobs = [
            m for m in maintenance_records
            if m.vehicle_id == vehicle.id
        ]

        if len(vehicle_jobs) >= 3:
            insights.append({
                "type": "warning",
                "title": "Frequent Maintenance",
                "message": (
                    f"{vehicle.registration_number} has "
                    f"{len(vehicle_jobs)} maintenance records "
                    "in the selected period."
                ),
            })

    for driver in driver_performance:
        if driver["delayed_deliveries"] >= 2:
            insights.append({
                "type": "warning",
                "title": "Delivery Delays",
                "message": (
                    f"{driver['driver_name']} has "
                    f"{driver['delayed_deliveries']} delayed deliveries."
                ),
            })

    return {
        "fleet": {
            "total_vehicles": total_vehicles,
            "available_vehicles": available_vehicles,
            "vehicles_on_trip": vehicles_on_trip,
            "under_maintenance": vehicles_under_maintenance,
            "fleet_utilisation": fleet_utilisation,
            "vehicle_status": vehicle_status_data,
        },
        "trips": {
            "total": len(trips),
            **trip_counts,
        },
        "deliveries": {
            "total": len(shipments),
            "successful": len(delivered),
            "delayed": len(delayed_deliveries),
            "on_time": len(on_time_deliveries),
            "delivery_rate": delivery_rate,
            "on_time_rate": on_time_rate,
        },
        "drivers": driver_performance,
        "distance": {
            "total_distance_km": total_distance,
            "vehicles": distance_data,
        },
        "maintenance": {
            **maintenance_counts,
            "total_expenses": round(maintenance_expenses, 2),
        },
        "insights": insights,
    }
