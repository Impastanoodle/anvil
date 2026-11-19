# Solids fidelity 7, lane stepread (rfQE), 2026-11-19

Round local-2026-11-18b. Continues `2026-11-18-solids-fidelity-6.md` (its fuzz `rfONfuzz(kind, seed)`, seeds 6001 on).
Files: `anvil/exchange.js`, `anvil/occt-kernel.js` (`edgeOp`, new `ownEdgeTools`, `edgeFeatureCopies`); tests
`anvil/tests/kernel/rfQE.js` (8), `anvil/tests/occt/rfQE.js` (4). "Before" is main at add0694.

## Table (Anvil's engine, 540 stacks: plate 200, block 120, turned 100, multi 60, step 60)

The `free` kind (lofts, 60 stacks) takes minutes a stack and was not swept; its four named seeds were run one by one
(below). Sweep: build, `Evaluate.checkBody`, screen mesh `meshQuality`, STEP out, Anvil's reader back.

| cause | before | after |
|---|---|---|
| STEP: Anvil's reader refuses Anvil's file | 8 (+ f6003) | **0** (f6003 too) |
| STEP: read back with open / non-manifold edges | 18 | 18 (see 2) |
| STEP: read back within 1e-6 and closed | 337 | **345** |
| STEP: read back more than 1e-6 off (facets) | 177 | 177 |
| body open (s6026; f6001, f6040 of `free`) | 1 + 2 | 1 + 2 (see 3) |
| screen mesh sliver holes | 11 | 10 |
| faces in all files | 43 494 | 43 298 |

No stack got worse. Part volumes moved only on three `step` stacks, whose base part is read back through Anvil's
reader first: s6001 -3e-12, s6033 +2e-12, s6034 -5.9e-9 (the reader's band cut now starts elsewhere).
f6003 (refused) and f6038 (refused) now read back closed; f6038 is 8.4e-5 off because the hole across the loft's
corner keeps its facets (OpenCascade reads the file at the same volume: the file is right, the face is facets).

## 1. Fixed (task 1): every refused file reads back

| seed | cause | fix | read back |
|---|---|---|---|
| t6001, t6051, t6059; boss on a bar tangent to its ruling | the curve where two cylinders meet passes the point where they touch (normals parallel): one C2 spline through that corner swung 1e-3 off both | `saddleCurve` cuts the run there (`curveThrough`: a cubic each side, knot multiplicity 3; tangent of each branch from `singTang`: (1-(v.a1)²)/r1 = ±(1-(v.a2)²)/r2) | 1e-8 |
| t6033 | a cross hole near the bar wall turns sharply; every fifth point kept: 5.6e-4 off | points left out go back while the curve strays > 1e-7 off a cylinder (`deBoor`) | 3e-8 |
| t6055, t6082 | (after the above) the hole's vertex on the band's seam: the cut ran into it, an edge shared by four faces | `paramPatch` starts the band's cut at the first loop's point farthest from every hole point | 2e-8, 3e-8 |
| p6169 | a hole's rim against a round that keeps its facets is a run of chords (degree 1 B-spline); `surfPatch` held its sampled midpoints (1.2e-3 inside) to the surface | chords held by their corners (`info.corners`) | 5e-10 |
| f6003 | an ELLIPSE run that steps back at a mesh fold (+0.003 then -0.039 rad) got its sense from the first chord: written 358 deg the long way | sense from the run's summed turn | 7e-10 |
| s6017 | as t6055 | | 4e-8 |

The saddle changes apply between two cylinders only (beside a free-form face, lane MX's `saddleCurve(pts, S, null, n2)`,
the file's own samples stay as they were: refitting there broke rfPF / rfPI). OpenCascade reads the boss file as a valid
solid at the part (occt rfQE).

## 2. Not fixed: 18 files read back with a non-manifold edge

14 are a part that touches itself along a line by its records, not by its mesh: a hole tangent to a side face
(p6006 p6036 p6044 p6061 p6063 p6105 p6109 p6123 p6130 p6132 p6137, all `holeTangentWall`), a hole tangent to a
keyway's walls (t6028), to a box side (m6035), to a tube's outer wall (t6096). The polygon of the hole touches the
wall at one vertex line inside the wall's polygon (no edge used four times, `nonManifoldCount` 0); the true cylinder
is tangent to the plane, so no valid manifold file exists (OpenCascade calls it not valid). **Proposed fix, kernel-rebuild.js
`zeroThickness` (other lane):** a record check after a cut / boss: a new `cyl` wall whose axis lies at r from a parallel
plane of the part (|n.o - w| - r < 1e-9 size, n.d = 0) with the touching line inside that plane's polygon, or at
r1 + r2 / |r1 - r2| from a parallel cylinder's axis, refuses as zero-thickness geometry (SolidWorks refuses a tangent
hole; not checked in SolidWorks here). Repro: `p.sketch("Top").centerRect(0, 0, 6, 4.25).end().extrude(0.5);
p.sketch("Top", 1.5).circle(-1.0272, -2, 0.125).end().cut("through", { reverse: true });`.

The other four, each with OpenCascade reading the same file valid: m6043 (reader: one triangle of the pocket wall's
patch turned against its neighbours where a side hole crosses the floor circle; file 6.6e-10 in OpenCascade), t6011
(equal bore and cross hole touching at a point plus a slot: a zero-thickness fin of facets on the bore's ruling),
t6022, s6019 (14 edges). Run any with `.scratch`-style probe of report 6 section 3.

## 3. Not fixed (task 2): open bodies f6001, f6040, s6026

f6001: the cross hole `circle(1.125, 0.6596, 0.1875)` through the rectangle-to-circle loft. Two loft facets meet at a
fold (y = 0.5, normals 0.2451 / 0.2344 in y); the hole's wall facet runs a-c straight across the fold where the loft
rim runs a-b-c, b 6.4e-6 off a-c (under EPSILON, so the BSP takes the chord). The crack is the triangle a b c
(edges a-b, a-c open, b-c used three times). `healCracks` runs (5 calls, 3 healed) but cannot close it: inserting b
into a-c makes b-c a fourth use. f6040 is the same at a flat cut x = .75 through the loft (5e-6). Fix wants the
split point of a nearly coplanar fold put on the wall chord in csg.js `splitPolygon`; not attempted.

## 4. Fixed (task 3): the engines agree

- **chain: false** (p6022, 1.0e-4 -> **2.0e-9**): `ownEdgeTools` in occt-kernel.js. A pick with chain: false on a
  straight edge between two planes that has a tangent edge after an end is cut by its own tool (chamfer: the wedge
  prism over the edge; fillet: the kite prism less the round's cylinder), after MakeChamfer / MakeFillet takes the
  rest. Concave edges, curved edges and two-distance chamfers go to MakeChamfer as before.
- **Pattern / mirror of a fillet or equal chamfer** (p6034, 2.1e-3 -> **3e-10**): `edgeFeatureCopies` ran one edgeOp
  per copy, so each copy's pick found the rim the copy before had just made. Now one edgeOp with every copy's picks on
  the part before the pattern, as Anvil's engine does. Two-distance / angle chamfers stay copy by copy (rfPB).
  p6020 / p6014 already agreed (both refuse).
- No new OpenCascade call (MakePrism, MakeWire, MakeEdge_8 / gp_Circ_2, MakeFace_15, BRepAlgoAPI_Cut, BRepAdaptor_Curve
  are all called elsewhere already): the native addon needs no rebuild.
- Not reached: the next causes among the 38 differing volumes / 31 OpenCascade failures (no OpenCascade sweep run).

## 5. Not done

Task 4 (zero-area polygons 13, sliver holes 10) and task 5.

## Tests

kernel rfQE 8 / 8, occt rfQE 4 / 4; kernel full 3366 / 3366; examples 29 / 29 and with --occt 29 / 29; occt-tests 321 / 321. No existing test changed; no STEP
face count pin in `tests/kernel/exchange.js` / `true-curves.js` moved.
