"""BigQuery sources endpoint tests (no real BQ calls — sync endpoints are mocked)."""

import uuid
from unittest.mock import patch


class TestListSources:
    def test_list_requires_auth(self, client):
        r = client.get("/api/v1/bq/sources")
        assert r.status_code == 401

    def test_list_empty(self, client, auth_headers):
        r = client.get("/api/v1/bq/sources", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


class TestCreateSource:
    def test_create_source(self, client, auth_headers):
        r = client.post(
            "/api/v1/bq/sources",
            json={"project_id": "my-gcp-project", "display_name": "My Project"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["project_id"] == "my-gcp-project"
        assert data["display_name"] == "My Project"
        assert data["is_active"] is True

    def test_create_duplicate_project_id_returns_409(self, client, auth_headers):
        client.post(
            "/api/v1/bq/sources",
            json={"project_id": "dup-project"},
            headers=auth_headers,
        )
        r = client.post(
            "/api/v1/bq/sources",
            json={"project_id": "dup-project"},
            headers=auth_headers,
        )
        assert r.status_code == 409

    def test_create_requires_auth(self, client):
        r = client.post("/api/v1/bq/sources", json={"project_id": "p"})
        assert r.status_code == 401


class TestUpdateSource:
    def test_update_display_name(self, client, auth_headers):
        r = client.post(
            "/api/v1/bq/sources",
            json={"project_id": "update-proj", "display_name": "Old Name"},
            headers=auth_headers,
        )
        src_id = r.json()["id"]
        r = client.patch(
            f"/api/v1/bq/sources/{src_id}",
            json={"display_name": "New Name"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["display_name"] == "New Name"

    def test_deactivate_source(self, client, auth_headers):
        r = client.post(
            "/api/v1/bq/sources",
            json={"project_id": "deactivate-proj"},
            headers=auth_headers,
        )
        src_id = r.json()["id"]
        r = client.patch(
            f"/api/v1/bq/sources/{src_id}",
            json={"is_active": False},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["is_active"] is False


class TestDeleteSource:
    def test_delete_source(self, client, auth_headers):
        r = client.post(
            "/api/v1/bq/sources",
            json={"project_id": "delete-proj"},
            headers=auth_headers,
        )
        src_id = r.json()["id"]
        r = client.delete(f"/api/v1/bq/sources/{src_id}", headers=auth_headers)
        assert r.status_code == 200

    def test_delete_nonexistent_returns_404(self, client, auth_headers):
        r = client.delete(f"/api/v1/bq/sources/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404


class TestSyncSource:
    def test_sync_single_project_mocked(self, client, auth_headers):
        """Sync endpoint should call bq_sync and return a summary — mock BQ calls."""
        with patch("backend.api.bq.bq_sync.sync_project") as mock_sync:
            mock_sync.return_value = {
                "datasets_added": 2,
                "datasets_updated": 1,
                "tables_added": 5,
                "errors": [],
            }
            r = client.post(
                "/api/v1/bq/sync",
                json={"project_id": "mock-project"},
                headers=auth_headers,
            )
            assert r.status_code == 200

    def test_sync_all_mocked(self, client, auth_headers):
        with patch("backend.api.bq.bq_sync.sync_project") as mock_sync:
            mock_sync.return_value = {"datasets_added": 0, "tables_added": 0, "errors": []}
            r = client.post("/api/v1/bq/sync/all", headers=auth_headers)
            assert r.status_code == 200
