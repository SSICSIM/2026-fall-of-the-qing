"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckIcon,
  EraserIcon,
  GripIcon,
  EyeIcon,
  EyeOffIcon,
  HandIcon,
  ListIcon,
  MapIcon,
  MapPinIcon,
  PanelRightCloseIcon,
  PanelRightOpenIcon,
  Undo2Icon,
  UsersIcon,
  XIcon,
} from "lucide-react";

import { CharacterManagerDialog } from "@/components/crisis/CharacterManagerDialog";
import { Button } from "@/components/ui/button";
import { useCreateTerritory, useFormula, useInvade, useMapState, useMoveCharacter } from "@/hooks/useWarRoom";
import { factionColor, rampColor } from "@/lib/warRoom/colors";
import { holdingsByDelegate } from "@/lib/warRoom/control";
import { formatRating, maxRating } from "@/lib/warRoom/efficiency";
import type { Pt } from "@/lib/warRoom/geometry";
import {
  dragHandle,
  insertPoint,
  moreHandles,
  naturalEdges,
  outlineFromPath,
  outlineFromPoints,
} from "@/lib/warRoom/outline";
import { PROVINCE_NAMES, QING } from "@/lib/warRoom/provinces";
import { cn } from "@/lib/utils";
import type { InvasionRequest, MapStateResponse, TerritoryCreate } from "@/types/api";
import { BorderDialog } from "./BorderDialog";
import { DirectivesTab } from "./DirectivesTab";
import { InvasionDialog } from "./InvasionDialog";
import { useAutoPlace } from "./useAutoPlace";
import { Segmented } from "./parts";
import { PinDialog } from "./PinDialog";
import { QingMap, type Overlay, type RedrawState, type Tool } from "./QingMap";
import {
  CalculatorTab,
  ConflictsTab,
  FactionsTab,
  HistoryTab,
  MapTab,
  OVERLAYS,
  type MapActions,
  type SidebarTab,
} from "./SidebarTabs";

const SIDEBAR_WIDTH = 460;

// Delegates only see territorial control or efficiency (mechanics guide, "Electronic map").
const DELEGATE_OVERLAYS = OVERLAYS.slice(0, 2);

const TABS: { id: SidebarTab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "factions", label: "Factions" },
  { id: "directives", label: "Directives" },
  { id: "conflicts", label: "Conflicts" },
  { id: "calculator", label: "Calculator" },
  { id: "history", label: "History" },
];

type MapView = "crisis" | "delegate";

/** An outline being drawn on the map, and what it's for. */
type Drawing = RedrawState &
  (
    | { purpose: "border" }
    | { purpose: "invasion"; request: Omit<InvasionRequest, "area"> }
    | { purpose: "territory"; request: Omit<TerritoryCreate, "polygon"> }
  ) & { title: string };

export function WarMapPage() {
  const { data: state, isLoading, isError } = useMapState();
  const [view, setView] = useState<MapView>("crisis");
  const [overlay, setOverlay] = useState<Overlay>("control");
  const [tool, setTool] = useState<Tool>("pan");
  const [selected, setSelected] = useState<string | null>(null);
  const [selectedTerritory, setSelectedTerritory] = useState<number | null>(null);
  const [pinAt, setPinAt] = useState<[number, number] | null>(null);
  const [invading, setInvading] = useState(false);
  const [display, setDisplay] = useMapDisplay();
  const [invadingFaction, setInvadingFaction] = useState<number | undefined>(undefined);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tab, setTab] = useState<SidebarTab>("map");
  const [selectedCharacter, setSelectedCharacter] = useState<number | null>(null);
  const [selectedConflict, setSelectedConflict] = useState<number | null>(null);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [confirmingBorder, setConfirmingBorder] = useState(false);
  // Give long straight edges a hand-drawn wobble on save (see naturalEdges).
  const [natural, setNatural] = useState(true);
  const moveCharacter = useMoveCharacter();
  const invade = useInvade();
  const createTerritory = useCreateTerritory();

  const openTab = (t: SidebarTab) => {
    setTab(t);
    setSidebarOpen(true);
  };

  const addPoint = (p: Pt) =>
    setDrawing((d) => (d ? { ...d, points: [...d.points, p], handles: [...d.handles, d.points.length] } : d));
  const removeLastPoint = () =>
    setDrawing((d) =>
      d && d.points.length
        ? { ...d, points: d.points.slice(0, -1), handles: d.handles.filter((i) => i < d.points.length - 1) }
        : d,
    );
  // The outline as it will be saved.
  const finalPoints = (d: Drawing) => (natural ? naturalEdges(d.points) : d.points);
  // The outline being confirmed, stable while the save dialog is open.
  const borderPoints = useMemo(
    () => (confirmingBorder && drawing ? (natural ? naturalEdges(drawing.points) : drawing.points) : []),
    [confirmingBorder, drawing, natural],
  );

  const stopDrawing = () => {
    setDrawing(null);
    setConfirmingBorder(false);
  };

  const finishDrawing = () => {
    if (!drawing || drawing.points.length < 3) return;
    if (drawing.purpose === "border") {
      setConfirmingBorder(true);
    } else if (drawing.purpose === "invasion") {
      invade.mutate({ ...drawing.request, area: finalPoints(drawing) }, { onSuccess: stopDrawing });
    } else {
      createTerritory.mutate({ ...drawing.request, polygon: finalPoints(drawing) }, { onSuccess: stopDrawing });
    }
  };

  const actions: MapActions = {
    redrawing: drawing != null,
    onInvade: (options) => {
      setInvadingFaction(options?.attackerFactionId);
      setInvading(true);
    },
    // Start from the province's current outline as draggable corners.
    onRedrawBorder: (provinceId) => {
      const custom = state?.provinces.find((p) => p.id === provinceId)?.shape;
      const original = QING.provinces.find((p) => p.id === provinceId)?.d ?? "";
      setTool("pan");
      setDrawing({
        purpose: "border",
        provinceId,
        ...(custom ? outlineFromPoints(custom as Pt[]) : outlineFromPath(original)),
        mode: "edit",
        title: `Redrawing ${PROVINCE_NAMES[provinceId]}`,
      });
    },
    onDrawTerritory: (request, title) => {
      setTool("pan");
      setDrawing({
        purpose: "territory",
        provinceId: request.province_id ?? null,
        points: [],
        handles: [],
        mode: "draw",
        request,
        title,
      });
    },
    onSelectTerritory: (id) => {
      setSelectedTerritory(id);
      if (id != null) setSelected(null);
    },
  };

  // Keyboard while drawing: Enter finishes, Backspace removes the last
  // corner, Escape cancels.
  useEffect(() => {
    if (!drawing || confirmingBorder) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "Enter") finishDrawing();
      else if (e.key === "Escape") stopDrawing();
      else if (e.key === "Backspace" && drawing.mode === "draw") {
        e.preventDefault();
        removeLastPoint();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const delegate = view === "delegate";
  const shownOverlay = delegate && !DELEGATE_OVERLAYS.some((o) => o.value === overlay) ? "control" : overlay;
  const activeDrawing = delegate ? null : drawing;

  return (
    // Full-bleed like the Middle-earth map; the app navbar is hidden here.
    <main className="relative h-dvh overflow-hidden">
      {isLoading ? (
        <div className="absolute inset-0 bg-[#a8cbe3]" />
      ) : isError || !state ? (
        <div className="text-muted-foreground absolute inset-0 flex items-center justify-center text-sm">
          The map could not be loaded. Is the backend running?
        </div>
      ) : (
        <>
          {/* The map fills whatever the sidebar leaves free. */}
          <div
            className="absolute inset-y-0 left-0 transition-[right] duration-200"
            style={{ right: !delegate && sidebarOpen ? SIDEBAR_WIDTH : 0 }}
          >
            <QingMap
              state={state}
              showCharacters={display.characters}
              showScores={display.scores}
              overlay={shownOverlay}
              tool={delegate ? "pan" : tool}
              selectedProvinceId={delegate ? null : selected}
              onSelectProvince={
                delegate
                  ? undefined
                  : (id) => {
                      setSelected(id);
                      setSelectedTerritory(null);
                      if (id) openTab("map");
                    }
              }
              selectedTerritoryId={delegate ? null : selectedTerritory}
              onSelectTerritory={
                delegate
                  ? undefined
                  : (id) => {
                      actions.onSelectTerritory(id);
                      openTab("map");
                    }
              }
              onPlacePin={(p) => setPinAt(p)}
              canMovePins={!delegate}
              selectedCharacterId={delegate ? null : selectedCharacter}
              onMoveCharacter={(id, [x, y]) => moveCharacter.mutate({ id, x, y })}
              onSelectCharacter={
                delegate
                  ? undefined
                  : (id) => {
                      setSelectedCharacter(id);
                      openTab("factions");
                    }
              }
              onSelectConflict={
                delegate
                  ? undefined
                  : (id) => {
                      setSelectedConflict(id);
                      openTab("conflicts");
                    }
              }
              redraw={activeDrawing}
              onRedrawPoint={addPoint}
              onRedrawMovePoint={(i, p) => setDrawing((d) => (d ? { ...d, ...dragHandle(d, i, p) } : d))}
              onRedrawInsertPoint={(i, p) => setDrawing((d) => (d ? { ...d, ...insertPoint(d, i - 1, p) } : d))}
              onRedrawFinish={finishDrawing}
            />
          </div>

          <div className="pointer-events-none absolute top-4 left-4 z-10 flex flex-col items-start gap-2">
            <Segmented
              className="pointer-events-auto"
              label="Map view"
              value={view}
              onChange={setView}
              options={[
                {
                  value: "crisis",
                  label: (
                    <>
                      <MapIcon className="size-4" />
                      Crisis view
                    </>
                  ),
                },
                {
                  value: "delegate",
                  label: (
                    <>
                      <EyeIcon className="size-4" />
                      Delegate view
                    </>
                  ),
                },
              ]}
            />
            <Segmented
              className="pointer-events-auto"
              label="Overlay"
              value={shownOverlay}
              onChange={setOverlay}
              options={delegate ? DELEGATE_OVERLAYS : OVERLAYS}
            />
            {!delegate && !activeDrawing ? (
              <Segmented
                className="pointer-events-auto"
                label="Tool"
                value={tool}
                onChange={setTool}
                options={[
                  { value: "pan", label: <HandIcon className="size-4" />, title: "Pan & select provinces" },
                  { value: "pin", label: <MapPinIcon className="size-4" />, title: "Plant a war pin" },
                ]}
              />
            ) : null}
            {!delegate && !activeDrawing && tool === "pin" ? (
              <p className="bg-background/90 rounded-md px-2.5 py-1 text-xs shadow-sm">Click the map to plant a pin</p>
            ) : null}
            <div className="pointer-events-auto flex gap-1 rounded-lg bg-background p-1 shadow-md" role="group" aria-label="Show on map">
              {(
                [
                  ["characters", "Characters"],
                  ["scores", "Scores"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={display[key]}
                  title={`${display[key] ? "Hide" : "Show"} ${label.toLowerCase()}`}
                  onClick={() => setDisplay({ ...display, [key]: !display[key] })}
                  className={cn(
                    "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                    display[key] ? "hover:bg-muted" : "bg-muted text-muted-foreground",
                  )}
                >
                  {display[key] ? <EyeIcon className="size-3.5" /> : <EyeOffIcon className="size-3.5" />}
                  {label}
                </button>
              ))}
            </div>
            {!delegate && !activeDrawing && display.characters ? <OffMapNotice state={state} /> : null}
          </div>

          {activeDrawing ? (
            <DrawingBar
              drawing={activeDrawing}
              saving={invade.isPending || createTerritory.isPending}
              onUndoPoint={removeLastPoint}
              onStartOver={() => setDrawing((d) => (d ? { ...d, points: [], handles: [], mode: "draw" } : d))}
              onMorePoints={() => setDrawing((d) => (d ? { ...d, ...moreHandles(d) } : d))}
              natural={natural}
              onNatural={setNatural}
              onFinish={finishDrawing}
              onCancel={stopDrawing}
              right={sidebarOpen ? SIDEBAR_WIDTH : 0}
            />
          ) : null}

          {delegate ? (
            <div className="absolute right-4 bottom-7 z-10">
              <MapLegend state={state} overlay={shownOverlay} floating showScores={display.scores} />
            </div>
          ) : (
            <Sidebar
              open={sidebarOpen}
              onOpenChange={setSidebarOpen}
              tab={tab}
              onTab={setTab}
              state={state}
              overlay={shownOverlay}
              onOverlay={setOverlay}
              selected={selected}
              selectedTerritory={selectedTerritory}
              selectedCharacter={selectedCharacter}
              selectedConflict={selectedConflict}
              actions={actions}
              showScores={display.scores}
            />
          )}

          <PinDialog point={pinAt} onClose={() => setPinAt(null)} />
          <BorderDialog
            provinceId={confirmingBorder && drawing?.purpose === "border" ? drawing.provinceId : null}
            ownerId={
              drawing?.purpose === "border"
                ? (state.provinces.find((p) => p.id === drawing.provinceId)?.controller_id ?? undefined)
                : undefined
            }
            points={borderPoints}
            provinces={state.provinces}
            onSaved={stopDrawing}
            onClose={() => setConfirmingBorder(false)}
          />
          <InvasionDialog
            open={invading}
            onOpenChange={setInvading}
            attackerFactionId={invadingFaction}
            state={state}
            provinceId={selected}
            onDrawArea={(request) => {
              const attacker = state.delegates.find((d) => d.id === request.attacker_id)?.name ?? "The invader";
              const from = request.province_ids[0];
              setTool("pan");
              setDrawing({
                purpose: "invasion",
                provinceId: from ?? null,
                points: [],
                handles: [],
                mode: "draw",
                request,
                title: `Area ${attacker} takes${from ? ` from ${PROVINCE_NAMES[from]}` : ""}`,
              });
            }}
          />
        </>
      )}
    </main>
  );
}

/** Floating instructions + controls while an outline is being drawn. */
function DrawingBar({
  drawing,
  saving,
  onUndoPoint,
  onStartOver,
  onMorePoints,
  natural,
  onNatural,
  onFinish,
  onCancel,
  right,
}: {
  drawing: Drawing;
  saving: boolean;
  onUndoPoint: () => void;
  onStartOver: () => void;
  onMorePoints: () => void;
  natural: boolean;
  onNatural: (on: boolean) => void;
  onFinish: () => void;
  onCancel: () => void;
  right: number;
}) {
  const corners = drawing.points.length;
  const hint =
    drawing.mode === "edit"
      ? "drag the dots to bend the border · click the line to add a point"
      : corners === 0
        ? "click the map to place the first corner"
        : `${corners} corner${corners === 1 ? "" : "s"}${corners >= 3 ? " · click the first dot or press Enter to finish" : ""}`;
  return (
    <div className="pointer-events-none absolute bottom-7 left-0 z-20 flex justify-center px-4" style={{ right }}>
      <div className="bg-background pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg py-2 pr-2 pl-4 shadow-lg">
        <div className="text-sm">
          <span className="font-semibold">{drawing.title}</span>
          <span className="text-muted-foreground"> · {hint}</span>
        </div>
        {drawing.mode === "edit" ? (
          <>
            <Button size="sm" variant="ghost" onClick={onMorePoints} title="Add dots between the existing ones">
              <GripIcon />
              More points
            </Button>
            <Button size="sm" variant="ghost" onClick={onStartOver}>
              <EraserIcon />
              Start from scratch
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={corners === 0} onClick={onUndoPoint} title="Backspace">
            <Undo2Icon />
            Undo corner
          </Button>
        )}
        <label
          className="text-muted-foreground flex items-center gap-1.5 px-1 text-xs"
          title="Give long straight lines a hand-drawn wobble so they match the real borders"
        >
          <input type="checkbox" checked={natural} onChange={(e) => onNatural(e.target.checked)} />
          Natural edges
        </label>
        <Button size="sm" variant="outline" onClick={onCancel} title="Escape">
          <XIcon />
          Cancel
        </Button>
        <Button size="sm" disabled={corners < 3 || saving} onClick={onFinish} title="Enter">
          <CheckIcon />
          {drawing.purpose === "border" ? "Finish" : "Save"}
        </Button>
      </div>
    </div>
  );
}

function Sidebar({
  open,
  onOpenChange,
  tab,
  onTab,
  state,
  overlay,
  onOverlay,
  selected,
  selectedTerritory,
  selectedCharacter,
  selectedConflict,
  actions,
  showScores,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tab: SidebarTab;
  onTab: (tab: SidebarTab) => void;
  state: MapStateResponse;
  overlay: Overlay;
  onOverlay: (o: Overlay) => void;
  selected: string | null;
  selectedTerritory: number | null;
  selectedCharacter: number | null;
  selectedConflict: number | null;
  actions: MapActions;
  showScores: boolean;
}) {
  const [manageOpen, setManageOpen] = useState(false);

  if (!open) {
    return (
      <Button
        variant="outline"
        size="icon-lg"
        onClick={() => onOpenChange(true)}
        aria-label="Open sidebar"
        className="bg-background absolute top-4 right-4 z-10 shadow-md"
      >
        <PanelRightOpenIcon />
      </Button>
    );
  }

  return (
    <aside
      className="bg-background absolute inset-y-0 right-0 z-10 flex max-w-full flex-col border-l shadow-xl"
      style={{ width: SIDEBAR_WIDTH }}
    >
      <div className="shrink-0 space-y-3 border-b px-5 pt-3 pb-4">
        <div className="flex h-8 items-center justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => onOpenChange(false)}
              aria-label="Collapse sidebar"
              className="-ml-1.5"
            >
              <PanelRightCloseIcon />
            </Button>
            <span className="text-sm font-semibold tracking-tight whitespace-nowrap">Qing China</span>
          </div>
          <div className="flex items-center">
            <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
              <Link href="/">
                <ListIcon />
                Tracker
              </Link>
            </Button>
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setManageOpen(true)}>
              <UsersIcon />
              Characters
            </Button>
          </div>
        </div>
        <nav role="tablist" aria-label="Map sidebar" className="bg-muted grid grid-cols-6 gap-0.5 rounded-lg p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTab(t.id)}
              className={cn(
                "rounded-md py-1.5 text-[12px] leading-5 font-medium transition-colors",
                tab === t.id ? "bg-accent text-accent-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-6" role="tabpanel">
        {tab === "map" ? (
          <MapTab
            state={state}
            overlay={overlay}
            onOverlay={onOverlay}
            selected={selected}
            selectedTerritory={selectedTerritory}
            actions={actions}
            legend={<MapLegend state={state} overlay={overlay} showScores={showScores} />}
          />
        ) : null}
        {tab === "factions" ? <FactionsTab state={state} selectedCharacterId={selectedCharacter} actions={actions} /> : null}
        {tab === "directives" ? <DirectivesTab state={state} /> : null}
        {tab === "conflicts" ? (
          <ConflictsTab state={state} selectedConflictId={selectedConflict} actions={actions} />
        ) : null}
        {tab === "calculator" ? <CalculatorTab state={state} /> : null}
        {tab === "history" ? <HistoryTab /> : null}
      </div>
      <CharacterManagerDialog open={manageOpen} onOpenChange={setManageOpen} />
    </aside>
  );
}

interface MapDisplay {
  characters: boolean;
  scores: boolean;
}

const DISPLAY_KEY = "qing:map-display";
const SHOW_ALL: MapDisplay = { characters: true, scores: true };

/** What the map shows, remembered in this browser (a per-viewer setting). */
function useMapDisplay(): [MapDisplay, (d: MapDisplay) => void] {
  const [display, setState] = useState<MapDisplay>(SHOW_ALL);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(DISPLAY_KEY);
      if (saved) setState({ ...SHOW_ALL, ...JSON.parse(saved) });
    } catch {
      // Storage blocked or bad JSON: show everything.
    }
  }, []);
  const set = (d: MapDisplay) => {
    setState(d);
    try {
      localStorage.setItem(DISPLAY_KEY, JSON.stringify(d));
    } catch {
      // Private mode: the choice lasts until reload.
    }
  };
  return [display, set];
}

/** Says when characters exist but aren't on the map, with a way to place them. */
function OffMapNotice({ state }: { state: MapStateResponse }) {
  const { offMap, landless, placeable, place, pending } = useAutoPlace(state);
  if (!offMap.length) return null;
  return (
    <div className="bg-background/95 pointer-events-auto flex items-center gap-2 rounded-md px-2.5 py-1 text-xs shadow-sm">
      <span>
        {offMap.length} character{offMap.length === 1 ? " isn't" : "s aren't"} on the map
        {landless.length ? ` (${landless.length} with no province)` : ""}
      </span>
      {placeable ? (
        <Button size="sm" className="h-6 px-2 text-xs" disabled={pending} onClick={() => place(offMap)}>
          Place them
        </Button>
      ) : null}
    </div>
  );
}

function MapLegend({
  state,
  overlay,
  floating = false,
  showScores = true,
}: {
  state: MapStateResponse;
  overlay: Overlay;
  floating?: boolean;
  showScores?: boolean;
}) {
  const effMax = maxRating(useFormula());
  const box = floating ? "bg-background rounded-lg px-3.5 py-3 shadow-md" : "";
  if (overlay === "control") {
    const holdings = holdingsByDelegate(state.provinces);
    const shown = state.delegates.filter((d) => holdings.has(d.id));
    if (shown.length === 0) {
      return floating ? null : (
        <p className="text-muted-foreground text-xs">No provinces held yet.</p>
      );
    }
    return (
      <div className={cn(floating ? "w-60" : "w-full", box)}>
        {floating ? (
          <p className="mb-2 text-sm font-semibold">{showScores ? "Efficiency" : "Control"}</p>
        ) : null}
        <ul className={cn("grid gap-x-4 gap-y-2", !floating && "grid-cols-2")}>
          {shown.map((d) => (
            <li key={d.id} className="flex items-center gap-2 text-sm">
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: factionColor(d) }}
              />
              <span className="min-w-0 flex-1 truncate">{d.name}</span>
              {showScores ? (
                <span className="font-medium tabular-nums">{formatRating(d.published_efficiency)}</span>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  const max = overlay === "efficiency" ? Math.round(effMax * 100) / 100 : 5;
  return (
    <div className={cn(floating && "w-56", box)}>
      {floating ? (
        <p className="mb-2 text-sm font-semibold">
          {OVERLAYS.find((o) => o.value === overlay)?.label}
        </p>
      ) : null}
      <div
        className="h-3 rounded-full border"
        style={{
          background: `linear-gradient(to right, ${[0, 0.25, 0.5, 0.75, 1].map(rampColor).join(",")})`,
        }}
      />
      <div className="text-muted-foreground mt-1 flex justify-between text-xs tabular-nums">
        <span>0</span>
        <span>{Math.round((max / 2) * 100) / 100}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}
