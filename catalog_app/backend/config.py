from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql://catalog:catalog@localhost:5432/ds_catalog"
    gcp_project_id: str = ""
    secret_key: str = "dev-secret-key-change-in-prod"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]

    class Config:
        env_file = ".env"


settings = Settings()
