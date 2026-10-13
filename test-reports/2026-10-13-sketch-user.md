# Sketcher as the shop user — 2026-10-13, lane BV

Headless Chrome (CDP: real `Input.dispatchKeyEvent` / `Input.dispatchMouseEvent`, screenshots) on an inch document at the
shop zoom of 0.015 in per pixel. Drawn: a 4 × 3 mounting-bracket blank from a Line chain with typed lengths and angles,
Centerline, Tangent Arc, 3 Point Arc, Sketch Fillet R.125, Sketch Chamfer .25; holes with the Circle unit box
(Ø .266), Straight Slot, Linear / Circular Sketch Pattern, Mirror Entities; Smart Dimension with the Modify box (4-1/2,
17/64), the "Make Dimension Driven?" question; Trim (Power / Trim to closest), Extend, Offset Entities, Parallel Line,
Close Arc, Show Endpoints, Convert Entities on a face, Undo / Redo through all of it.

| # | What I did | What happened | Expected | Fixed? |
|---|---|---|---|---|
| 1 | Select tool, click the edge of a Ø.266 hole that has its Ø dimension at 45° (9 px hole at the shop zoom) | The Instant2D ball of the dimension (its arrow sits on the circle) took the hover and the click: nothing selected, status "Instant2D: dimension unchanged." | The hole is selected | Yes: `ui-sketch-dims.js` — the arrow tip hovers a dimension only when no sketch entity is under the pointer (value and lines still do) |
| 2 | Smart Dimension a hole that already has a Ø: "Make Dimension Driven?" opens; press Esc (or the ✕) | The question closed, the new dimension stayed driving and red, status bar "Over Defined" | SolidWorks' Cancel: the dimension is not added | Yes: `ui-relations.js` — a Cancel button; Esc and ✕ remove the dimension ("Dimension not added …") |
| 3 | Mirror Entities ✓ with two lines about a centerline | Status bar "Selection cleared." | "Mirrored 2 entities, 2 held Symmetric about Line1." | Yes: `ui-commands.js` — the result message survives the PropertyManager's close |
| 4 | Circle: centre click → the R / Ø box opens on R; a hole size (.266) is a diameter, so Tab first every time | Always R first | Mastercam remembers Radius / Diameter | Yes: `ui-sketch.js` — the box opens on the field the last circle was typed in (R by default) |
| 5 | Line chain with typed 4 ⇥ 0 ⏎, 3 ⇥ 90 ⏎, 4 ⇥ 180 ⏎, close at the origin | Correct outline, Horizontal / Vertical / Coincident relations, three length dimensions; Enter places a segment, Enter with nothing typed ends the tool | Same | — |
| 6 | Centerline with a typed length; Tangent Arc off a line end; 3 Point Arc; Sketch Fillet R.125 on two corners; Chamfer .25 | All correct (Tangent, Equal fillets, virtual sharps keep the 4 / 3 dimensions, R.125 and .250 dimensions placed) | Same | — |
| 7 | Sketch Fillet with a radius larger than the lines | Toast "Radius too large … (at most R3.000 in)", nothing made | Same | — |
| 8 | Circle: centre click → Tab → .266 → Enter → Enter; Straight Slot with typed length 1 and width .266 | Hole Ø.266 dimensioned; the first Enter commits ("press Enter again to finish"), the second makes it and closes the tool; slot made with its 1.000 and .266 dimensions | Same | — |
| 9 | Linear Sketch Pattern with nothing selected, values typed, Enter Enter | Toast "Select the entities to pattern first.", PM stays open | Same (SolidWorks activates the selection box) | — |
| 10 | Smart Dimension → Modify box: 4-1/2 ⏎ | 4.500 in; 17/64 ⏎ on a Ø gives .2656 | Same | — |
| 11 | Trim to closest (click), Power trim (drag), Extend, Offset .25 ⏎ ⏎ with the offset dimension, Parallel Line, Close Arc, Show Endpoints, Convert Entities, Undo / Redo | All as the briefs describe; each is one undo step | Same | — |
| 12 | Dimensions made by typed values sit 14 px off the entity (text 6 px clear of the line) and on the inside of a counter-clockwise outline | Readable but cramped next to the geometry at the shop zoom | SolidWorks places them further out | No (cosmetic; `typedDims` offset; changing it moves every auto dimension and the tests that read `off`) |
| 13 | Esc while a Line chain is rubber-banding | Drops the segment and puts the Line tool down (SolidWorks: Esc exits the tool) | Same | — |

Readability on the grey-black background: white wireframe, white dimension text, the typed-value box (white, blue
labels), the Modify box, prompts and the status bar were all readable in the screenshots; the selected hole is drawn
orange with its Circle PropertyManager, the Offset chain yellow dashed.

Tests: `anvil/tests/smoke/rfBV.js` (4 steps: the hole click, Esc / ✕ / Cancel on the question, the Mirror status, the
Circle box remembering Ø).
