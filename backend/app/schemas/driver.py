
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


class DriverCreate(BaseModel):
    user_id: int | None = Field(default=None, gt=0)
    full_name: str = Field(min_length=2, max_length=100)
    license_number: str = Field(min_length=1, max_length=50)
    license_expiry: date
    phone_number: str = Field(min_length=1, max_length=20)

    @field_validator("full_name", "license_number", "phone_number")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value


class DriverUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    license_number: str = Field(min_length=1, max_length=50)
    license_expiry: date
    phone_number: str = Field(min_length=1, max_length=20)
    status: str = Field(min_length=1, max_length=30)

    @field_validator(
        "full_name",
        "license_number",
        "phone_number",
        "status",
    )
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value


class DriverResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int | None
    full_name: str
    license_number: str
    license_expiry: date
    phone_number: str
    status: str


class DriverProfileResponse(BaseModel):
    id: int
    user_id: int | None
    full_name: str
    email: str | None = None
    license_number: str
    license_expiry: date
    phone_number: str
    status: str
