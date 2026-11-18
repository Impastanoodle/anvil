# Solids that survive STEP exactly (lane PF, 2026-11-17)

Files: `anvil/exchange.js` only (no `csg.js` or `kernel-curves.js` change). Tests `anvil/tests/kernel/rfPF.js` (8).
Every number below was measured in Node (`anvil/headless`), OpenCascade 7.6 reading Anvil's file with
`STEPControl_Reader`, `BRepCheck_Analyzer` and `VolumePropertiesGK`. "rel" is (read-back volume − part volume) / part
volume; "open" is Anvil's reader's count of open edges.

## 1. The drilled loft that came back with 9 open edges

Repro (the previous report's): the rfNO loft (`centerRect` 4 → 2 → 4, inches), `exportSTEP`, `importFile`,
`newPartFromImport`, two equal crossing holes Ø0.5, `exportSTEP`, `importFile`.

| | faces in the file | open | rel (Anvil) | OpenCascade |
|---|---|---|---|---|
| before | 192 (4 B-spline, 188 planes) | 9 | 2.7e-4 | not valid, 36 free edges, no solid |
| after | 10 (4 B-spline, 4 cylinders, 2 planes; 2 ELLIPSE edges) | 0 | 4.7e-7 | 1 valid solid, 6.7e-7 |

Three causes, none of them the one the earlier trace named (the fold is not in the drilled mesh: the drilled body has
0 open edges; and OpenCascade did **not** read the old file as valid).

1. **Writer, `freeFacesOf` (the cause of the 9 open edges).** After the cut, the pieces of a free-form face's
   triangles are matched back to the face by plane and containment. The plane tolerance was 1e-7 of the size
   (2.9e-7 here) while `bodyMesh` welds vertices on a 1e-6 grid, so a piece's corner sits up to a cell off its plane
   (measured 3.2e-7 and 5.1e-7); and a sliver's own normal is noise (areas 1e-8 .. 1e-9), so the parallel test failed.
   Four such pieces beside the holes were left out of their faces: the hole's rim was then not "one loop round one
   cylinder" but a polygon with the slivers as 3-point faces of their own, the cylinder wall fell back to facets
   (its rim points were never moved onto it), and the reader's `paramPatch` folded the ragged ring. Fix: the tolerance
   is at least 2 weld cells, a piece may also be judged by its mesh face's normal (the polygon's plane), and the
   containment test has the same tolerance. One hole through the loft: 68 faces / 6 open / 1.5e-4 → 7 faces / 0 /
   2.3e-7.
2. **Reader, straight sides (`straightGrid`, `edgeInfo`).** Anvil writes a loft's straight direction as a cubic with
   collinear poles; the reader sampled it 24 times a span like any spline. Across a slightly twisted strip that
   leaves facets 1e-7 .. 1e-5 off their neighbours' planes (7168 of the 9404 triangle pairs of the re-read loft; 0 in
   Anvil's own loft), which is exactly the boolean's 1e-5 band: a hole through such a face left up to 272 open edges
   in the **body**, or was refused as zero-thickness geometry (5 of my 16 first cases). A B-spline direction whose
   every line is straight now keeps its two ends (the grid and the edge agree; an edge that is straight on a face
   that is not straight that way keeps its samples, `noReduce`). The re-read loft: 9404 → 388 triangles, like the
   part's own 516; its volume against OpenCascade's reading of the same file 3e-8 → 6e-7 (no inner points for the
   volume fix; inside the file's 1e-6).
3. **Writer, equal crossing holes (`equalCross`, `snapCylEqual`).** Two cylinders of one radius whose axes cross
   meet in two ellipses; they were left as facets on purpose ("equal holes keep their facets"). Their rim points now
   move onto the ellipse (at their angle on one cylinder, along its ruling into the ellipse's plane; the touching
   points to O ± r·n) and each wall is a `CYLINDRICAL_SURFACE` bounded by two ELLIPSE runs. A 40 mm block with two
   Ø10 holes crossing: read back at the exact volume (64000 − 2π·25·40 + 16·125/3) to 4e-16 in Anvil, −4e-9 in
   OpenCascade; was 0 cylinders, all facets.

Also `bodyMesh(body, true)` (the meshes files are written from; `weldOpenTwins`): the ends of open edges within 2.5e-6
of each other become one vertex when that leaves fewer open edges. A cut's exact retry left a split point and its twin
1.0e-6 apart on a drilled circle-square-circle loft (3 open edges, 34 planar facets → 0, 7 faces). Not applied to the
kernel's own counts: with it on everywhere, rfFS #82's shell guard accepted a cracked shell (6 ≤ slack) it refuses
today.

### The family (re-read lofts and free-form imports, then cut; file written and read again)

Before → after. "refused" = the cut itself failed with "zero-thickness geometry" before.

| case | before: faces / open / rel / OCCT | after: faces / open / rel / OCCT rel |
|---|---|---|
| equal crossing holes (the report) | 192 / 9 / 2.7e-4 / invalid | 10 / 0 / 4.7e-7 / 6.7e-7 |
| one hole | 68 / 6 / 1.5e-4 / invalid | 7 / 0 / 2.3e-7 / 6.2e-7 |
| unequal crossing holes | 158 / 6 / 1.9e-4 / invalid | 9 / 0 / 4.9e-7 / 6.4e-7 |
| two parallel holes | second hole refused; 77 / 11 | 8 / 0 / 2.7e-7 / 6.8e-7 |
| hole at the waist | 66 / 0 / 1.6e-4 / invalid (12 free) | 7 / 0 / 3.0e-7 / 7.1e-7 |
| off-centre hole | 59 / 0 / 7.9e-5 / invalid (24 free) | 7 / 0 / 2.2e-7 / 5.9e-7 |
| top-down hole (caps only) | 7 / 0 / 2e-16 / 3e-8 | 7 / 0 / 2e-16 / 6.0e-7 |
| three holes, one skew | 211 / 10 / 3.2e-4 / invalid | 9 / 0 / 4.7e-7 / 6.7e-7 |
| 4-section loft, hole | refused | 7 / 0 / −1.2e-7 / −1.1e-7 |
| 4-section loft, unequal crossing | second hole refused; 82 / 11 | 9 / 0 / −2.0e-7 / −1.0e-7 |
| 4-section loft, equal crossing | 179 / 6 / 3.0e-4 / invalid | 10 / 0 / −2.2e-7 / −7.8e-8 |
| mm loft, hole | refused | 7 / 0 / 1.7e-8 / 1.9e-7 |
| mm loft, equal crossing | 200 / 265 / 2.8e-4 / invalid | 10 / 0 / −1.4e-7 / 1.6e-7 |
| mm loft, slot | refused | 10 / 0 / 3.0e-8 / **3.2e-5** |
| mm loft, square cut | 33 / 25 / 1.6e-8 / invalid, 1.8e-2 | 10 / 0 / 4.4e-8 / 4.9e-7 |
| blind hole | 9 / 0 / 3e-15 / 2.9e-8 | 9 / 0 / 9e-16 / 5.7e-7 |
| square-octagon-circle loft, hole | not measured | 11 / 0 / −5.9e-7 / 6.6e-8 |
| square-octagon-circle loft, equal crossing | not measured | 14 / 0 / −6.8e-7 / 1.5e-7 |
| circle-square-circle loft, hole | 38 / 3 / 3.2e-4 / no solid (after cause 1 and 2 only) | 7 / 0 / −2.6e-7 / −1.9e-7 |
| circle-square-circle loft, unequal crossing | not measured | 9 / 0 / −6.0e-7 / 1.1e-8 |
| circle-square-circle loft, hole off axis | not measured | 7 / 0 / −3.1e-7 / −2.3e-7 |

Every "after" file is one valid closed solid in OpenCascade. Written and read a second time, each of the first 16 is
unchanged (rel 0 .. 3e-13).

**Not fixed.**
- Second generation: the re-read **drilled** part drilled again. 8 of 9 probes are closed and exact (rel ≤ 1.4e-7); the
  report's case with a third hole (`Front`, 0.9, 2.3, Ø0.4) leaves 9 open / 5 non-manifold edges in the body and the
  file reads back with 10 open edges. Cause: a face with holes goes through `freeFace`, which (lane MX) gives its
  straight direction the other direction's step and then moves the inner points (`freeVolumeFix`): the same in-band
  facets as cause 2, twins 2.7e-6 .. 2.6e-4 apart after the cut. It needs either full-width strips away from the
  holes in `paramPatch`, or the boolean itself not treating a facet 1e-6 off a node's plane as on it (csg.js,
  `Node.build`); neither fitted this lane.
- The slot: OpenCascade reads it 3.2e-5 off, because the flat walls' rims on the spline face are polygon loops
  (`polyLoop`, chords between the mesh's rows). A plane's rim needs a true curve as a cylinder's has (`saddleCurve`).

## 2. A cylinder wall that falls back to facets takes its B-spline face with it

Already right on main since lane NO2 (`polyLoop`): in all 16 "before" rows above the four B-spline faces were kept
while the walls were facets. What changed here is that the walls no longer fall back (causes 1 and 3).

## 3. Faces that were written faceted

| part | before: faces / rel (Anvil) / OCCT | after |
|---|---|---|
| Anvil's own loft (4 → 2 → 4) with two equal crossing holes | 422 planes / 2.8e-4 / valid, 2.8e-4 | 10 (4 B-spline, 4 cyl) / −4.1e-6 / valid, −3.9e-6 |
| the same with one hole | 310 planes / 1.6e-4 | 7 / −4.3e-6 / −3.9e-6 |
| circle-square-circle loft with a hole | 13,599 planes, 52 s out and back / 3.2e-4 | 7 faces, 2.5 s / 1.3e-5 / 1.3e-5 |
| 21 cut lofts in all (the family above on Anvil's own lofts) | | all B-spline + cylinders, closed, valid in OpenCascade |
| Mug | 1032 (1031 planes) / **−9.2e-3** / valid, −9.2e-3 | 8 (4 cyl, 1 torus, 3 planes) / 5e-11 / valid, −3e-9 |
| Rounded handle | 110 (108 planes) / −1.4e-3 | 16 (2 cones, torus, cyl) / 8e-16 / −4e-15 |
| chamfer .03 round an R.03 corner (rfFY) | 15 (the cone corner 5 facets) / −3.1e-8 / −7.8e-8 | 10 (1 cone) / 2e-16 / −2e-16 |

The cut lofts' rel is the difference between the file (the true surface) and the part's mesh, as for an uncut loft
(rfGO: 1e-5, G18 2e-5); OpenCascade and Anvil agree on the file to 9e-7 over the 21.

- **Cut lofts (`loftFacesOf`).** The patches of Anvil's own spline lofts (3+ sections) are handed to the free-form
  face writer in the form an import's faces have: a triangle belongs to the patch all three of its corners project
  into; the caps' triangles lie in the end sections' planes. A hole's rim is then a true curve shared with its
  cylinder wall (`holeLoops`), any other cut a polygon loop. A patch that lost one of its own edges to a cut (a flat
  cut across the loft) keeps its facets, and its neighbours with it, as an import's does.
- **Mug.** Not the torus: the inner wall. One rim point of it is a split point the handle's union left on a chord;
  `snapToCylinders` moved it onto the wall, and a snapped patch was only written when its shape was `plain`, not a
  `band` between two whole circles. The band was refused, the outer wall followed as its coaxial partner, the handle's
  cylinders lost their saddle curves and the torus its circles; with every moved point put back, only the inner wall
  came through as a cylinder (the 1 of 1032). A snapped band is now written.
- **Rounded handle.** A cone's record holds its radius at its origin, which lay past the apex for the grip's lower
  cone (r = −6 at y = 0), and `r > tol` refused the patch. The origin now moves along the axis to the middle of the
  cone's triangles.
- **Cone corner.** `patchShape` refused any loop with a point on the axis; a cone's apex is skipped (it has no angle).
  Both readers take the face (two LINEs and an arc meeting at the apex).

Measured and left (not in this lane's list): Hex nut 65 faces, −3.3e-4 (cone chamfers cut by the flats: hyperbolas);
Moulded cap 58 faces, −2.8e-4 (a drafted cone cut by a rib); Funnel 132 faces, 1.2e-2 (the loft's rings are 7e-3 inside
the radius their `cyl` / `cone` records give, so no edge is a circle of the surface; kernel-features `loftAxisRecords`);
an extruded closed spline is 71 planes (exact to 2e-11, but facets).

## Existing expectations that are now stale (not in this lane's files; the head's to change)

- `anvil/tests/kernel/true-curves.js:467` ("fallback: crossing holes ... keep planar facets"): equal crossing holes
  are exact now. Replace the assertion with
  `assert(count(/=CYLINDRICAL_SURFACE\(/g, step) === 4 && count(/=ELLIPSE\(/g, step) === 2 && count(/=ADVANCED_FACE\(/g, step) === 10 && count(/=PLANE\(/g, step) === 6, 'crossing holes: 4 walls, 2 ellipses, 6 planes');`
  (`edgeUses` on the next line passes as it is).
- `anvil/tests/kernel/exchange.js:34` (`STEP_FACETED`, used at line 126): it lists the Mug's torus and its cylinders
  other than r = 37 as faces "the file keeps faceted" and expects the read-back volume short by their curve
  corrections (84247.233); the file is exact now (85025.3495 = the part, 5e-11). Replace the line with
  `var STEP_FACETED = { 'Hex nut': ['cone'] };`
- `anvil/tests/kernel/rfGO.js:48` ("a loft a later feature cut keeps its facets"): the S29 loft with a hole down its
  axis is 8 B-spline faces, the hole's wall and two caps now. Replace with
  `assert((s.match(/B_SPLINE_SURFACE_WITH_KNOTS/g) || []).length === 8 && (s.match(/=CYLINDRICAL_SURFACE\(/g) || []).length === 1 && (s.match(/=ADVANCED_FACE\(/g) || []).length === 11, 'cut loft');`
  (rfPF's cut-loft test asserts the same part).
