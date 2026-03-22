from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.catalog import Dataset, MetadataChangeLog, Table
from ..schemas.catalog import DatasetCreate, DatasetResponse, DatasetUpdate

router = APIRouter(prefix="/datasets", tags=["datasets"])


def _log_dataset_field_changes(
    db: Session,
    ds: Dataset,
    update_data: dict,
    changed_by: str = "system",
):
    watch_fields = ["description", "sensitivity_label", "owner", "data_steward", "tags"]
    for field in watch_fields:
        if field not in update_data:
            continue
        old_val = getattr(ds, field, None)
        new_val = update_data[field]
        if old_val != new_val:
            db.add(MetadataChangeLog(
                entity_type="dataset",
                entity_id=ds.id,
                entity_name=ds.display_name or ds.dataset_id,
                field_changed=field,
                old_value=str(old_val) if old_val is not None else None,
                new_value=str(new_val) if new_val is not None else None,
                changed_by=changed_by,
                data_steward=ds.data_steward,
            ))


def _dataset_response(ds: Dataset, db: Session) -> DatasetResponse:
    table_count = db.query(func.count(Table.id)).filter(
        Table.dataset_id == ds.id, Table.is_active == True
    ).scalar() or 0
    resp = DatasetResponse.model_validate(ds)
    resp.table_count = table_count
    return resp


@router.get("", response_model=list[DatasetResponse])
def list_datasets(
    project_id: Optional[str] = None,
    sensitivity_label: Optional[str] = None,
    tags: Optional[list[str]] = Query(default=None),
    owner: Optional[str] = None,
    validated: Optional[bool] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
):
    q = db.query(Dataset).filter(Dataset.is_active == True)
    if validated is not None:
        q = q.filter(Dataset.is_validated == validated)
    if project_id:
        q = q.filter(Dataset.project_id == project_id)
    if sensitivity_label:
        q = q.filter(Dataset.sensitivity_label == sensitivity_label)
    if owner:
        q = q.filter(Dataset.owner.ilike(f"%{owner}%"))
    if tags:
        q = q.filter(Dataset.tags.overlap(tags))
    q = q.order_by(Dataset.updated_at.desc())
    datasets = q.offset(skip).limit(limit).all()
    return [_dataset_response(ds, db) for ds in datasets]


@router.post("", response_model=DatasetResponse, status_code=status.HTTP_201_CREATED)
def create_dataset(payload: DatasetCreate, db: Session = Depends(get_db)):
    existing = db.query(Dataset).filter(
        Dataset.project_id == payload.project_id,
        Dataset.dataset_id == payload.dataset_id,
        Dataset.is_active == True,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Dataset '{payload.project_id}.{payload.dataset_id}' already exists.",
        )
    ds = Dataset(**payload.model_dump())
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return _dataset_response(ds, db)


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: UUID,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.is_active == True).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    if ds.sensitivity_label == "restricted" and (
        not current_user or current_user["role"] not in ("editor", "admin")
    ):
        raise HTTPException(status_code=403, detail="This dataset is restricted. Admin or editor access required.")
    return _dataset_response(ds, db)


@router.put("/{dataset_id}", response_model=DatasetResponse)
def update_dataset(
    dataset_id: UUID,
    payload: DatasetUpdate,
    db: Session = Depends(get_db),
    current_user: Optional[dict] = Depends(get_current_user),
):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.is_active == True).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    update_data = payload.model_dump(exclude_none=True)
    changed_by = (current_user or {}).get("email", "system")
    _log_dataset_field_changes(db, ds, update_data, changed_by=changed_by)
    for field, value in update_data.items():
        setattr(ds, field, value)
    db.commit()
    db.refresh(ds)
    return _dataset_response(ds, db)


@router.patch("/{dataset_id}/validate", response_model=DatasetResponse)
def validate_dataset(dataset_id: UUID, validated_by: str = "anonymous", db: Session = Depends(get_db)):
    from datetime import datetime, timezone
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.is_active == True).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    ds.is_validated = not ds.is_validated
    ds.validated_by = validated_by if ds.is_validated else None
    ds.validated_at = datetime.now(timezone.utc) if ds.is_validated else None
    db.commit()
    db.refresh(ds)
    return _dataset_response(ds, db)


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.is_active == True).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    ds.is_active = False
    db.commit()


@router.get("/{dataset_id}/tables")
def list_tables_in_dataset(dataset_id: UUID, db: Session = Depends(get_db)):
    ds = db.query(Dataset).filter(Dataset.id == dataset_id, Dataset.is_active == True).first()
    if not ds:
        raise HTTPException(status_code=404, detail="Dataset not found")
    from ..schemas.catalog import TableResponse
    tables = db.query(Table).filter(Table.dataset_id == dataset_id, Table.is_active == True).all()
    results = []
    for t in tables:
        resp = TableResponse.model_validate(t)
        resp.dataset_project_id = ds.project_id
        resp.dataset_display_name = ds.display_name or ds.dataset_id
        resp.dataset_bq_dataset_id = ds.dataset_id
        results.append(resp)
    return results
