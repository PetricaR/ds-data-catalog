"""
Data preview, insights, and lineage discovery tests.
All external GCP calls (BigQuery, Vertex AI, Data Lineage API) are mocked.
"""

from unittest.mock import patch


class TestDataPreview:
    def test_preview_estimate_mocked(self, client, auth_headers, seed_table, seed_dataset):
        mock_result = {
            "query": "SELECT * FROM `test-project.test_dataset.test_table` TABLESAMPLE SYSTEM (1 PERCENT)",
            "estimated_bytes": 1024 * 1024,
            "estimated_mb": 1.0,
            "estimated_cost_usd": 0.000005,
        }

        with patch("backend.api.tables.bq_preview.estimate") as mock_fn:
            mock_fn.return_value = mock_result
            r = client.get(f"/api/v1/tables/{seed_table.id}/preview", headers=auth_headers)

        assert r.status_code == 200
        data = r.json()
        assert "query" in data
        assert "estimated_mb" in data
        assert data["estimated_mb"] == 1.0

    def test_preview_run_mocked(self, client, auth_headers, seed_table, seed_dataset):
        mock_result = {
            "columns": ["id", "name"],
            "rows": [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}],
        }

        with patch("backend.api.tables.bq_preview.run") as mock_fn:
            mock_fn.return_value = mock_result
            r = client.post(f"/api/v1/tables/{seed_table.id}/preview/run", headers=auth_headers)

        assert r.status_code == 200
        data = r.json()
        assert data["columns"] == ["id", "name"]
        assert len(data["rows"]) == 2


class TestQualityCheck:
    def test_quality_check_mocked(self, client, auth_headers, seed_table, seed_column):
        mock_result = {
            "total_rows": 5000,
            "columns": [
                {
                    "name": "id",
                    "data_type": "INTEGER",
                    "null_count": 0,
                    "null_rate": 0.0,
                    "min_value": "1",
                    "max_value": "5000",
                }
            ],
            "checked_at": "2026-03-22T10:00:00Z",
        }

        with patch("backend.api.tables.bq_quality.run") as mock_fn:
            mock_fn.return_value = mock_result
            r = client.post(f"/api/v1/tables/{seed_table.id}/quality-check", headers=auth_headers)

        assert r.status_code == 200
        data = r.json()
        assert "total_rows" in data
        assert "columns" in data
        assert data["total_rows"] == 5000


class TestInsights:
    def test_generate_insights_mocked(self, client, auth_headers, seed_table):
        mock_insights = {
            "questions": ["What is the revenue trend?"],
            "observations": ["99% of rows have non-null values"],
            "use_cases": ["Churn prediction", "Revenue forecasting"],
        }

        with patch("backend.services.insights.generate_insights") as mock_fn:
            mock_fn.return_value = mock_insights
            r = client.post(f"/api/v1/tables/{seed_table.id}/insights", headers=auth_headers)

        assert r.status_code == 200
        data = r.json()
        assert "questions" in data
        assert "observations" in data
        assert "use_cases" in data
        assert len(data["questions"]) == 1
        assert "Churn prediction" in data["use_cases"]

    def test_insights_persisted_after_generation(self, client, auth_headers, seed_table):
        mock_insights = {
            "questions": ["Q1"],
            "observations": ["O1"],
            "use_cases": ["UC1"],
        }
        with patch("backend.services.insights.generate_insights") as mock_fn:
            mock_fn.return_value = mock_insights
            client.post(f"/api/v1/tables/{seed_table.id}/insights", headers=auth_headers)

        r = client.get(f"/api/v1/tables/{seed_table.id}", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["insights"] is not None
        assert r.json()["insights"]["questions"] == ["Q1"]


class TestLineageDiscover:
    def test_discover_lineage_mocked(self, client, auth_headers, seed_table, seed_dataset):
        with patch("backend.api.tables.bq_lineage.discover") as mock_fn:
            mock_fn.return_value = {
                "upstream_refs": ["proj.ds.source_table"],
                "downstream_refs": ["proj.ds.sink_table"],
            }
            r = client.get(
                f"/api/v1/tables/{seed_table.id}/lineage/discover",
                headers=auth_headers,
            )

        assert r.status_code == 200
        data = r.json()
        assert "upstream_refs" in data
        assert "downstream_refs" in data
        assert "discovered_upstream" in data
        assert "discovered_downstream" in data
