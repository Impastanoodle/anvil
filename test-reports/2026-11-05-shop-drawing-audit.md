# Shop drawing audit — 2026-11-05 (lane rfIR)

Three sheet-metal parts drawn the way a sheet-metal shop prints them, through the engine API (`Drawing.newDrawing`,
`standard3View`, `addFlatView({ fit: true })`, `addHoleTable`, Model Items on, flat overall dimensions and FLAT SIZE
note on), inch, ANSI B, third angle, then exported to PDF, DXF R12, DXF R2000 and DWG:

| Part | Made with | Sheet result before the fixes |
|---|---|---|
| U channel 8 × 3 × 1.62, five holes | Base Flange + two Edge Flanges (inside), 16 ga | 3 views 1 : 1, iso 1 : 2, flat squeezed to 1 : 4 bottom-left |
| Box 6 × 4 × 1.7, rect reliefs, one hem | Base Flange + four Edge Flanges + Hem | 3 views 1 : 1, flat (with Bend Table) **off the sheet** |
| L bracket 2 × 2 × 1.5, two holes | a customer STEP (exported, imported in inches) + Insert Bends | 3 views 2 : 1, flat 1 : 2 |

Exports: every R12 and R2000 file passes `headless/dxf-check.js`; DWG is written by Anvil's own AutoCAD 2000 writer
(`dwg-writer.js`; no ODA / LibreDWG converter was used and the DWGs were not opened in AutoCAD); PDF opens (one page).
Scripts and outputs of the audit are in the session scratchpad, not in the repo.

## Findings, ranked by what matters to a shop

1. **Hole Table placed on top of other things** — *fixed*. With no position, the table went right of its view even
   when that spot was taken: on the channel it covered the Front view's 8.000 dimension and the UNLESS OTHERWISE
   SPECIFIED block; on the bracket it sat on the Front view. SolidWorks puts a table where you click, so this is
   Anvil's own placement. Now: beside the view if clear (views kept 12 mm clear for their dimensions), else the free
   paper nearest to that spot, else beside the view clear of the views alone.
2. **Model dimension inside the title block** — *fixed*. Bracket at 2 : 1: the Front view's 2.000 width dimension was
   drawn inside UNLESS OTHERWISE SPECIFIED (the view sits 10 mm above the title block). A model item's horizontal /
   vertical dimension that lands on the title block, its left blocks, a table, the BOM or off the sheet now goes to
   the view's other side when that side is clear. On the channel the Front's 8.000 moved above the view, off the
   Hole Table.
3. **Flat pattern view off the sheet** — *partly fixed*. The box's Standard 3 View at 1 : 1 fills ANSI B; the flat
   view (fit) was put beside the sheet, so the PDF had no blank, Bend Table or Hole Table, with no warning from the
   API. Flat views may now shrink to 1/8 of the sheet scale (others stay at 1/4), so the box's flat lands at 1 : 8.
   **Left**: its Bend Table then has no free paper and overlaps the Front view and its dimensions; at 1 : 8 the hole
   tags crowd. SolidWorks users put the flat on Sheet 2 or a bigger sheet: the better answer is a flat view that does
   not fit going to a new sheet (or the API refusing), and Standard 3 View choosing a scale that leaves room for the
   flat on sheet-metal parts.
4. **Flat view at another scale with no label** — open. Channel flat 1 : 4 on a 1 : 1 sheet, bracket flat 1 : 2 on a
   2 : 1 sheet, nothing on the sheet says so (title block shows the sheet scale). SolidWorks inserts a flat at the
   sheet scale; when a shop shrinks one it notes the scale under it. Suggest: a flat view whose scale differs from the
   sheet's shows `FLAT PATTERN` / `SCALE 1 : 4` (`showLabel` default on for that case).
5. **Title block has no FINISH, THICKNESS / GAUGE or SIZE cell** — open. SolidWorks 2024's ANSI template carries
   MATERIAL, FINISH, SIZE (A/B), WEIGHT, DWG. NO., REV, SCALE, SHEET; sheet-metal shops add the cut-list's
   Sheet Metal Thickness (or gauge). Anvil's title block has MATERIAL (empty unless the part has one), MASS, no
   FINISH, no thickness, no size letter. Needs: TB_FIELDS cells (layout pinned by rfHB / r13 tests, so a deliberate
   change) and a `Sheet Metal Thickness` / `Gauge` property in `Materials.sheetProperty` (materials.js, not this lane).
6. **Bend Table placement** — open. When no free paper is big enough it stays under the flat even if that covers a
   view (see 3). It should use the same free-paper search as the Hole Table and say so when nothing is free.
7. **Hole tags small and crowded on a shrunken flat** — open. Tags are 2.5 mm text placed up-right of each hole; at
   1 : 4 / 1 : 8 they touch each other and the bend lines (box flat). SolidWorks uses the note font (3.5 mm) and moves
   tags off neighbours.
8. **Hole Table needs a vertex origin; a missed origin is silent** — low. The box's blank has no corner at its
   bounding box, so a table with that origin goes dangling (olive) without an error from `addHoleTable`. SolidWorks
   also needs a vertex; the API could say so.
9. **Hole callout text styles differ** — low, to verify against SolidWorks. Plain holes read `Ø.281 THRU ALL`
   (no space, 3 places) while Hole Wizard callouts read `Ø .28` (rfGT measured SolidWorks' spacing for wizard holes).
10. **Isometric at its own scale with no label** — low (channel / box iso 1 : 2 on 1 : 1). Matches SolidWorks' look
    (model view labels off) but a shop may want it noted.

Correct as SolidWorks 2024 draws them (checked, nothing to do): third-angle placement, view names (Drawing View1…),
`UP 90° R.060` notes on the bend lines, Bend Table headers and tags (A = last bend), hem as `DOWN 180°`, `2X R.060`,
`4X Ø.281`, `FLAT SIZE 8.000 × 6.032`, ANSI inch numbers (no leading zero), title block links, general tolerances
block, DXF layers per view, R12 / R2000 validity.

## Material hatch size (QUEUE "Round-5 follow-ups") — fixed

Measured on a section view (`tests/kernel/rfIR.js` cases). Hatch cost = file with hatch − file without:

| Section | Hatch lines | SVG | DXF R12 | DXF R2000 | DWG |
|---|---|---|---|---|---|
| 6061 block 100 × 60 × 40 mm, ANSI38, before | 321 | 9 973 B | 22 177 B | 37 536 B | 19 408 B |
| same, after | 321 | 9 941 B | 22 177 B (unchanged, R12 has no HATCH) | **581 B** | **335 B** |
| steel block 4 × 1.6 × 2.4 in, ANSI32, before | 44 | 1 209 B | 2 868 B | 4 936 B | 2 552 B |
| same, after | 44 | 1 107 B | 2 868 B | **646 B** | **333 B** |

- DXF R2000 / DWG: the app's *Save Drawing as DXF* (R2000) and *Save as DWG* write each hatched region as one `HATCH`
  entity (predefined pattern name, odd parity, the region's loops as polyline paths) with the pattern's line families
  as drawn (acad.pat's ANSI31…38 families: angle, base anchored at the sheet origin, offset, dashes, in drawing
  units), plus 52 / 41 against acad.pat (1/8 in, acadiso.pat 3.175 mm), so a reader that regenerates from its own
  .pat draws the same. The kernel test regenerates every drawn hatch line from the file's own families. A region whose
  lines were clipped (sketched detail profile, a label island) or greyed stays as LINEs. The engine default
  (`Drawing.toDXF(sheet, { version: 'R2000' })`) keeps LINEs because other groups count them; pass `{ hatch: true }`.
- R12: no HATCH entity exists in R12, so it keeps LINEs (unchanged, valid).
- SVG: hatch runs were already one path of relative moves; numbers now drop the leading zero (`.25`, `-.5`), ~8 %
  smaller on inch sheets, little on mm sheets.

## Changes needing other lanes

- `anvil/headless/anvil.js` (headless lane): `drawing --dxf … --dxf-version 2000` and `--dwg` could pass
  `{ hatch: true }` to `Drawing.toDXF` to get the small files.
- `anvil/materials.js`: `Sheet Metal Thickness` / `Gauge` sheet properties for a title block cell (finding 5).

## Follow-up (lane rfIW, same day)

- Finding 3: a flat (fit) that finds no room at half the sheet scale or more goes to a new Sheet2 (active, its own
  title block, SHEET 2 OF 2) at the sheet scale; the U channel, box and bracket flats all land there now, with their
  Hole Tables and Bend Tables readable. `newSheet: false` keeps the old way.
- Finding 4: a flat at another scale than the sheet's shows `SCALE 1 : 2` under its FLAT SIZE note. Model views keep
  SolidWorks' default (no label even at their own scale, pinned by rfCQ).
- Finding 5: title block THICKNESS (`.0598`, `16 GA (.0598)` with a gauge pick; materials.js `Thickness`,
  `Sheet Metal Thickness`, `Gauge`), FINISH (the part's Finish property) and SIZE (`B`).
- Headless `drawing --dxf --dxf-version 2000` / `--dwg` write HATCH entities like the app.
- Finding 2 partly reverted: the side flip now refuses a side whose extension lines would run through the view (the
  plate in smoke rfQ got a dimension covering its Front view, which took the click that drags the view). The bracket's
  Front 2.000 is in the tolerance block again: open, needs Standard 3 View to leave room under the bottom row.
