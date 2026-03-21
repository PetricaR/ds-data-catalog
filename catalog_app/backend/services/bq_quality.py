"""
BigQuery data quality check service.

Runs a single aggregate query to get:
- Total row count
- Per-column null counts / null rates
- Min/max values for TIMESTAMP/DATE/DATETIME columns
"""

import logging
import re
from datetime import datetime, timezone

from google.cloud import bigquery
from .bq_preview import _get_query_credentials

logger = logging.getLogger(__name__)

TIMESTAMP_TYPES = {"TIMESTAMP", "DATE", "DATETIME"}


def _safe(idx: int, name: str) -> str:
    """Unique alias safe for BigQuery (no special chars)."""
    return f"c{idx}_" + re.sub(r"[^a-zA-Z0-9]", "_", name)


def run(project_id: str, dataset_id: str, table_id: str, columns: list[dict], secret_name: str) -> dict:
    """
    Run data quality checks.
    Returns total_rows, per-column null rates, and timestamp ranges.
    """
    if not columns:
        return {
            "total_rows": 0,
            "columns": [],
            "checked_at": datetime.now(timezone.utc).isoformat(),
        }

    credentials = _get_query_credentials(project_id, secret_name)
    client = bigquery.Client(project=project_id, credentials=credentials)

    selects = ["COUNT(*) AS total_rows"]
    alias_map: list[tuple[str, str, str | None]] = []  # (name, nc_alias, ts_prefix | None)

    for i, col in enumerate(columns):
        name = col["name"]
        dtype = (col.get("data_type") or "").upper()
        safe = _safe(i, name)

        selects.append(f"COUNTIF(`{name}` IS NULL) AS {safe}_nc")
        ts_prefix = None

        if dtype in TIMESTAMP_TYPES:
            selects.append(f"CAST(MIN(`{name}`) AS STRING) AS {safe}_min")
            selects.append(f"CAST(MAX(`{name}`) AS STRING) AS {safe}_max")
            ts_prefix = safe

        alias_map.append((name, f"{safe}_nc", ts_prefix))

    query = (
        f"SELECT {', '.join(selects)}\n"
        f"FROM `{project_id}.{dataset_id}.{table_id}`"
    )

    result = client.query(query).result()
    row = next(iter(result))
    total_rows = row["total_rows"]

    col_results = []
    for (col, (name, nc_alias, ts_prefix)) in zip(columns, alias_map):
        null_count = row[nc_alias] or 0
        null_rate = round(null_count / total_rows * 100, 1) if total_rows > 0 else 0.0
        entry: dict = {
            "name": name,
            "data_type": col.get("data_type"),
            "null_count": null_count,
            "null_rate": null_rate,
        }
        if ts_prefix:
            entry["min_value"] = row.get(f"{ts_prefix}_min")
            entry["max_value"] = row.get(f"{ts_prefix}_max")
        col_results.append(entry)

    logger.info(
        "Quality check %s.%s.%s → %d rows, %d columns",
        project_id, dataset_id, table_id, total_rows, len(col_results),
    )
    return {
        "total_rows": total_rows,
        "columns": col_results,
        "checked_at": datetime.now(timezone.utc).isoformat(),
    }
