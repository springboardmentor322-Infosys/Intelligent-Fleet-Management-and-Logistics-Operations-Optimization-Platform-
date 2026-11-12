"""add shipment status history

Revision ID: d41f2a9c8b17
Revises: bc50a4dd710f
Create Date: 2026-10-20
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d41f2a9c8b17"
down_revision: Union[str, Sequence[str], None] = "bc50a4dd710f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "shipment_status_history",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "shipment_id",
            sa.Integer(),
            sa.ForeignKey("shipments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("previous_status", sa.String(length=30), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column(
            "changed_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("changed_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index(
        "ix_shipment_status_history_shipment_id",
        "shipment_status_history",
        ["shipment_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_shipment_status_history_shipment_id",
        table_name="shipment_status_history",
    )
    op.drop_table("shipment_status_history")
