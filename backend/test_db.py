
from sqlalchemy import text
from database import engine

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database()"))
        print("Connected successfully!")
        print("Database:", result.scalar())
except Exception as error:
    print("Database connection failed:")
    print(error)
