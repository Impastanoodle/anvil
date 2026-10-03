# Rebuild benchmarks

Baseline for Phase 4 (performance work). Produced by `tests/bench.html` (7 runs per part, median of `runScript + rebuild + meshFromBody`), in the Claude desktop browser pane (Chrome 152) on the user's Windows 11 machine. Re-run the page after kernel changes and append a dated section; single runs jitter by ±30 %, so compare medians only.

## 2026-09-21 — session 1 kernel (BSP CSG, no caching, no bbox early-out)

| Part | features | polys | tris | rebuild ms | total median ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plate with bolt holes | 5 | 234 | 368 | 0.6 | 0.7 |
| L-bracket | 8 | 168 | 275 | 0.5 | 0.5 |
| Bushing | 2 | 288 | 576 | 0.1 | 0.7 |
| Flange | 9 | 3327 | 6194 | 9.7 | 11.8 |
| Hex nut | 8 | 198 | 486 | 3.6 | 3.7 |
| Shaft with keyway | 10 | 887 | 1584 | 1.8 | 2.2 |
| Pulley | 5 | 2875 | 5395 | 10.2 | 11.4 |
| Enclosure lid | 10 | 995 | 1765 | 3.0 | 3.5 |
| Mirrored clevis | 7 | 296 | 504 | 0.6 | 0.7 |
| Spur gear (12 teeth) | 9 | 998 | 1880 | 2.6 | 2.9 |
| stress: 5×5 hole grid | 5 | 1415 | 2216 | 27.3 | 28.5 |
| stress: 24-hole bolt circle | 5 | 3227 | 5738 | 55.5 | 59.6 |
| stress: revolve with 6 grooves | 5 | 5221 | 8949 | 78.2 | 83.3 |
| stress: fillet on one edge of a 12-gon prism | 3 | 85 | 148 | 0.7 | 0.9 |
| stress: 4 chamfers + 4 fillets on a block | 4 | 70 | 131 | 1.8 | 1.9 |
| stress: sheet box with 4 flanges + flat | 8 | 740 | 1266 | 23.7 | 25.6 |
| stress: 40 stacked unions | 80 | 2297 | 4498 | 109.1 | 115.5 |

Sum of medians: 353 ms.

Observations:
- Cost is dominated by CSG booleans against a body that already has many polygons: the 40-union chain is 80 features but each union re-clips the whole accumulated body, so it grows roughly quadratically (candidate for per-polygon bounding-box early-out and for tool-body caching between rebuilds).
- Pattern features union all copies first and then boolean once against the body, so the 24-hole bolt circle is cheaper per hole than 24 separate holes would be.
- Revolves are polygon-heavy (48 segments × profile points); the grooved shaft is the largest mesh at ~9 k triangles.
- Meshing (`meshFromBody`, face grouping + `faceOutline` per face) is 5–15 % of the total; edge extraction for display is not included here.
- The script step (`runScript`) is negligible (< 0.1 ms) except that every rebuild re-profiles every sketch.

## 2026-09-22 09:20 — session 2/3 kernel (familyTool seeds, sweep/loft/shell, draft, unionTree for shells and sweeps)

Same page and browser as above (the other session was running its own tests on the machine at the same time, so treat ±20 % as noise; the 40-union chain, which touches none of the new code, moved 115 → 102 ms).

| Part | features | polys | tris | rebuild ms | total median ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plate with bolt holes | 5 | 234 | 368 | 0.6 | 0.8 |
| L-bracket | 8 | 168 | 275 | 0.3 | 0.5 |
| Bushing | 2 | 288 | 576 | 0.6 | 1.1 |
| Flange | 9 | 3327 | 6194 | 27.3 | 30.6 |
| Hex nut | 8 | 198 | 486 | 5.8 | 6.2 |
| Shaft with keyway | 10 | 887 | 1584 | 3.5 | 3.9 |
| Pulley | 5 | 2875 | 5395 | 18.7 | 22.6 |
| Enclosure lid | 10 | 995 | 1765 | 5.3 | 6.9 |
| Mirrored clevis | 7 | 296 | 504 | 1.1 | 1.4 |
| Sheet-metal U-bracket | 13 | 1376 | 2464 | 16.8 | 18.8 |
| Chamfered block | 8 | 427 | 819 | 4.8 | 5.3 |
| Rounded handle | 8 | 7793 | 14346 | 344.6 | 353.5 |
| Mug | 6 | 8703 | 16209 | 209.5 | 230.4 |
| Funnel | 6 | 15863 | 31236 | 1175.9 | 1199.0 |
| Handlebar | 4 | 1952 | 3703 | 16.6 | 19.7 |
| Spur gear (12 teeth) | 9 | 998 | 1880 | 5.6 | 6.5 |
| stress: 5×5 hole grid | 5 | 1415 | 2216 | 44.1 | 46.2 |
| stress: 24-hole bolt circle | 5 | 3227 | 5738 | 50.9 | 54.3 |
| stress: revolve with 6 grooves | 5 | 5221 | 8949 | 79.1 | 84.4 |
| stress: fillet on one edge of a 12-gon prism | 3 | 85 | 148 | 0.5 | 0.5 |
| stress: 4 chamfers + 4 fillets on a block | 4 | 70 | 131 | 1.4 | 1.5 |
| stress: sheet box with 4 flanges + flat | 8 | 740 | 1266 | 20.6 | 25.0 |
| stress: 40 stacked unions | 80 | 2297 | 4498 | 98.9 | 101.7 |

Sum of medians: 2221 ms (of which Funnel 1199, Rounded handle 354, Mug 230).

Apparent regressions in that run (Flange 27, Pulley 19, hole grid 44, Rounded handle 345) were machine load from the other session: re-timed feature by feature a few minutes later with `Kernel.rebuild` on truncated models, Flange is 7.7 ms (CirPattern 4.0 of it), Pulley 8.1 (CirPattern 6.9), Rounded handle 109 (Fillet 49, Chamfer 54, Revolve 7) and Hex nut 3.0 — all at or below the 09-21 baseline. Lesson: run the bench when nothing else is executing, and look at the union-chain row as a load canary.

## 2026-09-22 (run T20) — bounding-box early-out in the CSG booleans

Same machine and browser pane as above, 26 parts, before (commit 3b5f6d6, 3 runs) and after (`csg.js` early-out, 7 runs), medians in ms.

| Part | before | after |
| --- | ---: | ---: |
| Flange | 45 | 33 |
| Pulley | 34 | 33 |
| Enclosure lid | 12 | 5 |
| Sheet-metal U-bracket | 24 | 19 |
| Tray | 28 | 21 |
| Rounded handle | 474 | 419 |
| Mug | 298 | 149 |
| Funnel | 1550 | 1325 |
| stress: 5×5 hole grid | 56 | 44 |
| stress: 24-hole bolt circle | 81 | 46 |
| stress: revolve with 6 grooves | 114 | 57 |
| stress: sheet box with 4 flanges + flat | 40 | 20 |
| stress: 40 stacked unions | 162 | 136 |

Sum of medians: **2994 ms before, 2375 ms after** (−21 %). Parts whose features are small relative to the body (patterns of holes, grooves, the Mug's handle) gain the most, 1.5–2×; the Funnel and the Rounded handle are dominated by the shell and fillet slab unions, where every slab overlaps its neighbours, so the early-out helps less. Every example's volume is unchanged (pinned in the `csg early-out` test group; the Funnel differs by 1e-6 because the shell's slab union now sees fewer, unsplit input polygons).

## 2026-09-25 (run cloud-2026-09-25b) — BSP trees built from the near region only

Cloud container, headless Chromium 141 (Playwright 1.56), `tests/bench.html` with the default 7 runs per part, nothing else running. Two full runs before (commit 3377590, `restoreWhole` already on) and two after (`CSG.options.nearTrees` on, `nearRatio` 0.5); the table shows the better median of each pair, in ms. Absolute numbers are not comparable with the Windows sections above (different machine).

| Part | polys before | polys after | before | after | speed-up |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plate with bolt holes | 227 | 234 | 3.0 | 3.3 | 0.9× |
| L-bracket | 149 | 129 | 1.7 | 1.3 | 1.3× |
| Bushing | 288 | 288 | 1.1 | 1.2 | 0.9× |
| Flange | 1824 | 1829 | 21.5 | 18.8 | 1.1× |
| Hex nut | 213 | 172 | 10.9 | 8.7 | 1.3× |
| Shaft with keyway | 658 | 539 | 4.1 | 3.2 | 1.3× |
| Pulley | 2190 | 756 | 18.8 | 3.7 | 5.1× |
| Enclosure lid | 647 | 450 | 4.9 | 4.4 | 1.1× |
| Mirrored clevis | 194 | 140 | 0.9 | 0.7 | 1.3× |
| Sheet-metal U-bracket | 1259 | 514 | 11.9 | 6.8 | 1.8× |
| Tray | 973 | 334 | 13.8 | 7.8 | 1.8× |
| Normal Cut Bracket | 347 | 166 | 3.0 | 2.2 | 1.4× |
| Chamfered block | 333 | 305 | 5.2 | 4.0 | 1.3× |
| Rounded handle | 5294 | 756 | 208.4 | 38.9 | 5.4× |
| Mug | 3525 | 1118 | 103.7 | 38.7 | 2.7× |
| Funnel | 4576 | 4453 | 816.4 | 765.9 | 1.1× |
| Handlebar | 646 | 572 | 17.3 | 15.5 | 1.1× |
| Moulded cap | 237 | 127 | 1.6 | 1.5 | 1.1× |
| Parametric plate | 427 | 392 | 3.3 | 3.6 | 0.9× |
| Two-body clamp | 155 | 114 | 1.3 | 1.0 | 1.3× |
| Configured spacer | 47 | 34 | 0.3 | 0.5 | 0.6× |
| Spur gear (12 teeth) | 654 | 637 | 4.3 | 4.3 | 1.0× |
| stress: 5×5 hole grid | 1398 | 1399 | 23.2 | 26.7 | 0.9× |
| stress: 24-hole bolt circle | 2526 | 2653 | 27.7 | 29.1 | 1.0× |
| stress: revolve with 6 grooves | 3759 | 1560 | 50.8 | 13.9 | 3.7× |
| stress: fillet on one edge of a 12-gon prism | 74 | 68 | 0.9 | 0.8 | 1.1× |
| stress: 4 chamfers + 4 fillets on a block | 65 | 65 | 2.0 | 2.0 | 1.0× |
| stress: sheet box with 4 flanges + flat | 584 | 323 | 21.5 | 17.6 | 1.2× |
| stress: 40 stacked unions | 2379 | 574 | 76.6 | 10.0 | 7.7× |

Sum of medians: **1510 / 1484 ms before, 1050 / 1050 ms after** (−30 %). Rounded handle 208 → 39 ms (5.4×), Mug 104 → 39 (2.7×), Funnel 816 → 766 (1.1×), revolve with 6 grooves 51 → 14, 40 stacked unions 77 → 10, Pulley 19 → 4. Rows under ~5 ms that move by ±0.5 ms are noise.

Where it helps: a boolean whose operand has many polygons of which only a few are near the other operand (a fillet or chamfer slab on a big body, a handle on a revolved mug, a groove on a shaft, one more box on a long chain). The tree of that operand is now built from those few polygons plus six box caps instead of all of them. The results also carry far fewer polygons (Rounded handle 5294 → 756, Mug 3525 → 1118, Pulley 2190 → 756), because a near polygon is clipped only by the other solid, not first split by its own tree, so every later boolean is cheaper too.

Where it does not: the Funnel's three big booleans (4338 ∪ 3018, 785 − 9624, 272 − 5857 polygons, ~1.1 s of its time in Node) are the shell's inner offset and slab unions, whose operands overlap almost everywhere (70–85 % of each is near the other), so they stay on the classic path; only its smaller slab unions got faster. Speeding those up needs a finer near test than one bounding box per operand (a grid of boxes), or fewer slabs from the shell.

Every Design Library volume is unchanged: identical to 1e-9 relative with near trees on and off (Funnel 3.7e-10, all others ≤ 1e-14), checked in the `csg near-region trees` test group. With `nearRatio` 0.7 the Funnel gets ~10 % faster in Node but its volume moves by 1.1e-6 (a 1e-5 mm³ sliver between near-coplanar slabs decided at the BSP's EPSILON; the union, intersection and difference agree with each other in both modes), which is why the default stays 0.5.

## 2026-09-26 (run cloud-2026-09-25g) — hull lofts; mesh-quality check

Cloud container, headless Chromium 141 (Playwright 1.56), `tests/bench.html`, 7 runs per part. Four full runs of `origin/main` (614eb34, served from a snapshot) and four of this branch, alternated; the table shows the best median of the four per part, in ms.

| Part | polys main | polys branch | main ms | branch ms | ratio |
| --- | ---: | ---: | ---: | ---: | ---: |
| Plate with bolt holes | 234 | 234 | 4.4 | 3.9 | 0.89× |
| L-bracket | 129 | 129 | 1.3 | 1.3 | 1.00× |
| Bushing | 288 | 288 | 1.0 | 0.8 | 0.80× |
| Flange | 1829 | 1829 | 18.2 | 18.1 | 0.99× |
| Hex nut | 172 | 172 | 5.8 | 6.0 | 1.03× |
| Shaft with keyway | 539 | 539 | 2.9 | 2.9 | 1.00× |
| Pulley | 756 | 756 | 3.4 | 3.6 | 1.06× |
| Enclosure lid | 450 | 450 | 3.5 | 3.6 | 1.03× |
| Mirrored clevis | 140 | 140 | 0.6 | 0.6 | 1.00× |
| Sheet-metal U-bracket | 514 | 514 | 7.3 | 7.0 | 0.96× |
| Tray | 334 | 334 | 7.4 | 7.6 | 1.03× |
| Normal Cut Bracket | 166 | 166 | 2.1 | 2.2 | 1.05× |
| Chamfered block | 305 | 305 | 4.0 | 4.1 | 1.02× |
| Rounded handle | 756 | 756 | 38.4 | 37.9 | 0.99× |
| Mug | 1118 | 1118 | 38.1 | 39.1 | 1.03× |
| Funnel | 4453 | 1875 | 761.6 | 276.2 | 0.36× |
| Handlebar | 572 | 572 | 15.2 | 15.2 | 1.00× |
| Moulded cap | 127 | 127 | 0.9 | 1.0 | 1.11× |
| Parametric plate | 392 | 392 | 2.3 | 2.5 | 1.09× |
| Two-body clamp | 114 | 114 | 1.0 | 1.1 | 1.10× |
| Configured spacer | 34 | 34 | 0.3 | 0.3 | 1.00× |
| Spur gear (12 teeth) | 637 | 637 | 4.3 | 4.6 | 1.07× |
| stress: 5×5 hole grid | 1399 | 1399 | 26.5 | 26.1 | 0.98× |
| stress: 24-hole bolt circle | 2653 | 2653 | 28.4 | 28.1 | 0.99× |
| stress: revolve with 6 grooves | 1560 | 1560 | 13.4 | 13.1 | 0.98× |
| stress: fillet on one edge of a 12-gon prism | 68 | 68 | 0.8 | 0.8 | 1.00× |
| stress: 4 chamfers + 4 fillets on a block | 65 | 65 | 2.0 | 2.0 | 1.00× |
| stress: sheet box with 4 flanges + flat | 323 | 323 | 17.2 | 16.9 | 0.98× |
| stress: 40 stacked unions | 574 | 574 | 10.3 | 10.0 | 0.97× |
| **Sum of medians** | | | **1023** | **537** | 0.52× |


Only the Funnel's code path changed: its loft is now the convex hull of the Ø80 51-gon and the Ø14 21-gon (69 planar side faces) instead of 51 resampled quads split into 102 needle triangles, so the shell's slab union and the final subtraction work on far fewer polygons (4453 → 1875) and the part is 2.8× faster. Every other part runs the same code as main (`Kernel.meshQuality` is not called by the bench); their differences are ±0.1–0.3 ms jitter at the resolution of the table (the largest ratios, 1.10–1.11×, are 0.9 → 1.0 ms and 1.0 → 1.1 ms). No needle-triangle cleanup was added to `meshFromBody`: a face-level retriangulation costs more than the rebuild itself on the small parts (faceOutline on every face: 545 ms over the library vs 877 ms of rebuilds in Node), well over the 10 % budget.

## 2026-10-02 (refine/perf) — BSP clipping without per-level copies, bounding-sphere split test, shell as one intersection

User's Windows machine, Claude desktop browser pane (Chrome 152), other agents running at the same time, so absolute
numbers jitter. Paired run: `HEAD` (583661b) and this branch loaded side by side in two iframes and timed alternately
(`runScript + rebuild + meshFromBody`, median of 7), in ms:

| Part | before | after |
| --- | ---: | ---: |
| Flange | 10.2 | 8.1 |
| Hex nut | 4.5 | 1.7 |
| Rounded handle | 29.7 | 25.3 |
| Mug | 31.6 | 20.0 |
| Funnel | 259.2 | 76.3 |
| Handlebar | 16.8 | 6.9 |
| Spur gear (12 teeth) | 2.9 | 2.3 |
| (all other examples) | within ±0.4 | |
| **Sum of medians, 23 examples** | **381** | **165** |

`tests/bench.html` (30 parts incl. stress, 7 runs): **1044 ms before** (an unpaired run at the start of the session, under load)
**→ 216 ms after**; Funnel 518 → 79, stress rows: 5×5 hole grid 65 → 13, 24-hole bolt circle 68 → 14, revolve with 6
grooves 53 → 8, 40 stacked unions 25 → 4, sheet box 23 → 8.

What changed:
- `Node.clipPolygons` / `allPolygons` append into one output list instead of returning `front.concat(back)` at every
  node. A convex solid's BSP tree is a chain as deep as its face count, so the old recursion copied the whole surviving
  list once per level (quadratic); this was most of the Funnel's time. Same polygons, same order.
- `Plane.splitPolygon` first tests the polygon's cached bounding sphere (`polygon._bs`): when the whole sphere is more
  than EPSILON (+ a 1e-9 guard) from the plane, every vertex would classify the same way, so one dot product decides.
  Identical classification; `CSG.options.sphereTest = false` turns it off (the `refine/perf` test checks that every
  example rebuilds to the bit-identical volume and polygon count either way).
- Shell: body − ((body ∪ extensions) − slabs) is exactly body ∩ slabs, so the walls are one intersection instead of
  a union and two subtractions; the cavity (only the Shell PM preview shows it) is built lazily. Same solid to 3e-13.

Every example volume is unchanged (bit-identical except the three shelled parts: Funnel 3.4e-13, Mug 7.5e-15 relative).
