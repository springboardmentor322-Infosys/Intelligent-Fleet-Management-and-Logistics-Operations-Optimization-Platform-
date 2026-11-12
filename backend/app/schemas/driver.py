
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class DriverCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=150)
    password: str = Field(min_length=8, max_length=128)
    license_number: str = Field(min_length=1, max_length=100)
    license_expiry: datetime | None = None

    @field_validator("full_name", "license_number")
    @classmethod
    def clean_required_text(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class DriverProfileLinkRequest(BaseModel):
    license_number: str = Field(min_length=1, max_length=100)
    license_expiry: datetime | None = None

    @field_validator("license_number")
    @classmethod
    def clean_license_number(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("License number cannot be blank")
        return value


class DriverUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr | None = None
    license_number: str | None = Field(default=None, min_length=1, max_length=100)
    license_expiry: datetime | None = None
    attendance_status: Literal["unknown", "present", "absent", "leave"] | None = None

    @field_validator("full_name", "license_number", "attendance_status")
    @classmethod
    def clean_optional_text(cls, value):
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank")
        return value


class DriverResponse(BaseModel):
    id: int
    user_id: int
    full_name: str
    email: EmailStr
    license_number: str
    license_expiry: datetime | None
    attendance_status: str

    model_config = ConfigDict(from_attributes=True)
