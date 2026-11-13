from functools import lru_cache
from pathlib import Path

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    environment: str = "development"
    api_base_url: str = "http://localhost:8000"
    web_base_url: str = "http://localhost:5173"
    secret_key: str  # obrigatório — sem default inseguro

    database_url: str = "postgresql+psycopg://hunterai:hunterai@localhost:5432/hunterai"
    redis_url: str = "redis://localhost:6379/0"

    # Claude
    anthropic_api_key: str  # obrigatório
    humanize_model: str = "claude-sonnet-5"
    humanize_model_free: str = "claude-haiku-4-5"

    # Detector
    detector_model: str = "pierreguillou/gpt2-small-portuguese"

    # Stripe
    stripe_secret_key: str  # obrigatório
    stripe_webhook_secret: str  # obrigatório
    stripe_price_starter: str | None = None
    stripe_price_pro: str | None = None

    # Arquivos
    storage_dir: Path = Path("./storage")
    max_upload_mb: int = 10

    # Tokens
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 30

    @field_validator(
        "secret_key", "anthropic_api_key", "stripe_secret_key", "stripe_webhook_secret"
    )
    @classmethod
    def _not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("valor vazio não permitido")
        return v.strip()

    @field_validator("secret_key")
    @classmethod
    def _secret_key_min_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("secret_key deve ter pelo menos 32 caracteres")
        return v

    @field_validator("environment")
    @classmethod
    def _env_valid(cls, v: str) -> str:
        if v not in ("development", "staging", "production"):
            raise ValueError("environment deve ser development, staging ou production")
        return v

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
