import re
from datetime import date as Date
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    duration_minutes: int
    price_rupees: int


class StylistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    work_start: str
    work_end: str


class BookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    service_id: int = Field(gt=0)
    stylist_id: int = Field(gt=0)
    date: Date
    start_time: str
    customer_name: str = Field(max_length=100)
    mobile: str = Field(pattern=r"^[0-9]{10}$")

    @field_validator("customer_name")
    @classmethod
    def validate_name(cls, value):
        value = value.strip()
        if not value or any(ord(char) < 32 or ord(char) == 127 for char in value):
            raise ValueError("Enter a name of 1–100 characters without control characters.")
        return value

    @field_validator("start_time")
    @classmethod
    def validate_time(cls, value):
        if not re.fullmatch(r"(?:[01][0-9]|2[0-3]):(?:00|15|30|45)", value):
            raise ValueError("Start time must be HH:MM on a 15-minute step.")
        return value


class BookingRead(BaseModel):
    id: UUID
    service: str
    stylist: str
    starts_at: datetime
    ends_at: datetime
    price_rupees: int
    status: str


class AvailabilityRead(BaseModel):
    date: Date
    timezone: str = "Asia/Kolkata"
    start_times: list[str]
