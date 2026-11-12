
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"
    __table_args__ = (UniqueConstraint("gps_device_id", name="uq_vehicles_gps_device_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    vehicle_id: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False
    )
    gps_device_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    registration_number: Mapped[str] = mapped_column(
        String(50), unique=True, index=True, nullable=False
    )
    vehicle_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )
    capacity: Mapped[float] = mapped_column(
        Numeric(10, 2), nullable=False
    )
    fuel_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    assigned_driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id"), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), default="idle", nullable=False
    )
    maintenance_records: Mapped[list["MaintenanceRecord"]] = relationship(
        back_populates="vehicle",
        passive_deletes="all",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
