from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..services.bq_sync import SyncResult, sync_project

router = APIRouter(prefix="/bq", tags=["bigquery"])


class SyncRequest(BaseModel):
    project_id: Optional[str] = None          # defaults to GCP_PROJECT_ID in .env
    secret_name: Optional[str] = None         # defaults to BQ_SECRET_NAME in .env
    secret_version: str = "latest"
    dataset_filter: Optional[str] = None      # optional prefix to limit datasets


class SyncResponse(BaseModel):
    project_id: str
    secret_name: str
    result: dict


# ── Synchronous sync (waits for completion, returns result) ───────────────────

@router.post("/sync", response_model=SyncResponse)
def trigger_sync(
    req: SyncRequest = SyncRequest(),
    db: Session = Depends(get_db),
):
    project_id = req.project_id or settings.gcp_project_id
    secret_name = req.secret_name or settings.bq_secret_name

    if not project_id:
        raise HTTPException(status_code=422, detail="GCP project_id is required (set GCP_PROJECT_ID in .env or pass in request body).")
    if not secret_name:
        raise HTTPException(status_code=422, detail="secret_name is required (set BQ_SECRET_NAME in .env or pass in request body).")

    result: SyncResult = sync_project(
        db=db,
        project_id=project_id,
        secret_name=secret_name,
        secret_version=req.secret_version,
        dataset_filter=req.dataset_filter,
    )

    return SyncResponse(
        project_id=project_id,
        secret_name=secret_name,
        result=result.to_dict(),
    )
