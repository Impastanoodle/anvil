"""Shared helpers for measuring SolidWorks sheet-metal reference values (lane DO, 2026-10-27).

Drives the user's running SolidWorks over COM (pywin32, late binding). Every part is built in a new
untitled document, measured, saved under OUT and closed; documents the user had open are never touched.
Units: the API is metres / radians; these helpers take inches and degrees.
"""
import json
import math
import os
import sys

sys.path.insert(0, r"C:\Users\Lucas\.claude\skills\solidworks-api-codestack\scripts")
import pythoncom  # noqa: E402
from win32com.client import VARIANT  # noqa: E402
from sw_com import connect, val, invoke, nothing, byref_int, dvec, darr, items, const  # noqa: E402

IN = 0.0254
OUT = r"C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference"
T = 0.0598          # 16 ga steel
R = 0.0598
K = 0.5


def sw_app():
    sw = connect()
    sw.Visible = True
    return sw


def new_part(sw):
    tpl = sw.GetUserPreferenceStringValue(8)            # swDefaultTemplatePart
    model = sw.NewDocument(tpl, 0, 0, 0)
    if model is None:
        raise RuntimeError("NewDocument failed: " + tpl)
    model.SetUnits(3, 0, 0, 0, False)                    # inches, decimal
    return model


def plane(model, idx):
    """0 Front, 1 Top, 2 Right (walk RefPlane features: names can be localised)."""
    f, seen = val(model, "FirstFeature"), 0
    while f is not None:
        if val(f, "GetTypeName2") == "RefPlane":
            if seen == idx:
                return f
            seen += 1
        f = val(f, "GetNextFeature")
    raise RuntimeError("plane %d not found" % idx)


def features(model):
    f, out = val(model, "FirstFeature"), []
    while f is not None:
        out.append(f)
        f = val(f, "GetNextFeature")
    return out


def feature_of_type(model, tname):
    for f in features(model):
        if val(f, "GetTypeName2") == tname:
            return f
    return None


def sketch_lines(model, select_plane_or_face, segs):
    """Open a sketch on the selected entity (callable that selects it) and draw lines [(x1,y1,x2,y2)] (inches,
    sketch coordinates). Returns the sketch feature."""
    model.ClearSelection2(True)
    select_plane_or_face()
    sm = model.SketchManager
    sm.InsertSketch(True)
    sm.AddToDB = True          # (DisplayWhenAdded = False hung SolidWorks 2022 here; leave it alone)
    try:
        for (x1, y1, x2, y2) in segs:
            if sm.CreateLine(x1 * IN, y1 * IN, 0, x2 * IN, y2 * IN, 0) is None:
                raise RuntimeError("CreateLine failed")
    finally:
        sm.AddToDB = False
    sm.InsertSketch(True)                                 # exit the sketch
    # the newest sketch (Flat-Pattern1 stays last in a sheet-metal tree, so not simply the last feature)
    return [f for f in features(model) if val(f, "GetTypeName2") == "ProfileFeature"][-1]


def rect_segs(x0, y0, x1, y1):
    return [(x0, y0, x1, y0), (x1, y0, x1, y1), (x1, y1, x0, y1), (x0, y1, x0, y0)]


def base_flange_top(model, w=4.0, d=2.0, t=T, r=R, k=K, reverse=True):
    """Base flange from a w x d rectangle on the Top plane: model X 0..w, Z 0..d (sketch y = -Z), the sheet
    thickened to +Y (Anvil's p.sketch("Top").rect(0, -d, w, d).end().baseFlange())."""
    top = plane(model, 1)
    sk = sketch_lines(model, lambda: top.Select2(False, 0), rect_segs(0, 0, w, -d))
    model.ClearSelection2(True)
    sk.Select2(False, 0)
    fm = model.FeatureManager
    cba = val(fm, "CreateCustomBendAllowance")
    cba.Type = 2                                          # swBendAllowanceKFactor
    cba.KFactor = k
    # (T, ThickenDir, R, d1, d2, flip, ec1, ec2, dirToUse, PCBA, UseDefaultRelief, ReliefType rect,
    #  width, depth, ratio, UseReliefRatio, merge, featScope, autoSelect).  ThickenDir True = +Y on the Top plane.
    f = fm.InsertSheetMetalBaseFlange2(t * IN, reverse, r * IN, 0.0, 0.0, False, 0, 0, 0, cba, False, 1,
                                       0.0, 0.0, 0.5, True, False, True, True)
    if f is None:
        raise RuntimeError("base flange failed")
    # SolidWorks 2022 thickens a Top-plane base flange to -Y whatever ThickenDir says (both measured): the
    # sheet is y -T..0.  part_box / vertices report Y + YSHIFT so the base reads 0..T as in Anvil.
    set_sheet_defaults(model, k)
    return f


def set_sheet_defaults(model, k=K, ratio=0.5):
    """Sheet-Metal feature: K-factor k, Auto Relief rectangular, ratio 0.5."""
    sm = feature_of_type(model, "SheetMetal")
    d = val(sm, "GetDefinition")
    d.AccessSelections(model, nothing())
    try:
        cba = val(d, "GetCustomBendAllowance")
        cba.Type = 2
        cba.KFactor = k
        d.SetCustomBendAllowance(cba)
    except Exception as e:
        print("note: custom BA not set on Sheet-Metal:", e)
    try:
        d.UseAutoRelief = True
        d.AutoReliefType = 1                              # rectangular
        d.ReliefRatio = ratio
    except Exception as e:
        print("note: relief not set:", e)
    sm.ModifyDefinition(d, model, nothing())
    return sheet_info(model)


def sheet_info(model):
    sm = feature_of_type(model, "SheetMetal")
    d = val(sm, "GetDefinition")
    cba = val(d, "GetCustomBendAllowance")
    return {"T": d.Thickness / IN, "R": d.BendRadius / IN, "baType": cba.Type, "K": cba.KFactor,
            "autoRelief": d.UseAutoRelief, "relief": d.AutoReliefType, "ratio": d.ReliefRatio}


def rebuild(model):
    model.ForceRebuild3(False)


YSHIFT = T     # see base_flange_top: SolidWorks' sheet is y -T..0, Anvil's 0..T


def part_box(model):
    b = [v / IN for v in model.GetPartBox(True)]
    return [b[0], b[1] + YSHIFT, b[2], b[3], b[4] + YSHIFT, b[5]]


def volume(model):
    mp = val(model, "GetMassProperties")
    return mp[3] / IN ** 3


def bodies(model):
    return items(model.GetBodies2(0, True))               # swSolidBody


def select_at(model, kind, x, y, z, append=False, mark=0):
    """SelectByID2 by a point in inches, Anvil's frame (y is shifted by YSHIFT)."""
    return model.Extension.SelectByID2("", kind, x * IN, (y - YSHIFT) * IN, z * IN, append, mark, nothing(), 0)


def entity_at(model, kind, x, y, z):
    model.ClearSelection2(True)
    if not select_at(model, kind, x, y, z):
        raise RuntimeError("nothing (%s) at %s" % (kind, (x, y, z)))
    return model.SelectionManager.GetSelectedObject6(1, -1)


def flat(model):
    """Unsuppress Flat-Pattern, read the flat body's box and volume, suppress it again."""
    fp = feature_of_type(model, "FlatPattern")
    if fp is None:
        raise RuntimeError("no Flat-Pattern feature")
    fp.SetSuppression2(1, 2, nothing())                  # swUnSuppressFeature, swAllConfiguration
    rebuild(model)
    box = part_box(model)
    vol = volume(model)
    bl = bodies(model)
    fp.SetSuppression2(0, 2, nothing())                  # swSuppressFeature
    rebuild(model)
    return {"box": box, "size": sorted([box[3] - box[0], box[4] - box[1], box[5] - box[2]], reverse=True),
            "volume": vol, "bodies": len(bl)}


def vertices(model):
    """Every vertex of the part's solid bodies, inches."""
    out = []
    for b in bodies(model):
        for v in items(val(b, "GetVertices")):
            p = val(v, "GetPoint")
            out.append([p[0] / IN, p[1] / IN + YSHIFT, p[2] / IN])
    return out


def extreme(model, d):
    """The part's extreme coordinate along unit direction d (IBody2.GetExtremePoint: exact on curved faces,
    where vertices miss the top of an arc). Returns the point (Anvil frame, inches) of the largest d . p."""
    best = None
    for b in bodies(model):
        # by-ref double outs: late binding cannot pass them, so InvokeTypes with VT_R8|VT_BYREF out params
        ole = b._oleobj_
        r = ole.InvokeTypes(ole.GetIDsOfNames("GetExtremePoint"), 0, pythoncom.DISPATCH_METHOD,
                            (pythoncom.VT_BOOL, 0),
                            ((pythoncom.VT_R8, 1), (pythoncom.VT_R8, 1), (pythoncom.VT_R8, 1),
                             (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2), (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2),
                             (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2)),
                            float(d[0]), float(d[1]), float(d[2]), 0.0, 0.0, 0.0)
        if not r[0]:
            continue
        p = [r[1] / IN, r[2] / IN + YSHIFT, r[3] / IN]
        if best is None or sum(a * b_ for a, b_ in zip(p, d)) > sum(a * b_ for a, b_ in zip(best, d)):
            best = p
    return best


def save_close(sw, model, name):
    path = os.path.join(OUT, name + ".SLDPRT")
    if os.path.exists(path):
        d = sw.GetOpenDocumentByName(path)
        if d is not None:
            sw.CloseDoc(val(d, "GetTitle"))
    err = model.SaveAs3(path, 0, 1)                       # silent
    title = val(model, "GetTitle")
    sw.CloseDoc(title)
    if err:
        raise RuntimeError("SaveAs3 %s -> %s" % (path, err))
    return path


def close_unsaved(sw, model):
    sw.CloseDoc(val(model, "GetTitle"))


def r6(x):
    if isinstance(x, (list, tuple)):
        return [r6(v) for v in x]
    if isinstance(x, dict):
        return {k: r6(v) for k, v in x.items()}
    if isinstance(x, float):
        return round(x, 6)
    return x


def dump(name, data):
    path = os.path.join(OUT, name + ".json")
    with open(path, "w") as fh:
        json.dump(r6(data), fh, indent=1)
    print(json.dumps(r6(data), indent=1))


FLANGE_POS = {"inside": 1, "outside": 2, "bendOutside": 3}             # swFlangePositionTypes_e
FLANGE_DIM = {"outer": 1, "inner": 2, "tangent": 3}                    # swFlangeDimTypes_e


def edge_flange(model, edge_pt, length, angle_deg, position="inside", dimtype="outer", flip=False, extra_opts=0,
                relief=None):
    """Edge flange on the edge through edge_pt (Anvil frame, inches): the port of the API help's
    Insert_Sheet_Metal_Edge_Flange_Example (InsertSketchForEdgeFlange -> SketchUseEdge -> profile lines ->
    InsertSheetMetalEdgeFlange2).  The profile is a full-width rectangle `length` tall; the flange length and
    its measuring type then come from FlangeOffsetDist / FlangeSharpType."""
    edge = entity_at(model, "EDGE", *edge_pt)
    a = math.radians(angle_deg)
    L = length * IN
    # default radius + default relief, or relief = (swSheetMetalReliefTypes_e, ratio) with the ratio flag
    opts = 1 + (128 if relief is None else 64) + extra_opts
    rtype, rratio = relief or (1, 0.5)
    f = None
    # The converted edge is not always horizontal in the profile sketch (an edge along Z came out vertical), so
    # the rectangle is drawn square to it, on one side and then the other until a flange is made.
    for sign in (1, -1):
        skf = model.InsertSketchForEdgeFlange(edge, a, flip)
        if skf is None:
            raise RuntimeError("InsertSketchForEdgeFlange failed")
        model.ClearSelection2(True)
        skf.Select2(False, 0)
        model.EditSketch()
        sk = val(model, "GetActiveSketch2")
        model.ClearSelection2(True)
        edge.Select4(False, nothing())
        model.SketchManager.SketchUseEdge(False)
        ln = items(val(sk, "GetSketchSegments"))[0]
        p0, p1 = val(ln, "GetStartPoint2"), val(ln, "GetEndPoint2")
        ex, ey = p1.X - p0.X, p1.Y - p0.Y
        el = math.hypot(ex, ey)
        nx, ny = -ey / el * L * sign, ex / el * L * sign
        sm = model.SketchManager
        sm.AddToDB = True
        try:
            sm.CreateLine(p0.X, p0.Y, 0, p0.X + nx, p0.Y + ny, 0)
            sm.CreateLine(p0.X + nx, p0.Y + ny, 0, p1.X + nx, p1.Y + ny, 0)
            sm.CreateLine(p1.X + nx, p1.Y + ny, 0, p1.X, p1.Y, 0)
        finally:
            sm.AddToDB = False
        sm.InsertSketch(True)
        # The profile sketch drives the made flange (its top line sat T + L above the base: FlangeOffsetDist /
        # FlangeSharpType were ignored, and Tangent failed outright).  So make it Outer Virtual Sharp, then set
        # the length and its type on IEdgeFlangeFeatureData and ModifyDefinition.
        for attempt in range(2):
            f = model.FeatureManager.InsertSheetMetalEdgeFlange2(darr([edge]), darr([sk]), opts, a, R * IN,
                                                                 FLANGE_POS[position], L, rtype, rratio,
                                                                 rratio * T * IN, rratio * T * IN, 1, nothing())
            if f is not None:
                break
        if f is not None:
            break
        edge = entity_at(model, "EDGE", *edge_pt)
    if f is None:
        raise RuntimeError("InsertSheetMetalEdgeFlange2 failed")
    d = val(f, "GetDefinition")
    d.AccessSelections(model, nothing())
    d.OffsetType = 1                                  # swFlangeOffsetBlind
    d.OffsetDimType = FLANGE_DIM[dimtype]
    d.OffsetDistance = L
    if not f.ModifyDefinition(d, model, nothing()):
        raise RuntimeError("edge flange ModifyDefinition failed")
    d = val(f, "GetDefinition")
    return f, {"offsetType": d.OffsetType, "dimType": d.OffsetDimType, "length": d.OffsetDistance / IN,
               "angle": math.degrees(d.BendAngle), "position": d.PositionType}
