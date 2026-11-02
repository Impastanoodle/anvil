"""SolidWorks reference, second pass (lane swref, 2026-11-02): sheet-metal calls for Replay (ref2_script.py)."""
import math

from ref2 import *  # noqa: F401,F403

SKETCH_OPS, PART_OPS = {}, {}
GAUGE = {"14": (0.0747, 0.0747)}          # Anvil's gauge table row (rfFT M27)


def sheet(rp, a):
    o = a[3] if len(a) > 3 and isinstance(a[3], dict) else {}
    T, R, K = a[0], a[1], a[2]
    if T is None:
        T, R = GAUGE[str(o.get("gauge"))]
    rp.sheet = {"T": T, "R": R, "K": K if K is not None else 0.5, "opts": o}


def set_ba(cba, s):
    o = s["opts"]
    if o.get("bendAllowanceType") == "deduction":
        cba.Type = 4                                 # swBendAllowanceDeduction
        cba.BendDeduction = o["bendDeduction"] * IN
    elif o.get("bendAllowanceType") == "allowance":
        cba.Type = 3                                 # swBendAllowanceDirect
        cba.BendAllowance = o["bendAllowance"] * IN
    else:
        cba.Type = 2                                 # swBendAllowanceKFactor
        cba.KFactor = s["K"]


def set_defaults(rp, s, ratio=0.5):
    c, m = rp.c, rp.m
    sm = c.feature_of_type("SheetMetal")
    d = val(sm, "GetDefinition")
    d.AccessSelections(m, nothing())
    cba = val(d, "GetCustomBendAllowance")
    set_ba(cba, s)
    d.SetCustomBendAllowance(cba)
    d.UseAutoRelief = True
    d.AutoReliefType = 1                             # rectangular
    d.ReliefRatio = ratio
    sm.ModifyDefinition(d, m, nothing())


def base_flange(rp, sk):
    c, m = rp.c, rp.m
    s = rp.sheet
    u = IN * c.scale
    m.ClearSelection2(True)
    c.sel(sk)
    fm = rp.fm
    cba = val(fm, "CreateCustomBendAllowance")
    set_ba(cba, s)
    f = fm.InsertSheetMetalBaseFlange2(s["T"] * u, True, s["R"] * u, 0.0, 0.0, False, 0, 0, 0, cba, False, 1, 0.0, 0.0, 0.5, True,
                                       False, True, True)
    if f is None:
        return None
    c.yshift = s["T"] * c.scale
    set_defaults(rp, s)
    return f


def flat_light(rp):
    """Flat size and volume only: walking the flat body's vertices costs handles SolidWorks never gives back."""
    c, m = rp.c, rp.m
    fp = c.feature_of_type("FlatPattern")
    fp.SetSuppression2(1, 2, nothing())
    m.ForceRebuild3(False)
    try:
        box = [v / IN for v in m.GetPartBox(True)]
        vol = val(m, "GetMassProperties")[3] / IN ** 3
    finally:
        fp.SetSuppression2(0, 2, nothing())
        m.ForceRebuild3(False)
    return {"size": sorted([box[3] - box[0], box[4] - box[1], box[5] - box[2]], reverse=True), "volume": vol, "box": box}


def flat(rp):
    c, m = rp.c, rp.m
    fp = c.feature_of_type("FlatPattern")
    fp.SetSuppression2(1, 2, nothing())              # unsuppress, all configurations
    m.ForceRebuild3(False)
    try:
        box = [v / IN for v in m.GetPartBox(True)]
        vol = val(m, "GetMassProperties")[3] / IN ** 3
        n = len(c.bodies())
        size = sorted([box[3] - box[0], box[4] - box[1], box[5] - box[2]], reverse=True)
        wrong = c.whats_wrong()
        vs = []
        for b in c.bodies():
            for v in items(val(b, "GetVertices")):
                q = val(v, "GetPoint")
                vs.append((q[0] / IN, q[1] / IN, q[2] / IN))
        ax = min(range(3), key=lambda i: box[3 + i] - box[i])       # the thickness direction
        hi = max(v[ax] for v in vs)
        top = sorted({tuple(round(v[i], 6) for i in range(3) if i != ax) for v in vs if v[ax] > hi - 1e-6})
    finally:
        fp.SetSuppression2(0, 2, nothing())
        m.ForceRebuild3(False)
    return {"size": size, "volume": vol, "bodies": n, "box": box, "wrong": wrong, "top": top if len(top) < 80 else None}


# -------------------------------------------------------------------- flanges
FLANGE_POS = {"inside": 1, "outside": 2, "bendOutside": 3, "virtualSharp": 5}
FLANGE_DIM = {"outer": 1, "inner": 2, "tangent": 3, "wall": 3}


def near_edge(rp, at):
    """The straight edge an Anvil pick means: exact, or the nearest within 0.75 T (Anvil's EDGE_PICK_TOL)."""
    c = rp.c
    try:
        return c.edge_at(at)
    except RuntimeError:
        return c.edge_at(at, tol=0.8 * rp.sheet["T"] * c.scale * IN)


def flange_sketch(rp, edge, a, flip, L, sign):
    m = rp.m
    skf = m.InsertSketchForEdgeFlange(edge, a, flip)
    if skf is None:
        raise RuntimeError("InsertSketchForEdgeFlange failed")
    m.ClearSelection2(True)
    skf.Select2(False, 0)
    m.EditSketch()
    sk = val(m, "GetActiveSketch2")
    m.ClearSelection2(True)
    edge.Select4(False, nothing())
    m.SketchManager.SketchUseEdge(False)
    ln = items(val(sk, "GetSketchSegments"))[0]
    p0, p1 = val(ln, "GetStartPoint2"), val(ln, "GetEndPoint2")
    ex, ey = p1.X - p0.X, p1.Y - p0.Y
    el = math.hypot(ex, ey)
    nx, ny = -ey / el * L * sign, ex / el * L * sign
    sm = m.SketchManager
    sm.AddToDB = True
    try:
        sm.CreateLine(p0.X, p0.Y, 0, p0.X + nx, p0.Y + ny, 0)
        sm.CreateLine(p0.X + nx, p0.Y + ny, 0, p1.X + nx, p1.Y + ny, 0)
        sm.CreateLine(p1.X + nx, p1.Y + ny, 0, p1.X, p1.Y, 0)
    finally:
        sm.AddToDB = False
    sm.InsertSketch(True)
    return sk


def set_length(rp, f, L, dim):
    d = val(f, "GetDefinition")
    d.AccessSelections(rp.m, nothing())
    d.OffsetType = 1                                     # swFlangeOffsetBlind
    d.OffsetDimType = FLANGE_DIM[dim]
    d.OffsetDistance = L
    if not f.ModifyDefinition(d, rp.m, nothing()):
        raise RuntimeError("edge flange ModifyDefinition failed")


def edge_flange(rp, at, L0, o):
    c = rp.c
    s = rp.sheet
    u = IN * c.scale
    L, T, R = L0 * u, s["T"] * u, (o.get("radius") or s["R"]) * u
    a = math.radians(o.get("angle", 90))
    pos = o.get("position", "bendOutside")
    dim = o.get("lengthRef", "wall")
    flip = bool(o.get("reverse"))
    key = ",".join("%g" % x for x in at)
    if key in rp.over.get("pick", {}):                   # a reversed flange: SolidWorks takes the edge on the far side of the sheet
        at, flip = rp.over["pick"][key], False
    edge = near_edge(rp, at)
    bits = 1 + 128 + (2 if flip else 0)                  # 2 swInsertEdgeFlangeFlipDir
    if o.get("radius") is not None:
        bits -= 1
    f = None
    for sign in (1, -1):
        sk = flange_sketch(rp, edge, a, False, L, sign)
        for attempt in range(2):
            f = rp.fm.InsertSheetMetalEdgeFlange2(darr([edge]), darr([sk]), bits, a, R, FLANGE_POS[pos], L, 1, 0.5, 0.5 * T, 0.5 * T, 1, nothing())
            if f is not None:
                break
        if f is not None:
            break
        edge = near_edge(rp, at)
    if f is None:
        return None
    set_length(rp, f, L, dim)
    return f


def multi_flange(rp, ats, L0, o):
    """One Edge-Flange feature over several edges (mitred corners)."""
    c = rp.c
    s = rp.sheet
    u = IN * c.scale
    L, T, R = L0 * u, s["T"] * u, s["R"] * u
    a = math.radians(o.get("angle", 90))
    edges = [near_edge(rp, q) for q in ats]
    for sign in (1, -1):
        # the profile sketch drives a multi-edge flange: its top line is the wall's top (ModifyDefinition reaches only one edge)
        hgt = L - T if o.get("lengthRef") == "outer" else L
        sks = [flange_sketch(rp, e, a, False, hgt, sign) for e in edges]
        f = rp.fm.InsertSheetMetalEdgeFlange2(darr(edges), darr(sks), 1 + 128, a, R, FLANGE_POS[o.get("position", "bendOutside")], L, 1, 0.5,
                                              0.5 * T, 0.5 * T, 1, nothing())
        if f is not None:
            return f
        edges = [near_edge(rp, q) for q in ats]
    return None


def flange(rp, a):
    L, edges = a[0], a[1]
    o = a[2] if len(a) > 2 else {}
    if o.get("miter") and len(edges) > 1:
        return multi_flange(rp, edges, L, o)
    f = None
    for at in edges:
        f = edge_flange(rp, at, L, o)
        if f is None:
            return None
    return f


PART_OPS["flange"] = flange
HEM = {"open": 0, "closed": 1, "teardrop": 2, "rolled": 3}


def hem(rp, a):
    c, m = rp.c, rp.m
    s = rp.sheet
    u = IN * c.scale
    L, edges = a[0], a[1]
    o = a[2] if len(a) > 2 else {}
    kind = o.get("hemType", "open")
    gap = o.get("gap", s["T"] / 2)
    ang = o.get("hemAngle", 270)
    rad = o.get("hemRadius", s["R"])
    f = None
    for at in edges:
        for attempt in range(3):
            m.ClearSelection2(True)
            c.pick(near_edge(rp, at), False, 0)
            # no hemPosition in Anvil = Material Outside; which side the fold takes: rp.over["hemReverse"]
            f = rp.fm.InsertSheetMetalHem2(HEM[kind], 0 if o.get("hemPosition") == "inside" else 1, bool(o.get("reverse")) != bool(rp.over.get("hemReverse")), L * u, gap * u,
                                           math.radians(ang), rad * u, 0.0, nothing(), True, 1, 0, True, 0.5, 0.0, 0.0)
            if f is not None:
                break
        if f is None:
            return None
    return f


PART_OPS["hem"] = hem


def sketch_op_face(op):
    return op in ("jog", "sketchedBend", "tab")


def sketch_jog(rp, sk, a):
    c, m = rp.c, rp.m
    s = rp.sheet
    u = IN * c.scale
    off = a[0]
    o = a[1] if len(a) > 1 else {}
    ang = o.get("angle", 90)
    fix = bool(o.get("fixLength"))
    pos = {"centerline": 1, "inside": 2, "outside": 3, "bendOutside": 4}[o.get("position", "centerline")]
    dim = {"inside": 1, "outside": 2, "overall": 3}[o.get("offsetRef", "outside")]
    fixed = o.get("fixed")
    n0 = len([f for f in c.features() if val(f, "GetTypeName2") == "Jog"])
    q = c._sw(fixed)
    for attempt in range(4):
        m.ClearSelection2(True)
        c.sel(sk, False, 0)
        m.Extension.SelectByID2("", "FACE", q[0], q[1], q[2], True, 0, nothing(), 0)
        m.InsertSheetMetalJog(float(ang), (o.get("radius") or s["R"]) * u, off * u, False, fix, dim, pos)
        jl = [f for f in c.features() if val(f, "GetTypeName2") == "Jog"]
        if len(jl) > n0:
            jf = jl[-1]
            jd = val(jf, "GetDefinition")
            jd.AccessSelections(m, nothing())
            jd.DimensionPositionType = dim
            jd.JogPositionType = pos
            jd.FixProjectedLength = fix
            if not o.get("reverse"):             # SolidWorks' default direction is away from the sketched face, Anvil's reverse
                jd.ReverseDirection = True
            jf.ModifyDefinition(jd, m, nothing())
            return jf
    return None


SKETCH_OPS["jog"] = sketch_jog


def sketched_bend(rp, sk, a):
    c, m = rp.c, rp.m
    ang = a[0]
    o = a[1] if len(a) > 1 else {}
    pos = {"centerline": 0, "inside": 1, "outside": 2, "bendOutside": 3}[o.get("position", "centerline")]
    fixed = o.get("fixed") or rp.over.get("fixed")
    m.ClearSelection2(True)
    c.sel(sk, False, 0)
    if fixed:
        q = c._sw(fixed)
        m.Extension.SelectByID2("", "FACE", q[0], q[1], q[2], True, 0, nothing(), 0)
    return rp.fm.InsertSheetMetal3dBend(math.radians(ang), True, 0.0, bool(o.get("reverse")), pos, nothing())


SKETCH_OPS["sketchedBend"] = sketched_bend


def closed_corner(rp, a):
    c, m = rp.c, rp.m
    s = rp.sheet
    faces = a[0]
    o = a[1] if len(a) > 1 else {}
    kinds = {"butt": 1, "overlap": 2, "underlap": 3}
    made = None
    rp.corner_data = []
    for at in faces + rp.over.get("extraFaces", []):
        fe = c.face_at(at)
        n = fe.Normal
        q = [at[0] + n[0] * s["R"], at[1] + n[1] * s["R"], at[2] + n[2] * s["R"]]
        fm_ = c.face_at(q)
        m.ClearSelection2(True)
        c.pick(fe, True, 1)
        c.pick(fm_, True, 1073741824)
        m.InsertSheetMetalClosedCorner()
        cf = [f for f in c.features() if val(f, "GetTypeName2") == "CornerFeat"]
        if not cf:
            return None
        made = cf[-1]
        d = val(made, "GetDefinition")
        d.AccessSelections(m, nothing())
        d.CornerType = kinds[o.get("cornerType", "butt")]
        d.GapDistance = o.get("gap", 0.01) * IN * c.scale
        d.OpenBendRegion = not o.get("closeBend")
        try:
            d.OverlapUnderlapRatio = o.get("ratio", 1)
        except Exception:  # noqa: BLE001
            pass
        if not made.ModifyDefinition(d, m, nothing()):
            return None
        d = val(made, "GetDefinition")
        rp.corner_data.append({"type": d.CornerType, "gap": d.GapDistance / IN, "open": d.OpenBendRegion, "ratio": d.OverlapUnderlapRatio})
    return made


PART_OPS["closedCorner"] = closed_corner


def bend_subfeatures(rp):
    out = []
    for f in rp.c.features():
        sf = val(f, "GetFirstSubFeature")
        while sf is not None:
            if val(sf, "GetTypeName2") in ("OneBend", "SketchBend"):
                out.append(sf)
            sf = val(sf, "GetNextSubFeature")
    return out


def unfold(rp, a):
    c, m = rp.c, rp.m
    fixed = a[0]
    fb = c.face_at(fixed)
    rp.fixed_at = fixed
    m.ClearSelection2(True)
    c.pick(fb, False, 1)
    for b in bend_subfeatures(rp):
        b.Select2(True, 4)
    m.InsertSheetMetalUnfold()
    fs = [f for f in c.features() if val(f, "GetTypeName2") == "UnFold"]
    rp.unfolded = fs[-1] if fs else None
    return rp.unfolded


def fold(rp, a):
    c, m = rp.c, rp.m
    m.ClearSelection2(True)
    c.sel(rp.unfolded, False, 0)
    c.pick(c.face_at(rp.fixed_at), True, 1)
    for b in bend_subfeatures(rp):
        b.Select2(True, 4)
    m.InsertSheetMetalFold()
    fs = [f for f in c.features() if val(f, "GetTypeName2") == "Fold"]
    return fs[-1] if fs else None


PART_OPS["unfold"] = unfold
PART_OPS["fold"] = fold


def break_corner(rp, a):
    c, m = rp.c, rp.m
    size = a[0]
    o = a[2] if len(a) > 2 else {}
    m.ClearSelection2(True)
    for i, q in enumerate(o.get("faces", [])):
        c.pick(c.face_at(q), i > 0, 0)
    m.InsertSheetMetalBreakCorner(0 if o.get("kind") == "fillet" else 1, size * c.scale * IN)
    hits = [f for f in c.features() if "Corner" in val(f, "GetTypeName2") or "Break" in val(f, "Name")]
    return hits[-1] if hits else None


PART_OPS["breakCorner"] = break_corner


def tab(rp, sk, a):
    c, m = rp.c, rp.m
    s = rp.sheet
    m.ClearSelection2(True)
    c.sel(sk)
    return rp.fm.InsertSheetMetalBaseFlange2(s["T"] * IN * c.scale, True, s["R"] * IN * c.scale, 0.0, 0.0, False, 0, 0, 0, nothing(), False, 1,
                                             0.0, 0.0, 0.5, True, True, True, True)


SKETCH_OPS["tab"] = tab


def miter_flange(rp, a):
    c, m = rp.c, rp.m
    edges = a[0]
    o = a[1] if len(a) > 1 else {}
    u = IN * c.scale
    sk = rp.last_sketch
    m.ClearSelection2(True)
    c.sel(sk, False, 0)
    for q in edges:
        if not c.pick(c.edge_at(q), True, 1):
            raise RuntimeError("miter edge pick failed")
    pos = {"inside": 1, "outside": 2, "bendOutside": 3}[o.get("position", "inside")]
    return rp.fm.InsertSheetMetalMiterFlange(True, 0.0, o.get("miterGap", 0.0) * u, True, False, 0.0, 0.0, 0.0, 1, False, pos,
                                             o.get("startOffset", 0) * u, o.get("endOffset", 0) * u, nothing())


PART_OPS["miterFlange"] = miter_flange


def rip(rp, a):
    c, m = rp.c, rp.m
    edges, gap = a[0], a[1]
    o = a[2] if len(a) > 2 else {}
    mark = {"both": 64, "side1": 16, "side2": 32}[o.get("direction", "both")]
    m.ClearSelection2(True)
    for i, q in enumerate(edges):
        c.pick(c.edge_at(q), i > 0, mark)
    n0 = len(c.features())
    m.InsertRip(gap * c.scale * IN)
    fs = c.features()
    return fs[-1] if len(fs) > n0 else None


PART_OPS["rip"] = rip


def insert_bends(rp, a):
    c, m = rp.c, rp.m
    fixed = a[0]
    o = a[1] if len(a) > 1 else {}
    if rp.sheet is None:
        rp.sheet = {"T": 0, "R": o["radius"], "K": 0.5, "opts": {}}
    m.ClearSelection2(True)
    c.pick(c.face_at(fixed), False, 0)
    ok = m.InsertBends2(o["radius"] * c.scale * IN, "", rp.sheet["K"], -1, False, 0.5, True)
    return True if ok else None


PART_OPS["insertBends"] = insert_bends
