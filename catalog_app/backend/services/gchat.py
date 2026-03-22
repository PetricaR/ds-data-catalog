"""
Google Chat notifications — cards v2 format.

Uses the Google Chat REST API (chat.googleapis.com) via webhook.
Cards v2 (cardsV2) provide richer layouts: decorated text, columns, chips, etc.

The webhook accepts both the legacy `cards` format and the newer `cardsV2`.
We use `cardsV2` here for richer presentation.
"""
import logging
from typing import Optional

import httpx

from ..config import settings

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _send(payload: dict) -> None:
    """POST payload to the configured webhook URL. Best-effort — never raises."""
    url = settings.google_chat_webhook_url
    if not url:
        return
    try:
        resp = httpx.post(url, json=payload, timeout=5)
        if resp.status_code != 200:
            logger.warning("Google Chat webhook returned %s: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Google Chat webhook failed: %s", exc)


def _button(text: str, url: str) -> dict:
    return {
        "buttonList": {
            "buttons": [{
                "text": text,
                "onClick": {"openLink": {"url": url}},
            }]
        }
    }


def _decorated(label: str, value: str, icon: Optional[str] = None) -> dict:
    widget: dict = {
        "decoratedText": {
            "topLabel": label,
            "text": value,
        }
    }
    if icon:
        widget["decoratedText"]["startIcon"] = {"knownIcon": icon}
    return widget


def _card(card_id: str, header: dict, sections: list[dict]) -> dict:
    return {
        "cardsV2": [{
            "cardId": card_id,
            "card": {
                "header": header,
                "sections": sections,
            },
        }]
    }


# ── Public API ────────────────────────────────────────────────────────────────

def notify_trusted(
    table_name: str,
    table_bq_path: str,
    validated_by: str,
    validated_columns: list[str],
    frontend_url: Optional[str] = None,
    table_id: Optional[str] = None,
    project_id: Optional[str] = None,
    dataset_name: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    """Notify when a table is marked as a trusted source."""
    link = (
        f"{frontend_url}/datasets/{dataset_id}/tables/{table_id}"
        if frontend_url and dataset_id and table_id
        else table_bq_path
    )
    cols_text = (
        f"{len(validated_columns)} col(s): {', '.join(validated_columns[:5])}"
        + (" …" if len(validated_columns) > 5 else "")
        if validated_columns
        else "No specific columns"
    )

    widgets = [
        _decorated("Table", table_name, "BOOKMARK"),
        _decorated("BigQuery path", table_bq_path, "DATABASE"),
        _decorated("Validated by", validated_by, "PERSON"),
        _decorated("Columns validated", cols_text, "DESCRIPTION"),
    ]
    if project_id:
        widgets.insert(1, _decorated("Project", project_id, "BOOKMARK"))
    if dataset_name:
        widgets.insert(2, _decorated("Dataset", dataset_name, "FOLDER"))
    widgets.append(_button("Open in Light Data Catalog", link))

    _send(_card(
        card_id="trusted",
        header={
            "title": "✅ Table marked as Trusted Source",
            "subtitle": table_bq_path,
            "imageUrl": "https://fonts.gstatic.com/s/i/googlematerialicons/verified/v6/googlematerialicons-verified-24px.svg",
            "imageType": "CIRCLE",
        },
        sections=[{"widgets": widgets}],
    ))


def notify_revoked(
    table_name: str,
    table_bq_path: str,
    revoked_by: Optional[str] = None,
    frontend_url: Optional[str] = None,
    table_id: Optional[str] = None,
    project_id: Optional[str] = None,
    dataset_name: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    """Notify when a table's trusted source status is revoked."""
    link = (
        f"{frontend_url}/datasets/{dataset_id}/tables/{table_id}"
        if frontend_url and dataset_id and table_id
        else table_bq_path
    )

    widgets = [
        _decorated("Table", table_name, "BOOKMARK"),
        _decorated("BigQuery path", table_bq_path, "DATABASE"),
        _decorated("Revoked by", revoked_by or "unknown", "PERSON"),
    ]
    if project_id:
        widgets.insert(1, _decorated("Project", project_id, "BOOKMARK"))
    if dataset_name:
        widgets.insert(2, _decorated("Dataset", dataset_name, "FOLDER"))
    widgets.append(_button("Open in Light Data Catalog", link))

    _send(_card(
        card_id="revoked",
        header={
            "title": "⚠️ Trusted Source status revoked",
            "subtitle": table_bq_path,
        },
        sections=[{"widgets": widgets}],
    ))


def notify_metadata_change(
    entity_type: str,
    entity_name: str,
    field: str,
    old_value: Optional[str],
    new_value: Optional[str],
    changed_by: str,
    data_steward: Optional[str] = None,
    frontend_url: Optional[str] = None,
    entity_id: Optional[str] = None,
) -> None:
    """Notify when a metadata field changes on a dataset or table."""
    path = (
        f"{frontend_url}/datasets/{entity_id}"
        if frontend_url and entity_id and entity_type == "dataset"
        else (f"{frontend_url}/datasets/-/tables/{entity_id}" if frontend_url and entity_id else "")
    )

    widgets = [
        _decorated("Entity", entity_name, "BOOKMARK"),
        _decorated("Field changed", field, "EDIT"),
        _decorated("Old value", old_value or "—", "DESCRIPTION"),
        _decorated("New value", new_value or "—", "DESCRIPTION"),
        _decorated("Changed by", changed_by, "PERSON"),
    ]
    if data_steward:
        widgets.append(_decorated("Data steward", data_steward, "PERSON"))
    if path:
        widgets.append(_button("Open in Light Data Catalog", path))

    _send(_card(
        card_id="metadata_change",
        header={
            "title": f"📝 Metadata changed on {entity_type}",
            "subtitle": entity_name,
        },
        sections=[{"widgets": widgets}],
    ))


def notify_pii_detected(
    table_name: str,
    table_bq_path: str,
    pii_columns: dict[str, list[str]],
    frontend_url: Optional[str] = None,
    table_id: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    """Notify when DLP scan detects PII in a table."""
    link = (
        f"{frontend_url}/datasets/{dataset_id}/tables/{table_id}"
        if frontend_url and dataset_id and table_id
        else table_bq_path
    )
    cols_summary = "\n".join(
        f"{col}: {', '.join(types[:3])}" for col, types in list(pii_columns.items())[:8]
    )

    widgets = [
        _decorated("Table", table_name, "BOOKMARK"),
        _decorated("BigQuery path", table_bq_path, "DATABASE"),
        _decorated("Columns with PII", str(len(pii_columns)), "DESCRIPTION"),
        {"textParagraph": {"text": f"<b>Detected PII:</b>\n{cols_summary}"}},
        _button("Review in Light Data Catalog", link),
    ]

    _send(_card(
        card_id="pii_detected",
        header={
            "title": "🔒 PII Detected in Table",
            "subtitle": table_bq_path,
        },
        sections=[{"widgets": widgets}],
    ))


def notify_quality_score(
    table_name: str,
    table_bq_path: str,
    score: Optional[float],
    passed: bool,
    dimensions: list[dict],
    frontend_url: Optional[str] = None,
    table_id: Optional[str] = None,
    dataset_id: Optional[str] = None,
) -> None:
    """Notify when a Dataplex quality scan completes."""
    link = (
        f"{frontend_url}/datasets/{dataset_id}/tables/{table_id}"
        if frontend_url and dataset_id and table_id
        else table_bq_path
    )
    status_icon = "✅" if passed else "❌"
    score_str = f"{score:.1f}%" if score is not None else "N/A"
    dims_text = "  |  ".join(
        f"{d['dimension']}: {d.get('score', 'N/A')}%" for d in dimensions[:4]
    )

    widgets = [
        _decorated("Table", table_name, "BOOKMARK"),
        _decorated("Overall score", score_str, "STAR"),
        _decorated("Result", f"{status_icon} {'Passed' if passed else 'Failed'}", "DESCRIPTION"),
    ]
    if dims_text:
        widgets.append({"textParagraph": {"text": f"<b>Dimensions:</b> {dims_text}"}})
    widgets.append(_button("View Quality Report", link))

    _send(_card(
        card_id="quality_score",
        header={
            "title": f"{'✅' if passed else '❌'} Dataplex Quality Scan: {score_str}",
            "subtitle": table_bq_path,
        },
        sections=[{"widgets": widgets}],
    ))
