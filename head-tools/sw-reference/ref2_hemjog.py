"""Section 2b of the second SolidWorks reference (lane swref, 2026-11-02): hems and jogs beyond the first pass.

Hems: Tear Drop and Rolled on the z = 2 edge of a 4 x 2 base flange: every vertex of the section at x = 0, every cylinder
face (radius, centre in (y, z), angular span from its vertices), flat, volume. Angles and radii up to where SolidWorks
stops. Jogs: dimension position, Jog Position, angle and offset over the 16 ga and 11 ga cases, plus the smallest offset.

    python ref2_hemjog.py [ids] [--force]     then   python ref2_hemjog.py --table
"""
import json
import math
import sys

from ref2 import *  # noqa: F401,F403
from ref2_script import record, evaluate, replay_case


def plate(T, R, K, w=4, d=2):
    return 'p.units("in");\np.sheet(%g, %g, %g);\np.sketch("Top").rect(0, -%g, %g, %g).end().baseFlange();\n' % (T, R, K, d, w, d)


def hem_code(T, R, K, kind, ang, rad, pos):
    return plate(T, R, K) + 'p.hem(0.5, [[2, %g, 2]], { hemType: "%s", hemPosition: "%s", hemAngle: %g, hemRadius: %g });\n' % (T, kind, pos, ang, rad)


def jog_code(T, R, K, off, A, pos, ref, x=3):
    return plate(T, R, K) + 'p.sketch("Top", %g).line(%g, 0, %g, -2).jog(%g, { fixed: [1, %g, 1], angle: %g, position: "%s", offsetRef: "%s", reverse: true });\n' % (T, x, x, off, T, A, pos, ref)


def cases():
    out = []
    for T, R, K, lab in ((0.0598, 0.0598, 0.5, "16"), (0.1196, 0.1196, 0.71, "11")):
        for pos in ("inside", "outside"):
            for ang in (180, 200, 225, 250, 260, 265, 268, 270):
                out.append({"id": "tear_%s_%s_A%d_RT" % (lab, pos, ang), "code": hem_code(T, R, K, "teardrop", ang, T, pos)})
            for ang in (200, 250, 270):
                out.append({"id": "tear_%s_%s_A%d_R2T" % (lab, pos, ang), "code": hem_code(T, R, K, "teardrop", ang, 2 * T, pos)})
                out.append({"id": "tear_%s_%s_A%d_R0.5T" % (lab, pos, ang), "code": hem_code(T, R, K, "teardrop", ang, T / 2, pos)})
            for ang in (45, 90, 135, 180, 200, 225, 250, 270, 300, 330):
                out.append({"id": "roll_%s_%s_A%d_RT" % (lab, pos, ang), "code": hem_code(T, R, K, "rolled", ang, T, pos)})
            for ang in (180, 270):
                out.append({"id": "roll_%s_%s_A%d_R2T" % (lab, pos, ang), "code": hem_code(T, R, K, "rolled", ang, 2 * T, pos)})
                out.append({"id": "roll_%s_%s_A%d_R0.5T" % (lab, pos, ang), "code": hem_code(T, R, K, "rolled", ang, T / 2, pos)})
    for T, R, K, lab in ((0.0598, 0.0598, 0.5, "16"), (0.1196, 0.1196, 0.71, "11")):
        for A in (90, 60, 45, 120):
            for pos in ("centerline", "inside", "outside", "bendOutside"):
                for ref in ("outside", "inside", "overall"):
                    if A != 90 and ref != "outside":
                        continue
                    out.append({"id": "jog_%s_A%d_%s_%s" % (lab, A, pos, ref), "code": jog_code(T, R, K, 0.5, A, pos, ref)})
    for off in (0.04, 0.08, 0.12, 0.16, 0.2):               # cut from 30 rows: every part costs about 4,000 SolidWorks handles
        for ref in ("outside",):
            out.append({"id": "jogmin_%g_%s" % (off, ref), "code": jog_code(0.0598, 0.0598, 0.5, off, 90, "centerline", ref)})
    return out


def after(rp):
    c = rp.c
    vs, cyl = [], []
    for b in c.bodies():
        for v in items(val(b, "GetVertices")):
            p = val(v, "GetPoint")
            vs.append([p[0] / IN, p[1] / IN + c.yshift, p[2] / IN])
        for fc in items(val(b, "GetFaces")):
            s = val(fc, "GetSurface")
            if val(s, "IsCylinder"):
                q = s.CylinderParams
                cyl.append({"axis": [round(x, 6) for x in q[3:6]], "c": [q[0] / IN, q[1] / IN + c.yshift, q[2] / IN], "r": q[6] / IN, "area": val(fc, "GetArea") / IN ** 2})
    sect = sorted({(round(v[1], 6), round(v[2], 6)) for v in vs if abs(v[0]) < 1e-6})
    x_far = max(v[0] for v in vs)
    return {"section": sect, "cyl": cyl, "xmax": x_far, "xmin": min(v[0] for v in vs), "verts": vs if len(vs) < 60 else None}


def run():
    cs = cases()
    chains = record(cs)
    anvil = evaluate([{"id": q["id"], "code": q["code"], "verts": True} for q in cs])

    def mk(q):
        def fn(ses):
            r = replay_case(ses, chains[q["id"]], None, save=False, after=after)
            r["code"] = q["code"]
            r["anvil"] = anvil[q["id"]]
            return r
        return fn
    run_cases("hemjog", {q["id"]: mk(q) for q in cs}, pause=0.1)


def table():
    for k, r in load_all("hemjog").items():
        a = r.get("anvil", {})
        if "exception" in r:
            print(k, "EXC", r["exception"][:140])
            continue
        fs = sorted((r.get("flat") or {}).get("size", [0, 0]), reverse=True)
        af = sorted((a.get("flat") or {}).get("size", [0, 0]), reverse=True)
        ms = [m[:110] for x in r.get("log", []) for m in x["messages"] if "Rebuild Errors" not in m][:1]
        built = r.get("built")
        print("%-34s %s v %.6f flat %.6f bb %s | A %s v %.6f flat %.6f bb %s %s %s" % (
            k, "ok " if built else "REF", r.get("volume") or 0, fs[0] if fs[0] != 4 else fs[1], [round(v, 4) for v in r.get("bbox", [])[1:6]],
            "ok " if not a.get("errors") else "REF", a.get("volume") or 0, af[0] if af[0] != 4 else af[1], [round(v, 4) for v in (a.get("bbox") or [])[1:6]], ms, [e[:70] for e in a.get("errors", [])]))


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
