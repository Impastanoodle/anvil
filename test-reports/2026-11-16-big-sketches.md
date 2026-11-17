# Big sketches stay quick (lane sketchbig, rfNP)

Three big INCH sketches, each driven with real mouse and key events in headless Chrome (smoke `anvil/tests/smoke/rfNP.js`, 9 steps). The same sketches are rebuilt at solver level in `anvil/tests/kernel/rfNP.js` (4 tests):

- **(A)** a 24 × 48 plate with a 1/4 hole, Linear Sketch Pattern 40 × 40 with both spacings dimensioned (1,600 holes, 4,800 unknowns). The kernel rows also use 12 × 12 and 20 × 20.
- **(B)** a customer DXF written in the test and brought in with Insert DXF, Add Coincident relations on. It has a 60 × 30 outline of 296 lines and 4 corner arcs, 1,500 holes, and 200 slots as separate lines and arcs. That is 2,600 entities, 1,100 Coincidents and 9,304 unknowns.
- **(C)** 150 rectangles of 4 lines with Coincident, Horizontal and Vertical, width and height, each placed by two distances from its neighbour. That is 2,400 unknowns and about 1,500 relations plus 300 dimensions.

Work is counted per action, never by milliseconds. Each action records solves (with the unknowns solved), analyses (with their size, and how many came from the cache), redraws, dimension redraws, inference candidates tested and DOM nodes touched. Seconds below are what this shared 16-thread PC measured, once before and once after the change.

## Solver, per call (Node, `.scratch` bench; before = 8ac62f6, after = this lane)

| | before | after |
|---|---|---|
| analyze A 400 holes (1,200 unknowns) | 1.15 s | 0.03 s |
| analyze A 1,600 holes (4,800 unknowns) | 47.1 s | 0.11 s |
| Linear Sketch Pattern 40 × 40 (two analyses inside) | 34.1 s | 0.15 s |
| analyze B (9,304 unknowns, 2,200 equations) | 1.72 s | 0.03 s |
| analyze C (2,400 unknowns) | 0.37 s | 0.02 s |
| C: a placing distance edited (setRelValue) | 1.0 s | 0.05 s |
| C: a corner dragged (drag) | 3.2 s | 0.12 s |
| B: Insert DXF pipeline (parse, prepare, joints) | 0.05–0.12 s | unchanged (already under 2 s) |

## In the app, per action (headless Chrome, smoke rfNP)

| sketch | action | solves (unknowns) | analyses (size) + kept | redraws | label redraws | inference tested / candidates | DOM nodes | headless ms |
|---|---|---|---|---|---|---|---|---|
| A | exit + open the sketch | 0 (0) | 0 (0) + 2 | 3 | 2 | 0 / 0 | 285 | 1641 |
| A | zoom (3 wheel steps) | 0 (0) | 0 (0) + 0 | 0 | 3 | 0 / 0 | 45 | 170 |
| A | pan (Ctrl + middle drag) | 0 (0) | 0 (0) + 0 | 0 | 4 | 0 / 0 | 56 | 250 |
| A | hover (8 moves) | 0 (0) | 0 (0) + 0 | 0 | 2 | 0 / 0 | 82 | 301 |
| A | click-select | 0 (0) | 0 (0) + 0 | 1 | 1 | 0 / 0 | 82 | 751 |
| A | add a relation (Fix) | 1 (25) | 1 (4816) + 2 | 2 | 0 | 0 / 0 | 163 | 1487 |
| A | box-select | 0 (0) | 0 (0) + 0 | 1 | 1 | 0 / 0 | 89 | 1244 |
| A | edit a dimension | 1 (9) | 1 (4816) + 0 | 1 | 6 | 0 / 0 | 116 | 2029 |
| A | add a dimension | 0 (0) | 2 (9632) + 1 | 1 | 6 | 0 / 0 | 172 | 1359 |
| A | draw a line (inference on, 6 moves) | 0 (0) | 2 (9640) + 1 | 2 | 5 | 0 / 115413 | 187 | 2335 |
| A | box-select + delete | 0 (0) | 1 (4670) + 0 | 3 | 1 | 0 / 0 | 127 | 3045 |
| A | (deleted 50 entities) | | | | | | | |
| A | undo + redo | 0 (0) | 0 (0) + 4 | 0 | 1 | 0 / 0 | 109 | 1462 |
| A | trim one entity | 1 (25) | 1 (4820) + 2 | 1 | 2 | 0 / 0 | 106 | 775 |
| A | exit the sketch | 0 (0) | 0 (0) + 2 | 1 | 1 | 0 / 0 | 137 | 178 |
| B | exit + open the sketch | 0 (0) | 0 (0) + 2 | 3 | 2 | 0 / 0 | 254 | 1213 |
| B | zoom (3 wheel steps) | 0 (0) | 0 (0) + 0 | 0 | 3 | 0 / 0 | 6 | 101 |
| B | pan (Ctrl + middle drag) | 0 (0) | 0 (0) + 0 | 0 | 4 | 0 / 0 | 4 | 139 |
| B | hover (8 moves) | 0 (0) | 0 (0) + 0 | 0 | 2 | 0 / 0 | 69 | 181 |
| B | click-select | 0 (0) | 0 (0) + 0 | 1 | 1 | 0 / 0 | 77 | 516 |
| B | add a relation (Fix) | 0 (0) | 1 (9304) + 2 | 1 | 0 | 0 / 0 | 105 | 455 |
| B | box-select | 0 (0) | 0 (0) + 0 | 1 | 1 | 0 / 0 | 80 | 628 |
| B | add a dimension | 1 (3) | 3 (27912) + 1 | 2 | 8 | 0 / 0 | 175 | 1612 |
| B | draw a line (inference on, 6 moves) | 0 (0) | 2 (18616) + 1 | 2 | 6 | 400 / 175317 | 188 | 1506 |
| B | box-select + delete | 0 (0) | 1 (9106) + 0 | 3 | 1 | 0 / 0 | 139 | 1176 |
| B | (deleted 59 entities) | | | | | | | |
| B | undo + redo | 0 (0) | 0 (0) + 4 | 0 | 1 | 0 / 0 | 131 | 2739 |
| B | trim one entity | 0 (0) | 2 (18612) + 1 | 1 | 2 | 0 / 0 | 107 | 934 |
| B | exit the sketch | 0 (0) | 0 (0) + 2 | 1 | 2 | 0 / 0 | 140 | 371 |
| C | exit + open the sketch | 0 (0) | 0 (0) + 2 | 3 | 3 | 0 / 0 | 7753 | 254 |
| C | zoom (3 wheel steps) | 0 (0) | 0 (0) + 0 | 0 | 3 | 0 / 0 | 7585 | 269 |
| C | pan (Ctrl + middle drag) | 0 (0) | 0 (0) + 0 | 0 | 4 | 0 / 0 | 9560 | 394 |
| C | hover (8 moves) | 0 (0) | 0 (0) + 0 | 0 | 2 | 0 / 0 | 2626 | 390 |
| C | click-select | 0 (0) | 0 (0) + 0 | 1 | 1 | 0 / 0 | 426 | 207 |
| C | add a relation (Fix) | 0 (0) | 1 (2400) + 2 | 2 | 0 | 0 / 0 | 163 | 43 |
| C | box-select | 0 (0) | 0 (0) + 0 | 1 | 1 | 0 / 0 | 426 | 343 |
| C | edit a dimension | 1 (2400) | 1 (2400) + 0 | 1 | 6 | 0 / 0 | 4191 | 934 |
| C | add a dimension | 0 (0) | 2 (4800) + 1 | 1 | 6 | 0 / 0 | 4639 | 1683 |
| C | draw a line (inference on, 6 moves) | 0 (0) | 2 (4808) + 1 | 2 | 5 | 0 / 28821 | 1903 | 1166 |
| C | box-select + delete | 0 (0) | 1 (2164) + 0 | 3 | 1 | 0 / 0 | 473 | 367 |
| C | (deleted 60 entities) | | | | | | | |
| C | undo + redo | 0 (0) | 0 (0) + 4 | 0 | 1 | 0 / 0 | 442 | 192 |
| C | trim one entity | 0 (0) | 0 (0) + 3 | 1 | 2 | 0 / 0 | 795 | 343 |
| C | exit + Boss-Extrude | 0 (0) | 0 (0) + 2 | 4 | 4 | 0 / 0 | 837 | 197 |

Drag rows (cut from the runner's line above): A, the plate's side dragged with 4 moves: 2 drag solves (32 unknowns), 0 analyses, 4 redraws. B, an outline line: 3 drag solves of its connected outline, 0 new analyses. C, a fully defined corner: nothing moves. Before this lane, every redraw re-analysed or rebuilt one three.js object per entity. Each zoom, pan or hover was ~0.5–1 s headless on A; now it is 0 redraws and 0 analyses. Inference tested 115,413 candidates on A and 175,317 on B for one line drawn; now it tests 0 and 400. Most of the remaining headless ms is the software-GL frame, at about 0.2–0.8 s per frame at 2,000 entities.

## What was cut, at the cause

1. **The analysis was dense.** Every analysis built an m × n dense Jacobian and ran a dense row reduction, O(m²n). At 1,600 holes that is 4,800 × 4,800 doubles (184 MB) and minutes of time. `jacobianSp` now keeps only the non-zeros of each row. A Pattern relation's `local(e)` evaluates only the rows of the copy being perturbed, not all 1,600 copies 9,600 times. `rankInfoSp` runs the same row reduction on sparse rows.
   - Pivoting: it picks, among columns within half of the largest entry, the one the fewest reduced rows hold. Before this, the 1,600 radius rows all pivoted through the seed's radius, which cost O(n²).
   - Rank, dependent rows and fixed unknowns do not depend on pivot order. Kernel rfNP compares them with the dense reduction.
   - Systems of 240 unknowns or fewer keep the dense path, so every existing test is bit for bit unchanged.
2. **Big solves were dense.** `lmSparse` takes the same Levenberg-Marquardt steps with `spdSolve` (LDLᵀ, minimum-degree order). When J M Jᵀ would be dense, as with a pattern whose copies are all unknowns, it hands back to the dense `lm`.
3. **The same state was analysed again and again.** An edit command analysed before and after, the redraw analysed again, and undo / redo returned to states already seen. `analyze` now keeps the last 4 states of a sketch with 200+ entities, keyed by content, and gives each caller a copy.
4. **A local edit solved the whole sketch.** Adding a relation to one hole of the DXF solved all 9,304 unknowns. `solve` now solves only the connected pieces with an unmet equation (`dirtyParts`); the pieces already met keep their geometry, as the whole solve leaves them.
5. **A redraw made one three.js object per entity.** At 1,600 holes that is 1,600 objects and 1,600 draw calls per frame. A sketch of 400+ entities now draws one LineSegments per material, with each entity keeping its own dash phase.
6. **Inference projected every point to the screen.** It projected all sketch points and every line and circle on each mouse move. Candidates more than a few snap radii away, in sketch units, are now skipped before any projection.
7. **Selecting a dimension redrew all the geometry.** On a 1,600-hole sketch that redraw outlasted the 450 ms double-click window, so a label could not be double-clicked headless. When the previous selection held no geometry, only the labels are redrawn now.

## Same results

Kernel rfNP edits A (12 × 12), B and C both ways and compares the results. The ways are the quick path (sparse, condensed, dirty pieces only, cached) and the reference (`SketchSolver.setDense(true)`: dense, nothing condensed, everything solved). The comparison covers every coordinate (to 1e-9), the DOF, and the Under / Fully / Over Defined state of every entity, relation and dimension.

The edits tested are:
- a spacing edited, with the seed fixed and with it free
- a diameter changed
- the seed dragged
- a driven dimension on a copy
- a Horizontal added
- a copy deleted
- an outline line dragged
- a hole given a diameter
- 50 holes deleted
- a placing distance and a width edited
- a corner dragged
- a Parallel added (Over Defined)
- a dimension deleted and a corner dragged
- a rectangle deleted

At 400 holes, the sparse analysis also equals the dense one.

## Left

- **Over 0.5 s:** most of what still takes over 0.5 s in headless Chrome is the WebGL frame (SwiftShader: about 0.2–0.8 s per frame for 2,000 entities). A real GPU draws the batched lines in milliseconds; the smoke counts redraws instead.
- **Analyses per command:** commands that ask "did this over-define it?" still analyse before and after, so they make 2 analyses, both cheap now.
- **Feature build:** building the Base Flange on the 1,600-hole sketch took about 22 s headless. That is the feature build, not the sketcher, and was not looked at.
- **Fully Define Sketch:** not run on the big sketches. Its dense Jacobian at line 1508 of `sketch-solver.js` (`fullyDefine`) is left as it was.
- **Copies with a dimension:** pattern copies that carry a dimension stay solver unknowns. Only the condensing from lane NK applies to them.
