"""SolidWorks' own Hole Wizard sizes for every size / fit Anvil's holewizard.js offers (lane FH2, 2026-10-29).

For each (standard, hole type, fastener type, size) one Hole Wizard hole is made in a plate with HoleWizard5 (every
Value argument -1, so SolidWorks fills them from its database), then for each fit the hole data's HoleFit is set and
ModifyDefinition re-reads the database. Read back: through-hole / tap drill diameter, counterbore diameter and depth,
countersink diameter and angle. ANSI Inch in inches, ISO in mm.

    python head-tools/sw-reference/solids_holes.py [probe]
Writes head-tools/sw-reference/sw-holewizard.json (the kernel test rfFH2 checks holewizard.js against it).
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from swref import sw_app, new_part, IN  # noqa: E402
from sw_com import val, nothing  # noqa: E402
import solids_ref as R  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
JSON = os.path.join(HERE, "sw-holewizard.json")

ANSI_SCREWS = ['#2', '#3', '#4', '#5', '#6', '#8', '#10', '#12', '1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8',
               '3/4', '7/8', '1']
ANSI_THREADS = ['#2-56', '#2-64', '#3-48', '#3-56', '#4-40', '#4-48', '#5-40', '#5-44', '#6-32', '#6-40', '#8-32',
                '#8-36', '#10-24', '#10-32', '#12-24', '#12-28', '1/4-20', '1/4-28', '5/16-18', '5/16-24', '3/8-16',
                '3/8-24', '7/16-14', '7/16-20', '1/2-13', '1/2-20', '9/16-12', '9/16-18', '5/8-11', '5/8-18', '3/4-10',
                '3/4-16', '7/8-9', '7/8-14', '1-8', '1-12']
ISO_SIZES = ['M2', 'M2.5', 'M3', 'M4', 'M5', 'M6', 'M8', 'M10', 'M12', 'M14', 'M16', 'M20']
ISO_PITCH = {'M2': '0.4', 'M2.5': '0.45', 'M3': '0.5', 'M4': '0.7', 'M5': '0.8', 'M6': '1.0', 'M8': '1.25',
             'M10': '1.5', 'M12': '1.75', 'M14': '2.0', 'M16': '2.0', 'M20': '2.5'}

# (key, generic type, standard, fastener type, sizes, fits?)  swWzdGeneralHoleTypes_e: 0 cbore, 1 csk, 2 hole, 4 tap
JOBS = [
    ("ansi.cbore", 0, 0, 9, ANSI_SCREWS, True),          # Socket Head Cap Screw
    ("ansi.csk", 1, 0, 15, ANSI_SCREWS, True),           # Flat Head (82)
    ("ansi.hole", 2, 0, 22, ANSI_SCREWS, True),          # Screw Clearances
    ("ansi.tap", 4, 0, 27, ANSI_THREADS, False),         # Tapped Hole
    ("iso.cbore", 0, 8, 139, ISO_SIZES, True),           # Socket Head Cap Screw ISO 4762
    ("iso.csk", 1, 8, 140, ISO_SIZES, True),             # Socket Countersunk Head ISO 10642
    ("iso.hole", 2, 8, 144, ISO_SIZES, True),            # Screw Clearances
    ("iso.tap", 4, 8, 147, ISO_SIZES, False),            # Tapped Hole
]


def read(d, unit):
    out = {}
    for k in ("HoleDiameter", "ThruHoleDiameter", "TapDrillDiameter", "ThruTapDrillDiameter", "ThreadDiameter",
              "CounterBoreDiameter", "CounterBoreDepth", "CounterSinkDiameter", "CounterSinkAngle", "HoleFit",
              "FastenerSize"):
        try:
            v = getattr(d, k)
        except Exception:  # noqa: BLE001
            continue
        if k == "CounterSinkAngle":
            v = round(math.degrees(v), 6)
        elif k in ("HoleFit", "FastenerSize"):
            pass
        elif isinstance(v, float):
            v = round(v / unit, 6)
        out[k] = v
    return out


def make(model, gtype, std, fast, size):
    model.ClearSelection2(True)
    R.face_at(model, 0, 1, 0)()
    # a plain Hole returned Nothing with Through All: make it blind 0.5 in (the diameters do not depend on it)
    end, depth = (0, 0.5 * IN) if gtype == 2 else (1, -1)
    f = model.FeatureManager.HoleWizard5(gtype, std, fast, size, end, -1, depth, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1,
                                         -1, -1, -1, "2B" if std == 0 and gtype == 4 else "", False, True, True, True,
                                         True, False)
    return f


def measure_job(sw, key, gtype, std, fast, sizes, fits, res):
    unit = IN if std == 0 else 0.001
    model = new_part(sw)
    R.CUR[0] = model
    try:
        s = R.sketch_on(model, R.P(model, 1), lambda sm: R.crect(sm, 0, 0, 20, 20))
        R.extrude(model, s, 1)
        for size in sizes:
            name = size
            if key == "iso.tap":
                name = size + "x" + ISO_PITCH[size]
            f = make(model, gtype, std, fast, name)
            if f is None and key == "iso.tap":
                f = make(model, gtype, std, fast, size)
            if f is None:
                res.setdefault(key, {})[size] = {"error": "HoleWizard5 returned Nothing for " + name}
                print(key, size, "FAILED")
                continue
            row = {}
            d = val(f, "GetDefinition")
            row["default"] = read(d, unit)
            if fits:
                for fit, fname in ((0, "close"), (1, "normal"), (2, "loose")):
                    d = val(f, "GetDefinition")
                    d.AccessSelections(model, nothing())
                    try:
                        d.HoleFit = fit
                    except Exception as e:  # noqa: BLE001
                        row[fname] = {"error": str(e)[:80]}
                        d.ReleaseSelectionAccess()
                        continue
                    f.ModifyDefinition(d, model, nothing())
                    row[fname] = read(val(f, "GetDefinition"), unit)
            res.setdefault(key, {})[size] = row
            print(key, size, json.dumps(row)[:300])
            R.sel(f, False, 0)
            model.EditDelete()
    finally:
        sw.CloseDoc(val(model, "GetTitle"))


def main():
    sw = sw_app()
    res = json.load(open(JSON)) if os.path.exists(JSON) else {}
    jobs = JOBS
    if "probe" in sys.argv:
        jobs = [("ansi.cbore", 0, 0, 9, ['1/4'], True), ("ansi.hole", 2, 0, 22, ['1/4'], True),
                ("iso.hole", 2, 8, 144, ['M6'], True)]
        res = {}
    for job in jobs:
        measure_job(sw, *job, res)
    if "probe" not in sys.argv:
        res["_about"] = ("SolidWorks 2022 SP5 Hole Wizard database values read over COM by solids_holes.py (lane FH2, "
                         "2026-10-29). ANSI Inch in inches, ISO in mm; fits close / normal / loose set through HoleFit.")
        with open(JSON, "w") as fh:
            json.dump(res, fh, indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
