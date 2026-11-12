from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


InspectionCategory = Literal[
    "oil_change", "tire_replacement", "engine_service", "brake_service", "general_inspection",
]
InspectionResult = Literal["passed", "attention_required", "failed"]


class VehicleInspectionCreate(BaseModel):
    vehicle_id: int = Field(gt=0)
    category: InspectionCategory = "general_inspection"
    result: InspectionResult
    checklist: dict[str, bool] = Field(min_length=1)
    notes: str | None = Field(default=None, max_length=2000)
    inspected_at: datetime | None = None

    @field_validator("inspected_at")
    @classmethod
    def normalize_inspected_at(cls, value):
        if value is None:
            return None
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value

    @field_validator("checklist")
    @classmethod
    def validate_checklist(cls, value):
        if not value or any(not key.strip() for key in value):
            raise ValueError("Checklist needs at least one named item")
        return {key.strip(): result for key, result in value.items()}


class VehicleInspectionResponse(BaseModel):
    id: int
    vehicle_id: int
    inspector_user_id: int | None
    category: str
    result: str
    checklist: dict[str, bool]
    notes: str | None
    inspected_at: datetime

    model_config = ConfigDict(from_attributes=True)
