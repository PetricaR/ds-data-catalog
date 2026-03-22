"""
Google Cloud Data Lineage integration — REST API implementation.

Uses the Cloud Data Lineage REST API (datalineage.googleapis.com) directly
via `requests` + `google-auth`, so no extra package is required beyond what
is already installed.

Prerequisites on GCP:
  - Data Lineage API enabled  (datalineage.googleapis.com)
  - BigQuery automatic lineage tracking active (via Dataplex, or auto-captured
    for supported BQ job types such as COPY, QUERY, EXPORT)
"""

import logging
from typing import Optional

import google.auth
import google.auth.transport.requests
import requests as http_requests

logger = logging.getLogger(__name__)

_LINEAGE_BASE = "https://datalineage.googleapis.com/v1"
_CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _normalize_location(location: Optional[str]) -> str:
    """Normalise BQ location to a Data Lineage API location string."""
    if not location:
        return "us"
    loc = location.lower()
    # Multi-region shorthands accepted by the API
    if loc in ("us", "eu"):
        return loc
    # e.g. "US" → "us", "EU" → "eu", "us-central1" stays as-is
    return loc


def _table_fqn(project_id: str, dataset_id: str, table_id: str) -> str:
    """
    Build the EntityReference fullyQualifiedName for a BigQuery table.
    Correct format per Data Lineage REST API docs:
      bigquery:{projectId}.{datasetId}.{tableId}
    """
    return f"bigquery:{project_id}.{dataset_id}.{table_id}"


def _fqn_to_ref(fqn: str) -> Optional[str]:
    """
    Convert a Data Lineage API fullyQualifiedName to a dotted ref string.
      bigquery:project.dataset.table  →  project.dataset.table
    Non-BigQuery FQNs are returned as-is.
    """
    if fqn.startswith("bigquery:"):
        return fqn[len("bigquery:"):]
    return fqn


def _get_token(project_id: str, secret_name: Optional[str]) -> str:
    """Return a valid Bearer token using SA key from Secret Manager or ADC."""
    if secret_name:
        # Load SA key from Secret Manager and create credentials with full scope
        from google.cloud import secretmanager
        from google.oauth2 import service_account
        import json

        sm = secretmanager.SecretManagerServiceClient()
        path = f"projects/{project_id}/secrets/{secret_name}/versions/latest"
        response = sm.access_secret_version(request={"name": path})
        key_dict = json.loads(response.payload.data.decode("utf-8"))
        creds = service_account.Credentials.from_service_account_info(
            key_dict,
            scopes=[_CLOUD_PLATFORM_SCOPE],
        )
    else:
        creds, _ = google.auth.default(scopes=[_CLOUD_PLATFORM_SCOPE])

    auth_req = google.auth.transport.requests.Request()
    creds.refresh(auth_req)
    return creds.token


def _search_links(token: str, parent: str, payload: dict) -> list[dict]:
    """POST …:searchLinks and return the list of Link objects (handles pagination)."""
    url = f"{_LINEAGE_BASE}/{parent}:searchLinks"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    links: list[dict] = []
    page_token = None

    while True:
        body = {**payload, "pageSize": 100}
        if page_token:
            body["pageToken"] = page_token

        resp = http_requests.post(url, headers=headers, json=body, timeout=30)
        if not resp.ok:
            logger.warning("searchLinks %s → %s: %s", payload, resp.status_code, resp.text)
            resp.raise_for_status()

        data = resp.json()
        links.extend(data.get("links", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break

    return links


# ── Public API ────────────────────────────────────────────────────────────────

def discover(
    project_id: str,
    dataset_id: str,
    table_id: str,
    location: Optional[str],
    secret_name: Optional[str],
) -> dict:
    """
    Query the Cloud Data Lineage API for upstream/downstream links of a BQ table.

    Returns {"upstream_refs": [...], "downstream_refs": [...]}
    Raises an exception (propagated to the caller as HTTP 502) on API errors.
    """
    token = _get_token(project_id, secret_name)
    fqn = _table_fqn(project_id, dataset_id, table_id)
    parent = f"projects/{project_id}/locations/{_normalize_location(location)}"

    upstream_refs: list[str] = []
    downstream_refs: list[str] = []

    # Links where this table is the target → sources are upstream
    for link in _search_links(token, parent, {"target": {"fullyQualifiedName": fqn}}):
        ref = _fqn_to_ref(link.get("source", {}).get("fullyQualifiedName", ""))
        if ref and ref not in upstream_refs:
            upstream_refs.append(ref)

    # Links where this table is the source → targets are downstream
    for link in _search_links(token, parent, {"source": {"fullyQualifiedName": fqn}}):
        ref = _fqn_to_ref(link.get("target", {}).get("fullyQualifiedName", ""))
        if ref and ref not in downstream_refs:
            downstream_refs.append(ref)

    logger.info(
        "Lineage for %s.%s.%s @ %s: %d upstream, %d downstream",
        project_id, dataset_id, table_id, location,
        len(upstream_refs), len(downstream_refs),
    )
    return {"upstream_refs": upstream_refs, "downstream_refs": downstream_refs}
