"""
Cloud DLP PII auto-detection for BigQuery tables.

Uses the DLP API to inspect a BigQuery table sample and identify
info types (PII categories) present in each column.

Approach: fetch a sample of rows from BigQuery, then call DLP's
synchronous inspect_content with a Table content item. This gives
per-column findings via record_location.field_id.name without
needing async jobs or output sinks.

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
    Inspect a BigQuery table sample for PII using Cloud DLP inspect_content.

    Fetches up to _ROWS_LIMIT rows from BigQuery, passes them as a DLP Table
    content item, and parses findings by column name.

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
    try:
        from google.cloud import bigquery as bq_lib
    except ImportError:
        raise RuntimeError("google-cloud-bigquery is not installed.")
    from datetime import datetime, timezone

    selected_info_types = info_types or _DEFAULT_INFO_TYPES
    credentials = _get_dlp_credentials(project_id, secret_name)

    # ── 1. Fetch sample rows from BigQuery ────────────────────────────────────
    bq = bq_lib.Client(project=project_id, credentials=credentials)
    query = (
        f"SELECT * FROM `{project_id}.{dataset_id}.{table_id}` LIMIT {_ROWS_LIMIT}"
    )
    try:
        rows = list(bq.query(query).result())
    except Exception as exc:
        logger.warning("Failed to fetch BQ sample for DLP: %s", exc)
        raise

    if not rows:
        from datetime import datetime, timezone
        return {
            "findings_by_column": {},
            "total_findings": 0,
            "scanned_rows_limit": 0,
            "info_types_checked": selected_info_types,
            "scanned_at": datetime.now(timezone.utc).isoformat(),
        }

    # ── 2. Build DLP Table content item ──────────────────────────────────────
    col_names = list(rows[0].keys())
    # If specific columns requested, filter to those
    if columns:
        requested = {c["name"] for c in columns}
        col_names = [c for c in col_names if c in requested] or col_names

    dlp_headers = [{"name": c} for c in col_names]
    dlp_rows = []
    for row in rows:
        values = []
        for c in col_names:
            v = row[c]
            values.append({"string_value": str(v) if v is not None else ""})
        dlp_rows.append({"values": values})

    # ── 3. Call inspect_content ───────────────────────────────────────────────
    dlp = dlp_v2.DlpServiceClient(credentials=credentials)
    parent = f"projects/{project_id}/locations/global"

    inspect_config = {
        "info_types": [{"name": it} for it in selected_info_types],
        "min_likelihood": dlp_v2.Likelihood.POSSIBLE,
        "limits": {"max_findings_per_request": _MAX_FINDINGS_PER_REQUEST},
        "include_quote": False,
    }

    try:
        response = dlp.inspect_content(
            request={
                "parent": parent,
                "item": {"table": {"headers": dlp_headers, "rows": dlp_rows}},
                "inspect_config": inspect_config,
            }
        )
    except Exception as exc:
        logger.warning("DLP inspect_content failed for %s.%s.%s: %s", project_id, dataset_id, table_id, exc)
        raise

    # ── 4. Parse findings by column ───────────────────────────────────────────
    findings_by_column: dict[str, set] = {}
    total_findings = 0

    for finding in response.result.findings:
        total_findings += 1
        info_type_name = finding.info_type.name
        loc = finding.location
        if loc.content_locations:
            for cl in loc.content_locations:
                if cl.record_location and cl.record_location.field_id:
                    col_name = cl.record_location.field_id.name
                    findings_by_column.setdefault(col_name, set()).add(info_type_name)

    logger.info(
        "DLP scan for %s.%s.%s: %d findings across %d columns (sampled %d rows)",
        project_id, dataset_id, table_id,
        total_findings, len(findings_by_column), len(rows),
    )

    return {
        "findings_by_column": {k: sorted(v) for k, v in findings_by_column.items()},
        "total_findings": total_findings,
        "scanned_rows_limit": len(rows),
        "info_types_checked": selected_info_types,
        "scanned_at": datetime.now(timezone.utc).isoformat(),
    }
