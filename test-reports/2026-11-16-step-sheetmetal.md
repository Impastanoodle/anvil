# STEP of sheet-metal parts, out and back, OpenCascade as referee (lane NO, 2026-11-16)

## Method

31 inch parts, each built with Anvil's kernel (20 / 16 / 14 / 11 ga; K-factor, bend-deduction and bend-table sheets),
one sheet-metal feature or combination each that the earlier audits (2026-11-06 step-audit, 2026-11-09 step-import)
did not cover. For each part:

1. **Out**: `Exchange.exportSTEP(model, build)`. Surface kinds of every `ADVANCED_FACE` counted. Units checked
   (`CONVERSION_BASED_UNIT('INCH')`: all 31 inch).
2. **OpenCascade** (`anvil/headless/occt.js`, `STEPControl_Reader`): the number of solids and shells,
   `BRep_Tool.IsClosed` per shell, `BRepCheck_Analyzer.IsValid`, `VolumePropertiesGK` (1e-9), faces by
   `GeomAbs` type. All 31: **1 solid, 1 closed shell, valid**.
3. **Back in**: `Exchange.importFile` + `newPartFromImport`: open edges, `Evaluate.checkBody`, volume, triangles.
   All 31: closed, 0 open edges, triangles never more than the original mesh's (between 0.34x and 1.0x).
4. **Flat again**: Insert Bends on the imported part at a point on the base (thickness and radii found from the part;
   K, and the sheet's bend deduction / bend table where it has one, given as the shop would), `flatPattern`, flat DXF
   through `dxf-check.js`, against the original part's own flat: bends, outline area, net area, each hole's distance from
   the blank's centroid.

The harness lived in the worktree's `.scratch/` (not committed). The committed group `anvil/tests/kernel/rfNO.js` holds
nine rows (fourteen of these parts, 6 s).

## Results

Volumes: "OCC" = OpenCascade's volume of the file against Anvil's Mass Properties of the part; "back" = Anvil's reader.
Insert Bends columns are the IB flat against the part's own flat.

| Part | Faces out (PLANE / CYL / other) | OCC vol | Back in (vol, tris read / part) | Insert Bends: bends, Δ outline in² | Holes | Defects | Fixed / handed on |
|---|---|---|---|---|---|---|---|
| 16 ga Edge Flange 30°, 2 holes | 8 / 4 | -2.5e-15 | -4.5e-10, 308 / 372 | 1/1, 1.2e-9 | 2/2, 9e-11 | none | |
| 14 ga R .09 K .42, two 60° flanges | 12 / 4 | 2.3e-15 | 1.3e-9, 124 / 124 | 2/2, -2.5e-12 | | none | |
| 20 ga 120° | 8 / 2 | -2.1e-15 | 6.9e-11 | 1/1, 7.3e-10 | | none | |
| 11 ga R .125 K .45, 150° | 8 / 2 | -2.1e-16 | 1.2e-9 | 1/1, -6.1e-10 | | none | |
| Edge Flange with offset .25 | 8 / 2 | -1.5e-15 | 0 | 1/1, 0 | | none | |
| Bend table (BD) sheet, 2 flanges | 10 / 4 | -7e-16 | 7e-16 | 2/2, 3.6e-15 (table passed to IB) | | see note 1 | |
| Bend deduction .1 sheet | 8 / 2 | -8.7e-16 | -4.4e-16 | 1/1, -3.6e-15 (BD passed to IB) | | see note 1 | |
| Miter Flange round a corner (L profile) | 113 / 8 | -4.9e-14 | -1.9e-11, 364 / 942 | 4/4, **+0.0169** | | mitre fan facets; IB blank 0.07 % big | kernel (2) |
| Open hem + flange | 12 / 4 | -1.2e-15 | -6.2e-16 | **1 of 2** (hem not found), 7.4 % short, warned | | IB skips hems | kernel (3) |
| Closed hem 14 ga | 8 / 2 | -1.7e-15 | -1.8e-11 | **refused** ("no sharp corner") | | IB skips hems | kernel (3) |
| Teardrop hem | 8 / 2 | -1.7e-15 | -4e-10 | **refused** | | IB skips hems | kernel (3) |
| Rolled hem 20 ga | 6 / 2 | -3.6e-16 | 1.7e-15 | **refused** | | IB skips hems | kernel (3) |
| Jog | 10 / 4 | -2.2e-16 | -6.6e-16 | 2/2, -3.6e-15 | | none | |
| Sketched Bend UP 90° | 8 / 2 | 1.5e-16 | 6.4e-11 | 1/1, 3.9e-10 | | none | |
| Sketched Bend DOWN 60° 14 ga | 8 / 2 | 7.8e-15 | 1.4e-9 | 1/1, 4.5e-11 | | none | |
| Closed Corner butt (4 corners) | 126 / 8 | 1.2e-13 | -5.1e-11, 380 / 1103 | 4/4, **+0.0149** | | mitre fan facets; IB blank big | kernel (2) |
| Closed Corner overlap | 76 / 8 | 6e-14 | -2e-15 | 4/4, **+0.0070** | | same | kernel (2) |
| Closed Corner underlap | 51 / 8 | 7.8e-14 | 3.1e-14 | 4/4, **+0.0084** | | same | kernel (2) |
| Corner Relief circular, 2 bends | 87 / 2 / 12 B-spline | **-1.4e-4** | -1.4e-4 | **1 of 2**, 16.7 % short, warned | | one bend written as facets | kernel (4) |
| Break Corner chamfer + flange | 10 / 2 | -1.4e-15 | -2.3e-16 | 1/1, 0 | | none | |
| Break Corner fillet ×4, 2 holes, 14 ga | 6 / 6 | -1.3e-15 | -6.3e-16 | 0/0, -2.2e-10 | 2/2, 3e-11 | none | |
| Welded Corner (box, 4 flanges) | 25 / 8 | -3.8e-15 | -2.6e-15 | refused: "the bends close a ring" | | expected (weld closes the box; rip first) | |
| Tab + slot | 12 / 2 | -6.2e-16 | 3.1e-16 | 0/0, 0 | 1/1, 8e-12 | none | |
| Vent (ribs, spars) + flange | 24 / 14 | -1.6e-15 | -1.4e-15 | 1/1, 0; net polygon area +6e-4 | 8/8, 5e-5 (polygons) | none: the DXF arcs agree to 3e-9 (note 5) | |
| Dimple + flange | 10 / 2 / 2 cone | 2.2e-16 | 2.2e-16 | 1/1; **a hole where the dimple was**, 3 % short, warned | | IB on formed features | kernel (6) |
| Louver | 14 / 2 | 1.5e-16 | -3.3e-11 | **1 bend found** (the louver lip), lance opening lost | | IB on formed features | kernel (6) |
| Lance | 16 / 0 | -7.7e-16 | -2.6e-12 | refused (ring) | | IB on formed features | kernel (6) |
| Rib | 12 / 0 / 4 cone | 6.1e-14 | -5.4e-11 | refused (ring) | | IB on formed features | kernel (6) |
| Extruded hole + flange | 9 / 4 / 2 torus | -1.5e-15 | -1.6e-15 | 1/1; net -0.113, hole 0.011 off | | IB on formed features | kernel (6) |
| Cross-Break + flange | 8 / 2 | -1.1e-15 | 0 | 1/1, 0 | | none (cosmetic, not in the solid) | |
| Lofted-Bend square to square | 26 / 0 | 4.4e-14 | 9.5e-10 | not run (formed / faceted by design) | | none | |
| Swept Flange L, 10 in | 8 / 2 | 1.5e-15 | 1.5e-15 | 1/1, 0 | | none | |
| Rip at a Closed Corner | 51 / 8 | 7.8e-14 | 3e-14 | 4/4, **+0.0084** | | as Closed Corner | kernel (2) |
| Normal Cut through a flange | 12 / 4 | -1.8e-15 | 2.7e-16 | 1/1, 0 | 1/1, 4e-16 | none | |
| Plain cut across a 14 ga bend | 14 / 4 | -5.3e-16 | 1.4e-15 | 1/1, 0 | | none | |
| Hole Ø.2 in a bend (Unfold / cut / Fold) | 26 / 2 / 26 B-spline walls | 1.1e-5 | 1.1e-5 | 1/1, 0 | 1/1, 7e-11 | the PART is off, not the file (note 7) | kernel (7) |
| Unfold, slot + hole, Fold | 10 / 7 | -4.1e-16 | -8.1e-16 | 1/1, 0 | 2/2, 3e-11 | none | |
| 600-hole 24 × 48 16 ga panel, 2 flanges | 10 / 604 | 6.8e-14 | 2.6e-14, 79 356 / 88 116 | 2/2, 0 | 600/600, 1e-10 | none (STEP 937 KB) | |

Sizes: 9.6 KB (rolled hem) to 159 KB (Closed Corner butt, its fan facets); the panel 937 KB.

## Notes

1. Insert Bends uses a K-factor unless told otherwise. With only K, the bend-table part's blank was 0.051 in² big and
   the BD part's 0.0041 in² (the K .5 allowance, not the shop's). `insertBends(fixed, { bendAllowanceType, bendTable,
   bendDeduction })` takes the sheet's method (ibSheet passes the options to `sheet()`), and then both flats are the
   originals' to 4e-15. Nothing to fix; the rfNO row shows the call.
2. **Mitre / Closed Corner / Rip parts** (kernel-sheetmetal.js, lane NM): every bend is written as its cylinder pair
   (8 cylinders for 4 bends), but the corners carry fans of facet planes (113 / 126 / 76 / 51 PLANE faces against 20
   to 26 true faces): the outer mitre is built from facets (the 2026-11-06 audit's finding 1, still open). The file is
   the part (volume to 1e-13 in OpenCascade). Insert Bends on the file gives a blank 0.007 to 0.017 in² bigger than the
   part's own flat (0.03 to 0.07 %, under the 1 % warning). Repro: `ccButt` (rfCS's tray + `closedCorner(F4, {
   cornerType: "butt", gap: .01 })`), export, import, `insertBends([1, T, 1.3], { kFactor: .5 })`: outline 24.1049 vs
   the part's 24.0901 (volume / T = 24.0901: the part's flat is right). Proposed: cut the outer bend's end with the mitre
   plane (the 11-06 audit's fix), which removes the fans; then re-measure the IB flat.
3. **Hems** (kernel-sheetmetal.js, Insert Bends): a 180° bend (open, closed, teardrop, rolled) is never taken as a bend.
   Closed / teardrop / rolled hem parts are refused ("no sharp corner between two walls … thick"); an open hem beside a
   flange gives the flange only and a blank 7.4 % short (warned). The file is right (two cylinders per hem, volume
   1e-15). Repro: `hemClosed` = 14 ga 4 × 3 base + `p.hem(0.5, [[2, T, 0]], { hemType: "closed" })`, export, import,
   `insertBends([1, T, 1.3])`. Proposed: Insert Bends' rounded-bend search to accept a concentric R / R + T pair whose
   walls are antiparallel (angle 180°), and a closed hem's 0.1 mm (R ≈ 0) fold as a sharp 180° bend.
4. **Circular Corner Relief** (fixed in the writer by lane NO2, see *Follow-up*; first read as a kernel cause): the outer bend of the right flange is
   written as facets (87 planes), so the file is 1.4e-4 under the part (OpenCascade and Anvil's reader agree), and Insert
   Bends then finds one bend of two (blank 16.7 % short, warned). Cause, measured in the writer: the relief's wall
   through the bend is a strip of facets (radial walls, written as 12 ruled B-spline faces) except at the bend's start,
   where one wall triangle has a point (3.880567, 0.051537, 2.847534) inside the thickness (rho .068 from the bend axis
   between R .0598 and the mid layer .0897) on neither radial line; the wall's vertex (3.881737, 0.000132, 2.846917) stays
   on a facet chord 1.2e-4 inside the R .1196 cylinder, and the bend's ELLIPSE run cannot end there. Repro: 16 ga 4 × 3
   base, `flange(1, [[4,T,1.5]], inside, outer)`, `flange(1, [[2,T,3]], inside, outer)`, `cornerRelief([[3.8804, T,
   2.8804]], 0.25, { reliefType: "circular" })`, export. Proposed (kernel): split the relief cut's polygon at the bend's
   tangent lines before wrapping, so every wall point inside a bend lies on a radial line (as Unfold / cut / Fold does).
5. Vent: the flat's hole polygons differ in vertex count (the reader's arc points are not the sketch's), so polygon areas
   differ by 6e-4 in² and centroids by 5e-5 in; the DXF writes both as the same arcs (bulges equal to 3e-9). Not a
   defect; the committed rows compare polygons only on parts whose holes are whole circles.
6. **Forming tools** (kernel-sheetmetal.js, Insert Bends): a dimple's cone, a louver's lip, a lance, a rib and an
   extruded hole are taken by Insert Bends as bends or rings, or laid flat as holes. SolidWorks' Insert Bends leaves a
   formed feature alone in the flat (kept as a form on the flat face). The STEP files are exact (cones / tori written
   as such). Proposed: Insert Bends keeps faces that are not part of a constant-thickness wall pair (the form) with the
   face they sit on, out of the bend search.
7. **Hole in a bend**: the STEP file is right and the part is not. Expected volume = blank net area × T (K .5:
   neutral-axis bend volume = BA × T): 17.57558727 × 0.0598 = 1.0510201188, OpenCascade's volume of the file
   1.0510201188 (1e-14), Anvil's Mass Properties of the part 1.0510081924 (1.1e-5 low). So the part's exact-volume
   correction (kernel-curves.js / kernel-mesh.js curvature terms of the bend cut by the folded hole, lane NI's files) is
   off; the file is not. Repro: 16 ga 4 × 3 base, `flange(1.5, [[3,T,0]], inside, outer)`, `unfold([1,T,2], null)`,
   Ø.2 hole at (2, 0.03) through, `fold()`.

## Follow-up (lane NO2)

**Circular Corner Relief: fixed in the writer** (note 4). The strip of facets at the bend's start is a fan round the
point inside the thickness; `radialWalls` now takes such a strip as a region (`floodWall`: the plain triangles reached
from the bend edge without crossing an edge along one radial line; every boundary point on one of the two radial lines,
one edge on the coaxial cylinder, points off the lines used by the region only). The kernel's point needs no change.

| Corner Relief (16 ga, two inside flanges, R .25) | Faces out | OpenCascade vs part | Back in | Insert Bends |
|---|---|---|---|---|
| circular, was | 87 planes / 2 cyl / 12 B-spline | -1.4e-4 | -1.4e-4 | 1 of 2 bends, 16.7 % short |
| circular, now | 36 / **4 cyl** / 24 B-spline walls | -5.7e-9 (the part itself is -5.4e-9 off blank × T) | -5.4e-9 | **2 of 2**, blank +0.0041 in² |
| rect / tear | 16 / 4, 14 / 4 | 3e-15 | 1e-11 | 2 of 2, same blank |
| obround / constant width | 57 / 4 / 12, 63 / 4 | 7e-9, 9e-15 | 3e-9, 1e-12 | 2 of 2, blank +0.018 / +0.020 in² |

The Insert Bends blank of the circular, obround and constant-width parts is 0.004–0.020 in² bigger than the part's
own flat (whose area × T is the part's volume): Insert Bends' flat of the relief, kernel-sheetmetal.js (handed on).

**600-hole panel, where the 330 s went** (Node, timed twice; the second run had six other agents loading the machine):

| Step | Run 1 | Run 2 | Whose |
|---|---|---|---|
| build, mesh, Mass Properties, flat of the part | 1.1 s | 6.1 s | |
| `exportSTEP` | 1.2 s | 3.4 s | |
| OpenCascade read + volume | 7.2 s | 10.5 s | OpenCascade |
| `importFile` | 12.8 s → **1.9 s** | 14.2 s → 1.9 s | exchange.js, fixed |
| Mass Properties of the imported part | **121 s** | **155 s** | kernel-curves.js |
| `checkBody` | 1.6 s | 3.5 s | |
| Insert Bends rebuild | 2.8 s | 12.2 s | |
| flat of the Insert Bends part | **319 s** | (stopped) | kernel-curves.js via `ibMetalCheck` |

- Import: the plate's two faces are one ring of ~15 000 points after the 600 holes are bridged; each ear tested every
  ring point and each bridge sorted the whole ring by distance. Now `earGrid` (the ring's points in cells, an ear tests
  the points within its box widened by the band) and a bridge takes the nearest few by selection, sorting only if they
  all fail. The triangles are the same: the reader's output on 14 files (the panels and every embedded test input of
  rfMR, rfMX, rfMO) hashed equal before and after. 9.6 s → 1.9 s.
- **Handed on (kernel-curves.js, lane NI): `boundCorrection`.** Both the 121 s and the 319 s (`flatPattern` →
  `ibMetalCheck` → `massProps`) are one loop: for each sample cell of a candidate edge, the 27 neighbours are checked
  against every cell already sampled for that edge (`for (si < sampled.length) again = nbOf(...)`): quadratic in the
  edge's length over the cell. The imported bends are triangles, so their diagonals run the whole 48 in, and the cell
  shrinks with the number of edges (60 holes: 1.3 s, 600 holes: 121 s). The part's own bends are quads whose long edges
  are rulings, which are skipped. Proposed: keep the opened neighbour keys in a `Set` per candidate (or compare against
  the last two sampled keys only: consecutive samples are neighbouring cells). The result is the same.

**Assembly through STEP** (16 ga box with four flanges, lid with an open hem, the same bracket twice, one turned 90°):
one PRODUCT per part plus the assembly (4), one MANIFOLD_SOLID_BREP per part (3: the bracket's two instances share
it), 4 NEXT_ASSEMBLY_USAGE_OCCURRENCEs, inch, 64.6 KB. OpenCascade: 4 solids, valid, volume to 3e-15, each box where
Anvil built it. Anvil's reader: 4 solids named Box, Lid, Bracket<1>, Bracket<2>, placed to 1e-3 (mesh boxes), no open
edges, volume to 1e-15. **Colours were dropped by the reader; now kept**: each solid's STYLED_ITEM → COLOUR_RGB
(`solidColor`, any depth of style references), stored on the Imported feature's solids, the part's colour when every
solid has the same one, and written back per body (`importedColor`). The viewer still shows one colour per Imported
feature (Materials' body colours are per feature); the assembly is read as one part with four bodies, not rebuilt as an
assembly.

**A free-form face whose hole wall keeps its facets** now keeps its B-spline surface: a loop that does not run round
one exact cylinder (a slot, equal crossing holes, a wall that fell back) is a polygon on the face, one LINE edge per
segment shared with the facet beside it (`holeLoops` `polyLoop`; `hUndo` re-labels with every hole a polygon instead
of dropping the face). OpenCascade reads every case as one valid solid.

| Loft drilled | Faces, was | Faces, now | OpenCascade vs Anvil re-read |
|---|---|---|---|
| OpenCascade loft (rfMX), equal crossing holes | 229 planes | 125 planes + 4 B-spline (2 holed) | 6e-6 |
| same, perpendicular equal holes | 238 planes | 126 + 4 B-spline (4 holed) | 1.3e-5 |
| same, a slot | 112 planes + 2 cyl | 4 + 2 cyl + 4 B-spline | 2e-5 |
| Anvil's own loft re-read, equal crossing holes | 8549 planes | 188 + 4 B-spline | |

Left: Anvil's own loft, re-read and drilled, reads back with 6–9 open edges (12 before this change); not traced.

## Not done

- The SolidWorks-written part on the user's desktop was not read.
- Edge Flange with a custom (edited) profile: no script option found for it; not built.
