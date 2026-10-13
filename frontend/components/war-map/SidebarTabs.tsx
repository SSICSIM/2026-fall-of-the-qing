"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import {
  CheckIcon,
  ChevronRightIcon,
  MapPinIcon,
  MapPinOffIcon,
  MousePointerClickIcon,
  PlusIcon,
  XIcon,
  PencilRulerIcon,
  SendIcon,
  SwordsIcon,
  Trash2Icon,
  Undo2Icon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useNotes } from "@/hooks/useCrisisNotes";
import {
  useCreateConflict,
  useDeleteAnnotation,
  useCreateFaction,
  useDeleteConflict,
  useDeleteFaction,
  useUpdateFaction,
  useFormula,
  useMoveCharacter,
  useResolveConflict,
  useHistory,
  usePresets,
  usePublish,
  useUndo,
  useUpdateProfile,
  useRedrawProvince,
  useReturnTerritory,
  useUpdateProvince,
  useUpdateTerritory,
  useUpdateScores,
} from "@/hooks/useWarRoom";
import { FACTION_PALETTE, factionColor } from "@/lib/warRoom/colors";
import { holderIds, holderOf, provincesOf } from "@/lib/warRoom/control";
import {
  bandFor,
  clampScore,
  delegateEfficiency,
  formatRating,
  groupEfficiency,
  INDICATOR_LABELS,
  INDICATOR_SHORT,
  INDICATORS,
} from "@/lib/warRoom/efficiency";
import { defaultPinSpot } from "@/lib/warRoom/pins";
import { CITY_HOLDERS, PROVINCE_NAMES, QING, type CityHolder } from "@/lib/warRoom/provinces";
import { cn } from "@/lib/utils";
import type {
  BandTone,
  ConflictResponse,
  DelegateResponse,
  FactionResponse,
  Indicator,
  MapStateResponse,
  TerritoryCreate,
  TerritoryResponse,
  TerritoryStatus,
} from "@/types/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NewNoteDialog } from "./NewNoteDialog";
import { FormulaEditor } from "./FormulaEditor";
import { useAutoPlace } from "./useAutoPlace";
import { EmptyHint, SectionHeading, SettingRow } from "./parts";
import { PIN_COLORS } from "./PinDialog";
import type { Overlay } from "./QingMap";

/** Map-level actions the sidebar can trigger (owned by the map page). */
export interface MapActions {
  redrawing: boolean;
  /** Open the invasion form, optionally with an invading faction chosen. */
  onInvade: (options?: { attackerFactionId?: number }) => void;
  /** Edit a province's border by dragging its corners. */
  onRedrawBorder: (provinceId: string) => void;
  /** Click out an area that changes hands (e.g. a conflict's outcome). */
  onDrawTerritory: (request: Omit<TerritoryCreate, "polygon">, title: string) => void;
  onSelectTerritory: (id: number | null) => void;
}

export type SidebarTab = "map" | "factions" | "directives" | "conflicts" | "calculator" | "history";

export const OVERLAYS: { value: Overlay; label: string }[] = [
  { value: "control", label: "Control" },
  { value: "efficiency", label: "Efficiency" },
  { value: "reputation", label: "Legitimacy/Reputation" },
  { value: "economics", label: "Economics" },
  { value: "military", label: "Military" },
];

const NOBODY = "__nobody__";

export const BAND_TONE: Record<BandTone, string> = {
  bad: "bg-destructive text-white",
  neutral: "bg-chart-4 text-white",
  good: "bg-chart-2 text-white",
};

export function Swatch({ delegate, className }: { delegate: DelegateResponse; className?: string }) {
  return (
    <span
      className={cn(
        "flex size-[30px] shrink-0 items-center justify-center rounded-full text-[0.7em] font-semibold tracking-wide text-white ring-2 ring-background",
        className,
      )}
      style={{ background: factionColor(delegate) }}
    >
      {delegate.name
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase())
        .join("")}
    </span>
  );
}

function DelegateSelect({
  id,
  value,
  onChange,
  delegates,
  emptyLabel,
}: {
  id?: string;
  value: number | null;
  onChange: (id: number | null) => void;
  delegates: DelegateResponse[];
  emptyLabel: string;
}) {
  return (
    <Select
      value={value != null ? String(value) : NOBODY}
      onValueChange={(v) => onChange(v === NOBODY ? null : Number(v))}
    >
      <SelectTrigger id={id} className="w-[150px] text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={NOBODY}>{emptyLabel}</SelectItem>
        {delegates.map((d) => (
          <SelectItem key={d.id} value={String(d.id)}>
            <span className="size-2 rounded-full" style={{ backgroundColor: factionColor(d) }} />
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── Map ──────────────────────────────────────────────────────────────────────

export function MapTab({
  state,
  overlay,
  onOverlay,
  selected,
  selectedTerritory,
  actions,
  legend,
}: {
  state: MapStateResponse;
  overlay: Overlay;
  onOverlay: (o: Overlay) => void;
  selected: string | null;
  selectedTerritory: number | null;
  actions: MapActions;
  legend: React.ReactNode;
}) {
  const territory = state.territories.find((t) => t.id === selectedTerritory);
  const undo = useUndo();
  const { data: history } = useHistory();
  const last = history?.find((b) => !b.reverted);

  return (
    <div className="space-y-7">
      <section>
        <SectionHeading title="Legend" />
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3">
          <li className="flex items-center gap-2.5 text-sm">
            <span className="relative size-6 shrink-0 rounded-full border border-[#FF0404] bg-[#C8C5C5]" />
            Character
          </li>
          <li className="flex items-center gap-2.5 text-sm">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#D08700]">
              <SwordsIcon className="size-3.5" />
            </span>
            Conflict
          </li>
        </ul>
        <ul className="text-muted-foreground mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {(Object.keys(CITY_HOLDERS) as CityHolder[]).map((h) => (
            <li key={h}>
              <span className="text-foreground font-semibold">{h}</span>: {CITY_HOLDERS[h]}
            </li>
          ))}
        </ul>
        <div className="mt-4">{legend}</div>
      </section>

      <section>
        <SectionHeading title="Actions" />
        <div className="mt-3 divide-y rounded-lg border">
          <SettingRow label="Overlay" htmlFor="overlay">
            <Select value={overlay} onValueChange={(v) => onOverlay(v as Overlay)}>
              <SelectTrigger id="overlay" className="w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                {OVERLAYS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
          <SettingRow label="Undo last change" hint={last ? last.summary : "Nothing to undo"}>
            <Button size="sm" variant="outline" disabled={!last || undo.isPending} onClick={() => undo.mutate()}>
              <Undo2Icon />
              Undo
            </Button>
          </SettingRow>
        </div>
      </section>

      {territory ? (
        <TerritoryPanel key={territory.id} state={state} territory={territory} actions={actions} />
      ) : selected ? (
        <ProvincePanel
          key={selected}
          state={state}
          provinceId={selected}
          onInvade={actions.onInvade}
          onRedraw={() => actions.onRedrawBorder(selected)}
          redrawing={actions.redrawing}
        />
      ) : (
        <EmptyHint icon={<MousePointerClickIcon className="size-5 shrink-0" />}>
          Select a province or a captured area
        </EmptyHint>
      )}

      <TerritoryList state={state} actions={actions} />

      <PinsSection state={state} />
    </div>
  );
}

function ProvincePanel({
  state,
  provinceId,
  onInvade,
  onRedraw,
  redrawing,
}: {
  state: MapStateResponse;
  provinceId: string;
  onInvade: () => void;
  onRedraw: () => void;
  redrawing: boolean;
}) {
  const updateProvince = useUpdateProvince();
  const redrawProvince = useRedrawProvince();
  const delegates = useMemo(() => new Map(state.delegates.map((d) => [d.id, d])), [state.delegates]);
  const { bands } = useFormula();
  const province = state.provinces.find((p) => p.id === provinceId);
  if (!province) return null;
  const holder = holderOf(province, delegates);
  const band = holder?.published_efficiency != null ? bandFor(holder.published_efficiency, bands) : null;
  const sharers = province.co_holder_ids.flatMap((id) => (delegates.has(id) ? [delegates.get(id)!] : []));
  const setSharers = (ids: number[]) => updateProvince.mutate({ id: province.id, body: { co_holder_ids: ids } });

  return (
    <section>
      <SectionHeading title={PROVINCE_NAMES[province.id]}>
        <Badge variant={holder ? "secondary" : "outline"}>
          {province.contested_by_id != null
            ? "Contested"
            : province.occupier_id != null
              ? "Occupied"
              : holder
                ? sharers.length
                  ? `Shared by ${holderIds(province).length}`
                  : "Held alone"
                : "Unclaimed"}
        </Badge>
      </SectionHeading>
      <div className="mt-3 divide-y rounded-lg border">
        {holder ? (
          <div className="px-3.5 py-3">
            <div className="flex items-center gap-2">
              <Swatch delegate={holder} className="size-6 ring-0" />
              <span className="text-sm font-medium">{holder.name}</span>
              {band ? <Badge className={cn("ml-auto", BAND_TONE[band.tone])}>{band.label}</Badge> : null}
            </div>
            <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[
                ["Efficiency", formatRating(holder.published_efficiency)],
                ["Legit.", holder.reputation.toFixed(1)],
                ["Econ.", holder.economics.toFixed(1)],
                ["Military", holder.military.toFixed(1)],
              ].map(([label, value]) => (
                <div key={label} className="bg-muted rounded-md px-1 py-1.5">
                  <dt className="text-muted-foreground text-[10px]">{label}</dt>
                  <dd className="text-base font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        <SettingRow label="Owner" htmlFor="owner">
          <DelegateSelect
            id="owner"
            value={province.controller_id}
            delegates={state.delegates}
            emptyLabel="Unclaimed"
            onChange={(id) => updateProvince.mutate({ id: province.id, body: { controller_id: id } })}
          />
        </SettingRow>
        {province.controller_id != null ? (
          <div className="space-y-2 px-3.5 py-3">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-medium">Shared with</span>
              <DelegateSelect
                value={null}
                delegates={state.delegates.filter((d) => !holderIds(province).includes(d.id))}
                emptyLabel="Add…"
                onChange={(id) => id != null && setSharers([...province.co_holder_ids, id])}
              />
            </div>
            {sharers.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {sharers.map((d) => (
                  <li key={d.id} className="bg-muted inline-flex items-center gap-1.5 rounded-md py-0.5 pr-1 pl-2 text-xs">
                    <span className="size-2 rounded-full" style={{ background: factionColor(d) }} />
                    {d.name}
                    <button
                      type="button"
                      aria-label={`Stop sharing with ${d.name}`}
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setSharers(province.co_holder_ids.filter((x) => x !== d.id))}
                    >
                      <XIcon className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <SettingRow label="Occupied by" hint="Drawn striped" htmlFor="occupier">
          <DelegateSelect
            id="occupier"
            value={province.occupier_id}
            delegates={state.delegates}
            emptyLabel="Nobody"
            onChange={(id) => updateProvince.mutate({ id: province.id, body: { occupier_id: id } })}
          />
        </SettingRow>
        <SettingRow label="Contested by" hint="Both colours until settled" htmlFor="contester">
          <DelegateSelect
            id="contester"
            value={province.contested_by_id}
            delegates={state.delegates}
            emptyLabel="Not contested"
            onChange={(id) => updateProvince.mutate({ id: province.id, body: { contested_by_id: id } })}
          />
        </SettingRow>
        {province.contested_by_id != null ? (
          <div className="bg-destructive/5 flex flex-wrap items-center gap-2 px-3.5 py-3">
            <span className="text-destructive text-xs font-medium">Settle the dispute:</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() =>
                updateProvince.mutate({
                  id: province.id,
                  body: { controller_id: province.contested_by_id, contested_by_id: null, reason: "Dispute settled" },
                })
              }
            >
              {delegates.get(province.contested_by_id)?.name ?? "Contester"} takes it
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() =>
                updateProvince.mutate({ id: province.id, body: { contested_by_id: null, reason: "Dispute settled" } })
              }
            >
              {province.controller_id != null ? `${delegates.get(province.controller_id)?.name} holds` : "Repelled"}
            </Button>
          </div>
        ) : null}
        <SettingRow
          label="Border"
          hint={province.shape ? "Redrawn by staff" : "Original outline"}
        >
          <div className="flex gap-1.5">
            {province.shape ? (
              <Button
                size="sm"
                variant="ghost"
                disabled={redrawProvince.isPending || redrawing}
                onClick={() => redrawProvince.mutate({ id: province.id, body: { shape: null } })}
              >
                Reset to original
              </Button>
            ) : null}
            <Button size="sm" variant="outline" disabled={redrawing} onClick={onRedraw}>
              <PencilRulerIcon />
              Redraw border
            </Button>
          </div>
        </SettingRow>
        <div className="px-3.5 py-3">
          <Button className="w-full" size="sm" onClick={onInvade}>
            <SwordsIcon />
            Invade {PROVINCE_NAMES[province.id]}
          </Button>
        </div>
      </div>
    </section>
  );
}

// ── Factions ─────────────────────────────────────────────────────────────────

export function FactionsTab({
  state,
  selectedCharacterId,
  actions,
}: {
  state: MapStateResponse;
  selectedCharacterId: number | null;
  actions: MapActions;
}) {
  const createFaction = useCreateFaction();
  const [newName, setNewName] = useState("");
  const { offMap, landless, placeable, place, pending } = useAutoPlace(state);
  const known = new Set(state.factions.map((f) => f.id));
  const members = (factionId: number | null) =>
    state.delegates.filter((d) => (factionId == null ? d.faction_id == null || !known.has(d.faction_id) : d.faction_id === factionId));
  const unaffiliated = members(null);
  const row = (d: DelegateResponse) => (
    <FactionRow
      key={d.id}
      state={state}
      delegate={d}
      provinces={provincesOf(d.id, state.provinces).map((p) => PROVINCE_NAMES[p.id])}
      selected={selectedCharacterId === d.id}
    />
  );

  return (
    <div className="space-y-6">
      <section>
        <SectionHeading title="Factions">
          <span className="text-muted-foreground text-xs">{state.factions.length}</span>
        </SectionHeading>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (newName.trim()) createFaction.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") });
          }}
        >
          <Input
            id="new-faction"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New faction, e.g. Zhili"
            className="h-8 text-xs md:text-xs"
          />
          <Button type="submit" size="sm" className="h-8" disabled={!newName.trim() || createFaction.isPending}>
            <PlusIcon />
            Add
          </Button>
        </form>
        {state.delegates.length ? (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-muted-foreground flex-1 text-xs">
              {offMap.length ? `${offMap.length} off the map` : "Everyone is on the map"}
              {landless.length ? ` · ${landless.length} with no province, place by hand` : ""}
            </span>
            {placeable ? (
              <Button size="sm" className="h-7" disabled={pending} onClick={() => place(offMap)}>
                <MapPinIcon />
                Place on map
              </Button>
            ) : null}
            <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={() => place(state.delegates)}>
              Re-place everyone
            </Button>
          </div>
        ) : null}
      </section>

      {state.factions.map((f) => (
        <FactionGroup key={f.id} faction={f} state={state} members={members(f.id)} actions={actions}>
          {members(f.id).map(row)}
        </FactionGroup>
      ))}

      {unaffiliated.length ? (
        <section>
          <SectionHeading title="No faction">
            <span className="text-muted-foreground text-xs">{unaffiliated.length}</span>
          </SectionHeading>
          <ul className="mt-3 space-y-2">{unaffiliated.map(row)}</ul>
        </section>
      ) : null}
      {state.delegates.length === 0 ? <EmptyHint>Add characters from the sidebar header first.</EmptyHint> : null}
    </div>
  );
}

function FactionGroup({
  faction,
  state,
  members,
  actions,
  children,
}: {
  faction: FactionResponse;
  state: MapStateResponse;
  members: DelegateResponse[];
  actions: MapActions;
  children: React.ReactNode;
}) {
  const [conflict, setConflict] = useState(false);
  const update = useUpdateFaction();
  const remove = useDeleteFaction();
  const [name, setName] = useState(faction.name);
  const shown = faction.color ?? FACTION_PALETTE[faction.id % FACTION_PALETTE.length];
  const [color, setColor] = useState(shown);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setName(faction.name), [faction.name]);
  useEffect(() => {
    if (faction.color) setColor(faction.color);
  }, [faction.color]);
  const held = new Set(members.flatMap((d) => provincesOf(d.id, state.provinces).map((p) => p.id)));

  return (
    <section>
      <div className="flex items-center gap-2">
        <label className="relative size-6 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: color }}>
          <input
            type="color"
            aria-label={`${faction.name} colour`}
            className="absolute inset-0 cursor-pointer opacity-0"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            onBlur={() => color !== shown && update.mutate({ id: faction.id, body: { color } })}
          />
        </label>
        <Input
          id={`faction-name-${faction.id}`}
          aria-label="Faction name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== faction.name && update.mutate({ id: faction.id, body: { name: name.trim() } })}
          className="h-8 min-w-0 flex-1 border-transparent px-1.5 text-base font-semibold shadow-none hover:border-input focus-visible:border-input"
        />
        <span className="text-muted-foreground shrink-0 text-xs">
          {members.length} · {held.size} prov.
        </span>
        {confirming ? (
          <Button size="sm" variant="destructive" className="h-7" onClick={() => remove.mutate(faction.id)}>
            Remove
          </Button>
        ) : (
          <Button size="icon" variant="ghost" className="size-7" aria-label={`Remove ${faction.name}`} onClick={() => setConfirming(true)}>
            <Trash2Icon />
          </Button>
        )}
      </div>
      {members.length ? (
        <>
          <div className="mt-1.5 flex gap-1.5 pl-8">
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => actions.onInvade({ attackerFactionId: faction.id })}>
              <SwordsIcon />
              Invade
            </Button>
            <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setConflict(true)}>
              Start conflict
            </Button>
          </div>
          <ul className="mt-2.5 space-y-2">{children}</ul>
        </>
      ) : (
        <p className="text-muted-foreground mt-2 text-xs">No members yet. Pick this faction on a character below.</p>
      )}
      <CreateConflictDialog open={conflict} onOpenChange={setConflict} state={state} defaultFactionIds={[faction.id]} />
    </section>
  );
}

function FactionRow({
  state,
  delegate: d,
  provinces,
  selected,
}: {
  state: MapStateResponse;
  delegate: DelegateResponse;
  provinces: string[];
  selected: boolean;
}) {
  const [open, setOpen] = useState(selected);
  const move = useMoveCharacter();
  useEffect(() => {
    if (selected) setOpen(true);
  }, [selected]);
  const onMap = d.x != null;
  const place = () => {
    const labels = Object.fromEntries(QING.provinces.map((p) => [p.id, p.label]));
    const [x, y] = defaultPinSpot(d, state.provinces, labels, [QING.width / 2, QING.height / 2]);
    move.mutate({ id: d.id, x, y });
  };
  return (
    <li
      ref={(el) => {
        if (el && selected) el.scrollIntoView({ block: "nearest" });
      }}
      className={cn("overflow-hidden rounded-lg border", selected && "border-accent ring-accent/40 ring-2")}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="hover:bg-muted/60 flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
            <Swatch delegate={d} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold">{d.name}</div>
              <div className="text-muted-foreground text-xs">
                {onMap ? "" : "Off map · "}
                {provinces.length ? provinces.join(", ") : "No provinces"} · L {d.reputation.toFixed(1)} · E{" "}
                {d.economics.toFixed(1)} · M {d.military.toFixed(1)}
              </div>
            </div>
            <span className="text-sm font-semibold tabular-nums">{formatRating(d.published_efficiency)}</span>
            <ChevronRightIcon className={cn("text-muted-foreground size-4 transition-transform", open && "rotate-90")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <FactionEditor
            delegate={d}
            factions={state.factions}
            onPlace={place}
            onRemove={() => move.mutate({ id: d.id, x: null, y: null })}
          />
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function FactionEditor({
  delegate: d,
  factions,
  onPlace,
  onRemove,
}: {
  delegate: DelegateResponse;
  factions: FactionResponse[];
  onPlace: () => void;
  onRemove: () => void;
}) {
  const [writing, setWriting] = useState(false);
  const updateScores = useUpdateScores();
  const updateProfile = useUpdateProfile();
  const [scores, setScores] = useState<Record<Indicator, string>>({
    reputation: String(d.reputation),
    economics: String(d.economics),
    military: String(d.military),
  });
  const [notes, setNotes] = useState(d.staff_notes ?? "");
  useEffect(() => {
    setScores({ reputation: String(d.reputation), economics: String(d.economics), military: String(d.military) });
  }, [d.reputation, d.economics, d.military]);
  useEffect(() => setNotes(d.staff_notes ?? ""), [d.staff_notes]);

  const dirty = INDICATORS.some((i) => Number(scores[i]) !== d[i]);

  return (
    <div className="bg-muted/40 space-y-3 border-t px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        {INDICATORS.map((i) => (
          <label key={i} className="space-y-1">
            <span className="text-muted-foreground text-[11px]">{INDICATOR_LABELS[i]}</span>
            <Input
              type="number"
              step="0.5"
              min="0"
              max="5"
              value={scores[i]}
              onChange={(e) => setScores((s) => ({ ...s, [i]: e.target.value }))}
              className="bg-background h-8 text-center text-xs tabular-nums md:text-xs"
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">{d.x != null ? "On the map, drag the pin to move" : "Not on the map"}</span>
        {d.x != null ? (
          <Button size="sm" variant="outline" className="h-7" onClick={onRemove}>
            <MapPinOffIcon />
            Remove
          </Button>
        ) : (
          <Button size="sm" variant="outline" className="h-7" onClick={onPlace}>
            <MapPinIcon />
            Place on map
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Select
            value={d.faction_id != null ? String(d.faction_id) : NOBODY}
            onValueChange={(v) => updateProfile.mutate({ id: d.id, body: { faction_id: v === NOBODY ? null : Number(v) } })}
          >
            <SelectTrigger size="sm" className="bg-background h-7 w-[150px] text-xs" aria-label="Faction">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>No faction</SelectItem>
              {factions.map((f) => (
                <SelectItem key={f.id} value={String(f.id)}>
                  <span className="size-2 rounded-full" style={{ backgroundColor: f.color ?? undefined }} />
                  {f.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={d.home_province_id ?? NOBODY}
            onValueChange={(v) => updateProfile.mutate({ id: d.id, body: { home_province_id: v === NOBODY ? null : v } })}
          >
            <SelectTrigger size="sm" className="bg-background h-7 w-[120px] text-xs" aria-label="Based in">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NOBODY}>No home</SelectItem>
              {QING.provinces.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!factions.find((f) => f.id === d.faction_id)?.color ? (
            <label className="flex items-center gap-1.5 text-xs">
              <span className="relative size-5 overflow-hidden rounded-full ring-1 ring-black/10" style={{ background: factionColor(d) }}>
                <input
                  type="color"
                  aria-label="Colour"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  value={factionColor(d)}
                  onChange={(e) => updateProfile.mutate({ id: d.id, body: { color: e.target.value } })}
                />
              </span>
              Colour
            </label>
          ) : null}
        </div>
        <Button
          size="sm"
          disabled={!dirty || updateScores.isPending}
          onClick={() =>
            updateScores.mutate({
              updates: [
                {
                  character_id: d.id,
                  ...Object.fromEntries(INDICATORS.map((i) => [i, clampScore(Number(scores[i]))])),
                },
              ],
            })
          }
        >
          Save scores
        </Button>
      </div>
      <Textarea
        rows={2}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (d.staff_notes ?? "") && updateProfile.mutate({ id: d.id, body: { staff_notes: notes || null } })}
        placeholder="Staff notes"
        className="bg-background text-xs md:text-xs"
      />
      <Button size="sm" variant="outline" className="h-7 w-full" onClick={() => setWriting(true)}>
        <PlusIcon />
        New directive for {d.name}
      </Button>
      <NewNoteDialog
        open={writing}
        onOpenChange={setWriting}
        defaultCharacterId={d.id}
        defaultNoteType="PRIVATE_DIRECTIVE"
      />
    </div>
  );
}

// ── Calculator ───────────────────────────────────────────────────────────────

const NO_PRESET = "__none__";

export function CalculatorTab({ state }: { state: MapStateResponse }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [indicators, setIndicators] = useState<Indicator[]>([...INDICATORS]);
  const { data: presets = [] } = usePresets();
  const publish = usePublish();
  const updateScores = useUpdateScores();
  const formula = useFormula();
  // Typed but unsaved scores; the rating previews against them.
  const [drafts, setDrafts] = useState<Record<number, Partial<Record<Indicator, string>>>>({});

  const scoresOf = (d: DelegateResponse) =>
    Object.fromEntries(
      INDICATORS.map((i) => {
        const v = drafts[d.id]?.[i];
        return [i, v != null && v !== "" ? clampScore(Number(v)) : d[i]];
      }),
    ) as Record<Indicator, number>;
  const dirty = state.delegates.filter((d) => INDICATORS.some((i) => scoresOf(d)[i] !== d[i]));
  const saveScores = () =>
    updateScores.mutate(
      { updates: dirty.map((d) => ({ character_id: d.id, ...scoresOf(d) })) },
      { onSuccess: () => setDrafts({}) },
    );

  const chosen = state.delegates.filter((d) => selected.includes(d.id));
  const rating = groupEfficiency(chosen.map(scoresOf), indicators, formula.midpoint);
  const band = rating == null ? null : bandFor(rating, formula.bands);

  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleIndicator = (i: Indicator) => {
    const next = indicators.includes(i) ? indicators.filter((x) => x !== i) : [...indicators, i];
    if (next.length) setIndicators(INDICATORS.filter((x) => next.includes(x)));
  };

  return (
    <div className="space-y-7">
      <section>
        <SectionHeading title="Efficiency">
          <Button variant="outline" size="sm" className="h-7" asChild>
            <Link href="/calculator">Full ledger</Link>
          </Button>
        </SectionHeading>

        <div className="mt-3 rounded-lg border px-3.5 py-4 text-center">
          <div className="text-4xl font-bold tabular-nums">{formatRating(rating)}</div>
          <p className="text-muted-foreground mt-1 text-xs">
            {chosen.length > 1 ? `Average of ${chosen.length} delegates` : chosen.length ? chosen[0].name : "Select delegates below"}
          </p>
          {band ? (
            <div className="mt-3 text-left">
              <Badge className={BAND_TONE[band.tone]}>{band.label}</Badge>
              <ul className="text-muted-foreground mt-2 list-inside list-disc text-xs">
                {band.tips.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <Button
          className="mt-3 w-full"
          size="sm"
          disabled={!chosen.length || dirty.length > 0 || publish.isPending}
          onClick={() => publish.mutate({ character_ids: selected, indicators })}
        >
          <SendIcon />
          Confirm &amp; send to map
        </Button>
        {dirty.length ? <p className="text-muted-foreground mt-1.5 text-center text-xs">Save score changes first.</p> : null}
      </section>

      <section>
        <SectionHeading title="Indicators" />
        <div className="mt-3 flex flex-wrap gap-4">
          {INDICATORS.map((i) => (
            <label key={i} className="flex items-center gap-2 text-sm">
              <Checkbox checked={indicators.includes(i)} onCheckedChange={() => toggleIndicator(i)} />
              {INDICATOR_LABELS[i]}
            </label>
          ))}
        </div>
      </section>

      <FormulaEditor />

      <section>
        <SectionHeading title="Delegates">
          {presets.length || state.factions.length ? (
            <Select
              value={NO_PRESET}
              onValueChange={(v) => {
                if (v.startsWith("faction:")) {
                  const id = Number(v.slice(8));
                  setSelected(state.delegates.filter((d) => d.faction_id === id).map((d) => d.id));
                  return;
                }
                const p = presets.find((x) => String(x.id) === v);
                if (p) setSelected(p.character_ids);
              }}
            >
              <SelectTrigger size="sm" className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value={NO_PRESET}>Select a group…</SelectItem>
                {state.factions.map((f) => (
                  <SelectItem key={`f${f.id}`} value={`faction:${f.id}`}>
                    <span className="size-2 rounded-full" style={{ backgroundColor: f.color ?? undefined }} />
                    {f.name}
                  </SelectItem>
                ))}
                {presets.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </SectionHeading>
        <div className="text-muted-foreground mt-3 flex items-center gap-1.5 px-3 text-[10px]">
          <span className="flex-1">Scores 0–5</span>
          {INDICATORS.map((i) => (
            <span key={i} className="w-11 text-center">
              {INDICATOR_SHORT[i]}
            </span>
          ))}
          <span className="w-9 text-right">Eff.</span>
        </div>
        <ul className="mt-1 divide-y rounded-lg border">
          {state.delegates.map((d) => (
            <li key={d.id} className="hover:bg-muted/60 flex items-center gap-1.5 px-3 py-1.5">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                <Checkbox checked={selected.includes(d.id)} onCheckedChange={() => toggle(d.id)} />
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: factionColor(d) }} />
                <span className="min-w-0 flex-1 truncate text-sm">{d.name}</span>
              </label>
              {INDICATORS.map((i) => {
                const changed = scoresOf(d)[i] !== d[i];
                return (
                  <Input
                    key={i}
                    type="number"
                    step="0.5"
                    min="0"
                    max="5"
                    aria-label={`${d.name} ${INDICATOR_LABELS[i]}`}
                    value={drafts[d.id]?.[i] ?? String(d[i])}
                    onChange={(e) => setDrafts((x) => ({ ...x, [d.id]: { ...x[d.id], [i]: e.target.value } }))}
                    className={cn(
                      "h-7 w-11 px-1 text-center text-xs tabular-nums md:text-xs",
                      changed && "border-primary bg-primary/15 font-semibold",
                    )}
                  />
                );
              })}
              <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                {formatRating(delegateEfficiency(scoresOf(d), indicators, formula.midpoint))}
              </span>
            </li>
          ))}
        </ul>
        {dirty.length ? (
          <div className="mt-2 flex items-center justify-end gap-2">
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setDrafts({})}>
              Discard
            </Button>
            <Button size="sm" className="h-7" disabled={updateScores.isPending} onClick={saveScores}>
              Save scores ({dirty.length})
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

// ── Pins ─────────────────────────────────────────────────────────────────────


function PinsSection({ state }: { state: MapStateResponse }) {
  const deleteAnnotation = useDeleteAnnotation();
  const { data: notes } = useNotes({});
  const noteTitle = new Map(notes?.map((n) => [n.id, `${n.character.name}: ${n.title}`]));
  return (
    <section>
      <SectionHeading title="War pins">
        <span className="text-muted-foreground text-xs">{state.annotations.length}</span>
      </SectionHeading>
      {state.annotations.length === 0 ? (
        <div className="mt-3">
          <EmptyHint>Use the pin tool to mark battles and sieges on the map.</EmptyHint>
        </div>
      ) : (
        <ul className="mt-3 divide-y rounded-lg border">
          {state.annotations.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5 px-3 py-2.5">
              <span
                className="mt-1 size-3 shrink-0 rounded-full"
                style={{ background: a.color ?? (a.kind === "PIN" ? PIN_COLORS[0] : "#2b1d0e") }}
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">
                  {a.kind === "PIN" ? a.label || "War pin" : `${a.dashed ? "Dashed" : "Solid"} line`}
                </div>
                {a.crisis_note_id != null ? (
                  <div className="text-muted-foreground truncate text-xs">
                    {noteTitle.get(a.crisis_note_id) ?? `Note #${a.crisis_note_id}`}
                  </div>
                ) : null}
              </div>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Erase"
                className="text-muted-foreground hover:text-destructive"
                onClick={() => deleteAnnotation.mutate(a.id)}
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── History ──────────────────────────────────────────────────────────────────

const KIND_LABEL = {
  BORDER: "Border",
  MOVE: "Move",
  SCORE_EDIT: "Scores",
  PUBLISH: "Sent to map",
  INVASION: "Invasion",
  PROVINCE_EDIT: "Province",
} as const;

export function HistoryTab() {
  const { data: history = [] } = useHistory();
  const undo = useUndo();
  const canUndo = history.some((b) => !b.reverted);
  return (
    <section>
      <SectionHeading title="History">
        <Button size="sm" variant="outline" className="h-7" disabled={!canUndo || undo.isPending} onClick={() => undo.mutate()}>
          <Undo2Icon />
          Undo last
        </Button>
      </SectionHeading>
      {history.length === 0 ? (
        <div className="mt-3">
          <EmptyHint>Nothing recorded yet.</EmptyHint>
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {history.map((b) => (
            <li key={b.id} className={cn("rounded-lg border px-3 py-2.5", b.reverted && "opacity-50")}>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="h-[18px] px-1.5 text-[10px]">
                  {KIND_LABEL[b.kind]}
                </Badge>
                <span className="text-muted-foreground ml-auto text-[11px]">
                  {b.reverted ? "Undone" : formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                </span>
              </div>
              <p className={cn("mt-1 text-sm", b.reverted && "line-through")}>{b.summary}</p>
              {b.reason ? <p className="text-muted-foreground text-xs">{b.reason}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Conflicts ────────────────────────────────────────────────────────────────

export function ConflictsTab({
  state,
  selectedConflictId,
  actions,
}: {
  state: MapStateResponse;
  selectedConflictId: number | null;
  actions: MapActions;
}) {
  const [creating, setCreating] = useState(false);
  const { data: history = [] } = useHistory();
  const invasions = history.filter((b) => b.kind === "INVASION" && !b.reverted);
  const ongoing = state.conflicts.filter((c) => c.status === "ONGOING");
  const resolved = state.conflicts.filter((c) => c.status === "RESOLVED");
  return (
    <div className="space-y-7">
      <section>
        <SectionHeading title="Ongoing conflicts">
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" className="h-7" onClick={() => actions.onInvade()}>
              <SwordsIcon />
              Invade
            </Button>
            <Button size="sm" className="h-7" onClick={() => setCreating(true)}>
              Create
            </Button>
          </div>
        </SectionHeading>
        {ongoing.length ? (
          <ul className="mt-3 space-y-2.5">
            {ongoing.map((c) => (
              <ConflictRow key={c.id} conflict={c} state={state} selected={c.id === selectedConflictId} actions={actions} />
            ))}
          </ul>
        ) : (
          <div className="mt-3">
            <EmptyHint>No ongoing conflicts. Battle markers appear above the parties&apos; pins.</EmptyHint>
          </div>
        )}
      </section>
      <section>
        <SectionHeading title="Resolved conflicts" />
        {resolved.length ? (
          <ul className="mt-3 space-y-2.5">
            {resolved.map((c) => (
              <ConflictRow key={c.id} conflict={c} state={state} selected={c.id === selectedConflictId} actions={actions} />
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">Nothing resolved yet.</p>
        )}
      </section>
      <section>
        <SectionHeading title="Invasions" />
        {invasions.length ? (
          <ul className="mt-3 divide-y rounded-lg border text-sm">
            {invasions.map((b) => (
              <li key={b.id} className="px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0">{b.summary}</span>
                  <span className="text-muted-foreground shrink-0 text-[11px]">
                    {formatDistanceToNow(new Date(b.created_at), { addSuffix: true })}
                  </span>
                </div>
                {b.reason ? <p className="text-muted-foreground text-xs">{b.reason}</p> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground mt-3 text-xs">No invasions yet.</p>
        )}
      </section>
      <CreateConflictDialog open={creating} onOpenChange={setCreating} state={state} />
    </div>
  );
}

function PartyAvatars({ conflict, state }: { conflict: ConflictResponse; state: MapStateResponse }) {
  return (
    <span className="flex shrink-0 -space-x-4">
      {conflict.parties.slice(0, 2).map((p) => {
        const d = state.delegates.find((x) => x.id === p.id);
        return d ? <Swatch key={p.id} delegate={d} /> : null;
      })}
    </span>
  );
}

function ConflictRow({
  conflict,
  state,
  selected,
  actions,
}: {
  conflict: ConflictResponse;
  state: MapStateResponse;
  selected: boolean;
  actions: MapActions;
}) {
  const [open, setOpen] = useState(selected);
  useEffect(() => {
    if (selected) setOpen(true);
  }, [selected]);
  const resolve = useResolveConflict();
  const remove = useDeleteConflict();
  const [winner, setWinner] = useState<string>(NOBODY);
  const [outcome, setOutcome] = useState("");
  const { data: notes } = useNotes({}, open && conflict.crisis_note_id != null);
  const note = notes?.find((n) => n.id === conflict.crisis_note_id);
  const winnerName = conflict.parties.find((p) => p.id === conflict.winner_id)?.name;

  return (
    <li
      ref={(el) => {
        if (el && selected) el.scrollIntoView({ block: "nearest" });
      }}
      className={cn("overflow-hidden rounded-lg border shadow-sm", selected && "border-accent ring-accent/40 ring-2")}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button type="button" className="hover:bg-muted/60 flex min-h-[58px] w-full items-center gap-2 py-2 pr-3 pl-1.5 text-left">
            <PartyAvatars conflict={conflict} state={state} />
            <span className="min-w-0 flex-1 pl-1">
              <span className="block truncate text-base leading-6 font-semibold">{conflict.name}</span>
              <span className="block truncate text-xs">{conflict.parties.map((p) => p.name).join(", ")}</span>
            </span>
            {conflict.status === "RESOLVED" ? (
              <Badge className="bg-chart-2 h-[18px] gap-0.5 px-1.5 text-[10px] text-white">
                <CheckIcon className="size-2.5!" />
                Resolved
              </Badge>
            ) : null}
            <ChevronRightIcon className={cn("size-5 shrink-0 transition-transform", open && "rotate-90")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="bg-muted/40 space-y-3 border-t px-3 py-3 text-sm">
            {note ? <p className="text-muted-foreground text-xs">Directive: {note.title}</p> : null}
            {conflict.status === "RESOLVED" ? (
              <div className="space-y-3">
                <p>
                  <span className="font-medium">{winnerName ? `${winnerName} prevailed.` : "No clear victor."}</span>
                  {conflict.outcome_summary ? ` ${conflict.outcome_summary}` : ""}
                </p>
                <BorderFollowUp conflict={conflict} state={state} actions={actions} />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">Winner</span>
                  <Select value={winner} onValueChange={setWinner}>
                    <SelectTrigger size="sm" className="bg-background h-7 w-[160px] text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent align="end">
                      <SelectItem value={NOBODY}>No clear victor</SelectItem>
                      {conflict.parties.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Textarea
                  rows={2}
                  value={outcome}
                  onChange={(e) => setOutcome(e.target.value)}
                  placeholder="What happened?"
                  className="bg-background text-xs md:text-xs"
                />
                <Button
                  size="sm"
                  className="w-full"
                  disabled={resolve.isPending}
                  onClick={() =>
                    resolve.mutate({
                      id: conflict.id,
                      body: {
                        winner_id: winner === NOBODY ? null : Number(winner),
                        outcome_summary: outcome || undefined,
                      },
                    })
                  }
                >
                  <CheckIcon />
                  Resolve
                </Button>
              </div>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive h-7 w-full"
              onClick={() => remove.mutate(conflict.id)}
            >
              <Trash2Icon />
              Delete conflict
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

const NO_NOTE = "__none__";

function CreateConflictDialog({
  open,
  onOpenChange,
  state,
  defaultFactionIds = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: MapStateResponse;
  /** Factions whose members start ticked as parties. */
  defaultFactionIds?: number[];
}) {
  const [name, setName] = useState("");
  const [parties, setParties] = useState<number[]>([]);
  const [noteId, setNoteId] = useState(NO_NOTE);
  const { data: notes } = useNotes({}, open);
  const create = useCreateConflict();

  const membersOf = (factionId: number) => state.delegates.filter((d) => d.faction_id === factionId).map((d) => d.id);

  useEffect(() => {
    if (open) {
      setName("");
      setParties(state.delegates.filter((d) => d.faction_id != null && defaultFactionIds.includes(d.faction_id)).map((d) => d.id));
      setNoteId(NO_NOTE);
    }
    // Only when the dialog opens: later map updates mustn't reset the form.
  }, [open]);

  const valid = name.trim() !== "" && parties.length >= 2;
  const toggleFaction = (factionId: number) => {
    const ids = membersOf(factionId);
    const all = ids.length > 0 && ids.every((id) => parties.includes(id));
    setParties((ps) => (all ? ps.filter((id) => !ids.includes(id)) : [...new Set([...ps, ...ids])]));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-[20px] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">Start a conflict</DialogTitle>
          <DialogDescription>A battle marker appears on the map above the parties&apos; pins.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            create.mutate(
              {
                name: name.trim(),
                party_ids: parties,
                crisis_note_id: noteId === NO_NOTE ? undefined : Number(noteId),
              },
              { onSuccess: () => onOpenChange(false) },
            );
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="conflict-name" className="text-xs">
              Name
            </Label>
            <Input
              id="conflict-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Battle of Xuzhou"
              className="h-10"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Parties (at least two)</Label>
            {state.factions.length ? (
              <div className="flex flex-wrap gap-1.5 pb-1">
                {state.factions.map((f) => {
                  const ids = membersOf(f.id);
                  const all = ids.length > 0 && ids.every((id) => parties.includes(id));
                  return (
                    <button
                      key={f.id}
                      type="button"
                      disabled={!ids.length}
                      aria-pressed={all}
                      onClick={() => toggleFaction(f.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs disabled:opacity-40",
                        all ? "border-primary bg-primary text-primary-foreground" : "hover:bg-muted",
                      )}
                    >
                      <span className="size-2 rounded-full" style={{ backgroundColor: f.color ?? undefined }} />
                      {f.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <ul className="max-h-56 divide-y overflow-y-auto rounded-lg border">
              {state.delegates.map((d) => (
                <li key={d.id}>
                  <label className="hover:bg-muted/60 flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm">
                    <Checkbox
                      checked={parties.includes(d.id)}
                      onCheckedChange={() =>
                        setParties((ps) => (ps.includes(d.id) ? ps.filter((x) => x !== d.id) : [...ps, d.id]))
                      }
                    />
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: factionColor(d) }} />
                    <span className="flex-1">{d.name}</span>
                    {d.x == null ? <span className="text-muted-foreground text-[11px]">off map</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Crisis note (optional)</Label>
            <Select value={noteId} onValueChange={setNoteId}>
              <SelectTrigger className="w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_NOTE}>Not linked</SelectItem>
                {notes?.map((n) => (
                  <SelectItem key={n.id} value={String(n.id)}>
                    {n.character.name}: {n.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={!valid || create.isPending}>
              Start conflict
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── After a conflict: does a border need to change? ─────────────────────────

const ANYWHERE = "__anywhere__";

function followUpKey(conflictId: number) {
  return `qing:conflict-border-done:${conflictId}`;
}

function BorderFollowUp({
  conflict,
  state,
  actions,
}: {
  conflict: ConflictResponse;
  state: MapStateResponse;
  actions: MapActions;
}) {
  const winner = conflict.parties.find((p) => p.id === conflict.winner_id) ?? null;
  const losers = conflict.parties.filter((p) => p.id !== conflict.winner_id);
  // Default to land the loser holds, since that's what usually changes hands.
  const loserProvince = state.provinces.find((p) =>
    losers.some((l) => provincesOf(l.id, [p]).length > 0),
  )?.id;
  const [provinceId, setProvinceId] = useState(loserProvince ?? ANYWHERE);
  const [done, setDone] = useState(() => {
    try {
      return localStorage.getItem(followUpKey(conflict.id)) === "1";
    } catch {
      return false;
    }
  });
  const markDone = () => {
    setDone(true);
    try {
      localStorage.setItem(followUpKey(conflict.id), "1");
    } catch {
      // Private mode etc.: the prompt just shows again next time.
    }
  };

  if (done) {
    return (
      <button type="button" className="text-primary text-xs hover:underline" onClick={() => setDone(false)}>
        Change a border for this conflict…
      </button>
    );
  }

  const province = provinceId === ANYWHERE ? null : provinceId;
  return (
    <div className="border-accent/50 bg-accent/5 space-y-2.5 rounded-lg border p-3">
      <p className="text-sm font-medium">Does a border need to change after this conflict?</p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">Province</span>
        <Select value={provinceId} onValueChange={setProvinceId}>
          <SelectTrigger size="sm" className="bg-background h-7 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value={ANYWHERE}>Anywhere on the map</SelectItem>
            {Object.entries(PROVINCE_NAMES).map(([id, name]) => (
              <SelectItem key={id} value={id}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        {winner ? (
          <Button
            size="sm"
            className="justify-start"
            onClick={() => {
              markDone();
              actions.onDrawTerritory(
                {
                  holder_id: winner.id,
                  defender_id: losers.length === 1 ? losers[0].id : null,
                  province_id: province,
                  status: "ANNEXED",
                  crisis_note_id: conflict.crisis_note_id,
                  reason: `Outcome of ${conflict.name}`,
                },
                `Area ${winner.name} takes${province ? ` in ${PROVINCE_NAMES[province]}` : ""}`,
              );
            }}
          >
            <PencilRulerIcon />
            {winner.name} takes an area: draw it
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="outline"
          className="justify-start"
          disabled={!province}
          onClick={() => {
            if (!province) return;
            markDone();
            actions.onRedrawBorder(province);
          }}
        >
          <PencilRulerIcon />
          Redraw {province ? PROVINCE_NAMES[province] : "a province"}&apos;s border
        </Button>
        <Button size="sm" variant="ghost" className="justify-start" onClick={markDone}>
          No border change
        </Button>
      </div>
    </div>
  );
}

// ── Captured areas ───────────────────────────────────────────────────────────

const STATUS_LABEL: Record<TerritoryStatus, string> = {
  ANNEXED: "Annexed",
  OCCUPIED: "Occupied",
  CONTESTED: "Contested",
};

function TerritoryList({ state, actions }: { state: MapStateResponse; actions: MapActions }) {
  if (state.territories.length === 0) return null;
  const delegates = new Map(state.delegates.map((d) => [d.id, d]));
  return (
    <section>
      <SectionHeading title="Captured areas">
        <span className="text-muted-foreground text-xs">{state.territories.length}</span>
      </SectionHeading>
      <ul className="mt-3 divide-y rounded-lg border">
        {state.territories.map((t) => {
          const holder = delegates.get(t.holder_id);
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => actions.onSelectTerritory(t.id)}
                className="hover:bg-muted/60 flex w-full items-center gap-2.5 px-3 py-2 text-left"
              >
                <span className="size-3 shrink-0 rounded-sm" style={{ background: holder ? factionColor(holder) : "#999" }} />
                <span className="min-w-0 flex-1 truncate text-sm">
                  {holder?.name ?? "Unknown"}
                  <span className="text-muted-foreground">
                    {t.province_id ? ` · ${PROVINCE_NAMES[t.province_id]}` : ""}
                  </span>
                </span>
                <Badge
                  variant={t.status === "CONTESTED" ? "default" : "outline"}
                  className={cn(t.status === "CONTESTED" && "bg-destructive text-white")}
                >
                  {STATUS_LABEL[t.status]}
                </Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function TerritoryPanel({
  state,
  territory: t,
  actions,
}: {
  state: MapStateResponse;
  territory: TerritoryResponse;
  actions: MapActions;
}) {
  const update = useUpdateTerritory();
  const giveBack = useReturnTerritory();
  const delegates = new Map(state.delegates.map((d) => [d.id, d]));
  const holder = delegates.get(t.holder_id);
  const defenderId = t.defender_id ?? (t.province_id ? state.provinces.find((p) => p.id === t.province_id)?.controller_id : null);
  const defender = defenderId != null ? delegates.get(defenderId) : undefined;
  const { data: notes } = useNotes({}, t.crisis_note_id != null);
  const note = notes?.find((n) => n.id === t.crisis_note_id);

  return (
    <section>
      <SectionHeading title={t.province_id ? `Part of ${PROVINCE_NAMES[t.province_id]}` : "Captured area"}>
        <div className="flex items-center gap-1.5">
          <Badge
            variant={t.status === "CONTESTED" ? "default" : "secondary"}
            className={cn(t.status === "CONTESTED" && "bg-destructive text-white")}
          >
            {STATUS_LABEL[t.status]}
          </Badge>
          <Button size="icon-xs" variant="ghost" aria-label="Close" onClick={() => actions.onSelectTerritory(null)}>
            <XIcon />
          </Button>
        </div>
      </SectionHeading>
      <div className="mt-3 divide-y rounded-lg border">
        <SettingRow label="Held by" htmlFor="territory-holder">
          <DelegateSelect
            id="territory-holder"
            value={t.holder_id}
            delegates={state.delegates}
            emptyLabel="—"
            onChange={(id) => id != null && update.mutate({ id: t.id, body: { holder_id: id } })}
          />
        </SettingRow>
        <SettingRow label="Status" htmlFor="territory-status">
          <Select value={t.status} onValueChange={(v) => update.mutate({ id: t.id, body: { status: v as TerritoryStatus } })}>
            <SelectTrigger id="territory-status" className="w-[150px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {(Object.keys(STATUS_LABEL) as TerritoryStatus[]).map((st) => (
                <SelectItem key={st} value={st}>
                  {STATUS_LABEL[st]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingRow>
        {t.status === "CONTESTED" ? (
          <div className="bg-destructive/5 flex flex-wrap items-center gap-2 px-3.5 py-3">
            <span className="text-destructive text-xs font-medium">Settle it:</span>
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              onClick={() => update.mutate({ id: t.id, body: { status: "ANNEXED", reason: "Dispute settled" } })}
            >
              {holder?.name ?? "Attacker"} takes it
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => giveBack.mutate(t.id)}>
              {defender ? `${defender.name} holds` : "Attack repelled"}
            </Button>
          </div>
        ) : null}
        <div className="text-muted-foreground space-y-1 px-3.5 py-3 text-xs">
          {defender ? <p>Taken from {defender.name}</p> : null}
          {note ? <p>Directive: {note.title}</p> : null}
        </div>
        <div className="flex gap-2 px-3.5 py-3">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => giveBack.mutate(t.id)}>
            Hand it back
          </Button>
        </div>
      </div>
    </section>
  );
}
