from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.catalog import Dataset, Table, TableColumn
from ..schemas.catalog import TableCreate, TableResponse, TableUpdate

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


@router.delete("/{table_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_table(table_id: UUID, db: Session = Depends(get_db)):
    t = db.query(Table).filter(Table.id == table_id, Table.is_active == True).first()
    if not t:
        raise HTTPException(status_code=404, detail="Table not found")
    t.is_active = False
    db.commit()
