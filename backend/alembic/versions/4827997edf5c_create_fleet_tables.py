"""create fleet tables

Revision ID: 4827997edf5c
Revises: 
Create Date: 2026-10-13 21:20:43.738020

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '4827997edf5c'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("role", sa.String(50), nullable=False, server_default="Driver"),
    )

    op.create_table(
        "drivers",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("full_name", sa.String(100), nullable=False),
        sa.Column("phone", sa.String(20), nullable=False, unique=True),
        sa.Column("license_number", sa.String(50), nullable=False, unique=True),
        sa.Column("status", sa.String(30), server_default="Available"),
    )

    op.create_table(
        "vehicles",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("vehicle_number", sa.String(30), nullable=False, unique=True),
        sa.Column("vehicle_type", sa.String(50), nullable=False),
        sa.Column("capacity", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(30), server_default="Active"),
        sa.Column(
            "driver_id",
            sa.Integer(),
            sa.ForeignKey("drivers.id"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_table("vehicles")
    op.drop_table("drivers")
    op.drop_table("users")