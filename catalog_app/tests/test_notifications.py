"""Notifications endpoint tests."""

import uuid
from datetime import datetime, timezone

from backend.models.catalog import MetadataChangeLog


def seed_notification(db, entity_id=None, is_notified=False):
    log = MetadataChangeLog(
        entity_type="table",
        entity_id=entity_id or uuid.uuid4(),
        entity_name="test_table",
        field_changed="description",
        old_value="old",
        new_value="new",
        changed_by="user@example.com",
        changed_at=datetime.now(timezone.utc),
        is_notified=is_notified,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


class TestListNotifications:
    def test_list_returns_unnotified(self, client, auth_headers, db):
        seed_notification(db, is_notified=False)
        r = client.get("/api/v1/notifications", headers=auth_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_list_structure(self, client, auth_headers, db):
        n = seed_notification(db)
        r = client.get("/api/v1/notifications", headers=auth_headers)
        assert r.status_code == 200
        if r.json():
            item = r.json()[0]
            assert "id" in item
            assert "entity_type" in item
            assert "field_changed" in item


class TestDismissNotification:
    def test_dismiss_single(self, client, auth_headers, db):
        n = seed_notification(db)
        r = client.post(
            f"/api/v1/notifications/{n.id}/dismiss",
            headers=auth_headers,
        )
        assert r.status_code == 200

    def test_dismiss_nonexistent_returns_404(self, client, auth_headers):
        r = client.post(
            f"/api/v1/notifications/{uuid.uuid4()}/dismiss",
            headers=auth_headers,
        )
        assert r.status_code == 404


class TestDismissAll:
    def test_dismiss_all(self, client, auth_headers, db):
        seed_notification(db)
        seed_notification(db)
        r = client.post("/api/v1/notifications/dismiss-all", headers=auth_headers)
        assert r.status_code == 200
        # After dismiss-all, list should be empty
        r2 = client.get("/api/v1/notifications", headers=auth_headers)
        assert r2.status_code == 200
        assert r2.json() == []
