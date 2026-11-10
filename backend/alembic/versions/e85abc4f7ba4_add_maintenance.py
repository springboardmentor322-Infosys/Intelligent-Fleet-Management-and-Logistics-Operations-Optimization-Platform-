"""add maintenance and maintenance alerts

Revision ID: e85abc4f7ba4
Revises: d74fab3e6a93
Create Date: 2026-11-07 12:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'e85abc4f7ba4'
down_revision = 'd74fab3e6a93'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('maintenance',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('category', sa.String(length=30), nullable=False),
    sa.Column('description', sa.String(length=300), nullable=False),
    sa.Column('scheduled_date', sa.Date(), nullable=False),
    sa.Column('service_centre', sa.String(length=120), nullable=False),
    sa.Column('estimated_cost', sa.Float(), nullable=False),
    sa.Column('actual_cost', sa.Float(), nullable=True),
    sa.Column('parts_replaced', sa.String(length=300), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('estimated_cost >= 0', name='ck_maintenance_estimated_cost'),
    sa.CheckConstraint('actual_cost IS NULL OR actual_cost >= 0', name='ck_maintenance_actual_cost'),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_maintenance_id'), 'maintenance', ['id'], unique=False)
    op.create_index(op.f('ix_maintenance_vehicle_id'), 'maintenance', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_maintenance_scheduled_date'), 'maintenance', ['scheduled_date'], unique=False)
    op.create_index(op.f('ix_maintenance_status'), 'maintenance', ['status'], unique=False)

    op.create_table('maintenance_alerts',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('maintenance_id', sa.Integer(), nullable=False),
    sa.Column('category', sa.String(length=20), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('resolved_by', sa.String(length=50), nullable=True),
    sa.ForeignKeyConstraint(['maintenance_id'], ['maintenance.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('maintenance_id')
    )
    op.create_index(op.f('ix_maintenance_alerts_category'), 'maintenance_alerts', ['category'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_maintenance_alerts_category'), table_name='maintenance_alerts')
    op.drop_table('maintenance_alerts')
    op.drop_index(op.f('ix_maintenance_status'), table_name='maintenance')
    op.drop_index(op.f('ix_maintenance_scheduled_date'), table_name='maintenance')
    op.drop_index(op.f('ix_maintenance_vehicle_id'), table_name='maintenance')
    op.drop_index(op.f('ix_maintenance_id'), table_name='maintenance')
    op.drop_table('maintenance')
