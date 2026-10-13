from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.api.delegates import get_characters, require_note
from app.database import get_db
from app.models.war_room import Conflict, ConflictStatus
from app.schemas import ConflictCreate, ConflictResolve, ConflictResponse

router = APIRouter(prefix="/conflicts", tags=["conflicts"])


def _get(db: Session, conflict_id: int) -> Conflict:
    conflict = db.get(Conflict, conflict_id)
    if not conflict:
        raise HTTPException(status_code=404, detail="Conflict not found.")
    return conflict


@router.get("", response_model=list[ConflictResponse])
def list_conflicts(db: Session = Depends(get_db)) -> list[Conflict]:
    return (
        db.query(Conflict)
        .options(selectinload(Conflict.parties))
        .order_by(Conflict.created_at.desc(), Conflict.id.desc())
        .all()
    )


@router.post("", response_model=ConflictResponse, status_code=status.HTTP_201_CREATED)
def create_conflict(body: ConflictCreate, db: Session = Depends(get_db)) -> Conflict:
    parties = get_characters(db, body.party_ids)
    if len(parties) < 2:
        raise HTTPException(status_code=422, detail="A conflict needs at least two parties.")
    require_note(db, body.crisis_note_id)
    conflict = Conflict(
        name=body.name, status=ConflictStatus.ONGOING, parties=parties, crisis_note_id=body.crisis_note_id
    )
    db.add(conflict)
    db.commit()
    db.refresh(conflict)
    return conflict


@router.post("/{conflict_id}/resolve", response_model=ConflictResponse)
def resolve_conflict(
    conflict_id: int, body: ConflictResolve, db: Session = Depends(get_db)
) -> Conflict:
    conflict = _get(db, conflict_id)
    if conflict.status == ConflictStatus.RESOLVED:
        raise HTTPException(status_code=409, detail="This conflict is already resolved.")
    if body.winner_id is not None and body.winner_id not in {p.id for p in conflict.parties}:
        raise HTTPException(status_code=422, detail="The winner must be one of the parties.")
    conflict.status = ConflictStatus.RESOLVED
    conflict.winner_id = body.winner_id
    conflict.outcome_summary = body.outcome_summary
    conflict.resolved_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(conflict)
    return conflict


@router.delete("/{conflict_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_conflict(conflict_id: int, db: Session = Depends(get_db)) -> None:
    db.delete(_get(db, conflict_id))
    db.commit()
