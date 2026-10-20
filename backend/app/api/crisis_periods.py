from __future__ import annotations

import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.crisis_note import CrisisPeriod
from app.schemas import CrisisPeriodCreate, CrisisPeriodResponse


def _next_period_name(name: str) -> str:
    """Increment a trailing number in a period name, e.g. 'Update 1' → 'Update 2'."""
    match = re.search(r"(\d+)\s*$", name)
    if match:
        n = int(match.group(1))
        return name[: match.start()] + str(n + 1)
    return f"{name} 2"

router = APIRouter(prefix="/periods", tags=["periods"])


@router.get("", response_model=list[CrisisPeriodResponse])
def list_periods(db: Session = Depends(get_db)) -> list[CrisisPeriod]:
    return db.query(CrisisPeriod).order_by(CrisisPeriod.created_at.desc()).all()


@router.get("/active", response_model=CrisisPeriodResponse | None)
def get_active_period(db: Session = Depends(get_db)) -> CrisisPeriod | None:
    return db.query(CrisisPeriod).filter(CrisisPeriod.is_active.is_(True)).first()


@router.post("", response_model=CrisisPeriodResponse, status_code=status.HTTP_201_CREATED)
def create_period(body: CrisisPeriodCreate, db: Session = Depends(get_db)) -> CrisisPeriod:
    active = db.query(CrisisPeriod).filter(CrisisPeriod.is_active.is_(True)).first()
    if active:
        raise HTTPException(
            status_code=409,
            detail="An active period already exists. Archive it before creating a new one.",
        )
    period = CrisisPeriod(name=body.name, is_active=True)
    db.add(period)
    try:
        db.commit()
    except IntegrityError:
        # Another request created an active period between our check and
        # commit; the partial unique index on is_active caught it.
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="An active period already exists. Archive it before creating a new one.",
        )
    db.refresh(period)
    return period


@router.post("/{period_id}/archive", response_model=CrisisPeriodResponse)
def archive_period(period_id: int, db: Session = Depends(get_db)) -> CrisisPeriod:
    period = db.get(CrisisPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found.")
    if not period.is_active:
        raise HTTPException(status_code=409, detail="Period is already archived.")
    period.is_active = False
    period.archived_at = datetime.now(timezone.utc)
    next_period = CrisisPeriod(name=_next_period_name(period.name), is_active=True)
    db.add(next_period)
    db.commit()
    db.refresh(next_period)
    return next_period


def _latest_archived(db: Session) -> CrisisPeriod | None:
    return (
        db.query(CrisisPeriod)
        .filter(CrisisPeriod.is_active.is_(False))
        .order_by(CrisisPeriod.archived_at.desc().nulls_last(), CrisisPeriod.id.desc())
        .first()
    )


def _activate(period: CrisisPeriod) -> None:
    period.is_active = True
    period.archived_at = None


@router.delete("/{period_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_period(period_id: int, db: Session = Depends(get_db)) -> None:
    """Delete a period started by mistake, with its notes. If it was the
    active one, the most recently archived period becomes active again."""
    period = db.get(CrisisPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found.")
    was_active = period.is_active
    for note in [*period.crisis_notes, *period.staff_notes]:
        db.delete(note)
    db.delete(period)
    # The one-active-period index needs the row gone before another activates.
    db.flush()
    if was_active and (previous := _latest_archived(db)) is not None:
        _activate(previous)
    db.commit()


@router.post("/{period_id}/reopen", response_model=CrisisPeriodResponse)
def reopen_period(period_id: int, db: Session = Depends(get_db)) -> CrisisPeriod:
    """Go back to an archived period: it becomes active again and the
    current active period is archived."""
    period = db.get(CrisisPeriod, period_id)
    if not period:
        raise HTTPException(status_code=404, detail="Period not found.")
    if period.is_active:
        raise HTTPException(status_code=409, detail="Period is already active.")
    active = db.query(CrisisPeriod).filter(CrisisPeriod.is_active.is_(True)).first()
    if active:
        active.is_active = False
        active.archived_at = datetime.now(timezone.utc)
        db.flush()
    _activate(period)
    db.commit()
    db.refresh(period)
    return period
