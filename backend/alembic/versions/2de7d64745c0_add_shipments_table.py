from alembic import op
import sqlalchemy as sa

revision = "2de7d64745c0"
down_revision = "4827997edf5c"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "shipments",
        sa.Column("id", sa.Integer(), primary_key=True, index=True),
        sa.Column("shipment_number", sa.String(50), nullable=False, unique=True),
        sa.Column("pickup_location", sa.String(200), nullable=False),
        sa.Column("delivery_location", sa.String(200), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("vehicle_id", sa.Integer(), sa.ForeignKey("vehicles.id"), nullable=True),
        sa.Column("driver_id", sa.Integer(), sa.ForeignKey("drivers.id"), nullable=True),
    )


def downgrade():
    op.drop_table("shipments")