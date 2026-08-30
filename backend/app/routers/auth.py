import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..rate_limit import auth_rate_limiter, client_ip
from ..schemas import LoginRequest, RegisterRequest, TokenResponse, UserOut
from ..security import create_access_token, get_current_user, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, request: Request, db: Session = Depends(get_db)):
    auth_rate_limiter.hit(
        f"register:ip:{client_ip(request)}",
        limit=10,
        window_seconds=60 * 60,
        detail="Too many account creation attempts. Try again later.",
    )
    email = body.email.lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    user = User(email=email, password_hash=hash_password(body.password), display_name=body.display_name)
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


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
    return TokenResponse(access_token=create_access_token(user.id), user=UserOut.model_validate(user))


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
