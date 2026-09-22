# Task queue

Edit this file whenever you want. The head agent reads it at the start of every run and takes tasks from the top.
Requests typed into the Anvil Foreman board come first, then this list, then the roadmap.
When a task is finished the head moves it to the Done section with the run id.

## Do next

- Web Worker rebuilds so the UI never freezes on shell or sweep. Note from run 2026-09-22T12: this makes `UI.rebuild` asynchronous, which touches every PM commit path, `window.anvil.run` and the smoke tests at once, so it needs the `sketch` + `commands` + `tests` lanes in one run with a design agreed first (worker owns `Kernel.rebuild` + cache, posts back serialised polygons; UI keeps a synchronous fallback).
- Flat pattern: extend the bend strips of mitred flanges to the mitre line (today the blank shows a small step at each mitred corner).
- Thickness-aware "normal cut" for sheet metal.

## Ideas (lower priority)

- Dark UI theme.
- Desktop shell so Anvil opens as its own window with native file dialogs.

## Done

- (2026-09-22T12) Sketch-dimension overlay decision: only the SVG `#dim-layer` exists at the baseline commit (the HTML labels were already removed); the `dimensions` test group passes, so nothing to delete.
- (2026-09-22T12) Miter flange (`miter`, `miterGap`) and auto relief (`relief`, `reliefWidth`, `reliefDepth`) on edge flanges; Miter Flange ribbon button and PM groups.
- (2026-09-22T12) Degenerate geometry guards: zero-area contour warning, "crosses itself" error, "must be a number" errors.
- (2026-09-22T12) Tooltips on ribbon buttons with shortcut hints.
- (2026-09-22T12-setup) Head-and-subagents routine set up; Anvil Foreman board published.
