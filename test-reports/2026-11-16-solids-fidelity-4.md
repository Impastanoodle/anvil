# Solids fidelity 4, lane NT (solidfid4), 2026-11-16

Continues `2026-11-16-solids-fidelity.md` (lane NI). Tests: `anvil/tests/kernel/rfNT.js` (15 rows). "Before" is this
lane's base (main at 9e057c4, an untouched `git archive` copy in the worktree). Node 26, home PC, six other agents
running; every time was taken twice and the lower is given.

## 1. Mass Properties of a panel read from STEP

Part: 24 x 48 in, 16 ga, 600 Ø.25 holes (a 30 x 20 LPattern of one cut), two Edge Flanges; `exportSTEP`, `importFile`,
`newPartFromImport`, Mass Properties; then Insert Bends and the flat pattern (79,356 polygons read back).

| | before | now |
|---|---|---|
| Mass Properties of the part read back | 55.6 s, 59.5 s | **0.98 s, 1.34 s** |
| flat of the Insert Bends part (`ibMetalCheck` -> `massProps`) | 340 s, 334 s | **1.91 s** |
| the same on a 60-hole panel | 1.48 s / 3.10 s | 0.65 s / 1.95 s |

**The cause was not the loop the STEP report named.** `boundCorrection`'s `sampled` loop is quadratic in the samples of
one edge and is fixed (below), but on this part it was 0.2 s. A profile gave 72 of every 75 s to `planarIndex`'s query:
`curveWalls` asks, for both sides of every cap edge of a hole wall, whether a planar face lies there.

- A face read from a file is triangles of one bridged ring. Measured on this panel's top face: 17,610 triangles, 3,747
  of them needles (a corner under 0.11°, for which `planarBox` hands out an infinite box, "always tested"); the boxes
  of the others add up to 67 times the face's area. `planarGrid` files boxes, found more than 256 that cover too many
  cells and returned null: every query ran the whole list, with the full edge test on every needle.
- `planarRaster` (new) files each polygon in the cells its own outline covers, row by row: the outline widened by the
  pad `planarBox` uses (computed with the needle's true corner angle), the grid one cell wider than the vertices all
  round. A query looks in its one cell. The box, plane and edge tests of the query are unchanged, so a polygon is left
  out only where it could not have accepted the point: the same answers.
- `boundCorrection`: (a) the direction clusters (up to 256) and the test "does this edge run along a candidate" asked
  every cluster for every edge (240,000 edges x 100 to 250 dot products: about 1 s here); `dirTable` files unit
  directions in a 3D table (own cell + 26 neighbours) and asks only those in the edge's cell; (b) a candidate edge
  compares its last 8 sampled cells instead of all of them. That is exact: the samples run along a straight segment,
  so each cell index only rises or only falls, and a cell within one of both this sample and an older one puts the
  older one within two cells on every axis, with at most six different cells between.

Identical results:

| | compared | result |
|---|---|---|
| the 600-hole panel | Mass Properties of the part and of the read-back part, the Insert Bends flat (loops, bends, warnings), as JSON | **identical text** (601,525 bytes) |
| 29 examples + the 60 / 600 panels read back | polygons (hash of every vertex and plane), `massProps` JSON, flat pattern hash | **31 / 31 identical** |
| grid work | `K._.cellOps` fill / query / samples on the 600 panel | 1,794,160 / 3,760,182 / 185,302 before and after |
| stack / round / sheet fuzz, 1000 each | every row: status, message, errors, volumes at full precision | see section 5 |

Switches to compare in one process (the tests use them): `K.massOptions.planarRaster = false` (the box grid),
`dirTable = false`, `sampleWindow = Infinity`; `K._.cellOps.planar` counts the polygons a planar query looked at
(rfNT's 120-hole plate: 254,429 against 46,983,527: 185 times fewer).

## 2. Chamfer with two distances, and with angle + distance

Feature JSON: `{ type: 'chamfer', d, d2 }` (Distance Distance), `{ type: 'chamfer', d, angle }` (Angle Distance, degrees:
`d` on one face, the chamfer face at `angle` to that face, so the other setback is d sin a / sin(θ + a), θ the corner's
angle; d tan a on a square edge), `flip: true` (SolidWorks' Flip direction). `angle` wins when both are there. `d2`
equal to `d`, or neither, is the equal-distance chamfer on its old path.

**Which face takes `d`** (stored as the rule + `flip`, nothing else, so it survives edits):

1. at the picked edge, when one face is planar and the other curved: the planar one (a hole's or a boss's rim: `d`
   lies on the flat face);
2. otherwise the face whose outward normal there is greater in Y, then X, then Z (the face looking more upward; the
   same wherever a straight edge is picked);
3. `flip` swaps the two for the whole feature;
4. from the picked edge the choice runs along the selection: an edge joined to an assigned one (same convexity,
   turning under 30°) keeps `d` on the face they share, or off it. A rim or a tangent chain has `d` on one side all
   the way round, whichever chord was picked.

`K.chamferFace(n0, n1, planar0, planar1, flip)` is rule 1 to 3 for other engines.

| case (inch) | Anvil against the closed form | OpenCascade (`Add(d1, d2, E, F)` / `AddDA`) |
|---|---|---|
| block edge d .25, d2 .5 (every edge, both ways) | ≤ 3e-16 | 5.8125 = Anvil |
| the same edge, d .25 at 30° | 0 | 5.945873412263472 = Anvil to 2e-16 |
| inside (concave) edge of an L, d .25 / d2 .5 and 30° | ≤ 2e-16 | |
| cylinder rim R 1: .25 top / .1 wall, flipped, 30° both ways | ≤ 3.1e-15 | |
| Ø1 hole rim in a plate, both ways | ≤ 2e-15 | |
| cone rim (top meets the cone at 116.57°): d / d2, flipped, 30° | ≤ 7.4e-15 | |
| tangent chain (4 x 3 plate, R.5 corners), picked on a straight or a corner, flipped, 60°, bottom edge | ≤ 1.2e-13 | |
| three edges at a block corner, .25 / .5 | 1.6e-16 (block cut by 3 chamfer planes + the corner plane) | 5.65625 = Anvil |
| the same flipped; by 30°; .1 / .6 | ≤ 1.2e-14 | 5.65625; 5.896489968290086; 5.834 = Anvil |
| two edges sharing the top face; two with d on different faces | ≤ 1.6e-16 | 5.697916666666667; 5.770833333333333 = Anvil |
| all twelve edges, .1 / .2 | 2.6e-15 (the block cut by 12 + 8 planes): 5.776 | 5.775666666666666 (see below) |
| equal distances (d2 = d, d2 = "0.25" flipped; block corner, cylinder rim) | the polygons of today's chamfer, vertex for vertex | |

All closed (0 open, 0 non-manifold). The corner where three chamfers meet is the plane through the three faces'
setback corners (on the face holding edges i and j: V + ui · edge j's setback on it + uj · edge i's), the same
construction as the equal-distance corner triangle.

**OpenCascade differs on four of the eight corners of the twelve-edge block** (each 5.941833 against 5.942, d³/6 more
removed). Measured: at corners (3,1,2), (0,0,0), (0,0,2), (3,1,0) it builds the three-sided corner face through the
three setback corners (= Anvil to 1e-15); at their mirror images (0,1,0), (0,1,2), (3,0,0), (3,0,2), with the same
distances on the same faces, it stops one chamfer short and builds a four-sided corner face through (.1,1,.1),
(.1,1,.2), (0,.8,.2), (.1,.8,0). Mirror-image corners with mirror-image inputs getting different solids is OpenCascade's
corner algorithm, not geometry; Anvil builds the three-sided face on all eight. SolidWorks is not measured there.

Refused, in plain words: `d2` ≤ 0; an angle outside 0 to 180; an angle the corner cannot take (θ + a ≥ 180°: "the
chamfer would never reach the other face"); two distances on a saddle between two curved faces (its chamfer is the
chord of one ball's contacts); Angle Distance on an edge of a torus / sphere face (Distance Distance is built there:
the setback on the tube is a chord, as the equal chamfer's); two edges with different setbacks on the face they share
meeting at an INSIDE corner of that face (at an outside corner each chamfer runs out past the corner and the cut is
exact); a round edge mitred to a straight edge with different setbacks.

`DIM_FIELDS.chamfer` is `['d', 'd2', 'angle']` (D2@Chamfer1, D3@Chamfer1; `d2: "=W"` resolves like any field).

Vertex chamfer: design only, in the kernel card.

### Hand-on (other lanes' files; nothing below is built)

**kernel-script.js**, `Builder.prototype.chamfer` (line 1738): the options are dropped. Replace the `_add` line with

```js
    var cf = { type: 'chamfer', d: num(d), edges: specs, name: opts.name };
    if (opts.angle != null) cf.angle = num(opts.angle); else if (opts.d2 != null) cf.d2 = num(opts.d2);
    if (opts.flip) cf.flip = true;
    this._add(cf);
```

and in `generateScript`'s `case 'chamfer': case 'fillet':` (line 2289) write them back: replace
`optsStr({ name: f.name })` with
`optsStr(f.type === 'chamfer' ? { name: f.name, d2: f.angle == null ? f.d2 : undefined, angle: f.angle, flip: f.flip ? true : undefined } : { name: f.name })`
(`optsStr` skips undefined and null; an expression string "=W" is written as a JSON string and `num` keeps it).
README: `p.chamfer(d, edges, { d2 | angle, flip })`.

**ui-commands.js** (Chamfer PropertyManager, lines 1866 to 1993):
- `edgeTypeWhy` (1869): `if (t === (isChamfer ? 'dd' : 'constant')) return null;` -> also `|| (isChamfer && t === 'ad')`,
  so Angle Distance is no longer greyed; clicking a type sets `f._type`.
- Parameters group (1985): Distance D (`d`); for `_type === 'dd'` the "Equal distance" box enabled (drop `disabled`
  and the "not built" title), and when it is cleared a second number `Distance 2  D2` (`d2`, unit u, min 0); for
  `_type === 'ad'` `Angle  A` (`angle`, degrees, default 45) instead; in both a check `Flip direction` (`flip`).
- on ✓ (1993, where `_type` / `_equal` are deleted): `if (v._type === 'ad') delete v.d2; else { delete v.angle; if (v._equal) delete v.d2; }`
  and delete `flip` when the chamfer is equal-distance. On edit: `_type = f.angle != null ? 'ad' : 'dd'`,
  `_equal = f.angle == null && (f.d2 == null || f.d2 === f.d)`.
- the preview needs nothing: the kernel reads `d2` / `angle` / `flip` from the feature. Which face takes D shows in
  the preview; an arrow could use `K.chamferFace`.
- rfNH / rfNJ smoke rows assert the greyed Angle Distance and the disabled Equal distance: they change with this.

**occt-kernel.js**, `edgeMaker` (line 805): `mk.Add_2(size, e)` builds equal distance whatever the feature says, so
with OpenCascade driving a two-distance chamfer comes out equal: wrong part, no message. For `K.chamferSpec(f, size)`
not null: for each picked edge find its two faces (`TopExp.MapShapesAndAncestors` EDGE -> FACE on the body), their
outward normals at the pick and whether each is `GeomAbs_Plane`, `i = K.chamferFace(n0, n1, planar0, planar1, spec.flip)`,
then `mk.Add_3(size, spec.d2, e, faces[i])` or `mk.AddDA(size, spec.angle, e, faces[i])` (radians; both overloads are in
the build: checked in `opencascade.full.d.ts`, and used for the table above). OpenCascade carries the distances along
the contour itself. Until then `supported()` should send such a chamfer to Anvil's engine.

## 3. Perforated panels on Anvil's own engine

24 x 48 in, 16 ga, staggered Ø.25 holes sketched in the Base Flange's sketch (form a); d = a + four Edge Flanges.
Headless, rebuild only, best of two.

| holes, form | before (two runs) | now (two runs) | volume against the formula, before / now |
|---|---|---|---|
| 600, a | 3.01, 3.30 s | **0.95**, 1.13 s | 0 / 8.8e-14 |
| 1600, a | 4.85, 5.40 s | **0.76**, 0.99 s | 1.7e-13 / 3.5e-13 |
| 1800, a | 11.3, 12.4 s | **2.04**, 3.89 s | −3.7e-11 / 3.8e-13 |
| 3200, a | 18.3, 18.8 s | **1.96**, 1.98 s | −5.3e-11 / 4.8e-13 |
| 1800, d (four flanges) | 47.7, 81.8 s | 26.3, 32.5 s | |

(The 600 and 1800 rows were timed while this lane's own fuzz runs were going; 1600 and 3200 on a quieter machine. The
flanged panel's second rebuild in one process took 80 to 140 s on both: memory, not counted.) The queue's "Base Flange
on a 1,600-hole sketch 22 s headless" is 4.9 s here for the rebuild alone (meshing and Mass Properties add 3.2 s), so
the 22 s was not reproduced; whatever it included, the rebuild's share is now 0.8 s.

- **`solidFromProfile` subtracting every hole** was one boolean with all the holes; at 1800 holes 4.4 to 8.9 s of it
  was `healCracks` (two calls, four passes, "moved" 4 polygons: 89,774 open edges are left after `dropTJunctions`,
  mutual T-junctions between cap fragments cut along the same line at different points; the scan at csg.js 530 then
  asks every one of them for candidates). Not made faster: avoided. A plate sketched with 64 or more holes now takes
  them out through `plateCutParts`, the path a Cut-Extrude of the same circles takes since rfGM (each cap cut by the few
  holes over it, the holes' own walls with their cylinder records, no boolean, no healing). It answers null, and the
  boolean runs as before, for fewer holes, holes that are no straight prisms (draft, a revolve) and holes within 1e-5
  of each other or of a wall.
- Results: not the same triangles (the caps are fragmented by the plate path's k-d split, not by the BSP: 1800 holes
  173,982 polygons against 175,970). Closed (0 open, 0 non-manifold, 600 / 1600 / 1800 / 3200 and the flanged 1800).
  Volume against the formula 48 · 24 · T − n π r² T: 1800 holes 3.8e-13 (the boolean's result was **3.7e-11** off: its
  healing moved two polygons); 600 holes 8.8e-14 from the boolean's. `K.solidOptions.plate = false` gives the boolean.
- **The flange union, `bandSnap`**: on the flanged panel now `CSG.bandStats.calls` is 0 and `healStats.calls` 0; csg.js
  is under 2 s of 26 (profile: `polygonFar` 1.0 s, `splitPolygon` 0.1 s). What is left is not csg.js: `meshFromBody`,
  `bodyEdges`, `faceOutline` and `weld` (kernel-mesh.js) run on the whole 174,000-polygon sheet once per flange
  (`flangeLayout`, kernel-sheetmetal.js, asks for every edge of the body to find the picked one), about 10 s of the 26,
  and garbage collection is 9 s (27 %). Handed on: `flangeLayout` should ask for the edges near the pick only (a
  box-limited `bodyEdges`), or reuse the mesh of the body it was just handed.
- `healCracks` itself where it still runs (a boolean between two perforated bodies): the candidate scan (csg.js
  519 to 541) takes the axis slab with the fewest candidates per open edge; a 3D grid over the candidates would give
  the same `best` / `bestE` (each candidate keeps its nearest edge whatever the order). Not done.

## 4. Open from lane NI: not reached

The open chain's end (4.6e-4 from OpenCascade on two crossing discs) and 259's root fillet falling to `plain`: not
started. Both still need SolidWorks numbers before a rule is chosen (lane NI's note stands).

## 5. Corpora and suites (final code)

Every row compared with the base seed for seed (`test-reports/repros/fuzz-rows.js`: status, message, errors, polygon
count, volumes at full precision; only the time differs).

| | before | now |
|---|---|---|
| stack fuzz 1000 | 647 ok, 353 refused, 0 open | the same; **1000 rows identical** |
| round fuzz 1000 | 968 ok, 32 refused, 0 open | the same; **1000 rows identical** |
| sheet fuzz 1000 | 912 ok, 87 refused, 1 open (91, the true line contact) | the same; **1000 rows identical** |
| rfFT table (69 parts), rfGA table (48 rows), `compare.js` | | every row identical (volume, polygons, bbox, bodies, open, errors) |
| rim sweep (204 rounds / chamfers) | 204 ok | 204 ok |
| examples (29) + the two panels read back | | polygons, `massProps`, flat patterns **bit-identical**; `example --all` 29 / 29, with `--occt` 29 / 29 |

Nothing that was closed is open; no volume moved. (The plate path of section 3 needs 64 holes in one sketch: no part
of these corpora has them, so they say nothing about it; rfNT's row and the four panels of section 3 do.)

- Kernel, whole: **3111 / 3111** (3096 + 15 rfNT rows), 214 s on 8 workers. `rfNT` alone: 15 / 15, 14 to 21 s.
- Not run: `occt-tests.html`, ui-smoke (no smoke rows in this lane; the head runs the page).

## Existing tests changed

None. `kernel-tests.html`: one manifest line.

## Harness (scratch, not committed)

Panel repro: build, `Exchange.exportSTEP`, `importFile`, `newPartFromImport`, `K.massProps`, `Builder.insertBends`,
`K.flatPattern`, timed step by step; `node --cpu-prof` + self time by function and by line. The chamfer referee calls
`BRepFilletAPI_MakeChamfer` directly through `anvil/headless/occt.js` on a 3 x 1 x 2 box.
