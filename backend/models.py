from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean, CheckConstraint, Column, Date, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from database import Base

ROLES = ("admin", "fleet_manager", "dispatcher", "driver")
VEHICLE_STATUSES = ("Active", "Idle", "In Maintenance")
SHIPMENT_STATUSES = ("Created", "Assigned", "In Transit", "Delayed", "Delivered", "Cancelled")
DOCUMENT_TYPES = ("Licence front", "Licence back", "ID proof", "Other")
MAINTENANCE_CATEGORIES = (
    "Engine Servicing", "Oil Change", "Tyre Replacement",
    "Brake Inspection", "General Servicing", "Unexpected Repairs",
)
MAINTENANCE_STATUSES = ("Scheduled", "In Progress", "Completed", "Cancelled")
ALERT_CATEGORIES = ("Upcoming", "Overdue", "Resolved")


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(120), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), default="driver", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    license_number = Column(String(50), unique=True, nullable=False)
    phone = Column(String(20), nullable=False)
    status = Column(String(20), default="Available", nullable=False)

    # Driver profile (migration d74fab3e6a93). All optional, so existing drivers stay valid.
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, unique=True)  # the driver's login
    email = Column(String(120), nullable=True)
    photo_name = Column(String(64), nullable=True)        # random file name under backend/uploads/
    license_expiry = Column(Date, nullable=True)

    user = relationship("User")
    documents = relationship(
        "DriverDocument", back_populates="driver",
        order_by="DriverDocument.id", cascade="all, delete-orphan")
    vehicle = relationship("Vehicle", back_populates="driver", uselist=False)
    attendance = relationship(
        "AttendanceLog", back_populates="driver", cascade="all, delete-orphan"
    )


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    registration_number = Column(String(20), unique=True, nullable=False)
    vehicle_type = Column(String(50), nullable=False)
    capacity = Column(Float, nullable=False)
    fuel_type = Column(String(30), nullable=False)
    status = Column(String(20), default="Idle", nullable=False)
    assigned_driver_id = Column(
        Integer, ForeignKey("drivers.id"), nullable=True, unique=True
    )

    # Live tracking (migration b52d8f1c4e71)
    tracker_key_hash = Column(String(64), unique=True, nullable=True)
    last_lat = Column(Float, nullable=True)
    last_lng = Column(Float, nullable=True)
    last_speed_kmh = Column(Float, nullable=True)
    last_heading = Column(Float, nullable=True)
    last_seen = Column(DateTime(timezone=True), nullable=True)

    driver = relationship("Driver", back_populates="vehicle")


class DriverDocument(Base):
    """Migration d74fab3e6a93: an uploaded licence / ID file. The bytes live on disk under
    backend/uploads/ (never in the database); `stored_name` is a random name, so nothing a
    user types can become a file path."""
    __tablename__ = "driver_documents"

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    doc_type = Column(String(30), nullable=False)
    original_name = Column(String(200), nullable=False)
    stored_name = Column(String(64), unique=True, nullable=False)
    content_type = Column(String(100), nullable=False)
    size_bytes = Column(Integer, nullable=False)
    uploaded_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    verified = Column(Boolean, default=False, nullable=False)
    verified_by = Column(String(50), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)

    driver = relationship("Driver", back_populates="documents")


class AttendanceLog(Base):
    __tablename__ = "attendance_logs"
    __table_args__ = (UniqueConstraint("driver_id", "log_date"),)

    id = Column(Integer, primary_key=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    log_date = Column(Date, default=date.today, nullable=False)
    status = Column(String(20), default="Present", nullable=False)

    driver = relationship("Driver", back_populates="attendance")


class Trip(Base):
    """Migration a41c7e2b9d30. Statuses: Planned, In Progress, Completed, Cancelled."""
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    origin = Column(String(120), nullable=False)
    destination = Column(String(120), nullable=False)
    cargo_description = Column(String(200), nullable=True)
    cargo_weight = Column(Float, nullable=False)
    scheduled_start = Column(DateTime(timezone=True), nullable=False)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    distance_km = Column(Float, nullable=True)
    status = Column(String(20), default="Planned", nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    # Chosen route and timing (migration c63e9a2d5f82)
    route_type = Column(String(20), nullable=True)          # shortest / fastest / alternative
    route_geometry = Column(Text, nullable=True)            # JSON [[lat, lng], ...]
    route_duration_min = Column(Float, nullable=True)       # planned driving time of the chosen route
    planned_eta = Column(DateTime(timezone=True), nullable=True)  # the original promise
    eta = Column(DateTime(timezone=True), nullable=True)          # current estimate
    delay_minutes = Column(Float, default=0, nullable=False)      # accumulated traffic delay

    vehicle = relationship("Vehicle")
    driver = relationship("Driver")
    creator = relationship("User", foreign_keys=[created_by_id])
    shipments = relationship("Shipment", back_populates="trip")
    route_changes = relationship(
        "RouteChange", back_populates="trip", order_by="RouteChange.id")


class LocationPing(Base):
    """Migration b52d8f1c4e71: position history written by /tracking/ingest."""
    __tablename__ = "location_pings"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    speed_kmh = Column(Float, nullable=True)
    heading = Column(Float, nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)


class Shipment(Base):
    """Migration c63e9a2d5f82. Statuses: see SHIPMENT_STATUSES.

    `code` (SH-001 ...) is derived from the id, so it is filled in right after
    the first flush; create rows through shipments.create_shipment.
    """
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, nullable=False)
    origin = Column(String(120), nullable=False)
    destination = Column(String(120), nullable=False)
    description = Column(String(200), nullable=False)
    weight_kg = Column(Float, nullable=False)
    status = Column(String(20), default="Created", nullable=False, index=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True, index=True)
    eta = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    trip = relationship("Trip", back_populates="shipments")
    history = relationship(
        "ShipmentHistory", back_populates="shipment",
        order_by="ShipmentHistory.id", cascade="all, delete-orphan")


class ShipmentHistory(Base):
    """Migration c63e9a2d5f82: one row per status change of a shipment."""
    __tablename__ = "shipment_history"

    id = Column(Integer, primary_key=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id"), nullable=False, index=True)
    status = Column(String(20), nullable=False)
    note = Column(String(200), nullable=False, default="")
    changed_by = Column(String(50), nullable=True)
    changed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    shipment = relationship("Shipment", back_populates="history")


class Maintenance(Base):
    """Migration e85abc4f7ba4. Statuses: see MAINTENANCE_STATUSES; categories: MAINTENANCE_CATEGORIES.
    `actual_cost`, `parts_replaced` and `completed_at` are filled when the work is completed."""
    __tablename__ = "maintenance"
    __table_args__ = (
        CheckConstraint("estimated_cost >= 0", name="ck_maintenance_estimated_cost"),
        CheckConstraint("actual_cost IS NULL OR actual_cost >= 0", name="ck_maintenance_actual_cost"),
    )

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    category = Column(String(30), nullable=False)
    description = Column(String(300), nullable=False, default="")
    scheduled_date = Column(Date, nullable=False, index=True)
    service_centre = Column(String(120), nullable=False, default="")
    estimated_cost = Column(Float, nullable=False, default=0)
    actual_cost = Column(Float, nullable=True)
    parts_replaced = Column(String(300), nullable=True)
    status = Column(String(20), default="Scheduled", nullable=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    vehicle = relationship("Vehicle")
    alert = relationship(
        "MaintenanceAlert", back_populates="maintenance", uselist=False,
        cascade="all, delete-orphan")


class MaintenanceAlert(Base):
    """Migration e85abc4f7ba4: at most one alert per maintenance record (category: ALERT_CATEGORIES)."""
    __tablename__ = "maintenance_alerts"

    id = Column(Integer, primary_key=True)
    maintenance_id = Column(
        Integer, ForeignKey("maintenance.id"), nullable=False, unique=True)
    category = Column(String(20), nullable=False, default="Upcoming", index=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolved_by = Column(String(50), nullable=True)

    maintenance = relationship("Maintenance", back_populates="alert")


class DriverAssignment(Base):
    """Migration f96bcd5a8cb5: history of who was put on which trip with which vehicle.
    Only the facts are stored. Whether it is still Active / Completed / Cancelled follows the
    trip's own status, so it can never disagree with the trip."""
    __tablename__ = "driver_assignments"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    assigned_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    trip = relationship("Trip")
    driver = relationship("Driver")
    vehicle = relationship("Vehicle")
    assigned_by = relationship("User")


class FuelRecord(Base):
    """Migration a07cde6b9dc6: one refuelling. total_cost is quantity x price, worked out by the
    server (fuel_rules.total_cost) so a client can never save a total that does not add up."""
    __tablename__ = "fuel_records"
    __table_args__ = (
        CheckConstraint("quantity_litres > 0", name="ck_fuel_quantity"),
        CheckConstraint("price_per_litre >= 0", name="ck_fuel_price"),
        CheckConstraint("total_cost >= 0", name="ck_fuel_total"),
    )

    id = Column(Integer, primary_key=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False, index=True)
    fuel_type = Column(String(30), nullable=False)
    quantity_litres = Column(Float, nullable=False)
    price_per_litre = Column(Float, nullable=False)
    total_cost = Column(Float, nullable=False)
    fueled_on = Column(Date, nullable=False, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    vehicle = relationship("Vehicle")


class RouteChange(Base):
    """Migration c63e9a2d5f82: logged whenever an active trip is rerouted."""
    __tablename__ = "route_changes"

    id = Column(Integer, primary_key=True)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False, index=True)
    old_route_type = Column(String(20), nullable=True)
    new_route_type = Column(String(20), nullable=True)
    old_duration_min = Column(Float, nullable=True)
    new_duration_min = Column(Float, nullable=True)
    reason = Column(String(200), nullable=False, default="")
    changed_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    trip = relationship("Trip", back_populates="route_changes")
