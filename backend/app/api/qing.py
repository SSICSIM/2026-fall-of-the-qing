"""Fall of Qing staff API: indicators, settings, groups, calculator, history/undo."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.crisis_note import Character
from app.models.qing import (
    ActionLog,
    CalculationRun,
    DelegateGroup,
    Indicator,
)
from app.schemas import (
    ActionResponse,
    EfficiencySettingsBody,
    EfficiencySettingsResponse,
    GroupBody,
    GroupResponse,
    IndicatorRow,
    NotesBody,
    RunCreate,
    RunResponse,
    ScoreEditRequest,
)
from app.services import efficiency as eff
from app.services import qing as svc

router = APIRouter(tags=["qing"])


def _raise(exc: svc.ServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


def staff_user(x_staff_user: str | None = Header(default=None)) -> str | None:
    """Optional staff name forwarded by the frontend proxy, recorded for attribution."""
    return x_staff_user


# ── indicators ───────────────────────────────────────────────────────────────

@router.get("/indicators", response_model=list[IndicatorRow])
def list_indicators(db: Session = Depends(get_db)) -> list[IndicatorRow]:
    settings = svc.get_settings(db)
    db.commit()
    all_inds = [i.value for i in Indicator]
    return [
        IndicatorRow(
            character_id=c.id,
            name=c.name,
            region=c.region,
            legitimacy=c.legitimacy,
            military=c.military,
            economics=c.economics,
            notes=c.notes,
            efficiency=eff.compute_efficiency(svc.values_of(c), all_inds, settings.scale_max),
            published_efficiency=c.published_efficiency,
        )
        for c in db.query(Character).order_by(Character.name).all()
    ]


@router.post("/indicators/edits", response_model=ActionResponse, status_code=201)
def edit_indicators(
    body: ScoreEditRequest,
    db: Session = Depends(get_db),
    user: str | None = Depends(staff_user),
) -> ActionLog:
    try:
        return svc.apply_score_edits(
            db, [e.model_dump(mode="json") for e in body.edits], body.note, user
        )
    except svc.ServiceError as exc:
        _raise(exc)


@router.put("/indicators/{character_id}/notes", response_model=NotesBody)
def set_notes(character_id: int, body: NotesBody, db: Session = Depends(get_db)) -> NotesBody:
    char = db.get(Character, character_id)
    if char is None:
        raise HTTPException(404, "Delegate not found.")
    char.notes = body.notes
    db.commit()
    return NotesBody(notes=char.notes)


# ── settings ─────────────────────────────────────────────────────────────────

@router.get("/settings/efficiency", response_model=EfficiencySettingsResponse)
def get_efficiency_settings(db: Session = Depends(get_db)):
    row = svc.get_settings(db)
    db.commit()
    return row


@router.put("/settings/efficiency", response_model=EfficiencySettingsResponse)
def put_efficiency_settings(body: EfficiencySettingsBody, db: Session = Depends(get_db)):
    row = svc.get_settings(db)
    row.scale_max = body.scale_max
    row.bands = [b.model_dump() for b in body.bands]
    db.commit()
    return row


# ── group presets ────────────────────────────────────────────────────────────

def _validate_members(db: Session, ids: list[int]) -> list[int]:
    ids = list(dict.fromkeys(ids))
    found = {r[0] for r in db.query(Character.id).filter(Character.id.in_(ids)).all()}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(404, f"Delegates not found: {missing}")
    return ids


@router.get("/groups", response_model=list[GroupResponse])
def list_groups(db: Session = Depends(get_db)):
    return db.query(DelegateGroup).order_by(DelegateGroup.name).all()


@router.post("/groups", response_model=GroupResponse, status_code=status.HTTP_201_CREATED)
def create_group(body: GroupBody, db: Session = Depends(get_db)):
    group = DelegateGroup(name=body.name, character_ids=_validate_members(db, body.character_ids))
    db.add(group)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A group with that name already exists.")
    db.refresh(group)
    return group


@router.put("/groups/{group_id}", response_model=GroupResponse)
def update_group(group_id: int, body: GroupBody, db: Session = Depends(get_db)):
    group = db.get(DelegateGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found.")
    group.name = body.name
    group.character_ids = _validate_members(db, body.character_ids)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A group with that name already exists.")
    db.refresh(group)
    return group


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_group(group_id: int, db: Session = Depends(get_db)) -> None:
    group = db.get(DelegateGroup, group_id)
    if group is None:
        raise HTTPException(404, "Group not found.")
    db.delete(group)
    db.commit()


# ── calculator ───────────────────────────────────────────────────────────────

@router.post("/calculator/runs", response_model=RunResponse, status_code=201)
def create_run(
    body: RunCreate,
    db: Session = Depends(get_db),
    user: str | None = Depends(staff_user),
) -> CalculationRun:
    try:
        return svc.create_run(
            db,
            body.character_ids,
            [i.value for i in body.indicators] if body.indicators else None,
            user,
        )
    except svc.ServiceError as exc:
        _raise(exc)


@router.get("/calculator/runs/{run_id}", response_model=RunResponse)
def get_run(run_id: int, db: Session = Depends(get_db)) -> CalculationRun:
    run = db.get(CalculationRun, run_id)
    if run is None:
        raise HTTPException(404, "Calculation run not found.")
    return run


@router.post("/calculator/runs/{run_id}/publish", response_model=ActionResponse)
def publish_run(
    run_id: int,
    db: Session = Depends(get_db),
    user: str | None = Depends(staff_user),
) -> ActionLog:
    try:
        return svc.publish_run(db, run_id, user)
    except svc.ServiceError as exc:
        _raise(exc)


# ── history ──────────────────────────────────────────────────────────────────

@router.get("/history", response_model=list[ActionResponse])
def history(limit: int = 50, db: Session = Depends(get_db)) -> list[ActionLog]:
    limit = max(1, min(limit, 200))
    return db.query(ActionLog).order_by(ActionLog.id.desc()).limit(limit).all()


@router.post("/history/undo", response_model=ActionResponse)
def undo(db: Session = Depends(get_db)) -> ActionLog:
    try:
        return svc.undo_last(db)
    except svc.ServiceError as exc:
        _raise(exc)
