import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { factionColor, inkFor, rampColor, FACTION_PALETTE } from "./colors";
import { holderIds, holderOf, holdingsByDelegate, provincesOf } from "./control";
import { LABEL_STYLE, QING } from "./provinces";
import type { DelegateResponse } from "@/types/api";

const delegate = (id: number, extra: Partial<DelegateResponse> = {}): DelegateResponse => ({
  id,
  name: `D${id}`,
  reputation: 2.5,
  economics: 2.5,
  military: 2.5,
  published_efficiency: null,
  faction_id: null,
  home_province_id: null,
  color: null,
  staff_notes: null,
  x: null,
  y: null,
  ...extra,
});

describe("map geometry", () => {
  it("draws exactly the provinces the backend knows about", () => {
    const backend = fs.readFileSync(
      path.resolve(__dirname, "../../../backend/app/services/provinces.py"),
      "utf8",
    );
    const ids = [...backend.matchAll(/^\s+"([a-z_]+)",$/gm)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(20);
    expect(QING.provinces.map((p) => p.id)).toEqual(ids);
  });

  it("seeds Johnston's pin on Shanghai", () => {
    const roster = fs.readFileSync(path.resolve(__dirname, "../../../backend/app/services/roster.py"), "utf8");
    const [, x, y] = roster.match(/LEGATION_PIN = \(([\d.]+), ([\d.]+)\)/)!;
    expect([Number(x), Number(y)]).toEqual(QING.cities.find((c) => c.name === "Shanghai")!.at);
  });

  it("marks the foreign-held cities from the guides' map", () => {
    const held = Object.fromEntries(QING.cities.filter((c) => c.holder).map((c) => [c.name, c.holder]));
    expect(held).toEqual({
      Tianjin: "L",
      Shanghai: "L",
      Ningbo: "L",
      Fuzhou: "L",
      Shantou: "L",
      "Hong Kong": "L",
      Macau: "P",
      Guangzhouwan: "G",
      Qingdao: "G",
      Dairen: "J",
    });
  });

  it("gives every province a non-empty shape and an on-map label", () => {
    for (const p of QING.provinces) {
      expect(p.d.length, p.id).toBeGreaterThan(50);
      const [x, y] = p.label;
      expect(x > 0 && x < QING.width && y > 0 && y < QING.height, p.id).toBe(true);
    }
  });

  it("only has label overrides for real provinces", () => {
    const ids = new Set(QING.provinces.map((p) => p.id));
    for (const id of Object.keys(LABEL_STYLE)) expect(ids.has(id), id).toBe(true);
  });
});

describe("control", () => {
  const delegates = new Map([1, 2].map((id) => [id, delegate(id)]));

  it("conquered land shows the occupier", () => {
    expect(holderOf({ id: "zhili", controller_id: 1, co_holder_ids: [], occupier_id: 2, contested_by_id: null, shape: null }, delegates)?.id).toBe(2);
    expect(holderOf({ id: "zhili", controller_id: 1, co_holder_ids: [], occupier_id: null, contested_by_id: null, shape: null }, delegates)?.id).toBe(1);
    expect(holderOf({ id: "zhili", controller_id: null, co_holder_ids: [], occupier_id: null, contested_by_id: null, shape: null }, delegates)).toBeNull();
  });

  it("counts holdings by who actually holds the land", () => {
    const counts = holdingsByDelegate([
      { id: "a", controller_id: 1, co_holder_ids: [], occupier_id: null, contested_by_id: null, shape: null },
      { id: "b", controller_id: 1, co_holder_ids: [], occupier_id: 2, contested_by_id: null, shape: null },
      { id: "c", controller_id: null, co_holder_ids: [], occupier_id: null, contested_by_id: null, shape: null },
    ]);
    expect(Object.fromEntries(counts)).toEqual({ 1: 1, 2: 1 });
  });

  it("counts a shared province for every holder, controller first", () => {
    const shared = { id: "zhili", controller_id: 1, co_holder_ids: [2, 3], occupier_id: null, contested_by_id: null, shape: null };
    expect(holderIds(shared)).toEqual([1, 2, 3]);
    expect(Object.fromEntries(holdingsByDelegate([shared]))).toEqual({ 1: 1, 2: 1, 3: 1 });
    expect(provincesOf(3, [shared]).map((p) => p.id)).toEqual(["zhili"]);
    expect(provincesOf(3, [{ ...shared, occupier_id: 4 }])).toEqual([]);
    expect(holderIds({ ...shared, controller_id: null })).toEqual([]);
  });
});

describe("colours", () => {
  it("uses a delegate's chosen colour, else a stable palette colour", () => {
    expect(factionColor(delegate(3, { color: "#123456" }))).toBe("#123456");
    expect(factionColor(delegate(3))).toBe(FACTION_PALETTE[3]);
    expect(factionColor(delegate(3 + FACTION_PALETTE.length))).toBe(FACTION_PALETTE[3]);
  });

  it("ramps from near-white (low) to navy (high), clamped", () => {
    expect(rampColor(0)).toBe("#eef3f8");
    expect(rampColor(1)).toBe("#1f3a5f");
    expect(rampColor(-1)).toBe(rampColor(0));
    expect(rampColor(7)).toBe(rampColor(1));
  });

  it("picks readable ink for text on a fill", () => {
    expect(inkFor(rampColor(0))).toBe("#2b1d0e");
    expect(inkFor(rampColor(1))).toBe("#f6eedb");
  });
});
