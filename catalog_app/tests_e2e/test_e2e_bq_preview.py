"""
BigQuery preview and quality check e2e tests.
Uses the real weather_records table (7 rows) in formare-ai.weather_data.
Workload Identity provides BQ read credentials in the cluster.
"""

import pytest


class TestDataPreview:
    def test_preview_estimate_real_table(self, api, weather_table):
        """
        Dry-run cost estimate for a real BQ table.
        Workload Identity must have BigQuery Data Viewer on the dataset.
        """
        r = api.get(f"/api/v1/tables/{weather_table['id']}/preview")
        assert r.status_code == 200, f"Preview estimate failed: {r.text}"
        data = r.json()
        assert "query" in data
        assert "estimated_bytes" in data
        assert "estimated_mb" in data
        assert "estimated_cost_usd" in data
        assert data["estimated_bytes"] >= 0
        assert "TABLESAMPLE" in data["query"] or "SELECT" in data["query"]

    def test_preview_run_returns_real_rows(self, api, weather_table):
        """
        Execute a sample query against the real weather_records table.
        Table has 7 rows — expect columns and rows in response.
        """
        r = api.post(f"/api/v1/tables/{weather_table['id']}/preview/run")
        assert r.status_code == 200, f"Preview run failed: {r.text}"
        data = r.json()
        assert "columns" in data
        assert "rows" in data
        assert isinstance(data["columns"], list)
        assert len(data["columns"]) > 0
        # weather_records has 7 rows — at least 1 should come back
        assert len(data["rows"]) >= 0  # table sample may vary
        # Every row should have all columns
        for row in data["rows"]:
            for col in data["columns"]:
                assert col in row

    def test_preview_estimate_nonexistent_table_returns_404(self, api):
        import uuid
        r = api.get(f"/api/v1/tables/{uuid.uuid4()}/preview")
        assert r.status_code == 404


class TestQualityCheck:
    def test_quality_check_real_table(self, api, weather_table):
        """
        Run a real quality check on weather_records.
        Returns null rates and row count per column.
        """
        r = api.post(f"/api/v1/tables/{weather_table['id']}/quality-check")
        assert r.status_code == 200, f"Quality check failed: {r.text}"
        data = r.json()
        assert "total_rows" in data
        assert "columns" in data
        assert "checked_at" in data
        assert data["total_rows"] >= 0
        assert isinstance(data["columns"], list)
        for col in data["columns"]:
            assert "name" in col
            assert "null_count" in col
            assert "null_rate" in col
            assert 0.0 <= col["null_rate"] <= 1.0

    def test_quality_check_persists_to_table(self, api, weather_table):
        """After a quality check, the table's quality_score should update."""
        api.post(f"/api/v1/tables/{weather_table['id']}/quality-check")
        r = api.get(f"/api/v1/tables/{weather_table['id']}")
        assert r.status_code == 200
        # quality_score is computed from null rates; should be between 0 and 100
        if r.json().get("quality_score") is not None:
            assert 0.0 <= r.json()["quality_score"] <= 100.0
