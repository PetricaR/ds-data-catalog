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
