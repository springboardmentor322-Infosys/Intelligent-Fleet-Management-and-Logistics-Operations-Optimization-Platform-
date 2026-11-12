"""add trips, location telemetry and ETA history

Revision ID: e5c7a4b9120d
Revises: c0fe571b4e33
"""
from alembic import op
import sqlalchemy as sa

revision = "e5c7a4b9120d"
down_revision = "c0fe571b4e33"
branch_labels = None
depends_on = None

def upgrade():
    op.create_table("trips",
      sa.Column("id",sa.Integer(),primary_key=True),
      sa.Column("vehicle_id",sa.Integer(),sa.ForeignKey("vehicles.id"),nullable=False),
      sa.Column("driver_id",sa.Integer(),sa.ForeignKey("drivers.id"),nullable=False),
      sa.Column("origin",sa.String(255),nullable=False),sa.Column("destination",sa.String(255),nullable=False),
      sa.Column("route_selection",sa.String(20),nullable=False,server_default="fastest"),
      sa.Column("route_distance_km",sa.Numeric(10,2)),sa.Column("route_duration_minutes",sa.Numeric(10,2)),
      sa.Column("route_provider",sa.String(50)),sa.Column("traffic_data",sa.String(30),nullable=False,server_default="unavailable"),
      sa.Column("scheduled_departure",sa.DateTime(timezone=True),nullable=False),sa.Column("estimated_arrival",sa.DateTime(timezone=True)),
      sa.Column("actual_departure",sa.DateTime(timezone=True)),sa.Column("actual_arrival",sa.DateTime(timezone=True)),
      sa.Column("status",sa.String(20),nullable=False,server_default="scheduled"))
    op.create_index("ix_trips_vehicle_id","trips",["vehicle_id"]); op.create_index("ix_trips_driver_id","trips",["driver_id"]); op.create_index("ix_trips_scheduled_departure","trips",["scheduled_departure"])
    op.add_column("shipments",sa.Column("trip_id",sa.Integer(),sa.ForeignKey("trips.id"),nullable=True)); op.create_index("ix_shipments_trip_id","shipments",["trip_id"])
    op.add_column("shipments",sa.Column("actual_arrival",sa.DateTime(timezone=True),nullable=True))
    op.create_table("trip_route_history",sa.Column("id",sa.Integer(),primary_key=True),sa.Column("trip_id",sa.Integer(),sa.ForeignKey("trips.id",ondelete="CASCADE"),nullable=False),sa.Column("route_selection",sa.String(20),nullable=False),sa.Column("distance_km",sa.Numeric(10,2)),sa.Column("duration_minutes",sa.Numeric(10,2)),sa.Column("provider",sa.String(50)),sa.Column("changed_at",sa.DateTime(timezone=True),nullable=False))
    op.create_index("ix_trip_route_history_trip_id","trip_route_history",["trip_id"])
    op.create_table("shipment_eta_history",sa.Column("id",sa.Integer(),primary_key=True),sa.Column("shipment_id",sa.Integer(),sa.ForeignKey("shipments.id",ondelete="CASCADE"),nullable=False),sa.Column("estimated_arrival",sa.DateTime(timezone=True),nullable=False),sa.Column("source",sa.String(50),nullable=False),sa.Column("created_at",sa.DateTime(timezone=True),nullable=False))
    op.create_index("ix_shipment_eta_history_shipment_id","shipment_eta_history",["shipment_id"])
    op.add_column("gps_locations",sa.Column("speed_kph",sa.Numeric(7,2),nullable=True))
    op.add_column("gps_locations",sa.Column("source",sa.String(20),nullable=False,server_default="unknown"))

def downgrade():
    op.drop_column("gps_locations","source"); op.drop_column("gps_locations","speed_kph")
    op.drop_index("ix_shipment_eta_history_shipment_id",table_name="shipment_eta_history"); op.drop_table("shipment_eta_history")
    op.drop_index("ix_trip_route_history_trip_id",table_name="trip_route_history"); op.drop_table("trip_route_history")
    op.drop_column("shipments","actual_arrival"); op.drop_index("ix_shipments_trip_id",table_name="shipments"); op.drop_column("shipments","trip_id")
    op.drop_index("ix_trips_scheduled_departure",table_name="trips"); op.drop_index("ix_trips_driver_id",table_name="trips"); op.drop_index("ix_trips_vehicle_id",table_name="trips"); op.drop_table("trips")
