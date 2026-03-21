from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.catalog import Dataset, Table, TableColumn
from ..schemas.catalog import ColumnUpdate, ExampleQuery, QualityCheckResult, TableCreate, TableResponse, TableUpdate, ValidatePayload
from ..services import bq_preview, bq_quality

router = APIRouter(prefix="/tables", tags=["tables"])


def _table_response(t: Table, db: Session) -> TableResponse:
    ds = db.query(Dataset).filter(Dataset.id == t.dataset_id).first()
    resp = TableResponse.model_validate(t)
    if ds:
        resp.dataset_project_id = ds.project_id
        resp.dataset_display_name = ds.display_name or ds.dataset_id
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
def update_table(table_id: UUID, payload: TableUpdate, db: Session = Depends(get_db)):
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(t, field, value)
    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.patch("/{table_id}/validate", response_model=TableResponse)
def validate_table(table_id: UUID, payload: ValidatePayload, db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    if t.is_validated:
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
    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.patch("/{table_id}/columns", response_model=TableResponse)
def update_columns(table_id: UUID, payload: list[ColumnUpdate], db: Session = Depends(get_db)):
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
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
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.example_queries = [q.model_dump() for q in payload]
    db.commit()
    db.refresh(t)
    return _table_response(t, db)


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(table_id: UUID, db: Session = Depends(get_db)):
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.is_active = False
    db.commit()
