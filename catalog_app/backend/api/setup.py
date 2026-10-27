from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.catalog import Dataset, GCPSource
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

    return {
        "database_connected": db_connected,
        "oauth_configured": bool(settings.google_client_id and settings.google_client_secret),
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
