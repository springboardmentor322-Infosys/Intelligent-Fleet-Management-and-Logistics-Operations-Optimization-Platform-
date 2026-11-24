
import hashlib
import os
import secrets
import smtplib

from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.dependencies import get_db
from app.models.user import User
from app.models.password_reset_token import PasswordResetToken


router = APIRouter(prefix="/auth", tags=["Password Reset"])

OTP_MINUTES = 10
MAX_OTP_ATTEMPTS = 5


class PasswordResetRequest(BaseModel):
    email: EmailStr



class PasswordResetConfirm(BaseModel):
    email: EmailStr
    token: str = Field(pattern=r"^\d{6}$")
    new_password: str = Field(min_length=8, max_length=128)



def hash_reset_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def send_otp_email(recipient: str, otp: str) -> None:
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")

    if not smtp_username or not smtp_password:
        raise RuntimeError("SMTP credentials are not configured.")

    message = EmailMessage()
    message["Subject"] = "FleetFlow Password Reset OTP"
    message["From"] = smtp_username
    message["To"] = recipient
    message.set_content(
        f"""Hello,

Your FleetFlow password-reset OTP is: {otp}

This OTP expires in {OTP_MINUTES} minutes and can only be used once.
You have a maximum of {MAX_OTP_ATTEMPTS} verification attempts.

If you did not request a password reset, you can ignore this email.

FleetFlow Support
"""
    )

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(smtp_username, smtp_password)
        server.send_message(message)


@router.post("/forgot-password")
def forgot_password(
    request: PasswordResetRequest,
    db: Session = Depends(get_db),
):
    response = {
        "message": (
            "If an eligible account exists, a password-reset OTP "
            "will be sent to its registered email address."
        )
    }

    user = db.query(User).filter(User.email == request.email).first()

    if user is None or not user.is_active or user.approval_status != "approved":
        return response

    now = datetime.now(timezone.utc)

    # Invalidate previous unused reset codes.
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .update(
            {PasswordResetToken.used_at: now},
            synchronize_session=False,
        )
    )

    otp = f"{secrets.randbelow(1_000_000):06d}"

    reset_record = PasswordResetToken(
        user_id=user.id,
        token_hash=hash_reset_token(otp),
        expires_at=now + timedelta(minutes=OTP_MINUTES),
        attempts=0,
    )

    db.add(reset_record)
    db.commit()

    try:
        send_otp_email(user.email, otp)
    except Exception:
        # Invalidate the code if email delivery fails.
        reset_record.used_at = datetime.now(timezone.utc)
        db.commit()
        raise HTTPException(
            status_code=503,
            detail=(
                "Unable to send the reset email right now. "
                "Check the email configuration and try again."
            ),
        )

    return response



@router.post("/reset-password")
def reset_password(
    request: PasswordResetConfirm,
    db: Session = Depends(get_db),
):
    now = datetime.now(timezone.utc)

    user = db.query(User).filter(User.email == request.email).first()

    if (
        user is None
        or not user.is_active
        or user.approval_status != "approved"
    ):
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP. Request a new code.",
        )

    # Find the latest unused reset request for this user.
    reset_record = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        )
        .order_by(PasswordResetToken.created_at.desc())
        .first()
    )

    if reset_record is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP. Request a new code.",
        )

    expires_at = reset_record.expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at <= now:
        reset_record.used_at = now
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired OTP. Request a new code.",
        )

    if reset_record.attempts >= MAX_OTP_ATTEMPTS:
        reset_record.used_at = now
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many incorrect attempts. Request a new OTP.",
        )

    reset_record.attempts += 1

    submitted_hash = hash_reset_token(request.token)

    if not secrets.compare_digest(
        reset_record.token_hash,
        submitted_hash,
    ):
        if reset_record.attempts >= MAX_OTP_ATTEMPTS:
            reset_record.used_at = now

        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Invalid OTP. Please try again or request a new code.",
        )

    user.hashed_password = hash_password(request.new_password)
    reset_record.used_at = now

    # Invalidate any other outstanding reset requests for this user.
    (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.id != reset_record.id,
            PasswordResetToken.used_at.is_(None),
        )
        .update(
            {PasswordResetToken.used_at: now},
            synchronize_session=False,
        )
    )

    db.commit()

    return {
        "message": "Password reset successfully. You can now log in."
    }
