
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


VehicleStatus = Literal[
    "idle",
    "active",
    "maintenance",
]


class VehicleCreate(BaseModel):
    vehicle_id: str = Field(min_length=1, max_length=50)
    gps_device_id: str | None = Field(default=None, min_length=1, max_length=100)
    registration_number: str = Field(min_length=1, max_length=50)
    vehicle_type: str = Field(min_length=1, max_length=50)
    capacity: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    fuel_type: str = Field(min_length=1, max_length=30)
    status: VehicleStatus = "idle"
    assigned_driver_id: int | None = None

    @field_validator("vehicle_id", "gps_device_id", "registration_number", "vehicle_type", "fuel_type")
    @classmethod
    def strip_required_text(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class VehicleUpdate(BaseModel):
    gps_device_id: str | None = Field(default=None, min_length=1, max_length=100)
    registration_number: str | None = Field(
        default=None, min_length=1, max_length=50
    )
    vehicle_type: str | None = Field(
        default=None, min_length=1, max_length=50
    )
    capacity: Decimal | None = Field(
        default=None, gt=0, max_digits=10, decimal_places=2
    )
    fuel_type: str | None = Field(
        default=None, min_length=1, max_length=30
    )
    status: VehicleStatus | None = None
    assigned_driver_id: int | None = None

    @field_validator("gps_device_id", "registration_number", "vehicle_type", "fuel_type")
    @classmethod
    def strip_optional_text(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value

    @model_validator(mode="after")
    def reject_null_nonnullable_fields(self):
        optional_fields = {"assigned_driver_id", "gps_device_id"}
        for field in self.model_fields_set - optional_fields:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class VehicleResponse(BaseModel):
    id: int
    vehicle_id: str
    gps_device_id: str | None = None
    registration_number: str
    vehicle_type: str
    capacity: Decimal
    fuel_type: str
    assigned_driver_id: int | None
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
