from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Body, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.catalog import Dataset, MetadataChangeLog, Table, TableColumn
from ..schemas.catalog import ColumnUpdate, ExampleQuery, ProjectUsage, QualityCheckResult, TableCreate, TableInsights, TableResponse, TableUpdate, ValidatePayload
from ..services import bq_preview, bq_lineage, bq_quality, bq_usage, dlp_scan, dataplex_quality, asset_inventory
from ..services.gchat import notify_trusted, notify_revoked, notify_metadata_change, notify_pii_detected, notify_quality_score

router = APIRouter(prefix="/tables", tags=["tables"])


def _compute_quality_score(table: Table) -> float:
    """
    Score 0-100 based on:
    - 30 pts: table has description
    - 30 pts: column description coverage (% of cols with description)
    - 20 pts: table is validated
    - 10 pts: has tags
    - 10 pts: has example queries
    """
    score = 0.0
    if table.description:
        score += 30
    cols = table.columns
    if cols:
        desc_pct = sum(1 for c in cols if c.description) / len(cols)
        score += 30 * desc_pct
    if table.is_validated:
        score += 20
    if table.tags:
        score += 10
    if table.example_queries:
        score += 10
    return round(score, 1)


def _log_field_changes(
    db: Session,
    entity_type: str,
    entity_id,
    entity_name: Optional[str],
    old_obj,
    new_data: dict,
    changed_by: str = "system",
    data_steward: Optional[str] = None,
    fields: Optional[list] = None,
):
    """Log field-level changes to MetadataChangeLog."""
    watch_fields = fields or ["description", "sensitivity_label", "owner", "data_steward", "tags"]
    for field in watch_fields:
        if field not in new_data:
            continue
        old_val = getattr(old_obj, field, None)
        new_val = new_data[field]
        if old_val != new_val:
            db.add(MetadataChangeLog(
                entity_type=entity_type,
                entity_id=entity_id,
                entity_name=entity_name,
                field_changed=field,
                old_value=str(old_val) if old_val is not None else None,
                new_value=str(new_val) if new_val is not None else None,
                changed_by=changed_by,
                data_steward=data_steward or getattr(old_obj, "data_steward", None),
            ))


def _table_response(t: Table, db: Session) -> TableResponse:
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    resp = TableResponse.model_validate(t)
    if ds:
        resp.dataset_project_id = ds.project_id
        resp.dataset_display_name = ds.display_name or ds.dataset_id
        resp.dataset_bq_dataset_id = ds.dataset_id
    return resp


@router.get("", response_model=list[TableResponse])
def list_tables(
    dataset_id: Optional[UUID] = None,
    sensitivity_label: Optional[str] = None,
    tags: Optional[list[str]] = Query(default=None),
    owner: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(Table).filter(Table.is_active == True)
    if dataset_id:
        q = q.filter(Table.dataset_id == dataset_id)
    if sensitivity_label:
        q = q.filter(Table.sensitivity_label == sensitivity_label)
    if owner:
        q = q.filter(Table.owner.ilike(f"%{owner}%"))
    if tags:
        q = q.filter(Table.tags.overlap(tags))
    tables = q.order_by(Table.updated_at.desc()).offset(skip).limit(limit).all()
    return [_table_response(t, db) for t in tables]


@router.post("", response_model=TableResponse, status_code=status.HTTP_201_CREATED)
def create_table(payload: TableCreate, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == payload.dataset_id, Dataset.is_active == True).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")

    existing = db.query(Table).filter(
        Table.dataset_id == payload.dataset_id,
        Table.table_id == payload.table_id,
        Table.is_active == True,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Table '{payload.table_id}' already exists in this dataset.",
        )

    columns_data = payload.model_dump().pop("columns", [])
    table_data = payload.model_dump(exclude={"columns"})
    t = Table(**table_data)
    db.add(t)
    db.flush()

    for col in columns_data:
        db.add(TableColumn(table_id=t.id, **col))

    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.get("/{table_id}", response_model=TableResponse)
def get_table(table_id: UUID, db: Session = Depends(get_db)):
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    return _table_response(t, db)


@router.put("/{table_id}", response_model=TableResponse)
def update_table(
    table_id: UUID,
    payload: TableUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user),
):
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    update_data = payload.model_dump(exclude_none=True)
    changed_by = (current_user or {}).get("email", "system")
    watch = ["description", "sensitivity_label", "owner", "tags"]
    changes = [(f, getattr(t, f, None), update_data[f]) for f in watch if f in update_data and getattr(t, f, None) != update_data[f]]
    _log_field_changes(db, "table", t.id, t.display_name or t.table_id, t, update_data, changed_by=changed_by)
    for field, value in update_data.items():
        setattr(t, field, value)
    t.quality_score = _compute_quality_score(t)
    db.commit()
    db.refresh(t)
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    for field, old_val, new_val in changes:
        notify_metadata_change(
            entity_type="table",
            entity_name=t.display_name or t.table_id,
            field=field,
            old_value=str(old_val) if old_val is not None else None,
            new_value=str(new_val),
            changed_by=changed_by,
            data_steward=ds.data_steward if ds else None,
            frontend_url=settings.frontend_url,
            entity_id=str(t.id),
        )
    return _table_response(t, db)


@router.patch("/{table_id}/validate", response_model=TableResponse)
def validate_table(
    table_id: UUID,
    payload: ValidatePayload,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user),
):
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    was_validated = t.is_validated
    prev_validated_by = t.validated_by
    if was_validated:
        # Revoke
        t.is_validated = False
        t.validated_by = None
        t.validated_at = None
        t.validated_columns = []
    else:
        # Mark as trusted
        t.is_validated = True
        t.validated_by = payload.validated_by or "anonymous"
        t.validated_at = datetime.now(timezone.utc)
        t.validated_columns = payload.validated_columns
    t.quality_score = _compute_quality_score(t)
    db.commit()
    db.refresh(t)
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    bq_path = f"{ds.project_id}.{ds.dataset_id}.{t.table_id}" if ds else t.table_id
    if t.is_validated:
        notify_trusted(
            table_name=t.display_name or t.table_id,
            table_bq_path=bq_path,
            validated_by=t.validated_by,
            validated_columns=list(t.validated_columns or []),
            frontend_url=settings.frontend_url,
            table_id=str(t.id),
            project_id=ds.project_id if ds else None,
            dataset_name=(ds.display_name or ds.dataset_id) if ds else None,
            dataset_id=str(ds.id) if ds else None,
        )
    else:
        revoked_by = (current_user or {}).get("email") or payload.validated_by or prev_validated_by or "unknown"
        notify_revoked(
            table_name=t.display_name or t.table_id,
            table_bq_path=bq_path,
            revoked_by=revoked_by,
            frontend_url=settings.frontend_url,
            table_id=str(t.id),
            project_id=ds.project_id if ds else None,
            dataset_name=(ds.display_name or ds.dataset_id) if ds else None,
            dataset_id=str(ds.id) if ds else None,
        )
    return _table_response(t, db)


@router.patch("/{table_id}/columns", response_model=TableResponse)
def update_columns(table_id: UUID, payload: list[ColumnUpdate], db: Session = Depends(get_db)):
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    col_map = {c.id: c for c in t.columns}
    for upd in payload:
        col = col_map.get(upd.id)
        if not col:
            continue
        if upd.description is not None:
            col.description = upd.description
        if upd.is_primary_key is not None:
            col.is_primary_key = upd.is_primary_key
    t.quality_score = _compute_quality_score(t)
    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.get("/{table_id}/preview")
def preview_estimate(table_id: UUID, db: Session = Depends(get_db)):
    """Dry-run: returns query SQL + byte/cost estimate without reading any data."""
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")
    try:
        return bq_preview.estimate(ds.project_id, ds.dataset_id, t.table_id, settings.bq_secret_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Estimate failed: {exc}")


@router.post("/{table_id}/preview/run")
def preview_run(table_id: UUID, db: Session = Depends(get_db)):
    """Execute the TABLESAMPLE query and return rows."""
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")
    try:
        return bq_preview.run(ds.project_id, ds.dataset_id, t.table_id, settings.bq_secret_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"BigQuery query failed: {exc}")


@router.post("/{table_id}/quality-check", response_model=QualityCheckResult)
def quality_check(table_id: UUID, db: Session = Depends(get_db)):
    """Run data quality checks: null rates per column + timestamp ranges."""
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")
    columns = [
        {"name": c.name, "data_type": c.data_type}
        for c in sorted(t.columns, key=lambda c: c.position)
    ]
    try:
        return bq_quality.run(ds.project_id, ds.dataset_id, t.table_id, columns, settings.bq_secret_name)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Quality check failed: {exc}")


@router.patch("/{table_id}/queries", response_model=TableResponse)
def update_queries(table_id: UUID, payload: list[ExampleQuery], db: Session = Depends(get_db)):
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.example_queries = [q.model_dump() for q in payload]
    t.quality_score = _compute_quality_score(t)
    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.patch("/{table_id}/columns/{column_id}/pii")
def toggle_pii(
    table_id: UUID,
    column_id: UUID,
    is_pii: bool = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    """Toggle PII flag for a specific column."""
    col = db.query(TableColumn).filter(
        TableColumn.id == column_id,
        TableColumn.table_id == table_id,
    ).first()
    if not col:
        raise HTTPException(status_code=404, detail="Column not found")
    col.is_pii = is_pii
    db.commit()
    return {"id": str(col.id), "is_pii": col.is_pii}


@router.get("/{table_id}/lineage/discover")
def discover_lineage(table_id: UUID, db: Session = Depends(get_db)):
    """
    Query the Google Cloud Data Lineage API to auto-discover upstream/downstream
    tables for this BQ table, then persist the result.
    """
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")

    try:
        result = bq_lineage.discover(
            project_id=ds.project_id,
            dataset_id=ds.dataset_id,
            table_id=t.table_id,
            location=ds.bq_location,
            secret_name=settings.bq_secret_name or None,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Cloud Data Lineage API error: {exc}")

    # Persist discovered refs (merge with existing manual entries)
    existing_up = set(t.upstream_refs or [])
    existing_down = set(t.downstream_refs or [])
    t.upstream_refs = sorted(existing_up | set(result["upstream_refs"]))
    t.downstream_refs = sorted(existing_down | set(result["downstream_refs"]))
    db.commit()

    return {
        "upstream_refs": t.upstream_refs,
        "downstream_refs": t.downstream_refs,
        "discovered_upstream": result["upstream_refs"],
        "discovered_downstream": result["downstream_refs"],
    }


@router.put("/{table_id}/lineage")
def update_lineage(
    table_id: UUID,
    upstream_refs: list[str] = Body(default=[]),
    downstream_refs: list[str] = Body(default=[]),
    db: Session = Depends(get_db),
):
    """Update upstream and downstream lineage references for a table."""
    t = db.query(Table).filter(Table.id == table_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.upstream_refs = upstream_refs
    t.downstream_refs = downstream_refs
    db.commit()
    return {"upstream_refs": t.upstream_refs, "downstream_refs": t.downstream_refs}


@router.post("/{table_id}/pull-stats")
def pull_stats(table_id: UUID, db: Session = Depends(get_db)):
    """Trigger column statistics pull from BigQuery."""
    from ..services.bq_stats import pull_column_stats

    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")

    col_names = [c.name for c in t.columns]
    stats = pull_column_stats(ds.project_id, ds.dataset_id, t.table_id, col_names)

    now = datetime.now(timezone.utc)
    updated = 0
    for col in t.columns:
        s = stats.get(col.name)
        if s:
            col.approx_count_distinct = s["approx_count_distinct"]
            col.null_pct = s["null_pct"]
            col.min_val = s["min_val"]
            col.max_val = s["max_val"]
            col.last_stats_at = now
            updated += 1

    db.commit()
    return {"updated_columns": updated, "pulled_at": now.isoformat()}


@router.post("/{table_id}/insights", response_model=TableInsights)
def generate_insights(
    table_id: UUID,
    db: Session = Depends(get_db),
):
    """Generate AI insights for the table using Vertex AI Gemini and cache them."""
    from ..services.insights import generate_insights as _generate
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")

    bq_path = f"{ds.project_id}.{ds.dataset_id}.{t.table_id}"
    columns = [
        {
            "name": c.name,
            "data_type": c.data_type,
            "description": c.description,
            "is_pii": c.is_pii,
            "null_pct": c.null_pct,
            "approx_count_distinct": c.approx_count_distinct,
            "min_val": c.min_val,
            "max_val": c.max_val,
        }
        for c in sorted(t.columns, key=lambda c: c.position)
    ]

    try:
        result = _generate(
            project_id=ds.project_id,
            table_name=t.display_name or t.table_id,
            table_bq_path=bq_path,
            description=t.description,
            sensitivity_label=t.sensitivity_label,
            tags=list(t.tags or []),
            row_count=t.row_count,
            size_bytes=t.size_bytes,
            columns=columns,
            dataset_description=ds.description,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    t.insights = result
    t.insights_generated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(t)
    return TableInsights(**t.insights)


@router.put("/{table_id}/projects", response_model=TableResponse)
def update_table_projects(
    table_id: UUID,
    payload: list[ProjectUsage],
    db: Session = Depends(get_db),
):
    """Replace the list of DS projects that use this table."""
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.used_in_projects = [p.model_dump() for p in payload]
    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.get("/{table_id}/usage")
def get_usage_stats(
    table_id: UUID,
    days: int = Query(default=30, ge=1, le=90),
    db: Session = Depends(get_db),
):
    """
    Query INFORMATION_SCHEMA.JOBS to surface who is querying this table
    and how often, over the past `days` days.
    """
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")
    try:
        return bq_usage.fetch(
            project_id=ds.project_id,
            dataset_id=ds.dataset_id,
            table_id=t.table_id,
            location=ds.bq_location,
            secret_name=settings.bq_secret_name or None,
            days=days,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Usage stats failed: {exc}")


@router.post("/{table_id}/scan-pii")
def scan_pii(table_id: UUID, db: Session = Depends(get_db)):
    """
    Run Cloud DLP on a sample of this table to auto-detect PII columns.
    Updates column is_pii flags and sends a Chat notification if PII is found.
    """
    t = db.query(Table).options(joinedload(Table.columns)).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")

    columns = [{"name": c.name, "data_type": c.data_type} for c in t.columns]
    try:
        result = dlp_scan.scan(
            project_id=ds.project_id,
            dataset_id=ds.dataset_id,
            table_id=t.table_id,
            columns=columns,
            secret_name=settings.bq_secret_name or None,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"DLP scan failed: {exc}")

    # Auto-update is_pii flags on columns
    pii_columns = result.get("findings_by_column", {})
    col_map = {c.name: c for c in t.columns}
    for col_name, col in col_map.items():
        col.is_pii = col_name in pii_columns
    db.commit()

    # Send Chat notification if PII was found
    if pii_columns:
        bq_path = f"{ds.project_id}.{ds.dataset_id}.{t.table_id}"
        notify_pii_detected(
            table_name=t.display_name or t.table_id,
            table_bq_path=bq_path,
            pii_columns=pii_columns,
            frontend_url=settings.frontend_url,
            table_id=str(t.id),
            dataset_id=str(ds.id),
        )

    return result


@router.post("/{table_id}/dataplex-quality")
def dataplex_quality_scan(table_id: UUID, db: Session = Depends(get_db)):
    """
    Create and run a Dataplex DataScan quality job on this BQ table.
    Polls until complete and returns structured quality results.
    """
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")

    try:
        result = dataplex_quality.run_quality_scan(
            project_id=ds.project_id,
            dataset_id=ds.dataset_id,
            table_id=t.table_id,
            location=ds.bq_location,
            secret_name=settings.bq_secret_name or None,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Dataplex quality scan failed: {exc}")

    # Send Chat notification with quality score
    dqr = result.get("data_quality_result", {})
    if dqr:
        bq_path = f"{ds.project_id}.{ds.dataset_id}.{t.table_id}"
        notify_quality_score(
            table_name=t.display_name or t.table_id,
            table_bq_path=bq_path,
            score=dqr.get("score"),
            passed=dqr.get("passed", False),
            dimensions=dqr.get("dimensions", []),
            frontend_url=settings.frontend_url,
            table_id=str(t.id),
            dataset_id=str(ds.id),
        )

    return result


@router.get("/{table_id}/schema-history")
def get_schema_history(
    table_id: UUID,
    days: int = Query(default=30, ge=1, le=30),
    db: Session = Depends(get_db),
):
    """
    Fetch schema change history via Cloud Asset Inventory.
    Returns column additions, removals, and type changes over the past `days` days.
    """
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Parent dataset not found")

    try:
        return asset_inventory.fetch_schema_history(
            project_id=ds.project_id,
            dataset_id=ds.dataset_id,
            table_id=t.table_id,
            secret_name=settings.bq_secret_name or None,
            days=days,
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Schema history fetch failed: {exc}")


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(table_id: UUID, db: Session = Depends(get_db)):
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.is_active = False
    db.commit()
