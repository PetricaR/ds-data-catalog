"""LOCAL_MODE: sign-in without Google for development, and the demo data that goes with it."""

import pytest
from pydantic import ValidationError

from backend.models.catalog import Dataset, Table
from tests.conftest import make_user

STRONG_SECRET = "a" * 32


@pytest.fixture()
def local_mode(monkeypatch):
    from backend.config import settings
    monkeypatch.setattr(settings, "local_mode", True)
    return settings


class TestLocalSignIn:
    def test_off_by_default(self, client):
        r = client.post("/api/v1/auth/local", json={"email": "dev@example.com", "role": "admin"})
        assert r.status_code == 404

    def test_signs_in_new_user_with_chosen_role(self, client, local_mode):
        r = client.post("/api/v1/auth/local", json={"email": "Dev@Example.com", "role": "editor"})
        assert r.status_code == 200
        body = r.json()
        assert body["user"]["email"] == "dev@example.com"
        assert body["user"]["role"] == "editor"
        me = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
        assert me.status_code == 200
        assert me.json()["role"] == "editor"

    def test_role_defaults_to_admin(self, client, local_mode):
        r = client.post("/api/v1/auth/local", json={"email": "dev@example.com"})
        assert r.json()["user"]["role"] == "admin"

    def test_each_sign_in_sets_the_role(self, client, db, local_mode):
        user = make_user(db, "admin")
        r = client.post("/api/v1/auth/local", json={"email": user.email, "role": "viewer"})
        assert r.json()["user"]["id"] == str(user.id)
        db.refresh(user)
        assert user.role == "viewer"

    def test_deactivated_user_is_refused(self, client, db, local_mode):
        user = make_user(db, "editor", is_active=False)
        r = client.post("/api/v1/auth/local", json={"email": user.email, "role": "admin"})
        assert r.status_code == 403

    @pytest.mark.parametrize("payload", [
        {"email": "not-an-email", "role": "admin"},
        {"email": "dev@example.com", "role": "owner"},
    ])
    def test_invalid_input_is_rejected(self, client, local_mode, payload):
        assert client.post("/api/v1/auth/local", json=payload).status_code == 422

    def test_setup_status_reports_local_mode(self, client, local_mode):
        assert client.get("/api/v1/setup/status").json()["local_mode"] is True


class TestLocalModeSetting:
    @pytest.mark.parametrize("url", ["http://localhost:5173", "http://127.0.0.1:8080/", "http://[::1]:5173"])
    def test_accepted_with_local_frontend_url(self, url):
        from backend.config import Settings

        assert Settings(jwt_secret=STRONG_SECRET, local_mode=True, frontend_url=url, _env_file=None).local_mode

    @pytest.mark.parametrize("url", ["https://catalog.example.com", "http://34.120.1.2", "http://localhost.example.com"])
    def test_refused_with_any_other_frontend_url(self, url):
        from backend.config import Settings

        with pytest.raises(ValidationError, match="LOCAL_MODE"):
            Settings(jwt_secret=STRONG_SECRET, local_mode=True, frontend_url=url, _env_file=None)


class TestDemoData:
    def test_fills_an_empty_catalog(self, db):
        from backend.demo_data import DATASETS, seed

        assert seed(db) is True
        assert db.query(Dataset).count() == len(DATASETS)
        orders = db.query(Table).filter(Table.table_id == "orders").one()
        assert orders.is_validated
        assert orders.quality_score == 100
        assert [c.name for c in orders.columns][0] == "order_id"
        customers = db.query(Table).filter(Table.table_id == "customers").one()
        assert customers.sensitivity_label == "restricted"
        assert {c.name for c in customers.columns if c.is_pii} == {"email", "phone"}

    def test_leaves_an_existing_catalog_alone(self, db, seed_dataset):
        from backend.demo_data import seed

        assert seed(db) is False
        assert db.query(Dataset).count() == 1

    def test_viewer_sees_the_demo_catalog(self, client, db, viewer_headers):
        from backend.demo_data import seed

        seed(db)
        r = client.get("/api/v1/datasets", headers=viewer_headers)
        assert r.status_code == 200
        assert {d["dataset_id"] for d in r.json()} == {"sales", "customers", "marketing", "reference"}
