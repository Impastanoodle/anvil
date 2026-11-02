"""Section 1b of the second SolidWorks reference (lane swref, 2026-11-02): one or two real stacks per distinct refusal message
of the fuzz (rfFTfuzz, rfGAfuzz, compare.js --fuzz), replayed in SolidWorks feature by feature.

    python ref2_fuzz.py [ids] [--force]     then   python ref2_fuzz.py --table
"""
import json
import os
import sys

from ref2 import *  # noqa: F401,F403
from ref2_script import record, evaluate, replay_case, anvil_tool, SCRATCH

# (key, table, kind, seed)
STACKS = [
    ("round_edge_fillet", "rfFT", "round", 104), ("round_edge_fillet", "rfFT", "round", 136),
    ("cut_miss", "rfGA", "stack", 7), ("cut_miss", "rfGA", "stack", 244),
    ("round_edge_chamfer", "rfGA", "stack", 82), ("round_edge_chamfer", "rfFT", "round", 198),
    ("no_edges_fillet", "rfFT", "round", 38), ("no_edges_fillet", "rfFT", "round", 19),
    ("closed_corner_no_face", "rfFT", "sheet", 40), ("closed_corner_no_face", "rfFT", "sheet", 264),
    ("fillet_too_large", "rfFT", "round", 55), ("fillet_too_large", "rfFT", "round", 388),
    ("draft_tangent", "rfGA", "stack", 224), ("draft_tangent", "rfGA", "stack", 114),
    ("hems_cross", "rfFT", "sheet", 56), ("hems_cross", "rfFT", "sheet", 380),
    ("zero_thickness", "rfGA", "stack", 241), ("zero_thickness", "rfGA", "stack", 189),
    ("chamfer_too_large", "rfFT", "round", 303), ("chamfer_too_large", "rfFT", "round", 82),
    ("shell_over_round", "rfGA", "stack", 183), ("shell_over_round", "rfGA", "stack", 147),
    ("no_edges_chamfer", "rfFT", "round", 146), ("no_edges_chamfer", "rfFT", "round", 138),
    ("rib_not_meeting", "rfGA", "stack", 93), ("rib_not_meeting", "rfGA", "stack", 140),
    ("shell_nothing_hollow", "rfGA", "stack", 132), ("shell_nothing_hollow", "rfGA", "stack", 165),
    ("shell_wall_offset", "rfGA", "stack", 52), ("shell_wall_offset", "rfGA", "stack", 106),
    ("flange_too_short", "rfFT", "sheet", 312), ("flange_too_short", "rfFT", "sheet", 194),
    ("fillet_could_not_close", "rfFT", "round", 160),
    ("neutral_face_gone", "rfGA", "stack", 75), ("face_to_remove_gone", "rfGA", "stack", 80), ("rib_not_facing", "rfGA", "stack", 86),
]


def scripts():
    os.makedirs(SCRATCH, exist_ok=True)
    out = []
    for key, tbl, kind, seed in STACKS:
        p = os.path.join(SCRATCH, "fz.json")
        anvil_tool("fuzz", tbl, kind, str(seed), p)
        with open(p) as fh:
            q = json.load(fh)
        out.append({"id": "%s_%s_%d" % (key, tbl, seed), "key": key, "tbl": tbl, "kind": kind, "seed": seed, "code": q["code"], "ops": q["ops"]})
    return out


def run():
    cs = scripts()
    chains = record(cs)
    anvil = evaluate(cs)

    def mk(q):
        def fn(ses):
            r = replay_case(ses, chains[q["id"]], "fuzz-" + q["id"])
            r["code"] = q["code"]
            r["ops"] = q["ops"]
            r["key"] = q["key"]
            r["anvil"] = anvil[q["id"]]
            return r
        return fn
    run_cases("fuzz", {q["id"]: mk(q) for q in cs})


def table():
    for k, r in load_all("fuzz").items():
        a = r.get("anvil", {})
        print(k)
        if "exception" in r:
            print("   SW EXC", r["exception"][:200])
            print("   A vol %s errors %s" % (a.get("volume"), [e[:100] for e in a.get("errors", [])]))
            continue
        print("   ops:", " ".join(("%s%s" % (x["op"], "" if x["built"] else "!")) for x in r["log"]))
        for x in r["log"]:
            if not x["built"]:
                print("   SW refused %s: %s %s" % (x["op"], [m[:130] for m in x["messages"] if "Rebuild Errors" not in m][:1], x.get("exception", "")[:120]))
        print("   SW v %.6f bodies %s faults %s | A v %s bodies %s errors %s" % (r.get("volume") or 0, r.get("bodies"), r.get("faults"), a.get("volume"), a.get("bodies"), [e[:100] for e in a.get("errors", [])]))


if __name__ == "__main__":
    if "--table" in sys.argv:
        table()
    else:
        run()
