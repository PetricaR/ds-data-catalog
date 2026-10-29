from urllib.parse import urlparse

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ROLES = ("viewer", "editor", "admin")
_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}

# Placeholder values that have shipped in templates and docs — never accept them as a real secret.
_PLACEHOLDER_SECRETS = {
    "change-me-in-production",
    "CHANGE_ME_IN_PRODUCTION",
    "dev-secret-key-change-in-prod",
    "local-dev-secret",
}
_MIN_SECRET_LENGTH = 32


def split_csv(value: str) -> set[str]:
    return {item.strip().lower() for item in value.split(",") if item.strip()}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql://catalog:catalog@localhost:5432/ds_catalog"
    gcp_project_id: str = ""
    bq_secret_name: str = ""        # Secret Manager secret name for the BQ service account key
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    # Google OAuth2 (leave both empty to enter the client in the setup wizard)
    google_client_id: str = ""
    google_client_secret: str = ""
    frontend_url: str = "http://localhost:5173"
    oauth_check_interval_minutes: int = 360  # how often to ask Google whether the client still works; 0 = never
    log_setup_token: bool = True       # print the setup token at startup; if false, only `python -m backend.setup_token`
    # The settings below can also be entered on the Settings page (services/app_config.py); set here, they win
    google_chat_webhook_url: str = ""  # Google Chat space webhook URL
    gemini_api_key: str = ""           # Gemini API key (leave empty to use Vertex AI / ADC)
    # Access control (comma-separated lists, case-insensitive)
    admin_emails: str = ""             # always allowed to sign in; promoted to admin on sign-in. Environment only
    allowed_email_domains: str = ""    # e.g. "example.com,example.org"
    allowed_emails: str = ""           # individual addresses outside the allowed domains
    default_role: str = ""             # role given to new users: viewer | editor (empty = viewer)
    # JWT
    jwt_secret: str = ""               # required — at least 32 random characters
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7  # 7 days
    # Secrets stored in the database (comma-separated: the first encrypts, all decrypt). Empty = derived from JWT_SECRET
    encryption_key: str = ""
    # Local development: sign in without Google as any email and role (POST /auth/local).
    # Refused unless FRONTEND_URL points at this machine, so a deployment can't switch it on.
    local_mode: bool = False

    @field_validator("jwt_secret")
    @classmethod
    def _jwt_secret_is_strong(cls, value: str) -> str:
        if value in _PLACEHOLDER_SECRETS or len(value) < _MIN_SECRET_LENGTH:
            raise ValueError(
                f"JWT_SECRET must be a random value of at least {_MIN_SECRET_LENGTH} characters "
                "(generate one with `openssl rand -hex 32`)"
            )
        return value

    @field_validator("encryption_key")
    @classmethod
    def _encryption_keys_are_strong(cls, value: str) -> str:
        for key in (k.strip() for k in value.split(",") if k.strip()):
            if key in _PLACEHOLDER_SECRETS or len(key) < _MIN_SECRET_LENGTH:
                raise ValueError(
                    f"Each ENCRYPTION_KEY must be a random value of at least {_MIN_SECRET_LENGTH} characters "
                    "(generate one with `openssl rand -hex 32`)"
                )
        return value

    @property
    def encryption_keys(self) -> list[str]:
        return [k.strip() for k in self.encryption_key.split(",") if k.strip()]

    @field_validator("jwt_algorithm")
    @classmethod
    def _jwt_algorithm_is_hmac(cls, value: str) -> str:
        if value not in ("HS256", "HS384", "HS512"):
            raise ValueError("JWT_ALGORITHM must be one of HS256, HS384, HS512")
        return value

    @field_validator("default_role")
    @classmethod
    def _default_role_is_not_admin(cls, value: str) -> str:
        if value not in ("", "viewer", "editor"):
            raise ValueError("DEFAULT_ROLE must be 'viewer' or 'editor' (grant admin via ADMIN_EMAILS)")
        return value

    @model_validator(mode="after")
    def _local_mode_stays_local(self) -> "Settings":
        if self.local_mode and urlparse(self.frontend_url).hostname not in _LOCAL_HOSTS:
            raise ValueError(
                "LOCAL_MODE lets anyone sign in as any user, so it only runs on your own machine: "
                "FRONTEND_URL must point at localhost"
            )
        return self

    def is_admin_email(self, email: str) -> bool:
        return email.lower() in split_csv(self.admin_emails)


settings = Settings()
