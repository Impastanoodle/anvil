# Shop mouse: the sheet-metal commands driven by mouse and keys (lane shopmouse, rfQQ)

Base 913d129. Every command below was driven in headless Chrome with real events only: ribbon buttons and the Corners
flyout, clicks in the graphics area at the world point of an edge or face (`UI.worldToScreen`), PropertyManager boxes
typed into, icon buttons clicked, the length / depth arrows dragged on their rulers, ✓ / ✗, right-click ▸ Edit Feature
in the FeatureManager, Ctrl+Z / Ctrl+Y on the document. 16 ga (T .0598), R .06, K .44, the 8 x 6 tray.
Smoke group `anvil/tests/smoke/rfQQ.js`, 9 steps.

## Fixed

| Command | Before | After |
|---|---|---|
| Base Flange, open profile: double-click in the FeatureManager | no dimensions shown (`insertBends` went to `otherFeatureHandles`) | the depth arrow and the sketch's dimensions; the arrow dragged 4 -> 5 rebuilds, one undo step, flat to 1e-6 (ui-select.js `computeHandles`, `insertBends: 1` in `DIM_TYPES`) |
| Base Flange, closed profile: Edit Feature | opened the Sheet-Metal PM: no Reverse direction, no sketch box | opens the Base Flange PM titled Base-Flange1 with the sketch, Reverse direction and the sheet's groups (`baseFlangePM`, `cmdEditBaseFlange`) |
| Base Flange: Ctrl+Z after ✓ | the sheet was set before the undo snapshot: the flange went, `model.sheet` stayed | `commitFeature(f, existing, afterUndo)` sets the sheet after the snapshot: Ctrl+Z takes both, an edit's sheet change is one undo step with the feature |
| Right-click on a face | no export row | Export to DXF / DWG: DXF/DWG Output on Sheet metal (bend lines, bend notes on) for a sheet part, else on Faces |

## Already right (measured)

- Edge Flange: ✗ leaves nothing; one edge, Length 1, Material Inside: 6 + 1 - BD = 6.895979; Edit Feature, two side edges: 9.791957 x 6.895979 (8 + 2 (1 - BD)); Ctrl+Z / Ctrl+Y; length arrow dragged to 2: 6 + (1 - BD) + (2 - BD). Material Outside +T 6.955779, Bend Outside +R+T 7.015779. Angle 60: 6.917527, 120: 6.800298 = (6 - T / tan A) + 1 - BD(A).
- Custom Relief Type Rectangle (ratio .5), Tear, Obround (ratio 1), Trim side bends: each into the feature, shown again by Edit Feature, closed.
- Hem: Closed .5 6.465309 = 6 - 2 (r + T) + pi (r + K T) + .5 with r = 1/508; Open gap .03 6.480185 (r = .015); Tear Drop, Rolled 270 Bend Outside build closed; Ctrl+Z / Ctrl+Y.
- Jog: fixed face clicked, Offset .5 Outside: flat stays 8 x 6, jogged top .5598; Fix projected length keeps 6.
- Sketched Bend Material Inside 90: flat 8 x 6.
- Closed Corner on the four-flange tray: Butt gap .002: end 7.938786 = 8 - T - gap / sqrt 2; Overlap .5: 7.970100; gap .01 refused (corners already .0071 apart).
- Break-Corner chamfer .25 on a clicked corner edge: volume (48 - .03125) T to 1e-9.
- Unfold (face, Collect All Bends) 7 - BD long; Fold back; Flatten on / off, flat 8 x 6.895979.
- Edit Flange Profile and Miter Flange are driven by mouse in rfOL and rfDL; Corner-Trim by click in rfQM.

## Left, with reproduction

- p9-pm "Edit Feature on Base-Flange1 (Sheet-Metal PM)" expects the title Sheet-Metal: change line 155 of `anvil/tests/smoke/p9-pm.js` to `UI.pmTitle() === 'Base-Flange1'` (the part stays on screen: its other assertion passes). Not my file.
- Not reached: Hole Wizard on a flange, Vent, Forming Tool from the Design Library + Linear Pattern, Flat-Pattern Edit Feature, Corner Relief, Welded Corner (token budget).
- Equation error flag (1b): skipped, sketchflow10's kernel change is not in the base.
- Sketched Bend / Jog position are drop-downs; SolidWorks shows four icon buttons. Changing them breaks p9-pm's `pmField('Bend position')` (lines 222, 242).

## Check in SolidWorks

- Tangent to Bend at 90 deg gives the Material Inside flat (6.895979).
- Flange angle 60, Material Inside: the outer virtual sharp T / tan A inside the base's end.
- Closed Corner Butt: gap measured diagonally (gap / sqrt 2 per wall). The edge-flange corners also use gap / sqrt 2 (.0071 for .01).

## Follow-up (QQ2, base main after the merge)

- 1b done: Tools ▸ Equations, W deleted by its row's delete button, OK: the Equations folder was not flagged and had no row for D1@Sketch1. Now the folder is red and has a red row `D1@Sketch1 =W`; a click on it puts 'Equation D1@Sketch1: =W: Unknown variable \"W\" (the dimension keeps 6)' on the status line (ui-panels.js `appendEquationsFolder`). Step rfQQ 1b.
- Sketched Bend / Jog position as icon buttons: left. An iconRadio row has no input under a label, so p9-pm's `pmField('Bend position')` (lines 222, 242) would get null; that test needs re-pinning to `[data-key=\"position:inside\"]` first.
- Not reached (context budget): Hole Wizard on a flange, Corner Relief, Welded Corner, Flat-Pattern Edit Feature, Forming Tool + Linear Pattern, Vent.
