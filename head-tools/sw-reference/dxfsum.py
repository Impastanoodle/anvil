"""Lane DU (2026-10-27): what a DXF holds, counted the way a SolidWorks sketch import counts it.

    python head-tools/sw-reference/dxfsum.py file.dxf [...]

LWPOLYLINE / POLYLINE are exploded (a bulged segment is an arc), so the counts compare with sketch segments:
lines, arcs, circles, text (TEXT / MTEXT), points, other; per layer; the extents of the geometry; $INSUNITS.
"""
import json
import math
import sys

import ezdxf
from ezdxf import bbox


def summary(path):
    doc = ezdxf.readfile(path)
    msp = doc.modelspace()
    counts, layers, other = {"line": 0, "arc": 0, "circle": 0, "text": 0, "point": 0}, {}, {}
    texts = []

    def add(kind, layer):
        counts[kind] += 1
        layers.setdefault(layer, {}).setdefault(kind, 0)
        layers[layer][kind] += 1

    geo = []
    for e in msp:
        t, lay = e.dxftype(), e.dxf.layer
        if t in ("LWPOLYLINE", "POLYLINE"):
            for v in e.virtual_entities():
                add("line" if v.dxftype() == "LINE" else "arc", lay)
            geo.append(e)
        elif t == "LINE":
            add("line", lay)
            geo.append(e)
        elif t == "ARC":
            add("arc", lay)
            geo.append(e)
        elif t == "CIRCLE":
            add("circle", lay)
            geo.append(e)
        elif t in ("TEXT", "MTEXT"):
            add("text", lay)
            texts.append({"layer": lay, "text": e.dxf.text if t == "TEXT" else e.text, "h": e.dxf.get("height") if t == "TEXT" else e.dxf.get("char_height")})
        elif t == "POINT":
            add("point", lay)
        else:
            other[t] = other.get(t, 0) + 1
    ext = bbox.extents(geo)
    return {"file": path, "version": doc.dxfversion, "insunits": doc.header.get("$INSUNITS"),
            "counts": counts, "segments": counts["line"] + counts["arc"] + counts["circle"], "layers": layers,
            "tables": sorted(l.dxf.name for l in doc.layers), "texts": texts, "other": other,
            "extents": [round(ext.extmin.x, 6), round(ext.extmin.y, 6), round(ext.extmax.x, 6), round(ext.extmax.y, 6)]
            if ext.has_data else None}


if __name__ == "__main__":
    for p in sys.argv[1:]:
        print(json.dumps(summary(p), indent=1))
