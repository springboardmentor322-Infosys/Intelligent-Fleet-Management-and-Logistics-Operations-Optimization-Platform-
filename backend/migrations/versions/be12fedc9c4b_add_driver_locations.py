
"""add driver locations

Revision ID: be12fedc9c4b
Revises: 0c613761dc9b
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "be12fedc9c4b"
down_revision: Union[str, None] = "0c613761dc9b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "driver_locations",
        sa.Column("id", sa.Integer(), primary_key=True, nullable=False),
        sa.Column(
            "driver_id",
            sa.Integer(),
            sa.ForeignKey("drivers.id"),
            nullable=False,
        ),
        sa.Column("latitude", sa.Float(), nullable=False),
        sa.Column("longitude", sa.Float(), nullable=False),
        sa.Column("accuracy", sa.Float(), nullable=True),
        sa.Column(
    "updated_at",
    sa.DateTime(timezone=True),
    nullable=False,
),
        sa.UniqueConstraint("driver_id"),
    )

    op.create_index(
        "ix_driver_locations_id",
        "driver_locations",
        ["id"],
    )
    op.create_index(
        "ix_driver_locations_driver_id",
        "driver_locations",
        ["driver_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_driver_locations_driver_id",
        table_name="driver_locations",
    )
    op.drop_index(
        "ix_driver_locations_id",
        table_name="driver_locations",
    )
    op.drop_table("driver_locations")
