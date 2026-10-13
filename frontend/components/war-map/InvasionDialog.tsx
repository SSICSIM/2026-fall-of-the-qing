"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useNotes } from "@/hooks/useCrisisNotes";
import { useInvade } from "@/hooks/useWarRoom";
import { clampScore, INDICATOR_LABELS, INDICATORS } from "@/lib/warRoom/efficiency";
import { PROVINCE_NAMES } from "@/lib/warRoom/provinces";
import { NewNoteDialog } from "./NewNoteDialog";
import { cn } from "@/lib/utils";
import type { DelegateResponse, Indicator, InvasionMode, InvasionRequest, MapStateResponse } from "@/types/api";

type Deltas = Record<Indicator, string>;
const NO_DELTAS: Deltas = { reputation: "", economics: "", military: "" };

// Invaders arrive with their own reputation and a penalty for being a
// foreign force; these are only defaults — the backrooms set the real numbers.
const DEFAULT_ATTACKER_DELTAS: Deltas = { reputation: "-0.5", economics: "", military: "" };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: MapStateResponse;
  provinceId: string | null;
  /** Start with this faction as the invader. */
  attackerFactionId?: number;
  /** "Draw the area taken": hand the invasion back to the map, which adds
   * the drawn outline as `area` and records it. */
  onDrawArea?: (request: Omit<InvasionRequest, "area">) => void;
}

function parseDeltas(d: Deltas) {
  return Object.fromEntries(INDICATORS.map((i) => [i, Number(d[i]) || 0])) as Record<Indicator, number>;
}

export function InvasionDialog({ open, onOpenChange, state, provinceId, attackerFactionId, onDrawArea }: Props) {
  const province = state.provinces.find((p) => p.id === provinceId) ?? null;
  const delegates = state.delegates;
  const [attackerFaction, setAttackerFaction] = useState("");
  const [defenderFaction, setDefenderFaction] = useState("");
  const inFaction = (factionId: string) => (d: DelegateResponse) => !factionId || String(d.faction_id) === factionId;

  const [attackerId, setAttackerId] = useState("");
  const [defenderId, setDefenderId] = useState("");
  const [noteId, setNoteId] = useState("");
  const [mode, setMode] = useState<InvasionMode>("OCCUPY");
  // WHOLE: the chosen provinces change hands. AREA: staff draw just the part taken.
  const [scope, setScope] = useState<"WHOLE" | "AREA">("WHOLE");
  const [extraProvinces, setExtraProvinces] = useState<string[]>([]);
  const [attackerDeltas, setAttackerDeltas] = useState<Deltas>(DEFAULT_ATTACKER_DELTAS);
  const [defenderDeltas, setDefenderDeltas] = useState<Deltas>(NO_DELTAS);
  const [reason, setReason] = useState("");
  const invade = useInvade();
  const [writing, setWriting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const holder = province?.occupier_id ?? province?.controller_id;
    const holderFaction = delegates.find((d) => d.id === holder)?.faction_id;
    const invaders = delegates.filter((d) => attackerFactionId != null && d.faction_id === attackerFactionId);
    setAttackerFaction(attackerFactionId != null ? String(attackerFactionId) : "");
    setDefenderFaction(holderFaction != null ? String(holderFaction) : "");
    // A one-character faction needs no second choice.
    setAttackerId(invaders.length === 1 ? String(invaders[0].id) : "");
    setDefenderId(holder != null ? String(holder) : "");
    setNoteId("");
    setMode("OCCUPY");
    setScope("WHOLE");
    setExtraProvinces([]);
    setAttackerDeltas(DEFAULT_ATTACKER_DELTAS);
    setDefenderDeltas(NO_DELTAS);
    setReason("");
  }, [open, province?.controller_id, province?.occupier_id, attackerFactionId]);

  const attacker = delegates.find((d) => String(d.id) === attackerId) ?? null;
  const defender = delegates.find((d) => String(d.id) === defenderId) ?? null;

  const { data: directives } = useNotes(
    { character_id: attacker?.id, note_type: "PRIVATE_DIRECTIVE" },
    open && attacker != null,
  );

  const provinceIds = useMemo(
    () => (provinceId ? [provinceId, ...extraProvinces.filter((p) => p !== provinceId)] : extraProvinces),
    [provinceId, extraProvinces],
  );

  const byArea = scope === "AREA";
  const valid =
    attacker != null &&
    noteId !== "" &&
    (byArea || provinceIds.length > 0) &&
    attacker.id !== defender?.id;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || !attacker) return;
    const request = {
      attacker_id: attacker.id,
      province_ids: byArea ? (provinceId ? [provinceId] : []) : provinceIds,
      crisis_note_id: Number(noteId),
      mode,
      attacker_deltas: parseDeltas(attackerDeltas),
      defender_id: defender?.id,
      defender_deltas: defender ? parseDeltas(defenderDeltas) : undefined,
      reason: reason || undefined,
    };
    if (byArea) {
      onDrawArea?.(request);
      onOpenChange(false);
      return;
    }
    invade.mutate(request, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-[20px] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Invasion</DialogTitle>
          <DialogDescription className="sr-only">Record an invasion</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {state.factions.length ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Invading faction">
                <NativeSelect
                  className="w-full"
                  value={attackerFaction}
                  onChange={(e) => {
                    setAttackerFaction(e.target.value);
                    const members = delegates.filter(inFaction(e.target.value));
                    setAttackerId(e.target.value && members.length === 1 ? String(members[0].id) : "");
                    setNoteId("");
                  }}
                >
                  <NativeSelectOption value="">Any faction</NativeSelectOption>
                  {state.factions.map((f) => (
                    <NativeSelectOption key={f.id} value={f.id}>
                      {f.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Defending faction">
                <NativeSelect
                  className="w-full"
                  value={defenderFaction}
                  onChange={(e) => {
                    setDefenderFaction(e.target.value);
                    const members = delegates.filter(inFaction(e.target.value));
                    if (e.target.value && !members.some((d) => String(d.id) === defenderId)) {
                      setDefenderId(members.length ? String(members[0].id) : "");
                    }
                  }}
                >
                  <NativeSelectOption value="">Any faction</NativeSelectOption>
                  {state.factions.map((f) => (
                    <NativeSelectOption key={f.id} value={f.id}>
                      {f.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Invading delegate">
              <NativeSelect className="w-full" value={attackerId} onChange={(e) => { setAttackerId(e.target.value); setNoteId(""); }}>
                <NativeSelectOption value="">Choose…</NativeSelectOption>
                {delegates.filter(inFaction(attackerFaction)).map((d) => (
                  <NativeSelectOption key={d.id} value={d.id} disabled={String(d.id) === defenderId}>
                    {d.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Defending delegate">
              <NativeSelect className="w-full" value={defenderId} onChange={(e) => setDefenderId(e.target.value)}>
                <NativeSelectOption value="">None / unclaimed</NativeSelectOption>
                {delegates.filter(inFaction(defenderFaction)).map((d) => (
                  <NativeSelectOption key={d.id} value={d.id} disabled={String(d.id) === attackerId}>
                    {d.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          </div>

          <Field label="Private directive ordering the invasion (required)">
            <NativeSelect className="w-full" value={noteId} onChange={(e) => setNoteId(e.target.value)} disabled={!attacker}>
              <NativeSelectOption value="">
                {!attacker ? "Pick the invader first" : directives?.length ? "Choose directive…" : "No private directives from this delegate"}
              </NativeSelectOption>
              {directives?.map((n) => (
                <NativeSelectOption key={n.id} value={n.id}>
                  {n.title}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {attacker ? (
              <button
                type="button"
                onClick={() => setWriting(true)}
                className="text-primary text-xs hover:underline"
              >
                + Write a new private directive for {attacker.name}
              </button>
            ) : null}
          </Field>

          <Field label="What's taken">
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["WHOLE", "Whole province(s)", "Every province ticked below changes hands."],
                  [
                    "AREA",
                    "Draw the area taken",
                    `Click the corners of just the part captured${province ? ` from ${PROVINCE_NAMES[province.id]}` : ""}.`,
                  ],
                ] as const
              ).map(([value, label, help]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={cn(
                    "rounded-md border p-2.5 text-left transition-colors",
                    scope === value ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border hover:bg-muted",
                  )}
                >
                  <div className="text-sm">{label}</div>
                  <div className="text-muted-foreground text-xs">{help}</div>
                </button>
              ))}
            </div>
          </Field>

          {!byArea ? (
          <Field label="Provinces">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(PROVINCE_NAMES).map(([id, name]) => {
                const on = provinceIds.includes(id);
                const fixed = id === provinceId;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={fixed}
                    onClick={() =>
                      setExtraProvinces((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]))
                    }
                    className={cn(
                      "rounded-sm border px-2 py-0.5 text-xs transition-colors",
                      on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-muted",
                      fixed && "cursor-default",
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </Field>
          ) : null}

          <Field label="Outcome">
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ["OCCUPY", "Occupy", "Owner keeps the title; invader's troops hold it (striped)."],
                  ["ANNEX", "Annex", "Invader becomes the new owner outright."],
                  ["CONTEST", "Contested", "Disputed: both sides' colours until you settle it."],
                ] as const
              ).map(([value, label, help]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMode(value)}
                  className={cn(
                    "rounded-md border p-2.5 text-left transition-colors",
                    mode === value ? "border-primary bg-primary/10 ring-1 ring-primary/40" : "border-border hover:bg-muted",
                  )}
                >
                  <div className="text-sm">{label}</div>
                  <div className="text-muted-foreground text-xs">{help}</div>
                </button>
              ))}
            </div>
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <DeltaEditor title="Invader adjustments" delegate={attacker} deltas={attackerDeltas} onChange={setAttackerDeltas} />
            <DeltaEditor title="Defender adjustments" delegate={defender} deltas={defenderDeltas} onChange={setDefenderDeltas} />
          </div>


          <Field label="Reason (optional)">
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Beiyang Army crosses the Yellow River" />
          </Field>

          <DialogFooter>
            <Button type="submit" disabled={!valid || invade.isPending}>
              {byArea ? "Next: draw the area on the map" : invade.isPending ? "Saving…" : "Record invasion"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <NewNoteDialog
        open={writing}
        onOpenChange={setWriting}
        defaultCharacterId={attacker?.id}
        defaultNoteType="PRIVATE_DIRECTIVE"
        onCreated={(note) => setNoteId(String(note.id))}
      />
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px]">{label}</Label>
      {children}
    </div>
  );
}

function DeltaEditor({
  title,
  delegate,
  deltas,
  onChange,
}: {
  title: string;
  delegate: DelegateResponse | null;
  deltas: Deltas;
  onChange: (d: Deltas) => void;
}) {
  return (
    <div className={cn("rounded-lg border space-y-2 p-3", !delegate && "opacity-50")}>
      <div className="text-xs">{title}</div>
      {INDICATORS.map((i) => {
        const current = delegate?.[i] ?? 0;
        const next = clampScore(current + (Number(deltas[i]) || 0));
        return (
          <div key={i} className="grid grid-cols-[1fr_4.5rem_3.5rem] items-center gap-2 text-sm">
            <span>{INDICATOR_LABELS[i]}</span>
            <Input
              type="number"
              step="0.5"
              min="-5"
              max="5"
              disabled={!delegate}
              placeholder="±0"
              value={deltas[i]}
              onChange={(e) => onChange({ ...deltas, [i]: e.target.value })}
              className="h-7 text-right"
            />
            <span className="text-muted-foreground text-right text-xs tabular-nums">
              {delegate ? `${current.toFixed(1)}→${next.toFixed(1)}` : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
