from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.crisis_note import NoteType, Priority


class HealthResponse(BaseModel):
    status: str = "ok"


# ── Characters ──────────────────────────────────────────────────────────────

class CharacterCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    region: str | None = Field(default=None, max_length=255)


class CharacterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    region: str | None = None
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


# ── Qing: indicators, calculator, history ────────────────────────────────────

from typing import Literal  # noqa: E402

from pydantic import model_validator  # noqa: E402

from app.models.qing import ActionKind, Indicator, RunStatus  # noqa: E402


class IndicatorRow(BaseModel):
    character_id: int
    name: str
    region: str | None
    legitimacy: float
    military: float
    economics: float
    notes: str | None
    efficiency: float  # all indicators, current stored values
    published_efficiency: float | None  # what the map shows now


class ScoreEdit(BaseModel):
    character_id: int
    indicator: Indicator
    mode: Literal["set", "add"] = "set"
    value: float


class ScoreEditRequest(BaseModel):
    edits: list[ScoreEdit] = Field(min_length=1)
    note: str | None = None


class BandSetting(BaseModel):
    max: float | None  # exclusive upper bound; null = no upper bound (last band only)
    label: str = Field(min_length=1, max_length=255)
    tip: str = Field(min_length=1)
    outcomes: list[str] = []


class EfficiencySettingsBody(BaseModel):
    scale_max: float = Field(gt=0)
    bands: list[BandSetting] = Field(min_length=1)

    @model_validator(mode="after")
    def _check(self) -> "EfficiencySettingsBody":
        *head, last = self.bands
        if last.max is not None:
            raise ValueError("The last band must have max = null.")
        maxes = [b.max for b in head]
        if any(m is None for m in maxes) or maxes != sorted(maxes) or len(set(maxes)) != len(maxes):
            raise ValueError("Band 'max' values must be strictly ascending.")
        return self


class EfficiencySettingsResponse(BaseModel):
    scale_max: float
    bands: list[BandSetting]


class RunCreate(BaseModel):
    character_ids: list[int] = Field(min_length=1)
    # Omit for all indicators.
    indicators: list[Indicator] | None = Field(default=None, min_length=1)


class RunResultRow(BaseModel):
    character_id: int
    name: str
    efficiency: float
    inputs: dict[str, float]


class RunResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    character_ids: list[int]
    indicators: list[str]
    results: list[RunResultRow]
    average: float
    band_label: str
    tip: str
    outcomes: list[str]
    status: RunStatus
    created_at: datetime
    published_at: datetime | None


class ActionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: ActionKind
    payload: dict
    note: str | None
    created_by: str | None
    created_at: datetime
    reverted_at: datetime | None


class PublicScore(BaseModel):
    character_id: int
    name: str
    efficiency: float


class NotesBody(BaseModel):
    notes: str | None = None


class GroupBody(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    character_ids: list[int] = Field(min_length=1)


class GroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    character_ids: list[int]
