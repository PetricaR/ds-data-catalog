import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import app_settings, auth, bq, datasets, notifications, schema_changes, search, setup, stats, tables, tags, users
from .config import settings
from .crypto import reencrypt_stored_secrets
from .database import SessionLocal, init_db
from .dependencies.auth import require_auth
from .services.oauth_client import log_setup_token_if_unconfigured, watch_oauth_client

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    with SessionLocal() as db:
        reencrypt_stored_secrets(db)
        if settings.local_mode:
            logger.warning(
                "LOCAL_MODE is on: anyone who can reach this backend can sign in as any user and role, "
                "without Google. Sign in at %s/login", settings.frontend_url.rstrip("/"),
            )
        else:
            log_setup_token_if_unconfigured(db)
    interval = settings.oauth_check_interval_minutes
    watcher = asyncio.create_task(watch_oauth_client(interval)) if interval > 0 else None
    yield
    if watcher:
        watcher.cancel()


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
    app_settings.router,
):
    app.include_router(router, prefix=API_PREFIX, dependencies=[Depends(require_auth)])


@app.get("/health")
def health():
    return {"status": "ok"}
