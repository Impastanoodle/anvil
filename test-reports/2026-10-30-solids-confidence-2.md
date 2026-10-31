# Solids and sheet metal, second confidence corpus: the features rfFT skipped, and a feature-stack fuzz (lane GA, 2026-10-30)

48 shop-realistic parts in inches on the features the first corpus (rfFT, lane FT) did not cover, built on **Anvil's
own engine** (the published app's) and on **OpenCascade** (the local cross-check), each checked against a closed form
wherever one is derivable; plus a seeded fuzz of random feature stacks. The rows are `anvil/tests/kernel/rfGA.js`
(group rfGA); the runner is `anvil/tests/fixtures/rfFT/compare.js --table rfGA`.

## Method

- **Code base:** main ffadfbf (this worktree, before lanes FV / FW / FX / FY / FZ merge). OpenCascade numbers come from
  the main checkout's engine (`compare.js --table rfGA --occt --root <main checkout>`, `OcctKernel.build`, the same as
  `anvil.js build --occt`).
- **Per part**, as rfFT: builds with no feature errors (a refusal is listed apart and must be a plain sentence); closed
  = 0 open and 0 non-manifold edges by `Evaluate.checkBody` over `build.bodies`; mesh volume = polygon volume to 1e-6;
  body count and bbox (0.002 in) equal to OpenCascade's unless OpenCascade failed; volume equal to the closed form
  (derived in the table's comments: Steinmetz 16/3, circle lenses, prismatoids, the drafted frustum, a numerically
  integrated spoke between two cylinders, a rounded box offset for the shell) where there is one, else to OpenCascade's.
  **Match = ≤ 1e-5 relative** (a hard row); a mismatch is an `rfGA TODO:` row printing both numbers next to a hard row
  at a looser tolerance that holds today's result. Sheet metal: the flat (`Kernel.flatPattern` → `Kernel.flatBody`)
  closed, its size equal to the stated blank (1e-9), and for K 0.5 parts with straight bends and no round holes flat
  area × T = OpenCascade's exact folded volume (1e-9).
- **Fuzz:** `rfGAfuzz(seed)` (mulberry32): a plate (60 %) or a revolved disk / ring, then 3–8 features drawn from boss,
  cut (through / blind, round or rectangular), revolve cut, linear / circular pattern of the last boss or cut, mirror
  (feature, and body about Right / Front / Top, sometimes offset), shell (top removed or closed), fillet / chamfer on
  picked edges, rib (Normal to Sketch, from a plane above the part), draft (plate sides, neutral bottom) and combine
  (a second body, then Intersect keeping some of the regions A only / B only / A∩B). Positions are random on the top
  face, so features overlap, touch and cross, and patterns run into each other. Pass = no exception, every error a
  plain sentence (`Kernel.isRefusal` style), every body closed, mesh volume = polygon volume. Anvil has **no Up To
  Surface end condition and no Combine command** (Intersect stands in for Combine), so the fuzz has neither.

## Corpus

Summary: **48 rows: 32 match, 12 volume TODO (of which 1 also open), 3 refused, 1 not in Anvil.** 44 build with no
errors; 43 closed (G46 open). Of the matches, 29 equal their closed form (25 of them to ≤ 2e-9; the
others are curve-curve intersections: Steinmetz 2e-6, crossed cylinders 1.5e-6, rosette 2e-6, fluted knob 7e-6) and
3 equal OpenCascade (≤ 6e-8). Refused: G29 (touching bosses: zero-thickness, which SolidWorks refuses too: correct), G42 (Rip
one side + Insert Bends: a finding), G48 (Base Flange from an open profile: not built). Not in Anvil: Lofted Bend
(G39). Sheet metal: **all 8 flats closed**, the 5 stated blank sizes right to 1e-9, 5 flats whose area × T equals
OpenCascade's folded volume to 1e-9; the 8 bent parts are 1.5e-4 to 5.1e-4 light (faceted bends, rfFT finding 8).
OpenCascade misses 7 parts Anvil gets right (G01, G10, G20, G30, G31, G32, and G29 which both should refuse).

| # | Part | Anvil in³ | OpenCascade in³ | closed form in³ | Anvil rel | verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| G01 | handwheel: Ø6 × 0.5 revolved rim, Ø1.25 × 1 hub with Ø0.5 bore, CirPattern ×5 of a Ø0.375 spoke | 6.388918 | 6.389690 | 6.388918 | 1.8e-9 | match; OpenCascade 1.2e-4 heavy |
| G02 | spacer ring OD 2 / ID 1 × 0.5 (revolve), CirPattern ×6 of a Ø0.25 hole on a Ø1.5 circle | 1.030835 | 1.030835 | 1.030835 | -4.5e-10 | match |
| G03 | fluted knob Ø2 × 0.75, CirPattern ×8 of a Ø0.5 flute centred on the rim | 1.798458 | 1.798445 | 1.798445 | 7.0e-6 | match |
| G04 | half bushing: OD 2 / ID 1 × 1 revolved 180° | 1.178097 | 1.178097 | 1.178097 | -8.2e-11 | match |
| G05 | Mirror (feature): Ø0.5 × 0.5 boss at x 1 on a 4 × 2 × 0.25 plate, mirrored about Right | 2.196350 | 2.196350 | 2.196350 | 6.9e-11 | match |
| G06 | Mirror (feature) touching the plane: a 1 × 1 × 0.5 block from x 0 to 1, mirrored about Right (the copies share a face) | 3.000000 | 3.000000 | 3.000000 | 0.0e+0 | match |
| G07 | Mirror (body) about Top, the part standing on it: 3 × 2 × 0.5 plate, Ø0.5 hole, Ø1 × 0.5 boss | 6.589049 | 6.589049 | 6.589049 | 6.9e-11 | match |
| G08 | Mirror (body) about Front through the part: 2 × 2 × 1 block from z −0.5 to 1.5 with a Ø0.5 hole at z 1 | 5.607301 | 5.607301 | 5.607301 | -5.4e-11 | match |
| G09 | Mirror (feature) of a cut: 0.75 × 0.25 slot at x 1.25 through a 4 × 3 × 0.5 plate, mirrored about Right | 5.825913 | 5.825913 | 5.825913 | 3.6e-11 | match |
| G10 | Mirror (feature) of a fillet: R 0.25 on the right top edge of a 4 × 2 × 0.5 plate, mirrored about Right | 3.975439 | failed | 3.946350 | 7.4e-3 | TODO: mirrored fillet adds material; OpenCascade refuses |
| G11 | open box 4 × 3 × 2, shell 0.125, top removed | 4.664063 | 4.664063 | 4.664063 | 0.0e+0 | match |
| G12 | thin-wall housing 4 × 3 × 1.5, shell 0.1 open top, two Ø0.4 bosses off the floor with Ø0.2 × 0.75 holes | 3.308204 | 3.308204 | 3.308204 | -1.5e-10 | match |
| G13 | shell after fillets: 4 × 3 × 2 box, R 0.5 vertical edges, R 0.25 round the bottom, shell 0.1 open top | 3.506385 | 3.503599 | 3.503599 | 8.0e-4 | TODO: shell of the rounds 8e-4 heavy |
| G14 | cup Ø3 × 2, shell 0.125 open top | 3.000466 | 3.000466 | 3.000466 | -3.5e-11 | match |
| G15 | tube Ø1 × 0.1 wall swept along a R 4 90° arc | 1.776529 | 1.776529 | 1.776529 | -1.1e-10 | match |
| G16 | bent round bar Ø0.5: line 3, R 1.5 90° bend, line 2.5 | 1.542560 | 1.542560 | 1.542560 | 1.8e-11 | match |
| G17 | round-to-square transition: loft 3 × 3 square to a Ø2 circle, 3 apart (2 sections) | 17.517676 | 17.543490 |  | -1.5e-3 | TODO (loft rule) |
| G18 | three-section loft: Ø3 circle, 2 × 2 square at 1.5, Ø1.5 circle at 3 | 12.909669 | 12.468595 |  | 3.5e-2 | TODO (loft rule) |
| G19 | offset hopper: loft 4 × 4 square to a 2 × 2 square shifted 1 in x, 3 apart (prismatoid 28) | 28.000000 | 28.000000 | 28.000000 | 0.0e+0 | match |
| G20 | Combine Common (Intersect, A∩B kept): two Ø2 × 2 cylinders crossed at right angles (Steinmetz 16/3) | 5.333323 | 6.758111 | 5.333333 | -2.0e-6 | match; OpenCascade invalid |
| G21 | Combine Subtract (Intersect, the plate-only region kept): 3 × 3 × 1 plate minus a separate Ø1.5 cylinder body | 7.232854 | 7.232854 | 7.232854 | -4.9e-11 | match |
| G22 | Combine Add (Intersect, all kept, merged): two Ø2 × 2 cylinders crossed at right angles | 7.233048 | 7.233037 | 7.233037 | 1.5e-6 | match |
| G23 | Rib, one side: 4 × 3 × 0.25 angle 4 wide, 0.25 rib at mid-length (First Side) | 7.437500 | 7.437500 | 7.437500 | 0.0e+0 | match |
| G24 | Rib, Normal to Sketch: a 3 long line on a plane 1 above a 4 × 2 × 0.25 plate grows down to it, 0.2 thick | 2.450000 | 2.450000 | 2.450000 | 0.0e+0 | match |
| G25 | Rib inside a shelled box: 4 × 3 × 1, shell 0.1 open top, 0.1 rib across at z 0 up to 0.8 | 2.690000 | 2.690000 | 2.690000 | -5.0e-16 | match |
| G26 | Draft 5° on the four sides of a 2 × 2 × 1 block, neutral plane the bottom face | 3.660251 | 3.660251 | 3.660251 | -6.1e-11 | match |
| G27 | Draft 5° on one side of a 2 × 2 × 1 block, neutral plane the top face | 3.912511 | 3.912511 | 3.912511 | -1.2e-10 | match |
| G28 | Draft 3° on the two ends of a 3 × 2 × 1.5 block with a Ø0.5 through hole, neutral plane the bottom | 8.469641 | 8.469641 | 8.469641 | 5.6e-12 | match |
| G29 | LPattern ×4 of a Ø0.5 × 0.5 boss at 0.5 spacing: the bosses touch along a line | 1.098175 | 1.392699 | 1.392699 |  | refused (zero-thickness, as SolidWorks) |
| G30 | LPattern ×4 of a 1 × 1 × 0.5 block at 0.75 spacing: the copies overlap | 2.875000 | 1.500000 | 2.875000 | 0.0e+0 | match; OpenCascade loses the plate |
| G31 | CirPattern ×6 of a Ø0.8 hole 0.6 off centre in a Ø4 × 0.25 disk: the holes overlap (a rosette) | 2.496400 | 0.000000 | 2.496405 | -2.0e-6 | match; OpenCascade empty |
| G32 | CirPattern ×4 of a 2 × 0.25 × 0.5 bar from the axis: the bars cross at the centre | 5.877489 | 5.893114 | 5.877489 | -4.0e-11 | match; OpenCascade invalid |
| G33 | Hole Wizard on a cylinder: 1/4-20 tapped 0.5 deep (thread 0.375) radially into a Ø2 × 1.5 shaft | 4.696564 | 4.696564 |  | 6.2e-8 | match |
| G34 | Wrap scribe: a 1 × 0.5 rectangle scribed on a Ø2 × 3 shaft (no volume change) | 9.424778 | 9.424778 | 9.424778 | 2.4e-11 | match |
| G35 | Wrap deboss 0.05: a 1 × 0.5 rectangle on a Ø2 × 3 shaft | 9.400403 | 9.400403 | 9.400403 | 2.5e-11 | match |
| G36 | stepped shaft (revolve) Ø1.5 × 1 / Ø1 × 2: R 0.06 shoulder round, 0.03 chamfers on both ends | 3.336957 | 3.336957 |  | 0.0e+0 | match |
| G37 | pulley hub (revolve) Ø3 × 1 with a Ø1 bore: 0.06 chamfers on both bore ends, R 0.125 round on both outer rims | 6.209394 | 6.209394 |  | 0.0e+0 | match |
| G38 | Miter Flange 1 high round three edges (front, left, back) of a 4 × 3 blank flat 4.9615 × 4.9230 closed | 1.342439 | 1.343026 |  | -4.4e-4 | TODO (faceted bends) |
| G39 | Lofted Bend (rectangle to circle transition) |  |  |  |  | not in Anvil |
| G40 | Insert Bends on a 0.06 thin-wall U channel 3 × 1 × 4 (an extruded section, no rip needed) flat 4.8027 × 4.0000 closed | 1.152223 | 1.152658 |  | -3.8e-4 | TODO (faceted bends) |
| G41 | hems on a flanged part: U channel 6 × 4, two 1.5 flanges, an open hem 0.375 on each flange top flat 6.0000 × 7.6857 closed | 2.756333 | 2.757630 |  | -4.7e-4 | TODO (faceted bends) |
| G42 | Rip (side 1) + Insert Bends: shelled 2 × 2 × 1 box, corners ripped 0.03 keeping one wall square flat 2.0000 × 2.0000 closed | 0.670896 | failed |  |  | **refused** (TODO): "the bends close a ring" |
| G43 | Sketched Bend 90° across the middle of a 6 × 1.5 strip with two Ø0.281 holes flat 6.0000 × 1.5000 closed | 0.530702 | 0.530783 |  | -1.5e-4 | TODO (faceted bends) |
| G44 | U channel: Unfold, a 1 × 0.4 slot straddling the front bend, Fold flat 6.0000 × 6.8034 closed | 2.416546 | 2.417140 |  | -2.5e-4 | TODO (faceted bends) |
| G45 | tray 4 × 3, four 1 flanges, Butt Closed Corner at front-left with the bend region closed flat 5.8034 × 4.8034 closed | 1.444331 | 1.445062 |  | -5.1e-4 | TODO (faceted bends) |
| G46 | tray 4 × 3, four 1 flanges, Overlap Closed Corner (ratio 0.5) at front-left flat 5.8034 × 4.8034 closed | 1.446487 | 1.447207 |  | -5.0e-4 | **open** 8 edges (TODO), faceted bends |
| G47 | tray 4 × 3, four 1 flanges, Underlap Closed Corners at all four corners (two picks, Coplanar faces takes the other two) flat 5.8034 × 4.8034 closed | 1.452341 | 1.453061 |  | -5.0e-4 | TODO (faceted bends) |
| G48 | Base Flange from an open L profile (3 × 2 legs, 4 deep): SolidWorks thickens the open sketch | 0.000000 | failed |  |  | **refused** (TODO): open profile not built |

## Fuzz

`compare.js --table rfGA --fuzz 1000`: seeds 1–1000, 954 s on Anvil's engine (about 1 s a stack). **No exception, no
error message that was not a plain sentence, no stack whose mesh volume left its polygon volume (`inconsistent`).**

| Built, closed | Refused (plain sentence) | Open / non-manifold |
| ---: | ---: | ---: |
| 701 | 226: the cut removes no material 74 (the generator's blind cuts and revolve cuts into empty space after a shell or a mirror), fillet / chamfer "may be too large" 35, zero-thickness 17 (touching patterns, as SolidWorks), shell wall would offset into a neighbour 13, rib does not meet the body 13, no edges found 23 (an earlier feature took the edge), radius / distance larger than the round it runs round 20, shell too thick 9, face to draft / neutral face not found 15, face to remove not found 2, rib sketch does not face the body 2, the open-edge guard 3 | 73: **48 Intersect keeping A only + B only** (pin 4); 25 others, of which 17 contain a shell: 6 reduce to a revolved blank with a rounded or chamfered rim, then Shell (pins 2, 5); the rest to a plain boss (pin 1), bosses patterned onto shell wall tops (pin 3), stacked drafts after a corner round (pin 6), a hole beside a revolved groove (pin 7), a circular pattern of a block (pin 8), and 7 that only open next to a refusal |

In the suite (seeds 1–20, about 6 s): 16 built, 3 refused, 1 open with the pinned Intersect failure (seed 6).
The generator has no Up To Surface (Anvil has none) and no Combine (Intersect stands in).

## Findings, ranked

Each repro is pinned as `rfGA TODO: pin N` (rfGA.js) or is the corpus row named; pins pass and print the edge counts,
and say "closed now: promote" once fixed. *Fixture* = also in `anvil/tests/fixtures/rfGA/` for `anvil.js build [--occt]`.

### Blockers

1. **A plain boss on a plate can leave open edges.** A Ø0.75 × 0.25 boss on a 3.5 × 2.75 × 0.5 plate at (1.0089,
   0.6446): 4 open edges, no error, volume right; moving the centre to (1, 0.6446) closes it. The most basic feature
   a shop part has; found by the fuzz (seed 69) with nothing else in the stack. Owner: **csg.js** (the union's crack
   healing / the circle's facets against the plate's top face). *Fixture* `boss-on-plate-open.js`, pin 1.
   ```js
   p.units("in");
   p.sketch("Top").centerRect(0, 0, 3.5, 2.75).end().extrude(0.5);
   p.sketch("Top", 0.5).circle(1.0089, -0.6446, 0.375).end().extrude(0.25);
   ```
2. **Mirror (feature) of a fillet adds material instead of rounding the mirrored edge.** G10: R 0.25 on one top edge
   of a 4 × 2 × 0.5 plate, mirrored about Right: closed form 3.946350, Anvil 3.975439 (+7.4e-3) with the bbox grown
   to x −2.002, y 0.502, z ±1.01: the round's tool is mirrored and unioned (a fillet counts as a boss in `isCut`), so
   a sliver is added outside the part. A silent wrong solid. SolidWorks mirrors the fillet as a fillet on the
   mirrored edge; OpenCascade refuses ("Mirror source feature has no geometry."). A pattern of a fillet or chamfer
   likely does the same. Owner: **kernel-rebuild.js** (`familyTool` / the mirror and pattern cases: an edge feature
   must be re-applied to the mirrored edges, or refused in a sentence). *Fixture* `mirror-fillet.js`.
   ```js
   p.units("in");
   p.sketch("Top").centerRect(0, 0, 4, 2).end().extrude(0.5);
   p.fillet(0.25, [[2, 0.5, 0]]);
   p.mirror("Right");
   ```

### Major

3. **Overlap Closed Corner with ratio 0.5 leaves 8 open edges** (G46; Butt with the bend closed, G45, and Underlap
   at all four corners, G47, are closed; the flat is closed and right). Owner: **kernel-sheetmetal.js**
   (buildClosedCorner, the partial overlap). *Fixture* `closed-corner-overlap.js`.
4. **Shell of a revolved part whose rim was rounded or chamfered** (Ø3 × 0.5 disk, R 0.03 rim, shell 0.0625 open
   top: 4 open; a ring OD 3 / ID 1 × 1 with R 0.0625: 20 open); the same parts without the round shell closed. The
   largest class in the fuzz after Intersect (6 of the 25 other open stacks reduce to it, 17 of the 25 contain a
   shell). Owner: **kernel-features.js** (shell offset of the torus / cone round where it meets the removed face).
   Pins 2, 5.
   ```js
   p.units("in");
   p.sketch("Front").polyline([[0.5, 0], [1.5, 0], [1.5, 1], [0.5, 1]]).end().revolve(360);
   p.fillet(0.0625, [[1.5, 1, 0]]);
   p.shell(0.1, [[1.4, 1, 0]]);
   ```
5. **Bosses patterned onto the top of shell walls** (a plate shelled open-top, a boss sketched at the open top plane,
   LPattern ×3 so copies sit on the wall tops): 12 open, 2 non-manifold (fuzz 99). Coplanar touching faces in the
   union. Owner: **csg.js**. Pin 3.
6. **Intersect keeping regions that touch only along an edge** (A only + B only, without A∩B, merged): the result is
   one non-manifold body (48 non-manifold edges for a ring and a rod) instead of the zero-thickness refusal a boss
   or pattern gets (`zeroThickness` in kernel-rebuild.js runs after boss / cut tools, apparently not after Intersect's body edit), or separate bodies. 48 of
   the 73 open stacks in fuzz 1000. Owner: **kernel-features.js** (intersect) / kernel-rebuild.js. Pin 4; the
   fuzz exempts `combine-110` stacks until it is fixed.
6b. **Simple solids that open where nothing unusual happens** (one each in fuzz 1000, minimised): a 4 × 3.5 plate
   with a 0.25 × 0.125 × 0.75 block in a CirPattern ×4 (4 open, pin 8); a plate with a Ø0.5 hole and a revolved
   groove that does not touch it (3 open, pin 7); a corner round followed by three Drafts on the sides (18 open, pin 6,
   owner kernel-features.js `draft`). With pin 1 these say the union / split crack healing still has
   position-dependent misses on plain prismatic parts. Owner: **csg.js** (pins 7, 8).
7. **Rip on one side (side 1 / side 2) then Insert Bends is refused**: "the bends close a ring at (2, 0.5, −2): rip a
   corner first" although all four corners are ripped (the volume shows the 4 × 0.03 × T × 0.94 slots); Rip `both`
   then Insert Bends works (rfFT M15). OpenCascade the same (it takes Anvil's layout). Owner:
   **kernel-sheetmetal.js** (Insert Bends' ring test does not see a one-sided rip gap). G42.
8. **Shell after fillets is 8e-4 heavy** (G13: 4 × 3 × 2 box, R 0.5 vertical and R 0.25 bottom rounds, shell 0.1):
   OpenCascade equals the closed form (the inside is the offset: r 0.4, rho 0.15) to 1e-10, Anvil 3.506385 against
   3.503599. Owner: **kernel-features.js** (shell offset of rounds) / kernel-curves.js (its exact volume).

### Minor

9. **Lofts** G17 (square → circle, −1.5e-3) and G18 (circle → square → circle, +3.5e-2) against OpenCascade: Anvil
   ruled (as SolidWorks for square → circle, rfFH P11), OpenCascade smooth; a SolidWorks reference is wanted for
   the 3-section case before anyone changes it. The offset hopper (G19) is the prismatoid 28 on both. Owner:
   **kernel-features.js**.
10. **Bent parts 1.5e-4 to 5.1e-4 light** (8 rows; rfFT finding 8, faceted bend chords): owner kernel-sheetmetal.js,
   lane FX's bend records. Flats are exact.
11. **Not in Anvil:** **Lofted Bend** (G39; the Sheet Metal ribbon button does nothing), **Base Flange from an open
   profile** (G48: SolidWorks thickens an open L / U sketch; Anvil says "Sketch has no closed profile."), **Up To
   Surface / Up To Next** end conditions, **Combine** (Intersect does add / subtract / common: G20–G22). Owner:
   kernel-sheetmetal.js / kernel-features.js when scheduled.

### OpenCascade (owner occt-kernel.js; Anvil is right on each)

12. LPattern of overlapping blocks **loses the base plate** (G30: 1.5 in³ against 2.875; no error). *Fixture*
   `pattern-overlap-occt.js`. CirPattern of overlapping holes gives an **empty result reported ok** (G31). CirPattern
   of crossing bars (G32, +2.7e-3) and Intersect common (G20, 6.758 against 16/3) are **invalid** (BRepCheck). The
   handwheel (G01) is 1.2e-4 heavy against the closed form (Anvil 2e-9). Mirror of a fillet refused (G10). These
   are `rfGA TODO: Gnn on OpenCascade` rows.

   **Since FZ2** (lane GA2 re-run of `compare.js --occt` for both tables on main after lane FZ2): all of 12 is fixed.
   G01, G10, G20, G30, G31 and G32 now build valid and equal their closed forms (≤ 1.4e-9); the "on OpenCascade" TODO
   rows are gone and those parts check Anvil against OpenCascade's body count and bbox again (G10 keeps skipping it
   while Anvil's own Mirror of a fillet is wrong). G29's touching bosses now build on OpenCascade (Anvil still refuses
   them, as SolidWorks). In rfFT, S20 (drafted boss) and M26 (hole across the bend) now build on OpenCascade, S20 =
   its closed form; S16 moved 2.8e-6 to 3.092891821 (exact); G33 moved 2e-8.

## Since FT

rfFT re-measured on ffadfbf (lanes FQ, FR, FS, FU merged since FT measured d83a8c7), same scripts, both engines:

| | FT (d83a8c7) | now (ffadfbf) |
| --- | --- | --- |
| corpus closed | 66 / 69 (S20, M04, M26 open) | **69 / 69** |
| corpus verdicts | 43 match, 25 volume TODO, 3 open TODO | **44 match** (S20 = its closed form), 25 volume TODO (S28, S29 lofts; 23 faceted bends, unchanged to the digit), **0 open** |
| OpenCascade | 67 / 69 built (S20 draft, M26 cut across the bend fail) | unchanged, same numbers to 1e-9 |
| fuzz sheet (1000) | 732 built, 69 refused, 199 open | **909 built, 87 refused, 4 open** |
| fuzz round (1000) | 789 built, 198 refused, 13 open | **828 built, 172 refused, 0 open** |
| pins | 11, all TODO | 9 hard (closed), 2 TODO (5: refused in a sentence; 6: 9 non-manifold, fuzz sheet 91, still open) + 2 new |

The 4 sheet stacks still open: fuzz 91 (pin 6) and three holes across a bend in 14 ga (fuzz 323, 899, 929), now
**pin 12** (a Ø0.281 hole across the bend of a flange on the *back* edge, 14 ga K 0.4: 7 open, 15 non-manifold; the
front edge, 16 ga or Ø0.5 are closed) and **pin 13** (two Unfold / Cut / Fold rounds on one bend: 14 open, 3
non-manifold; one round is closed); owner kernel-sheetmetal.js (Fold's rebuild from the flat). No Closed Corner stack is open any more,
so rfFT's fuzz exemption `known = /holeAcrossBend|closedCorner/` is gone (seeds 1–30 hold none of the 4). The FACET
VOLTODO rows are left to the head (lane FX's bend records). The round fuzz's refusals fell from 198 to 172; its open-edge
guard refusals ("could not close the rounded / chamfered faces") from 22 to 6.
