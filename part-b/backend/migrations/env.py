from alembic import context
from sqlalchemy import text

from app.database import build_engine, database_url
from app.models import Base


def run_migrations_offline():
    context.configure(
        url=database_url(), target_metadata=Base.metadata,
        literal_binds=True, include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    engine = build_engine()
    with engine.connect() as connection:
        # Keep migration tracking and app tables outside Supabase's exposed public schema.
        connection.execute(text("CREATE SCHEMA IF NOT EXISTS salon"))
        connection.commit()
        context.configure(
            connection=connection, target_metadata=Base.metadata,
            include_schemas=True, version_table_schema="salon",
        )
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
