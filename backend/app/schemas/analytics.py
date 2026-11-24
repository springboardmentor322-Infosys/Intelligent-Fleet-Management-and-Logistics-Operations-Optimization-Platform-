
from pydantic import BaseModel


class FleetSummary(BaseModel):
    total_vehicles: int
    available_vehicles: int
    active_vehicles: int
    vehicles_under_maintenance: int


class DriverSummary(BaseModel):
    total_drivers: int
    available_drivers: int
    drivers_on_trip: int
    off_duty_drivers: int


class TripPerformance(BaseModel):
    completed: int
    ongoing: int
    delayed: int
    cancelled: int


class DeliveryPerformance(BaseModel):
    total_deliveries: int
    successful_deliveries: int
    delayed_deliveries: int
    on_time_deliveries: int
    on_time_percentage: float


class VehicleUtilisation(BaseModel):
    used: int
    available: int
    under_maintenance: int
    utilisation_percentage: float


class DriverPerformance(BaseModel):
    driver_id: int
    driver_name: str
    completed_trips: int
    successful_deliveries: int
    delayed_deliveries: int


class MaintenanceAnalytics(BaseModel):
    completed: int
    scheduled: int
    in_progress: int
    overdue: int
    total_expenses: float


class DistanceAnalytics(BaseModel):
    total_distance_km: float


class AnalyticsOverview(BaseModel):
    fleet: FleetSummary
    drivers: DriverSummary
    trips: TripPerformance
    deliveries: DeliveryPerformance
    vehicle_utilisation: VehicleUtilisation
    driver_performance: list[DriverPerformance]
    maintenance: MaintenanceAnalytics
    distance: DistanceAnalytics
