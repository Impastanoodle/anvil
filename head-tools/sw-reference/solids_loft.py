"""Sections of SolidWorks' loft (lane FH2, 2026-10-29): how SolidWorks joins a 2 x 2 square (Top, y = 0) to a r 1
circle 2 above (no start / end constraints), so Anvil's loft can blend the same way.

For each height h the loft is rebuilt, everything above y = h cut away (Cut-Extrude Through All from a plane at h),
and the volume below h and the outline of the cut face (points every few degrees) are read.

    python head-tools/sw-reference/solids_loft.py
Writes OUT/loft-sections.json and prints a summary.
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swref import sw_app, new_part, IN  # noqa: E402
from sw_com import val, items  # noqa: E402
import solids_ref as R  # noqa: E402


def outline(model, h):
    """Points of the planar face at y = h (the cut face), from its edges' curves."""
    pts = []
    for b in R.bodies(model):
        for fc in items(val(b, "GetFaces")):
            s = val(fc, "GetSurface")
            if not val(s, "IsPlane"):
                continue
            p = s.PlaneParams
            if abs(p[1]) < 0.999 or abs(p[4] - h * IN) > 1e-7:
                continue
            for e in items(val(fc, "GetEdges")):
                c = val(e, "GetCurve")
                cp = val(e, "GetCurveParams3")
                t0, t1 = cp.UMinValue, cp.UMaxValue
                for k in range(65):
                    q = c.Evaluate2(t0 + (t1 - t0) * k / 64, 0)
                    pts.append([q[0] / IN, q[2] / IN])
    return pts


def main():
    sw = sw_app()
    out = {}
    for h in (0.25, 0.5, 1.0, 1.5, 1.75):
        model = new_part(sw)
        R.CUR[0] = model
        try:
            R.p11(model)
            s = R.sketch_on(model, R.top_at(model, h), lambda sm: R.crect(sm, 0, 0, 6, 6))
            m = None
            for flip in (True, False):       # Through All from the plane: keep the side below h
                try:
                    R.extrude(model, s, 0, cut=True, through=True, flip=flip)
                except RuntimeError:
                    continue
                m = R.measure(model)
                if m["bbox"][4] < h + 1e-6:
                    break
                model.EditUndo2(1)
                m = None
            if m is None:
                raise RuntimeError("cut at %s failed" % h)
            pts = outline(model, h)
            out[str(h)] = {"volume": m["volume"], "pts": pts}
            rs = [math.hypot(*p) for p in pts]
            print(h, "V below", round(m["volume"], 6), "n", len(pts), "r min/max", round(min(rs), 5), round(max(rs), 5))
        finally:
            sw.CloseDoc(val(model, "GetTitle"))
    with open(os.path.join(R.OUT, "loft-sections.json"), "w") as fh:
        json.dump(out, fh)


if __name__ == "__main__":
    main()
