"""Map and calculator state for the Fall of the Qing committee."""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Boolean, Column, DateTime, Float, ForeignKey, String, Table, Text, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.crisis_note import Character


class Province(Base):
    """Who holds a province. The shapes themselves live in the frontend."""

    __tablename__ = "provinces"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    # Owner of the land. When occupier is set too, the province is drawn
    # hatched: owned by one delegate, held by another's troops.
    controller_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    occupier_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )

    controller: Mapped[Character | None] = relationship("Character", foreign_keys=[controller_id])
    # Another delegate disputing the province: drawn in both sides' stripes
    # until the backrooms settle it.
    contested_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )

    occupier: Mapped[Character | None] = relationship("Character", foreign_keys=[occupier_id])
    # Characters sharing the province with the controller, like a clique
    # sharing its coloured region in the character guide. Empty when the
    # controller holds it alone.
    co_holder_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False, default=list)
    # Redrawn outline ([[x, y], ...] in map units) replacing the province's
    # preset shape; null means the original border.
    shape: Mapped[list[list[float]] | None] = mapped_column(JSON, nullable=True)


class AnnotationKind(str, enum.Enum):
    LINE = "LINE"  # freehand border / front line drawn by staff
    PIN = "PIN"  # war pin, optionally tied to a crisis note


class MapAnnotation(Base):
    __tablename__ = "map_annotations"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[AnnotationKind] = mapped_column(
        SAEnum(AnnotationKind, name="annotation_kind_enum"), nullable=False
    )
    # Map-space coordinates ([[x, y], ...]); a pin has exactly one point.
    points: Mapped[list[list[float]]] = mapped_column(JSON, nullable=False)
    label: Mapped[str | None] = mapped_column(String(255), nullable=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    dashed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    crisis_note_id: Mapped[int | None] = mapped_column(
        ForeignKey("crisis_notes.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class HistoryKind(str, enum.Enum):
    SCORE_EDIT = "SCORE_EDIT"
    PUBLISH = "PUBLISH"
    INVASION = "INVASION"
    PROVINCE_EDIT = "PROVINCE_EDIT"
    MOVE = "MOVE"
    BORDER = "BORDER"


class HistoryBatch(Base):
    """One staff action (score edit, publish, invasion…) — the unit of undo."""

    __tablename__ = "history_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[HistoryKind] = mapped_column(
        SAEnum(HistoryKind, name="history_kind_enum"), nullable=False
    )
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    crisis_note_id: Mapped[int | None] = mapped_column(
        ForeignKey("crisis_notes.id", ondelete="SET NULL"), nullable=True
    )
    reverted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    entries: Mapped[list[HistoryEntry]] = relationship(
        "HistoryEntry", back_populates="batch", cascade="all, delete-orphan"
    )


class HistoryEntry(Base):
    __tablename__ = "history_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[int] = mapped_column(
        ForeignKey("history_batches.id", ondelete="CASCADE"), nullable=False
    )
    # "character" or "province"; target_id is the row's primary key as text.
    target_type: Mapped[str] = mapped_column(String(32), nullable=False)
    target_id: Mapped[str] = mapped_column(String(64), nullable=False)
    field: Mapped[str] = mapped_column(String(64), nullable=False)
    old_value: Mapped[Any] = mapped_column(JSON, nullable=True)
    new_value: Mapped[Any] = mapped_column(JSON, nullable=True)

    batch: Mapped[HistoryBatch] = relationship("HistoryBatch", back_populates="entries")


class CalculatorSettings(Base):
    """The efficiency formula's editable parameters. A single row (id 1);
    no row means the PRD defaults in app/services/efficiency.py."""

    __tablename__ = "calculator_settings"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Each score is divided by this before the geometric mean (PRD: 2.5).
    midpoint: Mapped[float] = mapped_column(Float, nullable=False)
    # [{key, label, tone, min_rating, tips}], worst band first.
    bands: Mapped[list[dict[str, Any]]] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CalculatorPreset(Base):
    """A named group of delegates for quick selection in the calculator."""

    __tablename__ = "calculator_presets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    character_ids: Mapped[list[int]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )



class ConflictStatus(str, enum.Enum):
    ONGOING = "ONGOING"
    RESOLVED = "RESOLVED"


conflict_parties = Table(
    "conflict_parties",
    Base.metadata,
    Column("conflict_id", ForeignKey("conflicts.id", ondelete="CASCADE"), primary_key=True),
    Column("character_id", ForeignKey("characters.id", ondelete="CASCADE"), primary_key=True),
)


class Conflict(Base):
    """A battle or standoff between characters, drawn on the map above them."""

    __tablename__ = "conflicts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[ConflictStatus] = mapped_column(
        SAEnum(ConflictStatus, name="conflict_status_enum"),
        nullable=False,
        default=ConflictStatus.ONGOING,
    )
    winner_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    outcome_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    crisis_note_id: Mapped[int | None] = mapped_column(
        ForeignKey("crisis_notes.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    parties: Mapped[list[Character]] = relationship(
        "Character", secondary=conflict_parties, order_by="Character.name"
    )



class TerritoryStatus(str, enum.Enum):
    ANNEXED = "ANNEXED"  # the holder's land outright: solid
    OCCUPIED = "OCCUPIED"  # held by the holder's troops: striped
    CONTESTED = "CONTESTED"  # fought over by holder and defender: both colours


class Territory(Base):
    """Part of the map taken in an invasion: an area drawn by staff, so a
    delegate can seize part of a province (or a strip across several)."""

    __tablename__ = "territories"

    id: Mapped[int] = mapped_column(primary_key=True)
    holder_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False
    )
    defender_id: Mapped[int | None] = mapped_column(
        ForeignKey("characters.id", ondelete="SET NULL"), nullable=True
    )
    # The province it was taken from, for labelling; the area may spill over.
    province_id: Mapped[str | None] = mapped_column(
        ForeignKey("provinces.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[TerritoryStatus] = mapped_column(
        SAEnum(TerritoryStatus, name="territory_status_enum"), nullable=False
    )
    # Closed outline in map units ([[x, y], ...]).
    polygon: Mapped[list[list[float]]] = mapped_column(JSON, nullable=False)
    crisis_note_id: Mapped[int | None] = mapped_column(
        ForeignKey("crisis_notes.id", ondelete="SET NULL"), nullable=True
    )
    # Soft-deleted so removing a territory (or undoing its invasion) is reversible.
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
