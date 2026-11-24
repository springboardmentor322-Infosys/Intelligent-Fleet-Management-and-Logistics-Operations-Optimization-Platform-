
"""add vehicle fuel and type details

Revision ID: ad7f7cc5e968
Revises: fc2a09a8a392
"""

from alembic import op
import sqlalchemy as sa


revision = "ad7f7cc5e968"
down_revision = "fc2a09a8a392"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column(
            "vehicle_type",
            sa.String(length=50),
            nullable=False,
            server_default="truck",
        ),
    )
    op.add_column(
        "vehicles",
        sa.Column(
            "fuel_type",
            sa.String(length=30),
            nullable=False,
            server_default="diesel",
        ),
    )
    op.add_column(
        "vehicles",
        sa.Column(
            "fuel_capacity",
            sa.Float(),
            nullable=True,
        ),
    )
    op.add_column(
        "vehicles",
        sa.Column(
            "fuel_efficiency",
            sa.Float(),
            nullable=True,
        ),
    )

    op.alter_column(
        "vehicles",
        "vehicle_type",
        server_default=None,
    )
    op.alter_column(
        "vehicles",
        "fuel_type",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("vehicles", "fuel_efficiency")
    op.drop_column("vehicles", "fuel_capacity")
    op.drop_column("vehicles", "fuel_type")
    op.drop_column("vehicles", "vehicle_type")
