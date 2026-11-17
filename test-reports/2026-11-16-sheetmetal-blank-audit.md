# Sheet-metal blank audit (lane NX / smaudit, round local-2026-11-16b)

The shop cuts blanks from Anvil's flat patterns. For every sheet-metal part, two things were checked: the folded
solid against its own blank, and the blank against the closed form of each feature.

## Method

**Identity.** Every bend's folded metal is (R + T/2)·A·T per unit width. Its blank strip is BA per unit width.
So, for any bend allowance in use (K-factor, BA, BD, bend table):

    V_folded = T·(A_blank − Σ S_i) + Σ S_i·T·(R_i + T/2)·A_i / BA_i

Here S_i is the blank's area inside bend line i ± BA_i/2, clipped to the line's length. Areas use true arcs, as
`dxfLoopCurves` writes them, which is what the laser cuts. Bend lines come from `flat.bends`. Tolerance: 1e-6 relative.

**Closed forms (SolidWorks' definitions, inches).** OSSB = (R + T)·tan(A/2) up to 90°, and R + T beyond that.

| Feature | Blank across the bend (from the far edge) | Bend line |
|---|---|---|
| Edge Flange, plate W × D, length L | D − shift + BA + Lw | −shift + BA/2 from the edge |
| shift | Bend Outside 0; Material Inside ((R+T) − R cos A)/sin A (R + T at 90°); Material Outside R tan(A/2) (R at 90°); Virtual Sharp (R+T) tan(A/2); Tangent to Bend R + T | |
| Lw | Outer VS L − (R+T) tan(A/2); Inner VS L − R tan(A/2); Tangent Bend L − OSSB | |
| Hem, overall length L | D − shift + BA + leg. Closed: R = 0.05 mm, A = 180°, leg L − R − T; Open: R = gap/2, leg L − R − T; Tear Drop: leg = u_end/(−sin A) − 0.2 mm (u_end = min(R − R cos A, R − (R+T) cos A)); Rolled: leg 0. Inside: shift R + T, Bend Outside: 0 | −shift + BA/2 |
| Jog, offset D, angle A | Fix projected length off: plate length unchanged; on: + 2·BA + g − ((2R + T) sin A + g cos A), with g = (d_in − 2R(1 − cos A) + T cos A)/sin A (d_in = D − T outside, D inside, D − 2T overall) | second line BA + g after the first |
| Sketched Bend | the plate, unchanged | line − shift + BA/2 (Centerline: on the line) |
| BA | K: A(R + K·T); BD: 2·OSSB − BD; table (BD rows): the same, interpolated linearly by angle | |

## Sweep (3,600 builds; `.scratch` driver, not committed; rfNX keeps about 150 of them as tests)

20 / 16 / 14 / 11 ga (R = T), K .33 / .44 / .5, one BD (BD90 of K .42) and a BD table (30° to 270° rows).

| Group | Built | Refused (correctly) | Blank vs closed form | Folded vs blank | Open / non-manifold |
|---|---|---|---|---|---|
| Edge Flange, 5 angles × 5 positions × 3 length refs | 1332 | 48: BD larger than 2·OSSB at 30° | exact (2e-15) | exact (2e-15) | 0 |
| Hems, 6 kinds × 2 positions | 240 | 0 | exact | exact | 0 |
| Jogs, 4 angle / offset rules × 4 positions × fix on / off | 568 | 72: offset under the minimum | exact (2e-13) | exact (6e-13) | 0 |
| Sketched Bend, 45 / 90 / 135 × 4 positions | 224 | 16: BD | exact | exact | 0 |
| Tab, Vent, Break Corner, Swept Flange channel, Unfold / cut / Fold | 160 | 20: Swept Flange on a Base Flange (refused by design) | — | exact (one row 2e-6, 11 ga K .33 slot) | 0 |
| Lofted Bend sq → sq | 20 | 0 | — | 5e-8 (the facets' mitres) | 0 |
| Edge-flange mitres (square 60 / 90 / 120, trapezoid), trays | 500 | 0 | exact | under by 1.4e-4 to 6e-3 | 0 |
| Miter Flange (L, 4 edges, trapezoid) | 180 | 0 | — | under by 4e-4 to 2.5e-3 | 0 |
| Closed Corner butt / overlap / underlap, bend closed / open | 120 | 0 | — | open: exact; closed bend: under by 3.4e-4 / 4.3e-4 / 8e-6 | 0 |
| Corner Relief, 5 types | 100 | 20 (non-square, below) | — | rect / tear / constant width exact; circular +1.2e-5, obround +8.7e-6 | 1 mesh row (below) |

## Off by more than 1e-6, grouped by cause

1. **Mitred and closed-bend corners: folded under the blank by about (R+T)²·T per corner.** This holds for edge
   flange mitres, multi-edge trays, Miter Flange and Closed Corner with the bend closed. It is SolidWorks' own
   definition, not a defect. SolidWorks lays each strip out straight to the wall's end line. Its folded bend end
   is a helicoid from the base corner. Its own parts read 3.9e-4 (120° square) and 8.1e-4 (trapezoid) under
   their blanks. Anvil's blanks are pinned to SolidWorks' outlines and areas to 1e-6, and its folded volumes to
   SolidWorks' within 1e-5 (rfIS, rfIZ, rfDL, rfKC). Already right. The brief's "3.6e-3 to 5.4e-3 over" is the
   state from before lane rfIS (2026-11-05). The identity is not the right check at a mitre.
2. **Two Edge Flanges on neighbouring edges whose walls cross.** This happens past 90°, where a wall leans back
   over the sheet: 120° / 120°, 120° then 90°, 100° Bend Outside. The CSG union hid the crossing. The blank came
   out notched along the crossing and the folded part was 0.2 % to 1 % over it, with no message. A plain flange
   beside an open hem does the same: rfFT pin 10's part, 7.3e-4. **Fixed: a feature warning** naming the other
   flange or hem. `hemCrossing` now also tests a plain flange's wall when the flange is past 90°, or when an
   earlier bend is past 90°. The bend's start is left out of the test: on a rolled sheet's chords it reads 1e-4
   in³ in common at any angle. The part still builds, because rfMY's tray 90° → 120° edit and rfFT pin 10 must
   keep building and those files are outside this lane. A refusal would be stricter: the head should decide.
   Edges in one feature still mitre with no warning. 90° then 120° (no crossing) builds exactly, with no warning.
3. **Sketched Bend / Jog, Material Inside / Outside, off 90°.** The bend was set back R + T / R at every angle,
   so the wall's outer or inner face missed the sketch line. At 45° on 11 ga it was 0.0205 short. Edge Flange,
   measured in SolidWorks, uses ((R+T) − R cos A)/sin A and R tan(A/2). **Fixed** to match Edge Flange. The
   blank is unchanged; the bend lines move. 90° is bit for bit. Not measured on a SolidWorks Sketched Bend or
   Jog: rfGD's jog rows compare the bounding box only, which does not depend on the position.
4. **Corner Relief at a corner that is not square** (trapezoid, 71.6°). It was refused with "the part has no
   corner where two bends meet". **Fixed:** "the bends at … meet at 71.6°; Corner Relief is built only where two
   bends meet square". A square corner closer to the pick is still taken.
5. **Circular / obround Corner Relief: the solid's hole is a 32-gon.** The DXF writes the true circle, so the
   blank is right. The folded part is 1.2e-5 heavy. Not fixed: the bend-strip part of the hole is wrapped, with no
   exact surface to tag. Raising the chord count would change every such flat's vertices.
6. **Miter Flange bend end on 3 chords** (`miterTaper`). The chords match SolidWorks' volume at 16 ga to 6e-7.
   The true end is t − tB = (tW − tB)·sin θ, which reads 1.5e-5 in³ per corner over SolidWorks. At 11 ga the
   chords sit 5e-5 under the true curve. No SolidWorks 11 ga value exists, so this is left as is. It does not
   affect the blank.
7. **Hem and >90° flange bounding boxes are chord-low** on the mesh: Tear Drop 1.8e-4 at 11 ga, a 120° flange's
   outside 2.7e-4. `flangeProfile` has no vertex at 90° / 180°. Mass properties and drawing edges are exact. Mesh
   only, not changed.
8. **meshQuality: 2 non-manifold edges** on 11 ga, K .33 / .30, circular Corner Relief Ø.25 / Ø.3 (repro
   below). `Evaluate.checkBody` finds the body closed (0 / 0), so this is a weld at the mesh's 1e-9·diag
   tolerance. It belongs to the solids lane (kernel-mesh.js).

Repro for 8: `p.sheet(0.1196, 0.1196, 0.33)`; `rect(0,-3,4,3)` base flange; flanges `[[4,T,1.5]]` and `[[2,T,3]]`
inside / outer; `p.cornerRelief([[3.7608, T, 2.7608]], 0.25, { reliefType: "circular" })`; `K.meshQuality(mesh).nonManifoldEdges` = 2.

## Task 3: folded geometry against SolidWorks' definitions

- **Tear Drop.** The curl's inner radius is R through the angle. The tail is tangent and straight, and stops 0.2 mm
  (along the tail) short of the sheet. The curl's top sits at the sheet + 2R + T and its outside at shift − (R + T),
  apart from the chord sag in (7). The tail's clearance is |sin A|·0.2 mm.
- **Rolled.** The arc alone: inner R through the angle, end face radial, no leg.
- **Jog positions.** Checked on the riser's faces. Centerline: the strip is centred on the line. Bend Outside:
  the bend starts at the line. Material Inside / Outside: the riser's outer / inner face is on the line, at
  45° / 60° too after fix 3. The second bend is BA + g further on.
- **Lofted Bend.** Folded = the facet development × T to 5e-8. Facets meet sharp (R 0, BA 0), so the K-factor
  does not enter. Not compared with a SolidWorks Bent / Formed part.
- **Vent.** Folded = blank × T to 1e-15 (rfDT's exact circles).
