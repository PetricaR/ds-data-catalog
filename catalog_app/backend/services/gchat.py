"""Google Chat webhook notifications."""
import logging
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


def _send(payload: dict) -> None:
    """POST payload to the configured webhook URL. Best-effort — never raises."""
    url = settings.google_chat_webhook_url
    if not url:
        return
    try:
        resp = httpx.post(url, json=payload, timeout=5)
        if resp.status_code != 200:
            logger.warning("Google Chat webhook returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Google Chat webhook failed: %s", exc)


def notify_trusted(
    table_name: str,
    table_bq_path: str,
    validated_by: str,
    validated_columns: list[str],
    frontend_url: Optional[str] = None,
    table_id: Optional[str] = None,
    project_id: Optional[str] = None,
    dataset_name: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    """Notify when a table is marked as a trusted source."""
    link = f"{frontend_url}/datasets/{dataset_id}/tables/{table_id}" if frontend_url and dataset_id and table_id else table_bq_path
    cols_text = (
        f"{len(validated_columns)} column(s): `{'`, `'.join(validated_columns[:5])}`"
        + (" …" if len(validated_columns) > 5 else "")
        if validated_columns
        else "No specific columns selected"
    )
    _send({
        "cards": [{
            "header": {
                "title": "✅ Table marked as Trusted Source",
                "subtitle": table_bq_path,
            },
            "sections": [{
                "widgets": [
                    {"keyValue": {"topLabel": "Table", "content": table_name}},
                    *([ {"keyValue": {"topLabel": "Project", "content": project_id}} ] if project_id else []),
                    *([ {"keyValue": {"topLabel": "Dataset", "content": dataset_name}} ] if dataset_name else []),
                    {"keyValue": {"topLabel": "BQ path", "content": table_bq_path}},
                    {"keyValue": {"topLabel": "Validated by", "content": validated_by}},
                    {"keyValue": {"topLabel": "Columns validated", "content": cols_text}},
                    {"buttons": [{"textButton": {"text": "Open in Light Data Catalog", "onClick": {"openLink": {"url": link}}}}]},
                ]
            }]
        }]
    })


def notify_revoked(
    table_name: str,
    table_bq_path: str,
    revoked_by: Optional[str] = None,
    frontend_url: Optional[str] = None,
    table_id: Optional[str] = None,
    project_id: Optional[str] = None,
    dataset_name: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    """Notify when a table's trusted source status is revoked."""
    link = f"{frontend_url}/datasets/{dataset_id}/tables/{table_id}" if frontend_url and dataset_id and table_id else table_bq_path
    _send({
        "cards": [{
            "header": {
                "title": "⚠️ Trusted Source status revoked",
                "subtitle": table_bq_path,
            },
            "sections": [{
                "widgets": [
                    {"keyValue": {"topLabel": "Table", "content": table_name}},
                    *([ {"keyValue": {"topLabel": "Project", "content": project_id}} ] if project_id else []),
                    *([ {"keyValue": {"topLabel": "Dataset", "content": dataset_name}} ] if dataset_name else []),
                    {"keyValue": {"topLabel": "BQ path", "content": table_bq_path}},
                    {"keyValue": {"topLabel": "Revoked by", "content": revoked_by or "unknown"}},
                    {"buttons": [{"textButton": {"text": "Open in Light Data Catalog", "onClick": {"openLink": {"url": link}}}}]},
                ]
            }]
        }]
    })


def notify_metadata_change(
    entity_type: str,
    entity_name: str,
    field: str,
    old_value: Optional[str],
    new_value: Optional[str],
    changed_by: str,
    data_steward: Optional[str] = None,
    frontend_url: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> None:
    """Notify when a metadata field changes on a dataset or table."""
    path = (
        f"{frontend_url}/datasets/{entity_id}"
        if frontend_url and entity_id and entity_type == "dataset"
        else (f"{frontend_url}/datasets/-/tables/{entity_id}" if frontend_url and entity_id else "")
    )
    steward_line = f"Data steward: {data_steward}" if data_steward else ""
    _send({
        "cards": [{
            "header": {
                "title": f"📝 Metadata changed on {entity_type}",
                "subtitle": entity_name,
            },
            "sections": [{
                "widgets": [
                    {"keyValue": {"topLabel": "Field", "content": field}},
                    {"keyValue": {"topLabel": "Old value", "content": str(old_value or "—")}},
                    {"keyValue": {"topLabel": "New value", "content": str(new_value or "—")}},
                    {"keyValue": {"topLabel": "Changed by", "content": changed_by}},
                    *(
                        [{"keyValue": {"topLabel": "Data steward", "content": data_steward}}]
                        if data_steward else []
                    ),
                    *(
                        [{"buttons": [{"textButton": {"text": "Open in Light Data Catalog", "onClick": {"openLink": {"url": path}}}}]}]
                        if path else []
                    ),
                ]
            }]
        }]
    })
