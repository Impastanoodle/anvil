"""Unchecked items 7 to 11 (lane swcheck, 2026-11-02): Make Path, Derived Sketch, Create Sketch from Selections, Autodimension,
Rollback, all in one part document. Raw JSON: OUT\\sketch.json.

    python ref3_sketch.py
"""
import math
import os

from ref3_core import *  # noqa: F401,F403

U = IN


def seg_rows(sk):
    out = []
    for s in items(val(sk, "GetSketchSegments")):
        t = s.GetType() if callable(s.GetType) else s.GetType
        row = {"type": t, "cons": val(s, "ConstructionGeometry")}
        try:
            p, q = val(s, "GetStartPoint2"), val(s, "GetEndPoint2")
            row["a"], row["b"] = [p.X / IN, p.Y / IN], [q.X / IN, q.Y / IN]
        except Exception:  # noqa: BLE001
            pass
        out.append(row)
    return out


def rel_rows(sk):
    try:
        rm = val(sk, "RelationManager")
        return [r.GetRelationType() if callable(r.GetRelationType) else r.GetRelationType for r in items(rm.GetRelations(0))]
    except Exception as e:  # noqa: BLE001
        return "err " + str(e)[:100]


def paths(sk):
    out = []
    for p in items(val(sk, "GetSketchPaths")):
        out.append({"segs": val(p, "GetSketchSegmentCount"), "len": val(p, "GetLength") / IN})
    return out


def tree_rows(c):
    out = []
    keep = ("ProfileFeature", "Extrusion", "ICE", "Cut", "RefPlane", "Boss", "BaseBody", "Sketch")
    for f in c.features():
        t = val(f, "GetTypeName2")
        if t in ("ProfileFeature", "Extrusion", "ICE", "Cut") or val(f, "Name").startswith(("Boss", "Cut")):
            out.append([val(f, "Name"), t, bool(val(f, "IsRolledBack"))])
    return out


def path_tests(c, res):
    m, sm = c.m, c.m.SketchManager
    res["paths"] = {}

    def trial(name, draw, pick):
        m.ClearSelection2(True)
        c.sel(c.plane("Front"), False, 0)
        sm.InsertSketch(True)
        sm.AddToDB = True
        segs = draw()
        sm.AddToDB = False
        sk = val(m, "GetActiveSketch2")
        m.ClearSelection2(True)
        ok = True
        for i, k in enumerate(pick):
            ok = segs[k].Select4(i > 0, nothing()) and ok
        r = {"selected": ok, "n": len(pick)}
        try:
            r["made"] = bool(sm.MakeSketchChain())
        except Exception as e:  # noqa: BLE001
            r["made"] = "exception " + str(e)[:100]
        r["paths"] = paths(sk)
        r["messages"] = c.ses.new_messages()
        m.ClearSelection2(True)
        sm.InsertSketch(True)
        res["paths"][name] = r

    def L(*q):
        return [sm.CreateLine(a[0] * U, a[1] * U, 0, b[0] * U, b[1] * U, 0) for a, b in q]

    chain = [((0, 0), (1, 0)), ((1, 0), (2, 1)), ((2, 1), (3, 1))]
    trial("one_of_chain", lambda: L(*chain), [0])
    trial("whole_chain", lambda: L(*chain), [0, 1, 2])
    trial("two_of_chain_gap", lambda: L(*chain), [0, 2])
    trial("branch", lambda: L(*(chain + [((1, 0), (1, -1))])), [0, 1, 3])
    trial("closed", lambda: L(((0, 0), (2, 0)), ((2, 0), (1, 1)), ((1, 1), (0, 0))), [0, 1, 2])


def derived_tests(c, res):
    m, sm = c.m, c.m.SketchManager
    r = res["derived"] = {}
    parent = c.sketch(c.plane("Front"), lambda s: (s.line(2, 0, 3, 1), s.circle(1, 1, 0.5), s.line(3, 1, 4, 1)))
    pname = val(parent, "Name")
    psk = val(parent, "GetSpecificFeature2")
    r["parent"] = seg_rows(psk)
    pl = c.plane_at("Front", 2.0)
    m.ClearSelection2(True)
    c.sel(parent, False, 0)
    c.sel(pl, True, 0)
    try:
        m.DeriveSketch()
    except Exception as e:  # noqa: BLE001
        r["deriveError"] = str(e)[:160]
    act = val(m, "GetActiveSketch2")
    r["editingAfterDerive"] = act is not None
    if act is not None:
        r["derivedName"] = val(val(act, "GetFeature") if False else act, "Name") if False else None
        # can a new entity go in a derived sketch?
        before = len(items(val(act, "GetSketchSegments")))
        sm.AddToDB = True
        try:
            r["newLineInDerived"] = sm.CreateLine(0, 0, 0, 0.5 * U, 0.5 * U, 0) is not None
        except Exception as e:  # noqa: BLE001
            r["newLineInDerived"] = "exception " + str(e)[:100]
        sm.AddToDB = False
        r["segsAfterNewLine"] = [before, len(items(val(act, "GetSketchSegments")))]
        m.ClearSelection2(True)
        sm.InsertSketch(True)
    dfeat = c.feature_of_type("ProfileFeature", last=True)
    r["derivedFeature"] = val(dfeat, "Name")
    dsk = val(dfeat, "GetSpecificFeature2")
    r["isDerived"] = val(dsk, "IsDerived")
    r["derivedSegs"] = seg_rows(dsk)
    r["derivedRels"] = rel_rows(dsk)
    r["status"] = val(dsk, "GetConstrainedStatus")

    def move_parent(x, y):
        m.ClearSelection2(True)
        c.sel(parent, False, 0)
        sm.InsertSketch(False) if False else m.EditSketch()
        act2 = val(m, "GetActiveSketch2")
        s0 = items(val(act2, "GetSketchSegments"))[0]
        p = val(s0, "GetEndPoint2")
        ok = p.SetCoords(x * U, y * U, 0)
        m.ClearSelection2(True)
        sm.InsertSketch(True)
        m.ForceRebuild3(False)
        return ok

    r["moveParent1"] = move_parent(3.5, 1.5)
    r["parentAfter"] = seg_rows(val(parent, "GetSpecificFeature2"))
    r["derivedAfterMove"] = seg_rows(val(dfeat, "GetSpecificFeature2"))
    # a derived sketch's own location: move one of its points by a point edit
    m.ClearSelection2(True)
    c.sel(dfeat, False, 0)
    m.UnderiveSketch()
    m.ForceRebuild3(False)
    dsk = val(dfeat, "GetSpecificFeature2")
    r["underive"] = {"isDerived": val(dsk, "IsDerived"), "segs": seg_rows(dsk), "rels": rel_rows(dsk), "status": val(dsk, "GetConstrainedStatus"), "messages": c.ses.new_messages()}
    r["moveParent2"] = move_parent(2.5, 1.5)
    r["parentAfter2"] = seg_rows(val(parent, "GetSpecificFeature2"))
    r["derivedAfterUnderive"] = seg_rows(val(dfeat, "GetSpecificFeature2"))


def from_selections(c, res):
    m, sm = c.m, c.m.SketchManager
    r = res["fromSelections"] = {}
    sk = c.sketch(c.plane("Front"), lambda s: (s.line(0, 0, 1, 0), s.line(1, 0, 1, 1), s.line(1, 1, 3, 1), s.circle(5, 5, 0.5)))
    n0 = [val(f, "Name") for f in c.features() if val(f, "GetTypeName2") == "ProfileFeature"]
    m.ClearSelection2(True)
    c.sel(sk, False, 0)
    m.EditSketch()
    act = val(m, "GetActiveSketch2")
    segs = items(val(act, "GetSketchSegments"))
    m.ClearSelection2(True)
    segs[0].Select4(False, nothing())
    segs[1].Select4(True, nothing())
    r["run"] = bool(m.Extension.RunCommand(381, ""))
    r["messages"] = c.ses.new_messages()
    act2 = val(m, "GetActiveSketch2")
    r["editingAfter"] = act2 is not None
    r["pmOpen"] = None
    if act2 is not None:
        r["activeSegs"] = seg_rows(act2)
    m.ClearSelection2(True)
    if act2 is not None:
        sm.InsertSketch(True)
    act3 = val(m, "GetActiveSketch2")
    if act3 is not None:
        r["stillEditing"] = seg_rows(act3)
        sm.InsertSketch(True)
    n1 = [f for f in c.features() if val(f, "GetTypeName2") == "ProfileFeature"]
    r["newSketches"] = [val(f, "Name") for f in n1 if val(f, "Name") not in n0]
    r["sourceSegs"] = len(seg_rows(val(sk, "GetSpecificFeature2")))
    r["new"] = [seg_rows(val(f, "GetSpecificFeature2")) for f in n1 if val(f, "Name") not in n0]


def autodim(c, res):
    m, sm = c.m, c.m.SketchManager
    r = res["autodim"] = {}
    c.ses.sw.SetUserPreferenceToggle if False else None

    def draw(s):
        s.rect(0, 0, 4, 3)
        s.circle(1, 1, 0.25)
        made = sm.CreateSketchSlot(0, 0, 0.5 * U, 2.5 * U, 1 * U, 0, 3.5 * U, 1 * U, 0, 0, 0, 0, 1, False)
        r["slotMade"] = made is not None
    sk = c.sketch(c.plane_at("Front", 1.0), draw)
    for scheme, key in ((1, "baseline"),):
        m.ClearSelection2(True)
        c.sel(sk, False, 0)
        m.EditSketch()
        m.ClearSelection2(True)
        m.Extension.SelectByID2("Point1@Origin", "EXTSKETCHPOINT", 0, 0, 0, False, 6, nothing(), 0)
        st = sm.FullyDefineSketch(True, False, 0, True, scheme, nothing(), scheme, nothing(), 1, 1)
        act = val(m, "GetActiveSketch2")
        row = {"status": st, "constrained": val(act, "GetConstrainedStatus"), "messages": c.ses.new_messages()}
        m.ClearSelection2(True)
        sm.InsertSketch(True)
        dims = []
        dd = val(sk, "GetFirstDisplayDimension")
        while dd is not None:
            try:
                t = val(dd, "GetType")
            except Exception:  # noqa: BLE001
                t = None
            d = val(dd, "GetDimension2") if False else dd.GetDimension2(0)
            dims.append({"type": t, "name": val(d, "FullName"), "value": val(d, "Value")})
            dd = sk.GetNextDisplayDimension(dd)
        row["dims"] = dims
        r[key] = row
        r["segs"] = seg_rows(val(sk, "GetSpecificFeature2"))


def rollback(c, res):
    m, fm = c.m, c.m.FeatureManager
    r = res["rollback"] = {}
    sk = c.sketch(c.plane("Top"), lambda s: s.rect(-3, -2, 6, 4))
    m.ClearSelection2(True)
    c.sel(sk)
    b = fm.FeatureExtrusion3(True, False, False, 0, 0, 1.0 * IN, 0, False, False, False, False, 0, 0, False, False, False, False, True, True, True, 0, 0, False)
    pl = c.plane_at("Top", 1.0)
    sk2 = c.sketch(pl, lambda s: s.circle(0, 0, 0.5))
    m.ClearSelection2(True)
    c.sel(sk2)
    cut = fm.FeatureCut4(True, False, False, 1, 0, 0, 0, False, False, False, False, 0, 0, False, False, False, False, False, True, True, True, True, False, 0, 0, False, False)
    r["sketch2"], r["cut"] = val(sk2, "Name"), val(cut, "Name")
    r["tree0"] = tree_rows(c)
    r["before"] = fm.EditRollback(3, val(cut, "Name"))
    r["treeBeforeCut"] = tree_rows(c)
    # a new feature while rolled back
    sk3 = c.sketch(c.plane("Front"), lambda s: s.line(0, 0, 1, 1))
    r["newSketch"] = val(sk3, "Name")
    r["treeWithNew"] = tree_rows(c)
    r["forward"] = fm.EditRollback(1, "")
    r["treeEnd"] = tree_rows(c)
    # the bar right after the absorbed sketch: above the feature that uses it, below the sketch?
    r["afterSketch"] = fm.EditRollback(4, val(sk2, "Name"))
    r["treeAfterSketch"] = tree_rows(c)
    r["beforeSketch"] = fm.EditRollback(3, val(sk2, "Name"))
    r["treeBeforeSketch"] = tree_rows(c)
    fm.EditRollback(1, "")


def main():
    ses = Ses()
    c = Ctx(ses)
    res = {}
    try:
        for fn in (rollback, path_tests, derived_tests, autodim):
            try:
                fn(c, res)
            except Exception as e:  # noqa: BLE001
                res.setdefault("errors", {})[fn.__name__] = str(e)[:300]
                if val(c.m, "GetActiveSketch2") is not None:
                    c.m.SketchManager.InsertSketch(True)
            dump("sketch", res)
        try:
            from_selections(c, res)
        except Exception as e:  # noqa: BLE001
            res.setdefault("errors", {})["from_selections"] = str(e)[:300]
    finally:
        dump("sketch", res)
        for t in list(ses.mine):
            ses.sw.CloseDoc(t)
            ses.mine.discard(t)
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


if __name__ == "__main__":
    main()
