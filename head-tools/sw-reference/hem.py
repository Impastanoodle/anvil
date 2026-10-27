"""Item 3 - Hem: 4 x 2 base flange (16 ga, R = T, K 0.5), a hem on the 4 in edge at z = 2 (top face), Material
Inside: Closed (length 0.5), Open (length 0.5, gap 0.03), Tear Drop and Rolled (angle 270, radius 0.0598 =
Anvil's defaults).  Records the flat size, the part's Y and Z extents and the volume.

    python hem.py [types...]  -> Output\\SolidWorks Models\\Anvil reference\\hem-<type>[-outside].SLDPRT + hem.json
"""
import sys

from swref import *

HEM = {"open": 0, "closed": 1, "teardrop": 2, "rolled": 3}             # swHemTypes_e
HEMPOS = {"inside": 0, "outside": 1}                                     # swHemPositionTypes_e


def build(sw, kind, position="inside", reverse=False, length=0.5, gap=0.03, angle=270.0, radius=R):
    m = new_part(sw)
    try:
        base_flange_top(m)
        f = None
        for attempt in range(3):
            m.ClearSelection2(True)
            select_at(m, "EDGE", 2, T, 2)
            # (Type, Position, Reverse, Length, Gap, Angle [rad], Radius, MiterGap, PCBA, UseDefaultRelief,
            #  ReliefType, TearType, UseReliefRatio, Ratio, Width, Depth)
            f = m.FeatureManager.InsertSheetMetalHem2(HEM[kind], HEMPOS[position], reverse, length * IN, gap * IN,
                                                       math.radians(angle), radius * IN, 0.0, nothing(), True,
                                                       1, 0, True, 0.5, 0.0, 0.0)
            if f is not None:
                break
        if f is None:
            raise RuntimeError("InsertSheetMetalHem2 failed")
        rebuild(m)
        d = val(f, "GetDefinition")
        data = {}
        for k in ("Type", "Position", "Reverse", "Length", "Gap", "Angle", "Radius"):
            try:
                data[k] = getattr(d, k)
            except Exception:
                pass
        vs = vertices(m)
        res = {"type": kind, "position": position, "reverse": reverse, "data": data, "box": part_box(m),
               "volume": volume(m), "ymax": extreme(m, (0, 1, 0))[1], "ymin": extreme(m, (0, -1, 0))[1],
               "zmax": extreme(m, (0, 0, 1))[2],
               "hemZmin": min(v[2] for v in vs if v[1] > T + 1e-4 or v[1] < -1e-4) if any(v[1] > T + 1e-4 or v[1] < -1e-4 for v in vs) else None}
        res["flat"] = flat(m)
        res["file"] = save_close(sw, m, "hem-%s%s%s" % (kind, "-outside" if position == "outside" else "",
                                                          "-%d" % angle if kind == "teardrop" else ""))
        return res
    except Exception:
        close_unsaved(sw, m)
        raise


if __name__ == "__main__":
    sw = sw_app()
    out = []
    cases = [("closed", "inside", 270), ("open", "inside", 270), ("teardrop", "inside", 270),
             ("teardrop", "inside", 200), ("rolled", "inside", 270), ("closed", "outside", 270),
             ("open", "outside", 270)]
    for kind, pos, ang in cases:
        try:
            r = build(sw, kind, pos, angle=ang)
            r["angleDeg"] = ang
        except Exception as e:
            print(kind, pos, ang, "FAILED", e, flush=True)
            out.append({"type": kind, "position": pos, "angleDeg": ang, "error": str(e)})
            continue
        print(kind, pos, ang, r["data"], "y", r["ymin"], r["ymax"], "z", r["hemZmin"], r["zmax"], "vol", r["volume"], r["flat"]["size"], flush=True)
        out.append(r)
    dump("hem", out)
