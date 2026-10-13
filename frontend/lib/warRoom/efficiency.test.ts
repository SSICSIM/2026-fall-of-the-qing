import { describe, expect, it } from "vitest";

import {
  bandFor,
  clampScore,
  compareForces,
  delegateEfficiency,
  groupEfficiency,
  normalizeIndicators,
  maxRating,
} from "./efficiency";

const s = (reputation: number, economics: number, military: number) => ({ reputation, economics, military });

describe("delegateEfficiency", () => {
  it("rates an all-2.5 delegate at exactly 1", () => {
    expect(delegateEfficiency(s(2.5, 2.5, 2.5))).toBeCloseTo(1);
  });

  it("runs from 0 to 2", () => {
    expect(delegateEfficiency(s(0, 0, 0))).toBe(0);
    expect(delegateEfficiency(s(5, 5, 5))).toBeCloseTo(2);
  });

  it("takes the nth root of the product: √ for two indicators, ∛ for three", () => {
    const d = s(5, 2.5, 1.25); // 2, 1, 0.5
    expect(delegateEfficiency(d, ["reputation"])).toBeCloseTo(2);
    expect(delegateEfficiency(d, ["reputation", "economics"])).toBeCloseTo(Math.SQRT2);
    expect(delegateEfficiency(d)).toBeCloseTo(1);
  });

  it("matches the mechanics guide's military example", () => {
    expect(delegateEfficiency(s(4, 3, 5))).toBeCloseTo(Math.cbrt(1.6 * 1.2 * 2));
  });

  it("drops to 0 if any chosen indicator is 0", () => {
    expect(delegateEfficiency(s(5, 0, 5))).toBe(0);
    expect(delegateEfficiency(s(5, 0, 5), ["reputation", "military"])).toBeCloseTo(2);
  });

  it("treats an empty indicator list as all three", () => {
    expect(normalizeIndicators([])).toEqual(["reputation", "economics", "military"]);
    expect(delegateEfficiency(s(4, 3, 5), [])).toBeCloseTo(Math.cbrt(3.84));
  });
});

describe("groupEfficiency", () => {
  it("is the mean of each delegate's rating", () => {
    expect(groupEfficiency([s(5, 5, 5), s(0, 0, 0)])).toBeCloseTo(1);
  });

  it("is null for nobody", () => {
    expect(groupEfficiency([])).toBeNull();
  });
});

describe("bandFor", () => {
  // Same thresholds as backend/tests/test_efficiency.py — keep them in step.
  it.each([
    [0, "consequences"],
    [0.49, "consequences"],
    [0.5, "minor"],
    [1, "minor"],
    [1.49, "minor"],
    [1.5, "benefits"],
    [2, "benefits"],
  ])("%s → %s", (rating, key) => {
    expect(bandFor(rating).key).toBe(key);
  });
});

describe("compareForces", () => {
  it("lets an efficient small army beat a sluggish medium one (mechanics guide example)", () => {
    const r = compareForces({ efficiency: 2, strength: 2 }, { efficiency: 1, strength: 3 });
    expect(r.winner).toBe("a");
    expect(r.a).toBe(4);
    expect(r.b).toBe(3);
    expect(r.margin).toBeCloseTo(0.25);
  });

  it("calls ties", () => {
    expect(compareForces({ efficiency: 1, strength: 2 }, { efficiency: 2, strength: 1 }).winner).toBe("tie");
  });

  it("handles zero strength on both sides", () => {
    expect(compareForces({ efficiency: 1, strength: 0 }, { efficiency: 1, strength: 0 })).toMatchObject({
      winner: "tie",
      margin: 0,
    });
  });
});

it("clampScore keeps scores on the 0-5 scale", () => {
  expect(clampScore(-2)).toBe(0);
  expect(clampScore(9)).toBe(5);
  expect(clampScore(3.5)).toBe(3.5);
  expect(clampScore(Number.NaN)).toBe(0);
});

describe("edited formula", () => {
  const bands = [
    { key: "a", label: "Setback", tone: "bad" as const, min: 0, tips: [] },
    { key: "b", label: "Success", tone: "good" as const, min: 1.2, tips: [] },
  ];

  it("divides by the chosen midpoint", () => {
    // cbrt(4/2 * 3/2 * 5/2) = cbrt(7.5), matching backend/tests/test_formula.py
    expect(delegateEfficiency({ reputation: 4, economics: 3, military: 5 }, undefined, 2)).toBeCloseTo(7.5 ** (1 / 3));
    expect(maxRating({ midpoint: 2, bands })).toBe(2.5);
  });

  it("bands by the chosen thresholds", () => {
    expect(bandFor(1.19, bands).label).toBe("Setback");
    expect(bandFor(1.2, bands).label).toBe("Success");
  });
});
