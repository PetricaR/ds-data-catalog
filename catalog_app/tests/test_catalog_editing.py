"""Registering, editing and removing datasets and tables by hand, as the dataset and table pages do."""

from backend.models.catalog import Table


class TestRegisterAgain:
    def test_removed_dataset_comes_back_with_its_tables(self, client, auth_headers, seed_dataset, seed_table):
        assert client.delete(f"/api/v1/datasets/{seed_dataset.id}", headers=auth_headers).status_code == 204
        assert client.get(f"/api/v1/tables/{seed_table.id}", headers=auth_headers).status_code == 404
        r = client.post("/api/v1/datasets", json={
            "project_id": seed_dataset.project_id, "dataset_id": seed_dataset.dataset_id, "owner": "new@example.com",
        }, headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["id"] == str(seed_dataset.id)
        assert r.json()["owner"] == "new@example.com"
        assert r.json()["description"] == "A test dataset"  # not given now, so kept
        assert r.json()["tags"] == ["test", "sample"] and r.json()["sensitivity_label"] == "internal"
        assert client.get(f"/api/v1/datasets/{seed_dataset.id}", headers=auth_headers).status_code == 200
        assert r.json()["table_count"] == 1
        assert client.get(f"/api/v1/tables/{seed_table.id}", headers=auth_headers).status_code == 200

    def test_active_dataset_is_a_conflict(self, client, auth_headers, seed_dataset):
        r = client.post("/api/v1/datasets", json={
            "project_id": seed_dataset.project_id, "dataset_id": seed_dataset.dataset_id,
        }, headers=auth_headers)
        assert r.status_code == 409

    def test_removed_table_comes_back_with_new_columns(self, client, db, auth_headers, seed_table, seed_column):
        assert client.delete(f"/api/v1/tables/{seed_table.id}", headers=auth_headers).status_code == 204
        r = client.post("/api/v1/tables", json={
            "dataset_id": str(seed_table.dataset_id), "table_id": seed_table.table_id,
            "columns": [{"name": "order_id", "data_type": "STRING", "description": "Order number", "position": 0}],
        }, headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["id"] == str(seed_table.id)
        assert [c["name"] for c in r.json()["columns"]] == ["order_id"]
        assert db.get(Table, seed_table.id).is_active

    def test_new_table_gets_a_documentation_score(self, client, auth_headers, seed_dataset):
        r = client.post("/api/v1/tables", json={
            "dataset_id": str(seed_dataset.id), "table_id": "orders", "description": "One row per order",
        }, headers=auth_headers)
        assert r.status_code == 201
        assert r.json()["quality_score"] == 30


class TestRemoved:
    def test_schema_changes_of_removed_tables_are_not_listed(self, client, db, auth_headers, seed_table):
        from tests.test_schema_changes import seed_change
        seed_change(db, seed_table.id, column_name="gone_col")
        assert "gone_col" in {c["column_name"] for c in client.get("/api/v1/schema-changes", headers=auth_headers).json()}
        client.delete(f"/api/v1/tables/{seed_table.id}", headers=auth_headers)
        assert "gone_col" not in {c["column_name"] for c in client.get("/api/v1/schema-changes", headers=auth_headers).json()}


class TestValidation:
    def test_unknown_sensitivity_label_is_rejected(self, client, auth_headers, seed_dataset, seed_table):
        assert client.post("/api/v1/datasets", json={"project_id": "p", "dataset_id": "d", "sensitivity_label": "secret"},
                           headers=auth_headers).status_code == 422
        assert client.put(f"/api/v1/datasets/{seed_dataset.id}", json={"sensitivity_label": "secret"},
                          headers=auth_headers).status_code == 422
        assert client.put(f"/api/v1/tables/{seed_table.id}", json={"sensitivity_label": "top"},
                          headers=auth_headers).status_code == 422

    def test_empty_ids_are_rejected(self, client, auth_headers, seed_dataset):
        assert client.post("/api/v1/datasets", json={"project_id": "p", "dataset_id": ""},
                           headers=auth_headers).status_code == 422
        assert client.post("/api/v1/tables", json={"dataset_id": str(seed_dataset.id), "table_id": ""},
                           headers=auth_headers).status_code == 422


class TestDatasetValidated:
    def test_says_what_it_means(self, client, auth_headers, seed_dataset):
        url = f"/api/v1/datasets/{seed_dataset.id}/validate"
        first = client.patch(url, json={"validated": True}, headers=auth_headers).json()
        assert first["is_validated"] is True
        again = client.patch(url, json={"validated": True}, headers=auth_headers).json()
        assert again["is_validated"] is True and again["validated_at"] == first["validated_at"]
        assert client.patch(url, json={"validated": False}, headers=auth_headers).json()["is_validated"] is False

    def test_without_a_body_it_still_toggles(self, client, auth_headers, seed_dataset):
        url = f"/api/v1/datasets/{seed_dataset.id}/validate"
        assert client.patch(url, headers=auth_headers).json()["is_validated"] is True
        assert client.patch(url, headers=auth_headers).json()["is_validated"] is False


class TestTagFilters:
    """The search page's tag filter; the generic SQLAlchemy ARRAY had no overlap operator, so these were 500s."""

    def test_search_by_tag(self, client, auth_headers, seed_table):
        r = client.get("/api/v1/search", params={"q": "test", "tags": ["test", "other"]}, headers=auth_headers)
        assert r.status_code == 200
        assert str(seed_table.id) in {res["id"] for res in r.json()["results"]}
        r = client.get("/api/v1/search", params={"q": "test", "tags": ["nope"]}, headers=auth_headers)
        assert r.json()["total"] == 0

    def test_list_by_tag(self, client, auth_headers, seed_table):
        tables = client.get("/api/v1/tables", params={"tags": "test"}, headers=auth_headers)
        datasets = client.get("/api/v1/datasets", params={"tags": "sample"}, headers=auth_headers)
        assert tables.status_code == datasets.status_code == 200
        assert str(seed_table.id) in {t["id"] for t in tables.json()}
        assert str(seed_table.dataset_id) in {d["id"] for d in datasets.json()}
