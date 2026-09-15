from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import CurrentUser, DbSession
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from app.models import RefreshToken, User
from app.schemas.auth import (
    LoginRequest,
    MeOut,
    RefreshRequest,
    SignupRequest,
    TokenPair,
)
from app.services import credits

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(db: DbSession, user: User) -> TokenPair:
    raw, token_hash = generate_refresh_token()
    now = datetime.now(UTC)
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=token_hash,
            expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
            created_at=now,
        )
    )
    db.commit()
    return TokenPair(
        access_token=create_access_token(user.id),
        refresh_token=raw,
        expires_in=settings.access_token_ttl_minutes * 60,
    )


@router.post("/signup", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, db: DbSession) -> TokenPair:
    email = payload.email.lower().strip()

    exists = db.execute(select(User.id).where(User.email == email)).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "E-mail já cadastrado")

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        name=payload.name,
    )
    db.add(user)
    db.flush()

    credits.grant_plan_quota(db, user, reason="signup_bonus")
    db.commit()

    return _issue_tokens(db, user)


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: DbSession) -> TokenPair:
    email = payload.email.lower().strip()
    user = db.execute(select(User).where(User.email == email)).scalar_one_or_none()

    # Mensagem idêntica nos dois casos: não revela se o e-mail existe.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha inválidos")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Conta desativada")

    return _issue_tokens(db, user)


@router.post("/refresh", response_model=TokenPair)
def refresh(payload: RefreshRequest, db: DbSession) -> TokenPair:
    token_hash = hash_refresh_token(payload.refresh_token)
    stored = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()

    if stored is None or not stored.is_valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token inválido")

    # Rotação: o token usado é revogado e um novo é emitido.
    stored.revoked_at = datetime.now(UTC)
    user = db.get(User, stored.user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuário inativo")

    return _issue_tokens(db, user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: DbSession) -> None:
    token_hash = hash_refresh_token(payload.refresh_token)
    stored = db.execute(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    ).scalar_one_or_none()
    if stored is not None and stored.revoked_at is None:
        stored.revoked_at = datetime.now(UTC)
        db.commit()


@router.get("/me", response_model=MeOut)
def me(user: CurrentUser, db: DbSession) -> MeOut:
    return MeOut(
        id=user.id,
        email=user.email,
        name=user.name,
        plan=user.plan,
        is_verified=user.is_verified,
        credits_remaining=credits.balance(db, user.id),
    )
