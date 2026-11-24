
from datetime import datetime

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Fuel(Base):
    __tablename__ = "fuel_records"

    id: Mapped[int] = mapped_column(
        Integer,
        primary_key=True,
        index=True,
    )

    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id"),
        nullable=False,
    )

    fuel_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    quantity_litres: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    price_per_litre: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    total_cost: Mapped[float] = mapped_column(
        Float,
        nullable=False,
    )

    odometer_reading_km: Mapped[float | None] = mapped_column(
        Float,
        nullable=True,
    )

    refuelled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now().astimezone(),
    )
