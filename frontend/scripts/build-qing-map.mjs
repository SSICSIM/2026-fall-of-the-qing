// Builds lib/map/qingGeometry.json — the projected SVG geometry for the
// committee map (provinces, neighbouring lands, rivers, lakes, cities).
//
// Run once whenever the province layout changes; the output is committed so
// the app never needs these source files at runtime:
//
//   mkdir -p /tmp/qing-geo && cd /tmp/qing-geo
//   curl -o china.json     https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
//   curl -o countries.json https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json
//   curl -o rivers.json    https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_rivers_lake_centerlines.geojson
//   curl -o lakes.json     https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_lakes.geojson
//   node scripts/build-qing-map.mjs /tmp/qing-geo
//
// Modern provincial borders are merged/clipped to approximate the late-Qing
// layout (Zhili, Rehe, Fengtian, Outer Mongolia, …). It is a committee map,
// not a survey — crisis staff can redraw borders in the app.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { geoConicEqualArea, geoPath } from "d3-geo";
import * as topojson from "topojson-client";
import polygonClipping from "polygon-clipping";

const WIDTH = 1000;
const HEIGHT = 780;

const dataDir = process.argv[2];
if (!dataDir) {
  console.error("usage: node scripts/build-qing-map.mjs <data-dir>");
  process.exit(1);
}
const read = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), "utf8"));

const china = read("china.json");
const world = read("countries.json");
const rivers = read("rivers.json");
const lakes = read("lakes.json");

const byAdcode = new Map(china.features.map((f) => [String(f.properties.adcode), f]));
const countries = topojson.feature(world, world.objects.countries).features;
const countryById = new Map(countries.map((f) => [String(f.id), f]));

// Rough outline of the old Rehe special region (lon, lat), carved out of
// Inner Mongolia, Zhili and Fengtian.
const REHE = [[
  [115.9, 40.75], [117.2, 40.3], [118.6, 40.05], [119.6, 40.2], [120.6, 40.9],
  [121.6, 41.6], [122.3, 42.4], [121.8, 43.4], [120.8, 44.6], [119.0, 45.3],
  [117.4, 44.7], [116.4, 43.4], [115.8, 42.2], [115.9, 40.75],
]];

const toMulti = (geom) => (geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates);
const adm = (...codes) => codes.map((c) => toMulti(byAdcode.get(String(c)).geometry));

const PROVINCES = [
  { id: "xinjiang", name: "Xinjiang", parts: adm(650000) },
  { id: "tibet", name: "Tibet", parts: adm(540000) },
  { id: "qinghai", name: "Qinghai", parts: adm(630000) },
  { id: "gansu", name: "Gansu", parts: adm(620000, 640000) },
  { id: "mongolia", name: "Mongolia", parts: [toMulti(countryById.get("496").geometry)] },
  { id: "inner_mongolia", name: "Inner Mongolia", parts: adm(150000), minus: REHE },
  { id: "heilongjiang", name: "Heilongjiang", parts: adm(230000) },
  { id: "jilin", name: "Jilin", parts: adm(220000) },
  { id: "fengtian", name: "Fengtian", parts: adm(210000), minus: REHE },
  { id: "rehe", name: "Rehe", parts: adm(150000, 130000, 210000), within: REHE },
  { id: "zhili", name: "Zhili", parts: adm(110000, 120000, 130000), minus: REHE },
  { id: "shanxi", name: "Shanxi", parts: adm(140000) },
  { id: "shaanxi", name: "Shaanxi", parts: adm(610000) },
  { id: "shandong", name: "Shandong", parts: adm(370000) },
  { id: "henan", name: "Henan", parts: adm(410000) },
  { id: "jiangsu", name: "Jiangsu", parts: adm(320000, 310000) },
  { id: "anhui", name: "Anhui", parts: adm(340000) },
  { id: "zhejiang", name: "Zhejiang", parts: adm(330000) },
  { id: "jiangxi", name: "Jiangxi", parts: adm(360000) },
  { id: "fujian", name: "Fujian", parts: adm(350000) },
  { id: "hubei", name: "Hubei", parts: adm(420000) },
  { id: "hunan", name: "Hunan", parts: adm(430000) },
  { id: "sichuan", name: "Sichuan", parts: adm(510000, 500000) },
  { id: "guizhou", name: "Guizhou", parts: adm(520000) },
  { id: "yunnan", name: "Yunnan", parts: adm(530000) },
  { id: "guangxi", name: "Guangxi", parts: adm(450000) },
  {
    id: "guangdong",
    name: "Guangdong",
    parts: adm(440000, 460000, 810000, 820000),
    // Hainan's modern boundary includes the far South China Sea islands.
    within: [[[104, 17.5], [119, 17.5], [119, 26.5], [104, 26.5], [104, 17.5]]],
  },
];

function buildShape(p) {
  let shape = polygonClipping.union(...p.parts);
  if (p.minus) shape = polygonClipping.difference(shape, p.minus);
  if (p.within) shape = polygonClipping.intersection(shape, p.within);
  // polygon-clipping emits counter-clockwise exteriors (planar convention);
  // d3-geo is spherical and reads those as "the whole globe minus this
  // shape", so flip every ring.
  const rewound = shape.map((poly) => poly.map((ring) => [...ring].reverse()));
  return { type: "MultiPolygon", coordinates: rewound };
}

const provinceFeatures = PROVINCES.map((p) => ({
  type: "Feature",
  properties: { id: p.id, name: p.name },
  geometry: buildShape(p),
}));

const projection = geoConicEqualArea()
  .parallels([25, 47])
  .rotate([-104, 0])
  .fitExtent(
    [[40, 30], [WIDTH - 30, HEIGHT - 20]],
    { type: "FeatureCollection", features: provinceFeatures },
  )
  .clipExtent([[0, 0], [WIDTH, HEIGHT]]);

const ringArea = (pts) =>
  Math.abs(pts.reduce((a, [x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length];
    return a + x * ny - nx * y;
  }, 0)) / 2;

// Round to 0.1px, drop points that are visually redundant at this scale, and
// drop specks of islands too small to see.
function compactPath(d, minDist = 0.9, minArea = 6) {
  if (!d) return "";
  return d
    .split("M")
    .filter(Boolean)
    .map((ring) => {
      const closed = ring.endsWith("Z");
      const pts = ring.replace("Z", "").split("L").map((s) => s.split(",").map(Number));
      const kept = [];
      for (const [x, y] of pts) {
        const last = kept[kept.length - 1];
        if (!last || Math.hypot(x - last[0], y - last[1]) >= minDist) kept.push([x, y]);
      }
      if (kept.length < (closed ? 3 : 2)) return "";
      if (closed && ringArea(kept) < minArea) return "";
      return "M" + kept.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + (closed ? "Z" : "");
    })
    .filter(Boolean)
    .join("");
}

const pathGen = geoPath(projection);

function labelPoint(feature) {
  // Centroid of the largest polygon, so islands don't drag the label offshore.
  const polys = feature.geometry.coordinates;
  let best = null;
  let bestArea = -1;
  for (const poly of polys) {
    const g = { type: "Polygon", coordinates: poly };
    const a = pathGen.area(g);
    if (a > bestArea) {
      bestArea = a;
      best = g;
    }
  }
  const [x, y] = pathGen.centroid(best);
  return [Math.round(x), Math.round(y)];
}

const provinces = provinceFeatures.map((f) => ({
  id: f.properties.id,
  name: f.properties.name,
  d: compactPath(pathGen(f)),
  label: labelPoint(f),
}));

// Neighbouring lands, renamed for the 1910s setting.
const FOREIGN_LABELS = [
  { name: "Russian Republic", lonlat: [98, 54.5] },
  { name: "Turkestan", lonlat: [70.5, 44] },
  { name: "Dominion of India", lonlat: [77, 26] },
  { name: "Nepal", lonlat: [83.5, 28.3] },
  { name: "Bhutan", lonlat: [90.4, 27.4] },
  { name: "Burma", lonlat: [96, 21] },
  { name: "Siam", lonlat: [101, 16.5] },
  { name: "French Indochina", lonlat: [106.2, 17.8] },
  { name: "Empire of Japan", lonlat: [131.5, 37.5] },
  { name: "Korea", lonlat: [127.4, 39.6] },
];

const SEA_LABELS = [
  { name: "Yellow Sea", lonlat: [123.2, 35.2] },
  { name: "East China Sea", lonlat: [125.5, 29.5] },
  { name: "South China Sea", lonlat: [114.5, 17.5] },
  { name: "Bay of Bengal", lonlat: [88.5, 17] },
  { name: "Sea of Japan", lonlat: [134.5, 41] },
];

const SKIP_COUNTRIES = new Set(["156", "496", "158"]); // China, Mongolia, Taiwan (drawn separately)
const foreignLands = countries
  .filter((f) => !SKIP_COUNTRIES.has(String(f.id)))
  .map((f) => compactPath(pathGen(f), 1.4, 14))
  .filter(Boolean);
// Taiwan was a Japanese colony in this period.
foreignLands.push(compactPath(pathGen(countryById.get("158")), 1.2, 14));
// The modern PRC outline sits under the provinces to hide hairline gaps
// between the two source datasets.
const qingUnderlay = compactPath(pathGen(countryById.get("156")), 1.2);

const inView = (geom) => {
  const [[x0, y0], [x1, y1]] = pathGen.bounds(geom);
  return x1 > 0 && y1 > 0 && x0 < WIDTH && y0 < HEIGHT;
};

const riverPaths = rivers.features
  .filter((f) => (f.properties.scalerank ?? 99) <= 7 && f.properties.featurecla !== "Lake Centerline")
  .filter((f) => inView(f.geometry))
  .map((f) => ({ d: compactPath(pathGen(f), 1.5), major: (f.properties.scalerank ?? 99) <= 4 }))
  .filter((r) => r.d);

const lakePaths = lakes.features
  .filter((f) => inView(f.geometry))
  .map((f) => compactPath(pathGen(f), 1, 10))
  .filter(Boolean);

// holder marks foreign-held cities as on the guides' map: L legation city,
// G German, P Portuguese, J Japanese (Background Guide, "Unequal
// Territorial Treaties").
const CITIES = [
  { name: "Beijing", lonlat: [116.4, 39.9], capital: true },
  { name: "Tianjin", lonlat: [117.2, 39.1], holder: "L" },
  { name: "Baoding", lonlat: [115.5, 38.9] },
  { name: "Shanghai", lonlat: [121.47, 31.23], capital: true, holder: "L" },
  { name: "Nanjing", lonlat: [118.8, 32.06], capital: true },
  { name: "Hangzhou", lonlat: [120.15, 30.28] },
  { name: "Ningbo", lonlat: [121.55, 29.87], holder: "L" },
  { name: "Fuzhou", lonlat: [119.3, 26.08], holder: "L" },
  { name: "Shantou", lonlat: [116.68, 23.35], holder: "L" },
  { name: "Guangzhou", lonlat: [113.26, 23.13], capital: true },
  { name: "Hong Kong", lonlat: [114.17, 22.3], holder: "L" },
  { name: "Macau", lonlat: [113.54, 22.19], holder: "P" },
  { name: "Guangzhouwan", lonlat: [110.36, 21.27], holder: "G" },
  { name: "Nanning", lonlat: [108.33, 22.82] },
  { name: "Guilin", lonlat: [110.29, 25.27] },
  { name: "Kunming", lonlat: [102.71, 25.04], capital: true },
  { name: "Guiyang", lonlat: [106.71, 26.58] },
  { name: "Changsha", lonlat: [112.94, 28.23], capital: true },
  { name: "Wuchang", lonlat: [114.3, 30.55] },
  { name: "Nanchang", lonlat: [115.86, 28.68] },
  { name: "Anqing", lonlat: [117.05, 30.52] },
  { name: "Chengdu", lonlat: [104.07, 30.67], capital: true },
  { name: "Chongqing", lonlat: [106.55, 29.56] },
  { name: "Xi'an", lonlat: [108.94, 34.34], capital: true },
  { name: "Yan'an", lonlat: [109.49, 36.6] },
  { name: "Taiyuan", lonlat: [112.55, 37.87] },
  { name: "Kaifeng", lonlat: [114.31, 34.8] },
  { name: "Jinan", lonlat: [117.0, 36.67] },
  { name: "Qingdao", lonlat: [120.38, 36.07], holder: "G" },
  { name: "Lanzhou", lonlat: [103.83, 36.06], capital: true },
  { name: "Xining", lonlat: [101.78, 36.62] },
  { name: "Lhasa", lonlat: [91.11, 29.65], capital: true },
  { name: "Dihua", lonlat: [87.62, 43.83], capital: true },
  { name: "Kashgar", lonlat: [75.99, 39.47] },
  { name: "Urga", lonlat: [106.91, 47.92], capital: true },
  { name: "Kalgan", lonlat: [114.88, 40.82] },
  { name: "Chengde", lonlat: [117.96, 40.95] },
  { name: "Shenyang", lonlat: [123.43, 41.8], capital: true },
  { name: "Dairen", lonlat: [121.6, 38.91], holder: "J" },
  { name: "Changchun", lonlat: [125.32, 43.82] },
  { name: "Harbin", lonlat: [126.63, 45.75], capital: true },
];

const project = ([lon, lat]) => projection([lon, lat]).map((v) => Math.round(v));

const cities = CITIES.map((c) => ({
  name: c.name,
  capital: !!c.capital,
  at: project(c.lonlat),
  ...(c.holder ? { holder: c.holder } : {}),
}));
const foreignLabels = FOREIGN_LABELS.map((l) => ({ name: l.name, at: project(l.lonlat) }));
const seaLabels = SEA_LABELS.map((l) => ({ name: l.name, at: project(l.lonlat) }))
  .filter(({ at: [x, y] }) => x > 0 && y > 0 && x < WIDTH && y < HEIGHT);

// Mountain ranges as lon/lat polylines; the app draws little peak glyphs
// along each one, Middle-earth style.
const RANGES = [
  { name: "Himalaya", line: [[79, 31.5], [83, 29.6], [87, 28.3], [91, 28.1], [95, 29.2]] },
  { name: "Kunlun Shan", line: [[78, 36.2], [83, 35.9], [88, 36.2], [93, 36], [97, 35.3]] },
  { name: "Tian Shan", line: [[76, 41.5], [80, 42.2], [84, 43.2], [88, 43.4], [92, 43.2]] },
  { name: "Altai", line: [[88, 48.6], [91, 47.6], [94, 46.6], [97, 45.6]] },
  { name: "Qilian Shan", line: [[95, 39.2], [98, 38.7], [101, 37.9]] },
  { name: "Qinling", line: [[105, 33.9], [107.5, 33.9], [110, 33.8]] },
  { name: "Taihang", line: [[113.2, 35.5], [113.6, 37.2], [114.4, 39]] },
  { name: "Greater Khingan", line: [[119.5, 43.6], [121, 46], [122.5, 48.5], [123, 50.5]] },
  { name: "Hengduan", line: [[99, 31.5], [99.3, 29], [99.4, 26.5]] },
  { name: "Wuyi", line: [[116.7, 26.2], [117.6, 27.4], [118.3, 28.2]] },
];

const ranges = RANGES.map((r) => ({ name: r.name, points: r.line.map(project) }));

const out = {
  width: WIDTH,
  height: HEIGHT,
  provinces,
  qingUnderlay,
  foreignLands,
  foreignLabels,
  seaLabels,
  rivers: riverPaths,
  lakes: lakePaths,
  cities,
  ranges,
};

const here = path.dirname(fileURLToPath(import.meta.url));
const outFile = path.join(here, "..", "lib", "map", "qingGeometry.json");
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`wrote ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(0)} KB)`);
