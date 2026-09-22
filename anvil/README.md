# Anvil

Anvil is a parametric solid modeler that runs entirely in the browser. It has a SolidWorks-style workspace (CommandManager ribbon, FeatureManager tree, PropertyManager, task pane, heads-up view toolbar) on top of a small CSG kernel, and every model is also a script: you can build parts by clicking, by typing a script in the console, or by driving `window.anvil` from automation.

There is no build step and no dependency besides three.js r128 from cdnjs. Open `index.html` over HTTP (see *Running* below).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page skeleton. Loads the scripts in dependency order. |
| `csg.js` | BSP-tree constructive solid geometry (union, subtract, intersect, transform, signed volume). Global `CSG`. |
| `kernel.js` | Modeling kernel: planes, sketch entities, profiles, features, rebuild, meshing, mass properties, STL/DXF export, the script `Builder`. Global `Kernel`. |
| `icons.js` | Inline SVG icon set. Global `Icons`. |
| `style.css` | The whole UI stylesheet. |
| `ui-core.js` | App state, three.js scene, camera, picking, highlights. Creates the shared `UI` namespace. |
| `ui-sketch.js` | Viewport mouse handling, sketch mode, the 2D sketch tools. |
| `ui-commands.js` | PropertyManager rendering and every feature command. |
| `ui-panels.js` | Ribbon, menu bar, feature tree, heads-up toolbar, status bar, modals. |
| `ui-app.js` | Task pane, script console, files and exports, shortcuts, `window.anvil`, boot. |
| `examples/examples.js` | Sample parts as scripts (`AnvilExamples`). Picked up by the Design Library when loaded. |
| `tests/kernel-tests.html` | Headless kernel test page (no three.js needed). |
| `tests/bench.html`, `tests/BENCHMARKS.md` | Rebuild timing page (median of N runs per example plus stress parts) and the recorded baselines. |
| `tests/ui-smoke.html` | Loads the app in a frame and drives it through `window.anvil` and the `UI.cmd*` functions: examples, PMs, undo/redo, exports, modals, sheet metal. |
| `serve.ps1` | Tiny PowerShell static server for local use. |
| `ROADMAP.md`, `SESSION_LOG.md` | Plan and per-session history. |

## Running

The scripts are loaded with relative paths, so the folder has to be served over HTTP (a `file://` page cannot load the modules in every browser). No node or python is assumed:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1
```

Then open <http://localhost:8765/>. The kernel tests are at <http://localhost:8765/tests/kernel-tests.html>; the page prints a pass/fail table and exposes `window.__anvilTests` for automation.

## The workspace

The layout deliberately mirrors SolidWorks so muscle memory carries over.

- **Menu bar**: File (new, open, save, exports, screenshot), Edit (undo, redo, delete, rebuild), View (standard views, display styles, planes, origins, section view), Insert (boss, cut, sweep, loft, hole wizard, fillet, chamfer, shell, patterns, mirror, sketch, reference plane, base flange), Tools (script console, measure, mass properties, units), Window, Help.
- **CommandManager ribbon** with Features (boss, cut, revolve, hole wizard, sweep, loft, patterns, mirror, chamfer, fillet, shell, reference plane), Sketch (line, rectangles, circle, arc, polygon, slot, convert entities, offset entities, sketch fillet, trim, mirror entities, linear sketch pattern), Evaluate (measure, mass properties, section view, face to DXF) and Sheet Metal (base flange, edge flange, miter flange, hem, jog, flatten, flat to DXF) tabs. Every ribbon button has a tooltip with its shortcut and a one-line description.
- **FeatureManager tree** on the left. Click selects a feature, double-click edits it, F2 renames, Delete removes it with its dependents. Sketches consumed by a feature are hidden unless *View ▸ All Sketches* is on.
- **PropertyManager** replaces the tree while a command is open. Enter accepts, Esc cancels.
- **Viewport**: orthographic. Middle-drag orbits, Ctrl+middle-drag pans, wheel zooms at the cursor. Hovering a face highlights it; clicking selects it. The triad in the corner shows the current orientation.
- **Smart Dimension** (Sketch tab, or `D` in a sketch): click an entity, then click where the dimension should sit, exactly as in SolidWorks — a line gives its length, or its horizontal / vertical distance when you place the dimension above or beside a slanted line; a rectangle edge gives that side; circles give Ø, arcs and polygons R, slots length and width. The value box opens right after placement: type a number and press Enter to drive the entity. Placed dimensions are stored on the sketch, drawn with extension lines and arrows, and come back in the generated script. Click any value to change it; a selected dimension is removed with Delete. *View ▸ Sketch Dimensions* (on by default) also shows the driven values of every entity that has no placed dimension.
- **Heads-up toolbar** above the viewport: zoom to fit, zoom to area, previous view, view orientation, display style, section view.
- **Task pane** on the right: Home, Design Library (example parts), Files (named saves in localStorage), Views, Appearance, Properties (name, units, material, sheet-metal parameters), and the **Script** console.
- **Status bar** shows the last message, cursor coordinates in sketch mode, and the rebuild time.

Keyboard: Ctrl+1 … Ctrl+7 standard views, Ctrl+8 normal-to, F fit, S start or exit a sketch, L/R/C/A/P/T sketch tools, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+B rebuild, Ctrl+S save. *Help ▸ Keyboard shortcuts* lists everything.

## Coordinate system and sketch planes

World axes are right-handed with +Y up. The three standard sketch planes use the SolidWorks frames, where a sketch point `(u, v)` maps to world space as `origin + u·x + v·y` and extrusions go along `n`:

| Plane | sketch x | sketch y | normal n |
| --- | --- | --- | --- |
| Front | +X | +Y | +Z |
| Top | +X | **−Z** | +Y |
| Right | **−Z** | +Y | +X |

Two consequences worth memorising. On the Top plane a positive sketch *v* is world −Z, so a point you want at world `z = 10` is sketched at `v = −10`. And a plane sitting on top of a part (say `p.sketch("Top", 8)` on an 8 mm plate) has its normal pointing *away* from the part, so a cut into the part needs `reverse: true`. `p.hole(...)` defaults to reversed for exactly this reason.

A reference plane feature is a standard plane plus an offset along its normal. Sketches can also be placed on a custom frame (`{ custom: true, origin, x, y, n }`), which is what *Sketch on a face* produces via `Kernel.planeFromFace`.

## Scripting

Every model is a feature list, and the script API is a builder over that list. *Script from model* in the console (or `Kernel.generateScript`) turns any model back into code, so the two stay interchangeable.

Scripts run with `p` (alias `part`) bound to a `Kernel.Builder`. A short part:

```js
p.name("Flange").units("mm");
p.cylinder(60, 12);                          // disc, axis +Y
p.cylinder(35, 4, { at: [0, 12, 0] });       // raised face
p.sketch("Top", 16).circle(0, 0, 25).cut("through", { reverse: true });
p.hole("Top", 47.5, 0, 11, { offset: 16 });  // one bolt hole …
p.circularPattern({ axis: "y", count: 6 });  // … patterned around Y
```

### Part methods

| Method | Notes |
| --- | --- |
| `name(s)`, `units("mm" \| "in")`, `density(kg_per_m3)`, `color(css)` | Document properties. Chainable. |
| `plane(ref, offset, name?) → id` | Reference plane. `ref` is `"Front"`, `"Top"` or `"Right"`. |
| `sketch(spec, offset?, name?) → SketchBuilder` | `spec` is a plane name, a plane feature id, `{ ref, offset }`, or a custom frame. |
| `extrude(depth, opts)` | `opts`: `cut`, `reverse`, `midplane`, `throughAll`, `depth2` (second direction), `both` (mirror the depth), `sketch` (id, defaults to the last sketch), `draft` (angle in degrees: the section shrinks by depth·tan(angle) away from the sketch plane, in both directions for mid-plane; holes widen), `draftOutward` (grow instead), `name`. |
| `cut(depth \| "through", opts)` | `extrude` with `cut: true`. |
| `revolve(angleDeg, opts)` | `opts.axis`: `"y"` (default), `"x"`, the index of a sketch line, or `{ x1, y1, x2, y2 }`; plus `reverse`, `cut`, `sketch`, `name`. |
| `revolveCut(angleDeg, opts)` | `revolve` with `cut: true`. |
| `linearPattern(opts)` | `feature` (defaults to the last solid feature), `dir` `"x"|"y"|"z"`, `reverse`, `spacing`, `count`, and optionally `dir2`, `reverse2`, `spacing2`, `count2`. Patterns of cuts stay cuts. |
| `circularPattern(opts)` | `feature`, `axis`, `center` (`[x, y, z]`), `count`, `angle` (default 360), `equal`. |
| `mirror(plane, opts)` | Mirror the last (or `opts.feature`) feature across a standard plane, or the whole body with `body: true`. `offset` shifts the plane. |
| `chamfer(d, edges, opts)` | Break the edges nearest to the given points `[[x, y, z], …]` by distance `d`. Convex edges are cut, concave edges are filled; chained neighbours join with mitred caps. `opts.chain: false` stops tangent-chain propagation (default on: edges sharing an endpoint within 28° and of the same convexity are picked up, so one point selects a whole cylinder rim). |
| `fillet(r, edges, opts)` | Same selection as `chamfer`, with a tangent arc of radius `r` (polygonal, ≥ 4 segments per 90°). |
| `sweep({ profile, path, cut, name })` | Sweep a closed sketch (`profile`, defaults to the last sketch) along `path`: either the id of a sketch of connected lines/arcs (open by design, no warning) or an array of 3D points `[[x, y, z], …]`. The profile is turned perpendicular to the first segment (pivoting about the path start, which is the end nearest the profile); corners are mitred, so the volume is exactly area × path length for a centred section. Disconnected path entities are ignored with a warning. |
| `loft(sketchIds, { cut, name })` | Ruled loft through two or more sketches, each holding exactly one closed profile, in the given order. Outlines are resampled to the same point count and matched by rotation, so a square can loft into a circle. |
| `shell(t, faces, opts)` | Hollow the body leaving walls of thickness `t`. `faces` is a list of points `[[x, y, z], …]` on the faces to remove (open); an empty list gives a closed hollow part. Faces are re-resolved against the body at rebuild time. Fails with a clear message when the part is thinner than 2·t everywhere. |
| `sheet(T, R?, K?)` | Sheet-metal parameters: thickness, inside bend radius (default `T`) and k-factor (default 0.71 for steel; use 0.64 for aluminium). |
| `baseFlange(T?, opts)` | Extrude the last sketch by the sheet thickness and mark it as the base flange. Sets `sheet(T)` if not yet set. |
| `flange(L, edges, opts)` | Edge flange on straight edges of the flat sheet face: a bend of the sheet radius plus a straight wall of length `L` measured after the bend, placed beyond the edge ("bend outside"). `opts`: `angle` (default 90), `reverse` (fold the other way), `radius` (override), `position` (`"bendOutside"` | `"outside"` | `"inside"`), `miter` (join flanges of this feature that share a corner at the corner's bisector, 45° for a square corner), `miterGap` (opening between mitred walls, split evenly, default 0), `relief` (`"none"` | `"rect"` | `"obround"`: cut a bend relief slot where a flange end runs into more sheet), `reliefWidth` (slot width along the edge, default T), `reliefDepth` (how far the slot reaches inside the edge, default T/2), `name`. |
| `hem(L, edges, { gap, reverse, name })` | A 180° flange folded back over the sheet: bend radius = `gap` / 2 (default T/2, an open hem), return length `L`. Same edge picking and placement as `flange`; unfolds with BA = π·(R + K·T). |
| `jog(height, length, edges, { angle, reverse, radius, position, name })` | Two opposite bends in one feature: the sheet steps by `height` (measured face to face on the fold side) and continues parallel to the base for `length`. The wall between the bends is solved from the height, radius and angle. Unfolds as UP then DOWN. |
| `hole(planeSpec, x, y, dia, opts)` | Sketch + cut in one call. `depth` makes it blind (default through all); `forward: true` cuts along the normal instead of against it. |
| `box(w, d, h, opts)` | Sketched on Top at `at[1]`; occupies `x ∈ [0,w]`, `y ∈ [0,h]`, `z ∈ [0,d]` from `at`, or centred in x/z with `centered: true`. `cut: true` subtracts. |
| `cylinder(r, h, opts)` | `axis` `"y"` (default), `"x"` or `"z"`; `at`; `cut`. |
| `last() → id` | Id of the most recently added feature, for `feature:` references. |

### SketchBuilder methods

`line(x1, y1, x2, y2)`, `rect(x, y, w, h)`, `centerRect(cx, cy, w, h)`, `circle(cx, cy, r)`, `polygon(cx, cy, r, n, rotDeg?)`, `slot(x1, y1, x2, y2, width)`, `arc(cx, cy, r, a0Deg, a1Deg)`, `polyline(points, closed = true)`, `point(x, y)`. All return the sketch builder. `id()` returns the sketch's feature id, `end()` returns the part, and `extrude`, `cut`, `revolve`, `revolveCut` delegate to the part with this sketch preselected.

Editing helpers on the same builder: `mirrorEntities(axis, { entities, copy })` mirrors entities (all by default) across `"x"`, `"y"`, a line entity index, or `{ x1, y1, x2, y2 }` — axis-aligned mirrors keep rectangles, arcs and regular polygons stay true entities, anything else becomes a polyline; `patternEntities({ dx, dy, count, dx2, dy2, count2, entities })` repeats entities along one or two step vectors; `trim(index, u, v)` removes the span of entity `index` around sketch point `(u, v)` between its neighbouring intersections (a circle becomes an arc, a rectangle an open polyline, a slot is split into lines and arcs first, an entity nothing crosses is deleted). The results are plain entities, so scripts regenerated from the model contain the final geometry.

`dim(index, kind, { i, off, ang, value })` places a Smart Dimension on entity `index`: kinds are `"len"`, `"dx"`, `"dy"` (lines), `"w"`, `"h"` (rectangles; `i` = edge 0 bottom, 1 right, 2 top, 3 left), `"dia"` (circles), `"r"` (arcs, polygons), `"len"`, `"w"` (slots) and `"seg"` (polylines, `i` = segment). `off` is the offset of the dimension line from the entity (linear) or the label distance from the centre (radial, with `ang` in degrees). `value` drives the entity to that size first — `p.sketch("Top").rect(0, -20, 40, 20).dim(0, "w", { value: 50 })` makes the rectangle 50 wide — and `Kernel.setDimValue` is what the value box in the UI calls: a line keeps its start point and direction, a rectangle keeps the edge opposite the one you dimensioned, an open polyline carries the rest of its chain along.

Profiles are found automatically: closed entities (rectangles, circles, polygons, slots, closed polylines) are loops, open entities (lines, arcs, open polylines) are chained end to end into loops. Loops nested inside other loops alternate between hole and island. Open chains that never close are ignored with a warning. An entity with `construction: true` is drawn but does not contribute.

### Feature JSON

`Kernel.newModel()` gives `{ name, units, density, color, features: [], nextId }`. Each feature has `id`, `type`, `name` and type-specific fields:

| type | fields |
| --- | --- |
| `sketch` | `plane` (`{ ref, offset }` \| `{ featureId }` \| custom frame), `entities: [{ t: "line" \| "rect" \| "crect" \| "circle" \| "poly" \| "slot" \| "arc" \| "polyline" \| "point", … }]`, optional `dims: [{ e, k, i, off, ang }]` (placed Smart Dimensions; ignored by the rebuild) |
| `plane` | `ref`, `offset` |
| `extrude` | `sketch`, `depth`, `end` (`"blind" \| "through" \| "mid"`), `reverse`, `cut`, `dir2`, `depth2`, `end2`, `draft` (degrees, optional), `draftOut` |
| `revolve` | `sketch`, `angle`, `axis`, `reverse`, `cut` |
| `lpattern` | `feature`, `d1`, `rev1`, `s1`, `n1`, `d2`, `rev2`, `s2`, `n2` |
| `cpattern` | `feature`, `axis`, `center`, `n`, `angle`, `equal` |
| `mirror` | `plane`, `offset`, and either `feature` or `body: true` |
| `chamfer` / `fillet` | `d` or `r`, `edges: [{ at: [x, y, z], chain }]` (edges are re-resolved against the body at rebuild time, so they survive upstream edits as long as the point still lies near an edge) |
| `flange` | `length`, `angle`, `reverse`, `radius` (`null` = sheet radius), `edges: [{ at }]`, `position`, `toward` (optional `[x, y, z]`), `miter` (boolean, default false), `miterGap` (default 0), `relief` (`"none"` \| `"rect"` \| `"obround"`, default `"none"`), `reliefWidth` / `reliefDepth` (`null` = T / T/2), `hem: true` for hems. `generateScript` emits only the non-default values. |
| `jog` | `height`, `length`, `angle`, `reverse`, `radius`, `position`, `edges: [{ at }]` |
| `sweep` | `profile` (sketch id), `path` (sketch id or `[[x, y, z], …]`), `cut` |
| `loft` | `sketches: [id, …]` (two or more, in order), `cut` |
| `shell` | `thickness`, `faces: [{ at: [x, y, z] }]` (faces to remove; may be empty) |

An `extrude` with `sheetBase: true` is the base flange; `model.sheet = { thickness, bendRadius, kFactor }` holds the sheet parameters.

Feature names auto-number per type (`Sketch1`, `Boss-Extrude1`, `Cut-Extrude1`, `Revolve1`, `LPattern1`, `CirPattern1`, `Mirror1`, `Plane1`, `Chamfer1`, `Fillet1`, `Sweep1`, `Cut-Sweep1`, `Loft1`, `Cut-Loft1`, `Shell1`, `Edge-Flange1`, `Hem1`, `Jog1`). A flange accepted from the Miter Flange PropertyManager is named `Miter-Flange1`; scripted mitred flanges keep the `Edge-Flange` name unless `name` is given.

### Kernel API (no UI needed)

```js
var model = Kernel.newModel("Part1");
Kernel.runScript(model, code);              // executes the script against model
var b = Kernel.rebuild(model, prevBuild.cache); // { body, tools, planes, errors: {id: msg}, warnings, time, cache, reused }; pass the previous cache to rebuild only from the first changed feature
var mesh = Kernel.meshFromBody(b.body);     // { positions, normals, faces: [{ normal, w, start, count, centroid, area }], triCount }
var mp = Kernel.massProps(mesh, model.density); // { volume, area, centroid, bbox: { min, max }, mass }
Kernel.exportSTL(mesh, name);               // ASCII STL text
Kernel.exportDXFSketch(sketchFeature, units);   // circles and arcs stay true entities
Kernel.exportDXFFace(mesh, faceIndex, units);   // OUTLINE / HOLES layers; round holes become CIRCLEs
Kernel.faceOutline(mesh, faceIndex);        // { loops: [[u, v], …], plane }
Kernel.bodyEdges(mesh);                     // [{ a, b, mid, dir, len, faces: [i, j], normals, convex, smooth }] — smooth = tangent (< 22°)
Kernel.resolveEdges(specs, edges, tol);     // specs [{ at, chain }] → the edges a chamfer/fillet/flange will use
Kernel.flatPattern(model, b, mesh);         // { loops (outer first, CCW), bends: [{ a, b, label, up, angle, R }], bbox, sheet }
Kernel.exportDXFFlat(flat, units);          // OUTLINE / HOLES / BEND / NOTES layers, bend labels and "T= R= K=" as TEXT
Kernel.bendAllowance(angleRad, R, T, K);    // angle · (R + K·T), the neutral-axis arc length
Kernel.flangeProfile(angleRad, R, T, L, ov); // the 2D section a flange sweeps along its edge (o across the edge, u along the fold), incl. the overlap strip o ∈ [−ov, 0]
Kernel.loopSelfCrossing(pts); Kernel.checkProfile(profile);   // first self-intersection of a closed loop | throw "crosses itself" for any crossing loop
Kernel.offsetLoop(pts, d);                  // 2D: mitred offset of a closed loop, +d = outward for CCW
Kernel.filletPolyline(pts, i, r);           // 2D: replace vertex i of a closed loop with a tangent arc
Kernel.sketchPath(sketch, plane, info);     // chain a path sketch's lines/arcs into 3D points; info.dropped = unconnected entities
Kernel.dimGeometry(entity, dim);            // { type: 'linear', P, Q, dir, value } | { type: 'radial', C, r, value, prefix } | null
Kernel.dimValue(entity, dim); Kernel.setDimValue(entity, dim, v);   // read / drive a Smart Dimension (throws on v <= 0)
Kernel.dimForEntity(entity, [u, v]);        // which dimension a click at (u, v) means: { k, i }
Kernel.buildSweep(f, model, ctx); Kernel.buildLoft(f, model, ctx);   // tool bodies (also reached through buildTool)
Kernel.resolveFaces(specs, mesh, tol);      // [{ at }] → mesh face indices (plane distance + outline containment)
Kernel.buildShell(f, { body });             // { body, inner, removed } — the shelled body and the cavity solid
Kernel.generateScript(model);               // model → script text
```

A feature that fails to build is recorded in `errors` and the rest of the tree still builds. Errors are meant to be shown to people: "Sketch has no closed profile.", "Nothing to cut yet.", "Revolve profile crosses the axis.", "Pattern needs at least 2 instances." Non-fatal problems land in `warnings` by feature id, for example an open contour in a sketch or a cut whose tool never touched the body ("Cut removed no material. Try Reverse direction.").

Degenerate geometry is diagnosed before it reaches the CSG kernel:

- A closed contour with zero area (a rectangle of zero width, a polyline whose points are collinear) is dropped with the warning "1 zero-area contour was ignored." on the feature; if nothing is left, the feature errors with the usual "no closed profile".
- A contour that crosses itself (a bow-tie polyline, a rectangle whose edges cross an open chain) errors with "Sketch profile crosses itself near (x, y)." and the loop stays visible in the sketch so it can be trimmed. `Kernel.loopSelfCrossing(pts)` returns the first crossing point of a closed loop, or `null`.
- A non-finite number where a dimension is expected (`extrude(NaN)`, `revolve(undefined + 1)`, a sweep path with a missing coordinate) errors with "… must be a number." instead of building an empty or infinite solid: extrude depth and draft, revolve angle, flange length and angle, jog height / length / angle, sweep path coordinates.

### Sheet metal and flat patterns

A sheet-metal part starts with `sheet(T, R, K)` and a `baseFlange`, then `flange` calls on edges of the flat face. `flatPattern` takes the largest face parallel to the base sketch plane, unfolds each flange into a rectangle of length *bend allowance + wall* spliced into the outline, and reports bend lines at the middle of each allowance with `UP`/`DOWN` labels. The flat DXF follows the shop convention: outline on `OUTLINE`, holes on `HOLES` (round holes become `CIRCLE`s), bend lines on `BEND`, labels and the sheet parameters on `NOTES`.

```js
p.sheet(2, 2, 0.71);                                  // 2 mm steel, R2, k = 0.71
p.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);
p.hole("Top", 50, -30, 10, { offset: 2 });
p.flange(20, [[0, 2, 30]]);                           // up along the x = 0 edge
p.flange(15, [[50, 2, 0]], { reverse: true });        // down along the z = 0 edge
// flat pattern: (100 + 20 + BA) × (60 + 15 + BA) with BA = π/2 · (2 + 0.71·2) ≈ 5.372
```

Unfolding is recursive: each flange contributes a bend strip and then its wall face is mapped into the flat with its real outline, so holes cut through a wall and flanges attached to a wall (a Z or hat section) all reach the blank. Flanges accept `position: "bendOutside"` (default, the bend sits beyond the edge), `"outside"` (Material Outside: the wall's inner face at the edge) or `"inside"` (Material Inside: the outer face flush with the edge); the last two trim the base back by R or R + T so the envelope keeps the base dimensions.

**Mitred corners.** `flange(L, edges, { miter: true })` (the *Miter Flange* ribbon button presets it) joins the walls of one feature wherever two selected edges share a corner: each bend + wall is extended past the corner and clipped by the bisector plane through the shared vertex (45° for a square corner), so the corner is closed instead of leaving a square notch. `miterGap` opens the joint by that distance, measured normal to the bisector and split evenly between the two walls. Edges that are collinear or fold in opposite directions are not mitred. A mitred square corner adds exactly twice the first moment of the flange section about the edge line to the volume, which is what the kernel tests check.

**Bend reliefs.** `relief: "rect"` or `"obround"` cuts a slot from the base before the flange is added, at every flange end where the sheet continues beyond the end (a wall that stops part-way along a plate edge, or an edge that meets a tab or a wider region). The slot is `reliefWidth` wide along the edge (default T), starts `reliefDepth` inside the edge (default T/2) and runs out past the bend zone (to R + T + `reliefDepth`), through the full thickness; `"obround"` rounds the inner end. Ends at convex sheet corners and ends shared with another edge of the same feature (mitred or collinear) get no relief. The relief appears in the flat pattern as a slot beside the bend strip.

```js
p.sheet(2, 2, 0.71);
p.sketch("Top").polyline([[0, 0], [100, 0], [100, 30], [60, 30], [60, 60], [0, 60]], true).end().baseFlange(2); // L plate
p.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true });                 // two walls joined at the (0, 0) corner
p.flange(10, [[60, 2, -45]], { relief: "obround", reliefWidth: 2 });    // wall on the notch edge, relief where it meets the wider plate
```

## Automation from the browser console

`ui-app.js` exposes `window.anvil` for driving the running app:

| Call | Effect |
| --- | --- |
| `anvil.run(code)` / `anvil.append(code)` | Replace or extend the model from a script. Throws with the first feature error. Returns a summary. |
| `anvil.model()` / `anvil.load(json)` | Get or set the feature JSON. |
| `anvil.script()` | Script regenerated from the model. |
| `anvil.stl()`, `anvil.dxfFace(i)`, `anvil.dxfSketch(id)` | Export text. |
| `anvil.mass()`, `anvil.faces()`, `anvil.features()` | Mass properties; face list with index, normal, area, centroid; feature list with errors. |
| `anvil.select(i)`, `anvil.view(name)`, `anvil.fit()` | Select a face, set a standard view, zoom to fit. |
| `anvil.png()` | Data URL of the current viewport. |
| `anvil.summary()` | `{ name, features, errors, volume, bbox, faces, rebuildMs }`. |
| `anvil.examples` | The Design Library entries. |

## Exports

- **STL** (ASCII) of the whole body.
- **DXF** of a sketch (LINE, CIRCLE, ARC, POLYLINE entities), of a selected planar face, or of the sheet-metal flat pattern, with the shop's `OUTLINE` / `HOLES` / `BEND` / `NOTES` layer table and `$INSUNITS` set from the document units.
- **Script** (`*.anvil.js`) and **JSON** (`*.anvil.json`) of the model. Both reopen through *File ▸ Open*.
- **PNG** screenshot of the viewport.

Downloads are blocked inside some sandboxes; every export dialog also offers *Copy*.

## Tests

`tests/kernel-tests.html` builds parts through the script API and checks them against known volumes, bounding boxes, face counts, profile nesting, edge extraction, chamfers and fillets, sheet-metal flanges and flat patterns, export contents, error messages and script round-trips, then builds every entry in `examples/examples.js` and round-trips each one through `generateScript`. Run it after touching `csg.js` or `kernel.js`. Circles are polygonal in the kernel, so tests compare against the polygonal area (`n/2 · r² · sin(2π/n)` with `n = clamp(round(8√r), 16, 72)`) rather than `πr²`.

`tests/bench.html` times every example and a set of stress parts and reports medians; `tests/BENCHMARKS.md` keeps dated baselines so performance work in Phase 4 has something to compare against.

`tests/ui-smoke.html` is the app-level regression: it loads `index.html` in a frame and walks the main workflows through the same functions the ribbon and PropertyManager call (`UI.cmdSketch`, `UI.pmOK`, `UI.deleteFeature`, …), asserting volumes after each step and failing on any uncaught error or `console.error` inside the app. Run it after touching any `ui-*.js` file. Results are also exposed as `window.__anvilSmoke`.

## Known limitations

- No draft, rib or wrap yet (see `ROADMAP.md`). Chamfers and fillets work on straight and polygonal edges between planar faces; a fillet is a polygonal arc. Sweeps use mitred polyline paths (arcs are polygonal), lofts are ruled surfaces between resampled outlines, and Shell is exact for planar faces; on polygonal round faces the cavity is the polygonal offset.
- Circles and arcs are polygons; volumes of round parts are up to ~2 % under the analytic value.
- CSG is BSP based: a few hundred features is fine, thousands of polygons per feature starts to take hundreds of milliseconds per rebuild.
- Tools that only touch the body along a face can leave hairline slivers.
- Mitres join flanges of one feature only, at corners where both fold the same way; a flange meeting another flange at a concave (inside) corner is not closed or relieved automatically. Reliefs are straight slots normal to the edge; there is no tear or bend-line relief.
