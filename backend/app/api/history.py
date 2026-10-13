from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.models.war_room import HistoryBatch
from app.schemas import HistoryBatchResponse
from app.services.history import undo_last

router = APIRouter(prefix="/history", tags=["history"])


@router.get("", response_model=list[HistoryBatchResponse])
def list_history(
    limit: int = Query(50, ge=1, le=500), db: Session = Depends(get_db)
) -> list[HistoryBatch]:
    return (
        db.query(HistoryBatch)
        .options(selectinload(HistoryBatch.entries))
        .order_by(HistoryBatch.id.desc())
        .limit(limit)
        .all()
    )


@router.post("/undo", response_model=HistoryBatchResponse)
def undo(db: Session = Depends(get_db)) -> HistoryBatch:
    """Reverse the most recent score edit, publish, invasion or province edit."""
    batch = undo_last(db)
    if batch is None:
        raise HTTPException(status_code=409, detail="Nothing to undo.")
    return batch
