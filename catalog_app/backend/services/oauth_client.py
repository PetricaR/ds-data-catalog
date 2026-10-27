"""
The Google OAuth client used for sign-in: from environment variables, or entered in the setup wizard.

Environment variables win. Without them, the client ID and secret come from the `app_settings` table.
The secret is encrypted there with a key derived from JWT_SECRET, so a database dump alone cannot use
it — nor the users' stored refresh tokens, which are useless without it.

Before anyone can sign in, the wizard is authorised by a setup token: an HMAC of the stored secret
under a key derived from JWT_SECRET. Every backend replica computes the same token, and it changes
whenever the stored client changes, so a token from an old log line stops working once it is used.
"""
import base64
import hashlib
import hmac
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

import httpx
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..config import settings
from ..models.catalog import AppSetting

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
CLIENT_ID_KEY = "google_client_id"
CLIENT_SECRET_KEY = "google_client_secret"


@dataclass(frozen=True)
class OAuthClient:
    client_id: str
    client_secret: str
    source: str  # "environment" | "database"


def _derive_key(purpose: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"ds-catalog/" + purpose).derive(
        settings.jwt_secret.encode()
    )


def _fernet() -> Fernet:
    return Fernet(base64.urlsafe_b64encode(_derive_key(b"app-settings-encryption")))


def env_managed() -> bool:
    """True when the environment sets either variable; then the wizard cannot change the client."""
    return bool(settings.google_client_id or settings.google_client_secret)


def _stored(db: Session) -> dict[str, str]:
    rows = db.query(AppSetting).filter(AppSetting.key.in_((CLIENT_ID_KEY, CLIENT_SECRET_KEY))).all()
    return {row.key: row.value for row in rows}


def get_oauth_client(db: Session) -> Optional[OAuthClient]:
    """The configured client, or None if sign-in is not configured (or the stored secret is unreadable)."""
    if env_managed():
        if settings.google_client_id and settings.google_client_secret:
            return OAuthClient(settings.google_client_id, settings.google_client_secret, "environment")
        return None
    stored = _stored(db)
    if CLIENT_ID_KEY not in stored or CLIENT_SECRET_KEY not in stored:
        return None
    try:
        secret = _fernet().decrypt(stored[CLIENT_SECRET_KEY].encode()).decode()
    except InvalidToken:  # encrypted under a previous JWT_SECRET
        return None
    return OAuthClient(stored[CLIENT_ID_KEY], secret, "database")


def save_oauth_client(db: Session, client_id: str, client_secret: str, updated_by: str) -> None:
    now = datetime.now(timezone.utc)
    stmt = insert(AppSetting).values([
        {"key": CLIENT_ID_KEY, "value": client_id, "updated_at": now, "updated_by": updated_by},
        {"key": CLIENT_SECRET_KEY, "value": _fernet().encrypt(client_secret.encode()).decode(),
         "updated_at": now, "updated_by": updated_by},
    ])
    db.execute(stmt.on_conflict_do_update(
        index_elements=[AppSetting.key],
        set_={"value": stmt.excluded.value, "updated_at": stmt.excluded.updated_at,
              "updated_by": stmt.excluded.updated_by},
    ))
    db.commit()


# ── Setup token ───────────────────────────────────────────────────────────────

def setup_token(db: Session) -> str:
    stored_secret = _stored(db).get(CLIENT_SECRET_KEY, "")
    return hmac.new(_derive_key(b"setup-token"), stored_secret.encode(), hashlib.sha256).hexdigest()[:32]


def check_setup_token(db: Session, token: str) -> bool:
    return hmac.compare_digest(token.strip().encode(), setup_token(db).encode())


def log_setup_token_if_unconfigured(db: Session) -> None:
    """At startup: tell whoever reads the server log how to finish setup in the browser."""
    if env_managed() or get_oauth_client(db):
        return
    logger.warning(
        "Google sign-in is not configured (or its stored secret was encrypted under a previous JWT_SECRET). "
        "Open %s/setup and enter this setup token: %s",
        settings.frontend_url.rstrip("/"),
        setup_token(db),
    )


# ── Verification ──────────────────────────────────────────────────────────────

def verify_with_google(client_id: str, client_secret: str, redirect_uri: str) -> tuple[bool, str]:
    """
    Ask Google whether it accepts these client credentials, without a user.

    Exchanging a made-up authorization code fails either way; Google reports `invalid_client` (or
    `deleted_client`) when the client itself is wrong, and `invalid_grant` when only the code is.
    Returns (ok, error message).
    """
    try:
        resp = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": "setup-wizard-check",
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri,
            },
            timeout=10,
        )
    except httpx.RequestError:
        return False, "Could not reach Google to check the credentials. Try again."
    if resp.status_code >= 500:
        return False, "Google could not check the credentials right now. Try again."
    try:
        body = resp.json()
    except ValueError:
        body = {}
    error = body.get("error", "")
    if resp.status_code == 401 or error in ("invalid_client", "deleted_client", "unauthorized_client"):
        description = body.get("error_description") or "The client ID or secret is wrong."
        return False, f"Google rejected this OAuth client: {description} ({error or resp.status_code})"
    return True, ""
