"""Google OAuth2 + JWT authentication endpoints."""
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.catalog import User

router = APIRouter(prefix="/auth", tags=["auth"])

# ── OAuth2 URLs ───────────────────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
SCOPES = "openid email profile"


def _build_redirect_uri(request: Request) -> str:
    return str(request.base_url).rstrip("/") + "/api/v1/auth/callback"


def _create_jwt(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload = {
        "sub": str(user.id),
        "email": user.email,
        "role": user.role,
        "exp": expire,
    }
    try:
        from jose import jwt
        return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    except ImportError:
        import jwt as pyjwt  # type: ignore
        return pyjwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/login")
def login(request: Request):
    """Redirect to Google OAuth2 consent screen."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth2 not configured")
    redirect_uri = _build_redirect_uri(request)
    params = (
        f"response_type=code"
        f"&client_id={settings.google_client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&scope={SCOPES.replace(' ', '%20')}"
        f"&access_type=offline"
        f"&prompt=consent"
    )
    return RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{params}")


@router.get("/callback")
def callback(code: str, request: Request, db: Session = Depends(get_db)):
    """Receive OAuth2 code, exchange for token, upsert user, return JWT."""
    if not settings.google_client_id:
        raise HTTPException(status_code=501, detail="Google OAuth2 not configured")

    redirect_uri = _build_redirect_uri(request)

    # Exchange code for tokens
    with httpx.Client() as client:
        token_resp = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {token_resp.text}")
    token_data = token_resp.json()
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="No access_token in response")

    # Fetch user info
    with httpx.Client() as client:
        userinfo_resp = client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
    if userinfo_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch user info from Google")
    userinfo = userinfo_resp.json()

    email = userinfo.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Google did not return an email address")

    # Upsert user
    now = datetime.now(timezone.utc)
    user = db.query(User).filter(User.email == email).first()
    if user:
        user.name = userinfo.get("name", user.name)
        user.picture = userinfo.get("picture", user.picture)
        user.last_login = now
    else:
        user = User(
            email=email,
            name=userinfo.get("name"),
            picture=userinfo.get("picture"),
            role="viewer",
            last_login=now,
        )
        db.add(user)
    db.commit()
    db.refresh(user)

    jwt_token = _create_jwt(user)
    return {
        "access_token": jwt_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
            "role": user.role,
        },
    }


@router.get("/me")
def me(current_user: Optional[dict] = Depends(get_current_user)):
    """Return the current user info decoded from the JWT."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user
