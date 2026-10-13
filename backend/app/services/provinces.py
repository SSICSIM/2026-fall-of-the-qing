"""The provinces on the committee map.

Keep in sync with frontend/scripts/build-qing-map.mjs, which draws them.
"""

from __future__ import annotations

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
    """Return every province row, creating any that don't exist yet."""
    existing = {p.id: p for p in db.query(Province).all()}
    missing = [pid for pid in PROVINCE_IDS if pid not in existing]
    if missing:
        for pid in missing:
            province = Province(id=pid)
            db.add(province)
            existing[pid] = province
        db.commit()
    return [existing[pid] for pid in PROVINCE_IDS]


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
