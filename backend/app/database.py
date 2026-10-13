from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def schema_connect_args() -> dict:
    # Pin every connection to this mechanic's schema so unqualified table names
    # resolve there. `extensions` is where Supabase installs extensions;
    # `public` is deliberately left out so a missing table can never fall
    # through to another app's table of the same name.
    if not settings.db_schema:
        return {}
    return {"options": f"-csearch_path={settings.db_schema},extensions"}


_engine_kwargs = {"pool_size": 2, "max_overflow": 3} if settings.db_schema else {}
engine = create_engine(
    settings.database_url,
    pool_pre_ping=True,
    connect_args=schema_connect_args(),
    **_engine_kwargs,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
