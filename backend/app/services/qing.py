"""Database-backed operations for the Qing mechanics: settings, indicator edits,
calculation runs, publishing to the map, and undo.

All state changes that staff may want to reverse write an ``ActionLog`` row.
Undo always reverses the newest un-reverted action, so history stays consistent.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.crisis_note import Character
from app.models.qing import (
    ActionKind,
    ActionLog,
    CalculationRun,
    EfficiencySettings,
    Indicator,
    RunStatus,
)
from app.services import efficiency as eff

_ATTR = {
    Indicator.LEGITIMACY.value: "legitimacy",
    Indicator.MILITARY.value: "military",
    Indicator.ECONOMICS.value: "economics",
}


class ServiceError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ── settings & indicator rows ────────────────────────────────────────────────

def get_settings(db: Session) -> EfficiencySettings:
    row = db.get(EfficiencySettings, 1)
    if row is None:
        row = EfficiencySettings(
            id=1,
            scale_max=eff.DEFAULT_SCALE_MAX,
            bands=[dict(b) for b in eff.DEFAULT_BANDS],
        )
        db.add(row)
        db.flush()
    return row


def values_of(char: Character) -> dict[str, float]:
    return {ind: getattr(char, attr) for ind, attr in _ATTR.items()}


# ── indicator edits ──────────────────────────────────────────────────────────

def apply_score_edits(
    db: Session, edits: list[dict], note: str | None, user: str | None
) -> ActionLog:
    """edits: [{character_id, indicator, mode: 'set'|'add', value}]. Values are clamped to
    [0, scale_max]; the log stores the *actual* old/new so undo is exact."""
    if not edits:
        raise ServiceError(422, "No edits supplied.")
    settings = get_settings(db)
    changes: list[dict] = []
    for e in edits:
        cid = e["character_id"]
        row = db.get(Character, cid)
        if row is None:
            raise ServiceError(404, f"Delegate {cid} not found.")
        attr = _ATTR[e["indicator"]]
        old = getattr(row, attr)
        raw = e["value"] if e["mode"] == "set" else old + e["value"]
        new = min(max(raw, 0.0), settings.scale_max)
        if new != old:
            setattr(row, attr, new)
            changes.append(
                {"character_id": cid, "indicator": e["indicator"], "old": old, "new": new}
            )
    if not changes:
        raise ServiceError(422, "These edits would not change any value.")
    log = ActionLog(
        kind=ActionKind.SCORE_EDIT, payload={"changes": changes}, note=note, created_by=user
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── calculation runs ─────────────────────────────────────────────────────────

def create_run(
    db: Session, character_ids: list[int], indicators: list[str] | None, user: str | None
) -> CalculationRun:
    settings = get_settings(db)
    selected = indicators or [i.value for i in Indicator]
    ids = list(dict.fromkeys(character_ids))  # de-dupe, keep order
    results: list[dict] = []
    for cid in ids:
        char = db.get(Character, cid)
        if char is None:
            raise ServiceError(404, f"Delegate {cid} not found.")
        vals = values_of(char)
        try:
            score = eff.compute_efficiency(vals, selected, settings.scale_max)
        except eff.EfficiencyError as exc:
            raise ServiceError(422, str(exc))
        results.append(
            {"character_id": cid, "name": char.name, "efficiency": score, "inputs": vals}
        )
    try:
        avg = eff.average([r["efficiency"] for r in results])
    except eff.EfficiencyError as exc:
        raise ServiceError(422, str(exc))
    band = eff.interpret(avg, settings.bands)
    run = CalculationRun(
        character_ids=ids,
        indicators=selected,
        results=results,
        average=avg,
        band_label=band["label"],
        tip=band["tip"],
        outcomes=band["outcomes"],
        status=RunStatus.DRAFT,
        created_by=user,
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def publish_run(db: Session, run_id: int, user: str | None) -> ActionLog:
    run = db.get(CalculationRun, run_id)
    if run is None:
        raise ServiceError(404, "Calculation run not found.")
    if run.status != RunStatus.DRAFT:
        raise ServiceError(409, f"This calculation is already {run.status.value.lower()}.")
    # Refuse to publish numbers computed from scores that have since changed.
    for r in run.results:
        char = db.get(Character, r["character_id"])
        if char is None or values_of(char) != r["inputs"]:
            raise ServiceError(
                409, "Scores changed since this calculation. Recalculate before sending."
            )
    before, after = [], []
    for r in run.results:
        cid, score = r["character_id"], r["efficiency"]
        char = db.get(Character, cid)
        before.append({"character_id": cid, "efficiency": char.published_efficiency})
        char.published_efficiency = score
        after.append({"character_id": cid, "efficiency": score})
    run.status = RunStatus.PUBLISHED
    run.published_at = _now()
    log = ActionLog(
        kind=ActionKind.PUBLISH,
        payload={"run_id": run.id, "before": before, "after": after},
        created_by=user,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── undo ─────────────────────────────────────────────────────────────────────

def undo_last(db: Session) -> ActionLog:
    log = (
        db.query(ActionLog)
        .filter(ActionLog.reverted_at.is_(None))
        .order_by(ActionLog.id.desc())
        .first()
    )
    if log is None:
        raise ServiceError(404, "Nothing to undo.")
    if log.kind == ActionKind.SCORE_EDIT:
        for c in log.payload["changes"]:
            char = db.get(Character, c["character_id"])
            if char is not None:
                setattr(char, _ATTR[c["indicator"]], c["old"])
    else:
        for b in log.payload["before"]:
            char = db.get(Character, b["character_id"])
            if char is not None:
                char.published_efficiency = b["efficiency"]
        run = db.get(CalculationRun, log.payload["run_id"])
        if run is not None:
            run.status = RunStatus.REVERTED
    log.reverted_at = _now()
    db.commit()
    db.refresh(log)
    return log
