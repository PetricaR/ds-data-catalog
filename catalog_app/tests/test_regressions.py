"""Regression tests for bugs fixed together: search, deleted datasets, sync, sources, the read-only guard."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

from backend.models.catalog import GCPSource, TableColumn
from backend.services.bq_safety import assert_read_only
from backend.services.bq_sync import sync_project
from tests.conftest import bearer, make_user


class TestSearchColumnFilter:
    def test_column_name_filter_finds_the_table(self, client, auth_headers, seed_column):
        # Used to fail with a 500: Postgres rejects SELECT DISTINCT with ORDER BY ts_rank(...)
        r = client.get("/api/v1/search?q=test&column_name=id", headers=auth_headers)
        assert r.status_code == 200
        ids = [x["id"] for x in r.json()["results"]]
        assert str(seed_column.table_id) in ids

    def test_column_name_filter_excludes_other_tables(self, client, auth_headers, seed_column):
        r = client.get("/api/v1/search?q=test&column_name=no_such_column", headers=auth_headers)
        assert r.status_code == 200
        assert r.json()["results"] == []


class TestDeletedDatasetHidesItsTables:
    @pytest.fixture()
    def deleted(self, client, auth_headers, seed_dataset, seed_column):
        assert client.delete(f"/api/v1/datasets/{seed_dataset.id}", headers=auth_headers).status_code == 204
        return seed_column

    def test_delete_soft_deletes_tables(self, db, deleted):
        db.expire_all()
        assert deleted.table.is_active is False

    def test_hidden_from_table_list(self, client, auth_headers, deleted):
        ids = [t["id"] for t in client.get("/api/v1/tables", headers=auth_headers).json()]
        assert str(deleted.table_id) not in ids

    def test_hidden_from_search(self, client, auth_headers, deleted):
        results = client.get("/api/v1/search?q=test", headers=auth_headers).json()["results"]
        assert str(deleted.table_id) not in [x["id"] for x in results]

    def test_hidden_from_column_search(self, client, auth_headers, deleted):
        cols = client.get("/api/v1/search/columns?name=id", headers=auth_headers).json()
        assert str(deleted.table_id) not in [c["table_id"] for c in cols]

    def test_table_left_active_in_a_deleted_dataset_is_hidden(self, client, auth_headers, db, seed_dataset, seed_column):
        # Datasets deleted before the cascade existed left their tables active
        seed_dataset.is_active = False
        db.commit()
        assert client.get(f"/api/v1/tables/{seed_column.table_id}", headers=auth_headers).status_code == 404
        ids = [t["id"] for t in client.get("/api/v1/tables", headers=auth_headers).json()]
        assert str(seed_column.table_id) not in ids
        stats = client.get("/api/v1/stats", headers=auth_headers).json()
        assert stats["total_tables"] == 0 and stats["total_columns"] == 0


class TestValidatedFilter:
    def test_list_only_validated_tables(self, client, auth_headers, db, seed_table):
        r = client.get("/api/v1/tables?validated=true", headers=auth_headers)
        assert str(seed_table.id) not in [t["id"] for t in r.json()]
        seed_table.is_validated = True
        db.commit()
        r = client.get("/api/v1/tables?validated=true", headers=auth_headers)
        assert [t["id"] for t in r.json()] == [str(seed_table.id)]


def _field(name, field_type="STRING", mode="NULLABLE", description=None):
    return SimpleNamespace(name=name, field_type=field_type, mode=mode, description=description)


def _fake_bq_client(dataset_id, table_id, schema):
    now = datetime.now(timezone.utc)
    ds_ref = SimpleNamespace(dataset_id=dataset_id, reference=dataset_id)
    tbl_ref = SimpleNamespace(table_id=table_id)
    client = MagicMock()
    client.list_datasets.return_value = [ds_ref]
    client.get_dataset.return_value = SimpleNamespace(
        friendly_name=None, description=None, location="EU", created=now, modified=now,
    )
    client.list_tables.return_value = [tbl_ref]
    client.get_table.return_value = SimpleNamespace(
        friendly_name=None, description=None, num_rows=10, num_bytes=100, created=now, modified=now, schema=schema,
    )
    return client


class TestResyncKeepsColumnMetadata:
    def test_pii_flags_stats_and_ids_survive_a_resync(self, db, seed_dataset, seed_table, seed_column):
        seed_column.is_pii = True
        seed_column.description = "Primary key"
        seed_column.null_pct = 0.0
        seed_column.approx_count_distinct = 1000
        seed_column.last_stats_at = datetime.now(timezone.utc)
        db.commit()
        column_id = seed_column.id

        fake = _fake_bq_client(
            seed_dataset.dataset_id, seed_table.table_id,
            [_field("id", "INTEGER", "REQUIRED", "from BigQuery"), _field("added_col")],
        )
        with patch("backend.services.bq_sync._bq_client", return_value=fake):
            result = sync_project(db, project_id=seed_dataset.project_id)
        assert result.errors == []

        db.expire_all()
        cols = {c.name: c for c in db.query(TableColumn).filter(TableColumn.table_id == seed_table.id)}
        assert set(cols) == {"id", "added_col"}
        kept = cols["id"]
        assert kept.id == column_id
        assert kept.is_pii is True
        assert kept.description == "Primary key"
        assert kept.approx_count_distinct == 1000
        assert kept.is_nullable is False
        assert cols["added_col"].position == 1

    def test_removed_columns_are_dropped(self, db, seed_dataset, seed_table, seed_column):
        fake = _fake_bq_client(seed_dataset.dataset_id, seed_table.table_id, [_field("other")])
        with patch("backend.services.bq_sync._bq_client", return_value=fake):
            sync_project(db, project_id=seed_dataset.project_id)
        db.expire_all()
        names = [c.name for c in db.query(TableColumn).filter(TableColumn.table_id == seed_table.id)]
        assert names == ["other"]


class TestSourceCredentials:
    def _credentials_used(self, client, db, secret_name):
        admin = make_user(db, "admin")
        admin.gcp_access_token = "user-token"
        db.add(GCPSource(project_id=f"cred-test-{secret_name or 'none'}", secret_name=secret_name, is_active=True))
        db.commit()
        source = db.query(GCPSource).filter(GCPSource.project_id == f"cred-test-{secret_name or 'none'}").one()
        result = MagicMock(errors=[])
        result.to_dict.return_value = {"errors": []}
        user_creds = object()
        with patch("backend.api.bq._credentials_from_user_token", return_value=user_creds), \
             patch("backend.api.bq.sync_project", return_value=result) as sync:
            r = client.post(f"/api/v1/bq/sync/source/{source.id}", headers=bearer(admin))
        assert r.status_code == 200
        return sync.call_args.kwargs["user_credentials"], user_creds

    def test_source_secret_wins_over_the_admins_token(self, client, db):
        used, _ = self._credentials_used(client, db, "sa-key")
        assert used is None

    def test_source_without_secret_syncs_as_the_admin(self, client, db):
        used, user_creds = self._credentials_used(client, db, None)
        assert used is user_creds

    def test_projects_endpoint_does_not_sign_the_user_out(self, client, db):
        # A rejected Google token must not come back as 401, which the frontend treats as an expired session
        admin = make_user(db, "admin")
        admin.gcp_access_token = "expired-at-google"
        db.commit()
        with patch("backend.api.bq.httpx.get", return_value=MagicMock(status_code=401)):
            r = client.get("/api/v1/bq/projects", headers=bearer(admin))
        assert r.status_code == 400
        assert "sign in again" in r.json()["detail"]


class TestReadOnlyGuard:
    @pytest.mark.parametrize("sql", [
        "SELECT * FROM `data-load-prod.copy.update` LIMIT 1",
        "SELECT COUNTIF(`delete` IS NULL) AS `delete__nc` FROM `p.d.t`",
        "SELECT 1 FROM `p.region-eu.INFORMATION_SCHEMA.JOBS` WHERE REGEXP_CONTAINS(query, r'`?load-p`?\\.`?d`?')",
    ])
    def test_keywords_inside_identifiers_and_strings_are_allowed(self, sql):
        assert_read_only(sql)

    @pytest.mark.parametrize("sql", [
        "DROP TABLE x",
        "SELECT 1; DELETE FROM `p.d.t` WHERE TRUE",
        "SELECT * FROM `p.d.x`; DROP TABLE y; --`",
        "SELECT 'a'; INSERT INTO t VALUES (1)",
    ])
    def test_statements_are_still_blocked(self, sql):
        with pytest.raises(ValueError):
            assert_read_only(sql)


class TestRepoUrlMustBeHttp:
    @pytest.mark.parametrize("url", ["javascript:alert(document.cookie)", "data:text/html,x", "ftp://x"])
    def test_non_http_repo_url_is_rejected(self, client, auth_headers, seed_dataset, seed_table, url):
        body = [{"project_name": "p", "repo_url": url}]
        assert client.put(f"/api/v1/datasets/{seed_dataset.id}/projects", json=body, headers=auth_headers).status_code == 422
        assert client.put(f"/api/v1/tables/{seed_table.id}/projects", json=body, headers=auth_headers).status_code == 422

    def test_https_and_blank_repo_urls_are_accepted(self, client, auth_headers, seed_dataset):
        body = [{"project_name": "a", "repo_url": " https://github.com/org/repo "}, {"project_name": "b", "repo_url": ""}]
        r = client.put(f"/api/v1/datasets/{seed_dataset.id}/projects", json=body, headers=auth_headers)
        assert r.status_code == 200
        assert [p["repo_url"] for p in r.json()["used_in_projects"]] == ["https://github.com/org/repo", None]


class TestExplicitValidation:
    def test_revoke_of_an_already_revoked_table_does_not_recertify_it(self, client, auth_headers, seed_table):
        url = f"/api/v1/tables/{seed_table.id}/validate"
        r = client.patch(url, json={"validated_columns": [], "trusted": False}, headers=auth_headers)
        assert r.status_code == 200 and r.json()["is_validated"] is False

    def test_explicit_trust_and_revoke(self, client, auth_headers, seed_table):
        url = f"/api/v1/tables/{seed_table.id}/validate"
        assert client.patch(url, json={"validated_columns": ["id"], "trusted": True}, headers=auth_headers).json()["is_validated"] is True
        assert client.patch(url, json={"validated_columns": ["id"], "trusted": True}, headers=auth_headers).json()["is_validated"] is True
        assert client.patch(url, json={"trusted": False}, headers=auth_headers).json()["is_validated"] is False

    def test_omitted_intent_still_toggles(self, client, auth_headers, seed_table):
        url = f"/api/v1/tables/{seed_table.id}/validate"
        assert client.patch(url, json={"validated_columns": []}, headers=auth_headers).json()["is_validated"] is True
        assert client.patch(url, json={"validated_columns": []}, headers=auth_headers).json()["is_validated"] is False
