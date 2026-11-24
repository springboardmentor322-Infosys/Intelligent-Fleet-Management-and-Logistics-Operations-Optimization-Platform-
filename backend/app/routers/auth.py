from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.auth import create_access_token
from app.core.security import verify_password
from app.db.dependencies import get_db
from app.models.user import User

router = APIRouter(
    prefix="/auth",
    tags=["Authentication"],
)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


@router.post("/login", response_model=TokenResponse)
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    user = (
        db.query(User)
        .filter(User.email == form_data.username)
        .first()
    )

    
    if (
        user is None
        or not verify_password(form_data.password, user.hashed_password)
        or not user.is_active
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if user.approval_status != "approved":
        if user.approval_status == "pending":
            detail = (
                "Your account is awaiting Administrator approval."
            )
        else:
            detail = (
                "Your account has not been approved. "
                "Please contact the Administrator."
            )

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=detail,
        )


    role = user.role.value if hasattr(user.role, "value") else user.role

    access_token = create_access_token(
    user_id=user.id,
    role=role,
    email=user.email,
)

    return {
        "access_token": access_token,
        "token_type": "bearer",
    }