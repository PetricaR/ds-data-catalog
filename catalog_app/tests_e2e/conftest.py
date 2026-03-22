"""
End-to-end integration tests against the LIVE deployed app.

Prerequisites — start a port-forward once in a separate terminal:

    kubectl port-forward svc/ds-catalog-backend 8001:8000

Or set APP_BASE_URL to point at the real external IP, e.g.:
    export APP_BASE_URL=http://104.155.73.77.nip.io

JWT tokens are generated using the same secret that is deployed in the cluster.
Set JWT_SECRET env var to override (default: reads from ds-catalog-secret K8s secret via kubectl).

Run:
    cd catalog_app
    pytest tests_e2e/ -v
"""

import os
import subprocess
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests

# ── App base URL ─────────────────────────────────────────────────────────────

APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:8001")


# ── JWT secret: read from env or from the deployed K8s secret ────────────────

def _get_jwt_secret() -> str:
    secret = os.environ.get("JWT_SECRET")
    if secret:
        return secret
    try:
        result = subprocess.run(
            [
                "kubectl", "get", "secret", "ds-catalog-secret",
                "-o", "jsonpath={.data.JWT_SECRET}",
            ],
            capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0 and result.stdout.strip():
            import base64
            return base64.b64decode(result.stdout.strip()).decode()
    except Exception:
        pass
    raise RuntimeError(
        "Cannot determine JWT_SECRET. Either set the JWT_SECRET env var or "
        "ensure kubectl is configured and ds-catalog-secret exists."
    )


JWT_SECRET = _get_jwt_secret()
JWT_ALGORITHM = "HS256"


# ── Token helpers ─────────────────────────────────────────────────────────────

def make_token(role: str = "editor", email: str = "e2e-test@example.com") -> str:
    try:
        from jose import jwt
    except ImportError:
        import jwt  # type: ignore

    payload = {
        "sub": str(uuid.uuid4()),
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=2),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


@pytest.fixture(scope="session")
def base_url() -> str:
    return APP_BASE_URL


@pytest.fixture(scope="session")
def auth_headers() -> dict:
    return {"Authorization": f"Bearer {make_token('editor')}"}


@pytest.fixture(scope="session")
def admin_headers() -> dict:
    return {"Authorization": f"Bearer {make_token('admin')}"}


# ── Thin HTTP client ──────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def api(base_url, auth_headers):
    """Returns a simple namespace with get/post/put/patch/delete helpers."""

    class API:
        def __init__(self, base, headers):
            self.base = base
            self.headers = headers

        def get(self, path, **kwargs):
            return requests.get(f"{self.base}{path}", headers=self.headers, **kwargs)

        def post(self, path, **kwargs):
            return requests.post(f"{self.base}{path}", headers=self.headers, **kwargs)

        def put(self, path, **kwargs):
            return requests.put(f"{self.base}{path}", headers=self.headers, **kwargs)

        def patch(self, path, **kwargs):
            return requests.patch(f"{self.base}{path}", headers=self.headers, **kwargs)

        def delete(self, path, **kwargs):
            return requests.delete(f"{self.base}{path}", headers=self.headers, **kwargs)

    return API(base_url, auth_headers)


# ── Smoke check: fail fast if app is not reachable ───────────────────────────

@pytest.fixture(scope="session", autouse=True)
def check_app_reachable(base_url):
    try:
        r = requests.get(f"{base_url}/health", timeout=5)
        assert r.status_code == 200, f"Health check failed: {r.status_code}"
    except requests.ConnectionError as exc:
        pytest.skip(
            f"App not reachable at {base_url}. "
            "Start port-forward: kubectl port-forward svc/ds-catalog-backend 8001:8000"
        )


# ── Well-known real data fixtures (from the live DB) ─────────────────────────

@pytest.fixture(scope="session")
def real_datasets(api):
    """All datasets currently in the catalog."""
    r = api.get("/api/v1/datasets")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def real_tables(api):
    """All tables currently in the catalog."""
    r = api.get("/api/v1/tables")
    assert r.status_code == 200
    return r.json()


@pytest.fixture(scope="session")
def weather_table(api, real_tables):
    """The weather_records table — small (7 rows), good for BQ preview tests."""
    tbl = next((t for t in real_tables if t["table_id"] == "weather_records"), None)
    if tbl is None:
        pytest.skip("weather_records table not found in live catalog")
    return tbl


@pytest.fixture(scope="session")
def formare_dataset(api, real_datasets):
    """The weather_data dataset in formare-ai project."""
    ds = next((d for d in real_datasets if d["dataset_id"] == "weather_data"), None)
    if ds is None:
        pytest.skip("weather_data dataset not found in live catalog")
    return ds


# ── Test-created resource cleanup ─────────────────────────────────────────────

@pytest.fixture()
def e2e_dataset(api):
    """Creates a test dataset for the duration of the test, then deletes it."""
    uid = uuid.uuid4().hex[:8]
    r = api.post("/api/v1/datasets", json={
        "project_id": "e2e-test-project",
        "dataset_id": f"e2e_dataset_{uid}",
        "display_name": "E2E Test Dataset",
        "description": "Created by automated e2e tests",
        "tags": ["e2e", "test"],
        "sensitivity_label": "internal",
    })
    assert r.status_code == 201, f"Failed to create e2e dataset: {r.text}"
    ds = r.json()
    yield ds
    # cleanup
    api.delete(f"/api/v1/datasets/{ds['id']}")


@pytest.fixture()
def e2e_table(api, e2e_dataset):
    """Creates a test table (inside e2e_dataset) for the duration of the test."""
    uid = uuid.uuid4().hex[:8]
    r = api.post("/api/v1/tables", json={
        "dataset_id": e2e_dataset["id"],
        "table_id": f"e2e_table_{uid}",
        "display_name": "E2E Test Table",
        "description": "Created by automated e2e tests",
        "tags": ["e2e"],
        "sensitivity_label": "internal",
        "columns": [
            {"name": "id", "data_type": "INTEGER", "is_nullable": False, "is_primary_key": True, "position": 0},
            {"name": "name", "data_type": "STRING", "is_nullable": True, "is_primary_key": False, "position": 1},
            {"name": "created_at", "data_type": "TIMESTAMP", "is_nullable": True, "is_primary_key": False, "position": 2},
        ],
    })
    assert r.status_code == 201, f"Failed to create e2e table: {r.text}"
    tbl = r.json()
    yield tbl
    # cleanup handled by e2e_dataset cascade or explicit delete
    api.delete(f"/api/v1/tables/{tbl['id']}")
