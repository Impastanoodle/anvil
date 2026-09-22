# Task queue

Edit this file whenever you want. The head agent reads it at the start of every run and takes tasks from the top.
Requests typed into the Anvil Foreman board come first, then this list, then the roadmap.
When a task is finished the head moves it to the Done section with the run id.

## Do next

- Cut direction default: a new Cut-Extrude from the PM on a sketch that sits on an offset plane (e.g. `Top` at the sheet's top face) goes away from the body unless "Reverse direction" is ticked; point it into the body by default (found by run 2026-09-22T14, pre-existing).
- Faster CSG: bounding-box early-out per polygon (ROADMAP Phase 4).

## Ideas (lower priority)

- Desktop shell so Anvil opens as its own window with native file dialogs.
- Equations in PropertyManager fields (`= t * 2`).

## Done

- (2026-09-22T14) Thickness-aware Normal Cut: `normalCut` flag, `Kernel.normalCutTool`, Cut-Extrude PM ▸ Sheet Metal ▸ Normal cut (default on for sheet parts); kernel tests 227, smoke 29.
- (2026-09-22T14) Flat pattern: Material-Outside flanges sharing a corner both unfold (collinear-overlap attachment test).
- (2026-09-22T14) Worker mode: `Kernel.cacheFromBuild` refreshes `App.buildCache` after every worker build; a sync rebuild of an unchanged or appended model reuses the whole prefix.
- (2026-09-22T14) Dark UI theme: View ▸ Theme, `UI.setTheme` / `anvil.theme`, persisted; viewport materials follow.
- (2026-09-22T13) Web Worker rebuilds: `worker.js`, `UI.rebuild` returns a Promise (coalescing, synchronous fallback, Edit menu toggle), `anvil.run/append/load/rebuild` return Promises, `UI.whenIdle()`; kernel tests 216, smoke 26.
- (2026-09-22T13) Flat pattern: bend strips of mitred flanges extended to the mitre line (no step in the blank).
- (2026-09-22T12) Sketch-dimension overlay decision: only the SVG `#dim-layer` exists at the baseline commit (the HTML labels were already removed); the `dimensions` test group passes, so nothing to delete.
- (2026-09-22T12) Miter flange (`miter`, `miterGap`) and auto relief (`relief`, `reliefWidth`, `reliefDepth`) on edge flanges; Miter Flange ribbon button and PM groups.
- (2026-09-22T12) Degenerate geometry guards: zero-area contour warning, "crosses itself" error, "must be a number" errors.
- (2026-09-22T12) Tooltips on ribbon buttons with shortcut hints.
- (2026-09-22T12-setup) Head-and-subagents routine set up; Anvil Foreman board published.
