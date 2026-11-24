
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ShipmentStatus(str, Enum):
    CREATED = "created"
    ASSIGNED = "assigned"
    IN_TRANSIT = "in_transit"
    DELAYED = "delayed"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class ShipmentCreate(BaseModel):
    tracking_number: str = Field(min_length=1, max_length=50)
    origin: str = Field(min_length=1, max_length=255)
    destination: str = Field(min_length=1, max_length=255)
    description: str | None = None
    trip_id: int | None = Field(default=None, gt=0)
    estimated_delivery_at: datetime | None = None

    @field_validator("tracking_number", "origin", "destination")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value

    @field_validator("estimated_delivery_at")
    @classmethod
    def validate_estimated_delivery_at(
        cls, value: datetime | None
    ) -> datetime | None:
        if value is not None and (
            value.tzinfo is None or value.utcoffset() is None
        ):
            raise ValueError(
                "estimated_delivery_at must include a timezone."
            )

        return value


class ShipmentStatusUpdate(BaseModel):
    status: ShipmentStatus
    notes: str | None = Field(default=None, max_length=2000)


class ShipmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tracking_number: str
    origin: str
    destination: str
    description: str | None
    status: ShipmentStatus
    trip_id: int | None
    estimated_delivery_at: datetime | None
    delivered_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ShipmentStatusHistoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    shipment_id: int
    status: ShipmentStatus
    notes: str | None
    recorded_at: datetime
