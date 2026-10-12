# Sketch tab fidelity audit — SolidWorks 2024 vs Anvil (e8707d2), 2026-10-08

Lane: sketch fidelity checks (audit only, no app file edited). Every observation below was made on today's code
(`e8707d2`) in headless Chrome driven over the DevTools protocol with **trusted** input
(`Input.dispatchMouseEvent` with `buttons: 1` while a button is held, `clickCount: 2` double-clicks, right-clicks,
`Input.dispatchKeyEvent` key-downs that type into the page), the way a SolidWorks user drives the program: ribbon
buttons and flyout ▾ menus clicked, values typed, Enter / Tab / Esc / Ctrl+Z pressed. Parts were new **inch** documents
(IPS), sketches on the Front plane or on a model face at a known zoom (40–110 px per inch). The driver and the
scenario scripts (`drv.js`, `common.js`, `s_*.js`, `v_*.js`, `golden_*.js`) live in the session scratchpad, not in the
repository. Every finding was reproduced at least twice (two runs, or a UI run plus a direct engine run); a single
flaky observation was not reported.

## Findings

Severity: **blocker** (silently wrong geometry or data), **major** (a core SolidWorks workflow fails or behaves
differently), **minor** (a difference a SolidWorks user notices and works around), **cosmetic**.

| # | Sev. | Tool | Expected (SolidWorks 2024) | Actual (Anvil, e8707d2) | Repro | Likely at fault | Proposed fix |
|---|---|---|---|---|---|---|---|
| 1 | blocker | Smart Dimension / Modify box (any line with two Smart Dimensions) | A line dimensioned by its length **and** its horizontal (or vertical) run: editing one dimension keeps the other driving value; the free direction changes. | The other dimension on the same line silently takes a new value: the line is scaled along its own direction. Length 3.606 → 3.7 with a driving horizontal 3.000 gives a horizontal of 3.0786 (should stay 3.000, rise 2.166); horizontal 3 → 2.5 with a driving length changes the length to 3.2016. Both dimensions still report "ok", so nothing warns. Same for len + dy. Rectangles, slots, ellipses, arc slots are not affected. | Sketch: line (0,0)–(3,2). Smart Dimension: click the line, place off its side (length 3.606); click it again, place above (3.000). Double-click 3.606, type 3.7, Enter → the 3.000 now measures 3.079. Engine: `S.setDim({entities:[{t:'line',x1:0,y1:0,x2:3,y2:2}],dims:[{e:0,k:'len'},{e:0,k:'dx'}],rels:[]}, 0, 3.7)` → dx 3.078586. | `sketch-solver.js` `setDim`: `K.setDimValue(e, dim, v)` moves the entity first and only *then* the other Smart Dimensions are taken "at the value the geometry has when the solve starts"; the slot is the only type whose sibling dimensions are recorded before the guess (line 1024). | Record every other non-driven dimension on the same entity **before** the guess, for all entity types: `(sketch.dims\|\|[]).forEach(function (o, j) { if (j !== index && o.e === dim.e && !o.driven) opts.dimTargets[j] = K.dimValue(e, o); })` (drop the `e.t === 'slot'` condition). Checked in Node: len → 3.7 keeps dx 3.000000000 (dy 2.165641), dx → 2.5 keeps len 3.605551275, an infeasible dx 4 is refused. |
| 2 | major | Modify box | ✓ / Enter with the value untouched keeps the dimension's exact value (the box only *shows* it at the display precision). | The box shows the value rounded to 4 decimals and ✓ / Enter (and a click elsewhere, which commits on blur) writes that rounded value back: a line of √13 = 3.6055513 becomes 3.6056, a circle of Ø0.246913578 becomes 0.2469; the status bar says "Dimension set to .247 in." and an undo step is made. The ✓ tooltip reads "keep the value and close". | Line (0,0)–(3,2), Smart Dimension, place, press Enter → length 3.6056. Circle r 0.123456789: Smart Dimension, Esc, double-click Ø.247, click ✓ → r 0.12345. | `ui-sketch.js` `openDimEdit` (`dimInput.value = String(Math.round(value * 1e4) / 1e4)`) with `closeDimEdit` comparing the parsed text against the unrounded `ed.value` (1e-9). | Keep the text shown (`dimEditing.text`) and treat an unchanged text as no change in `closeDimEdit`; or show the value at full precision (`+v.toPrecision(12)`). |
| 3 | major | Select tool + Delete (circle, arc, slot, arc slot, polygon) | Click an entity, press Delete: it is deleted (its PropertyManager shows, the keyboard stays with the graphics area). | For circles, arcs, slots and polygons the PM grabs the keyboard (Center X focused and selected); Delete blanks the Center X box and the entity stays. Lines, rectangles and points delete as expected. | Click a hole's edge, press Delete → the Circle PM's Center X box is empty, the circle is still there (twice; also arc, slot, polygon). | `ui-sketch-curves.js` `entityPM` (line 379) opens the PM without `noFocus: true`, so `ui-commands.js` `focusFirstField` focuses Center X (Line / Rectangle / Point PMs pass `noFocus`). | Add `noFocus: true` to the `UI.openPM` call in `entityPM`. |
| 4 | major | Select tool, multi-selection (Ctrl / Shift + click, box) | Two or more sketch entities selected: the *Properties* PM opens with Selected Entities, Existing Relations and **Add Relations** (Parallel, Equal, Concentric …) — the usual way to add a relation; the context toolbar offers the same. | Ctrl- or Shift-clicking a second entity (or a box selection) closes the PM and shows nothing; the right-click menu has only *Add Relation…*. The user has to click *Add Relation* on the ribbon (which then offers the right buttons). | Click a line, Ctrl+click another line → no PM (three runs: Ctrl, Shift, box). | `ui-select.js` `sketchSelectClick` (`UI.closePM(); setSelection(…)`) and the box-select end. | After a selection of ≥ 2 sketch items with no command open, open the Add Relations PM (titled *Properties*) on the selection (`UI.cmdAddRelations()` already takes a preselection). |
| 5 | major | Line (start on a circle or arc) | The line starts where you click on the curve (Coincident on it); Tangent is added only when the end or the direction makes the line tangent. | A start clicked on a circle slides round the curve to the tangent point from the cursor (Mastercam *Line Endpoints ▸ Tangent*): clicked at 30° on a Ø3 circle, the line starts 1.00 in away, with Coincident + Tangent. Documented in the README, but a SolidWorks user drawing from a point on a hole edge gets a different line. | Circle (7,0) R1.5; Line: click (8.299, 0.75) on it, click (9, 3) → start (8.481, −0.237) (twice). | `ui-sketch.js` `inferPoint` / `tangentStart` / `sliding` (r15/tanslide15). | Make the slide opt-in (T toggles it on, or a *Sketch Settings* option, default off); keep the SolidWorks start-where-clicked default. |
| 6 | minor | Select tool on an end point | Clicking a line's end point selects the **point** (Point PM: X / Y, Existing / Add Relations). | The whole line is selected (Line Properties); a point can only be picked inside Add Relations / Smart Dimension. | Line (−5,−2)–(−3,−1): click exactly on (−3,−1) → Line Properties (twice). | `ui-sketch.js` `sketchClick` → `UI.pickEntity`. | Try `UI.pickSketchRef` for end / centre points within 9 px first and open a Point PM for the ref. |
| 7 | minor | Inference: line across a centerline | SolidWorks never infers Symmetric while sketching (only Mirror, Dynamic Mirror and Add Relations make it); a level line gets Horizontal only. | A line whose ends are mirrored about a centerline gets **Symmetric and Horizontal**. | Construction line x = 10; Line (8.5,−2) → (11.5,−2) → `symmetric 6.p1/6.p2/1`, `horizontal 6` (twice). | `sketch-solver.js` `inferCandidates` → `symCandidates`. | Leave Symmetric out of the drawing-tool inference (keep it for Dynamic Mirror / paste), or put it behind an option. |
| 8 | minor | Inference after a click | Relations are inferred only for the points you clicked / snapped. | Inference is geometric after the fact: every point of the new entity that happens to lie on a curve gets a Coincident. A corner rectangle started on a line gets Coincident for **both** top corners (its edge lies on the line), tying the line to the rectangle edge. | Line (−1,0)–(6,0); Corner Rectangle (1,0)-(3,−1.5) → two Coincidents `v2/0`, `v3/0` (twice). | `sketch-solver.js` `inferCandidates` (all `pointRefs` of the new entity). | Limit inference to the points the tool placed (pass the snapped refs from `placePoint`). |
| 9 | minor | Smart Dimension with a preselection | Select a circle (or line), click Smart Dimension: the dimension is already on the cursor, the next click places it. | The preselection is dropped; the tool starts empty. | Click a circle, Sketch tab ▸ Smart Dimension → `sel: []`, no pending dimension (twice). | `ui-sketch.js` `setTool('dimension')`. | Start `toolState.dim` / `relDim` from a one- or two-item preselection. |
| 10 | minor | Line chain, right-click | Right-click while drawing opens the shortcut menu with *End Chain (double-click)*, Select … | The chain ends at once, no menu (documented). | Line: click, click, right-click → chain ended, no `.menu` (twice). | `ui-sketch.js` window `mouseup` (`finishChain()` for `button === 2`). | Show a small menu (End Chain, Select, Smart Dimension, Exit Sketch) instead. |
| 11 | minor | Dimension PM | *Primary Value* follows the Modify box and shows the document precision. | After a Modify-box edit the PM still shows the old value (3.60555127546 after 4; 2 after 2.2; 1.2 after 1.5), with 12 significant digits. | Smart Dimension a line, type 4, Enter → PM Value 3.60555127546 (three runs). | `ui-sketch-dims.js` `openDimensionPM` (`load()` only at open); `closeDimEdit` does not re-render it. | Re-render the open Dimension PM after a Modify commit; format Value with the dimension's precision. |
| 12 | minor | Sketch to DXF | Coordinates written with full precision (AutoCAD / SolidWorks write ~15 significant digits). | `kernel-script.js` `fmt` rounds to 6 decimals: shop-dimensioned sketches read back exactly, but non-terminating coordinates (a 3 point arc's centre −5.533333…, trig points) come back up to 6.7e-7 off (golden b). | Export a sketch with a 3 point arc through (1,−5), (3,−5), (2,−4.4): the centre reads back 3.3e-7 off. | `kernel-script.js` `fmt` (shared by the DXF writer). | Give the DXF writer its own formatter (`+n.toPrecision(15)`), keep `fmt` for STL. |
| 13 | minor | Corner / Center Rectangle, Polygon, Straight Slot | Four lines with 2 Horizontal + 2 Vertical (a polygon: lines + construction circle, a slot: lines + arcs + centerline); an edge selects as a line; Display/Delete lists the H / V relations, which can be deleted to skew it. | One entity each (`rect`, `crect`, `poly`, `slot`); an edge click opens the whole rectangle's PM; Display/Delete shows 0 relations; a relation on an edge comes through the edge ref only. (3 Point / Parallelogram rectangles are already four lines.) | Corner Rectangle; click an edge → *Corner Rectangle* PM; Display/Delete → "0 relations". | `ui-sketch-lines.js` rect tools; `kernel-sketch.js` entity model. | Explode on creation as the 3 point types do (keeping the PM's corner parameters), or expose the implicit H / V in Display/Delete and let an edge open Line Properties. |
| 14 | cosmetic | Status bar / sketch hint | The status bar describes the active command. | The status-bar message keeps the previous tool's prompt (after Bisector then Corner Rectangle it still reads "Select two lines: …"); Extend, Move and Rotate keep the Select tool's hint ("Click an entity to select it …") in the hint line. | Sketch tab ▸ Bisector, ✗, Corner Rectangle → status bar shows the Bisector prompt (twice); Extend Entities → hint is the Select hint (twice). | `ui-sketch.js` `setTool` (sets `#sketch-hint`, not `status-msg`); PM-based commands do not set `#sketch-hint`. | Set both from `TOOL_HINTS` / `spec.message` in `setTool` and `openPM`. |

## Golden scenarios

- **(a) Sheet-metal flat blank** (inches, all with the tools and typed values): Corner Rectangle 6 Tab 4 from the origin;
  four Ø.281 holes (Tab to Ø); a straight slot 1.000 c-c typed .375 wide; a notch (corner rectangle over the top edge,
  one Power-trim drag, two clicks); Horizontal Ordinate from the left edge (.500, 2.500, 2.500, 3.500, 5.500; 6.000
  driven) and Vertical Ordinate from the bottom edge (.500, 2.000, 3.500, 3.500; 4.000 driven); Fully Define Sketch
  (Baseline): it added 0 relations and 5 dimensions → **Fully Defined**, 13 entities, 34 relations (18 geometric,
  11 ordinate members, 5 baseline distances), 7 Smart Dimensions, 6 profile loops. **Pass.** (Ordinate members that
  over-define are made driven silently with a status-bar note, where Smart Dimension asks *Make Dimension Driven?* —
  noted, not a finding.)
- **(b) Sketch DXF read back with `dxf-import.js`**: the blank and the filleted / chamfered rectangle read back with
  **0** deviation in R12 and R2000 (16 and 9 entities, every line / circle / arc matched, units in). Sketches with
  non-terminating coordinates deviate up to 6.7e-7 (finding 12). **Pass for dimensioned shop sketches.**
- **(c) Script round trip** (`generateScript` → `runScript`, compared to 1e-12, key order free): the blank, the
  shapes sketch (all five rectangles, circles, the three arc tools, polygon, four slots, point), the fillet / chamfer
  sketch (virtual sharps, Equal, re-pointed dimensions), splines / ellipses / text, and an "everything" sketch with
  19 relation types (coincident, horizontal, vertical, parallel, collinear, perpendicular, tangent, concentric, equal,
  midpoint, symmetric, fix, coradial, intersection, distance h / r, angle, arclength, pattern, offset chain, ordinate),
  dimension properties (name, bilateral tolerance, precision, 2X / TYP, radius display, driven), a construction line,
  an infinite line, layers: **identical, sketch status preserved. Pass.**
- **(d) Inference, 20 cursor positions** (3 px off the exact spot, the way a hand lands): start / end on an end point,
  midpoint, line interior, circle centre, on a circle going radially, alignment with another point (no relation),
  H / V 5 px off, perpendicular from a slanted end, tangent from an arc end, the origin, a centerline midpoint,
  intersection of two lines, circle centred on an end / on another centre, rectangle corner on a line, Ctrl held:
  **17 / 20 match** SolidWorks' rule on re-check. Two first-pass differences were my test geometry (an X whose crossing
  was also both midpoints; a line continuing a segment that a previous case had made perpendicular). The real
  differences: Symmetric inferred across a centerline (finding 7) and both rectangle corners on the line (finding 8);
  the follow-up run found the tangent-sliding start (finding 5).

## What matched SolidWorks

- **Line / Insert Line**: PM opens at once (Message, Orientation, Options; Parameters for a set orientation); click-click
  chains, click-drag single line, double-click ends the chain without a stub and keeps the tool, closing on the first
  point ends it, Esc puts the tool down; Horizontal / Vertical / Coincident / Midpoint / Perpendicular / Tangent inference
  with glyphs while hovering; typed L Tab A (shop input `1-1/2`) with a driving length; A toggles a tangent arc; one undo
  step per segment; Insert Line Horizontal / Angle with Length / Angle parameters; Centerline is construction and Line
  after it is not; Midpoint Line; infinite length; Line Properties drives a selected line.
- **Rectangles**: all five types, the right click counts, Parallel / Perpendicular / Coincident for the 3-point types,
  construction diagonals and centre point for the centre types, typed W Tab H with driving dimensions, one undo step.
- **Circle / Perimeter / Tangent Circle, Centerpoint / Tangent / 3 Point Arc**: geometry exact (perimeter circle through
  its three clicks, arcs sweep the way the mouse moves, tangent arc Coincident + Tangent), typed Ø via Tab, TTR circle
  tangent to both with its R dimension.
- **Polygon** (inscribed default, sides set in the PM before drawing), **four slots** (widths exact, Horizontal for a
  level slot, the centre point with Midpoint for the centerpoint slot), **Point** (PM X / Y drive it).
- **Spline** (double-click ends, the tool stays; click the first point closes; Esc ends and puts the tool down),
  **Ellipse / Partial Ellipse** click sequences, **Text** (typed in the PM, preview at the cursor, placed on ETCH).
- **Sketch Fillet / Chamfer**: immediate on a corner click, PM stays open, first fillet gets R, later ones Equal,
  virtual sharps keep the rectangle's dimensions (a chamfered dimensioned rectangle stays fully defined), one undo step
  per fillet.
- **Trim** (Power trim drag, Trim to closest, Corner, Trim away inside / outside) with Collinear / Coincident kept,
  **Extend** (Coincident at the target), **Split / Join**.
- **Offset** of a closed chain (true rectangle, Offset relation, driving distance), **Convert Entities** (a face click
  brings its loops, On Edge, Fully Defined), **Mirror Entities** (preselection goes to *Entities*, the centerline to
  *Mirror about*, Symmetric), **Dynamic Mirror** on / off, **Linear / Circular Sketch Pattern** (Pattern relation,
  spacing / radius / angle dimensions), **Move** (From / To, closes after the move), **Rotate** (centre click + angle),
  **Scale**.
- **Smart Dimension**: length off the side, horizontal above, vertical beside, Ø for circles, R for arcs, distance
  between parallel lines, angle by quadrant (135°), point-to-line, two points horizontal; Modify box opens with the
  value selected, Esc keeps the dimension and the old value, ↑ / wheel step 0.1 in with live preview, Enter is one
  undo step, shop input (`10mm` in an inch part); *Make Dimension Driven?* on an over-defining dimension; the tool stays
  active; click selects, double-click edits, Delete deletes a dimension. Horizontal / Vertical Dimension, ordinates.
- **Add Relations** (the right buttons for the pick), **Display/Delete Relations**, **Fully Define Sketch** (Baseline,
  Chain, Ordinate), **Construction Geometry** on a selection (undoable), box selection, Ctrl+C / Ctrl+V with relations
  and dimensions (placed at a click), **Insert DXF** (the import PM; the blank's DXF comes back with 0 deviation and
  Coincidents), **Check / Repair Sketch**, **Levels** (DXF layers become levels), **Undo / Redo** granularity.

## Known leftovers (from SESSION_LOG / QUEUE, not re-reported)

Smart Dimension to a text's insertion point; ordinate edit in an under-defined sketch moving the whole sketch; box
selection on hidden layers; relation glyphs crowding small entities; Smart Dimension to a curved model edge (one facet);
Dynamic Mirror / arc-slot snap implemented as wrappers; renaming in the old Layers PM.

## Tests added (`anvil/tests/ui-smoke.html`, block `rfD`, before `// ---- runner`)

- `rfD/blank` — golden (a) end to end in an inch part with the tools and typed values, then the DXF (R12 / R2000) read
  back exactly and the script round trip identical.
- `rfD/dims` — Smart Dimension of a slanted line by cursor position (length / horizontal / vertical, *Make Dimension
  Driven?*), Esc in the Modify box keeps the old value with no undo step, ↑ steps a Ø by 0.1 in with a live preview and
  Enter is one undo step. (It deliberately avoids findings 1 and 2.)

## README

- *Sketch tab ▸ Spline, Ellipse, Text*: the "Not yet" line still said Text was greyed and splines could not be trimmed,
  carry points or Smart Dimensions — now only Style Spline.
- *Sketch tab ▸ Tools*: Intersection Curve and Dynamic Mirror are no longer greyed; the Trim flyout also has Split /
  Join.
- *The workspace*: the Sketch tab's contents and flyouts (Offset is its own button, not in the Convert flyout).
- *Sketch relations ▸ Construction geometry*: a level line mirrored about a centerline gets Symmetric **and** Horizontal.
- *Headless*: the ui-smoke count.

## Suites (this worktree, e8707d2 + the two test steps and README edits)

- `node anvil/headless/anvil.js test`: **976 / 976** (before and after).
- `node anvil/headless/ui-smoke.js http://localhost:8864/tests/ui-smoke.html`: **449 / 449** (447 + the 2 `rfD` steps;
  the `rfD` pair also passed twice on its own with `?only=rfD`).
- Golden (b) / (c) were run under Node with `headless/load.js` (`DxfImport.parse`, `Kernel.generateScript` /
  `runScript`, `SketchSolver.analyze`).
