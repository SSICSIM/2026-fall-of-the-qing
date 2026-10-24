"""Records every score/map change so the backrooms can see who did what and
undo the most recent action."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models.crisis_note import Character
from app.models.war_room import HistoryBatch, HistoryEntry, HistoryKind, Province, Territory
from app.services.efficiency import INDICATORS

_TARGETS: dict[str, type] = {
    "character": Character,
    "province": Province,
    "territory": Territory,
}
_TARGET_TYPES = {model: name for name, model in _TARGETS.items()}


class Recorder:
    """Applies field changes and logs old/new values into one batch."""

    def __init__(
        self,
        db: Session,
        kind: HistoryKind,
        summary: str,
        reason: str | None = None,
        crisis_note_id: int | None = None,
    ) -> None:
        self.db = db
        self.batch = HistoryBatch(
            kind=kind, summary=summary, reason=reason, crisis_note_id=crisis_note_id
        )
        db.add(self.batch)

    def set(self, target: Character | Province | Territory, field: str, value: Any) -> None:
        old = getattr(target, field)
        if old == value:
            return
        target_type = _TARGET_TYPES[type(target)]
        self.batch.entries.append(
            HistoryEntry(
                target_type=target_type,
                target_id=str(target.id),
                field=field,
                old_value=old,
                new_value=value,
            )
        )
        setattr(target, field, value)
        # A published rating is a group average; once a delegate's own scores
        # move, the map goes back to their live efficiency.
        if isinstance(target, Character) and field in INDICATORS:
            self.set(target, "published_efficiency", None)

    @property
    def changed(self) -> bool:
        return bool(self.batch.entries)


def undo_last(db: Session) -> HistoryBatch | None:
    """Revert the most recent batch that hasn't been reverted. Returns it, or
    None when there's nothing to undo."""
    batch = (
        db.query(HistoryBatch)
        .filter(HistoryBatch.reverted.is_(False))
        .order_by(HistoryBatch.id.desc())
        .first()
    )
    if batch is None:
        return None
    for entry in reversed(batch.entries):
        model = _TARGETS[entry.target_type]
        key: Any = entry.target_id if entry.target_type == "province" else int(entry.target_id)
        target = db.get(model, key)
        if target is None:
            # Deleted since (e.g. a character was removed) — nothing to restore.
            continue
        setattr(target, entry.field, entry.old_value)
    batch.reverted = True
    db.commit()
    db.refresh(batch)
    return batch
