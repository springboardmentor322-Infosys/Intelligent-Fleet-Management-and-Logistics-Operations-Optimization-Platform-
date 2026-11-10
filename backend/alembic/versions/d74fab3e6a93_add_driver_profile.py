"""add driver profile fields and driver documents

Revision ID: d74fab3e6a93
Revises: c63e9a2d5f82
Create Date: 2026-11-07 10:00:00.000000
"""
from alembic import op
import sqlalchemy as sa


revision = 'd74fab3e6a93'
down_revision = 'c63e9a2d5f82'
branch_labels = None
depends_on = None


def upgrade():
    # All new driver columns are optional, so existing drivers stay valid.
    op.add_column('drivers', sa.Column('user_id', sa.Integer(), nullable=True))
    op.add_column('drivers', sa.Column('email', sa.String(length=120), nullable=True))
    op.add_column('drivers', sa.Column('photo_name', sa.String(length=64), nullable=True))
    op.add_column('drivers', sa.Column('license_expiry', sa.Date(), nullable=True))
    # One login belongs to at most one driver (several NULLs are allowed).
    op.create_unique_constraint('uq_drivers_user_id', 'drivers', ['user_id'])
    op.create_foreign_key('fk_drivers_user_id', 'drivers', 'users', ['user_id'], ['id'])

    op.create_table('driver_documents',
    sa.Column('id', sa.Integer(), nullable=False),
    sa.Column('driver_id', sa.Integer(), nullable=False),
    sa.Column('doc_type', sa.String(length=30), nullable=False),
    sa.Column('original_name', sa.String(length=200), nullable=False),
    sa.Column('stored_name', sa.String(length=64), nullable=False),
    sa.Column('content_type', sa.String(length=100), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('verified', sa.Boolean(), server_default=sa.false(), nullable=False),
    sa.Column('verified_by', sa.String(length=50), nullable=True),
    sa.Column('verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['driver_id'], ['drivers.id'], ),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('stored_name')
    )
    op.create_index(op.f('ix_driver_documents_driver_id'), 'driver_documents', ['driver_id'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_driver_documents_driver_id'), table_name='driver_documents')
    op.drop_table('driver_documents')
    op.drop_constraint('fk_drivers_user_id', 'drivers', type_='foreignkey')
    op.drop_constraint('uq_drivers_user_id', 'drivers', type_='unique')
    op.drop_column('drivers', 'license_expiry')
    op.drop_column('drivers', 'photo_name')
    op.drop_column('drivers', 'email')
    op.drop_column('drivers', 'user_id')
