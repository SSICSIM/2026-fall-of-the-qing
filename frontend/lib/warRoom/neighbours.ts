// When one province's border is redrawn, its neighbours follow: land the
// province gained is cut out of whichever neighbour held it, and land it gave
// up goes to the neighbour it borders (or becomes unclaimed at the coast).
import polygonClipping, { type MultiPolygon, type Polygon } from "polygon-clipping";

import { ringArea, type Pt } from "./geometry";

/** Pieces smaller than this (map units²) are slivers from rounding. */
const MIN_AREA = 2;
/** How close a point must be to a border to count as on it (map units). */
const TOUCH = 2;

const round = ([x, y]: Pt): Pt => [Math.round(x * 10) / 10, Math.round(y * 10) / 10];
const poly = (ring: Pt[]): Polygon => [ring as [number, number][]];

function pieces(mp: MultiPolygon): Pt[][] {
  return mp.map((p) => (p[0] as Pt[]).slice(0, -1)).filter((r) => r.length >= 3 && ringArea(r) >= MIN_AREA);
}

function largest(mp: MultiPolygon): Pt[] | null {
  const rings = pieces(mp);
  if (!rings.length) return null;
  return rings.reduce((a, b) => (ringArea(b) > ringArea(a) ? b : a)).map(round);
}

function distToSegment([px, py]: Pt, [ax, ay]: Pt, [bx, by]: Pt): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function onBorder(p: Pt, ring: Pt[]): boolean {
  for (let i = 0; i < ring.length; i++) if (distToSegment(p, ring[i], ring[(i + 1) % ring.length]) <= TOUCH) return true;
  return false;
}

/** Length of `piece`'s edge that runs along `ring`'s border. */
function touching(piece: Pt[], ring: Pt[]): number {
  let length = 0;
  piece.forEach((a, i) => {
    const b = piece[(i + 1) % piece.length];
    const mid: Pt = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (onBorder(a, ring) && onBorder(b, ring) && onBorder(mid, ring)) length += Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
  return length;
}

/**
 * New outlines for the neighbours of a redrawn province.
 *
 * @param before the province's outline before the edit
 * @param after  its new outline
 * @param others the current outline of every other province, by id
 * @returns only the neighbours whose outline changes
 */
export function adjustNeighbours(before: Pt[], after: Pt[], others: Record<string, Pt[]>): Record<string, Pt[]> {
  const next: Record<string, Pt[]> = {};
  const current = (id: string) => next[id] ?? others[id];

  // Land taken: every neighbour loses whatever the new outline covers.
  const gained = pieces(polygonClipping.difference(poly(after), poly(before)));
  if (gained.length) {
    for (const [id, ring] of Object.entries(others)) {
      const overlap = polygonClipping.intersection(poly(ring), poly(after));
      if (!pieces(overlap).length) continue;
      const cut = largest(polygonClipping.difference(poly(ring), poly(after)));
      if (cut) next[id] = cut;
    }
  }

  // Land given up: each piece joins the neighbour sharing most of its edge.
  for (const piece of pieces(polygonClipping.difference(poly(before), poly(after)))) {
    let best: string | null = null;
    let bestTouch = 0;
    for (const id of Object.keys(others)) {
      const t = touching(piece, current(id));
      if (t > bestTouch) {
        best = id;
        bestTouch = t;
      }
    }
    if (!best) continue; // Coast: the land becomes unclaimed.
    const grown = largest(polygonClipping.union(poly(current(best)), poly(piece)));
    if (grown) next[best] = grown;
  }

  return next;
}
