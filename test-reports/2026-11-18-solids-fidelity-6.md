# Solids fidelity 6, lane solidstep6 (rfON), 2026-11-18

Round local-2026-11-18a. Continues `2026-11-17-solids-fidelity-5.md`, `2026-11-17-step-exact.md`, `2026-11-18-step-snap.md`.
Files: `anvil/exchange.js`; tests `anvil/tests/kernel/rfON.js` (16), `anvil/tests/occt/rfON.js` (2).
"Before" is main at 6010879c. Home PC, five other lanes running.

**Read this first.** The brief asked for zero failures in a fresh 600-stack fuzz, round 464 on its first attempt,
four STEP leftovers written exact and the panel timings halved. One cause is fixed (overlapping holes in STEP). The
rest is measured and listed below with a seed or script each; none of it is hidden behind a passing test. The lane was
paused once for the usage window and closed with its context nearly full.

## 1. The fuzz

### Generator

`rfONfuzz(kind, seed)` in `anvil/tests/kernel/rfON.js`, between the `rfON-TABLE` markers (ES5, no page helpers, same
form as rfFT / rfGA so `anvil/tests/fixtures/rfFT/compare.js --table rfON` reads it). Kinds and what they stack:

| kind | base | features drawn from |
|---|---|---|
| `plate` | plate 3..7 x 2..5, .06 to .5 thick | holes .005 to .125 from an edge, on the edge, tangent to it; two holes tangent, .005 apart, overlapping; slots, slots off the edge and across a rounded corner; pockets leaving a .005 floor or wall; patterns at .5 to 2.5 diameters; mirror of a feature, mirror of the body on its own side face; corner rounds and chamfers, top-edge round / chamfer, a round meeting a chamfer at a corner; boss with a hole on, half off and beside it and a root round; countersink |
| `block` | block, or an angle bracket | draft, vertical and top rounds, shell .03 to .125 (top open, bottom open, closed), pocket to a .005 wall and floor, side holes, boss with root round, step cut; ribs, inside and outside rounds, leg holes and slots |
| `turned` | bar or tube on Y | cross holes on and off axis (tangent to the wall, breaking out), bosses on the cylinder, grooves, V grooves, face grooves, a milled flat, bolt holes and their circular pattern, rim round / chamfer, keyway, cross slot |
| `free` | sweep of a bar, tube or rectangle along an arc (with legs), or a rectangle-to-circle loft | holes across and along, end cut, flat, shell |
| `multi` | box or disk + a second body | combine add, subtract, common; then holes and a slot |
| `step` | a plate / turned / block stack written to STEP and read back | holes, slot, corner round, chamfer on the imported body |

Seeds 6001 up (no earlier round used this generator). The plan was 600: plate 6001-6200, block 6001-6120, turned
6001-6100, free 6001-6060, multi 6001-6060, step 6001-6060.

### What was checked per stack

Anvil: builds (messages plain sentences), every body closed (`Evaluate.checkBody`), mesh volume = body volume, the
screen mesh (`meshQuality` of `meshFromBody`), a second `rebuild` the same numbers (hash of every vertex), STEP out
and back through Anvil's reader (closed, volume). OpenCascade (through the junction): `OcctKernel.build` of the same
model (valid, volume against Anvil's to 1e-6), and its read of Anvil's STEP (valid, volume).

### Runs

- **Before**, both engines: **526 of 600** stacks (plate 200, block 120, turned 100, multi 60, step 30, free 16). The
  other 74 (free 44, step 30) were not reached: OpenCascade takes 40 s and more per loft and the run was stopped at
  the pause.
- **After**, Anvil's engine only, final code: 540 stacks (every kind but `free`), 510 of them with a before row. Only
  `exchange.js` changed, so OpenCascade's own builds are the before run's; the 16 `free` rows are counted as before
  (no pair of parallel cylinder walls can change there except a cross hole beside another, not checked).
- No stack threw, none gave a message that is not a sentence, none rebuilt differently the second time.

### Table (526 stacks; a stack can be in several rows)

| cause | before | after |
|---|---|---|
| clean on Anvil's side (the generator's own refusals aside) | 262 | **289** |
| STEP: curved faces written as facets (read back more than 1e-6 off) | 210 | **181** |
| STEP: read back with open edges | 17 | 17 |
| STEP: Anvil's reader refuses Anvil's file | 8 | 9 |
| body open or non-manifold | 2 | 2 |
| zero-area polygon in the body | 13 | 13 |
| screen mesh: sliver holes under 1e-5 wide (the body check fills them) | 11 | 11 |
| refused: zero-thickness geometry | 16 | 16 |
| refused: round "radius may be too large" | 16 | 16 |
| refused: face to remove not found (shell) | 4 | 4 |
| refused: chamfer "distance may be too large" | 3 | 3 |
| refused: cut does not intersect / shell too thick / round could not close | 2 / 1 / 1 | same |
| the generator's own (two crossing circles in one sketch 29, sketch outside the part 40, pick not on the part 16) | 85 | 85 |
| faces in all STEP files written | 76 033 | 73 858 |

OpenCascade's side (before run): volume differs from Anvil's by more than 1e-6 on **38**; it fails a feature Anvil
builds on **31** (shell 13, chamfer 8, round 6, others 4); its own solid is not valid on **14**; it reads Anvil's STEP
as not valid on **34**.

After against before, stack by stack: 28 stacks went from facets to exact, none got an open edge, no part's volume
moved. Two rows moved another way: `step 6048` (the imported base now has its true holes, so the part read from it is
1.0e-4 lighter, the right way) and `turned 6001` (from 395 facets to 10 true faces, which Anvil's reader refuses: the
reader defect of 3c below, hidden before behind the facets; OpenCascade reads the same kind of file as valid).

## 2. Fixed: two overlapping holes go to STEP as two cylinders

**What was wrong.** Two holes that overlap, each its own Cut-Extrude (also a hole biting a slot's end, a corner
round, a boss's wall: any two walls with parallel axes). Their walls share one line. The mesh has the crossing of the
two polygons there, inside both true circles by up to a sagitta, so neither rim arc ended on its circle
(`classify` gave no name for the edge beside the top face, the writer's fall-back at exchange.js `build`, the
`!cl || nb == null` test). Both walls went back to facets and took the rims with them: 52 planes for two holes in a
plate, 4e-5 of the volume.

**Fix (`exchange.js` `snapCylParallel`, called after `snapToCylinders` in `writeBrepAnalytic`).** A vertex whose fan
is two cylinders with parallel axes (and planes) moves, in the file only, to the nearer crossing of the two circles
at its own height. The line between the top and the bottom vertex is then a ruling of both walls. Any plane at the
vertex must still hold the moved point. `snapKeepsOrder`: the moved vertex must stay on the same side of every vertex
it shares a triangle with; where the true crossing lies past a neighbouring rim vertex the snap is skipped and the
walls keep their facets (a snap there read back with 17 open edges). Undone with its patches like `snapCylCyl`'s.
`Exchange.parallelSnap.on = false` gives the old file.

| part | faces before / now | read back (Anvil) | OpenCascade |
|---|---|---|---|
| plate, holes Ø.2 and Ø.3, .15 apart | 52 / 8 | 4.0e-5 / 7e-16 | reads valid; builds the same volume (3e-16) |
| holes Ø.25 and Ø.25, .2 / .05 apart | 60 / 8 | 4.3e-5 / 6e-16 | same |
| fuzz plate 6016 | 58 / 12 | 2.5e-5 / 5e-15 | |
| fuzz plate 6002 | 70 / 20 | 6.6e-5 / 8e-16 | |

The part itself equals its closed form (plate less the two circles' union) to 1e-9 (rfON).

Also in the writer: `Exchange.stepLog(fn)`, a probe's hook called when a curved patch falls back to facets, with the
surface, the test that failed (`why` = the source line of the `bad = true`, or `'shape'`) and the edge. It is how every
cause below was found; nothing calls it in the app.

## 3. Not fixed, each with its reproduction

Run a seed on Anvil: `node anvil/tests/fixtures/rfFT/compare.js --table rfON --fuzz 1 --seed 6016` (every kind at
that seed; kind `step` needs the script below). The whole check for one stack:

```js
// node probe.js <kind> <seed>   (from the repo root; add { occt: true } and anvil/headless/occt.js for OpenCascade)
const g = require('./anvil/headless/load.js').load({}), K = g.Kernel, X = g.Exchange, fs = require('fs');
const src = fs.readFileSync('anvil/tests/kernel/rfON.js', 'utf8');
const lib = new Function(src.slice(src.indexOf('// rfON-TABLE-BEGIN'), src.indexOf('// rfON-TABLE-END')) + '\nreturn rfONfuzz;')();
const c = lib(process.argv[2], +process.argv[3]);
let m = K.newModel('P');
if (c.base) { K.runScript(m, c.base); const b0 = K.rebuild(m); m = X.newPartFromImport(X.importFile('b.step', X.exportSTEP(m, b0), { units: 'in' })); }
K.runScript(m, c.code);
const b = K.rebuild(m), ck = g.Evaluate.checkBody(b.body), v = K.massProps(K.meshFromBody(b.body), 1).volume;
X.stepLog = (o) => console.log('facets:', o.surf.t, o.surf.r, 'why', o.why, JSON.stringify(o.at));
const st = X.exportSTEP(m, b), back = K.rebuild(X.newPartFromImport(X.importFile('x.step', st, { units: 'in' })));
console.log(c.ops.join(' '), b.errors, 'open', ck.openEdges.length, ck.nonManifoldEdges.length, 'faces', (st.match(/=ADVANCED_FACE\(/g) || []).length,
  'read back open', g.Evaluate.checkBody(back.body).openEdges.length, 'rel', (K.massProps(K.meshFromBody(back.body), 1).volume - v) / v);
```

Seeds are written kind letter + seed (p plate, b block, t turned, f free, m multi, s step).

### a. Body open (2): lofts with holes

f6001 (rectangle-to-circle loft, a hole down the axis, a cross hole: 2 open, 1 non-manifold), f6040 (2 / 2). Not
looked at. The only stacks whose solid is not closed.

### b. STEP faces as facets (181 after)

Share of stacks carrying a feature whose file has facets: rim chamfer 19 / 21, milled flat 28 / 34, hole in a boss
22 / 27, face groove 21 / 26, cross hole 45 / 56, boss on a cylinder 36 / 45, groove 27 / 34. Turned parts are the
bulk. Causes found with `stepLog` (all at the `!cl || nb == null` test, `why` 2232 in this file's numbering at the time):

1. **A cross hole that breaks out of a bar's side** (a notch): `p.sketch("Top").circle(0, 0, 0.5).end().extrude(1)`
   then `p.sketch("Front", 1.5).circle(0.3333, 0.5, 0.2).end().cut("through", { reverse: true })`: 86 planes, read
   back 3.3e-3 light. At the bar's outermost ruling `snapCylCyl` projects the vertex onto the hole and slides along the
   hole's ruling onto the bar: there is no root (the ruling passes outside the bar). **Tried and taken out again:**
   sliding the other way (stay on the bar's ruling, onto the hole). Holes .3333 and .4 off axis then go out as 4 faces
   and read back to 1e-8, and OpenCascade reads all the files as valid solids (.45 off axis too, 4e-8 and 6e-7 of the
   part). But Anvil's reader zips the bar's band wrong at .45 off axis (Ø.25 and Ø.4: one edge shared by 4 faces, from
   the top circle to the bottom circle's start point, 4e-6 / 4.7e-4 off): `curvedFace` / `surfPatch`, a band between
   two whole circles with one hole loop whose two vertices lie on the seam's ruling. Fix the reader first, then put
   the second slide back (in `snapCylCyl`: when the first `disc < 0`, the same quadratic with the two cylinders'
   roles swapped, guarded by `snapKeepsOrder`). rfON pins the notch as facets, closed.
2. **Overlapping holes whose true crossing lies past a rim vertex**: holes Ø.1876 at (0, 0) and Ø.375 at (.19, -.02)
   on the 4 x 3 x .25 plate: 53 planes (rfON pins it closed). Needs the short rim chord dropped (the two vertices
   merged) instead of the snap being skipped.
3. **A hole through a top-edge round, not reaching the side wall**: plate, `p.fillet(0.1, [[0, 0.25, 1.5]])`, hole
   r .15 at (0, -1.3): 45 planes, 1.3e-4. The hole's outermost ruling meets the round's facet inside it, the same
   no-root case as 1 with a third face near. The same hole centred on the edge is exact.
4. **A boss on a bar that ends inside it with part of its end face showing**: bar as in 1, then
   `p.sketch("Front", 1).circle(0.125, 0.5, 0.375).end().extrude(0.75, { reverse: true })`: 85 planes, 4.3e-3.
5. p6009 (patterned overlapping holes through a top round of the same radius), p6118 (a top round .0608 over corner
   rounds .0625 with holes .005 from the edge: 281 faces), b6002 (boss root round, shell .03, side holes): not traced.

### c. STEP that Anvil's own reader refuses (9) or reads back open (17)

- Refused ("CYLINDRICAL_SURFACE trimmed by curves other than circles and rulings"): t6001, t6033, t6051, t6055,
  t6059, t6082, p6169, f6003, f6038. Smallest: bar as in b1, cross hole `circle(0.3, 0.5, 0.2)` (tangent to the bar's
  outermost ruling), or the boss `p.sketch("Front", 1).circle(0.125, 0.4612, 0.375).end().extrude(1, { reverse: true })`.
  OpenCascade reads the boss file as a valid solid (1.6e-6 off the part) and the tangent hole's as not valid. The reader
  gives up in `cylPatch` (a band with a loop that touches itself at one point).
- Open at read back: p6006, p6036, p6044, p6061, p6063, p6105, p6109, p6123, p6130, p6132, m6035, m6043 and five more.
  Smallest: the 4 x 3 x .25 plate with a hole r .15 at (1.85, 0): **tangent to the plate's side face**. Anvil builds
  it (the hole's 32-gon touches the wall along one line and the mesh check sees nothing: no edge is shared by four
  triangles); the file reads back with one edge shared by four faces and OpenCascade calls it not valid. Two tangent
  holes are refused as zero-thickness geometry only when both polygons happen to have a vertex on the line between the
  centres (holes at (0, 0) r .1 and (.25, 0) r .15 are refused; p6025's pair at another angle is built). The check
  (`kernel-rebuild.js` `zeroThickness`, counting edges of the welded mesh) depends on where the facets fall. A check on
  the records (a new wall's axis at r1 + r2 from a parallel wall's, or at r from a plane along it) would refuse both
  the same way. What SolidWorks does with a hole tangent to a side face was **not checked in SolidWorks**; rfGD measured
  only tangent holes in a pattern (refused).

### d. Zero-area polygons (13) and screen-mesh sliver holes (11)

p6003, p6044, p6053, p6065, p6086, t6010, t6022, b6002 (zero-area); p6118 (15), p6072, p6136, b6002, s6034 (94)
(slivers). p6118 after its 7th line: a top round R.0608 chained round R.0625 corner rounds leaves a top-face corner
arc of radius .0017; the body's polygons miss a triangle 3.3e-4 long and 8e-6 wide at each corner. `checkBody` calls
the body closed (`Exchange.bodyMesh` fills sliver loops); `K.meshQuality(K.meshFromBody(body))` counts 15 open edges.
Nothing to see on screen at that size, but the screen mesh is not the closed mesh.

### e. The two engines disagree (38 volumes, 31 features OpenCascade fails)

- **`chain: false` is not honoured by OpenCascade's chamfer / fillet** (p6022, 1.0e-4): plate, then
  `p.fillet(0.054, [{ at: [-1.44, 0.135, 2.125], chain: false }])` and
  `p.chamfer(0.054, [{ at: [1.75, 0.135, 1.815], chain: false }])`. Anvil chamfers the straight edge only (removes
  0.0061178 = d²/2 x (4.25 - .054)). OpenCascade removes 0.0063183: the edge, the round's end arc and the vertical
  corner edge after it, because `BRepFilletAPI_MakeChamfer.Add(edge)` runs along tangent edges by itself.
  `anvil/occt-kernel.js`, `edgeOp(f)` (the fillet / chamfer builder; `pickedEdges` gives it the edges): when a pick
  has `chain === false` and its edge has a tangent neighbour, the chamfer must stop at the edge's ends. ChFi3d has no
  switch for that, so the change is to build that edge's tool directly (a chamfer: the wedge as a prism over the
  edge's length, cut from the body; a round: the same prism less the cylinder) instead of `MakeChamfer.Add(edge)`,
  or to refuse with a sentence. As it is, the same model is two solids.
- **A pattern of a Chamfer alone** (p6034, 2.1e-3): plate 5 x 4 x .25, a Ø.375 hole, `p.chamfer(0.1125, …)` on its
  rim, `p.linearPattern({ dir: "z", spacing: 0.1875, count: 4 })` (the pattern takes the chamfer, not the hole).
  Anvil removes 0.00874 more, OpenCascade 0.01914, where the copies' rims are only partly on the part. Other seeds get
  "the patterned edges of Chamfer1 are not on the part" from Anvil and "No edges found for this chamfer" from
  OpenCascade (p6020, p6014). `anvil/occt-kernel.js` `patternTool` / its edge-feature branch and
  `kernel-rebuild.js`'s pattern of an edge feature should agree on one rule: an instance whose edge is not wholly on
  the part is not made (and the feature warns), instead of each engine chamfering what it finds. Which SolidWorks does
  was not checked in SolidWorks.
- Others, not traced: b6046 (1e-2), b6071 (1e-3), b6078 (OpenCascade's volume three times Anvil's), b6009, b6098,
  the lofts f6001, f6004, f6005, f6034, f6037, f6038 (2e-5 to 4e-5: the faceted loft against the true surface, as in
  rfGO). OpenCascade's failures: shell 13 (b6006, b6036, b6044 …), chamfer 8 (p6013, p6052, p6142 …), round 6
  (b6041, t6007 …). Its own solid not valid on 14 (b6021, b6038, t6002, t6003, p6105 …).

## 4. The named leftovers

- **Round 464** (`rfFT` round fuzz, seed 464): not fixed. On main the R.25 round's guard still starts with `s2` and
  68 open edges and ends on the plain round; the whole part takes 2.3 s. Its second round (R.225 on a hole's rim) is
  refused ("cannot round this edge where two curved faces meet"). Lane PO's finding stands: the hole (r .25, .5916
  from the boss's axis) spans the whole width of the round's ring (.375 to .625), so two of the round's rings graze
  the hole's wall (at 25 deg either side). Probe: `K.openGuard.log = function (o) { … }` around `K.rebuild`.
- **csg.js, "a split point must land on the band vertex it stands for"** (QUEUE, *Next from local-2026-11-13a*):
  already done by lane MP (`bandSnap`, 2026-11-15; `kernel/rfMP.js`). On main rfGA stack 773 has 0 open edges (its
  rib is refused for a true reason) and 829 is ok; the repro `test-reports/repros/g13-union-options.js` replays only
  on the 1f42c07 kernel. **Strike the line.**
- **STEP exactness** (a loft with a hole across its corner; the Funnel; a slot's flat-wall rim on a spline face; a
  corner relief's walls inside the bends): none done. Curved faces left as facets, counted with `stepLog` over the 44
  part examples and rfFT's sheet-metal parts (50 files, 2119 faces, the same before and now: none of them has
  overlapping parallel walls): **46 files have every curved face whole; 17 curved faces are facets**: Funnel 3 (132
  faces, 1.2e-2), Rounded handle 2 (16 faces, read back exact), rfFT M15 8 (112 faces, -6.2e-4), rfFT M26 4 (154
  faces, 6.3e-5). Hex nut reads back 9.3e-8 off the kernel's own volume (the kernel's, not the file's: rfPO).
- **Task 3, perforated panels**: not measured, not started.

## 5. Suites

- Kernel: 3309 / 3309 at the paused commit (the head's run). After the last change two runs: the first, with the
  whole OpenCascade page and another suite running beside it (1066 s), ended 3308 / 3309 and the failed row's name was
  not kept; the second, same code (563 s): **3309 / 3309**. `rfON` 16 / 16.
- Examples 29 / 29.
- **occt `rfON` (2 rows) has not run in `occt-tests.js`.** `node anvil/headless/occt-tests.js --only rfON` ran the
  whole page and did not finish in 500 s, then 1100 s, on the loaded machine. Reason found: `anvil/headless/occt-tests.js`
  `groupList` matches `/\n  var GROUPS = \[\n…/` and the page is CRLF in the working tree, so no group file is ever
  selected and `--only` falls back to every row (change: `\r?\n` in that pattern, three places; not this lane's file).
  The rows' own checks were run directly instead (scratch `occtread.js`, the same `OcctKernel.importFile` and
  `OcctKernel.build` calls): both overlapping-hole files read as one valid solid, 2.977839589558 and 2.976509339152
  against the parts' 2.977839590 and 2.976509339, and OpenCascade's own build of the first part is 3e-16 from Anvil's.
- Smoke: no group names the functions changed; 12 smoke groups call `exportSTEP` and were not run here (the head's
  full run at merge).
