"""Deployment smoke tests: the app is up, the API is closed to anonymous callers, and CRUD works."""

import uuid


def test_frontend_or_backend_is_up(anonymous):
    # /health exists on the backend; through the nginx frontend, / serves the SPA.
    r = anonymous.get("/health")
    if r.status_code == 404:
        r = anonymous.get("/")
    assert r.status_code == 200


def test_setup_status_is_public_and_reveals_no_config(anonymous):
    r = anonymous.get("/api/v1/setup/status")
    assert r.status_code == 200
    assert "gcp_project_id" not in r.json()
    assert "frontend_url" not in r.json()


def test_api_rejects_anonymous_callers(anonymous):
    for path in ("/api/v1/datasets", "/api/v1/tables", "/api/v1/search?q=a", "/api/v1/bq/sources", "/api/v1/users"):
        assert anonymous.get(path).status_code == 401, path
    assert anonymous.post("/api/v1/datasets", json={"project_id": "p", "dataset_id": "d"}).status_code == 401


def test_token_is_accepted(api):
    r = api.get("/api/v1/auth/me")
    assert r.status_code == 200
    assert r.json()["role"] in ("editor", "admin"), "use an editor or admin token for the smoke tests"


def test_dataset_roundtrip(api):
    dataset_id = f"e2e_smoke_{uuid.uuid4().hex[:8]}"
    r = api.post("/api/v1/datasets", json={
        "project_id": "e2e-smoke",
        "dataset_id": dataset_id,
        "description": "Created by the deployment smoke tests",
        "tags": ["e2e"],
    })
    assert r.status_code == 201, r.text
    ds = r.json()
    try:
        assert api.get(f"/api/v1/datasets/{ds['id']}").status_code == 200
        results = api.get(f"/api/v1/search?q={dataset_id}").json()["results"]
        assert any(hit["id"] == ds["id"] for hit in results)
    finally:
        assert api.delete(f"/api/v1/datasets/{ds['id']}").status_code == 204
