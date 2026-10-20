"""Redraw the province borders in lib/map/qingGeometry.json from the guides'
reference map (scripts/reference-map/guide-map.png).

build-qing-map.mjs builds provinces out of modern ones, which leaves stray
internal lines and a rough Rehe. This keeps that build's coastline and outer
border but takes every internal border from the reference image:

  1. Split the image into regions along its border lines.
  2. Give each region to the province it mostly overlaps in the current
     geometry (OVERRIDES fixes the few the modern borders get wrong).
  3. Trace smooth shared borders, move them onto the map with an affine fit
     on the big city dots, and clip them to the current land outline.

Run after build-qing-map.mjs (needs numpy, scipy, scikit-image, shapely, Pillow):

  python3 scripts/trace-reference-borders.py
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import shapely
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from shapely.geometry import Point, Polygon
from shapely.geometry.polygon import orient
from shapely.ops import polylabel, unary_union
from skimage.measure import find_contours
from skimage.morphology import binary_closing, disk

HERE = Path(__file__).parent
GEOMETRY = HERE.parent / "lib" / "map" / "qingGeometry.json"
REFERENCE = HERE / "reference-map" / "guide-map.png"

# Big city dots in the reference image (pixels) used for the alignment;
# each is snapped to the dot's centre.
CITY_DOTS = {
    "Kuga": (610, 240), "Dihua": (323, 320), "Beijing": (767, 389), "Lanzhou": (575, 496),
    "Lhasa": (348, 618), "Chengdu": (588, 605), "Kunming": (567, 721), "Guangzhou": (773, 744),
    "Changsha": (755, 644), "Nanjing": (843, 547), "Shanghai": (895, 553), "Shenyang": (870, 329),
    "Taiyuan": (718, 441),
}

# Regions (by a pixel inside them) whose province the modern borders get
# wrong. East of Harbin the reference has no border line, only the river, and
# the JILIN label sits south of it.
OVERRIDES = {(970, 205): "jilin"}


def rings(d: str) -> list[np.ndarray]:
    return [
        np.array([tuple(map(float, p.split(","))) for p in part.replace("Z", "").split("L")])
        for part in d.split("M")[1:]
    ]


def even_odd(parts: list[np.ndarray]) -> Polygon:
    g = Polygon()
    for r in parts:
        if len(r) >= 3:
            g = g.symmetric_difference(Polygon(r).buffer(0))
    return g


def regions(im: np.ndarray) -> np.ndarray:
    """Label the areas enclosed by border lines. Anything that isn't pale land
    or river blue (lines, text, dots) separates them."""
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    yellow = (r > 200) & (g > 200) & (r - b > 15)
    land = ndi.binary_fill_holes(
        binary_closing(yellow | ((im.mean(2) < 170) & ndi.binary_dilation(yellow, iterations=3)), disk(4))
    )
    open_land = ((r > 235) & (g > 235) & (r - b > 25)) | ((b - r > 25) & (b > 200))
    lab, _ = ndi.label(land & open_land)
    return lab


def city_fit(im: np.ndarray, cities: dict[str, list[int]]) -> np.ndarray:
    """Least-squares affine from image pixels to map units."""
    dark = im.mean(2) < 80
    src, dst = [], []
    for name, (x, y) in CITY_DOTS.items():
        blobs, n = ndi.label(dark[y - 9 : y + 10, x - 9 : x + 10])
        best = None
        for i in range(1, n + 1):
            ys, xs = np.nonzero(blobs == i)
            if len(ys) < 6:
                continue
            cx, cy = xs.mean() + x - 9, ys.mean() + y - 9
            if best is None or np.hypot(cx - x, cy - y) < best[0]:
                best = (np.hypot(cx - x, cy - y), cx, cy)
        src.append([best[1], best[2], 1])
        dst.append(cities[name])
    fit, *_ = np.linalg.lstsq(np.array(src), np.array(dst, float), rcond=None)
    return fit


def main() -> None:
    geo = json.loads(GEOMETRY.read_text())
    ids = [p["id"] for p in geo["provinces"]]
    im = np.array(Image.open(REFERENCE).convert("RGB")).astype(int)
    h, w = im.shape[:2]
    lab = regions(im)
    fit = city_fit(im, {c["name"]: c["at"] for c in geo["cities"]})
    to_image = np.linalg.inv(np.vstack([fit.T, [0, 0, 1]]))[:2]

    # The current provinces, drawn in image pixels.
    current = Image.new("I", (w, h), 0)
    draw = ImageDraw.Draw(current)
    for k, p in enumerate(geo["provinces"], 1):
        for r in rings(p["d"]):
            draw.polygon([tuple(v) for v in np.c_[r, np.ones(len(r))] @ to_image.T], fill=k)
    current = np.array(current)

    owner = np.zeros((h, w), int)
    sizes = np.bincount(lab.ravel())
    for c in range(1, lab.max() + 1):
        if sizes[c] < 20:
            continue
        votes = np.bincount(current[lab == c], minlength=len(ids) + 1)[1:]
        if votes.any():
            owner[lab == c] = votes.argmax() + 1
    for (x, y), pid in OVERRIDES.items():
        owner[lab == lab[y, x]] = ids.index(pid) + 1
    # Lines, text and everything off the land go to the nearest province.
    _, (iy, ix) = ndi.distance_transform_edt(owner == 0, return_indices=True)
    pad = 40
    owner = np.pad(owner[iy, ix], pad, mode="edge")

    def to_map(rc: np.ndarray) -> np.ndarray:
        return np.c_[rc[:, 1] - pad, rc[:, 0] - pad, np.ones(len(rc))] @ fit

    # The land is the provinces plus the outline under them, which covers the
    # odd patch the modern provinces leave out (beside Beijing).
    land = unary_union(
        [Polygon(r).buffer(0) for p in geo["provinces"] for r in rings(p["d"]) if len(r) >= 3]
        + [Polygon(r).buffer(0) for r in rings(geo["qingUnderlay"]) if len(r) >= 3]
    ).buffer(0.3).buffer(-0.3)
    # Blur each province's mask and trace where it beats every other one, so
    # neighbours share one smooth border.
    blurred = np.array([ndi.gaussian_filter((owner == k + 1).astype(float), 1.3) for k in range(len(ids))])
    shapes = []
    for k in range(len(ids)):
        f = np.pad(blurred[k] - np.delete(blurred, k, 0).max(0), 1, constant_values=-1)
        shapes.append(even_odd([to_map(c - 1) for c in find_contours(f, 0)]).intersection(land))
    shapes = shapely.coverage_simplify(np.array(shapes, dtype=object), 0.35)

    # Outer rings only; slivers under 100 sq units join the neighbour that
    # borders most of them.
    parts = {
        pid: [Polygon(p.exterior) for p in getattr(g, "geoms", [g]) if isinstance(p, Polygon) and p.area > 1.5]
        for pid, g in zip(ids, shapes)
    }
    for pid in ids:
        for piece in [p for p in parts[pid] if p.area < 100 and len(parts[pid]) > 1]:
            touching = {
                o: unary_union(parts[o]).buffer(0.6).intersection(piece.exterior).length for o in ids if o != pid
            }
            best = max(touching, key=touching.get)
            if touching[best] > 0.3 * piece.exterior.length:
                parts[pid].remove(piece)
                merged = unary_union([*parts[best], piece.buffer(0.05)])
                parts[best] = [Polygon(p.exterior) for p in getattr(merged, "geoms", [merged])]

    for province in geo["provinces"]:
        polys = [orient(p, 1.0).simplify(0.05) for p in parts[province["id"]]]
        province["d"] = "".join(
            "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in list(p.exterior.coords)[:-1]) + "Z" for p in polys
        )
        main_part = max(polys, key=lambda p: p.area)
        if not main_part.contains(Point(province["label"])):
            spot = polylabel(main_part, 0.5)
            province["label"] = [round(spot.x), round(spot.y)]

    GEOMETRY.write_text(json.dumps(geo, separators=(",", ":")))
    print(f"wrote {GEOMETRY}")


if __name__ == "__main__":
    main()
