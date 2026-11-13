# -*- coding: utf-8 -*-
"""Shared geo helpers. Mosaic pixel <-> lon/lat <-> local metres (ENU, x=east, y=north)."""
import math, json, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA = os.path.join(ROOT, "data")

ORIGIN_LON, ORIGIN_LAT = 113.8518, 34.5545
R = 6378137.0


def lonlat_to_tile_f(lon, lat, z):
    n = 2 ** z
    x = (lon + 180.0) / 360.0 * n
    lr = math.radians(lat)
    y = (1 - math.log(math.tan(lr) + 1 / math.cos(lr)) / math.pi) / 2 * n
    return x, y


def tile_f_to_lonlat(x, y, z):
    n = 2 ** z
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat


def lonlat_to_enu(lon, lat):
    x = math.radians(lon - ORIGIN_LON) * R * math.cos(math.radians(ORIGIN_LAT))
    y = math.radians(lat - ORIGIN_LAT) * R
    return x, y


def enu_to_lonlat(x, y):
    lon = ORIGIN_LON + math.degrees(x / (R * math.cos(math.radians(ORIGIN_LAT))))
    lat = ORIGIN_LAT + math.degrees(y / R)
    return lon, lat


class Mosaic:
    """Georeference of data/ortho/mosaic_*.jpg (meta json written by build_mosaic.py)."""

    def __init__(self, meta_path=None):
        meta_path = meta_path or os.path.join(DATA, "ortho", "mosaic.json")
        with open(meta_path, encoding="utf-8") as f:
            m = json.load(f)
        self.z, self.tx0, self.ty0 = m["z"], m["tx0"], m["ty0"]
        self.w, self.h = m["w"], m["h"]
        self.file = os.path.join(os.path.dirname(meta_path), m["file"])

    def px_to_lonlat(self, px, py):
        return tile_f_to_lonlat(self.tx0 + px / 256.0, self.ty0 + py / 256.0, self.z)

    def lonlat_to_px(self, lon, lat):
        x, y = lonlat_to_tile_f(lon, lat, self.z)
        return (x - self.tx0) * 256.0, (y - self.ty0) * 256.0

    def px_to_enu(self, px, py):
        return lonlat_to_enu(*self.px_to_lonlat(px, py))

    def enu_to_px(self, x, y):
        return self.lonlat_to_px(*enu_to_lonlat(x, y))
