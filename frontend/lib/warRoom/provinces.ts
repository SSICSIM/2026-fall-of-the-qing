import geometry from "@/lib/map/qingGeometry.json";

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
  gansu: { rotate: 38, size: 10, dx: -14, dy: 18 },
  heilongjiang: { size: 12, dy: 8 },
  jilin: { size: 9 },
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
