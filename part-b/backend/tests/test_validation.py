import pytest
from pydantic import ValidationError

from app.schemas import BookingCreate


def payload(**changes):
    return {
        "service_id": 1,
        "stylist_id": 1,
        "date": "2026-11-02",
        "start_time": "10:00",
        "customer_name": "  Asha Shah  ",
        "mobile": "0123456789",
        **changes,
    }


def test_trims_name_and_preserves_mobile_leading_zero():
    booking = BookingCreate(**payload())
    assert booking.customer_name == "Asha Shah"
    assert booking.mobile == "0123456789"


@pytest.mark.parametrize("name", ["", "   ", "A" * 101, "Asha\nShah"])
def test_rejects_invalid_name(name):
    with pytest.raises(ValidationError):
        BookingCreate(**payload(customer_name=name))


@pytest.mark.parametrize(
    "mobile", ["123", "12345678901", "+919876543210", "１２３４５６７８９０", 1234567890]
)
def test_requires_mobile_as_exactly_ten_ascii_digits(mobile):
    with pytest.raises(ValidationError):
        BookingCreate(**payload(mobile=mobile))


@pytest.mark.parametrize("value", ["10:00:00", "9:00", "25:00", "10:01"])
def test_rejects_non_grid_or_malformed_start_time(value):
    with pytest.raises(ValidationError):
        BookingCreate(**payload(start_time=value))


def test_rejects_client_supplied_price():
    with pytest.raises(ValidationError):
        BookingCreate(**payload(price_rupees=1))
