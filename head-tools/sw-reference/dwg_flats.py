"""Lane DU (2026-10-27): write Anvil flat DXFs (R2000) and their DWG twins (Anvil's own dwg-writer.js) for the
SolidWorks DXF / DWG import check (dwgcheck.py).

    python head-tools/sw-reference/dwg_flats.py

Writes <name>.js (the Anvil part script), <name>-flat.dxf, <name>-flat.dwg and <name>.summary.json for each part
below into OUT_DIR (Output\\SolidWorks Models\\Anvil reference\\dwg-check). The two older flats (u-bracket,
normal-cut-bracket in Output\\Flat Patterns\\Anvil DWG test) were made the same way from examples 9 and 11.
"""
import json
import os
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
ANVIL = os.path.normpath(os.path.join(HERE, "..", "..", "anvil", "headless", "anvil.js"))
OUT_DIR = r"C:\Users\Lucas\Desktop\Output\SolidWorks Models\Anvil reference\dwg-check"

HEAD = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\n'
PARTS = {
    # Ø.2 hole and a .2 x .3 rectangular hole centred on the bend's trim line (x = 4 - (R + T) = 3.8804): both cross the bend
    "hole-across-bend": HEAD + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n'
    'p.sketch("Top", 0.0598).circle(3.88, -1.5, 0.1).cut("through", { reverse: true });\n'
    'p.sketch("Top", 0.0598).rect(3.78, -0.75, 0.2, 0.3).cut("through", { reverse: true });\n'
    'p.flange(1, [[4, 0.0598, 2.5]], { position: "inside" });\n',
    # closed hem 0.5 on the z = 2 edge, a Ø.25 hole in the base
    "hem": HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n'
    'p.sketch("Top", 0.0598).circle(1, -1, 0.125).cut("through", { reverse: true });\n'
    'p.hem(0.5, [[2, 0.0598, 2]], { hemType: "closed", hemPosition: "inside" });\n',
    # Etch text "PN 123" and an ETCH line on the base's top face, a flange on the x = 0 edge
    "etch-text": HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n'
    'p.flange(1, [[0, 0.0598, 1]], { position: "inside" });\n'
    'p.sketch("Top", 0.0598).text(2, -1, "PN 123", { h: 0.25 }).line(2, -1.5, 3.5, -1.5)'
    '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }]).layer("ETCH", [1]).end();\n',
}


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for name, code in PARTS.items():
        js = os.path.join(OUT_DIR, name + ".js")
        with open(js, "w") as fh:
            fh.write(code)
        dxf = os.path.join(OUT_DIR, name + "-flat.dxf")
        dwg = os.path.join(OUT_DIR, name + "-flat.dwg")
        r = subprocess.run(["node", ANVIL, "build", js, "--dxf-flat", dxf, "--dxf-version", "2000", "--quiet"],
                           capture_output=True, text=True)
        with open(os.path.join(OUT_DIR, name + ".summary.json"), "w") as fh:
            fh.write(r.stdout)
        s = json.loads(r.stdout) if r.stdout.strip().startswith("{") else {}
        print(name, "build exit", r.returncode, "errors", s.get("errors"), "warnings", s.get("warnings"))
        if r.returncode:
            print(r.stderr[-2000:])
            continue
        r2 = subprocess.run(["node", ANVIL, "dwg", dxf, dwg], capture_output=True, text=True)
        print(name, "dwg exit", r2.returncode, r2.stdout.strip()[:300], r2.stderr.strip()[-500:])


if __name__ == "__main__":
    main()
