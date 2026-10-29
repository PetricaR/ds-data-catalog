#!/usr/bin/env bash
# Local development without Docker for the app itself: FastAPI (auto-reload) + Vite dev server.
# Needs a reachable PostgreSQL (DATABASE_URL in .env) — e.g. `docker compose up -d db`.
#   ./start.sh           sign in with Google, as configured in .env
#   ./start.sh --local   local mode: sign in without Google, as any email and role; an empty catalog gets demo data
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[catalog]${NC} $*"; }
warn()  { echo -e "${YELLOW}[catalog]${NC} $*"; }
error() { echo -e "${RED}[catalog]${NC} $*"; }

LOCAL=false
for arg in "$@"; do
  case "$arg" in
    --local) LOCAL=true ;;
    -h|--help) sed -n '2,5p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) error "Unknown option: $arg (try --help)"; exit 1 ;;
  esac
done

# ── .env ──────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  secret="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  key="$(python3 -c 'import secrets; print(secrets.token_hex(32))')"
  sed -i.bak -e "s/^JWT_SECRET=.*/JWT_SECRET=${secret}/" -e "s/^ENCRYPTION_KEY=.*/ENCRYPTION_KEY=${key}/" .env && rm -f .env.bak
  warn "Created .env from .env.example with a generated JWT_SECRET and ENCRYPTION_KEY."
  if [ "$LOCAL" != true ]; then
    warn "Fill in ADMIN_EMAILS (and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET, or enter them later at /setup), then re-run."
    warn "Or run ./start.sh --local to sign in without Google."
    exit 1
  fi
fi
# Overrides .env; the backend refuses it unless FRONTEND_URL is a localhost URL
if [ "$LOCAL" = true ]; then
  export LOCAL_MODE=true
fi

# ── Python environment ────────────────────────────────────────────────────────
VENV="${VENV:-$SCRIPT_DIR/../data_env}"
if [ -x "$VENV/bin/uvicorn" ]; then
  UVICORN="$VENV/bin/uvicorn"
elif command -v uvicorn >/dev/null 2>&1; then
  UVICORN="$(command -v uvicorn)"
else
  error "uvicorn not found. Create a virtualenv first:"
  error "  python3 -m venv ../data_env && ../data_env/bin/pip install -r requirements-dev.txt"
  exit 1
fi
PYTHON="$(dirname "$UVICORN")/python"
[ -x "$PYTHON" ] || PYTHON=python3

# ── Database ──────────────────────────────────────────────────────────────────
# Fail with one line rather than the backend's startup traceback
db_status=0
db_output="$("$PYTHON" -c '
import sys
from backend.database import engine
try:
    engine.connect().close()
except Exception as exc:
    reason = str(getattr(exc, "orig", exc)).strip().splitlines()[0]
    print("Cannot connect to", engine.url.render_as_string(hide_password=True) + ":", reason)
    sys.exit(3)
' 2>&1)" || db_status=$?
if [ "$db_status" = 3 ]; then
  error "$db_output"
  error "Start PostgreSQL (e.g. docker compose up -d db) or fix DATABASE_URL in .env, then re-run."
  exit 1
elif [ "$db_status" != 0 ]; then
  error "The backend could not load its settings:"
  echo "$db_output" >&2
  exit 1
fi

# ── Backend ───────────────────────────────────────────────────────────────────
info "Starting FastAPI backend on http://localhost:8000 ..."
"$UVICORN" backend.main:app --host 127.0.0.1 --port 8000 --reload --log-level info &
BACKEND_PID=$!

cleanup() {
  echo ""
  warn "Shutting down..."
  kill "$BACKEND_PID" 2>/dev/null || true
  [ -n "${FRONTEND_PID:-}" ] && kill "$FRONTEND_PID" 2>/dev/null || true
  exit 0
}
trap cleanup SIGINT SIGTERM

for _ in $(seq 1 20); do
  curl -s http://localhost:8000/health >/dev/null 2>&1 && break
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    error "Backend exited — check the log above (database reachable? JWT_SECRET set?)"
    exit 1
  fi
  sleep 1
done
info "Backend ready (PID $BACKEND_PID)"

if [ "$LOCAL" = true ]; then
  "$PYTHON" -m backend.demo_data || warn "Could not add the demo data — see the error above."
fi

# ── Frontend ──────────────────────────────────────────────────────────────────
if [ ! -d frontend/node_modules ]; then
  info "Installing frontend dependencies..."
  npm --prefix frontend ci
fi

info "Starting React frontend on http://localhost:5173 ..."
npm --prefix frontend run dev &
FRONTEND_PID=$!

info "All services up. Press Ctrl+C to stop."
info "  Frontend : http://localhost:5173"
info "  API docs : http://localhost:8000/docs"
if [ "$LOCAL" = true ]; then
  warn "Local mode: sign in at http://localhost:5173/login as any email and role, without Google."
fi
wait
