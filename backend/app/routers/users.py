
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_roles
from app.core.security import hash_password
from app.db.dependencies import get_db
from app.models.user import User
from app.models.driver import Driver

from app.schemas.user import (
    UserCreate,
    UserResponse,
    UserRole,
    DriverSignup,
    PublicSignup,
)


router = APIRouter(
    prefix="/users",
    tags=["Users"],
)


# Only administrators can view all users.
@router.get("/", response_model=list[UserResponse])
def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMINISTRATOR)
    ),
):
    return db.query(User).order_by(User.id).all()


# Public registration for Drivers, Fleet Managers, and Dispatchers.
# Administrator accounts cannot be created through public signup.
# Public registration for Drivers, Fleet Managers, and Dispatchers.
# Administrator accounts cannot be created through public signup.
@router.post(
    "/",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_user(
    user_data: PublicSignup,
    db: Session = Depends(get_db),
):
    if user_data.role == UserRole.ADMINISTRATOR:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Public Administrator registration is not allowed.",
        )

    if user_data.role not in {
        UserRole.DRIVER,
        UserRole.FLEET_MANAGER,
        UserRole.DISPATCHER,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid role selected.",
        )

    existing_user = (
        db.query(User)
        .filter(User.email == user_data.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    is_driver = user_data.role == UserRole.DRIVER

    # The shared driver account manages standalone profiles.
    is_shared_driver = (
        user_data.email.strip().lower() == "driver@gmail.com"
    )

    # Individual driver registrations must include profile details.
    if is_driver and not is_shared_driver:
        if (
            not user_data.license_number
            or not user_data.license_expiry
            or not user_data.phone_number
        ):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    "Driver registration requires license number, "
                    "license expiry, and phone number."
                ),
            )

    approval_status = "approved" if is_driver else "pending"

    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role.value,
        approval_status=approval_status,
    )

    try:
        db.add(new_user)
        db.flush()

        # Create a linked Driver profile for individual driver accounts.
        # The shared driver account uses standalone profiles instead.
        if is_driver and not is_shared_driver:
            new_driver = Driver(
                user_id=new_user.id,
                full_name=user_data.full_name,
                license_number=user_data.license_number,
                license_expiry=user_data.license_expiry,
                phone_number=user_data.phone_number,
                status="available",
            )

            db.add(new_driver)

        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The account or driver profile could not be created. "
                "The email or license number may already exist."
            ),
        )

    return new_user


# Administrators can create Fleet Managers and Dispatchers directly.
@router.post(
    "/management",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_managed_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMINISTRATOR)
    ),
):
    if user_data.role not in {
        UserRole.FLEET_MANAGER,
        UserRole.DISPATCHER,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "This endpoint can create Fleet Managers "
                "and Dispatchers only."
            ),
        )

    existing_user = (
        db.query(User)
        .filter(User.email == user_data.email)
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    new_user = User(
        full_name=user_data.full_name,
        email=user_data.email,
        hashed_password=hash_password(user_data.password),
        role=user_data.role.value,
        approval_status="approved",
    )

    try:
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The user could not be created because "
                "a database constraint was violated."
            ),
        )

    return new_user

# Administrators can view Fleet Manager and Dispatcher signup requests.
@router.get(
    "/pending",
    response_model=list[UserResponse],
)
def get_pending_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMINISTRATOR)
    ),
):
    return (
        db.query(User)
        .filter(
            User.approval_status == "pending",
            User.role.in_([
                UserRole.FLEET_MANAGER.value,
                UserRole.DISPATCHER.value,
            ]),
        )
        .order_by(User.id)
        .all()
    )


# Administrators can approve or reject pending signup requests.
@router.patch(
    "/{user_id}/approval",
    response_model=UserResponse,
)
def update_user_approval(
    user_id: int,
    decision: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(
        require_roles(UserRole.ADMINISTRATOR)
    ),
):
    if decision not in {"approved", "rejected"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Decision must be 'approved' or 'rejected'.",
        )

    user = (
        db.query(User)
        .filter(User.id == user_id)
        .first()
    )

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found.",
        )

    if user.role not in {
        UserRole.FLEET_MANAGER.value,
        UserRole.DISPATCHER.value,
    }:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Only Fleet Manager and Dispatcher accounts "
                "can be approved or rejected here."
            ),
        )

    if user.approval_status != "pending":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This account does not have a pending request.",
        )

    user.approval_status = decision
    db.commit()
    db.refresh(user)

    return user
