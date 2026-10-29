"""Google OAuth2 + JWT authentication endpoints."""
import json
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional
from urllib.parse import urlencode
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies.auth import create_token, require_auth
from ..models.catalog import User
from ..services.oauth_client import get_oauth_client, redirect_uri

router = APIRouter(prefix="/auth", tags=["auth"])

# ── OAuth2 URLs ───────────────────────────────────────────────────────────────

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
SCOPES = "openid email profile https://www.googleapis.com/auth/bigquery.readonly https://www.googleapis.com/auth/cloud-platform.read-only"

STATE_COOKIE = "ds_catalog_oauth_state"
STATE_COOKIE_PATH = "/api/v1/auth"
STATE_MAX_AGE_SECONDS = 600


def _to_login_page(**fragment: str) -> RedirectResponse:
    """Redirect to the frontend login page, passing results in the URL fragment.

    The fragment is never sent to a server, so the token stays out of access logs and Referer headers.
    """
    response = RedirectResponse(url=f"{settings.frontend_url.rstrip('/')}/login#{urlencode(fragment)}")
    response.delete_cookie(STATE_COOKIE, path=STATE_COOKIE_PATH)
    return response


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/login")
def login(db: Session = Depends(get_db)):
    """Redirect to Google OAuth2 consent screen."""
    oauth = get_oauth_client(db)
    if not oauth:
        raise HTTPException(status_code=501, detail="Google OAuth2 not configured")
    state = secrets.token_urlsafe(32)
    params = urlencode({
        "response_type": "code",
        "client_id": oauth.client_id,
        "redirect_uri": redirect_uri(),
        "scope": SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    })
    response = RedirectResponse(url=f"{GOOGLE_AUTH_URL}?{params}")
    response.set_cookie(
        STATE_COOKIE,
        state,
        max_age=STATE_MAX_AGE_SECONDS,
        path=STATE_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.frontend_url.startswith("https://"),
    )
    return response


@router.get("/callback")
def callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    db: Session = Depends(get_db),
):
    """Receive OAuth2 code, exchange for token, upsert user, return JWT."""
    oauth = get_oauth_client(db)
    if not oauth:
        raise HTTPException(status_code=501, detail="Google OAuth2 not configured")
    if error:
        return _to_login_page(error=f"Google sign-in did not complete ({error}).")

    expected_state = request.cookies.get(STATE_COOKIE)
    if not code or not state or not expected_state or not secrets.compare_digest(state, expected_state):
        return _to_login_page(error="Your sign-in session expired. Please try again.")

    try:
        with httpx.Client(follow_redirects=True, timeout=10) as http:
            token_resp = http.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": oauth.client_id,
                    "client_secret": oauth.client_secret,
                    "redirect_uri": redirect_uri(),
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
                return _to_login_page(error="Google did not return an access token.")
            userinfo_resp = http.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            userinfo_resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        return _to_login_page(error=f"Google OAuth error: {exc.response.text[:200]}")
    except httpx.RequestError:
        return _to_login_page(error="Could not reach Google. Please try again.")
    userinfo = userinfo_resp.json()

    email = (userinfo.get("email") or "").lower()
    if not email or not userinfo.get("verified_email"):
        return _to_login_page(error="Google did not return a verified email address.")
    if not settings.is_email_allowed(email):
        return _to_login_page(error=f"{email} is not allowed to sign in to this catalog. Ask an administrator for access.")

    # Upsert user
    now = datetime.now(timezone.utc)
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user and not user.is_active:
        return _to_login_page(error="Your account has been deactivated. Ask an administrator for access.")
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
            role=settings.default_role,
            last_login=now,
            gcp_access_token=access_token,
            gcp_refresh_token=refresh_token,
            gcp_token_expiry=token_expiry,
        )
        db.add(user)
    if settings.is_admin_email(email):
        user.role = "admin"
    db.commit()
    db.refresh(user)

    return _to_login_page(token=create_token(user), user=json.dumps(_user_info(user)))


class LocalSignIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(max_length=255, pattern=r"^[^@\s]+@[^@\s]+$")
    role: Literal["viewer", "editor", "admin"] = "admin"


def _require_local_mode():
    # Off, the route answers as if it did not exist
    if not settings.local_mode:
        raise HTTPException(status_code=404, detail="Not Found")


@router.post("/local", dependencies=[Depends(_require_local_mode)])
def local_sign_in(body: LocalSignIn, db: Session = Depends(get_db)):
    """LOCAL_MODE only: sign in as any email with the chosen role, without Google.

    Each sign-in sets the role, so a developer can switch between viewer, editor and admin. The user has no
    Google token, so BigQuery features run with the backend's own credentials (ADC).
    """
    email = body.email.lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user and not user.is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated.")
    if not user:
        user = User(email=email, name=email.split("@")[0])
        db.add(user)
    user.role = body.role
    user.last_login = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return {"token": create_token(user), "user": _user_info(user)}


def _user_info(user: User) -> dict:
    return {
        "id": str(user.id),
        "email": user.email,
        "name": user.name,
        "picture": user.picture,
        "role": user.role,
    }


@router.get("/me")
def me(current_user: dict = Depends(require_auth), db: Session = Depends(get_db)):
    """Return the current user's profile and role, as stored in the database."""
    user = db.query(User).filter(User.id == UUID(current_user["id"])).first()
    return _user_info(user)
