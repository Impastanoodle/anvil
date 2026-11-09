# STEP import of customers' formed parts → Insert Bends → flat DXF (lane importbend, 2026-11-09)

Shop flow: a customer sends a STEP of a bent part; the shop opens it (File ▸ Open, or Insert ▸ Features ▸ Imported…),
runs Insert Bends with a fixed face (the bends are already rounded in the part: `Kernel.insertBendsRounded`), Flattens
and saves the flat DXF. SolidWorks was not used (it may hold the user's work).

## Method

Four parts, T .06, K .44, inches, built as a customer's CAD would send them (solids, not Anvil sheet metal): a thin
profile extruded and each corner filleted R inside / R + T outside (L bracket, U channel, hat channel with unequal
radii), and a tray from four flanges with .25 square corner notches cut through everything. Each part was written as:

| Writer | What the file holds |
|---|---|
| Anvil (`Exchange.exportSTEP`) | inch, PLANE / CYLINDRICAL_SURFACE, LINE / CIRCLE |
| Anvil, rewritten to mm | SI MILLI METRE, every coordinate and radius × 25.4 |
| Anvil, rewritten to B-splines | every CIRCLE a full RATIONAL_B_SPLINE_CURVE (the edge trims it), every LINE a degree-1 B-spline, every cylinder a rational B-spline surface, optionally every plane a bilinear B-spline surface |
| OpenCascade (`OcctKernel.build … exports`) | inch, analytic surfaces |
| OpenCascade NURBS (`BRepBuilderAPI_NurbsConvert`, test hook `model.stepNurbs`) | every face B_SPLINE_SURFACE, every edge B_SPLINE_CURVE, rational circles, 12-digit weights |

Then: import into an inch part, Insert Bends at a fixed face, `flatPattern`, `exportDXFFlat`, `DxfCheck.check`.
Acceptance: closed solid, every bend found with its own radius, the blank = the analytic developed size (legs less
setbacks + Σ A(R + K·T)) to 1e-6 in, holes at their developed positions, the DXF one closed outline + holes + bend lines.

## Results

| Part | Anvil / mm / B-spline rewrites | OpenCascade / NURBS | Flat (analytic, in) |
|---|---|---|---|
| L bracket, R .06 | pass (flat to 1e-12) | pass (5e-15) | 3.395717 × 2 |
| U channel 2 × 2 × 4, 5 Ø.25 holes (base, both legs) | pass, holes to 1e-9 | pass | 5.791434 × 4 |
| Tray 4 × 3 × 1.12, .25 corner notches | pass, blank area to 1e-9 | pass | 6.031434 × 5.031434 |
| Hat 4 × 1.5, R .06 / .09 / .12 / .03, fixed on top or either brim | **was refused** ("the bends close a ring"), now pass | **was refused**, now pass | 6.797115 × 3 |

Tests: `tests/kernel/rfKD.js` (9 tests: every rewrite of every part, voids, two solids, a non-cylindrical ruled
face), `tests/occt-tests.html` rows "rfKD" (8 OpenCascade STEP / NURBS rows, sealed voids, the mitred tray),
`tests/smoke/rfKD.js` (the UI flow: Insert ▸ Features ▸ Imported… with the mm STEP picked in the file input, Insert
Bends PM with the base clicked, ✓, Flatten, Flat to DXF ▸ ✓). Changed: `tests/kernel/exchange.js` "STEP import: FACETED_BREP …" used a bilinear B-spline patch that is exactly the cube's bottom plane as its "refused" B-spline face; it is now read as that plane, so the test uses a twisted patch (still refused).

## What was broken and is fixed

1. **Hat channels (any part with two walls in one plane) could not be Insert-Bent** — kernel-sheetmetal.js
   `insertBendsLayout` took every wall in one plane for one plate, so a hat's two brims made the bends a ring. Plates
   in one plane are now one only where their faces join (`ibRegionKey`: connected regions of the plane's polygons; the
   Z rule, a wall seen from its other face, still holds). The fixed face picks the region it lies in.
2. **Insert Bends through the UI with OpenCascade on found no rounded bends** — the app reads STEP with OpenCascade when
   Tools ▸ OpenCascade kernel is on, and that import carried no surface records, so the bends were plain facets
   ("no sharp corner …"). occt-kernel.js `importFile` now tags cylinder faces' triangles with Anvil's cylinder record
   (also makes the import's mass properties exact).
3. **B-spline geometry from other CAD systems** (exchange.js reader): rational B-spline curves are evaluated with their
   weights (they were read as straight lines on planar faces, with a warning); a curve that runs past its vertices (a
   full circle an edge is trimmed from) is cut to them; a B-spline edge that is exactly a line or a circle (1e-9 of its
   size) is read as one, so it meshes like the true curve; a B-spline surface that is exactly a plane or a cylinder
   (rational) is read as that surface, so its bends carry cylinder records and Insert Bends finds them.
4. **Cylinders bounded by B-spline edges were refused** (audit item 4): a cylinder patch's sides may now be B-spline
   curves lying on it (OpenCascade's approximated intersection curves, another CAD's oblique cuts), tessellated at
   their own points. OpenCascade's mitred tray (degree-7 / -5 edges on its bends) now reads.
5. **Ruled B-spline faces** (degree 1 one way, e.g. a twisted bend end) read as a strip between their two rails instead
   of refusing the file (no record: they are not bends).
6. **Sealed voids read 0.6 % heavy** (audit item 5): a BREP_WITH_VOIDS' void shells (ORIENTED_CLOSED_SHELL of a
   CLOSED_SHELL) were also imported as loose solids. Now one solid, the voids subtracted exactly (Enclosure lid:
   OpenCascade 31809.455547, Anvil 2e-15 off).

## Lane stepin2 (2026-11-09): the Unresolved list worked off

Tests: `tests/kernel/rfKI.js` (6), `tests/smoke/rfKI.js` (1), `tests/occt-tests.html` rows "rfKI" (8).

| Was | Now |
|---|---|
| **OpenCascade's mitred tray**: Insert Bends found 4 bends, the flat was the base and the strips only (12.19 in² of 25.66), no warning | Fixed. Not the mitre: the flat's wall search took the first mesh face within 2.6° of the wall, and OpenCascade's file lists the bend faces first, read in 1° facets; an imported mesh has no face ids, so the bend facets were not sorted last. Curved facets are now taken as a wall only when no plane matches. Blank = the tray's own flat (8e-9). Reproduced without OpenCascade: Anvil's tray STEP with the cylinders first in the shell, read at 2°. |
| A flat could drop metal silently | An Insert Bends flat is weighed against the part (volume / T, corrected for each bend's BA): more than 1 % short gives a warning in the flat (Flat Pattern dialog, status, `flat.warnings`): "the blank holds … % less metal than the part …". |
| **A hole or slot through a bend** refused by the reader | Read: any cylinder face whose loops stay on one side of the axis is unrolled to (r·angle, z), ear clipped and refined to the circle's grid (`cylPatch`), each triangle with the cylinder record (exact volume). Insert Bends finds the slotted bend (its probes no longer all sit in the slot) and the flat lays the slot. U channel R .25, .25 × .75 slot through one bend: slot area .1875 to 5e-11, place to 1e-9, from Anvil's STEP, a rational-B-spline rewrite of it, OpenCascade's STEP and OpenCascade's NURBS STEP, read by Anvil's reader or by OpenCascade's import. A Ø.2 round hole through the bend from OpenCascade: laid too (a 192-point loop, 0.031410 vs π·0.1² = 0.031416; the DXF writes a circle). |
| With the OpenCascade import, an exact B-spline cylinder got no cylinder record | Marked: a B-spline / Bezier face is sampled 9 × 9 and classified as the STEP reader does (`Exchange.surfaceGridKind`); OpenCascade's NURBS L bracket through the OpenCascade import → Insert Bends finds the bend, flat analytic. |
| Anvil's STEP wrote a bend notched by a Rectangle / Obround auto relief as facets | Written whole (the reader takes the L-shaped patch): both bends 2 cylinders each, round trip 3e-15 (rect) / 5e-12 (obround), OpenCascade reads Anvil's volume (rows "rfKI: a bend notched by a … auto relief"). |

## Lane stepout3 (2026-11-09): the last two shortfalls

Tests: `tests/kernel/rfKQ.js` (4), `tests/smoke/rfKQ.js` (1), `tests/occt-tests.html` rows "rfKQ" (3). Changed:
`tests/kernel/rfKI.js` "a flat that holds less metal than the part says so" made its short flat with a holed bend
Anvil wrote as facets; Anvil writes that bend whole now, so the test rewrites one bend of a plain U channel as a
non-rational B-spline surface (item 3 below) to get the short flat.

| Was | Now |
|---|---|
| **A round hole through a bend in Anvil's own STEP**: the bend written as facets (the hole's points sit on the bend's facet chords after Unfold / cut / Fold), Insert Bends on the file found the other bend only, the flat 39 % short (warned) | Fixed. Each radial wall strip of the hole is written as a ruled rational B-spline face between two rails that lie exactly on the bend's two cylinders (a rational cubic: the circle's arc in angle, the height following the angle to 5e-11), the hole's points moved onto the cylinders; the bend's cylinders are written whole with the hole as an inner loop. Ø.25 hole in the middle of an R .25 bend: Anvil's reader and OpenCascade read the same volume, the exact one (U less the wrapped 32-gon hole) to 1e-12; Insert Bends finds both bends, hole area = the part's own developed hole to 2e-10, no warning. Holes across either tangent line, past both, two in one bend: the same. Anvil's reader keeps the rails' samples at the cylinder's own step (the first try made 21 000 triangles and took a minute in Insert Bends; now ~1 100, 0.3 s). |
| **An R .5 mitred tray through Anvil's STEP**: Insert Bends' flat 27.80 of 29.04 in², warned | Fixed. Not the records' ends: Insert Bends' strips were right; `bendSurfaceNotches` took the tapered bend ends at each corner for "nobody's corner" (it probes the neighbouring bend in the middle of its end, which is air when the end tapers) and notched both strips. Between two rounded Insert Bends records the neighbour is probed across its end. Flat = the tray's own point for point (3e-10) at R .5, R .25, Material Outside, also through the OpenCascade import. Also fixed on the way: a hole near a bend's tangent line hid the bend from Insert Bends (`ibCylGroups` measured the facets' width from the gaps between all points' angles, so a dense hole edge made a long facet look narrow and the inner air probe sat in metal). |

Found, not fixed (kernel, not this lane): **Anvil's own mass properties of a part with a hole folded across a bend's
tangent line** read 3.5e-6 (Ø.2 hole across the tangent) to 3.7e-5 (Ø.6 past both) of the volume high / low; the
exact volume (the U less the wrapped hole) is what the STEP file, Anvil's reader and OpenCascade all give (to 1e-12).
A hole inside the bend zone is 1e-9 off (curve correction near the hole's slanted wall facets).

## Still refused or wrong, ranked by shop value

1. ~~A round hole through a bend in Anvil's own STEP~~ and 2. ~~a mitred tray with R .5 through Anvil's STEP~~: fixed by
   lane stepout3 (above).
3. **A bend written as a non-rational B-spline** (an approximated cylinder) is read as a ruled strip without a record,
   so Insert Bends does not see it as a bend ("no sharp corner …"); SolidWorks' Insert Bends also needs true
   cylinders.
4. Cones (countersinks), spheres and tori bounded by B-spline edges are still refused by Anvil's reader (read with the
   OpenCascade kernel on); a cylinder band (a full turn) with holes in it still keeps its facets in Anvil's writer.
5. A 4 × 3 tray with R 1 flanges 1.5 tall through Anvil's STEP is refused by Insert Bends ("not one thickness …
   outside rounded R1.06 but its inside is not R1"), the lone-round check misreading the part's corner (seen by lane
   stepout3, not investigated; R .5 and below are exact).
