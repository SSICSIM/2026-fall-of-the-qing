// Editing a border outline while keeping its texture: the outline keeps every
// detailed point, but only some are "handles" (draggable dots). Dragging a
// handle bends the stretch of border up to its neighbouring handles, so the
// wiggles in between move along instead of being straightened out.
import { parseRings, ringArea, type Pt } from "./geometry";

export interface Outline {
  points: Pt[];
  /** Indices into `points` that are shown as draggable dots, ascending. */
  handles: number[];
}

const round = ([x, y]: Pt): Pt => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas–Peucker over points[from..to], returning the kept indices. */
function keyIndices(points: Pt[], from: number, to: number, tolerance: number, out: Set<number>) {
  out.add(from);
  out.add(to);
  let maxD = 0;
  let index = -1;
  for (let i = from + 1; i < to; i++) {
    const d = distToSegment(points[i], points[from], points[to]);
    if (d > maxD) {
      maxD = d;
      index = i;
    }
  }
  if (index !== -1 && maxD > tolerance) {
    keyIndices(points, from, index, tolerance, out);
    keyIndices(points, index, to, tolerance, out);
  }
}

/** The corners worth showing as handles on a detailed ring. */
export function handleIndices(points: Pt[], tolerance: number): number[] {
  if (points.length <= 3) return points.map((_, i) => i);
  let far = 0;
  points.forEach((p, i) => {
    if (Math.hypot(p[0] - points[0][0], p[1] - points[0][1]) > Math.hypot(points[far][0] - points[0][0], points[far][1] - points[0][1])) far = i;
  });
  const kept = new Set<number>();
  keyIndices(points, 0, far, tolerance, kept);
  // Close the loop through a temporary copy of the first point.
  const loop = [...points, points[0]];
  const tail = new Set<number>();
  keyIndices(loop, far, loop.length - 1, tolerance, tail);
  tail.forEach((i) => i < points.length && kept.add(i));
  return [...kept].sort((a, b) => a - b);
}

/** A province's main landmass at full detail, with sparse handles. */
export function outlineFromPath(d: string, tolerance = 4.5): Outline {
  const rings = parseRings(d);
  if (rings.length === 0) return { points: [], handles: [] };
  const main = rings.reduce((best, r) => (ringArea(r) > ringArea(best) ? r : best)).map(round);
  return { points: main, handles: handleIndices(main, tolerance) };
}

/** A saved outline (already a plain ring) made editable the same way. */
export function outlineFromPoints(points: Pt[], tolerance = 4.5): Outline {
  return { points, handles: handleIndices(points, tolerance) };
}

/** Move handle `points[index]` to `to`, bending the border on each side
 * linearly down to zero at the neighbouring handles. */
export function dragHandle(outline: Outline, index: number, to: Pt): Outline {
  const { points, handles } = outline;
  const n = points.length;
  const dx = to[0] - points[index][0];
  const dy = to[1] - points[index][1];
  const h = handles.indexOf(index);
  if (h === -1 || handles.length < 2) {
    return { handles, points: points.map((p, i) => (i === index ? round(to) : p)) };
  }
  const prev = handles[(h - 1 + handles.length) % handles.length];
  const next = handles[(h + 1) % handles.length];
  const span = (a: number, b: number) => (b - a + n) % n || n; // steps from a forward to b
  const back = span(prev, index);
  const fwd = span(index, next);
  const moved = points.slice();
  moved[index] = round(to);
  for (let s = 1; s < back; s++) {
    const i = (index - s + n) % n;
    const w = 1 - s / back;
    moved[i] = round([points[i][0] + dx * w, points[i][1] + dy * w]);
  }
  for (let s = 1; s < fwd; s++) {
    const i = (index + s) % n;
    const w = 1 - s / fwd;
    moved[i] = round([points[i][0] + dx * w, points[i][1] + dy * w]);
  }
  return { points: moved, handles };
}

/** Insert a new handle at `p` after `points[edge]`. */
export function insertPoint(outline: Outline, edge: number, p: Pt): Outline {
  const at = edge + 1;
  const points = [...outline.points.slice(0, at), round(p), ...outline.points.slice(at)];
  const handles = [...outline.handles.map((i) => (i >= at ? i + 1 : i)), at].sort((a, b) => a - b);
  return { points, handles };
}

/** Add a handle halfway (by point count) between each pair of handles that
 * has detail between them: finer control where the border is busy. */
export function moreHandles(outline: Outline): Outline {
  const { points, handles } = outline;
  const n = points.length;
  const extra: number[] = [];
  handles.forEach((a, k) => {
    const b = handles[(k + 1) % handles.length];
    const gap = (b - a + n) % n;
    if (gap > 1) extra.push((a + Math.floor(gap / 2)) % n);
  });
  return { points, handles: [...new Set([...handles, ...extra])].sort((x, y) => x - y) };
}

/** Deterministic pseudo-random in [-1, 1] from a coordinate pair. */
function noise(x: number, y: number, k: number): number {
  const s = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453;
  return (s - Math.floor(s)) * 2 - 1;
}

/** Give long straight edges a gentle hand-drawn wobble so new borders match
 * the texture of the real ones. Short (already detailed) edges are kept. */
export function naturalEdges(points: Pt[], { step = 5, amplitude = 1.4, minLength = 12 } = {}): Pt[] {
  const out: Pt[] = [];
  points.forEach((a, i) => {
    out.push(a);
    const b = points[(i + 1) % points.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < minLength) return;
    const segments = Math.round(len / step);
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    let offset = 0;
    for (let s = 1; s < segments; s++) {
      const t = s / segments;
      // A smoothed random walk, pinned to zero at both ends of the edge.
      offset = offset * 0.55 + noise(a[0] + b[0], a[1] + b[1], s) * amplitude;
      const pin = Math.sin(Math.PI * t);
      out.push(round([a[0] + (b[0] - a[0]) * t + nx * offset * pin, a[1] + (b[1] - a[1]) * t + ny * offset * pin]));
    }
  });
  return out;
}
