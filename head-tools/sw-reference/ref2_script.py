"""SolidWorks reference, second pass (lane swref, 2026-11-02): replay an Anvil part script in SolidWorks.

ref2_anvil.js records a script's Builder calls as chains ([["sketch","Top",0.5],["circle",0,0,1],["end"],["extrude",1]]);
Replay walks them and calls the SolidWorks API, so one script is the part on both sides and a case is only written
once. It logs one row per feature: {op, built, messages, wrong}. A feature SolidWorks refuses is logged and the next
one goes on, as Anvil does.
"""
import json
import math
import os
import subprocess

from ref2 import *  # noqa: F401,F403
import ref2_sheet as SH

ENTITIES = {"rect", "centerRect", "circle", "polyline", "line", "arc", "slot", "polygon"}
MM = 1 / 25.4
SCRATCH = os.path.join(OUT2, "tmp")


def anvil_tool(cmd, *args):
    subprocess.run(["node", os.path.join(HERE, "ref2_anvil.js"), cmd] + list(args), check=True,
                   env=dict(os.environ, PATH=r"C:\Program Files\nodejs;" + os.environ.get("PATH", "")))


def record(cases):
    """[{id, code}] -> {id: chains}"""
    os.makedirs(SCRATCH, exist_ok=True)
    a, b = os.path.join(SCRATCH, "rec-in.json"), os.path.join(SCRATCH, "rec-out.json")
    with open(a, "w") as fh:
        json.dump(cases, fh)
    anvil_tool("record", a, b)
    with open(b) as fh:
        return {r["id"]: r["chains"] for r in json.load(fh)}


def evaluate(cases):
    """[{id, code}] -> {id: Anvil's numbers}"""
    os.makedirs(SCRATCH, exist_ok=True)
    a, b = os.path.join(SCRATCH, "ev-in.json"), os.path.join(SCRATCH, "ev-out.json")
    with open(a, "w") as fh:
        json.dump(cases, fh)
    anvil_tool("eval", a, b)
    with open(b) as fh:
        return {r["id"]: r for r in json.load(fh)}


class Replay:
    def __init__(self, ses, chains, over=None):
        self.ses, self.chains = ses, chains
        self.over = over or {}     # SolidWorks-only choices a case needs (see ref2_corpus.OVER)
        scale = 1.0
        for c in chains:
            if c[0][0] == "units" and c[0][1] == "mm":
                scale = MM
        self.c = Ctx(ses, 0.0, scale)
        self.m = self.c.m
        self.fm = self.m.FeatureManager
        self.sk = {}             # chain index -> sketch feature
        self.last_sketch = None
        self.last_feat = None
        self.log = []
        self.sheet = None        # {T, R, K, opts}
        self.axis_y = None
        self.pending_center = None

    # ---------------------------------------------------------------- bookkeeping
    def row(self, op, ok, extra=None):
        msgs = self.ses.new_messages()
        r = {"op": op, "built": bool(ok), "messages": [m.strip() for m in msgs]}
        if extra:
            r.update(extra)
        self.log.append(r)
        return r

    def attempt(self, op, fn):
        """Run one feature; a Python exception or a None result is a refusal of that feature."""
        try:
            f = fn()
        except Exception as e:  # noqa: BLE001
            self.row(op, False, {"exception": str(e)[:200]})
            return None
        if f is None:
            self.row(op, False)
            return None
        self.m.ForceRebuild3(False)
        wrong = self.c.whats_wrong()
        self.row(op, not [w for w in wrong if not w[2]], {"wrong": wrong} if wrong else None)
        self.last_feat = f if f is not True else self.last_feat
        return f

    # ---------------------------------------------------------------- sketches
    def draw(self, ops, plane):
        y0 = self.c.yshift / self.c.scale if plane != "Top" else 0.0

        def d(s):
            for o in ops:
                n, a = o[0], o[1:]
                if n == "rect":
                    s.rect(a[0], a[1] - y0, a[2], a[3])
                elif n == "centerRect":
                    s.crect(a[0], a[1] - y0, a[2], a[3])
                elif n == "circle":
                    s.circle(a[0], a[1] - y0, a[2])
                elif n == "polyline":
                    s.poly([(q[0], q[1] - y0) for q in a[0]], a[1] if len(a) > 1 else True)
                elif n == "line":
                    s.line(a[0], a[1] - y0, a[2], a[3] - y0)
                elif n == "arc":
                    s.arc(a[0], a[1] - y0, a[2], a[3], a[4])
                elif n == "slot":
                    s.slot(a[0], a[1] - y0, a[2], a[3] - y0, a[4])
                elif n == "polygon":
                    s.polygon(a[0], a[1] - y0, a[2], a[3], a[4] if len(a) > 4 else 0)
            if self.pending_center:
                s.center(*self.pending_center)
        return d

    def make_sketch(self, head, ents, center=None, on_face=None):
        plane, off = head[1], head[2] if len(head) > 2 else 0
        if plane == "Top":
            off = off - self.c.yshift / self.c.scale
        if on_face is not None:                  # a line on the Top plane made no jog (lane DO): sketch on the face
            fc = self.c.face_at(on_face)
            pl = lambda: self.c.pick(fc, False, 0)
        else:
            pl = self.c.plane_at(plane, off)
        self.pending_center = center
        sk = self.c.sketch(pl, self.draw(ents, plane))
        self.pending_center = None
        self.last_sketch = sk
        return sk

    # ---------------------------------------------------------------- solid features
    def extrude(self, sk, d, o):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        c.sel(sk)
        u = c.scale * IN
        mid = o.get("midplane")
        merge = o.get("merge", True)
        draft = math.radians(o.get("draft", 0) or 0)
        return self.fm.FeatureExtrusion3(True, False, bool(o.get("reverse")), 6 if mid else 0, 0, d * u, 0, draft != 0, False,
                                         False, False, draft, 0, False, False, False, False, merge, True, True, 0, 0, False)

    def cut(self, sk, d, o):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        c.sel(sk)
        through = d == "through"
        draft = math.radians(o.get("draft", 0) or 0)
        depth = 0.0 if through else d * c.scale * IN
        # FeatureCut4 Dir False = against the sketch normal, Anvil's reverse: true (measured)
        normal = bool(o.get("normalCut"))
        return self.fm.FeatureCut4(True, False, not o.get("reverse"), 1 if through else 0, 0, depth, 0, draft != 0, False, False, False,
                                   draft, 0, False, False, False, False, normal, True, True, True, True, False, 0, 0, False, False)

    def revolve(self, sk, ang, cut=False):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        c.sel(sk)
        return self.fm.FeatureRevolve2(True, True, False, cut, False, False, 0, 0, math.radians(ang), 0, False, False, 0, 0, 0, 0, 0,
                                       True, True, True)

    def fillet(self, r, pts):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        c.pick_edges(pts)
        return self.fm.FeatureFillet(3, r * c.scale * IN, 0, 0, 0, 0, 0)     # 1 tangent propagation (the PM's default) + 2 uniform

    def chamfer(self, d, pts):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        c.pick_edges(pts)
        return self.fm.InsertFeatureChamfer(4, 1, d * c.scale * IN, math.radians(45), 0, 0, 0, 0)

    def shell(self, t, faces):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        for i, q in enumerate(faces):
            if not c.pick(c.face_at(q), i > 0, 0):
                raise RuntimeError("face pick failed")
        n = len(c.features())
        m.InsertFeatureShell(t * c.scale * IN, False)
        fs = c.features()
        return fs[-1] if len(fs) > n else None

    def draft(self, deg, neutral, faces, prop=0):
        c, m = self.c, self.m
        v0 = val(m.Extension, "CreateMassProperty").Volume
        for flip in (False, True):
            m.ClearSelection2(True)
            c.pick(c.face_at(neutral), False, 1)
            for q in faces:
                c.pick(c.face_at(q), True, 2)
            f = self.fm.InsertMultiFaceDraft(math.radians(deg), flip, False, prop, False, False)
            if f is None:
                continue
            m.ForceRebuild3(False)
            if val(m.Extension, "CreateMassProperty").Volume < v0 * (1 - 1e-7):
                return f
            m.EditUndo2(1)
        return None

    def y_axis(self):
        if self.axis_y is None:
            c, m = self.c, self.m
            m.ClearSelection2(True)
            c.sel(c.plane("Front"), False, 0)
            c.sel(c.plane("Right"), True, 0)
            m.InsertAxis2(True)
            self.axis_y = c.feature_of_type("RefAxis", last=True)
        return self.axis_y

    def pick_dir(self, d):
        """A model edge along x / z for a pattern direction (any straight edge that way); and its sense."""
        c = self.c
        v = {"x": 0, "y": 1, "z": 2}[d]
        for b in c.bodies():
            for e in items(val(b, "GetEdges")):
                cv = val(e, "GetCurve")
                if not val(cv, "IsLine"):
                    continue
                lp = cv.LineParams
                if abs(abs(lp[3 + v]) - 1) < 1e-9:
                    return e, (1 if lp[3 + v] > 0 else -1)
        return c.plane({"x": "Right", "z": "Front", "y": "Top"}[d]), 1      # a round part: the plane's normal is the direction

    def pick_ref(self, ent, append, mark):
        return self.c.sel(ent, append, mark) if hasattr(ent, "GetTypeName2") else self.c.pick(ent, append, mark)

    def lpattern(self, o):
        c, m = self.c, self.m
        f = self.last_feat
        n1, s1 = int(o["count"]), o["spacing"] * c.scale * IN
        n2, s2 = int(o.get("count2", 1)), abs(o.get("spacing2", 0)) * c.scale * IN
        e1, sg = self.pick_dir(o["dir"])
        rev = (s1 < 0) != (sg < 0)
        m.ClearSelection2(True)
        self.pick_ref(e1, False, 1)
        rev2 = False
        if n2 > 1:
            e2, sg2 = self.pick_dir(o["dir2"])
            self.pick_ref(e2, True, 2)
            rev2 = (o["spacing2"] < 0) != (sg2 < 0)
        c.sel(f, True, 4)
        return self.fm.FeatureLinearPattern5(n1, abs(s1), n2, s2, rev, rev2, "NULL", "NULL", False, False, False, False, False,
                                             False, True, True, False, False, 0, 0, False, False)

    def cpattern(self, o):
        c, m = self.c, self.m
        f = self.last_feat
        ax = self.y_axis()
        m.ClearSelection2(True)
        c.sel(ax, False, 1)
        c.sel(f, True, 4)
        ang = math.radians(o.get("angle", 360))
        return self.fm.FeatureCircularPattern5(int(o["count"]), ang, False, "NULL", False, True, False, False, False, False, 1, 0,
                                               "NULL", False)

    def mirror(self, plane, o):
        c, m = self.c, self.m
        off = o.get("offset", 0) or 0
        pl = c.plane_at(plane, off)
        m.ClearSelection2(True)
        body = bool(o.get("body"))
        c.sel(pl, False, 2)
        if body:
            for b in c.bodies():
                sd = val(m.SelectionManager, "CreateSelectData")
                sd.Mark = 256
                b.Select2(True, sd)
        else:
            c.sel(self.last_feat, True, 1)
        return self.fm.InsertMirrorFeature2(body, False, o.get("merge", True), False, 0)

    def loft(self, ids, closed=False):
        c, m = self.c, self.m
        m.ClearSelection2(True)
        for i, s in enumerate(ids):
            c.sel(self.sk[s["__chain"]], i > 0, 1)
        return self.fm.InsertProtrusionBlend2(closed, True, False, 1, 0, 0, 1, 1, True, True, False, 0, 0, 0, True, True, True, 0)

    def sweep(self, prof, path):
        c, m = self.c, self.m
        if isinstance(path, list):            # a polyline in the Top plane (y = 0)
            pts = [(q[0], -q[2]) for q in path]
            psk = c.sketch(c.plane("Top"), lambda s: s.poly(pts, False))
            prof_sk = self.last_sketch
        else:
            psk, prof_sk = self.sk[path["__chain"]], self.sk[prof["__chain"]]
        m.ClearSelection2(True)
        c.sel(prof_sk, False, 1)
        c.sel(psk, True, 4)
        return self.fm.InsertProtrusionSwept4(False, False, 0, False, False, 0, 0, False, 0, 0, 0, 0, True, True, True, 0, True, False, 0, 0)

    def rib(self, sk, t, o):
        c, m = self.c, self.m
        v0 = val(m.Extension, "CreateMassProperty").Volume
        norm = o.get("direction") == "normal"
        one = o.get("side") == "one"
        for rev in (False, True):
            m.ClearSelection2(True)
            c.sel(sk)
            n = len(c.features())
            self.fm.InsertRib(not one, False, t * c.scale * IN, 0, rev, False, False, 0, norm, False)
            m.ForceRebuild3(False)
            if len(c.features()) > n and val(m.Extension, "CreateMassProperty").Volume > v0 * (1 + 1e-7):
                return c.features()[-1]
            if len(c.features()) > n:
                m.EditUndo2(1)
        return None

    def combine(self, regions=None):
        """Anvil's Intersect stands in for Combine in the fuzz: regions [A only, B only, A∩B]."""
        c = self.c
        bl = c.bodies()
        if len(bl) != 2 or regions is None:
            raise RuntimeError("combine: %d bodies, regions %s not mapped" % (len(bl), regions))
        kind = "".join("1" if x else "0" for x in regions)
        if kind == "111":
            return self.fm.InsertCombineFeature(15903, nothing(), darr(bl))          # SWBODYADD
        if kind == "001":
            return self.fm.InsertCombineFeature(15901, nothing(), darr(bl))          # SWBODYINTERSECT
        if kind == "100":
            return self.fm.InsertCombineFeature(15902, bl[0], darr(bl[1:]))          # SWBODYCUT
        raise RuntimeError("combine kind %s not mapped" % kind)

    def cylinder(self, r, h, o):
        ax = o.get("axis", "y")
        at = o.get("at", [0, 0, 0])
        if ax == "x":
            pl, cx, cy, off = "Right", -at[2], at[1], at[0]
        elif ax == "z":
            pl, cx, cy, off = "Front", at[0], at[1], at[2]
        else:
            pl, cx, cy, off = "Top", at[0], -at[2], at[1]
        sk = self.c.sketch(self.c.plane_at(pl, off), lambda s: s.circle(cx, cy, r))
        return self.extrude(sk, h, {})

    def face_point(self, head):
        """A point of the sheet's top face for a face sketch (its frame is the Top sketch's): near the part's middle."""
        xs = [self.c.extreme([1, 0, 0])[0], self.c.extreme([-1, 0, 0])[0]]
        zs = [self.c.extreme([0, 0, 1])[2], self.c.extreme([0, 0, -1])[2]]
        return [sum(xs) / 2 + 0.013, head[1] if len(head) > 1 else 0, sum(zs) / 2 + 0.017]

    # ---------------------------------------------------------------- the walk
    def terminal(self, sk, ops):
        for o in ops:
            n, a = o[0], o[1:]
            opt = a[1] if len(a) > 1 and isinstance(a[1], dict) else {}
            if n == "end":
                continue
            if n == "extrude":
                if opt.get("sheetBase"):
                    self.attempt("baseFlange", lambda: SH.base_flange(self, sk))
                else:
                    self.attempt("extrude", lambda: self.extrude(sk, a[0], opt))
            elif n == "cut":
                self.attempt("cut", lambda: self.cut(sk, a[0], opt))
            elif n == "revolve":
                self.attempt("revolve", lambda: self.revolve(sk, a[0] if a else 360))
            elif n == "revolveCut":
                self.attempt("revolveCut", lambda: self.revolve(sk, a[0] if a else 360, True))
            elif n == "rib":
                self.attempt("rib", lambda: self.rib(sk, a[0], opt))
            elif n == "baseFlange":
                self.attempt("baseFlange", lambda: SH.base_flange(self, sk))
            elif n in SH.SKETCH_OPS:
                self.attempt(n, lambda: SH.SKETCH_OPS[n](self, sk, a))
            else:
                raise RuntimeError("sketch terminal not mapped: " + n)

    def run(self):
        for idx, c in enumerate(self.chains):
            head = c[0]
            n, a = head[0], head[1:]
            opt = a[-1] if a and isinstance(a[-1], dict) else {}
            if n == "units":
                continue
            if n == "sheet":
                SH.sheet(self, a)
            elif n == "sketch":
                ents = [o for o in c[1:] if o[0] in ENTITIES]
                rest = [o for o in c[1:] if o[0] not in ENTITIES]
                center = (0, -100, 0, 100) if any(o[0] in ("revolve", "revolveCut") for o in rest) else None
                on_face = self.face_point(a) if any(SH.sketch_op_face(o[0]) for o in rest) else None
                sk = self.make_sketch(head, ents, center, on_face)
                self.sk[idx] = sk
                self.terminal(sk, rest)
            elif n == "extrude":
                if opt.get("sheetBase"):
                    self.attempt("baseFlange", lambda: SH.base_flange(self, self.last_sketch))
                else:
                    self.attempt("extrude", lambda: self.extrude(self.last_sketch, a[0], opt))
            elif n == "cut":
                self.attempt("cut", lambda: self.cut(self.last_sketch, a[0], opt))
            elif n == "revolve":
                self.attempt("revolve", lambda: self.revolve(self.last_sketch, a[0]))
            elif n == "box":                                # p.box(x, z, y): corner at the origin
                w, d, h = a[0], a[1], a[2]
                sk = self.c.sketch(self.c.plane("Top"), lambda s: s.rect(0, -d, w, d))
                self.attempt("box", lambda: self.extrude(sk, h, {}))
            elif n == "cylinder":
                self.attempt("cylinder", lambda: self.cylinder(a[0], a[1], a[2] if len(a) > 2 else {}))
            elif n == "fillet":
                self.attempt("fillet", lambda: self.fillet(a[0], a[1]))
            elif n == "chamfer":
                self.attempt("chamfer", lambda: self.chamfer(a[0], a[1]))
            elif n == "shell":
                self.attempt("shell", lambda: self.shell(a[0], a[1]))
            elif n == "draft":
                self.attempt("draft", lambda: self.draft(a[0], a[1], a[2], 1 if len(a) > 3 and a[3].get("propagate") == "tangent" else 0))
            elif n == "linearPattern":
                self.attempt("linearPattern", lambda: self.lpattern(a[0]))
            elif n == "circularPattern":
                self.attempt("circularPattern", lambda: self.cpattern(a[0]))
            elif n == "mirror":
                self.attempt("mirror", lambda: self.mirror(a[0], a[1] if len(a) > 1 else {}))
            elif n == "loft":
                self.attempt("loft", lambda: self.loft(a[0]))
            elif n == "sweep":
                self.attempt("sweep", lambda: self.sweep(a[0].get("profile"), a[0]["path"]))
            elif n == "intersect":
                self.attempt("combine", lambda: self.combine(a[0].get("regions")))
            elif n in SH.PART_OPS:
                self.attempt(n, lambda: SH.PART_OPS[n](self, a))
            else:
                raise RuntimeError("script call not mapped: " + n)
        return self


def replay_case(ses, chains, name=None, save=True, after=None, over=None):
    """Build, measure, save or close. Returns {log, built, volume, bodies, bbox, ...}."""
    rp = Replay(ses, chains, over)
    try:
        rp.run()
        res = {"log": rp.log, "built": all(r["built"] for r in rp.log)}
        fp = rp.c.feature_of_type("FlatPattern")
        if fp is not None:                       # Insert Bends leaves its Flat-Pattern unsuppressed: measure folded
            fp.SetSuppression2(0, 2, nothing())
        res.update(rp.c.measure())
        res["corners"] = getattr(rp, "corner_data", None)
        if rp.sheet and rp.c.feature_of_type("FlatPattern") is not None and res.get("volume"):
            res["flat"] = SH.flat(rp)
        if after:
            res.update(after(rp) or {})
        if save and name:
            res["file"] = ses.save_close(rp.m, name)
        else:
            ses.close(rp.m)
        return res
    except Exception:
        for t in list(ses.mine):
            ses.sw.CloseDoc(t)
            ses.mine.discard(t)
        raise
