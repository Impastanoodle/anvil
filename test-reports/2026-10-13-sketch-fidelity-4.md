# Sketch fidelity audit 4 — the 2026-10-13 sketch features (lane BB)

Code audited: c02ddf3. Driven in headless Chrome over the DevTools protocol (`Input.dispatchMouseEvent` /
`Input.dispatchKeyEvent` on the real app at `http://localhost:8913/`, a scratch driver modelled on
`anvil/headless/ui-smoke.js`), inch part, Front plane. Each finding below was reproduced in two separate Chrome runs.
Time box 45 minutes: the features not reached are listed at the end, unaudited (not "matches").

Items already known from the 2026-10-13c "next" list are not re-reported (Insert DXF without `{ blocks: true }`, Edit
Block dropping relations on other instances, Sketch Fillet 3+ preview, Add Curvature Control value, Instant3D dots,
angle label placement).

## Findings

| # | Severity | Feature | SolidWorks 2024 | Anvil (c02ddf3) | Repro | Likely file / function | Proposed fix |
|---|---|---|---|---|---|---|---|
| 1 | major | Undo after Insert DXF | Insert DXF, Constrain All and Fully Define Sketch / Autodimension are three Ctrl+Z steps; one Ctrl+Z after Autodimension removes only its dimensions. | After an Insert DXF the sketch stays `App.sketchDirty`, so Constrain All and Autodimension push no undo step of their own: undo count stays 2 through all three commands, and **one Ctrl+Z after Autodimension empties the sketch** (rels 93 → 0, entities 32 → 0): the imported customer DXF is gone with the dimensions. After a hand-drawn line the same Fully Define is its own step (correct), so it is the import path. | New part; `UI.importDXFText(dxf, { ok: true })` (32 entities, undo 2); `UI.cmdConstrainAll({ fullyDefine: false })` (undo 2); `UI.cmdAutodimension()` ✓ (undo 2); Ctrl+Z → 0 entities. Two runs. | `ui-sketch-import.js` `undoStep` leaves `App.sketchDirty = true`; `ui-relations.js` `constrainAll` and `ui-sketch-dims.js` `cmdFullyDefineSketch.calculate` use `markDirty()`, which pushes only when not dirty. | Constrain All and Fully Define / Autodimension call `UI.pushUndo()` unconditionally (one step per command, as the drawing tools do); or the import clears the dirty flag after its own step as the drawing tools' commit does. |
| 2 | minor | Search Commands, Blocks | Typing "make block" or "insert block" in the search box lists Make Block / Insert Block (Tools ▸ Blocks); "block" lists every Blocks command. | `UI.searchCommands('make block')` and `('insert block')` return nothing; `('block')` returns only *Edit Block*; `('blocks')` nothing. | In a sketch: `UI.searchCommands('make block')` → `[]`. Two runs. | `ui-panels.js` Tools menu labels `Blocks ▸ Make…` / `Blocks ▸ Insert…`; `ui-app.js` `UI.searchCommands` synonyms. | Index those rows as *Make Block*, *Insert Block*, *Explode Block*, *Save Block* (SolidWorks' tooltip names) and add "block" synonyms. |
| 3 | cosmetic | Autodimension PM message | The drawing Autodimension tab's button is *Apply*. | The PM message says "Set the options, then **Calculate**." while the button in Autodimension mode is *Apply*; after Apply the status reads "Added 7 relation(s) and 31 dimension(s)" in a mode documented as dimensions only (the 7 are relations the dimension pass needed). | `UI.cmdAutodimension()` and read `#pm`. Two runs. | `ui-sketch-dims.js` `cmdFullyDefineSketch` `render()` / `calculate()` message. | Say "then Apply" in autodim mode; word the result as "31 dimensions (7 relations)". |
| 4 | minor | Constrain All | The dimension scheme and datum are chosen in Fully Define Sketch (Baseline / Chain / Ordinate); a shop that dimensions ordinate from the lower-left corner must be able to get relations without Baseline dimensions first. | `UI.cmdConstrainAll()` from the menu has no PM and also adds Baseline dimensions from the origin, so the sketch is black and a following Autodimension Ordinate has nothing left to do. Relations only is reachable only from script (`{ fullyDefine: false }`). | Insert the golden DXF, Constrain All → "1 Coincident, 17 Horizontal, 14 Vertical, 8 Tangent; 31 dimensions. Fully Defined." One run plus the code (`S.constrainAll`: `opts.fullyDefine !== false`). | `ui-relations.js` `constrainAll`. | Default to relations only from the menu, or a small PM with *Dimensions: Baseline / Chain / Ordinate / none*. |

## Matches SolidWorks (confirmed, two runs)

- **Golden workflow** (below): Insert DXF in inches, Constrain All, Autodimension with Ordinate both ways from the origin, Fully Defined, two driving changes, DXF R12 and R2000 out — every entity read back within 1e-6 (worst 0).
- **Autodimension PM** groups: Entities to Dimension (All / Selected, Apply), Horizontal Dimensions (on/off, Scheme Baseline / Chain / Ordinate, datum, Above / Below), Vertical Dimensions (Left / Right). Ordinate makes one set per direction (`o1` x, `o2` y, zero at the origin).
- **Modify box on an ordinate**: double-click the `11.000` label (real mouse) opens the box with `11`; Ctrl+A, `12`, Enter drives the blank to 12.000, still Fully Defined.
- **Sketch Settings** menu rows (Automatic Relations, Automatic Solve, No Solve Move, Enable Snapping, Detach Segment on Drag, Override Dims on Drag/Move) with checks; Automatic Relations off: a line clicked from the origin to (40, 0.3) gets no Coincident / Horizontal relation; Enable Snapping off: no inference snap, no relations.
- **Quick Snap Midpoint**: status "Quick Snap Midpoint: the next point snaps to midpoint only…", a click near (17, 3) lands on the midpoint (20, 0) with a Midpoint relation, then the quick snap is spent.
- **Jog Line**: PM *Jog Line*, status "click a line where the jog starts", three clicks give the five-segment jog with Coincident / Collinear / Parallel / Perpendicular, one undo step.
- **Make Block**: window-select a rectangle (real drag), Make Block PM (Block Entities, Block name, Insertion Point X / Y, click to place), one undo step; dragging an instance line moves the whole instance rigidly; Insert Block places an instance per click, Esc keeps them; R2000 DXF has the PUNCH-style BLOCK and one INSERT per instance.
- **Sketch Chamfer Dimension**: picks chamfer line then leg, label `5.000 X 45°` (inch), value measured along the leg.
- **Modify Sketch** PM: Translate ΔX / ΔY, Lower-left to origin, Center on origin, Rotate / Scale about sketch origin or a point, Flip H / V.

## Golden shop workflow — result: PASS (with finding 1)

Customer DXF built in the page (AC1009, `$INSUNITS` 1): 11 x 7.5 blank with a 1.0 x .5 notch, 4 x Ø.281 on a 2 in
square, two .25 x 1.0 slots (horizontal and vertical), a 0.5 x 0.25 PUNCH block inserted three times.
1. `UI.importDXFText(…, { ok: true })`: 32 entities (blocks exploded: the known `{ blocks: true }` item), 28 Coincident, inches kept.
2. Constrain All (relations only): 1 Coincident, 12 H, 12 V, 8 Tangent; Under Defined, 38 DOF.
3. Autodimension, both Scheme dropdowns set to Ordinate (select + change, as a user), Apply, ✓: Fully Defined, 0 DOF, two ordinate sets from the origin (the lower-left corner).
4. 11.000 → 12 through the Modify box (real double-click and keys); hole column 4 → 4.5 (`SketchSolver.setRelValue`): both holes in the column follow (Constrain All's Vertical), still Fully Defined.
5. `anvil.dxfOutput({ export: 'sketch', version: 'R12' | 'R2000' })` → `DxfImport.parse`: 32 / 32 entities each, worst deviation 0, units in, AC1009 / AC1015.
6. Ctrl+Z after step 3 wipes steps 1–3 at once (finding 1).

## Not audited in the time box

SketchXpert, Scan Equal, Segment, Equation Driven Curve, Split Entities on splines / ellipses / conics, Fit Spline and
Spline Tools, Parabola, Conic, Edit / Explode Block, Instant2D drag, the angle Modify box, Sketch Picture and its Scale
tool, Sketch Fillet on a selection (covered by rfAX), Path Length, Angular Running, free Ordinate, Detach Segment on
Drag, No Solve Move, Override Dims on Drag.

## Tests added

`anvil/tests/ui-smoke.html` block `rfBB`: the golden workflow (import, Constrain All, Autodimension Ordinate through the
PM selects, Fully Defined, two driving changes, R12 / R2000 read back within 1e-6) and Quick Snap Midpoint + Jog Line.
