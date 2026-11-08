
"""add user id to drivers

Revision ID: b63978bea61b
Revises: 9132ebe84145
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b63978bea61b'
down_revision: Union[str, Sequence[str], None] = '9132ebe84145'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'drivers',
        sa.Column('user_id', sa.Integer(), nullable=True)
    )

    op.create_unique_constraint(
        'uq_drivers_user_id',
        'drivers',
        ['user_id']
    )

    op.create_foreign_key(
        'fk_drivers_user_id_users',
        'drivers',
        'users',
        ['user_id'],
        ['id']
    )


def downgrade() -> None:
    op.drop_constraint(
        'fk_drivers_user_id_users',
        'drivers',
        type_='foreignkey'
    )

    op.drop_constraint(
        'uq_drivers_user_id',
        'drivers',
        type_='unique'
    )

    op.drop_column('drivers', 'user_id')
