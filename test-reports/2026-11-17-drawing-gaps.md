# Drawing gaps a sheet-metal shop meets, re-checked on main (lane PH / drawgaps, round local-2026-11-17c)

The missing / partial rows of `2026-10-13-completeness.md` section 2 were checked again on main (c84ced1). The
earlier re-score is `2026-11-06-drawing-gaps.md`. Each row was checked with grep over `drawing*.js` and the engine run
under Node (scratch scripts on a 48 x 6 16 ga blank, a 14 ga bracket, three boxes). SolidWorks was not opened.

## Re-checked against main

| Row (2026-10-13) | Now | Measured |
|---|---|---|
| Removed Section, Relative View, Empty View | built | `addRemovedSection`, Relative View PM, `addEmptyView` (rfCX, rfAO, rfHX) |
| Horizontal / Vertical Dimension and Ordinate, Angular Running, Path Length | built | Smart Dimension flyout (lane CT, rfNL) |
| Autodimension (drawing) | built | `Drawing.autodimension` baseline / chain / ordinate; on flats `flatAutodimension` (rfGT, rfJM) |
| Flag notes, Multi-jog Leader, Datum Target, Weld Symbol, Cosmetic Thread, Dowel Pin, Revision Symbol / Cloud | built | rfCU, rfJI |
| Hole Table, Bend Table, Punch Table | built | rfAN, rfGT, rfJG |
| Sketch tab, Line Format, Hide/Show Edges, View ▸ Hide/Show | built | rfAO, rfHX, rfJI |
| Tangent edge display per view | built | right-click ▸ Tangent Edge ▸ Visible / With Font / Removed; 30° part iso 0 -> 2 -> 2 lines (rfNL) |
| Break, Crop, Broken-out Section on model views | built | rfN, rfP, rfAD, rfW |
| Section views from the app API off the sheet (QUEUE "API section views placed on the sheet") | already right | `anvil.drawing.sectionView` passes `fit: true`: 54 of 54 placements on the sheet (3 parts, sections h / v from Front, Top, Right, three each). The bare engine call (no `fit`) still goes beside a full sheet, as documented |
| Autodimension chain mode vs SolidWorks | not compared | needs SolidWorks; Anvil: one row of links from the origin edge, `29X .733` for a run of equal links too short for their text (rfNS) |
| **Break on a flat-pattern view** | **was refused** | `addBreak` threw "A flat-pattern view cannot be broken" |
| **Detail View of a flat-pattern view** | **was refused** | "Detail views of flat-pattern views are not supported" |
| Break line styles | 2 of 5 | Straight / Zig Zag only; the live preview drew a single Z while the sheet drew teeth all along |
| Crop View on a flat-pattern view | refused | "A flat-pattern view cannot be cropped" |
| Block (Make / Insert Block in a drawing) | missing | no drawing block; sketch blocks exist in the part sketcher only |
| Alternate Position View | missing | needs assembly configurations with positions (left as asked twice before) |
| Predefined View, hyperlinks, Format Painter, Spell Checker, Design Checker | missing | low |

## Ranked: what is still missing or partial (sheet-metal shop, SolidWorks 2024 drawings)

1. Broken View of a long flat (trim, panels, angles 96-144 in on a B sheet) — **built here**.
2. SolidWorks' five break line styles — **built here**.
3. Detail View of a flat (a notch, relief or tab at 2 : 1) — **built here** (circle and rectangle profile).
4. Crop View of a flat — left (rare on a shop print; needs the bend lines, bend notes and tables cropped too).
5. Drawing Blocks (company stamp, standard note blocks, DXF BLOCK / INSERT) — left.
6. A detail of a flat from a sketched profile — left (circle and rectangle work).
7. Alternate Position View, Predefined View, Format Painter, Spell / Design Checker — left (low, or out of scope).

## What was built (kernel rfPH 8 tests, smoke rfPH 3 steps)

- **Broken View on a flat-pattern view.** `Drawing.addBreak` takes a flat view; the Break PM and its clicks take one
  (`breakViewAt`); the flat's right-click menu has Un-Break View. A 48 in blank at 1 : 4 broken from 10 to 38 in with
  a .4 gap is 5.400 in wide on paper (12.000 unbroken), centred where it was. What sits on it:
  bend lines, bend-region lines and etch marks are cut like the outline (they had been squeezed into the gap); a bend
  note or tag goes with its bend line when the line is gone, else sits on the longest kept piece, its end 2 mm short of
  the gap when it is longer than the piece; an ordinate / baseline member whose feature is in the removed paper goes
  (18.000, 24.000, 30.000, 4.500 on the blank), the others keep their true values; a Hole Table's tags go with their
  holes (B2, B3, A1 gone, B4 moved 3.3 in with its hole; they had stayed put) and its X / Y origin arrows with the
  origin, the table itself stays with all its rows; a dimension, centre mark or callout lying wholly in removed
  paper goes (3 of 5 centre marks); the Bend Table, FLAT SIZE and scale notes move whole (they had been squeezed when
  they spanned the break); the Fixed Face note, at the blank's centre and so in the removed paper, steps out beside
  the gap, clear of holes, tags and the break line teeth. These rules hold for every broken view, not only flats.
- **Break line styles** (`Drawing.BREAK_STYLES`): Straight Cut, Curve Cut (true arcs: DXF ARC), Zig Zag Cut (teeth all
  along, as before), Small Zig Zag Cut (one Z in the middle), Jagged Cut (a fixed torn edge, the same on both lines).
  The live preview draws the same shape as the sheet (`Drawing.breakLinePoints`). SVG, PDF, DXF R12 / R2000 audited.
- **Detail View of a flat-pattern view**: circle or rectangle profile; the outline and holes clipped, the flat's UP /
  DOWN bend lines (BEND_UP solid, BEND_DOWN dashed) and etch marks clipped to it (`_.flatDetailLines`), at twice the
  flat's scale; no bend notes, FLAT SIZE or tables in the detail; it follows part changes (base 4 -> 4.2: the bend
  line moves .4 on paper). By the mouse: Detail View, centre, radius, place. A sketched polygon profile on a flat is
  refused with a message.
- **Headless drawing:** `--views ...,Flat` adds the flat on the same sheet (summary `flat.blank` gives its u / v range)
  and `--break "View,a,b[,horizontal][,style][,gap]"` breaks a view (`;` between several).

## Existing test changed (for the head; not in this lane's files)

- smoke `rfW.js` (live previews): `assert(bl.length === 2 && rfWPts(bl[0]) === 6, 'two zig zag break lines ' ...)`
  pinned the preview's single Z (6 points), which was not what OK drew (Zig Zag Cut: teeth all along). The preview is
  now the sheet's own shape. Proposed: `rfWPts(bl[0]) > 6` with the message "two zig zag break lines, teeth all along
  as the sheet draws them".

- kernel `p9-drawing.js` line 209 pinned "projected / section / detail views of a flat are refused"; a detail of a
  flat is now allowed (SolidWorks allows it). Proposed: the list becomes `['addProjectedView', 'addSectionView']`, then
  `assert(DW.addDetailView(q.doc, q.mesh, q.view.id, { r: 5, c: [0, 0] }).kind === 'detail', 'a detail of a flat (rfPH)');`
  and the title "projected / section views of a flat are refused, a detail is allowed".

## To check in SolidWorks

- The look of each break line style (Anvil's Small Zig Zag Cut is one Z in the middle, Zig Zag Cut teeth all along;
  Curve Cut a wave of arcs 1.5 mm high; Jagged Cut a torn edge) and SolidWorks' default style.
- Whether SolidWorks hides an ordinate member or a centre mark whose feature lies in the removed part of a broken view
  (Anvil does), and where it puts the Fixed Face note of a broken flat.

## Lane PM / drawgaps2 (round local-2026-11-17c): items 4, 5 and the rest of the list

| Item | Now | Measured |
|---|---|---|
| Crop View of a flat | **built** | the 48 x 6 blank at 1 : 4 cropped to u -1 .. 20: box 5.000 in wide (20 in), holes 6 / 18 kept, the bend at 2 with its note, the one at 46 and its note gone; ordinates 24 / 30 / 42 / 46 / 48 / 4.500 gone, 0 / 2 / 6 / 18 kept; hole tags 2 of 5, the Hole Table all 5 rows; centre marks 2 of 5; FLAT SIZE still 48.000 × 6.000 under the cropped view; Bend Table both rows, the cropped bend's tag and the Fixed Face note (u 24) gone |
| Crop View by a sketched profile (any view) | **built** | a closed sketch selected + Crop View (SolidWorks' order); triangle / circle profiles on a flat, a triangle on a section view: hatching clipped to the triangle, not its box; Edit Crop gives the outline back as sketch lines, Remove Crop; a profile crop turns with Rotate View at any angle |
| Crop and dimensions | **changed** | a cropped view's dims reattach against the whole view (a dimension on an edge the crop cuts read the clipped length before); a linear one whose end is cropped away goes (`inCrop`) |
| Drawing Blocks | **built** | Tools ▸ Block ▸ Make / Insert / Explode / Save, right-click on the sketch; a block made of 7 entities draws the same 7 primitives; scale 1.5 / 90° instances; DXF R12 + R2000: one BLOCK, an INSERT per instance (scale 41-43, rotation 50), no loose copies, audit clean, DWG written |
| Alternate Position View | **built** | a block held by Distance1 15 -> 40 mm: the block (only) drawn again 25 mm higher (12.5 mm on paper at 1 : 2), thin phantom, no hidden lines, DXF PHANTOM |
| BOM DESCRIPTION from the part's Description | already right for a custom property; **fixed** per configuration | before: the Bar shown in Short and Long configurations was one row `Bar / BAR 2 FT / 3` (the part's active configuration) and a suppressed component was listed; now `BAR 2 FT / 1`, `BAR 4 FT / 2`, the suppressed one left out |

Left: a detail of a flat from a sketched profile (circle and rectangle work); Predefined View, Format Painter, Spell / Design Checker; block attributes (text linked to a property) and a block's own insertion point picked by the mouse (it is the lower-left corner); the Alternate Position view's box does not grow to hold the phantom part (model items may sit on it); ribbon buttons for Blocks / Alternate Position (smoke rfLH pins the drawing's ribbon ids: they are on the menus).

### To check in SolidWorks

- Whether a dimension whose one end is cropped away is hidden (Anvil hides it) and whether a cropped flat's Hole Table lists every hole (Anvil: every hole, tags only on the shown ones).
- The Alternate Position line font and whether SolidWorks draws the unmoved components again (Anvil: only the moved ones).