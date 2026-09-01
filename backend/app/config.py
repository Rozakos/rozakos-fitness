from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings


INSECURE_DEVELOPMENT_SECRET = "dev-secret-change-me-in-production-0123456789"


class Settings(BaseSettings):
    app_name: str = "Rozakos Fitness API"
    database_url: str = "sqlite:///./fitness.db"
    # Required in every environment so a missing production EnvironmentFile can
    # never silently fall back to a publicly known signing key.
    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days
    public_base_url: str = "https://fitness-api.rozakos.eu"
    support_email: str = "billmewtwo1996@gmail.com"
    require_email_verification: bool = False
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_from_email: str | None = None
    smtp_starttls: bool = True
    algorithm: Literal["HS256"] = "HS256"

    model_config = {
        "env_file": ".env",
        "env_file_encoding": "utf-8",
        "env_prefix": "ROZAKOS_",
    }

    @field_validator("secret_key", mode="before")
    @classmethod
    def reject_insecure_secret(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
        if value == INSECURE_DEVELOPMENT_SECRET:
            raise ValueError("ROZAKOS_SECRET_KEY must not use the former development default")
        return value

    @model_validator(mode="after")
    def verification_requires_email_delivery(self) -> "Settings":
        if self.require_email_verification and not (self.smtp_host and self.smtp_from_email):
            raise ValueError(
                "email verification requires ROZAKOS_SMTP_HOST and ROZAKOS_SMTP_FROM_EMAIL"
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
