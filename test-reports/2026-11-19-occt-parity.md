# OpenCascade parity: the two engines on the rfON fuzz (lane occtparity, rfQP, 2026-11-19)

Started from bcfbf9f. Files: `anvil/occt-kernel.js`; tests `anvil/tests/occt/rfQP.js` (11 rows); sweep scripts in
`test-reports/repros/`.

## 1. How it was measured

`node test-reports/repros/occt-parity.js --kinds plate,block,turned,multi,step --out parity.jsonl` builds every
stack of section 3e of `2026-11-18-solids-fidelity-6.md` (plate 6001-6200, block 6001-6120, turned 6001-6100,
multi 6001-6060, step 6001-6060: 540; `free` skipped) on Anvil's engine and with `OcctKernel.build` of the same
model, the features Anvil refused suppressed as the app does (`withoutRefused`). Kind `step` keeps the base's STEP
text on the Imported feature (`f.brep`), as the app does; without it OpenCascade reports "a mesh import" for all 60.
`--summary a.jsonl,b.jsonl` prints the table; `--from N --to N` one stack. Two processes (plate + block, the rest)
take about 25 minutes. `occt-parity-steps.js <kind> <seed>` gives both volumes after each feature;
`occt-check-step.js <kind> <seed>` (or `--file x.step --faces 0,1`) names what BRepCheck objects to in Anvil's STEP.

An OpenCascade error on a feature Anvil also failed counts as agreement (both refuse it); "fails" below is a feature
OpenCascade fails that Anvil builds.

## 2. The table

| | before | after |
|---|---|---|
| stacks | 540 | 540 |
| volume equal to 1e-9 relative | 368 | **380** |
| 1e-9 to 1e-6 (Anvil's facets against the exact surface: turned parts, holes) | 101 | 109 |
| differ by more than 1e-6 | 32 | 33 |
| OpenCascade fails a feature Anvil builds | 39 (shell 14, chamfer 12, round 8, cut / join 5) | **18** (shell 9, round 3, chamfer 1, cut / join 5) |
| of these, OpenCascade's solid not valid | 7 | 9 |

Moved, stack by stack (before -> after): fixed to agree **21** (p6036, p6052, p6072, p6142, p6175, b6006, b6014, b6036,
b6041, b6045, b6059, b6064, b6069, b6104, t6002 (volume; solid still not valid), t6007, t6016, t6022, t6066, t6100,
s6060); from "fails" to "differs" 2 (b6021, b6051: the chamfer now builds, then OpenCascade builds a round Anvil
refuses and its solid is not valid: the app keeps Anvil's); b6078 still differs, less (1.6 -> 0.10, section 3d); from "agrees" to "fails" **1**: b6025 (a
.0625 round on a boss's bottom rim that Anvil refuses as "radius may be too large" is built by the ring tool of 3a,
1.7e-3 of the part, then a later round fails on OpenCascade: the app shows Anvil's part; that rim runs between the same
two faces all round, so the ring is a true round there; why Anvil refuses it was not traced). No stack that agreed
before differs now.

Still differing (33): p6009 1.6e-3, p6042 1.3e-2, p6046 1.7e-6, p6054 6.4e-6, p6059 8.4e-6, p6079 1.9e-4, p6105 1.8e-1,
p6118 6.2e-5, p6123 1.3e-5, p6128 1.1e-5, p6133 1.1e-4, p6180 3.2e-6, p6190 5.5e-3, p6195 2.9e-6, b6002 1.3e-6, b6009
3.2e-5, b6021 1.2e-2, b6038 1.3e-1, b6046 1.2e-2, b6051 3.5e-3, b6071 1.5e-3, b6072 5.1e-3, b6078 1.0e-1, b6098 4.7e-5,
b6105 1.7e-1, t6003 1.9e-2, t6018 5.3e-3, t6088 2.2e-6, t6094 4.7e-6, s6023 2.0e-4, s6028 5.9e-5, s6029 7.3e-5, s6040
7.4e-5. p6042 is Anvil failing a .375 corner chamfer ("distance may be too large") that OpenCascade builds; the app
shows OpenCascade's there.

Still failing on OpenCascade (18): shells b6010, b6044, b6052, b6074, b6079, b6083, b6092, b6094, b6096; rounds p6158,
b6025, b6120; chamfer p6193; cuts / joins p6121 ("could not cut", 64 s), p6136, b6090, t6076, t6080.

## 3. Causes fixed, by how many stacks each explains

### a. ChFi3d refuses a chamfer / round whose band runs into a hole, a notch or past a thin wall (17 stacks; 14 fixed)

"OpenCascade could not chamfer these edges (distance too large?)": p6142 (a .225 chamfer on a plate's top edge with a
Ø.375 hole .01 inside it), t6016 (a .125 chamfer on a tube's rim with a Ø.125 hole .0375 inside the wall), p6036 /
p6052 (corner chamfers .25 / .375 on plates .1875 / .06 thick whose top edge was rounded first), b6014, b6021,
b6051, p6072, p6175, s6060; "could not fillet" t6007, t6022, t6100 (an R.125 round on a tube's rim crossing a
hole or a groove), b6041, b6069, b6104 (rounds on boxes with walls thinner than the round).

Anvil cuts each edge's tool (the wedge, or the wedge less the round's cylinder) from the body, so the hole that is
already there notches the chamfer face. `occt-kernel.js` `prismEdgeOp`, tried after ChFi3d and `widenedEdgeOp`:
- a straight convex edge between two planes: the wedge prism over the edge (`edgePrismTool`, the tool lane QE's
  `ownEdgeTools` already built for `chain: false`; now shared). At each end (`prismEnds`) the faces of the body there
  other than the edge's two must be planes: the band runs on until its section is past each of them (a square end: 0;
  a chamfer across the end, p6142's corner chamfers meeting the top chamfer: up to it); a cylinder tangent to one of
  the edge's planes (an earlier round across the end) lets it run on by R + size, as Anvil's `capFor` does (p6052).
  Refused (null, OpenCascade fails the feature as before) when another face there is curved (a hole notching the
  end: p6193), material is still under the band just past where it stops, or an edge runs on tangentially from the
  end (a round, or a chamfer within the round it meets: that is tangent propagation, p6158 rounds the whole top
  perimeter in Anvil);
- a whole circular rim between a plane square to its axis and the cylinder about it: the chamfer triangle or the
  round's corner revolved once (`rimRingTool`; t6016, t6007, t6022, t6066, t6100).
The cut must give one valid solid, else null. Measured against Anvil: p6142 2.6e-9, p6036 4e-11, p6052 1.1e-8,
t6016 1.0e-9, t6007 4.4e-9, t6022 5.9e-10, t6066 1.3e-8, t6100 1.0e-7 (Anvil's facets), b6014 3e-12, b6041 8e-14,
b6069 2e-15, b6104 2e-14, p6175 1e-13, s6060 4e-16.

Left: p6193 (the notch end; what SolidWorks does where a chamfer runs into a hole notching its edge was not
checked), p6158 (tangent chain: Anvil rounds the whole top perimeter with R.225 round R.0625 corner rounds, which no
rolling ball can follow; OpenCascade refuses; SolidWorks not checked), b6021 / b6051 (OpenCascade builds the corner
round of a box with .01 walls that Anvil refuses as "radius may be too large", and its solid is not valid: the app
keeps Anvil's), b6120 (the picks of an R.375 corner round at y .375 on edges only .075 tall: the two engines pick
different edges).

### b. The shell's offset collapses (14 stacks; 6 fixed)

`BRepOffsetAPI_MakeThickSolid` fails ("could not shell the body with this thickness") or comes out refused ("offset
walls cross") where a wall's inward offset folds: a step .2 thick under a .125 shell (b6045), a hole .051 above the
floor under a .125 shell (b6059), a convex round smaller than T (b6006 R.0625 under T .1, b6036, b6064). None of its
options (intersection, self-intersection, remove internal edges, arc joins) builds b6006.

`slabShell`, when the offset fails or is refused: the wall is every point of the body within T of a kept face. Each
planar face's slab is the face grown by T in its plane (`MakeOffset`; a square inside corner's offsets meet T past the
corner, past an outside corner the extra lies in air or within T of the next face), inner wires over air (holes)
left out and the others added as inner wires (`MakeFace.Add`; a prism of the inner wire cut from the outer one left an
invalid solid on b6059), swept T inward; a cylinder's slab is `MakeThickSolidBySimple` on the side that lies in the
body. Cavity = body less every slab; the result passes the same `shellOk` ceiling as before. Closed form for b6045:
14.525 - 1.75 x 1.875 x 3.25 = 3.8609375, OpenCascade 8e-16 from Anvil. Others: b6006 1e-13, b6036 3e-15, b6064 9e-14,
b6059 1.2e-8 (Anvil's facets).

Only planes and cylinders: b6094 (an R.125 round chained round three R.375 corner rounds and a sharp corner, tori and a
vertex blend) came out 1.0e-2 light with every face's slab built, so a body with any other curved face leaves the
shell to Anvil (with curved faces the app takes OpenCascade's solid at 2e-2, so a wrong shell there would drive).
Left: b6010, b6044, b6052, b6074, b6079 (b6079: `MakeThickSolidBySimple` of a blind hole's wall gives a slab outside
the body one way and nothing the other), b6083, b6092, b6094, b6096.

### c. A cut OpenCascade skipped without a word (t6002; 1 stack)

A Ø.375 Cut-Extrude across a tube grooved by a Revolve Cut: `BRepAlgoAPI_Cut` returned the body unchanged, no error, no
warning, and `BRepAlgoAPI_Common` of the two is empty although a point of the tool classifies IN both (repro: the three
lines of rfQP's t6002 row). Moving the tool 1e-9 to 1e-5, a fuzzy value, unifying the body first: unchanged; rotating
it about its axis by pi: 2.7e-4 off. `applyCut`: when a single-solid cut removes less than 1e-6 of the body and a 6^3
probe of the tool's box finds a point inside both (`toolInside`), the cut is redone with the tool in two halves
(`halvesCut`: the tool's common with two boxes either side of a plane a hair off its middle, x then y then z): 4.6e-9
from Anvil. t6002's solid is still not valid at the end (two later cuts), so the app keeps Anvil's.

### d. Rib over a hole (b6078; volume 1.6 -> 0.10)

`ribTool` swept every face of (body ∩ rib prism) facing the rib along its growth and cut them from the prism; the
sweep of a hole's wall through the base made that Boolean fail without a word and the untrimmed prism (5.4 in³ for
Anvil's .27) went on the part. A curved face's sweep is now cut only where it meets the plane-trimmed rib. What is left
is Anvil's: its rib runs through the hole in the base under it (0.0557 in³ more than without the hole); SolidWorks'
rib stops at the body, and through a hole would not meet it. **For the kernel lane**: `K.ribLayout` / Anvil's rib over
a hole, seed b6078 (`p.sketch("Front", 0).line(0.25, 1.5491, 1.982, 0.25).end().rib(0.1875)` on the L-bracket with
`circle(1.05, -0.1, 0.125)` cut through its base).

## 4. Anvil's STEP of t6028: what OpenCascade objects to (task 4)

`node test-reports/repros/occt-check-step.js turned 6028 --save t6028.step`: `BRepCheck_Shell.Closed` = 28 (NotClosed);
every face and edge alone is valid. Three free edges, all at the cross hole's rim on the keyway's end plane (z = -.3425,
y = .2559): the plane is in two pieces touching at the rim's ends (lane solidcracks' `pinchSplit`), and each piece uses
half of `CIRCLE #52` (r .0625): `#53 = EDGE_CURVE(#45, #27, #52, .F.)` and `#63 = EDGE_CURVE(#27, #45, #52, .F.)`
(faces `#62` and `#94`). The hole's wall on that side (`ADVANCED_FACE #424` on `CYLINDRICAL_SURFACE #413`) bounds the
same rim with its own closed edge `#416 = EDGE_CURVE(#415, #415, #52, .T.)` (vertex `#415`, at the same point as `#27`).
So #53, #63 and #416 are each used by one face. The cause is in Anvil's writer (`exchange.js`, export lane), not in
OpenCascade's reading: the wall's rim loop must use #53 and #63 (reversed) instead of a closed edge of its own, i.e.
when `pinchSplit` (or any split) cuts a planar face's loop at vertices on a circle, the curved face across that circle
must take the same vertices. The read solid's volume is right (occt rfQJ); only BRepCheck fails.

## 5. What is left, with reproductions

- Feature by feature for any seed: `node test-reports/repros/occt-parity-steps.js <kind> <seed>`.
- Shells (8, section 3b): curved faces other than cylinders, and blind holes' walls.
- t6003 (1.9e-2, not valid): an .03 chamfer on a bar's rim arc cut by a flat: ChFi3d returns a solid that is not valid,
  0.025 in³ light; the arc is not a whole rim, so `rimRingTool` does not apply.
- t6076 / b6090 / t6080: the FZ2 checks ("cut into a heavier solid", "joined into a lighter solid") catch Booleans that
  went wrong; not traced.
- p6105 (1.8e-1), b6038 (1.3e-1), b6105 (1.7e-1): OpenCascade's solid not valid; not traced.
- Small differences 2e-6 to 2e-4 (p6046, p6054, p6118, p6123, b6009, s6023 ...): not traced; mostly round / chamfer
  chains on Anvil's facets against the exact surfaces.

## 6. OpenCascade calls

No class or method that `occt-kernel.js` did not call before (checked against the file at bcfbf9f): `MakeRevol_1`,
`MakeThickSolidBySimple`, `MakeOffset_2.Perform`, `MakeFace_2.Add`, `BRepClass3d_SolidClassifier_2`,
`BRepAlgoAPI_Common_3`, `Reversed`, `gp_Circ.XAxis / YAxis`, `BRepAdaptor_Surface.Cylinder` were all in use. The
desktop app's native engine needs no rebuild for this lane.
