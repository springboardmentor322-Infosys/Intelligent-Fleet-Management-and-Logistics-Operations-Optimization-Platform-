"""add selected route fields to trips

Revision ID: edf3eb36368a
Revises: 9106a673c71b
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "edf3eb36368a"
down_revision: Union[str, Sequence[str], None] = "9106a673c71b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "trips",
        sa.Column("selected_route_id", sa.Integer(), nullable=True),
    )
    op.add_column(
        "trips",
        sa.Column("selected_route_distance_km", sa.Float(), nullable=True),
    )
    op.add_column(
        "trips",
        sa.Column("selected_route_coordinates", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("trips", "selected_route_coordinates")
    op.drop_column("trips", "selected_route_distance_km")
    op.drop_column("trips", "selected_route_id")
