"""Table CRUD, columns, lineage, queries, validation, projects endpoint tests."""

import uuid


class TestListTables:
    def test_list_returns_seeded_table(self, client, auth_headers, seed_table):
        r = client.get("/api/v1/tables", headers=auth_headers)
        assert r.status_code == 200
        ids = [t["id"] for t in r.json()]
        assert str(seed_table.id) in ids

    def test_list_filter_by_dataset(self, client, auth_headers, seed_table, seed_dataset):
        r = client.get(f"/api/v1/tables?dataset_id={seed_dataset.id}", headers=auth_headers)
        assert r.status_code == 200
        assert all(t["dataset_id"] == str(seed_dataset.id) for t in r.json())


class TestCreateTable:
    def test_create_with_columns(self, client, auth_headers, seed_dataset):
        payload = {
            "dataset_id": str(seed_dataset.id),
            "table_id": "new_table",
            "display_name": "New Table",
            "description": "desc",
            "tags": ["tag"],
            "sensitivity_label": "internal",
            "columns": [
                {"name": "id", "data_type": "INTEGER", "is_nullable": False, "is_primary_key": True, "position": 0},
                {"name": "name", "data_type": "STRING", "is_nullable": True, "is_primary_key": False, "position": 1},
            ],
        }
        r = client.post("/api/v1/tables", json=payload, headers=auth_headers)
        assert r.status_code == 201
        data = r.json()
        assert data["table_id"] == "new_table"
        assert len(data["columns"]) == 2

    def test_create_missing_dataset_id(self, client, auth_headers):
        r = client.post("/api/v1/tables", json={"table_id": "t"}, headers=auth_headers)
        assert r.status_code == 422


class TestGetTable:
    def test_get_existing(self, client, auth_headers, seed_table):
        r = client.get(f"/api/v1/tables/{seed_table.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == str(seed_table.id)

    def test_get_includes_columns(self, client, auth_headers, seed_table, seed_column):
        r = client.get(f"/api/v1/tables/{seed_table.id}", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()["columns"]) >= 1

    def test_get_nonexistent_returns_404(self, client, auth_headers):
        r = client.get(f"/api/v1/tables/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404


class TestUpdateTable:
    def test_update_description(self, client, auth_headers, seed_table):
        r = client.put(
            f"/api/v1/tables/{seed_table.id}",
            json={"description": "updated"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["description"] == "updated"

    def test_update_sensitivity_label(self, client, auth_headers, seed_table):
        r = client.put(
            f"/api/v1/tables/{seed_table.id}",
            json={"sensitivity_label": "confidential"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["sensitivity_label"] == "confidential"


class TestValidateTable:
    def test_validate_table(self, client, auth_headers, seed_table, seed_column):
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/validate",
            json={"validated_by": "ds@example.com", "validated_columns": ["id"]},
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert data["is_validated"] is True
        assert data["validated_by"] == "ds@example.com"
        assert "id" in data["validated_columns"]


class TestPatchColumns:
    def test_patch_column_description(self, client, auth_headers, seed_table, seed_column):
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/columns",
            json=[{"id": str(seed_column.id), "description": "primary key column"}],
            headers=auth_headers,
        )
        assert r.status_code == 200
        cols = r.json()["columns"]
        updated = next(c for c in cols if c["id"] == str(seed_column.id))
        assert updated["description"] == "primary key column"

    def test_patch_column_primary_key(self, client, auth_headers, seed_table, seed_column):
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/columns",
            json=[{"id": str(seed_column.id), "is_primary_key": False}],
            headers=auth_headers,
        )
        assert r.status_code == 200


class TestPiiToggle:
    def test_toggle_pii_on(self, client, auth_headers, seed_table, seed_column):
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/columns/{seed_column.id}/pii",
            json={"is_pii": True},
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_toggle_pii_off(self, client, auth_headers, seed_table, seed_column):
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/columns/{seed_column.id}/pii",
            json={"is_pii": False},
            headers=auth_headers,
        )
        assert r.status_code == 200


class TestExampleQueries:
    def test_patch_queries(self, client, auth_headers, seed_table):
        queries = [
            {"title": "Get all rows", "sql": "SELECT * FROM test_table"},
            {"title": "Count rows", "sql": "SELECT COUNT(*) FROM test_table"},
        ]
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/queries",
            json=queries,
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert len(r.json()["example_queries"]) == 2

    def test_clear_queries(self, client, auth_headers, seed_table):
        r = client.patch(
            f"/api/v1/tables/{seed_table.id}/queries",
            json=[],
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["example_queries"] == []


class TestLineage:
    def test_update_lineage(self, client, auth_headers, seed_table):
        r = client.put(
            f"/api/v1/tables/{seed_table.id}/lineage",
            json={
                "upstream_refs": ["proj.ds.upstream_table"],
                "downstream_refs": ["proj.ds.downstream_table"],
            },
            headers=auth_headers,
        )
        assert r.status_code == 200
        data = r.json()
        assert "proj.ds.upstream_table" in data["upstream_refs"]
        assert "proj.ds.downstream_table" in data["downstream_refs"]

    def test_clear_lineage(self, client, auth_headers, seed_table):
        r = client.put(
            f"/api/v1/tables/{seed_table.id}/lineage",
            json={"upstream_refs": [], "downstream_refs": []},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["upstream_refs"] == []
        assert r.json()["downstream_refs"] == []


class TestTableProjects:
    def test_update_projects(self, client, auth_headers, seed_table):
        projects = [
            {"project_name": "Churn Model", "jira_id": "DS-42", "repo_url": "https://github.com/org/churn"}
        ]
        r = client.put(
            f"/api/v1/tables/{seed_table.id}/projects",
            json=projects,
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["used_in_projects"][0]["project_name"] == "Churn Model"

    def test_clear_projects(self, client, auth_headers, seed_table):
        r = client.put(
            f"/api/v1/tables/{seed_table.id}/projects",
            json=[],
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["used_in_projects"] == []


class TestDeleteTable:
    def test_delete_table(self, client, auth_headers, seed_dataset):
        # Create a fresh table to delete
        r = client.post(
            "/api/v1/tables",
            json={"dataset_id": str(seed_dataset.id), "table_id": "to_delete"},
            headers=auth_headers,
        )
        tbl_id = r.json()["id"]
        r = client.delete(f"/api/v1/tables/{tbl_id}", headers=auth_headers)
        assert r.status_code == 204

    def test_delete_nonexistent_returns_404(self, client, auth_headers):
        r = client.delete(f"/api/v1/tables/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404
