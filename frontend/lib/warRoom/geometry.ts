export type Pt = [number, number];

/** Area-weighted centre of a polygon (falls back to the vertex average for
 * degenerate shapes) — where a redrawn province's label goes. */
export function polygonCentroid(polygon: Pt[]): Pt {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const f = xj * yi - xi * yj;
    a += f;
    cx += (xj + xi) * f;
    cy += (yj + yi) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = polygon.length || 1;
    return [polygon.reduce((s, p) => s + p[0], 0) / n, polygon.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function polylinePath(points: Pt[]): string {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
}

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Zoom the view by `factor` (<1 zooms in) keeping `focus` fixed on screen,
 * clamped between `minW` and the full map width. */
export function zoomViewBox(
  view: ViewBox,
  factor: number,
  focus: Pt,
  bounds: { width: number; height: number },
  minW = 120,
): ViewBox {
  const w = Math.min(bounds.width, Math.max(minW, view.w * factor));
  const scale = w / view.w;
  const h = view.h * scale;
  const x = focus[0] - (focus[0] - view.x) * scale;
  const y = focus[1] - (focus[1] - view.y) * scale;
  return clampViewBox({ x, y, w, h }, bounds);
}

export function clampViewBox(view: ViewBox, bounds: { width: number; height: number }): ViewBox {
  const x = Math.min(Math.max(0, view.x), Math.max(0, bounds.width - view.w));
  const y = Math.min(Math.max(0, view.y), Math.max(0, bounds.height - view.h));
  return { ...view, x, y };
}

/** Rings of an SVG path made of M/L/Z commands (as in qingGeometry.json). */
export function parseRings(d: string): Pt[][] {
  return d
    .split("M")
    .filter(Boolean)
    .map((ring) =>
      ring
        .replace(/Z/g, "")
        .split("L")
        .map((pair) => pair.split(",").map(Number) as Pt),
    )
    .filter((ring) => ring.length >= 3);
}

export function ringArea(ring: Pt[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
}

