from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class TripStatus(str, Enum):
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TripCreate(BaseModel):
    origin: str = Field(min_length=1, max_length=255)
    destination: str = Field(min_length=1, max_length=255)
    description: str | None = None
    vehicle_id: int = Field(gt=0)
    driver_id: int = Field(gt=0)
    scheduled_at: datetime
    estimated_duration_minutes: float | None = Field(
    default=None, gt=0, le=100000
)
    selected_route_id: int | None = Field(default=None, ge=0)
    selected_route_distance_km: float | None = Field(
        default=None,
        gt=0,
        le=1000000,
    )
    selected_route_coordinates: list[list[float]] | None = None

    @field_validator("origin", "destination")
    @classmethod
    def validate_location(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value

    @field_validator("scheduled_at")
    @classmethod
    def validate_scheduled_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError(
                "scheduled_at must include a timezone."
            )

        return value


class TripStatusUpdate(BaseModel):
    status: TripStatus


class TripResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    origin: str
    destination: str
    description: str | None
    vehicle_id: int
    driver_id: int
    status: TripStatus
    scheduled_at: datetime
    created_at: datetime
    estimated_duration_minutes: float | None
    estimated_arrival_at: datetime | None
    selected_route_id: int | None
    selected_route_distance_km: float | None
    selected_route_coordinates: list[list[float]] | None