from contextlib import asynccontextmanager
from datetime import date as Date
from typing import Annotated

from fastapi import FastAPI, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError

from app.bookings import create_booking, get_service, get_stylist, starts_for
from app.database import build_engine, session_factory
from app.models import Service, Stylist
from app.schemas import AvailabilityRead, BookingCreate, BookingRead, ServiceRead, StylistRead
from app.seed import seed_database


def create_app(factory=None):
    @asynccontextmanager
    async def lifespan(app):
        engine = None
        if factory is None:
            engine = build_engine()
            app.state.sessions = session_factory(engine)
        else:
            app.state.sessions = factory
        try:
            # Migrations must be applied first. Seed exactly once, on the first run.
            seed_database(app.state.sessions)
            yield
        finally:
            if engine is not None:
                engine.dispose()

    app = FastAPI(title="Salon appointments · Level 1", lifespan=lifespan)

    @app.middleware("http")
    async def security_headers(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.exception_handler(SQLAlchemyError)
    async def database_error(request, exc):
        # Never send SQL, connection strings, or customer details to the browser.
        return JSONResponse(
            status_code=503,
            content={"detail": "Database temporarily unavailable. Please try again later."},
        )

    @app.get("/api/health")
    def health(request: Request):
        with request.app.state.sessions() as session:
            session.execute(text("SELECT 1"))
        return {"status": "ok", "database": "postgresql", "level": 1}

    @app.get("/api/services", response_model=list[ServiceRead])
    def services(request: Request):
        with request.app.state.sessions() as session:
            return list(session.scalars(select(Service).order_by(Service.id)))

    @app.get("/api/stylists", response_model=list[StylistRead])
    def stylists(request: Request):
        with request.app.state.sessions() as session:
            return [
                StylistRead(
                    id=stylist.id, name=stylist.name,
                    work_start=stylist.work_start.strftime("%H:%M"),
                    work_end=stylist.work_end.strftime("%H:%M"),
                )
                for stylist in session.scalars(select(Stylist).order_by(Stylist.id))
            ]

    @app.get("/api/availability", response_model=AvailabilityRead)
    def availability(
        request: Request,
        service_id: Annotated[int, Query(gt=0)],
        stylist_id: Annotated[int, Query(gt=0)],
        day: Annotated[Date, Query(alias="date")],
    ):
        with request.app.state.sessions() as session:
            service = get_service(session, service_id)
            stylist = get_stylist(session, stylist_id)
            times = starts_for(session, service, stylist, day)
            return AvailabilityRead(
                date=day, start_times=[slot.strftime("%H:%M") for slot in times],
            )

    @app.post("/api/bookings", response_model=BookingRead, status_code=201)
    def book(payload: BookingCreate, request: Request):
        # The response is returned only after the transaction commits successfully.
        with request.app.state.sessions.begin() as session:
            confirmation = create_booking(session, payload)
        return confirmation

    return app


app = create_app()
