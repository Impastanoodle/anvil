"""Lane DU (2026-10-27): why does SolidWorks 2022 import Anvil's millimetre flat DXF 25.4x too big (as inches) when
an ezdxf-written mm DXF and Anvil's own DWG twin come in at the right size? Variants of u-bracket-flat.dxf with
header variables added, each imported as a part sketch; the sketch's X extent tells mm (210.744) from inch (5352.9).

    python head-tools/sw-reference/unitprobe.py
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import ezdxf  # noqa: E402
import dwgcheck  # noqa: E402
from swref import val  # noqa: E402

SRC = os.path.join(dwgcheck.TEST, "u-bracket-flat.dxf")
DIR = os.path.join(dwgcheck.NEW, "unitprobe")

VARIANTS = {
    "as-written": [],
    "limits-metric": ["$LIMMIN", "10", "0", "20", "0", "$LIMMAX", "10", "420", "20", "297"],
    "dimlunit-aunits": ["$AUNITS", "70", "0", "$DIMLUNIT", "70", "2", "$UNITMODE", "70", "0"],
    "dimalt-dimscale": ["$DIMALT", "70", "0", "$DIMSCALE", "40", "1.0"],
    "metric-dims": ["$DIMASZ", "40", "2.5", "$DIMTXT", "40", "2.5", "$DIMEXO", "40", "0.625", "$DIMDEC", "70", "2"],
}


def variant(name, extra):
    text = open(SRC, "r", encoding="latin-1").read()
    if extra:
        ins = []
        i = 0
        while i < len(extra):
            ins += ["  9", extra[i]]
            j = i + 1
            while j < len(extra) and not extra[j].startswith("$"):
                ins += [extra[j], extra[j + 1]]
                j += 2
            i = j
        nl = "\r\n" if "\r\n" in text else "\n"
        text = re.sub(r"(\$INSUNITS\s*\r?\n\s*70\s*\r?\n\s*4\s*\r?\n)", lambda m: m.group(1) + nl.join(ins) + nl, text, 1)
    os.makedirs(DIR, exist_ok=True)
    out = os.path.join(DIR, "u-bracket-" + name + ".dxf")
    with open(out, "w", encoding="latin-1", newline="") as fh:
        fh.write(text)
    ezdxf.readfile(out)                                   # still a valid DXF
    return out


def main():
    paths = {n: variant(n, e) for n, e in VARIANTS.items()}
    resaved = os.path.join(DIR, "u-bracket-ezdxf-resaved.dxf")
    ezdxf.readfile(SRC).saveas(resaved)
    paths["ezdxf-resaved"] = resaved
    # every header variable a fresh ezdxf mm drawing has, added where Anvil's file has none
    ref = ezdxf.new("R2000", units=4)
    doc = ezdxf.readfile(SRC)
    for k in ref.header.varnames():
        if k not in doc.header and k not in ("$HANDSEED",):
            doc.header[k] = ref.header[k]
    allvars = os.path.join(DIR, "u-bracket-all-header-vars.dxf")
    doc.saveas(allvars)
    paths["all-header-vars"] = allvars
    # the entities copied into a fresh ezdxf mm drawing
    from ezdxf.addons import Importer
    new = ezdxf.new("R2000", units=4)
    imp = Importer(ezdxf.readfile(SRC), new)
    imp.import_modelspace()
    imp.finalize()
    fresh = os.path.join(DIR, "u-bracket-into-fresh-ezdxf.dxf")
    new.saveas(fresh)
    paths["into-fresh-ezdxf"] = fresh
    only = sys.argv[1:]
    if only:
        paths = {k: v for k, v in paths.items() if k in only}
    sw = dwgcheck.sw_app()
    res = {}
    for n, p in paths.items():
        model, info = dwgcheck.import_one(sw, p)
        try:
            sk = dwgcheck.read_sketches(model, 0)
            res[n] = sk[0]["extents"] if sk else None
        finally:
            sw.CloseDoc(val(model, "GetTitle"))
        print(n, res[n])
    with open(os.path.join(DIR, "unitprobe.json"), "w") as fh:
        json.dump(res, fh, indent=1)


def bisect():
    """Find which of ezdxf's default header variables makes SolidWorks read Anvil's $INSUNITS 4 as mm."""
    ref = ezdxf.new("R2000", units=4)
    base = ezdxf.readfile(SRC)
    cand = [k for k in ref.header.varnames() if k not in base.header and k != "$HANDSEED"]
    sw = dwgcheck.sw_app()
    n = [0]

    def ok(keys):
        doc = ezdxf.readfile(SRC)
        for k in keys:
            doc.header[k] = ref.header[k]
        n[0] += 1
        p = os.path.join(DIR, "bisect-%02d.dxf" % n[0])
        doc.saveas(p)
        model, info = dwgcheck.import_one(sw, p)
        try:
            x = dwgcheck.read_sketches(model, 0)[0]["extents"][2]
        finally:
            sw.CloseDoc(val(model, "GetTitle"))
        good = abs(x - 210.744247) < 1e-3
        print(len(keys), keys[:4], "..." if len(keys) > 4 else "", "x max", round(x, 4), "mm OK" if good else "wrong")
        return good

    keys = cand
    while len(keys) > 1:
        half = len(keys) // 2
        a, b = keys[:half], keys[half:]
        if ok(a):
            keys = a
        elif ok(b):
            keys = b
        else:
            print("needs variables from both halves:", a, b)
            break
    print("found:", keys, [ref.header[k] for k in keys])
    return keys


if __name__ == "__main__":
    if sys.argv[1:] == ["--bisect"]:
        bisect()
    else:
        main()
