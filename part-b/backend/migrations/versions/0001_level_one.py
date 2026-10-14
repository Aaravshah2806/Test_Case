"""Create the private salon catalog and bookings tables."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None
SCHEMA = "salon"


def upgrade():
    op.execute("CREATE SCHEMA IF NOT EXISTS salon")
    op.create_table(
        "services",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("duration_minutes", sa.Integer, nullable=False),
        sa.Column("price_rupees", sa.Integer, nullable=False),
        sa.CheckConstraint("duration_minutes > 0"),
        sa.CheckConstraint("price_rupees >= 0"),
        schema=SCHEMA,
    )
    op.create_table(
        "stylists",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=False),
        sa.Column("name", sa.String(80), nullable=False, unique=True),
        sa.Column("work_start", sa.Time, nullable=False),
        sa.Column("work_end", sa.Time, nullable=False),
        sa.Column("working_days", JSONB, nullable=False),
        sa.Column("break_start", sa.Time, nullable=False),
        sa.Column("break_end", sa.Time, nullable=False),
        schema=SCHEMA,
    )
    op.create_table(
        "bookings",
        sa.Column("id", sa.Uuid, primary_key=True),
        sa.Column("service_id", sa.Integer, sa.ForeignKey("salon.services.id"), nullable=False),
        sa.Column("stylist_id", sa.Integer, sa.ForeignKey("salon.stylists.id"), nullable=False),
        sa.Column("customer_name", sa.String(100), nullable=False),
        sa.Column("mobile", sa.String(10), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("occupied_until", sa.DateTime(timezone=True), nullable=False),
        sa.Column("price_rupees", sa.Integer, nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("ends_at > starts_at"),
        sa.CheckConstraint("occupied_until >= ends_at"),
        sa.CheckConstraint("price_rupees >= 0"),
        sa.CheckConstraint("char_length(trim(customer_name)) BETWEEN 1 AND 100"),
        sa.CheckConstraint("mobile ~ '^[0-9]{10}$'"),
        schema=SCHEMA,
    )
    op.create_index(
        "ix_bookings_stylist_start", "bookings", ["stylist_id", "starts_at"], schema=SCHEMA,
    )
    op.create_table(
        "seed_versions",
        sa.Column("version", sa.String(80), primary_key=True),
        schema=SCHEMA,
    )
    for table in ("services", "stylists", "bookings", "seed_versions"):
        op.execute(f"ALTER TABLE salon.{table} ENABLE ROW LEVEL SECURITY")
    # No browser/API roles should access these tables. The Python DB owner can bypass RLS.
    op.execute("REVOKE ALL ON SCHEMA salon FROM PUBLIC")


def downgrade():
    for table in ("seed_versions", "bookings", "stylists", "services"):
        op.drop_table(table, schema=SCHEMA)
