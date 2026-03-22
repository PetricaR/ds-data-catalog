"""
Catalog CRUD e2e tests.
Creates real resources in the deployed app, verifies them, then cleans up.
"""

import uuid

import pytest


class TestDatasetCRUD:
    def test_list_datasets_returns_real_data(self, api, real_datasets):
        """Live catalog has real BQ-synced datasets."""
        assert len(real_datasets) > 0
        # All should have a project_id and dataset_id
        for ds in real_datasets:
            assert ds["project_id"]
            assert ds["dataset_id"]
            assert ds["id"]

    def test_get_dataset_by_id(self, api, real_datasets):
        ds = real_datasets[0]
        r = api.get(f"/api/v1/datasets/{ds['id']}")
        assert r.status_code == 200
        assert r.json()["id"] == ds["id"]
        assert r.json()["dataset_id"] == ds["dataset_id"]

    def test_create_update_delete_dataset(self, api):
        uid = uuid.uuid4().hex[:8]
        # Create
        r = api.post("/api/v1/datasets", json={
            "project_id": "e2e-tests",
            "dataset_id": f"e2e_crud_{uid}",
            "display_name": "E2E CRUD Test",
            "description": "Automated e2e test dataset",
            "tags": ["e2e", "crud"],
            "sensitivity_label": "internal",
        })
        assert r.status_code == 201, r.text
        ds = r.json()
        ds_id = ds["id"]
        assert ds["dataset_id"] == f"e2e_crud_{uid}"

        # Read back
        r = api.get(f"/api/v1/datasets/{ds_id}")
        assert r.status_code == 200
        assert r.json()["display_name"] == "E2E CRUD Test"

        # Update
        r = api.put(f"/api/v1/datasets/{ds_id}", json={
            "description": "Updated description",
            "tags": ["e2e", "updated"],
            "sensitivity_label": "confidential",
        })
        assert r.status_code == 200
        updated = r.json()
        assert updated["description"] == "Updated description"
        assert updated["sensitivity_label"] == "confidential"
        assert "updated" in updated["tags"]

        # Validate
        r = api.patch(f"/api/v1/datasets/{ds_id}/validate?validated_by=e2e@example.com")
        assert r.status_code == 200
        assert r.json()["is_validated"] is True
        assert r.json()["validated_by"] == "e2e@example.com"

        # Revoke validation (toggle)
        r = api.patch(f"/api/v1/datasets/{ds_id}/validate")
        assert r.status_code == 200
        assert r.json()["is_validated"] is False

        # Set used_in_projects
        r = api.put(f"/api/v1/datasets/{ds_id}/projects", json=[
            {"project_name": "E2E ML Project", "jira_id": "E2E-1", "repo_url": "https://github.com/e2e/test"}
        ])
        assert r.status_code == 200
        assert r.json()["used_in_projects"][0]["project_name"] == "E2E ML Project"

        # Delete
        r = api.delete(f"/api/v1/datasets/{ds_id}")
        assert r.status_code == 204

        # Confirm gone
        r = api.get(f"/api/v1/datasets/{ds_id}")
        assert r.status_code == 404

    def test_duplicate_dataset_id_returns_409(self, api, e2e_dataset):
        r = api.post("/api/v1/datasets", json={
            "project_id": e2e_dataset["project_id"],
            "dataset_id": e2e_dataset["dataset_id"],
        })
        assert r.status_code == 409


class TestTableCRUD:
    def test_list_tables_returns_real_data(self, api, real_tables):
        """Live catalog has real BQ-synced tables."""
        assert len(real_tables) > 0
        for t in real_tables:
            assert t["table_id"]
            assert t["dataset_id"]
            assert t["id"]

    def test_get_table_includes_columns(self, api, real_tables):
        # Pick any table that has columns
        tbl = next((t for t in real_tables if len(t.get("columns", [])) > 0), None)
        if tbl is None:
            pytest.skip("No tables with columns found")
        r = api.get(f"/api/v1/tables/{tbl['id']}")
        assert r.status_code == 200
        assert len(r.json()["columns"]) > 0

    def test_create_update_delete_table(self, api, e2e_dataset):
        uid = uuid.uuid4().hex[:8]
        # Create with columns
        r = api.post("/api/v1/tables", json={
            "dataset_id": e2e_dataset["id"],
            "table_id": f"e2e_tbl_{uid}",
            "display_name": "E2E Table",
            "description": "Automated e2e table",
            "tags": ["e2e"],
            "sensitivity_label": "internal",
            "columns": [
                {"name": "id", "data_type": "INTEGER", "is_nullable": False, "is_primary_key": True, "position": 0},
                {"name": "email", "data_type": "STRING", "is_nullable": True, "is_primary_key": False, "position": 1},
                {"name": "amount", "data_type": "FLOAT64", "is_nullable": True, "is_primary_key": False, "position": 2},
            ],
        })
        assert r.status_code == 201, r.text
        tbl = r.json()
        tbl_id = tbl["id"]
        assert len(tbl["columns"]) == 3

        # Update description
        r = api.put(f"/api/v1/tables/{tbl_id}", json={"description": "Updated table desc"})
        assert r.status_code == 200
        assert r.json()["description"] == "Updated table desc"

        # Patch column description
        col_id = tbl["columns"][0]["id"]
        r = api.patch(f"/api/v1/tables/{tbl_id}/columns", json=[
            {"id": col_id, "description": "Primary key column"}
        ])
        assert r.status_code == 200
        cols = r.json()["columns"]
        updated_col = next(c for c in cols if c["id"] == col_id)
        assert updated_col["description"] == "Primary key column"

        # Toggle PII on email column
        email_col = next(c for c in tbl["columns"] if c["name"] == "email")
        r = api.patch(f"/api/v1/tables/{tbl_id}/columns/{email_col['id']}/pii", json={"is_pii": True})
        assert r.status_code == 200
        assert r.json()["is_pii"] is True

        # Set example queries
        r = api.patch(f"/api/v1/tables/{tbl_id}/queries", json=[
            {"title": "Count all rows", "sql": f"SELECT COUNT(*) FROM `e2e_tbl_{uid}`"},
            {"title": "Sample rows", "sql": f"SELECT * FROM `e2e_tbl_{uid}` LIMIT 10"},
        ])
        assert r.status_code == 200
        assert len(r.json()["example_queries"]) == 2

        # Clear queries
        r = api.patch(f"/api/v1/tables/{tbl_id}/queries", json=[])
        assert r.status_code == 200
        assert r.json()["example_queries"] == []

        # Validate table
        r = api.patch(f"/api/v1/tables/{tbl_id}/validate", json={
            "validated_by": "e2e@example.com",
            "validated_columns": ["id", "email"],
        })
        assert r.status_code == 200
        assert r.json()["is_validated"] is True
        assert "id" in r.json()["validated_columns"]

        # Set lineage
        r = api.put(f"/api/v1/tables/{tbl_id}/lineage", json={
            "upstream_refs": ["proj.dataset.source_table"],
            "downstream_refs": ["proj.dataset.sink_table"],
        })
        assert r.status_code == 200
        assert "proj.dataset.source_table" in r.json()["upstream_refs"]

        # Set DS projects
        r = api.put(f"/api/v1/tables/{tbl_id}/projects", json=[
            {"project_name": "Churn Model", "jira_id": "DS-100", "repo_url": "https://github.com/org/churn"}
        ])
        assert r.status_code == 200
        assert r.json()["used_in_projects"][0]["project_name"] == "Churn Model"

        # Delete
        r = api.delete(f"/api/v1/tables/{tbl_id}")
        assert r.status_code == 204

        r = api.get(f"/api/v1/tables/{tbl_id}")
        assert r.status_code == 404
