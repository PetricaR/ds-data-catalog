"""Stats and tags endpoint tests."""


class TestStats:
    def test_stats_requires_auth(self, client):
        r = client.get("/api/v1/stats")
        assert r.status_code == 401

    def test_stats_structure(self, client, auth_headers):
        r = client.get("/api/v1/stats", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert "total_datasets" in data
        assert "total_tables" in data
        assert "total_columns" in data
        assert "documented_tables" in data
        assert "documentation_coverage" in data

    def test_stats_counts_are_non_negative(self, client, auth_headers):
        r = client.get("/api/v1/stats", headers=auth_headers)
        data = r.json()
        assert data["total_datasets"] >= 0
        assert data["total_tables"] >= 0
        assert data["total_columns"] >= 0
        assert 0.0 <= data["documentation_coverage"] <= 100.0

    def test_stats_increases_after_create(self, client, auth_headers):
        before = client.get("/api/v1/stats", headers=auth_headers).json()["total_datasets"]
        client.post(
            "/api/v1/datasets",
            json={"project_id": "p", "dataset_id": f"stats_test_{before}"},
            headers=auth_headers,
        )
        after = client.get("/api/v1/stats", headers=auth_headers).json()["total_datasets"]
        assert after == before + 1


class TestTags:
    def test_tags_requires_auth(self, client):
        r = client.get("/api/v1/tags")
        assert r.status_code == 401

    def test_tags_returns_list(self, client, auth_headers):
        r = client.get("/api/v1/tags", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_tags_includes_seeded_tags(self, client, auth_headers, seed_dataset):
        r = client.get("/api/v1/tags", headers=auth_headers)
        tags = r.json()
        # seed_dataset has tags ["test", "sample"]
        assert "test" in tags
        assert "sample" in tags

    def test_tags_are_unique(self, client, auth_headers, seed_dataset, seed_table):
        r = client.get("/api/v1/tags", headers=auth_headers)
        tags = r.json()
        assert len(tags) == len(set(tags))
