"""
Shared pytest fixtures.

Tests run against a dedicated PostgreSQL database whose name must end in `_test`.
The session drops every catalog table when it finishes, so never point this at real data.

Start a local database (once):

    docker compose up -d db          # creates ds_catalog and ds_catalog_test

Run tests:
    cd catalog_app
    pytest
"""

import os
import uuid
from typing import Generator
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# ── Database URL ──────────────────────────────────────────────────────────────

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://catalog:catalog@localhost:5432/ds_catalog_test",
)

_db_name = urlparse(TEST_DB_URL).path.lstrip("/")
if not _db_name.endswith("_test"):
    raise pytest.UsageError(
        f"Refusing to run: TEST_DATABASE_URL points at database '{_db_name}'. "
        "The test session drops all tables, so the database name must end in '_test'."
    )

# ── patch settings BEFORE importing the app ───────────────────────────────────
os.environ["DATABASE_URL"] = TEST_DB_URL
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-at-least-32-characters-long")
os.environ.setdefault("GOOGLE_CLIENT_ID", "")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "")
os.environ.setdefault("ENCRYPTION_KEY", "")
os.environ.setdefault("OAUTH_CHECK_INTERVAL_MINUTES", "0")  # no calls to Google from the startup watcher
os.environ.setdefault("GOOGLE_CHAT_WEBHOOK_URL", "")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("GCP_PROJECT_ID", "test-project")
os.environ["LOCAL_MODE"] = "false"  # even if .env turns it on; tests that need it turn it on themselves

from backend.database import Base, get_db  # noqa: E402
from backend.dependencies.auth import create_token  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models.catalog import (  # noqa: E402
    Dataset,
    Table,
    TableColumn,
    User,
)

# ── Engine pointing at test DB ────────────────────────────────────────────────

engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# ── Session-scoped: create tables once, drop after all tests ──────────────────

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


# ── Per-test: transactional rollback for isolation ────────────────────────────

@pytest.fixture()
def db() -> Generator:
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db) -> Generator:
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()


# ── Users + auth headers ──────────────────────────────────────────────────────

def make_user(db, role: str = "editor", is_active: bool = True) -> User:
    user = User(
        email=f"{role}-{uuid.uuid4().hex[:8]}@example.com",
        name=f"Test {role}",
        role=role,
        is_active=is_active,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def bearer(user: User) -> dict:
    return {"Authorization": f"Bearer {create_token(user)}"}


@pytest.fixture()
def viewer_headers(db) -> dict:
    return bearer(make_user(db, "viewer"))


@pytest.fixture()
def editor_user(db) -> User:
    return make_user(db, "editor")


@pytest.fixture()
def auth_headers(editor_user) -> dict:
    """Editor — can read and change catalog metadata."""
    return bearer(editor_user)


@pytest.fixture()
def admin_headers(db) -> dict:
    return bearer(make_user(db, "admin"))


# ── Seed fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture()
def seed_dataset(db) -> Dataset:
    ds = Dataset(
        project_id="test-project",
        dataset_id=f"test_dataset_{uuid.uuid4().hex[:8]}",
        display_name="Test Dataset",
        description="A test dataset",
        owner="owner@example.com",
        tags=["test", "sample"],
        sensitivity_label="internal",
    )
    db.add(ds)
    db.commit()
    db.refresh(ds)
    return ds


@pytest.fixture()
def seed_table(db, seed_dataset) -> Table:
    tbl = Table(
        dataset_id=seed_dataset.id,
        table_id=f"test_table_{uuid.uuid4().hex[:8]}",
        display_name="Test Table",
        description="A test table",
        owner="owner@example.com",
        tags=["test"],
        sensitivity_label="internal",
        row_count=1000,
    )
    db.add(tbl)
    db.commit()
    db.refresh(tbl)
    return tbl


@pytest.fixture()
def seed_column(db, seed_table) -> TableColumn:
    col = TableColumn(
        table_id=seed_table.id,
        name="id",
        data_type="INTEGER",
        is_nullable=False,
        is_primary_key=True,
        position=0,
    )
    db.add(col)
    db.commit()
    db.refresh(col)
    return col
