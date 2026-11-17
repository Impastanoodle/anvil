# Solids fidelity 3, lane NI (solidfid3), 2026-11-16

Continues `2026-11-15-solids-fidelity-2.md` (lane NC). Tests: `anvil/tests/kernel/rfNI.js` (12 hard rows); three TODO
rows promoted in `rfFV.js`, `rfFY.js`, `rfGA.js`. "Closed" is `Evaluate.checkBody` open and non-manifold edges both 0.
"Before" is main at 2c9c685, built from an untouched `git archive` copy in the worktree; every before / after below was
also measured in one process by switching this lane's three rules off one at a time (`K.openGuard.trueTangent = false`,
`K._.triangulate.cw = false`, `K.outlineOptions.exactTwin = false`). OpenCascade numbers are Anvil's own
`OcctKernel.build` on the same script (it picks the nearest true edge and lets OpenCascade propagate).

None of the three "fillets that could not close" was a boolean that cracked. Each was a tool that was wrong before any
boolean, and each cause also moved parts that had been building, closed, with the wrong shape.

## 1. Round fuzz 259 (chamfer "could not close"): the tangent chain ran across a true corner

- Part: plate, Ø.5 boss, a Ø.5 through hole whose axis is .489 from the boss's (it bites .011 into the boss), R.225 on
  the boss's root, chamfer .1125 on its top rim. The root fillet built (see 4); the chamfer was refused.
- Measured: the chamfer's four tool pieces were each closed (171 + 11 + 11 + 11 polygons); their union had 80 open
  edges .001 to .28 long. The three small pieces were straight-edge prisms on the three chords of the HOLE's rim inside
  the bite. `resolveEdges` chains edges whose chords turn less than 28° (a 16-chord circle's own chords turn 22.5°).
  The boss's rim and the hole's rim are two equal circles crossing at 24°: the chain ran from one onto the other.
- Fix (`kernel-mesh.js`, `rfNItangent`, in `resolveEdges`): where both edges are true curves (a chord of a circle
  recorded on one of its faces, a straight edge between planes, a cylinder's ruling) and at least one is a circle,
  their TRUE tangents at the shared vertex must agree within 8°. Chords of one circle chain as before; two straight
  edges keep the chord rule (they may be chords of a spline, which carries no record). `bodyEdges` remembers each
  edge's mesh in a WeakMap; `resolveEdges(specs, edges, tol, mesh)` takes the mesh as an optional fourth argument.
- 259 now: 31 edges selected (was 34), one tool, the chamfer closes on the guard's first attempt.

The same rule moved every fuzz part where a round ran on round a second circle (all ok → ok unless said):

| part | before, off OpenCascade | now, off OpenCascade |
|---|---|---|
| stack 89 (ring + combined disc, R.03 rim) | refused: "The radius may be too large" | builds, −8.8e-6 |
| stack 550 (mirrored ring, rim fillet) | that fillet refused | builds, −3.8e-6 |
| stack 365 (disc mirrored 1 in off centre, chamfer) | −4.0e-4 | −2.0e-6 |
| stack 392 (mirrored ring) | −2.5e-3 | −5.5e-5 |
| stack 764 (mirrored ring, R.125 rim) | −2.8e-3 | −8.4e-5 |
| stack 772 | −1.0e-2 | −5.6e-4 |
| round 259 | refused | +1.7e-4 (the plain root fillet, see 4) |
| round 688 (two bosses, rims at 15°) top fillet alone | removed 27 % more than OpenCascade | 8 % more |
| stack 576, 606; round 434, 648 | moved 6e-6 to 2e-3 | OpenCascade fails on these (shell / fillet): no reference |

Not exact yet, and why: **an open chain ends in the meridian plane of its end vertex.** Two discs R1, .35 apart (rims at
20°), chamfer .1 picked on one rim: Anvil removes exactly that arc's sector of the chamfer ring (to 1.4e-6);
OpenCascade removes 5.5 % less (1.902993 against Anvil's 1.902114, 4.6e-4): it ends the chamfer on the other disc's
wall, extended. On 259's boss the other way round: OpenCascade runs the chamfer's cone on to the hole's wall, Anvil
leaves .0005 in³ of the boss's top edge inside the bite sharp (8e-5 of the part). Neither is measured in SolidWorks.
Round 688's root fillet (its pick lies inside the larger boss, .16 from any edge) adds 22 % (before) and 33 % (now)
less than OpenCascade's; not looked into.

## 2. Stack fuzz 226 (fillet "could not close"): a prism over a clockwise outline was no solid

- Part: a disc with two grooves and a block standing on its top, R.125 on the rim. Where the round's setback lies
  under the block, the block is kept whole: the prism over its footprint is taken off the tool (`rfFRbossPrisms`).
- Measured: tool closed (800 polygons, volume 1.0977), prism closed (209 polygons), `tool − prism` 15 open edges
  and volume 1.1012: larger than the tool. `tool ∩ prism` −0.0035. With every `CSG.options` switch off: the same. The
  prism's top cap had triangles facing up and down.
- Cause: the footprint is an inner loop of the top face (clockwise), here the outline of both grooves and the block
  together, not convex. `triangulate` (kernel.js) clips ears of counter-clockwise loops; a clockwise loop finds no ear
  and falls to a fan from vertex 0. A fan of a convex loop is right (boss circles, hole circles: every case that
  worked). A fan of a loop that is not convex has triangles of both windings: closed, right `volume()`, no solid.
- Fix (`triangulate`): a clockwise loop with a reflex corner is ear-clipped the other way round and its triangles
  handed back winding as the loop does. Convex clockwise loops and all counter-clockwise loops return what they
  returned (hard row: identical triangle lists).
- 226 now: closed on the first attempt, −1.15e-5 of OpenCascade (6.963799 / 6.963879).
- The same prism is used for a hole a concave round rests on (`rfGGholePrisms`). By this rule alone no other corpus
  part changed status; a few stack volumes (37 among them) move in the last digit (2e-15).

## 3. "Mass Properties of a round from a Ø.5 bore is 4.5e-4 off": the solid was wrong, not the integral

- Lane NC's repro in mm is exact (2.5e-14). In inches (the document it was found in) it is 4.5e-4 heavy. The inch tube
  has a 48-chord outer rim and a 32-chord bore; `massProps` of it without the round is exact.
- Measured: the round's chain had 31 vertices, open, plus one "straight" edge; 180 torus facets instead of 192. One
  11.25° sector of the bore's rim was not rounded at all, and the next was rounded as a straight edge. The 4.5e-4 is
  that sector's metal (.0008 in³ less what the straight piece took).
- Cause, in `faceOutline` (kernel-mesh.js): the cap's triangulation leaves a split point S 2.8e-4 from the bore's rim
  vertex V (on the line of the next chord, in the cap's interior) and a point S2 on the rim's chord 5.6e-5 from S.
  The outline welds points within 1e-4: S and S2 are one vertex. Two edges then run from that vertex to V: the
  interior piece S → V (cancelled by its twin V → S) and the boundary piece S2 → V. By count one of the two is
  boundary; the first in the list was taken: S → V. The outline went through S instead of S2; S, V and the next rim
  vertex are collinear, so the collinear pass dropped V. The rim's chord ended 2.8e-5 off the circle and
  `arcEdgeInfo` no longer took it for a chord.
- Fix: of several copies of a welded edge, the boundary ones are those with no reversed twin on exactly their own
  two points (`exactTwin`); with no such distinction the first is taken as before.
- Now: the outline's inner loop is the 32 rim vertices, each on the circle to 1e-16; R.25 from the bore 2.6e-14 off
  the closed form, chamfer .25 1.3e-12.

Rim sweep, 204 rounds and chamfers (7 inch tubes, bore and outer rim, and 3 discs; sizes 50, 62.5, 75, 90, 99.9 and
100 % of the face; closed-form volume to 1e-6; `test-reports/repros/rim-sweep.js <checkout>`. Lane NC's 148-part list
was not committed; this is the same idea on a list of my own):

| | builds, volume = Pappus to 1e-6 | volume off | refused |
|---|---|---|---|
| before | 192 | 10 (tube 0.75 / 0.25, bore: 4.5e-4 to 8.8e-3) | 2 (the same tube, full width) |
| now | **204** | 0 | 0 |

The same rule moved, in the fuzz corpora (all ok → ok): stack 600 (−6.3e-7 → 3.5e-10 of OpenCascade), stack 775
(2.4e-6 → −3.1e-9), round 327 (5.3e-7 → −3.4e-14), round 167 (−2.6e-6 → −1.8e-6), round 11 (−4.5e-6 → −7.8e-6: two
overlapping bosses, the only one further off), and stack 631 loses a fillet refusal (three other errors stay).

`massProps` itself (`curveDensity`, `curveCorrection`, `boundCorrection`) is untouched.

## 4. Looked at, not changed

- **259's root fillet** (R.225 at the boss's root beside the hole) fails all seven attempts with rails (106 to 285 open
  edges) and closes on the last, `plain`, as before. Measured on the first attempt: the tool is closed but crosses
  itself (248 crossing pairs of its 832 triangles, near the hole's far flank). The ball rests on the hole's rim there
  (`rfGGring`), and where the setback's path heads straight for the rim the contact point stands still or runs
  backwards while the ball runs on: every ring of that stretch ends on (nearly) one point. Over round and stack fuzz
  1000 each, 58 parts use rails; the four whose contact point runs backwards (round 259, 931; stack 578, 926) are four
  of the five that fall through to `plain`, and none that closes on its first attempt has one (round 636, a chamfer,
  has one and closes on its second). So "contact point runs backwards → plain at once" would save seven booleans
  (about 1 s) on those and change no result but 636's; not done, since it buys no fidelity and SolidWorks is not
  measured there. The plain round is 1.7e-4 heavier than OpenCascade's on 259.
- **The R2 round on a spline's end-face edge** (rfFV / rfFY TODO): already right on main. At chordTol .0005 it builds
  on the guard's first attempt, 0 open, 0 non-manifold, guard on or off; removes 39.531986428 against the sketch-plane
  face's 39.531985929 (1.3e-8). Both rows are hard rows now (rfFV asserts 0 non-manifold, was ≤ 3; rfFY fails on a
  refusal).
- **The "rfGB TODO" row** is rfGA's `G10 on OpenCascade` note (Mirror of a fillet: "the bbox / body check is skipped
  while Anvil's own Mirror of a fillet grows the bbox"). Stale: Anvil and OpenCascade both give one body, bbox
  [−2, 0, −1] .. [2, 0.5, 1], 3.946349541 = the closed form. The note is removed, so the row checks bbox and body
  count again.

## 5. Corpora (all on the final code; 4 processes)

| | before | now |
|---|---|---|
| stack fuzz 1000 | 646 ok, 354 refused, 0 open | **647 ok, 353 refused, 0 open** |
| round fuzz 1000 | 967 ok, 33 refused, 0 open | **968 ok, 32 refused, 0 open** |
| sheet fuzz 1000 | 912 ok, 87 refused, 1 open (91, the true line contact) | the same; **no volume moved** |
| rfFT table (69 parts) | 0 open, 0 refused | the same; one row differs: S11 (block, Ø.5 hole chamfered .03) 5.797058338 → 5.797055951 = OpenCascade's 5.797055951 (rule 3) |
| rfGA table (48 rows) | 0 open, 2 refused, 1 not in Anvil | the same; no row's status, errors, bbox or volume (9 decimals) differs |
| examples (29) | | 29 / 29, and 29 / 29 with `--occt`; polygons (a hash of every vertex and plane) and `massProps` (its JSON) of all 29 **bit-identical** before and after |

No seed that was closed is open; no seed that built is refused. Status changes: round 259 refused → ok; stack 89
refused → ok; stack 226, 550, 631 one fillet refusal fewer each (their rib refusals stay). Volumes that moved by more
than 1e-7 with the same errors: stack 365, 392, 576, 606, 764, 772 and round 434, 648, 688 (rule 1, table above);
stack 600, 775 and round 11, 167, 327 (rule 3). 20 stack and 7 round volumes moved in all, the rest under 1e-7.

"Could not close" refusals left in the three corpora: none.

## 6. Not reached

- Task 3 (`bandSnap`'s cost; the perforated-panel booleans of `2026-11-15-occt-panels.md`): not started.
- The chain-end rule of 1 (run an open chain's end on to the wall that cuts it, or stop it on the neighbour's
  extended wall): needs SolidWorks numbers for the two cases first.

## 7. For other lanes

- `ui-commands.js` (lane commands), lines 1843, 1845 and 1898: the edge highlight of the Fillet / Chamfer
  PropertyManager calls `K.resolveEdges(specs, edges, tol)` on `App.edges`, which may be copies posted by the worker.
  Those have no link to their mesh and chain by the old chord rule, so at a 15° to 28° corner between two circles the
  highlight shows more edges than the feature takes. Fix: pass the mesh as the fourth argument,
  `K.resolveEdges(specs, edges, tol, App.edgesMesh || App.mesh)`.
- `anvil/tests/fixtures/rfFT/compare.js` still counts sheet 91's warned line contact as open (lane NC's note).

## Existing tests changed

- `rfFV.js`: the spline end-face row is a hard row and asserts 0 non-manifold edges (was a TODO row allowing 3).
- `rfFY.js`: the same part: a hard row; a refusal fails it (was reported as TODO).
- `rfGA.js`: G10's OpenCascade note removed, so its bbox / body-count check runs (it passes).
- `kernel-tests.html`: one manifest line. No expectation weakened.

## Suite

- Kernel, whole: **3060 / 3060** (3049 − 1 + 12: G10's "on OpenCascade" TODO row is gone with its note; 12 rfNI rows), 318 s on 8 workers with six other agents running. `rfNI` alone: 12 / 12, 44 s in one process.
- Examples: 29 / 29 on Anvil's engine, 29 / 29 with `--occt`.
- Not run: `occt-tests.html`, ui-smoke (no smoke rows in this lane; the head runs the page).

## Harness

The three switches above; `K.openGuard.log(fn)` (every attempt of the open-edge guard: the feature, the step that
follows, the count, the tools) and `K.openGuard.toolLog(fn)` (the tool's pieces before they are joined, the selection,
the prisms taken off): a tool that is no solid shows as closed pieces whose union or difference is open. Checks that
found the three causes: `vol(A − B) + vol(A ∩ B) = vol(A)`; a box against each operand alone; crossing pairs of an
operand's own triangles.

```
node test-reports/repros/fuzz-rows.js --root <checkout> --table rfGA --kind stack --from 1 --to 250 --out rows.jsonl
                                          (every seed with status, errors and volumes at full precision: diff two runs)
node test-reports/repros/rim-sweep.js <checkout>
node anvil/tests/fixtures/rfFT/compare.js --table rfGA --fuzz 500 --seed 1      (and --seed 501; 4 processes at most)
node anvil/tests/fixtures/rfFT/compare.js --fuzz 500 --seed 1                   (sheet and round)
node anvil/headless/anvil.js test --only rfNI
```
