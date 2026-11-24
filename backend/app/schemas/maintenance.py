from datetime import date, datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class MaintenanceStatus(str, Enum):
    SCHEDULED = "scheduled"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class MaintenanceType(str, Enum):
    ENGINE_SERVICING = "engine servicing"
    OIL_CHANGE = "oil change"
    TYRE_REPLACEMENT = "tyre replacement"
    BRAKE_INSPECTION = "brake inspection"
    GENERAL_SERVICING = "general servicing"
    UNEXPECTED_REPAIRS = "unexpected repairs"


class MaintenanceCreate(BaseModel):
    vehicle_id: int = Field(gt=0)
    maintenance_type: MaintenanceType
    description: str = Field(default="")
    scheduled_date: date
    service_center: str = Field(min_length=1, max_length=150)
    estimated_cost: float = Field(ge=0)

    @field_validator("description", "service_center")
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()
        return value


class MaintenanceUpdate(BaseModel):
    status: MaintenanceStatus | None = None
    actual_service_date: date | None = None
    replacement_parts: str | None = None
    actual_cost: float | None = Field(default=None, ge=0)
    vehicle_operational: bool | None = None

    @field_validator("replacement_parts")
    @classmethod
    def strip_replacement_parts(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def validate_completion_details(self):
        if self.status == MaintenanceStatus.COMPLETED:
            if self.actual_service_date is None:
                raise ValueError(
                    "Actual service date is required when maintenance is completed."
                )

            if self.vehicle_operational is not True:
                raise ValueError(
                    "Confirm that the vehicle is operational before completing maintenance."
                )

        return self


class MaintenanceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    maintenance_type: MaintenanceType
    description: str
    scheduled_date: date
    service_center: str
    estimated_cost: float
    status: MaintenanceStatus
    actual_service_date: date | None
    replacement_parts: str | None
    actual_cost: float | None
    created_at: datetime


class MaintenanceSummary(BaseModel):
    total_vehicles: int
    under_maintenance: int
    upcoming_maintenance: int
    overdue_maintenance: int
