"""Setup wizard status endpoint — public, so it must never leak configuration values."""

import pytest

from backend.models.catalog import GCPSource

STATUS_URL = "/api/v1/setup/status"


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
