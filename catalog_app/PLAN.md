# DS Data Catalog — Implementation Plan

> Project: `formare-ai` BigQuery catalog
> Stack: FastAPI · PostgreSQL · React · MUI v5 · Google Cloud

---

## Phase 1 — Core Foundation ✅

### Backend
- [x] Project structure (`backend/`, `frontend/`, `catalog_env`)
- [x] PostgreSQL database with SQLAlchemy models
- [x] `Dataset` model — project_id, dataset_id, display_name, description, owner, data_steward, tags, sensitivity_label, bq_location, timestamps
- [x] `Table` model — linked to dataset, row_count, size_bytes, timestamps
- [x] `TableColumn` model — name, data_type, description, nullable, primary_key, position
- [x] Full-text search via PostgreSQL `tsvector` + GIN index (auto-updated via triggers)
- [x] Pydantic v2 schemas (create / update / response)
- [x] FastAPI app with CORS, lifespan startup (`init_db`)
- [x] `/health` endpoint

### API Endpoints
- [x] `GET    /api/v1/datasets` — list with filters (project, sensitivity, tags, search)
- [x] `POST   /api/v1/datasets` — register dataset manually
- [x] `GET    /api/v1/datasets/{id}` — dataset detail with table count
- [x] `PUT    /api/v1/datasets/{id}` — update metadata
- [x] `DELETE /api/v1/datasets/{id}` — soft delete
- [x] `GET    /api/v1/datasets/{id}/tables` — list tables in dataset
- [x] `GET    /api/v1/tables` — list all tables
- [x] `POST   /api/v1/tables` — register table manually
- [x] `GET    /api/v1/tables/{id}` — table detail with columns
- [x] `PUT    /api/v1/tables/{id}` — update metadata
- [x] `DELETE /api/v1/tables/{id}` — soft delete
- [x] `GET    /api/v1/search?q=` — full-text search across datasets + tables
- [x] `GET    /api/v1/tags` — list all unique tags
- [x] `GET    /api/v1/stats` — catalog statistics (totals, coverage %)
- [x] `POST   /api/v1/bq/sync` — trigger BigQuery discovery sync

### BigQuery Sync Service
- [x] Fetch service account key from **Google Cloud Secret Manager** (`gcp-credentials`)
- [x] Authenticate with `google.oauth2.service_account.Credentials`
- [x] Discover all datasets in project `formare-ai`
- [x] Discover all tables per dataset
- [x] Sync column schemas (field name, type, mode, description)
- [x] Upsert logic — preserve user-edited metadata on re-sync
- [x] `SyncResult` response (added/updated counts, error list)
- [x] Initial sync: **6 datasets · 8 tables · 101 columns**

### Frontend
- [x] Vite + React 18 + TypeScript
- [x] MUI v5 with Google Material Design colour palette
- [x] React Query v5 for data fetching + caching
- [x] React Router v6 with nested routes
- [x] Custom Google Sans / Roboto typography theme
- [x] Responsive sidebar layout (`Layout.tsx`)
- [x] Global search bar in top nav
- [x] `SensitivityChip` — colour-coded (public/internal/confidential/restricted)
- [x] `TagChip` component

### Pages
- [x] **Home** (`/`) — stats cards, recently added datasets
- [x] **Browse** (`/browse`) — dataset list with sensitivity + tag filters, Sync button
- [x] **Search Results** (`/search`) — full-text results with entity type badge
- [x] **Dataset Detail** (`/datasets/:id`) — metadata panel + table list + Register Table button
- [x] **Table Detail** (`/datasets/:id/tables/:tableId`) — schema viewer, row/size stats
- [x] **Register Dataset** (`/register/dataset`) — manual registration form
- [x] **Register Table** (`/register/table?datasetId=`) — form pre-populated from dataset context

### Infrastructure
- [x] `start.sh` — one-command startup (PostgreSQL + FastAPI + Vite + open browser)
- [x] `docker-compose.yml` — PostgreSQL service
- [x] `.env.example`
- [x] `Dockerfile.backend` + `Dockerfile.frontend`

---

## Phase 2 — Enrichment & Editing 🔲

- [ ] Inline edit metadata from Dataset / Table detail pages (no separate form)
- [ ] Tag management UI — create, rename, delete tags globally
- [ ] Bulk tag assignment from Browse view
- [ ] Column-level descriptions editable inline in Table Detail
- [ ] Data lineage field — upstream/downstream dataset references
- [ ] `bq_last_modified` delta sync — only re-sync changed tables
- [ ] Dataset / table soft-delete with restore option in UI
- [ ] Audit log — record every metadata change with user + timestamp
- [ ] Pagination on Browse and Search (currently returns all)

---

## Phase 3 — Search & Discovery 🔲

- [ ] Faceted search — filter by project, sensitivity, tags, owner simultaneously
- [ ] Search ranking tuning (boost exact matches, dataset name > description)
- [ ] Saved searches / bookmarks
- [ ] Recently viewed history (localStorage)
- [ ] "Similar tables" suggestion on Table Detail (same tags or schema overlap)
- [ ] Column-level search — find tables that contain a column named `X`
- [ ] Search autocomplete / suggestions dropdown

---

## Phase 4 — Data Quality & Profiling 🔲

- [ ] Column statistics pull from BigQuery (`APPROX_COUNT_DISTINCT`, null %, min/max)
- [ ] Data quality score per table (completeness, description coverage)
- [ ] Quality badge on Browse and Table Detail cards
- [ ] Scheduled sync via cron / Cloud Scheduler
- [ ] Sync history log — timestamp, duration, added/updated/error counts
- [ ] Alerting on schema changes (new/removed columns detected on re-sync)

---

## Phase 5 — Access & Governance 🔲

- [ ] Google OAuth2 login (via Authlib + GCP Identity)
- [ ] Role-based access: `viewer` · `editor` · `admin`
- [ ] Sensitivity label enforcement — restrict `restricted` datasets to admins
- [ ] Data steward assignment + notification on metadata change
- [ ] PII column flagging
- [ ] Export catalog as JSON / CSV

---

## Phase 6 — AI Assistant 🔲

- [ ] Natural-language search using Vertex AI / Gemini embeddings
- [ ] "What is this table for?" — AI-generated description from schema + sample data
- [ ] Auto-tag suggestions from column names and descriptions
- [ ] Q&A chatbot: "Which table has revenue by country?"
- [ ] Semantic similarity search across column names

---

## Known Issues / Tech Debt

- [ ] Fix `@mui/x-data-grid` version conflict (removed for now, re-add at MUI v5 compatible version `^6.x`)
- [ ] Add error boundary component in React for graceful crash handling
- [ ] Vite cache invalidation on cold start (`node_modules/.vite` cleared in start.sh)
- [ ] PostgreSQL 14 (Homebrew) must be started manually before backend — port 5432 occupied by system PG17
- [ ] No authentication on API endpoints yet (Phase 5)
