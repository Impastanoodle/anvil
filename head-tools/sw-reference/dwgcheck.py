"""Lane DU (2026-10-27): open Anvil's flat DXF / DWG files in SolidWorks as a part sketch (the DXF/DWG Import
wizard's "Import to a new part as 2D sketch", through ImportDxfDwgData + LoadFile4), read back what came in and
compare it with the file (dxfsum.py) and with the DWG's DXF twin.

    python head-tools/sw-reference/dwgcheck.py [name ...]

Each import is saved as dwg-check-<name>-<dxf|dwg>.SLDPRT in OUT and closed; dwgcheck.json holds the results.
"""
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import pythoncom  # noqa: E402
from swref import OUT, val, items, nothing, features, r6  # noqa: E402
from sw_com import byref_int  # noqa: E402
import win32com.client as wc  # noqa: E402
from dxfsum import summary  # noqa: E402

TEST = r"C:\Users\Lucas\Desktop\Output\Flat Patterns\Anvil DWG test"
NEW = os.path.join(OUT, "dwg-check")
FILES = {
    "u-bracket": os.path.join(TEST, "u-bracket-flat"),
    "normal-cut-bracket": os.path.join(TEST, "normal-cut-bracket-flat"),
    "hole-across-bend": os.path.join(NEW, "hole-across-bend-flat"),
    "hem": os.path.join(NEW, "hem-flat"),
    "etch-text": os.path.join(NEW, "etch-text-flat"),
    # control: a DXF written by ezdxf (not Anvil), mm, with a %%d text: does SolidWorks honour its $INSUNITS?
    "control-ezdxf-mm": os.path.join(NEW, "control-ezdxf-mm"),
}
SEG = {0: "line", 1: "arc", 2: "ellipse", 3: "spline", 4: "text", 5: "parabola"}
UNIT_M = {0: 0.001, 1: 0.01, 2: 1.0, 3: 0.0254, 4: 0.3048}


def sw_app():
    """Attach to SolidWorks, or start it (Dispatch) if it is not running, and make it visible."""
    try:
        unk = pythoncom.GetActiveObject("SldWorks.Application")
        sw = wc.dynamic.Dispatch(unk.QueryInterface(pythoncom.IID_IDispatch))
    except pythoncom.com_error:
        sw = wc.dynamic.Dispatch("SldWorks.Application")
    sw.Visible = True
    return sw


def prop_get(o, name, *args):
    ole = o._oleobj_
    return ole.Invoke(ole.GetIDsOfNames(name), 0, pythoncom.DISPATCH_PROPERTYGET, 1, *args)


def prop_put(o, name, *args):
    """A property with an index argument (VBA: importData.ImportMethod("") = 2)."""
    ole = o._oleobj_
    return ole.Invoke(ole.GetIDsOfNames(name), 0, pythoncom.DISPATCH_PROPERTYPUT, 0, *args)


def arc_extents(c, r, a0, a1, ccw):
    """Points bounding an arc from angle a0 to a1 (radians), counter-clockwise if ccw."""
    if not ccw:
        a0, a1 = a1, a0
    while a1 <= a0:
        a1 += 2 * math.pi
    pts = [(c[0] + r * math.cos(a0), c[1] + r * math.sin(a0)), (c[0] + r * math.cos(a1), c[1] + r * math.sin(a1))]
    k = math.ceil(a0 / (math.pi / 2))
    while k * math.pi / 2 < a1:
        a = k * math.pi / 2
        pts.append((c[0] + r * math.cos(a), c[1] + r * math.sin(a)))
        k += 1
    return pts


def read_sketches(model, unit):
    """Every sketch in the part: segment counts by type and by layer, text strings, extents (file units)."""
    out = []
    for f in features(model):
        if val(f, "GetTypeName2") != "ProfileFeature":
            continue
        sk = val(f, "GetSpecificFeature2")
        counts, layers, pts, texts, cons = {}, {}, [], [], []
        for s in items(val(sk, "GetSketchSegments")):
            t = SEG.get(val(s, "GetType"), str(val(s, "GetType")))
            if t == "arc" and val(s, "IsCircle"):
                t = "circle"
            if s.ConstructionGeometry:
                t += "(construction)"
            lay = val(s, "Layer")
            counts[t] = counts.get(t, 0) + 1
            layers.setdefault(lay, {}).setdefault(t, 0)
            layers[lay][t] += 1
            if t.startswith("line"):
                p0, p1 = val(s, "GetStartPoint2"), val(s, "GetEndPoint2")
                pts += [(p0.X, p0.Y), (p1.X, p1.Y)]
                if t != "line":
                    k = 1.0 / UNIT_M[unit]
                    cons.append([p0.X * k, p0.Y * k, p1.X * k, p1.Y * k])
            elif t in ("arc", "circle"):
                c, r = val(s, "GetCenterPoint2"), val(s, "GetRadius")
                if t == "circle":
                    pts += [(c.X - r, c.Y - r), (c.X + r, c.Y + r)]
                else:
                    p0, p1 = val(s, "GetStartPoint2"), val(s, "GetEndPoint2")
                    a0 = math.atan2(p0.Y - c.Y, p0.X - c.X)
                    a1 = math.atan2(p1.Y - c.Y, p1.X - c.X)
                    pts += arc_extents((c.X, c.Y), r, a0, a1, val(s, "GetRotationDir") == 1)
        # sketch text: the ISketchText objects behind text-type segments
        for s in items(val(sk, "GetSketchSegments")):
            if val(s, "GetType") == 4:
                try:
                    texts.append(val(s, "Text"))
                except Exception as e:
                    texts.append("(text: %s)" % e)
        ext = None
        if pts:
            k = 1.0 / UNIT_M[unit]
            ext = [min(p[0] for p in pts) * k, min(p[1] for p in pts) * k, max(p[0] for p in pts) * k,
                   max(p[1] for p in pts) * k]
        out.append({"sketch": val(f, "Name"), "counts": counts, "layers": layers, "extents": ext, "texts": texts,
                    "construction": cons})
    return out


def note_texts(model):
    """Imported TEXT can also come in as notes / annotations: list their strings."""
    out = []
    try:
        for a in items(val(val(model, "Extension"), "GetAnnotations")):
            try:
                n = val(a, "GetSpecificAnnotation")
                out.append(val(n, "GetText"))
            except Exception:
                out.append("(annotation type %s)" % val(a, "GetType"))
    except Exception as e:
        out.append("GetAnnotations failed: %s" % e)
    return out


FORCE_UNIT = None     # --unit mm|in: set ImportDxfDwgData.LengthUnit("") before loading (default: SolidWorks' own)
SUFFIX = ""


def import_one(sw, path):
    data = sw.GetImportFileData(path)
    if data is None:
        return None, {"error": "GetImportFileData returned Nothing"}
    prop_put(data, "ImportMethod", "", 2)                # swImportDxfDwg_ImportToPartSketch
    if FORCE_UNIT is not None:
        prop_put(data, "LengthUnit", "", FORCE_UNIT)     # swLengthUnit_e
    info = {"importMethod": prop_get(data, "ImportMethod", ""), "lengthUnitBefore": prop_get(data, "LengthUnit", "")}
    err = byref_int()
    model = sw.LoadFile4(path, "", data, err)
    info["loadErrors"] = err.value if hasattr(err, "value") else err
    try:
        info["lengthUnit"] = prop_get(data, "LengthUnit", "")
        info["addConstraints"] = prop_get(data, "AddSketchConstraints", "")
        info["importDimensions"] = prop_get(data, "ImportDimensions", "")
    except Exception as e:
        info["readBack"] = str(e)
    return model, info


def main(names):
    sw = sw_app()
    results = {}
    for name in names:
        base = FILES[name]
        results[name] = {}
        for ext in ("dxf", "dwg"):
            path = base + "." + ext
            want = summary(base + ".dxf")
            row = {"file": path, "expected": {"counts": want["counts"], "layers": want["layers"],
                                               "extents": want["extents"], "insunits": want["insunits"],
                                               "texts": [t["text"] for t in want["texts"]]}}
            try:
                model, info = import_one(sw, path)
                row.update(info)
                if model is None:
                    row["opened"] = False
                else:
                    row["opened"] = True
                    row["title"] = val(model, "GetTitle")
                    u = val(model, "GetUnits")
                    row["docUnits"] = u[0] if u else None
                    unit = {1: 3, 4: 0}.get(want["insunits"], 3)      # extents in the file's own unit
                    row["extentsUnit"] = {3: "in", 0: "mm"}[unit]
                    row["sketches"] = read_sketches(model, unit)
                    row["notes"] = note_texts(model)
                    row["featureTree"] = [val(f, "Name") + ":" + val(f, "GetTypeName2") for f in features(model)
                                          if val(f, "GetTypeName2") in ("ProfileFeature", "RefPlane")]
                    sp = os.path.join(OUT, "dwg-check-%s-%s%s.SLDPRT" % (name, ext, SUFFIX))
                    e = model.SaveAs3(sp, 0, 1)
                    row["saved"] = sp if not e else "SaveAs3 error %s" % e
                    row["title"] = val(model, "GetTitle")          # SaveAs renames the document
            except Exception as e:
                row["exception"] = repr(e)
            finally:
                if row.get("title"):
                    sw.CloseDoc(row["title"])
            results[name][ext] = row
            print(name, ext, json.dumps(r6({k: v for k, v in row.items() if k not in ("expected", "file")})))
    with open(os.path.join(OUT, "dwgcheck%s.json" % SUFFIX), "w") as fh:
        json.dump(r6(results), fh, indent=1)


def write_control():
    """A DXF written by ezdxf (not Anvil): mm ($INSUNITS 4), a 100 x 50 outline, a BEND line, a circle, a %%d text,
    to tell an Anvil DXF problem from SolidWorks' own import behaviour. Its DWG twin comes from Anvil's dwg-writer.js."""
    import ezdxf
    import subprocess
    doc = ezdxf.new("R2000", units=4)
    doc.header["$MEASUREMENT"] = 1
    for n, c in (("OUTLINE", 7), ("BEND", 3), ("NOTES", 5)):
        doc.layers.add(n, color=c)
    m = doc.modelspace()
    m.add_lwpolyline([(0, 0), (100, 0), (100, 50), (0, 50)], close=True, dxfattribs={"layer": "OUTLINE"})
    m.add_line((40, 0), (40, 50), dxfattribs={"layer": "BEND"})
    m.add_circle((70, 25), 5, dxfattribs={"layer": "OUTLINE"})
    m.add_text("UP 90%%d R2", dxfattribs={"layer": "NOTES", "height": 2.0}).set_placement((42, 25))
    base = FILES["control-ezdxf-mm"]
    doc.saveas(base + ".dxf")
    anvil = os.path.normpath(os.path.join(HERE, "..", "..", "anvil", "headless", "anvil.js"))
    r = subprocess.run(["node", anvil, "dwg", base + ".dxf", base + ".dwg"], capture_output=True, text=True)
    print("control dwg:", r.returncode, r.stdout.strip()[-200:], r.stderr.strip()[-300:])


if __name__ == "__main__":
    args = sys.argv[1:]
    if "--control" in args:
        write_control()
        args.remove("--control")
    if "--unit" in args:
        i = args.index("--unit")
        FORCE_UNIT = {"mm": 0, "in": 3}[args[i + 1]]
        SUFFIX = "-unit-" + args[i + 1]
        del args[i:i + 2]
    main(args or list(FILES))
