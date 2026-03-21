#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Colours ───────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[catalog]${NC} $*"; }
warn()  { echo -e "${YELLOW}[catalog]${NC} $*"; }
error() { echo -e "${RED}[catalog]${NC} $*"; }

# ── PostgreSQL ────────────────────────────────────────────────────────────────
PG_CTL="/opt/homebrew/opt/postgresql@14/bin/pg_ctl"
PG_DATA="/opt/homebrew/var/postgresql@14"
PG_PORT=5433

if /opt/homebrew/opt/postgresql@14/bin/pg_isready -h 127.0.0.1 -p "$PG_PORT" -q 2>/dev/null; then
  info "PostgreSQL already running on port $PG_PORT"
else
  info "Starting PostgreSQL 14 on port $PG_PORT..."
  "$PG_CTL" start -D "$PG_DATA" -o "-p $PG_PORT" -l /opt/homebrew/var/log/postgresql@14.log
  # Wait until ready
  for i in {1..10}; do
    /opt/homebrew/opt/postgresql@14/bin/pg_isready -h 127.0.0.1 -p "$PG_PORT" -q 2>/dev/null && break
    sleep 1
  done
  info "PostgreSQL started"
fi

# ── Backend ───────────────────────────────────────────────────────────────────
VENV="$SCRIPT_DIR/../catalog_env"
if [ ! -d "$VENV" ]; then
  error "Python venv not found at $VENV — run: python3 -m venv catalog_env && pip install -r requirements.txt"
  exit 1
fi

info "Starting FastAPI backend on http://localhost:8000 ..."
"$VENV/bin/uvicorn" backend.main:app \
  --host 0.0.0.0 --port 8000 \
  --reload \
  --log-level info &
BACKEND_PID=$!

# Wait for backend to be ready
for i in {1..15}; do
  curl -s http://localhost:8000/health > /dev/null 2>&1 && break
  sleep 1
done
info "Backend ready (PID $BACKEND_PID)"

# ── Frontend ──────────────────────────────────────────────────────────────────
FRONTEND_DIR="$SCRIPT_DIR/frontend"
NODE_BIN="/opt/homebrew/bin/node"
NPM_BIN="/opt/homebrew/bin/npm"

if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
  info "Installing frontend dependencies..."
  PATH="/opt/homebrew/bin:$PATH" "$NPM_BIN" --prefix "$FRONTEND_DIR" install
fi

info "Starting React frontend on http://localhost:5173 ..."
PATH="/opt/homebrew/bin:$PATH" "$NPM_BIN" --prefix "$FRONTEND_DIR" run dev &
FRONTEND_PID=$!
info "Frontend starting (PID $FRONTEND_PID)"

# ── Open browser ──────────────────────────────────────────────────────────────
sleep 3 && open http://localhost:5173 &

# ── Trap CTRL+C — shut everything down ───────────────────────────────────────
cleanup() {
  echo ""
  warn "Shutting down..."
  kill "$BACKEND_PID"  2>/dev/null || true
  kill "$FRONTEND_PID" 2>/dev/null || true
  info "Done. PostgreSQL left running — stop it with: pg_ctl stop -D $PG_DATA"
  exit 0
}
trap cleanup SIGINT SIGTERM

info "All services up. Press Ctrl+C to stop."
info "  Frontend : http://localhost:5173"
info "  API docs : http://localhost:8000/docs"
wait
