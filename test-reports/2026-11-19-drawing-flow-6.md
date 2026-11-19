# Drawing flow 6 (lane drawflow6, round local-2026-11-18b)

Drawings driven from the jobs handed on in `2026-11-18-drawing-flow-5.md` and item 4 of `2026-11-18-export-audit.md`.
Tests: kernel `tests/kernel/rfQC.js` (8), smoke `tests/smoke/rfQC.js` (2).

| Job | What was driven | Before -> after | Status |
|---|---|---|---|
| Block attributes in the drawing DXF | rfPQ revision stamp (REV linked to `$PRPSHEET:"Revision"`, DATE, BY), a second instance turned 90 and scaled 2 with B / 11/20/26 / JD; File > Save Drawing as DXF (R2000) and DWG | values written as TEXT beside each INSERT -> R2000: the BLOCK holds three ATTDEFs (tag, prompt, default; BLOCK flag 70 = 2), each INSERT has `66 1`, one ATTRIB per tag owned by it and a SEQEND. Anvil's DXF reader gives the same 12 texts at the same places from R2000 and R12; DxfCheck clean; `DWG.fromDXF` takes it (11655 bytes) | fixed |
| Shift+drag a dimension to another view | rfOJ bracket, Make Drawing, Model Items; Shift+drag the Front view's 1.500 onto the Right view | it only moved inside Front -> it becomes a vertical 1.500 of the Right view (the model item suppressed on Front), one undo step; Ctrl+drag copies; the 6.000 (along X) dropped on the Right view is refused: "Not true length in Drawing View3 ..."; the moved one follows the part (flange 1.5 -> 1.75 reads 1.750) and is saved with the drawing | built |
| Autodimension ordinates over Model Items on a flat | bracket, Add Sheet, Flat Pattern, ordinates above from the left, Model Items before / after, bend notes / Bend Table, overall dims on / off | already clear on main (no value on another in all 4 combinations; the UI flow of the report also measured clear) | pinned |
| Bend Table with no free paper | bracket flat filling ANSI B (overall dims, FLAT SIZE, ordinates, GRAIN note); the box flat on a full ANSI A sheet (rfJB's case) | the least-covering spot could be the UNLESS OTHERWISE SPECIFIED block (the side blocks were not obstacles) -> never on the title block, its side blocks, the revision table or a placed value; only views may be covered; when every spot inside the border meets one of those the table hangs off the sheet at the right (box at x 11.39 on the A sheet), and the warning says so | fixed |
| Job 3 rest (assembly print) | 4-component weldment: section through it (plane x 60) with ANGLE-100<2> excluded, Revision Table rev A, revision symbol, weld and surface finish symbols with leaders | 3 cut parts hatched 45 / 135 / 30, the excluded angle not hatched; REV A in the title block; symbols as placed; no warning, no console error | ok (pinned) |
| Job 4 (part edits after release) | rev A bracket print with model items, a hole callout and a Smart Dimension on the .500 hole, a copy of the 1.500 on the Right view; flange 1.5 -> 1.75, the .500 hole removed, Description changed; rev B; Save / Open | 1.750 in Front (item) and Right (copy); the callout and its dimension dangle; DESCRIPTION follows; REV B; `drawingFile` -> `readDrawingFile` gives the identical SVG (26902 chars) | ok (pinned) |
| Job 5 (title block and sheet) | plate on ANSI A: TITLE from `$PRPSHEET:"Description"`, a note with `$PRPSHEET:"Material"` and `$PRP:"DrawnBy"`; A -> B -> C; Sheet2 ANSI D 1:2 | values shown; views inside the border and off the title block on each size; 1 OF 2 / 2 OF 2, Sheet1 stays C | ok (pinned) |

## Notes

- R2000 attributes are written only with `toDXF(sheet, { attributes: true })`, which the app's File > Save Drawing as
  DXF and Save as DWG pass. The engine default keeps TEXT because kernel rfPQ (another lane's file) counts the values
  as TEXT in R2000. To make it the default: drop the option test in `drawing-render.js` (`useAtt`) and change
  `tests/kernel/rfPQ.js` line 156 to look for `ATTRIB` when `ver === 'R2000'`; `headless/anvil.js` `drawing --dxf /
  --dwg` (lines 412 / 416) should pass `attributes: true` too.
- `$PRP` in a note or title field reads the drawing's own properties (SolidWorks), `$PRPSHEET` the part's.
- A Bend Table off the sheet does not print (SVG / PDF are the sheet); the DXF carries it (its extents grow).
- Ordinate sets and baseline / chamfer dimensions do not move to another view (refused: only h / v / aligned).

## Not reached

- Job 6 (baseline / chain / chamfer / angle dims, break lines, arrow flip, text off centre, witness gaps,
  foreshortened radius, virtual sharp, bend silhouette, dual dims, a precision changed; re-read from SVG and PDF).
- Job 3 by the mouse (the section, revision and symbols were placed through `anvil.drawing`); item numbers typed by
  hand are pinned by kernel rfOJ.

## Check in SolidWorks / AutoCAD

- Open the R2000 DXF / DWG of a sheet with an attributed block: ATTEDIT should list REV / DATE / BY with the
  instance values; the turned, scaled instance's values should sit where Anvil draws them.
- Shift+drag of a model dimension to another view in SolidWorks 2024 (which ends it picks when the view shows the
  same edge from the side; Anvil picks the corner nearest the drop).
- Where SolidWorks puts a Bend Table that does not fit (Anvil: off the sheet at the right, warned).
