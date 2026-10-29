# DS Data Catalog

A self-hosted data catalog for Google Cloud / BigQuery teams. It syncs table and column metadata from your BigQuery projects into a searchable, documented and governed registry — with schema-change alerts, data previews, quality checks, PII detection, lineage, usage statistics and AI-generated insights.

It runs in your own GCP project (GKE Autopilot + PostgreSQL), so catalog metadata never leaves your infrastructure.

How each Google Cloud integration works — sync, previews, DLP, Dataplex, lineage, usage, AI insights, Google Chat — is described in [`docs/integrations.md`](docs/integrations.md).

---

## Contents

1. [Features](#features)
2. [Architecture](#architecture)
3. [Security model](#security-model)
4. [Local development](#local-development)
5. [Tests](#tests)
6. [Deploying to GKE](#deploying-to-gke)
7. [Configuration reference](#configuration-reference)
8. [IAM roles](#iam-roles)
9. [API reference](#api-reference)
10. [Operations](#operations)
11. [Troubleshooting](#troubleshooting)
12. [Project layout](#project-layout)
13. [License](#license)

---

## Features

- **Discovery** — browse datasets and tables, full-text search across names, descriptions, columns and tags, filter by sensitivity, tags and column name.
- **Documentation** — table and column descriptions, owners, data stewards, tags, sensitivity labels (`public`, `internal`, `confidential`, `restricted`), primary keys, example queries, links to the projects that use a table. Datasets and tables outside a synced project can be registered by hand.
- **Multi-project sync** — register several GCP projects as sources; each uses Workload Identity or its own service-account key from Secret Manager. Re-syncs keep user-edited metadata.
- **Schema change detection** — columns added or removed since the last sync are flagged for acknowledgement.
- **Trusted data** — editors certify tables (and specific columns) as validated; the validation is recorded under their account.
- **Data preview** — a `TABLESAMPLE` query with a dry-run cost estimate before it runs.
- **Quality** — null rates and timestamp ranges, column statistics (approximate distinct count, null %, min/max), a documentation-based quality score, and [Dataplex data quality scans](https://cloud.google.com/dataplex/docs/data-quality-overview).
- **PII detection** — [Cloud DLP](https://cloud.google.com/sensitive-data-protection/docs) inspects a sample and flags PII columns.
- **Lineage** — manual upstream/downstream references plus discovery through the Cloud Data Lineage API.
- **Usage statistics** — who queries a table and how often (`INFORMATION_SCHEMA.JOBS`).
- **Schema history** — column changes over the last 30 days from Cloud Asset Inventory.
- **AI insights** — Gemini suggests analysis questions, observations and ML use cases. It receives table metadata and column statistics (including per-column min/max values), never sampled rows.
- **Notifications** — in-app change feed and optional Google Chat alerts.

---

## Architecture

```text
Browser
  │  HTTPS
  ▼
GKE Ingress + Google-managed certificate  (HTTP → HTTPS redirect, optional IAP)
  │
  ▼
ds-catalog-frontend  (nginx)
  ├── /           → React SPA
  └── /api/v1/*   → ds-catalog-backend:8000
                       │
ds-catalog-backend  (FastAPI)  ── Workload Identity ──► BigQuery, Vertex AI, DLP, Dataplex,
  │                                                      Data Lineage, Asset Inventory, Secret Manager
  ▼
ds-catalog-postgres  (PostgreSQL 16 StatefulSet)
```

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, MUI v5, TanStack Query, Vite |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Pydantic 2 |
| Database | PostgreSQL 16 (full-text search with `tsvector` + GIN indexes) |
| Auth | Google OAuth 2.0 → app-issued JWT (HS256), role checks on every request |
| Infrastructure | GKE Autopilot, Artifact Registry, Cloud Build, Secret Manager |

The backend creates and migrates its own tables on startup (`init_db` in `backend/database.py`).

---

## Security model

**Sign-in.** Every page and API call requires a signed-in user; only `/health`, `/api/v1/auth/login`, `/api/v1/auth/callback` and `/api/v1/setup/status` are public, and `PUT /api/v1/setup/oauth` also accepts the setup token (see [OAuth client in the setup wizard](#oauth-client-in-the-setup-wizard)). Users sign in with Google and must be allowed by configuration:

| Setting | Effect |
|---|---|
| `ADMIN_EMAILS` | Always allowed; promoted to `admin` at every sign-in. Environment only |
| `ALLOWED_EMAIL_DOMAINS` | Anyone with a verified Google account on these domains |
| `ALLOWED_EMAILS` | Individual accounts outside those domains |

With all three empty, nobody can sign in. New users get `DEFAULT_ROLE` (`viewer` unless set to `editor`).

<a name="settings-page"></a>**Settings page.** Admins can set the allowed domains and accounts, the role for new users, the Google Chat webhook URL and the Gemini API key at `/settings` instead of in the environment (`backend/services/app_config.py`). A variable set in the environment wins, and the page shows it as read-only; `ADMIN_EMAILS` stays environment-only, so an operator can always get back in. The page refuses a change that would stop the admin making it from signing in, accepts only `https://chat.googleapis.com/` webhook URLs, and never returns the webhook URL or API key.

`LOCAL_MODE=true` replaces all of this with a form where anyone signs in as any email and role, through `POST /api/v1/auth/local` (404 otherwise). It is for development on your own machine ([Local mode](#local-mode-no-google-account-needed)): the backend refuses to start with it unless `FRONTEND_URL` is a `localhost` URL.

**Roles.** Admins change roles and deactivate accounts on the **Users** page. Roles are read from the database on every request, so changes apply immediately, even to tokens already issued.

| Role | Can |
|---|---|
| `viewer` | Browse, search and read catalog metadata (not the detail page of `restricted` datasets or tables) |
| `editor` | Everything a viewer can, plus edit metadata, validate tables, and run BigQuery/AI jobs: preview, quality checks, stats, DLP and Dataplex scans, lineage discovery, usage stats, insights |
| `admin` | Everything, plus GCP sources, BigQuery sync, user management and the Settings page |

The full route-by-role matrix is enforced in `backend/` and checked against every registered route by `tests/test_authorization.py`.

**What BigQuery jobs run as.** Previews, quality checks, stats, DLP and Dataplex scans run as the catalog's service account (`ds-catalog-sa`, or the key in `BQ_SECRET_NAME`), not as the signed-in user. An editor can therefore sample rows from any table that service account can read. Grant the service account access only to the datasets the catalog should cover, and give the `editor` role only to people who may see that data.

**Tokens.** After the OAuth callback, the app's JWT is handed to the browser in the URL fragment (never in a query string or server log) and stored in `localStorage`; it expires after `JWT_EXPIRE_MINUTES` (default 7 days). The backend refuses to start unless `JWT_SECRET` is a random value of at least 32 characters. The user's Google access and refresh tokens (scopes `bigquery.readonly` and `cloud-platform.read-only`) are stored in PostgreSQL, encrypted, and used to list the projects an admin can add as sources and to sync with the admin's own credentials.

**Encryption at rest.** The users' Google tokens, an OAuth client secret entered in the setup wizard, and a Google Chat webhook URL or Gemini API key entered on the Settings page are stored as Fernet tokens (`backend/crypto.py`) under a key derived from `ENCRYPTION_KEY`, so a database dump or backup alone cannot use them. The API never returns them.
- Without `ENCRYPTION_KEY` the key is derived from `JWT_SECRET`, and changing `JWT_SECRET` then loses the stored secrets: users sign in again, and a client stored by the wizard is entered again. Set `ENCRYPTION_KEY` so `JWT_SECRET` can be rotated freely. `start.sh` and `deploy.sh` generate it.
- At startup the backend encrypts any plaintext tokens left from older versions and moves values under an older key to the current one. To rotate the key, set `ENCRYPTION_KEY=new,old`, restart, then remove `old`.
- A value no configured key can read is left in place, so it comes back if the key is restored. Until then it reads as missing, and the backend logs how many there are.

<a name="oauth-client-in-the-setup-wizard"></a>**OAuth client in the setup wizard.** Instead of `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, the client can be entered at `/setup`. Environment variables win: while either is set, the wizard cannot change the client.
- The wizard checks the client with Google before saving it, by exchanging a made-up authorization code: Google reports a wrong, unknown or deleted client as such.
- The client secret is stored encrypted in the `app_settings` table (see *Encryption at rest*).
- Before anyone can sign in, saving requires the **setup token**, which the backend prints to its log at startup while no client is configured. With `LOG_SETUP_TOKEN=false` (set by `deploy.sh`, since project members who can read Cloud Logging may be more than your admins) the log only says how to get it. Run `python -m backend.setup_token` where the backend runs (in `catalog_app/`, or `kubectl exec deploy/ds-catalog-backend -- python -m backend.setup_token`) to get it at any other time, for example after the client was deleted and nobody can sign in. The token is derived from `JWT_SECRET` and the stored client, so every replica accepts it and it stops working once a client is saved with it. A signed-in admin can replace the client without it.

**OAuth client health.** Google deletes OAuth clients that go unused for months. The backend checks the configured client (from the environment or the wizard) with Google at startup and every `OAUTH_CHECK_INTERVAL_MINUTES` (default 6 hours). It does this with the same made-up code exchange as above. If Google rejects the client, the backend logs it, the login page says sign-in is broken, and `/setup` explains how to replace the client. A rejected client is checked again every few minutes, so restoring it in Google Cloud clears the warning.

**Network.** Deploy with `DOMAIN` set so the app is served over HTTPS behind a GKE Ingress with a Google-managed certificate. For an extra gate at the load balancer, add [Identity-Aware Proxy](#optional-identity-aware-proxy).

---

## Local development

Prerequisites: Python 3.12, Node.js 20 and Docker (for PostgreSQL). For BigQuery features, run the backend on your machine (option B below) after `gcloud auth application-default login` and `gcloud auth application-default set-quota-project <your-project>` (without a quota project, Google refuses some APIs with a 403). To work on the app without a Google OAuth client, use [local mode](#local-mode-no-google-account-needed).

1. **Create a Google OAuth client** — Google Cloud Console → APIs & Services → Credentials → *Create credentials* → *OAuth client ID* → *Web application*. Authorised redirect URI: `http://localhost:5173/api/v1/auth/callback`. Put it in `.env` (step 2), or leave `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` empty and enter it in the setup wizard with the setup token from the backend log.

2. **Configure:**

   ```bash
   cd catalog_app
   cp .env.example .env
   # set JWT_SECRET and ENCRYPTION_KEY (openssl rand -hex 32 each), ADMIN_EMAILS, ALLOWED_EMAIL_DOMAINS
   # and GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (or enter those in the setup wizard)
   ```

3. **Option A — run everything in Docker:**

   ```bash
   docker compose up
   ```

   **Option B — PostgreSQL in Docker, the app on your machine:**

   ```bash
   docker compose up -d db
   python3 -m venv ../data_env
   ../data_env/bin/pip install -r requirements-dev.txt
   ./start.sh
   ```

Open http://localhost:5173 and sign in with an account from `ADMIN_EMAILS`. On a fresh install you land in the setup wizard at `/setup`, which checks the configuration, lets you pick BigQuery projects from the ones your Google account can see, and runs the first sync project by project. If Google sign-in or `ADMIN_EMAILS` is not configured yet, `/login` sends you to the wizard, which names the missing settings and shows the OAuth redirect URI to register.

### Local mode: no Google account needed

Local mode runs the app without a Google OAuth client, `ADMIN_EMAILS` or BigQuery. You still need PostgreSQL (`docker compose up -d db`).

```bash
cd catalog_app
./start.sh --local       # creates .env on the first run; no need to edit it
```

- **Sign-in:** the login page asks for any email and a role (viewer, editor or admin). Each sign-in sets that user's role, so sign out and in again to see the app as another role. If a Google client is configured, Google sign-in still works next to it.
- **Demo data:** an empty catalog gets a made-up retailer in the project `demo-retail-analytics`: 4 datasets and 9 tables with descriptions, tags, lineage, a trusted table, a `restricted` table with PII columns, a pending schema change and a notification. `python -m backend.demo_data` adds it whenever the catalog has no datasets, and leaves a catalog with data alone. An admin can also add it from the empty Browse page (**Load sample data**), in any mode.
- **Docker Compose:** set `LOCAL_MODE=true` in `.env`, run `docker compose up`, then `docker compose exec backend python -m backend.demo_data`.
- **BigQuery:** locally signed-in users have no Google token, so sync, preview, scans and lineage discovery use your Application Default Credentials and make real calls to Google. They fail on the made-up demo tables. The setup wizard can't list your projects; enter project IDs by hand.
- **Safety:** anyone who can reach the backend can sign in as an admin. The backend refuses to start with `LOCAL_MODE=true` unless `FRONTEND_URL` is a `localhost` URL, logs a warning at startup, and the header shows a **Local mode** badge.

---

## Tests

```bash
cd catalog_app
docker compose up -d db      # a fresh volume also gets the ds_catalog_test database
pytest
```

The suite uses `TEST_DATABASE_URL` (default `postgresql://catalog:catalog@localhost:5432/ds_catalog_test`) and drops all tables when it finishes, so it refuses to run against a database whose name does not end in `_test`. Google APIs are mocked.

`tests_e2e/` holds opt-in smoke tests for a running deployment (reachability, anonymous access rejected, a dataset create/search/delete round trip):

```bash
APP_BASE_URL=https://catalog.example.com E2E_TOKEN=<editor JWT> pytest tests_e2e
```

To get a token, sign in and copy `light_data_catalog_token` from the browser's local storage.

CI (`.github/workflows/ci.yml`) runs the backend tests against PostgreSQL 16, builds the frontend, and syntax-checks the shell scripts.

---

## Deploying to GKE

`catalog_app/deploy/deploy.sh` does the whole deployment and is safe to re-run: it enables APIs, creates (or reuses) a GKE Autopilot cluster, sets up Workload Identity and IAM, builds both images with Cloud Build into Artifact Registry, and applies the Kubernetes manifests.

Prerequisites: a GCP project with billing, `gcloud` authenticated as a project Owner (or equivalent), `kubectl`, and `openssl`. Docker is not needed locally.

### 1. Create a Google OAuth client

Google Cloud Console → APIs & Services → Credentials → *Create credentials* → *OAuth client ID* → *Web application*. You add its origin and redirect URI after the deploy prints the app URL (step 4).

### 2. Store secrets in Secret Manager

```bash
PROJECT_ID=your-project-id

echo -n "your-client-id"     | gcloud secrets create GOOGLE_CLIENT_ID     --data-file=- --project=$PROJECT_ID
echo -n "your-client-secret" | gcloud secrets create GOOGLE_CLIENT_SECRET --data-file=- --project=$PROJECT_ID
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create jwt-secret-key --data-file=- --project=$PROJECT_ID

# Optional
echo -n "your-gemini-api-key"  | gcloud secrets create gemini-api-key                 --data-file=- --project=$PROJECT_ID
echo -n "https://chat.googleapis.com/v1/spaces/..." \
                               | gcloud secrets create ds-catalog-google-chat-webhook --data-file=- --project=$PROJECT_ID
echo -n "bq-sa-key-secret"     | gcloud secrets create ds-catalog-bq-secret-name      --data-file=- --project=$PROJECT_ID
```

| Kubernetes secret key | Secret Manager name | |
|---|---|---|
| `GOOGLE_CLIENT_ID` | `GOOGLE_CLIENT_ID` | required |
| `GOOGLE_CLIENT_SECRET` | `GOOGLE_CLIENT_SECRET` | required |
| `JWT_SECRET` | `jwt-secret-key` | required |
| `GEMINI_API_KEY` | `gemini-api-key` | optional — without it insights use Vertex AI |
| `GOOGLE_CHAT_WEBHOOK_URL` | `ds-catalog-google-chat-webhook` | optional |
| `BQ_SECRET_NAME` | `ds-catalog-bq-secret-name` | optional — name of a secret holding a service-account key JSON for BigQuery jobs |
| `POSTGRES_PASSWORD`, `DATABASE_URL` | `ds-catalog-postgres-password` | generated on the first deploy |
| `ENCRYPTION_KEY` | `ds-catalog-encryption-key` | generated on the first deploy; keep it (see [Encryption at rest](#security-model)) |

Secrets are copied into the Kubernetes secret `ds-catalog-secret` at deploy time. After rotating one, run `./deploy.sh secrets`.

### 3. Deploy

```bash
cd catalog_app/deploy
GCP_PROJECT_ID=your-project-id \
ADMIN_EMAILS=you@yourcompany.com \
ALLOWED_EMAIL_DOMAINS=yourcompany.com \
DOMAIN=catalog.yourcompany.com \
  ./deploy.sh
```

With `DOMAIN`, the frontend sits behind a GKE Ingress on the global static IP `ds-catalog-ip` with a Google-managed certificate, and HTTP redirects to HTTPS. Point the domain's DNS A record at the IP the script prints; the certificate is issued 10–60 minutes after DNS resolves.

Without `DOMAIN`, the frontend gets a public LoadBalancer IP and is served over plain HTTP on `http://<ip>.nip.io`. Use that only to try the app out, not for real users or data.

Other variables: `GCP_REGION` (default `europe-west1`), `CLUSTER_NAME` (default `ds-catalog-cluster`), `K8S_NAMESPACE`, `REGISTRY_TYPE` (`artifact-registry` or `gcr`), `AR_LOCATION`, `AR_REPOSITORY`, `SKIP_CLUSTER=1`, `ALLOWED_EMAILS`, `DEFAULT_ROLE`, `ASSUME_YES=1`. See the header of `deploy.sh`.

### 4. Register the OAuth redirect URI

The script prints the app URL. On your OAuth client add:

- Authorised JavaScript origin: `https://catalog.yourcompany.com`
- Authorised redirect URI: `https://catalog.yourcompany.com/api/v1/auth/callback`

### 5. Sign in and connect BigQuery

Sign in with an `ADMIN_EMAILS` account, open **GCP Sources** (or `/setup`), add your projects and run a sync. Give the `ds-catalog-sa` service account read access to any project other than the one it was created in.

### Optional: Identity-Aware Proxy

IAP makes Google check identity at the load balancer, before any request reaches the app. It requires the HTTPS deploy.

```bash
cd catalog_app/deploy
GCP_PROJECT_ID=your-project-id \
IAP_MEMBERS="group:data-team@yourcompany.com,user:you@yourcompany.com" \
  ./setup-iap.sh
```

Redeploys keep IAP attached.

---

## Configuration reference

All backend settings are environment variables (`backend/config.py`). In production `deploy.sh` writes the non-secret ones to the ConfigMap `ds-catalog-config` and the secrets to `ds-catalog-secret`.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://catalog:catalog@localhost:5432/ds_catalog` | PostgreSQL connection string |
| `JWT_SECRET` | — (required) | At least 32 random characters; the backend will not start without it |
| `JWT_ALGORITHM` | `HS256` | `HS256`, `HS384` or `HS512` |
| `JWT_EXPIRE_MINUTES` | `10080` (7 days) | Session length |
| `ENCRYPTION_KEY` | — (derived from `JWT_SECRET`) | Encrypts the secrets stored in the database; 32+ random characters, comma-separated to rotate (first encrypts, all decrypt) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | — | OAuth client. Leave both empty to enter it in the setup wizard instead; sign-in is unavailable until one or the other is done |
| `FRONTEND_URL` | `http://localhost:5173` | Public URL of the app; the OAuth redirect URI is `<FRONTEND_URL>/api/v1/auth/callback` |
| `OAUTH_CHECK_INTERVAL_MINUTES` | `360` | How often to ask Google whether the OAuth client still works; `0` turns the check off |
| `LOG_SETUP_TOKEN` | `true` | Print the setup token in the startup log; if `false`, only `python -m backend.setup_token` shows it |
| `CORS_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | JSON array |
| `ADMIN_EMAILS` | — | Comma-separated admin accounts |
| `ALLOWED_EMAIL_DOMAINS` | — | Comma-separated domains allowed to sign in. Or set on the Settings page |
| `ALLOWED_EMAILS` | — | Comma-separated individual accounts allowed to sign in. Or set on the Settings page |
| `DEFAULT_ROLE` | `viewer` | Role for new users: `viewer` or `editor`. Or set on the Settings page |
| `LOCAL_MODE` | `false` | Development only: sign in without Google, as any email and role. Refused unless `FRONTEND_URL` is a `localhost` URL ([Local mode](#local-mode-no-google-account-needed)) |
| `GCP_PROJECT_ID` | — | Default project for `POST /bq/sync` |
| `BQ_SECRET_NAME` | — | Secret Manager secret with a service-account key for BigQuery jobs; empty uses Workload Identity / ADC |
| `GEMINI_API_KEY` | — | Use the Gemini API instead of Vertex AI. Or set on the Settings page |
| `GOOGLE_CHAT_WEBHOOK_URL` | — | Google Chat alerts for metadata changes, validations, PII findings and quality scores. Or set on the Settings page |

---

## IAM roles

`deploy.sh` grants these roles to `ds-catalog-sa` on the project:

| Role | Used for |
|---|---|
| `roles/bigquery.jobUser` | Running preview, stats and quality queries |
| `roles/bigquery.dataViewer` | Reading table data for previews and scans |
| `roles/bigquery.metadataViewer` | Syncing datasets, tables and schemas |
| `roles/bigquery.resourceViewer` | Usage statistics from `INFORMATION_SCHEMA.JOBS` |
| `roles/aiplatform.user` | Gemini insights on Vertex AI |
| `roles/dlp.user` | PII detection |
| `roles/dataplex.dataScanAdmin` | Dataplex data quality scans |
| `roles/datalineage.viewer` | Lineage discovery |
| `roles/cloudasset.viewer` | Schema history |
| `roles/secretmanager.secretAccessor` | Per-source service-account keys |
| `roles/logging.logWriter`, `roles/monitoring.metricWriter` | Logs and metrics |

To catalog other projects, grant `ds-catalog-sa@<project>.iam.gserviceaccount.com` the BigQuery roles there, or register the source with its own service-account key.

---

## API reference

All endpoints are under `/api/v1` and expect `Authorization: Bearer <jwt>` unless marked public. Interactive docs are served by the backend at `/docs` (not exposed through nginx in production).

| Method | Path | Role | Description |
|---|---|---|---|
| GET | `/auth/login` | public | Redirect to Google sign-in |
| GET | `/auth/callback` | public | OAuth callback; redirects to `/login#token=…` |
| GET | `/auth/me` | any | Current user profile and role |
| POST | `/auth/local` | public, `LOCAL_MODE` only | Sign in as `{"email", "role"}` without Google; returns `{token, user}`. 404 when local mode is off |
| GET | `/setup/status` | public | Setup wizard checks (booleans, counts, the OAuth redirect URI, and Google's reason if it rejects the OAuth client) |
| PUT | `/setup/oauth` | admin or `X-Setup-Token` | Check the Google OAuth client with Google and store it, secret encrypted (409 while set in the environment) |
| POST | `/setup/demo-data` | admin | Add the fictional demo catalog; 409 unless the catalog has no datasets |
| GET | `/settings` | admin | The [Settings page](#settings-page) values, each with its source (`environment`, `database` or `null`); secrets only as `configured` |
| PUT | `/settings` | admin | Change any of `allowed_email_domains`, `allowed_emails`, `default_role`, `google_chat_webhook_url`, `gemini_api_key`; `""` removes one. 409 for one set in the environment |
| POST | `/settings/google-chat/test` | admin | Send a test message to the configured Chat space |
| GET | `/datasets` | any | List datasets (`project_id`, `sensitivity_label`, `tags`, `owner`, `validated`, `skip`, `limit`) |
| POST | `/datasets` | editor | Register a dataset; registering a removed one restores it with its tables |
| GET | `/datasets/{id}` | any | Dataset detail (`restricted`: editor) |
| PUT | `/datasets/{id}` | editor | Update metadata |
| DELETE | `/datasets/{id}` | editor | Soft-delete, with its tables |
| PATCH | `/datasets/{id}/validate` | editor | Mark validated (`{"validated": true}`) or not (`false`); without a body it toggles |
| PUT | `/datasets/{id}/projects` | editor | Replace linked projects |
| GET | `/datasets/{id}/tables` | any | Tables in a dataset |
| GET | `/tables` | any | List tables (`dataset_id`, `sensitivity_label`, `tags`, `owner`, `validated`, `skip`, `limit`) |
| POST | `/tables` | editor | Register a table, optionally with `columns`; registering a removed one restores it |
| GET | `/tables/{id}` | any | Table detail with columns (`restricted`: editor) |
| PUT | `/tables/{id}` | editor | Update metadata |
| DELETE | `/tables/{id}` | editor | Soft-delete |
| PATCH | `/tables/{id}/validate` | editor | Mark trusted (`{"trusted": true, "validated_columns": [...]}`) or revoke (`{"trusted": false}`); without `trusted` it toggles |
| PATCH | `/tables/{id}/columns` | editor | Column descriptions and primary keys |
| PATCH | `/tables/{id}/columns/{column_id}/pii` | editor | Toggle a column's PII flag |
| PATCH | `/tables/{id}/queries` | editor | Replace example queries |
| PUT | `/tables/{id}/projects` | editor | Replace linked projects |
| PUT | `/tables/{id}/lineage` | editor | Set upstream/downstream refs |
| GET | `/tables/{id}/lineage/discover` | editor | Discover lineage via Data Lineage API and merge it in |
| GET | `/tables/{id}/preview` | editor | Preview SQL and cost estimate (dry run) |
| POST | `/tables/{id}/preview/run` | editor | Run the preview and return rows |
| POST | `/tables/{id}/quality-check` | editor | Null rates and timestamp ranges |
| POST | `/tables/{id}/pull-stats` | editor | Column statistics |
| POST | `/tables/{id}/scan-pii` | editor | Cloud DLP PII scan |
| POST | `/tables/{id}/dataplex-quality` | editor | Dataplex data quality scan |
| POST | `/tables/{id}/insights` | editor | Generate Gemini insights |
| GET | `/tables/{id}/usage` | editor | Query usage over the last `days` (1–90) |
| GET | `/tables/{id}/schema-history` | any | Column changes from Cloud Asset Inventory |
| GET | `/search` | any | Full-text search across datasets and tables |
| GET | `/search/columns` | any | Find columns by name |
| GET | `/tags` | any | All tags |
| GET | `/stats` | any | Catalog totals and documentation coverage |
| GET | `/schema-changes` | any | Schema change alerts |
| PATCH | `/schema-changes/{id}/acknowledge` | editor | Acknowledge one change |
| POST | `/schema-changes/acknowledge-all` | editor | Acknowledge all (optionally per table) |
| GET | `/notifications` | any | Recent metadata changes |
| POST | `/notifications/{id}/dismiss` | editor | Dismiss one |
| POST | `/notifications/dismiss-all` | editor | Dismiss all |
| GET | `/bq/projects` | admin | Projects the signed-in admin can access |
| GET | `/bq/sources` | admin | Registered sources |
| POST | `/bq/sources` | admin | Add a source |
| PATCH | `/bq/sources/{id}` | admin | Update a source |
| DELETE | `/bq/sources/{id}` | admin | Remove a source (keeps synced metadata) |
| POST | `/bq/sync` | admin | Sync one project without adding it as a source (`project_id`, default `GCP_PROJECT_ID`; optional `dataset_filter` prefix and `secret_name`) |
| POST | `/bq/sync/all` | admin | Sync all active sources |
| POST | `/bq/sync/source/{id}` | admin | Sync one source |
| GET | `/users` | admin | List users |
| PATCH | `/users/{id}` | admin | Change role or active status |
| GET | `/health` (no prefix) | public | Liveness probe |

---

## Operations

`catalog_app/deploy/utils.sh` wraps common commands:

```bash
./utils.sh status                    # deployments, pods, services, URL
./utils.sh logs ds-catalog-backend   # follow logs
./utils.sh restart ds-catalog-backend
./utils.sh scale ds-catalog-backend 3
./utils.sh shell                     # shell in a backend pod
```

The backend HorizontalPodAutoscaler (`deploy/autoscaling.yaml`) runs 2–8 replicas at 70% CPU.

```bash
# Re-sync the Kubernetes secret after rotating a value in Secret Manager
./deploy.sh secrets

# Database shell and backup
kubectl exec -it ds-catalog-postgres-0 -- psql -U catalog -d ds_catalog
kubectl exec ds-catalog-postgres-0 -- pg_dump -U catalog ds_catalog | gzip > ds_catalog_$(date +%Y%m%d).sql.gz
```

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Backend crash-loops with `JWT_SECRET must be a random value…` | Secret missing or too short | Create `jwt-secret-key` (32+ chars) and run `./deploy.sh secrets` |
| Sign-in returns "not allowed to sign in" | Account not in `ADMIN_EMAILS`, `ALLOWED_EMAIL_DOMAINS` or `ALLOWED_EMAILS` | Add it on the Settings page, or re-run `deploy.sh` with the right lists |
| Google shows `redirect_uri_mismatch` | Redirect URI not registered | Add `<FRONTEND_URL>/api/v1/auth/callback` to the OAuth client |
| Google shows `Error 401: deleted_client`, or the login page says Google rejects the OAuth client | The OAuth client was deleted in Google Cloud (Google also deletes clients unused for months) | Restore it under Google Auth Platform → Clients if still listed, or create a new one. Put it in the environment, or, if the client came from the setup wizard, replace it at `/setup` with the token from `python -m backend.setup_token`. Users sign in again afterwards |
| Log says stored secrets "cannot be decrypted" | `ENCRYPTION_KEY` (or, without it, `JWT_SECRET`) changed or was removed | Restore the previous key, or list it after the new one (`ENCRYPTION_KEY=new,old`). Otherwise users sign in again and a wizard-stored OAuth client is entered again |
| "Your sign-in session expired" | OAuth state cookie missing (blocked cookies, or more than 10 minutes on the consent screen) | Try again |
| 403 on an action | Your role is too low | Ask an admin to change it on the Users page |
| Certificate stays `Provisioning` | DNS does not point at `ds-catalog-ip` yet | Check the A record; `kubectl describe managedcertificate ds-catalog-cert` |
| 502 on BigQuery, DLP or AI features | Missing API or IAM role, or Workload Identity not bound | Check [IAM roles](#iam-roles) and `kubectl describe serviceaccount ds-catalog-sa` |
| `initdb: directory not empty` on PostgreSQL | PVC contains `lost+found` | Already handled by `PGDATA=/var/lib/postgresql/data/pgdata` in `postgres.yaml` |

---

## Project layout

```text
catalog_app/
├── backend/
│   ├── api/            # Routers: auth, users, datasets, tables, search, bq, setup, …
│   ├── services/       # BigQuery sync/preview/stats/quality/usage, DLP, Dataplex,
│   │                   # lineage, asset inventory, Gemini insights, Google Chat
│   ├── dependencies/   # Auth and role dependencies
│   ├── models/         # SQLAlchemy models
│   ├── schemas/        # Pydantic schemas
│   ├── config.py       # Settings (environment variables)
│   ├── demo_data.py    # Demo catalog for local mode (python -m backend.demo_data)
│   ├── database.py     # Engine, sessions, startup migrations
│   └── main.py         # App and router registration
├── frontend/           # React + Vite app (src/api, components, contexts, pages)
├── deploy/             # deploy.sh, setup-iap.sh, utils.sh, Kubernetes manifests
├── docker/initdb/      # Local PostgreSQL init (test database)
├── tests/              # API tests (pytest + PostgreSQL)
├── tests_e2e/          # Opt-in smoke tests for a running deployment
├── Dockerfile.backend
├── Dockerfile.frontend # Production frontend: build + nginx
├── nginx.conf
├── docker-compose.yml
├── start.sh
├── requirements.txt
└── requirements-dev.txt
```

---

## License

[Apache License 2.0](LICENSE)
