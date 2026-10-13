from __future__ import annotations

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Repo root .env — used when running uvicorn directly (outside docker-compose,
# which injects the same file's vars via `env_file:` instead).
_ROOT_ENV = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ROOT_ENV, extra="ignore")

    database_url: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/app"
    api_cors_origins: str = "http://localhost:3000"
    environment: str = "development"
    admin_api_token: str | None = None
    # Postgres schema this mechanic's tables live in. Unset locally (tables go
    # in the default schema); set in production so several mechanics can share
    # one database without their tables colliding. See docs/deployment.md.
    db_schema: str | None = None

    @property
    def cors_origins_list(self) -> list[str]:
        # Comma-separated origins
        return [o.strip() for o in self.api_cors_origins.split(",") if o.strip()]


settings = Settings()
