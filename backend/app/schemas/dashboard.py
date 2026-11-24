from pydantic import BaseModel


class DashboardOverview(BaseModel):
    total_vehicles: int
    available_vehicles: int
    vehicles_on_trip: int
    vehicles_in_maintenance: int
    unassigned_vehicles: int

    total_drivers: int
    available_drivers: int
    drivers_on_trip: int

    total_trips: int
    active_trips: int
    completed_trips: int
    cancelled_trips: int