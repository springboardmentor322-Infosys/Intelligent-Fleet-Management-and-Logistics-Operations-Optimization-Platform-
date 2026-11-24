"""add maintenance records table

Revision ID: 5f960615e935
Revises: e9f726be3adb
Create Date: 2026-11-20 18:48:11.314728

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5f960615e935'
down_revision: Union[str, Sequence[str], None] = 'e9f726be3adb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'maintenance_records',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('vehicle_id', sa.Integer(), nullable=False),
        sa.Column('category', sa.String(length=50), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('scheduled_date', sa.Date(), nullable=False),
        sa.Column('service_centre', sa.String(length=150), nullable=False),
        sa.Column('estimated_cost', sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column('status', sa.String(length=30), nullable=False),
        sa.Column('completed_date', sa.Date(), nullable=True),
        sa.Column('replacement_parts', sa.Text(), nullable=True),
        sa.Column('actual_cost', sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id']),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_maintenance_records_id'), 'maintenance_records', ['id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_maintenance_records_id'), table_name='maintenance_records')
    op.drop_table('maintenance_records')