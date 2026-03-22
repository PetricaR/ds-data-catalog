"""
BigQuery table usage statistics via INFORMATION_SCHEMA.JOBS.

Queries the JOBS view to surface:
- Top users (by query count over the last N days)
- Total query count, last queried timestamp
- Average bytes processed per query

Requirements: the service account needs
  roles/bigquery.resourceViewer (or bigquery.jobs.list) on the project.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Optional

from google.cloud import bigquery

from .bq_preview import _get_query_credentials
from .bq_safety import assert_read_only

logger = logging.getLogger(__name__)

_DEFAULT_DAYS = 30
_DEFAULT_TOP_USERS = 10


def _jobs_view(project_id: str, location: Optional[str]) -> str:
    """Build the INFORMATION_SCHEMA.JOBS reference for the given location."""
    loc = (location or "us").lower()
    # Multi-region: "us" → "region-us", "eu" → "region-eu"
    # Single region: "us-central1" → "region-us-central1"
    region = f"region-{loc}"
    return f"`{project_id}.{region}.INFORMATION_SCHEMA.JOBS`"


def _escape(value: str) -> str:
    """Minimal string escaping for BQ literal — only used for project/dataset/table IDs."""
    return re.sub(r"[^a-zA-Z0-9_.\-]", "", value)


def fetch(
    project_id: str,
    dataset_id: str,
    table_id: str,
    location: Optional[str],
    secret_name: Optional[str],
    days: int = _DEFAULT_DAYS,
    top_users: int = _DEFAULT_TOP_USERS,
) -> dict:
    """
    Return usage stats for a BigQuery table over the past `days` days.

    Returns:
      {
        "total_queries": int,
        "last_queried_at": str | None,
        "top_users": [{"email": str, "query_count": int, "avg_bytes": int}],
        "period_days": int,
        "fetched_at": str,
      }
    """
    credentials = _get_query_credentials(project_id, secret_name or "")
    client = bigquery.Client(project=project_id, credentials=credentials)

    jobs_view = _jobs_view(project_id, location)
    p = _escape(project_id)
    d = _escape(dataset_id)
    t = _escape(table_id)

    # Search for the table reference anywhere in the query text.
    # Handles backtick quoting and dot-separated forms.
    pattern = rf"`?{p}`?\.`?{d}`?\.`?{t}`?"

    query = f"""
SELECT
  user_email,
  COUNT(*) AS query_count,
  MAX(creation_time) AS last_queried_at,
  CAST(AVG(total_bytes_processed) AS INT64) AS avg_bytes_processed
FROM {jobs_view}
WHERE
  state = 'DONE'
  AND creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {int(days)} DAY)
  AND REGEXP_CONTAINS(query, r'{pattern}')
GROUP BY user_email
ORDER BY query_count DESC
LIMIT {int(top_users)}
"""

    assert_read_only(query)

    # Also get totals in a separate aggregation row
    totals_query = f"""
SELECT
  COUNT(*) AS total_queries,
  MAX(creation_time) AS last_queried_at
FROM {jobs_view}
WHERE
  state = 'DONE'
  AND creation_time >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL {int(days)} DAY)
  AND REGEXP_CONTAINS(query, r'{pattern}')
"""

    assert_read_only(totals_query)

    try:
        totals_rows = list(client.query(totals_query).result())
        totals_row = totals_rows[0] if totals_rows else None

        total_queries = int(totals_row["total_queries"]) if totals_row else 0
        last_queried_at = totals_row["last_queried_at"] if totals_row else None
        if hasattr(last_queried_at, "isoformat"):
            last_queried_at = last_queried_at.isoformat()

        user_rows = list(client.query(query).result())
        top_users_list = [
            {
                "email": row["user_email"] or "unknown",
                "query_count": int(row["query_count"]),
                "avg_bytes": int(row["avg_bytes_processed"] or 0),
            }
            for row in user_rows
        ]
    except Exception as exc:
        logger.warning("bq_usage.fetch failed for %s.%s.%s: %s", project_id, dataset_id, table_id, exc)
        raise

    logger.info(
        "Usage stats for %s.%s.%s: %d queries in last %d days",
        project_id, dataset_id, table_id, total_queries, days,
    )
    return {
        "total_queries": total_queries,
        "last_queried_at": last_queried_at,
        "top_users": top_users_list,
        "period_days": days,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
