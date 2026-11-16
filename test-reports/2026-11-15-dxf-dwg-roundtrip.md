# DXF / DWG round trip, checked with a second reader (2026-11-15, lane NA dxfdwg, group rfNA)

Follows `2026-11-11-dxf-dwg-audit.md` (rfKS: reference audit, ezdxf, LibreDWG entity counts) and
`2026-11-11-dwg-import.md` (rfKW: 464 shop DWGs in). Not repeated here. New: every attribute of every entity compared
between Anvil's DXF and LibreDWG's reading of Anvil's DWG, the import of the same files back into sketches against the
flat's exact area, and hostile customer inputs not covered before.
Tests: `anvil/tests/kernel/rfNA.js` (20 rows, no LibreDWG in CI). Harness used for the LibreDWG tables (not committed):
build the parts headless, write R12 / R2000 / R2000-entities DXF and DWG (`DWG.fromDXF`), then LibreDWG 0.14
`dwgread -O JSON` and `dwg2dxf` (main checkout's `anvil/vendor/libredwg`, read-only), then a group-code comparer.

## The files

Eleven flats + one sketch: the three sheet-metal examples (U-bracket mm, Tray mm with obround reliefs, Normal Cut Bracket
mm), a tray with rect bend reliefs and Circular corner reliefs, a bracket with one UP and one DOWN bend and a .25 slot
cut across the UP bend (Unfold / cut / Fold), a 16 x 11 panel with 600 holes, a hem + jog, a Lofted-Bend square-to-round
(20 bends), a part with etch text / line / arc / circle (ETCH), an mm bracket, an L bracket; plus an inch sketch with a
SPLINE and an ELLIPSE (a flat has no splines: its loops are lines and true arcs, see rfKS). Every flat with
`bendLayers: 'split'` (BEND_UP / BEND_DOWN) and notes; DWG made from both R2000 styles (polyline, entities): 23 DWGs, plus
a 10,000-LINE file.

## Task 1: Anvil's DWG writer against LibreDWG

Compared per entity (multiset, values to 12 significant digits): type, layer, colour (62), line type (6), every
coordinate, radius, start / end angle, LWPOLYLINE vertices + bulges + const width + elevation, TEXT string / height /
style / rotation / width factor / justification, SPLINE degree / flags / knots / control points / weights / fit points,
ELLIPSE centre / major axis / ratio / params. Header: $INSUNITS, $MEASUREMENT, $EXTMIN / $EXTMAX, $LTSCALE, $LUNITS,
$AUNITS. Tables: LAYER (name, colour, line type, frozen / off / locked), LTYPE (name, count, length, dashes). Blocks.

| File | Direction | Entities (types) | Defects | Result |
|---|---|---|---|---|
| U-bracket ex. (mm), poly / entities | DXF -> DWG -> LibreDWG | 13 / 19 (LWPOLYLINE, CIRCLE 6, LINE, ARC, TEXT) | none | equal |
| Tray ex. (mm) | " | 15 / 36 | none | equal |
| Normal Cut Bracket ex. (mm) | " | 7 / 13 | none | equal |
| tray, corner reliefs | " | 10 / 43 (34-vertex polyline, 4 bulges) | none | equal |
| UP / DOWN + slot | " | 7 / 13 (BEND_UP + BEND_DOWN) | none | equal |
| 600-hole panel | " | 602 / 605 | none | equal, 34.5 KB, 12 ms |
| hem + jog | " | 8 / 11 | none | equal |
| Lofted-Bend | " | 42 / 64 (21 TEXT) | none | equal |
| etch marks + text | " | 25 / 28 (ETCH colour 3) | none | equal |
| mm bracket | " | 7 / 10 | none | equal |
| L bracket | " | 5 / 8 | none | equal |
| sketch: SPLINE + ELLIPSE | " | 6 | none | knots, control points, ellipse equal |
| 10,000 LINEs, no LAYER table | " | 10,000 | **every LINE pointed at a layer handle past $HANDSEED that was never written** (dwg2dxf: 20,000 x "Object handle not found 10042/0x273A") | **fixed** (`dwg-writer.js`: a layer an entity names that the table lacks gets its LAYER record before the control object is written); 0 warnings after, 532 KB, 0.3 s |

Representation LibreDWG chooses (not defects): it writes `42 = 0` on every LWPOLYLINE vertex (Anvil omits a zero
bulge) and `11 / 21 = 0, 0` on a left / baseline TEXT (whose alignment point is unused). `dwgread` printed `SUCCESS` and
nothing else for all 24 DWGs (after the fix). Header units, extents, layer table (BEND layers on CENTER) and LTYPE
patterns identical in all.

## Task 2: import, the same files

Each flat's R12, R2000, R2000-entities DXF and LibreDWG's DXF of both DWGs -> `DxfImport.parse` + `prepare` (part in the
flat's units): 55 imports. All five readings of a part give the same entity types per layer (circles stay circles, arcs
arcs, bulged polylines lines + tangent arcs), the units from $INSUNITS with scale 1 (no 25.4 anywhere), no warnings, the
file's layers (OUTLINE, HOLES, BEND_UP, BEND_DOWN, NOTES, ETCH), every cut loop closed, and the same cut area to 10
digits. In rfNA (Anvil's own three DXFs): area equal to the flat's exact area (`dxfLoopCurves`: true arcs) to 1e-9, and
for four parts the imported sketch makes a Base Flange whose volume = area x T to 1e-9, whose own flat imports to the
same area. The LibreDWG DXF of the spline sketch imports to the same spline / ellipse to 12 digits.

Hostile inputs (written as DXF text in rfNA):

| Input | Before | After |
|---|---|---|
| duplicate LINEs and CIRCLE | merged (5), area right | unchanged, now a row |
| zero-length LINEs | removed (2) | unchanged, now a row |
| corner open by 1e-4 (< Merge points closer than .0005) | **closed at the midpoint of the two ends: bottom edge tilted 5e-5, area 5.999925** | **fixed**: first repair pass also meets two lines where they cross (`corners: true`); area 6, edges square |
| ELLIPSE 2 x 1 | ellipse | unchanged |
| LWPOLYLINE with width 43, widths 40 / 41; R12 POLYLINE with width | **centre line, width dropped without a word** | centre line + warning "1 polyline has a width: its centre line is imported, not the band's edges." |
| BLOCK inserted twice, rotated 30 and mirrored (sx -1) at 45 | right | unchanged, mirrored arc centre checked to 1e-12 |
| SPLINE with weights (rational quarter circle; 9-point circle) | lines within 1e-4, warned (area off 8e-5) | `parse(text, { rationalArcs: true })`: one true arc / one circle (each span checked at 17 points to 1e-9); a non-circular rational (hyperbola) stays lines, warned. **Default off**: `tests/kernel/dxf-import.js:122` asks for lines (not this lane's file) |
| MTEXT with \f \H \C \S \~ \O codes and %%c | plain text right | unchanged, now a row |
| layer 0, BYBLOCK colour, in a block | takes the INSERT's layer | unchanged |
| R12 with no header | part's units, PM says "Not set (taken as ...)" (rfKW asserts no warning) | unchanged |
| header UCS not world | ignored (DXF geometry is WCS) | correct, a row |
| OCS (0, 1, 0) circle | projected, warned | unchanged |

## Left

- **Turn `rationalArcs` on**: set `DEFAULTS.rationalArcs = true` in `dxf-import.js` and change the rational row of
  `tests/kernel/dxf-import.js` (line 122-125: expects `R.every(line)`) to expect one arc of R 10 from (10, 0) to (0, 10).
  rfKS row 04 (area 2.25 + pi/4, tol 2e-4) passes either way.
- Flat DXF writer (`kernel-script.js` / `kernel-sheetmetal.js`, lane MY): no defect found. Note only: the sketch font's
  letter strokes leave ends 1.1e-6 apart (an arc end and a line start in "PN 123-A"); the import closes it (1 gap in the
  report). Font data, not the DXF writer.
- No AutoCAD / ODA on this PC: LibreDWG is the only independent DWG reader used.
