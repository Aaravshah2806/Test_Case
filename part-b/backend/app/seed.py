from datetime import time

from sqlalchemy import text

from app.database import build_engine, session_factory
from app.models import SeedVersion, Service, Stylist

SEED_VERSION = "initial_catalog_v1"


def seed_database(factory):
    with factory.begin() as session:
        # Multiple app workers may start together; only one may initialize the catalog.
        session.execute(text("SELECT pg_advisory_xact_lock(78214001)"))
        if session.get(SeedVersion, SEED_VERSION):
            return
        session.add_all([
            Service(id=1, name="Haircut", duration_minutes=30, price_rupees=400),
            Service(id=2, name="Hair spa", duration_minutes=60, price_rupees=1200),
            Service(id=3, name="Beard trim", duration_minutes=15, price_rupees=200),
            Service(id=4, name="Facial", duration_minutes=45, price_rupees=900),
            Stylist(
                id=1, name="Meera", work_start=time(10), work_end=time(19),
                working_days=[0, 1, 2, 3, 4, 5], break_start=time(13), break_end=time(14),
            ),
            Stylist(
                id=2, name="Karan", work_start=time(11), work_end=time(20),
                working_days=[1, 2, 3, 4, 5, 6], break_start=time(15), break_end=time(15, 30),
            ),
            SeedVersion(version=SEED_VERSION),
        ])


if __name__ == "__main__":
    engine = build_engine()
    try:
        seed_database(session_factory(engine))
        print("Catalog initialized (or already seeded).")
    finally:
        engine.dispose()
