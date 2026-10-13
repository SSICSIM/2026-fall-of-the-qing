"use client";

import { useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ChevronDown, ChevronRight, Save, Send, Trash2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useNotes } from "@/hooks/useCrisisNotes";
import {
  useCreatePreset,
  useDelegates,
  useFormula,
  useDeletePreset,
  useHistory,
  usePresets,
  usePublish,
  useUndo,
  useUpdateProfile,
  useUpdateScores,
} from "@/hooks/useWarRoom";
import { factionColor } from "@/lib/warRoom/colors";
import {
  bandFor,
  clampScore,
  compareForces,
  delegateEfficiency,
  formatRating,
  groupEfficiency,
  INDICATOR_LABELS,
  INDICATOR_SHORT,
  INDICATORS,
  type Scores,
} from "@/lib/warRoom/efficiency";
import { cn } from "@/lib/utils";
import type { DelegateResponse, Indicator } from "@/types/api";

type Draft = Partial<Record<Indicator, string>>;

const TONE_CLASS = {
  bad: "text-destructive border-destructive/40 bg-destructive/5",
  neutral: "text-chart-4 border-chart-4/50 bg-chart-4/10",
  good: "text-chart-2 border-chart-2/40 bg-chart-2/10",
} as const;

export function CalculatorPage() {
  const { data: delegates = [], isLoading } = useDelegates();
  const [selected, setSelected] = useState<number[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [indicators, setIndicators] = useState<Indicator[]>([...INDICATORS]);

  // Scores as they'd be once staged edits are recorded — the calculator
  // previews against these so backrooms can play "what if".
  const effective = useMemo(() => {
    const out = new Map<number, Scores>();
    for (const d of delegates) {
      const draft = drafts[d.id] ?? {};
      out.set(
        d.id,
        Object.fromEntries(
          INDICATORS.map((i) => [i, draft[i] != null && draft[i] !== "" ? clampScore(Number(draft[i])) : d[i]]),
        ) as Scores,
      );
    }
    return out;
  }, [delegates, drafts]);

  const dirtyIds = Object.keys(drafts)
    .map(Number)
    .filter((id) => Object.values(drafts[id]).some((v) => v != null && v !== ""));

  const toggle = (id: number) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <main className="mx-auto max-w-[1500px] space-y-5 p-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Calculator</h1>
        <UndoButton />
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <Ledger
            delegates={delegates}
            isLoading={isLoading}
            selected={selected}
            onToggle={toggle}
            onSelectAll={(all) => setSelected(all ? delegates.map((d) => d.id) : [])}
            drafts={drafts}
            setDrafts={setDrafts}
            effective={effective}
            indicators={indicators}
            dirtyIds={dirtyIds}
          />
          <HistoryLog />
        </div>
        <div className="space-y-5">
          <Reckoner
            delegates={delegates}
            selected={selected}
            setSelected={setSelected}
            effective={effective}
            indicators={indicators}
            setIndicators={setIndicators}
            hasUnsaved={dirtyIds.some((id) => selected.includes(id))}
          />
          <ForceComparison delegates={delegates} effective={effective} indicators={indicators} />
        </div>
      </div>
    </main>
  );
}

function UndoButton() {
  const undo = useUndo();
  const { data: history } = useHistory();
  const last = history?.find((b) => !b.reverted);
  return (
    <Button variant="outline" onClick={() => undo.mutate()} disabled={!last || undo.isPending} title={last?.summary}>
      <Undo2 /> Undo last{last ? `: ${last.summary.slice(0, 40)}${last.summary.length > 40 ? "…" : ""}` : ""}
    </Button>
  );
}

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-lg leading-7 font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

function Ledger({
  delegates,
  isLoading,
  selected,
  onToggle,
  onSelectAll,
  drafts,
  setDrafts,
  effective,
  indicators,
  dirtyIds,
}: {
  delegates: DelegateResponse[];
  isLoading: boolean;
  selected: number[];
  onToggle: (id: number) => void;
  onSelectAll: (all: boolean) => void;
  drafts: Record<number, Draft>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<number, Draft>>>;
  effective: Map<number, Scores>;
  indicators: Indicator[];
  dirtyIds: number[];
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [bulk, setBulk] = useState<Draft>({});
  const [reason, setReason] = useState("");
  const [noteId, setNoteId] = useState("");
  const { data: notes } = useNotes({});
  const updateScores = useUpdateScores();
  const formula = useFormula();

  const setCell = (id: number, i: Indicator, v: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], [i]: v } }));

  function applyBulk() {
    setDrafts((d) => {
      const next = { ...d };
      for (const id of selected) {
        next[id] = { ...next[id] };
        for (const i of INDICATORS) if (bulk[i] != null && bulk[i] !== "") next[id][i] = bulk[i];
      }
      return next;
    });
    setBulk({});
  }

  function record() {
    const updates = dirtyIds.map((id) => {
      const draft = drafts[id];
      const u: { character_id: number } & Partial<Record<Indicator, number>> = { character_id: id };
      for (const i of INDICATORS) if (draft[i] != null && draft[i] !== "") u[i] = clampScore(Number(draft[i]));
      return u;
    });
    updateScores.mutate(
      { updates, reason: reason || undefined, crisis_note_id: noteId ? Number(noteId) : undefined },
      {
        onSuccess: () => {
          setDrafts({});
          setReason("");
          setNoteId("");
        },
      },
    );
  }

  const allSelected = delegates.length > 0 && selected.length === delegates.length;

  return (
    <section className="rounded-lg border p-4">
      <SectionTitle
        aside={
          <span className="text-muted-foreground text-sm">0 (poor) – 5 (excellent)</span>
        }
      >
        Delegate scores
      </SectionTitle>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-[10px]">
              <th className="w-8 py-2 text-left">
                <Checkbox checked={allSelected} onCheckedChange={(v) => onSelectAll(v === true)} aria-label="Select all" />
              </th>
              <th className="py-2 text-left">Delegate</th>
              {INDICATORS.map((i) => (
                <th key={i} className="w-24 py-2 text-center">
                  {INDICATOR_LABELS[i]}
                </th>
              ))}
              <th className="w-24 py-2 text-right">Efficiency</th>
              <th className="w-24 py-2 text-right">On map</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={7} className="text-muted-foreground py-6 text-center">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && delegates.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted-foreground py-6 text-center">
                  No delegates yet. Add characters from the top bar.
                </td>
              </tr>
            )}
            {delegates.map((d) => {
              const eff = delegateEfficiency(effective.get(d.id)!, indicators, formula.midpoint);
              const isOpen = expanded === d.id;
              return (
                <DelegateRow
                  key={d.id}
                  delegate={d}
                  selected={selected.includes(d.id)}
                  onToggle={() => onToggle(d.id)}
                  draft={drafts[d.id] ?? {}}
                  onCell={(i, v) => setCell(d.id, i, v)}
                  efficiency={eff}
                  expanded={isOpen}
                  onExpand={() => setExpanded(isOpen ? null : d.id)}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {selected.length > 1 && (
        <div className="bg-muted/60 mt-3 flex flex-wrap items-center gap-2 rounded-md p-2.5 text-sm">
          <span className="text-[11px]">Set for {selected.length} selected</span>
          {INDICATORS.map((i) => (
            <Input
              key={i}
              type="number"
              step="0.5"
              min="0"
              max="5"
              placeholder={INDICATOR_LABELS[i]}
              value={bulk[i] ?? ""}
              onChange={(e) => setBulk((b) => ({ ...b, [i]: e.target.value }))}
              className="h-8 w-28"
            />
          ))}
          <Button size="sm" variant="secondary" onClick={applyBulk}>
            Stage
          </Button>
        </div>
      )}

      {dirtyIds.length > 0 && (
        <div className="border-primary/40 bg-primary/10 mt-3 space-y-2 rounded-md border p-3">
          <div className="text-xs">
            {dirtyIds.length} delegate{dirtyIds.length === 1 ? "" : "s"} with unrecorded changes
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" />
            <NativeSelect className="w-full" value={noteId} onChange={(e) => setNoteId(e.target.value)}>
              <NativeSelectOption value="">Link a crisis note (optional)</NativeSelectOption>
              {notes?.map((n) => (
                <NativeSelectOption key={n.id} value={n.id}>
                  {n.character.name}: {n.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setDrafts({})}>
              Discard
            </Button>
            <Button size="sm" onClick={record} disabled={updateScores.isPending}>
              <Save /> Save scores
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function DelegateRow({
  delegate: d,
  selected,
  onToggle,
  draft,
  onCell,
  efficiency,
  expanded,
  onExpand,
}: {
  delegate: DelegateResponse;
  selected: boolean;
  onToggle: () => void;
  draft: Draft;
  onCell: (i: Indicator, v: string) => void;
  efficiency: number;
  expanded: boolean;
  onExpand: () => void;
}) {
  const { bands } = useFormula();
  const band = bandFor(efficiency, bands);
  return (
    <>
      <tr className={cn("border-b border-dashed transition-colors", selected && "bg-primary/10")}>
        <td className="py-1.5">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${d.name}`} />
        </td>
        <td className="py-1.5">
          <button type="button" onClick={onExpand} className="flex items-center gap-2 text-left">
            {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <span className="border-black/10 h-3 w-3 rounded-[2px] border" style={{ background: factionColor(d) }} />
            <span className="font-semibold">{d.name}</span>
            {d.staff_notes && <span className="text-muted-foreground text-xs">· notes</span>}
          </button>
        </td>
        {INDICATORS.map((i) => {
          const dirty = draft[i] != null && draft[i] !== "" && Number(draft[i]) !== d[i];
          return (
            <td key={i} className="px-1 py-1.5 text-center">
              <Input
                type="number"
                step="0.5"
                min="0"
                max="5"
                aria-label={`${d.name} ${INDICATOR_LABELS[i]}`}
                value={draft[i] ?? String(d[i])}
                onChange={(e) => onCell(i, e.target.value)}
                className={cn(
                  "mx-auto h-8 w-20 text-center tabular-nums",
                  dirty && "border-primary bg-primary/15 font-semibold",
                )}
              />
            </td>
          );
        })}
        <td className="py-1.5 text-right">
          <span className={cn("font-semibold tabular-nums", band.tone === "bad" && "text-destructive", band.tone === "good" && "text-chart-2")}>
            {formatRating(efficiency)}
          </span>
        </td>
        <td className="text-muted-foreground py-1.5 text-right tabular-nums">{formatRating(d.published_efficiency)}</td>
      </tr>
      {expanded && (
        <tr className="border-b">
          <td />
          <td colSpan={6} className="py-2 pr-2">
            <NotesEditor delegate={d} />
          </td>
        </tr>
      )}
    </>
  );
}

function NotesEditor({ delegate }: { delegate: DelegateResponse }) {
  const [text, setText] = useState(delegate.staff_notes ?? "");
  const update = useUpdateProfile();
  const dirty = text !== (delegate.staff_notes ?? "");
  return (
    <div className="space-y-2">
      <Textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Staff notes"
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="secondary"
          disabled={!dirty || update.isPending}
          onClick={() => update.mutate({ id: delegate.id, body: { staff_notes: text || null } })}
        >
          Save notes
        </Button>
      </div>
    </div>
  );
}

function Reckoner({
  delegates,
  selected,
  setSelected,
  effective,
  indicators,
  setIndicators,
  hasUnsaved,
}: {
  delegates: DelegateResponse[];
  selected: number[];
  setSelected: (ids: number[]) => void;
  effective: Map<number, Scores>;
  indicators: Indicator[];
  setIndicators: (i: Indicator[]) => void;
  hasUnsaved: boolean;
}) {
  const { data: presets } = usePresets();
  const createPreset = useCreatePreset();
  const deletePreset = useDeletePreset();
  const publish = usePublish();
  const formula = useFormula();
  const [presetName, setPresetName] = useState("");
  const [presetId, setPresetId] = useState("");

  const chosen = delegates.filter((d) => selected.includes(d.id));
  const rating = groupEfficiency(chosen.map((d) => effective.get(d.id)!), indicators, formula.midpoint);
  const band = rating == null ? null : bandFor(rating, formula.bands);

  function toggleIndicator(i: Indicator) {
    const next = indicators.includes(i) ? indicators.filter((x) => x !== i) : [...indicators, i];
    if (next.length > 0) setIndicators(INDICATORS.filter((x) => next.includes(x)));
  }

  return (
    <section className="rounded-lg border p-4">
      <SectionTitle>Efficiency</SectionTitle>

      <div className="space-y-3">
        <div className="flex gap-2">
          <NativeSelect
            className="flex-1"
            value={presetId}
            onChange={(e) => {
              setPresetId(e.target.value);
              const p = presets?.find((x) => String(x.id) === e.target.value);
              if (p) setSelected(p.character_ids.filter((id) => delegates.some((d) => d.id === id)));
            }}
          >
            <NativeSelectOption value="">Group presets…</NativeSelectOption>
            {presets?.map((p) => (
              <NativeSelectOption key={p.id} value={p.id}>
                {p.name} ({p.character_ids.length})
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {presetId && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="Delete preset"
              onClick={() => {
                deletePreset.mutate(Number(presetId));
                setPresetId("");
              }}
            >
              <Trash2 />
            </Button>
          )}
        </div>

        <div className="flex min-h-9 flex-wrap gap-1.5">
          {chosen.length === 0 ? (
            <span className="text-muted-foreground text-sm">No delegates selected.</span>
          ) : (
            chosen.map((d) => (
              <span key={d.id} className="border-border bg-background/70 inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-sm">
                <span className="h-2.5 w-2.5 rounded-[2px]" style={{ background: factionColor(d) }} />
                {d.name}
              </span>
            ))
          )}
        </div>

        {chosen.length > 1 && (
          <div className="flex gap-2">
            <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="Save this group as…" className="h-8" />
            <Button
              size="sm"
              variant="secondary"
              disabled={!presetName}
              onClick={() =>
                createPreset.mutate({ name: presetName, character_ids: selected }, { onSuccess: () => setPresetName("") })
              }
            >
              Save
            </Button>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-[11px]">Indicators used</div>
          <div className="flex flex-wrap gap-3">
            {INDICATORS.map((i) => (
              <label key={i} className="flex items-center gap-1.5 text-sm">
                <Checkbox checked={indicators.includes(i)} onCheckedChange={() => toggleIndicator(i)} />
                {INDICATOR_LABELS[i]}
              </label>
            ))}
          </div>
        </div>

        
        <div className="text-center">
          <div className="text-muted-foreground text-[11px]">
            {chosen.length > 1 ? `Average of ${chosen.length}` : "Efficiency rating"}
          </div>
          <div className="text-5xl leading-none font-bold tabular-nums">{formatRating(rating)}</div>
          <div className="text-muted-foreground mt-1 text-xs">
            {["", "", "√", "∛"][indicators.length]}({indicators.map((i) => `${INDICATOR_SHORT[i]}/${formula.midpoint}`).join(" × ")})
          </div>
        </div>

        {band && (
          <div className={cn("rounded-md border p-3", TONE_CLASS[band.tone])}>
            <div className="text-sm font-bold">{band.label}</div>
            <ul className="text-foreground mt-1.5 list-inside list-disc text-sm">
              {band.tips.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}

        {chosen.length > 1 && (
          <ul className="text-sm">
            {chosen.map((d) => (
              <li key={d.id} className="flex justify-between border-b border-dashed py-1">
                <span>{d.name}</span>
                <span className="tabular-nums">{formatRating(delegateEfficiency(effective.get(d.id)!, indicators, formula.midpoint))}</span>
              </li>
            ))}
          </ul>
        )}

        <Button
          className="w-full"
          disabled={chosen.length === 0 || hasUnsaved || publish.isPending}
          onClick={() => publish.mutate({ character_ids: selected, indicators })}
        >
          <Send /> Confirm &amp; send {chosen.length > 1 ? "each rating" : "rating"} to map
        </Button>
        {hasUnsaved && (
          <p className="text-muted-foreground text-center text-xs">Save score changes first.</p>
        )}
      </div>
    </section>
  );
}

function ForceComparison({
  delegates,
  effective,
  indicators,
}: {
  delegates: DelegateResponse[];
  effective: Map<number, Scores>;
  indicators: Indicator[];
}) {
  const formula = useFormula();
  const [sides, setSides] = useState([
    { id: "", strength: "3" },
    { id: "", strength: "3" },
  ]);
  const eff = (id: string) => {
    const s = effective.get(Number(id));
    return s ? delegateEfficiency(s, indicators, formula.midpoint) : 0;
  };
  const ready = sides.every((s) => s.id !== "");
  const result = ready
    ? compareForces(
        { efficiency: eff(sides[0].id), strength: Number(sides[0].strength) || 0 },
        { efficiency: eff(sides[1].id), strength: Number(sides[1].strength) || 0 },
      )
    : null;
  const name = (id: string) => delegates.find((d) => String(d.id) === id)?.name ?? "";

  return (
    <section className="rounded-lg border p-4">
      <SectionTitle>Battle comparison</SectionTitle>
      <p className="text-muted-foreground mb-3 text-sm">Efficiency × absolute strength (1 small · 3 moderate · 5 vast)</p>
      <div className="space-y-2">
        {sides.map((s, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_5rem_3.5rem] items-center gap-2">
            <NativeSelect
              className="w-full"
              value={s.id}
              onChange={(e) => setSides((xs) => xs.map((x, j) => (j === idx ? { ...x, id: e.target.value } : x)))}
            >
              <NativeSelectOption value="">{idx === 0 ? "Attacker…" : "Defender…"}</NativeSelectOption>
              {delegates.map((d) => (
                <NativeSelectOption key={d.id} value={d.id}>
                  {d.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Input
              type="number"
              min="0"
              step="0.5"
              aria-label="Absolute strength"
              value={s.strength}
              onChange={(e) => setSides((xs) => xs.map((x, j) => (j === idx ? { ...x, strength: e.target.value } : x)))}
              className="h-8 text-center"
            />
            <span className="text-right text-sm font-semibold tabular-nums">
              {result ? (idx === 0 ? result.a : result.b).toFixed(2) : "—"}
            </span>
          </div>
        ))}
      </div>
      {result && (
        <p className="mt-3 text-center">
          {result.winner === "tie" ? (
            <span>Even match</span>
          ) : (
            <>
              <span className="font-bold">
                {name(result.winner === "a" ? sides[0].id : sides[1].id)} prevails
              </span>{" "}
              <span className="text-muted-foreground text-sm">by {Math.round(result.margin * 100)}%</span>
            </>
          )}
        </p>
      )}
    </section>
  );
}

function HistoryLog() {
  const { data: history } = useHistory();
  return (
    <section className="rounded-lg border p-4">
      <SectionTitle>History</SectionTitle>
      {!history?.length ? (
        <p className="text-muted-foreground text-sm">Nothing recorded yet.</p>
      ) : (
        <ol className="max-h-80 space-y-1.5 overflow-y-auto text-sm">
          {history.map((b) => (
            <li key={b.id} className={cn("flex gap-3 border-b border-dashed pb-1.5", b.reverted && "opacity-50")}>
              <span className="text-muted-foreground w-24 shrink-0 text-[10px]">
                {b.kind.replace("_", " ")}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn(b.reverted && "line-through")}>{b.summary}</span>
                {b.reason && <span className="text-muted-foreground"> — {b.reason}</span>}
              </span>
              <span className="text-muted-foreground shrink-0 text-xs">
                {b.reverted ? "undone" : formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
