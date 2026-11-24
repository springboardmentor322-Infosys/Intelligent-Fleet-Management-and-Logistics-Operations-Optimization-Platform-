from sqlalchemy import inspect, text
from database import engine

try:
    with engine.begin() as connection:
        inspector = inspect(connection)
        existing_columns = {
            column["name"]
            for column in inspector.get_columns("vehicles")
        }

        if "speed" not in existing_columns:
            connection.execute(
                text("ALTER TABLE vehicles ADD COLUMN speed FLOAT")
            )
            print("Added speed column")

        if "location_updated_at" not in existing_columns:
            connection.execute(
                text(
                    "ALTER TABLE vehicles "
                    "ADD COLUMN location_updated_at TIMESTAMP WITH TIME ZONE"
                )
            )
            print("Added location_updated_at column")

    print("GPS database migration completed successfully.")

except Exception as error:
    print("Migration failed:", error)