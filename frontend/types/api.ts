export interface HealthResponse {
  status: string;
}

export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type NoteType = "PRIVATE_DIRECTIVE" | "PUBLIC_DIRECTIVE";

// ── Characters ───────────────────────────────────────────────────────────────

export interface CharacterResponse {
  id: number;
  name: string;
  created_at: string;
}

export interface CharacterCreate {
  name: string;
  /** Home provinces: unclaimed ones become theirs, the rest are shared. */
  province_ids?: string[];
  faction_id?: number;
  /** Initial pin position; omit both to leave them off the map. */
  x?: number;
  y?: number;
}

export interface BulkUploadResult {
  created: number;
  skipped: number;
  /** "Name: typed province" for rows whose province matched nothing. */
  unknown_provinces: string[];
}

// ── Crisis Periods ────────────────────────────────────────────────────────────

export interface CrisisPeriodResponse {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
  note_count: number;
}

export interface CrisisPeriodCreate {
  name: string;
}

// ── Crisis Notes ──────────────────────────────────────────────────────────────

export interface CrisisNoteResponse {
  id: number;
  period_id: number;
  character: CharacterResponse;
  title: string;
  description: string;
  crisis_staff_notes: string | null;
  priority: Priority;
  note_type: NoteType;
  created_at: string;
}

export interface CrisisNoteCreate {
  character_id: number;
  // The period the client expects the note to land in. The backend rejects
  // the submission (409) if the active period has changed since, instead of
  // silently filing it under a different period than the user saw.
  period_id?: number;
  title: string;
  description: string;
  crisis_staff_notes?: string;
  priority: Priority;
  note_type: NoteType;
}

export interface CrisisNoteUpdate {
  character_id?: number;
  title?: string;
  description?: string;
  crisis_staff_notes?: string | null;
  priority?: Priority;
  note_type?: NoteType;
}

export interface NoteFilters {
  period_id?: number;
  archived_only?: boolean;
  character_id?: number;
  priority?: Priority;
  note_type?: NoteType;
  q?: string;
}

// ── Staff Notes ───────────────────────────────────────────────────────────────

export interface StaffNoteResponse {
  id: number;
  period_id: number;
  title: string;
  content: string;
  created_at: string;
}

export interface StaffNoteCreate {
  title: string;
  content: string;
}

export interface StaffNoteUpdate {
  title?: string;
  content?: string;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface NotesByCharacter {
  character_name: string;
  count: number;
}

export interface PriorityCount {
  priority: Priority;
  count: number;
}

export interface AnalyticsSummary {
  total_notes: number;
  notes_by_character: NotesByCharacter[];
  priority_distribution: PriorityCount[];
  private_directive_count: number;
  public_directive_count: number;
}

// ── Delegates & scores ───────────────────────────────────────────────────────

export type Indicator = "reputation" | "economics" | "military";

export interface DelegateResponse {
  id: number;
  name: string;
  reputation: number;
  economics: number;
  military: number;
  published_efficiency: number | null;
  /** Map colour: the faction's when it has one, else the character's own. */
  color: string | null;
  faction_id: number | null;
  /** The province they're based in; auto-placement puts their pin there. */
  home_province_id: string | null;
  staff_notes: string | null;
  /** Pin position in map units; null while off the map. */
  x: number | null;
  y: number | null;
}

export interface ScoreUpdate {
  character_id: number;
  reputation?: number;
  economics?: number;
  military?: number;
}

export interface BulkScoreUpdate {
  updates: ScoreUpdate[];
  reason?: string;
  crisis_note_id?: number;
}

export interface DelegateProfileUpdate {
  color?: string | null;
  staff_notes?: string | null;
  faction_id?: number | null;
  home_province_id?: string | null;
}

/** A clique of characters; its members share its colour on the map. */
export interface FactionResponse {
  id: number;
  name: string;
  color: string | null;
}

export interface FactionCreate {
  name: string;
  color?: string | null;
}

// ── Calculator ───────────────────────────────────────────────────────────────

export interface EfficiencyRequest {
  character_ids: number[];
  indicators?: Indicator[];
}

export interface PublishRequest extends EfficiencyRequest {
  reason?: string;
  crisis_note_id?: number;
}

export type BandTone = "bad" | "neutral" | "good";

export interface BandResponse {
  key: string;
  label: string;
  tone: BandTone;
  tips: string[];
}

export interface EfficiencyResponse {
  indicators: Indicator[];
  efficiency: number;
  band: BandResponse;
  delegates: { character_id: number; name: string; efficiency: number }[];
}

export interface PresetResponse {
  id: number;
  name: string;
  character_ids: number[];
}

export interface PresetCreate {
  name: string;
  character_ids: number[];
}

// ── History ──────────────────────────────────────────────────────────────────

export type HistoryKind = "SCORE_EDIT" | "PUBLISH" | "INVASION" | "PROVINCE_EDIT" | "MOVE" | "BORDER";

export interface HistoryBatchResponse {
  id: number;
  kind: HistoryKind;
  summary: string;
  reason: string | null;
  crisis_note_id: number | null;
  reverted: boolean;
  created_at: string;
  entries: {
    target_type: "character" | "province";
    target_id: string;
    field: string;
    old_value: unknown;
    new_value: unknown;
  }[];
}

// ── Map ──────────────────────────────────────────────────────────────────────

export type AnnotationKind = "LINE" | "PIN";

export interface ProvinceResponse {
  id: string;
  /** Set for provinces staff added; preset names come from the map. */
  name: string | null;
  custom: boolean;
  controller_id: number | null;
  /** Characters sharing the province with the controller (a clique's region). */
  co_holder_ids: number[];
  occupier_id: number | null;
  /** Another delegate disputing this province (drawn in both colours). */
  contested_by_id: number | null;
  /** Redrawn outline in map units; null = the original border. */
  shape: [number, number][] | null;
}

export interface ProvinceShapeUpdate {
  shape: [number, number][] | null;
  /** Neighbours whose border moved with it, saved in the same undo step. */
  neighbour_shapes?: Record<string, [number, number][]>;
  crisis_note_id?: number;
  reason?: string;
}

export interface ProvinceCreate {
  name: string;
  shape: [number, number][];
  /** Neighbours that give up the land, saved in the same undo step. */
  neighbour_shapes?: Record<string, [number, number][]>;
  controller_id?: number | null;
  crisis_note_id?: number;
  reason?: string;
}

export interface ProvinceUpdate {
  controller_id?: number | null;
  co_holder_ids?: number[];
  occupier_id?: number | null;
  contested_by_id?: number | null;
  reason?: string;
}

export interface AnnotationResponse {
  id: number;
  kind: AnnotationKind;
  points: [number, number][];
  label: string | null;
  color: string | null;
  dashed: boolean;
  crisis_note_id: number | null;
  created_at: string;
}

export interface AnnotationCreate {
  kind: AnnotationKind;
  points: [number, number][];
  label?: string;
  color?: string;
  dashed?: boolean;
  crisis_note_id?: number;
}

export type ConflictStatus = "ONGOING" | "RESOLVED";

export interface ConflictResponse {
  id: number;
  name: string;
  status: ConflictStatus;
  parties: { id: number; name: string }[];
  winner_id: number | null;
  outcome_summary: string | null;
  crisis_note_id: number | null;
  created_at: string;
  resolved_at: string | null;
}

export interface ConflictCreate {
  name: string;
  party_ids: number[];
  crisis_note_id?: number;
}

export interface ConflictResolve {
  winner_id?: number | null;
  outcome_summary?: string;
}

export type TerritoryStatus = "ANNEXED" | "OCCUPIED" | "CONTESTED";

/** Part of the map taken in an invasion (a drawn area). */
export interface TerritoryResponse {
  id: number;
  holder_id: number;
  defender_id: number | null;
  province_id: string | null;
  status: TerritoryStatus;
  polygon: [number, number][];
  crisis_note_id: number | null;
  created_at: string;
}

export interface TerritoryCreate {
  holder_id: number;
  defender_id?: number | null;
  province_id?: string | null;
  status?: TerritoryStatus;
  polygon: [number, number][];
  crisis_note_id?: number | null;
  reason?: string;
}

export interface TerritoryUpdate {
  status?: TerritoryStatus;
  holder_id?: number;
  reason?: string;
}

export interface MapStateResponse {
  provinces: ProvinceResponse[];
  delegates: DelegateResponse[];
  factions: FactionResponse[];
  annotations: AnnotationResponse[];
  conflicts: ConflictResponse[];
  territories: TerritoryResponse[];
}

export interface ScoreDeltas {
  reputation?: number;
  economics?: number;
  military?: number;
}

export type InvasionMode = "OCCUPY" | "ANNEX" | "CONTEST";

export interface InvasionRequest {
  attacker_id: number;
  /** Whole provinces taken; with `area`, just the province it was cut from. */
  province_ids: string[];
  /** Outline of only the land taken (part of a province). */
  area?: [number, number][];
  crisis_note_id: number;
  mode: InvasionMode;
  attacker_deltas?: ScoreDeltas;
  defender_id?: number;
  defender_deltas?: ScoreDeltas;
  reason?: string;
}

export interface BandSetting {
  key?: string;
  label: string;
  tone: BandTone;
  min_rating: number;
  tips: string[];
}

export interface FormulaSettings {
  midpoint: number;
  bands: BandSetting[];
}

export interface FormulaResponse extends FormulaSettings {
  is_default: boolean;
}
