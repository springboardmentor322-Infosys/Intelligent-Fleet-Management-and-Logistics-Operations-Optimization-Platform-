from getpass import getpass
from sqlalchemy import select
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.user import User

email = input("Administrator email: ").strip().lower()
full_name = input("Administrator full name: ").strip()
password = getpass("Choose administrator password: ")
confirm = getpass("Confirm password: ")

if not email or not full_name:
    raise SystemExit("Email and name are required.")
if password != confirm:
    raise SystemExit("Passwords do not match.")
if len(password) < 12:
    raise SystemExit("Use a password with at least 12 characters.")

db = SessionLocal()
try:
    existing = db.scalar(select(User).where(User.email == email))
    if existing:
        raise SystemExit(
            f"That email already exists with role '{existing.role}'. "
            "No account was changed."
        )

    admin = User(
        email=email,
        full_name=full_name,
        password_hash=hash_password(password),
        role="administrator",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    print(f"Administrator account created successfully for {email}.")
except Exception:
    db.rollback()
    raise
finally:
    db.close()
