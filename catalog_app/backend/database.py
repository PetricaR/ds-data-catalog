from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import declarative_base, sessionmaker

from .config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from . import models  # noqa: F401 — registers all models with Base

    Base.metadata.create_all(bind=engine)

    # Idempotent migrations for new columns added after initial schema creation
    with engine.connect() as conn:
        for ddl in [
            "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS is_validated BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS validated_by VARCHAR(255)",
            "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS is_validated BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS validated_by VARCHAR(255)",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS example_queries JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS validated_columns JSONB NOT NULL DEFAULT '[]'",
            """CREATE TABLE IF NOT EXISTS schema_changes (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                table_id UUID NOT NULL REFERENCES tables(id),
                change_type VARCHAR(50) NOT NULL,
                column_name VARCHAR(255) NOT NULL,
                detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                is_acknowledged BOOLEAN NOT NULL DEFAULT FALSE
            )""",
            "CREATE INDEX IF NOT EXISTS ix_schema_changes_table_id ON schema_changes(table_id)",
            "CREATE INDEX IF NOT EXISTS ix_schema_changes_acknowledged ON schema_changes(is_acknowledged)",
            # ── New columns: table_columns ─────────────────────────────────
            "ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS is_pii BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS approx_count_distinct BIGINT",
            "ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS null_pct FLOAT",
            "ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS min_val VARCHAR(255)",
            "ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS max_val VARCHAR(255)",
            "ALTER TABLE table_columns ADD COLUMN IF NOT EXISTS last_stats_at TIMESTAMPTZ",
            # ── New columns: tables ────────────────────────────────────────
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS upstream_refs JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS downstream_refs JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS quality_score FLOAT",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS used_in_projects JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE datasets ADD COLUMN IF NOT EXISTS used_in_projects JSONB NOT NULL DEFAULT '[]'",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS insights JSONB",
            "ALTER TABLE tables ADD COLUMN IF NOT EXISTS insights_generated_at TIMESTAMPTZ",
            # ── New tables ─────────────────────────────────────────────────
            """CREATE TABLE IF NOT EXISTS users (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                email VARCHAR(255) UNIQUE NOT NULL,
                name VARCHAR(255),
                picture VARCHAR(500),
                role VARCHAR(50) NOT NULL DEFAULT 'viewer',
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                last_login TIMESTAMPTZ
            )""",
            "CREATE INDEX IF NOT EXISTS ix_users_email ON users(email)",
            """CREATE TABLE IF NOT EXISTS metadata_change_log (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                entity_type VARCHAR(50) NOT NULL,
                entity_id UUID NOT NULL,
                entity_name VARCHAR(255),
                field_changed VARCHAR(100),
                old_value TEXT,
                new_value TEXT,
                changed_by VARCHAR(255),
                changed_at TIMESTAMPTZ DEFAULT NOW(),
                data_steward VARCHAR(255),
                is_notified BOOLEAN NOT NULL DEFAULT FALSE
            )""",
            "CREATE INDEX IF NOT EXISTS ix_metadata_change_log_entity_id ON metadata_change_log(entity_id)",
            # ── GCP Sources ────────────────────────────────────────────────
            """CREATE TABLE IF NOT EXISTS gcp_sources (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                project_id VARCHAR(255) UNIQUE NOT NULL,
                display_name VARCHAR(255),
                secret_name VARCHAR(255),
                is_active BOOLEAN NOT NULL DEFAULT TRUE,
                last_synced_at TIMESTAMPTZ,
                last_sync_status VARCHAR(50),
                last_sync_summary JSONB,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                created_by VARCHAR(255)
            )""",
            "CREATE INDEX IF NOT EXISTS ix_gcp_sources_project_id ON gcp_sources(project_id)",
        ]:
            conn.execute(text(ddl))
        conn.commit()

    # PostgreSQL triggers to keep search_vector columns up to date
    with engine.connect() as conn:
        conn.execute(text("""
            CREATE OR REPLACE FUNCTION update_dataset_search_vector()
            RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', coalesce(NEW.dataset_id, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.display_name, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.owner, '')), 'C') ||
                    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        """))

        conn.execute(text("""
            DROP TRIGGER IF EXISTS tsvector_update_datasets ON datasets;
            CREATE TRIGGER tsvector_update_datasets
            BEFORE INSERT OR UPDATE ON datasets
            FOR EACH ROW EXECUTE FUNCTION update_dataset_search_vector();
        """))

        conn.execute(text("""
            CREATE OR REPLACE FUNCTION update_table_search_vector()
            RETURNS trigger AS $$
            BEGIN
                NEW.search_vector :=
                    setweight(to_tsvector('english', coalesce(NEW.table_id, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.display_name, '')), 'A') ||
                    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
                    setweight(to_tsvector('english', coalesce(NEW.owner, '')), 'C') ||
                    setweight(to_tsvector('english', coalesce(array_to_string(NEW.tags, ' '), '')), 'B');
                RETURN NEW;
            END
            $$ LANGUAGE plpgsql;
        """))

        conn.execute(text("""
            DROP TRIGGER IF EXISTS tsvector_update_tables ON tables;
            CREATE TRIGGER tsvector_update_tables
            BEFORE INSERT OR UPDATE ON tables
            FOR EACH ROW EXECUTE FUNCTION update_table_search_vector();
        """))

        conn.commit()
