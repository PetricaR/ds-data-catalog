"""
BigQuery discovery service.

Fetches service account credentials from Google Cloud Secret Manager,
then lists all datasets and their tables from BigQuery, upserting them
into the catalog database.
"""

import json
import logging
from datetime import timezone

from google.cloud import bigquery, secretmanager
from google.oauth2 import service_account
from sqlalchemy.orm import Session

from ..models.catalog import Dataset, SchemaChange, Table, TableColumn

logger = logging.getLogger(__name__)


# ── Credentials ───────────────────────────────────────────────────────────────

def _get_credentials(project_id: str, secret_name: str, secret_version: str = "latest"):
    """
    Retrieve a service account JSON key from Secret Manager and return
    google.oauth2 Credentials scoped for BigQuery.
    """
    sm_client = secretmanager.SecretManagerServiceClient()
    secret_path = f"projects/{project_id}/secrets/{secret_name}/versions/{secret_version}"

    logger.info("Fetching credentials from Secret Manager: %s", secret_path)
    response = sm_client.access_secret_version(request={"name": secret_path})
    key_json = response.payload.data.decode("utf-8")
    key_dict = json.loads(key_json)

    credentials = service_account.Credentials.from_service_account_info(
        key_dict,
        scopes=[
            "https://www.googleapis.com/auth/bigquery.readonly",
            "https://www.googleapis.com/auth/cloud-platform.read-only",
        ],
    )
    return credentials


# ── BQ helpers ────────────────────────────────────────────────────────────────

def _bq_client(project_id: str, credentials) -> bigquery.Client:
    return bigquery.Client(project=project_id, credentials=credentials)


def _to_utc(dt):
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


# ── Sync logic ────────────────────────────────────────────────────────────────

class SyncResult:
    def __init__(self):
        self.datasets_added = 0
        self.datasets_updated = 0
        self.tables_added = 0
        self.tables_updated = 0
        self.columns_synced = 0
        self.errors: list[str] = []

    def to_dict(self):
        return {
            "datasets_added": self.datasets_added,
            "datasets_updated": self.datasets_updated,
            "tables_added": self.tables_added,
            "tables_updated": self.tables_updated,
            "columns_synced": self.columns_synced,
            "errors": self.errors,
        }


def sync_project(
    db: Session,
    project_id: str,
    secret_name: str,
    secret_version: str = "latest",
    dataset_filter: str | None = None,
) -> SyncResult:
    """
    Main entry point: discover all BigQuery datasets (and their tables/schemas)
    in `project_id` and upsert them into the catalog.

    Args:
        db:             SQLAlchemy session.
        project_id:     GCP project to scan.
        secret_name:    Secret Manager secret name holding the SA key JSON.
        secret_version: Secret version (default "latest").
        dataset_filter: Optional dataset ID prefix to limit scope.
    """
    result = SyncResult()

    try:
        credentials = _get_credentials(project_id, secret_name, secret_version)
        client = _bq_client(project_id, credentials)
    except Exception as exc:
        msg = f"Failed to initialise BQ client: {exc}"
        logger.error(msg)
        result.errors.append(msg)
        return result

    # ── Datasets ──────────────────────────────────────────────────────────────
    try:
        bq_datasets = list(client.list_datasets(project=project_id))
    except Exception as exc:
        msg = f"Failed to list datasets: {exc}"
        logger.error(msg)
        result.errors.append(msg)
        return result

    for bq_ds_ref in bq_datasets:
        ds_id = bq_ds_ref.dataset_id

        if dataset_filter and not ds_id.startswith(dataset_filter):
            continue

        try:
            bq_ds = client.get_dataset(bq_ds_ref.reference)
        except Exception as exc:
            msg = f"Could not fetch dataset {ds_id}: {exc}"
            logger.warning(msg)
            result.errors.append(msg)
            continue

        # Upsert dataset
        db_ds = (
            db.query(Dataset)
            .filter(Dataset.project_id == project_id, Dataset.dataset_id == ds_id)
            .first()
        )
        if db_ds is None:
            db_ds = Dataset(
                project_id=project_id,
                dataset_id=ds_id,
                display_name=bq_ds.friendly_name or ds_id,
                description=bq_ds.description,
                bq_location=bq_ds.location,
                bq_created_at=_to_utc(bq_ds.created),
                bq_last_modified=_to_utc(bq_ds.modified),
                tags=[],
                sensitivity_label="internal",
                is_active=True,
            )
            db.add(db_ds)
            db.flush()
            result.datasets_added += 1
            logger.info("Added dataset %s.%s", project_id, ds_id)
        else:
            # Update BQ-owned fields only; preserve user-edited metadata
            db_ds.bq_location = bq_ds.location
            db_ds.bq_created_at = _to_utc(bq_ds.created)
            db_ds.bq_last_modified = _to_utc(bq_ds.modified)
            if not db_ds.description and bq_ds.description:
                db_ds.description = bq_ds.description
            if not db_ds.display_name and bq_ds.friendly_name:
                db_ds.display_name = bq_ds.friendly_name
            result.datasets_updated += 1

        # ── Tables ────────────────────────────────────────────────────────────
        try:
            bq_tables = list(client.list_tables(bq_ds_ref.reference))
        except Exception as exc:
            msg = f"Could not list tables in {ds_id}: {exc}"
            logger.warning(msg)
            result.errors.append(msg)
            continue

        for bq_tbl_ref in bq_tables:
            tbl_id = bq_tbl_ref.table_id

            try:
                bq_tbl = client.get_table(bq_tbl_ref)
            except Exception as exc:
                msg = f"Could not fetch table {ds_id}.{tbl_id}: {exc}"
                logger.warning(msg)
                result.errors.append(msg)
                continue

            db_tbl = (
                db.query(Table)
                .filter(Table.dataset_id == db_ds.id, Table.table_id == tbl_id)
                .first()
            )
            if db_tbl is None:
                db_tbl = Table(
                    dataset_id=db_ds.id,
                    table_id=tbl_id,
                    display_name=bq_tbl.friendly_name or tbl_id,
                    description=bq_tbl.description,
                    row_count=bq_tbl.num_rows,
                    size_bytes=bq_tbl.num_bytes,
                    bq_created_at=_to_utc(bq_tbl.created),
                    bq_last_modified=_to_utc(bq_tbl.modified),
                    tags=[],
                    sensitivity_label="internal",
                    is_active=True,
                )
                db.add(db_tbl)
                db.flush()
                result.tables_added += 1
            else:
                db_tbl.row_count = bq_tbl.num_rows
                db_tbl.size_bytes = bq_tbl.num_bytes
                db_tbl.bq_created_at = _to_utc(bq_tbl.created)
                db_tbl.bq_last_modified = _to_utc(bq_tbl.modified)
                if not db_tbl.description and bq_tbl.description:
                    db_tbl.description = bq_tbl.description
                result.tables_updated += 1

            # ── Columns ───────────────────────────────────────────────────────
            if bq_tbl.schema:
                # Snapshot existing columns before replacing (preserve user data)
                existing_cols = {
                    c.name: c
                    for c in db.query(TableColumn).filter(TableColumn.table_id == db_tbl.id).all()
                }
                existing_names = set(existing_cols.keys())
                new_names = {field.name for field in bq_tbl.schema}

                # Detect and record schema changes
                for col_name in sorted(new_names - existing_names):
                    db.add(SchemaChange(
                        table_id=db_tbl.id,
                        change_type="column_added",
                        column_name=col_name,
                    ))
                    logger.info("Schema change — column added: %s.%s.%s", ds_id, tbl_id, col_name)
                for col_name in sorted(existing_names - new_names):
                    db.add(SchemaChange(
                        table_id=db_tbl.id,
                        change_type="column_removed",
                        column_name=col_name,
                    ))
                    logger.info("Schema change — column removed: %s.%s.%s", ds_id, tbl_id, col_name)

                # Replace columns, preserving user-edited descriptions and pk flags
                db.query(TableColumn).filter(TableColumn.table_id == db_tbl.id).delete()
                for pos, field in enumerate(bq_tbl.schema):
                    old = existing_cols.get(field.name)
                    db.add(
                        TableColumn(
                            table_id=db_tbl.id,
                            name=field.name,
                            data_type=field.field_type,
                            description=old.description if (old and old.description) else field.description,
                            is_nullable=(field.mode != "REQUIRED"),
                            is_primary_key=old.is_primary_key if old else False,
                            position=pos,
                        )
                    )
                    result.columns_synced += 1

        db.commit()

    logger.info(
        "Sync complete — datasets +%d/~%d  tables +%d/~%d  columns %d  errors %d",
        result.datasets_added,
        result.datasets_updated,
        result.tables_added,
        result.tables_updated,
        result.columns_synced,
        len(result.errors),
    )
    return result
