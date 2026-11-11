# Sketch flow: four shop profiles the SolidWorks way (lane sketchflow, 2026-11-11)

Four profiles were drawn in headless Chrome (1600 × 1000, inch part) with real input only: Chrome DevTools
`Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` on the ribbon, the flyouts, the viewport, the PropertyManager
boxes and the Modify box. The console was used only to read the results. No SolidWorks seat was used (the user's may be
open); "SolidWorks 2024" below is the documented / remembered behaviour, as in earlier reports.

1. **Gusset**: Line chain (0,0) → (6,0) → (6,1) → (2,5), **A** for a tangent arc back to (0,5), line home; Sketch
   Fillet R.5 on two corners, Sketch Chamfer .25 equal; Smart Dimensions typed as placed (origin → right edge 6,
   angle 45°, chamfer sharp height 1, arc R1.5); Equal / Collinear from the selection.
2. **Bracket blank**: Corner Rectangle 8 × 4, centerline midpoint to midpoint, Centerpoint Straight Slot, Ø hole,
   Linear Sketch Pattern ×3 at 1.5, box select + Mirror Entities about the centerline, Smart Dimension centerline →
   slot centre, a notch drawn then Power Trim drag across two edges, Extend to the centerline.
3. **Panel cut-out**: plate 10 × 8 × .25; Insert DXF outline, Offset Entities .25; Convert Entities of the plate's top
   edge; construction circle (Circle PM *For construction*), hole on it, Circular Sketch Pattern ×6 about its centre;
   Spline through 5 points, its handle dragged; Sketch Text.
4. **Edit session on (2)**: drag an under-defined corner, change a dimension by double-click, delete a relation in
   Display/Delete Relations, make a dimension driven, undo / redo after each, box select + Delete, copy / paste the
   slot, Exit Sketch and Edit Sketch again.

Tests: smoke group `rfKU` (6 steps, synthetic mouse / key events through the same handlers), kernel group `rfKU` (3).

## Findings, by how often a daily user hits them

| # | Finding | SolidWorks 2024 | Status |
|---|---|---|---|
| 1 | A line drawn level from its start to an edge (or arc) ended at the nearest point on the edge, 1–2 px off level, with Coincident only: no Horizontal / Vertical. Every "draw over to that edge" in a profile came out a hair off square and under-defined. | Both inferences hold: the point is where the level line crosses the edge; Horizontal + Coincident. | **fixed** (`ui-sketch.js` `inferPoint` step 2 → `curveAlign` / `curveAtCoord`: the H / V inference line through the previous point, else a woken point, crossing the line / circle / arc within the curve snap distance). Smoke rfKU 1. |
| 2 | No relation context toolbar: selecting entities only opened the Properties PM, so Equal / Collinear / Horizontal … needed a trip to the PM. | The context toolbar pops up by the pointer with the relations that apply (Make Equal, Make Collinear …). | **fixed** (`ui-select.js` `ctxBar`: one icon button per `SketchSolver.applicable` relation after a Select-tool click; a click adds it in one undo step; fades as the pointer leaves, gone at 140 px, on Esc, on the next press). The PM's Add Relations stays. Smoke rfKU 6. |
| 3 | No doubled distance: a Smart Dimension from a centerline to a point placed past the centerline still read the one-sided distance. Parts mirrored about a centerline (and revolve profiles) are dimensioned across. | Placed on the far side of the centerline the dimension doubles (linear diameter, shown with Ø). | **fixed** (`ui-relations.js` `relDimPlacement` / `doubledSide` / `relDimGeometry`: the distance runs from the point to its mirror image; `sketch-solver.js` `measure` / `relEquation` / `addRelation`: arc-condition entry `'dbl'` on the centerline ref holds twice the distance; script `.rel("distance", [...], { ac: ["dbl","c"] })` round-trips). Smoke rfKU 3, kernel rfKU 1–3. |
| 4 | Mirror Entities after a box select over a slot: the slot's own construction centerline was the only centerline in the selection, so it went straight into *Mirror about*; the part was mirrored about the slot's axis and the click on the real centerline was added to the entities. | The slot's centerline is part of the slot; Mirror about waits for the centerline the user picks. | **fixed** (`ui-sketch-tools.js` wrapper of `UI.cmdMirrorEntities`: a centerline whose end holds a selected arc's centre opens as an entity, Mirror about stays active). Smoke rfKU 2. |
| 5 | Spline handles: a selected spline showed no handles and nothing could be dragged; tangency was only reachable through the PM's Tangent Driving boxes. | Selecting a spline shows its handles; dragging one sets tangency direction and weight. | **fixed** (`ui-sketch-spline.js`: the selected spline draws its handles; press within 7 px of a tip and drag: Tangent Driving on at that point, angle follows the pointer, weighting scales with the handle length; one undo step). Smoke rfKU 4. |
| 6 | Sketch Text: clicking the place first and typing after placed nothing, and ✓ then dropped the typed text without a word. | Click to place and type, in either order. | **fixed** (`ui-sketch-text.js`: a click with no text yet marks the place, the preview shows there, ✓ places it). Smoke rfKU 5. |
| 7 | Centerline from the left side's midpoint to the right side's midpoint of a rectangle: the second end got Coincident (on the line), not Midpoint, because Midpoint there would be redundant with the inferred Horizontal. | Not checked on a seat. | left (the geometry is the same and fully held). |
| 8 | Dragging a rectangle corner of the edit session moved the un-dimensioned original slot and holes (they are Symmetric to copies about the centerline that moved). | Not checked on a seat; the solver has to move one of each pair. | left. |
| 9 | Sketch Fillet / Chamfer, Smart Dimension typing (line, angle quadrant, radius, point to sharp), Linear / Circular Sketch Pattern, Offset with dimension, Convert Entities, Power Trim drag, Extend, Display/Delete Relations, Driven toggle, box select + Delete, copy / paste, undo / redo of each step, exit / edit: all behaved as expected (one undo step each, status correct). | — | match |

## Notes for the next comparison
- The Sketch Text box keeps the last text for the session (Anvil's `toolVals`); SolidWorks starts empty. Not changed.
- The Circle PM *For construction* resets when the tool is put down (as SolidWorks).
- Harness traps (not app bugs): a CDP key with `text` must not also send a `char` event (each digit doubles); a
  relation row scrolled out of the Display/Delete Relations list is covered by the Delete All button.

## Round 2 (lane sketchflow2, 2026-11-11)

Four more sketches in headless Chrome (1600 × 1000, inch parts), real input only (DevTools `Input.dispatchMouseEvent` /
`Input.dispatchKeyEvent` on the ribbon, flyouts, tree, viewport, PM boxes and the Modify box); the console only read
results (and built the formed part of (b) by script). No SolidWorks seat was used.

1. **Flat blank with ordinate dimensions**: 10 × 6 outline by a Line chain with typed lengths (10, 5, 1, 1, 8, 1, 1,
   click home), 1 × 1 corner notches, hexagon cut-out, ellipse, 3 Point Arc Slot, Centerpoint Arc, Horizontal and
   Vertical Ordinate sets from the lower-left corner (redundant members came in driven, in parentheses), Fully Define
   Sketch for the rest: Fully Defined.
2. **Sketch on a formed part**: .060 sheet, 6 × 4 Base Flange + 2 in Edge Flange; Ctrl+7, click the wall's face,
   Ctrl+8 (Normal To), Sketch; model vertex / midpoint inference (labels), Offset Entities of the face and Convert
   Entities of the face, Ø.250 hole dimensioned to the left and top model edges, Linear Sketch Pattern ×3 at 1.5,
   Cut-Extrude (Link to thickness), Edit Sketch again, then the flange made 3 in long.
3. **Open profile for a Base Flange**: U profile by Line + **A** tangent arcs, Centerline, Symmetric (context
   toolbar), Equal arcs (context toolbar), a length typed `=W` (global variable), Link Values on two lengths.
4. **Trouble**: a conflicting length (Make Dimension Driven? ▸ Leave this dimension driving: Over Defined, red),
   Delete recovered it; Fully Define then drag (nothing moved); Delete of a dimensioned line; Check Sketch for Feature
   on the open profile; Repair Sketch on a .0005 gap and an overlapping line; F2 rename and Suppress in the tree.

Tests: smoke group `rfKZ` (4 steps), kernel group `rfKZ` (2).

| # | Finding | SolidWorks 2024 | Status |
|---|---|---|---|
| 1 | Offset Entities of the face a sketch is on (nothing selected) made one loose closed polyline: no Offset relation, no dimension although *Add dimensions* was checked, 8 degrees of freedom, its corners could be dragged off. | The face's edges offset as sketch lines held by the offset, with the offset dimension: fully defined, the distance editable. | **fixed** (`ui-sketch-tools.js` `cmdOffsetEntities` → `faceOffsetOn`: the face (`sketchFaceIndex`: the coplanar mesh face whose edge box matches `f.faceLoops`) comes in as construction lines / arcs On Edge, then `S.offsetSelection` makes one chain per loop with its Offset relation, Parallel and the dimension; the preview the same way; the old polylines when no face is found). Smoke rfKZ 1, kernel rfKZ 2. |
| 2 | A value typed `=W` in the Modify box was evaluated once: changing the global variable W left the sketch as it was. | `="W"` links the dimension (Σ before the value); the sketch follows W. | **fixed** (`ui-sketch.js` `closeDimEdit` keeps `expr` on the dimension / distance-angle relation when the equation names a global variable (`UI.dimExprOf`), a plain number lets go, the Modify box shows the equation; `ui-sketch-dims.js` tail IIFE wraps `UI.rebuild`: `syncSketchDimExprs` sets every linked value before the build; label `Σ`; `expr` in `DIM_EXTRA` / `REL_EXTRA` for the script round trip). Smoke rfKZ 2, kernel rfKZ 1. |
| 3 | Sketch on a face after Normal To (and every Edit Sketch on a part with a model) zoomed to fit: the area being worked on was lost each time. | The view turns normal to the sketch when it is not; the zoom stays. | **fixed** (`ui-sketch.js` `enterSketch`: no Normal To / Zoom to Fit when there is a model and the view already looks straight at the plane with its y up, `viewIsNormalTo`). Smoke rfKZ 1. |
| 4 | Dragging a fully defined line: nothing moved (right) but the status said "Dragged Line3. Fully Defined" and an empty undo step was left. | Nothing moves, nothing to undo. | **fixed** (`ui-relations.js` drag `start` / `end`: entities, relations and dimensions unchanged → `moved` false, the undo snapshot popped; "… is fully defined: it cannot be dragged."). Smoke rfKZ 3. |
| 5 | Over Defined: the status said the dimension is "shown yellow" while it is drawn red; a click on **Over Defined** in the status bar did nothing. | Red; the status bar's Over Defined opens SketchXpert. | **fixed** (`ui-relations.js`: "shown red"; a click on `.sk-state.over` opens `cmdSketchXpert`). Smoke rfKZ 4. |
| 6 | Delete of a dimensioned line removed its dimension and relations (as SolidWorks) but the status bar kept the previous command's text. | — | **fixed** (`ui-select.js` `UI.deleteSelection` wrapper: "Deleted Line1 with 1 dimension and 2 relations on it. Under Defined."). Smoke rfKZ 4. |
| 7 | Model references do not follow the model: a snap to a model vertex / midpoint adds no relation; Convert Entities and Smart Dimension refs to model edges are fixed in place (On Edge / Fix). With the flange made 3 in long the holes stayed .625 below the *old* top edge (the face sketch itself follows the face along its normal). | External references: Coincident / Midpoint / On Edge to the edge; the sketch follows edits of the base. | left (needs persistent edge references in the sketch and a re-resolve at rebuild; the documented design is "a sketch has no external references", ui-sketch.js p9-modelsnap). The biggest gap found. |
| 8 | In an open sketch the Select tool cannot pick model faces / edges, so a face cannot be preselected for Convert Entities (its PM takes the click instead). | Faces and edges select in a sketch. | left (changes every click on a face sketch; Convert / Offset work from their own PM). |
| 9 | Repair Sketch closing a .0005 gap moved *both* ends to the gap's midpoint: a fully defined end left its Vertical / dimensions and the sketch went Over Defined. | The gap closes at the constrained end. | left: `ui-sketch-import.js` / `dxf-import.js` (lane dwgin). |
| 10 | Check Sketch for Feature has no *Feature usage* (a Base Flange takes one open contour): an open Base Flange profile always lists "Open endpoint" problems. | The contour type follows the chosen feature. | left: `ui-sketch-import.js` (lane dwgin). |
| 11 | The ribbon grows 13 px when a flyout shows a three-line label (Horizontal / Vertical Ordinate Dimension), moving the graphics area; the Tools menu is one flat list taller than the window ("Sketch Tools ▸ …" rows, not submenus). | Fixed-height CommandManager; cascading menus. | left: `ui-panels.js` / `style.css` (commands lane). |
| 12 | After a Cut-Extrude was accepted the status bar read "Create a sketch first: …". | — | left: `ui-commands.js` `cmdExtrude` (commands lane; not chased). |
| 13 | The status bar keeps a drawing tool's prompt after Esc (the Ellipse prompt with Select active). | — | left (low). |
| 14 | Line chains with typed lengths, Ordinate sets (redundant members driven), Fully Define, polygon / ellipse / 3 Point Arc Slot / Centerpoint Arc, Normal To, Linear Sketch Pattern, Smart Dimension to model edges, Cut-Extrude with Link to thickness, Edit Sketch, tangent arcs by **A**, context-toolbar Symmetric / Equal, Link Values, Make Dimension Driven?, Check / Repair Sketch, rename (F2), Suppress. | — | match |

Notes: the Circle tool's unit box needs Enter twice (commit, then make: lane BP's rule); a double-click ends a Line
chain and drops the segment to the double-click (rfCF, the user's rule). Harness: a CDP double-click is one press with
`clickCount: 2` after the click; Page.reload needs `Page.handleJavaScriptDialog` (the unsaved-changes prompt). The smoke
filter `?only=Offset` fails rfJJ (Jog Up To Vertex) on main too (order dependent; passes alone).
