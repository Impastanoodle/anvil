"""Item 4 - Miter flange: 4 x 2 base flange (16 ga, R = T, K 0.5); a 1 in straight profile (a vertical line from
the top face's z = 2 edge at x = 0, on the Right plane) run along the z = 2 and x = 4 top edges, Material
Inside, rip gap 0.01.  Records the flat size and volume, the part volume and extents.

    BLOCKED (2026-10-27, SolidWorks 2022 SP5): InsertSheetMetalMiterFlange returned Nothing for every selection
    tried - sketch by Select2 / by name, then the two edges (or one), marks 0 / 1 / 4, edges first, Material Inside
    and Bend Outside, custom or default relief and radius.  A profile on the end face instead did not place
    reliably either.  Next try: IFeatureManager.CreateDefinition has no miter type in 2022; record a macro of
    the PropertyManager in SolidWorks to see the selection marks it uses.

    python miter.py   -> Output\\SolidWorks Models\\Anvil reference\\miter.SLDPRT + miter.json
"""
from swref import *


def build(sw, position=1, gap=0.01):
    m = new_part(sw)
    try:
        base_flange_top(m)
        right = plane(m, 2)
        # Right plane sketch: sketch x = -Z, y = Y (checked: the line lands on the z = 2 edge's end, y 0..1 + T)
        sk = sketch_lines(m, lambda: right.Select2(False, 0), [(-2, 0, -2, 1)])
        f = None
        tried = []
        combos = [(o, sm_, em, pos) for pos in (position,) for o in ("byname", "one-edge", "sketch-first")
                  for sm_, em in ((0, 0), (0, 1), (4, 1))]
        for order, skmark, emark, pos in combos:
            m.ClearSelection2(True)
            if order == "sketch-first" or order == "one-edge":
                sk.Select2(False, skmark)
            if order == "byname":
                m.Extension.SelectByID2(sk.Name, "SKETCH", 0, 0, 0, False, skmark, nothing(), 0)
            select_at(m, "EDGE", 2, T, 2, True, emark)
            if order != "one-edge":
                select_at(m, "EDGE", 4, T, 1, True, emark)
            if order == "edges-first":
                sk.Select2(True, skmark)
            # (UseDefaultRadius, R, RipGap, UseDefaultRelief, UseReliefRatio, Ratio, W, D, ReliefType,
            #  TrimSideBends, FlangePos, Offset1, Offset2, PCBA)
            f = m.FeatureManager.InsertSheetMetalMiterFlange(True, R * IN, gap * IN, True, True, 0.5, 0.0, 0.0, 1,
                                                              False, pos, 0.0, 0.0, nothing())
            if f is None:   # a miter flange with only the defaults (no custom relief / radius)
                f = m.FeatureManager.InsertSheetMetalMiterFlange(True, 0.0, gap * IN, True, False, 0.0, 0.0, 0.0, 1,
                                                                  False, pos, 0.0, 0.0, nothing())
            tried.append((order, skmark, emark, pos, f is not None))
            if f is not None:
                break
        if f is None:
            raise RuntimeError("InsertSheetMetalMiterFlange failed: %s" % tried)
        rebuild(m)
        d = val(f, "GetDefinition")
        res = {"tried": tried, "position": position, "gap": gap, "volume": volume(m),
               "data": {"gap": d.GapDistance / IN, "radius": d.BendRadius / IN},
               "ymax": extreme(m, (0, 1, 0))[1], "xmax": extreme(m, (1, 0, 0))[0], "zmax": extreme(m, (0, 0, 1))[2],
               "xmin": extreme(m, (-1, 0, 0))[0], "box": part_box(m)}
        res["flat"] = flat(m)
        res["file"] = save_close(sw, m, "miter")
        return res
    except Exception:
        close_unsaved(sw, m)
        raise


if __name__ == "__main__":
    sw = sw_app()
    r = build(sw)
    print(r["tried"], "vol", r["volume"], "y", r["ymax"], "x", r["xmin"], r["xmax"], "z", r["zmax"], "flat", r["flat"], flush=True)
    dump("miter", [r])
