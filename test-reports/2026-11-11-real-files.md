# The shop's own files in Anvil — 2026-11-11 (lane realfiles, group rfLE)

The user's own folder of shop files (23 STEP / STP, 37 DXF; the DWGs were lane dwgin's; SolidWorks files cannot be read
without SolidWorks) was read **in place, read only**. Nothing from those files is in this repository: they are numbered
by their sorted path (STEP 1..23, DXF 1..37), and every bug found was reproduced with a part built in the test itself
before it was fixed. The harness lived in the session's scratch folder and is not committed. STEP: Anvil's reader, with
OpenCascade 7.6 as the reference for volume and bounding box; then, per body, Insert Bends (T measured, R and K from the
body), the flat, `DxfCheck.audit`, a standard 3 view drawing, Anvil's STEP of the result read back. DXF: a plain count of
the ENTITIES section, ezdxf 1.4.4, `DxfImport.parse` / `prepare` / `check`, `sketchProfile`, a Base Flange T .1 from the
profiles, Geometry Nesting (2 of each, 120 × 60 sheet).

Tests: `tests/kernel/rfLE.js` (6), `tests/smoke/rfLE.js` (1). No existing test changed.

## STEP

Faces the file holds by surface: P plane, C cylinder, K cone, S sphere, T torus, B B-spline, X linear extrusion.
"Now": read time, solids Anvil / OpenCascade, closed (`Evaluate.checkBody`), volume and bounding box against
OpenCascade, surface records on the faces. "not sheet": volume / (T · area / 2) outside 0.8 – 1.2.

| # | Schema | Written by | Faces | Before | Now | Sheet metal |
|---|---|---|---|---|---|---|
| 1 | AP214 | SolidWorks 2022 | 66P 150C 32B | refused | 1048 ms, 1/1 solids, OPEN, vol -0.00 %, bbox same, records 150 cyl | IB refused: no bend found |
| 2 | AP203 | SolidWorks 2021 | 126P 60C 2K 22T | refused | 553 ms, 18/18 solids, OPEN, vol -0.27 %, bbox same, records 80 cyl 22 tor 2 cone | 3× 2 bends, blank×T 0.000 %, DXF clean, drawing ok, STEP back same; 3 bends, blank×T 0.004 %, DXF clean, drawing ok, STEP back same; 6× plate, 0 bends, blank×T -0.000 %, DXF clean, drawing ok, STEP back same; IB refused: no bend found; 5× 1 bends, blank×T 0.000 %, DXF clean, drawing ok, STEP back same; 2× plate, 0 bends, blank×T 0.000 %, DXF clean, drawing ok, STEP back same |
| 3 | AP214 | SolidWorks 2022 | 20P 23C 11K 6S 11T | refused | 358 ms, 1/1 solids, OPEN, vol -0.12 %, bbox 0.38 mm off, records 23 cyl 11 tor 11 cone 6 sph | IB refused: no bend found |
| 4 | AP214 | SolidWorks 2022 | 13P 5C | read | 35 ms, 1/1 solids, closed, vol 0.000000 %, bbox same, records 5 cyl | not sheet |
| 5 | AP214 | SolidWorks 2022 | 11P 5C | read | 27 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 5 cyl | not sheet |
| 6 | AP214 | SolidWorks 2022 | 16P 32C | read | 92 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 32 cyl | flat failed: fixed face lost |
| 7 | AP214 | Mastercam 2021 | 16P 18C | read | 112 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 18 cyl | flat failed: fixed face lost |
| 8 | AP214 | SolidWorks 2022 | 10P 8C | read | 26 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 8 cyl | plate, 0 bends, blank×T -0.001 %, DXF clean, drawing ok, STEP back same |
| 9 | AP214 | SolidWorks 2022 | 15P 32C 4K | read | 88 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 32 cyl 4 cone | not sheet |
| 10 | AP214 | SolidWorks 2022 | 42P 78C 8K 90S 60T | refused | 2431 ms, 12/12 solids, OPEN, vol -2.97 %, bbox 2.09 mm off, records 60 tor 78 cyl 90 sph 8 cone | 12× not sheet |
| 11 | AP214 | SolidWorks 2022 | 6P 58C | read | 166 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 58 cyl | plate, 0 bends, blank×T 0.003 %, DXF clean, drawing ok, STEP back same |
| 12 | AP214 | SolidWorks 2022 | 10P 18C | read | 78 ms, 1/1 solids, closed, vol -0.000000 %, bbox same, records 18 cyl | plate, 0 bends, blank×T 0.003 %, DXF clean, drawing ok, STEP back same |
| 13 | AP214 | SolidWorks 2022 | 59P 283C 24K | refused | 573 ms, 1/1 solids, closed, vol 0.000000 %, bbox same, records 283 cyl 24 cone | not sheet |
| 14 | AP214 | Mastercam 2021 |  | no solid | no solid (wireframe; OpenCascade: none either) |  |
| 15 | AP214 | SolidWorks 2022 | 6P 6B | read | 1184 ms, 1/1 solids, OPEN, vol -0.30 %, bbox same, records  | IB refused: no bend found |
| 16 | AP214 | SolidWorks 2022 | 196P 109C 16K | refused | refused: cylinder bounded by one circle |  |
| 17 | AP214 | SolidWorks 2022 | 205P 128C 16K | refused | refused: cylinder bounded by one circle |  |
| 18 | AP214 | SolidWorks 2022 | 6P 2C | read | 14 ms, 1/1 solids, closed, vol 0.000000 %, bbox same, records 2 cyl | plate, 0 bends, blank×T -0.205 %, DXF clean, drawing ok, STEP back same |
| 19 | AP214 | Open CASCADE 7.9 | 111P 71C 5K 8T 2X | refused | refused: extrusion surface |  |
| 20 | AP214 | SolidWorks 2022 | 43P 19C 4B | refused | 81 ms, 3/3 solids, OPEN, vol 6.30 %, bbox same, records 19 cyl | 2× IB refused: no bend found; 2 bends, blank×T -15.038 %, DXF clean, drawing ok, STEP back -0.10 %, warned |
| 21 | AP214 | Mastercam 2021 | 33P 19C | refused | 64 ms, 3/3 solids, closed, vol -0.00 %, bbox same, records 19 cyl | 2 bends, blank×T 0.137 %, DXF clean, drawing ok, STEP back -0.07 %; 2× IB refused: no bend found |
| 22 | AP214 | SolidWorks 2022 | 39P 19C 4B | refused | 98 ms, 2/2 solids, OPEN, vol -0.03 %, bbox same, records 19 cyl | IB refused: no bend found; 2 bends, blank×T 0.137 %, DXF clean, drawing ok, STEP back -55.27 % |
| 23 | AP214 | SolidWorks 2022 | 6P | read | 7 ms, 1/1 solids, closed, vol 0.000000 %, bbox same, records  | not sheet |

Reader: **19 of 23 read now (was 11)**; 1 holds no solid (a wireframe export; OpenCascade finds none either: a right
refusal); 3 still refused (below). 12 of the 19 are closed with OpenCascade's volume to 2e-6 or better and its bounding
box; 7 read with open edges (STEP 1, 2, 3, 10, 15, 20, 22).

### Findings, ranked by the files they hit (each reproduced with a built part: `kernel/rfLE.js`)

1. **Cylinder, cone, sphere and torus faces bounded by anything but latitude circles were refused** (STEP 1, 2, 3, 10,
   13, 16, 17, 19, 20, 21, 22: 11 files). SolidWorks splits every periodic face: fillet corners are tori bounded by
   meridians, countersinks cones to their apex, domes spheres bounded by their circle alone, cross holes cylinders cut
   by B-spline curves. **Fixed**: any patch of the four is unrolled into its (u, v) (`paramPatch`: seams, poles, bands
   winding a period), ear clipped, made Delaunay, refined to the canonical grid's step; cylinder and cone triangles keep
   the exact record.
2. **SolidWorks assemblies were placed wrong, silently** (STEP 2, 9, 16, 17, 22: every SolidWorks file with an
   assembly structure). SolidWorks writes the placing relationship assembly first; the reader took the part first, so
   each part was read once at its own origin (STEP 2: 8 of 18 instances, 33 % light). **Fixed**: the direction comes
   from the assembly occurrence the relationship belongs to; STEP 2 now 18 / 18, bounding box OpenCascade's to 1e-7 mm.
3. **A flat blank sent as a solid could not be made sheet metal** (STEP 8, 11, 12, 18 and 8 bodies of STEP 2: Insert
   Bends said "no sharp corner"). SolidWorks' Insert Bends makes a flat plate a sheet-metal part with no bends.
   **Fixed** (Insert Bends; Convert to Sheet Metal unchanged): flat = the plate, DXF clean, drawing and STEP round trip.
4. **B-spline faces of other shapes, and Mastercam's knotless curves** (STEP 1, 3, 15, 16, 17, 20, 21, 22): trimmed
   B-spline faces other than four-sided patches, and QUASI_UNIFORM curves / surfaces, were refused. **Fixed**: `freeFace`
   (boundary projected onto the surface by Newton, same refinement); implicit knots for QUASI_UNIFORM / UNIFORM / BEZIER.
   A ruled face whose "ruling" sides were sampled curves dropped their points (open edges): it now goes to `freeFace`.
5. **A planar face with 34 loops lost area in the ear clipping, silently** (STEP 1): axis-aligned ties bridged a hole to
   the wrong vertex. **Fixed**: a clipping that sticks on a vertex that is not flat runs again on turned points.

### Left

- **Open edges remain** on STEP 1, 2, 3, 10, 15, 20, 22 (planes beside sampled B-spline curves drop near-collinear
  points in their ear clipping; some torus corners). STEP 10 reads 3 % light and 2.1 mm small in X and Y, STEP 3 0.38 mm
  off in Z. Sphere and torus triangles carry no profile chord: their volume is polygonal (0.1 – 1 %).
- **Still refused**: STEP 16 / 17 (3 cylinder faces each bounded by one circle alone) and STEP 19 (2 linear-extrusion
  faces written by OpenCascade; `freeFace` sweeps B-spline curves only). Tools ▸ OpenCascade kernel reads all three.
- **STEP 6 / 7** (one part from SolidWorks and from Mastercam): Insert Bends finds and bends one sharp corner; the flat
  then says "the fixed face is not there any more" when the fixed point lies within R + T of the outer sharp (Anvil
  keeps a point, SolidWorks a face). Not fixed.
- **STEP 20 / 21 / 22** (one part from SolidWorks and Mastercam): 2 bends found; the SolidWorks body still has open
  edges and its flat is 15 % short (warned); Anvil's STEP of the bent body from STEP 22 reads back 55 % short (the writer:
  lane stepout).
- The other bodies are not one thickness or have no bend Insert Bends recognises: refused as SolidWorks would.

## DXF

All 37 parse. Entity counts by type equal the plain count of the ENTITIES section and ezdxf's model-space count in all
37 (LWPOLYLINEs come in as segments; POINT / TEXT / VIEWPORT counted, kept out of profiles). Units: all inches from
$INSUNITS. No paper-space geometry, no dimensions or frozen layers came in as geometry. Columns: closed / open contours
(Check Sketch), Repair on import (gaps closed / duplicates merged / tiny removed), types kept out of the profile, Base
Flange T .1 (volume against the profiles' area × T), Nesting, import ms (parse + prepare + profile).

| # | DXF | Entities | Units | Closed / open | Repair | Kept out | Base Flange | Nest | ms |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 2018 | 9 ARC, 3 CIRCLE, 3 LINE | in (INSUNITS) | 4 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 32 |
| 2 | 2000 | 40 LWPOLYLINE, 40 LINE, 2 POINT | in (INSUNITS) | 13 / 2 | 0 / 8 / 0 | POINT | ok, = area×T | ok 2 placed | 81 |
| 3 | 2000 | 13 LINE | in (INSUNITS) | 0 / 3 | 0 / 1 / 0 | – | ok, = area×T | ok 2 placed | 15 |
| 4 | 2000 | 3 LWPOLYLINE | in (INSUNITS) | 3 / 0 | 3 / 0 / 0 | – | ok, area×T -0.001 % | ok 2 placed | 85 |
| 5 | 2000 | 3 LWPOLYLINE | in (INSUNITS) | 3 / 0 | 3 / 0 / 2 | – | ok, area×T -0.002 % | ok 2 placed | 80 |
| 6 | 2000 | 4 ARC, 8 LINE | in (INSUNITS) | 1 / 0 | 0 / 0 / 0 | – | ok, = area×T | ok 2 placed | 75 |
| 7 | 2018 | 134 LINE, 52 ARC, 12 CIRCLE | in (INSUNITS) | 16 / 13 | 0 / 3 / 0 | VIEWPORT | ok, area×T -0.002 % | ok 2 placed | 163 |
| 8 | 2000 | 35 CIRCLE, 24 ARC, 4 LINE, 5 POINT | in (INSUNITS) | 40 / 0 | 0 / 0 / 0 | POINT | ok, = area×T | ok 2 placed | 114 |
| 9 | 2000 | 4 CIRCLE, 4 LINE, 2 POINT | in (INSUNITS) | 5 / 0 | 0 / 0 / 0 | POINT | ok, = area×T | ok 2 placed | 26 |
| 10 | 2018 | 12 LINE, 14 ARC, 8 CIRCLE | in (INSUNITS) | 9 / 0 | 2 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 92 |
| 11 | 2000 | 4 CIRCLE, 4 LINE, 2 POINT | in (INSUNITS) | 5 / 0 | 0 / 0 / 0 | POINT | ok, = area×T | ok 2 placed | 19 |
| 12 | 2018 | 4 ARC, 28 LINE, 14 CIRCLE, 1 TEXT | in (INSUNITS) | 14 / 6 | 0 / 12 / 0 | TEXT/VIEWPORT | ok, = area×T | ok 2 placed | 100 |
| 13 | 2018 | 1 CIRCLE, 46 ARC, 62 LINE, 2 SPLINE | in (INSUNITS) | 14 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | 2 unplaced (larger than the sheet), 86 s | 118 |
| 14 | 2000 | 30 ARC, 9 CIRCLE, 41 LINE | in (INSUNITS) | 13 / 3 | 0 / 0 / 0 | – | ok, area×T -0.001 % | ok 2 placed | 73 |
| 15 | 2000 | 28 LINE | in (INSUNITS) | 1 / 0 | 0 / 0 / 0 | – | ok, = area×T | ok 2 placed | 19 |
| 16 | 2018 | 10 ARC, 8 CIRCLE, 10 LINE | in (INSUNITS) | 11 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 38 |
| 17 | 2018 | 888 LINE, 2540 ARC | in (INSUNITS) | 29 / 32 | 130 / 0 / 38 | VIEWPORT | ok, area×T -0.034 % | ok 18 placed | 2089 |
| 18 | 2018 | 3502 LINE, 4 ARC | in (INSUNITS) | 31 / 30 | 130 / 0 / 48 | VIEWPORT | ok, area×T 0.000 % | ok 78 placed | 609 |
| 19 | 2000 | 4 LWPOLYLINE, 23 LINE, 1 POINT | in (INSUNITS) | 3 / 4 | 0 / 2 / 0 | POINT | ok, area×T 0.002 % | ok 2 placed | 35 |
| 20 | 2018 | 28 LINE, 24 ARC, 9 CIRCLE | in (INSUNITS) | 22 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 43 |
| 21 | 2018 | 16 CIRCLE, 8 ARC, 8 LINE | in (INSUNITS) | 17 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 60 |
| 22 | 2018 | 29 CIRCLE, 4 LINE | in (INSUNITS) | 30 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 39 |
| 23 | 2018 | 61 LINE, 5 ARC, 4 CIRCLE | in (INSUNITS) | 7 / 0 | 0 / 0 / 0 | VIEWPORT | refused: contours cross | ok 8 placed | 56 |
| 24 | 2000 | 1 CIRCLE, 297 LINE | in (INSUNITS) | 1 / 148 | 0 / 148 / 1 | – | ok, = area×T | ok 2 placed | 73 |
| 25 | 2000 | 36 LINE | in (INSUNITS) | 1 / 0 | 0 / 0 / 0 | – | ok, = area×T | ok 2 placed | 17 |
| 26 | 2018 | 5 ARC, 33 LINE, 4 CIRCLE | in (INSUNITS) | 6 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 100 |
| 27 | 2018 | 122 LINE, 32 ARC, 8 TEXT, 11 CIRCLE | in (INSUNITS) | 13 / 38 | 0 / 9 / 0 | TEXT/VIEWPORT | ok, = area×T | ok 4 placed | 190 |
| 28 | 2018 | 16 LINE, 7 CIRCLE, 2 ARC | in (INSUNITS) | 10 / 0 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 47 |
| 29 | 2018 | 34 LINE, 3 SPLINE, 1 CIRCLE, 9 ARC, 3 TEXT | in (INSUNITS) | 2 / 11 | 0 / 0 / 0 | TEXT/VIEWPORT | ok, area×T -0.000 % | ok 2 placed | 178 |
| 30 | 2000 | 13 LINE | in (INSUNITS) | 0 / 3 | 0 / 1 / 0 | – | ok, = area×T | ok 2 placed | 19 |
| 31 | R12 | 4 LINE, 4 ARC, 1 CIRCLE | in (INSUNITS) | 2 / 0 | 0 / 0 / 0 | – | ok, = area×T | ok 2 placed | 38 |
| 32 | 2000 | 2 ARC, 8 LINE | in (INSUNITS) | 1 / 2 | 0 / 0 / 0 | – | ok, = area×T | ok 2 placed | 16 |
| 33 | 2018 | 56 LINE, 17 ARC, 5 TEXT | in (INSUNITS) | 0 / 21 | 6 / 17 / 1 | TEXT/VIEWPORT | – (no closed profile) | – | 60 |
| 34 | 2000 | 3 LWPOLYLINE, 1 CIRCLE, 1 SPLINE, 1 ARC, 1 TEXT | in (INSUNITS) | 3 / 3 | 0 / 0 / 0 | TEXT | ok, = area×T | ok 6 placed | 41 |
| 35 | 2000 | 4 ARC, 5 LINE, 1 POINT | in (INSUNITS) | 2 / 1 | 0 / 0 / 0 | POINT | ok, = area×T | ok 2 placed | 19 |
| 36 | 2018 | 9 ARC, 1 CIRCLE, 1385 LINE | in (INSUNITS) | 35 / 4 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | 24 placed, 2 unplaced | 414 |
| 37 | 2018 | 67 LINE, 12 ARC, 4 CIRCLE | in (INSUNITS) | 8 / 9 | 0 / 0 / 0 | VIEWPORT | ok, = area×T | ok 2 placed | 85 |

No import fault found. Open contours are the drawings' own lines; the Base Flange takes the closed profiles (the -0.001 …
-0.034 % rows are gaps Repair closed). DXF 23: two closed contours cross, the Base Flange is refused as SolidWorks
refuses it. DXF 33: no closed profile (a drawing).

For another lane: **Geometry Nesting took 86 s to report that DXF 13's part does not fit the sheet** (a rectangle too
big is reported in 0.1 s; the time goes on every angle and strategy of a detailed part that fits at none). `nest.js`.

## What a user notices

- STEP files from SolidWorks with fillets, domes, countersinks or cross holes, and Mastercam files, open where they were
  refused; SolidWorks assemblies come in with every instance in place.
- Insert Bends accepts a flat plate (the PM says "0 bends").
- Saved parts keep their geometry (an Imported feature stores its triangles); re-importing a file can give more triangles
  on sphere / torus / B-spline faces than before.
