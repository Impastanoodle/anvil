"""Unchecked items 1 to 5 (lane swcheck, 2026-11-02): sheet metal, SolidWorks against Anvil. Raw JSON in OUT\\sheet\\.

    python ref3_sheet.py <case prefixes> [--force]     cases: see CASES; a dumped case is skipped
"""
import math
import os
import sys
import time
import traceback

from ref3_core import *  # noqa: F401,F403
import ref2_script
ref2_script.SCRATCH = os.path.join(OUT, "tmp")
from ref2_script import record, evaluate, replay_case, Replay  # noqa: E402
import ref2_sheet as SH  # noqa: E402

T16 = 0.0598
HEAD = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\n'
PLATE = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n'


def run3(section, cases, argv=None):
    argv = sys.argv[1:] if argv is None else argv
    force = "--force" in argv
    want = [a for a in argv if not a.startswith("--")]
    ses = Ses()
    d = os.path.join(OUT, section)
    os.makedirs(d, exist_ok=True)
    for name, fn in cases.items():
        if want and not any(name == w or name.startswith(w) for w in want):
            continue
        path = os.path.join(d, name + ".json")
        if os.path.exists(path) and not force:
            continue
        guard(ses, name)
        t1 = time.time()
        try:
            res = fn(ses)
        except SystemExit:
            raise
        except Exception as e:  # noqa: BLE001
            res = {"exception": str(e)[:500], "trace": traceback.format_exc()[-1200:]}
            for t in list(ses.mine):
                try:
                    ses.sw.CloseDoc(t)
                except Exception:  # noqa: BLE001
                    pass
                ses.mine.discard(t)
        res["sec"] = round(time.time() - t1, 1)
        with open(path, "w") as fh:
            json.dump(r9(res), fh, indent=1, default=str)
        print(name, json.dumps(r9(res), default=str)[:1500], flush=True)
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


def face_info(c, fc):
    s = val(fc, "GetSurface")
    b = fc.GetBox
    box = [x / IN for x in (b() if callable(b) else b)]
    o = {"area": val(fc, "GetArea") / IN ** 2, "box": [box[0], box[1] + c.yshift, box[2], box[3], box[4] + c.yshift, box[5]]}
    if val(s, "IsPlane"):
        q = s.PlaneParams
        o["n"] = [round(x, 6) for x in q[:3]]
    return o


def tree(c):
    out = []
    for f in c.features():
        row = [val(f, "Name"), val(f, "GetTypeName2")]
        subs, sf = [], val(f, "GetFirstSubFeature")
        while sf is not None:
            subs.append([val(sf, "Name"), val(sf, "GetTypeName2")])
            sf = val(sf, "GetNextSubFeature")
        if subs:
            row.append(subs)
        out.append(row)
    return out


def sketch_of(feat):
    """Endpoints of a sketch feature's segments, inches, sketch frame."""
    sk = val(feat, "GetSpecificFeature2")
    segs = []
    for s in items(val(sk, "GetSketchSegments")):
        try:
            p, q = val(s, "GetStartPoint2"), val(s, "GetEndPoint2")
            segs.append({"type": s.GetType() if callable(s.GetType) else s.GetType, "cons": val(s, "ConstructionGeometry"), "a": [p.X / IN, p.Y / IN], "b": [q.X / IN, q.Y / IN]})
        except Exception as e:  # noqa: BLE001
            segs.append({"err": str(e)[:80]})
    return segs


# ------------------------------------------------------------------ 1 Cross-Break
def cross_break(ses, angle=None, radius=None, face_y=T16, name="xb"):
    chains = CH["plate"]
    rp = Replay(ses, chains).run()
    c, m, fm = rp.c, rp.m, rp.fm
    out = {"log": rp.log}
    v0 = c.measure(False)
    out["volume0"], out["bbox0"] = v0["volume"], v0["bbox"]
    out["flat0"] = SH.flat_light(rp)
    m.ClearSelection2(True)
    fc = c.face_at([1, face_y, 1])
    c.pick(fc, False, 0)
    try:
        d0 = fm.CreateDefinition(86)
        out["createDefinition"] = None if d0 is None else {"angle": d0.BreakAngle, "radius": d0.BreakRadius, "rev": d0.ReverseDirection}
    except Exception as e:  # noqa: BLE001
        out["createDefinition"] = "failed: " + str(e)[:120]
    m.ClearSelection2(True)
    c.pick(fc, False, 0)
    f = fm.InsertCrossBreak(math.radians(angle if angle is not None else 1) if angle != 0 else 0.0, (radius if radius is not None else T16) * IN)
    out["made"] = f is not None
    out["messages"] = ses.new_messages()
    out["tree"] = tree(c)
    if f is not None:
        d = val(f, "GetDefinition")
        d.AccessSelections(m, nothing())
        out["data"] = {"angleDeg": math.degrees(d.BreakAngle), "radius": d.BreakRadius / IN, "reverse": d.ReverseDirection}
        d.ReleaseSelectionAccess()
        sf = val(f, "GetFirstSubFeature")
        while sf is not None:
            if val(sf, "GetTypeName2") == "ProfileFeature":
                out["sketch"] = sketch_of(sf)
            sf = val(sf, "GetNextSubFeature")
        m.ForceRebuild3(False)
        v1 = c.measure(False)
        out["volume1"], out["bbox1"], out["faces"] = v1["volume"], v1["bbox"], v1["faces"]
        out["flat1"] = SH.flat_light(rp)
    return rp, out


def case_xb(ses):
    rp, out = cross_break(ses)
    ses.close(rp.m)
    return out


def case_xb0(ses):
    rp, out = cross_break(ses, 0, 0)
    ses.close(rp.m)
    return out


# ------------------------------------------------------------------ 2 Base Flange from an open profile
def open_base(ses, pts, depth=1.0, segs=None):
    c = Ctx(ses, 0.0, 1.0)
    m, fm = c.m, c.m.FeatureManager

    def draw(s):
        if segs:
            for a, b in segs:
                s.line(a[0], a[1], b[0], b[1])
        else:
            s.poly(pts, False)
    sk = c.sketch(c.plane("Front"), draw)
    m.ClearSelection2(True)
    c.sel(sk)
    cba = val(fm, "CreateCustomBendAllowance")
    cba.Type = 2
    cba.KFactor = 0.5
    f = fm.InsertSheetMetalBaseFlange2(T16 * IN, False, T16 * IN, depth * IN, 0.0, False, 0, 0, 0, cba, False, 1, 0.0, 0.0, 0.5, True, False, True, True)
    out = {"made": f is not None, "messages": ses.new_messages()}
    if f is None:
        ses.close(m)
        return out
    bfeat = c.feature_of_type("SMBaseFlange")
    d = val(bfeat, "GetDefinition")
    out["ReverseThickness"] = d.ReverseThickness
    if d.ReverseThickness:
        d.AccessSelections(m, nothing())
        d.ReverseThickness = False
        bfeat.ModifyDefinition(d, m, nothing())
        d = val(bfeat, "GetDefinition")
        out["ReverseThicknessAfter"] = d.ReverseThickness
    out["tree"] = tree(c)
    m.ForceRebuild3(False)
    me = c.measure(False)
    out.update({k: me[k] for k in ("volume", "bbox", "bodies", "faces")})
    fp = c.feature_of_type("FlatPattern")
    d = val(fp, "GetDefinition")
    d.AccessSelections(m, nothing())
    ff = val(d, "FixedFace2")
    out["fixed"] = face_info(c, ff) if ff is not None else None
    d.ReleaseSelectionAccess()
    out["flat"] = SH.flat_light(rp_like(c))
    ses.close(m)
    return out


class rp_like:
    def __init__(self, c):
        self.c, self.m = c, c.m


# ------------------------------------------------------------------ replayed scripts
def replay(code_id, after=None):
    def fn(ses):
        r = replay_case(ses, CH[code_id], None, save=False, after=after)
        r["code"] = CODES[code_id]
        r["anvil"] = AN[code_id]
        return r
    return fn


CODES = {
    "plate": PLATE,
    # 4 a flange trim passing the end of the sheet
    "trim_in5": HEAD + 'p.sketch("Top").rect(0, -0.5, 4, 0.5).end().baseFlange();\np.flange(1, [[2, 0.0598, 0.5]], { angle: 5, position: "inside", lengthRef: "outer" });\n',
    "trim_out150": HEAD + 'p.sketch("Top").rect(0, -0.1, 4, 0.1).end().baseFlange();\np.flange(1, [[2, 0.0598, 0.1]], { angle: 150, position: "outside", lengthRef: "outer" });\n',
    "trim_in15_ok": HEAD + 'p.sketch("Top").rect(0, -1, 4, 1).end().baseFlange();\np.flange(1, [[2, 0.0598, 1]], { angle: 15, position: "inside", lengthRef: "outer" });\n',
    # 5 Material Outside on a Butt corner
    "butt_out_tray": PLATE + 'p.flange(1, [[2, 0.0598, 2]], { position: "outside", lengthRef: "outer" });\np.flange(1, [[4, 0.0598, 1]], { position: "outside", lengthRef: "outer" });\n',
    # 5 miters on other corners
    "miter_sq120": HEAD + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, 0.0598, 4], [6, 0.0598, 2]], { angle: 120, position: "bendOutside", miter: true });\n',
    "miter_tz90": HEAD + 'p.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();\np.flange(1, [[3, 0.0598, 0], [5.5, 0.0598, 1.5]], { position: "bendOutside", miter: true });\n',
    "miter_L": PLATE + 'p.sketch("Right").line(0, 0.0598, 0, 1.0598).line(0, 1.0598, 0.5, 1.0598).end();\np.miterFlange([[2, 0.0598, 0], [0, 0.0598, 1]], { miterGap: 0.01 });\n',
}
def jogcode(A, pos, fix, off=0.5, x=3):
    return PLATE + 'p.sketch("Top", 0.0598).line(%g, 0, %g, -2).jog(%g, { fixed: [1, 0.0598, 1], angle: %g, position: "%s", offsetRef: "outside", reverse: true%s });\n' % (x, x, off, A, pos, ", fixLength: true" if fix else "")


T, R = T16, T16
TRAY_OUT = CODES["butt_out_tray"]
CODES.update({
    # 5 Jog Bend Outside: SolidWorks' message names Fix projected length and the angle
    "jog_mo45": jogcode(45, "outside", False),
    "jog_bo90_fix": jogcode(90, "bendOutside", True),
    "jog_bo60": jogcode(60, "bendOutside", False),
    "jog_bo45": jogcode(45, "bendOutside", False),
    "jog_bo45_fix": jogcode(45, "bendOutside", True),
    "jog_bo30": jogcode(30, "bendOutside", False),
    # a Miter Flange L profile that runs away from the sketch (rfDL's picks start at the sketch's own corner)
    "miter_L2": PLATE + 'p.sketch("Right").line(-2, 0.0598, -2, 1.0598).line(-2, 1.0598, -2.5, 1.0598).end();\np.miterFlange([[2, 0.0598, 2], [4, 0.0598, 1]], { position: "inside", miterGap: 0.01, relief: "rect" });\n',
    # 5 Material Outside Butt: wall B's end face to wall A's inside face
    "butt_out_open": TRAY_OUT + 'p.closedCorner([[%.4f, 0.6, %.4f]], { cornerType: "butt", gap: 0.01 });\n' % (4 + T / 2, 2 - R),
    "butt_out_closed": TRAY_OUT + 'p.closedCorner([[%.4f, 0.6, %.4f]], { cornerType: "butt", gap: 0.01, closeBend: true });\n' % (4 + T / 2, 2 - R),
    "butt_out_open_2": TRAY_OUT + 'p.closedCorner([[4, 0.6, %.4f]], { cornerType: "butt", gap: 0.01 });\n' % (2 + T / 2),
})
CH, AN = {}, {}
OPEN = {
    "L": [(0, 0), (2, 0), (2, 1)],
    "Lrev": [(2, 1), (2, 0), (0, 0)],
    "U": [(0, 1), (0, 0), (3, 0), (3, 1)],
    "Urev": [(3, 1), (3, 0), (0, 0), (0, 1)],
    "Z": [(0, 0), (2, 0), (2, 1), (4, 1)],
    "Zrev": [(4, 1), (2, 1), (2, 0), (0, 0)],
}
for k, v in OPEN.items():
    CODES["open_" + k] = HEAD + 'p.sketch("Front").polyline(%s, false).end().baseFlange(null, { depth: 1 });\n' % json.dumps([list(q) for q in v])


def butt_case(code_id, end, match, close):
    """A closed corner with the picks proven: the end face and the face it runs to are both named by a point."""
    def fn(ses):
        chains = [q for q in CH[code_id] if q[0][0] != "closedCorner"]
        rp = Replay(ses, chains).run()
        c, m = rp.c, rp.m
        out = {"log": rp.log, "code": CODES[code_id], "anvil": AN[code_id]}
        me = c.measure(False)
        out["volume0"] = me["volume"]
        fe, fm_ = c.face_at(end), c.face_at(match)
        out["endFace"], out["matchFace"] = face_info(c, fe), face_info(c, fm_)
        m.ClearSelection2(True)
        c.pick(fe, True, 1)
        c.pick(fm_, True, 1073741824)
        m.InsertSheetMetalClosedCorner()
        out["messages"] = ses.new_messages()
        cf = [f for f in c.features() if val(f, "GetTypeName2") == "CornerFeat"]
        out["made"] = bool(cf)
        if cf:
            d = val(cf[-1], "GetDefinition")
            d.AccessSelections(m, nothing())
            d.CornerType = 1
            d.GapDistance = 0.01 * IN
            d.OpenBendRegion = not close
            out["modified"] = bool(cf[-1].ModifyDefinition(d, m, nothing()))
            out["messages2"] = ses.new_messages()
            out["wrong"] = c.whats_wrong()
            me = c.measure()
            out.update({k: me.get(k) for k in ("volume", "bbox", "bodies", "faces", "faults")})
            out["flat"] = SH.flat(rp) if rp.c.feature_of_type("FlatPattern") is not None else None
        ses.close(m)
        return out
    return fn


def jog_modify(ses):
    """A jog made Material Outside (it builds), then edited to Bend Outside: every Fix projected length / direction, one document."""
    rp = Replay(ses, CH["jog_mo45"]).run()
    c, m = rp.c, rp.m
    out = {"log": rp.log, "rows": []}
    me = c.measure()
    out["start"] = {k: me.get(k) for k in ("volume", "bbox")}
    jf = c.feature_of_type("Jog")
    out["hasJog"] = jf is not None
    if jf is None:
        ses.close(m)
        return out
    for A, off in ((45, 0.5), (90, 0.5), (45, 0.2), (30, 0.1)):
        for pos in (4,):
            for fix in (False, True):
                for rev in (False, True):
                    d = val(jf, "GetDefinition")
                    d.AccessSelections(m, nothing())
                    d.JogPositionType = pos
                    d.FixProjectedLength = fix
                    d.ReverseDirection = rev
                    d.JogAngle = math.radians(A)
                    d.OffsetDistance = off * IN
                    ok = jf.ModifyDefinition(d, m, nothing())
                    m.ForceRebuild3(False)
                    w = c.whats_wrong()
                    me = c.measure(False) if not [x for x in w if not x[2]] else {}
                    d2 = val(jf, "GetDefinition")
                    out["rows"].append({"A": A, "off": off, "pos": d2.JogPositionType, "fix": d2.FixProjectedLength, "rev": d2.ReverseDirection, "mod": bool(ok), "wrong": w,
                                        "msg": [x[:120] for x in ses.new_messages()][:2], "volume": me.get("volume"), "bbox": me.get("bbox")})
    ses.close(m)
    return out


def main():
    cs = [{"id": k, "code": v, "outline": True, "verts": True} for k, v in CODES.items()]
    CH.update(record(cs))
    AN.update(evaluate(cs))
    cases = {"xb": case_xb, "xb0": case_xb0}
    for k, v in OPEN.items():
        cases["open_" + k] = (lambda p: (lambda ses: dict(open_base(ses, p), anvil=None)))(v)
    for k in CODES:
        if k != "plate" and not k.startswith("open_"):
            cases[k] = replay(k)
    cases["jog_modify"] = jog_modify
    # which way the thickness goes when the lines are not drawn end to end: [(first line), (second line)]
    cases["open_Lmix1"] = lambda ses: open_base(ses, None, segs=[((2, 0), (2, 1)), ((2, 0), (0, 0))])
    cases["open_Lmix2"] = lambda ses: open_base(ses, None, segs=[((2, 0), (0, 0)), ((2, 0), (2, 1))])
    E, Mo = [4 + T / 2, 0.6, 2 - R], [3.5, 0.6, 2]
    cases["butt_out_open"] = butt_case("butt_out_open", E, Mo, False)
    cases["butt_out_closed"] = butt_case("butt_out_closed", E, Mo, True)
    cases["butt_out_open_2"] = butt_case("butt_out_open_2", [4, 0.6, 2 + T / 2], [4, 0.6, 1], False)
    with open(os.path.join(OUT, "sheet-anvil.json"), "w") as fh:
        json.dump(AN, fh, indent=1)
    run3("sheet", cases)


if __name__ == "__main__":
    main()
