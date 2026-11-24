
"""add OTP verification attempts

Revision ID: 0c613761dc9b
Revises: b20e73207f8d
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0c613761dc9b"
down_revision: Union[str, Sequence[str], None] = "b20e73207f8d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "password_reset_tokens",
        sa.Column(
            "attempts",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )


def downgrade() -> None:
    op.drop_column("password_reset_tokens", "attempts")
