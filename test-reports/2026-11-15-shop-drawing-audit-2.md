# Shop drawing audit, round 2 (lane MV, 2026-11-15)

Five sheet-metal parts a shop makes, each drawn as a user draws it, checked line by line, then the part changed and the
drawing read again. Driven twice: by the engine (kernel group `rfMV`, every step and check) and with real mouse / key
events in headless Chrome (smoke group `rfMV`: File ▸ Make Drawing from Part, Sheet2 tab, Tools ▸ Dimensions ▸
Autodimension, Insert ▸ Bend Table, ribbon Note + click, File ▸ Save Drawing as DXF / PDF / DWG, Window ▸ part, edit,
rebuild, Window ▸ drawing). Round 1: `2026-11-05-shop-drawing-audit.md`.

Steps on every drawing: Make Drawing from Part (Front / Top / Right / Isometric on Sheet1, the Flat Pattern on Sheet2),
bend notes (`UP 90° R.060`), Autodimension of the flat (ordinates both ways), Hole Table from a corner vertex (where
the flat has holes), Auto centre marks on the flat, Bend Table (tags + table + Fixed Face note), a general note, FLAT
SIZE note, title block (material, thickness, mass, size), PDF (pages, MediaBox), drawing DXF R2000 + R12
(`DxfCheck.audit`), DWG (AC1015), the laser DXF (`Kernel.exportDXFFlat`, R12 + R2000, `DxfCheck.check` + `audit`);
then one flange length and one hole / slot size changed and everything read again (views, notes, table, FLAT SIZE,
dimensions, nothing dangling, nothing on a block or another view).

## Task 1: a hole seen end-on

| Part / view | Before | After |
|---|---|---|
| U channel, Ø.2 hole through a bend, Top | 82 visible + 32 hidden Bézier pieces, 2 arcs, 2 hidden arcs; DXF R2000 TOP: SPLINEs, R12: POLYLINEs; Hole Callout `Ø.200` (no THRU: `holeInfo` found no flat rim, probed outside the part) | one CIRCLE (R2000 and R12), no SPLINE / POLYLINE on TOP; Hole Callout `Ø.200 THRU ALL`; centre mark by a click |
| Cross-drilled tube (Ø.5 through both walls), Top | one circle + 36 hidden Bézier pieces and 4 hidden arcs drawn on it (the far wall's and the bore's curves) | one CIRCLE, nothing hidden on it; Front / Right keep their lines and smooth saddles (SPLINE / POLYLINE); Hole Callout `Ø.500 THRU`; Auto centre mark finds it |

Fix (drawing-hlr.js `endOnArcs`): an intersection chain on a cylinder whose axis is the view direction is noted; its
drawn pieces (both ends on the circle, on a chain piece, under 30°) become that circle's exact arcs, joined with the
arcs already on it, a full turn one circle; hidden parts where the circle is visible are dropped. `holeInfo`
(drawing-annotations.js) takes a hole with no flat rim from its cylinder record and looks for its wall all round.

## Task 2: the five drawings

| Drawing | Defects found | Fixed / left |
|---|---|---|
| a. Tray 10 x 6 x 1.5, 16 ga, 4 flanges, 4 circular corner reliefs, 6 x Ø.257 | none after the shared fixes below; edit (flange 1.5 → 2, holes Ø.287): ordinates, Hole Table, 6X Ø.287, FLAT SIZE 12.792 → 13.792 follow | — |
| b. Bracket 14 ga, flange UP 2, flange DOWN 1.5, slot across the UP bend, hem | Bend Table tag C drawn on the slot's centre mark | fixed: notes / tags slide along their bend line off centre marks and earlier notes (`flatItems`, `ctx.cmBoxes`) |
| b. (edit) | changing the UP flange (2 → 2.5) breaks the hem: "No edge selected for the flange" (the hem's edge is a point, it does not follow the flange) | left: kernel (feature references by point); the audit edits the DOWN flange instead |
| c. Perforated panel 24 x 30, 18 ga, 2 flanges, 600 x Ø.188 | the flat placed on Sheet1 on the Top view's 30.000 model dimension | fixed: a flat keeps out of the other views' model-dimension room (`clearSpot`), so it goes to Sheet2; a refit to a smaller sheet still falls back to clear-of-views |
| c. | 600-row Hole Table runs 134 in off the sheet with no word; DXF `$EXTMIN/$EXTMAX` did not hold it (audit error) | fixed: `sheet.warnings` says the rows do not fit (use the 600X callout); DXF extents grow to the geometry. The table itself left: a 600-hole pattern is called out `600X Ø.188 THRU`, as a shop draws it |
| c. | 600 centre marks overlap each other, the tags and Fixed Face at 1:8 | left: the marks are 0.1 in, the holes 0.094 in apart on paper; what was asked |
| d. Hat channel 12 long, 16 ga, walls + lips, a .25 jog on one lip | Fixed Face note on a bend tag (the floor is narrower than the note) | fixed: a second pass lets the note cross lines but never a tag or a hole |
| e. Square-to-round Lofted-Bend 4 x 4 to Ø2, 16 ga | Front and Right: a hidden line drawn twice (inner and outer rims behind each other) | fixed: `dropCoveredHidden` (a hidden piece lying on a visible or a longer hidden line is drawn once) |
| e. | 20 bend tags crowd each other at the corners | fixed with b's slide |
| e. | Autodimension makes nothing (no edge across either axis; stations are only edges across the direction, bend lines and circles) | left: needs point (vertex) stations in ordinate sets; dimension by hand |
| e. | bend notes read `DOWN 22.3° R0` | left: facet bends are sharp (R 0); format kept |
| all | Sheet1 lost its auto layout when the flat went to Sheet2 (`addFlatView` set `manual` before moving to the new sheet): after a model change Sheet1's views stayed put and the bracket's 4.149 model dimension ran into the tolerance block | fixed: the sheet keeps its layout; the app re-lays it out on render |

Checked and right on every drawing: every edge once (no line / circle / arc twice on a layer), no text on the title or
tolerance block, another view or another text, bend notes in shop format, Bend Table one row per bend, FLAT SIZE =
the blank, title block material / thickness / mass / size B, PDF one ANSI B page (1224 x 792 pt), drawing DXF R2000
and R12 audit clean, DWG AC1015, laser DXF clean (closed outline, true circles, bend lines on BEND, inches), nothing
dangling after the edit.

## Not done

- Task 3 (explode lines in an exploded view): not started.
- Kernel (other lanes): `cut("through", { both: true })` drills one wall only (the rfMS tube is drilled through one
  wall); flange / hem / jog edges given as points do not follow an earlier flange's length.
- Smoke `rfLG` b fails on main with lane MS alone (views of an exploded assembly drawn collapsed), not this lane.
