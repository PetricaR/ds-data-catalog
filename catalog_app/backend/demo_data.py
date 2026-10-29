"""
Fill an empty catalog with a made-up retail company's datasets and tables, so local development
(LOCAL_MODE) has something to browse without connecting BigQuery. A catalog that already holds datasets
is left alone. Run it from catalog_app/:

    python -m backend.demo_data

The project is fictional: BigQuery features (preview, quality checks, scans, lineage discovery) still call
Google with the backend's credentials and fail on these tables.
"""
from datetime import datetime, timedelta, timezone

from .api.tables import _compute_quality_score
from .database import SessionLocal, init_db
from .models.catalog import Dataset, MetadataChangeLog, SchemaChange, Table, TableColumn

PROJECT = "demo-retail-analytics"
STEWARD = "ana.popescu@example.com"
DATA_ENG = "data-engineering@example.com"

# Each table: (table_id, display_name, description, tags, sensitivity, row_count, size_bytes, columns, extras).
# A column is (name, type, description); the first column is the primary key. Extras set the rest.
DATASETS = [
    {
        "dataset_id": "sales",
        "display_name": "Sales",
        "description": "Orders, order lines and returns from the web shop and the stores, loaded nightly from the ERP.",
        "owner": DATA_ENG,
        "tags": ["sales", "finance", "daily"],
        "sensitivity_label": "internal",
        "validated": True,
        "tables": [
            ("orders", "Orders", "One row per order, web and in-store. Cancelled orders stay, with status 'cancelled'.",
             ["sales", "gold"], "internal", 12_480_311, 2_310_000_000, [
                 ("order_id", "STRING", "Order number from the ERP"),
                 ("customer_id", "STRING", "Customer who placed the order; null for anonymous store sales"),
                 ("store_id", "STRING", "Store that fulfilled the order; 'WEB' for online orders"),
                 ("order_ts", "TIMESTAMP", "When the order was placed (UTC)"),
                 ("channel", "STRING", "web, app or store"),
                 ("status", "STRING", "placed, shipped, delivered or cancelled"),
                 ("total_amount", "NUMERIC", "Order total including VAT, after discounts"),
                 ("currency", "STRING", "ISO 4217 currency code"),
             ], {
                 "validated": True,
                 "example_queries": [{
                     "title": "Revenue by channel, last 30 days",
                     "sql": f"SELECT channel, SUM(total_amount) AS revenue\nFROM `{PROJECT}.sales.orders`\n"
                            "WHERE order_ts >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)\n"
                            "  AND status != 'cancelled'\nGROUP BY channel\nORDER BY revenue DESC",
                 }],
                 "downstream_refs": ["marketing.customer_ltv"],
             }),
            ("order_lines", "Order lines", "One row per product in an order.",
             ["sales"], "internal", 41_902_554, 5_120_000_000, [
                 ("order_line_id", "STRING", "Order number and line number, e.g. 'SO-1042-3'"),
                 ("order_id", "STRING", "Order the line belongs to"),
                 ("product_id", "STRING", "Product sold"),
                 ("quantity", "INT64", "Units sold"),
                 ("unit_price", "NUMERIC", "Price per unit including VAT, before discounts"),
                 ("discount_amount", "NUMERIC", None),
             ], {"downstream_refs": ["marketing.customer_ltv"]}),
            ("returns", "Returns", None,
             [], "internal", 380_214, 41_000_000, [
                 ("return_id", "STRING", None),
                 ("order_id", "STRING", "Order the returned items came from"),
                 ("returned_at", "TIMESTAMP", None),
                 ("refund_amount", "NUMERIC", None),
                 ("refund_reason", "STRING", None),
             ], {"schema_change": "refund_reason"}),
        ],
    },
    {
        "dataset_id": "customers",
        "display_name": "Customers",
        "description": "Customer accounts and loyalty membership from the CRM. Holds personal data: ask the "
                       "data steward before using it outside the CRM team.",
        "owner": "crm-team@example.com",
        "tags": ["crm", "pii"],
        "sensitivity_label": "confidential",
        "tables": [
            ("customers", "Customers", "One row per customer account, with contact details and loyalty tier.",
             ["crm", "pii"], "restricted", 1_204_877, 310_000_000, [
                 ("customer_id", "STRING", "Customer account ID"),
                 ("email", "STRING", "Login and contact email"),
                 ("phone", "STRING", "Mobile number, E.164 format"),
                 ("city", "STRING", "City of the default delivery address"),
                 ("country", "STRING", "ISO 3166-1 alpha-2 country code"),
                 ("signup_date", "DATE", "When the account was created"),
                 ("loyalty_tier", "STRING", "none, silver or gold"),
             ], {
                 "pii": {"email", "phone"},
                 "downstream_refs": ["marketing.customer_ltv"],
                 "change_log": ("sensitivity_label", "confidential", "restricted"),
             }),
            ("customer_segments", "Customer segments", "Weekly RFM segment for every active customer.",
             ["crm", "segmentation"], "confidential", 980_400, 64_000_000, [
                 ("customer_id", "STRING", "Customer account ID"),
                 ("week", "DATE", "Monday of the week the segment was computed"),
                 ("segment", "STRING", "champions, loyal, at_risk, hibernating or new"),
             ], {}),
        ],
    },
    {
        "dataset_id": "marketing",
        "display_name": "Marketing",
        "description": "Campaign performance and customer value models used by the marketing and data-science teams.",
        "owner": "marketing-analytics@example.com",
        "tags": ["marketing", "data-science"],
        "sensitivity_label": "internal",
        "tables": [
            ("campaigns", "Campaigns", "Email and paid-media campaigns with their spend.",
             ["marketing"], "internal", 1_842, 410_000, [
                 ("campaign_id", "STRING", "Campaign ID from the marketing platform"),
                 ("name", "STRING", "Campaign name"),
                 ("channel", "STRING", "email, search, social or display"),
                 ("start_date", "DATE", None),
                 ("spend_eur", "NUMERIC", "Total spend in EUR"),
             ], {}),
            ("customer_ltv", "Customer lifetime value", "Predicted 12-month revenue per customer, refreshed weekly "
             "by the LTV model.",
             ["marketing", "data-science", "model-output"], "confidential", 1_120_330, 98_000_000, [
                 ("customer_id", "STRING", "Customer account ID"),
                 ("predicted_ltv_eur", "NUMERIC", "Predicted revenue over the next 12 months, in EUR"),
                 ("churn_probability", "FLOAT64", "Probability the customer places no order in 90 days"),
                 ("scored_at", "TIMESTAMP", "When the model scored the customer"),
             ], {
                 "validated": True,
                 "upstream_refs": ["sales.orders", "sales.order_lines", "customers.customers"],
                 "used_in_projects": [{"project_name": "Churn model", "jira_id": "DS-142",
                                       "repo_url": "https://github.com/example/churn-model"}],
             }),
        ],
    },
    {
        "dataset_id": "reference",
        "display_name": "Reference data",
        "description": "Stores and the product catalogue. Safe to join from anywhere.",
        "owner": DATA_ENG,
        "tags": ["reference"],
        "sensitivity_label": "public",
        "tables": [
            ("stores", "Stores", "Every store, open or closed, plus the web shop as store 'WEB'.",
             ["reference"], "public", 214, 52_000, [
                 ("store_id", "STRING", "Store code"),
                 ("name", "STRING", "Store name"),
                 ("city", "STRING", "City"),
                 ("opened_on", "DATE", "Opening date"),
                 ("closed_on", "DATE", "Closing date; null while open"),
             ], {"validated": True}),
            ("products", "Products", "The product catalogue with the current category tree.",
             ["reference"], "public", 58_230, 12_400_000, [
                 ("product_id", "STRING", "SKU"),
                 ("name", "STRING", "Product name"),
                 ("category", "STRING", "Top-level category"),
                 ("subcategory", "STRING", None),
                 ("list_price", "NUMERIC", "Current list price including VAT"),
             ], {}),
        ],
    },
]


def seed(db) -> bool:
    """Add the demo datasets. Returns False, changing nothing, if the catalog already has datasets."""
    if db.query(Dataset).count():
        return False
    now = datetime.now(timezone.utc)
    validated = {"is_validated": True, "validated_by": STEWARD, "validated_at": now - timedelta(days=12)}
    for ds_spec in DATASETS:
        ds = Dataset(
            project_id=PROJECT,
            bq_location="EU",
            data_steward=STEWARD,
            bq_created_at=now - timedelta(days=700),
            bq_last_modified=now - timedelta(hours=6),
            **{k: v for k, v in ds_spec.items() if k not in ("tables", "validated")},
            **(validated if ds_spec.get("validated") else {}),
        )
        db.add(ds)
        for table_id, name, description, tags, label, rows, size, columns, extras in ds_spec["tables"]:
            pii = extras.get("pii", set())
            table = Table(
                dataset=ds,
                table_id=table_id,
                display_name=name,
                description=description,
                owner=ds_spec["owner"],
                tags=tags,
                sensitivity_label=label,
                row_count=rows,
                size_bytes=size,
                bq_created_at=now - timedelta(days=400),
                bq_last_modified=now - timedelta(hours=6),
                example_queries=extras.get("example_queries", []),
                upstream_refs=[f"{PROJECT}.{ref}" for ref in extras.get("upstream_refs", [])],
                downstream_refs=[f"{PROJECT}.{ref}" for ref in extras.get("downstream_refs", [])],
                used_in_projects=extras.get("used_in_projects", []),
                columns=[
                    TableColumn(name=col, data_type=data_type, description=col_description, position=i,
                                is_primary_key=i == 0, is_nullable=i != 0, is_pii=col in pii)
                    for i, (col, data_type, col_description) in enumerate(columns)
                ],
            )
            if extras.get("validated"):
                for key, value in validated.items():
                    setattr(table, key, value)
                table.validated_columns = [c[0] for c in columns]
            table.quality_score = _compute_quality_score(table)
            db.add(table)
            if extras.get("schema_change"):
                db.add(SchemaChange(table=table, change_type="column_added", column_name=extras["schema_change"],
                                    detected_at=now - timedelta(days=2)))
            if extras.get("change_log"):
                field, old_value, new_value = extras["change_log"]
                db.flush()  # assigns table.id
                db.add(MetadataChangeLog(
                    entity_type="table", entity_id=table.id, entity_name=name, field_changed=field,
                    old_value=old_value, new_value=new_value, changed_by=STEWARD,
                    changed_at=now - timedelta(days=1), data_steward=STEWARD,
                ))
    db.commit()
    return True


if __name__ == "__main__":
    init_db()
    with SessionLocal() as db:
        if seed(db):
            print(f"Added {len(DATASETS)} demo datasets in project {PROJECT}.")
        else:
            print("The catalog already has datasets; demo data not added.")
