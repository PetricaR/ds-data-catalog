"""Setup wizard status endpoint — public, so it must never leak configuration values."""

from unittest.mock import MagicMock, patch
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from backend.models.catalog import AppSetting, GCPSource
from backend.services import oauth_client
from tests.conftest import bearer, make_user

STATUS_URL = "/api/v1/setup/status"
OAUTH_URL = "/api/v1/setup/oauth"
CLIENT = {"client_id": "123-abc.apps.googleusercontent.com", "client_secret": "GOCSPX-wizard-secret"}


@pytest.fixture()
def configured(monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "google_client_id", "client-id-value.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_client_secret", "client-secret-value")
    monkeypatch.setattr(settings, "admin_emails", "admin@example.com")
    monkeypatch.setattr(settings, "allowed_email_domains", "example.org")
    monkeypatch.setattr(settings, "allowed_emails", "")
    monkeypatch.setattr(settings, "frontend_url", "https://catalog.example.com/")
    return settings


class TestSetupStatus:
    def test_public_and_complete(self, client, configured):
        r = client.get(STATUS_URL)
        assert r.status_code == 200
        data = r.json()
        assert data["database_connected"] is True
        assert data["oauth_configured"] is True
        assert data["admin_configured"] is True
        assert data["team_access_configured"] is True
        assert data["redirect_uri"] == "https://catalog.example.com/api/v1/auth/callback"

    def test_oauth_needs_client_secret(self, client, configured, monkeypatch):
        monkeypatch.setattr(configured, "google_client_secret", "")
        assert client.get(STATUS_URL).json()["oauth_configured"] is False

    def test_team_access_from_individual_emails(self, client, configured, monkeypatch):
        monkeypatch.setattr(configured, "allowed_email_domains", "")
        assert client.get(STATUS_URL).json()["team_access_configured"] is False
        monkeypatch.setattr(configured, "allowed_emails", "someone@example.net")
        assert client.get(STATUS_URL).json()["team_access_configured"] is True

    def test_fresh_install_until_a_source_exists(self, client, configured, db):
        assert client.get(STATUS_URL).json()["is_fresh_install"] is True
        db.add(GCPSource(project_id="setup-test-project"))
        db.commit()
        data = client.get(STATUS_URL).json()
        assert data["bq_sources_count"] == 1
        assert data["is_fresh_install"] is False

    def test_fresh_install_false_with_data(self, client, configured, seed_dataset):
        data = client.get(STATUS_URL).json()
        assert data["has_data"] is True
        assert data["is_fresh_install"] is False

    def test_does_not_leak_configuration(self, client, configured):
        body = client.get(STATUS_URL).text
        for value in ("client-id-value", "client-secret-value", "admin@example.com", "example.org"):
            assert value not in body


# ── Google OAuth client entered in the wizard ─────────────────────────────────

def _google_says(status_code: int, body: dict) -> MagicMock:
    resp = MagicMock(status_code=status_code)
    resp.json.return_value = body
    return MagicMock(return_value=resp)


@pytest.fixture()
def unconfigured(monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "google_client_id", "")
    monkeypatch.setattr(settings, "google_client_secret", "")
    return settings


@pytest.fixture()
def google_accepts():
    # A valid client with a made-up code: Google rejects only the code.
    post = _google_says(400, {"error": "invalid_grant", "error_description": "Malformed auth code."})
    with patch("backend.services.oauth_client.httpx.post", post):
        yield post


def _put(client, token=None, headers=None, body=CLIENT):
    headers = dict(headers or {})
    if token:
        headers["X-Setup-Token"] = token
    return client.put(OAUTH_URL, json=body, headers=headers)


class TestOAuthClientSetup:
    def test_setup_token_saves_client_encrypted(self, client, db, unconfigured, google_accepts):
        status = client.get(STATUS_URL).json()
        assert status["oauth_configured"] is False
        assert status["oauth_source"] is None

        r = _put(client, oauth_client.setup_token(db))
        assert r.status_code == 200
        assert CLIENT["client_secret"] not in r.text

        stored = {row.key: row.value for row in db.query(AppSetting).all()}
        assert stored["google_client_id"] == CLIENT["client_id"]
        assert CLIENT["client_secret"] not in stored["google_client_secret"]
        assert db.get(AppSetting, "google_client_secret").updated_by == "setup token"

        status = client.get(STATUS_URL)
        assert status.json()["oauth_configured"] is True
        assert status.json()["oauth_source"] == "database"
        assert CLIENT["client_secret"] not in status.text

    def test_sign_in_uses_the_stored_client(self, client, db, unconfigured, google_accepts):
        assert _put(client, oauth_client.setup_token(db)).status_code == 200
        r = client.get("/api/v1/auth/login", follow_redirects=False)
        assert parse_qs(urlparse(r.headers["location"]).query)["client_id"] == [CLIENT["client_id"]]

        token_resp = MagicMock()
        token_resp.json.return_value = {"access_token": "ya29.fake"}
        http = MagicMock()
        http.post.return_value = token_resp
        http.get.return_value.json.return_value = {"email": "nobody@evil.test", "verified_email": True}
        client_cls = MagicMock()
        client_cls.return_value.__enter__.return_value = http
        client.cookies.set("ds_catalog_oauth_state", "s", path="/api/v1/auth")
        with patch("backend.api.auth.httpx.Client", client_cls):
            client.get("/api/v1/auth/callback?code=abc&state=s", follow_redirects=False)
        client.cookies.clear()
        sent = http.post.call_args.kwargs["data"]
        assert (sent["client_id"], sent["client_secret"]) == (CLIENT["client_id"], CLIENT["client_secret"])

    def test_anonymous_needs_the_setup_token(self, client, db, unconfigured, google_accepts):
        assert _put(client).status_code == 403
        assert _put(client, "0" * 32).status_code == 403
        assert db.query(AppSetting).count() == 0
        google_accepts.assert_not_called()

    def test_viewer_and_editor_need_the_setup_token(self, client, db, unconfigured, google_accepts):
        for role in ("viewer", "editor"):
            assert _put(client, headers=bearer(make_user(db, role))).status_code == 403

    def test_admin_needs_no_token(self, client, db, unconfigured, google_accepts):
        admin = make_user(db, "admin")
        assert _put(client, headers=bearer(admin)).status_code == 200
        assert db.get(AppSetting, "google_client_id").updated_by == admin.email

    def test_setup_token_changes_once_used(self, client, db, unconfigured, google_accepts):
        first = oauth_client.setup_token(db)
        assert _put(client, first).status_code == 200
        assert _put(client, first).status_code == 403
        assert _put(client, oauth_client.setup_token(db)).status_code == 200

    def test_environment_wins(self, client, db, configured, google_accepts):
        r = _put(client, oauth_client.setup_token(db))
        assert r.status_code == 409
        assert client.get(STATUS_URL).json()["oauth_source"] == "environment"

    def test_client_rejected_by_google_is_not_saved(self, client, db, unconfigured):
        post = _google_says(401, {"error": "deleted_client", "error_description": "The OAuth client was deleted."})
        with patch("backend.services.oauth_client.httpx.post", post):
            r = _put(client, oauth_client.setup_token(db))
        assert r.status_code == 400
        assert "deleted" in r.json()["detail"]
        assert db.query(AppSetting).count() == 0

    def test_google_unreachable_is_not_saved(self, client, db, unconfigured):
        post = MagicMock(side_effect=httpx.ConnectError("offline"))
        with patch("backend.services.oauth_client.httpx.post", post):
            assert _put(client, oauth_client.setup_token(db)).status_code == 400
        assert db.query(AppSetting).count() == 0

    @pytest.mark.parametrize("body", [
        {"client_id": "not-a-google-client", "client_secret": CLIENT["client_secret"]},
        {"client_id": CLIENT["client_id"], "client_secret": "short"},
        {"client_id": CLIENT["client_id"], "client_secret": "has a space"},
    ])
    def test_malformed_client_is_rejected(self, client, db, unconfigured, google_accepts, body):
        assert _put(client, oauth_client.setup_token(db), body=body).status_code == 422

    def test_new_jwt_secret_makes_stored_secret_unusable(self, client, db, unconfigured, google_accepts, monkeypatch):
        assert _put(client, oauth_client.setup_token(db)).status_code == 200
        monkeypatch.setattr(unconfigured, "jwt_secret", "another-secret-that-is-at-least-32-characters")
        assert oauth_client.get_oauth_client(db) is None
        assert client.get(STATUS_URL).json()["oauth_configured"] is False
        assert _put(client, oauth_client.setup_token(db)).status_code == 200
        assert oauth_client.get_oauth_client(db).client_secret == CLIENT["client_secret"]
