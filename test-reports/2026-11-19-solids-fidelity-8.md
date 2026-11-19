# Solids fidelity 8, lane solidcracks (rfQJ), 2026-11-19

Round local-2026-11-18b, base 073cdda (local main with lane stepread). Continues `2026-11-19-solids-fidelity-7.md`
sections 2 and 3 (its fuzz `rfONfuzz(kind, seed)`; seeds written kind letter + seed). Files: `anvil/kernel-rebuild.js`
(`tangentContacts`, `tangentRefusal`, called from `zeroThickness`), `anvil/csg.js` (healPass: `unspike`, step 2c,
`CSG.options.healFold`), `anvil/exchange.js` (writer: `Exchange.pinchSplit`); tests `anvil/tests/kernel/rfQJ.js` (8),
`anvil/tests/occt/rfQJ.js` (1).

## Table (Anvil's engine, the 540 stacks of report 7: plate 200, block 120, turned 100, multi 60, step 60)

| | before (073cdda) | after |
|---|---|---|
| STEP read back with open / non-manifold edges | 18 | **3** (m6043, s6019, one more not traced) |
| stacks with a feature refused by the new tangent check | 0 | 24 (below) |
| drilled lofts open (`free` f6001, f6040) | 2 | **0** |

## 1. Holes tangent to a wall: refused (task 1)

`tangentContacts(body)` reads the `surf` records: a cylinder whose axis lies r (to 1e-9 x max(1, diagonal)) from a
parallel plane of the part, or two cylinders whose axes lie r1 + r2 or |r1 - r2| apart (parallel axes: a line; skew
axes: the point on the common perpendicular), the two faces' outward normals opposite there, each face present at the
touch (its facets cover it) and both faces going on past the touch on both sides (a pinch). A cusp is not refused:
two rounds of a body mirrored onto its own face meet tangentially with opposite normals too, but each ends at the line
(the first version of the check refused 38 stacks, 14 of them such cusps). `zeroThickness` then refuses a feature that
makes a contact the bodies before did not have:

> This feature would create zero-thickness geometry: the wall of a Ø0.25 hole is tangent to a flat face of the part
> along a line through (-1.0272, 0, 2.125), so the solid would touch itself there. Move the feature 0.001 in or more
> toward or away from that face so the wall has a thickness or opens up.

(0.025 mm in a mm part; for two cylinders "... a Ø0.2 hole is tangent to a Ø0.3 hole ...", at a point "... at the point (1, 1.1863, 0)".)

- The 14 seeds of report 7 section 2: **12 refused** (p6006 p6036 p6044 p6061 p6063 p6105 p6109 p6123 p6130 p6132
  p6137, t6096 at a point). **t6028 and m6035 are not tangencies** (t6028: a cross hole as wide as the keyway it
  crosses, the hole's wall continuing the keyway's wall with the SAME normal, as a slot's end does; m6035: a cylinder
  boss tangent to the box's top face from inside, also the same normal). Both are fixed in the writer (section 3).
- Refused across the 540 stacks: 24 (p6006 p6036 p6040 p6044 p6057 p6061 p6063 p6105 p6108 p6109 p6123 p6130 p6132
  p6137 p6169 t6004 t6021 t6041 t6047 t6049 t6055 t6082 t6096 m6039). Each was checked to be a true tangency: a hole
  tangent to a plate edge or to the plate's bottom (m6039), a cross hole tangent inside a bar's or tube's outside at
  a point (t6004 t6021 t6041 t6055 t6082 t6096), a boss filling a bore up to one point of it (t6047, t6049). 12 of them
  read back closed before by luck of the facets. The clean count drops by those 24 only; nothing else changed.
- Kept building (rfQJ row 5): a slot, a corner round with a hole on its axis, a boss on a bar tangent to its outermost
  ruling (same normals), the t6028 keyway. A hole 1e-4 inside the wall or 1e-4 through it builds (row 2).
- Two tangent holes are now refused whatever the facets do (rfQJ row 3: at 30 deg, no facet vertex on the line).
- **OpenCascade**: builds the tangent hole (valid by its check, 12.725456 against Anvil's refusal). The two agree in the
  app already: the message matches `K.isRefusal`, and ui-occt.js `withoutRefused` suppresses the feature in
  OpenCascade's copy. No occt-kernel.js line is needed. (Headless `build --occt` builds it, as for every refusal.)
- **SolidWorks** was not checked; report 6 notes SolidWorks refuses tangent holes in a pattern (rfGD).

### Existing tests that build tangent geometry on purpose (head: decide; not edited)

| file:line | row | now |
|---|---|---|
| tests/kernel/rfAC.js:24 | "a circle tangent inside an edge" (`rect(0, 0, 20, 10).circle(5, 3, 3)`, tangent to y = 0) | refused (Ø6 hole tangent to a flat face) |
| tests/kernel/rfFL.js:30 | "hole tangent to the plate edge" | refused |
| tests/kernel/rfFL.js:31 | "slot whose round ends touch both end walls" | refused |
| tests/kernel/rfQE.js:37 | t6055, a cross hole tangent inside the bar's outermost ruling | refused at the point (0.75, 0.6565, 0) |
| tests/kernel/rfQE.js:38 | t6082, a cross hole tangent inside the tube's outside | refused at (1, 0.4367, 0) |

Proposed: rfAC drop the tangent circle or expect the refusal; rfFL expect the refusal for the two rows (or move them
1e-3 off); rfQE replace t6055 / t6082 by the same holes 1e-3 off tangent (or expect the refusal).

## 2. Drilled lofts closed (task 2)

Both cracks were healable; `healCracks` had the right move and then refused it.

- **f6001** (open 2 + 1 non-manifold -> **0**): the crack a-b-c (b on the loft's fold, 6.4e-6 off the hole facet's
  chord a-c). Step (2) inserted b into the chord, but the hole facet there is a needle (c, a, p3 with p3 1.6e-4 from a)
  whose second long edge p3-c runs within 3e-5 rad of c-b: `spiked` called it a fin and kept the old outline, every pass.
  `unspike(ids1, P, ids0)` drops the needle's tip c instead (a vertex of the old outline where it turns back, next to
  an inserted point); c's neighbours across both edges pair with b. Volume 11.499850931 -> 11.499850935 (the crack's fill).
- **f6040** (open 2 + 1 non-manifold -> **0**): on the flat cut x = .75, a needle polygon (5 points, 7.7e-5 wide) ran
  1.8e-5 past the end of the chord its coplanar neighbour has (2.7e-6 aside): the two overlapped by the triangle
  A0-X1-X2 and the edge X2-X1 was used three times. New step (2c): a corner b of a->b->c (next to an open edge) lying
  within HEAL of another polygon's open chord c->a (as a segment) is dropped when the outline turns back at b (more
  than 170 deg), the polygon's other edge at b is used three times or more and the chord only once, and step (2) does
  not insert b anywhere. Each guard came from an existing test: the rfFL near-miss row (a real 4e-6 dent goes into
  its neighbour's edge), rfGF's 359 deg rolled hem (a square corner 9e-6 from a near-miss chord: dropping it made a
  non-manifold edge). Volume 6.649974661 -> 6.649974617.
- Both behind `CSG.options.healFold` (default on). Never worse holds (the heal's own revert).
- **Not measured**: a fuzz sweep of every stack with `healFold` on and off (volume moved > 1e-12, open counts) was
  started twice and stopped unfinished after 80 min (it builds each stack twice and prints only at the end). What
  stands for it: the whole kernel suite (every pinned volume equal, see Tests) and the 29 examples on both engines.
  To run it: per stack `CSG.options.healFold = false`, build, `Evaluate.checkBody`, volume; `= true`, the same; compare.
- Existing tests whose "with the option off this part was open" control is now closed by the heal (head: add
  `CSG.options.healFold = false` next to the option they switch off; with it they pass, 16 / 16):
  rfMP.js:36 `rfMPoff` (rows "stack fuzz 773 ... open with CSG.options.band off" and "the snap is undone ...
  CSG.options.cracks", rfMP.js:103), rfNC.js:98 row "stack fuzz 908 ... open with CSG.options.bandWide = 0", rfPI.js:117
  (`rfPIwith(X.importOptions, 'rowFix', false, ...)`: "with the switch off" now 1196 pairs in the band, 0 open; with
  healFold off as well rfPI is 8 / 8).

## 3. The other cracked read-backs (task 3)

Writer, planar faces: a loop through one vertex twice (two pieces of a face touching at a point) is written as two
loops (`Exchange.pinchSplit`). One loop read back with an edge used by four faces.

STEP sweep, the same 540 stacks, split off / on: read back closed 533 -> **537**; changed files 13, of which fixed
**t6011 (1 -> 0), t6022 (2 -> 0), t6028 (1 -> 0), m6035 (1 -> 0)**, the other 9 the same (open 0, read-back volume
identical to 2 digits shown: p6106 p6121 t6002 t6017 t6032 t6063 t6085 t6090 m6010). No file worse.

OpenCascade reads Anvil's t6028 file at the volume (occt rfQJ) but BRepCheck calls it not valid, with the split or
without: not traced.

Left:
- **m6043** (3 edges "oriented inconsistently"): one triangle of the pocket wall (cylinder r .25 about x = 1.5, axis y)
  at (1.4512, .5, -.2452), (1.4378, .2561, -.2421), (1.4375, .25, -.2421): `cylPatch`'s ear clipping takes the ear
  where the side hole's arc leaves the pocket floor vertically (in (u, v) the arc's first chord c-b passes 3.5e-5 left
  of the diagonal c-a; the triangle lies outside the loop). Repro: `node probe.js multi 6043` (report 6 section 3), or
  `p.sketch("Top").centerRect(0, 0, 3, 3).end().extrude(0.5); p.sketch("Top", 0.25).circle(1.5, 0, 0.25).end().extrude(0.25, { merge: false }); p.intersect({ regions: [true,false,false] }); p.sketch("Top", 3.75).circle(1.625, -0.2, 0.125).end().cut("through", { reverse: true }); p.sketch("Front", 5).circle(1.5, 0.25, 0.0625).end().cut("through", { reverse: true });`
- **s6019** (14 non-manifold read back): not traced.

## 4. Not done

Task 4 (zero-area polygons 13, screen-mesh sliver holes 11).

## Tests

kernel rfQJ 8 / 8 (tangent hole refused with its reason and line; 1e-4 gap / overlap builds; tangent pair at 30 deg
refused; tube touched at a point refused; five tangent-but-valid parts build; f6001 and f6040 closed; t6028 read back
closed to 1e-8), occt rfQJ 1 / 1. Kernel full 3392 / 3401: the 9 failing rows are the 5 tangent-on-purpose rows of
section 1 (rfAC, rfFL x2, rfQE x2) and the 4 "open with the option off" controls of section 2 (rfMP x2, rfNC, rfPI).
Examples 29 / 29, with --occt 29 / 29; occt-tests 328 / 328. No STEP face count pin in tests/kernel/exchange.js /
true-curves.js moved.
