"""Section 4 of the second SolidWorks reference (lane swref, 2026-11-02): lofts S28, S29 (rfFT), G17, G18 (rfGA).

Each loft is built whole (volume, area, faces) and once per height h with everything above h cut away: volume below h, the
outline of the cut face. The same on Anvil, whose section is the cut body's vertices at y = h.

    python ref2_loft.py [ids] [--force]     then   python ref2_loft.py --table
"""
import json
import math
import os
import sys

from ref2 import *  # noqa: F401,F403
from ref2_script import record, evaluate, replay_case, anvil_tool, SCRATCH

U = 'p.units("in");\n'
PARTS = {
    "S28": ('var a = p.sketch("Top").centerRect(0, 0, 3, 2).id();\nvar b = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b]);\n', (0.25, 0.625, 1.25, 1.875, 2.25)),
    "S29": ('var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 1).polygon(0, 0, 1.1, 8, 22.5).id();\nvar c = p.sketch("Top", 2.5).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', (0.25, 0.5, 0.75, 1, 1.375, 1.75, 2.125)),
    "G17": ('var a = p.sketch("Top").centerRect(0, 0, 3, 3).id();\nvar b = p.sketch("Top", 3).circle(0, 0, 1).id();\np.loft([a, b]);\n', (0.5, 1, 1.5, 2, 2.5)),
    "G18": ('var a = p.sketch("Top").circle(0, 0, 1.5).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).circle(0, 0, 0.75).id();\np.loft([a, b, c]);\n', (0.375, 0.75, 1.125, 1.5, 1.875, 2.25, 2.625)),
    # the two-section square-to-circle is the case lane FH2 measured (P11): keep it as a control
    "P11": ('var a = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar b = p.sketch("Top", 2).circle(0, 0, 1).id();\np.loft([a, b]);\n', (0.5, 1, 1.5)),
    # the same as S28 through the stub of a mid-section: what SolidWorks does for square to square (ruled?) in three sections
    "L1": ('var a = p.sketch("Top").centerRect(0, 0, 4, 4).id();\nvar b = p.sketch("Top", 1.5).centerRect(0, 0, 2, 2).id();\nvar c = p.sketch("Top", 3).centerRect(0, 0, 4, 4).id();\np.loft([a, b, c]);\n', (0.375, 0.75, 1.125, 1.5, 2.25)),
}
CUT = 'p.sketch("Top", %g).centerRect(0, 0, 12, 12).end().cut("through", { reverse: false });\n'


def outline(rp, h):
    """Points of the planar face at y = h, from its edges' curves."""
    pts = []
    for b in rp.c.bodies():
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


def run():
    cs = []
    for k, (code, hs) in PARTS.items():
        cs.append({"id": k, "code": U + code})
        for h in hs:
            cs.append({"id": "%s_h%g" % (k, h), "code": U + code + CUT % h, "h": h, "verts": True})
    chains = record(cs)
    anvil = evaluate(cs)

    def mk(q):
        def fn(ses):
            h = q.get("h")
            r = replay_case(ses, chains[q["id"]], "loft-" + q["id"], save=h is None, after=(lambda rp: {"pts": outline(rp, h)}) if h else None)
            r["anvil"] = anvil[q["id"]]
            r["h"] = h
            r["code"] = q["code"]
            return r
        return fn
    run_cases("loft", {q["id"]: mk(q) for q in cs})


def polar(pts):
    s = sorted((math.atan2(p[1], p[0]), math.hypot(p[0], p[1])) for p in pts)
    return s


def r_at(s, th):
    best = None
    n = len(s)
    for i in range(n):
        a0, r0 = s[i]
        a1, r1 = s[(i + 1) % n]
        if i == n - 1:
            a1 += 2 * math.pi
        for t in (th, th + 2 * math.pi):
            if a0 <= t <= a1 and a1 > a0:
                # straight between neighbours: radial intersection with the chord
                x0, y0, x1, y1 = r0 * math.cos(a0), r0 * math.sin(a0), r1 * math.cos(a1), r1 * math.sin(a1)
                dx, dy = x1 - x0, y1 - y0
                c, sn = math.cos(t), math.sin(t)
                den = c * dy - sn * dx
                if abs(den) > 1e-12:
                    return (x0 * dy - y0 * dx) / den
                return r0
    return best


def table():
    res = load_all("loft")
    for k, (code, hs) in PARTS.items():
        r = res.get(k)
        if not r:
            continue
        a = r["anvil"]
        print("\n%s SW v %.6f area %.5f faces %s %s | Anvil v %.6f (%+.2e) area %s %s" % (k, r.get("volume", 0), r.get("area", 0), r.get("faces"), r.get("faceTypes"),
                                                                                  a.get("volume"), (a.get("volume") - r.get("volume", 1)) / r.get("volume", 1), a.get("area"), [e[:90] for x in r.get("log", []) for e in x["messages"]]))
        for h in hs:
            q = res.get("%s_h%g" % (k, h))
            if not q:
                continue
            aq = q["anvil"]
            vs = [v for v in aq.get("verts", []) if abs(v[1] - h) < 1e-6]
            sw = polar(q.get("pts", [[1, 0]]))
            an = polar([[v[0], v[2]] for v in vs]) if vs else []
            th = [math.radians(a_) for a_ in (0, 11.25, 22.5, 33.75, 45, 56.25, 67.5, 78.75, 90)]
            rs = [r_at(sw, t) for t in th]
            ra = [r_at(an, t) if an else None for t in th]
            print("  h %-6g V SW %.6f A %.6f (%+.2e) | r SW %s" % (h, q.get("volume", 0), aq.get("volume", 0), (aq.get("volume", 0) - q.get("volume", 1)) / q.get("volume", 1), [round(x, 4) if x else x for x in rs]))
            print("  %s A %s" % (" " * 44, [round(x, 4) if x else x for x in ra]))


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
