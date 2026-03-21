"""
BigQuery table preview service.
Fetches the first N rows of a table using the same SA credentials as bq_sync.
"""

import logging

from .bq_sync import _bq_client, _get_credentials

logger = logging.getLogger(__name__)


def preview_table(
    project_id: str,
    dataset_id: str,
    table_id: str,
    secret_name: str,
    limit: int = 20,
) -> dict:
    credentials = _get_credentials(project_id, secret_name)
    client = _bq_client(project_id, credentials)

    full_ref = f"`{project_id}.{dataset_id}.{table_id}`"
    query = f"SELECT * FROM {full_ref} LIMIT {limit}"
    logger.info("Previewing %s.%s.%s", project_id, dataset_id, table_id)

    job = client.query(query)
    result = job.result()

    columns = [field.name for field in result.schema]
    rows = []
    for row in result:
        rows.append({col: (str(row[col]) if row[col] is not None else None) for col in columns})

    return {"columns": columns, "rows": rows}
