"""Turn sw-holewizard.json (solids_holes.py) into compact per-size rows and print them, so holewizard.js can be
checked / rewritten against SolidWorks (lane FH2). Prints, per standard and size:
  thru-hole diameters by fit [close, normal, loose] for Hole (screw clearance), Counterbore and Countersink, the
  counterbore diameter / depth, the countersink diameter / angle, and the tap drill.
    python head-tools/sw-reference/solids_holes_table.py [--js]
"""
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
D = json.load(open(os.path.join(HERE, "sw-holewizard.json")))
FITS = ("close", "normal", "loose")


def fits(row, key):
    if not row or "error" in row:
        return None
    return [row.get(f, {}).get(key) for f in FITS]


def rows(std):
    hole, cb, ck, tap = (D.get(std + "." + t, {}) for t in ("hole", "cbore", "csk", "tap"))
    sizes = list(hole.keys())
    out = []
    for s in sizes:
        r = {"size": s, "clr": fits(hole.get(s), "HoleDiameter")}
        c = cb.get(s)
        if c and "error" not in c:
            r["cb"] = {"thru": fits(c, "ThruHoleDiameter"), "dia": c["default"]["CounterBoreDiameter"],
                       "depth": c["default"]["CounterBoreDepth"]}
        k = ck.get(s)
        if k and "error" not in k:
            r["csk"] = {"thru": fits(k, "ThruHoleDiameter"), "dia": k["default"]["CounterSinkDiameter"],
                        "angle": k["default"]["CounterSinkAngle"]}
        out.append(r)
    taps = {s: v["default"].get("ThruTapDrillDiameter") for s, v in tap.items() if "error" not in v}
    return out, taps


def js():
    """The compact table rfFH2.js embeds: { ansi: { size: [clr close, normal, loose, cb Ø, cb depth, csk Ø, csk °] },
    ansiTap: { thread: drill }, iso: {...}, isoTap: {...} } (null where SolidWorks has no such hole)."""
    out = {}
    for std in ("ansi", "iso"):
        rs, taps = rows(std)
        t = {}
        for r in rs:
            cb, ck = r.get("cb") or {}, r.get("csk") or {}
            t[r["size"]] = r["clr"] + [cb.get("dia"), cb.get("depth"), ck.get("dia"), ck.get("angle")]
        out[std] = t
        out[std + "Tap"] = taps
    return json.dumps(out, separators=(",", ":"))


if __name__ == "__main__":
    if "--js" in sys.argv:
        print(js())
        sys.exit(0)
    for std in ("ansi", "iso"):
        rs, taps = rows(std)
        print("==", std)
        for r in rs:
            print(json.dumps(r))
        print("taps", json.dumps(taps))
