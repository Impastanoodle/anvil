"""Section 2c of the second SolidWorks reference (lane swref, 2026-11-02): corners and rips.

Closed Corner with the bend region closed (the rfDU 6e-4 fill): every face in the corner with its surface, vertices, area.
Butt Closed on 20 ga R 0.0718. Material Outside Butt. Rip "both" and one-sided gaps on a shelled box, Insert Bends after.
Miter flange at a second gauge / gap, with the flat's top-face vertices.

    python ref2_corners.py [ids] [--force]     then   python ref2_corners.py --table
"""
import json
import sys

from ref2 import *  # noqa: F401,F403
from ref2_script import record, evaluate, replay_case


def plate(T, R, K, w=4, d=2):
    return 'p.units("in");\np.sheet(%g, %g, %g);\np.sketch("Top").rect(0, -%g, %g, %g).end().baseFlange();\n' % (T, R, K, d, w, d)


def tray(T, R, K, pos="inside"):
    o = '{ position: "%s", lengthRef: "outer" }' % pos
    return plate(T, R, K) + 'p.flange(1, [[2, %g, 2]], %s);\np.flange(1, [[4, %g, 1]], %s);\n' % (T, o, T, o)


def corner(T, R, K, kind, closed, pos="inside", gap=0.01, ratio=1):
    if pos == "inside":
        zend = 2 - R - T
    elif pos == "outside":
        zend = 2 - R                 # Material Outside: the x = 4 wall stops at the other wall's bend, R from the base edge
    else:
        zend = 2
    return tray(T, R, K, pos) + 'p.closedCorner([[%g, 0.6, %g]], { cornerType: "%s", gap: %g, ratio: %g%s });\n' % (
        4 - T / 2 if pos == "inside" else 4 + T / 2, zend, kind, gap, ratio, ", closeBend: true" if closed else "")


T16, T20, R20 = 0.0598, 0.0359, 0.0718
BOX = 'p.units("in");\np.sketch("Top").rect(0, 0, 2, 2).end().extrude(1);\np.shell(0.06, [[1, 1, -1]]);\n'
RIPS = '[[2, 0.5, 0], [2, 0.5, -2], [0, 0.5, -2], [0, 0.5, 0]]'
CASES = {
    "tray_16": tray(T16, T16, 0.5),
    "butt_closed_16": corner(T16, T16, 0.5, "butt", True),
    "butt_open_16": corner(T16, T16, 0.5, "butt", False),
    "overlap_closed_16": corner(T16, T16, 0.5, "overlap", True),
    "underlap_closed_16": corner(T16, T16, 0.5, "underlap", True),
    "tray_20_R0718": tray(T20, R20, 0.5),
    "butt_closed_20_R0718": corner(T20, R20, 0.5, "butt", True),
    "butt_open_20_R0718": corner(T20, R20, 0.5, "butt", False),
    "overlap_closed_20_R0718": corner(T20, R20, 0.5, "overlap", True),
    "butt_closed_11_K71": corner(0.1196, 0.1196, 0.71, "butt", True, gap=0.02),
    "butt_closed_16_gap03": corner(T16, T16, 0.5, "butt", True, gap=0.03),
    "tray_16_outside": tray(T16, T16, 0.5, "outside"),
    "butt_open_16_outside": corner(T16, T16, 0.5, "butt", False, "outside"),
    "butt_closed_16_outside": corner(T16, T16, 0.5, "butt", True, "outside"),
    "rip_both_box": BOX + 'p.rip(%s, 0.03);\n' % RIPS,
    "rip_side1_box": BOX + 'p.rip(%s, 0.03, { direction: "side1" });\n' % RIPS,
    "rip_side2_box": BOX + 'p.rip(%s, 0.03, { direction: "side2" });\n' % RIPS,
    "rip_both_box_g01": BOX + 'p.rip(%s, 0.01);\n' % RIPS,
    "ripbends_both_box": BOX + 'p.rip(%s, 0.03);\np.insertBends([1, 0, -1], { radius: 0.06 });\n' % RIPS,
    "ripbends_side1_box": BOX + 'p.rip(%s, 0.03, { direction: "side1" });\np.insertBends([1, 0, -1], { radius: 0.06 });\n' % RIPS,
    "miter_16_gap01": plate(T16, T16, 0.5) + 'p.sketch("Right").line(-2, %g, -2, %g).end();\np.miterFlange([[2, %g, 2], [4, %g, 1]], { position: "inside", miterGap: 0.01, relief: "rect" });\n' % (T16, T16 + 1, T16, T16),
    "miter_11_gap02": plate(0.1196, 0.1196, 0.71) + 'p.sketch("Right").line(-2, 0.1196, -2, 1.1196).end();\np.miterFlange([[2, 0.1196, 2], [4, 0.1196, 1]], { position: "inside", miterGap: 0.02, relief: "rect" });\n',
    "miter_11_gap02_start": plate(0.1196, 0.1196, 0.71) + 'p.sketch("Right").line(-2, 0.1196, -2, 1.1196).end();\np.miterFlange([[2, 0.1196, 2], [4, 0.1196, 1]], { position: "inside", miterGap: 0.02, startOffset: 0.25, relief: "rect" });\n',
    "miter_16_outside": plate(T16, T16, 0.5) + 'p.sketch("Right").line(-2, %g, -2, %g).end();\np.miterFlange([[2, %g, 2], [4, %g, 1]], { position: "outside", miterGap: 0.01, relief: "rect" });\n' % (T16, T16 + 1, T16, T16),
    "miter_16_bendout": plate(T16, T16, 0.5) + 'p.sketch("Right").line(-2, %g, -2, %g).end();\np.miterFlange([[2, %g, 2], [4, %g, 1]], { position: "bendOutside", miterGap: 0.01, relief: "rect" });\n' % (T16, T16 + 1, T16, T16),
}


def dump_faces(c, window):
    out = []
    for b in c.bodies():
        for fc in items(val(b, "GetFaces")):
            vs = []
            for e in items(val(fc, "GetEdges")):
                for get in ("GetStartVertex", "GetEndVertex"):
                    v = val(e, get)
                    if v is not None:
                        p = val(v, "GetPoint")
                        vs.append((round(p[0] / IN, 6), round(p[1] / IN + c.yshift, 6), round(p[2] / IN, 6)))
            vs = sorted(set(vs))
            if not any(window(v) for v in vs):
                continue
            s = val(fc, "GetSurface")
            kind = "plane" if val(s, "IsPlane") else "cyl" if val(s, "IsCylinder") else "cone" if val(s, "IsCone") else "other"
            d = {"kind": kind, "area": val(fc, "GetArea") / IN ** 2, "verts": vs}
            if kind == "plane":
                q = s.PlaneParams
                d["n"] = [round(x, 6) for x in q[:3]]
                d["p"] = [q[3] / IN, q[4] / IN + c.yshift, q[5] / IN]
            elif kind == "cyl":
                q = s.CylinderParams
                d["c"] = [q[0] / IN, q[1] / IN + c.yshift, q[2] / IN]
                d["axis"] = [round(x, 6) for x in q[3:6]]
                d["r"] = q[6] / IN
            elif kind == "cone":
                q = s.ConeParams
                d["cone"] = list(q)
            out.append(d)
    return out


def after(rp):
    c = rp.c
    # the tray corner at (4, 2), or the shelled box's corner at (2, 0)
    return {"faces_near": dump_faces(c, lambda v: (v[0] > 3.6 and v[2] > 1.6) or (abs(v[0] - 2) < 0.3 and abs(v[2]) < 0.3)), "cornerData": getattr(rp, "corner_data", None)}


def run():
    ids = list(CASES)
    cs = [{"id": k, "code": CASES[k], "outline": True, "verts": True} for k in ids]
    chains = record(cs)
    anvil = evaluate(cs)

    def mk(k):
        def fn(ses):
            r = replay_case(ses, chains[k], "corner-" + k, after=after)
            r["code"] = CASES[k]
            r["anvil"] = anvil[k]
            return r
        return fn
    run_cases("corners", {k: mk(k) for k in ids})


def table():
    for k, r in load_all("corners").items():
        a = r.get("anvil", {})
        if "exception" in r:
            print(k, "EXC", r["exception"][:160])
            continue
        f = r.get("flat") or {}
        af = a.get("flat") or {}
        ms = [m[:120] for x in r.get("log", []) for m in x["messages"] if "Rebuild Errors" not in m][:2]
        print("%-26s built %s v %.6f fv %.6f flat %s corner %s %s | A v %s area×T %s flat %s %s" % (k, r.get("built"), r.get("volume") or 0, f.get("volume", 0), [round(x, 5) for x in f.get("size", [])[:2]], r.get("corners"), ms,
                                                                                         a.get("volume"), af.get("areaT"), af.get("size"), [e[:80] for e in a.get("errors", [])]))


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
