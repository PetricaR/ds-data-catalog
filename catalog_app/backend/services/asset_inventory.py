"""
Cloud Asset Inventory — BigQuery table schema change history.

Uses the Asset Inventory API to fetch the historical snapshots of a BigQuery
table's resource metadata (which includes the schema). By diffing consecutive
snapshots we can surface column additions, removals, and type changes.

API used: assets.batchGetAssetsHistory
  https://cloud.google.com/asset-inventory/docs/reference/rest/v1/TopLevel/batchGetAssetsHistory

Required IAM:
  - roles/cloudasset.viewer on the project

Note: Asset history is retained for 35 days by default.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

_DEFAULT_DAYS = 30  # API retains 35 days but rejects requests near the boundary


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


def _extract_schema(resource_dict: dict) -> list[dict]:
    """Pull schema fields from a BQ table asset resource snapshot (MessageToDict output)."""
    # MessageToDict gives camelCase keys: data -> schema -> fields
    fields = (
        resource_dict
        .get("data", {})
        .get("schema", {})
        .get("fields", [])
    )
    return [
        {
            "name": f.get("name", ""),
            "type": f.get("type", "STRING"),
            "mode": f.get("mode", "NULLABLE"),
        }
        for f in fields
        if f.get("name")
    ]


def _diff_schemas(old: list[dict], new: list[dict]) -> list[dict]:
    """Return list of change events between two schema snapshots."""
    changes = []
    old_by_name = {f["name"]: f for f in old}
    new_by_name = {f["name"]: f for f in new}

    for name, field in new_by_name.items():
        if name not in old_by_name:
            changes.append({"type": "COLUMN_ADDED", "column": name, "new_type": field["type"]})
        else:
            old_field = old_by_name[name]
            if old_field["type"] != field["type"]:
                changes.append({
                    "type": "COLUMN_TYPE_CHANGED",
                    "column": name,
                    "old_type": old_field["type"],
                    "new_type": field["type"],
                })
            if old_field.get("mode") != field.get("mode"):
                changes.append({
                    "type": "COLUMN_MODE_CHANGED",
                    "column": name,
                    "old_mode": old_field.get("mode"),
                    "new_mode": field.get("mode"),
                })

    for name in old_by_name:
        if name not in new_by_name:
            changes.append({"type": "COLUMN_REMOVED", "column": name, "old_type": old_by_name[name]["type"]})

    return changes


def fetch_schema_history(
    project_id: str,
    dataset_id: str,
    table_id: str,
    secret_name: Optional[str],
    days: int = _DEFAULT_DAYS,
) -> dict:
    """
    Fetch schema change history for a BigQuery table via Cloud Asset Inventory.

    Returns:
      {
        "asset_name": str,
        "snapshots": [{"window_start": str, "schema": [...]}],
        "changes": [{"detected_at": str, "type": str, "column": str, ...}],
        "period_days": int,
        "fetched_at": str,
      }
    """
    try:
        from google.cloud import asset_v1
        from google.protobuf import timestamp_pb2
        from google.protobuf.json_format import MessageToDict
    except ImportError:
        raise RuntimeError(
            "google-cloud-asset is not installed. Run: pip install google-cloud-asset "
            "and rebuild the Docker image."
        )

    credentials = _get_credentials(project_id, secret_name)
    client = asset_v1.AssetServiceClient(credentials=credentials)

    asset_name = f"//bigquery.googleapis.com/projects/{project_id}/datasets/{dataset_id}/tables/{table_id}"
    scope = f"projects/{project_id}"

    now = datetime.now(timezone.utc)
    start = now - timedelta(days=days)

    # Build Timestamp protos for the time window
    start_ts = timestamp_pb2.Timestamp()
    start_ts.FromDatetime(start)
    end_ts = timestamp_pb2.Timestamp()
    end_ts.FromDatetime(now)

    try:
        response = client.batch_get_assets_history(
            request={
                "parent": scope,
                "asset_names": [asset_name],
                "content_type": asset_v1.ContentType.RESOURCE,
                "read_time_window": {
                    "start_time": start_ts,
                    "end_time": end_ts,
                },
            }
        )
    except Exception as exc:
        logger.warning("Asset Inventory fetch failed for %s: %s", asset_name, exc)
        raise

    # response.assets is a flat list of TemporalAsset objects (one per snapshot)
    snapshots = []
    for temporal_asset in response.assets:
        window = temporal_asset.window
        window_start = None
        if window and window.start_time:
            try:
                window_start = window.start_time.ToDatetime(tzinfo=timezone.utc).isoformat()
            except Exception:
                pass

        resource_dict = {}
        if temporal_asset.asset and temporal_asset.asset.resource:
            try:
                resource_dict = MessageToDict(temporal_asset.asset.resource)
            except Exception:
                pass

        schema = _extract_schema(resource_dict)
        snapshots.append({
            "window_start": window_start,
            "deleted": temporal_asset.deleted,
            "schema": schema,
        })

    # Sort snapshots chronologically
    snapshots.sort(key=lambda s: s["window_start"] or "")

    # Derive changes by diffing consecutive snapshots
    changes = []
    for i in range(1, len(snapshots)):
        if snapshots[i]["deleted"]:
            continue
        prev_schema = snapshots[i - 1]["schema"] if not snapshots[i - 1]["deleted"] else []
        curr_schema = snapshots[i]["schema"]
        diffs = _diff_schemas(prev_schema, curr_schema)
        for diff in diffs:
            changes.append({
                "detected_at": snapshots[i]["window_start"],
                **diff,
            })

    logger.info(
        "Asset history for %s.%s.%s: %d snapshots, %d changes",
        project_id, dataset_id, table_id, len(snapshots), len(changes),
    )
    return {
        "asset_name": asset_name,
        "snapshots": snapshots,
        "changes": changes,
        "period_days": days,
        "fetched_at": now.isoformat(),
    }
