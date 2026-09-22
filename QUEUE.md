# Task queue

Edit this file whenever you want. The head agent reads it at the start of every run and takes tasks from the top.
Requests typed into the Anvil Foreman board come first, then this list, then the roadmap.
When a task is finished the head moves it to the Done section with the run id.

## Do next

- Thickness-aware "normal cut" for sheet metal.
- Flat pattern: two Material-Outside (`position: "outside"`) flanges that share a corner do not attach in the flat; the `attached` check in `flatPattern` uses the untrimmed edge ends (found by run 2026-09-22T13, pre-existing).
- Worker mode: refresh `App.buildCache` from worker results (or drop it) so the first synchronous rebuild after a worker phase is not a full build.

## Ideas (lower priority)

- Dark UI theme.
- Desktop shell so Anvil opens as its own window with native file dialogs.

## Done

- (2026-09-22T13) Web Worker rebuilds: `worker.js`, `UI.rebuild` returns a Promise (coalescing, synchronous fallback, Edit menu toggle), `anvil.run/append/load/rebuild` return Promises, `UI.whenIdle()`; kernel tests 216, smoke 26.
- (2026-09-22T13) Flat pattern: bend strips of mitred flanges extended to the mitre line (no step in the blank).
- (2026-09-22T12) Sketch-dimension overlay decision: only the SVG `#dim-layer` exists at the baseline commit (the HTML labels were already removed); the `dimensions` test group passes, so nothing to delete.
- (2026-09-22T12) Miter flange (`miter`, `miterGap`) and auto relief (`relief`, `reliefWidth`, `reliefDepth`) on edge flanges; Miter Flange ribbon button and PM groups.
- (2026-09-22T12) Degenerate geometry guards: zero-area contour warning, "crosses itself" error, "must be a number" errors.
- (2026-09-22T12) Tooltips on ribbon buttons with shortcut hints.
- (2026-09-22T12-setup) Head-and-subagents routine set up; Anvil Foreman board published.
