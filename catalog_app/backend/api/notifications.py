"""Data steward notification / metadata change log endpoints."""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.catalog import MetadataChangeLog
from ..schemas.catalog import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationResponse])
def list_notifications(limit: int = 20, db: Session = Depends(get_db)):
    """Return recent unnotified metadata changes."""
    logs = (
        db.query(MetadataChangeLog)
        .filter(MetadataChangeLog.is_notified == False)  # noqa: E712
        .order_by(MetadataChangeLog.changed_at.desc())
        .limit(limit)
        .all()
    )
    return [NotificationResponse.model_validate(log) for log in logs]


@router.post("/{notification_id}/dismiss")
def dismiss_notification(notification_id: str, db: Session = Depends(get_db)):
    log = db.query(MetadataChangeLog).filter(MetadataChangeLog.id == UUID(notification_id)).first()
    if not log:
        raise HTTPException(status_code=404, detail="Notification not found")
    log.is_notified = True
    db.commit()
    return {"ok": True}


@router.post("/dismiss-all")
def dismiss_all(db: Session = Depends(get_db)):
    db.query(MetadataChangeLog).filter(
        MetadataChangeLog.is_notified == False  # noqa: E712
    ).update({"is_notified": True}, synchronize_session=False)
    db.commit()
    return {"ok": True}
