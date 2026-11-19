# Drawing flats (lane drawflats, round local-2026-11-18b)

Started from bcfbf9f. Tests: kernel `tests/kernel/rfQN.js` (6), smoke `tests/smoke/rfQN.js` (1).

## 1. Block attributes as the R2000 default

- Before: `toDXF` wrote ATTDEF / ATTRIB only with `{ attributes: true }` (the app and the headless runner passed it);
  `DxfCheck` read ATTDEF / ATTRIB as bare `{ type, layer }`, so two on one layer were "duplicate".
- After: R2000 writes them by default, `{ attributes: false }` keeps TEXT, R12 always TEXT (`useAtt` in
  drawing-render.js). `headless/dxf-check.js` `shape()` reads ATTDEF / ATTRIB (place, height, text, tag), `placeIn()`
  places them like TEXT, both duplicate signatures carry the tag, the minimum text height applies to them. The explicit
  `attributes: true` went from `headless/anvil.js` (2) and `drawing-ui-tools.js` (2). rfPQ re-pinned (R2000: three
  ATTDEFs in the BLOCK, values as ATTRIB; R12: TEXT). rfQN: a stamp with two instances: 4 ATTRIBs, audit clean.

## 2. Dual values rounded as decimals

- Before: `Math.round(x * 100) / 100` on the float product: .375 in = 9.524999999999999 mm -> 9.52, 1.375 -> 34.92.
- After: `Drawing.roundDec(x, prec)` (drawing-sheet.js) reads the value at 12 significant digits and rounds half away
  from zero (SolidWorks 2024's default): 9.53, 34.93, 1.005 -> 1.01, -0.005 -> -0.01. Used by `fmtDim`, `inchText`
  and `numText`, so dimensions, dual values, tolerances, callouts, Hole / Bend Tables, PDF and DXF texts all agree.
- Pin that moves (other lane's group, for the head): `tests/kernel/rfQK.js` line 112 (and its title, line 100):
  `'.375 [9.52] X 1.375 [34.92] SLOT'` -> `'.375 [9.53] X 1.375 [34.93] SLOT'`. No other kernel pin moved.

## 3. A Baseline set with no room

- Before: the drawflow7 bracket's Top-view set (1.500, 3.500, 4.500, 6.000) ran past the border above the view; the
  other side holds the Front view, so it stayed off the sheet (rfQG's "stays above" case: last line above the border).
- After (`placeDim`, drawing-render.js): when neither side fits at 8 mm, the lines close up 0.5 mm at a time down to
  the text height + 2 mm (the existing stepping still keeps values apart), first on its side, then on the other side
  (clear of other views and values); else the side whose last line runs least past the border, pulled in toward the
  view until it is inside. The status line says which (sheet.warnings). Bracket on ANSI B: 5.5 mm apart above the
  view, last line 10.476 (border 10.606), one warning. A set with room is unchanged (8 mm, no warning). A set whose
  spacing was dragged (`d.step`) is left as dragged.
- Pins that move (for the head):
  - `tests/kernel/rfQG.js` line 39, "a Front view under it: the set stays above": that fixture's views overlap (Top at
    y 9.1, Front at 8.2); the set now goes under the Top view (the side inside the border), 5.2 mm apart, warned.
    Suggest asserting rfQN's rule instead (every line and value inside the border) or deleting the row.
  - `tests/smoke/rfQG.js` lines 82 / 86 / 87: the set now starts closed up at the minimum, so dragging the third line
    0.2 in closer cannot follow the pointer (clamped at text + 2 mm: 10.234 for 10.060). Drag it 0.1 in away instead:
    `[c[0], c[1] + 0.1]`, `P[2] + 0.1`, `s2 > s1 + 0.04` (measured: the dragged line at P2 + 0.1 exactly, the first
    line unchanged).

## 4. Flat-pattern drawings made like the detailer

Door (rfQI's 18 ga door with configured length), smoke by the mouse: Make Drawing, model views deleted, Sheet
Properties ANSI C 1:4, Insert > Flat Pattern by a click, Autodimension, Insert > Bend Table, a GRAIN note and a
`FLAT SIZE: $PRPSHEET:"Bounding Box Width" X ... MATERIAL: $PRPSHEET:"Material" 18 GA ($PRPSHEET:"Sheet Metal
Thickness")` note; then D42 by configuration. Kernel: the same through the API, and the tray.

- Fixed: `addFlatView({ fit: true })` with the flat alone on its sheet left the 26.3 x 37.3 door at 1:1, off ANSI C
  (shrinking stopped at half the sheet scale, also on the new sheet it made). A flat alone on its sheet (an empty sheet
  or the new one) now shrinks to whatever standard scale fits: 1:4.
- Fixed: the left hem's note / tag (bend line .49 in from the blank's edge) was printed across the blank's outline,
  and the right hem's sat between the hem and the flange bend, nearer the flange's line than its own. A note or tag
  that crosses the flat's outline or another bend line, or reads as another line's, goes to the other side of its line
  (slid along it past earlier notes) if it is still nearest its own line there, else past an end of its line, in line
  with it (drawing-render.js `flatItems`, `onFlatGeo`, `bendNotePrims(..., side)`). Both hems: tag at the line's end.
- Fixed: after 36 -> 42 the horizontal ordinate set dangled: the end flange's short side edges (on the lines x = .055
  and 23.945) slid 6 in along their lines, no overlap was left for `reattachDim`. Ordinate / baseline members now find
  such an edge again on the same line (`slidEdge`, drawing-annotations.js): the set follows (43.343).
- Fixed: at D42 `SCALE 1 : 4` under the flat landed on UNLESS OTHERWISE SPECIFIED; it follows FLAT SIZE's rule
  (over the view when under it is on a block).
- Pin that moves (for the head): `tests/kernel/rfIW.js` line 44 places the flat at (3, 3) so SCALE 1 : 2 under FLAT
  SIZE was at y .36, past the 10 mm border (.394); it now goes over the view (y 4.67). Suggest `y: 4` for that flat
  (line 40) or asserting `sc[0].p[1] > w.box.y1`.
- Already right (measured): six bend lines, six notes, then six tags A-F with the Bend Table (6 rows, 180° hems
  R.002 / BD .018, flanges R.048 / BD .079) clear of every view; Cross-Break note `UP 1° R.048`; FLAT SIZE 26.306 x
  37.343 -> 43.343; the linked note reads `26.3063 X 37.3429` / `Plain Carbon Steel` / `18 GA (.0478)` and follows to
  43.3429; every sheet text is in the R2000 DXF and the PDF; nothing past the border; no text on text.
- Tray (14 ga, mitred, 12 x 8 x 1.5): ANSI C, Front / Top / Right / Isometric at 1:2 and the flat at 1:4 on the same
  sheet with SCALE 1 : 4; four tags, the Bend Table at (9.21, 4.45)-(13.46, 5.64) clear of all views; all checks clean.
  No holes, so no Hole Table. On ANSI B the flat at 1:4 has no room beside the four views and goes to Sheet2.

## Not reached

- Ordinates for the four holes only (the detailer would pick them); Autodimension's set includes the edges and bend
  lines (0, .491, 1.192, 1.208, 2.153, 24.153 ...). The tray's folded views were not dimensioned.
- `textRect` (render) treats a turned text as anchored in its middle; ordinate values drawn at 90° with 'start' / 'end'
  are measured where they are not (a turned 'start' text runs from p, the box is centred on p). Not changed: it would
  move every ordinate placement pin. The new end-of-line bend notes are anchored 'middle' so both agree.

## Check in SolidWorks

- Bend tags on a hem close to the blank's edge: beside the line inside the blank or past its end?
- Does SolidWorks' Bend Table list a Cross-Break? (Anvil keeps its note `UP 1° R.048` in table mode.)
- A baseline set with no room: SolidWorks leaves it where it is; confirm the 5.5 mm minimum spacing is acceptable.
- Rounding: Document Properties > Dimensions > Rounding "half away" vs "half to even" for 9.525 at 2 places.
