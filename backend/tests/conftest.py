"""Test fixtures: an in-memory SQLite database per test, wired into the app
in place of Postgres."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import models  # noqa: F401  (registers every table on Base)
from app.database import Base, get_db
from app.main import app
from app.models.crisis_note import Character, CrisisNote, CrisisPeriod, NoteType, Priority


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    @event.listens_for(engine, "connect")
    def _enable_fks(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


@pytest.fixture()
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.clear()


@pytest.fixture()
def delegates(db):
    """Three warlords with distinct scores."""
    chars = [
        Character(name="Yuan Shikai", reputation=4.0, economics=3.0, military=5.0),
        Character(name="Sun Yat-sen", reputation=5.0, economics=1.5, military=1.0),
        Character(name="Zhang Zuolin", reputation=1.0, economics=2.5, military=4.0),
    ]
    db.add_all(chars)
    db.commit()
    return chars


@pytest.fixture()
def directive(db, delegates):
    """A private directive written by Yuan Shikai."""
    period = CrisisPeriod(name="Update 1", is_active=True)
    db.add(period)
    db.flush()
    note = CrisisNote(
        character_id=delegates[0].id,
        period_id=period.id,
        title="March on Shandong",
        description="Send the Beiyang Army south.",
        priority=Priority.HIGH,
        note_type=NoteType.PRIVATE_DIRECTIVE,
    )
    db.add(note)
    db.commit()
    return note
