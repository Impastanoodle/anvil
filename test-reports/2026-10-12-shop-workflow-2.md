# Shop workflow audit, round 2 — SolidWorks 2024 vs Anvil (a63a951), 2026-10-12

Lane AI (40-minute box: audit, then fixes). Covers exactly what `2026-10-12-shop-workflow.md` could not finish: the five
items in its "not completed" list. Driven in headless Chrome over the DevTools protocol (trusted input: PropertyManagers,
`UI` commands, viewport clicks by world coordinate, the `anvil` API for the drawing) against the worktree served on port
8896 with LibreDWG installed (`api/dxf2dwg` and `api/dwg2dxf` both 200, `X-Anvil-Converter: libredwg`). The driver
(`drv/cdp.js`, `drv/s_shop2.js`, `run1.json`, `run2.json`) lives in the session scratchpad, not in the repository. The
scenario ran twice (ports 9396 / 9397); only what both runs showed is reported. No console errors in either run.

The part: new **inch** part, 16 ga (`p.sheet(.0598, .0598, .5)`), Top-plane 10 × 6 blank with four Ø.281 holes at
(1,1) (9,1) (1,5) (9,5), Base Flange/Tab .0598, Edge Flange 1.5 on the x = 0 edge through its PropertyManager (edge
pick, Outer Virtual Sharp, Bend Outside): volume 4.119 in³, flat 11.5213 × 6, one bend `UP 90° R.060`.

## Findings

Severity: **blocker** (silently wrong geometry or data), **major** (a core workflow fails or differs), **minor**, **cosmetic**.

| # | Sev. | Step | Expected (SolidWorks 2024) | Actual (Anvil) | Repro | At fault | Fix |
|---|---|---|---|---|---|---|---|
| 1 | major | Convert Entities, the Edge Flange's outer face picked (Sketch on that face, Convert Entities, click the face, ✓) | The whole face boundary comes in: four lines (two sides, the top edge and the tangent edge at the bend), a closed contour with On Edge relations. | **Three lines** (sides and top, box 0..6 × .1196..1.5); the tangent edge at the bend (the mesh edge marked `smooth` between the flat wall and the bend cylinder, −.1196,.1196,0 → −.1196,.1196,6) is left out, so the converted contour is open. A Cut-Extrude from the converted face alone has no closed profile; the operator has to draw the missing line. | `s_shop2.js` step `1_convert_cut`: `items: [{kind: 'face'}]`, `faceEdges` lists 3 sharp + 1 smooth edge, `entities: line line line` (both runs). | `anvil/ui-sketch-tools.js` `faceLoops(fi)`: `(App.edges \|\| []).filter(function (e) { return !e.smooth && e.faces.indexOf(fi) >= 0; })` drops every tangent edge, also for a *face* item where the boundary is wanted whole. | **Open** (sketch lane file). Proposed: `function faceLoops(fi, whole)` with `filter(function (e) { return (whole \|\| !e.smooth) && e.faces.indexOf(fi) >= 0; })`; `edgeList` calls `faceLoops(it.index, true)` for `it.kind === 'face'` (the chain case keeps skipping smooth edges so a chain does not run round a bend). `convertGeometry` already turns a straight smooth edge into a line. Smoke test: on the part above, Convert Entities of the flange face gives 4 lines forming a closed loop and `UI.sketchStatus().status === 'full'`. |
| 2 | major | Hole Callout on the drawing's Top view for a Hole Wizard **CSK for 1/4 Flat Head Screw** on the 16 ga sheet (by pick, and from Model Items with Hole callouts) | The callout is the feature's: `Ø.281 THRU ALL` / `⌵ Ø.507 X 82°` (SolidWorks reads Hole Wizard callouts from the feature, not from the faces). | **`Ø.403`**. The 82° countersink cone is .130 deep, more than the sheet (.0598), so the sheet has no Ø.281 cylinder at all: the far face sees Ø.507 − 2 · .0598 · tan 41° = Ø.403, and the callout's geometric analysis reports that circle as a plain hole. The clearance hole (`Ø.281 THRU ALL`) and the tapped hole (`Ø.201 THRU ALL 1/4-20 UNC - 2B THRU ALL`) are right. | `s_shop2.js` step `3_holewizard`: `calloutsByPick[2]` and `modelItems.callouts[2]` both `Ø.403` (both runs). | `anvil/drawing-annotations.js` hole analysis (~lines 93–165: `{ c, dia, thru, cbore, csk }` from the view's circles / mesh faces) never consults the Hole Wizard feature. | **Open** (drawing lane file). Proposed: before the geometric analysis, look for a `type === 'hole'` feature whose `HoleWizard.positions(f, model)` has a point under the picked / inserted circle's centre (view coordinates, tolerance a few mils); when found, text = `HoleWizard.callout(f, units)` with the through wording the drawing uses (`THRU` → `THRU ALL`), else fall back to the analysis. Same lookup in Model Items' hole callouts (`drawing-sheet.js` ~788). Test: the callout on the CSK hole of the rfAI smoke part reads `Ø.281 THRU ALL ⌵ Ø.507 X 82°`. |
| 3 | major | Model Items with **Hole callout** into the Top view of the Hole Wizard holes | One hole callout per Hole Wizard hole, the feature's text: `Ø.281 THRU ALL`, `Ø.201 THRU ALL` / `1/4-20 UNC - 2B THRU ALL`, `Ø.281 THRU ALL` / `⌵ Ø.507 X 82°`. | No hole callout annotation at all (`summary().annotations` has none of type `holeCallout` after Model Items; "Model Items inserted into 1 view"): the Hole callouts option inserts a plain **diameter dimension per distinct circle size** (`Ø.281`, `Ø.201`, `Ø.403`, as `4X Ø.281` on the drawing DXF), so the tapped hole loses its thread and the countersink its cone. The by-pick Hole Callout (finding 2) is a different code path. | `s_mi.js` probe (holes from `p.holeWizard`, no prior callouts): `callouts: []`, `dims: 7` for `{holeCallouts: true}`, `{dedupe: false}` and the full option set; runs 1 / 2 of `s_shop2.js` show the same (the three "callouts" listed after Model Items were the by-pick ones). | `anvil/drawing-sheet.js` `perViews` (~788): `MI.holeCallouts` groups `pr.circles.visible` by `fmtDim(2 r)` and pushes `{ kind: 'dia', … auto: true }` dimensions. | **Open** (drawing lane file). Proposed: for each visible circle whose centre is a `HoleWizard.positions` point of a `type === 'hole'` feature, add a `holeCallout` annotation (`Drawing.addHoleCallout(dc, v.id, { c, r })` with the feature's `HoleWizard.callout` text, one per hole feature with `count` = its positions, "2X …") and leave the `dia` dimension to circles that are not Hole Wizard holes. Smoke step rfAI already measures the Top view's Model Items (dims count); assert the three callout texts there once done. |
| 4 | minor | DWG from an R12 flat DXF through the API (`UI.dxfToDwg(anvil.dxfOutput({export: 'sheet', version: 'R12'}))`) | A DWG with the flat in it, or a refusal. | LibreDWG's `dxf2dwg` returns a 2070-byte DWG that reads back (`api/dwg2dxf`) with **0 entities**: the R12 POLYLINE / VERTEX loops and the circles are gone, silently. Not reachable from the UI: the DXF/DWG Output PM forces R2000 when DWG is chosen, Save Drawing as DWG writes R2000, and `headless/anvil.js` converts from R2000 — only a script calling `dxfToDwg` with an R12 text got the empty file. | `s_shop2.js` step `5_dwg`: `flatR12.back.n === 0` while the R2000 flat round-trips with all 11 entities (both runs). | `anvil/ui-commands.js` `dxfToDwg` passed any DXF through. | **Fixed**: `dxfToDwg` rejects an `AC1009` DXF before any request with "DWG is made from an R2000 DXF (AC1015); this DXF is R12. Export it as R2000 first." Smoke step rfAI (no fetch is made). |

Not a finding but noted: a Cut-Extrude on the flange's sketch removes .0120 in³ where π · .25² · .0598 = .0117 (the
body is re-facetted by the boolean, so the bend cylinder's chords lose a little volume — the known facet effect, not the
cut); the tapped callout's two SolidWorks lines (`Ø.201 THRU ALL` / `1/4-20 UNC - 2B THRU ALL`) come back as one `text`
joined with a space — not checked on paper, so not called a bug.

## What worked (key numbers)

- **Convert Entities + Normal cut + flat.** Sketch opened on the flange's outer face (plane `custom`, origin
  (−.1196, 0, 0), n = −X, `face: {feature: 3}`); Convert Entities took the face pick (`Face<1>`), the three converted
  lines carry On Edge relations; a Ø.5 circle at the face centre (3, .8098) and Cut-Extrude: the PM opens with **Normal
  cut checked by default** on a sheet-metal part, Through All; the feature serialises as
  `p.cut(…, { throughAll: true, reverse: true, normalCut: true })`. Flat pattern: 6 loops, the cut at **u = −.8311,
  v = −3, r .25** = −(1.5213 − (1.5 − .8098)), i.e. .6902 from the flange leg's far edge, exactly where the hole sits
  on the formed flange (Outer Virtual Sharp). Kernel test rfAI pins this.
- **Circular Sketch Pattern.** A polygon as the Polygon tool now makes it (six lines, construction circle r .25,
  Coincident chain, one `polygon` relation): all seven selected, Circular Pattern PM (centre 0,0, 360°, equal spacing,
  4 instances, radius read from the seed 2.25) → 21 added entities, four hexagons with sides .25 and their construction
  circles at (2,0) (0,2) (−2,0) (0,−2), `pattern` relation, sketch Under Defined (dof 3), no errors; script round
  trip keeps `.rel("pattern", …, {pat: {circ: true, m: 7, inst: [1,2,3]}})`. An exploded straight slot (line, arc,
  line, arc, construction centreline; Tangent / Equal relations): 15 added entities, end arcs r .1875 at (±2.5, 0)
  (±1.5, 0) (0, ±2.5) (0, ±1.5); a .1 Boss-Extrude of the four slots is .194 in³ = 4 · (1 × .375 + π · .1875²) · .1.
- **Hole Wizard on the 16 ga sheet.** Standard ANSI Inch by default on an inch part; Ø.281 (1/4) Clearance Hole,
  1/4-20 UNC Tapped Hole (#7 drill), CSK for 1/4 Flat Head Screw, all through; no errors. Flat pattern holes at
  r .1406 / .1005 / .2015 (Ø.281, Ø.201, and the countersink's far-side Ø.403). Drawing: Standard 3 View, hole
  callouts by pick `Ø.281 THRU ALL` and `Ø.201 THRU ALL 1/4-20 UNC - 2B THRU ALL`; Model Items into the Top view
  inserts the hole-location and size dimensions ("Model Items inserted into 1 view"; the hole callouts themselves:
  finding 3). Smoke steps rfAI.
- **Insert DXF of Anvil's own flat.** `flat_R12.dxf` (1800 chars, AC1009) and `flat_R2000.dxf` (3984 chars, AC1015)
  into a new inch part: the DXF/DWG Import PM reads "11 entities to import, 2 texts as Etch Sketch Text", File units
  Inches, × 1, layers OUTLINE (4) HOLES (4) BEND (1) NOTES (2); ✓ → 5 lines, 4 circles, 2 texts; a .0598
  Boss-Extrude gives **4.119 in³, the part's own volume**, bbox 11.5213 × .0598 × 6 — same blank, same four holes,
  both versions. Smoke step rfAI.
- **The DWG leg.** Flat R2000 → `dxf2dwg` (LibreDWG) 2942 bytes `AC1015` → `dwg2dxf` → 11 entities again: the four
  circles at (2.5213, 1) (2.5213, 5) (10.5213, 1) (10.5213, 5) r .1405, extents 0..11.5213 × 0..6, units inches,
  no warnings. Drawing (Standard 3 View + flat view with bend notes, 5 Model Items dimensions) R2000 DXF 34 491 chars
  → DWG 17 909 bytes → back 56 183 chars: the 5 DIMENSIONs read back with the same texts (`10.120`, `1.500`,
  `6.000`, `4X %%c.281`, `R.060`), the 11 layers (0, SHEET, FRONT, TOP, RIGHT, ISOMETRIC, FLAT_PATTERN, BEND_UP,
  DIMENSIONS, ANNOTATIONS, BEND_NOTES) are all there; LibreDWG's reader writes the dimension blocks out exploded
  (LINE 21 → 162, 8 SOLID arrowheads, TEXT 20 → 37), which is its way of writing, not lost data.

## Tests added

- `anvil/tests/kernel-tests.html` block rfAI: the Normal cut on the Edge Flange face in the flat pattern (size, 6
  loops, the cut at u = −.8311 r .25, the blank hole at u = 1).
- `anvil/tests/ui-smoke.html` block rfAI: Hole Wizard clearance / tapped / CSK on the 16 ga inch sheet and their flat
  radii; the hole callouts and Model Items callouts on the drawing; Insert DXF of the flat (R12 and R2000) and the
  re-extruded volume; `dxfToDwg` refusing an R12 DXF without a request.
