# Completeness audit — SolidWorks 2024 Sketch tab and Drawings vs Anvil (020136c), 2026-10-13

Lane AM, **35-minute box, report only** (no app file edited). Every Sketch / Drawing roadmap item is ticked, so this
audit asks what "complete" still lacks, command by command. The inventory comes from reading the ribbon, menu and
command definitions (`ui-panels.js` `RIBBON.Sketch`, the part menus, `drawing-ui-panels.js` / `drawing-ui-tools.js`
ribbons and `Insert` menu, `ui-app.js` Search Commands) and from two headless-Chrome runs over the DevTools protocol
(server on port 8900, Chrome on 9400; driver `drv.js`, `s1.js`, `s2.js` in the session scratchpad, not in the repo)
that enumerated the live ribbon, opened the menus, opened a sketch on Front and read the Trim / Offset / Fillet /
Add Relations / Split PropertyManagers, then made a drawing of the start-up part and read its five tabs and menus.
No console errors. Items already reported on 2026-10-08 / 2026-10-12 (sketch fidelity 1–3, drawing fidelity,
sheet-metal fidelity, shop workflow 1–2) are not repeated; see those for Smart Dimension behaviour, PM layouts,
bend notes, hole callouts and the DXF / DWG legs.

Status: **present** (the command is there and does its SolidWorks job), **partial** (there, but a visible part of
the SolidWorks command is missing), **missing** (not in Anvil; greyed ribbon placeholders count as missing),
**n/a** (out of the shop's scope: surfacing, weldments, simulation, assemblies-only, 3D sketch).
Things I could not try inside the box are marked *unverified*.

## 1. Sketch tab (SolidWorks 2024 CommandManager, flyouts, Tools ▸ Sketch Entities / Sketch Tools / Relations / Dimensions / Spline Tools)

| SolidWorks 2024 command | Anvil | Status | Notes |
|---|---|---|---|
| Sketch / Exit Sketch | Sketch flyout | present | |
| 3D Sketch, 3D Sketch On Plane | greyed | n/a | SolidWorks placement kept; not a shop need |
| Smart Dimension | Smart Dimension | present | earlier rounds cover its behaviour |
| Horizontal / Vertical Dimension | flyout | present | |
| Horizontal / Vertical Ordinate Dimension | flyout | present | |
| Ordinate Dimension (free direction), Angular Running Dimension, Path Length Dimension | — | missing | no `cmd`; Path Length matters for flat-blank perimeter checks only rarely |
| Chamfer Dimension (sketch) | — | missing | the drawing has one; the sketch does not |
| Autodimension (Tools ▸ Dimensions) | Fully Define Sketch | partial | Fully Define Sketch is the same engine; the stand-alone Autodimension PM (scheme: baseline / chain / ordinate, which entities) is not offered |
| Line, Centerline, Midpoint Line | Line flyout | present | |
| Parallel / Tangent / Perpendicular Line, Bisector | Line flyout | present | Anvil's own; SolidWorks makes these by relation |
| Corner / Center / 3 Point Corner / 3 Point Center Rectangle, Parallelogram | Rectangle flyout | present | |
| Straight / Centerpoint Straight / 3 Point Arc / Centerpoint Arc Slot | Slot flyout | present | arc slots stay single entities (round 3 #5) |
| Circle, Perimeter Circle | Circle flyout | present | |
| Centerpoint / Tangent / 3 Point Arc | Arc flyout | present | |
| Polygon | Polygon | present | |
| Spline, Style Spline | Spline flyout | present | |
| Equation Driven Curve | greyed | missing | |
| Ellipse, Partial Ellipse | Ellipse flyout | present | |
| Parabola, Conic | greyed | missing | rare in sheet metal |
| Point | Point | present | |
| Text | Text | present | Etch text on its own level |
| Plane (sketch) | Plane | present | |
| Sketch Fillet, Sketch Chamfer | flyout | present | Chamfer: *unverified* for the Angle-distance and Equal-distance options |
| Trim Entities (Power trim, Corner, Trim away inside / outside, Trim to closest) | Trim | present | all five options in the PM, keep-as-construction and ignore-construction too |
| Extend Entities | Trim flyout | present | |
| Split Entities | Trim flyout | present | plus Split all at intersections (Anvil's own) |
| Join Entities (Spline Tools ▸ ... / Segment) | Trim flyout | present | Anvil's own name |
| Segment (Tools ▸ Sketch Tools ▸ Segment: n equal points / segments on a line or arc) | — | missing | handy for hole rows; `grep Segment` hits only internal code |
| Jog Line (sketch) | — | missing | |
| Convert Entities | Convert | present | tangent edge dropped on a flange face (shop-workflow 2 #1, open) |
| Intersection Curve | Convert flyout | present | |
| Silhouette Entities, Face Curves | — | n/a | surfacing |
| Offset Entities (Add dimensions, Reverse, Select chain, Bi-directional, Cap ends, Construction geometry base / offset) | Offset | present | every option in the PM |
| Offset on Surface | — | n/a | |
| Mirror Entities, Dynamic Mirror | Mirror flyout | present | |
| Linear / Circular Sketch Pattern | Pattern flyout | present | |
| Move / Copy / Rotate / Scale / Stretch Entities | Move flyout | present | |
| Modify Sketch (translate / rotate / flip the whole sketch, Tools ▸ Sketch Tools) | — | missing | the usual way to flip an imported DXF blank |
| Display/Delete Relations, Add Relation | Relations flyout | present | |
| Fully Define Sketch | Relations flyout | present | |
| Tools ▸ Relations ▸ Scan Equal, Constrain All | — | missing | Constrain All is the DXF-import clean-up step |
| SketchXpert (over-defined diagnosis) | — | missing | over-defining opens *Make Dimension Driven?* only (shop-workflow #2); no conflict list |
| Repair Sketch | Repair Sketch | present | |
| Check Sketch for Feature | button + Tools menu | present | |
| Quick Snaps (flyout of 11 snaps) | greyed | missing | |
| Rapid Sketch | greyed | missing | low value |
| Construction Geometry | button | present | |
| Shaded Sketch Contours | button | present | |
| Sketch Picture | greyed | missing | tracing a scanned print is a real shop task, but DXF import covers most of it |
| Spline Tools: Insert Spline Point, Simplify Spline, Fit Spline, Show Spline Handles / Inflection / Curvature combs, Add Tangency / Curvature Control, Relax Spline | — | missing | nothing in `ui-sketch-spline.js`; low value in sheet metal except Fit Spline on imported polylines |
| Sketch Settings: Automatic Relations, Automatic Solve, Enable Snapping, No Solve Move, Detach Segment on Drag, Override Dims on Drag/Move, Ghost image | one item | partial | Tools ▸ Sketch Settings has only *Enable on-screen numeric input*; nothing toggles inference, snapping or No Solve Move |
| Tools ▸ Sketch Entities menu | — | missing | no such submenu; every entity is reachable from the ribbon only |
| Tools ▸ Sketch Tools menu | 3 of ~25 entries | partial | only Check Sketch, Repair Sketch, Insert DXF / DWG; Trim / Extend / Offset / Convert / Mirror / Move / Patterns / Fillet / Chamfer / Modify / Segment / Sketch Picture are not in the menu |
| Tools ▸ Dimensions menu | Fully Define only | partial | Smart / Horizontal / Vertical / Ordinate / Chamfer / Autodimension not in the menu |
| Search Commands (menu-bar box) | fixed word list | partial | `ui-app.js` matches 18 keywords (extrude, cut, revolve, sketch, hole, pattern, circular, mirror, plane, measure, section, dxf, dwg, script, macro, mate, insert, component, assembly); `stretch entities` → "No command matches" (verified). The S-key bar is a fixed button set, not a search |
| Instant2D | — | missing | dimension values are edited through the Modify box only |
| Blocks (Make / Edit / Insert / Explode Block) | — | missing | SolidWorks' Blocks toolbar; useful for repeated punch / louver symbols, rare otherwise |
| Insert DXF / DWG, Sketch to DXF, Levels | buttons | present | Anvil's own additions |

**Counts (Sketch, scoped):** present 42, partial 5, missing 17 (3D sketch and surfacing items excluded as n/a).

## 2. Drawings (View Layout, Annotation, Sketch, Sheet Format tabs; Insert ▸ Drawing View / Annotations / Tables)

| SolidWorks 2024 command | Anvil | Status | Notes |
|---|---|---|---|
| Standard 3 View, Model View, Projected View | View Layout | present | Model View PM groups: drawing fidelity #4 |
| Auxiliary View | View Layout | present | |
| Section View, Removed Section | Section View | partial | Removed Section (a section slice placed as its own view, no parent alignment) is missing; Section View itself present |
| Detail View | View Layout | present | |
| Relative View (two faces define the orientation) | — | missing | the easy way to get a flange face square to the sheet; Model View named orientations cover standard faces only |
| Broken-out Section | View Layout | present | |
| Break | View Layout | present | |
| Crop View | View Layout | present | |
| Alternate Position View | — | n/a | assemblies |
| Empty View, Predefined View (Insert ▸ Drawing View) | — | missing | low value |
| Flat Pattern view | Insert ▸ Drawing View ▸ Flat Pattern | present | greyed when the part is not sheet metal |
| Smart Dimension (drawing) | Annotation | present | angular dimension now in `drawing-annotations.js` (`kind === 'angle'`, rfS); *unverified* by placement this round |
| Ordinate / Baseline / Chamfer Dimension | Annotation flyout | present | |
| Horizontal / Vertical Dimension, Horizontal / Vertical Ordinate (drawing) | Smart Dimension only | partial | no forced-direction dimension tool in the drawing; Smart Dimension's placement decides |
| Angular Running, Path Length Dimension | — | missing | |
| Autodimension (drawing) | Model Items | partial | no stand-alone Autodimension PM for a view |
| Model Items | Annotation | present | PM groups: drawing fidelity #3; hole callouts: shop-workflow 2 #3 (fixed 020136c) |
| Note (Insert ▸ Annotations ▸ Note) | Annotation | present | leader, multi-line, `$PRP` links exist; **Flag notes**, numbered / bulleted lists, hyperlinks, *Multi-jog Leader*, Note with *Bent leader* are missing (partial if read as one command) |
| Linked Note / Linked to Property | `$PRP` text | present | |
| Balloon, Auto Balloon, Stacked Balloon, Magnetic Line | Annotation | present | assemblies mostly |
| Hole Callout | Annotation | present | |
| Surface Finish, Datum Feature, Geometric Tolerance | Annotation stack | present | |
| Datum Target | — | missing | |
| Weld Symbol | — | missing | tack-welded brackets get a weld symbol on the print; nothing in `drawing*.js` |
| Cosmetic Thread (Insert ▸ Annotations) | from Hole Wizard tap holes only | partial | rendered for Hole Wizard Straight Tap holes; no stand-alone Cosmetic Thread annotation on a picked circle |
| Dowel Pin Symbol | — | missing | |
| Revision Symbol, Revision Cloud | — | missing | the Revision Table exists but no triangle symbol / cloud on the view: the pair a customer asks for on every rev |
| Center Mark, Centerline | Annotation | present | Center Mark PM: drawing fidelity #6 |
| Area Hatch/Fill | Annotation | present | |
| Block (Insert ▸ Annotations ▸ Block) | — | missing | |
| Tables ▸ Bill of Materials, Revision Table, General Table | Annotation | present | |
| Tables ▸ **Hole Table** | — | missing | the shop's own ask (hole coordinates from a datum, tag A1…); `grep "Hole Table"` finds nothing |
| Tables ▸ **Bend Table** (as a table annotation) | flat view option | present | Bend Table tags A, B, C from the flat view's Bend Notes option; not insertable from Insert ▸ Tables (cosmetic) |
| Tables ▸ Punch Table | — | missing | needs Forming Tools, which are out of scope |
| Tables ▸ Weldment Cut List, Title Block Table, Design Table | — | n/a / missing | Title Block fields exist as the sheet format's own notes |
| Sheet Format tab: Edit Sheet Format, Line, Note, Save Sheet Format, Save as Template, Drawing Templates, Reset Format | Sheet Format | present | Title Block Fields editing, Automatic Border: *unverified* |
| **Sketch tab (drawing)** | tab shown | missing | the tab is listed next to Markup, but clicking it leaves the Sheet Format ribbon on screen (verified: *Line* under it runs the *sheet-format* Line, `status` "Sheet format Line…", no sketch tool). There is no way to draw sketch lines / circles / arcs on the sheet or in a view outside Edit Sheet Format, which is how a shop adds a leader-less weld line, a bend-line reminder or a quick hand sketch |
| Markup tab (ink) | tab shown, inert | n/a | SolidWorks' pen markup; low value on a desktop |
| Line Format toolbar (layer, line color / thickness / style, color display mode) | — | missing | layers go to DXF by view name; nothing sets an entity's line style / weight on the sheet |
| Hide/Show Edges, Hide/Show Annotations, tangent edge style per view | tangent edge style per view | partial | `tangent` per view (removed / phantom / visible) exists in the API; Hide/Show Edges per edge is missing |
| View ▸ Hide/Show ▸ (annotations, sketches, planes…) | View menu: Zoom to Fit only | partial | the drawing's View menu has one item |
| Insert ▸ Drawing View menu | 7 entries | present | the Auxiliary, Broken-out Section, Break, Crop and Area Hatch/Fill entries appear **twice** in the Insert menu (`drawing-ui-tools.js` `onAssign(UI, 'menuHook')` runs its additions on an already-hooked list; verified in the live menu) |
| Tools (drawing): Sheet Properties, Document Properties, Edit Sheet Format, Drawing Templates | Tools menu | present | |
| Save as DXF / DWG / PDF / SVG, .drawing file | File menu | present | |
| Spell Checker, Format Painter, Design Checker | — | missing | low value |

**Counts (Drawings, scoped):** present 32, partial 8, missing 16.

## 3. Gaps ranked by value to a sheet-metal shop (daily use first)

| Rank | Gap | Why it matters | Likely owning file |
|---|---|---|---|
| 1 | **Hole Table** (Annotation ▸ Tables) | Punch / laser prints list hole positions from a datum corner with tags; customers ask for it on every multi-hole blank | `drawing-annotations.js` (table data), `drawing-sheet.js` (placement), `drawing-render.js`, `drawing-ui-tools.js` (PM: origin pick, which holes, columns TAG / XLOC / YLOC / SIZE) |
| 2 | **Sketch tab in a drawing** (sketch entities on the sheet / in a view) | Lines, circles, arcs and construction lines on the sheet are the shop's quick-fix for anything an annotation tool lacks; today the tab is inert | `drawing-ui-panels.js` (`ribbonTabsFor`, a real `Sketch` ribbon set for drawings), `drawing-ui-tools.js` (sheet entity tools), `drawing.js` + `drawing-render.js` (sheet entities in the document and DXF) |
| 3 | **Revision Symbol** (triangle with the rev letter) and Revision Cloud | Every revised print carries the triangle next to the change; the Revision Table exists but cannot be pointed at | `drawing-annotations.js`, `drawing-render.js`, `drawing-ui-tools.js` |
| 4 | **Weld Symbol** | Tack-welded brackets and stud welds are drawn in the same shop; no symbol exists | `drawing-annotations.js`, `drawing-render.js`, `drawing-ui-tools.js` (PM: arrow / other side, weld type, size, length-pitch, field, all around) |
| 5 | **Modify Sketch** and **Constrain All** (Tools ▸ Sketch Tools / Relations) | An imported DXF blank is flipped, moved and locked down with these before it is extruded; Repair Sketch handles gaps but not orientation or relations | `ui-sketch-tools.js` (Modify PM), `ui-relations.js` (Constrain All: coincident at touching ends, H / V on near-level lines) |
| 6 | **Search Commands** that searches every ribbon / menu label | SolidWorks users type the command name; Anvil's box knows 18 words and the S-bar is a fixed grid | `ui-app.js` (the keydown handler: match `UI.RIBBON` labels and the menu items, show a short list) |
| 7 | **Tools ▸ Sketch Entities / Sketch Tools / Dimensions menus** complete | The menus are where SolidWorks users look for Segment, Modify, Sketch Picture and the dimension tools; three entries today | `ui-panels.js` (`partMenus` Tools) |
| 8 | **Line Format** (line style / weight / layer per sheet entity and annotation) | Phantom bend lines, hidden-line weight, a note on its own DXF layer for the customer's AutoCAD | `drawing-ui-tools.js` (toolbar / PM), `drawing-render.js`, `drawing.js` (DXF `LTYPE` / `LWEIGHT`) |
| 9 | **Relative View** | A flange face square to the sheet without building a named view | `drawing-views.js` (orientation from two faces), `drawing-ui-tools.js` (PM) |
| 10 | **Segment** (sketch) and **Equation Driven Curve** | Segment spaces hole rows in one click; the curve is rarely needed in sheet metal | `ui-sketch-tools.js` (Segment PM); `ui-sketch-spline.js` (curve) |
| 11 | Flag notes, Multi-jog Leader, Dowel Pin Symbol, Datum Target, Cosmetic Thread on a picked circle | Complete the Annotation tab; each is a half-day item | `drawing-annotations.js`, `drawing-ui-tools.js` |
| 12 | Sketch Settings toggles (Automatic Relations, Snapping, No Solve Move, Detach Segment on Drag) and Quick Snaps | Day-to-day inference control; today inference is always on | `ui-sketch.js` (inference / snap flags), `ui-panels.js` (menu) |
| 13 | SketchXpert, Instant2D, Sketch Picture, Spline Tools, Blocks, Removed Section, Empty / Predefined View, Hide/Show Edges | Nice to have; none blocks a shop print | sketch: `ui-sketch-dims.js`, `ui-sketch-spline.js`; drawing: `drawing-views.js`, `drawing-ui-tools.js` |

Minor bugs seen on the way (not in the earlier reports): the drawing's Insert menu lists Auxiliary, Broken-out Section,
Break, Crop and Area Hatch/Fill twice (`drawing-ui-tools.js`, the `menuHook` additions are applied on top of each
other); the drawing's View menu holds only *Zoom to Fit*; the drawing *Sketch* and *Markup* tabs show the Sheet Format
buttons when clicked instead of their own or a greyed ribbon (`drawing-ui-panels.js` `ribbonTabsFor`).

Not verified inside the box: Sketch Chamfer's option set, Sheet Format's Title Block Fields and Automatic Border,
angular Smart Dimensions actually placed in a drawing, and the Hole Wizard cosmetic thread on a drawing of an inch part
(the drawing run used the mm start-up bracket because the scripted inch part did not load through `anvil.run` in the
driver; the inventory does not depend on it).
