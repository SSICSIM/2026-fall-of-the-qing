import { describe, expect, it } from "vitest";

import {
  clampViewBox,
  parseRings,
  polygonCentroid,
  polylinePath,
  ringArea,
  zoomViewBox,
} from "./geometry";

const bounds = { width: 1000, height: 780 };

it("polylinePath builds an SVG path", () => {
  expect(
    polylinePath([
      [1, 2],
      [3.25, 4],
    ]),
  ).toBe("M1.0,2.0L3.3,4.0");
});

describe("zoomViewBox", () => {
  const full = { x: 0, y: 0, w: 1000, h: 780 };

  it("keeps the focus point fixed while zooming in", () => {
    const v = zoomViewBox(full, 0.5, [500, 390], bounds);
    expect(v).toEqual({ x: 250, y: 195, w: 500, h: 390 });
  });

  it("never zooms out past the whole map", () => {
    expect(zoomViewBox(full, 3, [500, 390], bounds).w).toBe(1000);
  });

  it("stops at the minimum width", () => {
    expect(zoomViewBox(full, 0.01, [500, 390], bounds, 120).w).toBe(120);
  });
});

it("clampViewBox keeps the view on the map", () => {
  expect(clampViewBox({ x: -50, y: 900, w: 500, h: 390 }, bounds)).toEqual({ x: 0, y: 390, w: 500, h: 390 });
});

describe("polygonCentroid", () => {
  it("finds the middle of a square", () => {
    expect(
      polygonCentroid([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ).toEqual([5, 5]);
  });
  it("weights by area, not by vertex count", () => {
    // Extra vertices along one edge must not drag the centre toward it.
    const [x] = polygonCentroid([
      [0, 0],
      [5, 0],
      [9, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ]);
    expect(x).toBeCloseTo(5);
  });
  it("falls back to the vertex average for a flat shape", () => {
    expect(
      polygonCentroid([
        [0, 0],
        [2, 0],
        [4, 0],
      ]),
    ).toEqual([2, 0]);
  });
});

describe("outline helpers", () => {
  it("parses rings from an M/L/Z path", () => {
    expect(parseRings("M0,0L10,0L10,10ZM20,20L30,20L30,30Z")).toEqual([
      [
        [0, 0],
        [10, 0],
        [10, 10],
      ],
      [
        [20, 20],
        [30, 20],
        [30, 30],
      ],
    ]);
  });

  it("measures ring area", () => {
    expect(
      ringArea([
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]),
    ).toBe(100);
  });



});
