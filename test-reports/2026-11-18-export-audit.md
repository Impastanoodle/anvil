# Export audit: generated flats out as DXF / DWG and back, customer DXF in (2026-11-18, lane exportaudit, group rfOM)

Follows `2026-11-11-dxf-dwg-audit.md` (rfKS), `2026-11-11-dwg-import.md` (rfKW) and `2026-11-15-dxf-dwg-roundtrip.md`
(rfNA); none of their cases is repeated. Independent readers: ezdxf 1.4.4 (Python) and LibreDWG 0.14 (`dwg2dxf`,
`dwgread`, the main checkout's `anvil/vendor/libredwg`, read-only). No AutoCAD / ODA on this PC. The harness
(generator, ezdxf checker, comparer; not committed) lived in the lane's scratch folder: `gen.js`, `check.py`,
`compare.js`, `custgen.py`, `custcmp.js`. Tests: `anvil/tests/kernel/rfOM.js` (26 rows, one part per family from the
corpus with Anvil's own readers, plus one row per defect), `anvil/tests/smoke/rfOM.js` (5 steps).

## Task 1: the generated corpus

180 sheet-metal parts by script, fixed seed 11: 18 families × 10 (plate with holes and a slot, L bracket (positions
inside / outside / bendOutside / virtualSharp, length refs outer / inner / tangent, 45-135°), U channel (one reversed),
tray with rect / obround reliefs and rect / circular / tear corner reliefs, Miter Flange on 2-3 edges, Hem (open /
closed / teardrop / rolled) + Jog, Sketched Bend (1-2 lines, 30-120°), Closed Corner (butt), Break-Corner fillet /
chamfer (+ a flange with relief), Vent, a slot cut across a bend (Unfold / cut / Fold), Normal Cut, forming tools
(louver, dimple, extruded hole, lance, rib), ETCH text / line / arc / circle, Tab and Slot (two bodies), Lofted-Bend
(20 bends), configurations driving a flange length, an octagon with 4-8 flanges). 129 inch (gauges 24-7) and 51 mm
(0.6-5 mm); R 0.5-2 T; K 0.5 / 0.44 / 0.33. Bends per part: 0 (39 parts), 1 (67), 2 (17), 3 (17), 4 (20), 5 (2),
6 (4), 7 (2), 8 (2), 20 (10). Output options rotated through the parts: bend layers split (1 in 3), Boundary box
(1 in 7), RELIEF layer (1 in 5), HIDDEN edges (1 in 4).
Each flat: R12, R2000 (polyline), R2000 (entities), DWG of both R2000 files: **900 files** (360 DWG, 5,729 entities).

| Check (every file, ezdxf + Anvil's importer; DWG through LibreDWG's dxf2dwg-back) | Files | Before | After |
|---|---|---|---|
| cut loops closed to 1e-9·size, no gap / zero-length / duplicate / overlap / crossing | 900 | 0 | 0 |
| area (Green, true arcs / bulges) and outer + inner cutting length = `sheetCutList` to 1e-9 | 540 DXF + 360 DWG | 0 | 0 |
| loop count, CIRCLE count, ARC count = `dxfLoopCurves` | 540 | 0 | 0 |
| one outer loop, holes inside it | 900 | 0 | 0 |
| $INSUNITS / $MEASUREMENT (1 / 0 in, 4 / 1 mm) | 540 | 0 | 0 |
| $EXTMIN / $EXTMAX = the blank's extents | 540 | **found**: 4 files of 2 filleted parts in the first 40-part run | 0 |
| layer colours / line types as the PM writes them, R12 without R2000 entities | 540 | 0 | 0 |
| bend lines (count, layer BEND or BEND_UP / BEND_DOWN), one note per bend | 540 | 0 | 0 |
| bend lines inside the outline | 900 | 25 (5 trays) | 25: kernel flat, handed on (1) |
| DWG = R2000 DXF entity for entity (type, layer, colour, line type, geometry 1e-9), header units, layer table | 360 | 0 | 0 |
| Anvil import: units, no warnings, closed regions, area 1e-9, Check Sketch clean | 540 | **found**: 2 filleted + Boundary box parts, 1 tray (R12, R2000, entities each) | 0 |
| fixed point DXF -> sketch -> Base Flange -> flat -> DXF (1e-7) | 144 | 1 (Vent) | 1: approximation, handed on (2) |
| folded volume = blank area × T (K 0.5, no forms) | 63 | 2 | 2: corner-relief trays (kernel, see 1) |

## Task 2: customer files in

20 files written with ezdxf as other CAD systems write them, opened as File > Open does (`DxfImport.parse` +
`prepare`, the PM's defaults) and compared per layer (curve length) with ezdxf's reading; each R2000 one then through
`DWG.fromDXF` and LibreDWG back. All equal except where noted.

| File | Result |
|---|---|
| R12 POLYLINE / VERTEX with bulges | lengths equal; width warned; DWG: **was refused (R12)**, now written, equal |
| LWPOLYLINE negative bulge, widths | equal, widths warned, DWG equal |
| SPLINE fit / control / closed / rational | Anvil's points lie on the curves (1e-7); DWG back: **fit spline .22 off**, fixed (defect 4) |
| ELLIPSE full / half / rotated partial | Anvil exact (2e-15); ezdxf's own path is a Bézier approximation (4e-4) |
| nested blocks: ×2 rotated 30, mirrored X, mirrored Y rotated 15 | equal |
| frozen + off layers, paper space | left out with the warnings; DWG back: **off layer came back on**, fixed (defect 5) |
| $INSUNITS missing / 4 / 1 / 0 + title-block scale | missing and 0: mm from $MEASUREMENT 1, warned; others exact scale |
| 1:1 flat with DIMENSION, TEXT, MTEXT | DIMENSION counted as skipped, texts in |
| duplicate + overlapping lines; corners open 1e-4 | merged 2; 3 gaps closed, square |
| Z = 5 | placed on the sketch plane, warned |
| colours BYLAYER / BYBLOCK | layer-0 block entities take the INSERT's layer (AutoCAD's rule; ezdxf's virtual entities keep 0) |
| %%d, %%c, ±; Windows-1252 R12 | °, Ø, ± read right (decoded as 1252 below AC1021) |
| 20,000 holes | 1.1 s import, DWG 1.0 MB, equal |
| ATTDEF / ATTRIB | ATTRIB in as text, ATTDEF skipped and counted; DWG: **was refused**, now written (Task 3) |
| R12 with a 3DFACE | 3DFACE skipped and warned; DWG refuses it by name |

## Defects (before -> after)

1. **Import merged across layers** (`dxf-import.js` prepare). A flat written with Boundary box round filleted corners came in with no closed loop: the BOUNDARY lines absorbed the outline's straight edges. Now duplicates / overlaps merge within a layer, gaps still close across layers. rfOM kernel + smoke.
2. **Import collapsed a short outline edge** (`dxf-import.js` repair, gap pass). A .0007 step beside a tray's relief notch (under the .001 gap) was pulled shut, leaving a branch and an overlap: no closed loop. Now an end already joined to another entity's end is not taken into a gap unless it is the seed's own point. rfOM kernel + smoke.
3. **$EXTMIN / $EXTMAX too large** (`kernel-script.js` DXF.arc / polyline). Every arc and bulge grew the extents by its whole circle: a flat with R.365 fillets read .25 past the blank (what a nesting import takes as the part size). Now an arc grows them by its ends and the axis points it passes (`_growArc`). rfOM kernel + smoke.
4. **Zero fit-spline tangents** (`dxf-import.js` SPLINE). 12 / 13 = 0, 0 (LibreDWG writes them for every fit spline of a DWG) was read as a 0° tangent: the curve came back .22 off. Now zero means not set. rfOM kernel + smoke.
5. **DWG off layer** (`dwg-writer.js` LAYER). Only the negative colour was written; LibreDWG read the layer back on. Now flag bit 2 is set as well (LibreDWG's own dxf2dwg writes 1010 against 1008). rfOM kernel.

## Task 3: what the DWG writer refused

- **ATTDEF / ATTRIB written** (`dwg-writer.js`): ATTDEF as an entity of its block (tag, prompt, field length, flags), an INSERT's ATTRIBs owned by it, linked, then its SEQEND; the INSERT carries has-attribs, first / last ATTRIB and SEQEND handles. LibreDWG `dwgread -v5`: no warning; `dwg2dxf` gives back PN = 123-A and the ATTDEF.
- **R12 DXF written** (was refused): POLYLINE / VERTEX / SEQEND -> LWPOLYLINE (bulges, widths, closed, elevation), a 3D polyline -> LINEs, a polygon / polyface mesh still refused by name; no $INSUNITS stays unitless (was mm). rfDG's "R12 refused" row re-pinned.
- Drawing DXF (`Drawing.toDXF`, R2000) emits LINE, CIRCLE, ARC, ELLIPSE, SPLINE, TEXT, SOLID, HATCH (polyline edges), INSERT, DIMENSION types 0 / 1 / 3 / 4 / 5: all written to DWG. POLYLINE only in R12, which the drawing never converts.
- Still refused: HATCH spline edges, DIMENSION types other than 0-6, 3DFACE and other 3D entities, meshes.

## Handed on (not this lane's files)

1. **Bend lines run into corner-relief voids** (`kernel-sheetmetal.js`, the flat's bend lines; lane flangeprofile). 5 of 10 inch trays with corner reliefs: a bend line starts at the relief's far corner, up to T + R inside the void (e.g. 003-tray-mm: the right bend from y 33.79 where the material starts at 36.79). Reproduction: `p.units("mm"); p.sheet(1.5, 1.5, 0.5); p.sketch("Top").rect(0, -113.9542, 93.5775, 113.9542).end().baseFlange();` four `p.flange(36.2558, [...], { position: "inside", lengthRef: "outer", relief: "rect" })` on the four edges, `p.cornerRelief([[90.5775, 1.5, 110.9542], [3, 1.5, 3]], null, { reliefType: "tear" })`: sample each bend line at 2 % / 98 %, not inside `flat.loops[0]`. Change: clip each bend line to the outline (the bend face's extent), not checked in SolidWorks. Those trays' folded volume also differs from area × T by 2e-5.
2. **Vent arcs 3e-6 off the true circle** (`kernel-script.js` dxfLoopCurves / arcThrough). An arc whose ends are CSG split points (a rib crossing a spar) is fitted through the chord's split points: Vent of R 1.6005 / 0.8003 circles, ribs .1: the spar arc's centre (2.9999968, 2.4999954) for (3, 2.5). Change: fit the circle on the run's interior vertices only and move each end along its neighbouring line onto that circle. Not done (below laser tolerance; would re-pin rfFJ / rfNM).
3. **`UI.dxfToDwg` still refuses R12 up front** (`ui-commands.js` dxfToDwg, DXF_R12_NOTE; lane shopflow7): drop the AC1009 test so the writer's R12 path is used.
4. **Drawing attributes as TEXT** (`drawing-render.js` toDXF, the INSERT branch at "(rfPQ) its attribute / linked texts"; lane drawflow5): for R2000, write the block's attribute texts as ATTDEF in its BLOCK (2 tag, 3 prompt, 1 default, 70 0, 73 0) and the instance's as `66 1` on the INSERT followed by one ATTRIB per tag (8 layer, 10/20 position, 40 height, 1 value, 2 tag, 70 0, 7 style, 72 / 74 alignment) and a SEQEND, instead of TEXT beside the INSERT. The DWG writer takes them now.

Not checked in SolidWorks or AutoCAD (neither may be driven on this PC); LibreDWG is the only DWG reader used.
