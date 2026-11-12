
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


ShipmentStatus = Literal[
    "pending",
    "assigned",
    "in_transit",
    "delayed",
    "delivered",
    "cancelled",
]


class ShipmentCreate(BaseModel):
    tracking_number: str = Field(min_length=1, max_length=50)
    origin: str = Field(min_length=1, max_length=255)
    destination: str = Field(min_length=1, max_length=255)
    cargo_description: str = Field(min_length=1, max_length=255)
    weight: Decimal = Field(
        gt=0, max_digits=10, decimal_places=2
    )
    vehicle_id: int | None = None
    driver_id: int | None = None
    scheduled_departure: datetime | None = None

    @field_validator("tracking_number", "origin", "destination", "cargo_description")
    @classmethod
    def strip_required_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("scheduled_departure")
    @classmethod
    def normalize_scheduled_departure(cls, value):
        if value is not None and value.tzinfo is None:
            from datetime import timezone
            return value.replace(tzinfo=timezone.utc)
        return value


class ShipmentUpdate(BaseModel):
    tracking_number: str | None = Field(default=None, min_length=1, max_length=50)
    origin: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    destination: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    cargo_description: str | None = Field(
        default=None, min_length=1, max_length=255
    )
    weight: Decimal | None = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    status: ShipmentStatus | None = None
    vehicle_id: int | None = None
    driver_id: int | None = None
    scheduled_departure: datetime | None = None
    estimated_arrival: datetime | None = None

    @field_validator("tracking_number", "origin", "destination", "cargo_description")
    @classmethod
    def strip_optional_text(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @field_validator("scheduled_departure", "estimated_arrival")
    @classmethod
    def normalize_schedule_dates(cls, value):
        if value is not None and value.tzinfo is None:
            from datetime import timezone
            return value.replace(tzinfo=timezone.utc)
        return value

    @model_validator(mode="after")
    def reject_null_nonnullable_fields(self):
        optional_fields = {"vehicle_id", "driver_id", "scheduled_departure", "estimated_arrival"}
        for field in self.model_fields_set - optional_fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class ShipmentResponse(BaseModel):
    id: int
    tracking_number: str
    origin: str
    destination: str
    cargo_description: str
    weight: Decimal
    status: str
    vehicle_id: int | None
    driver_id: int | None
    created_at: datetime
    updated_at: datetime
    scheduled_departure: datetime | None
    estimated_arrival: datetime | None
    trip_id: int | None = None
    actual_arrival: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ShipmentStatusHistoryResponse(BaseModel):
    id: int
    shipment_id: int
    previous_status: str | None
    status: str
    changed_by_user_id: int | None
    changed_at: datetime

    model_config = ConfigDict(from_attributes=True)
