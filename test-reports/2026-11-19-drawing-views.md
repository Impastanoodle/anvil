# Drawing views by mouse (lane drawviews, rfQV), 2026-11-19

Started from fa1b119. Part: a 14 ga bracket with two bends, two Ø.281 holes, a Ø.5 hole and a slot (rfOJ's bracket shape;
step 4 adds a 45° flange for the auxiliary view), sheet ANSI B, inch. Driven only by ribbon clicks, PropertyManager boxes,
clicks / drags on the sheet, right-click menus, the sheet tabs and keys (Delete, Esc, Ctrl+Z / X / V). Smoke rfQV (5 steps),
kernel rfQV (5 tests).

## Per command

| Command | Before | After |
|---|---|---|
| Standard 3 View (ribbon, Insert ▸ Drawing View, sheet right-click) | wiped every view on the sheet and laid out Front / Top / Right **plus an Isometric** | SolidWorks': Front / Top / Right only, added; views already on the sheet stay (second family without roles, layout manual). `Drawing.addStandard3View`. `anvil.drawing.standard3View()` / `make()` keep the old four-view layout (many tests use it). |
| Model View (Front button, OK, click) | right: the preview follows the pointer (pending.at within a pixel), the click places the view there (4.5, 3.6 ± 1 px) | — |
| Auto-start projected view | right / up clicks aligned; a click at a **corner** (top-right) made a second Right on top of the first (dominant axis) | a click past a corner of the parent's box gives the pictorial view from that corner (Front + top-right = the Isometric frame exactly), placed at the click, not aligned, True dimensions; Default Alignment greyed for it (`projectedFrame` dirs `upright` … , `D.DIAGS`) |
| Projected View tool (pick a view, click a side) | right (Right ▸ Back aligned through the Right, follows the Front's drag) | — |
| Drag the parent | right: Top / Right / Back follow; Top slides only up / down | — |
| Break Alignment / Default Alignment (right-click) | right: free drag after Break, Default lines it up, Ctrl+Z | — |
| View Properties: scale | a projected view / Top / Right had no Use parent scale: the Front set to 1:2 left Top and Right at 1:1 | **Use parent scale** (default) for projected views and Standard 3 View's Top / Right: they follow the parent's scale; a scale chosen in their PM is their own (`ownScale`). **User Defined**: any ratio typed (3:8, 1:2.5), read back in the PM |
| View Properties: display style | the Front's Hidden Lines Removed left the children HLV | **Use parent style** check (default on) for those views; off: their own style (`ownStyle`, also set by right-click ▸ Display) |
| Hide / Show, Lock View Position (right-click) | missing | added: Hide takes the view off the sheet and every export (its views stay, a section cut from it is still drawn), the FeatureManager row greyed `(hidden)` with Show on its right-click; Lock: a drag does not move it, `(locked)` badge; both one undo step and saved |
| Auxiliary View (45° edge in the Right view) | right: PM with the tool, edge pick, side click, drawn | — |
| Section View (vertical through a hole) | placing right (snaps to the hole centre); **the cutting line could not be dragged** | drag the line of a full section (5 px), it snaps to hole centres within 8 px, the section is cut there on the drop, one undo step (`Drawing.moveSectionLine`) |
| Detail View (three clicks) | placing right; **the circle could not be dragged** (a centre mark's box took the click) | drag the circle by its rim: moved, detail follows, one undo step (`Drawing.moveDetailCircle`); a typed 3:1 renames it `Detail View B (3 : 1)` |
| Flat pattern by Model View, custom 1:4 | right | — |
| Sheet scale 1:1 -> 1:2 (Sheet Properties) | right: sheet-scaled views halve, all stay on the sheet, the 1:4 flat keeps its size, alignment kept | — |
| Sheet B -> C | right: the hand-placed flat keeps its place relative to the sheet (± 6 %), the family stays aligned and on the sheet | — |
| A view to another sheet | only right-click ▸ Move to Sheet | **Edit ▸ Cut / Paste, Ctrl+X / Ctrl+V**: the view and its children move to the active sheet at the same place, one undo step |
| Save / close / open | — | the SVG is identical after the part JSON round trip (steps 3 and 4) |

## Left, with a reproduction
- Break lines cannot be dragged on the sheet (Break View with two clicks only, rfPH): place a Break on the Front, drag a break line: the view moves instead.
- A detail circle cannot be resized by dragging (only moved); profile (rectangle / sketched) details are not draggable.
- Half / offset / aligned / partial cutting lines are not draggable (edited in their PM); a removed section's line neither.
- Broken-out Section (closed spline, depth from another view) and Crop / Remove Crop were not driven this round (pinned by rfW / rfPM earlier).
- A view dragged in the FeatureManager onto another sheet's row does nothing (Cut / Paste and Move to Sheet do it).
- Rotate View and the Tangent Edge menu were not re-driven (rfLA / rfNL pin them).

## Missing against SolidWorks 2024's View Layout tab and view menu (not built)
- Predefined View, Update Views, 3D Drawing View on the ribbon (Empty View is on Insert ▸ Drawing View only).
- Lock View Focus; Alignment ▸ Align Horizontal / Vertical by Origin / Center.
- Model View's Part/Assembly to Insert box, Shaded display styles, Cosmetic Thread Display.

## Check in SolidWorks
- That a Standard 3 View clicked on a sheet with views adds the three where an empty sheet would have them (Anvil does not avoid the existing views).
- The corner projected views other than top-right of a Front (top-left, bottom-…) against SolidWorks' frames (Anvil: the parent's up stays up).
- Whether Lock View Position also stops a parent's drag from moving the locked child (Anvil: the parent still takes it along).
