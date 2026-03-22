"""Auth endpoint tests."""

import uuid
from datetime import datetime, timedelta, timezone

import pytest


def make_jwt(role="editor", expired=False, secret=None):
    from backend.config import settings

    try:
        from jose import jwt
    except ImportError:
        import jwt  # type: ignore

    exp = datetime.now(timezone.utc) + (
        timedelta(seconds=-1) if expired else timedelta(hours=1)
    )
    payload = {"sub": str(uuid.uuid4()), "email": "test@example.com", "role": role, "exp": exp}
    key = secret or settings.jwt_secret
    return jwt.encode(payload, key, algorithm=settings.jwt_algorithm)


class TestAuthMe:
    def test_me_no_token_returns_401(self, client):
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_me_valid_token_returns_user(self, client):
        token = make_jwt()
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "test@example.com"
        assert data["role"] == "editor"

    def test_me_expired_token_returns_401(self, client):
        token = make_jwt(expired=True)
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_me_wrong_secret_returns_401(self, client):
        token = make_jwt(secret="wrong-secret-that-is-long-enough-for-hmac")
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_me_malformed_token_returns_401(self, client):
        r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
        assert r.status_code == 401


class TestAuthLogin:
    def test_login_redirects_to_google(self, client):
        r = client.get("/api/v1/auth/login", follow_redirects=False)
        # If GOOGLE_CLIENT_ID is empty returns 501, otherwise 302
        assert r.status_code in (302, 501)

    def test_login_redirect_contains_google_url(self, client, monkeypatch):
        from backend.config import settings
        monkeypatch.setattr(settings, "google_client_id", "fake-client-id")
        r = client.get("/api/v1/auth/login", follow_redirects=False)
        assert r.status_code == 302
        assert "accounts.google.com" in r.headers["location"]
        assert "fake-client-id" in r.headers["location"]
