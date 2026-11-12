"""add persisted fuel logs

Revision ID: 71b3e0a4c2d9
Revises: d41f2a9c8b17
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "71b3e0a4c2d9"
down_revision: Union[str, Sequence[str], None] = "d41f2a9c8b17"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "fuel_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("logged_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("odometer_km", sa.Numeric(12, 2), nullable=False),
        sa.Column("liters", sa.Numeric(10, 3), nullable=False),
        sa.Column("total_cost", sa.Numeric(12, 2), nullable=False),
        sa.Column("is_full_tank", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_fuel_logs_vehicle_id", "fuel_logs", ["vehicle_id"])
    op.create_index("ix_fuel_logs_logged_at", "fuel_logs", ["logged_at"])


def downgrade() -> None:
    op.drop_index("ix_fuel_logs_logged_at", table_name="fuel_logs")
    op.drop_index("ix_fuel_logs_vehicle_id", table_name="fuel_logs")
    op.drop_table("fuel_logs")
