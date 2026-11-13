# -*- coding: utf-8 -*-
"""Rectified, gridded crop for tracing.
usage: python crop.py <name> <u0> <s0> <u1> <s1> <mpp> [minor] [major] [mosaic]
"""
import sys, os
import grid, geo

name = sys.argv[1]
u0, s0, u1, s1, mpp = map(float, sys.argv[2:7])
minor = int(sys.argv[7]) if len(sys.argv) > 7 else 20
major = int(sys.argv[8]) if len(sys.argv) > 8 else 100
mos = sys.argv[9] if len(sys.argv) > 9 else "mosaic_google_z19"
im = grid.window(u0, s0, u1, s1, mpp, mos)
if minor > 0:
    grid.draw_grid(im, u0, s0, mpp, minor, major)
out = os.path.join(geo.ROOT, "docs", "check", name + ".jpg")
grid.save(im, out)
print(out, im.shape[1], "x", im.shape[0])
