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
SCOPES = "openid email profile https://www.googleapis.com/auth/bigquery.readonly https://www.googleapis.com/auth/cloud-platform.read-only"


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

    try:
        with httpx.Client(follow_redirects=True, timeout=10) as http:
            token_resp = http.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.google_client_id,
                    "client_secret": settings.google_client_secret,
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                },
            )
            token_resp.raise_for_status()
            token_data = token_resp.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in")  # seconds
            token_expiry = (
                datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
                if expires_in else None
            )
            if not access_token:
                raise HTTPException(status_code=400, detail="No access_token in response")
            userinfo_resp = http.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_resp.raise_for_status()
    except HTTPException:
        raise
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=400, detail=f"Google OAuth error: {exc.response.text[:200]}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Google: {exc}")
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
        user.gcp_access_token = access_token
        if refresh_token:
            user.gcp_refresh_token = refresh_token
        user.gcp_token_expiry = token_expiry
    else:
        user = User(
            email=email,
            name=userinfo.get("name"),
            picture=userinfo.get("picture"),
            role="viewer",
            last_login=now,
            gcp_access_token=access_token,
            gcp_refresh_token=refresh_token,
            gcp_token_expiry=token_expiry,
        )
        db.add(user)
    db.commit()
    db.refresh(user)

    jwt_token = _create_jwt(user)
    import json, urllib.parse
    user_json = urllib.parse.quote(json.dumps({
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
    }))
    return RedirectResponse(url=f"{settings.frontend_url}/login?token={jwt_token}&user={user_json}")


@router.get("/me")
def me(current_user: Optional[dict] = Depends(get_current_user)):
    """Return the current user info decoded from the JWT."""
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return current_user
