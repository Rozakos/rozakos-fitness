import hashlib
import html
from datetime import datetime, timezone
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from ..config import get_settings
from ..database import get_db
from ..email_delivery import send_email
from ..models import User
from ..rate_limit import auth_rate_limiter, client_ip
from ..schemas import (
    EmailRequest,
    LoginRequest,
    MessageResponse,
    PasswordResetRequest,
    RegisterRequest,
    RegistrationResponse,
    TokenResponse,
    UserOut,
)
from ..security import (
    create_access_token,
    create_action_token,
    decode_action_token,
    get_current_user,
    hash_password,
    password_fingerprint,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _verification_email(user: User) -> None:
    token = create_action_token(
        user.id,
        "verify-email",
        expires_minutes=24 * 60,
        fingerprint=hashlib.sha256(user.email.encode()).hexdigest(),
    )
    url = f"{settings.public_base_url.rstrip('/')}/auth/verify-email?token={quote(token)}"
    name = html.escape(user.display_name)
    send_email(
        recipient=user.email,
        subject="Confirm your Rozakos Fitness email",
        text=(
            f"Hi {user.display_name},\n\nConfirm your email for Rozakos Fitness:\n{url}\n\n"
            "This link expires in 24 hours. If you did not create this account, ignore this email."
        ),
        html=(
            f"<p>Hi {name},</p><p>Confirm your email for Rozakos Fitness:</p>"
            f'<p><a href="{html.escape(url)}">Confirm email</a></p>'
            "<p>This link expires in 24 hours. If you did not create this account, ignore this email.</p>"
        ),
    )


def _password_reset_email(user: User) -> None:
    token = create_action_token(
        user.id,
        "reset-password",
        expires_minutes=60,
        fingerprint=password_fingerprint(user.password_hash),
    )
    # A URL fragment is not sent to Cloudflare or the web server, keeping this
    # credential out of access logs. The page forwards it in the POST body.
    url = f"{settings.public_base_url.rstrip('/')}/reset-password#token={quote(token)}"
    name = html.escape(user.display_name)
    send_email(
        recipient=user.email,
        subject="Reset your Rozakos Fitness password",
        text=(
            f"Hi {user.display_name},\n\nReset your Rozakos Fitness password:\n{url}\n\n"
            "This link expires in one hour. If you did not request it, ignore this email."
        ),
        html=(
            f"<p>Hi {name},</p><p>Reset your Rozakos Fitness password:</p>"
            f'<p><a href="{html.escape(url)}">Reset password</a></p>'
            "<p>This link expires in one hour. If you did not request it, ignore this email.</p>"
        ),
    )


def _email_result_page(title: str, message: str, *, status_code: int = 200) -> HTMLResponse:
    content = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title><style>
:root {{ color-scheme: dark; font-family: system-ui, sans-serif; background: #2c2c3e; color: #f4f4f4; }}
body {{ margin: 0; padding: 24px; }} main {{ max-width: 520px; margin: 12vh auto; background: #353548; padding: 24px; border-radius: 14px; }}
p {{ line-height: 1.5; color: #d3d3dc; }} a {{ color: #56d2c3; }}
</style></head><body><main><h1>{html.escape(title)}</h1><p>{html.escape(message)}</p>
<p>You can return to the Rozakos Fitness app.</p></main></body></html>"""
    return HTMLResponse(
        content=content,
        status_code=status_code,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.post("/register", response_model=RegistrationResponse, status_code=status.HTTP_201_CREATED)
def register(
    body: RegisterRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    auth_rate_limiter.hit(
        f"register:ip:{client_ip(request)}",
        limit=10,
        window_seconds=60 * 60,
        detail="Too many account creation attempts. Try again later.",
    )
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        display_name=body.display_name,
        email_verified_at=None if settings.require_email_verification else datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    if settings.require_email_verification:
        background_tasks.add_task(_verification_email, user)
        return RegistrationResponse(
            user=UserOut.model_validate(user), email_verification_required=True
        )
    return RegistrationResponse(
        access_token=create_access_token(user.id, user.auth_version),
        user=UserOut.model_validate(user),
        email_verification_required=False,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, request: Request, db: Session = Depends(get_db)):
    email = body.email.lower()
    ip = client_ip(request)
    ip_key = f"login:ip:{ip}"
    account_key = f"login:account:{hashlib.sha256(email.encode()).hexdigest()}"
    detail = "Too many authentication attempts. Try again later."

    # The IP limit is consumed before bcrypt to cap the CPU cost of requests.
    # Failed-account attempts are tracked separately to blunt distributed attacks.
    auth_rate_limiter.hit(ip_key, limit=30, window_seconds=60, detail=detail)
    auth_rate_limiter.check(account_key, limit=10, window_seconds=15 * 60, detail=detail)

    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        auth_rate_limiter.record(account_key, window_seconds=15 * 60)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    auth_rate_limiter.clear(account_key)
    if settings.require_email_verification and not user.email_verified:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Confirm your email before logging in")
    return TokenResponse(
        access_token=create_access_token(user.id, user.auth_version),
        user=UserOut.model_validate(user),
    )


@router.get("/verify-email", response_class=HTMLResponse, include_in_schema=False)
def verify_email(token: str, db: Session = Depends(get_db)) -> HTMLResponse:
    decoded = decode_action_token(token, "verify-email")
    if decoded is None:
        return _email_result_page(
            "Confirmation link expired",
            "Request a new confirmation email from the app.",
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    user = db.get(User, decoded[0])
    expected_fingerprint = hashlib.sha256(user.email.encode()).hexdigest() if user else None
    if user is None or decoded[1] != expected_fingerprint:
        return _email_result_page(
            "Account not found", "This account no longer exists.", status_code=status.HTTP_404_NOT_FOUND
        )
    if user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)
        db.commit()
    return _email_result_page("Email confirmed", "Your email address is now confirmed.")


@router.post("/resend-verification", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def resend_verification(
    body: EmailRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_rate_limiter.hit(
        f"verification:ip:{client_ip(request)}",
        limit=5,
        window_seconds=15 * 60,
        detail="Too many requests. Try again later.",
    )
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if settings.require_email_verification and user is not None and not user.email_verified:
        background_tasks.add_task(_verification_email, user)
    return MessageResponse(detail="If the account needs confirmation, an email has been sent")


@router.post("/forgot-password", response_model=MessageResponse, status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    body: EmailRequest,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> MessageResponse:
    auth_rate_limiter.hit(
        f"password-reset:ip:{client_ip(request)}",
        limit=5,
        window_seconds=15 * 60,
        detail="Too many requests. Try again later.",
    )
    user = db.query(User).filter(User.email == body.email.lower()).first()
    if settings.smtp_host and user is not None:
        background_tasks.add_task(_password_reset_email, user)
    return MessageResponse(detail="If the account exists, a password reset email has been sent")


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(body: PasswordResetRequest, db: Session = Depends(get_db)) -> MessageResponse:
    decoded = decode_action_token(body.token, "reset-password")
    if decoded is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")
    user = db.get(User, decoded[0])
    if user is None or decoded[1] != password_fingerprint(user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset link")
    user.password_hash = hash_password(body.password)
    user.auth_version += 1
    db.commit()
    return MessageResponse(detail="Password updated")


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.delete("/account", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    db.delete(user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/account-deletion", status_code=status.HTTP_204_NO_CONTENT, include_in_schema=False)
def delete_account_with_password(
    body: LoginRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> Response:
    email = body.email.lower()
    ip = client_ip(request)
    account_key = f"deletion:account:{hashlib.sha256(email.encode()).hexdigest()}"
    detail = "Too many authentication attempts. Try again later."
    auth_rate_limiter.hit(f"deletion:ip:{ip}", limit=10, window_seconds=60, detail=detail)
    auth_rate_limiter.check(account_key, limit=5, window_seconds=15 * 60, detail=detail)
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        auth_rate_limiter.record(account_key, window_seconds=15 * 60)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    db.delete(user)
    db.commit()
    auth_rate_limiter.clear(account_key)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
