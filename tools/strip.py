# -*- coding: utf-8 -*-
"""Rectified crop with rulers in an outside margin (nothing drawn over the image) - for thin features (walls, gates, cars).
usage: python strip.py <name> <u0> <s0> <u1> <s1> <mpp> [tick=10] [label=50] [rot]
       rot = 1 : rotate 90 deg so that S runs along the horizontal axis (for N-S edges)
       several windows can be stacked: python strip.py <name> @ u0 s0 u1 s1 mpp tick label rot @ ...
"""
import sys, os, math
import numpy as np, cv2
import grid, geo

F = cv2.FONT_HERSHEY_SIMPLEX
M = 26


def one(u0, s0, u1, s1, mpp, tick=10, label=50, rot=0):
    im = grid.window(u0, s0, u1, s1, mpp)
    if mpp < 0.25:
        im = cv2.detailEnhance(im, sigma_s=3, sigma_r=0.08) if False else im
    h, w = im.shape[:2]
    if rot:
        im = cv2.rotate(im, cv2.ROTATE_90_COUNTERCLOCKWISE)   # S increases to the right?  -> x = s, y = u reversed
        im = cv2.flip(im, 0)                                  # now x = s (left->right), y = u (top->bottom)
        h, w = im.shape[:2]
        ax0, ay0, an, bn = s0, u0, "s", "u"
    else:
        ax0, ay0, an, bn = u0, s0, "u", "s"
    out = np.full((h + 2 * M, w + 2 * M, 3), 255, np.uint8)
    out[M:M + h, M:M + w] = im
    a1, b1 = ax0 + w * mpp, ay0 + h * mpp
    for a in range(int(math.ceil(ax0 / tick)) * tick, int(a1) + 1, tick):
        x = M + int(round((a - ax0) / mpp)); big = a % label == 0
        for y0_, y1_ in ((M - (10 if big else 5), M), (M + h, M + h + (10 if big else 5))):
            cv2.line(out, (x, y0_), (x, y1_), (0, 0, 255) if big else (0, 0, 0), 1)
        if big:
            cv2.putText(out, str(a), (x - 14, 11), F, 0.38, (0, 0, 200), 1, cv2.LINE_AA)
            cv2.putText(out, str(a), (x - 14, M + h + 22), F, 0.38, (0, 0, 200), 1, cv2.LINE_AA)
    for b in range(int(math.ceil(ay0 / tick)) * tick, int(b1) + 1, tick):
        y = M + int(round((b - ay0) / mpp)); big = b % label == 0
        for x0_, x1_ in ((M - (10 if big else 5), M), (M + w, M + w + (10 if big else 5))):
            cv2.line(out, (x0_, y), (x1_, y), (0, 0, 255) if big else (0, 0, 0), 1)
        if big or (b1 - ay0) <= 80 and b % (tick * 2) == 0:
            cv2.putText(out, str(b), (0, y + 4), F, 0.32, (160, 0, 0), 1, cv2.LINE_AA)
            cv2.putText(out, str(b), (M + w + 1, y + 4), F, 0.32, (160, 0, 0), 1, cv2.LINE_AA)
    cv2.putText(out, an + " ->", (M + 4, M - 14), F, 0.36, (0, 120, 0), 1, cv2.LINE_AA)
    cv2.putText(out, bn, (2, M - 6), F, 0.36, (0, 120, 0), 1, cv2.LINE_AA)
    return out


def main():
    name = sys.argv[1]
    args = sys.argv[2:]
    groups = []
    if "@" in args:
        cur = []
        for a in args:
            if a == "@":
                if cur: groups.append(cur)
                cur = []
            else:
                cur.append(a)
        if cur: groups.append(cur)
    else:
        groups = [args]
    ims = []
    for g in groups:
        v = [float(x) for x in g[:5]] + [int(x) for x in g[5:]]
        ims.append(one(*v))
    W = max(i.shape[1] for i in ims)
    ims = [cv2.copyMakeBorder(i, 0, 4, 0, W - i.shape[1], cv2.BORDER_CONSTANT, value=(255, 255, 255)) for i in ims]
    out = np.vstack(ims)
    p = os.path.join(geo.ROOT, "docs", "check", "wall", name + ".jpg")
    grid.save(out, p, 90)
    print(p, out.shape[1], "x", out.shape[0])


if __name__ == "__main__":
    main()
