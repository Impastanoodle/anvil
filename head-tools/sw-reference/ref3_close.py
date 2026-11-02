"""Unchecked item 6 (lane swcheck, 2026-11-02): Close Sketch to Model. There is no API member for it; swCommands_Sk_Close_Contour
(1048) is the only command near it. One part, one try per case. Raw JSON: OUT\\close.json.

    python ref3_close.py on off
"""
import os
import sys
import time

from ref3_core import *  # noqa: F401,F403
from ref3_sketch import seg_rows


def contours(sk):
    out = []
    try:
        for ct in items(val(sk, "GetSketchContours")):
            out.append({"closed": val(ct, "IsClosed"), "segs": len(items(val(ct, "GetSketchSegments")))})
    except Exception as e:  # noqa: BLE001
        out.append("err " + str(e)[:100])
    return out


def trial(c, res, name, y0):
    m, sm = c.m, c.m.SketchManager
    pl = c.plane_at("Top", 1.0)
    m.ClearSelection2(True)
    c.sel(pl, False, 0)
    sm.InsertSketch(True)
    sm.AddToDB = True
    for a, b in (((1, y0), (1, -1.5)), ((1, -1.5), (3, -1.5)), ((3, -1.5), (3, y0))):
        sm.CreateLine(a[0] * IN, a[1] * IN, 0, b[0] * IN, b[1] * IN, 0)
    sm.AddToDB = False
    sk = val(m, "GetActiveSketch2")
    r = {"segs0": len(items(val(sk, "GetSketchSegments"))), "contours0": contours(sk)}
    m.ClearSelection2(True)
    print("running command", name, flush=True)
    r["run"] = bool(m.Extension.RunCommand(1048, ""))
    time.sleep(1)
    r["messages"] = c.ses.new_messages()
    act = val(m, "GetActiveSketch2")
    r["editing"] = act is not None
    if act is not None:
        r["segs1"] = len(items(val(act, "GetSketchSegments")))
        r["contours1"] = contours(act)
    print("after command", r, flush=True)
    r["pmOK"] = bool(m.Extension.RunCommand(-2, ""))
    time.sleep(1)
    r["messages2"] = c.ses.new_messages()
    act = val(m, "GetActiveSketch2")
    if act is not None:
        r["segs2"] = seg_rows(act)
        r["contours2"] = contours(act)
    m.ClearSelection2(True)
    if val(m, "GetActiveSketch2") is not None:
        sm.InsertSketch(True)
    res[name] = r
    dump("close", res)


def main():
    want = sys.argv[1:]
    ses = Ses()
    c = Ctx(ses)
    m, fm = c.m, c.m.FeatureManager
    sk = c.sketch(c.plane("Top"), lambda s: s.rect(0, -3, 4, 3))
    m.ClearSelection2(True)
    c.sel(sk)
    fm.FeatureExtrusion3(True, False, False, 0, 0, 1.0 * IN, 0, False, False, False, False, 0, 0, False, False, False, False, True, True, True, 0, 0, False)
    res = {}
    try:
        for name, y0 in (("on", 0.0), ("off", -0.2)):
            if name in want:
                trial(c, res, name, y0)
    finally:
        dump("close", res)
        ses.sw.CloseDoc(val(m, "GetTitle"))
        ses.mine.discard(val(m, "GetTitle"))
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


if __name__ == "__main__":
    main()
