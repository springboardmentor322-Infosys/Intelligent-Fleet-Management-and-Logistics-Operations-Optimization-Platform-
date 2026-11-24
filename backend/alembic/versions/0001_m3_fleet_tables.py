"""add fleet tables for milestone 3

Revision ID: 0001_m3_fleet_tables
Revises: 5f960615e935
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = "0001_m3_fleet_tables"
down_revision: Union[str, Sequence[str], None] = "5f960615e935"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    inspector = inspect(conn)

    tables = inspector.get_table_names()

    # Add missing columns
    if "vehicles" in tables:
        columns = [c["name"] for c in inspector.get_columns("vehicles")]
        if "fuel_type" not in columns:
            op.add_column(
                "vehicles",
                sa.Column("fuel_type", sa.String(30), nullable=True)
            )

    if "trips" in tables:
        columns = [c["name"] for c in inspector.get_columns("trips")]
        if "distance_km" not in columns:
            op.add_column(
                "trips",
                sa.Column("distance_km", sa.Float(), nullable=True)
            )

    # Create driver_assignments only if missing
    if "driver_assignments" not in tables:
        op.create_table(
            "driver_assignments",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("driver_id", sa.Integer(), nullable=False),
            sa.Column("vehicle_id", sa.Integer(), nullable=False),
            sa.Column("trip_id", sa.Integer(), nullable=False),
            sa.Column("assignment_date", sa.DateTime(timezone=True), nullable=False),
            sa.Column("status", sa.String(30), nullable=False),
            sa.Column("completed_at", sa.DateTime(timezone=True)),
            sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"]),
            sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
            sa.ForeignKeyConstraint(["trip_id"], ["trips.id"]),
        )

    # Create maintenance_alerts only if missing
    if "maintenance_alerts" not in tables:
        op.create_table(
            "maintenance_alerts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("maintenance_id", sa.Integer(), nullable=False),
            sa.Column("alert_type", sa.String(30), nullable=False),
            sa.Column("vehicle_id", sa.Integer(), nullable=False),
            sa.Column("scheduled_date", sa.Date(), nullable=False),
            sa.Column("message", sa.Text(), nullable=False),
            sa.Column("status", sa.String(30), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.ForeignKeyConstraint(
                ["maintenance_id"], ["maintenance_records.id"]
            ),
            sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        )

    # Create fuel_records only if missing
    if "fuel_records" not in tables:
        op.create_table(
            "fuel_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("vehicle_id", sa.Integer(), nullable=False),
            sa.Column("fuel_type", sa.String(30), nullable=False),
            sa.Column("quantity_litres", sa.Float(), nullable=False),
            sa.Column("price_per_litre", sa.Float(), nullable=False),
            sa.Column("total_cost", sa.Numeric(10, 2), nullable=False),
            sa.Column("refuel_date", sa.Date(), nullable=False),
            sa.Column("created_at", sa.DateTime(timezone=True)),
            sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        )


def downgrade() -> None:
    op.drop_table("fuel_records")
    op.drop_table("maintenance_alerts")
    op.drop_table("driver_assignments")
    op.drop_column("trips", "distance_km")
    op.drop_column("vehicles", "fuel_type")