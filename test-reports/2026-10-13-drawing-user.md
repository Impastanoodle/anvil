# Shop drawing of a bent bracket, made like a SolidWorks user (2026-10-13, lane BX)

How: the real app in headless Chrome over the DevTools protocol (a scratch driver outside the repo, modelled on
`anvil/headless/ui-smoke.js`), with mouse events on the sheet and screenshots (`Page.captureScreenshot`) read at 2–6×.
Part: a 16 ga (.0598) inch bracket, R.060 bends, k .71: 6 × 3 base, a 1.5 up-flange, a 2 down-flange, four Ø.281 holes
and a Ø.500 hole; also the Design Library's sheet-metal examples. Flow: File ▸ Make Drawing from Part (ANSI B, third
angle, inch), Sheet Properties ▸ scale 1:2, Model View ▸ Flat pattern (bend lines and notes), Section / Detail views,
Smart Dimension by clicks, Ordinate Dimension by clicks, hole callout, centre marks / centrelines (auto), a note, title
block fields, the Dimension PM with the two-Enter rule, DXF (R12 / R2000, read back: layers, `$INSUNITS`, text heights,
DIMSTYLE) and PDF. Colours were ignored (lane BU).

| # | What I did | What happened | Expected (SolidWorks 2024 / shop checker) | Fixed? |
|---|---|---|---|---|
| 1 | Make Drawing from Part on the bent bracket (1:1 and 1:2) | Model Items put the bend's "2X R.060" on top of the overall height "3.680" at 1:1 (text over text); at 1:2 its leader ran down past the height's extension line, its shoulder crossing the dimension line | the radius clear of the other dimensions, its leader crossing none | **Fixed**: a radius may now be led from the concave side (arrow out onto the arc, text in the empty inside of the bend, ASME Y14.5); a radius placement also pays for crossing other dimensions' lines / the outline and keeps a text height clear of other texts. Test `rfBX` 1 |
| 2 | Note, flat-pattern bend notes, hole callout on the inch drawing | notes, bend notes, FLAT SIZE and hole callouts were 3.5 mm (.138 in) while dimensions were .125 in; DXF carried 0.1378 | one text height for dims and notes (.125 ≥ the .12 minimum) | **Fixed**: they follow the dimension style's text height (Document Properties ▸ Dimensions): .125 on inch, still 3.5 on mm; the callout arrow too. Test `rfBX` 2 |
| 3 | Click 6.240, type `<DIM> REF` in the Dimension PM's Text, Enter | nothing changed on the sheet until the second Enter (✓) | first Enter commits the typed value (it shows), second closes | **Fixed**: text, tolerance, precision and flip apply live; the PM is one undo step; ✗ puts the dimension back. Test `rfBX` 3 |
| 4 | Ordinate Dimension: base the left edge, click all five holes | the second hole of each column added a duplicate ordinate (1.620 / 1.620, 4.620 / 4.620, jogged side by side) | each value once (duplicate dimensions are a red-line) | **Fixed**: a pick that repeats a value in the chain is refused with "1.620 is dimensioned already". Test `rfBX` 4 |
| 5 | Smart Dimension hole-to-edge (1.620 at 1:2), placed by a click between the extension lines | the text was moved outside past the far arrow (it does not fit with two .125 arrows) | SolidWorks keeps the text where clicked and flips the arrows | **Fixed (lane CA)**: a click between the extension lines keeps the text centred between them when it fits there, the arrows going outside when they do not; a click outside puts the text outside on that side; text that does not fit (or a model item, placed with no click) still goes past the far arrow. Test `rfCA` 3 |
| 6 | Front view of the bracket (Hidden Lines Visible, the Standard 3 View default) | the hole walls through the .06 sheet are hidden lines shorter than one dash, so they draw as short solid ticks | not mistaken for visible edges | **Fixed (lane CA)**: a hidden line shorter than one dash + gap draws as one dash centred on it with a gap at each end (sheet, SVG, PDF; butt ends), so it stands apart from the outlines; DXF keeps the true line on HIDDEN. Test `rfCA` 5 |
| 7 | Flat pattern at 1:2, 3 in wide | the DOWN bend note (1.5 in long at .138) ran past the flat's outline | note inside the blank | **Fixed (lane CA)**: a note longer than its bend line goes on two lines (`DOWN 90°` over `R.060`) beside the line inside the blank; when even that does not fit (a narrow tab) it runs on from the bend line's end, outside the blank, never across the outline. Test `rfCA` 4 |
| 8 | Isometric view in Standard 3 View at 1:1 | labelled "ISOMETRIC  SCALE 1 : 2" | SolidWorks shows no label on model views unless asked | Not changed (minor) |
| 9 | Escape during Ordinate Dimension with its PM open | Esc is the PM's ✗ (ends the tool), as SolidWorks | — | OK |
| 10 | Section A-A from the Top view, Detail B from the Front view | cutting line with arrows and letters, hatch, labels "SECTION A-A", "DETAIL B / SCALE 1 : 1" (2× the parent) | as SolidWorks | OK |
| 11 | Model View ▸ Flat pattern | bend lines UP solid / DOWN dashed on BEND_UP / BEND_DOWN, notes "UP 90° R.060" along the lines, centre marks on the holes | as the shop's flats | OK |
| 12 | Sheet Properties ▸ 1:2, title block COMPANY / DRAWN / MATERIAL | views re-laid out, title block SCALE 1:2, fields shown | — | OK |
| 13 | Save as DXF (R2000) and read back | `$ACADVER` AC1015, `$INSUNITS` 1, `$MEASUREMENT` 0, one layer per view plus SHEET / DIMENSIONS / ANNOTATIONS / BEND_UP / BEND_DOWN / BEND_NOTES / FLAT_PATTERN, true DIMENSION entities with DIMSTYLE text .125 / arrows .125, `°` as `%%d`, `±` as `%%p` | — | OK |
| 14 | Save as PDF | one page, 17 KB | — | OK (DWG needs the local converter: not tried headless) |

Tests: `anvil/tests/smoke/rfBX.js` (4 steps; each fails on the code before this lane, passes after).

Lane CA (2026-10-13) also: Ctrl+Z / Ctrl+Y (and Edit ▸ Undo / Redo, the Undo / Redo buttons) with a drawing PropertyManager open cancel it first, as on the part side (the Dimension PM's live edits go back and leave no undo step; Smart Dimension's PM ends the tool and keeps the dimension); the next Ctrl+Z undoes. Undo / Redo checked for a view move, a dimension edited and deleted, a note edit and the sheet scale. Tests: `anvil/tests/smoke/rfCA.js` (5 steps; 1, 3, 4 and 5 fail on the code before lane CA).
