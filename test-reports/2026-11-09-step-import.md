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

## Still refused or wrong, ranked by shop value

1. **A hole or slot through a bend** (a cylinder face with an inner loop): the reader tessellates cylinder patches as
   two sides + two rulings only, so the file is refused ("trimmed by curves other than circles and rulings"). Needs a
   general trimmed-cylinder tessellation (unroll to (angle, z), triangulate in angle strips). Common enough on
   customer parts (a lightening hole near a bend, a slot across one). Workaround: none in Anvil's reader; OpenCascade
   reads it, but Insert Bends then needs the bend's two cylinders whole.
2. **OpenCascade's own mitred tray** (Anvil's four inside flanges, no corner notches) imports closed, Insert Bends finds
   the 4 bends, but the flat comes out as the base and the bend strips only (walls missing, no warning). Its bend ends
   are twisted ruled faces (the kernel's fan mitre, audit item 1: kernel-sheetmetal.js, the mitre lane), which a real
   customer's file would not have; not traced further here. A customer's mitred / closed-corner box with planar mitres
   was not available to test (SolidWorks not used).
3. **A bend written as a non-rational B-spline** (an approximated cylinder) is read as a ruled strip without a record,
   so Insert Bends does not see it as a bend ("no sharp corner …"); SolidWorks' Insert Bends also needs true
   cylinders. With Tools ▸ OpenCascade kernel on, B-spline cylinders (exact, rational) also get no record (OpenCascade
   reports them as B-spline surfaces): Anvil's own reader (OpenCascade off) handles those.
4. Cones (countersinks), spheres and tori bounded by B-spline edges are still refused by Anvil's reader (read with the
   OpenCascade kernel on).
5. Not this lane (kernel): Anvil's own STEP of a tray with auto-relief bends writes those bends as facets (audit item 2, kernel), so
   Insert Bends on Anvil's own tray STEP finds no bends; the corner-notched tray (no relief vertex off the cylinder)
   writes true cylinders and passes.
