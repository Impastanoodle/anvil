"""Section 2a of the second SolidWorks reference (lane swref, 2026-11-02): bend numbers beyond 16 ga K 0.5.

One part per row: a 4 x 2 base flange (x 0..4, z 0..2) with one 1 in edge flange on the z = 2 edge. Gauges 20, 16, 14, 11 and
3/16 plate; K 0.33, 0.5, 0.64, 0.71; R = T and R = 3T; 30, 45, 90, 120, 135 degrees, Material Inside, Outer Virtual Sharp.
A second, smaller grid runs Material Outside, Bend Outside and the Inner Virtual Sharp length. Parts are not saved (a
hundred-odd one-feature parts tell nothing a row does not); the JSON row holds the flat, the volume and the tip.

    python ref2_sweep.py [ids] [--force]     then   python ref2_sweep.py --table
"""
import json
import math
import os
import sys

from ref2 import *  # noqa: F401,F403
from ref2 import LIMIT_PRIVATE, LIMIT_HANDLES, GUARD_EXIT, sw_load
import ref2_sheet as SH
from ref2_script import record, evaluate, Replay

GAUGES = {"20ga": 0.0359, "16ga": 0.0598, "14ga": 0.0747, "11ga": 0.1196, "3-16": 0.1875}
KS = (0.33, 0.5, 0.64, 0.71)
ANGLES = (30, 45, 90, 120, 135)


def code(T, R, K, A, pos="inside", ref="outer"):
    return ('p.units("in");\np.sheet(%g, %g, %g);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n'
            'p.flange(1, [[2, %g, 2]], { angle: %g, position: "%s", lengthRef: "%s" });\n') % (T, R, K, T, A, pos, ref)


# Most valuable first: a guard stop then loses the least. One document per (gauge, radius, K): SolidWorks ignores a K edited on a
# made part (every row read K 0.33 on 2026-11-02, so that run was thrown away), but angle and position edits reproduce lane DO's
# values exactly. Per row: edit 77 handles, flat about 1,190, full measure 660; so rows skip the full measure and the vertex walk.
GROUPS = [("16ga", "RT", 0.5), ("11ga", "RT", 0.71), ("16ga", "RT", 0.71), ("20ga", "RT", 0.5), ("3-16", "RT", 0.71), ("14ga", "RT", 0.5),
          ("11ga", "R3T", 0.5), ("20ga", "R3T", 0.5), ("16ga", "RT", 0.33), ("16ga", "RT", 0.64), ("11ga", "RT", 0.5), ("3-16", "RT", 0.5),
          ("14ga", "RT", 0.71), ("20ga", "RT", 0.71), ("16ga", "R3T", 0.5), ("14ga", "R3T", 0.5), ("3-16", "R3T", 0.5), ("11ga", "RT", 0.33), ("11ga", "RT", 0.64)]


def cases():
    out = []
    for g, rn, K in GROUPS:
        T = GAUGES[g]
        R = T if rn == "RT" else round(3 * T, 6)
        for A in ANGLES:
            out.append({"id": "%s_%s_K%g_A%d" % (g, rn, K, A), "code": code(T, R, K, A), "T": T, "R": R, "K": K, "A": A, "pos": "inside", "ref": "outer"})
        if (g, rn, K) == ("16ga", "RT", 0.5):
            for A in ANGLES:
                for pos, ref in (("outside", "outer"), ("bendOutside", "outer")):
                    out.append({"id": "%s_%s_K%g_A%d_%s_%s" % (g, rn, K, A, pos, ref), "code": code(T, T, K, A, pos, ref), "T": T, "R": T, "K": K, "A": A, "pos": pos, "ref": ref})
    return out


def after(rp):
    """The wall's top corners: vertices at the part's highest y (Anvil frame)."""
    c = rp.c
    vs = []
    for b in c.bodies():
        for v in items(val(b, "GetVertices")):
            p = val(v, "GetPoint")
            vs.append([p[0] / IN, p[1] / IN + c.yshift, p[2] / IN])
    ymax = max(v[1] for v in vs)
    zs = sorted({round(v[2], 7) for v in vs if v[1] > ymax - 1e-7})
    far = max(vs, key=lambda v: v[2])
    # the second tip corner may sit lower than ymax on a slanted wall: every vertex with x = 0 past the base's end
    sect = sorted({(round(v[1], 7), round(v[2], 7)) for v in vs if abs(v[0]) < 1e-7 or abs(v[0] - 4) < 1e-7})
    return {"tip": {"ymax": ymax, "zAtTop": zs, "zmax": c.extreme([0, 0, 1])[2], "zmin": c.extreme([0, 0, -1])[2]}, "section": sect}


def edit_row(rp, q):
    """Change the one part in place: angle, position and length on the flange. K is fixed per document."""
    c, m = rp.c, rp.m
    f = rp.flange
    d = val(f, "GetDefinition")
    d.AccessSelections(m, nothing())
    d.BendAngle = math.radians(q["A"])
    d.PositionType = SH.FLANGE_POS[q["pos"]]
    d.OffsetType = 1
    d.OffsetDimType = SH.FLANGE_DIM[q["ref"]]
    d.OffsetDistance = 1.0 * IN
    ok = f.ModifyDefinition(d, m, nothing())
    m.ForceRebuild3(False)
    wrong = [w for w in c.whats_wrong() if not w[2]]
    return bool(ok) and not wrong, wrong


def run_group(ses, rows, chains, anvil):
    """One document for one (T, R): every row of it is an edit, because a new document leaks about 4,000 handles."""
    rp = Replay(ses, chains[rows[0]["id"]])
    rp.run()
    rp.flange = rp.last_feat
    try:
        for q in rows:
            load = sw_load()
            if load and (load[0] >= LIMIT_PRIVATE or load[1] >= LIMIT_HANDLES):
                print("GUARD STOP before sweep %s: SLDWORKS %.1f GB private, %d handles; rerun to resume" % (q["id"], load[0] / 1e9, load[1]), flush=True)
                ses.close(rp.m)
                sys.exit(GUARD_EXIT)
            ok, wrong = edit_row(rp, q)
            msgs = [x.strip() for x in ses.new_messages()]
            r = {"log": [{"op": "flange", "built": ok, "messages": msgs}], "built": ok}
            if ok:
                c = rp.c
                r["volume"] = val(rp.m, "GetMassProperties")[3] / IN ** 3
                r["tip"] = {"ymax": c.extreme([0, 1, 0])[1], "zmax": c.extreme([0, 0, 1])[2], "zmin": c.extreme([0, 0, -1])[2]}
                r["flat"] = SH.flat_light(rp)
            r["spec"] = {k: q[k] for k in ("T", "R", "K", "A", "pos", "ref")}
            a = dict(anvil[q["id"]])
            a.pop("verts", None)
            r["anvil"] = a
            r["code"] = q["code"]
            r["sameDocument"] = True
            with open(json_path("sweep", q["id"]), "w") as fh:
                json.dump(r9(r), fh, indent=1)
            print(q["id"], ok, r.get("volume"), (r.get("flat") or {}).get("size"), flush=True)
    except Exception:
        ses.close(rp.m)
        raise
    ses.close(rp.m)


def run():
    only = [a for a in sys.argv[1:] if not a.startswith("--")]
    cs = cases()
    chains = record(cs)
    anvil = evaluate([{"id": q["id"], "code": q["code"], "verts": True} for q in cs])
    groups = {}
    for q in cs:
        if os.path.exists(json_path("sweep", q["id"])) or (only and not any(q["id"].startswith(w) for w in only)):
            continue
        groups.setdefault((q["T"], q["R"], q["K"]), []).append(q)
    ses = Session()
    for key, rows in groups.items():
        load = sw_load()
        if load and (load[0] >= LIMIT_PRIVATE or load[1] >= LIMIT_HANDLES):
            print("GUARD STOP before sweep group %s: SLDWORKS %.1f GB private, %d handles; rerun to resume" % (key, load[0] / 1e9, load[1]), flush=True)
            sys.exit(GUARD_EXIT)
        try:
            run_group(ses, rows, chains, anvil)
        except Exception as e:  # noqa: BLE001
            if ses.alive():
                print("group", key, "failed:", str(e)[:200], flush=True)
                for t in list(ses.mine):
                    ses.close_title(t)
                continue
            print("COM connection dropped: waiting for SolidWorks", flush=True)
            ses = Session()
            print("reconnected; open documents, left alone:", sorted(ses.pre), "rerun to finish group", key, flush=True)
    print("sweep pass done; open documents now:", ses.titles(), flush=True)


def table():
    n, bad = 0, []
    for k, r in load_all("sweep").items():
        n += 1
        a = r.get("anvil", {})
        if "exception" in r or not r.get("flat"):
            bad.append((k, "SW failed", r.get("exception", "")[:80], [m[:80] for x in r.get("log", []) for m in x["messages"]][:2], "Anvil", a.get("errors")))
            continue
        d = (a.get("flat") or {}).get("size", [0, 0])
        L = max(d)
        dl = L - r["flat"]["size"][1] if len(r["flat"]["size"]) > 1 and False else None
        fl = sorted(r["flat"]["size"], reverse=True)
        al = sorted(d, reverse=True)
        off = max(abs(fl[0] - al[0]), abs(fl[1] - al[1]))
        dv = (a.get("volume") or 0) - r["volume"]
        if off > 1e-4 or abs(dv) > 1e-5 * r["volume"]:
            bad.append((k, "flat SW %.6f A %.6f d %+.6f" % (fl[0] if fl[0] != 4 else fl[1], al[0] if al[0] != 4 else al[1], off), "vol %+.2e" % (dv / r["volume"])))
    print(n, "rows,", len(bad), "off")
    for b in bad:
        print(b)


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
