"""Dataset CRUD endpoint tests."""

import uuid


class TestListDatasets:
    def test_list_empty(self, client, auth_headers):
        r = client.get("/api/v1/datasets", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_requires_auth(self, client):
        r = client.get("/api/v1/datasets")
        assert r.status_code == 401

    def test_list_returns_seeded_dataset(self, client, auth_headers, seed_dataset):
        r = client.get("/api/v1/datasets", headers=auth_headers)
        ids = [d["id"] for d in r.json()]
        assert str(seed_dataset.id) in ids

    def test_list_filter_by_sensitivity(self, client, auth_headers, seed_dataset):
        r = client.get("/api/v1/datasets?sensitivity_label=internal", headers=auth_headers)
        assert r.status_code == 200
        for d in r.json():
            assert d["sensitivity_label"] == "internal"


class TestCreateDataset:
    def test_create_success(self, client, auth_headers):
        payload = {
            "project_id": "proj-1",
            "dataset_id": "ds_new",
            "display_name": "New Dataset",
            "description": "desc",
            "owner": "owner@example.com",
            "tags": ["tag1"],
            "sensitivity_label": "internal",
        }
        r = client.post("/api/v1/datasets", json=payload, headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert data["dataset_id"] == "ds_new"
        assert data["project_id"] == "proj-1"
        assert "id" in data

    def test_create_requires_auth(self, client):
        r = client.post("/api/v1/datasets", json={"project_id": "p", "dataset_id": "d"})
        assert r.status_code == 401

    def test_create_missing_required_fields(self, client, auth_headers):
        r = client.post("/api/v1/datasets", json={"display_name": "oops"}, headers=auth_headers)
        assert r.status_code == 422


class TestGetDataset:
    def test_get_existing(self, client, auth_headers, seed_dataset):
        r = client.get(f"/api/v1/datasets/{seed_dataset.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["id"] == str(seed_dataset.id)

    def test_get_nonexistent_returns_404(self, client, auth_headers):
        r = client.get(f"/api/v1/datasets/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404

    def test_get_requires_auth(self, client, seed_dataset):
        r = client.get(f"/api/v1/datasets/{seed_dataset.id}")
        assert r.status_code == 401


class TestUpdateDataset:
    def test_update_description(self, client, auth_headers, seed_dataset):
        r = client.put(
            f"/api/v1/datasets/{seed_dataset.id}",
            json={"description": "updated desc"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["description"] == "updated desc"

    def test_update_tags(self, client, auth_headers, seed_dataset):
        r = client.put(
            f"/api/v1/datasets/{seed_dataset.id}",
            json={"tags": ["new", "tags"]},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert set(r.json()["tags"]) == {"new", "tags"}

    def test_update_nonexistent_returns_404(self, client, auth_headers):
        r = client.put(
            f"/api/v1/datasets/{uuid.uuid4()}",
            json={"description": "x"},
            headers=auth_headers,
        )
        assert r.status_code == 404


class TestValidateDataset:
    def test_validate_dataset(self, client, auth_headers, seed_dataset):
        r = client.patch(
            f"/api/v1/datasets/{seed_dataset.id}/validate",
            json={"validated_by": "validator@example.com"},
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["is_validated"] is True
        assert r.json()["validated_by"] == "validator@example.com"

    def test_revoke_validation(self, client, auth_headers, seed_dataset):
        # First validate
        client.patch(
            f"/api/v1/datasets/{seed_dataset.id}/validate",
            json={"validated_by": "v@example.com"},
            headers=auth_headers,
        )
        # Then revoke (validate again toggles off)
        r = client.patch(
            f"/api/v1/datasets/{seed_dataset.id}/validate",
            json={"validated_by": "v@example.com"},
            headers=auth_headers,
        )
        assert r.status_code == 200


class TestDatasetProjects:
    def test_update_projects(self, client, auth_headers, seed_dataset):
        projects = [
            {"project_name": "ML Project", "jira_id": "ML-123", "repo_url": "https://github.com/org/repo"}
        ]
        r = client.put(
            f"/api/v1/datasets/{seed_dataset.id}/projects",
            json=projects,
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["used_in_projects"][0]["project_name"] == "ML Project"


class TestDeleteDataset:
    def test_delete_dataset(self, client, auth_headers):
        # Create a fresh one to delete
        r = client.post(
            "/api/v1/datasets",
            json={"project_id": "p", "dataset_id": "to_delete"},
            headers=auth_headers,
        )
        ds_id = r.json()["id"]
        r = client.delete(f"/api/v1/datasets/{ds_id}", headers=auth_headers)
        assert r.status_code == 200

    def test_delete_nonexistent_returns_404(self, client, auth_headers):
        r = client.delete(f"/api/v1/datasets/{uuid.uuid4()}", headers=auth_headers)
        assert r.status_code == 404
