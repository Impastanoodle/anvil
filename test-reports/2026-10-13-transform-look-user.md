# Transform tab and the grey-black look, used like a shop user (2026-10-13, lane BY)

How: headless Chrome over the DevTools protocol with real mouse and key events (`Input.dispatchMouseEvent` /
`Input.dispatchKeyEvent`, a scratch driver modelled on `anvil/headless/ui-smoke.js`), on an inch bracket sketch: a 6 × 4
blank with a 1 × 1 chamfered corner, three Ø.281 holes and a Ø1 hole. Translate, Rotate, Mirror, the Dynamic gnomon,
Offset Chains, Rectangular Array, Geometry Nesting, the Levels Manager and Show Endpoints were driven with typed values
under the two-Enter rule (the first Enter commits a typed value, the second closes the command). Then
`Page.captureScreenshot` of every ribbon tab, the File / Edit / View / Tools menus, a ribbon tooltip, the New dialog,
Options (the Custom Properties pane), the Levels Manager, the nesting overlay, the Transform previews (magenta) and the
gnomon, in the light and the dark theme, read for things that no longer show on the grey-black graphics area.

## Findings

| # | What I did | What happened | Expected | Fixed? |
|---|---|---|---|---|
| 1 | Clicked a line, Translate, Ctrl+Z (cursor still in Delta X, where the PM puts it) | nothing: the browser's text undo of a box nothing was typed in | the command is cancelled; the next Ctrl+Z undoes | **Fixed** (`ui-app.js` `undoCommand`) |
| 2 | Translate, clicked in the graphics area, Ctrl+Z | the step before the command was undone under the open PM, and the PM closed without its ✗ | the same as #1 | **Fixed**: Ctrl+Z / Ctrl+Y with any command PM open (every Transform command, Boss-Extrude …) cancel it first ("Translate cancelled."), a second Ctrl+Z undoes; text typed in the command's box keeps Ctrl+Z for that text |
| 3 | Rotate open, clicked the Undo button (and Edit ▸ Undo) | the step before was undone under the command | the same as #1 | **Fixed**: the button, the menu item and their enabled state follow the same rule |
| 4 | Line tool, two lines, Ctrl+Z | the last line went, but the Insert Line PM closed while the Line tool stayed in hand | the line goes, the tool keeps its PM (SolidWorks) | **Fixed**; a selection PM (Line / Point / Properties, a sketch dimension) still undoes at once |
| 5 | Clicked exactly on the blank's corner (a line end) with the Select tool, then Rotate | the corner's sketch point was selected; Rotate's box said 0 entities | the line is taken | **Fixed** in every Transform command (`ui-transform*.js` `selIdx`): a selected end / centre point counts as its line / arc / circle and the selection becomes that entity |
| 6 | Clicked a hole's centre, Scale / Translate | 0 entities, as #5 | the circle | **Fixed** (same change) |
| 7 | Rectangular Array: typed `3` over the 3 in Instances, Enter | the command closed and arrayed at the old 1 in distance: the text had not changed, so the Enter was ✓ | the first Enter commits what was typed, the PM stays for the distance | **Fixed** (`ui-app.js`: a box typed in holds an entry until Enter, whatever its text) |
| 8 | Dynamic: dragged the X arrow, typed `1.25` while dragging, Enter, released | the status said "Finish the value and press Enter" for a value already entered | "Moved 1.250 along X — press Enter again (or ✓) to apply and finish." | **Fixed** (`ui-transform.js` drag end) |
| 9 | Mirror with the hole preselected | the status said "Click sketch entities, or drag a box round them, to add them" | what is left: the mirror line | **Fixed** (Mirror's ready prompt) |
| 10 | Offset Chains: clicked the outline | the status said "5 sketch entities selected." | "Offset Chains: 1 chain (5 entities); type the Distance, pick Left / Right, Enter (✓) offsets." | **Fixed** |
| 11 | Light theme, any sketch | the Heads-up View toolbar's line glyphs (Zoom to Fit, Zoom to Area, Previous View, Hide/Show, the scene sun, Show Endpoints) were dark grey on the grey-black graphics area and nearly vanished (the light theme's icon ink overrode the toolbar's light colour) | light glyphs, as in the dark theme | **Fixed** (`style.css`: `#viewport #hud { --icon-ink }`) |
| 12 | Offset Chains / Dynamic / the Select tool, geometry near the top left | the command prompt box (sketch hint, 62 % opaque) let the white outline and the yellow dashed selection run through its text | readable text | **Fixed**: an opaque ground |
| 13 | Clicked the blank's top-left corner where the prompt box sat over it | nothing was selected: the box took the click | the click reaches the geometry | **Fixed**: the box lets clicks through (`pointer-events: none`; it holds no controls) |
| 14 | Ctrl+Z after a Transform command | the status bar kept "Moved 1 entity." | "Undo" said | Not fixed: the general undo (`ui-core.js`), outside this lane |
| 15 | Drawing document, a PM open, Ctrl+Z | unchanged (the undo closes the PM) | — | Not changed: a drawing's PMs are mostly properties of the selected item; left to the drawing lane |

## Looked at and fine

- Translate `1/2` Enter (Delta X .500, PM stays) Enter (moved .5); Rotate `15` Enter Enter; Mirror Enter (Copy about Y);
  Dynamic drag + typed value + Enter Enter (moved exactly 1.250); Offset Chains `.25` inside Enter Enter (5 entities);
  Rectangular Array 3 Enter, Tab, 1.5 Enter, Enter (3 instances at 1.5); undo / redo one step each.
- Magenta previews (Translate copies, Offset Chains, Rotate) read on the grey-black area in both themes; the yellow
  dashed selection and the white wireframe read; the gnomon's red / green / blue arrows and arcs read, its value box
  is white with dark text.
- Ribbon tabs (Features, Sketch, Evaluate, Sheet Metal, Transform), menus, tooltips, the New dialog, the Options pane,
  the Levels Manager (white panel, dark text, yellow current level) and the nesting overlay read in both themes;
  disabled ribbon buttons are clearly grey but legible in both.
- Show Endpoints off: only the centres stay; the toggle is checked in View ▸ Display and lit on the Heads-up toolbar.

## Regression steps

`anvil/tests/smoke/rfBY.js` (5 steps): Ctrl+Z / the Undo button with Translate, Rotate and Boss-Extrude open (cancel
first, then undo), typed text keeps Ctrl+Z, Line Properties and the Line tool undo at once (the tool keeps its PM);
end-point / centre selections in Rotate, Scale, Rectangular Array and Translate; the same text typed and Enter in
Rectangular Array; the Mirror and Offset Chains prompts; a value typed during a Dynamic drag; the light theme's
Heads-up glyph colour and the sketch hint's opacity and click-through.

Suites: kernel `node anvil/headless/anvil.js test` 1148 / 1148; ui-smoke (headless Chrome) 676 / 676.
