# End-to-end shop workflow audit — SolidWorks 2024 vs Anvil (f78a80d), 2026-10-12

Lane: shop workflow (audit only, no app file edited; **30-minute time box**). A real job was driven the way the shop
makes one, in headless Chrome over the DevTools protocol with trusted input (ribbon buttons, PropertyManagers, sketch
clicks by sketch coordinate, typed values, drawing picks by paper coordinate) against `f78a80d` served on port 8888
(Chrome debugging port 9388 / 9389). The driver and scenario (`shop/drv.js`, `s_shop.js`, `check.js`, `run1.txt`,
`run2.txt`, the exported files under `shop/out/`) live in the session scratchpad, not in the repository. The scenario
ran twice; only what both runs showed is reported as a finding. Open findings already in
`2026-10-12-sketch-fidelity-3.md` and `2026-10-12-drawing-fidelity.md` (drawing *Save as DWG* missing, Model View /
Section / Detail PMs, Center Mark size in mm, ANSI style details) are not repeated.

The job: new **inch** part, Top-plane sketch of a 10 × 6 blank (Corner Rectangle, typed `10` Tab `6`), four circles
typed `.281`, Straight Slot (4.5,3)–(5.5,3) typed width `.375`, Polygon at (7.5,1.5) typed `.5`, a 1 × 1 corner notch
drawn with Line and Trim (Power trim), Smart Dimension on the bottom edge, Horizontal Ordinate Dimension, Exit Sketch;
Base Flange/Tab (gauge table checked: 16 ga — 0.0598 in; then typed .0598 / R .0598, K .5), two Edge Flanges (1.5 on the
x = 0 edge, 1.0 on the y = 0 edge, Outer Virtual Sharp); a sketch on the second flange's outer face, Convert Entities,
a Ø-typed circle and Cut-Extrude; File ▸ Make Drawing from Part (Standard 3 View, ANSI B 1:2), Model View ▸ Flat
pattern with bend notes then the bend table, Model Items, two-pick Smart Dimensions (hole centre to edge, hole to
hole), Hole Callout, Revision Table, title block; flat DXF R12 and R2000 through the DXF/DWG Output PM's exporter,
sketch DXF, drawing DXF R12 / R2000 and PDF; the DXFs read back with `anvil/headless/dxf-check.js` and the flat
inserted back with *Insert DXF / DWG*. The local DWG converter is not installed on this machine (`api/dxf2dwg` → 503),
so the DWG radio was disabled with its note, as designed; DWG was not exercised.

## Findings

Severity: **blocker** (silently wrong geometry or data), **major** (a core workflow fails or differs), **minor**,
**cosmetic**.

| # | Sev. | Step | Expected (SolidWorks 2024) | Actual (Anvil, f78a80d) | Repro | Likely at fault | Proposed fix |
|---|---|---|---|---|---|---|---|
| 1 | major | Base Flange on a sketch whose hole circle crosses the outer loop | A profile with a circle cutting the outline is refused ("the sketch is self-intersecting / cannot extrude") so the operator fixes the sketch; nothing is built. | The circle at (9,5) sits on the notch corner and crosses the outline. Base Flange built anyway with **that hole silently dropped**: the model has three holes (vol 3.4181 in³ both runs), the flat DXF (R12 and R2000) carries 3 CIRCLEs, and the sketch DXF writes the fourth circle on layer **OUTLINE** instead of HOLES. No warning in the status bar, the PM or the tree. A laser blank goes out one hole short. | `s_shop.js` steps *holes*, *notch*, *base flange*; `check.js out/flat_R2000.dxf` → `circles: 3`; `out/sketch.dxf` → `CIRCLE@OUTLINE: 1` (both runs). | `kernel-sketch.js` profile / loop classification (a circle intersecting the outer loop is neither hole nor outline and is discarded), `ui-commands.js` Base Flange / Boss-Extrude (no self-intersection check), `kernel-script.js` sketch DXF layering. | Run the profile check before building (`Check Sketch for Feature` already exists on the ribbon): a loop that intersects another is an error that stops the feature with the SolidWorks message; at minimum a warning on the feature and `anvil.flat().warnings`. |
| 2 | major | Smart Dimension on an edge the typed rectangle already dimensioned | Placing a dimension that over-defines the sketch opens *Make Dimension Driven?* (Make this dimension driven / Leave this dimension driving), and after placement the Modify box opens for the value. | The dimension is placed, the status goes to **Over Defined** (`over dof=16`, both runs) with no dialog; the Modify box did not open (`UI.isDimEditOpen()` false). The operator then exits the sketch and builds a Base Flange from an over-defined sketch without being told. | `s_shop.js` step *dims*: Smart Dimension, click the bottom edge, click below it. | `ui-sketch-dims.js` (Smart Dimension placement), `sketch-solver.js` (over-defined detection is there, the prompt is not). | On placement, if the solver reports over-defined, show the SolidWorks dialog and add the dimension as *driven* when chosen; open the Modify box after placement as in SolidWorks. |
| 3 | minor | Polygon typed value | The Polygon PM's *Circle diameter* field and the on-screen input agree: typing `.5` makes the inscribed circle Ø.500. | Typing `.5` after the centre click produced an inscribed circle of **r .5** (Ø1.000, hexagon across flats 1.000) while the PM labels the field *Circle diameter*; the two inputs read the same number differently. | `s_shop.js` step *polygon*: `poly ents` → construction circle `r: 0.5` (both runs; the same mass both runs). | `ui-sketch-lines.js` / `ui-sketch-tools.js` polygon tool numeric input vs PM `dia`. | Make the typed value the diameter (the PM's field) or relabel the field; the circle tool's typed value is a radius, which matches SolidWorks. |
| 4 | minor | Model Items into the flat-pattern view | Model Items on a flat-pattern view inserts the flat's sketch / feature dimensions; bend radius and bend deduction are bend-note / bend-table data, not drawing dimensions. | With the just-placed flat view selected, Model Items reports *inserted into 1 view* and the only new texts are `.060 .098 .060 .098` (the bend radius and the bend deduction per bend, as dimensions on the flat view); `summary().dims` stays `[]` so they are not listed as dimensions either. The 10 / 6 / hole-location sketch dimensions were not inserted into any view. | `s_shop.js` step *drawing* (Model Items PM, ✓): run 2 logged the texts, run 1 only `dims: []`; seen in both runs that nothing reached the standard views. | `drawing-ui-tools.js` `cmdModelItems`, `drawing-sheet.js` Model Items generation for flat views. | Skip bend radius / BD when the destination is a flat view (they are in the bend table), insert the sketch dimensions, and list what was inserted in `summary().dims`. |

Not completed inside the box and **not** reported as findings (driver limits, not the app): Convert Entities on the
flange face (the sketch opened on the face but the face selection is consumed by opening the sketch, so Convert
Entities had nothing selected: "Select the model edges or faces to convert"; a second face click was not scripted);
Circular Sketch Pattern (it lives in the Linear Sketch Pattern flyout, as in SolidWorks; the driver looked for a flat
button); the ordinate chain (zero picked on the left edge, then the driver clicked inside the holes instead of on
them); Hole Callout (same pick error); Insert DXF / DWG of the flat (its PropertyManager opened with the file's units
and `repair`; the driver did not press ✓). The drawing hole-to-edge Smart Dimension read `4.014` where 1.000 was
expected in run 2 only (run 1 picked nothing): the second pick most likely snapped to another edge of the Top view
(the bend tangent edge is not drawn at y = 0); needs a hand check before it is called a bug.

## What worked end to end (key numbers)

- Sketch: Corner Rectangle typed 10 × 6 → Fully Defined (dof 0, two dimensions); circles typed `.281` → r .281
  at (1,1), (9,1), (1,5), (9,5); Straight Slot typed `.375` → lines at y 3.1875 / 2.8125, end arcs r .1875 (width
  .375, centres 1.000 apart); Polygon 6 sides about (7.5,1.5); Line notch + Power trim "Trimmed 2 segments" leaving a
  6-line outline; Horizontal Ordinate Dimension found in the dimension flyout and started ("Click the zero").
- Sheet metal: Base Flange/Tab PM with *Use gauge table* → Steel (Manufacturers' Standard Gauge), 16 ga — 0.0598 in;
  Base-Flange1 depth .0598, bbox 10 × .0598 × 6. Edge Flange picks on-screen edges with a live status "bend
  allowance 0.1409 in (BD 0.0983, K-Factor 0.5)"; BA = π/2·(.0598 + .5·.0598) = .1409, OSSB = R + T = .1196,
  BD = .0983, all SolidWorks-exact. Flat 11.5213 × 7.0213 = (10 + .1196 + 1.5 − .0983) × (6 + .1196 + 1.0 − .0983)
  for Bend Outside placement, Outer Virtual Sharp, correct. Two bend lines, notes `UP 90° R.060`, no warnings.
  Cut-Extrude on the flange-face sketch built (Sketch2, Cut-Extrude1).
- Drawing: Make Drawing from Part → ANSI B, 1:2, third angle, Front/Top/Right/Isometric; Model View flat pattern
  with bend notes, then bend table (`BEND DED.`, `UP 90°` rows, `R.060`); Model Items has a PM (Source /
  Destination, Dimensions); two-pick Smart Dimension works: hole-to-hole **8.000** (centres at x = 1 and 9) with the
  Dimension PM open; Revision Table inserted top-right (Add Revision by right-click); title block PART1 / Draw1 /
  1:2 / IN / THIRD ANGLE / 1 OF 1 / mass 1.284 lb / ANSI inch tolerance block.
- Output: flat DXF R12 (`AC1009`, POLYLINE, `$INSUNITS` 1) and R2000 (`AC1015`, LWPOLYLINE) both pass
  `dxf-check` (every loop closed, gap 0): extents 0..11.5213 × 0..7.0213, holes at (2.5213, 2.0213), (2.5213,
  6.0213), (10.5213, 2.0213) r .281 = the model's (1,1), (1,5), (9,1) offset by the 1.5213 / 1.0213 flange legs,
  layers OUTLINE / HOLES / BEND / NOTES. Sketch DXF R12 passes (extents 10 × 6). Drawing DXF R2000 has the two
  Smart Dimensions as DIMENSION entities and per-view layers (FRONT, TOP, RIGHT, ISOMETRIC, FLAT_PATTERN, BEND_UP,
  BEND_NOTES, DIMENSIONS, REVISIONS); R12 has 0 DIMENSION entities (dimensions exploded). PDF: MediaBox 1224 × 792
  = 17 × 11 in. No console errors in either run.
