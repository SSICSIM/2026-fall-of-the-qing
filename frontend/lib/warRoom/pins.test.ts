import { describe, expect, it } from "vitest";

import { autoPlace, battleAnchor, battlesOnMap, defaultPinSpot, initials, PIN_HEAD_CENTER_Y, BATTLE_LIFT } from "./pins";
import type { ConflictResponse } from "@/types/api";

const conflict = (id: number, partyIds: number[], status: "ONGOING" | "RESOLVED" = "ONGOING"): ConflictResponse => ({
  id,
  name: `C${id}`,
  status,
  parties: partyIds.map((p) => ({ id: p, name: `D${p}` })),
  winner_id: null,
  outcome_summary: null,
  crisis_note_id: null,
  created_at: "",
  resolved_at: null,
});

describe("battleAnchor", () => {
  it("centres over the parties and floats above the highest pin", () => {
    const [x, y] = battleAnchor(
      [
        [100, 200],
        [200, 260],
      ],
      1,
    )!;
    expect(x).toBe(150);
    expect(y).toBe(200 + PIN_HEAD_CENTER_Y - BATTLE_LIFT);
  });

  it("scales the lift with zoom", () => {
    expect(battleAnchor([[0, 100]], 0.5)![1]).toBe(100 + (PIN_HEAD_CENTER_Y - BATTLE_LIFT) * 0.5);
  });

  it("has nowhere to go without parties on the map", () => {
    expect(battleAnchor([], 1)).toBeNull();
  });
});

describe("battlesOnMap", () => {
  const positions = new Map<number, [number, number]>([
    [1, [10, 10]],
    [2, [20, 20]],
  ]);

  it("skips resolved conflicts and conflicts with nobody placed", () => {
    const out = battlesOnMap([conflict(1, [1, 2]), conflict(2, [1, 2], "RESOLVED"), conflict(3, [7, 8])], positions);
    expect(out.map((b) => b.conflict.id)).toEqual([1]);
    expect(out[0].positions).toHaveLength(2);
  });

  it("draws a battle even if only one side is on the map", () => {
    expect(battlesOnMap([conflict(1, [1, 9])], positions)[0].positions).toEqual([[10, 10]]);
  });
});

describe("defaultPinSpot", () => {
  const labels = { zhili: [600, 250] as [number, number] };

  it("starts a character in a province they hold", () => {
    const [x, y] = defaultPinSpot({ id: 2 }, [{ id: "zhili", controller_id: 2, co_holder_ids: [], occupier_id: null, contested_by_id: null, shape: null }], labels, [0, 0]);
    expect(x).toBe(600);
    expect(y).toBe(236);
  });

  it("counts occupied land as held by the occupier", () => {
    const spot = defaultPinSpot({ id: 3 }, [{ id: "zhili", controller_id: 2, co_holder_ids: [], occupier_id: 3, contested_by_id: null, shape: null }], labels, [0, 0]);
    expect(spot[0]).toBe(609);
  });

  it("falls back to the given point", () => {
    expect(defaultPinSpot({ id: 2 }, [], labels, [500, 390])).toEqual([500, 376]);
  });
});

it("initials", () => {
  expect(initials("Yuan Shikai")).toBe("YS");
  expect(initials("Sun Yat-sen")).toBe("SY");
  expect(initials("Bogd")).toBe("B");
});

describe("autoPlace", () => {
  const prov = (id: string, controller: number | null, co: number[] = [], occupier: number | null = null) => ({
    id,
    controller_id: controller,
    co_holder_ids: co,
    occupier_id: occupier,
    contested_by_id: null,
    shape: null,
  });
  const labels: Record<string, [number, number]> = { zhili: [100, 100], henan: [100, 200], yunnan: [300, 300] };

  it("spreads a clique across the provinces it shares, owner in their own", () => {
    const provinces = [prov("zhili", 1, [2]), prov("henan", 1, [2])];
    const spots = autoPlace([{ id: 2 }, { id: 1 }], provinces, labels);
    expect(spots.get(1)).toEqual([100, 86]);
    expect(spots.get(2)).toEqual([100, 186]);
  });

  it("rings pins that share one province instead of stacking them", () => {
    const spots = autoPlace([{ id: 1 }, { id: 2 }, { id: 3 }], [prov("yunnan", 1, [2, 3])], labels);
    const pts = [...spots.values()].map((p) => p.join(","));
    expect(new Set(pts).size).toBe(3);
  });

  it("leaves characters with no land off the map", () => {
    expect(autoPlace([{ id: 9 }], [], labels).has(9)).toBe(false);
  });

  it("puts an owner in their home province, and clique members next to it", () => {
    const line = { a: [0, 0], b: [100, 0], c: [200, 0] } as Record<string, [number, number]>;
    const provinces = [prov("a", 1, [2]), prov("b", 1, [2]), prov("c", 1, [2])];
    const spots = autoPlace([{ id: 1, home_province_id: "c" }, { id: 2, home_province_id: "c" }], provinces, line);
    expect(spots.get(1)).toEqual([200, -14]);
    expect(spots.get(2)).toEqual([100, -14]);
  });

  it("puts an owner with no home in the middle of their territory", () => {
    const line = { a: [0, 0], b: [100, 0], c: [200, 0] } as Record<string, [number, number]>;
    const spots = autoPlace([{ id: 1 }], [prov("a", 1), prov("b", 1), prov("c", 1)], line);
    expect(spots.get(1)).toEqual([100, -14]);
  });

  it("places an occupier in the land their troops hold", () => {
    const spots = autoPlace([{ id: 2 }], [prov("zhili", 1, [], 2)], labels);
    expect(spots.get(2)).toEqual([100, 86]);
  });
});
