"""Follow-ups of the swcheck lane: which face is fixed on a closed Base Flange and the Bend Table's order (a), Jog position in the
solid (b), what a derived sketch follows (c). Raw JSON: OUT\\more.json.

    python ref3_more.py a b c
"""
import math
import os
import sys

from ref3_core import *  # noqa: F401,F403
from sw_com import byref_int  # noqa: E402
import ref2_script
ref2_script.SCRATCH = os.path.join(OUT, "tmp")
from ref2_script import record, Replay  # noqa: E402
import ref2_sheet as SH  # noqa: E402
from ref3_draw import flat_view, table_rows, notes_of, TPL  # noqa: E402
from ref3_sketch import seg_rows, rel_rows  # noqa: E402
from ref3_sheet import face_info, PLATE, jogcode  # noqa: E402

T = 0.0598


def fixed_of(c):
    fp = c.feature_of_type("FlatPattern")
    d = val(fp, "GetDefinition")
    d.AccessSelections(c.m, nothing())
    ff = val(d, "FixedFace2")
    out = face_info(c, ff) if ff is not None else None
    d.ReleaseSelectionAccess()
    return out


def case_a(ses, res):
    # the 4-bend part of the first drawing: which face is fixed
    guard(ses, "open")
    p = os.path.join(OUT, "chk-bend4b.SLDPRT")
    m = ses.sw.OpenDoc6(p, 1, 1, "", byref_int(), byref_int())
    ses.mine.add(val(m, "GetTitle"))
    doc_bump("open chk-bend4b")

    class C0:
        pass
    c0 = Ctx.__new__(Ctx)
    c0.ses, c0.sw, c0.m, c0.yshift, c0.scale = ses, ses.sw, m, 0.0, 1.0
    res["bend4bFixed"] = fixed_of(c0)
    res["bend4bTree"] = None
    ses.close(m)
    # a closed Base Flange with SolidWorks' default thickness side, flanges made in another order
    rp = Replay(ses, [[["units", "in"]]])
    c, mm, fm = rp.c, rp.m, rp.fm
    rp.sheet = {"T": T, "R": T, "K": 0.5, "opts": {}}
    sk = c.sketch(c.plane("Top"), lambda s: s.rect(0, -4, 6, 4))
    mm.ClearSelection2(True)
    c.sel(sk)
    cba = val(fm, "CreateCustomBendAllowance")
    SH.set_ba(cba, rp.sheet)
    f = fm.InsertSheetMetalBaseFlange2(T * IN, False, T * IN, 0.0, 0.0, False, 0, 0, 0, cba, False, 1, 0.0, 0.0, 0.5, True, False, True, True)
    res["defMade"] = f is not None
    bfeat = c.feature_of_type("SMBaseFlange")
    res["defReverseThickness"] = val(bfeat, "GetDefinition").ReverseThickness
    me = c.measure(False)
    res["defBbox"] = me["bbox"]
    res["defFixed"] = fixed_of(c)
    top = me["bbox"][4]
    bot = me["bbox"][1]
    res["topBot"] = [top, bot]
    rp.over = {"pick": {"3,%g,4" % top: [3, bot, 4], "6,%g,2" % top: [6, bot, 2]}}
    o = {"position": "bendOutside", "lengthRef": "outer"}
    made = []
    for at, opt in (([3, top, 0], {}), ([0, top, 2], {"angle": 45}), ([3, top, 4], {"reverse": True}), ([6, top, 2], {"angle": 135, "reverse": True})):
        q = dict(o)
        q.update(opt)
        made.append(SH.edge_flange(rp, at, 1, q) is not None)
        res["defMsgs"] = ses.new_messages()
    res["defFlanges"] = made
    me = c.measure()
    res["defPart"] = {k: me.get(k) for k in ("volume", "bbox", "faces")}
    res["defFixed2"] = fixed_of(c)
    pth, err = save_copy(ses, mm, "chk-bend4c")
    d = ses.new_from_pref(DRAWING_PREF)
    try:
        v1 = flat_view(d, pth, 0.20, 0.14, res, "default")
        if v1 is not None:
            d.ClearSelection2(True)
            d.Extension.SelectByID2(val(v1, "Name"), "DRAWINGVIEW", 0, 0, 0, False, 0, nothing(), 0)
            bt = v1.InsertBendTable(False, 0.02, 0.27, 1, "A", TPL)
            res["table2"] = table_rows(bt) if bt is not None else None
            res["tags2"] = notes_of(v1)
    finally:
        for t in list(ses.mine):
            ses.sw.CloseDoc(t)
            ses.mine.discard(t)


def case_b(ses, res):
    code = jogcode(90, "outside", False)
    ch = record([{"id": "j", "code": code}])["j"]
    rp = Replay(ses, ch).run()
    c, m = rp.c, rp.m
    jf = c.feature_of_type("Jog")
    rows = {}
    for pos in (3, 4, 1, 2):
        d = val(jf, "GetDefinition")
        d.AccessSelections(m, nothing())
        d.JogPositionType = pos
        ok = jf.ModifyDefinition(d, m, nothing())
        m.ForceRebuild3(False)
        vs = set()
        for b in c.bodies():
            for v in items(val(b, "GetVertices")):
                q = val(v, "GetPoint")
                if abs(q[2]) < 1e-9:
                    vs.add((round(q[0] / IN, 5), round(q[1] / IN + c.yshift, 5)))
        rows[str(pos)] = {"ok": bool(ok), "read": val(jf, "GetDefinition").JogPositionType, "wrong": c.whats_wrong(), "section": sorted(vs)}
    res["jogSections"] = rows
    ses.close(m)


def case_c(ses, res):
    c = Ctx(ses)
    m, sm = c.m, c.m.SketchManager
    r = res["derived2"] = {}
    parent = c.sketch(c.plane("Front"), lambda s: (s.line(2, 0, 3, 1), s.line(3, 1, 4, 1)))
    pl = c.plane_at("Front", 2.0)
    m.ClearSelection2(True)
    c.sel(parent, False, 0)
    c.sel(pl, True, 0)
    m.DeriveSketch()
    r["activeAfterDerive"] = val(m, "GetActiveSketch2") is not None
    m.ClearSelection2(True)
    if val(m, "GetActiveSketch2") is not None:
        sm.InsertSketch(True)
    dfeat = c.feature_of_type("ProfileFeature", last=True)
    r["derived0"] = seg_rows(val(dfeat, "GetSpecificFeature2"))
    r["rels0"] = rel_rows(val(dfeat, "GetSpecificFeature2"))

    def edit_parent(fn):
        m.ClearSelection2(True)
        c.sel(parent, False, 0)
        m.EditSketch()
        act = val(m, "GetActiveSketch2")
        out = fn(act)
        m.ClearSelection2(True)
        sm.InsertSketch(True)
        m.ForceRebuild3(False)
        return out

    def move_end(act):
        s0 = items(val(act, "GetSketchSegments"))[0]
        p = val(s0, "GetEndPoint2")
        try:
            p.X = 3.5 * IN
            p.Y = 1.5 * IN
            return "set"
        except Exception as e:  # noqa: BLE001
            return "err " + str(e)[:100]
    r["moveEnd"] = edit_parent(move_end)
    r["parent1"] = seg_rows(val(parent, "GetSpecificFeature2"))
    r["derived1"] = seg_rows(val(dfeat, "GetSpecificFeature2"))

    def add_line(act):
        sm.AddToDB = True
        q = sm.CreateLine(0, 0, 0, 1 * IN, 0, 0)
        sm.AddToDB = False
        return q is not None
    r["addLine"] = edit_parent(add_line)
    r["parent2"] = seg_rows(val(parent, "GetSpecificFeature2"))
    r["derived2"] = seg_rows(val(dfeat, "GetSpecificFeature2"))
    r["status"] = val(val(dfeat, "GetSpecificFeature2"), "GetConstrainedStatus")
    m.ClearSelection2(True)
    c.sel(dfeat, False, 0)
    m.UnderiveSketch()
    m.ForceRebuild3(False)
    dsk = val(dfeat, "GetSpecificFeature2")
    r["underived"] = {"isDerived": val(dsk, "IsDerived"), "segs": seg_rows(dsk), "rels": rel_rows(dsk), "status": val(dsk, "GetConstrainedStatus")}
    r["addLine2"] = edit_parent(add_line)
    r["parent3"] = seg_rows(val(parent, "GetSpecificFeature2"))
    r["derived3"] = seg_rows(val(dfeat, "GetSpecificFeature2"))
    ses.close(m)


def main():
    want = sys.argv[1:]
    ses = Ses()
    res = {}
    p = os.path.join(OUT, "more.json")
    if os.path.exists(p):
        with open(p) as fh:
            res = json.load(fh)
    for k, fn in (("a", case_a), ("b", case_b), ("c", case_c)):
        if k in want:
            try:
                fn(ses, res)
            except Exception as e:  # noqa: BLE001
                res["error_" + k] = str(e)[:300]
                import traceback
                res["trace_" + k] = traceback.format_exc()[-900:]
                for t in list(ses.mine):
                    ses.sw.CloseDoc(t)
                    ses.mine.discard(t)
            dump("more", res)
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


if __name__ == "__main__":
    main()
