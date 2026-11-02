"""Section 5 of the second SolidWorks reference (lane swref, 2026-11-02): what a Hole Wizard callout reads on a drawing.

A 2 x 2 x 1.5 block with blind holes; a new drawing (default template) with a Top view; InsertModelAnnotations3 with
swInsertholeCallout (AddHoleCallout2 is documented to need a click in a dialog, so it is not used). Reads each callout's text.
    python ref2_callout.py
"""
import json
import math
import os

from ref2 import *  # noqa: F401,F403

HOLES = [("blind_9-32", 2, 0, 19, "9/32", 0, 0.75, 0.75, -0.5, -0.5),      # plain hole, fractional drill, blind .750
         ("tap_1-4-20", 4, 0, 27, "1/4-20", 0, 0.75, 0.5, 0.5, 0.5),       # tapped hole
         ("cbore_1-4", 0, 0, 9, "1/4", 1, 0, 0, 0.5, -0.5)]                # counterbore, through


def build(ses):
    c = Ctx(ses)
    m, fm = c.m, c.m.FeatureManager
    sk = c.sketch(c.plane("Top"), lambda s: s.crect(0, 0, 2, 2))
    m.ClearSelection2(True)
    c.sel(sk)
    fm.FeatureExtrusion3(True, False, False, 0, 0, 1.5 * IN, 0, False, False, False, False, 0, 0, False, False, False, False, True, True, True, 0, 0, False)
    out = []
    for name, kind, std, fast, size, end, depth, thread, x, z in HOLES:
        m.ClearSelection2(True)
        m.Extension.SelectByID2("", "FACE", x * IN, 1.5 * IN, z * IN, False, 0, nothing(), 0)
        f = fm.HoleWizard5(kind, std, fast, size, end, -1, depth * IN if depth else -1, -1, thread * IN if thread else -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                           "", False, True, True, True, True, False)
        out.append({"name": name, "made": f is not None, "messages": ses.new_messages()})
        if f is not None:
            d = val(f, "GetDefinition")
            out[-1].update({"dia": d.HoleDiameter / IN, "depth": d.HoleDepth / IN})
    path = ses.save_close(m, "callout-block")
    return path, out


def main():
    ses = Session()
    path, holes = build(ses)
    print(path, holes)
    tpl = ses.sw.GetUserPreferenceStringValue(10)            # swDefaultTemplateDrawing
    print("template", tpl)
    d = ses.sw.NewDocument(tpl, 2, 0.4318, 0.2794)           # swDwgPaperBsize as in the API examples
    if d is None:
        raise RuntimeError("no drawing document")
    t = val(d, "GetTitle")
    ses.mine.add(t)
    res = {"holes": holes, "callouts": []}
    try:
        v = d.CreateDrawViewFromModelView3(path, "*Top", 0.15, 0.15, 0)
        print("view", v is not None)
        d.ClearSelection2(True)
        v.SelectEntity if False else None
        d.Extension.SelectByID2(val(v, "Name"), "DRAWINGVIEW", 0, 0, 0, False, 0, nothing(), 0)
        anns = d.InsertModelAnnotations3(0, 1048576, False, True, False, False)
        print("annotations", len(items(anns)))
        for a in items(anns):
            obj = val(a, "GetSpecificAnnotation")
            row = {"type": val(a, "GetType")}
            try:
                row["isCallout"] = val(obj, "IsHoleCallout")
                for i in range(1, 6):
                    row["text%d" % i] = obj.GetText(i)
                row["full"] = obj.GetNameForSelection if False else None
            except Exception as e:  # noqa: BLE001
                row["error"] = str(e)[:120]
            for i in range(1, 6):
                try:
                    row["ann%d" % i] = a.GetTextAtIndex(i - 1)
                except Exception:  # noqa: BLE001
                    pass
            res["callouts"].append(row)
            print(row)
    finally:
        ses.mine.add(val(d, "GetTitle"))
        ses.close(d)
    with open(json_path("callout", "callout"), "w") as fh:
        json.dump(res, fh, indent=1)
    print(ses.titles())


if __name__ == "__main__":
    main()
