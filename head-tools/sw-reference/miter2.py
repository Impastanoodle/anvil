"""Lane DU (2026-10-27): miter flange, second try (lane DO's miter.py got Nothing back every time).

Cause found: the edges were picked with SelectByID2 at a point, which looks along the view (after a Right-plane
sketch it took the end face's short edge). Edges are now found by geometry (find_edge) and selected with Select4;
then every selection order / mark combination works (sketch mark 0, edges mark 1 or 0).

    python miter2.py probe | probe2 | probe3 | diag  -> prints what each attempt made (diag: what got selected)
    python miter2.py measure      -> miter-inside-gap0.01-start{0,0.25}.SLDPRT + miter2.json
"""
import sys

from swref import *

MITER_TYPES = ("SMMiteredFlange", "MiterFlange", "SMMiterFlange")


def new_types(before, m):
    return [val(f, "GetTypeName2") + ":" + val(f, "Name") for f in features(m)][len(before):]


def profile_right(m, length=1.0):
    right = plane(m, 2)
    # Right plane: sketch x = -Z, y = Y; SolidWorks' sheet is y -T..0, so the top face is y = 0 (Anvil y = T)
    return sketch_lines(m, lambda: right.Select2(False, 0), [(-2, 0, -2, length)])


def find_edge(m, a, b, tol=1e-5):
    """The body edge from a to b (either way round; Anvil frame, inches)."""
    A = [a[0], a[1] - YSHIFT, a[2]]
    B = [b[0], b[1] - YSHIFT, b[2]]
    for bd in bodies(m):
        for e in items(val(bd, "GetEdges")):
            try:
                p = [x / IN for x in val(val(e, "GetStartVertex"), "GetPoint")]
                q = [x / IN for x in val(val(e, "GetEndVertex"), "GetPoint")]
            except Exception:
                continue
            d1 = max(abs(p[i] - A[i]) for i in range(3)) + max(abs(q[i] - B[i]) for i in range(3))
            d2 = max(abs(p[i] - B[i]) for i in range(3)) + max(abs(q[i] - A[i]) for i in range(3))
            if min(d1, d2) < tol:
                return e
    return None


def select_entity(m, ent, mark, append=True):
    sd = val(m.SelectionManager, "CreateSelectData")
    sd.Mark = mark
    return bool(ent.Select4(append, sd))


# The top face's z = 2 edge (x 0..4) and x = 4 edge (z 0..2).  NOT by SelectByID2 at a point: after a sketch on the
# Right plane the view looks along X and SelectByID2 (2, 0, 2) picks the short end edge at x = 0 (lane DO's
# miter "blocked" was this: the first edge was the T-long edge of the end face).
TOP_EDGES = (((0, T, 2), (4, T, 2)), ((4, T, 2), (4, T, 0)))


def select_edges(m, mark, edges=TOP_EDGES, append=True):
    ok = []
    for a, b in edges:
        e = find_edge(m, a, b)
        ok.append(e is not None and select_entity(m, e, mark, append))
    return ok


def call(m, pos=1, gap=0.01, start=0.0, end=0.0, defaults=True):
    fm = m.FeatureManager
    if defaults:
        return fm.InsertSheetMetalMiterFlange(True, 0.0, gap * IN, True, False, 0.0, 0.0, 0.0, 1, False, pos,
                                              start * IN, end * IN, nothing())
    return fm.InsertSheetMetalMiterFlange(False, R * IN, gap * IN, False, True, 0.5, 0.0, 0.0, 1, False, pos,
                                          start * IN, end * IN, nothing())


def probe(sw):
    rows = []
    attempts = [
        ("sketch Select2 mark0, edges mark1", 0, 1, "select2"),
        ("sketch SelectByID2 mark0, edges mark1", 0, 1, "byid"),
        ("sketch SelectByID2 mark0, edges mark0", 0, 0, "byid"),
        ("sketch segment (line) mark0, edges mark1", 0, 1, "segment"),
        ("sketch mark4, edges mark1", 4, 1, "byid"),
    ]
    for label, skmark, emark, how in attempts:
        for defaults in (True, False):
            m = new_part(sw)
            try:
                base_flange_top(m)
                sk = profile_right(m)
                m.ClearSelection2(True)
                if how == "select2":
                    sk.Select2(False, skmark)
                elif how == "byid":
                    m.Extension.SelectByID2(val(sk, "Name"), "SKETCH", 0, 0, 0, False, skmark, nothing(), 0)
                else:
                    seg = items(val(val(sk, "GetSpecificFeature2"), "GetSketchSegments"))[0]
                    seg.Select4(False, nothing())
                sel = select_edges(m, emark)
                nsel = m.SelectionManager.GetSelectedObjectCount2(-1)
                before = features(m)
                f = call(m, defaults=defaults)
                made = new_types(before, m)
                rows.append((label, "defaults" if defaults else "custom", sel, nsel, f is not None, made))
                print(rows[-1], flush=True)
            finally:
                close_unsaved(sw, m)
    return rows


def probe2(sw):
    """The profile sketch left open (active) while the edges are selected and the call is made; and the profile on
    the base's end face."""
    rows = []
    for variant in ("active-right", "active-right-line-selected", "endface", "active-endface", "L-profile"):
        for emark in (0, 1):
            m = new_part(sw)
            try:
                base_flange_top(m)
                m.ClearSelection2(True)
                if "endface" in variant:
                    ok = select_at(m, "FACE", 0, T / 2, 1)
                else:
                    ok = plane(m, 2).Select2(False, 0)
                sm = m.SketchManager
                sm.InsertSketch(True)
                sm.AddToDB = True
                if "endface" in variant:
                    # a face sketch's frame is SolidWorks' choice: draw in model space via the sketch transform
                    sk = val(m, "GetActiveSketch2")
                    xf = val(sk, "ModelToSketchTransform")
                    mu = sw.GetMathUtility
                    def to_sk(x, y, z):
                        p = mu.CreatePoint(dvec(x * IN, (y - YSHIFT) * IN, z * IN))
                        q = val(p.MultiplyTransform(xf), "ArrayData")
                        return q[0], q[1]
                    a, b = to_sk(0, T, 2), to_sk(0, T + 1, 2)
                    seg = sm.CreateLine(a[0], a[1], 0, b[0], b[1], 0)
                elif variant == "L-profile":
                    seg = sm.CreateLine(-2 * IN, 0, 0, -2 * IN, 1 * IN, 0)
                    sm.CreateLine(-2 * IN, 1 * IN, 0, -1.5 * IN, 1 * IN, 0)
                else:
                    seg = sm.CreateLine(-2 * IN, 0, 0, -2 * IN, 1 * IN, 0)
                sm.AddToDB = False
                active = variant.startswith("active")
                if not active:
                    sm.InsertSketch(True)
                    sk = [f for f in features(m) if val(f, "GetTypeName2") == "ProfileFeature"][-1]
                    m.ClearSelection2(True)
                    sk.Select2(False, 0)
                else:
                    m.ClearSelection2(True)
                    if variant.endswith("line-selected"):
                        seg.Select4(False, nothing())
                sel = select_edges(m, emark)
                n = m.SelectionManager.GetSelectedObjectCount2(-1)
                before = features(m)
                f = call(m)
                if active and f is None:
                    sm.InsertSketch(True)                 # leave the sketch, then look again
                made = new_types(before, m)
                rows.append((variant, "edge mark %d" % emark, ok, sel, n, f is not None, made))
                print(rows[-1], flush=True)
            except Exception as e:
                print(variant, emark, "exception", e, flush=True)
            finally:
                close_unsaved(sw, m)
    return rows


def probe3(sw):
    """Edges selected first, then the sketch (marks 0 / 1 / 4 each)."""
    rows = []
    for emark, skmark in ((0, 0), (1, 0), (1, 4), (0, 4), (4, 1)):
        m = new_part(sw)
        try:
            base_flange_top(m)
            sk = profile_right(m)
            m.ClearSelection2(True)
            sel = select_edges(m, emark, append=True)
            m.Extension.SelectByID2(val(sk, "Name"), "SKETCH", 0, 0, 0, True, skmark, nothing(), 0)
            n = m.SelectionManager.GetSelectedObjectCount2(-1)
            before = features(m)
            f = call(m)
            rows.append(("edges first", emark, "sketch", skmark, sel, n, f is not None, new_types(before, m)))
            print(rows[-1], flush=True)
        finally:
            close_unsaved(sw, m)
    return rows


def diag(sw):
    """Where the selected edges and the profile line really are (model inches, SolidWorks' own frame)."""
    m = new_part(sw)
    try:
        base_flange_top(m)
        sk = profile_right(m)
        print("part box (SW frame)", [v / IN for v in m.GetPartBox(True)])
        skd = val(sk, "GetSpecificFeature2")
        xf = val(skd, "ModelToSketchTransform")
        print("sketch xform", [round(v, 4) for v in val(val(xf, "Inverse"), "ArrayData")])
        for s in items(val(skd, "GetSketchSegments")):
            p0, p1 = val(s, "GetStartPoint2"), val(s, "GetEndPoint2")
            print("line (sketch)", p0.X / IN, p0.Y / IN, p1.X / IN, p1.Y / IN)
        m.ClearSelection2(True)
        select_edges(m, 1)
        smg = m.SelectionManager
        for i in range(1, smg.GetSelectedObjectCount2(-1) + 1):
            e = smg.GetSelectedObject6(i, -1)
            a, b = val(val(e, "GetStartVertex"), "GetPoint"), val(val(e, "GetEndVertex"), "GetPoint")
            print("edge", i, [x / IN for x in a], [x / IN for x in b], "mark", smg.GetSelectedObjectMark(i))
    finally:
        close_unsaved(sw, m)


def flat_detail(m):
    """Flat-Pattern unsuppressed: box, volume, and the corner of the blank's top-face outline (the vertices that are
    not on the base's own 0..4 x 0..2 corners), Anvil frame."""
    fp = feature_of_type(m, "FlatPattern")
    fp.SetSuppression2(1, 2, nothing())
    rebuild(m)
    try:
        box = part_box(m)
        vol = volume(m)
        top = sorted({(round(v[0], 6), round(v[2], 6)) for v in vertices(m) if abs(v[1] - T) < 1e-6})
    finally:
        fp.SetSuppression2(0, 2, nothing())
        rebuild(m)
    return {"box": box, "size": [box[3] - box[0], box[5] - box[2]], "volume": vol, "topVertices": top}


def measure_miter(sw, start=0.0, gap=0.01, pos=1):
    m = new_part(sw)
    name = "miter-inside-gap%g-start%g" % (gap, start)
    try:
        base_flange_top(m)
        sk = profile_right(m)
        m.ClearSelection2(True)
        sk.Select2(False, 0)
        sel = select_edges(m, 1)
        f = call(m, pos=pos, gap=gap, start=start)
        if f is None:
            raise RuntimeError("miter flange made nothing (edges %s)" % sel)
        rebuild(m)
        d = val(f, "GetDefinition")
        res = {"case": name, "gap": gap, "start": start,
               "data": {"gap": d.GapDistance / IN, "radius": d.BendRadius / IN, "position": d.PositionType,
                        "start": d.StartOffset / IN, "end": d.EndOffset / IN},
               "volume": volume(m), "box": part_box(m),
               "ymax": extreme(m, (0, 1, 0))[1], "xmax": extreme(m, (1, 0, 0))[0], "zmax": extreme(m, (0, 0, 1))[2],
               "xmin": extreme(m, (-1, 0, 0))[0], "zmin": extreme(m, (0, 0, -1))[2]}
        res["flat"] = flat_detail(m)
        res["file"] = save_close(sw, m, name)
        return res
    except Exception:
        close_unsaved(sw, m)
        raise


if __name__ == "__main__":
    sw = sw_app()
    if sys.argv[1:2] == ["measure"]:
        out = [measure_miter(sw, 0.0), measure_miter(sw, 0.25)]
        for r in out:
            print(r["case"], r["data"], "vol", r["volume"], "box", r["box"], "flat", r["flat"]["size"], r["flat"]["volume"])
            print("   flat top vertices", r["flat"]["topVertices"])
        dump("miter2", out)
    if sys.argv[1:2] == ["diag"]:
        diag(sw)
    if sys.argv[1:2] == ["probe3"]:
        probe3(sw)
    if sys.argv[1:2] == ["probe"]:
        probe(sw)
    if sys.argv[1:2] == ["probe2"]:
        probe2(sw)
