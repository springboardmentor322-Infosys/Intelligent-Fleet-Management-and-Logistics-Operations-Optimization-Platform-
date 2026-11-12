"""create maintenance records

Revision ID: bc50a4dd710f
Revises: a429081f5ea8
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "bc50a4dd710f"
down_revision: Union[str, Sequence[str], None] = "a429081f5ea8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "maintenance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("service_type", sa.String(length=80), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("service_date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cost", sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column("next_due_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", sa.String(length=20), server_default="completed", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_maintenance_records_vehicle_id", "maintenance_records", ["vehicle_id"])


def downgrade() -> None:
    op.drop_index("ix_maintenance_records_vehicle_id", table_name="maintenance_records")
    op.drop_table("maintenance_records")
