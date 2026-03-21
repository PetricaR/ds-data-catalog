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

    model_config = {"from_attributes": True}


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
    created_at: datetime
    updated_at: datetime
    table_count: int = 0

    model_config = {"from_attributes": True}


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


class TableResponse(TableBase):
    id: UUID
    row_count: Optional[int] = None
    size_bytes: Optional[int] = None
    is_active: bool
    is_validated: bool = False
    validated_by: Optional[str] = None
    validated_at: Optional[datetime] = None
    example_queries: list[ExampleQuery] = []
    created_at: datetime
    updated_at: datetime
    columns: list[ColumnResponse] = []
    dataset_project_id: Optional[str] = None
    dataset_display_name: Optional[str] = None

    model_config = {"from_attributes": True}


# ── Search ────────────────────────────────────────────────────────────────────

class SearchResult(BaseModel):
    entity_type: str  # "dataset" | "table"
    id: UUID
    name: str
    description: Optional[str] = None
    project_id: str
    dataset_id: str
    table_id: Optional[str] = None
    tags: list[str] = []
    sensitivity_label: str
    updated_at: datetime


class SearchResponse(BaseModel):
    query: str
    total: int
    results: list[SearchResult]


# ── Example Query ─────────────────────────────────────────────────────────────

class ExampleQuery(BaseModel):
    title: str
    sql: str


# ── Column update ─────────────────────────────────────────────────────────────

class ColumnUpdate(BaseModel):
    id: UUID
    description: Optional[str] = None
    is_primary_key: Optional[bool] = None


# ── Stats ─────────────────────────────────────────────────────────────────────

class CatalogStats(BaseModel):
    total_datasets: int
    total_tables: int
    total_columns: int
    documented_tables: int
    documentation_coverage: float
