from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from .. import demo_data
from ..config import settings
from ..database import get_db
from ..dependencies.auth import get_current_user, require_admin
from ..models.catalog import Dataset, GCPSource
from ..services import app_config, oauth_client

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
    configured = {key: bool(s.value) for key, s in app_config.load(db).items()} if db_connected else {}

    return {
        "database_connected": db_connected,
        "oauth_configured": client is not None,
        # "environment" | "database" | null — the wizard can only change a client it stored itself
        "oauth_source": "environment" if oauth_client.env_managed() else client and client.source,
        # Google's reason for rejecting the configured client (e.g. it was deleted), from the last check
        "oauth_client_error": oauth_client.client_problem(client) if client else None,
        # Must be registered as an authorised redirect URI on the OAuth client; built from FRONTEND_URL
        "redirect_uri": oauth_client.redirect_uri(),
        "bq_sources_count": bq_sources_count,
        "has_data": datasets_count > 0,
        "gemini_configured": configured.get(app_config.GEMINI_API_KEY, False),
        "gchat_configured": configured.get(app_config.GOOGLE_CHAT_WEBHOOK_URL, False),
        "admin_configured": bool(settings.admin_emails.strip()),
        # Anyone beyond ADMIN_EMAILS allowed to sign in
        "team_access_configured": configured.get(app_config.ALLOWED_EMAIL_DOMAINS, False)
                                  or configured.get(app_config.ALLOWED_EMAILS, False),
        # A fresh install has no sources and no data
        "is_fresh_install": bq_sources_count == 0 and datasets_count == 0,
        # LOCAL_MODE: sign-in without Google, for development on this machine
        "local_mode": settings.local_mode,
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
    verdict = oauth_client.verify_with_google(body.client_id, body.client_secret)
    if verdict.status == "rejected":
        raise HTTPException(status_code=400, detail=f"Google rejected this OAuth client: {verdict.message}")
    if verdict.status != "ok":
        raise HTTPException(status_code=400, detail=verdict.message)
    oauth_client.save_oauth_client(db, body.client_id, body.client_secret, updated_by)
    oauth_client.record_verdict(body.client_id, body.client_secret, verdict)
    return {"oauth_configured": True, "oauth_source": "database"}


@router.post("/demo-data", status_code=201, dependencies=[Depends(require_admin)])
def load_demo_data(db: Session = Depends(get_db)):
    """Fill an empty catalog with a fictional retail company's datasets, to try the catalog before connecting
    BigQuery. Its BigQuery features (preview, scans, lineage discovery) fail: the project does not exist."""
    if not demo_data.seed(db):
        raise HTTPException(status_code=409, detail="The catalog already has datasets. Sample data only goes into an empty catalog.")
    return {"project_id": demo_data.PROJECT, "datasets": len(demo_data.DATASETS)}
