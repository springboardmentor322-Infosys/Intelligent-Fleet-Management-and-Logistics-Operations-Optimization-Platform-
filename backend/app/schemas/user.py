
from datetime import date
from enum import Enum

from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
)


class UserRole(str, Enum):
    ADMINISTRATOR = "administrator"
    FLEET_MANAGER = "fleet_manager"
    DISPATCHER = "dispatcher"
    DRIVER = "driver"


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.DRIVER


class DriverSignup(UserCreate):
    license_number: str = Field(min_length=1, max_length=50)
    license_expiry: date
    phone_number: str = Field(min_length=1, max_length=20)

    @field_validator("license_number", "phone_number")
    @classmethod
    def validate_text(cls, value: str) -> str:
        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value


class PublicSignup(UserCreate):
    license_number: str | None = None
    license_expiry: date | None = None
    phone_number: str | None = None

    @field_validator("license_number", "phone_number")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value

        value = value.strip()

        if not value:
            raise ValueError("This field cannot be empty.")

        return value

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    role: UserRole
    is_active: bool
    approval_status: str
