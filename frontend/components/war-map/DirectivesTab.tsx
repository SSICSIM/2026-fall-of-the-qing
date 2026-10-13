"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  FlagIcon,
  LockIcon,
  MapPinIcon,
  MegaphoneIcon,
  PencilRulerIcon,
  PlusIcon,
  ScrollTextIcon,
  SwordsIcon,
  TrendingUpIcon,
  type LucideIcon,
} from "lucide-react";

import { ArchivePeriodDialog } from "@/components/crisis/ArchivePeriodDialog";
import { CreatePeriodDialog } from "@/components/crisis/CreatePeriodDialog";
import { PriorityBadge } from "@/components/crisis/PriorityBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useNotes } from "@/hooks/useCrisisNotes";
import { useActivePeriod } from "@/hooks/useCrisisPeriods";
import { useHistory } from "@/hooks/useWarRoom";
import { factionColor } from "@/lib/warRoom/colors";
import { cn } from "@/lib/utils";
import type {
  CrisisNoteResponse,
  HistoryKind,
  MapStateResponse,
  NoteType,
  Priority,
} from "@/types/api";
import { NewNoteDialog } from "./NewNoteDialog";
import { EmptyHint, SectionHeading } from "./parts";
import { Swatch } from "./SidebarTabs";

// ── Tags: what a directive set in motion on the map ─────────────────────────

type Action = "CONFLICT" | "INVASION" | "BORDER" | "SCORES" | "PIN";

const ACTION_TAG: Record<Action, { label: string; icon: LucideIcon; className: string }> = {
  CONFLICT: { label: "Conflict", icon: SwordsIcon, className: "bg-destructive text-white" },
  INVASION: { label: "Invasion", icon: FlagIcon, className: "bg-chart-1 text-white" },
  BORDER: { label: "Border", icon: PencilRulerIcon, className: "bg-chart-4 text-white" },
  SCORES: { label: "Scores", icon: TrendingUpIcon, className: "bg-chart-2 text-white" },
  PIN: { label: "Pin", icon: MapPinIcon, className: "" },
};

const ACTION_ORDER = Object.keys(ACTION_TAG) as Action[];

const HISTORY_ACTION: Partial<Record<HistoryKind, Action>> = {
  INVASION: "INVASION",
  BORDER: "BORDER",
  SCORE_EDIT: "SCORES",
  PUBLISH: "SCORES",
};

/** Note id -> the map actions linked to it (undone changes don't count). */
function useNoteActions(state: MapStateResponse): Map<number, Set<Action>> {
  const { data: history = [] } = useHistory();
  return useMemo(() => {
    const out = new Map<number, Set<Action>>();
    const add = (noteId: number | null, action: Action) => {
      if (noteId == null) return;
      if (!out.has(noteId)) out.set(noteId, new Set());
      out.get(noteId)!.add(action);
    };
    for (const c of state.conflicts) add(c.crisis_note_id, "CONFLICT");
    for (const a of state.annotations) if (a.kind === "PIN") add(a.crisis_note_id, "PIN");
    for (const b of history) {
      const action = HISTORY_ACTION[b.kind];
      if (action && !b.reverted) add(b.crisis_note_id, action);
    }
    return out;
  }, [state.conflicts, state.annotations, history]);
}

function NoteTags({ note, actions }: { note: CrisisNoteResponse; actions?: Set<Action> }) {
  const TypeIcon = note.note_type === "PRIVATE_DIRECTIVE" ? LockIcon : MegaphoneIcon;
  return (
    <span className="flex flex-wrap gap-1">
      <PriorityBadge priority={note.priority} />
      <Badge variant="outline" className="gap-1">
        <TypeIcon className="size-3" />
        {note.note_type === "PRIVATE_DIRECTIVE" ? "Private" : "Public"}
      </Badge>
      {ACTION_ORDER.filter((a) => actions?.has(a)).map((a) => {
        const tag = ACTION_TAG[a];
        return (
          <Badge key={a} variant={tag.className ? "default" : "outline"} className={cn("gap-1", tag.className)}>
            <tag.icon className="size-3" />
            {tag.label}
          </Badge>
        );
      })}
    </span>
  );
}

// ── Search and filter ────────────────────────────────────────────────────────

const ANY = "ALL";

interface NoteFilter {
  priority: Priority | typeof ANY;
  type: NoteType | typeof ANY;
  action: Action | typeof ANY;
  delegate: string;
}

const NO_FILTER: NoteFilter = { priority: ANY, type: ANY, action: ANY, delegate: ANY };

function useNoteFilter(notes: CrisisNoteResponse[], actions: Map<number, Set<Action>>, query: string) {
  const [filter, setFilter] = useState<NoteFilter>(NO_FILTER);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return notes.filter(
      (n) =>
        (filter.priority === ANY || n.priority === filter.priority) &&
        (filter.type === ANY || n.note_type === filter.type) &&
        (filter.action === ANY || actions.get(n.id)?.has(filter.action)) &&
        (filter.delegate === ANY || String(n.character.id) === filter.delegate) &&
        (!q ||
          n.title.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q) ||
          n.character.name.toLowerCase().includes(q)),
    );
  }, [notes, actions, filter, query]);
  return { filter, setFilter, filtered };
}

function FilterField<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger className="h-8 w-full text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function FilterButton({
  value,
  onChange,
  state,
}: {
  value: NoteFilter;
  onChange: (v: NoteFilter) => void;
  state: MapStateResponse;
}) {
  const active = Object.values(value).some((v) => v !== ANY);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn("h-8", active && "border-primary")}>
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 space-y-3">
        <FilterField
          label="Priority"
          value={value.priority}
          onChange={(priority) => onChange({ ...value, priority })}
          options={[
            { value: ANY, label: "Any priority" },
            { value: "HIGH", label: "High" },
            { value: "MEDIUM", label: "Medium" },
            { value: "LOW", label: "Low" },
          ]}
        />
        <FilterField
          label="Type"
          value={value.type}
          onChange={(type) => onChange({ ...value, type })}
          options={[
            { value: ANY, label: "Any type" },
            { value: "PRIVATE_DIRECTIVE", label: "Private directive" },
            { value: "PUBLIC_DIRECTIVE", label: "Public directive" },
          ]}
        />
        <FilterField
          label="On the map"
          value={value.action}
          onChange={(action) => onChange({ ...value, action })}
          options={[
            { value: ANY, label: "Anything" },
            ...ACTION_ORDER.map((a) => ({ value: a, label: ACTION_TAG[a].label })),
          ]}
        />
        <FilterField
          label="Delegate"
          value={value.delegate}
          onChange={(delegate) => onChange({ ...value, delegate })}
          options={[
            { value: ANY, label: "Every delegate" },
            ...state.delegates.map((d) => ({
              value: String(d.id),
              label: (
                <>
                  <span className="size-2 rounded-full" style={{ backgroundColor: factionColor(d) }} />
                  {d.name}
                </>
              ),
            })),
          ]}
        />
        {active ? (
          <Button variant="ghost" size="sm" className="w-full" onClick={() => onChange(NO_FILTER)}>
            Clear filters
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// ── Paged list ───────────────────────────────────────────────────────────────

function usePaged<T>(items: T[], pageSize: number) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  const current = Math.min(page, pageCount);
  return { page: current, pageCount, setPage, pageItems: items.slice((current - 1) * pageSize, current * pageSize) };
}

function NoteList({
  notes,
  state,
  actions,
  pageSize,
  loading,
  empty,
}: {
  notes: CrisisNoteResponse[];
  state: MapStateResponse;
  actions: Map<number, Set<Action>>;
  pageSize: number;
  loading: boolean;
  empty: string;
}) {
  const { page, pageCount, setPage, pageItems } = usePaged(notes, pageSize);
  if (loading) return <p className="text-muted-foreground text-xs">Loading…</p>;
  if (!notes.length) return <EmptyHint icon={<ScrollTextIcon className="size-5 shrink-0" />}>{empty}</EmptyHint>;
  return (
    <div className="space-y-2.5">
      <ul className="space-y-2.5">
        {pageItems.map((n) => (
          <NoteCard key={n.id} note={n} state={state} actions={actions.get(n.id)} />
        ))}
      </ul>
      {pageCount > 1 ? (
        <div className="flex items-center justify-center gap-2 text-xs">
          <Button size="icon" variant="ghost" className="size-7" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Previous page">
            <ChevronLeftIcon />
          </Button>
          <span className="tabular-nums">
            {page} / {pageCount}
          </span>
          <Button size="icon" variant="ghost" className="size-7" disabled={page === pageCount} onClick={() => setPage(page + 1)} aria-label="Next page">
            <ChevronRightIcon />
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NoteCard({
  note,
  state,
  actions,
}: {
  note: CrisisNoteResponse;
  state: MapStateResponse;
  actions?: Set<Action>;
}) {
  const [open, setOpen] = useState(false);
  const delegate = state.delegates.find((d) => d.id === note.character.id);
  const conflicts = state.conflicts.filter((c) => c.crisis_note_id === note.id);
  const pins = state.annotations.filter((a) => a.crisis_note_id === note.id);
  return (
    <li className="overflow-hidden rounded-lg border shadow-sm">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="hover:bg-muted/60 flex w-full items-start gap-2.5 px-3 py-2.5 text-left">
            {delegate ? <Swatch delegate={delegate} className="size-7 ring-0" /> : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold">{note.title}</span>
              <span className="text-muted-foreground block truncate text-xs">
                {note.character.name} · {formatDistanceToNow(new Date(note.created_at), { addSuffix: true })}
              </span>
              <span className="mt-1.5 block">
                <NoteTags note={note} actions={actions} />
              </span>
            </span>
            <ChevronRightIcon className={cn("mt-1 size-4 shrink-0 transition-transform", open && "rotate-90")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="bg-muted/40 space-y-2 border-t px-3 py-3 text-sm">
            <p className="whitespace-pre-wrap">{note.description}</p>
            {note.crisis_staff_notes ? (
              <p className="text-muted-foreground text-xs whitespace-pre-wrap">Staff: {note.crisis_staff_notes}</p>
            ) : null}
            {conflicts.length || pins.length ? (
              <p className="text-muted-foreground text-xs">
                On the map: {[...conflicts.map((c) => c.name), ...pins.map((p) => p.label || "war pin")].join(", ")}
              </p>
            ) : null}
            <Link href="/" className="text-primary text-xs hover:underline">
              Edit in the Crisis Tracker
            </Link>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

// ── The tab ──────────────────────────────────────────────────────────────────

/** The current crisis update's directives, and everything archived. */
export function DirectivesTab({ state }: { state: MapStateResponse }) {
  const { data: period } = useActivePeriod();
  const { data: current = [], isLoading } = useNotes({ period_id: period?.id }, period != null);
  const { data: archived = [], isLoading: archivedLoading } = useNotes({ archived_only: true });
  const actions = useNoteActions(state);
  const [query, setQuery] = useState("");
  const [archivedQuery, setArchivedQuery] = useState("");
  const { filter, setFilter, filtered } = useNoteFilter(current, actions, query);
  const archivedFiltered = useNoteFilter(archived, actions, archivedQuery).filtered;
  const [writing, setWriting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [starting, setStarting] = useState(false);

  return (
    <div className="space-y-7">
      <section>
        <SectionHeading title="Current crisis update" />
        {period ? (
          <>
            <p className="text-muted-foreground mt-1 text-xs">{period.name}</p>
            <div className="mt-2 flex items-center gap-1.5">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search current directives"
                className="h-8 min-w-0 flex-1 text-xs md:text-xs"
              />
              <FilterButton value={filter} onChange={setFilter} state={state} />
              <Button size="sm" className="h-8" onClick={() => setWriting(true)}>
                <PlusIcon />
                Create
              </Button>
              <Button size="sm" variant="destructive" className="h-8" onClick={() => setFinishing(true)}>
                Finish
              </Button>
            </div>
            <div className="mt-3">
              <NoteList
                notes={filtered}
                state={state}
                actions={actions}
                pageSize={4}
                loading={isLoading}
                empty="No directives in this crisis update yet."
              />
            </div>
            <ArchivePeriodDialog
              periodId={period.id}
              periodName={period.name}
              open={finishing}
              onOpenChange={setFinishing}
            />
          </>
        ) : (
          <div className="mt-3 space-y-2 text-sm">
            <p className="text-muted-foreground">No crisis update is running.</p>
            <Button size="sm" onClick={() => setStarting(true)}>
              Start crisis update
            </Button>
            <CreatePeriodDialog open={starting} onOpenChange={setStarting} />
          </div>
        )}
      </section>

      <section>
        <SectionHeading title="Archived directives" />
        <Input
          value={archivedQuery}
          onChange={(e) => setArchivedQuery(e.target.value)}
          placeholder="Search"
          aria-label="Search archived directives"
          className="mt-3 h-8 text-xs md:text-xs"
        />
        <div className="mt-3">
          <NoteList
            notes={archivedFiltered}
            state={state}
            actions={actions}
            pageSize={3}
            loading={archivedLoading}
            empty="Nothing archived yet."
          />
        </div>
      </section>

      <NewNoteDialog open={writing} onOpenChange={setWriting} />
    </div>
  );
}
