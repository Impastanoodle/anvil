"""Section 3 of the second SolidWorks reference (lane swref, 2026-11-02): the sheet-metal rows of rfFT and rfGA replayed
in SolidWorks: volume, bbox, flat size.

    python ref2_corpus.py [ids] [--force]     then   python ref2_corpus.py --table
"""
import json
import os
import sys

from ref2 import *  # noqa: F401,F403
from ref2_script import record, evaluate, replay_case, anvil_tool, SCRATCH


# SolidWorks-only choices (which way a hem folds from a mid-thickness pick, ...)
T = 0.0598
R = 0.0598
OVER = {"M06": {"hemShift": [0, 0, T / 2]}, "M22": {"hemShift": [0, 0, 0.0625]}, "G41": {"hemShift": [0, 0, T / 2]},
        "M13": {"fixed": [3, T, 2]}, "G43": {"fixed": [5, T, 0.2]},
        "G47": {"extraFaces": [[4 - T / 2, 0.6, R + T], [4 - R - T, 0.6, 3 - T / 2]]},
        "M19": {"pick": {"3,0.0598,4": [3, 0, 4]}},
        "M23": {"pick": {"3,1.5,0.0299": [3, 1.5, 0], "3,1.5,1.9701": [3, 1.5, 2]}}}
# M20's flanges have no lengthRef, Anvil's "wall": SolidWorks refuses Tangent under 90°, so both sides use Outer Virtual Sharp
EDIT = {"M20": [("{ angle: 45 }", '{ angle: 45, position: "inside", lengthRef: "outer" }'), ("{ angle: 120 }", '{ angle: 120, position: "inside", lengthRef: "outer" }')],
        # SolidWorks takes a miter profile at the free end of the edge chain, not at a corner in the plane of the next edge
        # and refuses gap 0 ("The miter flanges interfere with each other"), so both sides run gap 0.01
        "M12": [('p.sketch("Right").line(0, 0.06, 0, 1.06).end();', 'p.sketch("Front", 2).line(0, 0.06, 0, 1.06).end();'), ('], {});', '], { miterGap: 0.01 });')],
        "G38": [('p.sketch("Right").line(0, 0.0598, 0, 1.0598).end();', 'p.sketch("Right", 4).line(0, 0.0598, 0, 1.0598).end();'), ('], {});', '], { miterGap: 0.01 });')]}


def corpus():
    os.makedirs(SCRATCH, exist_ok=True)
    out = []
    for tbl, pat in (("rfFT", "^M"), ("rfGA", "^G(38|4[0-7])$")):
        p = os.path.join(SCRATCH, tbl + ".json")
        anvil_tool("table", tbl, pat, p)
        with open(p) as fh:
            out += json.load(fh)
    for q in out:
        for a, b in EDIT.get(q["id"], []):
            q["code"] = q["code"].replace(a, b)
    return out


def corner_dump(rp):
    from ref2_corners import dump_faces
    return {"faces_near": dump_faces(rp.c, lambda v: v[0] > 5.5 and v[2] > 3.5)}


CORNER = {"M03": corner_dump, "M24": corner_dump}


def run():
    cases = corpus()
    chains = record(cases)
    anvil = evaluate(cases)

    def mk(q):
        def fn(ses):
            r = replay_case(ses, chains[q["id"]], "corpus-" + q["id"], over=OVER.get(q["id"]), after=CORNER.get(q["id"]))
            r["desc"] = q["d"]
            r["code"] = q["code"]
            r["anvil"] = anvil[q["id"]]
            return r
        return fn
    run_cases("corpus", {q["id"]: mk(q) for q in cases})


def table():
    for k, r in load_all("corpus").items():
        a = r.get("anvil", {})
        f, af = r.get("flat") or {}, a.get("flat") or {}
        if "exception" in r:
            print(k, "EXC", r["exception"][:150])
            continue
        bad = [(x["op"], x["built"], [m[:90] for m in x["messages"]], x.get("exception", "")[:90]) for x in r["log"] if not x["built"]]
        print(k, "SW v %.6f bb %s flat %s fv %s | A v %.6f bb %s flat %s areaT %s %s" % (
            r.get("volume") or 0, [round(v, 4) for v in r.get("bbox", [])], [round(v, 4) for v in f.get("size", [])[:2]], round(f.get("volume", 0), 6),
            a.get("volume") or 0, [round(v, 4) for v in a.get("bbox") or []], af.get("size"), af.get("areaT"), bad or ""))


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
