"""Lane DU (2026-10-27): closed corner, second try. Lane DO's corner.py could not make the second edge flange; the
cause was the selection, not the flange: SelectByID2 at a point picks by a ray along the current view, and after a
flange's profile sketch the view looks along an edge, so the point (4, T, 1) picked another edge. Here edges and
faces are found by geometry (the body's own edges / faces through the point) and selected with Select4 + a mark.

    python corner2.py     -> corner-<type>-<open|closed>.SLDPRT + corner2.json
"""
import sys

import swref
from swref import *
from miter2 import flat_detail, select_entity


def edge_through(m, p, tol=1e-6):
    """The straight body edge whose segment contains p (Anvil frame, inches)."""
    P = [p[0], p[1] - YSHIFT, p[2]]
    best = None
    for bd in bodies(m):
        for e in items(val(bd, "GetEdges")):
            try:
                a = [x / IN for x in val(val(e, "GetStartVertex"), "GetPoint")]
                b = [x / IN for x in val(val(e, "GetEndVertex"), "GetPoint")]
            except Exception:
                continue
            d = [b[i] - a[i] for i in range(3)]
            L2 = sum(x * x for x in d)
            if L2 < 1e-12:
                continue
            t = sum((P[i] - a[i]) * d[i] for i in range(3)) / L2
            if t < -1e-9 or t > 1 + 1e-9:
                continue
            q = [a[i] + t * d[i] for i in range(3)]
            dist = sum((P[i] - q[i]) ** 2 for i in range(3)) ** 0.5
            # a curved edge has its chord here: check the midpoint of the curve too
            if dist < tol and (best is None or dist < best[0]):
                cur = val(e, "GetCurve")
                if cur is not None and not val(cur, "IsLine"):
                    continue
                best = (dist, e)
    return best[1] if best else None


def face_through(m, p, tol=1e-6):
    """The body face that contains p (IFace2.GetClosestPointOn)."""
    P = [p[0] * IN, (p[1] - YSHIFT) * IN, p[2] * IN]
    for bd in bodies(m):
        for f in items(val(bd, "GetFaces")):
            q = f.GetClosestPointOn(P[0], P[1], P[2])
            if q is not None and sum((q[i] - P[i]) ** 2 for i in range(3)) ** 0.5 < tol * IN:
                return f
    return None


def entity_at_geom(model, kind, x, y, z):
    e = edge_through(model, (x, y, z)) if kind == "EDGE" else face_through(model, (x, y, z))
    if e is None:
        raise RuntimeError("no %s through %s" % (kind, (x, y, z)))
    model.ClearSelection2(True)
    return e


swref.entity_at = entity_at_geom          # edge_flange() looks entity_at up in swref at call time

CTYPE = {"butt": 1, "overlap": 2, "underlap": 3}                        # swClosedCornerTypes_e


def build(sw, kind=None, open_bend=True, gap=0.01, ratio=1.0, position="inside"):
    m = new_part(sw)
    try:
        base_flange_top(m)
        edge_flange(m, (2, T, 2), 1.0, 90, position, "outer")
        # the base's x = 4 top edge now stops where the first flange's bend starts (Material Inside: z = 2 - R - T)
        edge_flange(m, (4, T, 1), 1.0, 90, position, "outer")
        rebuild(m)
        res = {"type": kind, "openBendRegion": open_bend, "position": position}
        res["before"] = {"volume": volume(m), "box": part_box(m)}
        if kind:
            # face to extend: the x = 4 wall's end face (z = 2 - R - T); face to match: the z = 2 wall's inside face
            z_end = 2 - R - T if position == "inside" else 2 - R
            fe = face_through(m, (4 - T / 2, 0.6, z_end))
            fmatch = face_through(m, (3.5, 0.6, 2 - T))
            if fe is None or fmatch is None:
                raise RuntimeError("closed-corner faces not found: extend %s match %s" % (fe, fmatch))
            made = None
            tried = []
            for marks in ((1, 1073741824),):           # a second call after a made corner crashed the document
                m.ClearSelection2(True)
                a = select_entity(m, fe, marks[0])
                b = select_entity(m, fmatch, marks[1])
                m.InsertSheetMetalClosedCorner()
                made = feature_of_type(m, "CornerFeat")     # (the type name is CornerFeat, not ClosedCorner)
                tried.append((marks, a, b, made is not None))
                if made is not None:
                    break
            res["tried"] = tried
            if made is None:
                raise RuntimeError("InsertSheetMetalClosedCorner made nothing: %s" % tried)
            d = val(made, "GetDefinition")
            d.AccessSelections(m, nothing())
            d.CornerType = CTYPE[kind]
            d.GapDistance = gap * IN
            d.OpenBendRegion = open_bend
            try:
                d.OverlapUnderlapRatio = ratio
            except Exception:
                pass
            if not made.ModifyDefinition(d, m, nothing()):
                raise RuntimeError("closed corner ModifyDefinition failed")
            rebuild(m)
            d = val(made, "GetDefinition")
            res["data"] = {"type": d.CornerType, "gap": d.GapDistance / IN, "open": d.OpenBendRegion,
                           "ratio": d.OverlapUnderlapRatio}
        res["volume"] = volume(m)
        res["box"] = part_box(m)
        vs = vertices(m)
        # the x = 4 wall's end (largest z above the bend) and the z = 2 wall's end (largest x above the bend)
        # the corner as seen from above: the wall-top vertices (y = 1, Anvil frame) near the x = 4, z = 2 corner
        res["cornerTop"] = sorted({(round(v[0], 6), round(v[2], 6)) for v in vs if abs(v[1] - 1.0) < 1e-6 and v[0] > 3.5 and v[2] > 1.5})
        res["flat"] = flat_detail(m)
        name = "corner-%s-%s" % (kind, "open" if open_bend else "closed") if kind else "corner-none"
        res["file"] = save_close(sw, m, name)
        return res
    except Exception:
        close_unsaved(sw, m)
        raise


if __name__ == "__main__":
    sw = sw_app()
    out = []
    cases = [(None, True)] + [(k, o) for k in ("butt", "overlap", "underlap") for o in (True, False)]
    if sys.argv[1:] == ["one"]:
        cases = cases[:2]
    for kind, op in cases:
        try:
            r = build(sw, kind, op)
        except Exception as e:
            print(kind, op, "FAILED", e, flush=True)
            out.append({"type": kind, "openBendRegion": op, "error": str(e)})
            continue
        print(kind, op, r.get("data"), r.get("tried"), "vol", r["volume"], "top", r["cornerTop"],
              "flat", r["flat"]["size"], r["flat"]["volume"], flush=True)
        out.append(r)
    dump("corner2", out)
