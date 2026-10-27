"""Secrets stored in PostgreSQL are encrypted, survive adding and rotating ENCRYPTION_KEY, and never leak."""

import logging

import pytest
from pydantic import ValidationError
from sqlalchemy import text

from backend import crypto
from backend.config import Settings, settings
from backend.models.catalog import User
from backend.services import oauth_client
from tests.conftest import make_user

KEY_A = "a" * 64
KEY_B = "b" * 64
ACCESS, REFRESH = "ya29.access-token", "1//refresh-token"


def _raw(db, user_id, column="gcp_refresh_token") -> str:
    return db.execute(text(f"SELECT {column} FROM users WHERE id = :id"), {"id": user_id}).scalar_one()


def _orm(db, user_id) -> User:
    db.expire_all()
    return db.get(User, user_id)


@pytest.fixture()
def user_with_tokens(db):
    user = make_user(db, "admin")
    user.gcp_access_token, user.gcp_refresh_token = ACCESS, REFRESH
    db.commit()
    return user.id


@pytest.fixture()
def no_encryption_key(monkeypatch):
    monkeypatch.setattr(settings, "encryption_key", "")
    return settings


def test_user_tokens_are_encrypted_at_rest(db, no_encryption_key, user_with_tokens):
    for column, plain in (("gcp_access_token", ACCESS), ("gcp_refresh_token", REFRESH)):
        stored = _raw(db, user_with_tokens, column)
        assert crypto.is_encrypted(stored) and plain not in stored
    user = _orm(db, user_with_tokens)
    assert (user.gcp_access_token, user.gcp_refresh_token) == (ACCESS, REFRESH)


def test_plaintext_tokens_are_encrypted_at_startup(db, no_encryption_key, user_with_tokens):
    db.execute(text("UPDATE users SET gcp_refresh_token = :t WHERE id = :id"), {"t": REFRESH, "id": user_with_tokens})
    assert _orm(db, user_with_tokens).gcp_refresh_token == REFRESH  # readable before the upgrade
    crypto.reencrypt_stored_secrets(db)
    assert crypto.is_encrypted(_raw(db, user_with_tokens))
    assert _orm(db, user_with_tokens).gcp_refresh_token == REFRESH


def test_adding_and_rotating_encryption_key(db, no_encryption_key, user_with_tokens, monkeypatch):
    def under_only(key):
        return crypto._fernets((key,), "unused-jwt-secret-that-is-at-least-32-chars")[0].decrypt(
            _raw(db, user_with_tokens).encode()).decode()

    # Written under the key derived from JWT_SECRET; adding ENCRYPTION_KEY keeps it readable, startup moves it.
    monkeypatch.setattr(settings, "encryption_key", KEY_A)
    assert _orm(db, user_with_tokens).gcp_refresh_token == REFRESH
    crypto.reencrypt_stored_secrets(db)
    assert under_only(KEY_A) == REFRESH

    # Rotation: new key first, restart, then drop the old one.
    monkeypatch.setattr(settings, "encryption_key", f"{KEY_B},{KEY_A}")
    crypto.reencrypt_stored_secrets(db)
    monkeypatch.setattr(settings, "encryption_key", KEY_B)
    assert under_only(KEY_B) == REFRESH
    assert _orm(db, user_with_tokens).gcp_refresh_token == REFRESH


def test_unreadable_tokens_read_as_missing(db, no_encryption_key, user_with_tokens, monkeypatch, caplog):
    monkeypatch.setattr(settings, "encryption_key", KEY_A)
    crypto.reencrypt_stored_secrets(db)
    stored = _raw(db, user_with_tokens)
    monkeypatch.setattr(settings, "encryption_key", KEY_B)  # KEY_A lost
    assert _orm(db, user_with_tokens).gcp_refresh_token is None
    with caplog.at_level(logging.WARNING):
        crypto.reencrypt_stored_secrets(db)
    assert _raw(db, user_with_tokens) == stored  # left alone, in case the key turns up again
    assert "cannot be decrypted" in caplog.text


def test_stored_oauth_secret_follows_rotation(db, no_encryption_key, monkeypatch):
    monkeypatch.setattr(settings, "google_client_id", "")
    monkeypatch.setattr(settings, "google_client_secret", "")
    oauth_client.save_oauth_client(db, "1-x.apps.googleusercontent.com", "GOCSPX-stored", "test")
    monkeypatch.setattr(settings, "encryption_key", KEY_A)
    crypto.reencrypt_stored_secrets(db)
    # Now under ENCRYPTION_KEY, so JWT_SECRET can be rotated without losing it
    monkeypatch.setattr(settings, "jwt_secret", "a-rotated-jwt-secret-that-is-at-least-32-characters")
    assert oauth_client.get_oauth_client(db).client_secret == "GOCSPX-stored"


@pytest.mark.parametrize("value", ["short", f"{KEY_A},short", "change-me-in-production"])
def test_weak_encryption_key_is_refused(value):
    with pytest.raises(ValidationError):
        Settings(jwt_secret="x" * 32, encryption_key=value, _env_file=None)


def test_strong_encryption_keys_are_accepted():
    assert Settings(jwt_secret="x" * 32, encryption_key=f" {KEY_A} , {KEY_B} ", _env_file=None).encryption_keys == [KEY_A, KEY_B]
