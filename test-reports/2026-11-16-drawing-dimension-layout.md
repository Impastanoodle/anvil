# Drawing dimension layout, 2026-11-16 (lane NS / drawauto, groups rfNS kernel + smoke)

The goal: no dimension, callout or note printed on top of another, on the shop's inch drawings. Expected behaviour is
SolidWorks 2024's (not opened on this machine).

## 1. Autodimension: values that crowd (shop-flow-3 item A3)

The box from shop-flow-3 job a (16 ga 8 x 6, four 2 in walls, circular corner reliefs). Its flat has a bend line .018 in
from the relief edge next to it on each side (1.949 / 1.967 and 9.828 / 9.846).

What I measured on main:
- **Ordinate** was already right. Values closer than the text height were already jogged with a leader (render: texts
  1.4 text heights apart, three-segment leaders), with 0 overlaps in the engine and in the app. A3's "on top of each
  other" could not be reproduced.
- **Baseline** printed two pairs on top of each other. A vertical stack puts horizontal values about .49 in wide only
  8 mm apart.
- **Chain** printed two pairs on top of each other. A .018 link puts its value past the far arrow, onto the next link's
  value.

Fixes, all in `drawing-render.js` unless named:
- Baseline: a member whose text would meet an earlier member's steps out 4 mm at a time.
- Chain:
  - Autodimension's links no longer carry a click side (`tside`, `drawing-annotations.js`), so a value that does not fit
    goes to a clear spot (`placeLinearOut`, up to 8 steps for dimensions on one line).
  - A run of links on one line is placed longest first (`placeOrder`). The list order and `dimIx` are kept.
  - Three or more equal links too short on paper for their values become one dimension, `29X .733`
    (`drawing-annotations.js`). Links that fit are never merged.
- Ordinate: a set whose values meet texts placed before it steps its line out 4 mm at a time, up to 40 mm. This is the
  600-hole panel at 1:8, where 30 jogged values across ran into the column of values up the side.

| Case | Before (text pairs overlapping) | After |
|---|---|---|
| box flat, ordinate | 0 | 0 |
| box flat, baseline | 2 | 0 |
| box flat, chain | 2 | 0 |
| 600-hole panel 1:8, ordinate | 4 | 0 |
| 600-hole panel 1:8, chain | 65 | 0 (`29X .733`, `19X 2.300`) |
| 600-hole panel 1:8, baseline | 0 overlaps, 44 texts off the sheet | same: 30 stacked baselines cannot fit; use Ordinate |

No text sits on the view in any of these cases.

## 2. Lofted-Bend flat

Already right in the engine since rfMZ: the overall width and height come from ordinates between the outline's extreme
points. Smoke rfNS d confirms it from Tools ▸ Autodimension in the app: `0, 10.496 ; 0, 4.736, 5.119`. The 4.736 is a
straight edge square to the axis.

## 3. Centre marks on a perforated panel

Already right since rfMZ. On the 600-hole flat at 1:8 the marks shrink to 0.4 of the pitch: a .073 in cross on a
.092 in pitch, never touching.

New: an Auto insert mark that would shrink under 0.5 mm a side is left off, and the sheet warns once per view, e.g.
"Drawing View1: 1200 centre marks left off, the holes are too close together at 1:8. Use a larger scale or a Linear
Center Mark." With 1200 holes the cross would have been 0.47 mm. A mark the user placed is always drawn.

Timings in Node on a busy machine:
- 600 holes: autoInsert 13–170 ms, compute 1.4–2.0 s, the same before and after.
- 1200 holes: compute 4.7 s.

## 4. Arrangement audit by clicks (smoke rfNS a–d, headless Chrome)

| Drawing | Steps | Before | After |
|---|---|---|---|
| a. tray 10 x 6, 16 ga, bend notes | Make Drawing, Sheet2, Tools ▸ Autodimension ✓ | 0 / 0 / 0 | 0 / 0 / 0 |
| b. bracket, UP + DOWN, 3 views + flat | Smart Dimension (edge + place), Hole Callout (2 clicks), Autodimension on the flat | 0 / 0 / 0 | 0 / 0 / 0 |
| c. 24 x 48 panel, 96 holes, 1:8 | Hole Callout on a corner hole, Autodimension | 0 / **1** / 0: `96X Ø.250 THRU ALL` across the flange line | 0 / 0 / 0 |
| d. square-to-round flat | Autodimension | 14 bend-note pairs | 14 pairs, now with a sheet warning |

Columns: texts on texts / texts on view lines / arrows on texts.

Fixes from the audit:
- c: a default-placed Hole Callout now also turns its leader off the view's own lines (`ktCalloutsClear`).
- d: 20 fan bend lines meet at the corners. Their notes cannot all be clear. Every bend keeps its note (rfMV pins that),
  and the sheet now says "14 bend notes cover another … Use a Bend Table or drag the notes." The check uses the turned
  text outlines (`textsCross`), not their boxes.

Arrows: linear dimensions already flip the arrows outside when the text does not fit (render `linear`). None were found
inside a too-tight span.

Exports: every numeric dimension text is in the R12 DXF as a TEXT at the screen's point within .005 in, and in the PDF
at the same place (`rfNSExports`), on all four drawings.

## 5. Make Drawing of the 600-hole panel (asked by the head)

Timed alone, twice each, in headless Chrome. "ready" is from File ▸ Make Drawing from Part until the views land.

| Build | ready | autoInsert |
|---|---|---|
| 2c9c685 (0.1.27) | 6.3, 6.5 s (8.0, 11.2 s on a busier minute) | 1.0–1.5 s |
| main bc27d5f | 13.5, 15.0 s (18.1, 22.4 s) | 6.7–6.9 s |
| main + fix | 7.7, 7.8 s (4.5, 5.0 s on a quiet minute) | 0.9–1.2 s |

Cause: rfNL's slanted-rim ellipse groups in `meshCurves` (`drawing-curves.js`). For every cylinder-to-plane mesh edge
it scanned the plane face's polygons for analytic records before testing whether the edge was slanted at all. That
scanned the whole plate face once per hole-rim chord, on the main thread (Auto insert) and again in the worker.

The fix tests the slant first and scans each face at most once. Output is identical (the same predicates in another
order). Work counter `Drawing._.curveOps.polyScans`: kernel rfNS pins it at no more than the number of faces, and the
30° flange hole still gets its ellipses. In Node the engine path was equal before and after (Make Drawing 9.2 s both).

## Existing tests
None changed. These ran before and after, all green: kernel drawing groups (rfJM's chain order is kept by
`placeOrder`), and smoke rfJM, rfKT, rfMZ, rfMV, rfGT, rfKM, rfNL, drawing-annotations, rfBX, rfLG, rfJQ, rfJB, rfJR,
rfIR, rfMS, rfHX, rfLA.

## Left
- Lofted-Bend bend notes `R0` on a sharp facet (ANSI inch would print `R0` or `R.000`; not changed).
- Baseline on a dense pattern runs off the sheet (inherent).
- The Ordinate Dimension tool by clicks was not re-audited (Autodimension's ordinate covers the layout code).
