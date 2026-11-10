"""add trips

Revision ID: a41c7e2b9d30
Revises: 703f310d15a8
Create Date: 2026-10-30 18:40:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a41c7e2b9d30'
down_revision = '703f310d15a8'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('trips',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('driver_id', sa.Integer(), nullable=False),
    sa.Column('origin', sa.String(length=120), nullable=False),
    sa.Column('destination', sa.String(length=120), nullable=False),
    sa.Column('cargo_description', sa.String(length=200), nullable=True),
    sa.Column('cargo_weight', sa.Float(), nullable=False),
    sa.Column('scheduled_start', sa.DateTime(timezone=True), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('distance_km', sa.Float(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_trips_id'), 'trips', ['id'], unique=False)
    op.create_index(op.f('ix_trips_vehicle_id'), 'trips', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_trips_driver_id'), 'trips', ['driver_id'], unique=False)
    op.create_index(op.f('ix_trips_status'), 'trips', ['status'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_trips_status'), table_name='trips')
    op.drop_index(op.f('ix_trips_driver_id'), table_name='trips')
    op.drop_index(op.f('ix_trips_vehicle_id'), table_name='trips')
    op.drop_index(op.f('ix_trips_id'), table_name='trips')
    op.drop_table('trips')
