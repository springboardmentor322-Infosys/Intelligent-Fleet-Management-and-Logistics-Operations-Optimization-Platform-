from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class FuelRecordCreate(BaseModel):
    vehicle_id: int = Field(gt=0)
    fuel_type: str = Field(min_length=1, max_length=30)
    quantity_litres: float = Field(gt=0)
    price_per_litre: float = Field(gt=0)
    odometer_reading_km: float | None = Field(default=None, ge=0)
    refuelled_at: datetime

    @field_validator("fuel_type")
    @classmethod
    def validate_fuel_type(cls, value: str) -> str:
        return value.strip().lower()


class FuelRecordResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    vehicle_id: int
    fuel_type: str
    quantity_litres: float
    price_per_litre: float
    total_cost: float
    odometer_reading_km: float | None
    refuelled_at: datetime
    created_at: datetime


class FuelAnalyticsSummary(BaseModel):
    total_fuel_consumed: float
    total_fuel_expense: float
    average_fuel_price: float
    total_refuelling_records: int
    average_efficiency: float | None


class VehicleFuelAnalytics(BaseModel):
    vehicle_id: int
    registration_number: str
    fuel_type: str
    total_fuel_consumed: float
    total_fuel_expense: float
    refuelling_count: int
    average_efficiency: float | None