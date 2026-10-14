from datetime import date, datetime, time, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select

from app.availability import SALON_TZ, available_starts
from app.models import Booking, Service, Stylist
from app.schemas import BookingCreate, BookingRead


def get_service(session, service_id):
    service = session.get(Service, service_id)
    if service is None:
        raise HTTPException(404, "Service not found.")
    return service


def get_stylist(session, stylist_id, *, lock=False):
    query = select(Stylist).where(Stylist.id == stylist_id)
    if lock:
        query = query.with_for_update()
    stylist = session.scalar(query)
    if stylist is None:
        raise HTTPException(404, "Stylist not found.")
    return stylist


def starts_for(session, service, stylist, day: date):
    day_start = datetime.combine(day, time.min, SALON_TZ)
    day_end = day_start + timedelta(days=1)
    busy = session.execute(
        select(Booking.starts_at, Booking.occupied_until).where(
            Booking.stylist_id == stylist.id,
            Booking.status == "confirmed",
            Booking.starts_at < day_end,
            Booking.occupied_until > day_start,
        )
    ).all()
    return available_starts(
        day, stylist.work_start, stylist.work_end, service.duration_minutes, busy,
    )


def create_booking(session, payload: BookingCreate):
    service = get_service(session, payload.service_id)
    # Lock a persistent stylist row, even when that day has no bookings yet.
    # READ COMMITTED ensures the following query sees a competing writer's commit.
    stylist = get_stylist(session, payload.stylist_id, lock=True)
    start = datetime.combine(payload.date, time.fromisoformat(payload.start_time), SALON_TZ)
    if start not in starts_for(session, service, stylist, payload.date):
        raise HTTPException(409, "That time is unavailable. Please choose another time.")
    end = start + timedelta(minutes=service.duration_minutes)
    booking = Booking(
        service_id=service.id, stylist_id=stylist.id,
        customer_name=payload.customer_name, mobile=payload.mobile,
        starts_at=start, ends_at=end, occupied_until=end,
        price_rupees=service.price_rupees, status="confirmed",
        created_at=datetime.now(timezone.utc),
    )
    session.add(booking)
    session.flush()
    return BookingRead(
        id=booking.id, service=service.name, stylist=stylist.name,
        starts_at=start, ends_at=end, price_rupees=booking.price_rupees,
        status=booking.status,
    )
