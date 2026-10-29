"""The Settings page: access, Google Chat and Gemini settings entered in the app, and sample data."""

from unittest.mock import MagicMock, patch

import pytest

from backend.config import settings
from backend.models.catalog import AppSetting, Dataset
from backend.services import app_config
from tests.conftest import bearer, make_user

URL = "/api/v1/settings"
WEBHOOK = "https://chat.googleapis.com/v1/spaces/AAAA/messages?key=k&token=t"


@pytest.fixture(autouse=True)
def nothing_in_env(monkeypatch):
    # A developer's .env must not decide what these tests see
    for key in (*app_config.KEYS, "admin_emails"):
        monkeypatch.setattr(settings, key, "")


@pytest.fixture()
def admin(db):
    return make_user(db, "admin")


class TestReadAndSave:
    def test_nothing_configured(self, client, admin):
        r = client.get(URL, headers=bearer(admin))
        assert r.status_code == 200
        body = r.json()
        assert body["allowed_email_domains"] == {"value": "", "configured": False, "source": None}
        assert body["default_role"]["value"] == "viewer"
        assert body["admin_emails"] == []

    def test_lists_are_normalised(self, client, admin):
        r = client.put(URL, json={"allowed_email_domains": "Example.com\n@example.org, example.com",
                                  "allowed_emails": "Guest@Partner.io"}, headers=bearer(admin))
        assert r.status_code == 200
        assert r.json()["allowed_email_domains"] == {"value": "example.com,example.org", "configured": True, "source": "database"}
        assert r.json()["allowed_emails"]["value"] == "guest@partner.io"

    @pytest.mark.parametrize("field,value", [
        ("allowed_email_domains", "not a domain!"),
        ("allowed_emails", "nobody"),
        ("default_role", "admin"),
        ("google_chat_webhook_url", "https://attacker.example/hook"),
        ("gemini_api_key", "short"),
    ])
    def test_invalid_values_are_rejected(self, client, admin, field, value):
        assert client.put(URL, json={field: value}, headers=bearer(admin)).status_code == 422

    def test_secrets_are_encrypted_and_never_returned(self, client, db, admin):
        r = client.put(URL, json={"google_chat_webhook_url": WEBHOOK, "gemini_api_key": "AIza" + "x" * 35},
                       headers=bearer(admin))
        assert r.status_code == 200
        assert r.json()["google_chat_webhook_url"] == {"value": None, "configured": True, "source": "database"}
        assert WEBHOOK not in r.text
        stored = db.query(AppSetting).filter(AppSetting.key == "google_chat_webhook_url").one()
        assert stored.value.startswith("gAAAAA") and stored.updated_by == admin.email
        assert app_config.get(db, app_config.GOOGLE_CHAT_WEBHOOK_URL) == WEBHOOK

    def test_empty_value_removes_a_setting(self, client, db, admin):
        client.put(URL, json={"gemini_api_key": "AIza" + "x" * 35}, headers=bearer(admin))
        r = client.put(URL, json={"gemini_api_key": ""}, headers=bearer(admin))
        assert r.json()["gemini_api_key"]["configured"] is False
        assert db.query(AppSetting).filter(AppSetting.key == "gemini_api_key").count() == 0

    def test_environment_wins_and_is_read_only(self, client, admin, monkeypatch):
        monkeypatch.setattr(settings, "allowed_email_domains", "env.example")
        monkeypatch.setattr(settings, "admin_emails", "Root@Example.com")
        body = client.get(URL, headers=bearer(admin)).json()
        assert body["allowed_email_domains"] == {"value": "env.example", "configured": True, "source": "environment"}
        assert body["admin_emails"] == ["root@example.com"]
        r = client.put(URL, json={"allowed_email_domains": "other.example"}, headers=bearer(admin))
        assert r.status_code == 409
        assert "ALLOWED_EMAIL_DOMAINS" in r.json()["detail"]

    def test_admin_cannot_lock_themselves_out(self, client, admin):
        r = client.put(URL, json={"allowed_email_domains": "elsewhere.org"}, headers=bearer(admin))
        assert r.status_code == 400
        assert admin.email in r.json()["detail"]
        assert client.put(URL, json={"allowed_email_domains": "example.com"}, headers=bearer(admin)).status_code == 200

    def test_editor_cannot_read_settings(self, client, db):
        assert client.get(URL, headers=bearer(make_user(db, "editor"))).status_code == 403


class TestSettingsApply:
    def test_sign_in_allowlist_and_default_role(self, client, db, admin):
        assert not app_config.is_email_allowed(db, "jane@team.example")
        client.put(URL, json={"allowed_email_domains": "example.com,team.example", "default_role": "editor"},
                   headers=bearer(admin))
        assert app_config.is_email_allowed(db, "Jane@Team.example")
        assert not app_config.is_email_allowed(db, "jane@other.example")
        assert app_config.default_role(db) == "editor"

    def test_setup_status_counts_settings_entered_here(self, client, admin):
        assert client.get("/api/v1/setup/status").json()["gemini_configured"] is False
        client.put(URL, json={"gemini_api_key": "AIza" + "x" * 35, "allowed_emails": admin.email},
                   headers=bearer(admin))
        status = client.get("/api/v1/setup/status").json()
        assert status["gemini_configured"] is True
        assert status["team_access_configured"] is True

    def test_insights_use_the_stored_api_key(self, client, admin, seed_table):
        client.put(URL, json={"gemini_api_key": "AIza" + "k" * 35}, headers=bearer(admin))
        with patch("backend.services.insights.generate_insights") as generate:
            generate.return_value = {"questions": [], "observations": [], "use_cases": []}
            assert client.post(f"/api/v1/tables/{seed_table.id}/insights", headers=bearer(admin)).status_code == 200
        assert generate.call_args.kwargs["api_key"] == "AIza" + "k" * 35

    def test_webhook_from_the_environment_needs_no_database(self, monkeypatch):
        monkeypatch.setattr(settings, "google_chat_webhook_url", WEBHOOK)
        with patch("backend.services.app_config.SessionLocal") as session:
            assert app_config.gchat_webhook_url() == WEBHOOK
        session.assert_not_called()


class TestGoogleChatTest:
    def test_needs_a_webhook(self, client, admin):
        assert client.post(f"{URL}/google-chat/test", headers=bearer(admin)).status_code == 400

    def test_sends_a_message(self, client, admin):
        client.put(URL, json={"google_chat_webhook_url": WEBHOOK}, headers=bearer(admin))
        with patch("backend.services.gchat.httpx.post", return_value=MagicMock(status_code=200)) as post:
            r = client.post(f"{URL}/google-chat/test", headers=bearer(admin))
        assert r.status_code == 200
        assert post.call_args.args[0] == WEBHOOK
        assert admin.email in post.call_args.kwargs["json"]["text"]

    def test_reports_googles_refusal(self, client, admin):
        client.put(URL, json={"google_chat_webhook_url": WEBHOOK}, headers=bearer(admin))
        refused = MagicMock(status_code=404, text="Requested entity was not found.")
        with patch("backend.services.gchat.httpx.post", return_value=refused):
            r = client.post(f"{URL}/google-chat/test", headers=bearer(admin))
        assert r.status_code == 502
        assert "404" in r.json()["detail"]


class TestSampleData:
    def test_fills_an_empty_catalog_once(self, client, db, admin):
        r = client.post("/api/v1/setup/demo-data", headers=bearer(admin))
        assert r.status_code == 201
        assert db.query(Dataset).filter(Dataset.project_id == r.json()["project_id"]).count() == r.json()["datasets"]
        assert client.post("/api/v1/setup/demo-data", headers=bearer(admin)).status_code == 409

    def test_leaves_a_catalog_with_data_alone(self, client, admin, seed_dataset):
        assert client.post("/api/v1/setup/demo-data", headers=bearer(admin)).status_code == 409
