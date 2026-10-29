"""The Settings page: sign-in access, Google Chat alerts and the Gemini API key (services/app_config.py)."""
import re
from typing import Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from ..config import settings, split_csv
from ..database import get_db
from ..dependencies.auth import require_admin
from ..services import app_config
from ..services.gchat import send_test_message

router = APIRouter(prefix="/settings", tags=["settings"], dependencies=[Depends(require_admin)])

_DOMAIN = re.compile(r"(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")
_EMAIL = re.compile(r"[^@\s]+@[^@\s]+\.[^@\s]+")
_SEPARATORS = re.compile(r"[\s,;]+")
WEBHOOK_PREFIX = "https://chat.googleapis.com/v1/spaces/"


def _normalised_list(value: str, pattern: re.Pattern, what: str) -> str:
    """One per line or comma-separated in, comma-separated, lowercase and without duplicates out."""
    items: list[str] = []
    for item in _SEPARATORS.split(value.lower()):
        if what == "domain":
            item = item.removeprefix("@")
        if not item:
            continue
        if not pattern.fullmatch(item):
            raise ValueError(f"'{item}' is not a valid {what}")
        if item not in items:
            items.append(item)
    return ",".join(items)


class SettingsUpdate(BaseModel):
    """Fields left out stay as they are; an empty string removes a setting."""
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    allowed_email_domains: Optional[str] = Field(default=None, max_length=4000)
    allowed_emails: Optional[str] = Field(default=None, max_length=4000)
    default_role: Optional[Literal["viewer", "editor"]] = None
    google_chat_webhook_url: Optional[str] = Field(default=None, max_length=2000)
    gemini_api_key: Optional[str] = Field(default=None, max_length=200)

    @field_validator("allowed_email_domains")
    @classmethod
    def _domains(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _normalised_list(value, _DOMAIN, "domain")

    @field_validator("allowed_emails")
    @classmethod
    def _emails(cls, value: Optional[str]) -> Optional[str]:
        return None if value is None else _normalised_list(value, _EMAIL, "email address")

    @field_validator("google_chat_webhook_url")
    @classmethod
    def _webhook(cls, value: Optional[str]) -> Optional[str]:
        # Only Google Chat: the backend posts to this URL, so it must not point anywhere else
        if value and not value.startswith(WEBHOOK_PREFIX):
            raise ValueError(f"Use the webhook URL of a Google Chat space; it starts with {WEBHOOK_PREFIX}")
        return value

    @field_validator("gemini_api_key")
    @classmethod
    def _api_key(cls, value: Optional[str]) -> Optional[str]:
        if value and not re.fullmatch(r"[\w-]{20,200}", value):
            raise ValueError("That doesn't look like a Gemini API key")
        return value


def _view(db: Session) -> dict:
    current = app_config.load(db)
    view = {
        key: {
            # Secrets are never sent back, only whether they are set
            "value": None if key in app_config.SECRET_KEYS else current[key].value,
            "configured": bool(current[key].value),
            "source": current[key].source,
        }
        for key in app_config.KEYS
    }
    view[app_config.DEFAULT_ROLE]["value"] = current[app_config.DEFAULT_ROLE].value or "viewer"
    view["admin_emails"] = sorted(split_csv(settings.admin_emails))
    return view


@router.get("")
def get_settings(db: Session = Depends(get_db)):
    return _view(db)


@router.put("")
def update_settings(body: SettingsUpdate, db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    changes = body.model_dump(exclude_none=True)
    managed = [key.upper() for key in changes if app_config.env_value(key)]
    if managed:
        raise HTTPException(
            status_code=409,
            detail=f"{', '.join(managed)} {'is' if len(managed) == 1 else 'are'} set in the environment. "
                   "Change it there, or remove it and restart to manage it here.",
        )
    # Local sign-in skips the allowlist, so only a Google sign-in can be locked out
    if not settings.local_mode and (app_config.ALLOWED_EMAILS in changes or app_config.ALLOWED_EMAIL_DOMAINS in changes):
        current = app_config.load(db, (app_config.ALLOWED_EMAILS, app_config.ALLOWED_EMAIL_DOMAINS))
        emails = changes.get(app_config.ALLOWED_EMAILS, current[app_config.ALLOWED_EMAILS].value)
        domains = changes.get(app_config.ALLOWED_EMAIL_DOMAINS, current[app_config.ALLOWED_EMAIL_DOMAINS].value)
        if not app_config.email_allowed_by(admin["email"], emails, domains):
            raise HTTPException(
                status_code=400,
                detail=f"You could no longer sign in: keep {admin['email']} or its domain in the list.",
            )
    app_config.save(db, changes, admin["email"])
    return _view(db)


@router.post("/google-chat/test")
def test_google_chat(db: Session = Depends(get_db), admin: dict = Depends(require_admin)):
    """Send a test message to the configured Google Chat space."""
    url = app_config.get(db, app_config.GOOGLE_CHAT_WEBHOOK_URL)
    if not url:
        raise HTTPException(status_code=400, detail="No Google Chat webhook is configured.")
    try:
        send_test_message(url, admin["email"])
    except httpx.RequestError:
        raise HTTPException(status_code=502, detail="Could not reach Google Chat. Try again.")
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))
    return {"sent": True}
