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
