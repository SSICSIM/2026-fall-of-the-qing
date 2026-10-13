import type { DelegateResponse, ProvinceResponse } from "@/types/api";

/** Everyone holding a province: the controller first, then anyone sharing
 * it. One id means a single character holds it alone. */
export function holderIds(province: ProvinceResponse): number[] {
  return province.controller_id == null ? [] : [province.controller_id, ...province.co_holder_ids];
}

/** Who has the province in hand: an occupier, otherwise all its holders. */
function inHand(province: ProvinceResponse): number[] {
  return province.occupier_id != null ? [province.occupier_id] : holderIds(province);
}

/** Whose scores a province shows: conquered land takes the conqueror's. */
export function holderOf(
  province: ProvinceResponse,
  delegates: Map<number, DelegateResponse>,
): DelegateResponse | null {
  const id = province.occupier_id ?? province.controller_id;
  return id == null ? null : delegates.get(id) ?? null;
}

/** Number of provinces each delegate holds or shares (occupied land counts
 * for the occupier only). */
export function holdingsByDelegate(provinces: ProvinceResponse[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const p of provinces) {
    for (const id of inHand(p)) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

/** The provinces a delegate holds or shares, in map order. */
export function provincesOf(delegateId: number, provinces: ProvinceResponse[]): ProvinceResponse[] {
  return provinces.filter((p) => inHand(p).includes(delegateId));
}
