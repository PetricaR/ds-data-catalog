from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..dependencies.auth import get_current_user
from ..models.catalog import GCPSource, User
from ..services.bq_sync import SyncResult, _credentials_from_user_token, sync_project

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


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_user_credentials(current_user: dict | None, db: Session):
    """Return google.oauth2.credentials.Credentials for the current user, or None."""
    if not current_user:
        return None
    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user or not user.gcp_access_token:
        return None
    return _credentials_from_user_token(
        access_token=user.gcp_access_token,
        refresh_token=user.gcp_refresh_token,
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        token_expiry=user.gcp_token_expiry,
    )


# ── Project discovery ─────────────────────────────────────────────────────────

class ProjectInfo(BaseModel):
    project_id: str
    display_name: str
    already_added: bool


@router.get("/projects", response_model=list[ProjectInfo])
def list_accessible_projects(
    db: Session = Depends(get_db),
    current_user: dict | None = Depends(get_current_user),
):
    """
    List all GCP projects the logged-in user has access to,
    annotated with whether they're already added as sources.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="Not authenticated")

    user = db.query(User).filter(User.id == current_user["id"]).first()
    if not user or not user.gcp_access_token:
        raise HTTPException(
            status_code=400,
            detail="No GCP credentials on file — please sign out and sign in again to grant access.",
        )

    try:
        resp = httpx.get(
            "https://cloudresourcemanager.googleapis.com/v1/projects",
            headers={"Authorization": f"Bearer {user.gcp_access_token}"},
            params={"filter": "lifecycleState:ACTIVE"},
            timeout=15,
        )
        if resp.status_code == 401:
            raise HTTPException(
                status_code=401,
                detail="GCP token expired — please sign out and sign in again.",
            )
        resp.raise_for_status()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=502, detail=f"Cloud Resource Manager error: {exc.response.text[:200]}")
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Could not reach Google API: {exc}")

    existing_ids = {s.project_id for s in db.query(GCPSource.project_id).all()}

    projects = []
    for p in resp.json().get("projects", []):
        if p.get("lifecycleState") != "ACTIVE":
            continue
        pid = p["projectId"]
        projects.append(ProjectInfo(
            project_id=pid,
            display_name=p.get("name") or pid,
            already_added=pid in existing_ids,
        ))

    projects.sort(key=lambda p: (p.already_added, p.display_name.lower()))
    return projects


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
def sync_one(
    req: SyncRequest = SyncRequest(),
    db: Session = Depends(get_db),
    current_user: dict | None = Depends(get_current_user),
):
    """
    Sync a single GCP project.  Defaults to GCP_PROJECT_ID from config.
    Uses the logged-in user's OAuth credentials if available, then falls back
    to Secret Manager SA key or Workload Identity / ADC.
    """
    project_id = req.project_id or settings.gcp_project_id
    if not project_id:
        raise HTTPException(
            status_code=422,
            detail="project_id required (set GCP_PROJECT_ID in config or pass in body)",
        )

    user_creds = _get_user_credentials(current_user, db)
    result = sync_project(
        db=db,
        project_id=project_id,
        secret_name=req.secret_name or None,
        secret_version=req.secret_version,
        dataset_filter=req.dataset_filter,
        user_credentials=user_creds,
    )
    return SyncResponse(project_id=project_id, result=result.to_dict())


@router.post("/sync/all", response_model=list[SyncResponse])
def sync_all(
    db: Session = Depends(get_db),
    current_user: dict | None = Depends(get_current_user),
):
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

    user_creds = _get_user_credentials(current_user, db)

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
                user_credentials=user_creds,
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
def sync_one_source(
    source_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict | None = Depends(get_current_user),
):
    """Sync a specific source by its ID."""
    source = db.query(GCPSource).filter(GCPSource.id == source_id).first()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")

    source.last_sync_status = "running"
    db.commit()

    user_creds = _get_user_credentials(current_user, db)
    try:
        result = sync_project(
            db=db,
            project_id=source.project_id,
            secret_name=source.secret_name,
            user_credentials=user_creds,
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

    return SyncResponse(project_id=source.project_id, result=result.to_dict())
