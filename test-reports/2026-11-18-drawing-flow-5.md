# Drawing flow 5 (lane drawflow5, rfOJ), 2026-11-18

Shop drawings made from the part to the paper in headless Chrome (port 8972), on inch parts built by script; the
sheet read back from `UI.drawing.state.sheet` (text rectangles, prims), PNG clips of the sheet, the PDF (MediaBox,
text matrices, line widths) and the DXF (LINE lengths, `$EXTMAX`, DIMENSION values).

## Jobs

| Job | Steps driven | Measured | Defects | Status |
|---|---|---|---|---|
| 1. Press-brake print, sheet 1 | 14 ga bracket 6 x 3, UP 90, DOWN 90, UP 45, UP 90 + hem (5 bends), Ø.281 x 2 + Ø.500; Make Drawing (ANSI B 1:1, F / T / R + iso), Insert Model Items | 14 values; before: `1.500` (Front) on `1.340` (Right), the Top view's third hole-location row (`4.500`) past the border, 2 dimension lines past it; after: 0 / 0 / 0 | 2 | fixed |
| 1. Press-brake print, sheet 2 | Add Sheet, Flat Pattern, overall dimensions on, FLAT SIZE on, Bend Table instead of notes, horizontal ordinates to every bend line from the left edge, a GRAIN -> note | ordinates 0, .938, 1.011 … 8.253; Bend Table A-E (DOWN 180 R.015 .029 …); before: FLAT SIZE note printed across the COMPANY cell; once fixed, the Bend Table (no free paper on this sheet, warned) took the UNLESS OTHERWISE SPECIFIED block as its least-covering spot | 2 | FLAT SIZE fixed; the Bend Table spot left (see Handed on) |
| 1. PDF | `anvil.drawing.pdf()` | 2 pages 1224 x 792 pt, 165 texts all inside the page, line widths .71 / .99 / 1.42 / 1.98 pt (0.25 / 0.35 / 0.5 / 0.7 mm) | 0 | ok |
| 2. Laser print | 20 x 12 11 ga blank, 40 holes (4 sizes x 10), 6 slots; Make Drawing (1:4); Hole Table, origin by the X and Y edges | 40 rows, 9.7 in tall; before: placed over the Top view's `10X Ø.141 / .170 / .202` callouts with no warning, and no way to split it | 2 | fixed: warning + right-click ▸ Split |
| 2. DXF / DWG at 1:1 | `toDXF` on the 1:4 sheet | before: the 20 in edge was 5 in (paper) and there was no 1:1 option; after (Scale output 1:1): 20 in, `$EXTMAX` 68 x 44, DIMENSION 42 = 20 | 1 | built |
| 3. Assembly print | 4 sheet-metal components (3 parts), Make Drawing, BOM + MATERIAL column, Auto Balloon on the iso | MATERIAL from the parts' property (A36 CRS / 304 SS); no way to sort the BOM | 1 | built: right-click ▸ Sort |
| 3. Section, revision, weld | not driven this run | — | — | open |
| 4. Edits after release | only the BOM cell undo (below) | — | — | partly |
| 5. Title block / sheet size | not driven this run | — | — | open |
| 6. Checker dimensions | not driven this run | — | — | open |
| Known leftovers | BOM cell on another sheet, Description undo, flat detail by a sketch, PDF name | below | 4 | fixed |

## Fixes

1. **Model Items on a value placed before them** (drawing-render.js `placeDim`): a model item h / v whose text meets
   another dimension's value placed before it (`obs.dimTexts`, which the Bend Table dry run `dryDimBoxes` sees too)
   goes to the view's other side when that side is clearer (`clashCost`), clear of values, blocks and the border.
2. **Model Items past the border**: the other-side try refused any side whose extension lines cross the view; a hole
   location crosses it on both sides (from the hole centre), so that side is taken when the first side crossed too.
3. **FLAT SIZE note on the title block** (`flatItems`): under the view unless that hits the title block, the blocks
   beside it, a Revision Table, the BOM or the border; then over the view. `flatCtx.blocks` carries those blocks.
4. ~~Bend Table no-room spot off the tolerance block~~: tried (the blocks as `tableSpot` obstacles, weight 4) and taken
   out again: on rfJR's sheets the least-covering spot then went under the Front view's 6.000 (kernel rfJR 2 rows red).
   `flatCtx.blocks` stays (the FLAT SIZE note uses it).
5. **Hole Table split** (drawing-annotations.js `cleanHoleTable` / `holeTablePrims`, drawing-ui-tools.js
   `holeTableMenu`): `split: [rows]`, pieces side by side 4 mm apart with their own header; right-click a row ▸ Split ▸
   Horizontally Above / Below / Join, one undo step. The pieces move together (SolidWorks moves each piece on its own:
   not built).
6. **Hole Table with no clear paper says so** (`noRoom`, a sheet warning), also when it is only clear of the views
   (on dimensions or callouts).
7. **Scale output 1:1** (`Drawing.scaleSheet`, `toDXF(sheet, { scale11 })`, Document Properties ▸ Export ▸ DXF / DWG
   ▸ Scale output 1:1, option `dxf11`): File ▸ Save as DXF / DWG write the sheet x 1 / sheet scale.
8. **BOM Sort** (drawing-sheet.js `bomSorted`, `bom.sort = { col, dir, keepItems }`; right-click the BOM ▸ Sort ▸
   column A to Z / Z to A / Assembly order): numbers run down the sorted table; a typed ITEM NO. stays; balloons follow.
9. **BOM override on another sheet's BOM re-keyed** (`setBomCell`): every sheet's `bom.overrides` follows the key.
10. **Undo of a DESCRIPTION written into a linked part document** (drawing-ui-panels.js `bomDocUndo`): the step keeps
    the document before / after against its undo snapshot; `UI.undo` / `UI.redo` put it back. One undo step.
11. **Detail View of a flat by a sketched profile** (drawing-sheet.js `addDetailView`, drawing-views.js
    `flatDetailLines`): built (was refused); bend lines and etch clipped to the polygon. kernel rfPH re-pinned.
12. **Drawing export name with the configuration** (drawing-ui-tools.js `safeName` / `cfgTag`): `PART_CONFIG.pdf`
    when the part shows a configuration other than its first; not when the name is the drawing's own saved file.

## To check in SolidWorks

- Whether Ctrl+Z in a drawing undoes a BOM cell's Description written into the part (assumed yes: not checked).
- BOM Sort: SolidWorks' Sort dialog wording for item numbers ("Do not change item numbers"): Anvil renumbers by
  default, `keepItems` keeps them (not checked).
- Whether a Hole Table split piece is dragged on its own (SolidWorks: yes, as far as known; Anvil moves them together).
- Scale output 1:1: whether SolidWorks also scales the border / title block (Anvil scales the whole sheet: not checked).

## Handed on

- Bend Table with no free paper (rfOJ bracket flat, ANSI B 1:1, overall dims + FLAT SIZE + Bend Table): its
  least-covering spot is the UNLESS OTHERWISE SPECIFIED block (warned). Keeping it off the blocks must not send it
  under a dimension (kernel rfJR); `tableSpot`'s cover() weights dims ('taken') 1, views 4.

- Shift+drag a dimension to another view (SolidWorks moves it; Ctrl+drag copies): missing. Reproduction: the rfOJ
  bracket (smoke/kernel rfOJ `RFOJ_BRKT`), Make Drawing, Insert Model Items, Shift+drag the Front view's 1.500 onto the
  Right view: it only moves within the Front view. Needs a model item to become a dimension of the target view
  (suppress its key in the source view, a user dimension on the same model points in the target; drawing-ui-tools.js
  `dragDim` + an engine function in drawing-annotations.js).
- Autodimension ordinates over Model Items on a flat overlap. Reproduction: the rfOJ bracket, Add Sheet, Flat Pattern
  (model items on), `anvil.drawing.autodimension(flatId, { h: { scheme: 'ordinate', origin: 'left', place: 'above' }, v: null })`:
  the hole location `2.376` sits on the ordinates `.938` / `1.011`. The ordinate set is placed first (it is a user
  dimension) and the linear stack after it only slides its text along its line (`placeLinearOut`); rfNS's step-out
  covers ordinate sets only.
- Grain direction: Anvil has no grain arrow symbol; a `GRAIN ->` note is what was used.
- Not driven (for a fresh agent):
  - Job 3 rest: section view through the assembly (parts hatched differently, a part excluded: `sectionView` +
    rfDN's Excluded components), revision table rev A + revision symbol (`revisionTable`, `addRevision`, symbol
    `revision`), weld and surface finish symbols (`symbol({ type: 'weld' | 'surfaceFinish' })`), item numbers
    renumbered by hand (a typed ITEM NO. works and survives Sort: kernel rfOJ). The 4-component assembly script is
    in smoke rfOJ's Sort step.
  - Job 4: part edits after release (flange 1/4 longer, hole removed, Description changed) on drawings 1-3, rev B,
    Save / Close / Open identical. Only the Description-undo leftover was done.
  - Job 5: title block $PRP / $PRPSHEET fields, A -> B -> C (`refitSheet`), a second sheet with another format, the
    tolerance note, a logo block (rfPM / rfPQ Blocks).
  - Job 6: baseline / chain / chamfer / angle dims, break lines, arrow flip, text off centre and back, witness gaps,
    foreshortened radius, virtual sharp, bend silhouette, dual dims, one precision changed; re-read from SVG and PDF.
