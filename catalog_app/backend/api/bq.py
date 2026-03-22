from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.catalog import GCPSource
from ..services.bq_sync import SyncResult, sync_project

router = APIRouter(prefix="/bq", tags=["bigquery"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class SourceCreate(BaseModel):
    project_id: str
    display_name: Optional[str] = None
    secret_name: Optional[str] = None   # omit to use Workload Identity / ADC


class SourceUpdate(BaseModel):
    display_name: Optional[str] = None
    secret_name: Optional[str] = None
    is_active: Optional[bool] = None


class SourceResponse(BaseModel):
    id: UUID
    project_id: str
    display_name: Optional[str]
    secret_name: Optional[str]
    is_active: bool
    last_synced_at: Optional[datetime]
    last_sync_status: Optional[str]
    last_sync_summary: Optional[dict]
    created_at: Optional[datetime]
    created_by: Optional[str]

    class Config:
        from_attributes = True


class SyncRequest(BaseModel):
    project_id: Optional[str] = None       # defaults to GCP_PROJECT_ID in config
    secret_name: Optional[str] = None      # omit to use ADC / Workload Identity
    secret_version: str = "latest"
    dataset_filter: Optional[str] = None


class SyncResponse(BaseModel):
    project_id: str
    result: dict


# ── Sources CRUD ──────────────────────────────────────────────────────────────

@router.get("/sources", response_model=list[SourceResponse])
def list_sources(db: Session = Depends(get_db)):
    """List all configured GCP project sources."""
    return db.query(GCPSource).order_by(GCPSource.created_at).all()


@router.post("/sources", response_model=SourceResponse, status_code=201)
def add_source(body: SourceCreate, db: Session = Depends(get_db)):
    """Add a new GCP project as a sync source."""
    existing = db.query(GCPSource).filter(GCPSource.project_id == body.project_id).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Source '{body.project_id}' already exists")

    source = GCPSource(
        project_id=body.project_id,
        display_name=body.display_name or body.project_id,
        secret_name=body.secret_name or None,
        is_active=True,
    )
    db.add(source)
    db.commit()
    db.refresh(source)
    return source


@router.patch("/sources/{source_id}", response_model=SourceResponse)
def update_source(source_id: UUID, body: SourceUpdate, db: Session = Depends(get_db)):
    """Update display name, secret, or active state."""
    source = db.query(GCPSource).filter(GCPSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    if body.display_name is not None:
        source.display_name = body.display_name
    if body.secret_name is not None:
        source.secret_name = body.secret_name or None
    if body.is_active is not None:
        source.is_active = body.is_active
    db.commit()
    db.refresh(source)
    return source


@router.delete("/sources/{source_id}", status_code=204)
def delete_source(source_id: UUID, db: Session = Depends(get_db)):
    """Remove a source (does not delete synced datasets/tables)."""
    source = db.query(GCPSource).filter(GCPSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    db.delete(source)
    db.commit()


# ── Sync endpoints ────────────────────────────────────────────────────────────

@router.post("/sync", response_model=SyncResponse)
def sync_one(req: SyncRequest = SyncRequest(), db: Session = Depends(get_db)):
    """
    Sync a single GCP project.  Defaults to GCP_PROJECT_ID from config.
    Pass secret_name to use a SA key from Secret Manager, or omit to use
    Workload Identity / Application Default Credentials.
    """
    project_id = req.project_id or settings.gcp_project_id
    if not project_id:
        raise HTTPException(
            status_code=422,
            detail="project_id required (set GCP_PROJECT_ID in config or pass in body)",
        )

    result = sync_project(
        db=db,
        project_id=project_id,
        secret_name=req.secret_name or None,
        secret_version=req.secret_version,
        dataset_filter=req.dataset_filter,
    )
    return SyncResponse(project_id=project_id, result=result.to_dict())


@router.post("/sync/all", response_model=list[SyncResponse])
def sync_all(db: Session = Depends(get_db)):
    """
    Sync all active GCP sources in order.
    Each source is synced sequentially; errors in one source do not stop others.
    """
    sources = db.query(GCPSource).filter(GCPSource.is_active == True).all()  # noqa: E712
    if not sources:
        raise HTTPException(
            status_code=404,
            detail="No active sources found. Add sources via POST /bq/sources first.",
        )

    responses = []
    for source in sources:
        # Mark as running
        source.last_sync_status = "running"
        db.commit()

        try:
            result = sync_project(
                db=db,
                project_id=source.project_id,
                secret_name=source.secret_name,
            )
            source.last_sync_status = "ok" if not result.errors else "partial"
            source.last_sync_summary = result.to_dict()
        except Exception as exc:
            result = SyncResult()
            result.errors.append(str(exc))
            source.last_sync_status = "error"
            source.last_sync_summary = result.to_dict()

        source.last_synced_at = datetime.now(timezone.utc)
        db.commit()

        responses.append(SyncResponse(project_id=source.project_id, result=result.to_dict()))

    return responses


@router.post("/sync/source/{source_id}", response_model=SyncResponse)
def sync_one_source(source_id: UUID, db: Session = Depends(get_db)):
    """Sync a specific source by its ID."""
    source = db.query(GCPSource).filter(GCPSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.last_sync_status = "running"
    db.commit()

    try:
        result = sync_project(db=db, project_id=source.project_id, secret_name=source.secret_name)
        source.last_sync_status = "ok" if not result.errors else "partial"
        source.last_sync_summary = result.to_dict()
    except Exception as exc:
        result = SyncResult()
        result.errors.append(str(exc))
        source.last_sync_status = "error"
        source.last_sync_summary = result.to_dict()

    source.last_synced_at = datetime.now(timezone.utc)
    db.commit()

    return SyncResponse(project_id=source.project_id, result=result.to_dict())
