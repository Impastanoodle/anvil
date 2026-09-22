# Task queue

Edit this file whenever you want. The head agent reads it at the start of every run and takes tasks from the top.
Requests typed into the Anvil Foreman board come first, then this list, then the roadmap.
When a task is finished the head moves it to the Done section with the run id.

## Do next

- Decide between the two sketch-dimension overlays (HTML labels in ui-sketch.js vs the SVG `#dim-layer`): keep one, delete the other, keep all dimension tests passing.
- Miter flange: mitred corners where flanges on adjacent edges meet; relief cuts at flange ends.
- Web Worker rebuilds so the UI never freezes on shell or sweep.
- Degenerate geometry guards: zero-area loops and self-intersecting profiles reported with a clear message instead of a bad solid.

## Ideas (lower priority)

- Dark UI theme.
- Tooltips on ribbon buttons with shortcut hints.
- Desktop shell so Anvil opens as its own window with native file dialogs.

## Done

- (2026-09-22T12-setup) Head-and-subagents routine set up; Anvil Foreman board published.
