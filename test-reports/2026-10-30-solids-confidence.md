# Solids and sheet metal: a confidence corpus, Anvil's engine against OpenCascade (lane FT, 2026-10-30)

69 shop-realistic parts in inches, each a Builder script, built on **Anvil's own engine** (the one the published app
runs) and on **OpenCascade** (the local cross-check), plus a seeded fuzz of random sheet-metal and fillet / chamfer
stacks. The rows are `anvil/tests/kernel/rfFT.js` (group rfFT); the runner is `anvil/tests/fixtures/rfFT/compare.js`.

## Method

- **Code base:** main d83a8c7 (this worktree, before lanes FQ / FR / FS merge). OpenCascade numbers come from the main
  checkout's engine (`compare.js --occt --root <main checkout>`, the same `OcctKernel.build` that
  `anvil.js build --occt` runs; `vendor/occt` is not in worktrees). Every cut writes an explicit `reverse`, so the
  scripts read the same after FS changes the Builder's default cut direction.
- **Per part:** builds with no feature errors (a refusal recognised by `Kernel.isRefusal` would be listed apart: there
  were none); closed = 0 open and 0 non-manifold edges by `Evaluate.checkBody` over `build.bodies` (the count rfFN and
  `K.openGuard` use); `consistentVolume` (mesh volume = polygon volume to 1e-6); body count and bbox (0.002 in) equal to
  OpenCascade's; volume equal to a closed form where one exists (derived in the table's comments) else to OpenCascade's,
  1e-4 relative is a match (sweeps / lofts 2e-3). Sheet metal: the flat (`Kernel.flatPattern`) as a solid
  (`Kernel.flatBody`) is closed, its size equals the stated blank (A + B − BD per bend, 1e-9), and for K 0.5 parts with
  straight bends and no round holes the flat's area × T equals OpenCascade's exact folded volume (1e-9).
- **In the suite:** a match is a hard row (closed form or OpenCascade value, 1e-5). A mismatch is an `rfFT TODO:` row
  that passes and prints both numbers ("promote to a hard test" once Anvil lands within 1e-4), next to a hard row at a
  looser tolerance that holds today's accuracy. Open results are TODO rows with the edge counts.
- **Fuzz:** `rfFTfuzz('sheet' | 'round', seed)` (mulberry32). Sheet: 16 / 14 / 20 ga or 0.125 sheet, R = T or 2T,
  K 0.5 / 0.4, a random blank, 1–4 edge flanges (90° mostly, 45° / 120°, some folded down) / hems (open, closed,
  tear-drop, rolled) / edge jogs on distinct edges, 0–3 holes of which about a third straddle a bend (Unfold, Cut,
  Fold), sometimes a Closed Corner where two flanges meet; flat pattern. Round: a plate, 0–2 bosses, 0–3 holes, 1–3
  fillets / chamfers on picked corner, top, hole-rim, boss-root and boss-top edges. Pass = no exception, every error a
  plain sentence, the result closed, the flat closed. The suite runs seeds 1–30 of each (about 5 s; an open result is
  allowed only for the two pinned known failures); `compare.js --fuzz 1000` runs more by hand.

## Corpus

Summary: **69 / 69 build with no errors, 0 refusals. 66 / 69 closed. All 27 flats closed.** Cross-engine: **39 of 42
solids match OpenCascade** (34 of them to ≤ 1e-9, the other 5 to ≤ 3e-6; 22 also equal their closed form to ≤ 5e-10); the
3 others are S20 (Anvil = closed form, OpenCascade fails the draft), S28 / S29 (lofts, ruled vs smooth). Sheet metal:
the 4 parts without bends match exactly; **all 23 bent parts are 1.4e-4 to 7e-4 light** on Anvil's engine (faceted
bend chords) while their flats are exact: 14 stated blank sizes right to 1e-9, 16 flats whose area × T equals
OpenCascade's folded volume to 1e-9. Counted for the rows: **43 match, 25 TODO (volume), 3 TODO (open), 0 refused.**
| # | Part | Anvil in³ | OpenCascade in³ | rel | closed form rel | open / non-manifold | flat | verdict |
| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- |
| S01 | base plate 6 × 4 × 0.5, four Ø0.266 corner holes | 11.888857 | 11.888857 | 0.0e+0 | -8.5e-12 | 0 / 0 |  | match |
| S02 | mounting plate 8 × 5 × 0.375, LPattern 6 × 3 of Ø0.201 holes at 1.25 × 1.5 | 14.785817 | 14.785817 | 0.0e+0 | -2.7e-11 | 0 / 0 |  | match |
| S03 | flange disk Ø6 × 0.375, Ø1.5 bore, CirPattern 8 × Ø0.406 on a Ø4.5 bolt circle | 9.551810 | 9.551810 | 0.0e+0 | 5.1e-11 | 0 / 0 |  | match |
| S04 | Hole Wizard: four 1/4 counterbores (Normal) through a 4 × 3 × 0.75 plate | 8.738527 | 8.738527 | 0.0e+0 |  | 0 / 0 |  | match |
| S05 | Hole Wizard: three #10 82° countersinks through a 5 × 1.5 × 0.25 strap | 1.839165 | 1.839165 | 0.0e+0 |  | 0 / 0 |  | match |
| S06 | Hole Wizard: two 1/4-20 tapped holes 0.75 deep (thread 0.5) in a 2 × 2 × 1.25 block | 4.952404 | 4.952404 | 0.0e+0 |  | 0 / 0 |  | match |
| S07 | Hole Wizard: letter-drill F and #7 drill holes through a 3 × 2 × 0.5 plate | 2.958197 | 2.958197 | 0.0e+0 |  | 0 / 0 |  | match |
| S08 | slotted adjuster plate 5 × 2 × 0.25, two 0.75 × 0.281 slots | 2.363617 | 2.363617 | 0.0e+0 | 8.0e-11 | 0 / 0 |  | match |
| S09 | L-bracket 3 × 2.5 × 0.25 × 2 wide, R 0.25 inside and R 0.5 outside bend fillets, two Ø0.266 holes per leg | 2.488953 | 2.488953 | 0.0e+0 | 7.0e-11 | 0 / 0 |  | match |
| S10 | rounded plate 4 × 3 × 0.25, R 0.375 corners, Ø0.266 holes concentric with the rounds | 2.914250 | 2.914250 | 0.0e+0 | -9.6e-11 | 0 / 0 |  | match |
| S11 | tooling block 3 × 2 × 1, 0.0625 chamfer round the top edges, Ø0.5 through hole with a 0.03 chamfer | 5.797058 | 5.797056 | 4.1e-7 |  | 0 / 0 |  | match |
| S12 | boss on plate: 3 × 3 × 0.375, Ø1 × 0.75 boss, R 0.125 root fillet, 0.03 top chamfer, Ø0.5 bore | 3.752892 | 3.752892 | 0.0e+0 |  | 0 / 0 |  | match |
| S13 | slotted plate 4 × 2 × 0.375, 1.5 × 0.5 slot, R 0.06 round on the slot top edge (lines and arcs, one chain) | 2.641523 | 2.641523 | 0.0e+0 |  | 0 / 0 |  | match |
| S14 | flanged bushing OD 1.5 / ID 1.0 × 2, flange Ø2.25 × 0.25 (revolve) | 2.515728 | 2.515728 | 0.0e+0 | -5.3e-11 | 0 / 0 |  | match |
| S15 | shaft Ø1 × 4, retaining-ring groove 0.039 × Ø0.94, 0.03 × 45° end chamfers | 3.135256 | 3.135256 | 0.0e+0 | -1.2e-10 | 0 / 0 |  | match |
| S16 | shaft Ø1 × 4 with a Ø0.25 cross hole at mid-length | 3.092892 | 3.092883 | 2.9e-6 |  | 0 / 0 |  | match |
| S17 | V-belt pulley Ø4 × 0.75, 0.45 deep V groove, Ø0.625 bore, 3/16 keyway | 7.384478 | 7.384478 | 2.8e-9 |  | 0 / 0 |  | match |
| S18 | control knob: Ø1.5 skirt, R 0.5 dome, R 0.06 round on the skirt rim | 1.141797 | 1.141797 | 0.0e+0 |  | 0 / 0 |  | match |
| S19 | angle 4 × 3 × 0.25 × 4 wide with two 0.25 ribs (Rib, both sides, at ±1.25) | 8.125000 | 8.125000 | 0.0e+0 | 0.0e+0 | 0 / 0 |  | match |
| S20 | drafted boss: 4 × 4 × 0.5 base, Ø1.5 × 1 boss with 3° draft, Ø0.5 through hole | 9.352015 | 7.901825 | 1.8e-1 | -4.5e-9 | 3 / 0 |  | **open** (TODO); OpenCascade failed |
| S21 | drafted pocket: 4 × 3 × 1 block, 2 × 1.5 × 0.5 pocket with 5° draft | 10.575277 | 10.575277 | 0.0e+0 | 4.3e-11 | 0 / 0 |  | match |
| S22 | enclosure: 4 × 3 × 2 box, R 0.5 vertical edges, shelled 0.1 open top | 3.615759 | 3.615752 | 1.8e-6 |  | 0 / 0 |  | match |
| S23 | closed hollow cube 3 in, shell 0.125 (no faces removed) | 6.203125 | 6.203125 | 0.0e+0 | 0.0e+0 | 0 / 0 |  | match |
| S24 | pipe elbow: Ø0.5 swept along a R 3 90° arc | 0.925275 | 0.925275 | 0.0e+0 | 4.3e-10 | 0 / 0 |  | match |
| S25 | handrail: Ø1 swept along line 4 + R 2 90° arc + line 4 | 8.750586 | 8.750586 | 0.0e+0 | -5.2e-11 | 0 / 0 |  | match |
| S26 | rectangular duct 1 × 0.5 swept along a R 4 45° arc | 1.570796 | 1.570796 | 0.0e+0 | 1.3e-10 | 0 / 0 |  | match |
| S27 | hopper: loft 4 × 4 square to 2 × 2 square, 3 apart | 28.000000 | 28.000000 | 0.0e+0 | 0.0e+0 | 0 / 0 |  | match |
| S28 | transition: loft 3 × 2 rectangle to a Ø1.5 circle, 2.5 apart | 9.218062 | 9.239234 | -2.3e-3 |  | 0 / 0 |  | TODO (loft rule) |
| S29 | three-section loft: 2 × 2 square, Ø2.2 octagon at 1, Ø1.5 circle at 2.5 | 7.684261 | 7.725743 | -5.4e-3 |  | 0 / 0 |  | TODO (loft rule) |
| S30 | clamp: half block with a R 0.5 saddle and a Ø0.266 hole, Mirror (body) about Right | 5.299808 | 5.299808 | 0.0e+0 | 8.4e-11 | 0 / 0 |  | match |
| S31 | two separate bodies: a 2 × 1 × 1 block with a Ø0.5 hole and its mirror copy across a plane at x 3 (merge off) | 3.607301 | 3.607301 | 0.0e+0 | -8.4e-11 | 0 / 0 |  | match |
| S32 | standoff rail 6 × 1 × 0.25, LPattern ×4 of a Ø0.5 × 0.5 boss, then LPattern ×4 of a Ø0.201 through hole | 1.797506 | 1.797506 | 0.0e+0 | -5.6e-11 | 0 / 0 |  | match |
| S33 | hub: Ø4 × 0.25 disk, Ø1.25 × 1 hub, CirPattern ×6 of a 0.125 triangular gusset | 4.309235 | 4.309236 | -2.5e-7 |  | 0 / 0 |  | match |
| S34 | pocketed plate 4 × 3 × 0.5: 2 × 1.5 × 0.25 pocket, R 0.25 pocket corners, R 0.06 floor round | 5.268424 | 5.268424 | 0.0e+0 |  | 0 / 0 |  | match |
| S35 | clevis: 2 × 1 × 1.5 block, 0.5 wide × 1 deep slot, Ø0.375 cross hole | 2.334330 | 2.334330 | 0.0e+0 | 3.9e-11 | 0 / 0 |  | match |
| S36 | gusseted angle 3 × 3 × 0.25 × 2 wide, R 0.125 inside round, two 0.25 triangular gussets | 3.602530 | 3.602530 | 0.0e+0 |  | 0 / 0 |  | match |
| S37 | hex standoff 1/2 hex × 1.5, #10-32 tapped 0.375 deep, 0.02 chamfer on the top edges | 0.314772 | 0.314772 | 0.0e+0 |  | 0 / 0 |  | match |
| S38 | weld-neck style flange: Ø5 × 0.5 disk, Ø2.5 × 1 hub, R 0.1875 root round, Ø2 bore, 4 × Ø0.625 bolt holes | 9.461475 | 9.461475 | 0.0e+0 |  | 0 / 0 |  | match |
| S39 | counterbored bushing Ø1.5 × 1: Ø0.625 bore, Ø1 × 0.25 counterbore (Revolved Cut) | 1.340699 | 1.340699 | 0.0e+0 | 2.9e-10 | 0 / 0 |  | match |
| S40 | tube Ø2 × 0.12 wall × 6, 0.03 × 45° chamfer on both outside rims | 4.246861 | 4.246861 | 0.0e+0 | 4.9e-11 | 0 / 0 |  | match |
| S41 | T-slot table section 4 × 2 × 6: T-slot 0.5 throat / 1 head cut through the length | 42.750000 | 42.750000 | 0.0e+0 | 0.0e+0 | 0 / 0 |  | match |
| S42 | spacer Ø1 × 0.5 with a #8 82° countersink | 0.377914 | 0.377914 | 0.0e+0 |  | 0 / 0 |  | match |
| M01 | L bracket 6 × 4 base, 1.5 flange (Material Inside, outer length) | 1.937806 | 1.938130 | -1.7e-4 |  | 0 / 0 | 6.0000 × 5.4017 closed | TODO (faceted bends) |
| M02 | U channel 6 long, 4 base, two 1.5 flanges | 2.440412 | 2.441060 | -2.7e-4 |  | 0 / 0 | 6.0000 × 6.8034 closed | TODO (faceted bends) |
| M03 | tray 6 × 4, four 1 flanges mitred at the corners | 2.499324 | 2.500392 | -4.3e-4 |  | 0 / 0 | 7.8034 × 5.8034 closed | TODO (faceted bends) |
| M04 | tray 4 × 3, four 1 flanges, Underlap Closed Corner at front-left | 1.448098 | 1.448825 | -5.0e-4 |  | 10 / 0 | 5.8034 × 4.8034 closed | **open** (TODO) |
| M05 | L bracket with a 1 × 0.25 slot across the bend (Unfold, Cut, Fold) | 1.922864 | 1.923180 | -1.6e-4 |  | 0 / 0 | 6.0000 × 5.4017 closed | TODO (faceted bends) |
| M06 | L bracket with a 0.375 open hem on the flange top | 2.095766 | 2.096415 | -3.1e-4 |  | 0 / 0 | 6.0000 × 5.8429 closed | TODO (faceted bends) |
| M07 | closed hem 0.5 on the front edge of a 6 × 4 plate | 1.628129 | 1.628360 | -1.4e-4 |  | 0 / 0 | 6.0000 × 4.5383 closed | TODO (faceted bends) |
| M08 | tear-drop hem on the front edge of a 6 × 4 plate | 1.604524 | 1.605496 | -6.1e-4 |  | 0 / 0 | 6.0000 × 4.4746 closed | TODO (faceted bends) |
| M09 | rolled hem on the front edge of a 6 × 4 plate | 1.585893 | 1.586865 | -6.1e-4 |  | 0 / 0 | 6.0000 × 4.4227 closed | TODO (faceted bends) |
| M10 | edge jog 0.5 high, 1 long, on the front edge | 2.030949 | 2.031598 | -3.2e-4 |  | 0 / 0 | 6.0000 × 5.6622 closed | TODO (faceted bends) |
| M11 | sketch jog 0.375 (outside offset) across a 6 × 4 plate | 1.434768 | 1.435200 | -3.0e-4 |  | 0 / 0 | 6.0000 × 4.0000 closed | TODO (faceted bends) |
| M12 | Miter Flange 1 high along the front and left edges (Right-plane profile) | 0.822223 | 0.822546 | -3.9e-4 |  | 0 / 0 | 4.9614 × 2.9614 closed | TODO (faceted bends) |
| M13 | two Sketched Bends 90° (a channel from a flat 6 × 4) | 1.434768 | 1.435200 | -3.0e-4 |  | 0 / 0 | 6.0000 × 4.0000 closed | TODO (faceted bends) |
| M14 | Break-Corner R 0.25 on the four corners of a 6 × 4 blank | 1.431992 | 1.431992 | 0.0e+0 | 3.2e-10 | 0 / 0 | 6.0000 × 4.0000 closed | match |
| M15 | ripped shelled box 2 × 2 × 1, Insert Bends R 0.06 | 0.645956 | 0.646339 | -5.9e-4 |  | 0 / 0 | 3.8027 × 3.8027 closed | TODO (faceted bends) |
| M16 | tab 1 × 2 off the right edge of a 6 × 4 blank | 1.554800 | 1.554800 | 0.0e+0 | 0.0e+0 | 0 / 0 | 7.0000 × 4.0000 closed | match |
| M17 | Vent: Ø2 boundary, two ribs, Ø1 spar on a 4 × 4 cover | 0.811340 | 0.811340 | 0.0e+0 |  | 0 / 0 | 4.0000 × 4.0000 closed | match |
| M18 | L bracket with two Ø0.281 holes in the wall (Normal Cut) | 1.930436 | 1.930713 | -1.4e-4 |  | 0 / 0 | 6.0000 × 5.4017 closed | TODO (faceted bends) |
| M19 | Z bracket: 1 flange up at the front, 1 flange down at the back | 2.081612 | 2.082260 | -3.1e-4 |  | 0 / 0 | 6.0000 × 5.8034 closed | TODO (faceted bends) |
| M20 | flanges at 45° and 120° on a 6 × 4 blank | 2.244916 | 2.245484 | -2.5e-4 |  | 0 / 0 | 6.0000 × 6.2583 closed | TODO (faceted bends) |
| M21 | L bracket, bend deduction 0.1 entered (flat = 4 + 1.5 − 0.1) | 1.937806 | 1.938130 | -1.7e-4 |  | 0 / 0 | 6.0000 × 5.4000 closed | TODO (faceted bends) |
| M22 | aluminium 0.125, R 0.125, K 0.4: L bracket 5 × 3 + 2 flange with an open hem | 3.393138 | 3.395499 | -7.0e-4 |  | 0 / 0 | 5.0000 × 5.3739 closed | TODO (faceted bends) |
| M23 | hat channel: two 1.5 flanges up, two 0.75 flanges out on their tops | 2.189824 | 2.191120 | -5.9e-4 |  | 0 / 0 | 6.0000 × 6.1068 closed | TODO (faceted bends) |
| M24 | cover tray 6 × 4 mitred flanges 0.75 with four Ø0.201 corner holes and a 2 × 1 window | 2.076710 | 2.077778 | -5.1e-4 |  | 0 / 0 | 7.3034 × 5.3034 closed | TODO (faceted bends) |
| M25 | flat blank 10 × 6 with a 5 × 3 LPattern of Ø0.25 holes and 0.25 corner chamfers (Break-Corner) | 3.536494 | 3.536494 | 0.0e+0 | -1.3e-10 | 0 / 0 | 10.0000 × 6.0000 closed | match |
| M26 | U channel with a Ø0.5 hole straddling each bend (Unfold, Cut, Fold) | 2.417009 | 2.417577 | -2.4e-4 |  | 177 / 27 | 6.0000 × 6.8034 closed | **open** (TODO); OpenCascade failed |
| M27 | 14 ga gauge-table L bracket 8 × 3 + 2 flange | 2.913945 | 2.914619 | -2.3e-4 |  | 0 / 0 | 8.0000 × 4.8772 closed | TODO (faceted bends) |

## Fuzz

`compare.js --fuzz 1000`: seeds 1–1000 of each kind, 2000 stacks, 144 s on Anvil's engine. **No exception, no error
message that was not a plain sentence, no open flat.**

| Kind | Built, closed | Refused (plain sentence) | Open / non-manifold |
| --- | ---: | ---: | ---: |
| Sheet metal (1000) | 732 | 69: jog height too small for R and angle 38, hems would cross 16, the generator's Closed Corner pick beside a relief 11, flange shorter than its bend 4 | 199: **all 192 stacks with a hole across a bend**; 7 others (seeds 33, 91, 132, 221, 336, 544, 830) |
| Fillet / chamfer (1000) | 789 | 198: radius / distance larger than the round the edge runs into 121, "may be too large" 37, the open-edge guard ("could not close the rounded / chamfered faces") 22, the generator's edge already taken 17, zero thickness 1 | 13 (seeds 38, 73, 91, 355, 483, 510, 593, 596, 626, 695, 823, 869, 979): bosses next to holes; in the three checked (38, 73, 91) the open edges are there before any fillet |

In the suite (seeds 1–30 of each): 49 built, 9 refused, 2 open with the pinned hole-across-a-bend failure.

## Findings, ranked

Each repro is pinned as `rfFT TODO: pin N` in rfFT.js (it passes and prints the edge counts; it says "closed now:
promote" once fixed); the ones marked *fixture* are also in `anvil/tests/fixtures/rfFT/` for `anvil.js build --occt`.

### Blockers

1. **A hole cut across a bend (Unfold → Cut-Extrude → Fold) leaves the folded part open and non-manifold.** All 192 fuzz
   stacks that did it; M26 177 open / 27 non-manifold; smallest: one Ø0.5 hole on a 16 ga L bracket, 61
   open / 3 non-manifold. The unfolded state and the flat are closed; the fold is not. A slot that ends exactly at the
   bend start (M05) folds closed. OpenCascade fails too ("could not make the cut across the bend"). Owner:
   **kernel-sheetmetal.js** (buildFold / wrapCut / bendVoids); occt-kernel.js for OpenCascade. *Fixture*
   `m26-hole-across-bend.js`, pin 2.
   ```js
   p.units("in"); p.sheet(0.0598, 0.0598, 0.5);
   p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();
   p.flange(1.5, [[3, 0.0598, 0]], { position: "inside", lengthRef: "outer" });
   p.unfold([3, 0.0598, 2], null);
   p.sketch("Top", 0.0598).circle(3, 0.05, 0.25).end().cut("through", { reverse: true });
   p.fold(null);
   ```
2. **Plain flanges and hems open on some sizes.** A 14 ga L bracket: 13 open + 1 non-manifold edge, no holes, no other
   feature (fuzz sheet 221). Also an open hem + flange in 14 ga (830, 13 open: pin 10), an open hem in 20 ga (544), a
   0.125 Z (flange up, flange down: 336). The
   same bracket 6 wide, or in 16 ga, is closed; the volume agrees with OpenCascade (3.112347 / 3.113). Size-dependent
   crack where the flange joins the base. Owner: **kernel-sheetmetal.js** (buildFlange) with **csg.js** (the union's
   crack healing). *Fixture* `l-bracket-14ga.js`, pin 1.
   ```js
   p.units("in"); p.sheet(0.0747, 0.0747, 0.4);
   p.sketch("Top").rect(0, -4, 7.75, 4).end().baseFlange();
   p.flange(1.5, [[3.875, 0.0747, 0]], { position: "inside", lengthRef: "outer" });
   ```

### Major

3. **Closed Corner leaves open edges**: Underlap 10 (M04, the rfDI tray), Butt 7 on two flanges (the fuzz's random Closed Corners that built were closed, so it
   depends on the corner). Volume and flat right (flat area × T = OpenCascade to 1e-9). Owner: **kernel-sheetmetal.js**
   (buildClosedCorner). *Fixture* `m04-closed-corner.js`, pin 3.
   ```js
   p.units("in"); p.sheet(0.0598, 0.0598, 0.5);
   p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();
   p.flange(1, [[2, 0.0598, 0]], { position: "inside", lengthRef: "outer" });
   p.flange(1, [[0, 0.0598, 1.5]], { position: "inside", lengthRef: "outer" });
   p.closedCorner([[0.0299, 0.6, 0.1196]]);
   ```
4. **A hole through the edge of a boss** (the hole partly in the boss wall, partly in the plate) leaves 3–7 open edges;
   volume = OpenCascade's to 1e-9 (fuzz round 73, 38, 91: the open edges are there before any fillet). Owner:
   **csg.js** (booleans / healCracks). *Fixture* `hole-boss-edge.js`, pins 7–9.
   ```js
   p.units("in");
   p.sketch("Top").rect(0, -4.5, 4, 4.5).end().extrude(0.25);
   p.sketch("Top", 0.25).circle(1.33, -3.1532, 0.25).end().extrude(1);
   p.sketch("Top", 1.25).circle(0.9453, -2.9922, 0.25).end().cut("through", { reverse: true });
   ```
5. **A corner where one flange goes up and the next goes down** (0.0359 sheet, R 0.0718): 10 open edges (fuzz sheet
   132). Owner: **kernel-sheetmetal.js** (flange relief / trim at a mixed-direction corner). *Fixture*
   `corner-up-down.js`, pin 4.
6. **Non-manifold edges on two 0.125 sheet stacks** (fuzz sheet 33: flange + edge jog + rolled hem + two holes, 5
   non-manifold; sheet 91: 45° and two 120° flanges + two holes, 9 non-manifold). Not minimised yet. Owner:
   **kernel-sheetmetal.js** (hem / jog / non-90° flange where they meet), possibly csg.js. Pins 5–6 (full scripts).
7. **Drafted round bosses.** OpenCascade fails *every* drafted extrude of a circle ("Draft angle is too large for this
   depth: the profile collapses." for Ø1.5 × 1 at 3°), so such parts never get OpenCascade's STEP: owner
   **occt-kernel.js**. On Anvil's engine the boss is exact (S20 = closed form to 5e-9) but a hole through it leaves 3
   open edges: owner **csg.js** (cone facets against the hole's cylinder). *Fixture* `s20-drafted-boss-hole.js`, pin 11.
   ```js
   p.units("in");
   p.sketch("Top").circle(0, 0, 0.75).end().extrude(1, { draft: 3 });
   p.sketch("Top", 1).circle(0, 0, 0.25).end().cut("through", { reverse: true });
   ```

### Minor

8. **Bent sheet-metal solids are 1.4e-4 to 7e-4 light** on Anvil's engine (23 / 23 bent parts; the bend surfaces are
   chords with no cylinder record, so Mass Properties cannot be exact): weight / mass off by up to 0.07 %. Flats,
   blank sizes, DXF and bend notes are unaffected. Owner: **kernel-sheetmetal.js** (bend surface records, as
   kernel-curves.js gives fillets). Promote the 23 TODO rows when it lands.
9. **Lofts**: rectangle → circle −2.3e-3 and square → octagon → circle −5.4e-3 against OpenCascade (Anvil ruled,
   OpenCascade smooth); rfFH P11 shows Anvil follows SolidWorks for square → circle, so these want a SolidWorks
   reference before anyone changes them. Owner: **kernel-features.js**.
10. **Fillet / chamfer guard refusals** in the round fuzz: 22 stacks refused with "Anvil's kernel could not close
   the rounded / chamfered faces" (rounds next to bosses and holes), the set lane FP found OpenCascade builds. They
   are clean refusals, the part kept. Owner: **kernel-mesh.js**.
11. **Flat area vs folded volume, to verify against SolidWorks**: the ripped, Insert-Bends box (M15) has a flat 2 %
   larger than its folded solid (each wall appears to keep the outer-face extent at the 45° rip, about T per corner);
   mitred trays (M03, M24, Miter Flange M12) are 0.5 % smaller, which is the expected O(T²) at a 45° mitre. Owner:
   **kernel-sheetmetal.js** if SolidWorks' flat differs.

Not a bug, noted for the next corpus: the fuzz generator's own misses ("No edges found" after an earlier fillet took the
edge, "there is no flat face" for a Closed Corner pick beside a relief) are plain-sentence refusals and are counted as
refusals.