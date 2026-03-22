"""
AI-powered table insights via Google Gemini (google-genai SDK).

Uses either:
  - A Gemini API key  (set GEMINI_API_KEY in .env), or
  - Vertex AI with ADC / the GCP project already configured for BigQuery.

Structured output via response_schema (Pydantic) is used so the model always
returns well-formed JSON — no fragile manual parsing.
"""
import logging
from typing import Optional

from pydantic import BaseModel

logger = logging.getLogger(__name__)

MODEL = "gemini-2.5-flash"


# ── Response schema ────────────────────────────────────────────────────────────

class InsightsSchema(BaseModel):
    questions: list[str]
    observations: list[str]
    use_cases: list[str]


# ── Prompt builder ─────────────────────────────────────────────────────────────

def _build_prompt(
    table_name: str,
    table_bq_path: str,
    description: Optional[str],
    sensitivity_label: str,
    tags: list[str],
    row_count: Optional[int],
    size_bytes: Optional[int],
    columns: list[dict],
    dataset_description: Optional[str],
) -> str:
    col_lines = []
    for c in columns:
        parts = [f"  - {c['name']} ({c.get('data_type', 'UNKNOWN')})"]
        if c.get("description"):
            parts.append(f": {c['description']}")
        extras = []
        if c.get("is_pii"):
            extras.append("PII")
        if c.get("null_pct") is not None:
            extras.append(f"{c['null_pct']:.1f}% null")
        if c.get("approx_count_distinct") is not None:
            extras.append(f"~{c['approx_count_distinct']:,} distinct")
        if c.get("min_val") and c.get("max_val"):
            extras.append(f"range: {c['min_val']} → {c['max_val']}")
        if extras:
            parts.append(f" [{', '.join(extras)}]")
        col_lines.append("".join(parts))

    stats_lines = []
    if row_count is not None:
        stats_lines.append(f"- Rows: {row_count:,}")
    if size_bytes is not None:
        gb = size_bytes / 1e9
        stats_lines.append(f"- Size: {gb:.2f} GB" if gb >= 1 else f"- Size: {size_bytes / 1e6:.1f} MB")
    if sensitivity_label:
        stats_lines.append(f"- Sensitivity: {sensitivity_label}")
    if tags:
        stats_lines.append(f"- Tags: {', '.join(tags)}")

    return f"""You are a senior data analyst helping data scientists understand a BigQuery table.

Table: {table_bq_path}
{"Description: " + description if description else "No description provided."}
{"Dataset context: " + dataset_description if dataset_description else ""}

Table statistics:
{chr(10).join(stats_lines) if stats_lines else "  (no stats available)"}

Columns ({len(columns)} total):
{chr(10).join(col_lines) if col_lines else "  (no column info available)"}

Generate a structured response with:
- questions: 5–7 specific analytical questions a data scientist could answer using this table. \
Each question must be concrete and reference actual column names. \
Examples: "What are the top N <col> by <metric>?", "How has <col> changed over time?"
- observations: 2–4 short factual observations about this table's data profile \
(data quality notes, coverage gaps, PII warnings, schema patterns).
- use_cases: 2–3 concrete DS / ML use cases this table could support."""


# ── Main entry point ───────────────────────────────────────────────────────────

def generate_insights(
    project_id: str,
    table_name: str,
    table_bq_path: str,
    description: Optional[str],
    sensitivity_label: str,
    tags: list[str],
    row_count: Optional[int],
    size_bytes: Optional[int],
    columns: list[dict],
    dataset_description: Optional[str] = None,
    location: str = "us-central1",
) -> dict:
    """
    Call Gemini via google-genai SDK and return structured insights.

    Returns:
        {"questions": [...], "observations": [...], "use_cases": [...]}
    """
    from google import genai
    from google.genai import types

    from ..config import settings

    # Build client: prefer direct API key, fall back to Vertex AI (ADC)
    if settings.gemini_api_key:
        client = genai.Client(api_key=settings.gemini_api_key)
    else:
        client = genai.Client(vertexai=True, project=project_id, location=location)

    prompt = _build_prompt(
        table_name=table_name,
        table_bq_path=table_bq_path,
        description=description,
        sensitivity_label=sensitivity_label,
        tags=tags,
        row_count=row_count,
        size_bytes=size_bytes,
        columns=columns,
        dataset_description=dataset_description,
    )

    try:
        response = client.models.generate_content(
            model=MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema=InsightsSchema,
                thinking_config=types.ThinkingConfig(thinking_budget=0),
                temperature=0.3,
            ),
        )
        result = InsightsSchema.model_validate_json(response.text)
        logger.info("Insights generated for %s (%d Qs)", table_bq_path, len(result.questions))
        return result.model_dump()
    except Exception as exc:
        logger.error("Gemini insights failed for %s: %s", table_bq_path, exc)
        raise RuntimeError(f"Gemini call failed: {exc}") from exc
