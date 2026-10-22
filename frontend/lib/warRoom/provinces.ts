import geometry from "@/lib/map/qingGeometry.json";
import type { ProvinceResponse } from "@/types/api";

import { polygonCentroid, polylinePath, type Pt } from "./geometry";

/** Foreign-held cities, lettered as on the guides' map. */
export type CityHolder = "L" | "G" | "P" | "J";

export const CITY_HOLDERS: Record<CityHolder, string> = {
  L: "Legation city",
  G: "German possession",
  P: "Portuguese possession",
  J: "Japanese possession",
};

export interface ProvinceShape {
  id: string;
  name: string;
  d: string;
  label: [number, number];
}

export interface QingGeometry {
  width: number;
  height: number;
  provinces: ProvinceShape[];
  qingUnderlay: string;
  foreignLands: string[];
  foreignLabels: { name: string; at: [number, number] }[];
  seaLabels: { name: string; at: [number, number] }[];
  rivers: { d: string; major: boolean }[];
  lakes: string[];
  cities: { name: string; capital: boolean; at: [number, number]; holder?: CityHolder }[];
  ranges: { name: string; points: [number, number][] }[];
}

export const QING = geometry as unknown as QingGeometry;

export const PROVINCE_NAMES: Record<string, string> = Object.fromEntries(
  QING.provinces.map((p) => [p.id, p.name]),
);

// Hand-tuned label placement, in the spirit of the reference map: long
// provinces get their name run along them; small ones get smaller type.
export const LABEL_STYLE: Record<string, { dx?: number; dy?: number; rotate?: number; size?: number }> = {
  xinjiang: { size: 17 },
  tibet: { size: 17 },
  mongolia: { size: 17, dy: 10 },
  qinghai: { size: 13 },
  inner_mongolia: { rotate: -32, size: 12, dx: 8, dy: 22 },
  gansu: { rotate: 35, size: 10, dx: 41, dy: 50 },
  heilongjiang: { size: 12, dx: -53, dy: -1 },
  jilin: { size: 9, dx: 31, dy: -14 },
  fengtian: { rotate: -60, size: 9, dx: 4 },
  rehe: { size: 9, dy: 6 },
  zhili: { size: 9, dy: 6 },
  shanxi: { rotate: -80, size: 9 },
  shaanxi: { rotate: -75, size: 9, dy: -8 },
  shandong: { size: 9, dx: 6, dy: 2 },
  henan: { size: 10 },
  jiangsu: { rotate: -60, size: 8, dx: 2 },
  anhui: { size: 8 },
  zhejiang: { rotate: -55, size: 8 },
  jiangxi: { rotate: -75, size: 9 },
  fujian: { rotate: -50, size: 9 },
  hubei: { size: 10 },
  hunan: { size: 10 },
  sichuan: { size: 13, dx: 10 },
  guizhou: { rotate: -35, size: 9 },
  yunnan: { size: 12 },
  guangxi: { size: 10 },
  guangdong: { rotate: -18, size: 10, dy: -4, dx: 6 },
};

export interface MapProvince extends ProvinceShape {
  /** The saved outline when a province was redrawn or added by staff. */
  custom: Pt[] | null;
}

/** Every province on the map with its current outline: the presets first,
 * then those staff added. */
export function mapProvinces(provinces: ProvinceResponse[]): MapProvince[] {
  const byId = new Map(provinces.map((p) => [p.id, p]));
  const presets = QING.provinces.map((shape) => {
    const custom = (byId.get(shape.id)?.shape as Pt[] | null) ?? null;
    return custom ? withOutline(shape, custom) : { ...shape, custom };
  });
  const added = provinces
    .filter((p) => p.custom && p.shape)
    .map((p) => withOutline({ id: p.id, name: p.name ?? p.id, d: "", label: [0, 0] }, p.shape as Pt[]));
  return [...presets, ...added];
}

function withOutline(shape: ProvinceShape, outline: Pt[]): MapProvince {
  return { ...shape, d: polylinePath(outline) + "Z", label: polygonCentroid(outline), custom: outline };
}

/** Province names by id, including those staff added. */
export function provinceNames(provinces: ProvinceResponse[]): Record<string, string> {
  const names = { ...PROVINCE_NAMES };
  for (const p of provinces) if (p.custom && p.shape && p.name) names[p.id] = p.name;
  return names;
}
