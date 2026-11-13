# -*- coding: utf-8 -*-
"""Campus grid frame (U,S) in metres.

U = along the campus "east" axis (true east rotated clockwise by THETA, i.e. tilted to the south)
S = along the campus "south" axis (down on a rectified image)
Origin = geo.ORIGIN (on Yongzhou Rd).  Rectified images are simple windows of this frame.
"""
import math, os, json
import numpy as np
import cv2
from PIL import Image
import geo

Image.MAX_IMAGE_PIXELS = None
THETA = math.radians(11.70)
C, Sn = math.cos(THETA), math.sin(THETA)


def enu_to_us(x, y):
    u = x * C - y * Sn
    v = x * Sn + y * C
    return u, -v


def us_to_enu(u, s):
    v = -s
    return u * C + v * Sn, -u * Sn + v * C


def us_to_lonlat(u, s):
    return geo.enu_to_lonlat(*us_to_enu(u, s))


def lonlat_to_us(lon, lat):
    return enu_to_us(*geo.lonlat_to_enu(lon, lat))


_cache = {}


def mosaic(name="mosaic_google_z19"):
    if name not in _cache:
        m = geo.Mosaic(os.path.join(geo.DATA, "ortho", name + ".json"))
        img = cv2.imdecode(np.fromfile(m.file, dtype=np.uint8), cv2.IMREAD_COLOR)
        _cache[name] = (m, img)
    return _cache[name]


def window(u0, s0, u1, s1, mpp, name="mosaic_google_z19"):
    """Rectified crop of the mosaic covering [u0,u1]x[s0,s1] at mpp metres/pixel (BGR array)."""
    m, img = mosaic(name)
    w, h = int(round((u1 - u0) / mpp)), int(round((s1 - s0) / mpp))
    # affine from output px -> mosaic px using 3 corner points
    def src(px, py):
        return m.lonlat_to_px(*us_to_lonlat(u0 + px * mpp, s0 + py * mpp))
    dst = np.float32([[0, 0], [w, 0], [0, h]])
    srcp = np.float32([src(0, 0), src(w, 0), src(0, h)])
    M = cv2.getAffineTransform(dst, srcp)
    out = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_AREA if mpp > 0.3 else cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    if mpp > 0.3:
        out = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_LINEAR | cv2.WARP_INVERSE_MAP)
    return out


def draw_grid(im, u0, s0, mpp, minor=20, major=100, color=(0, 255, 255)):
    h, w = im.shape[:2]
    u1, s1 = u0 + w * mpp, s0 + h * mpp
    ov = im.copy()
    for u in range(int(math.ceil(u0 / minor)) * minor, int(u1) + 1, minor):
        x = int(round((u - u0) / mpp))
        big = u % major == 0
        cv2.line(ov, (x, 0), (x, h), color, 2 if big else 1)
    for s in range(int(math.ceil(s0 / minor)) * minor, int(s1) + 1, minor):
        y = int(round((s - s0) / mpp))
        big = s % major == 0
        cv2.line(ov, (0, y), (w, y), color, 2 if big else 1)
    im[:] = cv2.addWeighted(ov, 0.45, im, 0.55, 0)
    f = cv2.FONT_HERSHEY_SIMPLEX
    for u in range(int(math.ceil(u0 / major)) * major, int(u1) + 1, major):
        x = int(round((u - u0) / mpp))
        for y in (16, h // 2, h - 6):
            cv2.putText(im, str(u), (x + 3, y), f, 0.5, (0, 0, 0), 3)
            cv2.putText(im, str(u), (x + 3, y), f, 0.5, (0, 255, 255), 1)
    for s in range(int(math.ceil(s0 / major)) * major, int(s1) + 1, major):
        y = int(round((s - s0) / mpp))
        for x in (2, w // 2, w - 48):
            cv2.putText(im, str(s), (x, y - 3), f, 0.5, (0, 0, 0), 3)
            cv2.putText(im, str(s), (x, y - 3), f, 0.5, (0, 255, 0), 1)
    return im


def save(im, path, q=88):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ok, buf = cv2.imencode(".jpg", im, [cv2.IMWRITE_JPEG_QUALITY, q])
    buf.tofile(path)
