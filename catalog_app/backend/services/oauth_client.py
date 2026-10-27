"""
The Google OAuth client used for sign-in: from environment variables, or entered in the setup wizard.

Environment variables win. Without them, the client ID and secret come from the `app_settings` table,
the secret encrypted (backend/crypto.py).

Before anyone can sign in, the wizard is authorised by a setup token: an HMAC of the stored secret
under a key derived from JWT_SECRET. Every backend replica computes the same token, and it changes
whenever the stored client changes, so a token from an old log line stops working once it is used.

Google deletes OAuth clients that go unused, so the configured client is checked with Google at startup
and every OAUTH_CHECK_INTERVAL_MINUTES; the setup status reports a rejected client.
"""
import asyncio
import hashlib
import hmac
import logging
import threading
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import NamedTuple, Optional

import httpx
from cryptography.fernet import InvalidToken
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .. import crypto
from ..config import settings
from ..database import SessionLocal
from ..models.catalog import AppSetting

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
CLIENT_ID_KEY = "google_client_id"
CLIENT_SECRET_KEY = "google_client_secret"
RECHECK_REJECTED_AFTER = timedelta(minutes=5)  # notice soon when a rejected client is restored at Google


@dataclass(frozen=True)
class OAuthClient:
    client_id: str
    client_secret: str
    source: str  # "environment" | "database"


def redirect_uri() -> str:
    # Built from FRONTEND_URL, not the request, so it stays correct behind TLS-terminating proxies.
    return settings.frontend_url.rstrip("/") + "/api/v1/auth/callback"


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
        secret = crypto.decrypt(stored[CLIENT_SECRET_KEY])
    except InvalidToken:  # encrypted under a key that is no longer configured
        return None
    return OAuthClient(stored[CLIENT_ID_KEY], secret, "database")


def save_oauth_client(db: Session, client_id: str, client_secret: str, updated_by: str) -> None:
    now = datetime.now(timezone.utc)
    stmt = insert(AppSetting).values([
        {"key": CLIENT_ID_KEY, "value": client_id, "updated_at": now, "updated_by": updated_by},
        {"key": CLIENT_SECRET_KEY, "value": crypto.encrypt(client_secret), "updated_at": now, "updated_by": updated_by},
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
    key = crypto.derive_key(settings.jwt_secret, b"setup-token")
    return hmac.new(key, stored_secret.encode(), hashlib.sha256).hexdigest()[:32]


def check_setup_token(db: Session, token: str) -> bool:
    return hmac.compare_digest(token.strip().encode(), setup_token(db).encode())


def log_setup_token_if_unconfigured(db: Session) -> None:
    """At startup: tell whoever reads the server log how to finish setup in the browser."""
    if env_managed() or get_oauth_client(db):
        return
    setup_url = settings.frontend_url.rstrip("/") + "/setup"
    if settings.log_setup_token:
        logger.warning(
            "Google sign-in is not configured (or its stored secret cannot be decrypted). "
            "Open %s and enter this setup token: %s", setup_url, setup_token(db),
        )
    else:
        logger.warning(
            "Google sign-in is not configured (or its stored secret cannot be decrypted). Get the setup token "
            "with `python -m backend.setup_token` where the backend runs, then open %s.", setup_url,
        )


# ── Verification with Google ──────────────────────────────────────────────────

class Verdict(NamedTuple):
    status: str        # "ok" | "rejected" | "unreachable"
    message: str = ""  # for "rejected": Google's description and error code


def verify_with_google(client_id: str, client_secret: str) -> Verdict:
    """
    Ask Google whether it accepts these client credentials, without a user.

    Exchanging a made-up authorization code fails either way; Google reports `invalid_client` (or
    `deleted_client`) when the client itself is wrong, and `invalid_grant` when only the code is.
    """
    try:
        resp = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": "setup-wizard-check",
                "client_id": client_id,
                "client_secret": client_secret,
                "redirect_uri": redirect_uri(),
            },
            timeout=10,
        )
    except httpx.RequestError:
        return Verdict("unreachable", "Could not reach Google to check the credentials. Try again.")
    if resp.status_code >= 500:
        return Verdict("unreachable", "Google could not check the credentials right now. Try again.")
    try:
        body = resp.json()
    except ValueError:
        body = {}
    error = body.get("error", "")
    if resp.status_code == 401 or error in ("invalid_client", "deleted_client", "unauthorized_client"):
        description = body.get("error_description") or "The client ID or secret is wrong."
        return Verdict("rejected", f"{description} ({error or resp.status_code})")
    return Verdict("ok")


# ── Health of the configured client ───────────────────────────────────────────

@dataclass(frozen=True)
class _Health:
    fingerprint: str
    verdict: Verdict
    checked_at: datetime


_health: Optional[_Health] = None   # per process; each replica checks for itself
_recheck_lock = threading.Lock()


def _fingerprint(client_id: str, client_secret: str) -> str:
    return hashlib.sha256(f"{client_id}\n{client_secret}".encode()).hexdigest()


def record_verdict(client_id: str, client_secret: str, verdict: Verdict) -> None:
    """Remember Google's answer for this client. "unreachable" keeps the last known answer."""
    global _health
    if verdict.status == "unreachable":
        return
    if verdict.status == "rejected":
        logger.warning("Google rejects the OAuth client %s: %s", client_id, verdict.message)
    _health = _Health(_fingerprint(client_id, client_secret), verdict, datetime.now(timezone.utc))


def check_oauth_client(db: Session) -> None:
    client = get_oauth_client(db)
    if client:
        record_verdict(client.client_id, client.client_secret,
                       verify_with_google(client.client_id, client.client_secret))


def client_problem(client: OAuthClient) -> Optional[str]:
    """Google's complaint about this client if it rejected it at the last check, else None.

    A rejected client is checked again after a few minutes, so restoring it at Google clears the problem.
    """
    health = _health
    if not health or health.fingerprint != _fingerprint(client.client_id, client.client_secret):
        return None
    if health.verdict.status == "rejected" and datetime.now(timezone.utc) - health.checked_at > RECHECK_REJECTED_AFTER:
        if _recheck_lock.acquire(blocking=False):
            try:
                record_verdict(client.client_id, client.client_secret,
                               verify_with_google(client.client_id, client.client_secret))
            finally:
                _recheck_lock.release()
        health = _health or health
    return health.verdict.message if health.verdict.status == "rejected" else None


async def watch_oauth_client(interval_minutes: int) -> None:
    """Check the configured client now and then every `interval_minutes`, for the life of the process."""
    def check_once():
        with SessionLocal() as db:
            check_oauth_client(db)

    while True:
        try:
            await asyncio.to_thread(check_once)
        except Exception:
            logger.exception("Could not check the Google OAuth client")
        await asyncio.sleep(interval_minutes * 60)
