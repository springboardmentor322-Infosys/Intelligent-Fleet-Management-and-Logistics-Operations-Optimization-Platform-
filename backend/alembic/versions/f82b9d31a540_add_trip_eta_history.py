"""persist trip ETA recalculations

Revision ID: f82b9d31a540
Revises: e5c7a4b9120d
"""
from alembic import op
import sqlalchemy as sa

revision = "f82b9d31a540"
down_revision = "e5c7a4b9120d"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "trip_eta_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("trip_id", sa.Integer(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False),
        sa.Column("estimated_arrival", sa.DateTime(timezone=True), nullable=False),
        sa.Column("remaining_duration_minutes", sa.Numeric(10, 2), nullable=False),
        sa.Column("location_id", sa.Integer(), sa.ForeignKey("gps_locations.id"), nullable=False),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("traffic_data", sa.String(30), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_trip_eta_history_trip_id", "trip_eta_history", ["trip_id"])


def downgrade():
    op.drop_index("ix_trip_eta_history_trip_id", table_name="trip_eta_history")
    op.drop_table("trip_eta_history")
