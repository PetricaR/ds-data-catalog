import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR, UUID
from sqlalchemy.orm import relationship

from ..database import Base


def utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String(255), unique=True, nullable=False, index=True)
    name = Column(String(255))
    picture = Column(String(500))
    role = Column(String(50), nullable=False, default="viewer")  # viewer | editor | admin
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    last_login = Column(DateTime(timezone=True))


class Dataset(Base):
    __tablename__ = "datasets"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(String(255), nullable=False, index=True)
    dataset_id = Column(String(255), nullable=False)
    display_name = Column(String(500))
    description = Column(Text)
    owner = Column(String(255))
    data_steward = Column(String(255))
    tags = Column(ARRAY(String), default=list)
    sensitivity_label = Column(String(50), default="internal")
    bq_location = Column(String(50))
    bq_created_at = Column(DateTime(timezone=True))
    bq_last_modified = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    is_validated = Column(Boolean, default=False, nullable=False, server_default="false")
    validated_by = Column(String(255))
    validated_at = Column(DateTime(timezone=True))
    used_in_projects = Column(JSONB, default=list, nullable=False, server_default="[]")
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    search_vector = Column(TSVECTOR)

    tables = relationship("Table", back_populates="dataset", cascade="all, delete-orphan")

    __table_args__ = (
        Index("ix_datasets_project_dataset", "project_id", "dataset_id", unique=True),
        Index("ix_datasets_search_vector", "search_vector", postgresql_using="gin"),
    )


class Table(Base):
    __tablename__ = "tables"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    dataset_id = Column(UUID(as_uuid=True), ForeignKey("datasets.id"), nullable=False, index=True)
    table_id = Column(String(255), nullable=False)
    display_name = Column(String(500))
    description = Column(Text)
    owner = Column(String(255))
    tags = Column(ARRAY(String), default=list)
    sensitivity_label = Column(String(50), default="internal")
    row_count = Column(BigInteger)
    size_bytes = Column(BigInteger)
    bq_created_at = Column(DateTime(timezone=True))
    bq_last_modified = Column(DateTime(timezone=True))
    is_active = Column(Boolean, default=True)
    is_validated = Column(Boolean, default=False, nullable=False, server_default="false")
    validated_by = Column(String(255))
    validated_at = Column(DateTime(timezone=True))
    example_queries = Column(JSONB, default=list, server_default="[]")
    validated_columns = Column(JSONB, default=list, server_default="[]")
    upstream_refs = Column(JSONB, default=list, nullable=False, server_default="[]")
    downstream_refs = Column(JSONB, default=list, nullable=False, server_default="[]")
    quality_score = Column(Float, nullable=True)
    used_in_projects = Column(JSONB, default=list, nullable=False, server_default="[]")
    insights = Column(JSONB, nullable=True)
    insights_generated_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    search_vector = Column(TSVECTOR)

    dataset = relationship("Dataset", back_populates="tables")
    columns = relationship(
        "TableColumn",
        back_populates="table",
        cascade="all, delete-orphan",
        order_by="TableColumn.position",
    )

    __table_args__ = (
        Index("ix_tables_dataset_table", "dataset_id", "table_id", unique=True),
        Index("ix_tables_search_vector", "search_vector", postgresql_using="gin"),
    )


class TableColumn(Base):
    __tablename__ = "table_columns"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    data_type = Column(String(100))
    description = Column(Text)
    is_nullable = Column(Boolean, default=True)
    is_primary_key = Column(Boolean, default=False)
    position = Column(Integer, default=0)
    is_pii = Column(Boolean, default=False, nullable=False)
    approx_count_distinct = Column(BigInteger, nullable=True)
    null_pct = Column(Float, nullable=True)
    min_val = Column(String(255), nullable=True)
    max_val = Column(String(255), nullable=True)
    last_stats_at = Column(DateTime(timezone=True), nullable=True)

    table = relationship("Table", back_populates="columns")


class SchemaChange(Base):
    __tablename__ = "schema_changes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    table_id = Column(UUID(as_uuid=True), ForeignKey("tables.id"), nullable=False, index=True)
    change_type = Column(String(50), nullable=False)  # "column_added" | "column_removed"
    column_name = Column(String(255), nullable=False)
    detected_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    is_acknowledged = Column(Boolean, default=False, nullable=False)

    table = relationship("Table")


class MetadataChangeLog(Base):
    __tablename__ = "metadata_change_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    entity_type = Column(String(50), nullable=False)  # "dataset" | "table"
    entity_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    entity_name = Column(String(255))
    field_changed = Column(String(100))
    old_value = Column(Text)
    new_value = Column(Text)
    changed_by = Column(String(255))  # email or "system"
    changed_at = Column(DateTime(timezone=True), default=utcnow)
    data_steward = Column(String(255))  # steward at time of change
    is_notified = Column(Boolean, default=False)
