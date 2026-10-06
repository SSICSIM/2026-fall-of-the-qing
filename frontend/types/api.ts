export interface HealthResponse {
  status: string;
}

export type Priority = "HIGH" | "MEDIUM" | "LOW";
export type NoteType = "PRIVATE_DIRECTIVE" | "PUBLIC_DIRECTIVE";

// ── Characters ───────────────────────────────────────────────────────────────

export interface CharacterResponse {
  id: number;
  name: string;
  region?: string | null;
  created_at: string;
}

export interface CharacterCreate {
  name: string;
  region?: string | null;
}

export interface BulkUploadResult {
  created: number;
  skipped: number;
}

// ── Crisis Periods ────────────────────────────────────────────────────────────

export interface CrisisPeriodResponse {
  id: number;
  name: string;
  is_active: boolean;
  created_at: string;
  archived_at: string | null;
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

// ── Fall of Qing: indicators, calculator, history ────────────────────────────

export type Indicator = "LEGITIMACY" | "MILITARY" | "ECONOMICS";

export interface IndicatorRow {
  character_id: number;
  name: string;
  region: string | null;
  legitimacy: number;
  military: number;
  economics: number;
  notes: string | null;
  efficiency: number; // all three indicators, current stored values
  published_efficiency: number | null; // what the delegate-facing map shows now
}

export interface ScoreEdit {
  character_id: number;
  indicator: Indicator;
  mode: "set" | "add";
  value: number;
}

export interface ActionResponse {
  id: number;
  kind: "SCORE_EDIT" | "PUBLISH";
  payload: Record<string, unknown>;
  note: string | null;
  created_by: string | null;
  created_at: string;
  reverted_at: string | null;
}

export interface RunResultRow {
  character_id: number;
  name: string;
  efficiency: number;
  inputs: Record<string, number>;
}

export interface RunResponse {
  id: number;
  character_ids: number[];
  indicators: Indicator[];
  results: RunResultRow[];
  average: number;
  band_label: string;
  tip: string;
  outcomes: string[];
  status: "DRAFT" | "PUBLISHED" | "REVERTED";
  created_at: string;
  published_at: string | null;
}

export interface DelegateGroup {
  id: number;
  name: string;
  character_ids: number[];
}

export interface PublicScore {
  character_id: number;
  name: string;
  efficiency: number;
}
