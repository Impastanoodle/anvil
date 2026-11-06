# Sheet-metal PropertyManagers vs SolidWorks 2024 (lane rfIU, 2026-11-05)

I compared each sheet-metal PropertyManager in `anvil/ui-commands.js` with SolidWorks 2024's, working from memory of
SolidWorks. SolidWorks was not opened because the user's copy was in use. Where I am not sure of SolidWorks' exact
wording or layout, the row says **(unsure)**. The ranking puts first the differences that slow down a SolidWorks user
most: a missing option they reach for every day, or an option that is in a different place.

Status: **fixed** = changed in this lane and covered by the smoke test `tests/smoke/rfIU.js`; **kernel** = needs new
kernel work, with the feature JSON field it would need (kernel-sheetmetal.js belongs to another agent); **UI later** =
UI-only, but left for a later lane.

## Ranked findings

| # | PM | Difference from SolidWorks 2024 | Status |
|---|---|---|---|
| 1 | Base Flange/Tab, Sheet-Metal, Convert (gauge table) | With *Use gauge table* on, SolidWorks fills the thickness and bend radius from the table and locks them. *Override thickness* and *Override radius* free them. Anvil filled them in but left them editable, so a stray edit quietly left the gauge. A gauge with several radii in the table had no radius list. | **fixed**: the boxes lock to the table. *Override thickness* / *Override radius* are UI-only checks, worked out on reopen by comparing with the table rows. A *Table bend radius* list appears when the table holds more than one row for the gauge, and it carries that row's K-factor or BD. |
| 2 | Edge-Flange | Flange Position order. SolidWorks: Material Inside, Material Outside, Bend Outside, Bend from Virtual Sharp, Tangent to Bend. Anvil started with Bend Outside. | **fixed** (order). Tangent to Bend: **kernel**, `position: 'tangentToBend'` in `flangeLayout`'s shift. SolidWorks shows these as icon buttons, Anvil as a list: **UI later** (p9-pm / rfK set them through the list). |
| 3 | Edge-Flange | Flange Length has a *Length end condition* (Blind / Up To Vertex) with Reverse Direction beside it, then the length, then the three references. Anvil had no end condition and put Reverse last. | **fixed** (order; a static "Blind" row). Up To Vertex: **kernel**, `lengthEnd: 'upToVertex', lengthVertex: [x,y,z]` (the length measured to the vertex along the flange, using the chosen `lengthRef`). |
| 4 | Edge-Flange | *Gap distance* is SolidWorks' name for the gap between flanges meeting at a corner. Anvil called it "Gap". | **fixed** (label; it still shows under *Miter corners*). SolidWorks has no *Miter corners* check: flanges on adjacent edges mitre on their own **(unsure whether 2024 shows Gap distance only when two edges meet)**. Making the mitre automatic is **kernel** behaviour (`miter` default true for multi-edge flanges). |
| 5 | Edge-Flange | "Use default bend radius" → SolidWorks: *Use default radius*. | **fixed** (as Jog, Miter Flange and Sketched Bend already had it). |
| 6 | Edge-Flange | Custom Relief Type order and set. SolidWorks: Rectangle, Tear, Obround, plus *Use relief ratio* / *Ratio*. Anvil: None first, no Tear, no ratio. | **fixed** (order: Rectangle, Obround, None). Tear: **kernel**, `relief: 'tear'`. Relief ratio on a custom relief: **kernel**, `reliefRatio` on the flange (today only the sheet's Auto Relief has a ratio; width / depth = ratio × T). |
| 7 | Edge-Flange | Flange Position ▸ *Trim side bends* and *Offset* (end condition + distance). | **kernel**: `trimSideBends: true`, `offset: { end: 'blind', distance }`. |
| 8 | Edge-Flange | Angle ▸ *Select face* with *Perpendicular to face* / *Parallel to face*. | **kernel**: `angleRef: { face: [x,y,z], mode: 'perpendicular' or 'parallel' }`. |
| 9 | Edge-Flange | *Edit Flange Profile* (sketch the flange's outline). | **kernel**: `profile` (a sketch id on the flange plane). |
| 10 | Hem | SolidWorks' Hem also has *Miter Gap*, *Custom Relief Type* (and *Edit Hem Width*). Anvil's Hem has Edges, Type and Size and Custom Bend Allowance. | **kernel**: the hem path of `flangeLayout` reads `f.relief` but `Builder.hem` drops it, and nothing has been tested. To check / add: `relief`, `reliefWidth`, `reliefDepth`, `miter` + `miterGap` on `hem: true` flanges. Then add the two groups (UI). |
| 11 | Hem | SolidWorks labels the hem length box *Length* **(unsure)**. Anvil says "Hem length". | Not changed: p9-pm, rfBW and rfBZ find the box by that label. |
| 12 | Jog | Jog Offset ▸ End condition is Blind / Up To Vertex / Up To Surface / Offset From Surface. Anvil: Blind only (static). Jog Position and Dimension position are icon rows in SolidWorks, lists in Anvil. | **kernel**: `offsetEnd: 'upToVertex' or 'upToSurface' or 'offsetFromSurface'`, `offsetTarget: [x,y,z]`. Icon rows: **UI later**. |
| 13 | Corners flyout | SolidWorks 2024: Closed Corner, Welded Corner, Break-Corner/Corner-Trim, Corner Relief. Anvil has Break-Corner and Closed Corner. | **kernel**: Welded Corner (`type: 'weldedCorner', faces, fillet, addTexture`) and Corner Relief (`type: 'cornerRelief', corners, reliefType: 'rect' or 'circular' or 'tear' or 'obround' or 'constantWidth', size, centeredOnBend`). The flyout row label "Break-Corner" (SolidWorks: "Break-Corner/Corner-Trim") is **UI later**: tests click it by the short name. |
| 14 | Break Corner | SolidWorks also has *Internal corners only* **(unsure that 2024 has it on Break Corner rather than Corner Trim)**. | **kernel**: `internalOnly: true`. |
| 15 | Closed Corner | SolidWorks 2024 also has *Narrow corner* and *Auto propagation*. Anvil's *Faces to match* is found automatically (static). | **kernel**: `narrowCorner: true`. Auto propagation: **UI later**, using `closedCornerLayout` to collect faces. |
| 16 | Miter Flange | *Trim side bends* shows "(not available)". | **kernel**: `trimSideBends`. |
| 17 | Lofted-Bend / Swept Flange | Lofted-Bend is on the ribbon but has no command. Swept Flange is missing. | **kernel** (whole features). |
| 18 | Insert Bends / Convert | SolidWorks' Insert Bends groups: Bend Parameters (fixed face, radius, *Ignore beveled faces*), Bend Allowance, Auto Relief, Rip Parameters. Convert also has *Keep body*, *Show callouts* and Rip Sketches. Anvil uses its own Corner Defaults / Corner Relief / Result groups. | **UI later**, with the agent who owns those PM lines. *Keep body*: **kernel** (`keepBody`). |
| 19 | Sheet Metal Gauges | SolidWorks picks a gauge table *file* (Browse…); Anvil keeps the table in the part (Edit gauge table…). SolidWorks shows the gauge as a drop-down in Sheet Metal Parameters (labelled Thickness / gauge), Anvil in the Gauges group **(unsure of 2024's exact layout)**. | Kept: the tests and users find *Gauge* by its label. Gauge-table files (Excel / .sldgtb import): **UI later**. |
| 20 | Bend Allowance | SolidWorks 2024 has *Bend Calculation* (a calculation table) as a fifth type. | **kernel**: `bendAllowanceType: 'calculation'`. |
| 21 | Auto Relief | SolidWorks: Rectangular, Tear, Obround (no None). Anvil adds None, which older parts need. | Tear: **kernel** (`sheet.relief: 'tear'`). |

Matched already, no change: Sketched Bend (Bend Parameters: fixed face, Bend position with Bend Centerline / Material
Inside / Material Outside / Bend Outside, Reverse, angle, Use default radius; Custom Bend Allowance); Jog (Selections,
Jog Offset with Outside Offset / Inside Offset / Overall Dimension and Fix projected length, Jog Position, Jog Angle,
Custom Bend Allowance); Miter Flange (Miter Parameters, Start/End Offset, Custom Bend Allowance, Custom Relief Type);
Rip (Rip Parameters, Change Direction, Rip gap); Unfold / Fold (Selections, fixed face, bends, Collect All Bends);
Closed Corner (Faces to Extend, Butt / Overlap / Underlap, Gap distance, Overlap/underlap ratio, Open bend region,
Coplanar faces); Break Corner (Break Corner Options, Chamfer / Fillet, Distance / Radius).

## Smoke steps (rfIU, 3 / 3, clicks on the real PM)
1. Base Flange/Tab ▸ Use gauge table ▸ 14 ga: T and R locked. Thickness, Reverse direction and Bend radius in that order. Override radius frees R, and 0.1 stays through a change to 12 ga. Accepted, the sheet is 0.1046 / 0.1, and no UI key reaches the feature. Sheet-Metal PM reopens with Override radius on; unchecking it puts back the table's R.
2. Edit gauge table… with two pasted 16 ga rows (R .03 K .40, R .06 K .45) shows *Table bend radius* with three rows. Picking .06 gives R .06 and K .45 (locked), and the PM reopens on that row.
3. Edge-Flange: Use default radius. Flange Length order is Length end condition (Blind), Reverse direction, Length, Measured from. Position order is inside / outside / bendOutside / virtualSharp. Miter corners shows Gap distance. Custom relief list is Rectangle / Obround / None. A Material Inside flange builds with no errors.

No existing smoke test pinned a label renamed here, so none was changed.


## Lane rfIY: flat-pattern export and Flat-Pattern1 (2026-11-05)

### DXF/DWG Output on a sheet-metal part (File ▸ Save As DXF / Sheet Metal ▸ Flat to DXF)
| SolidWorks 2024 | Anvil before | Now |
|---|---|---|
| Export: Sheet metal, Faces/Loops/Edges, Annotation views | Faces / loops / edges, Views, Sheet metal, Sketch | **fixed**: Sheet metal, Faces/Loops/Edges, Annotation views, then Sketch (Anvil's). The `data-key`s are unchanged. |
| Entities to export: Geometry (always), Hidden edges, Bend lines, Sketches, Library features, Forming tools, Boundary box **(unsure of the exact 2024 list and order)** | Geometry, Bend lines, Notes | **fixed**: an *Entities to export* heading, then Geometry, Bend lines, Sketches (the writer's `etch`: ETCH marking), Forming tools (layer FORM), and Notes (Anvil's bend notes and blank size). Each box changes the file. The writer ties FORM to `bendLines`, so the PM asks for both and drops the unwanted layer with `dropDxfLayers`. `anvil.dxfOutput` takes `etch` and `formingTools`. |
| Hidden edges | none | **kernel** (exportDXFFlat): `hiddenEdges`, the far-side outlines of forming tools on a HIDDEN layer. |
| Library features | none | **kernel**: no library features yet. |
| Boundary box | none | **kernel**: `opts.boundaryBox` → a rectangle round the blank on layer BOUNDARY (the box is already computed in exportDXFFlat). |
| Bend lines Up / Down as separate entities (layer mapping) | one BEND layer; the UP / DOWN direction is in the notes | **kernel**: `opts.bendLayers: 'split'` → BEND_UP / BEND_DOWN from `flat.bends[i].up`. |
| Corner reliefs (as their own entities) | relief notches are part of OUTLINE | **kernel**: tag relief segments in `flat.loops` and give them a layer option. |
| Preview window with Remove entity; Export options (one file per body / cut-list item) | no preview; one body | **UI later**: a preview using `flatSvg` (cmdFlatten) with click-to-remove needs the writer to take an entity filter (kernel: `opts.exclude: [entity ids]`). One file per body waits for multibody sheet metal. |

### Flat-Pattern1 ▸ Edit Feature
SolidWorks' Parameters group: Fixed face, Grain direction, Merge faces, Simplify bends, Show slit; Corner Options ▸ Corner treatment. Anvil already has Parameters with Fixed face and then Grain direction, so it matches that far. The kernel has no switch for the other four (`flatPattern` always merges and always straightens bends, and has no slits or corner treatment). Lane DK chose not to show greyed boxes for missing options (rfDC and rfDK assert it), so they are left out. **kernel**: `model.flatOptions = { mergeFaces, simplifyBends, showSlit, cornerTreatment }`, read in `flatPattern`.

### Leftover UI-only rows from the audit
- **fixed**: the Corners flyout row now says *Break-Corner/Corner-Trim* (rfCS and rfCP match it as a substring).
- **UI later**: Edge-Flange Flange Position, Jog Position / Dimension position and Sketched Bend Bend position as icon rows. p9-pm, rfK and rfDC set them through the lists, so switching them to icons needs those tests rewritten, not just a label changed.
- Hem "Hem length" (SolidWorks: Length, **unsure**) is kept.

### Smoke steps (rfIY, 3 / 3, real clicks)
1. Ribbon *Flat to DXF* on a part with a flange and a dimple: Export list order and names; Entities to export order; Geometry always on and greyed. ✓ writes FORM, BEND and NOTES. Unchecking Forming tools drops FORM and keeps BEND. Unchecking Bend lines drops BEND and keeps FORM and OUTLINE.
2. Double-click on Flat-Pattern1: Parameters group first, Fixed face before Grain direction, no dead boxes. Cancel changes nothing.
3. Corners flyout ▸ Break-Corner/Corner-Trim opens the Break-Corner PM.


## Lane rfJC: kernel options of lane rfIZ in the PMs (2026-11-05)
The following rows of the ranked table are now **done**:
- **#2** Tangent to Bend: in the list at 90° and up only.
- **#3** Up To Vertex: End condition list, vertex box, Normal to flange plane / Parallel to base flange.
- **#6** Tear and Use relief ratio / Ratio.
- **#7** Offset: Blind + distance. Trim side bends is still kernel work.
- **#10** Hem: Miter Gap group and Custom Relief Type.

`p.flange` / `p.hem` take the fields and `generateScript` writes them (kernel test group rfJC: the JSON build, the Builder build and the script round trip agree in fields and volume, 1e-12). Smoke rfJC, 4 steps with real clicks: each option is set in the PM, built, and shown again by Edit Feature.

Tests updated for the changed controls: in rfIU (this audit's own group), the Flange Length row is now the `End condition` list (the label was 'Length end condition', which `pmField('Length')` would have matched); Position adds tangentToBend; the relief list adds Tear.
