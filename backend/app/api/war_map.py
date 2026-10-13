from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.api.delegates import get_characters, require_note
from app.database import get_db
from app.models.crisis_note import Character, CrisisNote, Faction, NoteType
from app.models.war_room import (
    AnnotationKind,
    Conflict,
    HistoryKind,
    MapAnnotation,
    Province,
    Territory,
    TerritoryStatus,
)
from app.schemas import (
    AnnotationCreate,
    AnnotationResponse,
    AnnotationUpdate,
    InvasionRequest,
    MapStateResponse,
    ProvinceResponse,
    ProvinceShapeUpdate,
    ProvinceUpdate,
    ScoreDeltas,
    TerritoryCreate,
    TerritoryResponse,
    TerritoryUpdate,
)
from app.services.efficiency import INDICATORS, clamp_score
from app.services.history import Recorder
from app.services.provinces import PROVINCE_IDS, ensure_provinces, holder_ids, set_holders

router = APIRouter(prefix="/map", tags=["map"])


@router.get("", response_model=MapStateResponse)
def get_map(db: Session = Depends(get_db)) -> MapStateResponse:
    return MapStateResponse(
        provinces=ensure_provinces(db),
        delegates=db.query(Character).order_by(Character.name).all(),
        factions=db.query(Faction).order_by(Faction.name).all(),
        annotations=db.query(MapAnnotation).order_by(MapAnnotation.id).all(),
        conflicts=db.query(Conflict)
        .options(selectinload(Conflict.parties))
        .order_by(Conflict.created_at.desc(), Conflict.id.desc())
        .all(),
        territories=db.query(Territory)
        .filter(Territory.active.is_(True))
        .order_by(Territory.id)
        .all(),
    )


def _province(db: Session, province_id: str) -> Province:
    if province_id not in PROVINCE_IDS:
        raise HTTPException(status_code=404, detail=f"Unknown province: {province_id}.")
    ensure_provinces(db)
    province = db.get(Province, province_id)
    assert province is not None
    return province


@router.patch("/provinces/{province_id}", response_model=ProvinceResponse)
def update_province(
    province_id: str, body: ProvinceUpdate, db: Session = Depends(get_db)
) -> Province:
    """Directly assign who holds, shares, occupies or contests a province
    (setup and corrections)."""
    province = _province(db, province_id)
    changes = body.model_dump(exclude_unset=True, exclude={"reason"})
    ids = [
        i
        for v in changes.values()
        if v is not None
        for i in (v if isinstance(v, list) else [v])
    ]
    if ids:
        get_characters(db, ids)

    recorder = Recorder(
        db, HistoryKind.PROVINCE_EDIT, summary=f"Province edited: {province_id}", reason=body.reason
    )
    if "controller_id" in changes or "co_holder_ids" in changes:
        controller_id = changes.pop("controller_id", province.controller_id)
        co_holder_ids = (
            changes.pop("co_holder_ids") or []
            if "co_holder_ids" in changes
            else province.co_holder_ids
        )
        set_holders(recorder, province, controller_id, co_holder_ids)
    for field, value in changes.items():
        recorder.set(province, field, value)
    if recorder.changed:
        db.commit()
    else:
        db.rollback()
    db.refresh(province)
    return province


def _rounded(points: list[list[float]]) -> list[list[float]]:
    return [[round(x, 1), round(y, 1)] for x, y in points]


@router.put("/provinces/{province_id}/shape", response_model=ProvinceResponse)
def redraw_province(
    province_id: str, body: ProvinceShapeUpdate, db: Session = Depends(get_db)
) -> Province:
    """Replace a province's border with a redrawn outline (undoable). A new
    border must cite the crisis note behind it; resetting doesn't."""
    province = _province(db, province_id)
    if body.shape is not None and body.crisis_note_id is None:
        raise HTTPException(status_code=422, detail="A new border must be linked to a crisis note.")
    require_note(db, body.crisis_note_id)
    if body.shape is None and body.neighbour_shapes:
        raise HTTPException(status_code=422, detail="Neighbours only move with a new border.")
    if province_id in body.neighbour_shapes:
        raise HTTPException(status_code=422, detail="A province can't be its own neighbour.")
    neighbours = [(_province(db, pid), shape) for pid, shape in body.neighbour_shapes.items()]
    shape = _rounded(body.shape) if body.shape is not None else None
    summary = f"Border {'redrawn' if shape else 'reset'}: {province_id}"
    if neighbours:
        summary += " (also " + ", ".join(p.id for p, _ in neighbours) + ")"
    recorder = Recorder(
        db,
        HistoryKind.BORDER,
        summary=summary,
        reason=body.reason,
        crisis_note_id=body.crisis_note_id,
    )
    recorder.set(province, "shape", shape)
    for neighbour, neighbour_shape in neighbours:
        recorder.set(neighbour, "shape", _rounded(neighbour_shape))
    if recorder.changed:
        db.commit()
    else:
        db.rollback()
    db.refresh(province)
    return province


TERRITORY_STATUS = {
    "ANNEX": TerritoryStatus.ANNEXED,
    "OCCUPY": TerritoryStatus.OCCUPIED,
    "CONTEST": TerritoryStatus.CONTESTED,
}


def _take_province(recorder: Recorder, province: Province, attacker_id: int, mode: str) -> None:
    own = attacker_id in holder_ids(province)
    if mode == "ANNEX":
        # Annexed land is the invader's alone.
        set_holders(recorder, province, attacker_id, [])
        recorder.set(province, "occupier_id", None)
        recorder.set(province, "contested_by_id", None)
    elif own:
        # Retaking your own land lifts any occupation or dispute.
        recorder.set(province, "occupier_id", None)
        recorder.set(province, "contested_by_id", None)
    elif mode == "OCCUPY":
        recorder.set(province, "occupier_id", attacker_id)
        if province.contested_by_id == attacker_id:
            recorder.set(province, "contested_by_id", None)
    else:  # CONTEST
        recorder.set(province, "contested_by_id", attacker_id)


def _apply_deltas(recorder: Recorder, character: Character, deltas: ScoreDeltas) -> None:
    for indicator in INDICATORS:
        delta = getattr(deltas, indicator)
        if delta:
            new = clamp_score(getattr(character, indicator) + delta)
            recorder.set(character, indicator, round(new, 2))


@router.post("/invasions", response_model=MapStateResponse)
def invade(body: InvasionRequest, db: Session = Depends(get_db)) -> MapStateResponse:
    """One delegate takes provinces from another. Scores stay with delegates;
    the invader carries their own reputation in, with whatever debuffs the
    backrooms enter."""
    attacker = get_characters(db, [body.attacker_id])[0]
    defender = get_characters(db, [body.defender_id])[0] if body.defender_id is not None else None
    if defender is not None and defender.id == attacker.id:
        raise HTTPException(status_code=422, detail="A delegate can't invade themselves.")

    note = db.get(CrisisNote, body.crisis_note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Crisis note not found.")
    if note.note_type != NoteType.PRIVATE_DIRECTIVE:
        raise HTTPException(status_code=422, detail="An invasion must cite a private directive.")
    if note.character_id != attacker.id:
        raise HTTPException(
            status_code=422, detail="The directive must have been written by the invading delegate."
        )

    provinces = [_province(db, pid) for pid in dict.fromkeys(body.province_ids)]
    verb = {"ANNEX": "annexes", "OCCUPY": "occupies", "CONTEST": "contests"}[body.mode]
    if body.area is not None:
        where = f"part of {provinces[0].id}" if provinces else "new ground"
    else:
        where = ", ".join(p.id for p in provinces)

    recorder = Recorder(
        db,
        HistoryKind.INVASION,
        summary=f"{attacker.name} {verb} {where}" + (f" from {defender.name}" if defender else ""),
        reason=body.reason,
        crisis_note_id=note.id,
    )
    if body.area is not None:
        territory = Territory(
            holder_id=attacker.id,
            defender_id=defender.id if defender else None,
            province_id=provinces[0].id if provinces else None,
            status=TERRITORY_STATUS[body.mode],
            polygon=[[round(x, 1), round(y, 1)] for x, y in body.area],
            crisis_note_id=note.id,
            active=False,
        )
        db.add(territory)
        db.flush()
        recorder.set(territory, "active", True)
    else:
        for province in provinces:
            _take_province(recorder, province, attacker.id, body.mode)

    _apply_deltas(recorder, attacker, body.attacker_deltas)
    if defender is not None:
        _apply_deltas(recorder, defender, body.defender_deltas)

    if recorder.changed:
        db.commit()
    else:
        db.rollback()
    return get_map(db)


@router.post(
    "/annotations", response_model=AnnotationResponse, status_code=status.HTTP_201_CREATED
)
def create_annotation(body: AnnotationCreate, db: Session = Depends(get_db)) -> MapAnnotation:
    if body.kind == AnnotationKind.PIN and len(body.points) != 1:
        raise HTTPException(status_code=422, detail="A pin has exactly one point.")
    if body.kind == AnnotationKind.LINE and len(body.points) < 2:
        raise HTTPException(status_code=422, detail="A line needs at least two points.")
    require_note(db, body.crisis_note_id)
    annotation = MapAnnotation(
        kind=body.kind,
        points=[[round(x, 1), round(y, 1)] for x, y in body.points],
        label=body.label,
        color=body.color,
        dashed=body.dashed,
        crisis_note_id=body.crisis_note_id,
    )
    db.add(annotation)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.patch("/annotations/{annotation_id}", response_model=AnnotationResponse)
def update_annotation(
    annotation_id: int, body: AnnotationUpdate, db: Session = Depends(get_db)
) -> MapAnnotation:
    annotation = db.get(MapAnnotation, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found.")
    changes = body.model_dump(exclude_unset=True)
    require_note(db, changes.get("crisis_note_id"))
    for field, value in changes.items():
        setattr(annotation, field, value)
    db.commit()
    db.refresh(annotation)
    return annotation


@router.delete(
    "/annotations/{annotation_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def delete_annotation(annotation_id: int, db: Session = Depends(get_db)) -> None:
    annotation = db.get(MapAnnotation, annotation_id)
    if not annotation:
        raise HTTPException(status_code=404, detail="Annotation not found.")
    db.delete(annotation)
    db.commit()



def _territory(db: Session, territory_id: int) -> Territory:
    territory = db.get(Territory, territory_id)
    if territory is None or not territory.active:
        raise HTTPException(status_code=404, detail="Territory not found.")
    return territory


@router.post("/territories", response_model=TerritoryResponse, status_code=status.HTTP_201_CREATED)
def create_territory(body: TerritoryCreate, db: Session = Depends(get_db)) -> Territory:
    """Record a drawn area changing hands without an invasion — typically the
    winner of a resolved conflict taking ground. Undoable."""
    holder = get_characters(db, [body.holder_id])[0]
    if body.defender_id is not None:
        get_characters(db, [body.defender_id])
    if body.province_id is not None:
        _province(db, body.province_id)
    require_note(db, body.crisis_note_id)
    territory = Territory(
        holder_id=holder.id,
        defender_id=body.defender_id,
        province_id=body.province_id,
        status=body.status,
        polygon=[[round(x, 1), round(y, 1)] for x, y in body.polygon],
        crisis_note_id=body.crisis_note_id,
        active=False,
    )
    db.add(territory)
    db.flush()
    recorder = Recorder(
        db,
        HistoryKind.BORDER,
        summary=f"{holder.name} takes {'part of ' + body.province_id if body.province_id else 'new ground'}",
        reason=body.reason,
        crisis_note_id=body.crisis_note_id,
    )
    recorder.set(territory, "active", True)
    db.commit()
    db.refresh(territory)
    return territory


@router.patch("/territories/{territory_id}", response_model=TerritoryResponse)
def update_territory(
    territory_id: int, body: TerritoryUpdate, db: Session = Depends(get_db)
) -> Territory:
    """Settle or change a taken area: e.g. a contested strip goes to the
    attacker (ANNEXED) or changes hands (holder_id). Undoable."""
    territory = _territory(db, territory_id)
    changes = body.model_dump(exclude_unset=True, exclude={"reason"})
    if changes.get("holder_id") is not None:
        get_characters(db, [changes["holder_id"]])
    elif "holder_id" in changes:
        raise HTTPException(status_code=422, detail="A territory needs a holder; remove it instead.")
    recorder = Recorder(
        db,
        HistoryKind.BORDER,
        summary=f"Territory updated: {territory.province_id or 'drawn area'}",
        reason=body.reason,
        crisis_note_id=territory.crisis_note_id,
    )
    for field, value in changes.items():
        recorder.set(territory, field, value)
    if recorder.changed:
        db.commit()
    else:
        db.rollback()
    db.refresh(territory)
    return territory


@router.delete(
    "/territories/{territory_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None
)
def remove_territory(territory_id: int, db: Session = Depends(get_db)) -> None:
    """Hand a taken area back (undoable — it's hidden, not destroyed)."""
    territory = _territory(db, territory_id)
    recorder = Recorder(
        db,
        HistoryKind.BORDER,
        summary=f"Territory returned: {territory.province_id or 'drawn area'}",
        crisis_note_id=territory.crisis_note_id,
    )
    recorder.set(territory, "active", False)
    db.commit()
