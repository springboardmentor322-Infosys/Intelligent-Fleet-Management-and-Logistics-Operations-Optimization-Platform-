from database import SessionLocal
from models import User
from auth import hash_password

db = SessionLocal()

try:
    email = input("Enter administrator email: ").strip().lower()
    password = input("Create administrator password (at least 8 characters): ")

    if len(password) < 8:
        raise ValueError("Password must contain at least 8 characters.")

    existing_user = db.query(User).filter(User.email == email).first()

    if existing_user:
        print("An account with this email already exists.")
        print("No changes were made.")
    else:
        admin = User(
            full_name="FleetFlow Administrator",
            email=email,
            hashed_password=hash_password(password),
            role="Administrator",
        )

        db.add(admin)
        db.commit()

        print("Administrator account created successfully!")
        print("Email:", email)
        print("Role: Administrator")

except Exception as error:
    db.rollback()
    print("Error:", error)

finally:
    db.close()