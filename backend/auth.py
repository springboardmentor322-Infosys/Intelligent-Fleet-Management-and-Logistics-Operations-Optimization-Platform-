from datetime import datetime, timedelta, timezone
from jose import jwt
from passlib.context import CryptContext
import os
from dotenv import load_dotenv

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY")

if not SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY is missing from the .env file")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

password_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)


def hash_password(password: str) -> str:
    return password_context.hash(password)


def verify_password(
    plain_password: str,
    hashed_password: str
) -> bool:
    return password_context.verify(
        plain_password,
        hashed_password
    )


def create_access_token(data: dict) -> str:
    token_data = data.copy()

    expire = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    token_data.update({"exp": expire})

    return jwt.encode(
        token_data,
        SECRET_KEY,
        algorithm=ALGORITHM
    )
def authenticate_user(email: str, password: str, db):
    from models import User

    user = db.query(User).filter(User.email == email).first()

    if user is None:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    return user