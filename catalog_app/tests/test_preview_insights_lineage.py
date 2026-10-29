"""
Data preview, insights, and lineage discovery tests.
All external GCP calls (BigQuery, Vertex AI, Data Lineage API) are mocked.
"""

from unittest.mock import MagicMock, patch

import pytest
from google.oauth2.credentials import Credentials


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

    def test_prompt_tells_the_model_todays_date(self):
        from datetime import date

        from backend.services.insights import _build_prompt

        prompt = _build_prompt(
            table_name="orders", table_bq_path="p.d.orders", description=None,
            sensitivity_label="internal", tags=[], row_count=None, size_bytes=None,
            columns=[], dataset_description=None,
        )
        assert f"Today's date: {date.today().isoformat()}" in prompt


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



class TestGcpCredentials:
    """Local ADC without a quota project gets a 403 from DLP, Dataplex, Asset Inventory and Data Lineage."""

    def _get(self, adc):
        from backend.services import gcp_credentials

        with patch.object(gcp_credentials.google.auth, "default", return_value=(adc, None)):
            return gcp_credentials.get_credentials("formare-ai", None)

    def test_user_adc_without_quota_project_bills_the_table_project(self):
        assert self._get(Credentials(token="user-token")).quota_project_id == "formare-ai"

    def test_quota_project_from_adc_is_kept(self):
        creds = self._get(Credentials(token="user-token", quota_project_id="billing-project"))
        assert creds.quota_project_id == "billing-project"

    def test_service_account_is_left_alone(self):
        adc = MagicMock()
        assert self._get(adc) is adc
        adc.with_quota_project.assert_not_called()


class TestLineageService:
    """bq_lineage calls the REST API itself, so it must send the quota project the client libraries would."""

    def _discover(self, creds, response):
        from backend.services import bq_lineage

        with patch.object(bq_lineage, "get_credentials", return_value=creds), \
             patch.object(Credentials, "refresh"), \
             patch.object(bq_lineage.http_requests, "post", return_value=response) as post:
            bq_lineage.discover("formare-ai", "sales", "orders", "EU", None)
        return post.call_args.kwargs["headers"]

    def test_sends_the_quota_project(self):
        headers = self._discover(Credentials(token="user-token", quota_project_id="formare-ai"),
                                 MagicMock(ok=True, json=lambda: {"links": []}))
        assert headers["x-goog-user-project"] == "formare-ai"
        assert headers["authorization"] == "Bearer user-token"

    def test_error_carries_googles_message(self):
        message = "Data Lineage API has not been used in project formare-ai before or it is disabled."
        response = MagicMock(ok=False, status_code=403, json=lambda: {"error": {"code": 403, "message": message}})
        with pytest.raises(RuntimeError, match="403 Data Lineage API has not been used in project formare-ai"):
            self._discover(Credentials(token="user-token"), response)
