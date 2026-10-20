"use client";

import { usePlaceMany } from "@/hooks/useWarRoom";
import { provincesOf } from "@/lib/warRoom/control";
import type { Pt } from "@/lib/warRoom/geometry";
import { autoPlace } from "@/lib/warRoom/pins";
import { mapProvinces } from "@/lib/warRoom/provinces";
import type { DelegateResponse, MapStateResponse } from "@/types/api";

/** Who's off the map, and an action that pins characters in their provinces. */
export function useAutoPlace(state: MapStateResponse) {
  const placeMany = usePlaceMany();
  const offMap = state.delegates.filter((d) => d.x == null);
  // Characters with no land have nowhere automatic to go.
  const landless = offMap.filter((d) => provincesOf(d.id, state.provinces).length === 0);
  const place = (who: DelegateResponse[]) => {
    const labels = Object.fromEntries(mapProvinces(state.provinces).map((p) => [p.id, p.label as Pt]));
    const spots = autoPlace(who, state.provinces, labels);
    const positions = [...spots].map(([character_id, [x, y]]) => ({ character_id, x, y }));
    if (positions.length) placeMany.mutate(positions);
  };
  return { offMap, landless, placeable: offMap.length - landless.length, place, pending: placeMany.isPending };
}
