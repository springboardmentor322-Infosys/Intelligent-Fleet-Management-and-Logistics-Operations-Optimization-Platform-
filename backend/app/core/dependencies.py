from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import jwt
from jwt.exceptions import InvalidTokenError
from sqlalchemy.orm import Session
import traceback

from app.core.config import JWT_ALGORITHM, JWT_SECRET_KEY
from app.db.dependencies import get_db
from app.models.user import User
from collections.abc import Callable
from app.schemas.user import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        payload = jwt.decode(
            token,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )

        user_id = payload.get("sub")

        if user_id is None:
            raise credentials_exception

        user_id = int(user_id)

    except (InvalidTokenError, ValueError, TypeError):
        raise credentials_exception from None

    user = db.query(User).filter(User.id == user_id).first()

    if user is None or not user.is_active:
        raise credentials_exception

    return user



def require_roles(*allowed_roles: UserRole) -> Callable:
    print("DEBUG ROLE CHECKER CREATED FOR:", [role.value for role in allowed_roles])
    def role_checker(
        current_user: User = Depends(get_current_user),
    ) -> User:
        user_role = current_user.role

        if hasattr(user_role, "value"):
            user_role = user_role.value

        allowed_values = {
            role.value for role in allowed_roles
        }

        print("DEBUG ROLE CHECK CALL STACK:")
        traceback.print_stack(limit=12)
        print("DEBUG require_roles: user_role =", repr(user_role))
        print("DEBUG require_roles: allowed_values =", repr(allowed_values))

        if user_role not in allowed_values:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action.",
            )

        return current_user

    return role_checker
