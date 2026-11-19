# Sketch flow 8 (lane sketchflow8, round local-2026-11-18b)

I drove the leftovers of `2026-11-18-sketch-flow-7.md` ("Not driven") by real mouse and key events in headless Chrome. I then drove two fresh flows. Tests: `tests/kernel/rfQA.js` and `tests/smoke/rfQA.js`.

| # | What was driven | Before | After |
|---|---|---|---|
| 1 | Offset outline (6 x 2, .5 in). The dimensioned first copy is trimmed back to a crossing line (one piece), or cut between two crossing lines (two pieces). Then the offset .5 -> .25. | The chain's Offset relation went. Only the piece next to the dimension moved; the other copies stayed. | The relation keeps the piece that takes the Parallel / distance as its first copy. Every copy and both pieces move to .25. No conflicts and no redundancy. |
| 2 | A distance between two lines, made first, then a line's length. | Length D1, distance D2. | Distance D1, length D2, the next one D3. An old document keeps the names it showed, and only names that differ from the list order are stored. |
| 3a | Smart Dimension on a 90 deg Centerpoint Arc: end, end, centre, then 60 typed. | The third click placed the distance between the ends. | A new Arc Angle dimension reads 60 deg. Editing it moves an end; the script carries `.rel("arcangle", ["i"], v)`. |
| 3b | 3 Point Arc: two ends, then `1 1/2` typed into the R box with the cursor above the chord. | Already right. | Pinned. |
| 3c | A line, a tangent arc R1, then an upright tangent to the arc with its top fixed. R 2 1/2, then R 4. | R 4 turned the line round: the solve passed through a zero length and came out as a cusp. | Refused with "That value would turn Line1 and Arc2 inside out at their Tangent join". Nothing moves. |
| 4 | A hole on a block's top face, dimensioned 1 from a notch's edge. The notch deleted, then the red handle dragged onto the block's right edge. | Already right: Dangling (olive), one red handle, re-attached, the hole 1 from the new edge. | Pinned for an edge (rfLW had the vertex case only). |
| 5 | `UI.sketchExitGuard` hook. | (none) | A returned string keeps the sketch open and is shown as a toast. Discard Changes and Exit does not ask the guard. |
| 6 | Confirmation corner. | Already present: Exit Sketch beside the red X at the top right (r5/sketch5 tests it side by side). Hidden in Mastercam direct mode (rfLO). | No change. The brief said "under it"; r5/sketch5 pins side by side as SolidWorks shows it. |
| 7 | Stray "Circle" in `#dim-layer`. | The Select / Smart Dimension hover label stayed after the cursor left the graphics area. | Cleared on leaving (`leaveHover`). |
| ii | A slot row on a construction line, Linear Sketch Pattern x4 at 1.5, mirrored about an upright centerline, Fully Define, spacing 1.5 -> 1.75. | The mirrored cap arcs were held by centre and radius only (16 DOF). Fully Define dimensioned the copies, and 1.75 was refused as a conflict. | Mirrored arcs carry `Symmetric { ends: true }`. Fully Define adds 6. The row and its mirror follow 1.75. |
| i | A bracket from a print: a line chain, Sketch Fillets R1/2 and R1/4, ordinates from the lower left, width 5 -> 6. | Already right. | Fully defined by the ordinates. The arcs follow the width change. (Not pinned.) |

## For the head
- Smoke `rfPR flow 1` (not this lane's file) names `=D1*2` for the height Smart Dimension. That height was made after the width distance, so in creation order it is D2. Fix: `anvil/tests/smoke/rfPR.js` line 177 `'=D1*2'` -> `'=D2*2'`, and line 179 `/="D1@Sketch1"\*2/` -> `/="D2@Sketch1"\*2/`. Measured with that change: rfPR 10 / 10.
- Kernel `rfPR` "a trimmed copy that is the dimensioned first copy … still drops the relation": still passes. The copy is deleted whole there, and that case still drops the relation. Its title is now only half true.

## Not reached / open
- D-names: deleting a dimension still renumbers the unnamed ones after it, as before (SolidWorks keeps them).
- Tangent flip: no case was found where the arc itself jumps to the mirrored centre. The guard catches any smooth-to-cusp turn at a line-arc or arc-arc Tangent join.
