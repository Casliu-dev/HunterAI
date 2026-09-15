from functools import lru_cache
from pathlib import Path

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
    secret_key: str = "dev-secret-nao-use-em-producao"

    database_url: str = "postgresql+psycopg://hunterai:hunterai@localhost:5432/hunterai"
    redis_url: str = "redis://localhost:6379/0"

    # Claude
    anthropic_api_key: str | None = None
    humanize_model: str = "claude-sonnet-5"
    humanize_model_free: str = "claude-haiku-4-5"

    # Detector
    detector_model: str = "pierreguillou/gpt2-small-portuguese"

    # Stripe
    stripe_secret_key: str | None = None
    stripe_webhook_secret: str | None = None
    stripe_price_starter: str | None = None
    stripe_price_pro: str | None = None

    # Arquivos
    storage_dir: Path = Path("./storage")
    max_upload_mb: int = 10

    # Tokens
    access_token_ttl_minutes: int = 30
    refresh_token_ttl_days: int = 30

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
