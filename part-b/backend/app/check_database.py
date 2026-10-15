"""A connection check that does not print credentials or raw database exceptions."""

from sqlalchemy import text

from app.database import build_engine


def main():
    engine = None
    try:
        engine = build_engine()
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
    except Exception:
        print(
            "Connection failed. Check backend/.env, the Supabase Session pooler host/username, "
            "database password, sslmode=require, and whether the project is active."
        )
        return 1
    finally:
        if engine is not None:
            engine.dispose()
    print("PostgreSQL connection successful. You can run migrations and start the backend.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
