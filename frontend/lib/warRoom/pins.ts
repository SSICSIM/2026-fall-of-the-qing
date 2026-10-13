import type { ConflictResponse, DelegateResponse, ProvinceResponse } from "@/types/api";
import { holderIds, provincesOf } from "./control";
import type { Pt } from "./geometry";

// Pin and battle-marker geometry, in screen pixels (the map scales these by
// map-units-per-pixel so they stay the same size at every zoom), matching the
// Middle-earth map's markers.
export const PIN_HEIGHT = 58;
export const PIN_HEAD_CENTER_Y = -38.5; // relative to the pin's tip
export const BATTLE_LIFT = 70; // px the battle marker floats above its highest party

/** Where a battle marker sits: centred over its parties, above the highest pin. */
export function battleAnchor(positions: Pt[], unit: number): Pt | null {
  if (positions.length === 0) return null;
  const cx = positions.reduce((s, [x]) => s + x, 0) / positions.length;
  const top = Math.min(...positions.map(([, y]) => y));
  return [cx, top + (PIN_HEAD_CENTER_Y - BATTLE_LIFT) * unit];
}

/** Ongoing conflicts with the pin positions of their parties that are on the map. */
export function battlesOnMap(
  conflicts: ConflictResponse[],
  positions: Map<number, Pt>,
): { conflict: ConflictResponse; positions: Pt[] }[] {
  return conflicts
    .filter((c) => c.status === "ONGOING")
    .map((c) => ({
      conflict: c,
      positions: c.parties.flatMap((p) => (positions.has(p.id) ? [positions.get(p.id)!] : [])),
    }))
    .filter((b) => b.positions.length > 0);
}

/** A sensible first spot for a character's pin: the label of a province they
 * hold or share, nudged per character so pins in one province don't stack
 * exactly; otherwise the middle of the map. */
export function defaultPinSpot(
  delegate: Pick<DelegateResponse, "id">,
  provinces: ProvinceResponse[],
  labels: Record<string, Pt>,
  fallback: Pt,
): Pt {
  const held = provincesOf(delegate.id, provinces)[0];
  return pinSpotIn(held && labels[held.id] ? labels[held.id] : fallback, delegate.id);
}

/** A pin spot near a province label, nudged by `seed` so pins don't stack. */
export function pinSpotIn([x, y]: Pt, seed: number): Pt {
  const nudge = ((seed % 5) - 2) * 9;
  return [x + nudge, y - 14];
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

/** How far apart pins sharing one province sit, in map units. */
const RING = 16;

/**
 * Pin spots for a set of characters, each in one of the provinces they hold
 * or share. Owners are placed first. Each character prefers the province
 * with the fewest pins so far, then their home province, then one they own,
 * then the one nearest home (or the middle of their territory). So clique
 * members sharing land spread out from its seat, and pins in one province
 * sit in a ring around its label. Characters with no land are left out.
 */
export function autoPlace(
  characters: { id: number; home_province_id?: string | null }[],
  provinces: ProvinceResponse[],
  labels: Record<string, Pt>,
): Map<number, Pt> {
  const held = new Map(characters.map((c) => [c.id, provincesOf(c.id, provinces).filter((p) => labels[p.id])]));
  const owns = (id: number, p: ProvinceResponse) => holderIds(p)[0] === id && p.occupier_id == null;
  // Owners first, then whoever holds the fewest provinces (least choice).
  const order = [...characters].sort((a, b) => {
    const ownA = held.get(a.id)!.some((p) => owns(a.id, p)) ? 0 : 1;
    const ownB = held.get(b.id)!.some((p) => owns(b.id, p)) ? 0 : 1;
    return ownA - ownB || held.get(a.id)!.length - held.get(b.id)!.length || a.id - b.id;
  });

  const load = new Map<string, number[]>();
  for (const c of order) {
    const options = held.get(c.id)!;
    if (!options.length) continue;
    // Home, else the middle of their territory.
    const home = c.home_province_id && labels[c.home_province_id] ? c.home_province_id : null;
    const [cx, cy] = home
      ? labels[home]
      : [
          options.reduce((s, p) => s + labels[p.id][0], 0) / options.length,
          options.reduce((s, p) => s + labels[p.id][1], 0) / options.length,
        ];
    const toHeart = (p: ProvinceResponse) => Math.hypot(labels[p.id][0] - cx, labels[p.id][1] - cy);
    const pick = options.reduce((best, p) => {
      const lp = load.get(p.id)?.length ?? 0;
      const lb = load.get(best.id)?.length ?? 0;
      if (lp !== lb) return lp < lb ? p : best;
      if ((p.id === home) !== (best.id === home)) return p.id === home ? p : best;
      if (owns(c.id, p) !== owns(c.id, best)) return owns(c.id, p) ? p : best;
      return toHeart(p) < toHeart(best) ? p : best;
    });
    load.set(pick.id, [...(load.get(pick.id) ?? []), c.id]);
  }

  const spots = new Map<number, Pt>();
  for (const [pid, ids] of load) {
    const [x, y] = labels[pid];
    ids.forEach((id, k) => {
      if (ids.length === 1) return spots.set(id, [x, y - 14]);
      const angle = (2 * Math.PI * k) / ids.length - Math.PI / 2;
      spots.set(id, [x + RING * Math.cos(angle), y - 14 + RING * Math.sin(angle)]);
    });
  }
  return spots;
}
