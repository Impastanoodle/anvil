"""Unchecked item 13 (lane swcheck, 2026-11-02): Slot, Symmetric and Hinge mates, one assembly of two small parts.
Raw JSON: OUT\\asm.json.

    python ref3_asm.py
"""
import math
import os

from ref3_core import *  # noqa: F401,F403
from sw_com import byref_int  # noqa: E402


def extrude(c, sk, d):
    m, fm = c.m, c.m.FeatureManager
    m.ClearSelection2(True)
    c.sel(sk)
    return fm.FeatureExtrusion3(True, False, False, 0, 0, d * IN, 0, False, False, False, False, 0, 0, False, False, False, False, True, True, True, 0, 0, False)


def make_plate(ses):
    """4 x 2 x .5 plate on the Top plane, centre at the origin, y 0 to .5. A straight slot .5 wide, centres (-1.25, 0) and (.25, 0) in x, z.
    A Ø.5 hole at (1.25, 0)."""
    c = Ctx(ses)
    m = c.m

    def draw(s):
        s.crect(0, 0, 4, 2)
        s.circle(1.25, 0, 0.25)
        s.slot(-1.25, 0, 0.25, 0, 0.5)
    sk = c.sketch(c.plane("Top"), draw)
    extrude(c, sk, 0.5)
    p, err = save_copy(ses, m, "chk-plate")
    return c, p, err


def make_pin(ses):
    c = Ctx(ses)
    m = c.m
    sk = c.sketch(c.plane("Top"), lambda s: s.circle(0, 0, 0.25))
    extrude(c, sk, 1.0)
    p, err = save_copy(ses, m, "chk-pin")
    return c, p, err


def pos(comp):
    a = val(val(comp, "Transform2"), "ArrayData")
    return [round(a[9] / IN, 6), round(a[10] / IN, 6), round(a[11] / IN, 6)]


def faces(comp):
    b = val(comp, "GetBody")
    return items(val(b, "GetFaces"))


def box_of(f):
    x = f.GetBox if not callable(f.GetBox) else f.GetBox()
    return [v / IN for v in x]


def kind(f):
    s = val(f, "GetSurface")
    return "plane" if val(s, "IsPlane") else "cyl" if val(s, "IsCylinder") else "other"


def select(asm, ents, mark):
    sel = val(asm, "SelectionManager")
    for i, e in enumerate(ents):
        sd = val(sel, "CreateSelectData")
        sd.Mark = mark
        if not e.Select4(i > 0 or mark != 1, sd):
            raise RuntimeError("select failed")


def props(d, names):
    out = {}
    for n in names:
        try:
            out[n] = getattr(d, n)
        except Exception as e:  # noqa: BLE001
            out[n] = "err " + str(e)[:60]
    return out


def main():
    ses = Ses()
    res = {}
    res["utilities"] = None
    for prog in ("Utilities.UtilitiesApp",):
        try:
            res["utilities"] = ses.sw.GetAddInObject(prog) is not None
        except Exception as e:  # noqa: BLE001
            res["utilities"] = "err " + str(e)[:100]
    print("utilities add-in loaded:", res["utilities"], flush=True)
    plate, pin = os.path.join(OUT, "chk-plate.SLDPRT"), os.path.join(OUT, "chk-pin.SLDPRT")
    for p in (plate, pin):             # this lane's own parts, opened so AddComponent5 finds them loaded
        guard(ses, p)
        m0 = ses.sw.OpenDoc6(p, 1, 1, "", byref_int(), byref_int())
        if m0 is None:
            raise RuntimeError("could not open " + p)
        ses.mine.add(val(m0, "GetTitle"))
        doc_bump("open " + p)
    asm = ses.new_from_pref(ASSEMBLY_PREF)
    try:
        ad = asm
        comp0 = ad.AddComponent5(plate, 0, "", False, "", 0, 0, 0)
        p1 = ad.AddComponent5(pin, 0, "", False, "", 0.5 * IN, 2 * IN, 0.7 * IN)
        p2 = ad.AddComponent5(pin, 0, "", False, "", 2.5 * IN, 2 * IN, 3 * IN)
        p3 = ad.AddComponent5(pin, 0, "", False, "", -1.5 * IN, 3 * IN, 3 * IN)
        p4 = ad.AddComponent5(pin, 0, "", False, "", 1.5 * IN, 3 * IN, -2.2 * IN)
        res["placed"] = [pos(x) for x in (comp0, p1, p2, p3, p4)]
        fixed = val(comp0, "IsFixed")
        res["firstFixed"] = fixed
        # slot faces of the plate
        fl = faces(comp0)
        inner = [f for f in fl if kind(f) == "plane" and abs(box_of(f)[1]) < 1e-6 and abs(box_of(f)[4] - 0.5) < 1e-6 and abs(box_of(f)[2] - box_of(f)[5]) < 1e-9 and abs(abs(box_of(f)[2]) - 0.25) < 1e-6]
        res["slotFaces"] = [box_of(f) for f in inner]
        holes = [f for f in fl if kind(f) == "cyl" and box_of(f)[0] > 0.5]
        res["holes"] = len(holes)
        tops = [f for f in fl if kind(f) == "plane" and abs(box_of(f)[1] - 0.5) < 1e-6 and abs(box_of(f)[4] - 0.5) < 1e-6]
        cyl = lambda comp: [f for f in faces(comp) if kind(f) == "cyl"][0]
        ends = lambda comp: sorted([f for f in faces(comp) if kind(f) == "plane"], key=lambda f: box_of(f)[1])

        # ---------- Slot: the results of the first run are in asm-slot.json (a Slot mate edited 7 ways; faces go stale after a
        # ModifyDefinition, so this run makes only the Hinge and the Symmetric mates)
        # ---------- Hinge: pin p2 in the hole, its end on the plate's top face
        d = ad.CreateMateData(22)
        res["hingeDefaults"] = props(d, ["AngleSelection", "Angle", "MinVal", "MaxVal", "MateAlignment"])
        asm.ClearSelection2(True)
        select(asm, [holes[0], cyl(p2)], 1)
        sel = val(asm, "SelectionManager")
        for e in (tops[0], ends(p2)[0]):
            sd = val(sel, "CreateSelectData")
            sd.Mark = 32768
            e.Select4(True, sd)
        mf2 = ad.CreateMate(d)
        res["hingeMade"] = mf2 is not None
        res["hingeMsg"] = ses.new_messages()
        asm.ClearSelection2(True)
        asm.ForceRebuild3(False)
        res["hinge"] = {"pos": pos(p2)}
        if mf2 is not None:
            d3 = val(mf2, "GetDefinition")
            res["hinge"]["read"] = props(d3, ["AngleSelection", "Angle", "MinVal", "MaxVal", "MateAlignment"])
        # ---------- Symmetric: p3 and p4 about the Right plane, cylinders
        d = ad.CreateMateData(8)
        res["symDefaults"] = props(d, ["MateAlignment"])
        pl = [f for f in (lambda: _feat(asm))() if val(f, "GetTypeName2") == "RefPlane"]
        d.SymmetryPlane = pl[2]
        d.EntitiesToMate = darr([cyl(p3), cyl(p4)])
        mf3 = ad.CreateMate(d)
        res["symMade"] = mf3 is not None
        res["symMsg"] = ses.new_messages()
        asm.ForceRebuild3(False)
        res["sym"] = {"p3": pos(p3), "p4": pos(p4), "before": [res["placed"][3], res["placed"][4]]}
        if mf3 is not None:
            res["sym"]["read"] = props(val(mf3, "GetDefinition"), ["MateAlignment"])
        # a pair of end faces instead of cylinders
        d = ad.CreateMateData(8)
        d.SymmetryPlane = pl[1]
        d.EntitiesToMate = darr([ends(p3)[0], ends(p4)[0]])
        mf4 = ad.CreateMate(d)
        res["symPlanes"] = {"made": mf4 is not None, "msg": ses.new_messages()}
        asm.ForceRebuild3(False)
        res["symPlanes"].update({"p3": pos(p3), "p4": pos(p4)})
    finally:
        dump("asm", res)
        for t in list(ses.mine):
            ses.sw.CloseDoc(t)
            ses.mine.discard(t)
    print("open now", ses.titles(), "load", sw_load(), "docs used", doc_count(), flush=True)


def _feat(m):
    f, out = val(m, "FirstFeature"), []
    while f is not None:
        out.append(f)
        f = val(f, "GetNextFeature")
    return out


if __name__ == "__main__":
    main()
