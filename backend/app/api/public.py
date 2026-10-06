"""Delegate-facing, read-only endpoints. Deliberately minimal.

This router is mounted OUTSIDE the token-guarded /api prefix so the projected map
can read it. It must only ever expose what delegates are allowed to see: the
published efficiency score and the delegate's name. Never add raw indicators,
notes, or directives here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.crisis_note import Character
from app.schemas import PublicScore

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/map-scores", response_model=list[PublicScore])
def map_scores(db: Session = Depends(get_db)) -> list[PublicScore]:
    rows = (
        db.query(Character.id, Character.name, Character.published_efficiency)
        .filter(Character.published_efficiency.is_not(None))
        .order_by(Character.name)
        .all()
    )
    return [PublicScore(character_id=r[0], name=r[1], efficiency=r[2]) for r in rows]
