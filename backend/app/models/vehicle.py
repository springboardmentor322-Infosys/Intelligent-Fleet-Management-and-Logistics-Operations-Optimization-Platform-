from datetime import date

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base


class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(
        primary_key=True,
        index=True,
    )

    registration_number: Mapped[str] = mapped_column(
        String(20),
        unique=True,
        nullable=False,
    )

    make: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    model: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    manufacturing_year: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    capacity_kg: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
    )

    assigned_driver_id: Mapped[int | None] = mapped_column(
        ForeignKey("drivers.id"),
        nullable=True,
    )

    insurance_expiry: Mapped[date] = mapped_column(
        Date,
        nullable=False,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="available",
    )

    vehicle_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="truck",
    )

    fuel_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="diesel",
    )

    fuel_capacity: Mapped[float | None] = mapped_column(
        nullable=True,
    )

    fuel_efficiency: Mapped[float | None] = mapped_column(
        nullable=True,
    )