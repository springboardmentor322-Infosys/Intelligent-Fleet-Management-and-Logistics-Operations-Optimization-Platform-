"""add vehicle GPS coordinates

Revision ID: e9f726be3adb
Revises: f009b9e0d022
Create Date: 2026-10-28 13:48:34.930793

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e9f726be3adb'
down_revision: Union[str, Sequence[str], None] = 'f009b9e0d022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "vehicles",
        sa.Column("latitude", sa.Float(), nullable=True)
    )
    op.add_column(
        "vehicles",
        sa.Column("longitude", sa.Float(), nullable=True)
    )

def downgrade() -> None:
    op.drop_column("vehicles", "longitude")
    op.drop_column("vehicles", "latitude")