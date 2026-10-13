# Sketch tab re-score: SolidWorks 2024 vs Anvil (93d1c23), 2026-10-13

Lane BD, 30-minute box, report only (no app or test file edited). This re-scores section 1 of
`test-reports/2026-10-13-completeness.md`, which audited 020136c, against today's main (93d1c23, after runs 2026-10-13,
13b, 13c and 13d). I checked these sources:

- **Code:** `ui-panels.js` `RIBBON.Sketch` and the part *Tools* menu (`partMenus`, `sketchMenuRows`); `sketch-solver.js`
  (`REL`, `ADD_ORDER`, `applicable`); `ui-sketch-tools.js`, `ui-relations.js`, `ui-sketch-blocks.js`,
  `ui-sketch-picture.js` and `ui-sketch.js` (`QUICK_SNAPS`).
- **Test coverage:** grep counts of each command in `tests/ui-smoke.html`.
- **Headless Chrome:** two runs over the DevTools protocol (server on port 8915, Chrome on 9415; the scratch driver
  `drv.js` is in the session scratchpad, not in the repo). They read the live ribbon and the *Tools* menu inside a sketch,
  ran 17 Search Commands queries, and drove Scan Equal, SketchXpert (on a real conflict) and Constrain All from the menu.
  No console errors.

Another agent is fixing four items in parallel, so they count as **in progress**, not missing:

- a Constrain All PropertyManager;
- crossing-box Stretch;
- spline curvature kept through Split / Trim;
- the leading zero on inch angle tolerances.

**Counting unit.** This report counts one unit per table row. Section 1 has 58 rows; 3 are n/a (3D Sketch, Silhouette /
Face Curves, Offset on Surface), which leaves 55 scoped rows. Counted this way, the 2026-10-13 table was
**34 present / 5 partial / 16 missing**. The "42 / 5 / 17" in that report split some multi-command rows into separate
units.

## 1. Rows whose status changed since the 2026-10-13 audit

| Row (SolidWorks 2024) | Old → new | Evidence |
|---|---|---|
| Ordinate Dimension (free direction), Angular Running, Path Length | missing → **present** | All three are in the Smart Dimension flyout and run `UI.cmdOrdinateFree`, `cmdAngularRunningDim` and `cmdPathLengthDim` (`ui-sketch-dims.js`). Smoke rfAQ covers them. |
| Chamfer Dimension (sketch) | missing → **present** | `chamferDim` in the flyout runs `UI.cmdChamferDim`. Label `5.000 X 45°`, both values drive (fidelity 4). |
| Autodimension | partial → **present** | `autodim` in the flyout plus *Tools ▸ Dimensions ▸ Autodimension*. The PM has All / Selected, Baseline / Chain / Ordinate per direction and a datum (fidelity 4, golden workflow). |
| Equation Driven Curve | missing → **present** | `eqnCurve` in the Spline flyout runs `UI.cmdEquationCurve`: Explicit y = f(x) or Parametric x(t), y(t). The equation is stored on the spline, and smoke rfAP covers it. |
| Parabola, Conic | missing → **present** | `tool: 'parabola'` / `'conic'` in the Ellipse flyout, stored as exact rational quadratics (`Kernel.conicData`). Trim and Split work on them. |
| Segment | missing → **present** | *Tools ▸ Sketch Tools ▸ Segment…* runs `cmdSegment` (`ui-sketch-tools.js`): Sketch points or Sketch segments, Number of instances. Smoke rfAP: 3 points at 2, 4, 6 on an 8-long line; an arc split in 3. Lines, arcs and circles only. |
| Jog Line | missing → **present** | *Tools ▸ Sketch Tools ▸ Jog Line* runs `UI.cmdJogLine`. Fidelity 4 confirmed the 5-segment jog with its relations. |
| Modify Sketch | missing → **present** | *Tools ▸ Sketch Tools ▸ Modify…* runs `cmdModifySketch` with Translate, Lower-left / Center to origin, Rotate, Scale, Flip H / V and drag (fidelity 4). |
| Scan Equal, Constrain All | missing → Scan Equal **present**; Constrain All **partial, fix in progress** | Scan Equal (headless) found three groups (3 lines L20, 2 lines L40, 2 circles R3), added 4 Equal relations and took 1 undo step. Constrain All from the menu (headless) opens no PM and also added 6 dimensions; the PM fix is in progress. |
| SketchXpert | missing → **present** | Headless run on a line that was both Vertical and Horizontal: Diagnose gave "Solution 1 of 2: delete Horizontal: Line1" with ◀ ▶ / Accept. Accept left the sketch Under Defined. Manual Repair is offered too. |
| Quick Snaps | missing → **present** | The flyout has the 14 snaps of SolidWorks' Quick Snaps toolbar (`QUICK_SNAPS`: Point … Grid, Angle). Fidelity 4 confirmed Midpoint. |
| Rapid Sketch | missing → **present** | The ribbon toggle runs `UI.toggleRapidSketch` (ui-sketch.js `rapidSketch`). |
| Sketch Picture | missing → **present** | `ui-sketch-picture.js` covers PNG / JPG / BMP, origin, angle, size lock, flip, transparency, a two-pick Scale tool and right-click Edit / Delete. 35 smoke references. |
| Tools ▸ Sketch Entities menu | missing → **present** | 35 rows run the ribbon items (`sketchMenuRows('Sketch Entities', …)`). All of them were enabled in the headless sketch. |
| Tools ▸ Dimensions menu | partial → **present** | 10 ribbon rows plus Fully Define Sketch. |
| Search Commands | partial → **present** | Headless: segment, scan equal, sketchxpert, modify sketch, stretch entities, constrain all, sketch picture and fit spline each find their command. Commands Anvil lacks return nothing, which is correct. |
| Instant2D | missing → **present** | The Sketch-tab toggle shows a ball and ruler on linear, radial, angle and two-entity dimensions as one undo step (13c). 6 smoke references. |
| Spline Tools | missing → **partial** | Present: Insert Spline Point, Simplify, Fit Spline, Show Handles, Show Curvature, Relax, Add Tangency Control, Add Curvature Control (driving), Show Inflection Points. Missing: *Show Minimum Radius*. |
| Blocks | missing → **partial** | Make, Edit, Insert, Explode and Save (`ui-sketch-blocks.js`) are present, plus rigid solver groups and DXF BLOCK / INSERT out and in. Missing: *Add/Remove* (entities into a block without Edit Block) and *Rebuild*. |
| Sketch Settings | partial → **partial (narrower)** | Present: Automatic Relations, Automatic Solve, No Solve Move, Enable Snapping, Detach Segment on Drag, Override Dims on Drag/Move, Ghost image, on-screen numeric input. Missing: *Create dimension only when value is entered*. *Snap to model* is in the View menu, not under Sketch Settings. |
| Tools ▸ Sketch Tools menu | partial → **partial (narrower)** | About 30 entries now. Missing: Make Path, Close Sketch to Model, Create Sketch from Selections, Align ▸ Grid/Origin (see section 3). Placement: Sketch Fillet / Chamfer are listed under *Sketch Entities ▸*; SolidWorks has *Tools ▸ Sketch Tools ▸ Fillet / Chamfer*. |

Notes on rows that were already present:

- **Convert Entities:** the tangent edge on a flange face was fixed on 2026-10-12i ("closes with the tangent edge").
- **Sketch Chamfer:** the *unverified* note is cleared. The PM has Angle-distance, Distance-distance and Equal distance
  (`ui-sketch-tools.js` lines 235–236).
- **Move / Copy / Rotate / Scale / Stretch:** crossing-box Stretch is in progress.
- **Spline:** curvature dropped by Split / Trim is in progress.
- **Smart Dimension:** the inch angle tolerance leading zero is in progress.

The live Sketch tab has 91 leaves. The only greyed ones are 3D Sketch and 3D Sketch On Plane (n/a).

## 2. Rows still partial or missing

| Row | Status | What exactly is missing | Value to a sheet-metal shop |
|---|---|---|---|
| Constrain All | partial (fix in progress) | From the menu it has no PM and adds Baseline dimensions as well as relations. A shop that wants ordinate dimensions from the lower-left corner gets baseline first. | **high** (the DXF-import clean-up step) |
| Spline Tools | partial | Show Minimum Radius | low |
| Blocks | partial | Add/Remove, Rebuild | low |
| Sketch Settings | partial | Create dimension only when value is entered; Snap to model sits in View instead of Sketch Settings | low |
| Tools ▸ Sketch Tools menu | partial | Fillet / Chamfer under the wrong group; the four commands in section 3 have no rows | low |
| *Selected Contours / Contour Select Tool* (new row) | missing | A feature PM cannot pick some closed regions of a multi-region sketch; every region is used. Grep finds no "Selected Contours" in `ui-commands.js`. | **medium** (customer DXFs with nested or overlapping regions; Levels mitigate it) |
| *Dissolve Sketch Text* (new row) | missing | Text cannot be turned into editable lines / arcs. Anvil's text is its own single-stroke font, so SolidWorks' outline text is not reproduced. | **medium** (laser-cut lettering, editing a letter) |
| *Replace Entity* (new row) | missing | No right-click Replace Entity that keeps downstream references. | low |
| *Equal Curve Length* relation (new row) | missing | `ADD_ORDER` has no such relation; Equal works on line–line and arc–arc only. | low |
| *Link Values* (new row) | missing | Dimensions cannot share a named value from the right-click menu. Global variables in Equations cover the need. | low |
| *Make Path* (new row) | missing | — | low |
| *Close Sketch to Model* (new row) | missing | — | low |
| *Create Sketch from Selections* (new row) | missing | — | low |
| *Align ▸ Grid/Origin* (new row) | missing | Modify Sketch's Lower-left / Center to origin covers the common case. | low |
| *Derived Sketch* (Insert ▸ Derived Sketch, new row) | missing | — | low |
| *2D to 3D* toolbar (new row) | missing | Front / Top / Right / Extrude from a 3-view customer DXF. | low |

## 3. New counts

| | Present | Partial | Missing |
|---|---|---|---|
| 2026-10-13 audit (55 scoped rows) | 34 | 5 | 16 |
| Today, the same 55 rows | **50** | **5** | **0** |
| Today, with the 11 rows the audit missed (66 rows) | **50** | **5** | **11** |

When the Constrain All PM fix lands, the 66-row count becomes **51 / 4 / 11**. None of the original rows is still
missing. What remains is the 4 small partials and the 11 newly listed commands. Only Selected Contours and Dissolve
Sketch Text are worth more than "low" to a sheet-metal shop.

## 4. Not yet tested against real SolidWorks

These areas match SolidWorks' command names and PropertyManager layout as far as the code shows, but nobody has
compared their results side by side with SolidWorks 2024:

- **SketchXpert solution sets.** Anvil offered 2 solutions for a line that is Vertical + Perpendicular + Horizontal;
  SolidWorks' count and order are unknown.
- **Autodimension placement.** Which dimensions it picks and where it places them, compared with SolidWorks' result on
  the same sketch.
- **Segment on splines or ellipses.** Anvil refuses them; not checked whether SolidWorks allows them.
- **Equation Driven Curve.** The sampling density and point count of the generated spline.
- **Fit Spline and Simplify Spline.** Tolerance semantics.
- **Parabola and Conic.** Click order and the rho field.
- **Quick Snaps Grid, Angle and Length** (only Midpoint was driven).
- **Rapid Sketch on model faces.** Switching planes between entities.
- **Instant2D.** Ruler increments and snapping.
- **Blocks against SolidWorks files.** `.sldblk` and DXF INSERT round trip with files written by SolidWorks itself.
- **Sketch Picture.** Autotrace (a SolidWorks add-in) is not offered.
- **Text.** Font set and outline vs single-stroke (see Dissolve Sketch Text).
- **Exact list of SolidWorks 2024 menu rows.** The *Tools ▸ Sketch Settings* and *Tools ▸ Sketch Tools* rows were
  checked from memory of SolidWorks 2024, not on a live seat. The four menu-only items above (Make Path, Close Sketch to
  Model, Create Sketch from Selections, Align) should be confirmed there.
