from datetime import datetime
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator

class TripCreate(BaseModel):
    vehicle_id: int
    driver_id: int
    origin: str = Field(min_length=1, max_length=255)
    destination: str = Field(min_length=1, max_length=255)
    scheduled_departure: datetime
    shipment_ids: list[int] = Field(default_factory=list)
    route_selection: Literal["shortest", "fastest"] = "fastest"

class TripUpdate(BaseModel):
    status: Literal["scheduled", "in_progress", "completed", "cancelled"] | None = None
    route_selection: Literal["shortest", "fastest"] | None = None

    @model_validator(mode="after")
    def reject_null_values(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Trip update values cannot be null")
        return self

class TripResponse(BaseModel):
    id: int
    vehicle_id: int
    driver_id: int
    origin: str
    destination: str
    route_selection: str
    route_distance_km: float | None
    route_duration_minutes: float | None
    route_provider: str | None
    traffic_data: str
    scheduled_departure: datetime
    estimated_arrival: datetime | None
    actual_departure: datetime | None
    actual_arrival: datetime | None
    status: str
    shipment_ids: list[int]
    model_config = ConfigDict(from_attributes=True)
