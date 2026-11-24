from getpass import getpass

from database import SessionLocal
from models import User
from auth import hash_password


db = SessionLocal()

try:
    email = input("Enter existing administrator email: ").strip().lower()

    user = (
        db.query(User)
        .filter(User.email == email)
        .first()
    )

    if user is None:
        print("No account found with this email.")
    else:
        print("Current role:", user.role)

        if user.role != "Administrator":
            print("This account is not an administrator.")
            print("No changes were made.")
        else:
            password = getpass(
                "Enter new administrator password (minimum 8 characters): "
            )

            if len(password) < 8:
                print("Password must contain at least 8 characters.")
            else:
                confirm_password = getpass("Confirm new password: ")

                if password != confirm_password:
                    print("Passwords do not match.")
                else:
                    user.hashed_password = hash_password(password)
                    db.commit()

                    print("Administrator password updated successfully.")

except Exception as error:
    db.rollback()
    print("Error:", error)

finally:
    db.close()