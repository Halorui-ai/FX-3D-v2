# -*- coding: utf-8 -*-
"""Check overlay for walls / gates / canopies / parked vehicles on the rectified satellite image.
usage: python overlay2.py <name> <u0> <s0> <u1> <s1> <mpp>
magenta = wall, yellow = gate opening, cyan = canopy, red = car rows, blue = bike parks, green = buildings + annexes
"""
import sys, os, json
import numpy as np, cv2
import grid, geo

name = sys.argv[1]
u0, s0, u1, s1, mpp = map(float, sys.argv[2:7])
D = json.load(open(os.path.join(geo.ROOT, "src", "data", "campus.json"), encoding="utf-8"))
im = grid.window(u0, s0, u1, s1, mpp)
P = lambda u, s: (int(round((u - u0) / mpp)), int(round((s - s0) / mpp)))
for b in D["buildings"] + D["extras"]:
    r = b["r"]; cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), (0, 220, 0), 1)
for w in D["walls"]:
    cv2.line(im, P(*w["a"]), P(*w["b"]), (255, 0, 255), 2)
for g in D["gates"]:
    p, d, hw = g["p"], g["dir"], g["w"] / 2
    cv2.line(im, P(p[0] - d[0] * hw, p[1] - d[1] * hw), P(p[0] + d[0] * hw, p[1] + d[1] * hw), (0, 255, 255), 3)
for c in D["canopies"]:
    r = c["r"]; cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), (255, 255, 0), 2)
for p in D["park"]:
    l = p["l"]; cv2.line(im, P(l[0], l[1]), P(l[2], l[3]), (0, 0, 255), 2 if p["m"] == "r" else 1)
for b in D["bikes"]:
    r = b["r"]; cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), (255, 80, 0), 1)
out = os.path.join(geo.ROOT, "docs", "check", "wall", name + ".jpg")
grid.save(im, out, 88)
print(out, im.shape[1], "x", im.shape[0])
