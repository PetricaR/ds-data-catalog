from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.catalog import Dataset, GCPSource
from ..services import oauth_client
from .auth import _redirect_uri

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status")
def setup_status(db: Session = Depends(get_db)):
    """Return the current setup/health status of the installation.

    Public (the setup wizard runs before anyone can sign in), so it only reports booleans, counts and
    the OAuth redirect URI — which the browser sends to Google on every sign-in anyway.
    """
    try:
        db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    bq_sources_count = db.query(GCPSource).count() if db_connected else 0
    datasets_count = db.query(Dataset).count() if db_connected else 0
    client = oauth_client.get_oauth_client(db) if db_connected else None

    return {
        "database_connected": db_connected,
        "oauth_configured": client is not None,
        # "environment" | "database" | null — the wizard can only change a client it stored itself
        "oauth_source": "environment" if oauth_client.env_managed() else client and client.source,
        # Must be registered as an authorised redirect URI on the OAuth client; built from FRONTEND_URL
        "redirect_uri": _redirect_uri(),
        "bq_sources_count": bq_sources_count,
        "has_data": datasets_count > 0,
        "gemini_configured": bool(settings.gemini_api_key),
        "gchat_configured": bool(settings.google_chat_webhook_url),
        "admin_configured": bool(settings.admin_emails.strip()),
        # Anyone beyond ADMIN_EMAILS allowed to sign in
        "team_access_configured": bool(settings.allowed_email_domains.strip() or settings.allowed_emails.strip()),
        # A fresh install has no sources and no data
        "is_fresh_install": bq_sources_count == 0 and datasets_count == 0,
    }


class OAuthClientIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    client_id: str = Field(max_length=255, pattern=r"^[\w.-]+\.apps\.googleusercontent\.com$")
    client_secret: str = Field(min_length=8, max_length=255, pattern=r"^\S+$")


def require_admin_or_setup_token(
    x_setup_token: Optional[str] = Header(default=None),
    user: Optional[dict] = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> str:
    """Who may change the OAuth client: a signed-in admin, or, before anyone can sign in, the holder of
    the setup token from the server log. Returns who made the change. 403 rather than 401, so the
    frontend does not treat a wrong token as an expired session."""
    if user and user["role"] == "admin":
        return user["email"]
    if x_setup_token and oauth_client.check_setup_token(db, x_setup_token):
        return "setup token"
    raise HTTPException(
        status_code=403,
        detail="Sign in as an admin, or enter the setup token printed in the backend log.",
    )


@router.put("/oauth")
def save_oauth_client(
    body: OAuthClientIn,
    db: Session = Depends(get_db),
    updated_by: str = Depends(require_admin_or_setup_token),
):
    """Store the Google OAuth client entered in the setup wizard, after checking it with Google.

    The secret is encrypted at rest and never returned.
    """
    if oauth_client.env_managed():
        raise HTTPException(
            status_code=409,
            detail="GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are set in the environment. "
                   "Change them there, or remove both and restart to manage the client here.",
        )
    ok, error = oauth_client.verify_with_google(body.client_id, body.client_secret, _redirect_uri())
    if not ok:
        raise HTTPException(status_code=400, detail=error)
    oauth_client.save_oauth_client(db, body.client_id, body.client_secret, updated_by)
    return {"oauth_configured": True, "oauth_source": "database"}
