# Drawing views audit and leftovers (lane NL, round local-2026-11-16b)

Driven in headless Chrome with real mouse / key events (ribbon clicks, sheet clicks and drags, right-click menus) on
inch sheet-metal parts: a 14 ga bracket (UP 2, DOWN 1.5, Ø.257), a 16 ga 36 x 6 panel with two 1 in flanges, a 16 ga
4 x 3 base with a 2 in flange bent 30° and a Ø.300 hole through it, and the rfMS base-plate / block assembly. After
each flow: undo / redo, saved with the part and opened again (`anvil.load(JSON)` + Make Drawing), DXF (R12 / R2000)
and PDF. Tests: smoke `rfNL` (4 steps), kernel `rfNL` (3 tests).

## Leftovers (task 1)

| Item | Measured on main | Fixed / left |
|---|---|---|
| Annotation tab lists Ordinate / Baseline / Chamfer Dimension twice | in the Smart Dimension flyout AND in the stack beside it | fixed: each once. They stay in the stack (the older smoke groups `drawing-annotations.js` and `rfBX` click them there by name); the flyout holds the other eight. rfLH's pinned drawing id order changed accordingly (ordinateH … pathLengthDim, then ordinateDim, baselineDim, chamferDim). SolidWorks 2024 keeps all of them in the flyout: moving the three there needs `drawing-annotations.js` lines 29 / 83 / 98 and `rfBX.js` 113 to pick them from the flyout (tests lane). Tools ▸ Dimensions still lists all eleven. |
| `DW.zoomBy` does nothing on a fitted sheet | zoomBy itself worked (vb 18.02 -> 14.42); what did nothing was every app zoom command in a drawing: Z / Shift+Z (the drawing's keydown swallowed them), Zoom to Fit, `UI.zoomView`, Mastercam Unzoom 50 / 80 % (they moved the hidden 3D camera) | fixed: the drawing keydown runs the key map's zoomIn / zoomOut; `UI.zoomView`, `UI.unzoom`, `UI.zoomToFit` act on the sheet while a drawing is open. Measured from the fit: Shift+Z 0.80, Z Z 1.25, wheel 0.87, Unzoom 50 % 2.00, Zoom to Fit back to 1.00. |
| Center Mark on a hole that already has one adds a second | rfMV's step clicks the channel's hole, which carries its Auto insert mark, and asserts one more centerMark record; refusing the click (the last lane's attempt) fails that | fixed at the cause: a click on a hole whose only mark is the Auto insert one replaces it (the user's mark added, the auto record kept hidden so the next rebuild does not insert it again; rfMV's +1 still holds and one mark is drawn); a click on a hole the user already marked (or a linear / circular mark runs through) selects that mark and adds none. Undo restores the auto mark. |
| A diameter on a deleted hole jumps to a nearby hole of the same size | `reattachDim`'s "hole moved" fallback took the nearest same-size circle within a quarter of the view | fixed: a dia / rad dimension remembers how many circles of its size the view had (`d.nr`) and where the others were (`d.peers`, up to 25). One fewer -> it dangles; same count -> the hole moved, and a circle at a new place wins over a neighbour that stayed. Kernel rfNL: deleted -> `Ø.201?`, undo reattaches, moved 2 -> 3.5 followed (the neighbour at 1 is nearer). |
| Explode lines in an exploded view | none drawn | fixed: a model / projected view shown exploded draws each explode step's path (component centre before -> after) as a phantom (`chain`) line on the view's layer, from a pose-only rebuild cached on the mesh; SVG / PDF / DXF carry them. Kernel rfNL: one 30 mm line, straight up in Front; none in the collapsed view. (Per-view hide of the lines: `view.showExplodeLines = false`, no UI yet.) |
| A hole seen obliquely across a bend is Bézier pieces | the hole through the bend itself (rfMV's channel) is a true intersection curve: Bézier is right there. Where the rim IS an ellipse (a hole through a flange bent at 30°: the cylinder ends on slanted planes) Right drew 49 + 25 facet chords, Isometric 52 | fixed: drawing-curves files the edges between a cylinder face and a slanted planar face as ellipse groups (`ry`), drawing-hlr projects them as ellipses and as circles where seen along the hole's axis. Right: 2 visible + 1 hidden ELLIPSE (.150 x .087), Isometric 5 ellipses, Top one circle; R2000 DXF ELLIPSE. |

## Views audit (task 2)

| View type | Steps driven | Defects found | Fixed / left |
|---|---|---|---|
| Section View (full) | bracket Top view: Section View ▸ ✓ (horizontal), click on the hole row, click below; then UP flange 2 -> 2.5 | none: `Section View A-A`, `SECTION A-A`, labels A on the cutting line, 35 hatch lines (Plain Carbon Steel -> ANSI32), area .5225 -> .5599 after the edit (+.5 x .0747 exact); undo / redo, reopen, DXF layer SECTION_A, PDF | — |
| Section View (half / offset / aligned) | not re-driven (rfW / rfCX drive every leg with the mouse this week) | — | — |
| Detail View | circle on the Front view's right bend (r .4), placed at 14.5, 1.8 | none: `Detail View B (2 : 1)`, `DETAIL B` / `SCALE 2 : 1`, 4 lines + 2 bend arcs; undo removes, redo restores; DXF DETAIL_B | the detail circle's label B is written on layer SHEET, not the parent's layer (left: cosmetic, DXF only) |
| Break View | 36 in panel Front: Break ▸ ✓ (vertical, gap .4, zig zag), clicks at 10 and 26 in | none: view 9.000 -> 5.422 wide, the 36.000 model dimension stays true; saved and reopened keeps the break | — |
| Crop View | panel Right: Crop View ▸ ✓, two corner clicks | none: crop rect stored, the view box shrinks to it | — |
| Auxiliary View | 30° flange part, Front: Auxiliary View, click the slanted edge, place | `Auxiliary View A-A`, `VIEW A-A`; the near rim one full ellipse (.173 x .150). The far rim (through the hole, behind the wall at a grazing angle) comes out as 15 short visible + 15 short hidden ellipse pieces | left: visibility along a grazing cylinder wall alternates per facet; needs a merge of short alternating runs in projectView (not a missing curve) |
| Broken-out Section | tool and PM present (rfAD / rfAG drive it) | not re-driven | — |
| Alternate Position View | — | Anvil has none | left as asked (do not build) |
| View alignment | panel Top view dragged sideways (slides up / down only), right-click | SolidWorks' Alignment ▸ Break Alignment / Default Alignment were missing from the view menu | fixed: `Drawing.setViewAlignment(doc, id, on)` (keeps `alignWas`), two menu rows greyed as SolidWorks does; broken: drags freely and the Front no longer carries it; Default: snapped back over Front. Undo / redo, reopen, DXF / PDF (smoke rfNL). |
| Rotate view, scale, display style | right-click menu rows present (Rotate View… dialog, Display ▸ HLV / HLR, Properties… scale) | not re-driven beyond the menu (rfLA / rfLG drive Rotate and its dimensions) | — |
| Tangent edges on bends | 30° part Isometric: right-click ▸ Tangent Edges Visible / With Font / Removed | none: 0 -> 2 `tangent` -> 2 `tanfont` lines | — |
| Hide edge | right-click on an edge offers Hide Edge / Show Hidden Edges (rfAO) | not re-driven | — |
| Views between sheets | Add Sheet, right-click ▸ Move to Sheet | rows appear only once there are two sheets (as designed) | — |
| Exploded assembly view | rfMS assembly, a Front shown exploded | no explode lines | fixed (above) |
