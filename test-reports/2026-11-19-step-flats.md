# STEP to flat: customer files through Insert Bends (lane stepflats, rfQR, 2026-11-19)

Base 913d129. Corpus script: `test-reports/repros/step-flats-corpus.js` (parts in `step-flats-parts.js`):
`node test-reports/repros/step-flats-corpus.js [--only id,id] [--json out]`. Each part is built by script, its own flat
taken, written by Anvil's STEP writer, read back with `Exchange.importFile` + `newPartFromImport` (a dumb solid), Insert
Bends at a point on the original Base Flange's face with the part's T and K, then compared with the part's own flat:
bends (angle and R), loop count, blank area and every outline side (1e-6 in; 1e-4 mm²). The OpenCascade writer
(plain and NURBS-converted, every face a B-spline surface) runs in `anvil/tests/occt/rfQR.js`.

## Corpus

| part | Anvil STEP | OpenCascade STEP | OpenCascade NURBS |
|---|---|---|---|
| L 16 ga K .44, holes .2 from the bend | 1 bend, = (5e-10) | = | = |
| L 3 mm R 3 K .5, Material Inside, holes | = | = | = |
| U 1.5 mm K .4, holes near both bends | = | = | = |
| U 11 ga R .12 K .33, Material Inside | = | = | = |
| Z 135 + 45 deg 11 ga K .33 (open profile) | 2 bends, = (2e-9) | = | = |
| hat 20 ga | 4 bends, = | = | = |
| tray 16 ga rect relief | **was -0.0195 in²** -> = (4e-10) | = | = |
| tray 16 ga tear relief | **was -0.062 in²** -> = | = | = |
| tray 1 mm obround relief | **was -5.0 mm²** -> 1.3e-8 | = | = |
| tray 16 ga, four butt Closed Corners | = | = | = |
| closed + open Hems 20 ga | 2 bends, = | = | = |
| Jog .5 x 1 | 2 bends, = | = | = |
| Miter Flange L | 4 bends, = | = | = |
| partial flange (offsets 1 / 1.5), rect relief | = | = | = |
| flange with a profile (gusset end) | = | = | = |
| flange on a slanted edge 11 ga | = | = | = |
| Cross-Break panel (the break is not in a STEP) | = | = | = |
| flared lip (37 deg) | -3.84e-3 in², warned | same | same |
| louver + 2 dimples, mm | +10.2 mm² (1 loop vs 2), warned | same | same |
| tray 11 ga 135 deg, 1 in walls, obround (task 1) | **was -0.24 in²** -> 4.5e-5 | 4.5e-5, 1 open edge read | same |

`=` : bends, loops, area and outline sides equal to 1e-6. Legitimate differences (both warned in the flat):
- flared lip: the two crossing lip bends' corner is squared by one flat and drawn along the slant by the other (known
  since eeb5f9c; the warning says "may draw it along the slant"). Needs a SolidWorks blank of a 37 degree flared lip.
- louver: the STEP has the lance closed (its slit width is the tooling's); Insert Bends warns "a lance or louver: its
  slits are not in the blank ... Add them before cutting". The own flat cuts the 40 x .254 mm slit.
- 135 degree tray with 1 in walls: the walls collide at the corners (each wall leans 0.7 in over the sheet); see Open.

## Fixes

1. **Bend relief past ~100 degrees, Material Inside** (`flangeLayout` / `flatPattern`): the solid's slot ran to
   `o1 = max(R + T, shift) + rd` but the flat's notch only to `max(BA, R + T) + rd`; at 135 degrees the bend moves in
   by 0.4588 (11 ga, R .12) > R + T, so the notch stopped 0.023 in short of the blank's edge: 4 closed holes of
   0.113 in². The relief record carries `reach` (o1) and the flat runs to it. 30 to 150 degrees x rect / obround / tear
   x 11 and 16 ga: one loop each; the metal the relief removes is the same in solid and flat to 1e-11. No change to the
   solid, so OpenCascade (which builds the same layout) needs no patch.
2. **Insert Bends: a bend end stepped by a folded relief** (`ibRoundEnds`): rfQF folds a relief slot into the
   neighbouring bend, so that bend's end is square over part of the arc and cut back over the rest. It was read as a
   slant from corner to corner ("ends on a mitre" warning, the strip's end drawn across the notch). Now: when two or
   more outer points sit at the record's end in one run reaching a tangent side and the rest are cut back, the end is
   square (`{ square, stepped }`) and the notch is cut as a gap in the bend's surface.
3. **Insert Bends: fixed face on the sheet's edge**: the Builder measured T across it as the part's length (4 in on a
   4 in L), and the extruded L passed as a flat plate 4 thick: a 1.6 x 2.1 blank, no warning. Now refused: "the face
   at (4, 0.03, 1) is the edge of a sheet (0.0588 wide, the thickness measured across it 4): pick a face of the plate".

Task 4: K .44 -> .33 after the conversion shortens the L's blank by pi/2 T x .11 to 1e-9; a bend deduction .1 gives
the outside lengths less .1 to 1e-9 (rfQR). The gauge was not changed: a gauge with another thickness than the solid
cannot apply to an imported solid (check what SolidWorks does: it likely rebuilds with an error).

## Cannot be converted (plain reasons)

Fixed face in the air: "no flat face at". Wrong thickness given: "not one thickness at ... rounded R ... inside is not
R ...". Two thicknesses: "no sharp corner between two walls T thick". A boss on the plate: built, flat warned "holds
12.3 % less metal than the part ... Do not cut this blank" (does not name the boss's face).

## Open

- 135 degree trays with 1 in walls (the audit's): the folded part holds more metal than its own flat x T (0.0344 in³
  per corner at 11 ga R = T, K .5; 0 with .05 walls): where a later wall crosses the earlier one, `hemCrossing` cuts a
  slanted slot from the earlier wall and the flat cuts that slot too, but the solid fills it with the later wall. A part
  whose walls collide; SolidWorks would likely refuse the flange. Insert Bends on it warns "1.5 % less metal". Check in
  SolidWorks before deciding the rule.
- OpenCascade's STEP of that tray reads with 1 open edge in Anvil's reader (exchange.js, not changed).

## Check in SolidWorks

The 135 degree Material Inside tray's relief (notch to the blank's edge); a tray with rect reliefs through Insert
Bends (the relief's bite into the neighbouring bend in the flat); the 37 degree flared lip's corner.
