
from datetime import datetime, timedelta, timezone

from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class GPSLocationCreate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    speed_kph: float | None = Field(default=None, ge=0, le=300)
    heading_degrees: float | None = Field(default=None, ge=0, lt=360)
    recorded_at: datetime | None = None
    device_id: str | None = Field(default=None, min_length=1, max_length=100)
    device_connected: bool | None = None
    # User-authenticated telemetry cannot assert physical-device provenance.
    source: Literal["unknown", "simulated"] = "unknown"

    @model_validator(mode="before")
    @classmethod
    def accept_timestamp_name(cls, values):
        if isinstance(values, dict) and "timestamp" in values and "recorded_at" not in values:
            values = {**values, "recorded_at": values["timestamp"]}
        if isinstance(values, dict) and "timestamp" in values:
            values = {key: value for key, value in values.items() if key != "timestamp"}
        return values

    @field_validator("recorded_at")
    @classmethod
    def normalize_recorded_at(cls, value):
        if value is not None and value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        if value is not None and value > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("recorded_at cannot be more than five minutes in the future")
        return value


class GPSLocationResponse(BaseModel):
    id: int
    vehicle_id: int
    latitude: float
    longitude: float
    recorded_at: datetime
    timestamp: datetime | None = None
    speed_kph: float | None
    heading_degrees: float | None = None
    device_id: str | None = None
    device_connected: bool | None = None
    source: str
    is_simulated: bool

    model_config = ConfigDict(from_attributes=True)


class GPSLocationEvent(BaseModel):
    type: Literal["location"]
    location: GPSLocationResponse

    @classmethod
    def from_location(cls, location):
        from app.services.tracking import serialize_location
        return cls(type="location", location=serialize_location(location))


class GPSLocationAuthMessage(BaseModel):
    token: str = Field(min_length=1)


class GPSIngestionRequest(GPSLocationCreate):
    model_config = ConfigDict(extra="forbid")
    vehicle_id: int | None = Field(default=None, gt=0)
    device_id: str | None = Field(default=None, min_length=1, max_length=100)
    recorded_at: datetime
    source: Literal["device", "provider"]

    @model_validator(mode="after")
    def require_vehicle_or_device(self):
        if self.vehicle_id is None and not self.device_id:
            raise ValueError("Provide vehicle_id or a registered device_id")
        return self
