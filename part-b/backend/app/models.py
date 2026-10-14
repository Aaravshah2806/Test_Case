from datetime import datetime, time
from uuid import UUID, uuid4

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, String, Time
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from app.database import SCHEMA


class Base(DeclarativeBase):
    pass


class Service(Base):
    __tablename__ = "services"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0"),
        CheckConstraint("price_rupees >= 0"),
        {"schema": SCHEMA},
    )
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    duration_minutes: Mapped[int]
    price_rupees: Mapped[int]


class Stylist(Base):
    __tablename__ = "stylists"
    __table_args__ = ({"schema": SCHEMA},)
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    name: Mapped[str] = mapped_column(String(80), unique=True)
    work_start: Mapped[time] = mapped_column(Time)
    work_end: Mapped[time] = mapped_column(Time)
    working_days: Mapped[list[int]] = mapped_column(JSONB)
    break_start: Mapped[time] = mapped_column(Time)
    break_end: Mapped[time] = mapped_column(Time)


class Booking(Base):
    __tablename__ = "bookings"
    __table_args__ = (
        CheckConstraint("ends_at > starts_at"),
        CheckConstraint("occupied_until >= ends_at"),
        CheckConstraint("price_rupees >= 0"),
        CheckConstraint("char_length(trim(customer_name)) BETWEEN 1 AND 100"),
        CheckConstraint("mobile ~ '^[0-9]{10}$'"),
        Index("ix_bookings_stylist_start", "stylist_id", "starts_at"),
        {"schema": SCHEMA},
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    service_id: Mapped[int] = mapped_column(ForeignKey(f"{SCHEMA}.services.id"))
    stylist_id: Mapped[int] = mapped_column(ForeignKey(f"{SCHEMA}.stylists.id"))
    customer_name: Mapped[str] = mapped_column(String(100))
    mobile: Mapped[str] = mapped_column(String(10))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    occupied_until: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    price_rupees: Mapped[int]
    status: Mapped[str] = mapped_column(String(20), default="confirmed")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class SeedVersion(Base):
    __tablename__ = "seed_versions"
    __table_args__ = ({"schema": SCHEMA},)
    version: Mapped[str] = mapped_column(String(80), primary_key=True)
