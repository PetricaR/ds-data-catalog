"""Auth endpoint tests: JWT validation and the Google OAuth2 callback."""

import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from pydantic import ValidationError

from tests.conftest import bearer, make_user


def make_jwt(sub: str, expired: bool = False, secret: str | None = None) -> str:
    from backend.config import settings

    exp = datetime.now(timezone.utc) + (timedelta(seconds=-1) if expired else timedelta(hours=1))
    payload = {"sub": sub, "email": "test@example.com", "exp": exp}
    return jwt.encode(payload, secret or settings.jwt_secret, algorithm=settings.jwt_algorithm)


class TestAuthMe:
    def test_me_no_token_returns_401(self, client):
        r = client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_me_valid_token_returns_user(self, client, db):
        user = make_user(db, "editor")
        r = client.get("/api/v1/auth/me", headers=bearer(user))
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == user.email
        assert data["role"] == "editor"

    def test_me_expired_token_returns_401(self, client, db):
        user = make_user(db)
        token = make_jwt(str(user.id), expired=True)
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_me_wrong_secret_returns_401(self, client, db):
        user = make_user(db)
        token = make_jwt(str(user.id), secret="wrong-secret-that-is-long-enough-for-hmac")
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_me_malformed_token_returns_401(self, client):
        r = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer notavalidtoken"})
        assert r.status_code == 401

    def test_token_for_unknown_user_returns_401(self, client):
        token = make_jwt(str(uuid.uuid4()))
        r = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 401

    def test_deactivated_user_returns_401(self, client, db):
        user = make_user(db, "admin", is_active=False)
        r = client.get("/api/v1/auth/me", headers=bearer(user))
        assert r.status_code == 401

    def test_role_comes_from_database_not_token(self, client, db):
        """A token minted while the user was admin stops granting admin once the role changes."""
        user = make_user(db, "admin")
        headers = bearer(user)
        user.role = "viewer"
        db.commit()
        assert client.get("/api/v1/auth/me", headers=headers).json()["role"] == "viewer"
        assert client.get("/api/v1/users", headers=headers).status_code == 403


class TestJwtSecretValidation:
    @pytest.mark.parametrize("secret", ["", "short", "change-me-in-production", "CHANGE_ME_IN_PRODUCTION"])
    def test_weak_or_placeholder_secret_is_rejected(self, secret):
        from backend.config import Settings

        with pytest.raises(ValidationError):
            Settings(jwt_secret=secret, _env_file=None)

    def test_strong_secret_is_accepted(self):
        from backend.config import Settings

        assert Settings(jwt_secret="x" * 32, _env_file=None).jwt_secret == "x" * 32


class TestAuthLogin:
    def test_login_without_oauth_config_returns_501(self, client, monkeypatch):
        from backend.config import settings
        monkeypatch.setattr(settings, "google_client_id", "")
        r = client.get("/api/v1/auth/login", follow_redirects=False)
        assert r.status_code == 501

    def test_login_redirects_to_google_with_state(self, client, monkeypatch):
        from backend.config import settings
        monkeypatch.setattr(settings, "google_client_id", "fake-client-id")
        monkeypatch.setattr(settings, "google_client_secret", "fake-secret")
        r = client.get("/api/v1/auth/login", follow_redirects=False)
        assert r.status_code in (302, 307)
        location = urlparse(r.headers["location"])
        assert location.netloc == "accounts.google.com"
        query = parse_qs(location.query)
        assert query["client_id"] == ["fake-client-id"]
        assert query["redirect_uri"] == [f"{settings.frontend_url}/api/v1/auth/callback"]
        assert query["state"][0] == r.cookies.get("ds_catalog_oauth_state")


# ── OAuth callback ────────────────────────────────────────────────────────────

def _fake_google(email: str, verified: bool = True) -> MagicMock:
    """A stand-in for httpx.Client that returns a token and the given Google profile."""
    token_resp = MagicMock()
    token_resp.json.return_value = {"access_token": "ya29.fake", "refresh_token": "1//fake", "expires_in": 3600}
    userinfo_resp = MagicMock()
    userinfo_resp.json.return_value = {"email": email, "verified_email": verified, "name": "Jane Doe", "picture": None}
    http = MagicMock()
    http.post.return_value = token_resp
    http.get.return_value = userinfo_resp
    client_cls = MagicMock()
    client_cls.return_value.__enter__.return_value = http
    return client_cls


@pytest.fixture()
def oauth(monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "google_client_id", "fake-client-id")
    monkeypatch.setattr(settings, "google_client_secret", "fake-secret")
    monkeypatch.setattr(settings, "admin_emails", "boss@example.com")
    monkeypatch.setattr(settings, "allowed_email_domains", "example.com")
    monkeypatch.setattr(settings, "allowed_emails", "")
    monkeypatch.setattr(settings, "default_role", "viewer")
    return settings


def _callback(client, email: str, verified: bool = True, state: str = "s3cr3t", cookie: str | None = "s3cr3t"):
    if cookie is not None:
        client.cookies.set("ds_catalog_oauth_state", cookie, path="/api/v1/auth")
    with patch("backend.api.auth.httpx.Client", _fake_google(email, verified)):
        r = client.get(f"/api/v1/auth/callback?code=abc&state={state}", follow_redirects=False)
    client.cookies.clear()
    assert r.status_code in (302, 307)
    location = urlparse(r.headers["location"])
    assert location.path == "/login"
    assert location.query == "", "token must never be sent in the query string"
    return {k: v[0] for k, v in parse_qs(location.fragment).items()}


class TestAuthCallback:
    def test_allowed_domain_signs_in_as_default_role(self, client, oauth):
        result = _callback(client, "jane@example.com")
        assert "token" in result
        assert '"role": "viewer"' in result["user"]
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {result['token']}"})
        assert me.status_code == 200
        assert me.json()["email"] == "jane@example.com"

    def test_admin_email_is_promoted_to_admin(self, client, oauth):
        result = _callback(client, "Boss@Example.com")
        assert '"role": "admin"' in result["user"]

    def test_email_outside_allowlist_is_rejected(self, client, oauth):
        result = _callback(client, "intruder@evil.test")
        assert "token" not in result
        assert "not allowed" in result["error"]

    def test_unverified_email_is_rejected(self, client, oauth):
        result = _callback(client, "jane@example.com", verified=False)
        assert "token" not in result

    def test_state_mismatch_is_rejected(self, client, oauth):
        result = _callback(client, "jane@example.com", state="attacker", cookie="s3cr3t")
        assert "token" not in result
        assert "expired" in result["error"]

    def test_missing_state_cookie_is_rejected(self, client, oauth):
        result = _callback(client, "jane@example.com", cookie=None)
        assert "token" not in result

    def test_deactivated_user_cannot_sign_in(self, client, db, oauth):
        user = make_user(db, "editor", is_active=False)
        result = _callback(client, user.email)
        assert "token" not in result
        assert "deactivated" in result["error"]
