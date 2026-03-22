"""
AI Insights and Data Lineage e2e tests.
Uses real Gemini API (via Vertex AI) and the Data Lineage API in GCP.
"""

import pytest


class TestAIInsights:
    def test_generate_insights_for_real_table(self, api, weather_table):
        """
        Generate AI insights using Gemini for the weather_records table.
        Makes a real Vertex AI / Gemini API call — needs GEMINI_API_KEY in cluster.
        """
        r = api.post(f"/api/v1/tables/{weather_table['id']}/insights")
        assert r.status_code == 200, f"Insights generation failed: {r.text}"
        data = r.json()
        assert "questions" in data
        assert "observations" in data
        assert "use_cases" in data
        assert isinstance(data["questions"], list)
        assert isinstance(data["observations"], list)
        assert isinstance(data["use_cases"], list)
        assert len(data["questions"]) > 0, "Expected at least one suggested question"
        assert len(data["use_cases"]) > 0, "Expected at least one use case"

    def test_insights_persisted_and_retrievable(self, api, weather_table):
        """
        After generating insights, GET /tables/{id} should return them.
        """
        api.post(f"/api/v1/tables/{weather_table['id']}/insights")
        r = api.get(f"/api/v1/tables/{weather_table['id']}")
        assert r.status_code == 200
        tbl = r.json()
        assert tbl["insights"] is not None
        assert "questions" in tbl["insights"]
        assert tbl["insights_generated_at"] is not None

    def test_insights_for_e2e_table(self, api, e2e_table):
        """Generate insights for a freshly created table with schema but no real data."""
        r = api.post(f"/api/v1/tables/{e2e_table['id']}/insights")
        assert r.status_code == 200, f"Insights failed: {r.text}"
        data = r.json()
        assert "questions" in data
        assert "use_cases" in data


class TestLineageDiscover:
    def test_discover_lineage_for_real_table(self, api, weather_table):
        """
        Discover lineage for weather_records using the GCP Data Lineage API.
        Result may have empty upstream/downstream if no lineage tracked — that's OK.
        """
        r = api.get(f"/api/v1/tables/{weather_table['id']}/lineage/discover")
        assert r.status_code == 200, f"Lineage discover failed: {r.text}"
        data = r.json()
        assert "upstream_refs" in data
        assert "downstream_refs" in data
        assert "discovered_upstream" in data
        assert "discovered_downstream" in data
        assert isinstance(data["upstream_refs"], list)
        assert isinstance(data["downstream_refs"], list)

    def test_discover_lineage_updates_table_refs(self, api, weather_table):
        """After discovery, upstream/downstream refs should be saved to the table."""
        api.get(f"/api/v1/tables/{weather_table['id']}/lineage/discover")
        r = api.get(f"/api/v1/tables/{weather_table['id']}")
        assert r.status_code == 200
        tbl = r.json()
        # upstream_refs and downstream_refs should be lists (possibly empty)
        assert isinstance(tbl.get("upstream_refs", []), list)
        assert isinstance(tbl.get("downstream_refs", []), list)

    def test_manual_lineage_update(self, api, e2e_table):
        """Manually set lineage on the e2e table."""
        r = api.put(f"/api/v1/tables/{e2e_table['id']}/lineage", json={
            "upstream_refs": ["formare-ai.weather_data.weather_records"],
            "downstream_refs": ["e2e-tests.output.final_table"],
        })
        assert r.status_code == 200
        data = r.json()
        assert "formare-ai.weather_data.weather_records" in data["upstream_refs"]
        assert "e2e-tests.output.final_table" in data["downstream_refs"]


class TestSchemaChanges:
    def test_list_schema_changes(self, api):
        """Schema changes are populated after BQ sync detects drift."""
        r = api.get("/api/v1/schema-changes")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        for change in r.json():
            assert "table_id" in change
            assert "change_type" in change
            assert "is_acknowledged" in change

    def test_acknowledge_all_schema_changes(self, api, real_tables):
        """Acknowledge all unacknowledged changes for a table (if any)."""
        if not real_tables:
            pytest.skip("No tables in catalog")
        tbl = real_tables[0]
        r = api.post(f"/api/v1/schema-changes/acknowledge-all?table_id={tbl['id']}")
        assert r.status_code == 200
        # Verify none remain
        r = api.get(f"/api/v1/schema-changes?acknowledged=false&table_id={tbl['id']}")
        assert r.status_code == 200
        assert r.json() == []
