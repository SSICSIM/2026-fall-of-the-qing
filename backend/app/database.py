from __future__ import annotations

from sqlalchemy import create_engine, event
from sqlalchemy.pool import NullPool
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from app.config import settings


class Base(DeclarativeBase):
    pass


def pin_search_path(dbapi_conn, schema: str) -> None:
    # Pin a connection to this mechanic's schema so unqualified table names
    # resolve there. `extensions` is where Supabase installs extensions;
    # `public` is deliberately left out so a missing table can never fall
    # through to another app's table of the same name.
    #
    # This is a plain SET rather than the libpq `options=-csearch_path=...`
    # startup parameter, because Supabase's pooler silently drops startup
    # options. The current_schema() check makes any future regression fail
    # loudly instead of quietly reading or writing `public`.
    cur = dbapi_conn.cursor()
    try:
        cur.execute(f'SET search_path TO "{schema}", extensions')
        cur.execute("SELECT current_schema()")
        current = cur.fetchone()[0]
    finally:
        cur.close()
    dbapi_conn.commit()
    if current != schema:
        raise RuntimeError(
            f"search_path did not pin to schema {schema!r} (got {current!r}); "
            "has the schema been created by the migrations?"
        )


# In production every mechanic shares the admin portal's Supabase session
# pooler, which only has 15 slots in total. A client-side pool would keep idle
# connections parked in those slots (2 per mechanic adds up fast), starving the
# other mechanics and the deploy workflow's migrations. NullPool hands each
# connection back as soon as the request is done.
_engine_kwargs = {"poolclass": NullPool} if settings.db_schema else {}
engine = create_engine(settings.database_url, pool_pre_ping=True, **_engine_kwargs)

if settings.db_schema:

    @event.listens_for(engine, "connect")
    def _pin_schema(dbapi_conn, _record) -> None:
        pin_search_path(dbapi_conn, settings.db_schema)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
