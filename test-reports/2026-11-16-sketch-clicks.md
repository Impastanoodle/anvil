# Sketch clicks on a slow PC, Fully Define on big sketches, pick distances (lane sketchfull, rfNU)

Tests: kernel `anvil/tests/kernel/rfNU.js` (3), smoke `anvil/tests/smoke/rfNU.js` (5). Seconds are from this shared 16-thread PC.

## 1. Clicks that got lost

How it was reproduced: headless Chrome driven over CDP with `Emulation.setCPUThrottlingRate` 10, and separately with a main-thread jitter (a 0 to 150 ms busy loop every 23 ms injected into the page). The second is closer to the merge machine: the page is blocked at random moments, not slowed evenly. Before the fix, with jitter, rfNK failed 1 run of 2 (flows c and h). At throttle 10, flow a failed 2 of 10 and flow h 2 of 4.

What dropped the clicks: two places in the app timed a gesture by the moment the page *handled* the event, not the moment the hand *made* it.

- **Smart Dimension midpoint rest (rfIG, `midReady`).** A line's midpoint is picked only after the cursor has rested by it for 150 ms. The rest was measured with `performance.now()` at handling. A move onto the middle of a line, then a click 30 ms later, handled after a 300 ms frame, counted as a rest. The click then picked the midpoint instead of the line, and the place click became a second pick. The Modify box did not open ("No distance between those two"), which is what flows c and h hit.
- **Dimension label double-press (`dimPress`).** Two presses within 450 ms open the Modify box. The first press selects the dimension and redraws, which on a big sketch takes longer than the 450 ms window (lane NP measured 0.8 s headless). A real double-click then counted as two single clicks.

Fix (ui-sketch.js): a capture listener keeps the time stamp of the mouse event being handled (`mouseStamp`, `ev.timeStamp`, cleared after the event). `midReady` and `dimPress` read it, and fall back to the clock outside an event (the marker's own timer).

Test side: the rfNK / rfMT helpers dispatch events created after an `await`. So on a loaded machine their time stamps really are 150 ms or more apart, and the helpers really did rest. Two changes, each with its reason in the helper:
- `rfNKDim` / `rfMTDim` hold the midpoint rest off while they make their quick picks (`UI.dimMidDwell(1e9)`, restored after).
- `rfNKOpenDim` / `rfMTEditDim` create both presses of a double-click before the first is dispatched, as a hand does.

The empty-slot failure of flow a (after `setTool('slot')`, three clicks and two Esc gave no entities) was not reproduced. It did not show in 22 runs at throttle 10, 3 jitter runs or 3 runs under 20 busy processes. Nothing in the click path is asynchronous: tool arming, the Slot PM and `placePoint` all run inside the event. The Esc after a complete slot cannot take it back. A candidate the merge machine could show: a rebuild or command from an earlier step lands during the step and opens another sketch (`enterSketch` runs a `pendingStart`). Not proven.

New smoke steps (rfNU) send move, press and release with no pause, straight after `setTool`, for Line, Circle, Corner Rectangle, Straight Slot, Smart Dimension and Trim. One step makes a quick midpoint click handled after a 300 ms frame. Another makes a double-press handled after a 600 ms frame. Both new steps fail without the fix.

After the fix, 10 runs each at throttle 10: rfNK flow a 10 / 10, rfNK flow h 10 / 10, rfMT flow 3 10 / 10, rfNU (5 steps) 10 / 10. With jitter, rfNK + rfMT passed 3 / 3 runs.

## 2. Fully Define Sketch on the sparse path

`fullyDefine` built a dense m × n Jacobian and kept a dense basis of it. Above `SPARSE_MIN` (240 unknowns or equations), it now uses `jacobianSp` and the sparse reduced-echelon basis of `rankInfoSp`. That basis is now its own object, `spBasis(n).add(cols, vals, commit)`, and `rankInfoSp` uses it, with the same operations in the same order. Each candidate's row is built sparse.

| sketch | before | after |
|---|---|---|
| (A) 1,600 holes, spacings dimensioned (4,800 unknowns) | 18.2 s | 0.08 s |
| (A) 400 holes | 1.3 s | 0.02 s |
| (B) customer DXF, 2,600 entities: +5,400 relations, +1,704 dimensions | 12.8 s | 0.26 s |
| (C) 150 dimensioned rectangles | 0.97 s | 0.06 s |
| 150 loose rectangles: +1,200 relations | 1.2 s | 0.06 s |

The relations and dimensions it adds are the same. Kernel rfNU compares the sparse path with the dense one (`setDense(true)`) on 30 loose rectangles (baseline, chain, ordinate, relations only, a slanted set), on a small flat with holes and slots (also with a corner as datum), and on a 10 × 10 pattern. The new items match exactly. The coordinates and values match to 1e-9, with an arc's angle compared modulo 360: the sparse solve can leave an arc at a0 −90 where the dense one has 270.

## 3. One analysis for a new dimension

`overDefines` analysed the sketch with the new item driven, then without. For the last item of its list, the "before" state is now the sketch with the item popped. That is the state the last redraw analysed, so it comes from analyze's cache. The "after" state is kept for the redraw that follows. The cache key now treats an empty `rels` / `dims` list as none.

Smart Dimension on a hole of a 300-hole sketch (smoke rfNU): 2 analyses + 1 kept before, 1 + 2 kept after. `addRelation` (two-entity dimensions) already analysed before (kept) and after. Sketches under 200 entities have no cache, so they still analyse each time; that is cheap.

## 4. Pick distance

Measured at 100 % (63 px/in, smoke rfNU) by pressing at whole px offsets and dragging. Either the press took the entity, or a box started. Before: a line, a hole's rim and a line's end point were all taken up to 6 px (`pickEntityDist` and `pickSketchRef` both use < 7). The 1/4 holes of a 420-hole pattern at rfNP's spacing gave the same 6 px.

The "10 to 15 px from a hole" of the NP report did not reproduce. It shows only where holes stand closer than about 20 px, where the press is within 7 px of the next hole. Dimension text is picked on its text box (37 × 16 px for ".250").

Change: entities 6 px (`ENTITY_PICK_PX`, ui-core.js; taken up to 5 px), points stay at 7 (up to 6 px). No test pinned 7 px for entity picks: the 6.5 / 8.5 px tests in r15-snapaudit15 are drawing-tool inference, which is unchanged. The sketch smoke groups pass.

## 5. Pattern copies with their own dimension

`condensePatterns` kept any copy named by a dimension as an unknown. Now:
- A driven dimension keeps nothing.
- A copy's own diameter, radius or length is put on its seed entity while condensed (`dimSwaps`). The pattern makes the two equal, and the dimension goes back after the solve.
- An edit of that dimension (`setDim`'s part) is solved at the seed.

Linked dimensions and other kinds (dx, dy, angles) still keep the copy. Kernel rfNU checks a 12 × 12 pattern against the dense, uncondensed solve, with the same holes and states after each of: a copy's diameter changed, a spacing changed, the seed dragged, a driven diameter added on another copy. It also checks a copy's length on a line pattern.
