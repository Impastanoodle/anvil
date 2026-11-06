# STEP output audit (lane stepout, 2026-11-06)

Method: each part was built headless, exported with Anvil's writer (`Exchange.exportSTEP(model, build, { faceted: true })`)
and with OpenCascade (`OcctKernel.build(..., { exports: true }).step`), then read back with Anvil's reader
(`Exchange.importFile` + `newPartFromImport`, volume / box / face count compared) and with OpenCascade's reader
(face count, size in mm). SolidWorks was not used (the user had it open); what SolidWorks reads is judged from the
entities, which match what SolidWorks 2024 AP214 writes.

## Results

| Part (units) | Anvil STEP: faces / cylinders | Anvil read-back volume | OpenCascade STEP: faces / cyl | Anvil reads OCCT file |
|---|---|---|---|---|
| 16 ga L-bracket, 2 holes (in) | 12 / 4 (2 bend, 2 hole) | exact (4e-16) | 12 / 4 | exact |
| Open hem + holes (in) | 6 cylinders, no facets | exact | — | — |
| Box, 4 flanges, Closed Corners (in) | 148 / 2 (two mitred bends faceted) | −3.9e-4 | 42 / 8 + 4 B-spline | refused (B-spline faces) |
| Swept Flange, L profile (in) | 10 / 2 | exact | 10 / 2 | exact |
| Lofted-Bend Bent, square to round (in) | 87 planes (true: flat facets) | −3e-9 | unsupported (Anvil's solid kept) | — |
| Chamfered block (mm, fillets + chamfer) | 25 / 6 | **was refused**, now exact | 21 / 6 + 4 cones | — |
| Rounded handle (mm, fillets) | 110 / 1 cyl + 1 torus (rest facets) | −1.4e-3 | 16 exact faces | exact |
| Tray (mm, shell + fillets) | 275 / 1 (fillets faceted) | −5.9e-4 | 77 / 11 + 8 B-spline | refused |
| Enclosure lid (mm, closed voids) | 31 / 8 | exact | 31 / 8, BREP_WITH_VOIDS | **+0.6 %** (voids read wrong) |
| Flange, U-bracket (mm) | 12 / 9, 24 / 12 | exact | same | exact |

Header / units / names (both engines, after this lane's fixes): inch parts write
`CONVERSION_BASED_UNIT('INCH', LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4), mm))` assigned to the geometric context,
coordinates in inches — the same entities SolidWorks AP214 writes, so SolidWorks opens it in inches at true size.
`PRODUCT` and `FILE_NAME` carry the part name. Anvil's file has a colour (`STYLED_ITEM` / `COLOUR_RGB`), OpenCascade's none.
Files are ASCII only.

## Findings, ranked by shop impact

1. **Bends with mitred or obliquely cut ends are written as facets** (Anvil writer). A bend cylinder cut by a plane
   that is neither square to its axis nor along it (the 45° mitre where two inside flanges meet at a box corner,
   Closed Corner boxes, the multi-edge flange mitre) is bounded by an ellipse; the writer only knows circles and rulings,
   so the whole bend falls back to planar facets. A customer's SolidWorks then cannot Insert Bends / flatten that
   part. Fix: write `ELLIPSE` edges for plane ∩ cylinder (centre on the axis, semi-axes r / |cos θ| and r) in
   `writeBrepAnalytic`, and teach the reader's `curvedFace` to tessellate a cylinder patch bounded by ellipses (rows
   in (angle, z) between the two boundary curves). exchange.js, not done (too large for this lane); tested as a
   known limit in rfJZ (round trip 1e-3).
2. **A bend next to an auto relief can carry a vertex 0.0005 in off its cylinder** (two inside flanges on adjacent
   edges of a plate, no Closed Corner): the patch fails the on-surface test and goes to facets (round trip −1.5e-4).
   The mesh vertex comes from the flange / relief build — kernel-sheetmetal.js (report to the sheet-metal owner).
3. **Fillets cut by other faces stay faceted** (Rounded handle, Tray): same cause as 1 (boundaries that are not
   circles / rulings). Low for a sheet-metal shop.
4. **Anvil refuses customers' STEP files with B-spline bend ends / fillets** (OpenCascade's own Closed Corner box,
   Tray): the reader takes cylinders bounded by circles and rulings and B-spline faces with four B-spline sides only.
   A customer's SolidWorks box with closed corners will hit this. exchange.js reader (or open with the OpenCascade
   engine, which reads them).
5. **Closed voids (BREP_WITH_VOIDS) read wrong** by Anvil's reader (+0.6 %: each void shell becomes a separate solid
   of wrong volume). Rare in sheet metal. exchange.js reader.
6. Fixed: **Anvil could not read its own STEP** of a fillet whose side ruling is split where a chamfer ends (Chamfered
   block example: "trimmed by curves other than circles and rulings"). The reader now counts runs of collinear rulings.
7. Fixed: **OpenCascade's STEP header** said `FILE_NAME('Open CASCADE Shape Model', …, ('Author'), ('Open CASCADE'),
   …)`, `FILE_DESCRIPTION(('Open CASCADE Model'))`; a part name with an apostrophe lost it and non-ASCII went in raw.
   Now the part's name, originating system Anvil, Part 21 string encoding (`OcctKernel.stepHeader`).
8. Fixed: Anvil's `FILE_NAME` time stamp was UTC written as if local; now local time (as SolidWorks).
