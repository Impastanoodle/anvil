"""Unchecked items 3, 14, 15 and the flat views of 1 and 2 (lane swcheck, 2026-11-02): one drawing, several parts.
Parts saved under OUT (the drawing needs a file). Raw JSON: OUT\\draw\\drawing.json.

    python ref3_draw.py
"""
import math
import os
import sys

from ref3_core import *  # noqa: F401,F403
from sw_com import byref_int  # noqa: E402
import ref2_script
ref2_script.SCRATCH = os.path.join(OUT, "tmp")
from ref2_script import record, evaluate, Replay  # noqa: E402
import ref2_sheet as SH  # noqa: E402

T = 0.0598
HEAD = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\n'
TPL = r"C:\Program Files\SOLIDWORKS Corp\SOLIDWORKS\lang\english\bendtable-standard.sldbndtbt"
BEND4 = HEAD + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' \
    'p.flange(1, [[3, 0.0598, 4]], { position: "bendOutside", lengthRef: "outer" });\n' \
    'p.flange(1, [[6, 0.0598, 2]], { angle: 45, position: "bendOutside", lengthRef: "outer", reverse: true });\n' \
    'p.flange(1, [[3, 0.0598, 0]], { position: "bendOutside", lengthRef: "outer", radius: 0.12 });\n' \
    'p.flange(1, [[0, 0.0598, 2]], { angle: 135, position: "bendOutside", lengthRef: "outer", reverse: true });\n'
XB = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n'


def notes_of(v):
    out = []
    n = val(v, "GetFirstNote")
    while n is not None:
        row = {}
        for k in ("GetText", "GetName"):
            try:
                row[k] = val(n, k)
            except Exception as e:  # noqa: BLE001
                row[k] = "err " + str(e)[:60]
        try:
            p = n.GetTextPoint2 if not callable(n.GetTextPoint2) else n.GetTextPoint2()
            row["at"] = list(p)
        except Exception:  # noqa: BLE001
            pass
        out.append(row)
        n = val(n, "GetNext")
    return out


def table_rows(ann):
    t = ann
    rc, cc = val(t, "RowCount"), val(t, "ColumnCount")
    rows = []
    for r in range(rc):
        rows.append([t.DisplayedText2(r, c, False) for c in range(cc)])
    return rows


def build_save(ses, code, name, over=None, depth=None):
    ch = record([{"id": name, "code": code}])[name]
    rp = Replay(ses, ch, over).run()
    res = {"log": rp.log}
    res.update({k: v for k, v in rp.c.measure().items() if k in ("volume", "bbox", "faces")})
    p, err = save_copy(ses, rp.m, name)
    res["path"], res["err"] = p, err
    return res          # left open: a flat view needs the part loaded


def reopen(ses, name):
    """One of this lane's own saved parts, opened so a drawing view can use it."""
    guard(ses, name)
    p = os.path.join(OUT, name + ".SLDPRT")
    m = ses.sw.OpenDoc6(p, 1, 1, "", byref_int(), byref_int())
    if m is None:
        raise RuntimeError("could not open " + p)
    ses.mine.add(val(m, "GetTitle"))
    doc_bump("open " + name)
    return {"path": p}


def holes2_part(ses):
    """Counterbore and tapped hole on one block, to read which line of a callout is on top."""
    c = Ctx(ses)
    m, fm = c.m, c.m.FeatureManager
    sk = c.sketch(c.plane("Top"), lambda s: s.crect(0, 0, 3, 2))
    m.ClearSelection2(True)
    c.sel(sk)
    fm.FeatureExtrusion3(True, False, False, 0, 0, 1.0 * IN, 0, False, False, False, False, 0, 0, False, False, False, False, True, True, True, 0, 0, False)
    res = {"holes": []}
    for name, kind, std, fast, size, end, depth, thread, x in (("tap_1-4-20", 4, 0, 27, "1/4-20", 0, 0.75, 0.5, 0.75), ("cbore_1-4", 0, 0, 9, "1/4", 1, 0, 0, -0.75)):
        m.ClearSelection2(True)
        m.Extension.SelectByID2("", "FACE", x * IN, 1.0 * IN, 0.0, False, 0, nothing(), 0)
        f = fm.HoleWizard5(kind, std, fast, size, end, -1, depth * IN if depth else -1, -1, thread * IN if thread else -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                           "", False, True, True, True, True, False)
        res["holes"].append({"name": name, "made": f is not None})
    p, err = save_copy(ses, m, "chk-holes2")
    res["path"], res["err"] = p, err
    return res


def callouts_of(d, v):
    d.ClearSelection2(True)
    d.Extension.SelectByID2(val(v, "Name"), "DRAWINGVIEW", 0, 0, 0, False, 0, nothing(), 0)
    anns = d.InsertModelAnnotations3(0, 1048576, False, True, False, False)
    out = []
    for a in items(anns):
        obj = val(a, "GetSpecificAnnotation")
        row = {"type": val(a, "GetType")}
        try:
            row["texts"] = [obj.GetText(i) for i in range(1, 9)]
            row["at"] = list(val(a, "GetPosition"))
        except Exception as e:  # noqa: BLE001
            row["error"] = str(e)[:120]
        out.append(row)
    return out


def open_part(ses, pts, name):
    c = Ctx(ses, 0.0, 1.0)
    m, fm = c.m, c.m.FeatureManager
    sk = c.sketch(c.plane("Front"), lambda s: s.poly(pts, False))
    m.ClearSelection2(True)
    c.sel(sk)
    cba = val(fm, "CreateCustomBendAllowance")
    cba.Type = 2
    cba.KFactor = 0.5
    f = fm.InsertSheetMetalBaseFlange2(T * IN, False, T * IN, 1.0 * IN, 0.0, False, 0, 0, 0, cba, False, 1, 0.0, 0.0, 0.5, True, False, True, True)
    res = {"made": f is not None}
    p, err = save_copy(ses, m, name)
    res["path"], res["err"] = p, err
    ses.close(m)
    return res


def xb_part(ses):
    ch = record([{"id": "xb", "code": XB}])["xb"]
    rp = Replay(ses, ch).run()
    c, m = rp.c, rp.m
    m.ClearSelection2(True)
    c.pick(c.face_at([1, T, 1]), False, 0)
    f = rp.fm.InsertCrossBreak(math.radians(1), T * IN)
    res = {"made": f is not None}
    p, err = save_copy(ses, m, "chk-xbreak")
    res["path"], res["err"] = p, err
    ses.close(m)
    return res


def holes_part(ses):
    """A round-cornered block with a countersink (item 14) and a fillet (item 15's tangent edge)."""
    c = Ctx(ses)
    m, fm = c.m, c.m.FeatureManager
    sk = c.sketch(c.plane("Top"), lambda s: s.crect(0, 0, 3, 2))
    m.ClearSelection2(True)
    c.sel(sk)
    fm.FeatureExtrusion3(True, False, False, 0, 0, 1.0 * IN, 0, False, False, False, False, 0, 0, False, False, False, False, True, True, True, 0, 0, False)
    res = {"holes": []}
    # kind 1 countersink; standard 0 ANSI Inch, fastener 15 Flat Head 82, size 1/4, end through / blind
    specs = [("csk_flat_1-4", 1, 0, 15, "1/4", 1, -1, 0.75, 0.0), ("csk_flat_1-4_blind", 1, 0, 15, "1/4", 0, 0.5, -0.75, 0.0)]
    for name, kind, std, fast, size, end, depth, x, z in specs:
        m.ClearSelection2(True)
        m.Extension.SelectByID2("", "FACE", x * IN, 1.0 * IN, z * IN, False, 0, nothing(), 0)
        f = fm.HoleWizard5(kind, std, fast, size, end, -1, depth * IN if depth > 0 else -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                           "", False, True, True, True, True, False)
        row = {"name": name, "made": f is not None, "messages": ses.new_messages()}
        if f is not None:
            d = val(f, "GetDefinition")
            for k, fn in (("dia", lambda: d.HoleDiameter / IN), ("depth", lambda: d.HoleDepth / IN), ("cskDia", lambda: d.CounterSinkDiameter / IN),
                          ("cskAngle", lambda: math.degrees(d.CounterSinkAngle)), ("fastener", lambda: d.FastenerType), ("standard", lambda: d.Standard)):
                try:
                    row[k] = fn()
                except Exception as e:  # noqa: BLE001
                    row[k] = "err " + str(e)[:50]
        res["holes"].append(row)
    me = c.measure()
    res.update({k: me.get(k) for k in ("volume", "bbox", "faces")})
    m.ClearSelection2(True)
    c.pick_edges([[1.5, 1, 1]])
    res["fillet"] = fm.FeatureFillet(3, 0.25 * IN, 0, 0, 0, 0, 0) is not None
    p, err = save_copy(ses, m, "chk-holes")
    res["path"], res["err"] = p, err
    ses.close(m)
    return res


def flat_view(d, path, x, y, res, key):
    v = d.CreateFlatPatternViewFromModelView3(path, "", x, y, 0, False, False)
    r = res.setdefault("views", {}).setdefault(key, {"made": v is not None})
    if v is None:
        return None
    r["name"] = val(v, "Name")
    r["scale"] = list(val(v, "ScaleRatio"))
    r["orient"] = val(v, "GetOrientationName")
    r["bendLines"] = len(items(val(v, "GetBendLines")))
    r["notes"] = notes_of(v)
    return v


def main():
    ses = Ses()
    res = {}
    res["bend4"] = build_save(ses, BEND4, "chk-bend4b", over={"pick": {"6,0.0598,2": [6, 0, 2], "0,0.0598,2": [0, 0, 2]}})
    print("bend4", res["bend4"], flush=True)
    res["xbreak"] = reopen(ses, "chk-xbreak")
    res["openU"] = reopen(ses, "chk-openU")
    res["openUrev"] = reopen(ses, "chk-openUrev")
    res["hole"] = reopen(ses, "chk-holes")
    res["hole2"] = holes2_part(ses)
    print({k: res[k] for k in ("hole2",)}, flush=True)
    d = ses.new_from_pref(DRAWING_PREF)
    try:
        v1 = flat_view(d, res["bend4"]["path"], 0.16, 0.20, res, "bend4")
        flat_view(d, res["xbreak"]["path"], 0.33, 0.20, res, "xbreak")
        flat_view(d, res["openU"]["path"], 0.10, 0.08, res, "openU")
        flat_view(d, res["openUrev"]["path"], 0.20, 0.08, res, "openUrev")
        d.ForceRebuild3(False)
        print(res.get("views"), flush=True)
        # the Bend Table on the 4-bend view
        if v1 is not None:
            d.ClearSelection2(True)
            d.Extension.SelectByID2(val(v1, "Name"), "DRAWINGVIEW", 0, 0, 0, False, 0, nothing(), 0)
            bt = v1.InsertBendTable(False, 0.02, 0.27, 1, "A", TPL)
            res["bendTableMade"] = bt is not None
            if bt is not None:
                try:
                    res["bendTable"] = table_rows(bt)
                except Exception as e:  # noqa: BLE001
                    res["bendTableErr"] = str(e)[:200]
                    tb = val(bt, "BendTable")
                    res["bendTableFeat"] = {"start": tb.StartingValue, "style": tb.TagStyle, "n": val(tb, "GetTableAnnotationCount")}
                    res["bendTable"] = [table_rows(a) for a in items(val(tb, "GetTableAnnotations"))]
            res["notesAfterTable"] = notes_of(v1)
            res["bendLinesAfter"] = len(items(val(v1, "GetBendLines")))
        # 14 countersink callout, 15 tangent edges: a Top view and an Isometric view of the holes part
        v2 = d.CreateDrawViewFromModelView3(res["hole"]["path"], "*Top", 0.33, 0.09, 0)
        res["callouts"] = callouts_of(d, v2) if v2 is not None else None
        v4 = d.CreateDrawViewFromModelView3(res["hole2"]["path"], "*Top", 0.33, 0.04, 0)
        res["callouts2"] = callouts_of(d, v4) if v4 is not None else None
        v3 = d.CreateDrawViewFromModelView3(res["hole"]["path"], "*Isometric", 0.33, 0.14, 0)
        if v3 is not None:
            res["tangent"] = {"default": val(v3, "GetDisplayTangentEdges2"), "systemDefault": ses.sw.GetUserPreferenceIntegerValue(77), "edgesOption": ses.sw.GetUserPreferenceIntegerValue(95)}
            rows = {}
            for mode in (0, 1, 2):
                v3.SetDisplayTangentEdges2(mode)
                d.ForceRebuild3(False)
                vis = []
                try:
                    vis = items(v3.GetVisibleEntities2(nothing(), 1))     # swViewEntityType_Edge
                except Exception as e:  # noqa: BLE001
                    rows["err"] = str(e)[:120]
                rows[str(mode)] = {"get": val(v3, "GetDisplayTangentEdges2"), "visibleEdges": len(vis)}
            res["tangent"]["modes"] = rows
        p, err = save_copy(ses, d, "chk-drawing2")
        res["drawing"] = [p, err]
        # where each callout line lands: the sheet as DXF, read by ref3_show (a copy, the title stays)
        pd = os.path.join(OUT, "chk-drawing2.dxf")
        if not os.path.exists(pd):
            res["dxf"] = [pd, d.SaveAs3(pd, 0, 1)]
    finally:
        dump("drawing", res)
        for t in list(ses.mine):
            ses.sw.CloseDoc(t)
            ses.mine.discard(t)
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


if __name__ == "__main__":
    main()
