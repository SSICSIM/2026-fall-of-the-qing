"""Fall of Qing mechanics: efficiency settings, calculation runs, groups, undo history.

Delegates reuse the existing ``characters`` table, which now carries each
delegate's three indicators, backroom notes and published efficiency. Scores
belong to the delegate (not to a region), because several delegates can share one.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import JSON, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Indicator(str, enum.Enum):
    LEGITIMACY = "LEGITIMACY"
    MILITARY = "MILITARY"
    ECONOMICS = "ECONOMICS"


class ActionKind(str, enum.Enum):
    SCORE_EDIT = "SCORE_EDIT"
    PUBLISH = "PUBLISH"


class RunStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    REVERTED = "REVERTED"


class DelegateGroup(Base):
    """Saved selection of delegates (a "group preset") for the calculator and bulk edits."""

    __tablename__ = "delegate_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    character_ids: Mapped[list] = mapped_column(JSON, nullable=False)


class EfficiencySettings(Base):
    """Singleton row (id=1). Holds everything the director may want to retune."""

    __tablename__ = "efficiency_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    scale_max: Mapped[float] = mapped_column(Float, nullable=False)
    # [{"max": 0.5|null, "label", "tip", "outcomes": [...]}, ...] ascending by max;
    # "max" is an exclusive upper bound, null on the last band.
    bands: Mapped[list] = mapped_column(JSON, nullable=False)


class CalculationRun(Base):
    __tablename__ = "calculation_runs"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    indicators: Mapped[list] = mapped_column(JSON, nullable=False)
    # [{"character_id", "name", "efficiency", "inputs": {"LEGITIMACY": 60, ...}}]
    results: Mapped[list] = mapped_column(JSON, nullable=False)
    average: Mapped[float] = mapped_column(Float, nullable=False)
    band_label: Mapped[str] = mapped_column(String(255), nullable=False)
    tip: Mapped[str] = mapped_column(Text, nullable=False)
    outcomes: Mapped[list] = mapped_column(JSON, nullable=False)
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, name="run_status_enum"), nullable=False, default=RunStatus.DRAFT
    )
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ActionLog(Base):
    """Ordered, reversible history. Undo always reverses the newest un-reverted row."""

    __tablename__ = "action_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[ActionKind] = mapped_column(
        SAEnum(ActionKind, name="action_kind_enum"), nullable=False
    )
    # SCORE_EDIT: {"changes": [{"character_id", "indicator", "old", "new"}]}
    # PUBLISH:    {"run_id", "before": [{"character_id", "efficiency"|null}], "after": [...]}
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    reverted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
