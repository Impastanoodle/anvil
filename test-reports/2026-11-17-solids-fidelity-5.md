# Solids fidelity 5, lane PI (solidfid5), 2026-11-17

Continues `2026-11-16-solids-fidelity-4.md` and `2026-11-17-step-exact.md`. Tests: `anvil/tests/kernel/rfPI.js` (8).
"Before" is main at 0384568 (TEMP lane PF). Node 26, home PC, four other agents running. Fuzz rows were compared seed
for seed with `test-reports/repros/fuzz-rows.js` (status, message, errors, polygon count, volumes at full precision).

## 1. The open fuzz seeds: measured on main first

| seed | on main now | |
|---|---|---|
| stack 203 | 0 open, 0 non-manifold (its Cut-Extrude refusal is a true one) | already closed (lane MP) |
| stack 665 | ok | already closed (lane NC) |
| stack 908 | 0 open (its two rib refusals are true ones) | already closed (lane NC) |
| sheet 929 = rfFT pin 13 | ok, flat closed | already closed (lane NC) |
| sheet 91 = rfFT pin 6 | 0 open, 9 edges used four times | a true line of contact, which the part warns about (lane NC's finding stands); `compare.js` counts it open because it does not read warnings |

All 3000 fuzz parts on main: stack 647 ok / 353 refused, round 968 / 32, sheet 912 / 87 and the one "open" row, 91.
No row is open, none is refused with "could not close". Nothing was changed in `csg.js`.

## 2. The fillets that could not close: measured on main first

- **rfGA 226**: builds on the guard's first attempt, closed, −1.1e-5 of OpenCascade. Already right.
- **The R2 round on a spline's end-face edge**: already right (lane NI made both rows hard rows).
- **rfFT 259** (R.225 at the root of a Ø.5 boss that a Ø.5 hole bites, .49 from its axis): no longer refused on main,
  but it took eight attempts (seven with rails, 106 to 285 open edges, then `plain`) and its volume was off. Two
  causes, both fixed in `kernel-mesh.js`.

**(a) The hole's wall inside the round had no cylinder record.** The tool of a round over a hole has the hole taken
off as a prism over the face's loop (`rfGGholePrisms`; likewise the boss kept out of a convex tool, `rfFRbossPrisms`,
and the plate's outline). The prism's sides were flat chords with no record, so Mass Properties counted the chords'
segments as material. `rfPIloopCurves` gives each segment of the loop the circle of the wall facet it lies on (the
facet's cut with the face's plane, also when the facet runs past the plane or is in several pieces side by side), and
`_.prism` writes the record. The polygons are the same; only records change.

Reference: the same solid built the other way round (round first, then the hole) and the closed form (the torus less
the hole straight up, by quadrature over the radius about the boss's axis).

| part (hole, then round) | before | now | round, then hole |
|---|---|---|---|
| 259's boss, hole and round | 3.94e-6 | **−1.46e-8** | −1.46e-8 |
| the hole .52 from the axis (wholly inside the round's ring) | 3.72e-6 | **5.1e-10** | 1.9e-10 |

The two builds have the same facets (polygonal volume equal to 1e-15) and now the same records. OpenCascade builds
this solid too: 6.401920630647 against the closed form 6.401920630675 (4e-12) on 259 before its chamfer.

**(b) Seven attempts that could not work.** Where the setback heads straight for the hole's rim (along the hole's own
radius), the nearest point of the rim is one point for a whole stretch of stations: every ring of that stretch ends on
it and the rings cross. Measured over round and stack fuzz 1000 each (40 rounds with rails): the resting point's travel
over the setback's travel is under 5e-5 on four rounds (round 259, 931; stack 578, 926), and those four are exactly the
ones whose seven rail attempts all fail; it is at least 0.017 on the other 36. A round with a station pair under 1e-3
(`rfPIfalls`) now keeps its surface at once: the plain round trimmed by the hole and the plate's outline, which is
what the guard came to anyway. Round 259: 3.1 s to 0.19 s; 931: 3.2 s to 0.09 s; stack 926: 6.5 s to 0.26 s.
`K.openGuard.restCheck = false` and `K.openGuard.loopCurves = false` give the old behaviour; `K.openGuard.last` says
what the last guard did (`falls`, `plain`, `attempts`).

Not changed: a ball that does rest on a rim still rests there (the rfGG rows measured in SolidWorks: R.4 beside a Ø.5
hole is 8.8128518, 1.4e-4 lighter than the kept surface 8.8140659). What SolidWorks builds on 259 itself is not
measured. Round 464 still takes eight attempts (resting point's travel .067: another cause, not looked at).

### Fuzz, seed for seed against main

| | rows identical | status changes | volume moved |
|---|---|---|---|
| stack 1000 | 989 | none | 11 rows, 2e-12 to 7.3e-6 |
| round 1000 | 972 | none | 28 rows, 2e-12 to 8.3e-6 |
| sheet 1000 | 1000 | none | none |

Every moved row has a round or chamfer whose tool is trimmed by a hole, a boss or the outline; the sign is the one the
records must give (a hole's wall: lighter; a boss's wall: heavier). Proof that the new numbers are the nearer ones is
the table above (closed form, 3 parts); OpenCascade is no referee for most of the others (it keeps the surface where
SolidWorks and Anvil rest the ball on the rim, or fails the feature). Examples: 29 / 29, every part example's
vertices, polygon count and `massProps` volume **bit-identical** to main's (hash of every vertex).

## 3. A drilled part read from STEP and drilled again (`exchange.js`)

Repro: the rfNO loft (`centerRect` 4, 2, 4), out and back, two crossing Ø.5 holes, out and back, then one more hole.
My nine probes on main: 3 cracked (9 + 5, 9 + 5, 5 + 2 open + non-manifold edges), one more cracked (4 + 2) and one
was refused as zero-thickness geometry.

**Cause (measured).** A face with holes is read through `paramPatch` with its interior points in rows along the
face's straight lines, and `freeVolumeFix` then moved each interior point by its own quotient. Along one row the
quotients differ by a few 1e-6, so the flat strips between rows became triangles 1e-7 to 1e-5 off each other's planes:
**1196 neighbouring pairs** of the re-read body in the boolean's band. With the fix switched off there are 8, and
every probe closes, but the volume is 4.5e-4 off.

**Fix.** `freeVolumeFix(res, A, flip, rowKey)`: on a face straight one way with holes, the interior points of one row
(same parameter across the lines to 1e-9 of its range, the surface's own normal the same along the row to 1e-12) move
as one line, by the row's quotient (the volume its triangles miss over the volume a unit of its move adds). A row whose
normals differ (a twisted strip) keeps the old way. `Exchange.importOptions.rowFix = false` = before.

| | before | now |
|---|---|---|
| pairs of facets in the band, re-read drilled loft | 1196 | **0** |
| its volume | 22.783939766 | 22.783939783 (the part: 22.783929032, 4.7e-7 both) |
| 9 further holes: body closed, no error | 5 | **9** |
| their files read back closed, rel ≤ 1.4e-7 | 5 | 7 (the other two: below) |
| OpenCascade on 4 of the files | | 1 valid solid each, −1.3e-6 to −1.4e-6 |

`csg.js` `Node.build` was not touched.

### Found on the way, in STEP out (both on main, both on Anvil's own parts)

- **A hole straight through one slanted flat face threw a TypeError on export** (`loopEdges`: a loop with no break
  was taken for a circle; here it is one whole ellipse). A wedge with a through hole could not be saved as STEP.
  `closedEllipseEdge` writes the closed ELLIPSE: 7 faces, read back to 2.5e-15, OpenCascade valid, −3.8e-8; two through
  holes and a blind one, and a millimetre wedge with draft, likewise.
- **A hole across the corner of a spline loft wrote a file that is not valid.** The loft then keeps its facets, and
  each facet counted as a "true plane" (it carries no record), so the hole's rim became 16 to 52 ELLIPSEs. Four cases
  (own loft and re-read loft, two holes): OpenCascade "not valid" on three (2e-3, 1e-2, 1.2e-2 off) and Anvil's reader
  refused two and read one with 120 open edges. `truePlane` now leaves out triangles of a free-form face that keeps
  its facets (`deadFree`): the rim is chords, the wall still a CYLINDRICAL_SURFACE. All four: OpenCascade valid, Anvil
  reads them closed, 9e-6 to 5.4e-5 off (the faceted loft: not exact, but right).

## 4. Mass Properties, the sample window (coordinator's note)

`massOptions.sampleWindow` 8 to 1. It changes no result, by argument and by test: each cell index of the sample before
lies between the older sample's and this one's, so a cell within one of an older sample and of this one is within one
of the sample before; and a cell opened twice adds nothing (its edges are stamped). rfNT's two rows that compare the
default with `Infinity` pass unchanged (same correction text, same counts); rfPI compares 1, 8 and Infinity.

## Suites

- Kernel: **3219 / 3220**; the one red row is rfNI's (below). `rfPI` 8 / 8.
- Examples 29 / 29, with `--occt` 29 / 29.
- `occt-tests.js`: see the lane's hand-back.

## Existing test to change (not this lane's file)

`anvil/tests/kernel/rfNI.js` line 64. The row builds 259 with the old chord rule (`trueTangent: false`) and expects
the chamfer to be refused there, to show the row measures the rule. With the hole's wall carrying its record, that
chamfer now closes on its first attempt as the other solid (the chain running on round the hole: 6.393474363 against
6.394002848, 8.3e-5 apart). Not traced further than that: it is the record alone (`loopCurves`), not the rest check.
Replace the line with

```js
      assert(rfNIerrs(old).some(function (m) { return /could not close the chamfered faces/.test(m); }) || Math.abs(old.mp.volume - r.mp.volume) > 5e-5 * r.mp.volume, 'with the chord rule the chamfer is the same solid: the row does not measure the rule');
```

`rfNT.js` rows 2 and 3 say "last 8 sampled cells" in their titles; they pass, the default they compare is now 1.

## Unresolved

- Round 464 (eight attempts) and what SolidWorks builds where the ball cannot rest (259).
- A loft with a hole across its corner goes to STEP as facets (9e-6 to 5.4e-5); the exact form needs a B-spline face
  that lost an edge to a cut.
- Sheet 91's row in `compare.js` (a warned line contact counted as open): the harness, not the kernel.
