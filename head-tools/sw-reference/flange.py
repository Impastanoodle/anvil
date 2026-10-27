"""Item 2 - Edge flange above 90 deg: 4 x 2 base flange (16 ga, R = T, K 0.5), a 1 in edge flange on the
4 in edge at z = 2 (top face), Material Inside, at 90 / 120 / 135 deg, flange length measured Outer Virtual
Sharp and Tangent.  Records the flat size, the flange tip (the vertices with the largest Y) and the volume.

    python flange.py [angles...]  -> Output\\SolidWorks Models\\Anvil reference\\flange-<angle>-<ref>.SLDPRT + flange.json
"""
import sys

from swref import *


def build(sw, angle, ref, position="inside"):
    m = new_part(sw)
    try:
        base_flange_top(m)
        _, fd = edge_flange(m, (2, T, 2), 1.0, angle, position, ref)
        rebuild(m)
        names = [val(f, "GetTypeName2") for f in features(m)]
        if "EdgeFlange" not in names:
            raise RuntimeError("no edge flange: " + str(names))
        vs = vertices(m)
        ymax = max(v[1] for v in vs)
        tip = [v for v in vs if v[1] > ymax - 1e-6]
        res = {"angle": angle, "lengthRef": ref, "position": position, "data": fd, "box": part_box(m), "volume": volume(m),
               "tipY": ymax, "tipZ": [min(v[2] for v in tip), max(v[2] for v in tip)],
               "zmax": max(v[2] for v in vs), "zmin": min(v[2] for v in vs)}
        res["flat"] = flat(m)
        res["file"] = save_close(sw, m, "flange-%d-%s" % (angle, ref))
        return res
    except Exception:
        close_unsaved(sw, m)
        raise


if __name__ == "__main__":
    sw = sw_app()
    out = []
    angles = [int(a) for a in sys.argv[1:]] or [90, 120, 135]
    for angle in angles:
        for ref in ("outer", "tangent"):
            r = build(sw, angle, ref)
            print(angle, ref, r["tipY"], r["tipZ"], r["volume"], r["flat"]["size"], flush=True)
            out.append(r)
    dump("flange", out)
