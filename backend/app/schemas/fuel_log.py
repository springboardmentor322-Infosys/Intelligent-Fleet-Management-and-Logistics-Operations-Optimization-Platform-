from datetime import datetime, timezone
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FuelLogCreate(BaseModel):
    vehicle_id: int = Field(gt=0)
    logged_at: datetime | None = None
    odometer_km: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    liters: Decimal = Field(gt=0, max_digits=10, decimal_places=3)
    total_cost: Decimal = Field(ge=0, max_digits=12, decimal_places=2)
    is_full_tank: bool = False

    @field_validator("logged_at")
    @classmethod
    def normalize_logged_at(cls, value):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class FuelLogResponse(BaseModel):
    id: int
    vehicle_id: int
    logged_at: datetime
    odometer_km: Decimal
    liters: Decimal
    total_cost: Decimal
    is_full_tank: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
