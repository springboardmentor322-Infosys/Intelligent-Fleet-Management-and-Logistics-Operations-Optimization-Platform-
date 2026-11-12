
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class GPSLocation(Base):
    __tablename__ = "gps_locations"

    id: Mapped[int] = mapped_column(primary_key=True)

    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id"),
        index=True,
        nullable=False,
    )

    latitude: Mapped[float] = mapped_column(
        Numeric(10, 7),
        nullable=False,
    )

    longitude: Mapped[float] = mapped_column(
        Numeric(10, 7),
        nullable=False,
    )
    speed_kph: Mapped[float | None] = mapped_column(Numeric(7, 2), nullable=True)
    heading_degrees: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    device_connected: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source: Mapped[str] = mapped_column(String(20), default="unknown", nullable=False)

    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
        nullable=False,
    )

    @property
    def is_simulated(self) -> bool:
        return self.source == "simulated"

    @property
    def timestamp(self) -> datetime:
        return self.recorded_at
