from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.catalog import Dataset, Table

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=list[str])
def list_tags(db: Session = Depends(get_db)):
    """Return all unique tags across datasets and tables, sorted alphabetically."""
    dataset_tags = (
        db.query(func.unnest(Dataset.tags)).filter(Dataset.is_active == True).all()
    )
    table_tags = (
        db.query(func.unnest(Table.tags)).filter(Table.is_active == True).all()
    )
    all_tags = sorted({t[0] for t in dataset_tags + table_tags if t[0]})
    return all_tags
