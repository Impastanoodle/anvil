# Sketch tab fidelity audit, round 3 — the line-based shapes, SolidWorks 2024 vs Anvil (47fca47), 2026-10-12

Lane: sketch fidelity (audit, then fixes in the sketch files). **45-minute time box**: observations were made on
`47fca47` in headless Chrome driven over the DevTools protocol with trusted input (`Input.dispatchMouseEvent` with
buttons held, `Input.dispatchKeyEvent`), in a new **inch** part on the Front plane at 50 px per inch, as rounds 1 and
2 did it. The driver and scenario scripts (`drv.js`, `common.js`, `n3.js`–`n7.js`) live in the session scratchpad
(`audit3/`), not in the repository. Port 8883 is held by Dell *SupportAssistAgent* on this machine (`netsh http show
servicestate` lists `HTTP://127.0.0.1:8883/` and `8884/` under it; `serve.ps1 -Port 8883` cannot bind), so the server
ran on **8885**; Chrome on debugging ports 9383–9385.

## Round-2 leftovers verified

| # | Finding | Result |
|---|---|---|
| r2 #10 | Right-click while drawing a Line chain | **fixed**: a real right-click (button 2 pressed / released over the viewport) with one point placed opens the short menu *End Chain (double-click) / Select / Smart Dimension / Exit Sketch*; *End Chain* leaves the Line tool active with no pending point (`n3.js` I). |

## Findings

| # | Sev. | Expected (SolidWorks 2024) | Actual (Anvil, 47fca47) | Repro | File | State |
|---|---|---|---|---|---|---|
| 1 | major | A preselection of several sketch entities reaches a command whole: Ctrl-click a slot's two lines and two arcs, Linear Sketch Pattern → *Entities to Pattern* lists four. | Four entities selected (`UI.selection()` = 4), Linear Sketch Pattern opened → the box lists *Line1, Arc2* only; the pattern copies two of the slot's four entities. The multi-selection is dropped whenever `App.mesh` changes (the sketch feature's own worker rebuild finishing after the picks), and `selection()` falls back to `sel` / `sel2`. Same for Mirror (a polygon's six sides mirrored as two). | `n5.js` P: Straight Slot (0,0)–(1,0) w .4, Shift/Ctrl-click the four entities, Linear Sketch Pattern. `n7.js`: `UI.setSelection(4)`, change `App.mesh`, `UI.selection().length` = 2. | `ui-select.js` `selection()` | **fixed**: a multi-selection made only of sketch items (entities, points, dimensions, relations) does not depend on the mesh and is kept across a mesh change; ui-smoke `rfX`. |
| 2 | major | Dragging a straight slot's end cap (the arc) moves that end: the slot stretches / turns, the width stays (the arc keeps its radius; the centre, Coincident with the centerline end, follows). | Dragging the right cap from (3.3, 0) to (4, 0.2) leaves both centres where they were and changes the **width** from .6 to 2.02 (the arc drag is a radius drag, the Equal / Tangent chain follows). | `n3.js` C: Straight Slot (1,0)–(3,0) w .6, drag the right arc. | `ui-relations.js` (arc drag mode) / `sketch-solver.js` drag | open |
| 3 | minor | Esc with a ribbon flyout open only closes the flyout; the selection stays. | Esc on an open flyout menu (or opening a second caret) keeps `App.sel` but empties `App.multi`: four selected entities become two. | `n7.js`: select 4, click a caret, Esc, `UI.selection().length` → 2. | `ui-panels.js` / `ui-select.js` (Esc handler) | open (out of this lane's files for the menu part) |
| 4 | minor | Line tool numeric input: L then Tab A sets both. | L = 2 is applied, the typed angle (Tab, 30) is not: the line keeps the cursor's 35°. | `n3.js` G: Line, click origin, move, type `2`, Tab, `30`, Enter → end (1.638, 1.147). | `ui-sketch.js` num box (`Tab` twin field) | open, needs a second run to confirm (the later re-run could not start the Line tool after a Mirror ✓, see #6) |
| 5 | minor | Centerpoint Arc Slot numeric input for every step (radius, start angle, end angle, width) and Ellipse radii. | Arc slot: the box opens for R only; after the second point no box for the sweep / width. Ellipse: no numeric box at all. | `n4.js` G aslot / ellipse. | `ui-sketch-curves.js` / `ui-sketch-spline.js` `numFields` | open (arc slots stay single entities; see QUEUE) |
| 6 | cosmetic | After ✓ on Mirror Entities the ribbon's drawing tools answer at once. | After Mirror ✓ the driver's ribbon lookup for *Line* found no button (`ribbon('Line')` → null) and later tools drew nothing; the Sketch tab stayed active. Most likely the driver's label match (the ribbon re-rendered with the » overflow at 1600 px), not an app fault; needs a hand check. | `n7.js` tail. | `ui-panels.js` | open, unverified |

Observations that **matched** SolidWorks and are not findings: dragging a circle's edge changes its radius and the
centre stays (1 → 1.49); dragging the centre moves the circle (a centre placed on the origin is Coincident and
stays); dragging a polygon side translates the hexagon (all sides 1.732, the construction circle moves, one undo
step); dragging a corner resizes / turns it about the centre (sides 1.732 → 2.075, centre fixed); deleting the
Polygon relation leaves six Coincident corners (dof 4 → 15) and a corner drag then changes only its two sides; undo
brings the Polygon relation back; Sketch Fillet R .25 on a polygon corner keeps the Polygon relation and the sides
Equal (a later corner drag keeps them equal); Sketch Chamfer the same; Sketch Fillet on a slot's line–arc junction is
refused with *They already meet smoothly (tangent): there is no corner to round*; a rectangle corner drag keeps it
rectangular; Offset Entities on a polygon side with *Select chain* offsets all six sides with one Offset relation,
Parallel and the distance; Fully Define Sketch on a polygon adds Vertical, two location dimensions and the circle Ø
(Fully Defined); on a slot three location dimensions and the arc radius; Move / Rotate / Scale open their
PropertyManagers (From/To or X/Y; a centre click) — they were not completed inside the box because of #1 / #6.

Not reached inside the box: Convert Entities on a sheet-metal face, Circular Sketch Pattern with a whole polygon
(blocked by #1 at the time), arc slots as real entities (not started), the DXF / DWG round trip.

## Suites

Kernel tests (`node anvil/headless/anvil.js test`), `example --all` and ui-smoke counts are in the lane report.
