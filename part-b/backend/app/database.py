import os
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session, sessionmaker

BACKEND_DIR = Path(__file__).resolve().parent.parent
SCHEMA = "salon"


def database_url():
    load_dotenv(BACKEND_DIR / ".env")
    value = os.getenv("DATABASE_URL", "")
    if not value:
        raise RuntimeError("Set DATABASE_URL in backend/.env. See backend/.env.example.")
    url = make_url(value)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg")
    if url.drivername != "postgresql+psycopg":
        raise RuntimeError("DATABASE_URL must use PostgreSQL with the psycopg driver.")
    placeholders = ["PROJECT_REF", "ENCODED_PASSWORD", "POOLER_HOST"]
    if not url.host or any(token in value for token in placeholders):
        raise RuntimeError("Replace the Supabase placeholders in backend/.env.")
    if url.host.endswith("supabase.com") and url.query.get("sslmode") not in {
        "require", "verify-ca", "verify-full"
    }:
        raise RuntimeError("Supabase DATABASE_URL must include sslmode=require or stronger.")
    return url


def build_engine(url=None):
    return create_engine(
        url or database_url(),
        pool_pre_ping=True,
        pool_size=3,
        max_overflow=2,
        isolation_level="READ COMMITTED",
        hide_parameters=True,
        connect_args={"connect_timeout": 10, "prepare_threshold": None},
    )


def session_factory(engine):
    return sessionmaker(engine, class_=Session, expire_on_commit=False)
