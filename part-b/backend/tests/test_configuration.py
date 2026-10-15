from io import StringIO

import pytest
from alembic import command
from alembic.config import Config

from app.database import BACKEND_DIR, database_url


def test_standard_supabase_url_is_normalized_without_exposing_the_password(monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql://postgres.demo:p%40ss@aws-0-test.pooler.supabase.com:5432/postgres?sslmode=require",
    )
    url = database_url()
    assert url.drivername == "postgresql+psycopg"
    assert url.password == "p@ss"
    assert "p@ss" not in str(url)


@pytest.mark.parametrize("value", [
    "", "sqlite:///salon.db",
    "postgresql://postgres.demo:pass@aws-0-test.pooler.supabase.com:5432/postgres",
    "postgresql://postgres.PROJECT_REF:pass@POOLER_HOST:5432/postgres?sslmode=require",
])
def test_rejects_missing_non_postgres_or_unencrypted_supabase_configuration(monkeypatch, value):
    monkeypatch.setenv("DATABASE_URL", value)
    with pytest.raises((RuntimeError, ValueError)):
        database_url()


def test_migration_creates_private_schema_before_its_version_table(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://demo:demo@localhost:5432/demo")
    output = StringIO()
    configuration = Config(str(BACKEND_DIR / "alembic.ini"), output_buffer=output)
    command.upgrade(configuration, "head", sql=True)
    sql = output.getvalue()
    schema_position = sql.index("CREATE SCHEMA IF NOT EXISTS salon")
    assert schema_position < sql.index("CREATE TABLE salon.alembic_version")
    assert "CREATE TABLE salon.services" in sql
    assert "CREATE TABLE salon.bookings" in sql
    assert "ALTER TABLE salon.bookings ENABLE ROW LEVEL SECURITY" in sql
