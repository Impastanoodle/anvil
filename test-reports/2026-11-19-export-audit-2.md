# Export audit 2: this round's sheet-metal features out as DXF / DWG / STEP (2026-11-19, lane exportaudit2, group rfQO)

Started from bcfbf9f. Follows `2026-11-18-export-audit.md` (rfOM). Readers: Anvil's own (DxfImport, DxfCheck, the STEP
reader), LibreDWG 0.14 `dwg2dxf` (the main checkout's `anvil/vendor/libredwg`, copied untracked) and OpenCascade
(opencascade.js, `anvil/vendor/occt`, copied untracked). No ezdxf on this PC.

Corpus: `test-reports/repros/export-audit-2.js` (run: `node test-reports/repros/export-audit-2.js [--only text]
[--no-occt] [--no-dwg] [--json out]`, about 30 s for all 86 parts). 43 variants x inch / mm, 20 / 16 / 11 ga rotated
(inch .0359 / .0598 / .1196, mm 0.9 / 1.5 / 3), K .5 / .44 / .33:
Edge-Flange `lengths` (plain, Material Inside + rect relief, + tear relief + Corner-Trim); flange `profile` trapezoid /
notch (Bend Outside) / hole, a hem on the profile's top edge, a mirrored profile flange with dimples; reliefs rect /
obround / tear on a 4-flange tray (each flange beside a neighbour bend), also at 120 Bend Outside and 60 Material Outside;
Corner-Trim circular / square / Bend Waist / chamfer / fillet, square + fillet on a relief tray, chamfer with a Cross-Break;
louver Linear Pattern (x4, also 3 on a flange wall), dimple Circular Pattern (x4), louver Mirror, rib; Tab and Slot two
bodies / one body; Mirror of an Edge-Flange (with an obround relief too), closed / rolled / teardrop Hem, Jog; Circular
Pattern of a flange, Linear Pattern of a flange between notches; Cross-Break; a hem on a flange; Hole Wizard Up To Next
(csk #10 / M5 in a 90 / 60 channel, holes through a tray's far wall); trays at 135 Material Inside and 120 Material Outside.

Per part: the flat as DXF R12, R2000 (polyline), R2000 entities, DWG from the R2000 file and from the R12 file (Anvil's
`DWG.fromDXF`, read back through `dwg2dxf`); every file checked for: DxfCheck clean (Anvil's files), units, closed loops =
the flat's loops, each loop's area (outline and every hole, true arcs) = the kernel's `dxfLoopCurves` to 1e-9, total =
the cut list's blank area to 1e-9, CIRCLE count = round holes, ARC count = arcs, $EXTMIN / $EXTMAX = the blank, layer
colour and line type as the README (BEND* CENTER, HIDDEN HIDDEN), one bend line per bend (+2 per Cross-Break) on the
right layer and on metal (at 1e-4, .5, 1 - 1e-4 of its length: inside the outline, outside every hole), a note per bend,
a FORM note per forming-tool copy, the CROSS BREAK note; the DWG read-back entity for entity against the R2000 file
(layer, type, vertex count, text). The part as STEP: Anvil reads it back closed at the volume (1e-6), OpenCascade reads
one valid solid at the volume (1e-6).

## Table (86 parts; refused = the part did not build: none)

| Format | Before: exact / off / refused | After |
|---|---|---|
| DXF R12 | 86 / 0 / 0 | 86 / 0 / 0 |
| DXF R2000 (polyline) | 86 / 0 / 0 | 86 / 0 / 0 |
| DXF R2000 (entities) | 86 / 0 / 0 | 86 / 0 / 0 |
| DWG (from R2000) via LibreDWG | 86 / 0 / 0 | 86 / 0 / 0 |
| DWG (from R12) via LibreDWG | 86 / 0 / 0 | 86 / 0 / 0 |
| STEP, Anvil's reader | 80 / **6** / 0 | 86 / 0 / 0 |
| STEP, OpenCascade | 85 / **1** / 0 | 86 / 0 / 0 |

Worst after: loop area 1.1e-12 relative, STEP read back by Anvil 4.7e-9, by OpenCascade 4.5e-9. DWG extents equal the
blank's in every file. Every flat already right: Corner-Trim reliefs and break corners come out as arcs / lines (8
arcs for fillet, 4 for circular), obround reliefs as arcs, profile holes as CIRCLEs, Up To Next holes as CIRCLEs, every
bend line on metal, patterned / mirrored forming tools with one mark and one note per copy, Cross-Break lines on BEND
with their note. Nothing found in `dxfLoopCurves` / `arcThrough` or the Corner-Trim script call (lane smfinish's).

## Defects (all STEP, `exchange.js`; pinned in rfQO)

1. **Reader: a hole touching its outer loop folded the face** (`earcutOnce`). Trays with walls past 90 degrees (Material
   Inside 100 / 135, Material Outside 120 / 135 / 150, any gauge, with or without reliefs) have a wall end face with a
   notch the writer puts down as a hole touching the outer loop at one vertex; the bridge from the hole's far point
   crossed into the corner: read back with 1 open edge and 3 edges shared by three or four faces (OpenCascade read the
   same files valid). A hole touching the ring at a vertex now joins it there. A sweep of 54 trays (45 / 60 / 100 / 120 /
   135 / 150 degrees x inside / outside / Bend Outside x no / obround / tear relief): 21 bad with fix (2) alone -> 0.
2. **Writer: one face with holes touching its outer loop at two points** (120 degree Bend Outside trays: each wall face
   is a strip plus two corner triangles meeting it at points, written as a rectangle with two holes). Anvil read it
   back with 6 edges shared by four faces. The writer now re-traces a planar face's loops when they share a vertex
   (`retraceLoops`: at a vertex with two ways on, the first edge clockwise from the one it came by), so each piece is its
   own face; the reader fix (1) also reads the old files closed. `Exchange.pinchSplit.retrace` turns it off.
3. **Writer: a vertex snapped onto its neighbour** (`snapToCylinders`). A 120 degree Material Outside tray in mm (1.5,
   R 1.5): a bend end's corner 0.016 mm from the bend's start was moved onto it, and the file held 4 edges of no length
   between two vertices at one point; OpenCascade made 7 shells and no solid (volume 0). The two are now one vertex
   (`vAlias`) and the edge is left out: OpenCascade 4e-14, Anvil 1e-9.

## Tests

`anvil/tests/kernel/rfQO.js` (15 rows, about 2 s): 12 corpus parts (one per family, inch and mm, every gauge) through
R12 / R2000 / R2000 entities with Anvil's readers, R2000 to DWG with an object per entity, the STEP read back by Anvil;
one row per defect (each fails on bcfbf9f's exchange.js). LibreDWG and OpenCascade are not in the rows (not in CI): the
corpus script runs them. No existing test changed. rfHV pins the STEP text of two big panels byte for byte: the first
version of fix (3) asked for VERTEX_POINTs earlier and renumbered the file; the check now compares vertex numbers
(`vRoot`) and the panels' text is the reference again.

## Handed on (not this lane's files)

- **kernel-sheetmetal.js (lane of the reliefs): at 135 degrees Material Inside a relief does not reach the blank's edge.**
  `p.units("in"); p.sheet(0.1196, 0.12, 0.33); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();` then four
  `p.flange(1, [[4, T, 0]] / [[4, T, 6]] / [[0, T, 3]] / [[8, T, 3]], { angle: 135, position: "inside", relief: "obround" })`:
  the flat has 4 closed holes of 0.113 sq in, 0.023 in from the blank's edge (16 ga: 0.028 sq in, 0.012 in), so the laser
  cuts a sliver of metal round each relief; rect relief the same; no relief, 120 degrees and 90 degrees: none. Exports
  are faithful to it (the folded part, flat, DXF and STEP agree). Proposed: at angles past 90 the relief depth should run
  past the neighbour's outside mould line ((R + T) tan(A / 2) from the bend line, not R + T); check SolidWorks 2024's
  relief at 135 degrees first.
- OpenCascade rows for the three STEP defects belong in `tests/occt/` (not this lane's files): the corpus measures them.
