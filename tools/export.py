# -*- coding: utf-8 -*-
"""trace_data.py  ->  data/campus.geojson (WGS-84)  +  src/data/campus.json (viewer, grid metres)
                  +  src/data/ground.png (class map)  + trees  +  sanity checks.
"""
import os, json, math, sys
import numpy as np, cv2
import grid, geo
import trace_data as T

SRC = os.path.join(geo.ROOT, "src", "data")
os.makedirs(SRC, exist_ok=True)

TYPE_NAME = {"P": "生产厂房", "O": "联合办公楼", "C": "餐厅", "W": "仓库", "U": "公用设施", "X": "其他"}
ZONE_NAME = {"GN": "G北", "GS": "G南"}


def height(t, f, roof):
    if t == "P":
        return {1: 12.0, 2: 14.5, 3: 20.5, 4: 26.5}.get(f, 6.2 * f + 2)
    if t == "O":
        return {1: 9.0, 2: 13.5, 3: 19.0, 4: 24.5}.get(f, 5.8 * f + 1.5)
    if t == "C":
        return {1: 11.0, 2: 14.0, 3: 18.0}.get(f, 14.0)
    if t == "W":
        return {1: 11.0, 2: 20.0}.get(f, 11.0)
    return {1: 7.0, 2: 10.5}.get(f, 5.0 * f + 1)


def rect_poly_ll(r):
    u0, s0, u1, s1 = r
    pts = [(u0, s0), (u1, s0), (u1, s1), (u0, s1), (u0, s0)]
    return [[round(v, 7) for v in grid.us_to_lonlat(u, s)] for u, s in pts]


def overlap(a, b, tol=0.5):
    return min(a[2], b[2]) - max(a[0], b[0]) > tol and min(a[3], b[3]) - max(a[1], b[1]) > tol


def main():
    out = {"theta_deg": math.degrees(grid.THETA), "origin": [geo.ORIGIN_LON, geo.ORIGIN_LAT],
           "buildings": [], "extras": [], "bridges": [], "courts": [], "pipes": [], "roads": [],
           "sites": [], "context": []}
    feats = []
    allB = []
    for zk, z in T.ZONES.items():
        zn = ZONE_NAME.get(zk, zk)
        for bid, t, f, r, roof in z["B"]:
            h = height(t, f, roof)
            b = {"id": bid, "zone": zn, "type": t, "typeName": TYPE_NAME[t], "floors": f, "h": h, "r": r, "roof": roof}
            out["buildings"].append(b)
            allB.append(b)
            c = grid.us_to_lonlat((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
            feats.append({"type": "Feature", "properties": {"id": bid, "zone": zn, "kind": "building", "type": TYPE_NAME[t],
                          "floors": f, "height_m": h, "roof": roof, "center": [round(c[0], 7), round(c[1], 7)],
                          "size_m": [round(r[2] - r[0], 1), round(r[3] - r[1], 1)]},
                          "geometry": {"type": "Polygon", "coordinates": [rect_poly_ll(r)]}})
        for r, h, roof in z.get("X", []):
            out["extras"].append({"zone": zn, "r": r, "h": h, "roof": roof})
            feats.append({"type": "Feature", "properties": {"zone": zn, "kind": "annex", "height_m": h, "roof": roof},
                          "geometry": {"type": "Polygon", "coordinates": [rect_poly_ll(r)]}})
        for r, clear, th in z.get("BR", []):
            out["bridges"].append({"zone": zn, "r": r, "clear": clear, "th": th})
            feats.append({"type": "Feature", "properties": {"zone": zn, "kind": "conveyor_bridge", "clear_m": clear},
                          "geometry": {"type": "Polygon", "coordinates": [rect_poly_ll(r)]}})
        for r, kind in z.get("CT", []):
            out["courts"].append({"zone": zn, "r": r, "kind": kind})
            feats.append({"type": "Feature", "properties": {"zone": zn, "kind": kind},
                          "geometry": {"type": "Polygon", "coordinates": [rect_poly_ll(r)]}})
    for line, h, w in T.PIPES:
        out["pipes"].append({"line": line, "h": h, "w": w})
        feats.append({"type": "Feature", "properties": {"kind": "pipe_rack", "height_m": h},
                      "geometry": {"type": "LineString", "coordinates": [[round(v, 7) for v in grid.us_to_lonlat(*p)] for p in line]}})
    for name, line, w, kind in T.ROADS:
        out["roads"].append({"name": name, "line": line, "w": w, "kind": kind})
        feats.append({"type": "Feature", "properties": {"kind": "road", "name": name, "width_m": w, "class": kind},
                      "geometry": {"type": "LineString", "coordinates": [[round(v, 7) for v in grid.us_to_lonlat(*p)] for p in line]}})
    for zn, r in T.SITES:
        out["sites"].append({"zone": ZONE_NAME.get(zn, zn), "r": r})
    for name, r, h, roof in T.CONTEXT:
        out["context"].append({"name": name, "r": r, "h": h, "roof": roof})
        feats.append({"type": "Feature", "properties": {"kind": "context_building", "name": name, "height_m": h},
                      "geometry": {"type": "Polygon", "coordinates": [rect_poly_ll(r)]}})

    # ---------------- perimeter walls (cut at gates and where a building stands on the line), gates, canopies, vehicles
    solids = [b["r"] for b in allB] + [e["r"] for e in out["extras"]]

    def inside_iv(a, b, r, pad):
        """parameter interval of segment a->b lying inside rect r (Liang-Barsky), or None"""
        t0, t1 = 0.0, 1.0
        dx, dy = b[0] - a[0], b[1] - a[1]
        for p, q in ((-dx, a[0] - (r[0] - pad)), (dx, (r[2] + pad) - a[0]), (-dy, a[1] - (r[1] - pad)), (dy, (r[3] + pad) - a[1])):
            if abs(p) < 1e-9:
                if q < 0:
                    return None
            else:
                t = q / p
                if p < 0:
                    t0 = max(t0, t)
                else:
                    t1 = min(t1, t)
        return (t0, t1) if t1 - t0 > 1e-6 else None

    def subtract(keep, cut):
        res = []
        for k0, k1 in keep:
            if cut[1] <= k0 or cut[0] >= k1:
                res.append((k0, k1)); continue
            if cut[0] > k0:
                res.append((k0, cut[0]))
            if cut[1] < k1:
                res.append((cut[1], k1))
        return res

    out["walls"], out["gates"] = [], []
    used = set()
    for zk, kind, poly in T.WALLS:
        zn = ZONE_NAME.get(zk, zk)
        cx = sum(p[0] for p in poly) / len(poly); cy = sum(p[1] for p in poly) / len(poly)
        for i in range(len(poly)):
            a, b = poly[i], poly[(i + 1) % len(poly)]
            L = math.hypot(b[0] - a[0], b[1] - a[1]); d = ((b[0] - a[0]) / L, (b[1] - a[1]) / L)
            n = (-d[1], d[0])
            if (cx - a[0]) * n[0] + (cy - a[1]) * n[1] < 0:
                n = (-n[0], -n[1])
            keep = [(0.0, 1.0)]
            for gi, (gz, name, p, w, gk, src) in enumerate(T.GATES):
                if gz != zk or gi in used:
                    continue
                t = ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L
                off = abs((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1])
                if -0.001 <= t <= 1.001 and off < 3.0:
                    used.add(gi)
                    q = [round(a[0] + d[0] * t * L, 2), round(a[1] + d[1] * t * L, 2)]
                    keep = subtract(keep, (t - w / 2 / L, t + w / 2 / L))
                    out["gates"].append({"zone": zn, "name": name, "p": q, "w": w, "kind": gk, "src": src,
                                         "dir": [round(d[0], 4), round(d[1], 4)], "in": [round(n[0], 4), round(n[1], 4)]})
                    ll = grid.us_to_lonlat(*q)
                    feats.append({"type": "Feature", "properties": {"kind": "gate", "zone": zn, "name": name, "class": gk, "width_m": w, "source": src},
                                  "geometry": {"type": "Point", "coordinates": [round(ll[0], 7), round(ll[1], 7)]}})
            for r in solids:
                iv = inside_iv(a, b, r, 0.3)
                if iv:
                    keep = subtract(keep, iv)
            for k0, k1 in keep:
                if (k1 - k0) * L < 1.0:
                    continue
                pa = [round(a[0] + d[0] * k0 * L, 2), round(a[1] + d[1] * k0 * L, 2)]
                pb = [round(a[0] + d[0] * k1 * L, 2), round(a[1] + d[1] * k1 * L, 2)]
                out["walls"].append({"zone": zn, "kind": kind, "a": pa, "b": pb})
                feats.append({"type": "Feature", "properties": {"kind": "wall", "zone": zn, "class": kind},
                              "geometry": {"type": "LineString", "coordinates": [[round(v, 7) for v in grid.us_to_lonlat(*pa)], [round(v, 7) for v in grid.us_to_lonlat(*pb)]]}})
    missing = [g for gi, g in enumerate(T.GATES) if gi not in used]
    out["canopies"] = [{"r": r, "h": h, "c": c} for r, h, c in T.GC]
    out["park"] = [{"v": v, "m": m, "l": l, "f": f} for v, m, l, f in T.PARK]
    out["bikes"] = [{"r": r, "f": f} for r, f in T.BIKES]
    print("walls", len(out["walls"]), "segments,", round(sum(math.hypot(w["b"][0] - w["a"][0], w["b"][1] - w["a"][1]) for w in out["walls"])), "m ; gates", len(out["gates"]),
          "; canopies", len(out["canopies"]), "; park rows", len(out["park"]), "; bike parks", len(out["bikes"]))

    # ---------------- checks
    problems = []
    ids = [b["id"] for b in allB]
    if len(ids) != len(set(ids)):
        problems.append("duplicate ids")
    for i in range(len(allB)):
        for j in range(i + 1, len(allB)):
            if overlap(allB[i]["r"], allB[j]["r"]):
                problems.append(f"overlap {allB[i]['id']} / {allB[j]['id']}")
    for rd in out["roads"]:
        if rd["kind"] != "inner":
            continue
        (a, b) = rd["line"][0], rd["line"][-1]
        rr = [min(a[0], b[0]) - rd["w"] / 2, min(a[1], b[1]) - rd["w"] / 2, max(a[0], b[0]) + rd["w"] / 2, max(a[1], b[1]) + rd["w"] / 2]
        for b_ in allB:
            if overlap(rr, b_["r"], 1.0):
                problems.append(f"road {rd['line']} crosses {b_['id']}")
    # office sandwiched between two production blocks in the same column
    for o in [b for b in allB if b["type"] == "O"]:
        col = [b for b in allB if b["type"] == "P" and b["zone"] == o["zone"] and abs(b["r"][0] - o["r"][0]) < 30]
        n = any(0 < o["r"][1] - b["r"][3] < 40 for b in col)
        s = any(0 < b["r"][1] - o["r"][3] < 40 for b in col)
        if not (n and s):
            problems.append(f"office {o['id']} not sandwiched (north={n}, south={s})")
    for g in missing:
        problems.append(f"gate {g[0]} {g[1]} {g[2]} is not on a wall line")
    for pk in out["park"]:
        l = pk["l"]
        for r in solids:
            if inside_iv(l[:2], l[2:], r, -0.5):
                problems.append(f"parking row {l} runs through a building {r}")
                break
    print("buildings", len(allB), "extras", len(out["extras"]), "bridges", len(out["bridges"]),
          "roads", len(out["roads"]), "context", len(out["context"]))
    by = {}
    for b in allB:
        by.setdefault(b["zone"], []).append(b["id"])
    for k, v in by.items():
        print(" ", k, len(v), " ".join(v))
    print("PROBLEMS:", len(problems))
    for p in problems:
        print("  -", p)

    # ---------------- ground class map + trees (from the satellite mosaic)
    G = dict(u0=-2000.0, s0=-700.0, w=4096, h=2048, mpp=1.0)
    im = grid.window(G["u0"], G["s0"], G["u0"] + G["w"], G["s0"] + G["h"], 1.0).astype(np.float32)
    b_, g_, r_ = im[..., 0], im[..., 1], im[..., 2]
    exg = 2 * g_ - r_ - b_
    lum = (r_ + g_ + b_) / 3
    # the imagery is quite desaturated: lawn ExG median ~ +6, paving ~ -6  (see sampling notes in the handoff doc)
    exg_s = cv2.GaussianBlur(exg, (0, 0), 1.6)
    lum_s = cv2.GaussianBlur(lum, (0, 0), 1.2)
    veg = ((exg_s > 1.8) & (lum_s < 118) & (g_ >= r_ * 0.99)).astype(np.uint8) * 255
    veg = cv2.morphologyEx(veg, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    veg = cv2.morphologyEx(veg, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    veg = cv2.medianBlur(veg, 5)

    def box(mask, r, val=0, pad=0):
        x0 = int(r[0] - G["u0"] - pad); y0 = int(r[1] - G["s0"] - pad)
        x1 = int(math.ceil(r[2] - G["u0"] + pad)); y1 = int(math.ceil(r[3] - G["s0"] + pad))
        cv2.rectangle(mask, (x0, y0), (x1, y1), int(val), -1)

    for b in allB:
        box(veg, b["r"], 0, 1)
    for e in out["extras"]:
        box(veg, e["r"], 0, 1)
    for c in out["context"]:
        box(veg, c["r"], 0, 1)
    for c in out["courts"]:
        box(veg, c["r"], 0, 2)
    paved = np.zeros((G["h"], G["w"]), np.uint8)
    for s in out["sites"]:
        box(paved, s["r"], 255)
    asph = np.zeros((G["h"], G["w"]), np.uint8)
    for rd in out["roads"]:
        pts = np.array([[p[0] - G["u0"], p[1] - G["s0"]] for p in rd["line"]], np.int32)
        cv2.polylines(asph, [pts], False, 255, int(rd["w"]))
    veg[asph > 0] = 0
    # trees = dark, textured vegetation ; grass = brighter smooth vegetation
    dark = (lum_s < 64).astype(np.uint8) * 255
    tree_mask = cv2.bitwise_and(veg, dark)
    # tree rows along roads are dark, narrow and only faintly green: accept dark & not-blue pixels next to vegetation
    near_veg = cv2.dilate(veg, np.ones((7, 7), np.uint8))
    rows = ((lum_s < 52) & (exg_s > -2.5) & (near_veg > 0)).astype(np.uint8) * 255
    tree_mask = cv2.bitwise_or(tree_mask, rows)
    tree_mask[asph > 0] = 0
    for b in allB:
        box(tree_mask, b["r"], 0, 4)
    for e in out["extras"]:
        box(tree_mask, e["r"], 0, 2)
    for c in out["context"]:
        box(tree_mask, c["r"], 0, 4)
    tree_mask = cv2.morphologyEx(tree_mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    dist = cv2.distanceTransform(tree_mask, cv2.DIST_L2, 3)
    trees = []
    occ = np.zeros_like(tree_mask)
    ys, xs = np.where(dist >= 1.3)
    order = np.argsort(-dist[ys, xs])
    rng = np.random.default_rng(7)
    for i in order:
        y, x = int(ys[i]), int(xs[i])
        if occ[y, x]:
            continue
        rad = float(min(max(dist[y, x] * 1.2, 2.4), 5.0))
        cv2.circle(occ, (x, y), int(rad * 1.25 + 1.0), 255, -1)
        trees.append([round(G["u0"] + x + rng.uniform(-0.4, 0.4), 1), round(G["s0"] + y + rng.uniform(-0.4, 0.4), 1), round(rad, 1)])
    # keep the scene light: all trees inside/near campus, thinned outside
    def near_site(u, s):
        return any(r["r"][0] - 60 < u < r["r"][2] + 60 and r["r"][1] - 60 < s < r["r"][3] + 60 for r in out["sites"])
    kept = [t for k, t in enumerate(trees) if near_site(t[0], t[1]) or k % 2 == 0]
    # no trees on top of parked vehicles (dark cars / bike blocks are easily mistaken for canopy)
    foot = [[b["r"][0] - 1, b["r"][1] - 1, b["r"][2] + 1, b["r"][3] + 1] for b in out["bikes"]]
    for pk in out["park"]:
        l, hw = pk["l"], (3.2 if pk["m"] == "r" else 1.8) * (2.2 if pk["v"] != "car" and pk["m"] == "r" else 1)
        foot.append([min(l[0], l[2]) - hw, min(l[1], l[3]) - hw, max(l[0], l[2]) + hw, max(l[1], l[3]) + hw])
    n0 = len(kept)
    kept = [t for t in kept if not any(f[0] < t[0] < f[2] and f[1] < t[1] < f[3] for f in foot)]
    print("trees removed from parking:", n0 - len(kept))
    if len(kept) > 22000:
        kept = kept[::2]
    cv2.imencode(".png", np.dstack([tree_mask, veg, paved]))[1].tofile(os.path.join(geo.ROOT, "docs", "check", "_veg_debug.png"))
    print("trees", len(trees), "->", len(kept))
    out["trees"] = kept
    veg_s = cv2.GaussianBlur(veg, (0, 0), 1.2)
    cls = np.dstack([asph, veg_s, paved])   # B,G,R order for cv2 -> R=paved, G=veg, B=asphalt
    ok, buf = cv2.imencode(".png", cls, [cv2.IMWRITE_PNG_COMPRESSION, 9])
    buf.tofile(os.path.join(SRC, "ground.png"))
    out["ground"] = G
    print("ground.png", len(buf) // 1024, "KB")

    with open(os.path.join(SRC, "campus.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(geo.DATA, "campus.geojson"), "w", encoding="utf-8") as f:
        json.dump({"type": "FeatureCollection", "name": "Foxconn Zhengzhou campus (WGS-84)", "features": feats}, f, ensure_ascii=False)
    print("campus.json", os.path.getsize(os.path.join(SRC, "campus.json")) // 1024, "KB ; geojson features", len(feats))


if __name__ == "__main__":
    main()
