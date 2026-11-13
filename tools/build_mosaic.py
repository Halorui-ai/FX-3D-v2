# -*- coding: utf-8 -*-
"""Stitch one georeferenced satellite mosaic of the whole campus from XYZ tiles.

usage: python build_mosaic.py [esri|google] [zoom]
Output: data/ortho/mosaic_<src>_z<zoom>.jpg + data/ortho/mosaic.json (points at the latest build)
Tiles are cached in data/ortho/tiles/ (old WorkBuddy cache is reused for esri).
"""
import os, sys, json, time, shutil, urllib.request
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
import geo

SRC = sys.argv[1] if len(sys.argv) > 1 else "esri"
Z = int(sys.argv[2]) if len(sys.argv) > 2 else 18
# campus bbox (generous): west, south, east, north
W, S, E, N = 113.8300, 34.5385, 113.8800, 34.5650

URLS = {
    "esri": "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    "google": "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}",
}
CACHE = os.path.join(geo.DATA, "ortho", "tiles")
OLD = os.path.join(geo.ROOT, "历史版本", "WorkBuddy版_2026-09", "data", "raw", "tilecache")
os.makedirs(CACHE, exist_ok=True)


def fetch(xy):
    x, y = xy
    p = os.path.join(CACHE, f"{SRC}_{Z}_{x}_{y}.jpg")
    if os.path.exists(p) and os.path.getsize(p) > 500:
        return p
    if SRC == "esri":
        old = os.path.join(OLD, f"{Z}_{x}_{y}.jpg")
        if os.path.exists(old) and os.path.getsize(old) > 500:
            shutil.copy(old, p)
            return p
    url = URLS[SRC].format(z=Z, x=x, y=y)
    for t in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=25) as r:
                b = r.read()
            if len(b) < 300:
                raise ValueError("tiny")
            with open(p, "wb") as f:
                f.write(b)
            return p
        except Exception as e:  # noqa
            if t == 3:
                print("give up", x, y, e)
                return None
            time.sleep(1.0 * (t + 1))


def main():
    x0f, y0f = geo.lonlat_to_tile_f(W, N, Z)
    x1f, y1f = geo.lonlat_to_tile_f(E, S, Z)
    x0, y0, x1, y1 = int(x0f), int(y0f), int(x1f), int(y1f)
    tiles = [(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)]
    print(f"{SRC} z{Z}: {x1-x0+1} x {y1-y0+1} = {len(tiles)} tiles")
    with ThreadPoolExecutor(8) as ex:
        paths = list(ex.map(fetch, tiles))
    w, h = (x1 - x0 + 1) * 256, (y1 - y0 + 1) * 256
    canvas = Image.new("RGB", (w, h), (0, 0, 0))
    ok = 0
    for (x, y), p in zip(tiles, paths):
        if not p:
            continue
        try:
            canvas.paste(Image.open(p).convert("RGB"), ((x - x0) * 256, (y - y0) * 256))
            ok += 1
        except Exception as e:  # noqa
            print("bad tile", x, y, e)
    name = f"mosaic_{SRC}_z{Z}.jpg"
    canvas.save(os.path.join(geo.DATA, "ortho", name), quality=92)
    meta = {"file": name, "src": SRC, "z": Z, "tx0": x0, "ty0": y0, "w": w, "h": h,
            "bbox_wsen": [W, S, E, N]}
    with open(os.path.join(geo.DATA, "ortho", f"mosaic_{SRC}_z{Z}.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=1)
    print(f"ok {ok}/{len(tiles)}  {w}x{h}  -> {name}")


if __name__ == "__main__":
    main()
