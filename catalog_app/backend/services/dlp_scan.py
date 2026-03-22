"""
Cloud DLP PII auto-detection for BigQuery tables.

Uses the DLP API to inspect a BigQuery table sample and identify
info types (PII categories) present in each column.

Two modes:
1. inspect_content  — scans a sampled preview of rows (fast, small tables)
2. create_dlp_job   — creates an async DLP BigQuery inspection job (large tables)

This module uses mode 1 (inspect_content with a BQ table reference + row limit)
because it returns results synchronously and is ideal for on-demand catalog use.

Required IAM:
  - roles/dlp.user on the project
  - Service account must have bigquery.tables.get + bigquery.tables.getData
    on the scanned table.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Built-in info types we care about for a data catalog
_DEFAULT_INFO_TYPES = [
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
    "PERSON_NAME",
    "DATE_OF_BIRTH",
    "CREDIT_CARD_NUMBER",
    "IBAN_CODE",
    "IP_ADDRESS",
    "LOCATION",
    "PASSPORT",
    "US_SOCIAL_SECURITY_NUMBER",
    "US_DRIVERS_LICENSE_NUMBER",
    "GENDER",
    "AGE",
    "ETHNIC_GROUP",
]

_MAX_FINDINGS_PER_REQUEST = 1000
_ROWS_LIMIT = 500  # sample size — enough to detect PII without full scan


def _get_dlp_credentials(project_id: str, secret_name: Optional[str]):
    """Return credentials for DLP, same pattern as bq_preview."""
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


def scan(
    project_id: str,
    dataset_id: str,
    table_id: str,
    columns: list[dict],
    secret_name: Optional[str],
    info_types: Optional[list[str]] = None,
) -> dict:
    """
    Inspect a BigQuery table sample for PII using Cloud DLP.

    Returns:
      {
        "findings_by_column": {
          "column_name": ["INFO_TYPE_1", "INFO_TYPE_2", ...],
          ...
        },
        "total_findings": int,
        "scanned_rows_limit": int,
        "info_types_checked": [str],
        "scanned_at": str,
      }
    """
    try:
        from google.cloud import dlp_v2
    except ImportError:
        raise RuntimeError(
            "google-cloud-dlp is not installed. Run: pip install google-cloud-dlp "
            "and rebuild the Docker image."
        )
    from datetime import datetime, timezone

    selected_info_types = info_types or _DEFAULT_INFO_TYPES

    credentials = _get_dlp_credentials(project_id, secret_name)
    dlp = dlp_v2.DlpServiceClient(credentials=credentials)

    parent = f"projects/{project_id}"

    # Configure which info types to look for
    info_type_objects = [{"name": it} for it in selected_info_types]

    # Restrict to specific columns if provided
    field_ids = [{"name": col["name"]} for col in columns] if columns else []

    inspect_config = {
        "info_types": info_type_objects,
        "min_likelihood": dlp_v2.Likelihood.POSSIBLE,
        "limits": {"max_findings_per_request": _MAX_FINDINGS_PER_REQUEST},
        "include_quote": False,
    }

    # Use BigQuery table as content item with row limit sampling
    storage_config = {
        "big_query_options": {
            "table_reference": {
                "project_id": project_id,
                "dataset_id": dataset_id,
                "table_id": table_id,
            },
            "rows_limit": _ROWS_LIMIT,
            **({"identifying_fields": field_ids} if field_ids else {}),
        }
    }

    try:
        # inspect_content requires ContentItem, not storage — use job creation instead
        # for BQ tables. We create a DLP job and wait for it synchronously (poll).
        # For on-demand catalog scanning we use a lightweight approach: create a job,
        # poll until done, fetch findings.
        job = dlp.create_dlp_job(
            request={
                "parent": parent,
                "inspect_job": {
                    "storage_config": storage_config,
                    "inspect_config": inspect_config,
                    "actions": [],  # no output action — read findings via API
                },
            }
        )
        job_name = job.name
        logger.info("DLP job created: %s", job_name)

        # Poll until complete (with timeout)
        import time
        timeout_secs = 120
        poll_interval = 5
        elapsed = 0
        while elapsed < timeout_secs:
            job = dlp.get_dlp_job(request={"name": job_name})
            state = job.state
            if state in (
                dlp_v2.DlpJob.JobState.DONE,
                dlp_v2.DlpJob.JobState.CANCELED,
                dlp_v2.DlpJob.JobState.FAILED,
            ):
                break
            time.sleep(poll_interval)
            elapsed += poll_interval

        if job.state == dlp_v2.DlpJob.JobState.FAILED:
            raise RuntimeError(f"DLP job failed: {job.errors}")

        # List findings
        findings_by_column: dict[str, set] = {}
        total_findings = 0

        list_req = {
            "parent": parent,
            "filter": f"job_name={job_name}",
            "page_size": 1000,
        }
        for finding in dlp.list_findings(request=list_req).findings:
            total_findings += 1
            info_type_name = finding.info_type.name
            # Extract column name from location
            loc = finding.location
            if loc.content_locations:
                for cl in loc.content_locations:
                    if cl.record_location and cl.record_location.field_id:
                        col_name = cl.record_location.field_id.name
                        findings_by_column.setdefault(col_name, set()).add(info_type_name)

        # Clean up the job
        try:
            dlp.delete_dlp_job(request={"name": job_name})
        except Exception:
            pass

        return {
            "findings_by_column": {k: sorted(v) for k, v in findings_by_column.items()},
            "total_findings": total_findings,
            "scanned_rows_limit": _ROWS_LIMIT,
            "info_types_checked": selected_info_types,
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }

    except Exception as exc:
        logger.warning("DLP scan failed for %s.%s.%s: %s", project_id, dataset_id, table_id, exc)
        raise
