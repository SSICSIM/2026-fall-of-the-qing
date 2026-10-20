"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { factionColor, inkFor, rampColor, UNCLAIMED_FILL } from "@/lib/warRoom/colors";
import { holderOf } from "@/lib/warRoom/control";
import { formatRating, maxRating } from "@/lib/warRoom/efficiency";
import { useFormula } from "@/hooks/useWarRoom";
import {
  clampViewBox,
  polygonCentroid,
  polylinePath,
  zoomViewBox,
  type Pt,
  type ViewBox,
} from "@/lib/warRoom/geometry";
import { battleAnchor, battlesOnMap, initials, PIN_HEAD_CENTER_Y } from "@/lib/warRoom/pins";
import { CITY_HOLDERS, LABEL_STYLE, mapProvinces, QING } from "@/lib/warRoom/provinces";
import type {
  AnnotationResponse,
  ConflictResponse,
  DelegateResponse,
  MapStateResponse,
  TerritoryResponse,
} from "@/types/api";

export type Overlay = "control" | "efficiency" | "reputation" | "economics" | "military";
export type Tool = "pan" | "pin";

const W = QING.width;
const H = QING.height;
const FULL: ViewBox = { x: 0, y: 0, w: W, h: H };

const INK = "#3b2a1a";
const LAND = "#f2f2f2";
const SEA = "#a8cbe3";
const ACCENT = "#f57132";
const CONTESTED = "#b91c1c";

interface Props {
  state: MapStateResponse;
  overlay: Overlay;
  tool?: Tool;
  selectedProvinceId?: string | null;
  onSelectProvince?: (id: string | null) => void;
  onPlacePin?: (point: Pt) => void;
  /** Staff can drag character pins (crisis view, pan tool). */
  canMovePins?: boolean;
  selectedCharacterId?: number | null;
  onSelectCharacter?: (id: number) => void;
  onMoveCharacter?: (id: number, point: Pt) => void;
  onSelectConflict?: (id: number) => void;
  selectedTerritoryId?: number | null;
  onSelectTerritory?: (id: number) => void;
  /** Drawing an outline (a province's new border, or land taken). In "edit"
   * mode the corners start from the existing border and are dragged; in
   * "draw" mode each click adds a corner. Clicking an edge inserts one. */
  redraw?: RedrawState | null;
  onRedrawPoint?: (point: Pt) => void;
  onRedrawMovePoint?: (index: number, point: Pt) => void;
  onRedrawInsertPoint?: (index: number, point: Pt) => void;
  onRedrawFinish?: () => void;
  /** Draw character pins (and their battle markers). */
  showCharacters?: boolean;
  /** Write efficiency and score numbers on provinces. */
  showScores?: boolean;
}

export interface RedrawState {
  /** Province being redrawn, or the one the area is taken from (for context). */
  provinceId: string | null;
  points: Pt[];
  /** Which points are shown as draggable dots (the rest is border detail). */
  handles: number[];
  mode: "edit" | "draw";
}

type Drag =
  | { kind: "vertex"; index: number; client: Pt; moved: boolean }
  | {
      kind: "pan";
      client: Pt;
      view: ViewBox;
      moved: boolean;
      province: string | null;
      territory: number | null;
      edge?: number | null;
    }
  | { kind: "pin"; client: Pt; id: number; moved: boolean }
  | { kind: "conflict"; id: number };

/** Value (0..1 for shading) and printed label for a province's holder. */
/** What a province shows for an overlay; `effMax` is the formula's top rating. */
function readout(overlay: Overlay, holder: DelegateResponse | null, effMax: number) {
  if (!holder) return null;
  if (overlay === "control" || overlay === "efficiency") {
    const eff = holder.published_efficiency;
    return eff == null ? null : { t: eff / effMax, text: formatRating(eff) };
  }
  const score = holder[overlay];
  return { t: score / 5, text: score.toFixed(1) };
}

const closedPath = (points: number[][]) => polylinePath(points as Pt[]) + "Z";

export function QingMap({
  state,
  overlay,
  tool = "pan",
  selectedProvinceId = null,
  onSelectProvince,
  onPlacePin,
  canMovePins = false,
  selectedCharacterId = null,
  onSelectCharacter,
  onMoveCharacter,
  onSelectConflict,
  selectedTerritoryId = null,
  onSelectTerritory,
  redraw = null,
  onRedrawPoint,
  onRedrawMovePoint,
  onRedrawInsertPoint,
  onRedrawFinish,
  showCharacters = true,
  showScores = true,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const effMax = maxRating(useFormula());
  const [view, setView] = useState<ViewBox>(FULL);
  // Pointer capture retargets pointerup to the <svg>, so remember what the
  // press started on.
  const drag = useRef<Drag | null>(null);
  // Where a pin is while being dragged, and where it was dropped until the
  // server confirms the move (so it doesn't snap back in between).
  const [pinDrag, setPinDrag] = useState<{ id: number; at: Pt } | null>(null);
  const [dropped, setDropped] = useState<Map<number, Pt>>(new Map());
  const [size, setSize] = useState({ w: W, h: H });

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width && height) setSize({ w: width, h: height });
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  useEffect(() => setDropped(new Map()), [state.delegates]);

  // Map units per screen pixel, so markers keep a constant on-screen size.
  const unit = Math.max(view.w / size.w, view.h / size.h);

  const delegates = useMemo(() => new Map(state.delegates.map((d) => [d.id, d])), [state.delegates]);
  const provinceState = useMemo(() => new Map(state.provinces.map((p) => [p.id, p])), [state.provinces]);

  const toMap = useCallback((clientX: number, clientY: number): Pt => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return [p.x, p.y];
  }, []);

  // React's onWheel is passive, so preventDefault (to stop page scroll) needs
  // a native listener.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const focus = toMap(e.clientX, e.clientY);
      setView((v) => zoomViewBox(v, Math.exp(e.deltaY * 0.0015), focus, { width: W, height: H }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [toMap]);

  function onPointerDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button !== 0) return;
    const target = e.target as Element;
    e.currentTarget.setPointerCapture(e.pointerId);
    // While drawing an outline: drag a corner to move it, click an edge to
    // add a corner there, click empty map to add one (draw mode), drag to pan.
    if (redraw) {
      const vertex = target.closest("[data-vertex]")?.getAttribute("data-vertex");
      if (vertex != null) {
        drag.current = { kind: "vertex", index: Number(vertex), client: [e.clientX, e.clientY], moved: false };
        return;
      }
      const edge = target.closest("[data-edge]")?.getAttribute("data-edge");
      drag.current = {
        kind: "pan",
        client: [e.clientX, e.clientY],
        view,
        moved: false,
        province: null,
        territory: null,
        edge: edge != null ? Number(edge) : null,
      };
      return;
    }
    if (tool === "pin") {
      onPlacePin?.(toMap(e.clientX, e.clientY));
      return;
    }
    const conflict = target.closest("[data-conflict]")?.getAttribute("data-conflict");
    if (conflict) {
      drag.current = { kind: "conflict", id: Number(conflict) };
      return;
    }
    const character = target.closest("[data-character]")?.getAttribute("data-character");
    if (character) {
      drag.current = { kind: "pin", client: [e.clientX, e.clientY], id: Number(character), moved: false };
      return;
    }
    const province = target.closest("[data-province]")?.getAttribute("data-province");
    const territory = target.closest("[data-territory]")?.getAttribute("data-territory");
    drag.current = {
      kind: "pan",
      client: [e.clientX, e.clientY],
      view,
      moved: false,
      province: province ?? null,
      territory: territory ? Number(territory) : null,
    };
  }

  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const d = drag.current;
    if (!d || d.kind === "conflict") return;
    if (d.kind === "vertex") {
      if (Math.hypot(e.clientX - d.client[0], e.clientY - d.client[1]) > 3) d.moved = true;
      if (d.moved) onRedrawMovePoint?.(d.index, toMap(e.clientX, e.clientY));
      return;
    }
    if (d.kind === "pin") {
      if (!canMovePins) return;
      if (Math.hypot(e.clientX - d.client[0], e.clientY - d.client[1]) > 4) d.moved = true;
      if (d.moved) setPinDrag({ id: d.id, at: toMap(e.clientX, e.clientY) });
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const dx = e.clientX - d.client[0];
    const dy = e.clientY - d.client[1];
    if (Math.hypot(dx, dy) > 4) d.moved = true;
    if (!d.moved) return;
    const scale = Math.max(d.view.w / rect.width, d.view.h / rect.height);
    setView(clampViewBox({ ...d.view, x: d.view.x - dx * scale, y: d.view.y - dy * scale }, { width: W, height: H }));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "vertex") {
      // In draw mode, clicking the first corner closes the outline.
      if (!d.moved && redraw?.mode === "draw" && d.index === 0 && redraw.points.length >= 3) onRedrawFinish?.();
    } else if (d.kind === "conflict") {
      onSelectConflict?.(d.id);
    } else if (d.kind === "pin") {
      if (d.moved && pinDrag) {
        setDropped((m) => new Map(m).set(pinDrag.id, pinDrag.at));
        onMoveCharacter?.(pinDrag.id, pinDrag.at);
      } else if (!d.moved) {
        onSelectCharacter?.(d.id);
      }
      setPinDrag(null);
    } else if (!d.moved) {
      if (redraw) {
        const p = toMap(d.client[0], d.client[1]);
        if (d.edge != null) onRedrawInsertPoint?.(d.edge + 1, p);
        else if (redraw.mode === "draw") onRedrawPoint?.(p);
      } else if (d.territory != null) {
        onSelectTerritory?.(d.territory);
      } else {
        onSelectProvince?.(d.province);
      }
    }
  }

  const zoomBy = (factor: number) =>
    setView((v) => zoomViewBox(v, factor, [v.x + v.w / 2, v.y + v.h / 2], { width: W, height: H }));

  // Hatch patterns for occupied provinces: owner's colour underneath,
  // occupier's stripes on top.
  const occupied = state.provinces.filter((p) => p.occupier_id != null);

  const fillFor = (provinceId: string): string => {
    const p = provinceState.get(provinceId);
    if (!p) return UNCLAIMED_FILL;
    if (overlay === "control") {
      if (p.contested_by_id != null) return `url(#contest-${p.id})`;
      if (p.occupier_id != null) return `url(#occ-${p.id})`;
      const owner = p.controller_id != null ? delegates.get(p.controller_id) : null;
      return owner ? factionColor(owner) : UNCLAIMED_FILL;
    }
    const r = readout(overlay, holderOf(p, delegates), effMax);
    return r ? rampColor(r.t) : UNCLAIMED_FILL;
  };

  // Redrawn borders replace the preset outline; draw those provinces last so
  // an enlarged province sits on top of the neighbour it grew into.
  const shapes = mapProvinces(state.provinces).sort((a, b) => Number(!!a.custom) - Number(!!b.custom));
  const selectedShape = shapes.find((s) => s.id === (redraw ? redraw.provinceId : selectedProvinceId));

  const colorOf = (id: number | null | undefined) => {
    const d = id != null ? delegates.get(id) : null;
    return d ? factionColor(d) : UNCLAIMED_FILL;
  };
  const territoryFill = (t: TerritoryResponse): string => {
    if (overlay !== "control") {
      const r = readout(overlay, delegates.get(t.holder_id) ?? null, effMax);
      return r ? rampColor(r.t) : UNCLAIMED_FILL;
    }
    if (t.status === "OCCUPIED") return `url(#terr-occ-${t.id})`;
    if (t.status === "CONTESTED") return `url(#terr-contest-${t.id})`;
    return colorOf(t.holder_id);
  };
  // The side a drawn area was taken from: its defender, else the province's owner.
  const loserOf = (t: TerritoryResponse) =>
    t.defender_id ?? (t.province_id ? provinceState.get(t.province_id)?.controller_id : null);

  const pinPositions = new Map<number, Pt>();
  for (const d of state.delegates) {
    const at = pinDrag?.id === d.id ? pinDrag.at : dropped.get(d.id) ?? (d.x != null && d.y != null ? [d.x, d.y] : null);
    if (at && showCharacters) pinPositions.set(d.id, at as Pt);
  }
  const battles = battlesOnMap(state.conflicts, pinPositions);

  const cursor = redraw
    ? "crosshair"
    : tool === "pin"
      ? "copy"
      : drag.current && drag.current.kind !== "conflict" && drag.current.moved
        ? "grabbing"
        : "grab";
  const zoom = W / view.w;

  return (
    <div className="absolute inset-0 isolate overflow-hidden bg-[#a8cbe3]">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        className="block h-full w-full touch-none select-none"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => {
          drag.current = null;
          setPinDrag(null);
        }}
        role="img"
        aria-label="Map of the former Qing Empire and its warlord states"
      >
        <defs>
          {occupied.map((p) => {
            const owner = p.controller_id != null ? delegates.get(p.controller_id) : null;
            const occ = delegates.get(p.occupier_id!);
            return (
              <pattern
                key={p.id}
                id={`occ-${p.id}`}
                width="9"
                height="9"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="9" height="9" fill={owner ? factionColor(owner) : UNCLAIMED_FILL} />
                <rect width="4.5" height="9" fill={occ ? factionColor(occ) : INK} />
              </pattern>
            );
          })}
          {state.provinces
            .filter((p) => p.contested_by_id != null)
            .map((p) => (
              <Stripes key={p.id} id={`contest-${p.id}`} a={colorOf(p.controller_id)} b={colorOf(p.contested_by_id)} />
            ))}
          {state.territories.map((t) =>
            t.status === "OCCUPIED" ? (
              <Stripes key={t.id} id={`terr-occ-${t.id}`} a="none" b={colorOf(t.holder_id)} />
            ) : t.status === "CONTESTED" ? (
              <Stripes key={t.id} id={`terr-contest-${t.id}`} a={colorOf(loserOf(t))} b={colorOf(t.holder_id)} />
            ) : null,
          )}
          {/* The land, so a redrawn border never paints the sea. */}
          <clipPath id="land">
            {QING.provinces.map((shape) => (
              <path key={shape.id} d={shape.d} />
            ))}
          </clipPath>
        </defs>

        {/* Sea and foreign lands */}
        <rect x="-50" y="-50" width={W + 100} height={H + 100} fill={SEA} />
        <g fill="#e3e3e3" stroke="#a0a0a0" strokeWidth="0.6" strokeLinejoin="round">
          {QING.foreignLands.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <path d={QING.qingUnderlay} fill={LAND} />

        {/* Provinces: colour first, then rivers, then the borders on top so
            the rivers never hide a border. */}
        <g clipPath="url(#land)">
          {shapes.map((shape) => (
            <path
              key={shape.id}
              d={shape.d}
              data-province={shape.id}
              fill={fillFor(shape.id)}
              className="transition-[fill] duration-500"
            />
          ))}
        </g>
        {/* Rivers and lakes */}
        <g pointerEvents="none">
          {QING.lakes.map((d, i) => (
            <path key={i} d={d} fill={SEA} stroke="#7fb1d6" strokeWidth="0.5" />
          ))}
          <g fill="none" stroke="#9cc3e2" strokeLinecap="round" strokeLinejoin="round" opacity="0.9">
            {QING.rivers.map((r, i) => (
              <path key={i} d={r.d} strokeWidth={r.major ? 1.25 : 0.6} />
            ))}
          </g>
        </g>
        <g fill="none" strokeLinejoin="round" clipPath="url(#land)" pointerEvents="none">
          {shapes.map((shape) => {
            const p = provinceState.get(shape.id);
            return (
              <path
                key={shape.id}
                d={shape.d}
                stroke={p?.contested_by_id != null ? CONTESTED : INK}
                strokeWidth={p?.contested_by_id != null ? 1.6 : 0.9}
                strokeDasharray={p?.contested_by_id != null || p?.occupier_id != null ? "4 2.5" : undefined}
              />
            );
          })}
        </g>

        {/* Land taken in invasions: drawn areas on top of the provinces. */}
        <g strokeLinejoin="round" clipPath="url(#land)">
          {state.territories.map((t) => (
            <path
              key={t.id}
              d={closedPath(t.polygon)}
              data-territory={t.id}
              fill={territoryFill(t)}
              stroke={t.status === "CONTESTED" ? CONTESTED : INK}
              strokeWidth={t.status === "CONTESTED" ? 1.8 : 1.2}
              strokeDasharray={t.status === "ANNEXED" ? undefined : "4 2.5"}
              style={{ cursor: redraw ? "crosshair" : "pointer" }}
            >
              <title>
                {`${delegates.get(t.holder_id)?.name ?? "Unknown"} · ${t.status.toLowerCase()}`}
              </title>
            </path>
          ))}
        </g>
        {selectedTerritoryId != null && !redraw
          ? state.territories
              .filter((t) => t.id === selectedTerritoryId)
              .map((t) => (
                <path
                  key={t.id}
                  d={closedPath(t.polygon)}
                  fill="none"
                  stroke={ACCENT}
                  strokeWidth={3 * unit}
                  pointerEvents="none"
                />
              ))
          : null}
        {/* Paint the selected outline again on top so neighbours don't cover it. */}
        {selectedShape && !redraw && (
          <path d={selectedShape.d} fill="none" stroke={ACCENT} strokeWidth={3 * unit} pointerEvents="none" />
        )}


        {/* Text and markers */}
        <g pointerEvents="none" fontFamily="var(--font-sans)">
          {QING.foreignLabels.map((l) => (
            <text key={l.name} x={l.at[0]} y={l.at[1]} textAnchor="middle" fontSize="10" fill="#555" letterSpacing="1.5">
              {l.name}
            </text>
          ))}
          {QING.seaLabels.map((l) => (
            <text
              key={l.name}
              x={l.at[0]}
              y={l.at[1]}
              textAnchor="middle"
              fontSize="9"
              fontStyle="italic"
              fill="#4d7ea8"
              letterSpacing="2.5"
            >
              {l.name}
            </text>
          ))}
          <Cities zoom={zoom} />
          {shapes.map((shape) => {
            // Hand-tuned label offsets only fit the original outline.
            const style = shape.custom ? {} : (LABEL_STYLE[shape.id] ?? {});
            const x = shape.label[0] + (style.dx ?? 0);
            const y = shape.label[1] + (style.dy ?? 0);
            const size = style.size ?? 10;
            const p = provinceState.get(shape.id);
            const holder = p ? holderOf(p, delegates) : null;
            const r = readout(overlay, holder, effMax);
            const fill = fillFor(shape.id);
            const ink = fill.startsWith("#") && overlay !== "control" ? inkFor(fill) : "#24180c";
            return (
              <g key={shape.id} transform={`translate(${x} ${y})`}>
                <text
                  transform={style.rotate ? `rotate(${style.rotate})` : undefined}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={size}
                  fontWeight="600"
                  letterSpacing={size > 12 ? 2 : 0.6}
                  fill={ink}
                  stroke={ink === "#24180c" ? "#f3ead2" : "none"}
                  strokeWidth="2.2"
                  strokeOpacity="0.55"
                  paintOrder="stroke"
                >
                  {shape.name.toUpperCase()}
                </text>
                {r && showScores && <ScoreSeal y={size * 0.6 + 9} text={r.text} />}
              </g>
            );
          })}
        </g>

        {/* Lines left from earlier sessions, and war pins */}
        <g pointerEvents="none">
          {state.annotations.map((a) =>
            a.kind === "LINE" ? (
              <path
                key={a.id}
                d={polylinePath(a.points)}
                fill="none"
                stroke={a.color ?? INK}
                strokeWidth={2}
                strokeDasharray={a.dashed ? "6 4" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : (
              <WarPin key={a.id} annotation={a} />
            ),
          )}
        </g>

        {/* Outline being drawn: the old border faint, the new one in orange,
            with draggable corners and clickable edges. */}
        {redraw ? (
          <g>
            {selectedShape ? (
              <path
                d={selectedShape.d}
                fill="none"
                stroke={ACCENT}
                strokeOpacity="0.6"
                strokeWidth={1.5 * unit}
                strokeDasharray={`${4 * unit} ${4 * unit}`}
                pointerEvents="none"
              />
            ) : null}
            {redraw.points.length > 1 ? (
              <path
                d={redraw.points.length > 2 ? closedPath(redraw.points) : polylinePath(redraw.points)}
                fill={ACCENT}
                fillOpacity="0.25"
                stroke={ACCENT}
                strokeWidth={2.5 * unit}
                strokeLinejoin="round"
                pointerEvents="none"
              />
            ) : null}
            {redraw.points.map((p, i) => {
              const next = redraw.points[(i + 1) % redraw.points.length];
              const closing = i === redraw.points.length - 1;
              if (redraw.points.length < 2 || (closing && redraw.points.length < 3)) return null;
              return (
                <line
                  key={`e${i}`}
                  data-edge={i}
                  x1={p[0]}
                  y1={p[1]}
                  x2={next[0]}
                  y2={next[1]}
                  stroke="transparent"
                  strokeWidth={12 * unit}
                  style={{ cursor: "copy" }}
                />
              );
            })}
            {redraw.handles.map((i) => {
              const [x, y] = redraw.points[i];
              return (
              <circle
                key={`v${i}`}
                data-vertex={i}
                cx={x}
                cy={y}
                r={(redraw.mode === "draw" && i === 0 ? 6 : 4.5) * unit}
                fill={redraw.mode === "draw" && i === 0 ? ACCENT : "#fff"}
                stroke={ACCENT}
                strokeWidth={2 * unit}
                style={{ cursor: "move" }}
              />
              );
            })}
          </g>
        ) : null}

        {/* Battle lines under the pins, battle badges above them. */}
        {battles.map(({ conflict, positions }) => (
          <BattleMarker key={conflict.id} conflict={conflict} positions={positions} unit={unit} part="lines" />
        ))}
        {state.delegates
          .filter((d) => pinPositions.has(d.id))
          .sort((a, b) => pinPositions.get(a.id)![1] - pinPositions.get(b.id)![1])
          .map((d) => (
            <CharacterPin
              key={d.id}
              delegate={d}
              at={pinPositions.get(d.id)!}
              unit={unit}
              selected={selectedCharacterId === d.id}
              draggable={canMovePins && tool === "pan" && !redraw}
              lifted={pinDrag?.id === d.id}
            />
          ))}
        {battles.map(({ conflict, positions }) => (
          <BattleMarker key={conflict.id} conflict={conflict} positions={positions} unit={unit} part="badge" />
        ))}
      </svg>

      {/* Zoom pill, as on the Middle-earth map. */}
      <div className="absolute bottom-7 left-7 z-10 flex h-[43px] w-[76px] items-center rounded-[20px] bg-white text-2xl leading-8 text-[#1d1d1d] shadow-md">
        <button
          type="button"
          aria-label="Zoom out"
          className="flex h-full flex-1 items-center justify-center rounded-l-[20px] hover:bg-black/5"
          onClick={() => zoomBy(1 / 0.7)}
        >
          -
        </button>
        <span className="h-[41px] w-px bg-black" aria-hidden />
        <button
          type="button"
          aria-label="Zoom in"
          className="flex h-full flex-1 items-center justify-center rounded-r-[20px] hover:bg-black/5"
          onClick={() => zoomBy(0.7)}
        >
          +
        </button>
      </div>
    </div>
  );
}

/** Diagonal stripes alternating two colours ("none" leaves gaps). */
function Stripes({ id, a, b }: { id: string; a: string; b: string }) {
  return (
    <pattern id={id} width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      {a !== "none" ? <rect width="9" height="9" fill={a} /> : null}
      <rect width="4.5" height="9" fill={b} />
    </pattern>
  );
}

/** A character pin, drawn like the Middle-earth map's: grey head, red tail,
 * initials in the faction colour. (0, 0) is the tip. */
function CharacterPin({
  delegate,
  at,
  unit,
  selected,
  draggable,
  lifted,
}: {
  delegate: DelegateResponse;
  at: Pt;
  unit: number;
  selected: boolean;
  draggable: boolean;
  lifted: boolean;
}) {
  return (
    <g
      data-character={delegate.id}
      transform={`translate(${at[0]} ${at[1]}) scale(${unit})`}
      style={{ cursor: draggable ? (lifted ? "grabbing" : "grab") : "pointer" }}
      opacity={lifted ? 0.85 : 1}
    >
      <title>{delegate.name}</title>
      <ellipse cx="0.5" cy="0" rx="7" ry="2.5" fill="#000" opacity="0.25" />
      <path
        transform="translate(-13 -24)"
        d="M0.987048 1.16021L12.2765 23.7392L24.5923 1.16021L18.4344 4.23916H10.2239L0.987048 1.16021Z"
        fill="#FF0000"
        stroke="#FF0000"
      />
      <circle cx="0.5" cy={PIN_HEAD_CENTER_Y} r="19" fill="#C8C5C5" stroke={selected ? "#f57132" : "#FF0404"} strokeWidth={selected ? 3 : 1} />
      <circle cx="0.5" cy={PIN_HEAD_CENTER_Y} r="17.5" fill={factionColor(delegate)} />
      <text
        x="0.5"
        y={PIN_HEAD_CENTER_Y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#fff"
        fontSize="13"
        fontWeight="600"
        fontFamily="var(--font-sans)"
      >
        {initials(delegate.name)}
      </text>
    </g>
  );
}

/** A battle: a pulsing gold badge above the parties, joined to each pin by a
 * dotted red line, with the conflict's name on a dark pill. */
function BattleMarker({
  conflict,
  positions,
  unit,
  part,
}: {
  conflict: ConflictResponse;
  positions: Pt[];
  unit: number;
  part: "lines" | "badge";
}) {
  const anchor = battleAnchor(positions, unit);
  if (!anchor) return null;
  const labelWidth = conflict.name.length * 6.3 + 18;
  if (part === "lines") {
    return (
      <g>
        {positions.map(([x, y], i) => (
        <line
          key={i}
          x1={anchor[0]}
          y1={anchor[1]}
          x2={x}
          y2={y + PIN_HEAD_CENTER_Y * unit}
          stroke="#b91c1c"
          strokeWidth={2.5 * unit}
          strokeOpacity="0.85"
          strokeDasharray={`${1 * unit} ${7 * unit}`}
          strokeLinecap="round"
          pointerEvents="none"
        />
        ))}
      </g>
    );
  }
  return (
    <g>
      <g data-conflict={conflict.id} transform={`translate(${anchor[0]} ${anchor[1]}) scale(${unit})`} style={{ cursor: "pointer" }}>
        <title>{conflict.name}</title>
        <circle r="19.5" fill="#b91c1c" opacity="0.55" pointerEvents="none">
          <animate attributeName="r" values="19.5;45" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.55;0" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle r="19.5" fill="#D08700" />
        <g transform="translate(-12 -12)" fill="none" stroke="black" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M13 19L19 13" />
          <path d="M14.5 17.5L3.586 6.586C3.2109 6.21101 3.00011 5.70239 3 5.172V3H5.172C5.70239 3.00011 6.21101 3.2109 6.586 3.586L17.5 14.5" />
          <path d="M14.828 6.172L17.414 3.586C17.789 3.2109 18.2976 3.00011 18.828 3H21V5.172C20.9999 5.70239 20.7891 6.21101 20.414 6.586L17.828 9.172" />
          <path d="M16 16L20 20" />
          <path d="M19 21L21 19" />
          <path d="M5 14L9 18" />
          <path d="M5 21L3 19" />
          <path d="M7.5 16.5L4 20" />
        </g>
        <g transform="translate(0 -33)">
          <rect x={-labelWidth / 2} y="-9" width={labelWidth} height="18" rx="9" fill="rgb(42 32 22)" fillOpacity="0.88" />
          <text textAnchor="middle" dominantBaseline="central" fill="#f5e6c4" fontSize="11" fontWeight="600" fontFamily="var(--font-sans)">
            {conflict.name}
          </text>
        </g>
      </g>
    </g>
  );
}


function ScoreSeal({ y, text }: { y: number; text: string }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <ellipse rx="13" ry="7.5" fill="#7a1f17" stroke="#4a110c" strokeWidth="0.8" />
      <ellipse rx="10.5" ry="5.6" fill="none" stroke="#e9c9a0" strokeWidth="0.4" opacity="0.7" />
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="7.5"
        fontWeight="700"
        fill="#f6e7c8"
        fontFamily="var(--font-sans)"
      >
        {text}
      </text>
    </g>
  );
}

function WarPin({ annotation }: { annotation: AnnotationResponse }) {
  const [x, y] = annotation.points[0];
  const color = annotation.color ?? "#8b2a1e";
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="3.5" ry="1.4" fill="#000" opacity="0.25" />
      <line x1="0" y1="0" x2="0" y2="-18" stroke={INK} strokeWidth="1.2" />
      <path d="M0,-18 L13,-14.5 L0,-10 Z" fill={color} stroke={INK} strokeWidth="0.6" />
      {/* crossed swords */}
      <g stroke={INK} strokeWidth="0.9" transform="translate(5.5 -14.2) scale(0.32)">
        <line x1="-8" y1="-8" x2="8" y2="8" stroke="#f6e7c8" strokeWidth="2.5" />
        <line x1="8" y1="-8" x2="-8" y2="8" stroke="#f6e7c8" strokeWidth="2.5" />
      </g>
      {annotation.label && (
        <text
          x="15"
          y="-13"
          fontSize="8"
          fontStyle="italic"
          fontFamily="var(--font-sans)"
          fontWeight="700"
          fill="#4a110c"
          stroke="#f3ead2"
          strokeWidth="2"
          paintOrder="stroke"
        >
          {annotation.label}
        </text>
      )}
    </g>
  );
}

function Cities({ zoom }: { zoom: number }) {
  // Minor towns only once zoomed in, so the full map stays legible.
  // Foreign-held cities always show: their treaty zones slow troops.
  const shown = QING.cities.filter((c) => c.capital || c.holder || zoom > 1.6);
  const k = 1 / Math.sqrt(zoom);
  return (
    <g fontFamily="var(--font-sans)">
      {shown.map((c) => (
        <g key={c.name} transform={`translate(${c.at[0]} ${c.at[1]}) scale(${k})`}>
          {c.capital ? (
            <>
              <circle r="4" fill="none" stroke={INK} strokeWidth="0.8" />
              <circle r="2" fill={INK} />
            </>
          ) : (
            <circle r="1.8" fill={INK} />
          )}
          <text
            x="5.5"
            y="3"
            fontSize={c.capital ? 9 : 7.5}
            fontWeight={c.capital ? 700 : 500}
            fill="#24180c"
            stroke="#f3ead2"
            strokeWidth="2"
            strokeOpacity="0.7"
            paintOrder="stroke"
          >
            {c.holder ? `(${c.holder}) ${c.name}` : c.name}
            {c.holder ? <title>{CITY_HOLDERS[c.holder]}</title> : null}
          </text>
        </g>
      ))}
    </g>
  );
}

