"""add trip ETA fields

Revision ID: 9106a673c71b
Revises: ad7f7cc5e968
Create Date: 2026-10-26 17:39:03.824112

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '9106a673c71b'
down_revision: Union[str, Sequence[str], None] = 'ad7f7cc5e968'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.add_column(
        "trips",
        sa.Column("estimated_duration_minutes", sa.Float(), nullable=True),
    )
    op.add_column(
        "trips",
        sa.Column(
            "estimated_arrival_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("trips", "estimated_arrival_at")
    op.drop_column("trips", "estimated_duration_minutes")
