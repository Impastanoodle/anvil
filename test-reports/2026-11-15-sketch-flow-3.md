# Sketch flow audit, round 3 (lane MT, local-2026-11-15a)

Eight shop profiles drawn and fully defined with real mouse and key events in headless Chrome (smoke group `rfMT`,
`anvil/tests/smoke/rfMT.js`), in a new **inch** part, grid off. After each: two dimensions changed through the Modify
box (double-click on the label), every step undone with Ctrl+Z down to the empty sketch and redone with Ctrl+Y (the
same sketch, compared as JSON), the sketch exited and edited again (same sketch, same status), then Boss-Extrude /
Base Flange / Cut-Extrude with the volume checked. Flows of the 2026-11-11 report were not repeated.

| # | Flow | Steps driven | Defects found | Status |
|---|---|---|---|---|
| 0 | Select in an open sketch on a face (2026-11-11 report, 2nd table row 8) | hover / click the face, click an edge, Ctrl+click, a click on a sketch line, Convert Entities and Offset Entities with the face preselected | The Select tool could not pick model faces or edges in a sketch: a click on the face only cleared the selection, so nothing could be preselected for Convert / Offset | **fixed** (`ui-select.js` `UI.sketchModelPick` + `sketchSelectClick`: no sketch item under the pointer → edge, else face, Selection Filter aware; `ui-sketch.js` `modelHover` pre-highlights it; `ui-sketch-tools.js` `selModel()`: Convert Entities and Offset Entities take the preselected faces / edges) |
| 1 | Gusset: lines, Tangent Arc, two straight slots dimensioned from the edges | Line chain, Tangent Arc tool, two slots, 4 Smart Dimensions (typed 1, 1 1/2), Fully Define Sketch, 2 edits, undo / redo 14 steps, edit again, Boss-Extrude .25 | none (Tangent / Horizontal / Vertical / Coincident inferred as SolidWorks; a slot's width click that snaps onto its own end is refused with a status message, as designed) | — |
| 2 | Flange outline, two holes mirrored about a centerline, one hole moved | Corner Rectangle, Centerline between side midpoints, 2 circles, Ctrl+click both, Mirror Entities, drag a hole, Ø typed 3/8, Fully Define, width 6 → 7, undo / redo, Boss-Extrude | Dragging a hole moved its mirror image **and** slid the centerline and the rectangle it hangs on (.02 for a .25 drag) | **fixed** (`sketch-solver.js` `symDragMob`: a drag on one of a Symmetric pair holds the pair's centerline) |
| 3 | Open channel for a Base Flange, two arcs | Line tool, back over the end point and out for each tangent arc, width typed 3 1/2, R typed 3/8, leg 1 1/2, edits 4 1/4 and 2, undo / redo, Base Flange | none | — |
| 4 | Vent: slot, Linear Sketch Pattern, spacing changed | window box select of one slot, Linear Sketch Pattern 5 × .75, spacing label .750 → 1, undo / redo, Boss-Extrude | Changing the spacing pulled the **seed slot apart** (one end arc of negative radius, the seed moved .29) instead of moving the copies | **fixed** (`sketch-solver.js` `anchorFirst`: a pattern's spacing dimension holds the pattern's seeds) |
| 5 | Power Trim, then Extend | rectangle, a line across it, two Power Trim drags over the overhangs, a short line extended to the long one, 3 dimensions, Fully Define, 2 edits, undo / redo, Boss-Extrude | none (Coincident at the trim points and the extended end, the short line kept its Midpoint) | — |
| 6 | Offset Entities inward, offset changed | L outline as one chain, one click, Offset .25 (Select chain), the offset label .250 → 3/8, undo / redo, Boss-Extrude of the ring | Changing the offset dimension moved the **original outline** half the change (its free lines were on the moving side of the Offset relation) | **fixed** (`sketch-solver.js` `anchorFirst`: an Offset chain's dimension holds the chain's bases) |
| 7 | Sketch on a model face: Convert Entities, model edited underneath | sketch on the top face, click the face, Convert Entities ✓, a hole dimensioned 1 / 1 from two converted edges + Ø1/2 (Fully Defined), undo / redo, block 4 → 5 wide, Cut-Extrude | none (the hole follows its converted edge to x = 4) | — |
| 8 | Profile dragged under-defined, then Fully Define Sketch | Line chain with a sloped side, drag a corner, Fully Define, 2 edits (5 → 6, 1 → 1 1/4), undo / redo, Boss-Extrude | none (Horizontal / Vertical / origin held during the drag) | — |
| 9 | CommandManager height with every Smart Dimension flyout face (2026-11-11 report row 11) | each of the 11 faces in both interface profiles at 1584 px | not reproduced: the ribbon is a fixed 140 px in both profiles (3 faces wrap to three lines inside it) | regression row added |

Not changed, for other lanes:
- PropertyManager number boxes take fractions only when typed key by key (the first `/` turns the box into a text box,
  `ui-commands.js`); a value pasted or set at once into the box as `1/4` is dropped by the browser's number input.
- With the converted outline left solid, Cut-Extrude of a face sketch cuts the region between the outline and the hole
  (as SolidWorks); the shop habit is to make the converted outline construction first.
