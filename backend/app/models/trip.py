from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Trip(Base):
    __tablename__ = "trips"
    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[int] = mapped_column(ForeignKey("vehicles.id"), nullable=False, index=True)
    driver_id: Mapped[int] = mapped_column(ForeignKey("drivers.id"), nullable=False, index=True)
    origin: Mapped[str] = mapped_column(String(255), nullable=False)
    destination: Mapped[str] = mapped_column(String(255), nullable=False)
    route_selection: Mapped[str] = mapped_column(String(20), default="fastest", nullable=False)
    route_distance_km: Mapped[float | None] = mapped_column(Numeric(10, 2))
    route_duration_minutes: Mapped[float | None] = mapped_column(Numeric(10, 2))
    route_provider: Mapped[str | None] = mapped_column(String(50))
    traffic_data: Mapped[str] = mapped_column(String(30), default="unavailable", nullable=False)
    scheduled_departure: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    estimated_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_departure: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_arrival: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="scheduled", nullable=False)


class TripRouteHistory(Base):
    __tablename__ = "trip_route_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True, nullable=False)
    route_selection: Mapped[str] = mapped_column(String(20), nullable=False)
    distance_km: Mapped[float | None] = mapped_column(Numeric(10, 2))
    duration_minutes: Mapped[float | None] = mapped_column(Numeric(10, 2))
    provider: Mapped[str | None] = mapped_column(String(50))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ShipmentEtaHistory(Base):
    __tablename__ = "shipment_eta_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    shipment_id: Mapped[int] = mapped_column(ForeignKey("shipments.id", ondelete="CASCADE"), index=True, nullable=False)
    estimated_arrival: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    source: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class TripEtaHistory(Base):
    __tablename__ = "trip_eta_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    trip_id: Mapped[int] = mapped_column(ForeignKey("trips.id", ondelete="CASCADE"), index=True, nullable=False)
    estimated_arrival: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    remaining_duration_minutes: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    location_id: Mapped[int] = mapped_column(ForeignKey("gps_locations.id"), nullable=False)
    provider: Mapped[str] = mapped_column(String(50), nullable=False)
    traffic_data: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
