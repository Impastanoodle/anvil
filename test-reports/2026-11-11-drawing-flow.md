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
5. **Deleting a view leaves its notes and symbols on the sheet (low, left).** Its dimensions go (they live on the
   view); a note with a leader on it, a weld symbol on it and its Hole Table stay on paper. That is rfQ's tested choice
   ("deleting the view leaves its notes on the sheet"); SolidWorks may take them with the view (its Confirm Delete lists
   dependent items). Not changed: needs the user's call / a look in SolidWorks.
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

- Hole Callout places itself at the click (SolidWorks: the callout follows the pointer, a second click places it).
  Changing it would change every callout test (rfDD, rfGT); the callout is dragged afterwards.
- A bilateral tolerance takes the dimension's precision (+.010 / -.005 at .12 shows +.01 / -.01), as SolidWorks'
  "Same as nominal" tolerance precision; there is no separate tolerance precision box.
- Ordinate chain: features after the first extend the set without their own undo step (Ctrl+Z takes the whole set).
- At the fit zoom the box's .0747 walls are 2 px apart: a click on the outer edge can take the inner one (ordinate
  9.925 for 10.000). SolidWorks has the same pick at that zoom; zoom in.
- Smart Dimension's angle preview text rounds to 0.01° and the non-linear preview text is 3.5 mm on inch sheets
  (`smartDimOverlay`); the placed dimension is right.
