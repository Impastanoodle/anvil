# Solids fidelity 9, lane solidleft (rfQS), 2026-11-19

Round local-2026-11-18b, base 3eb0119. Fuzz `rfONfuzz(kind, seed)` (seeds written kind letter + seed; the 540 stacks:
plate 6001-6200, block 6001-6120, turned 6001-6100, multi 6001-6060, step 6001-6060). Files: `anvil/exchange.js`
(writer `loopEdges` / `Exchange.circleCuts`; reader `zipFolds`), `anvil/kernel-features.js` (`buildRib`, `K.ribBridge`);
tests `anvil/tests/kernel/rfQS.js` (3), `anvil/tests/occt/rfQS.js` (1); sweep `test-reports/repros/step-validity-sweep.js`.

## 1. t6028: the hole wall's rim and the split keyway floor (writer)

The keyway floor is two pieces touching at the cross hole's rim, each written with half of the circle; the hole's wall
wrote the same rim as one closed edge of its own, so three EDGE_CURVEs were used by one face each (OpenCascade:
`BRepCheck_Shell` NotClosed, no solid). `loopEdges` now records the vertices where a circle's arcs start and end
(`circleCuts`) and a whole rim on that circle is split at the same vertices, so both faces use the same arcs (planar faces
are written before curved ones; a band / cap keeps its whole circle, its seam starts on it). `Exchange.circleCuts.on =
false` gives the old file.

t6028: OpenCascade reads 1 valid closed solid at Anvil's volume (rel 9.5e-9; was 0 solids, shell NotClosed); every
EDGE_CURVE used by exactly two oriented edges (was 3 used once). Anvil's reader unchanged (closed, 4.3e-10).

**OpenCascade validity sweep, 540 stacks** (`step-validity-sweep.js`, one solid + BRepCheck valid + shell closed):
off **505** -> on **506**. The only file that changed status is t6028; m6035 still NotClosed (see 4). The other 34:
- 14 plates, BRepCheck_Face IntersectingWires (p6017 p6025 p6044 p6052 p6065 p6091 p6093 p6101 p6102 p6110 p6157 p6176
  p6198 p6200): two holes the fuzz made tangent (`holesTangent`) whose decimals overlap by about 1e-5 (p6025: r .25 and
  .0938, centres .343783 apart, sum .3438). The facets of the two holes do not meet (sagitta 3e-4 > overlap), so the
  mesh has two separate loops; written as exact circles they cross. Not a writer bug: the part is under the kernel's
  tangency check (`kernel-rebuild.js` tangentContacts, lane solidcracks, which refuses tangency to a wall, not hole to
  hole). Proposed for the kernel lane: refuse two holes whose circles overlap or gap by less than the facets' sagitta,
  as for a hole tangent to a wall.
- 20 read as two or more solids, all valid and closed (b6025 has two closed shells): parts in several lumps; not a defect
  as far as measured.

## 2. Cracked read-backs in Anvil's reader

Sweep (Anvil's reader, open / non-manifold edges): 2 stacks before (m6043, s6019; the third one of report 8 no longer
shows) -> **1** (s6019).
- **m6043 fixed** (reader): the pocket wall (cylinder r .25) is a two-arc, two-ruling patch, so it was zipped; its floor
  side is the floor's arcs plus the side hole's curve leaving them upright, and the zip folded a triangle there (3 edges
  oriented inconsistently, read back -1.8e-7). `zipFolds` simulates the zip in (r angle, height) and sends a patch whose
  triangles do not all turn one way to `cylPatch`. Now closed, -5.2e-12.
- **s6019 left**: 14 non-manifold edges on the ruling x = -.30678, z = .39350 (the slot's end cylinder where it meets the
  outer tube's facets, y 0 to 1, many collinear vertices), and both readers (Anvil and OpenCascade, valid) read the file
  3.5e-4 heavy because the bore (r .25) goes out as facets (writer fallback 2232 at (0.010, 0, 0.2498)). Repro:
  `node test-reports/repros/step-validity-sweep.js --kinds step --from 6019 --to 6019`.

## 3. A rib over a hole (b6078; kernel-features.js)

`buildRib` swept each face of (body ∩ rib prism) that faces the sketch; over a hole through the base the base's top face
has a gap, so the rib ran down the hole to its far wall (0.0557 in3 on b6078). A flat face the rib meets is now swept as
its plane's convex hull of where it meets the rib (`K.ribBridge`): the rib stops at that face, the hole stays open under
it. L-bracket rib .1875 over the Ø.25 hole: part 3.1986695 = no-hole rib part 3.2109414 less the whole hole .0122718,
to 1e-9 (was 3.2542863). The hull needed its points rounded to 1e-9: `rfDYhull` on 307 points of a thin strip with 2e-16
noise skipped two true corners.

Volumes moved (the 34 rfON stacks with a rib): b6078 -1.71e-2 (the fix); b6008, b6050, b6068, b6070 by 2e-11 to
1.4e-10 (Boolean rounding of the new tool); the rest identical.

**For the occt lane (occt-kernel.js `ribTool`, not edited)**: OpenCascade's rib adds .605 in3 on b6078 against Anvil's
now .2109 (its planar sweeps keep the hole column too). Same rule there: group the planar faces of `rfDYcommon(all, P)`
facing the sketch by plane, make one face from the convex hull of each group's vertices (in its plane), and sweep that
instead of the faces (`BRepPrimAPI_MakePrism`); then OpenCascade's rib equals Anvil's.

## 4. Not done / found

- Task 4 (zero-area polygons, screen-mesh sliver holes): not reached.
- **Largest STEP fidelity gap**: 185 of 540 stacks read back at the facet volume in both readers (1e-5 to 7e-3 rel, both
  readers agree on the file): the writer sends a cylinder / cone / torus patch to facets (`Exchange.stepLog` why 2232:
  an edge of the patch no classification names; 174 stacks, 939 cylinder patches). Measured case: a .03 chamfer on a
  bar's rim arc cut by a flat (t6003, rel -3.8e-3): the vertex where the chamfer meets the flat is on the facet chord,
  1.1e-4 inside the cylinder, so the ruling there is not on it and the bar's whole side goes out as facets.
  `p.sketch("Top").circle(0, 0, 0.5).end().extrude(1.5); p.sketch("Top", 1.5).rect(0.475, -1, 1, 2).end().cut("through", { reverse: true }); p.chamfer(0.03, [[-0.4006,1.5,0.2992]]);`
- m6035: OpenCascade NotClosed (28) with or without this lane's change; not traced.

## Tests

kernel rfQS 3 / 3 (t6028 every edge used twice and read back closed, control off: 3 edges used once; m6043 read back
closed to 1e-9; b6078 rib over the hole to 1e-9, control off fills it). occt rfQS 1 / 1 (t6028 valid at the volume).
Existing tests changed: none. The rfQJ occt row's note about "not valid" no longer prints (it is valid now).

## 5. Follow-up QS2

- **OpenCascade's rib** (`occt-kernel.js` `ribTool`): the same rule, through the shared `K.ribFlatHull(n, pts)` (kernel-features.js): the planar faces of `rfDYcommon(all, P)` facing the sketch are grouped by plane and the convex hull of each group's vertices is swept (`polyFace3` + `BRepPrimAPI_MakePrism`; no new OpenCascade calls). Lane QP's change (curved sweeps cut only where they meet the plane-trimmed rib) is included as written there, so the merge sees the same lines. Also guarded: a curved face's sweep that is no solid (volume -7.8e-17: the hole wall swept partly along itself) gave a common equal to the whole rib and the cut emptied it; a common larger than the sweep is not cut. b6078 and the L-bracket: OpenCascade equals Anvil to 1e-7 (occt rfQS); rib groups CW, rfDY, rfDZ, rfKY, rfPO pass.
- **Holes overlapping within the facets' sagitta** (`kernel-rebuild.js` tangentContacts / tangentRefusal; `K.tangentContactCheck.near`): parallel opposite-facing cylinder walls whose exact circles cross by less than the two facets' sagittas are refused like a tangency, with the overlap and how far to move ("overlap by 0.000017 in ... Move one of them at least 0.001 in away from the other, or 0.0026 in farther into it"). The 14 plates are now refused at the second hole. One more stack changed: p6085 (Ø.125 and Ø.25 holes overlapping by 2.7e-6, refused at the second hole; without the check a later slot cut the pinch away and OpenCascade read it valid). No other stack of the 540 changed. No existing test drills such a pair (full suite green).
