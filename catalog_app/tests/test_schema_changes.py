"""Schema changes endpoint tests."""

import uuid
from datetime import datetime, timezone

from backend.models.catalog import SchemaChange


def seed_change(db, table_id, change_type="column_added", column_name="new_col", acknowledged=False):
    change = SchemaChange(
        table_id=table_id,
        change_type=change_type,
        column_name=column_name,
        detected_at=datetime.now(timezone.utc),
        is_acknowledged=acknowledged,
    )
    db.add(change)
    db.commit()
    db.refresh(change)
    return change


class TestListSchemaChanges:
    def test_list_requires_auth(self, client):
        r = client.get("/api/v1/schema-changes")
        assert r.status_code == 401

    def test_list_returns_unacknowledged_by_default(self, client, auth_headers, db, seed_table):
        seed_change(db, seed_table.id, acknowledged=False)
        seed_change(db, seed_table.id, column_name="col2", acknowledged=True)
        r = client.get("/api/v1/schema-changes?acknowledged=false", headers=auth_headers)
        assert r.status_code == 200
        for item in r.json():
            assert item["is_acknowledged"] is False

    def test_list_filter_acknowledged(self, client, auth_headers, db, seed_table):
        seed_change(db, seed_table.id, column_name="ack_col", acknowledged=True)
        r = client.get("/api/v1/schema-changes?acknowledged=true", headers=auth_headers)
        assert r.status_code == 200
        for item in r.json():
            assert item["is_acknowledged"] is True

    def test_list_filter_by_table(self, client, auth_headers, db, seed_table):
        seed_change(db, seed_table.id, column_name="filtered_col")
        r = client.get(
            f"/api/v1/schema-changes?table_id={seed_table.id}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        for item in r.json():
            assert item["table_id"] == str(seed_table.id)


class TestAcknowledgeChange:
    def test_acknowledge_single(self, client, auth_headers, db, seed_table):
        change = seed_change(db, seed_table.id, column_name="to_ack")
        r = client.patch(
            f"/api/v1/schema-changes/{change.id}/acknowledge",
            headers=auth_headers,
        )
        assert r.status_code == 200
        assert r.json()["is_acknowledged"] is True

    def test_acknowledge_nonexistent_returns_404(self, client, auth_headers):
        r = client.patch(
            f"/api/v1/schema-changes/{uuid.uuid4()}/acknowledge",
            headers=auth_headers,
        )
        assert r.status_code == 404


class TestAcknowledgeAll:
    def test_acknowledge_all_for_table(self, client, auth_headers, db, seed_table):
        seed_change(db, seed_table.id, column_name="a1")
        seed_change(db, seed_table.id, column_name="a2")
        r = client.post(
            f"/api/v1/schema-changes/acknowledge-all?table_id={seed_table.id}",
            headers=auth_headers,
        )
        assert r.status_code == 200
        # Verify all are now acknowledged
        r2 = client.get(
            f"/api/v1/schema-changes?acknowledged=false&table_id={seed_table.id}",
            headers=auth_headers,
        )
        assert r2.json() == []
