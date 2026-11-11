# DXF / DWG audit — 2026-11-11 (lane dxfaudit, group rfKS)

Goal: flat DXF / DWG files every laser and punch CAM reads, and customer DXF files that import clean.
Tests: `anvil/tests/kernel/rfKS.js` (25 rows), `anvil/tests/smoke/rfKS.js` (3 steps).

## What was checked

### Export (task 1)

Eight sheet parts: L bracket; U channel with two holes and a slot cut across its bends (Unfold / cut / Fold);
4-flange tray with rect bend reliefs and Circular corner reliefs; hem + jog; Lofted-Bend square-to-round (20 bends);
perforated panel with 200 holes; formed part (dimple, louver, flange: FORM / HIDDEN layers); the mm *Tray* example.
Each flat written R12 and R2000 with every DXF/DWG Output option (default, entities, no bend lines, no notes,
boundary box, bend layers split, relief layer, hidden edges, all at once): 144 DXF files; the 72 R2000 ones also as
DWG through Anvil's own writer (`DWG.fromDXF`).

Three independent readers:

1. `DxfCheck.audit` (new, `anvil/headless/dxf-check.js`): the DXF reference checks a strict importer makes on top of
   `check()` — sections present and in order, `0 / EOF` last; `$INSUNITS` / `$MEASUREMENT`; `$EXTMIN` / `$EXTMAX` equal to
   the geometry's extents (text left out) to 1e-6; every entity's layer in the LAYER table with a colour 1–255 and a
   line type that the LTYPE table has; R2000 handles unique and below `$HANDSEED`; R12 free of R2000-only entities
   (LWPOLYLINE, SPLINE, ELLIPSE, MTEXT, HATCH …) and of R13 group codes (100 / 330 / 360 / 102); nothing off z = 0
   (codes 30–38, extrusion other than 0, 0, 1); no zero-length LINE, zero-radius arc or duplicate entity on any layer;
   text at least .06 in / 1.5 mm; bend layers LINE only and in the line type asked; arcs not written as runs of equal
   chords. Plus `check()`: every cut loop one closed chain, ends equal to 1e-5·size (measured gap 0), circles real.
2. ezdxf 1.4.4 `recover.readfile` + `doc.audit()`: 144 / 144 files, no error, no fix, no z.
3. LibreDWG `dwg2dxf` (the copy in the main checkout's `anvil/vendor/libredwg`, nothing downloaded) on each of the
   72 DWGs: entity counts per type and layer equal, every LINE / ARC / CIRCLE / polyline equal to 1e-8, `check()` clean,
   bend layers keep CENTER. In the kernel tests the same files go through `DWG.fromDXF` and its own reader (no
   external tool in CI).

Spline / ellipse: a flat has none (its loops are lines and arcs); sketch DXF splines / ellipses are already covered by
`sketch-spline` (R2000 true entities, R12 arcs within `DXF_TOL.freeArc`).

### Import (task 2)

Twelve hand-written customer-style files through `DxfImport.parse` + `DxfImport.prepare` (inch part), areas from
`Kernel.sketchProfile` with each arc chord's circular segment added back (exact):

| # | File | Result |
|---|---|---|
| 01 | R12 POLYLINE / VERTEX, bulges, obround 4 × 2 R1 | area 4 + π, 1 loop |
| 02 | LWPOLYLINE, concave bulge −1 | area 6 − π/8 |
| 03 | SPLINE by fit points only, with end tangents | 1 spline, area 3 |
| 04 | SPLINE control points (cubic Bézier) + rational quarter circle | 2.25 + π/4 (rational as lines, 2e-4) |
| 05 | ELLIPSE full (turned 30°) + half ELLIPSE closed by a LINE | 3π to 1e-5 |
| 06 | nested BLOCK / INSERT: rotation 90°, scale 2, mirror (sx −1), MINSERT 3 × 2 | 16 loops, area exact |
| 07 | frozen layer (title block) and off layer (dims) | **was imported; fixed** |
| 08 | `$INSUNITS` 4 (mm) into an inch part; `$INSUNITS` 0 | ×1/25.4; unitless takes the part's units |
| 09 | duplicate + overlapping LINEs, .002 in gap at a corner | merged; gap: see findings |
| 10 | self-touching outline (two squares at one corner) | area 2, no crossing |
| 11 | extrusion 0, 0, −1: ARC, CIRCLE, bulged LWPOLYLINE | mirrored correctly, area exact |
| 12 | MTEXT, TEXT, DIMENSION with its `*D1` block | 2 Sketch Texts, DIMENSION skipped, no geometry from `*D1` |
| — | CRLF line ends; no `0 / EOF` and no last ENDSEC | same plate, area 2 |

UI wizard (smoke `rfKS.js`): file 07 and file 09 through *Insert DXF* (`UI.importDXFText`), clicks on the layer
boxes, a value typed into *Close gaps up to*, ✓.

## Findings, by shop impact

1. **Frozen / off layers were imported (fixed).** A customer DXF's title block or dimension layer that AutoCAD hides
   came into the sketch, making an extra profile round the part (a title frame becomes the outer loop of a Base
   Flange). Now `parse()` reports each layer's `frozen` (70 & 1) / `off` (negative colour) state, `prepare()` leaves
   them out unless `layers: { NAME: true }`, and the DXF/DWG Import PM starts them unchecked with "frozen in the file"
   / "off in the file" and a warning line. A click brings one in. Note: a hidden sketch layer Anvil itself writes
   (written off) now also comes back unchecked.
2. **A gap just over *Close gaps up to* left the profile open without a word (fixed in the message).** A .002 in corner
   gap stays open at SolidWorks' default .001 (kept; rfJL asserts it); Check Sketch only said "open endpoint". The PM
   message now reads "1 gap left open (0.002 in): raise Close gaps up to to close it", for gaps up to 10 × the field.
3. **Gap closing bent straight edges (fixed for the import).** Two ends were snapped to their midpoint, so a horizontal
   bottom edge closing a .002 corner gap came out .001 off level (area 5.9985 instead of 6). The import's repair now
   meets two lines where they cross (each keeps its direction) and a line and a curve at the curve's end. *Repair
   Sketch* keeps the midpoint rule (its test asks that no end moves more than half the gap).
4. **Bend lines were CONTINUOUS (fixed).** Every flat DXF's BEND (and BEND_UP / BEND_DOWN) layer now carries AutoCAD's
   CENTER line type (CENTER2 proportions .75 / .125 / .125 / .125 in, 19.05 / 3.175 mm in mm files), defined in LTYPE,
   R12 and R2000, kept through DWG. Layer names and colours unchanged, so CAM layer mapping is unaffected.
5. **Lofted-Bend bend lines end on outline vertices (left, by design).** The square-to-round's 20 bend lines run
   corner to corner of its facets, as SolidWorks draws them; a layer-aware CAM ignores them, a layer-blind chainer
   would see three ends meet. `audit` reports it as a warning.
6. Nothing else: no open chain, duplicate, zero-length entity, R2000 entity in R12, z ≠ 0, handle clash, missing table
   entry or wrong extents in any of the 144 files; ezdxf and LibreDWG agree.

## Left / notes

- `ui-nesting.js` (another lane) reads `DxfImport.parse(...).entities` directly, so a frozen title block still reaches
  the nest as a loop; it should filter `parsed.layers[i].frozen / .off` as `prepare` does.
- Fit-point splines are drawn by Anvil's own interpolation, not AutoCAD's chord-length one; the shape between fit
  points can differ slightly from the customer's (only collinear fit points were checked exactly).
- `build --dxf-flat` / `--dxf-face` now carry the audit's findings in `check.audit` (`'ok'` when clean), not as errors.
