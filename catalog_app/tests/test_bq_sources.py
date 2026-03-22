"""BigQuery sources endpoint tests (no real BQ calls — sync endpoints are mocked)."""

import uuid
from unittest.mock import MagicMock, patch


class TestListSources:
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
        assert r.status_code == 201
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
        assert r.status_code == 204

    def test_delete_nonexistent_returns_404(self, client, auth_headers):
        r = client.delete(f"/api/v1/bq/sources/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404


class TestSyncSource:
    def test_sync_single_project_mocked(self, client, auth_headers):
        """Sync endpoint should call sync_project and return a summary — mock BQ calls."""
        mock_result = MagicMock()
        mock_result.errors = []
        mock_result.to_dict.return_value = {
            "datasets_added": 2,
            "datasets_updated": 1,
            "tables_added": 5,
            "errors": [],
        }
        with patch("backend.api.bq.sync_project", return_value=mock_result):
            r = client.post(
                "/api/v1/bq/sync",
                json={"project_id": "mock-project"},
                headers=auth_headers,
            )
        assert r.status_code == 200

    def test_sync_all_mocked(self, client, auth_headers):
        # Create a source first so sync/all has something to process
        r = client.post(
            "/api/v1/bq/sources",
            json={"project_id": "sync-all-proj"},
            headers=auth_headers,
        )
        assert r.status_code == 201

        mock_result = MagicMock()
        mock_result.errors = []
        mock_result.to_dict.return_value = {"datasets_added": 0, "tables_added": 0, "errors": []}
        with patch("backend.api.bq.sync_project", return_value=mock_result):
            r = client.post("/api/v1/bq/sync/all", headers=auth_headers)
        assert r.status_code == 200
