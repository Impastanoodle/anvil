"""Item 1 - Jog: 4 x 2 base flange (16 ga, R = T, K 0.5), a jog line across the plate 1 in from the +X end
(x = 3), offset 0.5, 90 deg, Bend Centerline, fixed side x < 3; each Dimension position x Fix projected length.
Records the jogged flange's Y range (vertices with x > 3.5), the part's max X, volume and flat size.

    python jog.py            -> Output\\SolidWorks Models\\Anvil reference\\jog-<pos>-<fix>.SLDPRT + jog.json
"""
from swref import *

DIMPOS = {"inside": 1, "outside": 2, "overall": 3}          # swJogDimensionPositionType_e
# InsertSheetMetalJog's own DimPos argument is NOT that enum: passing 2 stored Inside Offset (1) and 1 stored
# Outside (2).  So the jog is made with any DimPos, then IJogFeatureData is set and ModifyDefinition'd.


def build(sw, pos, fix, bendpos=1):
    m = new_part(sw)
    try:
        base_flange_top(m)
        # the line on the top face, edge to edge (a line past the edges, or on the Top plane, made no jog)
        sk = sketch_lines(m, lambda: select_at(m, "FACE", 2, T, 1), [(3, 0, 3, -2)])
        # InsertSheetMetalJog takes the ANGLE IN DEGREES (pi/2 made nothing); radius / offset in metres.
        # Select the sketch, then the fixed face (top face, x < 3) with mark 0.  The call sometimes makes
        # nothing the first time: retry.
        for attempt in range(4):
            m.ClearSelection2(True)
            sk.Select2(False, 0)
            select_at(m, "FACE", 1, T, 1, True, 0)
            m.InsertSheetMetalJog(90.0, R * IN, 0.5 * IN, False, fix, DIMPOS[pos], bendpos)
            if feature_of_type(m, "Jog") is not None:
                break
        jf = feature_of_type(m, "Jog")
        jd = val(jf, "GetDefinition")
        jd.AccessSelections(m, nothing())
        jd.DimensionPositionType = DIMPOS[pos]
        jd.JogPositionType = bendpos                      # swJogPositionType_e: 1 Bend Centerline
        jd.FixProjectedLength = fix
        jf.ModifyDefinition(jd, m, nothing())
        rebuild(m)
        names = [val(f, "GetTypeName2") for f in features(m)]
        if not any(n in ("Jog",) for n in names):
            raise RuntimeError("no jog: " + str(names))
        vs = vertices(m)
        far = [v for v in vs if v[0] > 3.5]
        near_ = [v for v in vs if v[0] < 2.5]
        res_side = {"nearYlo": min(v[1] for v in near_), "nearYhi": max(v[1] for v in near_)}
        res = {"pos": pos, "fixProjLen": fix, "features": names,
               "flangeYlo": min(v[1] for v in far), "flangeYhi": max(v[1] for v in far),
               "xmax": max(v[0] for v in vs), "xmin": min(v[0] for v in vs),
               "box": part_box(m), "volume": volume(m)}
        res.update(res_side)
        jd = val(feature_of_type(m, "Jog"), "GetDefinition")
        res["jogData"] = {"dimPos": jd.DimensionPositionType, "fixProj": jd.FixProjectedLength,
                          "position": jd.JogPositionType, "angle": jd.JogAngle, "offset": jd.OffsetDistance / IN,
                          "radius": jd.BendRadius / IN, "defaultRadius": jd.UseDefaultBendRadius,
                          "reverse": jd.ReverseDirection}
        res["flat"] = flat(m)
        res["file"] = save_close(sw, m, "jog-%s-%s" % (pos, "fix" if fix else "nofix"))
        return res
    except Exception:
        close_unsaved(sw, m)
        raise


if __name__ == "__main__":
    sw = sw_app()
    out = []
    for pos in ("outside", "inside", "overall"):
        for fix in (True, False):
            r = build(sw, pos, fix)
            print(pos, fix, r["flangeYlo"], r["flangeYhi"], r["xmax"], r["volume"], r["flat"]["size"], flush=True)
            out.append(r)
    dump("jog", out)
