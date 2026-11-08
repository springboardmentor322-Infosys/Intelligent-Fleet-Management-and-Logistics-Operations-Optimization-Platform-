


from sqlalchemy import Column, Integer, String, ForeignKey,Date, DateTime
from sqlalchemy.orm import relationship

from database import Base
from sqlalchemy import Float
from sqlalchemy import Boolean
from datetime import datetime


class Vehicle(Base):
    __tablename__ = "vehicles"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_number = Column(String(20), unique=True, nullable=False, index=True)
    model = Column(String(100), nullable=False)
    vehicle_type = Column(String(50), nullable=False)
    status = Column(String(30), default="Available", nullable=False)



class Driver(Base):
    __tablename__ = "drivers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    phone_number = Column(String(15), unique=True, nullable=False)
    license_number = Column(String(50), unique=True, nullable=False)
    status = Column(String(30), default="Available", nullable=False)

    user_id = Column(
        Integer,
        ForeignKey("users.id"),
        unique=True,
        nullable=True
    )

    user = relationship("User")

class VehicleAssignment(Base):
    __tablename__ = "vehicle_assignments"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)

    vehicle = relationship("Vehicle")
    driver = relationship("Driver")

from sqlalchemy import Column, Integer, String, ForeignKey
from sqlalchemy.orm import relationship

class Trip(Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    trip_name = Column(String, nullable=False)
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    status = Column(String, default="Planned", nullable=False)

    scheduled_start = Column(DateTime, nullable=True)
    scheduled_end = Column(DateTime, nullable=True)
    actual_start = Column(DateTime, nullable=True)
    actual_end = Column(DateTime, nullable=True)

    route = Column(String, nullable=True)
    estimated_arrival = Column(DateTime, nullable=True)

    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    driver_id = Column(Integer, ForeignKey("drivers.id"), nullable=False)

    vehicle = relationship("Vehicle")
    driver = relationship("Driver")
    shipments = relationship("Shipment", back_populates="trip")
    
    
from sqlalchemy import Column, Integer, String

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, default="Driver", nullable=False)
from sqlalchemy import Date

class Maintenance(Base):
    __tablename__ = "maintenance"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    service_type = Column(String, nullable=False)
    description = Column(String)
    service_date = Column(Date, nullable=False)
    due_date = Column(Date, nullable=False)
    status = Column(String, default="Scheduled")

    vehicle = relationship("Vehicle")

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    shipment_number = Column(String, unique=True, nullable=False)
    origin = Column(String, nullable=False)
    destination = Column(String, nullable=False)
    customer_name = Column(String, nullable=False)
    shipment_date = Column(Date, nullable=False)
    expected_delivery = Column(Date, nullable=False)
    actual_delivery = Column(Date, nullable=True)
    status = Column(String, default="Pending")

    # Link shipment to an existing trip
    trip_id = Column(Integer, ForeignKey("trips.id"), nullable=True)
    trip = relationship("Trip", back_populates="shipments")
    status_history = relationship(
    "ShipmentStatusHistory",
    back_populates="shipment",
    cascade="all, delete-orphan"
)

class ShipmentStatusHistory(Base):
    __tablename__ = "shipment_status_history"

    id = Column(Integer, primary_key=True, index=True)

    shipment_id = Column(
        Integer,
        ForeignKey("shipments.id"),
        nullable=False
    )

    status = Column(String, nullable=False)

    changed_at = Column(
        DateTime,
        default=datetime.utcnow,
        nullable=False
    )

    shipment = relationship(
        "Shipment",
        back_populates="status_history"
    )

class FuelLog(Base):
    __tablename__ = "fuel_logs"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    fuel_type = Column(String, nullable=False)
    quantity = Column(Float, nullable=False)
    cost = Column(Float, nullable=False)
    fuel_date = Column(Date, nullable=False)
    odometer_reading = Column(Float, nullable=False)

    vehicle = relationship("Vehicle")

from sqlalchemy import DateTime
from datetime import datetime

class VehicleTracking(Base):
    __tablename__ = "vehicle_tracking"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    location_name = Column(String)
    speed = Column(Float, default=0)
    recorded_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle")

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    vehicle_id = Column(Integer, ForeignKey("vehicles.id"), nullable=True)
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    notification_type = Column(String, default="Info")
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    vehicle = relationship("Vehicle")