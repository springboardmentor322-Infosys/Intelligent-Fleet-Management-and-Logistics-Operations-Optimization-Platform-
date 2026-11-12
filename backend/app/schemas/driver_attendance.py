from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class DriverAttendanceCreate(BaseModel):
    status: Literal["present", "absent", "leave"]
    note: str | None = Field(default=None, max_length=2000)


class DriverAttendanceResponse(BaseModel):
    id: int
    driver_id: int
    status: str
    note: str | None
    recorded_at: datetime
    recorded_by_user_id: int | None

    model_config = ConfigDict(from_attributes=True)
