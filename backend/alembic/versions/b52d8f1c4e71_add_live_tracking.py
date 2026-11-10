"""add live tracking

Revision ID: b52d8f1c4e71
Revises: a41c7e2b9d30
Create Date: 2026-11-02 19:10:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'b52d8f1c4e71'
down_revision = 'a41c7e2b9d30'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('vehicles', sa.Column('tracker_key_hash', sa.String(length=64), nullable=True))
    op.add_column('vehicles', sa.Column('last_lat', sa.Float(), nullable=True))
    op.add_column('vehicles', sa.Column('last_lng', sa.Float(), nullable=True))
    op.add_column('vehicles', sa.Column('last_speed_kmh', sa.Float(), nullable=True))
    op.add_column('vehicles', sa.Column('last_heading', sa.Float(), nullable=True))
    op.add_column('vehicles', sa.Column('last_seen', sa.DateTime(timezone=True), nullable=True))
    op.create_unique_constraint('vehicles_tracker_key_hash_key', 'vehicles', ['tracker_key_hash'])

    op.create_table('location_pings',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lng', sa.Float(), nullable=False),
    sa.Column('speed_kmh', sa.Float(), nullable=True),
    sa.Column('heading', sa.Float(), nullable=True),
    sa.Column('recorded_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_location_pings_id'), 'location_pings', ['id'], unique=False)
    op.create_index(op.f('ix_location_pings_vehicle_id'), 'location_pings', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_location_pings_recorded_at'), 'location_pings', ['recorded_at'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_location_pings_recorded_at'), table_name='location_pings')
    op.drop_index(op.f('ix_location_pings_vehicle_id'), table_name='location_pings')
    op.drop_index(op.f('ix_location_pings_id'), table_name='location_pings')
    op.drop_table('location_pings')
    op.drop_constraint('vehicles_tracker_key_hash_key', 'vehicles', type_='unique')
    op.drop_column('vehicles', 'last_seen')
    op.drop_column('vehicles', 'last_heading')
    op.drop_column('vehicles', 'last_speed_kmh')
    op.drop_column('vehicles', 'last_lng')
    op.drop_column('vehicles', 'last_lat')
    op.drop_column('vehicles', 'tracker_key_hash')
