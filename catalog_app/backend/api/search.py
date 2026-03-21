from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.catalog import Dataset, Table
from ..schemas.catalog import SearchResponse, SearchResult

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
def search(
    q: str = Query(..., min_length=1, description="Search query"),
    entity_type: Optional[str] = Query(default=None, description="'dataset' or 'table'"),
    project_id: Optional[str] = None,
    sensitivity_label: Optional[str] = None,
    tags: Optional[list[str]] = Query(default=None),
    skip: int = 0,
    limit: int = 30,
    db: Session = Depends(get_db),
):
    results: list[SearchResult] = []

    ts_query = func.plainto_tsquery("english", q)

    # ── Search datasets ───────────────────────────────────────────────────────
    if entity_type in (None, "dataset"):
        dq = db.query(Dataset).filter(
            Dataset.is_active == True,
            Dataset.search_vector.op("@@")(ts_query),
        )
        if project_id:
            dq = dq.filter(Dataset.project_id == project_id)
        if sensitivity_label:
            dq = dq.filter(Dataset.sensitivity_label == sensitivity_label)
        if tags:
            dq = dq.filter(Dataset.tags.overlap(tags))
        dq = dq.order_by(
            func.ts_rank(Dataset.search_vector, ts_query).desc()
        )
        for ds in dq.all():
            results.append(
                SearchResult(
                    entity_type="dataset",
                    id=ds.id,
                    name=ds.display_name or ds.dataset_id,
                    description=ds.description,
                    project_id=ds.project_id,
                    dataset_id=ds.dataset_id,
                    tags=ds.tags or [],
                    sensitivity_label=ds.sensitivity_label,
                    updated_at=ds.updated_at,
                )
            )

    # ── Search tables ─────────────────────────────────────────────────────────
    if entity_type in (None, "table"):
        tq = db.query(Table, Dataset).join(Dataset, Table.dataset_id == Dataset.id).filter(
            Table.is_active == True,
            Table.search_vector.op("@@")(ts_query),
        )
        if project_id:
            tq = tq.filter(Dataset.project_id == project_id)
        if sensitivity_label:
            tq = tq.filter(Table.sensitivity_label == sensitivity_label)
        if tags:
            tq = tq.filter(Table.tags.overlap(tags))
        tq = tq.order_by(
            func.ts_rank(Table.search_vector, ts_query).desc()
        )
        for t, ds in tq.all():
            results.append(
                SearchResult(
                    entity_type="table",
                    id=t.id,
                    name=t.display_name or t.table_id,
                    description=t.description,
                    project_id=ds.project_id,
                    dataset_id=ds.dataset_id,
                    table_id=t.table_id,
                    tags=t.tags or [],
                    sensitivity_label=t.sensitivity_label,
                    updated_at=t.updated_at,
                )
            )

    # Sort merged results by relevance (datasets and tables already ranked individually)
    results_page = results[skip : skip + limit]

    return SearchResponse(query=q, total=len(results), results=results_page)
