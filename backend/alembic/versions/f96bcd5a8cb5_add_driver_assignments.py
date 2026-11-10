"""add driver assignments

Revision ID: f96bcd5a8cb5
Revises: e85abc4f7ba4
Create Date: 2026-11-07 14:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'f96bcd5a8cb5'
down_revision = 'e85abc4f7ba4'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('driver_assignments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('driver_id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('assigned_by_id', sa.Integer(), nullable=True),
    sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['assigned_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_driver_assignments_trip_id'), 'driver_assignments', ['trip_id'], unique=False)
    op.create_index(op.f('ix_driver_assignments_driver_id'), 'driver_assignments', ['driver_id'], unique=False)
    op.create_index(op.f('ix_driver_assignments_vehicle_id'), 'driver_assignments', ['vehicle_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_driver_assignments_vehicle_id'), table_name='driver_assignments')
    op.drop_index(op.f('ix_driver_assignments_driver_id'), table_name='driver_assignments')
    op.drop_index(op.f('ix_driver_assignments_trip_id'), table_name='driver_assignments')
    op.drop_table('driver_assignments')
