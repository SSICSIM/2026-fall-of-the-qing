from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.crisis_note import NoteType, Priority
from app.models.war_room import AnnotationKind, ConflictStatus, HistoryKind, TerritoryStatus


class HealthResponse(BaseModel):
    status: str = "ok"


# ── Characters ──────────────────────────────────────────────────────────────

class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    # Home provinces: the character becomes the controller of any that are
    # unclaimed and shares the rest with whoever holds them.
    province_ids: list[str] = Field(default_factory=list, max_length=27)
    faction_id: int | None = None
    # Where to drop their pin; omit both to leave them off the map.
    x: float | None = None
    y: float | None = None


class CharacterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_at: datetime


# ── Crisis Periods ───────────────────────────────────────────────────────────

class CrisisPeriodCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class CrisisPeriodResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    is_active: bool
    created_at: datetime
    archived_at: datetime | None


# ── Crisis Notes ─────────────────────────────────────────────────────────────

class CrisisNoteCreate(BaseModel):
    character_id: int
    # Optional: lets the client assert which period it expects the note to
    # land in, so create_note can reject a stale submission (see there) if
    # the active period has since changed. Omit to just use whatever period
    # is currently active.
    period_id: int | None = None
    title: str = Field(min_length=1, max_length=512)
    description: str = Field(min_length=1)
    crisis_staff_notes: str | None = None
    priority: Priority
    note_type: NoteType


class CrisisNoteUpdate(BaseModel):
    character_id: int | None = None
    title: str | None = Field(default=None, min_length=1, max_length=512)
    description: str | None = Field(default=None, min_length=1)
    crisis_staff_notes: str | None = None
    priority: Priority | None = None
    note_type: NoteType | None = None


class CrisisNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    period_id: int
    character: CharacterResponse
    title: str
    description: str
    crisis_staff_notes: str | None
    priority: Priority
    note_type: NoteType
    created_at: datetime


# ── Staff Notes ───────────────────────────────────────────────────────────────

class StaffNoteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=512)
    content: str = Field(min_length=1)


class StaffNoteUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=512)
    content: str | None = Field(default=None, min_length=1)


class StaffNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    period_id: int
    title: str
    content: str
    created_at: datetime


# ── Bulk upload ──────────────────────────────────────────────────────────────

class BulkUploadResult(BaseModel):
    created: int
    skipped: int


# ── Analytics ────────────────────────────────────────────────────────────────

class NotesByCharacter(BaseModel):
    character_name: str
    count: int


class PriorityCount(BaseModel):
    priority: Priority
    count: int


class AnalyticsSummary(BaseModel):
    total_notes: int
    notes_by_character: list[NotesByCharacter]
    priority_distribution: list[PriorityCount]
    private_directive_count: int
    public_directive_count: int


# ── Delegates & scores ───────────────────────────────────────────────────────

Score = Annotated[float, Field(ge=0, le=5)]
Indicator = Literal["reputation", "economics", "military"]
HexColor = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class DelegateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    reputation: float
    economics: float
    military: float
    published_efficiency: float | None
    # The map colour: the faction's when it has one, else the character's own.
    color: str | None = Field(validation_alias="display_color")
    faction_id: int | None
    home_province_id: str | None
    staff_notes: str | None
    x: float | None
    y: float | None


class PinPlacement(BaseModel):
    character_id: int
    x: float = Field(ge=0, le=2000)
    y: float = Field(ge=0, le=2000)


class BulkPositionUpdate(BaseModel):
    positions: list[PinPlacement] = Field(min_length=1, max_length=500)
    reason: str | None = None


class PositionUpdate(BaseModel):
    # Both null takes the character off the map.
    x: float | None = Field(default=None, ge=0, le=2000)
    y: float | None = Field(default=None, ge=0, le=2000)
    reason: str | None = None


class ScoreUpdate(BaseModel):
    character_id: int
    reputation: Score | None = None
    economics: Score | None = None
    military: Score | None = None


class BulkScoreUpdate(BaseModel):
    updates: list[ScoreUpdate] = Field(min_length=1)
    reason: str | None = None
    crisis_note_id: int | None = None


class DelegateProfileUpdate(BaseModel):
    color: HexColor | None = None
    staff_notes: str | None = None
    faction_id: int | None = None
    home_province_id: str | None = None


class FactionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    color: HexColor | None = None


class FactionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    color: HexColor | None = None


class FactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str | None


# ── Calculator ───────────────────────────────────────────────────────────────

class EfficiencyRequest(BaseModel):
    character_ids: list[int] = Field(min_length=1)
    # Empty / omitted → all three indicators.
    indicators: list[Indicator] = Field(default_factory=list)


class BandResponse(BaseModel):
    key: str
    label: str
    tone: str
    tips: list[str]


class DelegateEfficiency(BaseModel):
    character_id: int
    name: str
    efficiency: float


class EfficiencyResponse(BaseModel):
    indicators: list[Indicator]
    efficiency: float
    band: BandResponse
    delegates: list[DelegateEfficiency]


class BandSetting(BaseModel):
    key: str = Field(default="", max_length=64)
    label: str = Field(min_length=1, max_length=80)
    tone: Literal["bad", "neutral", "good"]
    min_rating: float = Field(ge=0, le=10)
    tips: list[Annotated[str, Field(min_length=1, max_length=200)]] = Field(default_factory=list, max_length=12)


class FormulaSettings(BaseModel):
    # Each score is divided by this; 2.5 makes an average delegate rate 1.00.
    midpoint: float = Field(gt=0, le=5)
    # Worst first: the first band starts at 0, each next one higher.
    bands: list[BandSetting] = Field(min_length=1, max_length=8)

    @model_validator(mode="after")
    def _ordered(self) -> "FormulaSettings":
        if self.bands[0].min_rating != 0:
            raise ValueError("The first band must start at 0.")
        mins = [b.min_rating for b in self.bands]
        if any(a >= b for a, b in zip(mins, mins[1:])):
            raise ValueError("Each band must start higher than the one before it.")
        return self


class FormulaResponse(FormulaSettings):
    is_default: bool


class PublishRequest(EfficiencyRequest):
    reason: str | None = None
    crisis_note_id: int | None = None


class PresetCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    character_ids: list[int] = Field(min_length=1)


class PresetResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    character_ids: list[int]


# ── History ──────────────────────────────────────────────────────────────────

class HistoryEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    target_type: str
    target_id: str
    field: str
    old_value: Any
    new_value: Any


class HistoryBatchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: HistoryKind
    summary: str
    reason: str | None
    crisis_note_id: int | None
    reverted: bool
    created_at: datetime
    entries: list[HistoryEntryResponse]


# ── Map ──────────────────────────────────────────────────────────────────────

Point = Annotated[list[float], Field(min_length=2, max_length=2)]


class ProvinceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    controller_id: int | None
    # Characters sharing the province with the controller.
    co_holder_ids: list[int]
    occupier_id: int | None
    contested_by_id: int | None
    shape: list[list[float]] | None


class ProvinceShapeUpdate(BaseModel):
    # The new outline; null restores the original border.
    shape: list[Point] | None = Field(default=None, min_length=3, max_length=6000)
    # Neighbours whose border moved along with it, by province id; saved in
    # the same undo step.
    neighbour_shapes: dict[str, Annotated[list[Point], Field(min_length=3, max_length=6000)]] = Field(
        default_factory=dict, max_length=26
    )
    crisis_note_id: int | None = None
    reason: str | None = None


class ProvinceUpdate(BaseModel):
    controller_id: int | None = None
    co_holder_ids: list[int] | None = None
    occupier_id: int | None = None
    contested_by_id: int | None = None
    reason: str | None = None


class AnnotationCreate(BaseModel):
    kind: AnnotationKind
    points: list[Point] = Field(min_length=1, max_length=5000)
    label: str | None = Field(default=None, max_length=255)
    color: HexColor | None = None
    dashed: bool = False
    crisis_note_id: int | None = None


class AnnotationUpdate(BaseModel):
    label: str | None = Field(default=None, max_length=255)
    crisis_note_id: int | None = None


class AnnotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: AnnotationKind
    points: list[list[float]]
    label: str | None
    color: str | None
    dashed: bool
    crisis_note_id: int | None
    created_at: datetime


class ConflictParty(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class ConflictCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    party_ids: list[int] = Field(min_length=2)
    crisis_note_id: int | None = None


class ConflictResolve(BaseModel):
    winner_id: int | None = None
    outcome_summary: str | None = None


class ConflictResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: ConflictStatus
    parties: list[ConflictParty]
    winner_id: int | None
    outcome_summary: str | None
    crisis_note_id: int | None
    created_at: datetime
    resolved_at: datetime | None


class TerritoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    holder_id: int
    defender_id: int | None
    province_id: str | None
    status: TerritoryStatus
    polygon: list[list[float]]
    crisis_note_id: int | None
    created_at: datetime


class TerritoryCreate(BaseModel):
    """Land changing hands outside an invasion, e.g. as a conflict's outcome."""

    holder_id: int
    defender_id: int | None = None
    province_id: str | None = None
    status: TerritoryStatus = TerritoryStatus.ANNEXED
    polygon: list[Point] = Field(min_length=3, max_length=6000)
    crisis_note_id: int | None = None
    reason: str | None = None


class TerritoryUpdate(BaseModel):
    status: TerritoryStatus | None = None
    holder_id: int | None = None
    reason: str | None = None


class MapStateResponse(BaseModel):
    provinces: list[ProvinceResponse]
    delegates: list[DelegateResponse]
    factions: list[FactionResponse]
    annotations: list[AnnotationResponse]
    conflicts: list[ConflictResponse]
    territories: list[TerritoryResponse]


class ScoreDeltas(BaseModel):
    reputation: float = Field(default=0, ge=-5, le=5)
    economics: float = Field(default=0, ge=-5, le=5)
    military: float = Field(default=0, ge=-5, le=5)


class InvasionRequest(BaseModel):
    attacker_id: int
    # Whole provinces taken. Leave empty when `area` is given; then the first
    # id (if any) only records which province the area was cut from.
    province_ids: list[str] = Field(default_factory=list)
    # A drawn outline of just the land taken (part of a province, or a strip
    # across several). When set, provinces themselves don't change hands.
    area: list[Point] | None = Field(default=None, min_length=3, max_length=6000)
    # The private directive that ordered the invasion. Required: every
    # change of hands must trace back to a directive.
    crisis_note_id: int
    # OCCUPY: land stays owned by its controller, attacker's troops hold it
    # (striped). ANNEX: attacker becomes the controller outright. CONTEST:
    # the land is disputed between the two sides until resolved.
    mode: Literal["OCCUPY", "ANNEX", "CONTEST"] = "OCCUPY"
    attacker_deltas: ScoreDeltas = Field(default_factory=ScoreDeltas)
    defender_id: int | None = None
    defender_deltas: ScoreDeltas = Field(default_factory=ScoreDeltas)
    reason: str | None = None

    @model_validator(mode="after")
    def _something_taken(self) -> InvasionRequest:
        if not self.province_ids and self.area is None:
            raise ValueError("Choose provinces or draw the area taken.")
        return self
