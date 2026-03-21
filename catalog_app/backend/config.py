from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://catalog:catalog@localhost:5432/ds_catalog"
    gcp_project_id: str = ""
    bq_secret_name: str = ""        # Secret Manager secret name for the BQ service account key
    secret_key: str = "dev-secret-key-change-in-prod"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    # Google OAuth2
    google_client_id: str = ""
    google_client_secret: str = ""
    # JWT
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    class Config:
        env_file = ".env"


settings = Settings()
