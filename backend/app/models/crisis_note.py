from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, String, Text, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy import func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Priority(str, enum.Enum):
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"


class NoteType(str, enum.Enum):
    PRIVATE_DIRECTIVE = "PRIVATE_DIRECTIVE"
    PUBLIC_DIRECTIVE = "PUBLIC_DIRECTIVE"


class Faction(Base):
    """A clique of characters, like Zhili or the Federalists. Its members
    share its colour on the map."""

    __tablename__ = "factions"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class Character(Base):
    __tablename__ = "characters"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    # Indicator scores (0-5) set by the backrooms. They belong to the
    # delegate, not to any province, so they travel with them on conquest.
    reputation: Mapped[float] = mapped_column(Float, nullable=False, default=2.5, server_default="2.5")
    economics: Mapped[float] = mapped_column(Float, nullable=False, default=2.5, server_default="2.5")
    military: Mapped[float] = mapped_column(Float, nullable=False, default=2.5, server_default="2.5")
    # The efficiency rating last confirmed in the calculator and sent to the
    # map. Null until the backrooms publish one.
    published_efficiency: Mapped[float | None] = mapped_column(Float, nullable=True)
    # The faction (clique) the character belongs to, if any.
    faction_id: Mapped[int | None] = mapped_column(
        ForeignKey("factions.id", ondelete="SET NULL"), nullable=True
    )
    faction: Mapped[Faction | None] = relationship("Faction", lazy="joined")
    # The province they're based in; their pin goes there when the map
    # places everyone automatically.
    home_province_id: Mapped[str | None] = mapped_column(
        ForeignKey("provinces.id", ondelete="SET NULL"), nullable=True
    )
    # The character's own map colour (hex), used when they have no faction
    # or their faction has no colour; and a free-form scratchpad for staff.
    color: Mapped[str | None] = mapped_column(String(16), nullable=True)
    staff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Pin position on the map, in map-space units (see frontend
    # lib/map/qingGeometry.json); null while the character is off the map.
    x: Mapped[float | None] = mapped_column(Float, nullable=True)
    y: Mapped[float | None] = mapped_column(Float, nullable=True)

    crisis_notes: Mapped[list[CrisisNote]] = relationship(
        "CrisisNote", back_populates="character", cascade="all, delete-orphan"
    )

    @property
    def display_color(self) -> str | None:
        """The colour the map draws them in: their faction's, else their own."""
        if self.faction is not None and self.faction.color:
            return self.faction.color
        return self.color


class CrisisPeriod(Base):
    __tablename__ = "crisis_periods"
    __table_args__ = (
        # Postgres partial unique index: at most one row can have is_active
        # true at a time. Makes "only one active period" a DB-level
        # guarantee instead of a check-then-insert race in the API layer.
        Index(
            "ix_crisis_periods_one_active",
            "is_active",
            unique=True,
            postgresql_where=text("is_active"),
            sqlite_where=text("is_active"),  # same rule in the test database
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    crisis_notes: Mapped[list[CrisisNote]] = relationship(
        "CrisisNote", back_populates="period"
    )
    staff_notes: Mapped[list[StaffNote]] = relationship(
        "StaffNote", back_populates="period"
    )

    @property
    def note_count(self) -> int:
        return len(self.crisis_notes)


class CrisisNote(Base):
    __tablename__ = "crisis_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    character_id: Mapped[int] = mapped_column(
        ForeignKey("characters.id", ondelete="CASCADE"), nullable=False
    )
    period_id: Mapped[int] = mapped_column(
        ForeignKey("crisis_periods.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    crisis_staff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    priority: Mapped[Priority] = mapped_column(
        SAEnum(Priority, name="priority_enum"), nullable=False
    )
    note_type: Mapped[NoteType] = mapped_column(
        SAEnum(NoteType, name="note_type_enum"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    character: Mapped[Character] = relationship("Character", back_populates="crisis_notes")
    period: Mapped[CrisisPeriod] = relationship("CrisisPeriod", back_populates="crisis_notes")


class StaffNote(Base):
    __tablename__ = "staff_notes"

    id: Mapped[int] = mapped_column(primary_key=True)
    period_id: Mapped[int] = mapped_column(
        ForeignKey("crisis_periods.id", ondelete="RESTRICT"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    period: Mapped[CrisisPeriod] = relationship("CrisisPeriod", back_populates="staff_notes")
