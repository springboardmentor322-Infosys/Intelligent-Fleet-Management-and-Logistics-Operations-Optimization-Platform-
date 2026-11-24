import os

from dotenv import load_dotenv

load_dotenv()

SHARED_DRIVER_EMAIL = os.getenv(
    "SHARED_DRIVER_EMAIL",
    "driver@gmail.com",
).strip().lower()

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing from the .env file")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30