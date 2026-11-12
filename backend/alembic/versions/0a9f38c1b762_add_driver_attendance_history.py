"""add driver attendance history

Revision ID: 0a9f38c1b762
Revises: 71b3e0a4c2d9
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0a9f38c1b762"
down_revision: Union[str, Sequence[str], None] = "71b3e0a4c2d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "driver_attendance_records",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("drivers.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("recorded_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )
    op.create_index("ix_driver_attendance_records_driver_id", "driver_attendance_records", ["driver_id"])


def downgrade() -> None:
    op.drop_index("ix_driver_attendance_records_driver_id", table_name="driver_attendance_records")
    op.drop_table("driver_attendance_records")
