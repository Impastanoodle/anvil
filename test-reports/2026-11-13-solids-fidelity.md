# Solids fidelity, lane MJ (solidfid), 2026-11-13

Every solid closed, manifold and exact in volume. Tests: `anvil/tests/kernel/rfMJ.js` (15 hard rows).
Counts are `Evaluate.checkBody` open / non-manifold edges and `K.meshQuality` open edges; "closed" means all three are 0.

## 1. Corner Relief on a box with Closed Corners: fixed

Probe: 10 × 6 box, four Edge Flanges (Material Inside), Closed Corner on the corners, then `p.cornerRelief(corners, size, { reliefType })`; 14 ga (R .075) and 20 ga (R .0718); rect / tear / circular / obround; sizes .06 .09 .12 .15 .2 .25 .3.

| | before | after |
|---|---|---|
| Butt, bend region closed (56 cases) | 23 open or with a sliver loop in the flat | 56 closed, one flat loop |
| no Closed Corner, Butt open bend region, Overlap, Underlap (224 cases) | about 70 open or with sliver loops | 224 closed; the 27 flats with 5 loops are true holes (a small relief wholly inside a strip) |
| folded volume against the closed form (84 cases, K .44 and .5) | not exact (the extended bend was never cut) | worst 3.2e-8 relative |
| flat area against the closed form | sliver loops | worst 3.8e-8 relative |

Causes:
1. At a closed corner each bend ends on a slanted (helicoid) face, and each bend's cutting sector also holds the end of the other bend. The "is this band plain bend metal" check failed, the relief fell back to a wrapped cutter, and that cutter through the slanted ends cracked the solid (Circular .12, 14 ga: 12 open, 4 non-manifold).
2. The bend a Closed Corner extended (`ccExtend`) was not cut by the relief in the solid at all: the relief's piece stopped at the flange's own record.
3. Flat: a facet of the other bend read as "surface" inside this bend's gap; the island was cut from the blank as a notch (5e-6 in² sliver loops).

Fix (kernel-sheetmetal.js): both bends at the corner are cut out by their sectors together and each is rebuilt from its developed shape, read back from the solid, less the relief outline (`crCornerApply`, `bendBandsRebuild`, `bendCapPolys`, `bandVoids`); nothing is changed unless the two sectors hold exactly the two bends' metal as read (1e-7). `cornerReliefLayout` follows the Closed Corner's records (`endShift`). `bendSurfaceNotches` keeps outer loops only.

Folded volume = blank × T does not hold on a closed-bend corner (SolidWorks' flat keeps the square L while the solid ends on two helicoids, rfGJ), so the rows check both against their own closed forms (`rfMJexpect`).

## 2. csg.js `restoreFar` and rfGA G13: the retry is not needed; the crack found is a different one, not fixed

- On main G13's shell closes on the shell guard's first attempt (`K.shellGuard.last = { tries: 1, open: [0] }`); the attempt with `restoreFar` off is not reached. Hard row in rfMJ (fails if a second attempt is needed).
- The old crack replays only on the kernel of commit 1f42c07 (`test-reports/repros/g13-union-options.js`, instructions in its header). There the union of the two closed halves gives 10 open + 2 non-manifold edges with `restoreFar` on and off alike, so the far-piece path is not the cause; the guard's last try closed because its earlier unions came out differently.
- What stays open: two needle holes (three open edges, the short one 7e-6) and two needle flaps (a sliver face on an edge used three times). A vertex of one solid is taken as lying on a plane of the other (the EPSILON band) and left where it is, while the other solid's face is cut where the planes really cross, 7e-6 away. The exact retry trades them for a 6-edge hole and loses.
- Not fixed. The fix is at the split: a split point must land on the band vertex it stands for, in both operands. The same pattern is in the stack fuzz today (seeds 773 and 829: 2 open + 1 non-manifold, short edge 7.4e-6).

## 3. Butt Closed Corner on 20 ga, and a hole at the corner: fixed

- 20 ga R .0718 tray, Butt / Overlap / Underlap, bend region closed and open, each corner alone and all four, plus four more gauge / radius pairs: 240 probes closed on main already (the two-helicoid ends of 2026-11-02 removed the `closedCornerFill` contact). 30 of them are a hard row now.
- A Normal Cut hole at the corner (the Cut-Extrude PropertyManager's default on sheet metal): 150 probes (20 ga and 14 ga; no corner, Butt closed / open, Overlap closed / open; five centres, three radii): 38 open before, 2 after.
  Cause: a Normal Cut pushed each bend facet of the footprint through the thickness along the facet's own normal, with wedges between; the boolean of those prisms with the faceted bend cracked wherever the hole met a bend's end.
  Fix: normal to the sheet inside a bend is radial, so the cut is the footprint on the surface it enters through, laid out in the bend's developed metal and taken out of it (`normalCutBends`, the same band rebuild as task 1; applied in kernel-rebuild.js `cutTrial` through `tool._nc`). The per-facet prisms remain the fallback and the path for hems, jogs and sketched bends.
  On an L bracket the flat hole equals the developed footprint to 1e-9 (hard row).
- Existing expectation changed: `rfBW` "the flat is drawn from the base sketch's side" asserted that its Normal Cut hole made the bottom face larger than the top. The hole is radial now and ends on the bend line on both faces (the prisms bit 0.006 into the top face), so the two faces are equal; the row asserts "not smaller". Its real check (the bend reads UP) is unchanged.

## 4. Confidence corpus re-measured (Anvil's engine)

| | last report | now |
|---|---|---|
| rfFT table (69 parts) | | 0 open, 0 refused |
| rfGA table (48 rows) | 1 open, 3 refused | 0 open, 2 refused (G24, G29), 1 not in Anvil |
| rfFT fuzz 1000, sheet | 909 ok, 87 refused, 4 open | 911 ok, 87 refused, 2 open (seeds 91, 929) |
| rfFT fuzz 1000, round | | 967 ok, 33 refused, 0 open |
| rfGA stack fuzz 1000 | 73 open, later 17 | 643 ok, 352 refused, 5 open (seeds 203, 665, 773, 829, 908) |

Nothing was closed in this part of the corpus by this lane; these counts are the state of main plus this lane.

## Suite

Kernel 2887 / 2887 (2872 + 15 rfMJ rows), examples 29 / 29. Wall time on 8 workers, same machine, other agents running: 100 s with main's engine files, 124 s with this lane. The difference is the new group (rfMJ, 36 s in one process: the runner has no timing for it yet, `--save-timings` lets it split the file by rows); the groups that existed are within run-to-run noise (rfKP 2.8 → 2.9 s, rfLB 2.3 → 2.7, rfKG 4.8 → 5.4, rfKM 3.5 → 3.1, rfFT 8.3 → 8.7, rfGA 10.5 → 9.6, rfGD 54.5 → 53.2, rfGI 157 → 151). A Corner Relief at a closed corner itself builds about 40 % slower than before (0.28 → 0.39 s a box on average): it now does the two band rebuilds.

## Still open, one repro line each

- Needle holes / flaps of the BSP (task 2): `node anvil/tests/fixtures/rfFT/compare.js --table rfGA --fuzz 1000` seeds 773 (plate, rib, boss, Cut-Revolve: opens at the Cut-Revolve, short edge 7.4e-6) and 829; `test-reports/repros/g13-union-options.js`.
- Stack fuzz seeds 203 (0 open, 1 non-manifold), 665 and 908 (shell; 6 open): same command.
- Sheet fuzz seed 91 (flange 45° + two 120° flanges + holes: 9 non-manifold) and 929 (second Unfold / cut / Fold, rfFT pin 13): `compare.js --fuzz 1000`.
- A Normal Cut hole that swallows a whole bend from the part's edge: 20 ga tray (4 × 3, four 1 in flanges), `p.sketch("Top", T).circle(0.3, -(R + T) / 2, 0.1).cut("through", { reverse: true, normalCut: true })`: closed for `checkBody`, 9 `meshQuality` open edges (as before this lane); 14 ga, r .2 at (0.3, .075): 2.
- A plain (not Normal) through cut at the corner of a 14 ga tray with no Closed Corner: 0 open, 1 to 15 non-manifold edges in 8 of the 30 probes (as before this lane): same tray, `p.sketch("Top", T).circle(R + T, -(R + T), 0.2).cut("through", { reverse: true })`.
- Mass Properties of a hole inside a bend: up to 0.4 % of the hole off its developed area (the hole's wall is flat between the chords while the bend's faces count as true cylinders; rfFT VOLTODO M26). The flat is exact.
- Not reached: task 5 (fillets that could not close: rfFT 259, rfGA 226), the R2 round on a spline's end-face edge (rfFV TODO), rfGB TODO.
- Not run here (no engine in the worktree): `occt-tests.html` and ui-smoke. OpenCascade's Corner Relief reads the same layout, so at a closed corner it now also cuts the extended bend's piece; its Normal Cut is its own code and did not change.
