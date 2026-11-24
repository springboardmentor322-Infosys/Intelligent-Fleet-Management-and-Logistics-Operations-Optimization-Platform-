"""add trips table

Revision ID: f009b9e0d022
Revises: 2de7d64745c0
Create Date: 2026-10-27 14:57:32.290828

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f009b9e0d022'
down_revision: Union[str, Sequence[str], None] = '2de7d64745c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("trip_number", sa.String(length=50), nullable=False),
        sa.Column("shipment_id", sa.Integer(), nullable=False),
        sa.Column("vehicle_id", sa.Integer(), nullable=False),
        sa.Column("driver_id", sa.Integer(), nullable=False),
        sa.Column("start_location", sa.String(length=200), nullable=False),
        sa.Column("destination", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.ForeignKeyConstraint(["driver_id"], ["drivers.id"]),
        sa.ForeignKeyConstraint(["shipment_id"], ["shipments.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("trip_number"),
    )
    op.create_index("ix_trips_id", "trips", ["id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_trips_id", table_name="trips")
    op.drop_table("trips")