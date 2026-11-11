# Drawing flow audit, 2026-11-11 (lane drawflow, group rfKT)

Three shop drawings made in the app in headless Chrome the way a SolidWorks user makes them, with mouse and key events
(`tests/smoke/rfKT.js`; the script console only builds the parts and reads the results). Engine checks in
`tests/kernel/rfKT.js`. SolidWorks was not opened (it may hold the user's work); "expected" is SolidWorks 2024's
documented behaviour.

| Job | Part | What was made |
|---|---|---|
| a | 16 ga bracket 6 x 3, a 90° and a 120° flange, Ø.281 x 2 + Ø.500 | Make Drawing from Part; Smart Dimension by clicks: hole centre to edge (.750), centre to centre (3.000), the 60° between base and flange, the bend's R.060; Hole Callout; Note with a leader; a general note block; Sheet2 by the Add Sheet tab, the flat placed by a click with its Bend Table; File ▸ Properties (Drawn by, Company) into the title block; Revision Table and right-click ▸ Add Revision; File ▸ Save Drawing as DXF / PDF / DWG |
| b | 14 ga box 10 x 6 x 2, Butt Closed Corners, a Welded Corner, five holes | Section View A-A through the middle hole; a 4:1 Detail View of the welded corner; ordinates from the left edge; Hole Table of all holes; Center Mark; Weld Symbol on the corner |
| c | the bracket again | Isometric moved to Sheet2; sheet B → C at 1:2; a dimension's tolerance and precision in its PM; the 6.240 dragged to the other side; the Top view deleted with its dimensions; undo / redo of each |

What passed as it was: the cutting line snaps to the hole centre, SECTION A-A is labelled and hatched, the detail is
named `Detail View B (4 : 1)`, the ordinates read 0 / 2.000 / 5.000 / 8.000, the Hole Table lists the 5 holes, the
title block reads FORMED BRACKET / BR-100 / .0598 and the File ▸ Properties values, the REV cell follows the Revision
Table, the flat lands on Sheet2 at the sheet scale with its Bend Table (A / B), every text of both sheets is in the DXF
and in the PDF (two pages), the DWG is AutoCAD 2000 (AC1015), the 6.240 drag is one undo step, sheet B → C at 1:2 is
one undo step and nothing lands on the title block, the Dimension PM's tolerance / precision edit is one step that one
Ctrl+Z restores. No console errors.

## Findings, ranked by how much they would bite a shop

1. **Ctrl+Z after Smart Dimension needed two presses per dimension (high). Fixed.** Repro: Smart Dimension, click a
   hole centre, an edge, the spot (.750); click the next two items and the spot (3.000). Expected: two undo steps, one
   per dimension. Got: three: the next pick closes the first dimension's PropertyManager with ✓, and ✓ with nothing
   changed still made an (empty) undo step, so every second Ctrl+Z did nothing visible. Fix: drawing-ui-tools.js
   `cmdDimensionPM` / `applyDimensionPM` skip the edit when the PM's values are unchanged. Test: smoke rfKT a (undo
   +1 per dimension).
2. **A small arc picked its centre, not the arc (high for sheet metal).** Repro: Smart Dimension, click the middle of a
   bend's R.060 inside arc at the sheet's fit zoom (the arc is about 3 px from its centre). Expected: the arc (a radius
   dimension, R.060). Got: the arc's centre point (a point pick, waiting for a second item). Every bend radius on a
   1 : 1 or smaller sheet hit it. Fix: drawing-ui-tools.js `pickAt`: an arc's or circle's own centre wins only when the
   pointer is nearer the centre than the curve. Fixed; test: smoke rfKT a.
3. **Note had no leader by clicking (high).** Repro: Annotation ▸ Note, click a hole's edge, then where the note goes.
   Expected (SolidWorks): the first click on model geometry anchors the leader's arrow, the second places the note.
   Got: the note box opened at the first click, no leader (a leader could only come from the API or a Multi-jog
   Leader). Fix: drawing-ui-tools.js `noteClick`: a first click on a view's edge / circle / arc sets the arrow point on
   that curve (rubber-band leader preview, `noteLeaderOverlay`), the next click opens the box; a click on paper is a
   plain note as before. The note follows the view (followViews). Test: smoke rfKT a (arrow on the Ø.500's edge, one
   undo step, undo / redo).
4. **No way to move a view to another sheet (high for multi-sheet prints).** Expected: drag the view onto the other
   sheet in the FeatureManager, or cut / paste. Got: nothing; the view had to be deleted and made again (losing its
   dimensions). Fix: drawing-sheet.js `Drawing.moveViewToSheet(doc, viewId, sheet)` and the view's right-click ▸ Move
   to Sheet ▸ SheetN (drawing-ui-tools.js `moveToSheetItems`, one undo step). The view keeps its paper place (pulled in
   on a smaller sheet), its dimensions, annotations, Hole Tables and the notes / symbols on it; the views made from it
   go along; a view that has a parent is refused ("move its parent"), because Anvil works a child view out on its
   parent's sheet. Tests: kernel rfKT (family, notes, refusal, smaller sheet), smoke rfKT c (right-click, undo / redo).
5. **Deleting a view leaves its notes and symbols on the sheet (low). Fixed (lane drawflow2, rfKX).** As SolidWorks:
   Delete on a view takes its dimensions, centre marks, callouts, balloons and the notes / symbols (weld, datum,
   surface finish …) / Hole Tables on it (a leader on it or placed on it) in one undo step; a view with views made
   from it (projected, section, detail) asks first (Confirm Delete listing them and what goes), Yes takes them too.
   Sheet notes stay. `Drawing.deleteView(doc, id, { dependents: true })`, `Drawing.viewDependents`; the plain
   engine call keeps its old behaviour (kernel rfQ / drawings). Tests: kernel + smoke rfKX.
6. **An ordinate set's 0 printed on the Hole Table's datum Y (medium).** Repro: job b, ordinates from the Top view's
   left edge (the set goes above the view), then a Hole Table with the top-left vertex as origin. Got: the datum's Y
   label and the ordinate 0 on one spot. Fix: the datum X / Y labels are now keep-out boxes for dimensions
   (drawing-annotations.js `holeTablePrims` tagBoxes) and an ordinate set whose values land on a paper block goes to
   the other side when clear, else its line steps out 4 mm at a time (drawing-render.js `placeDim`). Tests: kernel rfKT
   (fails on the old code), smoke rfKT b.
7. **A Hole Callout could print on a dimension placed by a click (low).** The callout is placed by default before the
   dimensions, and a clicked dimension does not move, so a callout added after a dimension on its default spot sat on
   it. Fix: drawing-render.js `ktCalloutsClear` turns the callout's leader (±25° … the other side, longer runs) to the
   first spot clear of the dimensions, notes, other views and the border; a stored (dragged) leader is never moved.
   Test: kernel rfKT (fails on the old code). In job a itself the default spot was clear.

## Seen, not changed

- ~~Hole Callout places itself at the click~~ Fixed (rfKX): the click on the hole picks it, the callout follows the
  pointer with its leader, the second click places it; Esc drops the pick, the tool stays. rfDD, rfKT and
  drawing-annotations click twice now; `anvil.drawing.holeCallout(...)` still places in one call.
- ~~No separate tolerance precision~~ Fixed (rfKX): the Dimension PM has Tolerance precision (Same as nominal,
  None … .12345678, (Document)) and Document Properties > Units > Dimensions has the document default (Same as
  nominal); +.010 / -.005 under a 2-place nominal at .123 prints +.010 / -.005 on the sheet, DXF / DWG and PDF.
- Ordinate chain: features after the first extend the set without their own undo step (Ctrl+Z takes the whole set).
- At the fit zoom the box's .0747 walls are 2 px apart: a click on the outer edge can take the inner one (ordinate
  9.925 for 10.000). SolidWorks has the same pick at that zoom; zoom in.
- Smart Dimension's non-linear preview text now uses the dimension style's height (.125 in on inch sheets, rfKX);
  the angle preview rounds to 0.01° as the placed angle does (no change needed).

## Round 2 (lane drawflow3, group rfLA)

Three more flows made with mouse and key events in headless Chrome (`tests/smoke/rfLA.js`; the console builds the parts,
changes the model as its PropertyManagers would and reads the results), engine checks in `tests/kernel/rfLA.js`.

| Flow | What was made | Result |
|---|---|---|
| 1 | 16 ga bracket: Smart Dimensions by clicks (.750 hole to edge, 3.000 centres, Ø.500, 1.500 flange), a two-click Hole Callout, two notes with leaders (on a hole, on the right edge); then flange 1.5 → 2, 16 → 14 ga, Ø.281 → Ø.344, hole 2 deleted, a flange added, the Ø.500 cut suppressed, each time Window ▸ part, change, Window ▸ drawing; saved (part JSON) and loaded | passes after fixes 1–2 |
| 2 | flat-pattern-only print: model views deleted (Confirm Delete), sheet C at 1:1, Insert ▸ Flat Pattern, Autodimension (ordinates to holes and both bend lines, .48 apart), Bend Table, GRAIN note, PDF and DXF | passes after fix 3 |
| 3 | 60 in 12 ga channel: Break on the Top view, Crop View on the Isometric, Auxiliary View off the 120° flange, the Isometric at 1:4 with its label, Rotate View 90°, Hidden Lines Removed / Visible and Tangent Edges per view | passes after fix 4 |

What passed as it was: every Smart Dimension followed its geometry (2.000 after the flange change, 1.635 after the gauge
change), the 3.000 to the deleted hole dangled in the dangling colour and came back with it, the callout read Ø.344
THRU ALL (no 2X once the holes differ), THICKNESS in the title block went .0598 → .0747, the Bend Table went to three
rows, the dangling state survived save / load; the flat sat at 1:1 (the 6.000 blank edge is 432 pt in the PDF, the C
page 1584 × 1224 pt), the ordinates read 0, 1.000, 5.000, 6.000 and 0, 1.080, 1.321, 1.561, 2.642, the bend notes .48
apart did not touch each other or a bend line, bend lines on BEND_UP and notes on BEND_NOTES in the DXF; the dimension
across the break read 60.000, crop / auxiliary / 1:4 label (SCALE 1 : 4) / hidden lines / tangent edges as SolidWorks.

### Findings

1. **A note's leader did not follow its geometry and never dangled (high). Fixed.** Repro: a note with its arrow on the
   Top view's right edge, then 16 → 14 ga; a note on a hole, then the hole deleted. Expected (SolidWorks): the arrow
   stays on the edge as it moves; with the hole gone the note is dangling (brown), re-attachable. Got: the arrow stayed
   on the old paper spot (off the edge by .015 in) and pointed at nothing once the hole was gone, drawn as normal. Fix:
   drawing-annotations.js `anchorLeaders` (called at the end of `followViews`): a leader whose tip lies on a visible
   edge / circle / arc of its view (0.6 mm) is anchored (`a.anchor = { ref, t, pt }`), found again each compute with
   Smart Dimension's `reattachRef`; the arrow moves with it, the text stays; when it is gone `a.dangling` (drawn in the
   dangling colour, summary `dangling`); dragging the arrow re-anchors it (`editNote` / `cleanSymbol`). Same for symbols
   with a leader (datum, weld, surface finish). Tests: kernel rfLA 1, smoke rfLA 1.
2. **A flange added on the edge a dimension measured to moved the dimension onto the bend's inner face (high).** Repro:
   .750 from a hole to the base's back edge, then a flange on that edge. Expected: .750 (the edge's line) or dangling.
   Got: .810, silently (the parallel inner face 0.06 away won over the pieces of the old line left at the corners).
   Fix: drawing-views.js `reattachDim`: while a piece of the edge's own line from one of its ends is still drawn, the
   dimension stays on that line (a whole edge that moved, or a short leftover in the middle such as a blind hole's
   bottom, as before). Tests: kernel rfLA 2 (and kernel drawings' "moved full-length edge" still passes), smoke rfLA 1.
3. **Characters the PDF / DXF fonts lack printed as "?" (medium).** Repro: a note "GRAIN DIRECTION →". Got "GRAIN
   DIRECTION ?" in the PDF and the DXF. Fix: drawing-render.js `plainText`: arrows → -> <- <->, dashes, curly quotes,
   bullet, ellipsis, ½ ¼ ¾, ≤ ≥ ≈ written as a shop types them; Latin-1 letters (é, µ, ²) kept in the PDF (WinAnsi
   octal). Tests: kernel rfLA 4, smoke rfLA 2.
4. **No Rotate View (high for long parts).** Expected: right-click a view ▸ Zoom/Pan/Rotate ▸ Rotate View, an angle.
   Got: nothing. Fix: `Drawing.setViewRotation(doc, id, deg)` (drawing-sheet.js; `v.rotate` turns the view's frame in
   `viewFrame`, so linework, picks and exports follow), the dialog `DW.cmdRotateView` (drawing-ui-tools.js, Rotate
   Drawing View, one undo step), `anvil.drawing.rotateView(id, deg)`. The view's dimensions, callouts, centre marks,
   breaks and crop turn with it (h ↔ v at 90° / 270°) and stay on their geometry; the view leaves its alignment. Tests:
   kernel rfLA 3, smoke rfLA 3.

### Seen, not changed

- Window ▸ the part (or the part tab under the sheet) closes the drawing and asks "Save changes to Draw1?" when it was
  changed; SolidWorks switches windows and keeps both open. Pinned by close-drawing-asks-to-save ("Don't Save (Window
  ▸ part)"); needs the user's call. rfLA saves first.
- Rotate View to an angle other than a multiple of 90° is refused while the view holds dimensions, annotations, a break
  or a crop (their h / v kinds have no meaning there); a new drawing's views carry centre marks, so in practice only an
  Isometric or a bare view turns freely. SolidWorks turns them all.
- A model / projected view at its own scale shows no SCALE under it unless Display label is on (rfCQ pins SolidWorks'
  default); the flat does (rfIW).
- Make Drawing from Part always lays out the Standard 3 View; a flat-only print starts by deleting them (SolidWorks
  opens the View Palette instead).
- `Drawing.newDrawing(model, { scale: '1:1' })` takes only [1, 1] (a string gives NaN views); the UI always passes the
  array.
