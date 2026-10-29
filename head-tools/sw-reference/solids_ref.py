"""SolidWorks reference parts for Anvil's solid features (lane FH, 2026-10-29).

Builds each part in a new untitled SolidWorks document over COM (pywin32, late binding), measures it (Mass
Properties volume / surface area / centre of mass, face count, exact bounding box from IBody2.GetExtremePoint),
saves it to OUT and closes it. Documents the user had open are never touched. Inches in, metres to the API.
Frame: Anvil's = SolidWorks' (Y up; a Top-plane sketch has x = X, y = -Z; a Front-plane sketch x = X, y = Y).

    python head-tools/sw-reference/solids_ref.py            # every part
    python head-tools/sw-reference/solids_ref.py P03 P07    # some parts
Writes OUT/solids.json (merged with what is there) and prints it.
"""
import json
import math
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pythoncom  # noqa: E402
from swref import sw_app, new_part, plane, features, IN  # noqa: E402
from sw_com import val, nothing, items  # noqa: E402

OUT = r"C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\solids"
D5 = math.radians(5)


# ---------------------------------------------------------------- helpers
CUR = [None]          # the model being built (sel() needs it)


def sel(feat, append, mark):
    """IFeature.Select2, or by name with SelectByID2 (Select2 returned False on 2026-10-29 while another document sat
    in an open sketch)."""
    if feat.Select2(append, mark):
        return True
    t = {"RefPlane": "PLANE", "ProfileFeature": "SKETCH"}.get(val(feat, "GetTypeName2"), "BODYFEATURE")
    return CUR[0].Extension.SelectByID2(val(feat, "Name"), t, 0, 0, 0, append, mark, nothing(), 0)


def sketch_on(model, sel, draw):
    """Open a sketch on whatever sel() selects, draw(sm) the entities (inches), close it; return the sketch feature."""
    model.ClearSelection2(True)
    if not sel():
        raise RuntimeError("sketch plane / face not selected")
    sm = model.SketchManager
    sm.InsertSketch(True)
    sm.AddToDB = True
    try:
        draw(sm)
    finally:
        sm.AddToDB = False
    sm.InsertSketch(True)
    return [f for f in features(model) if val(f, "GetTypeName2") == "ProfileFeature"][-1]


def P(model, i):
    return lambda: plane(model, i).Select2(False, 0)


def top_at(model, h):
    """Selector for a plane parallel to Top at height h (a new reference plane; sketch frame = Top's)."""
    if h == 0:
        return P(model, 1)
    model.ClearSelection2(True)
    sel(plane(model, 1), False, 0)
    pl = model.FeatureManager.InsertRefPlane(8, h * IN, 0, 0, 0, 0)
    if pl is None:
        raise RuntimeError("ref plane failed")
    return lambda: sel(pl, False, 0)


def face_at(model, x, y, z, append=False, mark=0):
    return lambda: model.Extension.SelectByID2("", "FACE", x * IN, y * IN, z * IN, append, mark, nothing(), 0)


def L(sm, x1, y1, x2, y2):
    if sm.CreateLine(x1 * IN, y1 * IN, 0, x2 * IN, y2 * IN, 0) is None:
        raise RuntimeError("CreateLine")


def poly(sm, pts):
    for a, b in zip(pts, pts[1:] + pts[:1]):
        L(sm, a[0], a[1], b[0], b[1])


def crect(sm, cx, cy, w, h):
    poly(sm, [(cx - w / 2, cy - h / 2), (cx + w / 2, cy - h / 2), (cx + w / 2, cy + h / 2), (cx - w / 2, cy + h / 2)])


def circ(sm, cx, cy, r):
    if sm.CreateCircleByRadius(cx * IN, cy * IN, 0, r * IN) is None:
        raise RuntimeError("CreateCircleByRadius")


def arc(sm, cx, cy, x1, y1, x2, y2, d):
    if sm.CreateArc(cx * IN, cy * IN, 0, x1 * IN, y1 * IN, 0, x2 * IN, y2 * IN, 0, d) is None:
        raise RuntimeError("CreateArc")


def extrude(model, sk, depth, merge=True, draft=0.0, mid=False, cut=False, through=False, flip=False):
    model.ClearSelection2(True)
    sel(sk, False, 0)
    fm = model.FeatureManager
    t1 = 1 if through else (6 if mid else 0)        # swEndCondThroughAll / MidPlane / Blind
    if cut:
        f = fm.FeatureCut4(True, False, flip, t1, 0, depth * IN, 0, False, False, False, False, 0, 0, False, False,
                           False, False, False, True, True, True, True, False, 0, 0, False, False)
    else:
        f = fm.FeatureExtrusion3(True, False, flip, t1, 0, depth * IN, 0, draft != 0, False, False, False, draft, 0,
                                 False, False, False, False, merge, True, True, 0, 0, False)
    if f is None:
        raise RuntimeError("extrude failed")
    return f


def select_edges(model, pts, append=False, mark=0):
    """Select the edge nearest each point (by geometry: SelectByID2 picks along the view and misses hidden edges)."""
    sd = val(model.SelectionManager, "CreateSelectData")
    sd.Mark = mark
    for i, p in enumerate(pts):
        best, bd = None, 1e9
        for b in bodies(model):
            for e in items(val(b, "GetEdges")):
                q = e.GetClosestPointOn(p[0] * IN, p[1] * IN, p[2] * IN)
                dd = math.dist(q[:3], [c * IN for c in p])
                if dd < bd:
                    best, bd = e, dd
        if best is None or bd > 1e-5:
            raise RuntimeError("no edge at %s" % (p,))
        if not best.Select4(append or i > 0, sd):
            raise RuntimeError("edge select failed at %s" % (p,))


def fillet(model, r, pts):
    model.ClearSelection2(True)
    select_edges(model, pts)
    f = model.FeatureManager.FeatureFillet(2, r * IN, 0, 0, 0, 0, 0)   # uniform radius (adding 64 "attach edges" dropped edges: lane FH)
    if f is None:
        raise RuntimeError("fillet failed")
    return f


def chamfer(model, d, pts):
    model.ClearSelection2(True)
    select_edges(model, pts)
    f = model.FeatureManager.InsertFeatureChamfer(4, 1, d * IN, math.radians(45), 0, 0, 0, 0)  # swChamferAngleDistance
    if f is None:
        raise RuntimeError("chamfer failed")
    return f


def bodies(model):
    return items(model.GetBodies2(0, True))


def extreme(model, d):
    best = None
    for b in bodies(model):
        ole = b._oleobj_
        r = ole.InvokeTypes(ole.GetIDsOfNames("GetExtremePoint"), 0, pythoncom.DISPATCH_METHOD, (pythoncom.VT_BOOL, 0),
                            ((pythoncom.VT_R8, 1), (pythoncom.VT_R8, 1), (pythoncom.VT_R8, 1),
                             (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2), (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2),
                             (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2)),
                            float(d[0]), float(d[1]), float(d[2]), 0.0, 0.0, 0.0)
        if r[0]:
            p = [r[1] / IN, r[2] / IN, r[3] / IN]
            if best is None or sum(a * b_ for a, b_ in zip(p, d)) > sum(a * b_ for a, b_ in zip(best, d)):
                best = p
    return best


def measure(model):
    model.ForceRebuild3(False)
    mp = val(model.Extension, "CreateMassProperty")
    com = list(mp.CenterOfMass)
    bl = bodies(model)
    faces, ftypes = 0, {}
    for b in bl:
        for fc in items(val(b, "GetFaces")):
            faces += 1
            s = val(fc, "GetSurface")
            k = "plane" if val(s, "IsPlane") else "cyl" if val(s, "IsCylinder") else "cone" if val(s, "IsCone") else \
                "torus" if val(s, "IsTorus") else "sphere" if val(s, "IsSphere") else "other"
            ftypes[k] = ftypes.get(k, 0) + 1
    lo = [extreme(model, d)[i] for i, d in enumerate(([-1, 0, 0], [0, -1, 0], [0, 0, -1]))]
    hi = [extreme(model, d)[i] for i, d in enumerate(([1, 0, 0], [0, 1, 0], [0, 0, 1]))]
    return {"volume": mp.Volume / IN ** 3, "area": mp.SurfaceArea / IN ** 2, "centroid": [c / IN for c in com],
            "faces": faces, "faceTypes": ftypes, "bodies": len(bl), "bbox": lo + hi,
            "tree": [val(f, "Name") for f in features(model) if val(f, "GetTypeName2") not in
                     ("CommentsFolder", "FavoriteFolder", "HistoryFolder", "SelectionSetFolder", "SensorFolder",
                      "DocsFolder", "DetailCabinet", "SurfaceBodyFolder", "SolidBodyFolder", "EnvFolder",
                      "InkMarkupFolder", "EqnFolder", "MaterialFolder", "OriginProfileFeature", "RefPlane",
                      "MateReferenceGroupFolder", "MaterialFolder", "LiveSectionFolder", "MarkUpFolder")]}


# ---------------------------------------------------------------- parts
def plate_with_hole(model, w, d, h, hole_d):
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, w, d))
    extrude(model, s, h)
    s = sketch_on(model, top_at(model, h), lambda sm: circ(sm, 0, 0, hole_d / 2))
    try:
        extrude(model, s, 0, cut=True, through=True, flip=False)
    except RuntimeError:
        extrude(model, s, 0, cut=True, through=True, flip=True)


def p01(model):   # extrude 2 x 1 rect 1 in with 5 deg draft inward
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 2, 1))
    extrude(model, s, 1, draft=D5)


def p02(model):   # revolve: profile with a groove arc and a dome arc that ends on the axis
    def draw(sm):
        L(sm, 0, 0, 1, 0)
        L(sm, 1, 0, 1, 0.5)
        arc(sm, 1, 0.75, 1, 0.5, 1, 1.0, -1)          # groove, bulging into the part
        L(sm, 1, 1.0, 1, 1.5)
        arc(sm, 0.5, 1.5, 1, 1.5, 0, 1.5, 1)          # dome, ends on the axis
        L(sm, 0, 1.5, 0, 0)
        sm.CreateCenterLine(0, -0.5 * IN, 0, 0, 2.5 * IN, 0)
    s = sketch_on(model, P(model, 0), draw)
    model.ClearSelection2(True)
    sel(s, False, 0)
    f = model.FeatureManager.FeatureRevolve2(True, True, False, False, False, False, 0, 0, 2 * math.pi, 0, False,
                                             False, 0, 0, 0, 0, 0, True, True, True)
    if f is None:
        raise RuntimeError("revolve failed")


def p03(model):   # cylinder r 1 h 1, top rim fillet r 0.25 (convex)
    s = sketch_on(model, P(model, 1), lambda sm: circ(sm, 0, 0, 1))
    extrude(model, s, 1)
    fillet(model, 0.25, [(1, 1, 0)])


def p04(model):   # 3 x 3 x 1 plate, dia 1 through hole, fillet r 0.125 on the top hole edge
    plate_with_hole(model, 3, 3, 1, 1)
    fillet(model, 0.125, [(0.5, 1, 0)])


def p05(model):   # 3 x 3 x 0.5 plate + r 0.5 boss 1 tall, fillet r 0.125 at the boss root (concave)
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 3, 3))
    extrude(model, s, 0.5)
    s = sketch_on(model, top_at(model, 0.5), lambda sm: circ(sm, 0, 0, 0.5))
    extrude(model, s, 1)
    fillet(model, 0.125, [(0.5, 0.5, 0)])


BOX12 = [(0, 0, 0.75), (0, 0, -0.75), (0, 1, 0.75), (0, 1, -0.75),
         (1, 0, 0), (-1, 0, 0), (1, 1, 0), (-1, 1, 0),
         (1, 0.5, 0.75), (1, 0.5, -0.75), (-1, 0.5, 0.75), (-1, 0.5, -0.75)]


def p06(model):   # box 2 x 1.5 x 1, all 12 edges r 0.25
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 2, 1.5))
    extrude(model, s, 1)
    fillet(model, 0.25, BOX12)


def p07(model):   # box 2 x 2 x 2 at the origin corner; three fillets of r 0.5, 0.25, 0.375 meeting at (2, 2, 2)
    s = sketch_on(model, P(model, 1), lambda sm: poly(sm, [(0, 0), (2, 0), (2, -2), (0, -2)]))
    extrude(model, s, 2)
    fillet(model, 0.5, [(1, 2, 2)])
    fillet(model, 0.25, [(2, 2, 1)])
    fillet(model, 0.375, [(2, 1, 2)])


def p08(model):   # 3 x 3 x 1 plate, dia 1 hole, 0.1 x 45 chamfer on the top hole edge
    plate_with_hole(model, 3, 3, 1, 1)
    chamfer(model, 0.1, [(0.5, 1, 0)])


def p09(model):   # 3 x 2 x 1.5 box, vertical edges r 0.5, shell 0.1 inward, top open
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 3, 2))
    extrude(model, s, 1.5)
    fillet(model, 0.5, [(1.5, 0.75, 1), (1.5, 0.75, -1), (-1.5, 0.75, 1), (-1.5, 0.75, -1)])
    model.ClearSelection2(True)
    face_at(model, 0, 1.5, 0)()
    model.InsertFeatureShell(0.1 * IN, False)


def hole_wizard(model, kind, at, size):
    """kind 0 cbore (ANSI Inch Socket Head Cap Screw) / 1 csk (ANSI Inch Flat Head 82), through all, normal fit.
    The Value arguments are -1 so SolidWorks takes its own table; read back afterwards."""
    model.ClearSelection2(True)
    face_at(model, *at)()
    fast = 9 if kind == 0 else 15
    f = model.FeatureManager.HoleWizard5(kind, 0, fast, size, 1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                         -1, -1, -1, "", False, True, True, True, True, False)
    if f is None:
        raise RuntimeError("HoleWizard5 failed")
    d = val(f, "GetDefinition")
    out = {"type": d.Type, "fit": None, "dia": d.HoleDiameter / IN}
    for k in ("CounterBoreDiameter", "CounterBoreDepth", "CounterSinkDiameter", "CounterSinkAngle", "Fit"):
        try:
            v = getattr(d, k)
            out[k] = math.degrees(v) if k == "CounterSinkAngle" else v if k == "Fit" else v / IN
        except Exception as e:  # noqa: BLE001
            out[k] = str(e)[:60]
    return f, out


def p10(model):   # 3 x 2 x 0.75 plate, 1/4 counterbore (x -0.75) and 1/4 82 deg countersink (x 0.75), through
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 3, 2))
    extrude(model, s, 0.75)
    _, cb = hole_wizard(model, 0, (-0.75, 0.75, 0), "1/4")
    _, ck = hole_wizard(model, 1, (0.75, 0.75, 0), "1/4")
    return {"cbore": cb, "csk": ck}


def p11(model):   # loft: 2 x 2 square on Top (y 0) to a r 1 circle 2 above
    s1 = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 2, 2))
    s2 = sketch_on(model, top_at(model, 2), lambda sm: circ(sm, 0, 0, 1))
    model.ClearSelection2(True)
    sel(s1, False, 1)
    sel(s2, True, 1)
    f = model.FeatureManager.InsertProtrusionBlend2(False, True, False, 1, 0, 0, 1, 1, True, True, False, 0, 0, 0,
                                                    True, True, True, 0)
    if f is None:
        raise RuntimeError("loft failed")


def p12(model):   # sweep: r 0.25 circle on Top at the origin along a 90 deg arc of r 2 on Front centred (2, 0)
    prof = sketch_on(model, P(model, 1), lambda sm: circ(sm, 0, 0, 0.25))
    path = sketch_on(model, P(model, 0), lambda sm: arc(sm, 2, 0, 0, 0, 2, 2, -1))
    model.ClearSelection2(True)
    sel(prof, False, 1)
    sel(path, True, 4)
    f = model.FeatureManager.InsertProtrusionSwept4(False, False, 0, False, False, 0, 0, False, 0, 0, 0, 0, True, True,
                                                    True, 0, True, False, 0, 0)
    if f is None:
        raise RuntimeError("sweep failed")


def p13(model):   # rib: L section (base 4 x 0.25, wall 0.25 x 3) 2 deep mid-plane; rib line (0.25, 2)-(3, 0.25), t 0.25
    s = sketch_on(model, P(model, 0), lambda sm: poly(sm, [(0, 0), (4, 0), (4, 0.25), (0.25, 0.25), (0.25, 3), (0, 3)]))
    extrude(model, s, 2, mid=True)
    v0 = val(model.Extension, "CreateMassProperty").Volume
    s = sketch_on(model, P(model, 0), lambda sm: L(sm, 0.25, 2, 3, 0.25))
    for rev in (False, True):
        model.ClearSelection2(True)
        sel(s, False, 0)
        model.FeatureManager.InsertRib(True, False, 0.25 * IN, 0, rev, False, False, 0, False, False)
        model.ForceRebuild3(False)
        if val(model.Extension, "CreateMassProperty").Volume > v0 * 1.0001:
            return {"ribReverseMaterial": rev}
        model.EditUndo2(1)
    raise RuntimeError("rib failed")


def p14(model):   # Draft 5 deg on the +X side of a 2 x 2 x 1 box, neutral face the bottom
    s = sketch_on(model, P(model, 1), lambda sm: crect(sm, 0, 0, 2, 2))
    extrude(model, s, 1)
    v0 = val(model.Extension, "CreateMassProperty").Volume
    for flip in (False, True):
        model.ClearSelection2(True)
        face_at(model, 0, 0, 0, False, 1)()
        face_at(model, 1, 0.5, 0, True, 2)()
        f = model.FeatureManager.InsertMultiFaceDraft(D5, flip, False, 0, False, False)
        model.ForceRebuild3(False)
        if f is not None and val(model.Extension, "CreateMassProperty").Volume < v0 * 0.9999:
            return {"draftFlip": flip}
        if f is not None:
            model.EditUndo2(1)
    raise RuntimeError("draft failed")


def boss_and_fillet(model, cx, top, r=0.25, h=0.5, rf=0.1):
    s = sketch_on(model, top_at(model, top), lambda sm: circ(sm, cx, 0, r))
    b = extrude(model, s, h)
    f = fillet(model, rf, [(cx + r, top + h, 0)])
    return b, f


def p15(model):   # 4 x 2 x 0.25 plate x 0..4; boss r 0.25 h 0.5 at x 0.5 with r 0.1 rim fillet; LPattern x 3 @ 1.5
    s = sketch_on(model, P(model, 1), lambda sm: poly(sm, [(0, -1), (4, -1), (4, 1), (0, 1)]))
    extrude(model, s, 0.25)
    b, f = boss_and_fillet(model, 0.5, 0.25)
    model.ClearSelection2(True)
    model.Extension.SelectByID2("", "EDGE", 2 * IN, 0.25 * IN, 1 * IN, False, 1, nothing(), 0)   # x-direction edge
    sel(b, True, 4)
    sel(f, True, 4)
    for flip in (False, True):
        pf = model.FeatureManager.FeatureLinearPattern5(3, 1.5 * IN, 1, 0, flip, False, "NULL", "NULL", False, False,
                                                        False, False, False, False, True, True, False, False, 0, 0,
                                                        False, False)
        if pf is not None:
            model.ForceRebuild3(False)
            if extreme(model, [1, 0, 0])[0] < 4.01 and measure(model)["faces"] > 12:
                return {"patternFlip": flip}
            model.EditUndo2(1)
            model.ClearSelection2(True)
            model.Extension.SelectByID2("", "EDGE", 2 * IN, 0.25 * IN, 1 * IN, False, 1, nothing(), 0)
            sel(b, True, 4)
            sel(f, True, 4)
    raise RuntimeError("linear pattern failed")


def p16(model):   # r 2 disk 0.25 thick; boss r 0.25 h 0.5 at x 1.25 with r 0.1 rim fillet; CirPattern 6 x 60 deg about Y
    s = sketch_on(model, P(model, 1), lambda sm: circ(sm, 0, 0, 2))
    extrude(model, s, 0.25)
    model.ClearSelection2(True)
    s = sketch_on(model, top_at(model, 0.25), lambda sm: circ(sm, 1.25, 0, 0.25))
    b = extrude(model, s, 0.5)
    f = fillet(model, 0.1, [(1.5, 0.75, 0)])
    model.ClearSelection2(True)
    if not model.Extension.SelectByID2("", "FACE", 2 * IN, 0.125 * IN, 0, False, 1, nothing(), 0):   # disk rim: axis
        raise RuntimeError("no rim face")
    sel(b, True, 4)
    sel(f, True, 4)
    pf = model.FeatureManager.FeatureCircularPattern5(6, 2 * math.pi, False, "NULL", False, True, False, False, False,
                                                      False, 1, 0, "NULL", False)
    if pf is None:
        raise RuntimeError("circular pattern failed")


PARTS = [("P01_extrude_draft", p01), ("P02_revolve_arcs", p02), ("P03_cyl_rim_fillet", p03),
         ("P04_hole_edge_fillet", p04), ("P05_boss_root_fillet", p05), ("P06_box_fillet_all", p06),
         ("P07_corner_unequal_fillets", p07), ("P08_hole_chamfer", p08), ("P09_shell_filleted_box", p09),
         ("P10_cbore_csk", p10), ("P11_loft_rect_circle", p11), ("P12_sweep_arc", p12), ("P13_rib", p13),
         ("P14_draft_face", p14), ("P15_lpattern_filleted_boss", p15), ("P16_cpattern_filleted_boss", p16)]


def main():
    os.makedirs(OUT, exist_ok=True)
    want = [a.upper() for a in sys.argv[1:]]
    sw = sw_app()
    jpath = os.path.join(OUT, "solids.json")
    res = json.load(open(jpath)) if os.path.exists(jpath) else {}
    for name, fn in PARTS:
        if want and name.split("_")[0] not in want:
            continue
        model = new_part(sw)
        CUR[0] = model
        try:
            extra = fn(model) or {}
            m = measure(model)
            m.update(extra)
            path = os.path.join(OUT, name + ".SLDPRT")
            err = model.SaveAs3(path, 0, 1)
            m["saved"] = path if not err else "SaveAs3 error %s" % err
            res[name] = m
            print(name, json.dumps({k: m[k] for k in ("volume", "area", "faces")}))
        except Exception as e:  # noqa: BLE001
            res[name] = {"error": str(e)[:300]}
            print(name, "FAILED", e)
            traceback.print_exc()
        finally:
            sw.CloseDoc(val(model, "GetTitle"))
    with open(jpath, "w") as fh:
        json.dump(res, fh, indent=1)


if __name__ == "__main__":
    main()
