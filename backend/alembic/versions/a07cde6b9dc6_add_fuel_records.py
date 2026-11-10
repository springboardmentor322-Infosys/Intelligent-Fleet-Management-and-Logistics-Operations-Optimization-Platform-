"""add fuel records

Revision ID: a07cde6b9dc6
Revises: f96bcd5a8cb5
Create Date: 2026-11-07 16:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'a07cde6b9dc6'
down_revision = 'f96bcd5a8cb5'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table('fuel_records',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('vehicle_id', sa.Integer(), nullable=False),
    sa.Column('fuel_type', sa.String(length=30), nullable=False),
    sa.Column('quantity_litres', sa.Float(), nullable=False),
    sa.Column('price_per_litre', sa.Float(), nullable=False),
    sa.Column('total_cost', sa.Float(), nullable=False),
    sa.Column('fueled_on', sa.Date(), nullable=False),
    sa.Column('created_by_id', sa.Integer(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.CheckConstraint('quantity_litres > 0', name='ck_fuel_quantity'),
    sa.CheckConstraint('price_per_litre >= 0', name='ck_fuel_price'),
    sa.CheckConstraint('total_cost >= 0', name='ck_fuel_total'),
    sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ),
    sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_fuel_records_vehicle_id'), 'fuel_records', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_fuel_records_fueled_on'), 'fuel_records', ['fueled_on'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_fuel_records_fueled_on'), table_name='fuel_records')
    op.drop_index(op.f('ix_fuel_records_vehicle_id'), table_name='fuel_records')
    op.drop_table('fuel_records')
