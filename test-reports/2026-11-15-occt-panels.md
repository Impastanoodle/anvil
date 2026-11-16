# Perforated panels on OpenCascade, re-timed (lane MU, 2026-11-15)

24 x 48 in panel, 16 ga (T 0.0598), staggered Ø.25 holes (600 = 20 x 30, 1800 = 30 x 60, 3200 = 40 x 80 rows offset by
half a pitch). Four ways of modelling it:

- **a** Base Flange sketched with its holes
- **b** Base Flange plate + one Cut-Extrude of every circle
- **c** Base Flange plate + a Cut-Extrude of two staggered seed holes + LPattern (cols x rows/2)
- **d** = a + four Edge Flanges (1 in, one per side)

Node 26, home PC (16 threads) with five other agents running: every number is the lower of two runs (each run itself
best of 2 builds). Seconds. `OcctKernel.build` = everything OpenCascade does (translate / build, Booleans, validity,
mass properties, meshing, tangency). "Page work" = what `occt-worker.js` does after the build for the page
(`toBodies`, `meshFromBody`, `bodyEdges`, `meshCurveInfo`, `analyticNormals`, pack), all Anvil JS. "Anvil rebuild" =
Anvil's own kernel, which in the app finishes BEFORE OpenCascade is asked (`ui-occt.js` sends the build from
`afterBuild`, with Anvil's mesh).

## Before this lane (the queue's line): 1800 holes, native addon

163 s: cut 22 s, final BRepCheck 27 s, BRepMesh 96 s. That predates the plate path (rfKV, 2026-11-11).

## Now: OcctKernel.build total

| holes | form | WebAssembly | native | faces | triangles |
|---|---|---|---|---|---|
| 600 | a | 0.59 | 0.34 | 606 | 79 212 |
| 600 | b | 0.54 | 0.33 | 606 | 79 212 |
| 600 | c | 0.48 | 0.30 | 606 | 79 212 |
| 600 | d | 0.86 | 0.37 | 630 | 79 740 |
| 1800 | a | 1.55 | 1.21 | 1806 | 237 612 |
| 1800 | b | 1.65 | 1.48 | 1806 | 237 612 |
| 1800 | c | 1.68 | 1.54 | 1806 | 237 612 |
| 1800 | d | 2.24 | 1.55 | 1830 | 238 140 |
| 3200 | a | 3.84 | 4.05 | 3206 | 422 412 |
| 3200 | b | 3.56 | 2.86 | 3206 | 422 412 |
| 3200 | c | 4.79 | 3.15 | 3206 | 422 412 |
| 3200 | d | 5.09 | 4.29 | 3230 | 422 940 |

## Where the time goes (1800 holes, native; WebAssembly in brackets)

| stage | a | b | c | d |
|---|---|---|---|---|
| translate / build (holes laid in, no Boolean) | 0.10 (0.23) | 0.09 (0.24) | 0.11 (0.22) | 0.15 (0.61) |
| of which plan + lay in the holes | 0.09 (0.22) | 0.08 (0.22) | 0.08 (0.18) | 0.12 (0.26) |
| Booleans for the holes | 0 | 0 | 0 (the 2-hole seed is one) | 0 |
| UnifySameDomain | 0 (skipped, round holes) | 0 | 0 | 0 |
| validity check (BRepCheck) | 0 (skipped: plate path) | 0 | 0 | 0 |
| mass properties | 0 (by formula) | 0 | 0 | 0 |
| meshing | 0.99 (1.16) | 1.23 (1.24) | 1.31 (1.31) | 1.26 (1.51) |
| of which BRepMesh (side faces, flanges) | 0.00 | 0.00 | 0.00 | 0.01 (0.02) |
| of which earcut of the two perforated faces | ~0.7 | | | |
| tangency (EncodeRegularity) | 0.05 (0.12) | 0.07 (0.13) | 0.06 (0.12) | 0.06 (0.13) |
| page work (worker, Anvil JS) | 3.24 (3.50) | 3.25 (3.94) | 3.14 (3.94) | 3.13 (3.52) |
| of which `K.bodyEdges` | 1.4-2.6 | | | |
| Anvil rebuild (before OpenCascade starts) | 2.5 (3.1) | 0.4 (0.5) | 4.6 (4.8) | 14.1 (14.8) |

So the 1800-hole panel, end to end in the app: Anvil rebuild + OpenCascade + page work = about 7 s (a), 5 s (b),
9 s (c), 19-23 s (d) on either engine. OpenCascade's own part is 1.2-2.3 s in every form.

3200 holes, Anvil rebuild: a 9.4, b 0.8, c 9.3, d **55 (native run) / 88 (WebAssembly run)**; page work 5.8-8.6.

## Same solid as the Boolean build (native, 1800 holes, `kvPlate { check: true }` vs `{ on: false }`)

| form | BRepCheck of the plate path's body | volume vs the Boolean build | faces (both) | volume vs analytic |
|---|---|---|---|---|
| a | valid | 8.0e-14 | 1806 | -3.6e-15 |
| b | valid | 8.0e-14 | 1806 | -3.6e-15 |
| c | valid | 8.0e-14 | 1806 | -3.6e-15 |
| d | valid | -2.3e-13 | 1830 | (flanges) |

(The check itself costs 30-70 s at 1800 holes: that is why the plate path skips it. The Boolean builds took 38-125 s.)

## Changed in this lane

- `kvEarcut`'s hashed ear test no longer makes a closure per ear: the same tests in the same order (identical triangles,
  hash-checked), 35-40 % less earcut time (3200 holes: 0.84 -> 0.53 s per face standalone). Earcut is now ~70 % of
  OpenCascade's time on a big panel.
- `widenedEdgeOp` (fillet / chamfer whose size uses up the face beside the edge) takes circular edges too: a tube's
  annulus rounded at either rim (R = its width), a disc chamfered / rounded by its thickness. Before: "radius too large?"
  and Anvil's faceted solid drove. Now valid, analytic volume to 1e-9, SolidWorks' faces (4 / 3).

## Follow-up MU2: Anvil's own rebuild of the flanged panel

`coplanarBody` (kernel-sheetmetal.js) bins its representative planes by offset (1e-8 bins, own + both neighbours,
earliest match kept): the same grouping as the old scan of every representative. `K.coplanarStats.compares` counts.

| Anvil rebuild, form d | before | after |
|---|---|---|
| 1800 holes, quiet machine (profiler on) | 16.0 | 10.8 |
| 1800 holes, same busy machine, back to back | 29.1 | 14.7 |
| 3200 holes, quiet | 55-88 | 27.1 |
| 3200 holes, same busy machine | 130.4 | 44.4 |

Identical results, before (HEAD) vs after, 36 parts (every non-assembly example, panels 600 / 1800 / 3200 in all four
forms, an 8 x 8 flanged panel with 100 holes): same polygons (planes, vertices, tags), `positions64`, `massProps`,
`bodyEdges`, and flat DXF where the part is sheet metal (3 examples + the small panel; the big panels' flat pattern is
the known quadratic `mergeFlatRegions`).

What is left at 1800 (d), quiet, 10.8 s: `solidFromProfile` subtracting every hole of the Base Flange sketch 3.4 s
(3200: 12.4 s, `healCracks` 6.7 of it), `bodyEdges` inside `flangeLayout` 2.1 s (3200: 3.2 s; linear in the mesh,
not a quadratic lookup, so left as is), the flange `union` 1.4 s (2.8), `bendVoids`' band-slab subtract 0.9 s (1.7:
`nearOperands` scans the whole perforated sheet for a slab at one edge), `meshFromBody` 0.5 s (1.0). The 3 s / 8 s
targets need the first, third and fourth: csg.js and kernel-curves.js, not this lane's files.

## Not fixed (other lanes' files)

1. **Anvil's Edge Flanges on a perforated sheet**: 14-18 s at 1800 holes, 55-88 s at 3200, and the app waits for it
   before asking OpenCascade. Profile (1800, form d, 16 s): `coplanarBody` (kernel-sheetmetal.js ~242) 7.4 s self time
   (each polygon compared with every distinct plane so far: 57 600 wall facet planes, quadratic; a hash on the rounded
   normal and offset would make it linear), `flangeLayout` 11 s inclusive, `subtract` / `retryExact` 3.9 s.
2. **The worker's page work**: `K.bodyEdges` 1.4-2.6 s at 1800, 3.7-4.6 s at 3200 (kernel-mesh.js faceOutline / weld).
3. Possible in ui-occt.js later: start OpenCascade with Anvil's rebuild instead of after it (it needs `App.build` only
   for `withoutRefused` and the Anvil mesh for face tags), which would take Anvil's rebuild off the critical path when
   OpenCascade drives.
