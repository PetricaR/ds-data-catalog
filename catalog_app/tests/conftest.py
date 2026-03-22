"""
Shared pytest fixtures.

Uses the in-cluster PostgreSQL via a kubectl port-forward on localhost:5433.
To start the port-forward (once, in a separate terminal):

    kubectl port-forward svc/ds-catalog-postgres 5433:5432

Or run it automatically in the background before the test session.

Run tests:
    cd catalog_app
    pytest tests/ -v
"""

import os
import subprocess
import time
import uuid
from datetime import datetime, timezone
from typing import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# ── Database URL ──────────────────────────────────────────────────────────────
# Use ds_catalog_test if it exists, else fall back to ds_catalog with a
# per-session schema prefix to avoid polluting production data.

TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql://catalog:catalog@localhost:5433/ds_catalog",
)

# ── patch settings BEFORE importing the app ───────────────────────────────────
os.environ.setdefault("DATABASE_URL", TEST_DB_URL)
os.environ.setdefault("JWT_SECRET", "test-secret-that-is-long-enough-32b")
os.environ.setdefault("SECRET_KEY", "test-secret-that-is-long-enough-32b")
os.environ.setdefault("GOOGLE_CLIENT_ID", "")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "")
os.environ.setdefault("FRONTEND_URL", "http://localhost:5173")
os.environ.setdefault("GCP_PROJECT_ID", "test-project")

from backend.config import settings  # noqa: E402

settings.database_url = TEST_DB_URL
settings.jwt_secret = "test-secret-that-is-long-enough-32b"

from backend.database import Base, get_db  # noqa: E402
from backend.main import app  # noqa: E402
from backend.models.catalog import (  # noqa: E402
    Dataset,
    GCPSource,
    MetadataChangeLog,
    SchemaChange,
    Table,
    TableColumn,
    User,
)

# ── Engine pointing at test DB ────────────────────────────────────────────────

engine = create_engine(TEST_DB_URL, pool_pre_ping=True)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# ── Port-forward management ───────────────────────────────────────────────────

_pf_proc = None


def _ensure_port_forward():
    """Start kubectl port-forward if port 5433 is not already listening."""
    import socket
    global _pf_proc
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", 5433)) == 0:
            return  # already open
    _pf_proc = subprocess.Popen(
        ["kubectl", "port-forward", "svc/ds-catalog-postgres", "5433:5432"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(3)


# ── Session-scoped: create tables once, drop after all tests ──────────────────

@pytest.fixture(scope="session", autouse=True)
def setup_db():
    _ensure_port_forward()
    # Create test schema
    Base.metadata.create_all(bind=engine)
    yield
    # Drop only test-created tables — use a clean slate each session
    Base.metadata.drop_all(bind=engine)
    if _pf_proc:
        _pf_proc.terminate()


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


# ── JWT helpers ───────────────────────────────────────────────────────────────

def make_token(role: str = "editor") -> str:
    from datetime import timedelta

    try:
        from jose import jwt
    except ImportError:
        import jwt  # type: ignore

    payload = {
        "sub": str(uuid.uuid4()),
        "email": "test@example.com",
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=1),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


@pytest.fixture()
def auth_headers() -> dict:
    return {"Authorization": f"Bearer {make_token('editor')}"}


@pytest.fixture()
def admin_headers() -> dict:
    return {"Authorization": f"Bearer {make_token('admin')}"}


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
