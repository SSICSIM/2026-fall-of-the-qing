"""A revision number that changes whenever anything is saved, so every open
screen can notice someone else's change and refetch.

Kept in memory: the API runs as a single uvicorn process. A restart gives a
new boot id, which clients treat as a change too.
"""

from __future__ import annotations

import itertools
import uuid

from sqlalchemy import event
from sqlalchemy.orm import Session

_BOOT = uuid.uuid4().hex[:8]
_counter = itertools.count(1)
_revision = 0


def current_revision() -> str:
    return f"{_BOOT}-{_revision}"


@event.listens_for(Session, "after_commit")
def _bump(_session: Session) -> None:
    global _revision
    _revision = next(_counter)
