
from app.models.user import User
from app.models.driver import Driver
from app.models.vehicle import Vehicle
from app.models.shipment import Shipment, ShipmentStatusHistory
from app.models.gps_location import GPSLocation
from app.models.maintenance_record import MaintenanceRecord
from app.models.fuel_log import FuelLog
from app.models.driver_attendance import DriverAttendanceRecord
from app.models.notification import NotificationEvent
from app.models.vehicle_inspection import VehicleInspection
from app.models.trip import Trip, TripRouteHistory, ShipmentEtaHistory, TripEtaHistory

__all__ = [
    "User",
    "Driver",
    "Vehicle",
    "Shipment",
    "ShipmentStatusHistory",
    "GPSLocation",
    "MaintenanceRecord",
    "FuelLog",
    "DriverAttendanceRecord",
    "NotificationEvent",
    "VehicleInspection",
    "Trip", "TripRouteHistory", "ShipmentEtaHistory", "TripEtaHistory",
]
