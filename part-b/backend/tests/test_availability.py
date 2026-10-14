from datetime import date, datetime, time, timedelta, timezone

from app.availability import available_starts

IST = timezone(timedelta(hours=5, minutes=30))
DAY = date(2026, 11, 2)


def at(hour, minute=0):
    return datetime.combine(DAY, time(hour, minute), IST)


def test_fifteen_minute_grid_and_service_must_finish_by_closing():
    slots = available_starts(DAY, time(10), time(19), 30, [])
    assert slots[0] == at(10)
    assert slots[-1] == at(18, 30)
    assert all(b - a == timedelta(minutes=15) for a, b in zip(slots, slots[1:]))
    assert len(slots) == 35


def test_long_service_does_not_fit_near_closing():
    slots = available_starts(DAY, time(10), time(19), 60, [])
    assert slots[-1] == at(18)


def test_overlap_blocks_entire_appointment_but_adjacent_times_are_allowed():
    slots = available_starts(DAY, time(10), time(19), 30, [(at(11), at(12))])
    assert at(10, 30) in slots
    assert at(12) in slots
    assert all(value not in slots for value in [at(10, 45), at(11), at(11, 45)])


def test_short_service_can_use_gap_that_long_service_cannot():
    busy = [(at(10), at(11)), (at(11, 30), at(12))]
    assert at(11) in available_starts(DAY, time(10), time(19), 30, busy)
    assert at(11) not in available_starts(DAY, time(10), time(19), 45, busy)


def test_fully_booked_day_has_no_slots():
    assert available_starts(DAY, time(10), time(19), 15, [(at(10), at(19))]) == []
