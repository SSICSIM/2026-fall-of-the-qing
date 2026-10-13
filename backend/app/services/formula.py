"""The efficiency formula's current parameters: staff edits if saved,
otherwise the PRD defaults."""

from __future__ import annotations

import re
from dataclasses import asdict, dataclass

from sqlalchemy.orm import Session

from app.models.war_room import CalculatorSettings
from app.services.efficiency import BANDS, SCORE_MIDPOINT, Band

SETTINGS_ID = 1


@dataclass(frozen=True)
class Formula:
    midpoint: float
    bands: tuple[Band, ...]
    is_default: bool


DEFAULT = Formula(SCORE_MIDPOINT, BANDS, True)


def _key(label: str, index: int) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", label.lower()).strip("-")
    return slug or f"band-{index + 1}"


def load_formula(db: Session) -> Formula:
    row = db.get(CalculatorSettings, SETTINGS_ID)
    if row is None:
        return DEFAULT
    bands = tuple(
        Band(
            key=b.get("key") or _key(b["label"], i),
            label=b["label"],
            tone=b["tone"],
            min_rating=b["min_rating"],
            tips=tuple(b["tips"]),
        )
        for i, b in enumerate(row.bands)
    )
    return Formula(row.midpoint, bands, False)


def save_formula(db: Session, midpoint: float, bands: list[dict]) -> Formula:
    row = db.get(CalculatorSettings, SETTINGS_ID)
    stored = [
        {**b, "key": b.get("key") or _key(b["label"], i), "tips": list(b["tips"])}
        for i, b in enumerate(bands)
    ]
    if row is None:
        db.add(CalculatorSettings(id=SETTINGS_ID, midpoint=midpoint, bands=stored))
    else:
        row.midpoint = midpoint
        row.bands = stored
    db.commit()
    return load_formula(db)


def reset_formula(db: Session) -> Formula:
    row = db.get(CalculatorSettings, SETTINGS_ID)
    if row is not None:
        db.delete(row)
        db.commit()
    return DEFAULT


def band_dicts(formula: Formula) -> list[dict]:
    return [{**asdict(b), "tips": list(b.tips)} for b in formula.bands]
