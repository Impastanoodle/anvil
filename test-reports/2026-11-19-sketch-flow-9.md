# Sketch flow 9 (lane sketchflow9, round local-2026-11-18b)

Inch parts, driven with real mouse and key events in headless Chrome. Tests: `anvil/tests/smoke/rfQH.js` (5 steps) and `anvil/tests/kernel/rfQH.js` (2 tests). Base: local main 888220f.

## Fixed

| # | What was driven | Before | After |
|---|---|---|---|
| 1 | Smart Dimensions D1 to D4, with D4 an equation `=D3`. Then D2 deleted by clicking its label and pressing Delete. | D3 became D2 and D4 became D3, so the equation `=D3` pointed at D4 itself. | D1, D3 and D4 keep their names and `=D3` still follows D3. The next new dimension is D5 (gaps are not refilled). The names hold through Ctrl+Z / Ctrl+Y, exit and edit, saving and reopening, the generated script, and the kernel's names (equations, Design Table). |
| 2 | `UI.sketchExitGuard` from other files. | Every non-forced exit asked the guard, so a command that carries on right after `exitSketch(true)` (Linear Pattern, Hole Wizard and so on) ran inside the sketch the guard had kept open. | The rule is written out in `ui-sketch.js` above `exitSketch` and listed in the next section. |
| 3a | A small hole started on a bolt circle's quadrant. Its radius click was 6 px from the centre at the zoom in use. | The radius click snapped back onto its own centre, giving radius 0, and no circle was made. | A circle's or polygon's radius point never snaps onto its own centre. |
| 3c | A fillet deleted from an outline that had been offset as one chain (Offset Entities, Select chain, construction). | The whole Offset chain relation was dropped and the sketch went from 2 free to 33 free. | The other pairs stay held by a shorter open chain (`chain.lead` marks the dimensioned pair). The sketch is now 9 free: 2 on the extended line, 5 on the fillet's orphaned copy and 1 from the lost corner dimension. |

## Exit guard: every caller of exitSketch

**Asks the guard:**
- the confirmation corner
- the ribbon Sketch toggle (`cmdSketch`)
- the Exit Sketch rows of the menus and the right-click menu
- Make Drawing (`drawing-ui.js:332`)
- Nest Create Part (`ui-nesting.js:348`)
- `withSketch` (all PropertyManager commands): the command is not run when the guard refuses
- `openSketchAfter` (ui-transform-3d)
- enterSketch of another sketch
- Rapid Sketch to another plane: it stops when the guard refuses

**Does not ask:**
- Discard Changes and Exit
- undo or redo that removes the sketch (`ui-core afterModelSwap`)
- New or Open (`loadModel`)
- deleting the open sketch's feature (`ui-commands.js:7640`)
- every `if (sketch) UI.exitSketch(true)` followed by a command that carries on at once: ui-commands Linear Pattern and the other pattern / feature commands at lines 1892 to 8397, Hole Wizard, 3D Sketch, Insert Library Feature, Import, `directClose`

**Proposed for the shop / drawing lanes:** `drawing-ui.js:332` and `ui-nesting.js:348` should stop when `App.mode === 'sketch'` is still true after the exit. Today the drawing or nest goes on while the refused sketch stays open.

## Driven and green with no defect found

- **a. Gasket.** A 6 x 6 outline with four R.5 Sketch Fillets, a centre Ø3, and a Ø4.5 construction bolt circle. One Ø.266 seed was patterned 6 by Circular Sketch Pattern, then right-click Edit Circular Pattern took it to 8, and the bolt circle went from 4.5 to 5. The sketch was fully defined at every stage. Boss-Extrude .06 matched the closed form to 1e-9.
- **b. Flat from a print.** An L outline 6 x 4 with a 2 x 1.5 notch. Two Straight Slots .281 wide, .469 between centres, dimensioned from the notch corner. A Ø.5 hole placed by ordinate sets from the origin, and a 1/4 x 45 Sketch Chamfer. The notch was then widened from 2 to 2.5: the slots followed and the hole stayed. The sketch DXF has 11 LINE, 4 ARC and 1 CIRCLE, with no construction. The volume matched to 1e-9.
- **c. Edits after the fact.** A Power trim took a slot away, a line was extended to the notch, and the notch edge was converted into a second sketch. The outline was offset .125 inward as construction. The fillet was deleted and the corner remade with Trim Corner.

## Not fixed, with how to reproduce

- **The corner dimension is deleted with the fillet.** In flow c, deleting a Sketch Fillet also deletes its virtual sharp, and the 6 dimension that hangs on that sharp goes with it. Trim Corner then restores the corner without the dimension (d5 to d4).
- **Harness limit, not a defect:** a leading `.` cannot be typed key by key into a number box (`.25` arrives as 25), so the test types `1/4`.

## Check in SolidWorks 2024

- Does deleting a sketch fillet keep the dimensions to its virtual sharp, or bring the corner back?
- Does a new dimension after deleting the highest one reuse that number? Anvil takes the highest name shown + 1, so delete D4 and the next one is D4 again.
- When an offset chain loses one base, are the other offset relations kept?
