# Integrations

How each Google Cloud integration works, what it costs you, and what it needs. Setup, security and the API reference are in the [README](../README.md).

Unless a source has its own service-account key, every call below runs as the catalog's service account (`ds-catalog-sa` on GKE, Application Default Credentials locally). The required IAM roles are listed in the README under [IAM roles](../README.md#iam-roles). All BigQuery SQL the backend builds passes through `services/bq_safety.py`, which rejects anything that is not a read-only `SELECT`.

## BigQuery sync — `services/bq_sync.py`

Admins register GCP projects as sources (**GCP Sources** page or `POST /api/v1/bq/sources`) and sync them on demand.

- **What is synced:** every dataset (description, location, created and modified times), every table (description, row count, size, created and modified times) and every column (name, type, mode, description).
- **User edits survive:** re-syncs refresh BigQuery-owned fields (location, row counts, sizes, timestamps, schemas). Descriptions and display names are copied from BigQuery only while the catalog's are empty; owners, tags, sensitivity labels and validations are never overwritten.
- **Schema changes:** columns added or removed since the previous sync create entries under `/api/v1/schema-changes` for an editor to acknowledge.
- **Credentials, in order:** the signed-in admin's Google token, then the source's service-account key from Secret Manager (`secret_name`), then Workload Identity / ADC.

## Data preview — `services/bq_preview.py`

`GET /tables/{id}/preview` dry-runs `SELECT * … TABLESAMPLE SYSTEM (10 PERCENT) LIMIT 100` and returns the bytes it would scan, with an estimated on-demand cost at $6.25/TiB. `POST /tables/{id}/preview/run` runs it and returns up to 100 rows.

## Quality checks and column statistics — `services/bq_quality.py`, `services/bq_stats.py`

- `POST /tables/{id}/quality-check` runs one aggregate query: total rows, null count and rate per column, and min/max for `TIMESTAMP`, `DATE` and `DATETIME` columns.
- `POST /tables/{id}/pull-stats` stores per-column `APPROX_COUNT_DISTINCT`, null % and min/max on the catalog's column records.

## Quality score

Every table has a 0–100 score that measures how well it is documented. It is recomputed whenever the table is edited (`_compute_quality_score` in `api/tables.py`):

| Criterion | Points |
|---|---|
| Table has a description | 30 |
| Column description coverage | up to 30, proportional (5 of 10 columns documented = 15) |
| Table is validated (trusted) | 20 |
| Table has at least one tag | 10 |
| Table has example queries | 10 |

## PII detection — `services/dlp_scan.py`

`POST /tables/{id}/scan-pii` reads up to 500 rows from the table and sends them to Cloud DLP `inspect_content` as a table item. Findings are grouped by column; `is_pii` is set on exactly the columns with findings (and cleared on the others), and a Google Chat alert is sent if any were found.

Info types checked: `EMAIL_ADDRESS`, `PHONE_NUMBER`, `PERSON_NAME`, `DATE_OF_BIRTH`, `CREDIT_CARD_NUMBER`, `IBAN_CODE`, `IP_ADDRESS`, `LOCATION`, `PASSPORT`, `US_SOCIAL_SECURITY_NUMBER`, `US_DRIVERS_LICENSE_NUMBER`, `GENDER`, `AGE`, `ETHNIC_GROUP`.

DLP bills by the volume of content inspected; a scan inspects only the sampled rows.

## Dataplex data quality — `services/dataplex_quality.py`

`POST /tables/{id}/dataplex-quality` creates a Dataplex `DataScan` for the table (reusing it on later runs), starts a run and polls every 10 seconds for up to 5 minutes. The response has the overall score, pass/fail, per-dimension scores and per-rule results, and a Google Chat alert reports the score.

The default scan has one rule, a `COMPLETENESS` table condition `COUNT(*) > 0`. Add rules in `run_quality_scan` to check nulls, uniqueness, ranges or custom SQL.

## Lineage — `services/bq_lineage.py`

- **Manual:** editors set upstream and downstream references (`project.dataset.table`) with `PUT /tables/{id}/lineage`.
- **Discovered:** `GET /tables/{id}/lineage/discover` asks the Cloud Data Lineage API (REST, `datalineage.googleapis.com/v1`) for links to and from the table and merges them with the manual references, without duplicates.

Discovery only finds what Data Lineage has recorded, which requires the API to be enabled and BigQuery lineage capture to be active for the jobs that write the table.

## Schema history — `services/asset_inventory.py`

`GET /tables/{id}/schema-history?days=N` (N ≤ 30) reads the table's snapshots from Cloud Asset Inventory and diffs consecutive schemas. Change types: `COLUMN_ADDED`, `COLUMN_REMOVED`, `COLUMN_TYPE_CHANGED`, `COLUMN_MODE_CHANGED`. Asset Inventory keeps about 35 days of history.

## Usage statistics — `services/bq_usage.py`

`GET /tables/{id}/usage?days=N` (N = 1–90) queries `region-<location>.INFORMATION_SCHEMA.JOBS` in the table's project for completed jobs whose SQL mentions the table:

```json
{
  "total_queries": 142,
  "last_queried_at": "2026-03-21T14:32:00Z",
  "top_users": [{"email": "alice@example.com", "query_count": 89, "avg_bytes": 52428800}],
  "period_days": 30,
  "fetched_at": "2026-03-22T09:00:00Z"
}
```

Only jobs run in the table's own project are visible. The response contains the email addresses of the people who query the table, which is why the endpoint requires the `editor` role.

## AI insights — `services/insights.py`

`POST /tables/{id}/insights` asks `gemini-2.5-flash` for structured JSON: 5–7 analysis questions that reference real column names, 2–4 observations (data quality, coverage gaps, PII warnings) and 2–3 data-science use cases. The result is cached on the table until regenerated.

The prompt contains the table path, description, sensitivity label, tags, row count, size, the dataset description, and for each column its name, type, description, PII flag, null %, approximate distinct count and min/max values. No sampled rows are sent.

Vertex AI is used through the service account by default; set `GEMINI_API_KEY` to call the Gemini API instead.

## Google Chat — `services/gchat.py`

With `GOOGLE_CHAT_WEBHOOK_URL` set (a space's **Apps & integrations → Webhooks** URL), the backend posts Cards v2 messages. Delivery is best-effort: failures are logged and never block the request.

| Event | Sent by |
|---|---|
| Table marked trusted | `PATCH /tables/{id}/validate` |
| Trust revoked | `PATCH /tables/{id}/validate` |
| Metadata changed (description, sensitivity, owner, data steward, tags) | `PUT /tables/{id}`, `PUT /datasets/{id}` |
| PII detected | `POST /tables/{id}/scan-pii` |
| Dataplex quality score | `POST /tables/{id}/dataplex-quality` |
