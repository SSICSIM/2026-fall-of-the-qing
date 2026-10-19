"""The provinces on the committee map.

Keep in sync with frontend/scripts/build-qing-map.mjs, which draws them.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy.orm import Session

from app.models.war_room import Province

if TYPE_CHECKING:
    from app.services.history import Recorder

PROVINCE_IDS: tuple[str, ...] = (
    "xinjiang",
    "tibet",
    "qinghai",
    "gansu",
    "mongolia",
    "inner_mongolia",
    "heilongjiang",
    "jilin",
    "fengtian",
    "rehe",
    "zhili",
    "shanxi",
    "shaanxi",
    "shandong",
    "henan",
    "jiangsu",
    "anhui",
    "zhejiang",
    "jiangxi",
    "fujian",
    "hubei",
    "hunan",
    "sichuan",
    "guizhou",
    "yunnan",
    "guangxi",
    "guangdong",
)


def ensure_provinces(db: Session) -> list[Province]:
    """Return every province row, creating any preset ones that don't exist
    yet: the presets in map order, then provinces staff added, oldest first."""
    existing = {p.id: p for p in db.query(Province).all()}
    missing = [pid for pid in PROVINCE_IDS if pid not in existing]
    if missing:
        for pid in missing:
            province = Province(id=pid)
            db.add(province)
            existing[pid] = province
        db.commit()
    # A staff-added province without a shape has been removed (kept so undo
    # can bring it back).
    added = sorted((p for p in existing.values() if p.custom and p.shape), key=lambda p: p.id)
    return [existing[pid] for pid in PROVINCE_IDS] + added


def get_province(db: Session, province_id: str) -> Province | None:
    """A province on the map, preset or added; None if unknown or removed."""
    return next((p for p in ensure_provinces(db) if p.id == province_id), None)


def province_name(province: Province) -> str:
    """Preset ids read as their names (inner_mongolia → Inner Mongolia)."""
    return province.name or province.id.replace("_", " ").title()


def find_province(db: Session, text: str) -> Province | None:
    """The province a person typed, by id or by name, ignoring case and
    spaces vs underscores."""
    key = text.strip().lower().replace(" ", "_").replace("-", "_")
    for province in ensure_provinces(db):
        if key in (province.id, province_name(province).lower().replace(" ", "_")):
            return province
    return None


def slug(name: str) -> str:
    """An id for a new province: its name, lowercased with underscores."""
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")[:64]


def holder_ids(province: Province) -> list[int]:
    """Everyone holding the province: the controller first, then anyone
    sharing it. One entry means a single character holds it alone."""
    if province.controller_id is None:
        return []
    return [province.controller_id, *province.co_holder_ids]


def set_holders(
    recorder: Recorder, province: Province, controller_id: int | None, co_holder_ids: list[int]
) -> None:
    """Assign who holds a province. Co-holders are de-duplicated and never
    include the controller; an unclaimed province has no co-holders."""
    co: list[int] = []
    if controller_id is not None:
        co = [i for i in dict.fromkeys(co_holder_ids) if i != controller_id]
    recorder.set(province, "controller_id", controller_id)
    recorder.set(province, "co_holder_ids", co)


def add_holder(recorder: Recorder, province: Province, character_id: int) -> None:
    """Give a character a stake in a province: it's theirs if unclaimed,
    otherwise they share it with the current holders."""
    if province.controller_id is None:
        set_holders(recorder, province, character_id, [])
    elif character_id not in holder_ids(province):
        set_holders(recorder, province, province.controller_id, [*province.co_holder_ids, character_id])
