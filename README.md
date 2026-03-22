# DS Data Catalog

A self-hosted data catalog for Google Cloud / BigQuery teams. Provides a central registry where data scientists and engineers can discover, document, govern, and monitor BigQuery tables — with AI-powered insights, data lineage, quality checks, and OAuth2 authentication.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Features](#features)
4. [Prerequisites](#prerequisites)
5. [Quick Start — Local Development](#quick-start--local-development)
6. [Production Deployment on GKE](#production-deployment-on-gke)
   - [Step 1 — GCP Project Setup](#step-1--gcp-project-setup)
   - [Step 2 — Google OAuth2 Client](#step-2--google-oauth2-client)
   - [Step 3 — Secret Manager Secrets](#step-3--secret-manager-secrets)
   - [Step 4 — Create GKE Cluster](#step-4--create-gke-cluster)
   - [Step 5 — Workload Identity](#step-5--workload-identity)
   - [Step 6 — Deploy the Application](#step-6--deploy-the-application)
   - [Step 7 — Post-Deploy OAuth Registration](#step-7--post-deploy-oauth-registration)
7. [Configuration Reference](#configuration-reference)
8. [Secret Manager Reference](#secret-manager-reference)
9. [API Reference](#api-reference)
10. [Frontend Pages](#frontend-pages)
11. [Database Schema](#database-schema)
12. [Authentication Flow](#authentication-flow)
13. [BigQuery Sync](#bigquery-sync)
14. [AI Insights](#ai-insights)
15. [Data Lineage](#data-lineage)
16. [Operations](#operations)
17. [Adapting for a New Organization](#adapting-for-a-new-organization)
18. [Troubleshooting](#troubleshooting)

---

## Overview

DS Data Catalog is a FastAPI + React application that runs on GKE Autopilot. It connects to your BigQuery projects, syncs table/column metadata, and gives your team a searchable, documented, trusted view of your data assets.

**Stack:**

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, MUI v5, Vite |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 (in-cluster StatefulSet) |
| Auth | Google OAuth2 + JWT (HS256) |
| AI | Vertex AI Gemini (via Workload Identity) or Gemini API key |
| Data | Google BigQuery, Cloud Data Lineage API |
| Infrastructure | GKE Autopilot, GCR, Cloud Build, Secret Manager |

---

## Architecture

```
Browser
  │
  ▼
LoadBalancer (port 80)
  │
  ▼
ds-catalog-frontend  (nginx)
  ├── /              → serves React SPA (index.html)
  ├── /api/v1/*      → proxied to ds-catalog-backend:8000
  └── static assets  → cached 1 year
  │
  ▼
ds-catalog-backend  (FastAPI / uvicorn)
  ├── /api/v1/auth/*       Google OAuth2 flow + JWT
  ├── /api/v1/tables/*     Table CRUD, preview, lineage, insights
  ├── /api/v1/datasets/*   Dataset CRUD
  ├── /api/v1/bq/*         BigQuery sync + sources
  ├── /api/v1/search       Full-text search
  └── /health              Liveness probe
  │
  ├──► ds-catalog-postgres:5432   (PostgreSQL StatefulSet)
  ├──► BigQuery API               (via Workload Identity)
  ├──► Vertex AI API              (via Workload Identity)
  ├──► Cloud Data Lineage API     (via Workload Identity)
  └──► Secret Manager             (via Workload Identity)
```

All traffic flows through a single LoadBalancer IP. The frontend nginx container proxies `/api/v1/` to the backend — no separate backend ingress is needed.

---

## Features

### Data Discovery
- Browse all BigQuery datasets and tables in a tree view
- Full-text search across table names, descriptions, column names, and tags
- Filter by dataset, sensitivity label, owner, tags

### Table Documentation
- Inline-editable table and column descriptions
- Sensitivity labels: `public`, `internal`, `confidential`, `restricted`
- Custom tags, owner assignment
- Example SQL queries saved per table

### Schema Management
- Automatic schema change detection (columns added/removed) on every sync
- Visual diff alerts on table detail pages
- Acknowledge-and-dismiss workflow

### Data Preview
- Cost-estimated TABLESAMPLE query before execution
- Run preview and view results inline
- Save the generated query to example queries

### Quality Checks
- Column-level null percentage, distinct count, min/max value stats
- Pulled from BigQuery INFORMATION_SCHEMA and APPROX_COUNT_DISTINCT queries

### AI Insights (Vertex AI Gemini)
- Auto-generated analysis questions, observations, and DS/ML use cases
- Based on table description, column names, and stats
- Regeneratable on demand

### Data Lineage
- Manual upstream/downstream table references (project.dataset.table format)
- Auto-discovery via Cloud Data Lineage API
- Merges discovered with manually entered

### Trusted Data
- Validation workflow: mark tables and specific columns as validated/certified
- Dedicated "Trusted Data" page listing all certified assets

### DS Project Tracking
- Link tables to JIRA tickets and GitHub repos
- Track which internal projects depend on which tables

### Sources & Sync
- Register multiple GCP projects as sync sources
- Per-source service account key (via Secret Manager) or Workload Identity
- Sync all sources or individual sources on demand

### Notifications
- In-app notifications for metadata changes
- Google Chat webhook integration for automated alerts

---

## Prerequisites

### Local Development
- Python 3.12+
- Node.js 20+
- PostgreSQL 16 (local or Docker)
- `gcloud` CLI authenticated

### Production (GKE)
- GCP project with billing enabled
- `gcloud` CLI authenticated with Owner or Editor role
- `kubectl`
- `docker` (only needed if not using Cloud Build)
- `gke-gcloud-auth-plugin`

---

## Quick Start — Local Development

### 1. Clone the repository

```bash
git clone <repo-url>
cd catalog-ds/ds-data-catalog/catalog_app
```

### 2. Backend setup

```bash
# Create and activate virtual environment
python3 -m venv catalog_env
source catalog_env/bin/activate

# Install dependencies
pip install -r requirements.txt

# Create local .env file
cat > .env << 'EOF'
DATABASE_URL=postgresql://catalog:catalog@localhost:5432/ds_catalog
GCP_PROJECT_ID=your-project-id
GOOGLE_CLIENT_ID=your-oauth-client-id
GOOGLE_CLIENT_SECRET=your-oauth-client-secret
FRONTEND_URL=http://localhost:5173
JWT_SECRET=local-dev-secret
SECRET_KEY=local-dev-secret
CORS_ORIGINS=["http://localhost:5173"]
EOF

# Create local database
createdb ds_catalog
psql ds_catalog -c "CREATE USER catalog WITH PASSWORD 'catalog';"
psql ds_catalog -c "GRANT ALL PRIVILEGES ON DATABASE ds_catalog TO catalog;"

# Run backend (auto-creates tables on startup)
uvicorn backend.main:app --reload --port 8000
```

### 3. Frontend setup

```bash
cd frontend
npm install

# Create .env.local (API is proxied by Vite dev server)
# No VITE_ env vars needed — client.ts uses relative /api/v1 base URL

# Configure Vite proxy (already set in vite.config.ts)
npm run dev
```

The app is available at `http://localhost:5173`.

---

## Production Deployment on GKE

The `deploy/` directory contains everything needed. The main script is `deploy.sh` — it handles cluster creation, Workload Identity, image builds, and Kubernetes manifests in one run.

### Step 1 — GCP Project Setup

```bash
# Authenticate
gcloud auth login
gcloud auth application-default login

# Set your project
export GCP_PROJECT_ID=your-project-id
gcloud config set project $GCP_PROJECT_ID

# Enable required APIs (deploy.sh does this automatically, but you can run manually)
gcloud services enable \
  container.googleapis.com \
  compute.googleapis.com \
  aiplatform.googleapis.com \
  bigquery.googleapis.com \
  bigquerystorage.googleapis.com \
  secretmanager.googleapis.com \
  datalineage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  cloudbuild.googleapis.com \
  logging.googleapis.com \
  monitoring.googleapis.com
```

### Step 2 — Google OAuth2 Client

1. Go to **Google Cloud Console → APIs & Services → Credentials**
2. Click **Create Credentials → OAuth 2.0 Client ID**
3. Application type: **Web application**
4. Name: `DS Data Catalog`
5. Leave Authorised JavaScript origins and redirect URIs **empty for now** — you will fill them in after deploy (Step 7)
6. Click **Create** and copy the **Client ID** and **Client Secret**

### Step 3 — Secret Manager Secrets

The deploy script reads secrets from Secret Manager automatically. Create the following secrets:

```bash
PROJECT_ID=your-project-id

# Google OAuth2 credentials (from Step 2)
echo -n "your-google-client-id" | \
  gcloud secrets create GOOGLE_CLIENT_ID --data-file=- --project=$PROJECT_ID

echo -n "your-google-client-secret" | \
  gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=- --project=$PROJECT_ID

# JWT signing secret (generate a strong random string)
echo -n "$(openssl rand -hex 32)" | \
  gcloud secrets create jwt-secret-key --data-file=- --project=$PROJECT_ID

# Gemini API key (optional — leave empty to use Vertex AI via Workload Identity)
echo -n "your-gemini-api-key" | \
  gcloud secrets create gemini-api-key --data-file=- --project=$PROJECT_ID

# Google Chat webhook (optional)
echo -n "https://chat.googleapis.com/v1/spaces/..." | \
  gcloud secrets create ds-catalog-google-chat-webhook --data-file=- --project=$PROJECT_ID
```

**Secret Manager naming convention used by the deploy script:**

| K8s env var | Secret Manager name |
|---|---|
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` |
| `JWT_SECRET` | `jwt-secret-key` |
| `SECRET_KEY` | `jwt-secret-key` |
| `GEMINI_API_KEY` | `gemini-api-key` |
| `GOOGLE_CHAT_WEBHOOK_URL` | `ds-catalog-google-chat-webhook` |
| `BQ_SECRET_NAME` | `ds-catalog-bq-secret-name` |

If a secret is not found in Secret Manager, the corresponding env var is set to empty (feature disabled, not a crash).

### Step 4 — Create GKE Cluster

The deploy script creates the cluster automatically. To run it standalone:

```bash
cd catalog_app/deploy
GCP_PROJECT_ID=your-project-id \
GCP_REGION=europe-west1 \
CLUSTER_NAME=ds-catalog-cluster \
  ./1-create-cluster.sh
```

This creates a **GKE Autopilot** cluster. Autopilot manages node pools automatically — no node sizing needed. Typical cluster creation takes 5–10 minutes.

### Step 5 — Workload Identity

Workload Identity lets the backend pods access GCP APIs (BigQuery, Vertex AI, Secret Manager) without storing service account keys anywhere.

```bash
cd catalog_app/deploy
GCP_PROJECT_ID=your-project-id \
GCP_REGION=europe-west1 \
CLUSTER_NAME=ds-catalog-cluster \
  ./2-setup-workload-identity.sh
```

This script:
1. Creates a GCP service account `ds-catalog-sa@<project>.iam.gserviceaccount.com`
2. Grants it these IAM roles:
   - `roles/aiplatform.user` — Vertex AI / Gemini
   - `roles/bigquery.jobUser` — run BigQuery jobs
   - `roles/bigquery.dataViewer` — read table data
   - `roles/bigquery.metadataViewer` — read schema
   - `roles/secretmanager.secretAccessor` — read secrets
   - `roles/logging.logWriter`
   - `roles/monitoring.metricWriter`
3. Binds the GCP SA to the Kubernetes SA `ds-catalog-sa` in the `default` namespace

### Step 6 — Deploy the Application

```bash
cd catalog_app/deploy

# Full deploy (cluster + workload identity + build + manifests)
GCP_PROJECT_ID=your-project-id \
GCP_REGION=europe-west1 \
CLUSTER_NAME=ds-catalog-cluster \
  ./deploy.sh

# If cluster already exists, skip creation:
GCP_PROJECT_ID=your-project-id \
GCP_REGION=europe-west1 \
CLUSTER_NAME=ds-catalog-cluster \
SKIP_CLUSTER=1 \
  ./deploy.sh
```

The script will:
1. Check prerequisites
2. Enable GCP APIs
3. Create or reuse the GKE cluster
4. Set up Workload Identity
5. Build backend and frontend images via Cloud Build (no local Docker needed)
6. Apply Kubernetes manifests (PostgreSQL, ConfigMap, Secret, ServiceAccount, Deployments, Services, HPA)
7. **Pull all secrets from Secret Manager** and create the K8s secret automatically
8. Wait for rollouts
9. **Auto-patch the ConfigMap** with the real frontend LoadBalancer IP (as `<ip>.nip.io`)
10. Print the app URL

### Step 7 — Post-Deploy OAuth Registration

After deploy completes, the script prints the app URL (e.g. `http://34.90.12.55.nip.io`).

Go back to **Google Cloud Console → APIs & Services → Credentials → your OAuth client** and add:

- **Authorised JavaScript origins:**
  ```
  http://34.90.12.55.nip.io
  ```
- **Authorised redirect URIs:**
  ```
  http://34.90.12.55.nip.io/api/v1/auth/callback
  ```

Replace `34.90.12.55` with your actual LoadBalancer IP.

> **Custom domain:** If you have a domain, point an A record to the LoadBalancer IP and use that domain instead of nip.io. Update `FRONTEND_URL` and `CORS_ORIGINS` in the ConfigMap accordingly:
> ```bash
> kubectl patch configmap ds-catalog-config \
>   -p '{"data":{"FRONTEND_URL":"https://catalog.yourcompany.com","CORS_ORIGINS":"[\"https://catalog.yourcompany.com\"]"}}'
> kubectl rollout restart deployment/ds-catalog-backend
> ```

---

## Configuration Reference

All configuration is passed to the backend as environment variables. In production they come from the ConfigMap and the K8s Secret.

### ConfigMap (`deploy/configmap.yaml`)

| Variable | Default | Description |
|---|---|---|
| `GCP_PROJECT_ID` | — | GCP project used for BigQuery and Vertex AI |
| `FRONTEND_URL` | `http://FRONTEND_IP_OR_DOMAIN` | Public URL of the frontend — used as OAuth2 redirect base and JWT redirect target |
| `CORS_ORIGINS` | `["http://localhost:5173"]` | JSON array of allowed CORS origins |

### Secret (`deploy/secret.yaml` / Secret Manager)

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `POSTGRES_PASSWORD` | Password for the in-cluster PostgreSQL |
| `GOOGLE_CLIENT_ID` | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth2 client secret |
| `JWT_SECRET` | Secret used to sign JWT tokens |
| `SECRET_KEY` | Application secret key (same value as JWT_SECRET is fine) |
| `GEMINI_API_KEY` | Optional — Gemini API key. Leave empty to use Vertex AI via Workload Identity |
| `GOOGLE_CHAT_WEBHOOK_URL` | Optional — Google Chat webhook for change notifications |
| `BQ_SECRET_NAME` | Optional — Secret Manager secret name for a BigQuery service account key. Leave empty to use Workload Identity |

### Backend Config Defaults (`backend/config.py`)

| Variable | Default |
|---|---|
| `JWT_ALGORITHM` | `HS256` |
| `JWT_EXPIRE_MINUTES` | `10080` (7 days) |

---

## Secret Manager Reference

The deploy script (`deploy.sh`) reads from Secret Manager at deploy time and writes the values into the Kubernetes secret `ds-catalog-secret`. It does **not** use a sidecar or init container — secrets are fetched once at deploy time by the deploy script running on the operator's machine.

This means:
- Rotating a secret requires re-running the deploy script (or manually running `sync_secrets_from_secret_manager`)
- The GCP SA used by the deploy script (your personal gcloud credentials) needs `roles/secretmanager.secretAccessor` on the project

To manually re-sync secrets without a full redeploy:

```bash
cd catalog_app/deploy
source ./deploy.sh  # sources the function definitions

GCP_PROJECT_ID=your-project-id NAMESPACE=default \
  sync_secrets_from_secret_manager

kubectl rollout restart deployment/ds-catalog-backend
```

---

## API Reference

All endpoints are under `/api/v1/`. The frontend nginx proxies them — no direct backend port is exposed externally.

### Authentication

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/auth/login` | None | Redirect to Google OAuth2 consent screen |
| GET | `/auth/callback` | None | OAuth2 callback — exchanges code for JWT, redirects to frontend |
| GET | `/auth/me` | JWT | Return current user info |

### Tables

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tables` | JWT | List tables (filters: `dataset_id`, `sensitivity_label`, `tags`, `owner`, `skip`, `limit`) |
| POST | `/tables` | JWT | Register a new table |
| GET | `/tables/{id}` | JWT | Get table with all columns |
| PUT | `/tables/{id}` | JWT | Update table metadata |
| DELETE | `/tables/{id}` | JWT | Soft-delete a table |
| PATCH | `/tables/{id}/validate` | JWT | Mark table as validated / revoke validation |
| PATCH | `/tables/{id}/columns` | JWT | Batch-update column descriptions and primary key flags |
| PATCH | `/tables/{id}/columns/{col_id}/pii` | JWT | Toggle PII flag on a column |
| GET | `/tables/{id}/preview` | JWT | Get estimated cost + SQL for a TABLESAMPLE preview |
| POST | `/tables/{id}/preview/run` | JWT | Execute preview query and return rows |
| POST | `/tables/{id}/quality-check` | JWT | Pull column stats from BigQuery |
| PATCH | `/tables/{id}/queries` | JWT | Replace example queries list |
| POST | `/tables/{id}/insights` | JWT | Generate AI insights via Vertex AI Gemini |
| GET | `/tables/{id}/lineage/discover` | JWT | Auto-discover lineage from Cloud Data Lineage API |
| PUT | `/tables/{id}/lineage` | JWT | Update upstream/downstream refs |
| PUT | `/tables/{id}/projects` | JWT | Update DS projects linked to this table |

### Datasets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/datasets` | JWT | List datasets |
| POST | `/datasets` | JWT | Create dataset |
| GET | `/datasets/{id}` | JWT | Get dataset |
| PUT | `/datasets/{id}` | JWT | Update dataset metadata |
| DELETE | `/datasets/{id}` | JWT | Soft-delete dataset |
| PATCH | `/datasets/{id}/validate` | JWT | Toggle dataset validation |
| PUT | `/datasets/{id}/projects` | JWT | Update DS projects list |
| GET | `/datasets/{id}/tables` | JWT | List all tables in dataset |

### BigQuery Sources

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/bq/sources` | JWT | List registered GCP project sources |
| POST | `/bq/sources` | JWT | Add a GCP project as sync source |
| PATCH | `/bq/sources/{id}` | JWT | Update source (name, secret, active state) |
| DELETE | `/bq/sources/{id}` | JWT | Remove a source |
| POST | `/bq/sync` | JWT | Sync a single GCP project by project ID |
| POST | `/bq/sync/all` | JWT | Sync all active sources |
| POST | `/bq/sync/source/{id}` | JWT | Sync a specific source by source ID |

### Search

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/search` | JWT | Full-text search across datasets and tables |
| GET | `/search/columns` | JWT | Find columns by name pattern |

### Other

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/tags` | JWT | List all unique tags |
| GET | `/stats` | JWT | Catalog statistics (counts, coverage) |
| GET | `/schema-changes` | JWT | List schema change alerts |
| PATCH | `/schema-changes/{id}/acknowledge` | JWT | Acknowledge a change |
| POST | `/schema-changes/acknowledge-all` | JWT | Acknowledge all changes for a table |
| GET | `/notifications` | JWT | List recent metadata change notifications |
| POST | `/notifications/{id}/dismiss` | JWT | Dismiss a notification |
| POST | `/notifications/dismiss-all` | JWT | Dismiss all notifications |
| GET | `/health` | None | Liveness probe |

---

## Frontend Pages

| Route | Page | Description |
|---|---|---|
| `/login` | Login | Google OAuth2 sign-in |
| `/browse` | Browse | Dataset + table tree with filters and search |
| `/datasets/:id` | DatasetDetail | Dataset metadata, table list, validation |
| `/datasets/:datasetId/tables/:tableId` | TableDetail | Full table view: schema, preview, queries, insights, lineage, projects |
| `/search` | SearchResults | Full-text search results |
| `/trusted` | TrustedData | Validated datasets and tables |
| `/sources` | Sources | BigQuery source management + sync triggers |

---

## Database Schema

The database is PostgreSQL 16. Tables are created automatically on first backend startup via `Base.metadata.create_all()`.

### users
Stores authenticated users after first OAuth2 login.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| email | VARCHAR(255) UNIQUE | |
| name | VARCHAR(255) | |
| picture | VARCHAR(500) | Google profile picture URL |
| role | VARCHAR(50) | `viewer` \| `editor` \| `admin` |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| last_login | TIMESTAMPTZ | |
| gcp_access_token | TEXT | Stored for BQ API calls on behalf of user |
| gcp_refresh_token | TEXT | |
| gcp_token_expiry | TIMESTAMPTZ | |

### datasets
One row per BigQuery dataset.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| project_id | VARCHAR(255) | GCP project |
| dataset_id | VARCHAR(255) | BigQuery dataset ID |
| display_name | VARCHAR(500) | |
| description | TEXT | |
| owner | VARCHAR(255) | |
| data_steward | VARCHAR(255) | |
| tags | ARRAY(VARCHAR) | |
| sensitivity_label | VARCHAR(50) | `public` \| `internal` \| `confidential` \| `restricted` |
| bq_location | VARCHAR(50) | e.g. `US`, `europe-west1` |
| bq_created_at | TIMESTAMPTZ | |
| bq_last_modified | TIMESTAMPTZ | |
| is_active | BOOLEAN | |
| is_validated | BOOLEAN | |
| validated_by | VARCHAR(255) | |
| validated_at | TIMESTAMPTZ | |
| used_in_projects | JSONB | `[{project_name, jira_id, repo_url}]` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | auto-updated |
| search_vector | TSVECTOR | GIN-indexed for full-text search |

### tables
One row per BigQuery table.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| dataset_id | UUID FK → datasets | cascade delete |
| table_id | VARCHAR(255) | BigQuery table ID |
| display_name | VARCHAR(500) | |
| description | TEXT | |
| owner | VARCHAR(255) | |
| tags | ARRAY(VARCHAR) | |
| sensitivity_label | VARCHAR(50) | |
| row_count | BIGINT | synced from BQ |
| size_bytes | BIGINT | synced from BQ |
| bq_created_at | TIMESTAMPTZ | |
| bq_last_modified | TIMESTAMPTZ | |
| is_active | BOOLEAN | |
| is_validated | BOOLEAN | |
| validated_by | VARCHAR(255) | |
| validated_at | TIMESTAMPTZ | |
| example_queries | JSONB | `[{title, sql}]` |
| validated_columns | JSONB | `["col1", "col2"]` |
| upstream_refs | JSONB | `["project.dataset.table"]` |
| downstream_refs | JSONB | `["project.dataset.table"]` |
| quality_score | FLOAT | 0–100 |
| used_in_projects | JSONB | `[{project_name, jira_id, repo_url}]` |
| insights | JSONB | `{questions, observations, use_cases}` |
| insights_generated_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | auto-updated |
| search_vector | TSVECTOR | GIN-indexed |

### table_columns
One row per column in each table.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| table_id | UUID FK → tables | cascade delete |
| name | VARCHAR(255) | column name |
| data_type | VARCHAR(100) | BigQuery type |
| description | TEXT | |
| is_nullable | BOOLEAN | |
| is_primary_key | BOOLEAN | |
| position | INTEGER | column order |
| is_pii | BOOLEAN | manually flagged |
| approx_count_distinct | BIGINT | pulled from BQ |
| null_pct | FLOAT | pulled from BQ |
| min_val | VARCHAR(255) | pulled from BQ |
| max_val | VARCHAR(255) | pulled from BQ |
| last_stats_at | TIMESTAMPTZ | when stats were last pulled |

### schema_changes
Tracks column additions and removals detected on sync.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| table_id | UUID FK → tables | |
| change_type | VARCHAR(50) | `column_added` \| `column_removed` |
| column_name | VARCHAR(255) | |
| detected_at | TIMESTAMPTZ | |
| is_acknowledged | BOOLEAN | |

### gcp_sources
Registered GCP projects for BigQuery sync.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| project_id | VARCHAR(255) UNIQUE | GCP project ID |
| display_name | VARCHAR(255) | |
| secret_name | VARCHAR(255) | Secret Manager secret for SA key (NULL = use Workload Identity) |
| is_active | BOOLEAN | |
| last_synced_at | TIMESTAMPTZ | |
| last_sync_status | VARCHAR(50) | `ok` \| `error` \| `running` |
| last_sync_summary | JSONB | stats from last sync |
| created_at | TIMESTAMPTZ | |
| created_by | VARCHAR(255) | email |

### metadata_change_log
Audit log for metadata edits, used for Google Chat notifications.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| entity_type | VARCHAR(50) | `dataset` \| `table` |
| entity_id | UUID | |
| entity_name | VARCHAR(255) | |
| field_changed | VARCHAR(100) | |
| old_value | TEXT | |
| new_value | TEXT | |
| changed_by | VARCHAR(255) | email or `system` |
| changed_at | TIMESTAMPTZ | |
| data_steward | VARCHAR(255) | |
| is_notified | BOOLEAN | sent to Google Chat |

---

## Authentication Flow

```
1. User clicks "Sign in with Google"
   └─► GET /api/v1/auth/login

2. Backend builds OAuth2 URL with redirect_uri = <FRONTEND_URL>/api/v1/auth/callback
   └─► 302 → accounts.google.com

3. User consents → Google redirects to:
   GET /api/v1/auth/callback?code=...

4. Backend exchanges code for access_token + refresh_token
   └─► POST oauth2.googleapis.com/token

5. Backend fetches user info (email, name, picture)
   └─► GET googleapis.com/oauth2/v2/userinfo

6. Backend upserts user in database, stores GCP tokens

7. Backend creates JWT (7-day expiry) with {sub, email, role, exp}
   └─► 302 → <FRONTEND_URL>/login?token=<jwt>&user=<json>

8. Frontend stores JWT in localStorage key ds_catalog_token
   All subsequent API calls send: Authorization: Bearer <jwt>

9. On 401 response → frontend clears localStorage and redirects to /login
```

The stored GCP `access_token` is used when running BigQuery preview queries on behalf of the authenticated user, ensuring BigQuery row-level security is respected.

---

## BigQuery Sync

Syncing imports metadata from BigQuery into the local PostgreSQL database.

### What is synced
- All datasets in the GCP project (name, description, location, created/modified timestamps)
- All tables in each dataset (name, description, row count, size, column schema)
- All columns (name, type, nullable, description)
- Schema change detection: columns added or removed since last sync are recorded in `schema_changes`

### How to trigger
- **UI:** Sources page → Sync button per source, or "Sync All"
- **API:** `POST /api/v1/bq/sync/all`

### Multi-project support
Each source can use a different service account key (stored in Secret Manager) or fall back to Workload Identity. This allows syncing from projects outside your main GCP project.

```
Sources page:
  ├── project-a (Workload Identity)
  ├── project-b (SA key: secret-name-in-sm)
  └── project-c (Workload Identity)
```

---

## AI Insights

Insights are generated using **Vertex AI Gemini** (default) or the **Gemini API** (if `GEMINI_API_KEY` is set).

### What is generated
For each table, Gemini receives the table name, description, column names/types/descriptions, and row count. It returns:

- **Analysis Questions** — business questions this table can answer
- **Observations** — notable patterns, data quality notes, or interesting characteristics
- **DS/ML Use Cases** — potential machine learning or analytics applications

### How to trigger
- Table Detail page → Insights section → "Generate Insights" / "Regenerate"
- **API:** `POST /api/v1/tables/{id}/insights`

### Cost
Uses `gemini-2.0-flash` model. Token usage is minimal per table (< 1K input tokens typically).

---

## Data Lineage

### Manual lineage
Edit upstream and downstream refs directly in the Lineage section. Format: `project.dataset.table`.

### Auto-discovery
The "Discover from GCP" button calls the **Cloud Data Lineage API** (`datalineage.googleapis.com`).

**Requirements:**
- Cloud Data Lineage API enabled in your project
- BigQuery automatic lineage tracking must be active (enabled via Dataplex, or auto-captured for COPY/QUERY/EXPORT job types)
- The `ds-catalog-sa` service account needs `roles/datalineage.viewer`

```bash
# Grant lineage viewer role
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:ds-catalog-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/datalineage.viewer"
```

Discovery merges results with existing manually-entered refs (union, not overwrite).

---

## Operations

### View pod logs

```bash
# Backend
kubectl logs -l app=ds-catalog-backend --tail=100 -f

# Frontend
kubectl logs -l app=ds-catalog-frontend --tail=50

# PostgreSQL
kubectl logs ds-catalog-postgres-0 --tail=50
```

### Restart a deployment

```bash
kubectl rollout restart deployment/ds-catalog-backend
kubectl rollout restart deployment/ds-catalog-frontend
```

### Scale manually

```bash
kubectl scale deployment ds-catalog-backend --replicas=3
```

### Connect to PostgreSQL directly

```bash
kubectl exec -it ds-catalog-postgres-0 -- psql -U catalog -d ds_catalog
```

### Update a secret without full redeploy

```bash
# Update a single key in the K8s secret
kubectl patch secret ds-catalog-secret \
  -p '{"stringData":{"GOOGLE_CHAT_WEBHOOK_URL":"https://chat.googleapis.com/..."}}'

kubectl rollout restart deployment/ds-catalog-backend
```

### Update ConfigMap

```bash
kubectl patch configmap ds-catalog-config \
  -p '{"data":{"FRONTEND_URL":"https://catalog.yourcompany.com"}}'

kubectl rollout restart deployment/ds-catalog-backend
```

### HPA (autoscaling)

The backend has a HorizontalPodAutoscaler configured in `deploy/autoscaling.yaml`. Default: 2 min replicas, 5 max, scale on 70% CPU.

```bash
kubectl get hpa
```

### Database backup

```bash
kubectl exec ds-catalog-postgres-0 -- \
  pg_dump -U catalog ds_catalog | gzip > ds_catalog_backup_$(date +%Y%m%d).sql.gz
```

---

## Adapting for a New Organization

To deploy this for a different organization, you only need to change values — no code changes are required.

### 1. Fork / copy the repository

```bash
git clone <original-repo>
cd ds-data-catalog
```

### 2. Edit `deploy/deploy.sh` — top-level config

```bash
PROJECT_ID="${GCP_PROJECT_ID:-your-new-project-id}"
REGION="${GCP_REGION:-your-preferred-region}"    # e.g. us-central1
CLUSTER_NAME="${CLUSTER_NAME:-ds-catalog-cluster}"
```

### 3. Edit `deploy/configmap.yaml`

```yaml
data:
  GCP_PROJECT_ID: "your-new-project-id"
  # FRONTEND_URL and CORS_ORIGINS are auto-patched by deploy.sh after deploy
  FRONTEND_URL: "http://FRONTEND_IP_OR_DOMAIN"
  CORS_ORIGINS: '["http://localhost:5173"]'
```

### 4. Edit `deploy/service-account.yaml`

```yaml
annotations:
  iam.gke.io/gcp-service-account: ds-catalog-sa@your-new-project-id.iam.gserviceaccount.com
```

### 5. Create secrets in Secret Manager

```bash
PROJECT_ID=your-new-project-id

echo -n "your-client-id"     | gcloud secrets create GOOGLE_CLIENT_ID     --data-file=- --project=$PROJECT_ID
echo -n "your-client-secret" | gcloud secrets create GOOGLE_CLIENT_SECRET  --data-file=- --project=$PROJECT_ID
echo -n "$(openssl rand -hex 32)" | gcloud secrets create jwt-secret-key   --data-file=- --project=$PROJECT_ID
echo -n "your-gemini-key"    | gcloud secrets create gemini-api-key        --data-file=- --project=$PROJECT_ID
```

### 6. Run deploy

```bash
cd deploy
GCP_PROJECT_ID=your-new-project-id \
GCP_REGION=us-central1 \
CLUSTER_NAME=ds-catalog-cluster \
  ./deploy.sh
```

### 7. Register the OAuth redirect URI

After deploy prints the app URL, add it to your Google OAuth client (see Step 7 above).

### 8. Optional — Add your BigQuery sources

After logging in, go to **Sources** and add your GCP projects. Each project syncs its BigQuery metadata into the catalog.

### What NOT to change

The following are internal to the cluster and do not need to change:
- `DATABASE_URL` — always `postgresql://catalog:catalog@ds-catalog-postgres:5432/ds_catalog`
- `POSTGRES_PASSWORD` — only used internally between backend and the StatefulSet
- nginx.conf — the backend service name `ds-catalog-backend` is fixed

---

## Troubleshooting

### Pods in CrashLoopBackOff

```bash
# Identify the failing pod
kubectl get pods

# View crash logs
kubectl logs <pod-name> --previous
```

**Common causes:**

| Error | Cause | Fix |
|---|---|---|
| `connection refused` on `ds-catalog-postgres` | PostgreSQL not ready or crashed | Check postgres pod logs |
| `initdb: directory not empty` on postgres | PVC mount has `lost+found` | Add `PGDATA=/var/lib/postgresql/data/pgdata` env to postgres StatefulSet |
| `GOOGLE_CLIENT_ID not configured` | Secret not synced | Re-run secret sync or check Secret Manager values |
| `unable to connect to server` on Vertex AI | Workload Identity not set up | Run `2-setup-workload-identity.sh` |

### OAuth 400 — invalid request

**Cause:** Redirect URI in the request does not match what is registered in Google Cloud Console.

**Fix:**
1. Note the exact `redirect_uri` from the error page
2. Add it to your OAuth client in Google Cloud Console under **Authorised redirect URIs**
3. Also add the base domain to **Authorised JavaScript origins**

### OAuth 400 — Invalid Origin: must end with a public top-level domain

**Cause:** You are using a raw IP address (e.g. `http://34.90.12.55`) as the OAuth origin.

**Fix:** Use `<ip>.nip.io` instead. Update ConfigMap and register the nip.io URL in Google Cloud Console:

```bash
IP=34.90.12.55
kubectl patch configmap ds-catalog-config \
  -p "{\"data\":{\"FRONTEND_URL\":\"http://${IP}.nip.io\",\"CORS_ORIGINS\":\"[\\\"http://${IP}.nip.io\\\"]\"}}"
kubectl rollout restart deployment/ds-catalog-backend
```

### gke-gcloud-auth-plugin not found

```bash
gcloud components install gke-gcloud-auth-plugin
export PATH="$(gcloud info --format='value(installation.sdk_root)')/bin:$PATH"
```

### Rollout timeout

```bash
# Check what's blocking the rollout
kubectl describe deployment ds-catalog-backend
kubectl get events --sort-by='.lastTimestamp' | tail -20
```

### Secret Manager permission denied

The GCP SA needs `roles/secretmanager.secretAccessor`:

```bash
gcloud projects add-iam-policy-binding your-project-id \
  --member="serviceAccount:ds-catalog-sa@your-project-id.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Backend returns 502 on AI features

Vertex AI is not reachable. Verify:
1. `roles/aiplatform.user` is granted to `ds-catalog-sa`
2. `aiplatform.googleapis.com` API is enabled
3. Workload Identity annotation is present on the K8s ServiceAccount:
   ```bash
   kubectl describe serviceaccount ds-catalog-sa | grep gcp-service-account
   ```

---

## File Structure

```
catalog_app/
├── backend/
│   ├── api/
│   │   ├── auth.py          # Google OAuth2 + JWT endpoints
│   │   ├── bq.py            # BigQuery sources + sync endpoints
│   │   ├── datasets.py      # Dataset CRUD
│   │   ├── tables.py        # Table CRUD + preview + insights + lineage
│   │   ├── search.py        # Full-text search
│   │   ├── schema_changes.py
│   │   ├── notifications.py
│   │   ├── stats.py
│   │   └── tags.py
│   ├── services/
│   │   ├── bq_lineage.py    # Cloud Data Lineage REST API client
│   │   ├── bq_preview.py    # BigQuery TABLESAMPLE preview
│   │   ├── bq_quality.py    # Column stats quality checks
│   │   ├── bq_safety.py     # Query safety / cost estimation
│   │   ├── bq_stats.py      # Column statistics pull
│   │   ├── bq_sync.py       # Full BigQuery metadata sync
│   │   ├── gchat.py         # Google Chat webhook notifications
│   │   └── insights.py      # Vertex AI Gemini insights
│   ├── models/
│   │   └── catalog.py       # SQLAlchemy ORM models
│   ├── schemas/
│   │   └── catalog.py       # Pydantic request/response schemas
│   ├── dependencies/
│   │   └── auth.py          # JWT dependency injection
│   ├── config.py            # Pydantic settings (env vars)
│   ├── database.py          # SQLAlchemy engine + session
│   └── main.py              # FastAPI app + router registration
├── frontend/
│   ├── src/
│   │   ├── api/             # Axios API clients per resource
│   │   ├── components/      # Shared MUI components
│   │   ├── contexts/        # AuthContext (JWT state)
│   │   ├── pages/           # One file per route
│   │   └── design.ts        # Shared MUI design tokens
│   ├── package.json
│   └── vite.config.ts
├── deploy/
│   ├── deploy.sh            # Main one-shot deploy script
│   ├── 1-create-cluster.sh  # GKE Autopilot cluster creation
│   ├── 2-setup-workload-identity.sh
│   ├── deployment.yaml      # Backend Deployment
│   ├── frontend-deployment.yaml
│   ├── service.yaml         # Backend ClusterIP Service
│   ├── frontend-service.yaml # Frontend LoadBalancer Service
│   ├── postgres.yaml        # PostgreSQL StatefulSet + PVC + Service
│   ├── configmap.yaml
│   ├── secret.yaml          # Template only — real values from Secret Manager
│   ├── service-account.yaml # K8s ServiceAccount with Workload Identity annotation
│   └── autoscaling.yaml     # HPA for backend
├── Dockerfile.backend
├── Dockerfile.frontend
├── nginx.conf               # Frontend nginx — proxies /api/v1/ to backend
└── requirements.txt
```
