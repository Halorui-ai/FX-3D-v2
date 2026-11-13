# -*- coding: utf-8 -*-
"""Draw the traced ledger back onto the rectified satellite mosaic for visual checking.
usage: python overlay.py <name> <u0> <s0> <u1> <s1> <mpp>
"""
import sys, os
import numpy as np, cv2
import grid, geo
import trace_data as T

name = sys.argv[1]
u0, s0, u1, s1, mpp = map(float, sys.argv[2:7])
im = grid.window(u0, s0, u1, s1, mpp)
P = lambda u, s: (int(round((u - u0) / mpp)), int(round((s - s0) / mpp)))
COL = {"P": (0, 0, 255), "O": (0, 200, 255), "C": (255, 0, 255), "W": (255, 128, 0), "U": (255, 255, 0), "X": (200, 200, 200)}
f = cv2.FONT_HERSHEY_SIMPLEX
for z in T.ZONES.values():
    for r, h, roof in z.get("X", []):
        cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), (255, 255, 0), 1)
    for r, h, t in z.get("BR", []):
        cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), (0, 255, 0), 2)
    for r, k in z.get("CT", []):
        cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), (255, 255, 255), 2)
    for bid, t, fl, r, roof in z["B"]:
        cv2.rectangle(im, P(r[0], r[1]), P(r[2], r[3]), COL.get(t, (0, 0, 255)), 2)
        c = P((r[0] + r[2]) / 2, (r[1] + r[3]) / 2)
        cv2.putText(im, bid, (c[0] - 22, c[1] + 6), f, 0.6, (0, 0, 0), 4)
        cv2.putText(im, bid, (c[0] - 22, c[1] + 6), f, 0.6, (255, 255, 255), 1)
for line, h, w in T.PIPES:
    pts = np.array([P(*p) for p in line], np.int32)
    cv2.polylines(im, [pts], False, (0, 255, 0), 2)
for rd in getattr(T, "ROADS", []):
    pts = np.array([P(*p) for p in rd[1]], np.int32)
    cv2.polylines(im, [pts], False, (255, 0, 255), 1)
out = os.path.join(geo.ROOT, "docs", "check", name + ".jpg")
grid.save(im, out, 85)
print(out, im.shape)
