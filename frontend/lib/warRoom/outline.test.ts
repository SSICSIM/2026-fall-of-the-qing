import { describe, expect, it } from "vitest";

import type { Pt } from "./geometry";
import { dragHandle, handleIndices, insertPoint, moreHandles, naturalEdges, outlineFromPath } from "./outline";
import { QING } from "./provinces";

// A square with a detailed (wiggly) bottom edge.
const wiggly: Pt[] = [
  [0, 0],
  [10, 0.4],
  [20, -0.4],
  [30, 0.4],
  [40, 0],
  [40, 40],
  [0, 40],
];

describe("handles", () => {
  it("keeps corners as handles and skips the small wiggles", () => {
    expect(handleIndices(wiggly, 2)).toEqual([0, 4, 5, 6]);
  });

  it("keeps every detailed point of a real province", () => {
    const zhili = QING.provinces.find((p) => p.id === "zhili")!;
    const outline = outlineFromPath(zhili.d);
    expect(outline.points.length).toBeGreaterThan(100);
    expect(outline.handles.length).toBeLessThan(outline.points.length / 2);
    expect(outline.handles.length).toBeGreaterThan(5);
  });
});

describe("dragHandle", () => {
  const outline = { points: wiggly, handles: [0, 4, 5, 6] };

  it("moves the handle and bends the border down to the neighbouring handles", () => {
    const moved = dragHandle(outline, 4, [40, -10]).points;
    expect(moved[4]).toEqual([40, -10]);
    // Neighbouring handles stay put.
    expect(moved[0]).toEqual([0, 0]);
    expect(moved[5]).toEqual([40, 40]);
    // In-between detail follows partway, keeping its wiggle.
    expect(moved[2]).toEqual([20, -5.4]);
    expect(moved[3][1]).toBeCloseTo(0.4 - 7.5);
  });

  it("wraps around the end of the ring", () => {
    const moved = dragHandle(outline, 0, [0, -10]).points;
    expect(moved[0]).toEqual([0, -10]);
    expect(moved[6]).toEqual([0, 40]); // previous handle unchanged
    expect(moved[2][1]).toBeCloseTo(-0.4 - 5);
  });
});

describe("insertPoint", () => {
  it("adds a handle after the given edge and shifts later handles", () => {
    const out = insertPoint({ points: wiggly, handles: [0, 4, 5, 6] }, 4, [40, 20]);
    expect(out.points[5]).toEqual([40, 20]);
    expect(out.points).toHaveLength(8);
    expect(out.handles).toEqual([0, 4, 5, 6, 7]);
  });
});

describe("moreHandles", () => {
  it("adds handles between handles that have detail between them", () => {
    expect(moreHandles({ points: wiggly, handles: [0, 4, 5, 6] }).handles).toEqual([0, 2, 4, 5, 6]);
  });
});

describe("naturalEdges", () => {
  const square: Pt[] = [
    [0, 0],
    [60, 0],
    [60, 60],
    [0, 60],
  ];

  it("subdivides long edges with a gentle wobble, keeping the corners", () => {
    const out = naturalEdges(square);
    expect(out.length).toBeGreaterThan(30);
    for (const corner of square) expect(out).toContainEqual(corner);
    const end = out.findIndex(([x, y]) => x === 60 && y === 0);
    const bottom = out.slice(1, end);
    expect(bottom.some(([, y]) => y !== 0)).toBe(true);
    expect(Math.max(...bottom.map(([, y]) => Math.abs(y)))).toBeLessThan(5);
  });

  it("is deterministic", () => {
    expect(naturalEdges(square)).toEqual(naturalEdges(square));
  });

  it("leaves short, already detailed edges alone", () => {
    expect(naturalEdges(wiggly.slice(0, 5), { minLength: 12 })).toHaveLength(5 + Math.round(40 / 5) - 1);
  });
});
