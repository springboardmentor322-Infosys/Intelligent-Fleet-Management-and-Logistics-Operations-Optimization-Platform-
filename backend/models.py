from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, Float, DateTime, Date, Text, Numeric
from sqlalchemy.orm import relationship
from database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(150), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(30), nullable=False, default="Driver")
    is_active = Column(Boolean, default=True)


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String(30), unique=True, nullable=False, index=True)
    vehicle_type = Column(String(50), nullable=False)
    capacity = Column(Integer, nullable=False)
    status = Column(String(30), default="Available")
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True)
    fuel_type = Column(String(30), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    speed = Column(Float, nullable=True)
    location_updated_at = Column(DateTime(timezone=True), nullable=True)
    assignments = relationship("DriverAssignment", backref="vehicle")
    alerts = relationship("MaintenanceAlert", backref="vehicle")
    fuel_records = relationship("FuelRecord", backref="vehicle")


class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    phone = Column(String(20), unique=True, nullable=False)
    license_number = Column(String(50), unique=True, nullable=False)
    status = Column(String(30), default="Available")

    vehicles = relationship("Vehicle", backref="driver")
    assignments = relationship("DriverAssignment", backref="driver")
class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    shipment_number = Column(String(50), unique=True, nullable=False)
    pickup_location = Column(String(200), nullable=False)
    delivery_location = Column(String(200), nullable=False)
    status = Column(String(30), default="Pending", nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=True) 
class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    trip_number = Column(String(50), unique=True, nullable=False)
    shipment_id = Column(Integer, ForeignKey("shipments.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    start_location = Column(String(200), nullable=False)
    destination = Column(String(200), nullable=False)
    status = Column(String(30), default="Scheduled", nullable=False)
    distance_km = Column(Float, nullable=True)
    assignment = relationship("DriverAssignment", backref="trip", uselist=False) 


class DriverAssignment(Base):
    __tablename__ = "driver_assignments"

    id = Column(Integer, primary_key=True, index=True)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=False)
    assignment_date = Column(DateTime(timezone=True), nullable=False)
    status = Column(String(30), default="Active", nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)


class MaintenanceAlert(Base):
    __tablename__ = "maintenance_alerts"

    id = Column(Integer, primary_key=True, index=True)
    maintenance_id = Column(Integer, ForeignKey("maintenance_records.id"), nullable=False)
    alert_type = Column(String(30), nullable=False)  # Upcoming / Overdue
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    scheduled_date = Column(Date, nullable=False)
    message = Column(Text, nullable=False)
    status = Column(String(30), default="Unresolved", nullable=False)  # Unresolved / Resolved
    created_at = Column(DateTime(timezone=True), nullable=True)


class FuelRecord(Base):
    __tablename__ = "fuel_records"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    fuel_type = Column(String(30), nullable=False)
    quantity_litres = Column(Float, nullable=False)
    price_per_litre = Column(Float, nullable=False)
    total_cost = Column(Numeric(10, 2), nullable=False)
    refuel_date = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=True)


class MaintenanceRecord(Base):
    __tablename__ = "maintenance_records"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    category = Column(String(50), nullable=False)
    description = Column(Text, nullable=False)
    scheduled_date = Column(Date, nullable=False)
    service_centre = Column(String(150), nullable=False)
    estimated_cost = Column(Numeric(10, 2), nullable=False)
    status = Column(String(30), default="Scheduled", nullable=False)
    completed_date = Column(Date, nullable=True)
    replacement_parts = Column(Text, nullable=True)
    actual_cost = Column(Numeric(10, 2), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=True)
    alerts = relationship("MaintenanceAlert", backref="maintenance")    