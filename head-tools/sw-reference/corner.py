"""Item 5 - Closed corner: 4 x 2 base flange (16 ga, R = T, K 0.5) with two separate 1 in edge flanges
(Material Inside, Outer Virtual Sharp): first on the z = 2 edge, then on the x = 4 edge (it stops short of the
first one).  Then a Closed Corner (gap 0.01, ratio 1) Butt / Overlap / Underlap with the bend region open and
closed.  Face to extend: the second flange's end face; face to match: the first flange's inside face
(selection marks 1 and 0x40000000, as the API help's Create_and_Modify_Closed_Corner example).
Records the volume, the flat size and flat volume, and the second wall's end (its largest z).

    BLOCKED (2026-10-27, SolidWorks 2022 SP5): the second edge flange (x = 4 edge, after the z = 2 one) is
    refused by InsertSheetMetalEdgeFlange2 with any relief type (default, none, rectangular, obround, tear),
    though the same flange alone on the plate builds - so no tray to close.  The closed-corner calls below
    (marks 1 / 0x40000000, IClosedCornerFeatureData) follow the API help example and are untested.

    python corner.py   -> Output\\SolidWorks Models\\Anvil reference\\corner-<type>-<open|closed>.SLDPRT + corner.json
"""
from swref import *

CTYPE = {"butt": 1, "overlap": 2, "underlap": 3}                        # swClosedCornerTypes_e


def wall_end(m):
    """largest z of the x = 4 wall at mid height (the vertices with x > 4 - T - 1e-6 and y = 0.6 band)"""
    vs = [v for v in vertices(m) if v[0] > 4 - T - 1e-6 and v[1] > R + T + 1e-4]
    return max(v[2] for v in vs) if vs else None


def build(sw, kind=None, open_bend=True, gap=0.01, ratio=1.0):
    m = new_part(sw)
    try:
        base_flange_top(m)
        edge_flange(m, (2, T, 2), 1.0, 90, "inside", "outer")
        edge_flange(m, (4, T, 1), 1.0, 90, "inside", "outer")
        rebuild(m)
        res = {"type": kind, "openBendRegion": open_bend}
        if kind:
            ok = False
            for attempt in range(3):
                m.ClearSelection2(True)
                a = select_at(m, "FACE", 4 - T / 2, 0.6, 2 - R - T, True, 1)
                b = select_at(m, "FACE", 3.5, 0.6, 2 - T, True, 1073741824)
                n0 = len(features(m))
                m.InsertSheetMetalClosedCorner()
                if feature_of_type(m, "ClosedCorner") is not None:
                    ok = True
                    break
            if not ok:
                raise RuntimeError("InsertSheetMetalClosedCorner made nothing (selected %s %s)" % (a, b))
            cf = feature_of_type(m, "ClosedCorner")
            d = val(cf, "GetDefinition")
            d.AccessSelections(m, nothing())
            d.CornerType = CTYPE[kind]
            d.GapDistance = gap * IN
            d.OpenBendRegion = open_bend
            try:
                d.OverlapUnderlapRatio = ratio
            except Exception:
                pass
            if not cf.ModifyDefinition(d, m, nothing()):
                raise RuntimeError("closed corner ModifyDefinition failed")
            rebuild(m)
            d = val(cf, "GetDefinition")
            res["data"] = {"type": d.CornerType, "gap": d.GapDistance / IN, "open": d.OpenBendRegion,
                           "ratio": d.OverlapUnderlapRatio}
        res["volume"] = volume(m)
        res["wallEnd"] = wall_end(m)
        res["flat"] = flat(m)
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
    for kind, op in cases:
        try:
            r = build(sw, kind, op)
        except Exception as e:
            print(kind, op, "FAILED", e, flush=True)
            out.append({"type": kind, "openBendRegion": op, "error": str(e)})
            continue
        print(kind, op, r.get("data"), "vol", r["volume"], "wall end", r["wallEnd"], "flat", r["flat"]["size"], r["flat"]["volume"], flush=True)
        out.append(r)
    dump("corner", out)
