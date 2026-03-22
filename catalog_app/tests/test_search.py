"""Search endpoint tests."""


class TestSearch:
    def test_search_requires_nonempty_query(self, client, auth_headers):
        # q with min_length=1, empty string returns 422
        r = client.get("/api/v1/search?q=", headers=auth_headers)
        assert r.status_code == 422

    def test_search_returns_structure(self, client, auth_headers, seed_dataset, seed_table):
        r = client.get("/api/v1/search?q=test", headers=auth_headers)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data["results"], list)
        assert data["query"] == "test"

    def test_search_filter_by_type_dataset(self, client, auth_headers, seed_dataset):
        r = client.get("/api/v1/search?q=test&entity_type=dataset", headers=auth_headers)
        assert r.status_code == 200
        for result in r.json()["results"]:
            assert result["entity_type"] == "dataset"

    def test_search_filter_by_type_table(self, client, auth_headers, seed_table):
        r = client.get("/api/v1/search?q=test&entity_type=table", headers=auth_headers)
        assert r.status_code == 200
        for result in r.json()["results"]:
            assert result["entity_type"] == "table"

    def test_search_pagination(self, client, auth_headers, seed_dataset):
        r = client.get("/api/v1/search?q=test&skip=0&limit=5", headers=auth_headers)
        assert r.status_code == 200
        assert len(r.json()["results"]) <= 5


class TestColumnSearch:
    def test_column_search_returns_list(self, client, auth_headers, seed_column):
        r = client.get("/api/v1/search/columns?name=id", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_column_search_requires_nonempty_name(self, client, auth_headers):
        # name with min_length=1, empty string returns 422
        r = client.get("/api/v1/search/columns?name=", headers=auth_headers)
        assert r.status_code == 422
