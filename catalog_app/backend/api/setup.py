from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models.catalog import Dataset, GCPSource

router = APIRouter(prefix="/setup", tags=["setup"])


@router.get("/status")
def setup_status(db: Session = Depends(get_db)):
    """Return the current setup/health status of the installation."""
    try:
        db.execute(text("SELECT 1"))
        db_connected = True
    except Exception:
        db_connected = False

    bq_sources_count = db.query(GCPSource).count() if db_connected else 0
    datasets_count = db.query(Dataset).count() if db_connected else 0

    return {
        "database_connected": db_connected,
        "oauth_configured": bool(settings.google_client_id),
        "bq_sources_count": bq_sources_count,
        "has_data": datasets_count > 0,
        "gemini_configured": bool(settings.gemini_api_key),
        "gchat_configured": bool(settings.google_chat_webhook_url),
        "gcp_project_id": settings.gcp_project_id or "",
        "frontend_url": settings.frontend_url,
        # A fresh install has no sources and no data
        "is_fresh_install": bq_sources_count == 0 and datasets_count == 0,
    }
