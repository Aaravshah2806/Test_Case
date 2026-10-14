"""Level 1 scheduling: work hours and existing bookings, without Level 2 rules."""

from datetime import date, datetime, time, timedelta, timezone

SALON_TZ = timezone(timedelta(hours=5, minutes=30), "Asia/Kolkata")


def available_starts(
    day: date,
    work_start: time,
    work_end: time,
    duration_minutes: int,
    busy: list[tuple[datetime, datetime]],
) -> list[datetime]:
    candidate = datetime.combine(day, work_start, SALON_TZ)
    closing = datetime.combine(day, work_end, SALON_TZ)
    duration = timedelta(minutes=duration_minutes)
    slots = []
    while candidate + duration <= closing:
        end = candidate + duration
        if not any(candidate < busy_end and end > busy_start for busy_start, busy_end in busy):
            slots.append(candidate)
        candidate += timedelta(minutes=15)
    return slots
