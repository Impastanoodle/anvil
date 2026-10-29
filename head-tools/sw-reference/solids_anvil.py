"""Anvil side of the solids reference audit (lane FH, 2026-10-29): the parts of solids_ref.py as Anvil scripts,
built by `node anvil/headless/anvil.js build` on Anvil's engine and with --occt (OpenCascade), compared with the
SolidWorks numbers in OUT/solids.json.

    python head-tools/sw-reference/solids_anvil.py [--occt-runner <path to an anvil.js whose vendor/occt exists>]
Writes OUT/anvil.json and prints a markdown table per part (the report's tables).
"""
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER = os.path.normpath(os.path.join(HERE, "..", "..", "anvil", "headless", "anvil.js"))
OUT = r"C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\solids"

U = 'p.units("in");\n'
PLATE_HOLE = U + 'p.sketch("Top").centerRect(0, 0, 3, 3).end();\np.extrude(1);\np.sketch("Top", 1).circle(0, 0, 0.5).end();\np.cut("through", { reverse: true });\n'
BOX12 = [(0, 0, 0.75), (0, 0, -0.75), (0, 1, 0.75), (0, 1, -0.75), (1, 0, 0), (-1, 0, 0), (1, 1, 0), (-1, 1, 0),
         (1, 0.5, 0.75), (1, 0.5, -0.75), (-1, 0.5, 0.75), (-1, 0.5, -0.75)]


def pts(ps):
    return "[" + ", ".join("[%g, %g, %g]" % p for p in ps) + "]"


SCRIPTS = {
    "P01_extrude_draft": U + 'p.sketch("Top").centerRect(0, 0, 2, 1).end();\np.extrude(1, { draft: 5 });\n',
    "P02_revolve_arcs": U + 'p.sketch("Front").line(0, 0, 1, 0).line(1, 0, 1, 0.5).arc(1, 0.75, 0.25, 90, 270)'
                            '.line(1, 1, 1, 1.5).arc(0.5, 1.5, 0.5, 0, 180).line(0, 1.5, 0, 0).end();\np.revolve(360);\n',
    "P03_cyl_rim_fillet": U + 'p.sketch("Top").circle(0, 0, 1).end();\np.extrude(1);\np.fillet(0.25, [[1, 1, 0]]);\n',
    "P04_hole_edge_fillet": PLATE_HOLE + 'p.fillet(0.125, [[0.5, 1, 0]]);\n',
    "P05_boss_root_fillet": U + 'p.sketch("Top").centerRect(0, 0, 3, 3).end();\np.extrude(0.5);\n'
                                'p.sketch("Top", 0.5).circle(0, 0, 0.5).end();\np.extrude(1);\np.fillet(0.125, [[0.5, 0.5, 0]]);\n',
    "P06_box_fillet_all": U + 'p.sketch("Top").centerRect(0, 0, 2, 1.5).end();\np.extrude(1);\np.fillet(0.25, ' + pts(BOX12) + ');\n',
    "P07_corner_unequal_fillets": U + 'p.sketch("Top").rect(0, -2, 2, 2).end();\np.extrude(2);\n'
                                      'p.fillet(0.5, [[1, 2, 2]]);\np.fillet(0.25, [[2, 2, 1]]);\np.fillet(0.375, [[2, 1, 2]]);\n',
    "P08_hole_chamfer": PLATE_HOLE + 'p.chamfer(0.1, [[0.5, 1, 0]]);\n',
    "P09_shell_filleted_box": U + 'p.sketch("Top").centerRect(0, 0, 3, 2).end();\np.extrude(1.5);\n'
                                  'p.fillet(0.5, [[1.5, 0.75, 1], [1.5, 0.75, -1], [-1.5, 0.75, 1], [-1.5, 0.75, -1]]);\n'
                                  'p.shell(0.1, [[0, 1.5, 0]]);\n',
    "P10_cbore_csk": U + 'p.sketch("Top").centerRect(0, 0, 3, 2).end();\np.extrude(0.75);\n'
                         'p.holeWizard({ face: "Top", offset: 0.75, points: [[-0.75, 0]], standard: "ANSI Inch", type: "cbore", size: "1/4", fit: "normal", end: "through" });\n'
                         'p.holeWizard({ face: "Top", offset: 0.75, points: [[0.75, 0]], standard: "ANSI Inch", type: "csk", size: "1/4", fit: "normal", end: "through" });\n',
    "P11_loft_rect_circle": U + 'var s1 = p.sketch("Top").centerRect(0, 0, 2, 2).id();\nvar s2 = p.sketch("Top", 2).circle(0, 0, 1).id();\np.loft([s1, s2]);\n',
    "P12_sweep_arc": U + 'var prof = p.sketch("Top").circle(0, 0, 0.25).id();\nvar path = p.sketch("Front").arc(2, 0, 2, 90, 180).id();\n'
                         'p.sweep({ profile: prof, path: path });\n',
    "P13_rib": U + 'p.sketch("Front").polyline([[0, 0], [4, 0], [4, 0.25], [0.25, 0.25], [0.25, 3], [0, 3]]).end();\n'
                   'p.extrude(2, { midplane: true });\np.sketch("Front").line(0.25, 2, 3, 0.25).end();\np.rib(0.25);\n',
    "P14_draft_face": U + 'p.sketch("Top").centerRect(0, 0, 2, 2).end();\np.extrude(1);\np.draft(5, [0, 0, 0], [[1, 0.5, 0]]);\n',
    # Anvil patterns one feature (its tool body), not a fillet: pattern the boss, then fillet every rim (same solid)
    "P15_lpattern_filleted_boss": U + 'p.sketch("Top").rect(0, -1, 4, 2).end();\np.extrude(0.25);\n'
                                      'p.sketch("Top", 0.25).circle(0.5, 0, 0.25).end();\np.extrude(0.5);\n'
                                      'p.linearPattern({ dir: "x", spacing: 1.5, count: 3 });\n'
                                      'p.fillet(0.1, [[0.75, 0.75, 0], [2.25, 0.75, 0], [3.75, 0.75, 0]]);\n',
    "P16_cpattern_filleted_boss": U + 'p.sketch("Top").circle(0, 0, 2).end();\np.extrude(0.25);\n'
                                      'p.sketch("Top", 0.25).circle(1.25, 0, 0.25).end();\np.extrude(0.5);\n'
                                      'p.circularPattern({ axis: "y", center: [0, 0, 0], count: 6 });\n'
                                      'p.fillet(0.1, [' + ", ".join("[%.9f, 0.75, %.9f]" % (
                                          1.5 * __import__("math").cos(__import__("math").radians(60 * k)),
                                          -1.5 * __import__("math").sin(__import__("math").radians(60 * k))) for k in range(6)) + ']);\n',
}


def run(runner, path, occt):
    cmd = ["node", runner, "build", path] + (["--occt"] if occt else [])
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    try:
        return json.loads(p.stdout)
    except ValueError:
        return {"error": (p.stdout + p.stderr)[-400:]}


def rel(a, b):
    return None if a is None or b is None else (a - b) / b


def main():
    occt_runner = RUNNER
    if "--occt-runner" in sys.argv:
        occt_runner = sys.argv[sys.argv.index("--occt-runner") + 1]
    sw = json.load(open(os.path.join(OUT, "solids.json")))
    tmp = tempfile.mkdtemp(prefix="anvil-fh-")
    res = {}
    for name, code in SCRIPTS.items():
        path = os.path.join(tmp, name + ".anvil.js")
        with open(path, "w") as fh:
            fh.write(code)
        a = run(RUNNER, path, False)
        o = run(occt_runner, path, True).get("occt", {})
        res[name] = {"anvil": a, "occt": o, "script": code}
        s = sw.get(name, {})
        print("\n### %s\n" % name)
        print("| | SolidWorks | Anvil | rel | OpenCascade | rel |\n|---|---|---|---|---|---|")
        print("| volume in³ | %.6f | %s | %s | %s | %s |" % (
            s.get("volume", 0), a.get("volume"), fmt(rel(a.get("volume"), s.get("volume"))), o.get("volume"),
            fmt(rel(o.get("volume"), s.get("volume")))))
        print("| area in² | %.6f | %s | %s | | |" % (s.get("area", 0), a.get("area"), fmt(rel(a.get("area"), s.get("area")))))
        print("| faces | %s | %s | | %s | |" % (s.get("faces"), a.get("faces"), o.get("faces")))
        c = s.get("centroid") or [0, 0, 0]
        print("| centroid | %s | %s | | | |" % (", ".join("%.4f" % v for v in c), a.get("centroid")))
        bb = s.get("bbox") or []
        ab = a.get("bbox") or {}
        print("| bbox | %s | %s | | | |" % (", ".join("%.4f" % v for v in bb), ab.get("min", []) + ab.get("max", [])))
        if a.get("errors") or a.get("warnings"):
            print("| messages | | %s | | | |" % json.dumps((a.get("errors") or []) + (a.get("warnings") or []))[:300])
        if o.get("valid") is False or o.get("unsupported"):
            print("| occt | | | | valid %s, unsupported %s | |" % (o.get("valid"), o.get("unsupported")))
    with open(os.path.join(OUT, "anvil.json"), "w") as fh:
        json.dump(res, fh, indent=1)


def fmt(x):
    return "" if x is None else "%+.2e" % x


if __name__ == "__main__":
    main()
