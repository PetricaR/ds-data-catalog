"""
Access-control matrix, checked against every registered route so a new endpoint
cannot ship without auth by accident.

  anonymous → only the public routes below
  viewer    → read catalog metadata; no writes, no BigQuery/AI jobs
  editor    → everything except BigQuery sources, sync and user management
  admin     → everything
"""

import re
import uuid

import pytest

from backend.main import app
from tests.conftest import bearer, make_user

PUBLIC = {
    ("GET", "/health"),
    ("GET", "/api/v1/auth/login"),
    ("GET", "/api/v1/auth/callback"),
    ("GET", "/api/v1/setup/status"),
}

# Reachable before anyone can sign in, guarded by the setup token or an admin sign-in (tests/test_setup.py).
SETUP_TOKEN_OR_ADMIN = {
    ("PUT", "/api/v1/setup/oauth"),
}

# Answer 404 unless LOCAL_MODE is on; then anyone can sign in (tests/test_local_mode.py).
LOCAL_MODE_ONLY = {
    ("POST", "/api/v1/auth/local"),
}

# GET routes that run BigQuery / AI jobs or expose query history — editor or above.
EDITOR_ONLY_GETS = {
    "/api/v1/tables/{table_id}/preview",
    "/api/v1/tables/{table_id}/lineage/discover",
    "/api/v1/tables/{table_id}/usage",
}

ADMIN_PREFIXES = ("/api/v1/bq", "/api/v1/users")


def _routes():
    # The OpenAPI schema lists every API route regardless of how routers are nested.
    for path, operations in app.openapi()["paths"].items():
        for method in operations:
            yield method.upper(), path


def _url(path: str) -> str:
    return re.sub(r"\{[^}]+\}", str(uuid.uuid4()), path)


def _call(client, method, path, headers=None):
    return client.request(method, _url(path), headers=headers or {}, json=None)


PROTECTED = [r for r in _routes() if r not in PUBLIC | SETUP_TOKEN_OR_ADMIN | LOCAL_MODE_ONLY]
WRITES = [r for r in PROTECTED if r[0] != "GET" or r[1] in EDITOR_ONLY_GETS]
ADMIN_ONLY = [r for r in PROTECTED if r[1].startswith(ADMIN_PREFIXES)]


def test_public_routes_exist():
    routes = set(_routes())
    assert PUBLIC | SETUP_TOKEN_OR_ADMIN | LOCAL_MODE_ONLY <= routes


@pytest.mark.parametrize("method,path", sorted(LOCAL_MODE_ONLY))
def test_local_mode_routes_are_off_by_default(client, method, path):
    assert _call(client, method, path).status_code == 404


@pytest.mark.parametrize("method,path", PROTECTED, ids=[f"{m} {p}" for m, p in PROTECTED])
def test_anonymous_is_rejected(client, method, path):
    assert _call(client, method, path).status_code == 401


@pytest.mark.parametrize("method,path", WRITES, ids=[f"{m} {p}" for m, p in WRITES])
def test_viewer_cannot_write_or_run_jobs(client, db, method, path):
    headers = bearer(make_user(db, "viewer"))
    assert _call(client, method, path, headers).status_code == 403


@pytest.mark.parametrize("method,path", ADMIN_ONLY, ids=[f"{m} {p}" for m, p in ADMIN_ONLY])
def test_editor_cannot_manage_sources_or_users(client, db, method, path):
    headers = bearer(make_user(db, "editor"))
    assert _call(client, method, path, headers).status_code == 403


def test_viewer_can_read_catalog(client, viewer_headers, seed_table):
    for path in ("/api/v1/datasets", "/api/v1/tables", f"/api/v1/tables/{seed_table.id}",
                 "/api/v1/search?q=test", "/api/v1/stats", "/api/v1/tags"):
        assert client.get(path, headers=viewer_headers).status_code == 200, path


class TestRestricted:
    def test_viewer_cannot_open_restricted_table(self, client, db, viewer_headers, seed_table):
        seed_table.sensitivity_label = "restricted"
        db.commit()
        assert client.get(f"/api/v1/tables/{seed_table.id}", headers=viewer_headers).status_code == 403

    def test_viewer_cannot_open_table_in_restricted_dataset(self, client, db, viewer_headers, seed_dataset, seed_table):
        seed_dataset.sensitivity_label = "restricted"
        db.commit()
        assert client.get(f"/api/v1/tables/{seed_table.id}", headers=viewer_headers).status_code == 403

    def test_editor_can_open_restricted_table(self, client, db, auth_headers, seed_table):
        seed_table.sensitivity_label = "restricted"
        db.commit()
        assert client.get(f"/api/v1/tables/{seed_table.id}", headers=auth_headers).status_code == 200


class TestUserManagement:
    def test_admin_lists_users(self, client, db, admin_headers):
        make_user(db, "viewer")
        r = client.get("/api/v1/users", headers=admin_headers)
        assert r.status_code == 200
        assert {u["role"] for u in r.json()} >= {"admin", "viewer"}
        assert "gcp_access_token" not in r.json()[0]

    def test_admin_changes_role(self, client, db, admin_headers):
        user = make_user(db, "viewer")
        r = client.patch(f"/api/v1/users/{user.id}", json={"role": "editor"}, headers=admin_headers)
        assert r.status_code == 200
        assert r.json()["role"] == "editor"
        assert client.post("/api/v1/datasets", json={"project_id": "p", "dataset_id": "d"},
                           headers=bearer(user)).status_code == 201

    def test_admin_deactivates_user(self, client, db, admin_headers):
        user = make_user(db, "editor")
        headers = bearer(user)
        r = client.patch(f"/api/v1/users/{user.id}", json={"is_active": False}, headers=admin_headers)
        assert r.status_code == 200
        assert client.get("/api/v1/auth/me", headers=headers).status_code == 401

    def test_invalid_role_is_rejected(self, client, db, admin_headers):
        user = make_user(db, "viewer")
        r = client.patch(f"/api/v1/users/{user.id}", json={"role": "owner"}, headers=admin_headers)
        assert r.status_code == 422

    def test_admin_cannot_lock_themselves_out(self, client, db):
        admin = make_user(db, "admin")
        headers = bearer(admin)
        assert client.patch(f"/api/v1/users/{admin.id}", json={"role": "viewer"}, headers=headers).status_code == 400
        assert client.patch(f"/api/v1/users/{admin.id}", json={"is_active": False}, headers=headers).status_code == 400
