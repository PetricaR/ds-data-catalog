from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.catalog import Dataset, SchemaChange, Table
from ..schemas.catalog import SchemaChangeResponse

router = APIRouter(prefix="/schema-changes", tags=["schema-changes"])


def _enrich(change: SchemaChange, db: Session) -> SchemaChangeResponse:
    tbl = db.query(Table).filter(Table.id == change.table_id).first()
    ds = db.query(Dataset).filter(Dataset.id == tbl.dataset_id).first() if tbl else None
    return SchemaChangeResponse(
        id=change.id,
        table_id=change.table_id,
        change_type=change.change_type,
        column_name=change.column_name,
        detected_at=change.detected_at,
        is_acknowledged=change.is_acknowledged,
        table_table_id=tbl.table_id if tbl else "",
        table_display_name=tbl.display_name if tbl else None,
        dataset_uuid=ds.id if ds else change.table_id,  # fallback to table_id to avoid None crash
        dataset_id_str=ds.dataset_id if ds else "",
        project_id=ds.project_id if ds else "",
    )


@router.get("", response_model=list[SchemaChangeResponse])
def list_changes(
    acknowledged: bool = False,
    table_id: UUID | None = None,
    db: Session = Depends(get_db),
):
    q = db.query(SchemaChange).filter(SchemaChange.is_acknowledged == acknowledged)
    if table_id:
        q = q.filter(SchemaChange.table_id == table_id)
    changes = q.order_by(SchemaChange.detected_at.desc()).limit(200).all()
    return [_enrich(c, db) for c in changes]


@router.patch("/{change_id}/acknowledge", response_model=SchemaChangeResponse)
def acknowledge(change_id: UUID, db: Session = Depends(get_db)):
    change = db.query(SchemaChange).filter(SchemaChange.id == change_id).first()
    if not change:
        raise HTTPException(status_code=404, detail="Schema change not found")
    change.is_acknowledged = True
    db.commit()
    db.refresh(change)
    return _enrich(change, db)


@router.post("/acknowledge-all", response_model=dict)
def acknowledge_all(table_id: UUID | None = None, db: Session = Depends(get_db)):
    q = db.query(SchemaChange).filter(SchemaChange.is_acknowledged == False)  # noqa: E712
    if table_id:
        q = q.filter(SchemaChange.table_id == table_id)
    count = q.update({"is_acknowledged": True}, synchronize_session=False)
    db.commit()
    return {"acknowledged": count}
