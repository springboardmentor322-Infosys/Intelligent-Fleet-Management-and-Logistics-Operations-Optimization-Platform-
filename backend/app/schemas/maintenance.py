from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


MaintenanceStatus = Literal["scheduled", "completed", "cancelled"]


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    from datetime import timezone
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class MaintenanceCreate(BaseModel):
    vehicle_id: int = Field(gt=0)
    service_type: str = Field(min_length=2, max_length=80)
    description: str = Field(min_length=2, max_length=2000)
    service_date: datetime
    cost: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    next_due_date: datetime | None = None
    status: MaintenanceStatus = "completed"

    @field_validator("service_date", "next_due_date")
    @classmethod
    def normalize_dates(cls, value):
        return normalize_datetime(value)

    @model_validator(mode="after")
    def validate_due_date(self):
        if self.next_due_date and self.next_due_date <= self.service_date:
            raise ValueError("Next due date must be after service date")
        return self


class MaintenanceUpdate(BaseModel):
    service_type: str | None = Field(default=None, min_length=2, max_length=80)
    description: str | None = Field(default=None, min_length=2, max_length=2000)
    service_date: datetime | None = None
    cost: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    next_due_date: datetime | None = None
    status: MaintenanceStatus | None = None

    @field_validator("service_date", "next_due_date")
    @classmethod
    def normalize_dates(cls, value):
        return normalize_datetime(value)


class MaintenanceResponse(BaseModel):
    id: int
    vehicle_id: int
    service_type: str
    description: str
    service_date: datetime
    cost: Decimal | None
    next_due_date: datetime | None
    status: str
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
