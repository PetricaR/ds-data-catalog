"""
Dataplex DataScans quality engine.

Creates and runs a Dataplex DataScan (AUTO_DATA_QUALITY type) on a BigQuery table,
polls until the scan job is complete, and returns structured quality results.

Dataplex DataScans provide:
- Row-level completeness and validity rules
- Column null/uniqueness checks
- Custom SQL rule assertions
- Scoring per dimension (Completeness, Uniqueness, Validity, etc.)

Required IAM:
  - roles/dataplex.dataScanAdmin on the project
  - Service account needs bigquery.tables.getData on the scanned table.

Docs: https://cloud.google.com/dataplex/docs/reference/rest/v1/projects.locations.dataScans
"""

import logging
import time
from typing import Optional

logger = logging.getLogger(__name__)

_POLL_INTERVAL = 10  # seconds
_TIMEOUT = 300       # 5 minutes max wait


def _get_credentials(project_id: str, secret_name: Optional[str]):
    if secret_name:
        from google.cloud import secretmanager
        from google.oauth2 import service_account
        import json

        sm = secretmanager.SecretManagerServiceClient()
        path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = sm.access_secret_version(request={"name": path})
        key_dict = json.loads(response.payload.data.decode("utf-8"))
        return service_account.Credentials.from_service_account_info(
            key_dict,
            scopes=["https://www.googleapis.com/auth/cloud-platform"],
        )
    import google.auth
    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    return creds


def _normalize_location(location: Optional[str]) -> str:
    loc = (location or "us").lower()
    # Dataplex uses "us-central1" style; "us"/"eu" must be mapped
    _multi = {"us": "us-central1", "eu": "europe-west1"}
    return _multi.get(loc, loc)


def _scan_id(dataset_id: str, table_id: str) -> str:
    """Generate a deterministic scan ID from dataset+table."""
    import re
    raw = f"ldc-{dataset_id}-{table_id}".lower()
    return re.sub(r"[^a-z0-9-]", "-", raw)[:63].rstrip("-")


def run_quality_scan(
    project_id: str,
    dataset_id: str,
    table_id: str,
    location: Optional[str],
    secret_name: Optional[str],
) -> dict:
    """
    Create (or reuse) a Dataplex DataScan on the given BQ table, trigger a run,
    poll until complete, and return quality results.

    Returns:
      {
        "scan_name": str,
        "state": str,
        "data_quality_result": {
          "passed": bool,
          "score": float,
          "dimensions": [{"dimension": str, "passed": bool, "score": float}],
          "columns": [...],
          "rules": [...],
        },
        "scanned_at": str,
      }
    """
    try:
        from google.cloud import dataplex_v1
    except ImportError:
        raise RuntimeError(
            "google-cloud-dataplex is not installed. Run: pip install google-cloud-dataplex "
            "and rebuild the Docker image."
        )
    from datetime import datetime, timezone

    credentials = _get_credentials(project_id, secret_name)
    client = dataplex_v1.DataScanServiceClient(credentials=credentials)

    dp_location = _normalize_location(location)
    parent = f"projects/{project_id}/locations/{dp_location}"
    scan_id = _scan_id(dataset_id, table_id)
    scan_name = f"{parent}/dataScans/{scan_id}"

    bq_resource = f"//bigquery.googleapis.com/projects/{project_id}/datasets/{dataset_id}/tables/{table_id}"

    # Try to get existing scan, create if not found
    try:
        client.get_data_scan(request={"name": scan_name})
        logger.info("Reusing existing DataScan %s", scan_name)
    except Exception:
        logger.info("Creating new DataScan %s", scan_name)
        scan = dataplex_v1.DataScan(
            name=scan_name,
            data=dataplex_v1.DataSource(resource=bq_resource),
            execution_spec=dataplex_v1.DataScan.ExecutionSpec(
                trigger=dataplex_v1.Trigger(
                    on_demand=dataplex_v1.Trigger.OnDemand()
                )
            ),
            data_quality_spec=dataplex_v1.DataQualitySpec(
                rules=[
                    # Row-count freshness: table must have at least 1 row
                    dataplex_v1.DataQualityRule(
                        table_condition_expectation=dataplex_v1.DataQualityRule.TableConditionExpectation(
                            sql_expression="COUNT(*) > 0"
                        ),
                        dimension="COMPLETENESS",
                        name="table-has-rows",
                    ),
                ]
            ),
        )
        op = client.create_data_scan(
            request={
                "parent": parent,
                "data_scan": scan,
                "data_scan_id": scan_id,
            }
        )
        op.result(timeout=60)

    # Run the scan
    run_response = client.run_data_scan(request={"name": scan_name})
    job_name = run_response.job.name
    logger.info("DataScan job started: %s", job_name)

    # Poll for completion
    elapsed = 0
    job = None
    while elapsed < _TIMEOUT:
        job = client.get_data_scan_job(request={"name": job_name, "view": "FULL"})
        state = job.state
        if state in (
            dataplex_v1.DataScanJob.State.SUCCEEDED,
            dataplex_v1.DataScanJob.State.FAILED,
            dataplex_v1.DataScanJob.State.CANCELLED,
        ):
            break
        time.sleep(_POLL_INTERVAL)
        elapsed += _POLL_INTERVAL

    if not job:
        raise RuntimeError("DataScan job did not complete in time")

    state_name = dataplex_v1.DataScanJob.State(job.state).name

    # Parse results
    result = {}
    if job.data_quality_result:
        dqr = job.data_quality_result
        dimensions = []
        for dim in dqr.dimensions:
            dimensions.append({
                "dimension": dim.dimension,
                "passed": dim.passed,
                "score": round(dim.score * 100, 1) if dim.score is not None else None,
            })

        columns = []
        for col in dqr.columns:
            columns.append({
                "column": col.column,
                "score": round(col.score * 100, 1) if col.score is not None else None,
            })

        rules = []
        for rule_result in dqr.rules:
            rules.append({
                "rule_name": rule_result.rule.name or "",
                "dimension": rule_result.rule.dimension or "",
                "column": rule_result.rule.column or "",
                "passed": rule_result.passed,
                "evaluated_count": rule_result.evaluated_count,
                "passed_count": rule_result.passed_count,
                "failed_count": rule_result.failed_count,
                "null_count": rule_result.null_count,
                "pass_ratio": round(rule_result.pass_ratio * 100, 1) if rule_result.pass_ratio is not None else None,
            })

        result = {
            "passed": dqr.passed,
            "score": round(dqr.score * 100, 1) if dqr.score is not None else None,
            "dimensions": dimensions,
            "columns": columns,
            "rules": rules,
            "row_count": dqr.row_count,
        }

    logger.info("DataScan %s finished with state=%s", job_name, state_name)
    return {
        "scan_name": scan_name,
        "job_name": job_name,
        "state": state_name,
        "data_quality_result": result,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }
