from sqlalchemy import create_engine, text

DATABASE_URL = "postgresql://postgres:Chandana%406148@localhost:5432/fleetflow"

engine = create_engine(DATABASE_URL)

try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database()"))
        print("Connected successfully!")
        print("Database:", result.scalar())
except Exception as e:
    print("Connection failed:", e)