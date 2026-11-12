"""add physical GPS device mapping and telemetry fields

Revision ID: b901d6a4c812
Revises: f82b9d31a540
"""
from alembic import op
import sqlalchemy as sa

revision = "b901d6a4c812"
down_revision = "f82b9d31a540"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("vehicles", sa.Column("gps_device_id", sa.String(length=100), nullable=True))
    op.create_unique_constraint("uq_vehicles_gps_device_id", "vehicles", ["gps_device_id"])
    op.add_column("gps_locations", sa.Column("heading_degrees", sa.Numeric(6, 2), nullable=True))
    op.add_column("gps_locations", sa.Column("device_id", sa.String(length=100), nullable=True))
    op.add_column("gps_locations", sa.Column("device_connected", sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column("gps_locations", "device_connected")
    op.drop_column("gps_locations", "device_id")
    op.drop_column("gps_locations", "heading_degrees")
    op.drop_constraint("uq_vehicles_gps_device_id", "vehicles", type_="unique")
    op.drop_column("vehicles", "gps_device_id")
