# Sketch tab fidelity re-audit, round 2 — SolidWorks 2024 vs Anvil (c6fcfd7), 2026-10-12

Lane: sketch fidelity checks (audit only, no app file edited). **Strict 30-minute time box**, so this round is
narrower than the first: every observation was made on `c6fcfd7` in headless Chrome driven over the DevTools
protocol with trusted input (`Input.dispatchMouseEvent` with buttons held, `Input.dispatchKeyEvent` key-downs),
the way the first audit did it: ribbon buttons and flyouts clicked, values typed, Enter / Tab / Esc pressed, in a
new **inch** part on the Front plane at 50 px per inch. The driver and scenario scripts (`drv.js`, `common.js`,
`v14.js`, `n1.js`) live in the session scratchpad (`audit2/`), not in the repository. The server ran on port 8880,
Chrome on debugging port 9380.

## Verification of the 2026-10-08 findings (#1–#14)

| # | Finding | Result | Evidence (this run) |
|---|---|---|---|
| 1 | Modify box scales a line with two Smart Dimensions | **fixed** | `SketchSolver.setDim(line 0,0–3,2 with len + dx, 0, 3.7)` → dx 3.000000, len 3.7 (two runs). |
| 2 | Modify box writes the rounded display value back | **fixed** | Line √13: Smart Dimension, place, Enter → length 3.6055512754639896 (two runs). |
| 3 | Delete on a circle blanks Center X instead | **fixed** | Click the circle edge: Circle PM, focus stays on `BODY`; Delete removes it. |
| 4 | Ctrl+click two entities shows no Properties PM | **fixed** | Ctrl+click two lines → PM *Properties* with Selected Entities / Existing Relations / Add Relations / Options. |
| 5 | Line start on a circle slides to the tangent point | **fixed** | Circle (7,0) R1.5, click at 30°: start (8.29867, 0.750637), relation `coincident` only, no Tangent. |
| 6 | Clicking an end point selects the whole line | **fixed** | Click (−3,−1) → *Point* PM, selection `sketchPoint 2.p2`. |
| 7 | Symmetric inferred across a centerline | **fixed** | Level line across x = 10 centerline → `horizontal` only. |
| 8 | Both rectangle corners on a line get Coincident | **fixed** | Corner Rectangle started on a line → one `coincident 7.p2/1` plus the rectangle's own H/V/Coincident set. |
| 9 | Smart Dimension drops a preselection | **fixed** | Preselected circle → tool `dimension` with pending `{k:'dia', e:0}`; the next click places Ø. |
| 10 | Right-click while drawing a chain ends it, no menu | **partly / not verifiable here** | The code is in (`ui-sketch.js` `chainMenuWanted` / `chainMenu`, `UI.showMenu`), but a trusted right-click over the DevTools protocol left the tool at `line` with one point and no `.menu` element in the DOM. The chain did *not* end either, so the old behaviour is gone; whether the menu renders on a real right-click needs a hand check (likely my selector, not a regression). |
| 11 | Dimension PM Value stale after a Modify edit | **fixed** | Smart Dimension, Modify 4, Enter → Dimension PM *Value* = `4` (document precision), two runs. |
| 12 | Sketch DXF rounded to 6 decimals | **fixed** | `kernel-script.js` `fmtD` (14 significant digits, no exponent) is used by the sketch DXF writer; `fmt` stays for STL. |
| 13 | Rectangles / polygons / slots are single entities | **fixed** | Corner Rectangle places four lines with `horizontal`×2, `vertical`×2 and four corner `coincident`s; an edge click opens *Line Properties*. |
| 14 | Status bar keeps the previous tool's prompt | **partly** | Drawing tools now set the status bar (Bisector → Corner Rectangle shows the Rectangle prompt). PM-based commands still do not: after Corner Rectangle, *Extend Entities* shows the right hint line but the status bar still reads "Corner Rectangle: click the first corner…". |

## New findings

| # | Sev. | Tool | Expected (SolidWorks 2024) | Actual (Anvil, c6fcfd7) | Repro | Likely at fault | Proposed fix |
|---|---|---|---|---|---|---|---|
| 15 | cosmetic | Status bar for PM-based sketch commands (Extend, Trim, Offset, Move, Rotate, …) | The status bar describes the active command. | `#status-msg` keeps the previous drawing tool's prompt; only `#sketch-hint` is right. | Corner Rectangle, Esc, Trim ▸ Extend Entities → status bar "Corner Rectangle: click the first corner…" (twice). | `ui-sketch.js` `setTool` sets `status-msg` only for drawing tools; `UI.openPM` / `spec.message` does not. | In `openPM` with `spec.sketchTool` or a sketch command, write `spec.message` to `#status-msg` too; restore the Select hint on close. (Leftover of #14.) |

No blocker or major finding was found in the areas reached. Observations that **matched** SolidWorks and are not findings:
dragging a rectangle's vertical edge keeps the rectangle rectangular (the edge moves in x, the horizontal
lines follow the y component, one undo step); Trim to closest on a rectangle edge crossed by a line removes the
clicked span, keeps Horizontal on the remainder and the Coincident to the crossing line, and leaves the sketch
under-defined with the right dof; Display/Delete Relations opens with the *All in this sketch* filter.

## Areas not audited (time box)

The `n1.js` scenario stopped at the Polygon step (the flyout pick did not place a polygon after a Trim cancel,
most likely a scenario-ordering problem rather than an app bug; it was not re-run inside the box). **Not covered
this round, still open for round 3:** drag of a circle / polygon side / slot end cap; the Polygon relation and
slot tangency under drag and after deleting a relation; Sketch Fillet / Chamfer on polygon and slot corners;
Extend / Offset / Mirror / Linear and Circular pattern on the line-based shapes; Convert Entities on a
sheet-metal face; typed values for every tool; undo granularity beyond rectangle drag and trim; the sketch
DXF / DWG import–export round trip of a shop blank (the R12 / R2000 read-back of a dimensioned blank passed in
the first audit; the DWG leg through `api/dxf2dwg` was not run); Fully Define Sketch on the new line-based
rectangle / polygon / slot. Finding #10 needs a hand check in a real browser.

## Suites

Not re-run inside the time box (no app file was changed; `c6fcfd7` is the committed state with CI green).
