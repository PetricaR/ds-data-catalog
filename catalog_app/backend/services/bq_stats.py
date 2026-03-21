"""Pull column-level statistics from BigQuery."""
import logging

logger = logging.getLogger(__name__)


def _bq_client():
    """Re-use the credential helper from bq_sync if possible, else fallback to ADC."""
    from ..config import settings
    try:
        from .bq_sync import _get_credentials
        if settings.gcp_project_id and settings.bq_secret_name:
            from google.cloud import bigquery
            creds = _get_credentials(settings.gcp_project_id, settings.bq_secret_name)
            return bigquery.Client(project=settings.gcp_project_id, credentials=creds)
    except Exception:
        pass
    from google.cloud import bigquery
    return bigquery.Client()


def pull_column_stats(
    project_id: str,
    dataset_id: str,
    table_id: str,
    column_names: list[str],
) -> dict:
    """Returns {col_name: {approx_count_distinct, null_pct, min_val, max_val}}"""
    if not column_names:
        return {}

    client = _bq_client()

    parts = []
    for col in column_names:
        safe = col.replace("`", "")
        parts.append(f"APPROX_COUNT_DISTINCT(`{safe}`) AS `{safe}__acd`")
        parts.append(
            f"ROUND(100.0 * COUNTIF(`{safe}` IS NULL) / NULLIF(COUNT(*), 0), 2) AS `{safe}__null_pct`"
        )
        parts.append(f"CAST(MIN(CAST(`{safe}` AS STRING)) AS STRING) AS `{safe}__min`")
        parts.append(f"CAST(MAX(CAST(`{safe}` AS STRING)) AS STRING) AS `{safe}__max`")

    sql = f"SELECT {', '.join(parts)} FROM `{project_id}.{dataset_id}.{table_id}`"

    try:
        row = next(iter(client.query(sql).result()))
        result = {}
        for col in column_names:
            safe = col.replace("`", "")
            acd = row.get(f"{safe}__acd")
            null_pct = row.get(f"{safe}__null_pct")
            min_v = row.get(f"{safe}__min")
            max_v = row.get(f"{safe}__max")
            result[col] = {
                "approx_count_distinct": acd,
                "null_pct": null_pct,
                "min_val": str(min_v) if min_v is not None else None,
                "max_val": str(max_v) if max_v is not None else None,
            }
        return result
    except Exception as exc:
        logger.warning("Column stats pull failed for %s.%s.%s: %s", project_id, dataset_id, table_id, exc)
        return {}
