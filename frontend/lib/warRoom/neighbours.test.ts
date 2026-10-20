import { describe, expect, it } from "vitest";

import { ringArea, type Pt } from "./geometry";
import { adjustNeighbours, carveOut } from "./neighbours";
import { dragHandle, outlineFromPath } from "./outline";
import { QING } from "./provinces";

// Two squares side by side sharing the edge x = 10: west [0,10], east [10,20].
const west: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
const east: Pt[] = [[10, 0], [20, 0], [20, 10], [10, 10]];
const north: Pt[] = [[0, -10], [20, -10], [20, 0], [0, 0]];

describe("adjustNeighbours", () => {
  it("takes land from the neighbour when a border moves into it", () => {
    const grown: Pt[] = [[0, 0], [14, 0], [14, 10], [0, 10]];
    const out = adjustNeighbours(west, grown, { east, north });
    expect(Object.keys(out)).toEqual(["east"]);
    expect(ringArea(out.east)).toBeCloseTo(60);
    expect(Math.min(...out.east.map(([x]) => x))).toBeCloseTo(14);
  });

  it("gives land back to the neighbour when a border pulls away", () => {
    const shrunk: Pt[] = [[0, 0], [6, 0], [6, 10], [0, 10]];
    const out = adjustNeighbours(west, shrunk, { east, north });
    expect(ringArea(out.east)).toBeCloseTo(140);
    expect(out.north).toBeUndefined();
  });

  it("leaves land at the coast unclaimed", () => {
    const shrunk: Pt[] = [[0, 0], [10, 0], [10, 6], [0, 6]];
    // The strip y 6–10 borders east along x = 10 only partly; with no east
    // neighbour it touches nobody and becomes unclaimed.
    expect(adjustNeighbours(west, shrunk, { north })).toEqual({});
  });

  it("changes nothing when the outline is the same", () => {
    expect(adjustNeighbours(west, west, { east, north })).toEqual({});
  });

  it("moves the real Henan–Hubei border together", () => {
    const ring = (id: string) => outlineFromPath(QING.provinces.find((p) => p.id === id)!.d).points;
    const others = Object.fromEntries(QING.provinces.filter((p) => p.id !== "henan").map((p) => [p.id, ring(p.id)]));
    const henan = outlineFromPath(QING.provinces.find((p) => p.id === "henan")!.d);
    // Push the handle nearest Hubei's centre 12 units south, into Hubei.
    const hubeiLabel = QING.provinces.find((p) => p.id === "hubei")!.label;
    const nearest = henan.handles.reduce((a, b) =>
      Math.hypot(henan.points[b][0] - hubeiLabel[0], henan.points[b][1] - hubeiLabel[1]) <
      Math.hypot(henan.points[a][0] - hubeiLabel[0], henan.points[a][1] - hubeiLabel[1])
        ? b
        : a,
    );
    const [x, y] = henan.points[nearest];
    const after = dragHandle(henan, nearest, [x, y + 12]).points;

    const out = adjustNeighbours(henan.points, after, others);
    expect(Object.keys(out)).toContain("hubei");
    expect(ringArea(out.hubei)).toBeLessThan(ringArea(others.hubei));
    // Far-away provinces are untouched.
    expect(out.xinjiang).toBeUndefined();
  });
});

describe("carveOut", () => {
  it("cuts a new province out of the ones it overlaps, leaving the rest", () => {
    const left: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const right: Pt[] = [[10, 0], [20, 0], [20, 10], [10, 10]];
    const far: Pt[] = [[50, 50], [60, 50], [60, 60]];
    const area: Pt[] = [[5, 0], [15, 0], [15, 10], [5, 10]];
    const next = carveOut(area, { left, right, far });
    expect(Object.keys(next).sort()).toEqual(["left", "right"]);
    expect(ringArea(next.left)).toBeCloseTo(50);
    expect(ringArea(next.right)).toBeCloseTo(50);
  });
});
