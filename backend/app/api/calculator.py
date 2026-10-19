from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.delegates import get_characters, require_note
from app.database import get_db
from app.models.crisis_note import Character
from app.models.war_room import CalculatorPreset, HistoryKind
from app.schemas import (
    BandResponse,
    DelegateEfficiency,
    DelegateResponse,
    EfficiencyRequest,
    EfficiencyResponse,
    FormulaResponse,
    FormulaSettings,
    PresetCreate,
    PresetResponse,
    PublishRequest,
)
from app.services.efficiency import band_for, delegate_efficiency, normalize_indicators
from app.services.formula import Formula, band_dicts, load_formula, reset_formula, save_formula
from app.services.history import Recorder

router = APIRouter(prefix="/calculator", tags=["calculator"])


def _formula_response(formula: Formula) -> FormulaResponse:
    return FormulaResponse(
        midpoint=formula.midpoint, bands=band_dicts(formula), is_default=formula.is_default
    )


@router.get("/formula", response_model=FormulaResponse)
def get_formula(db: Session = Depends(get_db)) -> FormulaResponse:
    return _formula_response(load_formula(db))


@router.put("/formula", response_model=FormulaResponse)
def update_formula(body: FormulaSettings, db: Session = Depends(get_db)) -> FormulaResponse:
    """Change the divisor, thresholds and tips. Already-published ratings
    stay as they are until they are sent to the map again."""
    bands = [b.model_dump() for b in body.bands]
    return _formula_response(save_formula(db, body.midpoint, bands))


@router.delete("/formula", response_model=FormulaResponse)
def restore_formula(db: Session = Depends(get_db)) -> FormulaResponse:
    """Go back to the PRD's formula."""
    return _formula_response(reset_formula(db))


def _evaluate(
    body: EfficiencyRequest, characters: list[Character], formula: Formula
) -> EfficiencyResponse:
    indicators = normalize_indicators(body.indicators)
    per_delegate = [
        DelegateEfficiency(
            character_id=c.id,
            name=c.name,
            efficiency=round(delegate_efficiency(c, indicators, formula.midpoint), 3),
        )
        for c in characters
    ]
    rating = sum(d.efficiency for d in per_delegate) / len(per_delegate)
    band = band_for(rating, formula.bands)
    return EfficiencyResponse(
        indicators=indicators,
        efficiency=round(rating, 3),
        band=BandResponse(
            key=band.key, label=band.label, tone=band.tone, tips=list(band.tips)
        ),
        delegates=per_delegate,
    )


@router.post("/efficiency", response_model=EfficiencyResponse)
def calculate(body: EfficiencyRequest, db: Session = Depends(get_db)) -> EfficiencyResponse:
    """Preview a rating. Changes nothing."""
    return _evaluate(body, get_characters(db, body.character_ids), load_formula(db))


@router.post("/publish", response_model=list[DelegateResponse])
def publish(body: PublishRequest, db: Session = Depends(get_db)) -> list[Character]:
    """Confirm the rating and send it to the map. A group of delegates all
    get the group's average, the number the calculator shows."""
    require_note(db, body.crisis_note_id)
    characters = get_characters(db, body.character_ids)
    result = _evaluate(body, characters, load_formula(db))

    recorder = Recorder(
        db,
        HistoryKind.PUBLISH,
        summary="Efficiency sent to map: " + ", ".join(c.name for c in characters),
        reason=body.reason,
        crisis_note_id=body.crisis_note_id,
    )
    for character in characters:
        recorder.set(character, "published_efficiency", result.efficiency)
    if not recorder.changed:
        db.rollback()
        return characters
    db.commit()
    for character in characters:
        db.refresh(character)
    return characters


@router.get("/presets", response_model=list[PresetResponse])
def list_presets(db: Session = Depends(get_db)) -> list[CalculatorPreset]:
    return db.query(CalculatorPreset).order_by(CalculatorPreset.name).all()


@router.post("/presets", response_model=PresetResponse, status_code=status.HTTP_201_CREATED)
def create_preset(body: PresetCreate, db: Session = Depends(get_db)) -> CalculatorPreset:
    characters = get_characters(db, body.character_ids)
    preset = CalculatorPreset(name=body.name, character_ids=[c.id for c in characters])
    db.add(preset)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A preset with that name already exists.")
    db.refresh(preset)
    return preset


@router.delete("/presets/{preset_id}", status_code=status.HTTP_204_NO_CONTENT, response_model=None)
def delete_preset(preset_id: int, db: Session = Depends(get_db)) -> None:
    preset = db.get(CalculatorPreset, preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Preset not found.")
    db.delete(preset)
    db.commit()
