"""SolidWorks reference, second pass (lane swref, 2026-11-02): shared core.

Everything here drives the user's running SolidWorks over COM, and only in documents this process created:
  * Session records the documents open at the start; new() refuses a title that was already open; close() refuses
    any title it did not create. There is no CloseAllDocuments, no rebuild or save of anything else.
  * Parts go to OUT2 (Output\\SolidWorks Models\\Anvil reference\\2026-11-02); per-case JSON to OUT2\\json\\<section>\\.
  * A case already dumped is skipped, so a hiccup costs one case (pass --force to redo).
Inches and degrees here, metres and radians to the API. Frame: Anvil's = SolidWorks' (Y up; Top sketch x = X, y = -Z;
Front x = X, y = Y; Right x = -Z, y = Y). A sheet-metal part has SolidWorks' sheet at y -T..0, Anvil's at 0..T:
Ctx.yshift converts (see swref.py).
"""
import json
import math
import os
import subprocess
import sys
import time
import traceback

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, r"C:\Users\Lucas\.claude\skills\solidworks-api-codestack\scripts")
import pythoncom  # noqa: E402
import win32com.client as wc  # noqa: E402
from sw_com import val, nothing, dvec, darr, items  # noqa: E402

IN = 0.0254
OUT2 = r"C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\2026-11-02"
PLANES = {"Front": 0, "Top": 1, "Right": 2}


# SolidWorks 2022 leaks about 95 MB and 2,700 handles per new document even when each is closed (38 GB and 1.09 million
# handles after about 400 documents hung it on 2026-11-02). Stop before the coordinator's limits of 20 GB / 300,000 handles:
# one more case is about 0.1 GB, so the margin below keeps the process under them.
LIMIT_PRIVATE = 19.5e9
LIMIT_HANDLES = 290000
GUARD_EXIT = 5


def sw_load():
    """(private bytes, handles) of the SLDWORKS process, read from outside it; None when it cannot be read."""
    try:
        q = subprocess.run(["powershell", "-NoProfile", "-Command",
                            "Get-Process SLDWORKS -ErrorAction Stop | ForEach-Object { \"$($_.PrivateMemorySize64) $($_.HandleCount)\" }"],
                           capture_output=True, text=True, timeout=60)
        a = q.stdout.split()
        return (float(a[0]), int(a[1])) if len(a) >= 2 else None
    except Exception:  # noqa: BLE001
        return None


def attach(timeout=1800, step=30):
    """The running SolidWorks, waiting up to timeout seconds for one that answers over COM. Never starts one: the user may
    be closing and reopening it. GetActiveObject only looks; a stale registration fails the call below and is retried."""
    t0 = time.time()
    while True:
        try:
            unk = pythoncom.GetActiveObject("SldWorks.Application")
            sw = wc.dynamic.Dispatch(unk.QueryInterface(pythoncom.IID_IDispatch))
            val(sw, "RevisionNumber")
            return sw
        except Exception:  # noqa: BLE001
            pass
        if time.time() - t0 >= timeout:
            return None
        print("waiting for SolidWorks to answer over COM (%.0f s)" % (time.time() - t0), flush=True)
        time.sleep(step)


class Session:
    def __init__(self):
        self.sw = attach()
        if self.sw is None:
            print("SolidWorks did not answer for 30 minutes: stopping", flush=True)
            sys.exit(4)
        self.pre = set(self.titles())
        self.mine = set()
        self.msgs0 = self.messages()

    def titles(self):
        return [val(d, "GetTitle") for d in items(val(self.sw, "GetDocuments"))]

    def alive(self):
        try:
            val(self.sw, "RevisionNumber")
            return True
        except Exception:  # noqa: BLE001
            return False

    def new(self, sheet=False):
        tpl = self.sw.GetUserPreferenceStringValue(8)            # swDefaultTemplatePart
        m = self.sw.NewDocument(tpl, 0, 0, 0)
        if m is None:
            raise RuntimeError("NewDocument failed: " + tpl)
        t = val(m, "GetTitle")
        if t in self.pre:
            raise RuntimeError("new document has the title of a document that was already open: " + t)
        self.mine.add(t)
        m.SetUnits(3, 0, 0, 0, False)                            # inches, decimal
        return m

    def close(self, m):
        t = val(m, "GetTitle")
        if t not in self.mine or t in self.pre:
            raise RuntimeError("refusing to close a document this script did not create: " + t)
        self.sw.CloseDoc(t)
        self.mine.discard(t)

    def close_title(self, t):
        if t in self.mine and t not in self.pre:
            self.sw.CloseDoc(t)
            self.mine.discard(t)

    def save_close(self, m, name):
        path = os.path.join(OUT2, name + ".SLDPRT")
        os.makedirs(OUT2, exist_ok=True)
        t0 = val(m, "GetTitle")
        err = m.SaveAs3(path, 0, 1)                              # silent, as lanes DO / FH
        t1 = val(m, "GetTitle")
        self.mine.add(t1)
        self.close(m)
        self.mine.discard(t0)
        return path if not err else "not saved: SaveAs3 error %s (64 = rebuild errors)" % err

    def messages(self):
        """The last 20 messages SolidWorks issued this session (ISldWorks.GetErrorMessages: by-ref arrays)."""
        ole = self.sw._oleobj_
        try:
            r = ole.InvokeTypes(ole.GetIDsOfNames("GetErrorMessages"), 0, pythoncom.DISPATCH_METHOD, (pythoncom.VT_I4, 0),
                                ((pythoncom.VT_VARIANT | pythoncom.VT_BYREF, 2),
                                 (pythoncom.VT_VARIANT | pythoncom.VT_BYREF, 2),
                                 (pythoncom.VT_VARIANT | pythoncom.VT_BYREF, 2)), None, None, None)
        except Exception as e:  # noqa: BLE001
            return ["(GetErrorMessages failed: %s)" % e]
        return list(r[1] or [])

    def new_messages(self):
        """Messages since the last call (the list keeps the last 20, newest last or first: diff both ways)."""
        now = self.messages()
        old = self.msgs0
        self.msgs0 = now
        if now == old:
            return []
        fresh = [x for x in now if x not in old]
        return fresh if fresh else now[:1]


class Ctx:
    """One model being built. scale: script units to inches (1, or 1/25.4 for a millimetre script)."""

    def __init__(self, ses, sheet_t=0.0, scale=1.0):
        self.ses, self.sw = ses, ses.sw
        self.m = ses.new()
        self.yshift = sheet_t
        self.scale = scale
        self.msgs = []
        self.steps = []

    def note(self, *a):
        self.steps.append(" ".join(str(x) for x in a))

    # ---------------------------------------------------------------- selection
    def sel(self, feat, append=False, mark=0):
        if feat.Select2(append, mark):
            return True
        t = {"RefPlane": "PLANE", "ProfileFeature": "SKETCH"}.get(val(feat, "GetTypeName2"), "BODYFEATURE")
        return self.m.Extension.SelectByID2(val(feat, "Name"), t, 0, 0, 0, append, mark, nothing(), 0)

    def features(self):
        f, out = val(self.m, "FirstFeature"), []
        while f is not None:
            out.append(f)
            f = val(f, "GetNextFeature")
        return out

    def feature_of_type(self, tname, last=False):
        hits = [f for f in self.features() if val(f, "GetTypeName2") == tname]
        return (hits[-1] if last else hits[0]) if hits else None

    def plane(self, name):
        idx, seen = PLANES[name], 0
        for f in self.features():
            if val(f, "GetTypeName2") == "RefPlane":
                if seen == idx:
                    return f
                seen += 1
        raise RuntimeError("no plane " + name)

    def plane_at(self, name, off):
        """A reference plane parallel to Front / Top / Right at signed offset off along its normal (+Z, +Y, +X)."""
        off = off * self.scale
        if abs(off) < 1e-12:
            return self.plane(name)
        self.m.ClearSelection2(True)
        self.sel(self.plane(name), False, 0)
        pl = self.m.FeatureManager.InsertRefPlane(8 + (256 if off < 0 else 0), abs(off) * IN, 0, 0, 0, 0)
        if pl is None:
            raise RuntimeError("ref plane failed")
        return pl

    def bodies(self):
        return items(self.m.GetBodies2(0, True))

    def _sw(self, p):
        return [p[0] * self.scale * IN, (p[1] * self.scale - self.yshift) * IN, p[2] * self.scale * IN]

    def edge_at(self, p, tol=2e-5):
        """The body edge nearest p (script frame); by geometry, as SelectByID2 goes along the view."""
        q = self._sw(p)
        best, bd = None, 1e9
        for b in self.bodies():
            for e in items(val(b, "GetEdges")):
                c = e.GetClosestPointOn(q[0], q[1], q[2])
                d = math.dist(c[:3], q)
                if d < bd:
                    best, bd = e, d
        if best is None or bd > tol:
            raise RuntimeError("no edge at %s (nearest %.6f in)" % (p, bd / IN))
        return best

    def face_at(self, p, tol=2e-5):
        q = self._sw(p)
        best, bd = None, 1e9
        for b in self.bodies():
            for f in items(val(b, "GetFaces")):
                c = f.GetClosestPointOn(q[0], q[1], q[2])
                if c is None:
                    continue
                d = math.dist(c[:3], q)
                if d < bd:
                    best, bd = f, d
        if best is None or bd > tol:
            raise RuntimeError("no face at %s (nearest %.6f in)" % (p, bd / IN))
        return best

    def pick(self, ent, append=True, mark=0):
        sd = val(self.m.SelectionManager, "CreateSelectData")
        sd.Mark = mark
        return bool(ent.Select4(append, sd))

    def pick_edges(self, pts, append=False, mark=0):
        for i, p in enumerate(pts):
            if not self.pick(self.edge_at(p), append or i > 0, mark):
                raise RuntimeError("edge select failed at %s" % (p,))

    # ---------------------------------------------------------------- sketches
    def sketch(self, plane_feat, draw):
        """Open a sketch on a plane feature (or a callable that selects something), draw(SK), close; returns the feature."""
        m = self.m
        m.ClearSelection2(True)
        ok = plane_feat() if isinstance(plane_feat, type(lambda: 0)) else self.sel(plane_feat, False, 0)
        if not ok:
            raise RuntimeError("sketch plane / face not selected")
        sm = m.SketchManager
        sm.InsertSketch(True)
        sm.AddToDB = True
        try:
            draw(SK(self, sm))
        finally:
            sm.AddToDB = False
        sm.InsertSketch(True)
        return self.feature_of_type("ProfileFeature", last=True)

    # ---------------------------------------------------------------- measuring
    def extreme(self, d):
        best = None
        for b in self.bodies():
            ole = b._oleobj_
            r = ole.InvokeTypes(ole.GetIDsOfNames("GetExtremePoint"), 0, pythoncom.DISPATCH_METHOD, (pythoncom.VT_BOOL, 0),
                                ((pythoncom.VT_R8, 1), (pythoncom.VT_R8, 1), (pythoncom.VT_R8, 1),
                                 (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2), (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2),
                                 (pythoncom.VT_R8 | pythoncom.VT_BYREF, 2)),
                                float(d[0]), float(d[1]), float(d[2]), 0.0, 0.0, 0.0)
            if r[0]:
                p = [r[1] / IN, r[2] / IN + self.yshift, r[3] / IN]
                if best is None or sum(a * c for a, c in zip(p, d)) > sum(a * c for a, c in zip(best, d)):
                    best = p
        return best

    def measure(self, rebuild=True):
        m = self.m
        if rebuild:
            m.ForceRebuild3(False)
        bl = self.bodies()
        if not bl:
            return {"volume": 0.0, "bodies": 0}
        mp = val(m.Extension, "CreateMassProperty")
        faces, ftypes = 0, {}
        for b in bl:
            for fc in items(val(b, "GetFaces")):
                faces += 1
                s = val(fc, "GetSurface")
                k = "plane" if val(s, "IsPlane") else "cyl" if val(s, "IsCylinder") else "cone" if val(s, "IsCone") else \
                    "torus" if val(s, "IsTorus") else "sphere" if val(s, "IsSphere") else "other"
                ftypes[k] = ftypes.get(k, 0) + 1
        lo = [self.extreme(d)[i] for i, d in enumerate(([-1, 0, 0], [0, -1, 0], [0, 0, -1]))]
        hi = [self.extreme(d)[i] for i, d in enumerate(([1, 0, 0], [0, 1, 0], [0, 0, 1]))]
        faults = []
        for b in bl:
            fe = val(b, "Check3")
            n = fe.Count if fe is not None else 0
            faults += [fe.ErrorCode(i) for i in range(n)]
        return {"volume": mp.Volume / IN ** 3, "area": mp.SurfaceArea / IN ** 2, "faces": faces, "faceTypes": ftypes,
                "bodies": len(bl), "bbox": lo + hi, "faults": faults}

    def whats_wrong(self):
        """Every feature with a rebuild error or warning: [(name, code, isWarning)]."""
        out = []
        for f in self.features():
            ole = f._oleobj_
            try:
                r = ole.InvokeTypes(ole.GetIDsOfNames("GetErrorCode2"), 0, pythoncom.DISPATCH_METHOD, (pythoncom.VT_I4, 0),
                                    ((pythoncom.VT_BOOL | pythoncom.VT_BYREF, 2),), False)
            except Exception:  # noqa: BLE001
                continue
            code = r[0] if isinstance(r, tuple) else r
            warn = r[1] if isinstance(r, tuple) else False
            if code:
                out.append([val(f, "Name"), code, bool(warn)])
        return out


class SK:
    """Sketch drawing in the sketch plane's own coordinates, script units."""

    def __init__(self, ctx, sm):
        self.sm, self.u = sm, ctx.scale * IN

    def line(self, x1, y1, x2, y2):
        u = self.u
        if self.sm.CreateLine(x1 * u, y1 * u, 0, x2 * u, y2 * u, 0) is None:
            raise RuntimeError("CreateLine")

    def center(self, x1, y1, x2, y2):
        u = self.u
        return self.sm.CreateCenterLine(x1 * u, y1 * u, 0, x2 * u, y2 * u, 0)

    def poly(self, pts, closed=True):
        n = len(pts)
        for i in range(n if closed else n - 1):
            a, b = pts[i], pts[(i + 1) % n]
            self.line(a[0], a[1], b[0], b[1])

    def rect(self, x, y, w, h):
        self.poly([(x, y), (x + w, y), (x + w, y + h), (x, y + h)])

    def crect(self, cx, cy, w, h):
        self.rect(cx - w / 2, cy - h / 2, w, h)

    def circle(self, cx, cy, r):
        if self.sm.CreateCircleByRadius(cx * self.u, cy * self.u, 0, r * self.u) is None:
            raise RuntimeError("CreateCircleByRadius")

    def arc(self, cx, cy, r, a0, a1):
        """Anvil's arc: centre, radius, degrees a0 -> a1, counter-clockwise when a1 > a0."""
        u, ra, rb = self.u, math.radians(a0), math.radians(a1)
        x1, y1, x2, y2 = cx + r * math.cos(ra), cy + r * math.sin(ra), cx + r * math.cos(rb), cy + r * math.sin(rb)
        d = 1 if a1 > a0 else -1
        if self.sm.CreateArc(cx * u, cy * u, 0, x1 * u, y1 * u, 0, x2 * u, y2 * u, 0, d) is None:
            raise RuntimeError("CreateArc")

    def slot(self, x1, y1, x2, y2, w):
        """Straight slot, centreline (x1,y1)-(x2,y2), width w: two lines and two half circles."""
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        nx, ny = -uy * w / 2, ux * w / 2
        self.line(x1 + nx, y1 + ny, x2 + nx, y2 + ny)
        self.line(x2 - nx, y2 - ny, x1 - nx, y1 - ny)
        a = math.degrees(math.atan2(ny, nx))
        self.arc(x2, y2, w / 2, a - 180, a)
        self.arc(x1, y1, w / 2, a, a + 180)

    def polygon(self, cx, cy, r, n, rot=0.0):
        pts = [(cx + r * math.cos(math.radians(rot) + 2 * math.pi * i / n), cy + r * math.sin(math.radians(rot) + 2 * math.pi * i / n))
               for i in range(n)]
        self.poly(pts)


# -------------------------------------------------------------------- resumable case driver
def r9(x):
    if isinstance(x, (list, tuple)):
        return [r9(v) for v in x]
    if isinstance(x, dict):
        return {k: r9(v) for k, v in x.items()}
    if isinstance(x, float):
        return round(x, 9)
    return x


def json_path(section, name):
    d = os.path.join(OUT2, "json", section)
    os.makedirs(d, exist_ok=True)
    return os.path.join(d, name + ".json")


def load_all(section):
    d = os.path.join(OUT2, "json", section)
    out = {}
    if os.path.isdir(d):
        for fn in sorted(os.listdir(d)):
            if fn.endswith(".json"):
                with open(os.path.join(d, fn)) as fh:
                    out[fn[:-5]] = json.load(fh)
    return out


def run_cases(section, cases, argv=None, pause=0.3):
    """cases: {name: fn(ses) -> dict}. Each result is dumped as its own JSON; a dumped case is skipped.
    A Python exception is a recorded failure of that one case. A COM error that says the server is gone stops the run."""
    argv = sys.argv[1:] if argv is None else argv
    force = "--force" in argv
    want = [a for a in argv if not a.startswith("--")]
    ses = Session()
    t0 = time.time()
    done = 0
    for name, fn in cases.items():
        if os.path.exists(os.path.join(OUT2, "tmp", "STOP")):        # a stop flag: end cleanly between two cases
            print("stop flag: ending between cases", flush=True)
            return
        if want and not any(w == name or name.startswith(w) for w in want):
            continue
        path = json_path(section, name)
        if os.path.exists(path) and not force:
            continue
        load = sw_load()
        if load and (load[0] >= LIMIT_PRIVATE or load[1] >= LIMIT_HANDLES):
            print("GUARD STOP before %s %s: SLDWORKS %.1f GB private, %d handles; %d cases done this run; rerun to resume" % (section, name, load[0] / 1e9, load[1], done), flush=True)
            sys.exit(GUARD_EXIT)
        t1 = time.time()
        reconnected, fails = False, 0
        while True:
            try:
                res = fn(ses)
                break
            except Exception as e:  # noqa: BLE001
                res = {"exception": str(e)[:400], "trace": traceback.format_exc()[-800:]}
                if not ses.alive():
                    # the COM link dropped: the user's own restart, not an error. A new Session forgets every title of the
                    # old one and lists what is open now; anything there is left alone.
                    print(name, "COM connection dropped: waiting for SolidWorks", flush=True)
                    if reconnected:
                        fails += 1
                    ses = Session()
                    reconnected = True
                    print("reconnected; open documents, left alone:", sorted(ses.pre), flush=True)
                    if fails >= 2:
                        res = {"unmeasured": "failed twice after a SolidWorks restart", "exception": res["exception"]}
                        break
                    continue
                # a case that died mid-way leaves its document open: close what this process created
                for t in list(ses.mine):
                    try:
                        ses.sw.CloseDoc(t)
                        ses.mine.discard(t)
                    except Exception:  # noqa: BLE001
                        pass
                if reconnected:
                    fails += 1
                    if fails >= 2:
                        res = {"unmeasured": "failed twice after a SolidWorks restart", "exception": res["exception"]}
                        break
                    continue
                break
        res["sec"] = round(time.time() - t1, 1)
        with open(path, "w") as fh:
            json.dump(r9(res), fh, indent=1)
        short = {k: v for k, v in res.items() if k in ("built", "volume", "bodies", "messages", "exception", "flat", "sec")}
        print(name, json.dumps(r9(short))[:300], flush=True)
        done += 1
        time.sleep(pause)
    print("done %d cases in %.0f s; open documents now: %s" % (done, time.time() - t0, ses.titles()), flush=True)
