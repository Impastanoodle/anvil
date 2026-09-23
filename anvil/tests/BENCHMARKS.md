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
