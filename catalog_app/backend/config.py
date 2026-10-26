from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROLES = ("viewer", "editor", "admin")

# Placeholder values that have shipped in templates and docs — never accept them as a real secret.
_PLACEHOLDER_SECRETS = {
    "change-me-in-production",
    "CHANGE_ME_IN_PRODUCTION",
    "dev-secret-key-change-in-prod",
    "local-dev-secret",
}
_MIN_SECRET_LENGTH = 32


def _split_csv(value: str) -> set[str]:
    return {item.strip().lower() for item in value.split(",") if item.strip()}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://catalog:catalog@localhost:5432/ds_catalog"
    gcp_project_id: str = ""
    bq_secret_name: str = ""        # Secret Manager secret name for the BQ service account key
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    # Google OAuth2
    google_client_id: str = ""
    google_client_secret: str = ""
    frontend_url: str = "http://localhost:5173"
    google_chat_webhook_url: str = ""  # Google Chat space webhook URL
    gemini_api_key: str = ""           # Gemini API key (leave empty to use Vertex AI / ADC)
    # Access control (comma-separated lists, case-insensitive)
    admin_emails: str = ""             # always allowed to sign in; promoted to admin on sign-in
    allowed_email_domains: str = ""    # e.g. "example.com,example.org"
    allowed_emails: str = ""           # individual addresses outside the allowed domains
    default_role: str = "viewer"       # role given to new users: viewer | editor
    # JWT
    jwt_secret: str = ""               # required — at least 32 random characters
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_is_strong(cls, value: str) -> str:
        if value in _PLACEHOLDER_SECRETS or len(value) < _MIN_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be a random value of at least {_MIN_SECRET_LENGTH} characters "
                "(generate one with `openssl rand -hex 32`)"
            )
        return value

    @field_validator("jwt_algorithm")
    @classmethod
    def _jwt_algorithm_is_hmac(cls, value: str) -> str:
        if value not in ("HS256", "HS384", "HS512"):
            raise ValueError("JWT_ALGORITHM must be one of HS256, HS384, HS512")
        return value

    @field_validator("default_role")
    @classmethod
    def _default_role_is_not_admin(cls, value: str) -> str:
        if value not in ("viewer", "editor"):
            raise ValueError("DEFAULT_ROLE must be 'viewer' or 'editor' (grant admin via ADMIN_EMAILS)")
        return value

    def is_admin_email(self, email: str) -> bool:
        return email.lower() in _split_csv(self.admin_emails)

    def is_email_allowed(self, email: str) -> bool:
        """Sign-in allowlist. With nothing configured, only ADMIN_EMAILS can sign in."""
        email = email.lower()
        if self.is_admin_email(email) or email in _split_csv(self.allowed_emails):
            return True
        domain = email.rsplit("@", 1)[-1]
        return domain in _split_csv(self.allowed_email_domains)


settings = Settings()
