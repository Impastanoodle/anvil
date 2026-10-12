# Sheet-metal workflow fidelity audit — SolidWorks 2024 vs Anvil (4ea5f43), 2026-10-12

Lane K (commands). Every observation below was made on today's code (`4ea5f43`) in headless Chrome (1600 × 1000)
driven over the DevTools protocol with **trusted** input (`Input.dispatchMouseEvent`, `Input.dispatchKeyEvent` key-downs
that type into the page), the way a SolidWorks user drives the program: ribbon tabs and buttons clicked, a Corner
Rectangle drawn by a click and typed `4 Tab 3 Enter`, edges picked by clicking them in an isometric view, values typed
into the PropertyManager fields, check boxes and the icon buttons clicked, ✓ clicked, Ctrl+Z pressed. Parts were new
**inch** documents (IPS). The driver and scenario scripts (`drv.js`, `common.js`, `s_*.js`) live in the session
scratchpad, not in the repository. Every finding was reproduced at least twice (two runs; the PM clipping also in a
third run before and after the fix). A single flaky observation was not reported.

The run was time-boxed by the head (about 20 minutes to wrap up), so the audit covers the PropertyManagers and the
flat sizes of Base Flange/Tab, Edge Flange (all positions, three length references, 45° / 90° / 135°, reverse, Custom
Bend Allowance), Miter Flange, Hem (Open, Closed), Jog, Sketched Bend, Cut-Extrude (Normal cut), the Sheet-Metal
parameters, Flatten and the flat DXF. **Not audited this round**: Hem Tear Drop / Rolled, Jog Material Inside /
Outside, bend reliefs on a partial edge, the bend table and gauge table through the PM (the earlier `p9-bend` smoke
steps cover them through the DOM), Edit Feature of a flange from the tree, the flat-pattern drawing (bend lines, bend
notes, bend table, overall dimensions — drawing lane), the DXF download itself (the DXF text was checked through
`anvil.dxfFlat()`), and the ribbon's placement against a SolidWorks 2024 screen.

## Findings

Severity: **blocker** (silently wrong geometry or data), **major** (a core SolidWorks workflow fails or behaves
differently), **minor** (a difference a SolidWorks user notices and works around), **cosmetic**.

| # | Sev. | Area | Expected (SolidWorks 2024) | Actual (Anvil, 4ea5f43) | Repro | Likely at fault | Proposed fix / status |
|---|---|---|---|---|---|---|---|
| 1 | major | Every PropertyManager taller than the panel (Edge-Flange, Miter-Flange, Hem, Jog, Cut-Extrude …) | The PM scrolls; every group shows all its rows. | Each group **shrinks** to make the whole PM fit the panel and clips its last row under the next title: in the Edge-Flange PM the Message is cut mid-sentence, *Clear selection*, **Reverse direction** and the *Sheet metal parameters…* button are hidden (the Reverse check is not even reachable by the mouse: `elementFromPoint` at its box returns the "Flange Position" title). In the 1000 px window every group lost 6–30 px; in the 560 px smoke frame nearly every row after the first is hidden. | Sheet Metal ▸ Edge Flange on a 16 ga 4 × 3 base: `.pm-group` *Flange Length* spans 464–555 px, its `.pm-fields` 489–586; clicking the Reverse direction check hits the next group's title (three runs). | `style.css` line 838 (`.pm-group { overflow: hidden }`, the 2026-10-08b polish) inside `#pm { display: flex; flex-direction: column }`: a flex item with `overflow: hidden` may shrink below its content. | **Fixed**: `#pm > * { flex: none; }` (groups, Message box, head and actions never shrink; the PM scrolls). Smoke `rfK/pm`. |
| 2 | major | Sheet Metal ▸ Base Flange/Tab with no sketch | The PM asks for a plane / planar face, the sketch opens, and *Exit Sketch* brings the Base Flange/Tab PM back on that sketch. | A toast *Draw the flange profile in a sketch first.* and nothing opens; the user has to go to the Sketch tab, pick a plane, draw, exit, come back. | New inch part, Sheet Metal tab ▸ Base Flange/Tab (twice). | `ui-commands.js` `cmdBaseFlange` (`if (f.sketch == null) { UI.toast(…); return; }`). | **Fixed**: the command opens a plane picker (the Sketch PM's pick plus Front / Top / Right buttons), starts the sketch and sets `App.pendingAfterSketch` so *Exit Sketch* reopens Base Flange/Tab; an empty sketch is discarded and nothing reopens. Smoke `rfK/base`. |
| 3 | major | Edge Flange ▸ Flange Position default | *Material Inside* is the first and default position: the flange's outside face is flush with the base edge, so a 4 × 1.5 L keeps its 4 outside and unfolds to 4 + 1.5 − BD. | Default is *Bend Outside* (the bend sits beyond the edge, the part grows by R + T: 4.1196 outside on 16 ga, flat 5.51566 instead of 5.39606); the select lists Bend Outside first. The PM remembers the last accepted position in the session, so only the first flange of a session is affected. | Sheet Metal ▸ Edge Flange, pick an edge, Length 1.5, ✓ → flat 5.51566 (twice, 16 ga and 10 ga). | `ui-commands.js` `cmdEdgeFlange` (`position: 'bendOutside'` for a new flange; the message *Placement is Bend Outside*). | Not fixed this round: eleven `p9-bend` / `p9-*` smoke steps and the README examples assume Bend Outside for a new flange (4.12 + 1.5 − BD). Change the default to `'inside'`, order the select Material Inside / Material Outside / Bend Outside / Bend from Virtual Sharp (SolidWorks' icon order), update the message and those steps together. |
| 4 | major | Jog | A Jog is made from a **sketch line** on a face (Selections: the line, Fixed face), with Jog Offset (end condition, distance, Outside Offset / Inside Offset / Overall Dimension, Fix projected length), Jog Position and Jog Angle. | Anvil's Jog takes **edges** (Jog height, Flat length, Bend angle, Reverse, radius, Jog Position); a line sketched on the face cannot drive it. The geometry it makes is right (two 90° bends, BA .13526 each on 16 ga, UP then DOWN). | Sheet Metal ▸ Jog: the PM asks for edges (twice). | `kernel-sheetmetal.js` `buildJog` (edge based), `ui-commands.js` `cmdEdgeFlange(…, 'jog')`. | Kernel + commands: a `jog` feature taking `sketch` + `fixed` (as `sketchedBend` does) with `offset`, `offsetRef` (`outside` / `inside` / `overall`), `fixProjected`; keep the edge form for old parts. |
| 5 | minor | Hem ▸ Type default | *Closed* is the default hem type (first icon). | *Open* is preselected (the icons are in SolidWorks' order Closed, Open, Tear Drop, Rolled). | Sheet Metal ▸ Hem (twice). | `ui-commands.js` `cmdEdgeFlange` (`hemType: 'open'` for a new hem). | `hemType: 'closed'`; the hem smoke steps that assume Open set the type explicitly (check `p9-hem` before changing). |
| 6 | minor | Edge Flange PM groups | *Flange Parameters*, *Angle*, *Flange Length*, *Flange Position* (icon row + *Trim side bends*, *Offset*), *Custom Bend Allowance*, *Custom Relief Type*. | *Flange Parameters*, *Angle*, *Flange Length*, *Flange Position* (a select), *Miter*, **Auto Relief**, *Custom Bend Allowance*, *Sheet*, *Feature*. | Open the PM. | `ui-commands.js` `cmdEdgeFlange` groups. | **Fixed** the name: *Custom Relief Type*. Left: *Miter* and *Sheet* are Anvil extras (harmless); *Trim side bends* / *Offset* do not exist (kernel). |
| 7 | minor | Base Flange/Tab and Sheet-Metal PMs | Both have an *Auto Relief* group (Rectangle / Tear / Obround, relief ratio 0.5) — the sheet's default relief that every later flange uses. | No Auto Relief group; a relief is chosen per Edge Flange only (None default). | Open either PM. | `ui-commands.js` `sheetGroups`; the kernel has no sheet-level relief default (`kernel-sheetmetal.js` reads `relief` per flange). | Kernel: `model.sheet.relief` (`'rect'` / `'obround'`, `reliefRatio`) as the default of a flange without its own; UI: the group in `sheetGroups`. |
| 8 | minor | FeatureManager tree of a sheet-metal part | *Sheet-Metal* (the sheet parameters; double-click opens the Sheet-Metal PM) above *Base-Flange1*, and *Flat-Pattern1* (suppressed) at the end that *Flatten* toggles. | Only *Base-Flange1* (with its sketch) and the later features; the sheet parameters are reached from the flange PMs, the Flatten dialog or Custom Properties; *Solid Bodies* names the body *Base-Flange1* too. | Make a base flange; read the tree (twice). | `ui-panels.js` `refreshTree` (the feature loop). | Add a `Sheet-Metal` row (icon `flange`, double-click → `UI.cmdSheetMetal`) before the first `sheetBase` feature and a `Flat-Pattern1` row (icon `flatten`, double-click → `UI.cmdFlatten`) after the last feature when `model.sheet` exists. |
| 9 | minor | Flatten | *Flatten* toggles the model into its flat state in the graphics area (the Flat-Pattern feature unsuppressed): the user measures, sketches and dimensions on the flat, and clicks Flatten again to fold. | A modal dialog with an SVG of the flat, the size, the bends and *Export DXF*; the 3D model does not change. The numbers in it are right (bend lines at the middle of each allowance, the shop note). | Sheet Metal ▸ Flatten (twice). | `ui-commands.js` `cmdFlatten`; needs the flat as a body / mesh from the kernel. | Kernel: `flatBody(model, build)` (the blank extruded by T from `flatPattern`); UI: a toggle that shows that mesh with the bend lines overlaid, the dialog kept as *Flat Pattern…* on the right-click menu. |
| 10 | minor | Cut-Extrude on a sheet-metal part | Direction 1 offers **Link to thickness** (checked by default on a sheet-metal part; end condition Blind, depth = T) next to *Normal cut* (checked) and *Optimize geometry*. | *Normal cut* is there and on by default (good); no *Link to thickness*; the default end condition is Through All (which gives the same cut on a flat sheet). | Sheet Metal ▸ Extruded Cut from a circle on the top face (twice). | `ui-commands.js` `cmdExtrude` (the *Sheet Metal* group). | A UI-only check *Link to thickness* that sets `end: 'blind'`, `depth: sheet.thickness` (stripped before the feature is stored; shown checked when editing a blind cut whose depth equals T). |
| 11 | minor | Miter Flange PM | Its own PM: *Miter Parameters* (edges, Use default radius, Gap distance), *Flange position* icons, *Start/End Offset*; the flange profile comes from a sketch. | The Edge-Flange PM with *Miter corners* preset (and the Gap under *Miter*); no Start/End Offset; edges, not a profile sketch. The corner geometry and the flat (4.896 × 3.896 for 1 in Material Inside flanges on two adjacent edges of the 16 ga 4 × 3) are right. | Sheet Metal ▸ Miter Flange (twice). | `ui-commands.js` `cmdMiterFlange`. | Its own group titles (Miter Parameters with the gap, Flange Position) over the same feature; Start/End Offset is kernel work. |
| 12 | cosmetic | Sheet Metal ribbon | … Extruded Cut, Simple Hole, Vent, **Unfold, Fold, Flatten**, No Bends, Insert Bends, Rip … (Flatten after Fold). | Flatten, Flat to DXF, Unfold, Fold, Rip. | Read the ribbon. | `ui-panels.js` `RIBBON['Sheet Metal']`. | Order Unfold, Fold, Flatten, Rip, with *Flat to DXF* (an Anvil extra) last. |
| 13 | cosmetic | Ribbon tab after a feature from a sketch | After ✓ on a Cut-Extrude started from the Sheet Metal tab while sketching, the CommandManager returns to the Sheet Metal tab. | It returns to *Features* when the sketch itself was started from the Sketch tab (the tab clicked during the sketch is not kept). | Sketch tab ▸ Sketch on a face, draw, Sheet Metal tab ▸ Extruded Cut ▸ ✓ → tab Features (twice). | `ui-panels.js` `setRibbonTab` / `tabBeforeSketch`. | Remember the last non-Sketch tab clicked while sketching as `tabBeforeSketch`. |

### Needs confirmation in SolidWorks (not reported as a finding)

- **Material Inside at an angle other than 90°.** Anvil trims the base back by R + T whatever the angle (`position: 'inside'`), so a 45° flange's outer virtual sharp sits (R + T) − (R + T)·tan 22.5° = 0.070 in inside the sketch edge on 16 ga (flat 5.39849; it would be 5.46855 with the sharp on the edge). If SolidWorks' Material Inside keeps the flange's outer face through the base edge at every angle, the kernel's existing `virtualSharp` trim ((R + T)·tan(θ/2)) is the right one for `inside` below 90°, and `outside` would be R·tan(θ/2) (`kernel-sheetmetal.js` `flangeLayout`). At 90° all three agree, so the shop's L brackets are unaffected.
- **Closed hem allowance.** Anvil folds a Closed hem at 0.02·T (BA = π·(0.02·T + K·T) = .08642 on 16 ga, K .44); a hem at radius 0 would give .08266. The README documents the choice and the Custom Bend Allowance overrides it.
- **New-part defaults** (thickness 1/16 in, R = T, K 0.5, flange length 0.75 in, hem length 0.375 in, gap T/2): SolidWorks' IPS defaults were not checked against a live install.

## Golden scenarios (hand-checked, all through the PropertyManagers with typed values and clicked edges)

K-factor BA = θ·(R + K·T); OSSB = (R + T)·tan(θ/2) up to 90°, R + T beyond; BD = 2·OSSB − BA; flat = A + B − BD.

| Sheet | Flange (edge x = 4 of a 4 × 3 Top base) | Hand | Anvil | |
|---|---|---|---|---|
| 16 ga T = R = .0598, K .44 | 90°: BA .135264, OSSB .1196, BD .103936 | | .13526 / .10394 | ✓ |
| | 1.5 Outer Virtual Sharp, **Material Inside** | 4 + 1.5 − .103936 = **5.39606** | 5.39606, bend line x = 3.948 (3.8804 + BA/2), `UP 90° R.060` | ✓ |
| | 1.5 OVS, Material Outside | 4 + T + 1.5 − BD = 5.45586 | 5.45586 | ✓ |
| | 1.5 OVS, Bend Outside | 4 + R + T + 1.5 − BD = 5.51566 | 5.51566 | ✓ |
| | 1.5 Inner Virtual Sharp, Material Inside | 4 + (1.5 + T) − BD = 5.45586 | 5.45586 | ✓ |
| | 1.5 Tangent Bend (90°), Material Inside | = OVS, 5.39606 | 5.39606 | ✓ |
| | 135°, 1.5 Tangent Bend, Material Inside | BA .20290, BD .03630 (OSSB R + T); (4 − .1196) + BA + (1.5 − .1196) = 5.46370 by the README's convention | 5.4637 | ✓ (convention) |
| | 45°, 1.5 OVS, Material Inside | BA .06763, BD .03145; Anvil's trim R + T: 5.39849 (sharp-on-edge reading: 5.46855) | 5.39849 | see *Needs confirmation* |
| | 1.5 Material Inside, Reverse direction | 5.39606, bend DOWN | 5.39606, `DOWN 90° R.060` | ✓ |
| | 1.5 Material Inside, Custom Bend Allowance BD .100 | 5.400 | 5.4, BA .1392 | ✓ |
| | Open hem L .5 gap .0299 (R .01495), Material Inside | (4 − R − T) + π·(R + K·T) + .5 = 4.55488 | 4.55488, `UP 180° R.015` | ✓ |
| | Miter 1 in Material Inside on x = 4 and z = 0 | 4 + 1 − BD by 3 + 1 − BD = 4.89606 × 3.89606 | 4.89606 × 3.89606, two UP 90° bends | ✓ |
| | Sketched Bend 90° Bend Centerline at x = 2.5 | flat stays 4 × 3, bend line x = 2.5 | 4 × 3, line 2.5 | ✓ |
| | Jog h .5, flat 1, Bend Outside | two 90° bends, BA .13526 each, UP then DOWN | 5.65093 × 3, UP / DOWN | ✓ (consistent) |
| 10 ga T = R = .1345, K .44 | 90°: BA .304230, OSSB .269, BD .233770 | | .30423 / .23377 | ✓ |
| | 1.5 OVS Material Inside / Outside / Bend Outside | 5.26623 / 5.40073 / 5.53523 | 5.26623 / 5.40073 / 5.53523, `UP 90° R.135` | ✓ |
| | IVS 5.40073; Tangent 5.26623; reverse DOWN 5.26623; custom BD .100 → 5.400 | | all as hand | ✓ |

- **Flat DXF** (`anvil.dxfFlat()` of the sketched-bend part with a Ø.562 hole): `$INSUNITS` 1 (inches), `$LUNITS` 2,
  layers OUTLINE (POLYLINE), HOLES (CIRCLE), BEND (LINE at x = 2.5 over the full height), NOTES (`UP 90%%d R.060`,
  rotation 90 along the bend line, centred), the sheet note on NOTES. R12 default, R2000 offered, Polylines or Lines
  and arcs. **Pass.**
- **Normal cut**: a new Cut-Extrude on a sheet-metal part has the *Sheet Metal ▸ Normal cut* check on; the stored
  feature carries `normalCut: true`; a cut drawn on the sheet's face goes through (reverse decided from the face).
  **Pass.**

## What matched SolidWorks

- **Base Flange/Tab PM**: *Sheet Metal Gauges* (Use gauge table, Table, Gauge, Edit gauge table…), *Sheet Metal
  Parameters* (Thickness, Bend radius, Reverse direction), *Bend Allowance* (Bend Table / K-Factor / Bend Allowance /
  Bend Deduction with the value); typed T, R, K land in `model.sheet`; the feature is `Base-Flange1`.
- **Edge Flange PM**: edge list with hover / remove, Use default bend radius (T), *Angle*, *Flange Length* with the
  Outer Virtual Sharp / Inner Virtual Sharp / Tangent Bend icon buttons (Outer Virtual Sharp default, as SolidWorks),
  Reverse direction, the four positions, *Custom Bend Allowance* (K-Factor / Bend Allowance / Bend Deduction / Bend
  Table) that wins over the sheet's; the status bar reads BA and BD live; the PM remembers the last accepted values
  in the session (per unit system); Ctrl+Z removes the flange.
- **Hem PM**: *Edges* (Material Inside / Bend Outside icons, Reverse), *Type and Size* (Closed / Open / Tear Drop /
  Rolled icons, Hem length, Gap distance; Angle / Radius for the curls), *Custom Bend Allowance*.
- **Sketched Bend PM**: *Bend Parameters* (sketch, Fixed face click, Bend position Bend Centerline / Material Inside /
  Material Outside / Bend Outside, Reverse, Bend angle, Use default radius), *Custom Bend Allowance*; starting it from
  the open sketch exits the sketch and opens the PM; the fixed-face click shows *Fixed face <1>*.
- **Sheet-Metal PM** (from the Flatten dialog, the flange PMs, Custom Properties): the same three groups plus *Flat
  Pattern ▸ Flat size* that follows the typed K / BD live.
- **DXF/DWG Output PM** for *Flat to DXF*: Export (Faces, Views, Sheet metal, Sketch; Geometry / Bend lines / Notes),
  Output format (DXF / DWG with the converter note, R12 / R2000, polylines or lines and arcs), File name.
- **Flatten dialog**: flat size, bend count, the sheet note, the SVG with bend lines and `UP 90° R.060` notes, Export
  DXF / Sheet metal parameters… buttons.
- Bend notes read as the drawings do (`UP 90° R.060`, `DOWN 90° R.135`, three places, no leading zero).
- Edge picks by a click on the edge in an isometric view (trusted mouse) land on the right edge; a second click on a
  picked edge removes it.

## Tests added (`anvil/tests/ui-smoke.html`, block `rfK`, before `// ---- runner`)

- `rfK/pm` — the Edge-Flange PM in the 560 px frame: no group's fields leave its box, the Message box shows its whole
  text, the Reverse direction check is what the mouse reaches, the *Custom Relief Type* group, the *Sheet metal
  parameters…* button inside its group (finding 1, 6).
- `rfK/base` — Base Flange/Tab on a part with no sketch: the plane picker, Top Plane opens the sketch, Exit Sketch
  brings the PM back, ✓ makes Base-Flange1 with the typed sheet; an empty sketch is discarded with nothing reopened
  (finding 2).
- `rfK/golden` — 16 ga golden through the PM: Material Inside 5.39606 (BA, BD, bend line at 3.948, `UP 90° R.060`),
  Material Outside 5.45586, Bend Outside 5.51566, Reverse → DOWN.

## README lines to add (not edited from this lane)

- *Sheet metal and flat patterns ▸ In the app*: "Base Flange/Tab with no sketch asks for a plane or face, opens the
  sketch and comes back when the sketch is exited (an empty sketch is discarded)." The Edge-Flange relief group is
  *Custom Relief Type*.
- *Headless*: the ui-smoke count (486 + 3).
- *Known limitations*: Jog is edge based (SolidWorks' is a sketch line); Flatten is a dialog, not a toggle of the model;
  no Auto Relief default on the sheet; no Sheet-Metal / Flat-Pattern tree nodes.

## Suites (this worktree, 4ea5f43 + the fixes and the rfK block)

- `node anvil/headless/anvil.js test`: **990 / 990** (no kernel file was edited).
- `node anvil/headless/ui-smoke.js http://localhost:8871/tests/ui-smoke.html`: `?only=rfK` 3 / 3; the full run
  **489 / 489** (486 + the 3 `rfK` steps).
