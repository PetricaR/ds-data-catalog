"""
Settings an admin can change on the Settings page instead of in environment variables: who may sign in,
the role new users get, Google Chat alerts and the Gemini API key.

An environment variable that is set (not empty) wins, and the page shows it as read-only, as it does for
the Google OAuth client (services/oauth_client.py). Values entered in the app live in the `app_settings`
table. The webhook URL and the API key are encrypted (backend/crypto.py), since either one lets whoever
holds it post to the space or spend on the key, and they are never sent back to the browser.

ADMIN_EMAILS stays in the environment only: it is how an operator gets back in when no admin is left.
"""
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable, Optional

from cryptography.fernet import InvalidToken
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from .. import crypto
from ..config import settings, split_csv
from ..database import SessionLocal
from ..models.catalog import AppSetting

ALLOWED_EMAIL_DOMAINS = "allowed_email_domains"
ALLOWED_EMAILS = "allowed_emails"
DEFAULT_ROLE = "default_role"
GOOGLE_CHAT_WEBHOOK_URL = "google_chat_webhook_url"
GEMINI_API_KEY = "gemini_api_key"

KEYS = (ALLOWED_EMAIL_DOMAINS, ALLOWED_EMAILS, DEFAULT_ROLE, GOOGLE_CHAT_WEBHOOK_URL, GEMINI_API_KEY)
SECRET_KEYS = (GOOGLE_CHAT_WEBHOOK_URL, GEMINI_API_KEY)


@dataclass(frozen=True)
class Setting:
    value: str
    source: Optional[str]  # "environment" | "database" | None when not set


def env_value(key: str) -> str:
    """The environment's value for a setting; empty when the environment does not set it."""
    return getattr(settings, key).strip()


def load(db: Session, keys: Iterable[str] = KEYS) -> dict[str, Setting]:
    keys = tuple(keys)
    stored = {row.key: row.value for row in db.query(AppSetting).filter(AppSetting.key.in_(keys)).all()}
    result = {}
    for key in keys:
        if env := env_value(key):
            result[key] = Setting(env, "environment")
            continue
        value = stored.get(key, "")
        if value and key in SECRET_KEYS:
            try:
                value = crypto.decrypt(value)
            except InvalidToken:  # encrypted under a key that is no longer configured: enter it again
                value = ""
        result[key] = Setting(value, "database" if value else None)
    return result


def get(db: Session, key: str) -> str:
    """The value in effect: the environment's, else the one entered in the app, else empty."""
    return load(db, (key,))[key].value


def save(db: Session, values: dict[str, str], updated_by: str) -> None:
    """Store settings entered in the app. An empty value removes the setting."""
    now = datetime.now(timezone.utc)
    for key, value in values.items():
        if not value:
            db.query(AppSetting).filter(AppSetting.key == key).delete()
            continue
        stmt = insert(AppSetting).values(
            key=key, value=crypto.encrypt(value) if key in SECRET_KEYS else value,
            updated_at=now, updated_by=updated_by,
        )
        db.execute(stmt.on_conflict_do_update(
            index_elements=[AppSetting.key],
            set_={"value": stmt.excluded.value, "updated_at": stmt.excluded.updated_at,
                  "updated_by": stmt.excluded.updated_by},
        ))
    db.commit()


# ── What the rest of the app asks ─────────────────────────────────────────────

def email_allowed_by(email: str, allowed_emails: str, allowed_email_domains: str) -> bool:
    """Sign-in allowlist. With no allowed addresses or domains, only ADMIN_EMAILS can sign in."""
    email = email.lower()
    if settings.is_admin_email(email) or email in split_csv(allowed_emails):
        return True
    return email.rsplit("@", 1)[-1] in split_csv(allowed_email_domains)


def is_email_allowed(db: Session, email: str) -> bool:
    access = load(db, (ALLOWED_EMAILS, ALLOWED_EMAIL_DOMAINS))
    return email_allowed_by(email, access[ALLOWED_EMAILS].value, access[ALLOWED_EMAIL_DOMAINS].value)


def default_role(db: Session) -> str:
    return get(db, DEFAULT_ROLE) or "viewer"


def gchat_webhook_url() -> str:
    """For notifications, which are sent outside the request's database session."""
    if env := env_value(GOOGLE_CHAT_WEBHOOK_URL):
        return env
    with SessionLocal() as db:
        return get(db, GOOGLE_CHAT_WEBHOOK_URL)
