
from datetime import datetime

from pydantic import BaseModel, Field


class DriverLocationUpdate(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)


class DriverLocationResponse(BaseModel):
    driver_id: int
    latitude: float
    longitude: float
    accuracy: float | None = None
    updated_at: datetime
    is_simulated: bool = False

    class Config:
        from_attributes = True
