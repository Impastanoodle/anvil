"""Item 10 again with a real corner rectangle: Fully Define Sketch with dimensions only (what Anvil's Autodimension does), baseline and
chain, a rectangle, a circle and a straight slot, datum at the origin. One part. Raw JSON: OUT\\auto.json.
"""
from ref3_core import *  # noqa: F401,F403
from ref3_sketch import seg_rows


def dims_of(sk):
    out = []
    dd = val(sk, "GetFirstDisplayDimension")
    while dd is not None:
        d = dd.GetDimension2(0)
        ann = val(dd, "GetAnnotation")
        ents = []
        try:
            for e in items(ann.GetAttachedEntityTypes()):
                ents.append(e)
        except Exception as ex:  # noqa: BLE001
            ents = "err " + str(ex)[:60]
        out.append({"type": val(dd, "GetType"), "name": val(d, "FullName").split("@")[0], "value": val(d, "Value"), "ents": ents})
        dd = sk.GetNextDisplayDimension(dd)
    return out


def main():
    ses = Ses()
    c = Ctx(ses)
    m, sm = c.m, c.m.SketchManager
    res = {}
    try:
        for key, scheme in (("baseline", 1), ("chain", 0)):
            def draw(s):
                sm.CreateCornerRectangle(0, 0, 0, 4 * IN, 3 * IN, 0)
                s.circle(1, 1, 0.25)
                res[key + "_slot"] = sm.CreateSketchSlot(0, 0, 0.5 * IN, 2.5 * IN, 1 * IN, 0, 3.5 * IN, 1 * IN, 0, 0, 0, 0, 1, False) is not None
            sk = c.sketch(c.plane("Front"), draw)
            m.ClearSelection2(True)
            c.sel(sk, False, 0)
            m.EditSketch()
            act = val(m, "GetActiveSketch2")
            before = val(act, "GetConstrainedStatus")
            m.ClearSelection2(True)
            m.Extension.SelectByID2("Point1@Origin", "EXTSKETCHPOINT", 0, 0, 0, False, 6, nothing(), 0)
            st = sm.FullyDefineSketch(True, False, 0, True, scheme, nothing(), scheme, nothing(), 1, 1)
            after = val(act, "GetConstrainedStatus")
            msgs = ses.new_messages()
            m.ClearSelection2(True)
            sm.InsertSketch(True)
            res[key] = {"status": st, "before": before, "after": after, "messages": msgs, "dims": dims_of(val(sk, "GetSpecificFeature2") if False else sk)}
            dump("auto", res)
    finally:
        dump("auto", res)
        ses.close(m)
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


if __name__ == "__main__":
    main()
