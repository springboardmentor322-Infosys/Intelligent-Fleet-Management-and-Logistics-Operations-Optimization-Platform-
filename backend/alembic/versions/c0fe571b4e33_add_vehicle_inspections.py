"""add structured vehicle inspections

Revision ID: c0fe571b4e33
Revises: 9c5a6d731e20
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c0fe571b4e33"
down_revision: Union[str, Sequence[str], None] = "9c5a6d731e20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "vehicle_inspections",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("inspector_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(length=80), nullable=False),
        sa.Column("result", sa.String(length=30), nullable=False),
        sa.Column("checklist", sa.JSON(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("inspected_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_vehicle_inspections_vehicle_id", "vehicle_inspections", ["vehicle_id"])


def downgrade() -> None:
    op.drop_index("ix_vehicle_inspections_vehicle_id", table_name="vehicle_inspections")
    op.drop_table("vehicle_inspections")
