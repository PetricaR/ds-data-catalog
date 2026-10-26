from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, bq, datasets, notifications, schema_changes, search, setup, stats, tables, tags, users
from .config import settings
from .database import init_db
from .dependencies.auth import require_auth


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="DS Data Catalog",
    description="Lightweight BigQuery dataset and table catalog for your organization",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

# Public: the OAuth flow and the pre-login setup check.
app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(setup.router, prefix=API_PREFIX)

# Everything else requires a signed-in user; write and admin routes add role checks on top.
for router in (
    datasets.router,
    tables.router,
    search.router,
    tags.router,
    stats.router,
    bq.router,
    schema_changes.router,
    notifications.router,
    users.router,
):
    app.include_router(router, prefix=API_PREFIX, dependencies=[Depends(require_auth)])


@app.get("/health")
def health():
    return {"status": "ok"}
