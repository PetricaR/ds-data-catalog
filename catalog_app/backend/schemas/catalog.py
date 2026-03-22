from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel


# ── Column ────────────────────────────────────────────────────────────────────

class ColumnBase(BaseModel):
    name: str
    data_type: Optional[str] = None
    description: Optional[str] = None
    is_nullable: bool = True
    is_primary_key: bool = False
    position: int = 0


class ColumnCreate(ColumnBase):
    pass


class ColumnResponse(ColumnBase):
    id: UUID
    is_pii: bool = False
    approx_count_distinct: Optional[int] = None
    null_pct: Optional[float] = None
    min_val: Optional[str] = None
    max_val: Optional[str] = None
    last_stats_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── DS Project Usage ───────────────────────────────────────────────────────────

class ProjectUsage(BaseModel):
    project_name: str
    jira_id: Optional[str] = None
    repo_url: Optional[str] = None


# ── Dataset ───────────────────────────────────────────────────────────────────

class DatasetBase(BaseModel):
    project_id: str
    dataset_id: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    data_steward: Optional[str] = None
    tags: list[str] = []
    sensitivity_label: str = "internal"
    bq_location: Optional[str] = None


class DatasetCreate(DatasetBase):
    pass


class DatasetUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    data_steward: Optional[str] = None
    tags: Optional[list[str]] = None
    sensitivity_label: Optional[str] = None


class DatasetResponse(DatasetBase):
    id: UUID
    is_active: bool
    is_validated: bool = False
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    bq_created_at: Optional[datetime] = None
    bq_last_modified: Optional[datetime] = None
    used_in_projects: list[ProjectUsage] = []
    created_at: datetime
    updated_at: datetime
    table_count: int = 0

    model_config = {"from_attributes": True}


# ── Example Query ─────────────────────────────────────────────────────────────

class ExampleQuery(BaseModel):
    title: str
    sql: str


# ── Table ─────────────────────────────────────────────────────────────────────

class TableBase(BaseModel):
    dataset_id: UUID
    table_id: str
    display_name: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    tags: list[str] = []
    sensitivity_label: str = "internal"


class TableCreate(TableBase):
    columns: list[ColumnCreate] = []


class TableUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    tags: Optional[list[str]] = None
    sensitivity_label: Optional[str] = None
    example_queries: Optional[list[ExampleQuery]] = None


class ValidatePayload(BaseModel):
    validated_by: str = "anonymous"
    validated_columns: list[str] = []


class TableInsights(BaseModel):
    questions: list[str] = []
    observations: list[str] = []
    use_cases: list[str] = []


class TableResponse(TableBase):
    id: UUID
    row_count: Optional[int] = None
    size_bytes: Optional[int] = None
    bq_created_at: Optional[datetime] = None
    bq_last_modified: Optional[datetime] = None
    is_active: bool
    is_validated: bool = False
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    validated_columns: list[str] = []
    example_queries: list[ExampleQuery] = []
    created_at: datetime
    updated_at: datetime
    columns: list[ColumnResponse] = []
    dataset_project_id: Optional[str] = None
    dataset_display_name: Optional[str] = None
    dataset_bq_dataset_id: Optional[str] = None
    upstream_refs: list[str] = []
    downstream_refs: list[str] = []
    quality_score: Optional[float] = None
    used_in_projects: list[ProjectUsage] = []
    insights: Optional[TableInsights] = None
    insights_generated_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Search ────────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    entity_type: str  # "dataset" | "table"
    id: UUID
    name: str
    description: Optional[str] = None
    project_id: str
    dataset_id: str          # BQ dataset string ID
    dataset_uuid: Optional[UUID] = None  # dataset row UUID (needed for table navigation)
    table_id: Optional[str] = None
    tags: list[str] = []
    sensitivity_label: str
    updated_at: datetime


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResult]


# ── Column update ─────────────────────────────────────────────────────────────

class ColumnUpdate(BaseModel):
    id: UUID
    description: Optional[str] = None
    is_primary_key: Optional[bool] = None


# ── Quality Check ─────────────────────────────────────────────────────────────

class QualityCheckColumn(BaseModel):
    name: str
    data_type: Optional[str] = None
    null_count: int
    null_rate: float
    min_value: Optional[str] = None
    max_value: Optional[str] = None


class QualityCheckResult(BaseModel):
    total_rows: int
    columns: list[QualityCheckColumn]
    checked_at: str


# ── Schema Changes ────────────────────────────────────────────────────────────

class SchemaChangeResponse(BaseModel):
    id: UUID
    table_id: UUID
    change_type: str
    column_name: str
    detected_at: datetime
    is_acknowledged: bool
    # Denormalised from joined table + dataset
    table_table_id: str
    table_display_name: Optional[str]
    dataset_uuid: UUID
    dataset_id_str: str
    project_id: str

    model_config = {"from_attributes": True}


# ── Notifications ─────────────────────────────────────────────────────────────

class NotificationResponse(BaseModel):
    id: UUID
    entity_type: str
    entity_id: UUID
    entity_name: Optional[str] = None
    field_changed: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    changed_by: Optional[str] = None
    changed_at: Optional[datetime] = None
    data_steward: Optional[str] = None
    is_notified: bool

    model_config = {"from_attributes": True}


# ── Stats ─────────────────────────────────────────────────────────────────────

class CatalogStats(BaseModel):
    total_datasets: int
    total_tables: int
    total_columns: int
    documented_tables: int
    documentation_coverage: float
