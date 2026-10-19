from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.factions import require_faction
from app.database import get_db
from app.models.crisis_note import Character, CrisisNote
from app.models.war_room import HistoryKind
from app.schemas import (
    BulkPositionUpdate,
    BulkScoreUpdate,
    DelegateProfileUpdate,
    DelegateResponse,
    PositionUpdate,
)
from app.services.efficiency import INDICATORS
from app.services.history import Recorder
from app.services.provinces import get_province

router = APIRouter(prefix="/delegates", tags=["delegates"])


def get_characters(db: Session, ids: list[int]) -> list[Character]:
    """Fetch characters in the order given, 404 if any is missing."""
    unique_ids = list(dict.fromkeys(ids))
    found = {c.id: c for c in db.query(Character).filter(Character.id.in_(unique_ids)).all()}
    missing = [i for i in unique_ids if i not in found]
    if missing:
        raise HTTPException(
            status_code=404, detail=f"Character(s) not found: {', '.join(map(str, missing))}."
        )
    return [found[i] for i in unique_ids]


def require_note(db: Session, note_id: int | None) -> None:
    if note_id is not None and not db.get(CrisisNote, note_id):
        raise HTTPException(status_code=404, detail="Crisis note not found.")


@router.get("", response_model=list[DelegateResponse])
def list_delegates(db: Session = Depends(get_db)) -> list[Character]:
    return db.query(Character).order_by(Character.name).all()


@router.patch("/scores", response_model=list[DelegateResponse])
def update_scores(body: BulkScoreUpdate, db: Session = Depends(get_db)) -> list[Character]:
    """Set indicator scores for one or more delegates in a single undoable step."""
    require_note(db, body.crisis_note_id)
    characters = {c.id: c for c in get_characters(db, [u.character_id for u in body.updates])}

    names = ", ".join(characters[u.character_id].name for u in body.updates)
    recorder = Recorder(
        db,
        HistoryKind.SCORE_EDIT,
        summary=f"Scores updated: {names}",
        reason=body.reason,
        crisis_note_id=body.crisis_note_id,
    )
    for update in body.updates:
        character = characters[update.character_id]
        for indicator in INDICATORS:
            value = getattr(update, indicator)
            if value is not None:
                recorder.set(character, indicator, round(value, 2))

    if not recorder.changed:
        db.rollback()
        return list(characters.values())
    db.commit()
    for character in characters.values():
        db.refresh(character)
    return list(characters.values())


@router.patch("/positions", response_model=list[DelegateResponse])
def place_many(body: BulkPositionUpdate, db: Session = Depends(get_db)) -> list[Character]:
    """Put several pins on the map at once, as one undoable change."""
    characters = get_characters(db, [p.character_id for p in body.positions])
    by_id = {c.id: c for c in characters}
    recorder = Recorder(
        db, HistoryKind.MOVE, summary=f"{len(characters)} characters placed", reason=body.reason
    )
    for p in body.positions:
        recorder.set(by_id[p.character_id], "x", round(p.x, 1))
        recorder.set(by_id[p.character_id], "y", round(p.y, 1))
    if recorder.changed:
        db.commit()
    else:
        db.rollback()
    for character in characters:
        db.refresh(character)
    return characters


@router.patch("/{character_id}/position", response_model=DelegateResponse)
def move(character_id: int, body: PositionUpdate, db: Session = Depends(get_db)) -> Character:
    """Move a character's pin (undoable). Both coordinates null removes it."""
    character = get_characters(db, [character_id])[0]
    if (body.x is None) != (body.y is None):
        raise HTTPException(status_code=422, detail="Give both x and y, or neither.")
    x = round(body.x, 1) if body.x is not None else None
    y = round(body.y, 1) if body.y is not None else None
    verb = "placed" if character.x is None else "removed from map" if x is None else "moved"
    recorder = Recorder(db, HistoryKind.MOVE, summary=f"{character.name} {verb}", reason=body.reason)
    recorder.set(character, "x", x)
    recorder.set(character, "y", y)
    if recorder.changed:
        db.commit()
    else:
        db.rollback()
    db.refresh(character)
    return character


@router.patch("/{character_id}", response_model=DelegateResponse)
def update_profile(
    character_id: int, body: DelegateProfileUpdate, db: Session = Depends(get_db)
) -> Character:
    character = db.get(Character, character_id)
    if not character:
        raise HTTPException(status_code=404, detail="Character not found.")
    changes = body.model_dump(exclude_unset=True)
    require_faction(db, changes.get("faction_id"))
    home = changes.get("home_province_id")
    if home is not None:
        if get_province(db, home) is None:
            raise HTTPException(status_code=404, detail=f"Unknown province: {home}.")
    for field, value in changes.items():
        setattr(character, field, value)
    db.commit()
    db.refresh(character)
    return character
