"""
Encryption for secrets the app keeps in PostgreSQL: the users' Google access and refresh tokens, the
Google OAuth client secret entered in the setup wizard, and the Google Chat webhook URL and Gemini API key
entered on the Settings page. A database dump or backup alone cannot use them.

Values are Fernet tokens under keys derived (HKDF) from ENCRYPTION_KEY. It may list several comma-separated
keys: the first encrypts, all decrypt, and `reencrypt_stored_secrets()` moves every value to the first at
startup. To rotate, put a new key first, restart, then drop the old one. Without ENCRYPTION_KEY the key is
derived from JWT_SECRET; that key is always accepted for reading, so ENCRYPTION_KEY can be added later.
"""
import base64
import logging
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken, MultiFernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy import Text, text
from sqlalchemy.orm import Session
from sqlalchemy.types import TypeDecorator

from .config import settings

logger = logging.getLogger(__name__)

# Every Fernet token starts with the version byte 0x80 and a timestamp, i.e. "gAAAAA" in base64.
# Google tokens ("ya29.…", "1//…") never do, which tells encrypted values from plaintext ones.
_FERNET_PREFIX = "gAAAAA"
# HKDF label of the database encryption key (named before user tokens were encrypted too).
_ENCRYPTION_PURPOSE = b"app-settings-encryption"

# Columns holding encrypted values: (table, primary key, column, row filter)
ENCRYPTED_COLUMNS = (
    ("users", "id", "gcp_access_token", "TRUE"),
    ("users", "id", "gcp_refresh_token", "TRUE"),
    ("app_settings", "key", "value", "key IN ('google_client_secret', 'google_chat_webhook_url', 'gemini_api_key')"),
)


def derive_key(secret: str, purpose: bytes) -> bytes:
    return HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"ds-catalog/" + purpose).derive(secret.encode())


@lru_cache(maxsize=8)
def _fernets(encryption_keys: tuple[str, ...], jwt_secret: str) -> tuple[Fernet, MultiFernet]:
    keys = [Fernet(base64.urlsafe_b64encode(derive_key(secret, _ENCRYPTION_PURPOSE)))
            for secret in (*encryption_keys, jwt_secret)]
    return keys[0], MultiFernet(keys)


def _current() -> tuple[Fernet, MultiFernet]:
    return _fernets(tuple(settings.encryption_keys), settings.jwt_secret)


def encrypt(value: str) -> str:
    return _current()[0].encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    """Raises cryptography.fernet.InvalidToken when no configured key can read the value."""
    return _current()[1].decrypt(value.encode()).decode()


def is_encrypted(value: str) -> bool:
    return value.startswith(_FERNET_PREFIX)


class EncryptedText(TypeDecorator):
    """A TEXT column stored encrypted. Reads None when no configured key can decrypt the value, and
    returns plaintext left from before encryption as-is until startup encrypts it."""
    impl = Text
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return None if value is None else encrypt(value)

    def process_result_value(self, value, dialect):
        if value is None or not is_encrypted(value):
            return value
        try:
            return decrypt(value)
        except InvalidToken:
            return None


def reencrypt_stored_secrets(db: Session) -> None:
    """At startup: encrypt plaintext left from before encryption, and move values under an older key to
    the current one. Values no key can read are left alone (and read as missing)."""
    primary, _ = _current()
    upgraded = unreadable = 0
    for table, pk, column, row_filter in ENCRYPTED_COLUMNS:
        rows = db.execute(text(f"SELECT {pk}, {column} FROM {table} WHERE {column} IS NOT NULL AND {row_filter}"))
        for row_id, value in rows.all():
            if is_encrypted(value):
                try:
                    primary.decrypt(value.encode())
                    continue  # already under the current key
                except InvalidToken:
                    pass
                try:
                    value = decrypt(value)
                except InvalidToken:
                    unreadable += 1
                    continue
            db.execute(text(f"UPDATE {table} SET {column} = :value WHERE {pk} = :id"),
                       {"value": encrypt(value), "id": row_id})
            upgraded += 1
    db.commit()
    if upgraded:
        logger.info("Encrypted %d stored secrets under the current key", upgraded)
    if unreadable:
        logger.warning(
            "%d stored secrets cannot be decrypted with ENCRYPTION_KEY or JWT_SECRET (was a key changed or "
            "removed?). Users sign in again to replace their Google tokens; an OAuth client saved in the setup "
            "wizard, and a webhook URL or API key saved on the Settings page, have to be entered again.",
            unreadable,
        )
