"""
BigQuery table preview service.

Two-step flow:
1. estimate() — dry-run the TABLESAMPLE query to get bytes/cost, no data read
2. run()      — execute the query and return the first rows
"""

import logging

from google.cloud import bigquery
from .bq_sync import _get_credentials
from .bq_safety import assert_read_only

logger = logging.getLogger(__name__)

BQ_COST_PER_TB = 6.25  # USD per TiB (BigQuery on-demand pricing)


def _get_query_credentials(project_id: str, secret_name: str):
    """Full bigquery scope — needed for running jobs (dry-run + actual query)."""
    from google.cloud import secretmanager
    from google.oauth2 import service_account
    import json

    sm_client = secretmanager.SecretManagerServiceClient()
    secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
    response = sm_client.access_secret_version(request={"name": secret_path})
    key_dict = json.loads(response.payload.data.decode("utf-8"))
    return service_account.Credentials.from_service_account_info(
        key_dict,
        scopes=["https://www.googleapis.com/auth/bigquery"],
    )


def _sample_query(project_id: str, dataset_id: str, table_id: str) -> str:
    return (
        f"SELECT *\n"
        f"FROM `{project_id}.{dataset_id}.{table_id}`\n"
        f"TABLESAMPLE SYSTEM (10 PERCENT)\n"
        f"LIMIT 100"
    )


def estimate(project_id: str, dataset_id: str, table_id: str, secret_name: str) -> dict:
    """Dry-run the sample query — returns query text + cost estimate, reads no data."""
    credentials = _get_query_credentials(project_id, secret_name)
    client = bigquery.Client(project=project_id, credentials=credentials)

    query = _sample_query(project_id, dataset_id, table_id)
    assert_read_only(query)
    job_config = bigquery.QueryJobConfig(dry_run=True, use_query_cache=False)
    job = client.query(query, job_config=job_config)

    estimated_bytes = job.total_bytes_processed or 0
    estimated_mb = round(estimated_bytes / (1024 ** 2), 2)
    estimated_cost_usd = round(estimated_bytes / (1024 ** 4) * BQ_COST_PER_TB, 6)

    logger.info("Dry-run %s.%s.%s → %d bytes", project_id, dataset_id, table_id, estimated_bytes)
    return {
        "query": query,
        "estimated_bytes": estimated_bytes,
        "estimated_mb": estimated_mb,
        "estimated_cost_usd": estimated_cost_usd,
    }


def run(project_id: str, dataset_id: str, table_id: str, secret_name: str) -> dict:
    """Execute the sample query and return columns + rows."""
    credentials = _get_query_credentials(project_id, secret_name)
    client = bigquery.Client(project=project_id, credentials=credentials)

    query = _sample_query(project_id, dataset_id, table_id)
    assert_read_only(query)
    job_config = bigquery.QueryJobConfig(use_query_cache=True)
    result = client.query(query, job_config=job_config).result()

    columns = [field.name for field in result.schema]
    rows = [
        {col: (str(row[col]) if row[col] is not None else None) for col in columns}
        for row in result
    ]
    logger.info("Preview %s.%s.%s → %d rows", project_id, dataset_id, table_id, len(rows))
    return {"columns": columns, "rows": rows}
