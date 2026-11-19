# Drawing flow 7: a detail print dimensioned by hand (lane drawflow7, rfQG, 2026-11-19)

Job 6: a 14 ga (.0747) bracket, 6 x 3 base, flanges 1.5 up at x 6 and 1 down at x 0 (R.06, K .44), four Ø.281 holes,
a .25 x 1.25 slot, a .100 x 45° Break Corner on the 1.5 flange's top corner (Right view), and for item 4 an R22.6 arc
cut on the base's back edge. ANSI B, Standard 3 View at 1 : 1, Model Items on. Everything was driven with mouse events
on the sheet (ribbon flyout rows, clicks on edges, the Dimension PM's boxes, right-click menus, drags, the wheel), read
back from `UI.drawing.state.sheet` (what the SVG draws) and from the R12 DXF and the PDF. Tests: smoke `rfQG` (5 steps),
kernel `rfQG` (12 tests).

## 1. Baseline and Chain
- Driven: Smart Dimension flyout ▸ Baseline, the Top view's left edge, two hole rims, the slot's end arc, the right edge, ✓.
- Already right: values 1.500, 3.500, 4.500, 6.000; lines equally spaced (8 mm).
- Fixed: dragging the third line moved the whole set (it only set `at`). Now the innermost line moves the set and any
  other line re-spaces the set evenly so that line follows the pointer (`d.step`, paper mm, never under a text height +
  2 mm; one undo step). Measured 8.00 -> 5.63 mm for a .2 in drag. SolidWorks check: does dragging a middle member of a
  baseline group re-space the group, or move that member alone?
- Fixed: a set with no room above its view ran off the sheet (the Top view sits at the top of ANSI B: the 6.000 at
  y 10.71 of 11). With no `at` it now goes under the view when the whole set fits there clear of blocks, other views and
  values; else it stays (the bracket's Top view has the Front view under it, so it stays; the kernel test has the case
  that flips).
- Fixed: Chain Dimension over the same holes put its row on the baseline's first line (1.500 on 1.500), then, past the
  set, off the sheet (y 11.07). The row now goes 6 mm past the dimensions already on that side, and to the other side
  when that runs past the border or into another view: under the Top view, 0 overlaps.

## 2. Chamfer and angles (already right)
- Chamfer Dimension (flyout), the chamfer edge then the flange top: `.100 X 45°`. Smart Dimension chamfer + flange
  top, placed on the part side: 135°; the Front view's base bottom + flange outside: 90°. The chamfer edge is .14 long:
  a pick at fit zoom takes its end vertex (a `v .100`); the test zooms in with the wheel first, as a user would.

## 3. Break lines, arrows, Center Dimension, gaps
- Added Break Lines (Dimension PM ▸ Leaders: Break Lines, Break around dimension arrows only, Use document gap / Gap;
  Document Properties ▸ Dimensions ▸ Break dimension extension/leader lines gap, default .0625 / 1.5 mm). The Top view's
  .750 (top edge to a hole, placed left of the 3.000 model item) had both extension lines running through the 3.000's
  line and arrow; ticked, each is cut .0625 either side. A broken dimension is written exploded in R2000 (a DIMENSION
  would redraw its lines whole). SolidWorks check: the default break gap of the ANSI template.
- Already right: clicking an arrow handle of the selected dimension flips the arrows and back.
- Added right-click ▸ Display Options ▸ Center Dimension (`d.centre`): a value dragged .5 off centre goes back to the
  middle and stays there while the dimension line is dragged (only `at` moves). Undo takes it back.
- Already right: extension line gap .0625 from the part and .125 past the dimension line, both from Document Properties
  (pinned by kernel rfT). SolidWorks check: ANSI-inch template values (.06 / .12?).

## 4. Foreshortened radius, virtual sharp, tangent edges
- Added Foreshortened (Dimension PM ▸ Leaders, radius only): R22.600 on the arc whose centre is 22 in off the view is
  drawn from a false centre 20 mm in (at most .7 R) with a zigzag, the arrow on the arc's middle from the centre side,
  the value past the false centre; dragging the value moves the false centre and a slanted jog joins the radius.
  Exploded in R2000. SolidWorks check: where SolidWorks puts the value on a foreshortened radius, and the jog's shape.
- Added Find Intersection: with Smart Dimension running, right-click a straight edge ▸ Find Intersection, click a
  second edge: the pick is the virtual sharp (a `pt` ref with `vs`, both edges kept). The right bend's outside corner to
  the left flange reads 6.000 with a witness line along each edge, .0625 off the part to .125 past the sharp; the part
  made 7 wide reads 7.000. That needed edge references to keep their outline role (`bound`) through `reattachRef` (the
  flange's outside edge went to its inside face, 6.925).
- Fixed: a view's tangent edges (right-click ▸ Tangent Edge ▸ Tangent Edges Visible) could be seen but not picked; the
  click fell through and the next click made a 2.900 edge length. Now `entityAt` takes them and reattach finds them
  again: the Right view's bend tangent line to the flange top reads 1.365 and stays 1.365 (it drifted to the silhouette,
  1.500). The bend's silhouette (the bottom line) was already pickable (1.500).

## 5. Dual, one precision, a tolerance (already right)
- Document Properties ▸ Dual dimensions on, Decimal places .12: model items read `6.00 [152.40]`, `3.00 [76.20]`. The
  hole location's PM, Unit precision .123, Tolerance Bilateral +.005 / -.000: `.750 +.005 -.000 [19.05 +0.13 0]`; the
  rest stay at 2 places. SolidWorks check: the dual of a zero minus tolerance (`0`, ASME's metric form, or `-0.00`).
- Not right, not this lane's list: the slot callout `.25 X 1.25 SLOT` has no dual value (rfOC left slot callouts out).

## 6. Save, close, open (already right)
- With Baseline (7 mm), Break Lines + Center Dimension, the virtual sharp, the Chamfer Dimension, dual, the toleranced
  value: the model's JSON saved, the drawing closed, a new part, the JSON loaded, the drawing opened: the SVG is byte for
  byte the same (38378 characters); all 28 dimension texts are in the R12 DXF (TEXT at the sheet's point) and the PDF
  (Tm at the sheet's baseline), before and after.

## 7. Not reached
Job 3 by the mouse (section through an assembly with one part excluded in Section Scope, revision table row and symbol,
weld and surface finish symbols): not started, context budget. The assembly script is smoke rfOJ's Sort step.

## Changed
- drawing-render.js: `breakDimLines`, baseline `step` / `blPos` / the flip under the view, `d.centre`, foreshortened
  radius, virtual-sharp witness lines, broken dims exploded in R2000.
- drawing-ui-tools.js: baseline re-spacing drag (`blMember`), chain row placement, Dimension PM Break Lines /
  Foreshortened, right-click Center Dimension, Find Intersection (`sdContext`, `vsharpAt`).
- drawing-annotations.js: `DIM_PROPS` + step / brk / brkGap / centre / fs, `vsMeet`, `vs` refs, `bound` kept in
  `reattachRef`. drawing-sheet.js: `dimBreakGap` (DIM_SIZES, `Drawing.dimBreakGap`). drawing-ui-panels.js: the
  Document Properties row. drawing-ui.js: Find Intersection on the right-click, tangent edges in `entityAt`.
  drawing-views.js: reattach also against the shown tangent edges.
