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
## Second pass (lane shopmouse2, rfQU)

Started from fa1b119. A 16 ga tray (T .0598, R .06, K .44) 8 x 6 with four 1 in Material Inside Edge Flanges unless said; smoke `anvil/tests/smoke/rfQU.js`, 9 steps, only real mouse / key events on the ribbon, the graphics area, PropertyManager boxes, the tree's right-click Edit Feature, Ctrl+Z / Ctrl+Y.

### Fixed

- **Linear Pattern direction by an edge** (step 7). Direction 1 / 2 were drop-downs only (X / Y / Z); SolidWorks takes an edge. A click on a straight edge along X, Y or Z now sets Direction 1 (Direction 2 when it is on and Direction 1 runs along another axis). A curved or slanted edge (a hole's rim, hit when its face was meant) names the newer feature on its two faces as the feature to pattern, as a face click does (rfNN's Hole 1 click goes through that path now). The kernel's pattern runs along the axes only: a slanted direction is not offered (`cmdLinearPattern` `directionPick`).
- **Lofted-Bend profiles by clicks** (step 9). Profiles were two drop-downs only; the PM now shows every open-profile sketch and a click on one (graphics area or tree) replaces the profile picked longest ago, so two clicks set both (`cmdLoftedBend` `lbPick`). Bends per arc 3 / 6 give 4 x 3 + 4 = 16 / 28 bend lines (the four arcs' facet joints and the square's four corners).

### Already right (measured)

- Hole Wizard (Features tab) on the back flange: two clicks, Point X / Y typed (2, .5) (6, .5), Hole ANSI Inch 1/4 normal Through All: four .2660 holes in the flat (Through All also goes through the front flange), each .5000 from the blank's edge, 4 apart; Edit Feature 5/16 (the 5/16 normal drill, same places); Ctrl+Z / Ctrl+Y; Countersink: .4030 in the flat (the cone's far-face opening; the drill .2660 never reaches through 16 ga); Straight Tap 1/4-20 Up To Next: two .2010 holes in the back flange only.
- Corner Relief (Corners flyout): a click near the corner, Rectangular .25 centred: blank 72.590193 -> 72.547254, = .25^2 less the corner notch already there (closed form .042939); Circular 72.557460, Tear 72.578642, Obround 72.524185, Constant Width 72.524605, Rectangular not centred 72.532887, Collect all corners 72.360970; Edit Feature keeps type / size / centring. 3 Bend corner by mouse is rfJV's (radio, Collect all corners, Edit Feature).
- Welded Corner: the back flange's end face clicked down the .0071 gap (view from above, zoomed in), Add fillet .1: +.005792 in3, flat unchanged to 1e-12; fillet off +.003892; Ctrl+Z / Ctrl+Y. No weld-symbol option (not built).
- Miter Flange: front edge clicked, Miter Flange opens the sketch at its end, a 1 in line drawn, the other three edges clicked, gap .01: 1 + T high, flat 9.911557 x 7.911557 = (8 | 6) + 2 (1 + T) - 2 BD; each wall ends T + g / sqrt 2 short of the next wall's outside (.01 and .1); Start offset .5 / End offset .25 on an open chain move the free ends in by exactly that, the mitred ends stay.
- Closed Corner Underlap .5, gap .002: the right flange runs .5 T into the back one (end at z 5.9701), the back flange runs to x 8 over it; Edit Feature shows Underlap .5.
- Flat-Pattern1 right-click Edit Feature: the right flange's top edge clicked as grain: 9.791957 x 7.791957 -> 7.791957 x 9.791957; Edit Feature shows Edge<1>; Ctrl+Z / Ctrl+Y. Merge faces / Simplify bends / Show slit / Corner treatment by clicks are rfJE's. Flatten clicked while Edge-Flange1 is being edited (Length 2 typed): the edit is dropped (length 1, no preview, no rollback left), the 1 in flat shown, one undo step, Flatten again folds.
- Forming Tool dragged from Design Library > Forming Tools onto the floor: the PM opens with the drop point; Position X / Y 2 / -2 (face frame x, -z): marks centred at (2, -2); Flip tool forms down to y -.125; Louver rotation 90 turns its marks 1.6196 x .375 -> .375 x 1.6196; ✗ leaves nothing; Linear Pattern of it (dimple clicked, front flange's top edge for X, 1.5, 3): three sets of marks, centred at x 3.5.
- Vent on the floor (circles 1.5 / .9 / .35, four ribs through the centre): the ribbon fills Boundary [0], Ribs [3-6], Spars [1, 2]; the small circle clicked out of Spars and into Fill-In Boundary, a rib out and back; Rib .1, Spar .08, Radius for fillets .05: removed / T = 5.341955, the flat's blank loses 5.333575 in 16 loops (chords against true arcs, .16 %); Edit Feature keeps the boxes; wider ribs, Ctrl+Z / Ctrl+Y.
- Swept Flange: not driven in this pass (rfJS covers its PM by picks).

### Left, with reproduction

- **Vent fillets crack the solid** (kernel, `ventFillets`, lane solids / sheet metal): the step 8 vent with Radius for fillets .02 leaves 6 open edges, .01 leaves 12; .05, or without the Fill-In circle, or without the spar circle, is closed. Repro: `TRAY4` of rfQU + `p.sketch("Top", .0598).circle(4, -3, 1.5).circle(4, -3, .9).circle(4, -3, .35).line(2.5, -3, 5.5, -3).line(4, -4.5, 4, -1.5)` + the two diagonals (4 +- 1.0607, -3 +- 1.0607) `.end(); p.vent({ sketch, boundary: [0], ribs: [3, 4, 5, 6], spars: [1], fill: [2], ribWidth: .1, sparWidth: .08, radius: .02 })`, then `K.meshQuality(UI.App.mesh).openEdges`. Likely a fillet corner piece where a diagonal rib meets the fill circle and the spar strip within 2 r: check `ventFillets`' corner list there.
- **Miter Flange Start/End offset on a closed loop does nothing, silently**: four edges round the tray have no free end (`miterOffsetEnds` returns the edges unchanged), the feature stores .5 / .25 and builds as if 0. Either SolidWorks opens the loop at the profile's corner (then the kernel should cut the start there), or the PM should grey the offsets for a closed chain: check in SolidWorks.
- Linear Pattern along a slanted edge (not X / Y / Z) needs a vector direction in the kernel (`lpattern` `d1` is an axis name).

### Check in SolidWorks

- Countersink through 16 ga: the flat shows the cone's far-face opening (.4030 for a 1/4 82 deg), not the drill.
- Closed Corner Underlap: which flange runs over the other (here the picked one runs to the outside, the other goes .5 T under it).
- Miter Flange gap: each wall end square, T + g / sqrt 2 short of the next wall's outside (not 45 deg mitre faces g apart).
- Lofted-Bend Bends per arc n: n bend lines per arc (SolidWorks may count facets).
