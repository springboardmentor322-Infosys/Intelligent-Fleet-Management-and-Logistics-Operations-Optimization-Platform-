from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VehicleCreate(BaseModel):
    registration_number: str = Field(min_length=1, max_length=20)
    make: str = Field(min_length=1, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    manufacturing_year: int = Field(ge=1900, le=2100)
    capacity_kg: int = Field(gt=0)
    insurance_expiry: date
    vehicle_type: str = Field(min_length=1, max_length=50)
    fuel_type: str = Field(min_length=1, max_length=30)
    fuel_capacity: float | None = Field(default=None, gt=0)
    fuel_efficiency: float | None = Field(default=None, gt=0)

    @field_validator(
        "registration_number",
        "make",
        "model",
    )
    @classmethod
    def strip_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value


class VehicleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    registration_number: str
    make: str
    model: str
    manufacturing_year: int
    capacity_kg: int
    assigned_driver_id: int | None
    insurance_expiry: date
    status: str
    vehicle_type: str
    fuel_type: str
    fuel_capacity: float | None
    fuel_efficiency: float | None