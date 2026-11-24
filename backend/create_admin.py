from getpass import getpass

from sqlalchemy.exc import IntegrityError

from app.core.security import hash_password
from app.db.database import SessionLocal
from app.models.user import User
from app.schemas.user import UserRole


def create_admin():
    full_name = input("Administrator name: ").strip()
    email = input("Administrator email: ").strip().lower()
    password = getpass("Administrator password (minimum 8 characters): ")
    confirm_password = getpass("Confirm password: ")

    if not full_name or not email:
        print("Name and email cannot be empty.")
        return

    if len(password) < 8:
        print("Password must contain at least 8 characters.")
        return

    if password != confirm_password:
        print("Passwords do not match.")
        return

    db = SessionLocal()

    try:
        existing_user = (
            db.query(User)
            .filter(User.email == email)
            .first()
        )

        if existing_user:
            print("A user with this email already exists.")
            return

        admin = User(
            full_name=full_name,
            email=email,
            hashed_password=hash_password(password),
            role=UserRole.ADMINISTRATOR.value,
        )

        db.add(admin)
        db.commit()

        print("Administrator account created successfully.")

    except IntegrityError:
        db.rollback()
        print("Could not create the account because of a database constraint.")

    finally:
        db.close()


if __name__ == "__main__":
    create_admin()