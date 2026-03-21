from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.catalog import Dataset, Table, TableColumn
from ..schemas.catalog import CatalogStats

router = APIRouter(prefix="/stats", tags=["stats"])


@router.get("", response_model=CatalogStats)
def get_stats(db: Session = Depends(get_db)):
    total_datasets = db.query(func.count(Dataset.id)).filter(Dataset.is_active == True).scalar() or 0
    total_tables = db.query(func.count(Table.id)).filter(Table.is_active == True).scalar() or 0
    total_columns = (
        db.query(func.count(TableColumn.id))
        .join(Table, TableColumn.table_id == Table.id)
        .filter(Table.is_active == True)
        .scalar() or 0
    )
    documented_tables = (
        db.query(func.count(Table.id))
        .filter(Table.is_active == True, Table.description.isnot(None), Table.description != "")
        .scalar() or 0
    )
    coverage = round((documented_tables / total_tables * 100) if total_tables > 0 else 0.0, 1)

    return CatalogStats(
        total_datasets=total_datasets,
        total_tables=total_tables,
        total_columns=total_columns,
        documented_tables=documented_tables,
        documentation_coverage=coverage,
    )
