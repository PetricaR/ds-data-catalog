"""
BigQuery sync e2e tests.
Tests the real /bq/sync endpoint against the formare-ai GCP project.
Workload Identity provides credentials in the cluster — no additional setup needed.
"""

import pytest


class TestGCPSources:
    def test_list_sources(self, api):
        r = api.get("/api/v1/bq/sources")
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_source_lifecycle(self, api):
        """Create → update → delete a GCP source."""
        # Create
        r = api.post("/api/v1/bq/sources", json={
            "project_id": "e2e-sync-test-project",
            "display_name": "E2E Sync Test",
        })
        assert r.status_code == 201, r.text
        src = r.json()
        src_id = src["id"]
        assert src["project_id"] == "e2e-sync-test-project"
        assert src["is_active"] is True

        # Update display name
        r = api.patch(f"/api/v1/bq/sources/{src_id}", json={"display_name": "Updated Name"})
        assert r.status_code == 200
        assert r.json()["display_name"] == "Updated Name"

        # Deactivate
        r = api.patch(f"/api/v1/bq/sources/{src_id}", json={"is_active": False})
        assert r.status_code == 200
        assert r.json()["is_active"] is False

        # Delete
        r = api.delete(f"/api/v1/bq/sources/{src_id}")
        assert r.status_code == 204

    def test_duplicate_source_returns_409(self, api):
        import uuid
        pid = f"dup-{uuid.uuid4().hex[:6]}"
        api.post("/api/v1/bq/sources", json={"project_id": pid})
        r = api.post("/api/v1/bq/sources", json={"project_id": pid})
        # cleanup first source
        sources = api.get("/api/v1/bq/sources").json()
        for s in sources:
            if s["project_id"] == pid:
                api.delete(f"/api/v1/bq/sources/{s['id']}")
        assert r.status_code == 409


class TestBQSync:
    def test_sync_formare_ai_project(self, api):
        """
        Sync the real formare-ai project.
        Uses Workload Identity in the cluster — makes real BQ API calls.
        Expects datasets_added or datasets_updated > 0 (or 0 if already in sync).
        """
        r = api.post("/api/v1/bq/sync", json={"project_id": "formare-ai"})
        assert r.status_code == 200, f"Sync failed: {r.text}"
        data = r.json()
        assert "project_id" in data
        assert data["project_id"] == "formare-ai"
        assert "result" in data
        result = data["result"]
        assert "errors" in result
        assert result["errors"] == [], f"Sync had errors: {result['errors']}"
        # After sync, totals should be non-negative
        assert result.get("datasets_added", 0) >= 0
        assert result.get("tables_added", 0) >= 0

    def test_sync_updates_existing_catalog(self, api, real_datasets):
        """After sync, all real datasets still exist in catalog."""
        api.post("/api/v1/bq/sync", json={"project_id": "formare-ai"})
        r = api.get("/api/v1/datasets")
        current_ids = {d["dataset_id"] for d in r.json()}
        for ds in real_datasets:
            if ds["project_id"] == "formare-ai":
                assert ds["dataset_id"] in current_ids, (
                    f"Dataset {ds['dataset_id']} disappeared after sync"
                )
