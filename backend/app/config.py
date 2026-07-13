from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Rozakos Fitness API"
    database_url: str = "sqlite:///./fitness.db"
    secret_key: str = "dev-secret-change-me-in-production-0123456789"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    algorithm: str = "HS256"

    model_config = {"env_file": ".env", "env_prefix": "ROZAKOS_"}


@lru_cache
def get_settings() -> Settings:
    return Settings()
