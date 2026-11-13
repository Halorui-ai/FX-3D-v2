# -*- coding: utf-8 -*-
"""Perimeter strips (N, S, W, E) for every zone -> docs/check/wall/p_<zone>.jpg  (W/E strips are rotated: s runs left->right)."""
import os, sys
import numpy as np, cv2
import grid, geo, strip
import trace_data as T

only = sys.argv[1:] or None
for zk, r in T.SITES:
    if not zk or (only and zk not in only):
        continue
    u0, s0, u1, s1 = r
    wins = [
        ("N", (u0 - 25, s0 - 42, u1 + 25, s0 + 30), 0),
        ("S", (u0 - 25, s1 - 45, u1 + 25, s1 + 30), 0),
        ("W", (u0 - 42, s0 - 25, u0 + 30, s1 + 25), 1),
        ("E", (u1 - 30, s0 - 25, u1 + 42, s1 + 25), 1),
    ]
    ims = []
    for nm, w, rot in wins:
        L = (w[3] - w[1]) if rot else (w[2] - w[0])
        mpp = max(0.3, L / 1500.0)
        im = strip.one(w[0], w[1], w[2], w[3], mpp, 10, 50, rot)
        cv2.putText(im, zk + " " + nm, (60, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 0, 200), 1, cv2.LINE_AA)
        ims.append(im)
    W = max(i.shape[1] for i in ims)
    ims = [cv2.copyMakeBorder(i, 0, 2, 0, W - i.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for i in ims]
    out = np.vstack(ims)
    p = os.path.join(geo.ROOT, "docs", "check", "wall", "p_" + zk + ".jpg")
    grid.save(out, p, 90)
    print(p, out.shape[1], "x", out.shape[0])
