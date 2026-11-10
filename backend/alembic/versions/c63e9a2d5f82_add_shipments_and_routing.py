"""add shipments, route changes and trip routing fields

Revision ID: c63e9a2d5f82
Revises: b52d8f1c4e71
Create Date: 2026-11-04 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'c63e9a2d5f82'
down_revision = 'b52d8f1c4e71'
branch_labels = None
depends_on = None


def upgrade():
    # Chosen route and timing on trips (all optional, so existing trips stay valid)
    op.add_column('trips', sa.Column('route_type', sa.String(length=20), nullable=True))
    op.add_column('trips', sa.Column('route_geometry', sa.Text(), nullable=True))
    op.add_column('trips', sa.Column('route_duration_min', sa.Float(), nullable=True))
    op.add_column('trips', sa.Column('planned_eta', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('eta', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('delay_minutes', sa.Float(), server_default='0', nullable=False))

    op.create_table('shipments',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('code', sa.String(length=20), nullable=False),
    sa.Column('origin', sa.String(length=120), nullable=False),
    sa.Column('destination', sa.String(length=120), nullable=False),
    sa.Column('description', sa.String(length=200), nullable=False),
    sa.Column('weight_kg', sa.Float(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=True),
    sa.Column('eta', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('delivered_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('code')
    )
    op.create_index(op.f('ix_shipments_id'), 'shipments', ['id'], unique=False)
    op.create_index(op.f('ix_shipments_status'), 'shipments', ['status'], unique=False)
    op.create_index(op.f('ix_shipments_trip_id'), 'shipments', ['trip_id'], unique=False)

    op.create_table('shipment_history',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('shipment_id', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('note', sa.String(length=200), nullable=False),
    sa.Column('changed_by', sa.String(length=50), nullable=True),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['shipment_id'], ['shipments.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_shipment_history_shipment_id'), 'shipment_history', ['shipment_id'], unique=False)

    op.create_table('route_changes',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('trip_id', sa.Integer(), nullable=False),
    sa.Column('old_route_type', sa.String(length=20), nullable=True),
    sa.Column('new_route_type', sa.String(length=20), nullable=True),
    sa.Column('old_duration_min', sa.Float(), nullable=True),
    sa.Column('new_duration_min', sa.Float(), nullable=True),
    sa.Column('reason', sa.String(length=200), nullable=False),
    sa.Column('changed_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['trip_id'], ['trips.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_route_changes_trip_id'), 'route_changes', ['trip_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_route_changes_trip_id'), table_name='route_changes')
    op.drop_table('route_changes')
    op.drop_index(op.f('ix_shipment_history_shipment_id'), table_name='shipment_history')
    op.drop_table('shipment_history')
    op.drop_index(op.f('ix_shipments_trip_id'), table_name='shipments')
    op.drop_index(op.f('ix_shipments_status'), table_name='shipments')
    op.drop_index(op.f('ix_shipments_id'), table_name='shipments')
    op.drop_table('shipments')
    op.drop_column('trips', 'delay_minutes')
    op.drop_column('trips', 'eta')
    op.drop_column('trips', 'planned_eta')
    op.drop_column('trips', 'route_duration_min')
    op.drop_column('trips', 'route_geometry')
    op.drop_column('trips', 'route_type')
