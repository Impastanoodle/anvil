# Anvil

Anvil is a parametric solid modeler that runs entirely in the browser. It has a SolidWorks-style workspace (CommandManager ribbon, FeatureManager tree, PropertyManager, task pane, heads-up view toolbar) on top of a small CSG kernel, and every model is also a script: you can build parts by clicking, by typing a script in the console, or by driving `window.anvil` from automation.

There is no build step and no dependency besides three.js r128 from cdnjs. Open `index.html` over HTTP (see *Running* below).

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page skeleton. Loads the scripts in dependency order. |
| `csg.js` | BSP-tree constructive solid geometry (union, subtract, intersect, transform, signed volume). Global `CSG`. |
| `kernel.js` | Modeling kernel: planes, sketch entities, profiles, features, rebuild, meshing, mass properties, STL/DXF export, the script `Builder`. Global `Kernel`. |
| `assembly.js` | Assembly documents: components, mates (coincident, concentric), the mate solver, assembly scripts (`a.insert` / `a.mate`), mass properties. Global `Assembly`. See *Assemblies*. |
| `worker.js` | Web Worker entry: `importScripts('csg.js', 'kernel.js')`, rebuilds a model off the main thread and posts the packed build back (see *Background rebuilds*). |
| `icons.js` | Inline SVG icon set. Global `Icons`. |
| `style.css` | The whole UI stylesheet. |
| `ui-core.js` | App state, three.js scene, camera, picking, highlights. Creates the shared `UI` namespace. |
| `ui-sketch.js` | Viewport mouse handling, sketch mode, the 2D sketch tools. |
| `ui-commands.js` | PropertyManager rendering and every feature command. |
| `ui-panels.js` | Ribbon, menu bar, feature tree, heads-up toolbar, status bar, modals. |
| `ui-app.js` | Task pane, script console, files and exports, shortcuts, `window.anvil`, boot. |
| `drawing.js`, `drawing.css` | 2D drawings: projection with exact hidden-line removal, sheet and title block, model dimensions, SVG / DXF / PDF writers (global `Drawing`, usable without the UI), and the drawing document UI (see *Drawings*). |
| `examples/examples.js` | Sample parts, and assemblies marked `kind: "assembly"`, as scripts (`AnvilExamples`). Picked up by the Design Library when loaded. |
| `tests/kernel-tests.html` | Headless kernel test page (no three.js needed). |
| `tests/bench.html`, `tests/BENCHMARKS.md` | Rebuild timing page (median of N runs per example plus stress parts) and the recorded baselines. |
| `tests/ui-smoke.html` | Loads the app in a frame and drives it through `window.anvil` and the `UI.cmd*` functions: examples, PMs, undo/redo, exports, modals, sheet metal, multi-body parts, equations, configurations, assemblies. |
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

- **Menu bar**: File (new, open, save, exports, screenshot), Edit (undo, redo, delete, rebuild), View (standard views, display styles, planes, origins, section view, *Theme ▸ Light / Dark*), Insert (boss, cut, sweep, loft, hole wizard, fillet, chamfer, shell, patterns, mirror, sketch, reference plane, base flange), Tools (script console, measure, mass properties, units), Window, Help.
- **CommandManager ribbon** with Features (boss, cut, revolve, hole wizard, sweep, loft, patterns, mirror, chamfer, fillet, shell, reference plane), Sketch (line, rectangles, circle, arc, polygon, slot, convert entities, offset entities, sketch fillet, trim, mirror entities, linear sketch pattern), Evaluate (measure, mass properties, section view, face to DXF) and Sheet Metal (base flange, edge flange, miter flange, hem, jog, flatten, flat to DXF) tabs. Every ribbon button has a tooltip with its shortcut and a one-line description.
- **FeatureManager tree** on the left. Click selects a feature, double-click edits it, F2 renames, Delete removes it with its dependents. Sketches consumed by a feature are hidden unless *View ▸ All Sketches* is on.
- **PropertyManager** replaces the tree while a command is open. Enter accepts, Esc cancels.
- **Viewport**: orthographic. Middle-drag orbits, Ctrl+middle-drag pans, wheel zooms at the cursor. Hovering a face highlights it; clicking selects it. The triad in the corner shows the current orientation.
- **Smart Dimension** (Sketch tab, or `D` in a sketch): click an entity, then click where the dimension should sit, exactly as in SolidWorks — a line gives its length, or its horizontal / vertical distance when you place the dimension above or beside a slanted line; a rectangle edge gives that side; circles give Ø, arcs and polygons R, slots length and width. The value box opens right after placement: type a number and press Enter to drive the entity. Placed dimensions are stored on the sketch, drawn with extension lines and arrows, and come back in the generated script. Click any value to change it; a selected dimension is removed with Delete. *View ▸ Sketch Dimensions* (on by default) also shows the driven values of every entity that has no placed dimension.
- **Heads-up toolbar** above the viewport: zoom to fit, zoom to area, previous view, view orientation, display style, section view.
- **Task pane** on the right: Home, Design Library (example parts), Files (named saves in localStorage), Views, Appearance, Properties (name, units, material, sheet-metal parameters), and the **Script** console.
- **Status bar** shows the last message, cursor coordinates in sketch mode, and the rebuild time.
- **Theme**: *View ▸ Theme ▸ Dark* switches the whole workspace, viewport included, to a dark scheme; *Light* switches back. The choice is kept in `localStorage` under `anvil.theme` and applied at boot. `UI.setTheme("dark" | "light")` and `UI.theme()` do the same from code; `UI.viewportTheme` reports what the 3D view is currently using.

Keyboard: Ctrl+1 … Ctrl+7 standard views, Ctrl+8 normal-to, F fit, S start or exit a sketch, L/R/C/A/P/T sketch tools, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+B rebuild, Ctrl+S save. *Help ▸ Keyboard shortcuts* lists everything.

## Coordinate system and sketch planes

World axes are right-handed with +Y up. The three standard sketch planes use the SolidWorks frames, where a sketch point `(u, v)` maps to world space as `origin + u·x + v·y` and extrusions go along `n`:

| Plane | sketch x | sketch y | normal n |
| --- | --- | --- | --- |
| Front | +X | +Y | +Z |
| Top | +X | **−Z** | +Y |
| Right | **−Z** | +Y | +X |

Two consequences worth memorising. On the Top plane a positive sketch *v* is world −Z, so a point you want at world `z = 10` is sketched at `v = −10`. And a plane sitting on top of a part (say `p.sketch("Top", 8)` on an 8 mm plate) has its normal pointing *away* from the part, so a cut into the part needs `reverse: true`. `p.hole(...)` defaults to reversed for exactly this reason, and the Cut-Extrude PropertyManager presets *Reverse direction* for a new cut from `Kernel.cutDirectionHint` (see *Kernel API*): a sketch on the top face of a part opens with the box checked, a sketch on the bottom face with it clear, so the default cut goes into the material either way. Scripts are not affected; `cut(...)` still goes along +n unless `reverse: true`.

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
| `extrude(depth, opts)` | `opts`: `cut`, `reverse`, `midplane`, `throughAll`, `depth2` (second direction), `both` (mirror the depth), `sketch` (id, defaults to the last sketch), `draft` (angle in degrees: the section shrinks by depth·tan(angle) away from the sketch plane, in both directions for mid-plane; holes widen), `draftOutward` (grow instead), `normalCut` (sheet-metal parts only: the cut is made square to the sheet, see *Normal cut* below), `merge` (`false` keeps a boss as a separate solid body), `bodies` (`[i, …]`: the bodies a cut acts on; see *Multi-body parts*), `name`. |
| `cut(depth \| "through", opts)` | `extrude` with `cut: true`. `p.cut("through", { reverse: true, normalCut: true })` is the usual sheet-metal window; `p.cut("through", { bodies: [1] })` cuts body 1 only. |
| `revolve(angleDeg, opts)` | `opts.axis`: `"y"` (default), `"x"`, the index of a sketch line, or `{ x1, y1, x2, y2 }`; plus `reverse`, `cut`, `sketch`, `merge`, `bodies` (cuts), `name`. |
| `revolveCut(angleDeg, opts)` | `revolve` with `cut: true`. |
| `linearPattern(opts)` | `feature` (defaults to the last solid feature), `dir` `"x"|"y"|"z"`, `reverse`, `spacing`, `count`, and optionally `dir2`, `reverse2`, `spacing2`, `count2`; `merge: false` keeps the copies as a new body. Patterns of cuts stay cuts. |
| `circularPattern(opts)` | `feature`, `axis`, `center` (`[x, y, z]`), `count`, `angle` (default 360), `equal`, `merge`. |
| `mirror(plane, opts)` | Mirror the last (or `opts.feature`) feature across a standard plane, or the whole part with `body: true`. `offset` shifts the plane; `merge: false` keeps the mirrored copy as its own body. |
| `chamfer(d, edges, opts)` | Break the edges nearest to the given points `[[x, y, z], …]` by distance `d`. Convex edges are cut, concave edges are filled; chained neighbours join with mitred caps. `opts.chain: false` stops tangent-chain propagation (default on: edges sharing an endpoint within 28° and of the same convexity are picked up, so one point selects a whole cylinder rim). |
| `fillet(r, edges, opts)` | Same selection as `chamfer`, with a tangent arc of radius `r` (polygonal, ≥ 4 segments per 90°). |
| `sweep({ profile, path, cut, merge, bodies, name })` | Sweep a closed sketch (`profile`, defaults to the last sketch) along `path`: either the id of a sketch of connected lines/arcs (open by design, no warning) or an array of 3D points `[[x, y, z], …]`. The profile is turned perpendicular to the first segment (pivoting about the path start, which is the end nearest the profile); corners are mitred, so the volume is exactly area × path length for a centred section. Disconnected path entities are ignored with a warning. |
| `loft(sketchIds, { cut, merge, bodies, name })` | Ruled loft through two or more sketches, each holding exactly one closed profile, in the given order. Outlines are resampled to the same point count and matched by rotation, so a square can loft into a circle. |
| `shell(t, faces, opts)` | Hollow the body leaving walls of thickness `t`. `faces` is a list of points `[[x, y, z], …]` on the faces to remove (open); an empty list gives a closed hollow part. Faces are re-resolved against the body at rebuild time. On a multi-body part the body nearest the first point is shelled (body 0 with no faces). Fails with a clear message when the part is thinner than 2·t everywhere. |
| `sheet(T, R?, K?)` | Sheet-metal parameters: thickness, inside bend radius (default `T`) and k-factor (default 0.71 for steel; use 0.64 for aluminium). |
| `baseFlange(T?, opts)` | Extrude the last sketch by the sheet thickness and mark it as the base flange. Sets `sheet(T)` if not yet set. |
| `flange(L, edges, opts)` | Edge flange on straight edges of the flat sheet face: a bend of the sheet radius plus a straight wall of length `L` measured after the bend, placed beyond the edge ("bend outside"). `opts`: `angle` (default 90), `reverse` (fold the other way), `radius` (override), `position` (`"bendOutside"` | `"outside"` | `"inside"`), `miter` (join flanges of this feature that share a corner at the corner's bisector, 45° for a square corner), `miterGap` (opening between mitred walls, split evenly, default 0), `relief` (`"none"` | `"rect"` | `"obround"`: cut a bend relief slot where a flange end runs into more sheet), `reliefWidth` (slot width along the edge, default T), `reliefDepth` (how far the slot reaches inside the edge, default T/2), `name`. |
| `hem(L, edges, { gap, reverse, name })` | A 180° flange folded back over the sheet: bend radius = `gap` / 2 (default T/2, an open hem), return length `L`. Same edge picking and placement as `flange`; unfolds with BA = π·(R + K·T). |
| `jog(height, length, edges, { angle, reverse, radius, position, name })` | Two opposite bends in one feature: the sheet steps by `height` (measured face to face on the fold side) and continues parallel to the base for `length`. The wall between the bends is solved from the height, radius and angle. Unfolds as UP then DOWN. |
| `hole(planeSpec, x, y, dia, opts)` | Sketch + cut in one call. `depth` makes it blind (default through all); `forward: true` cuts along the normal instead of against it; `bodies` limits it to those bodies. |
| `box(w, d, h, opts)` | Sketched on Top at `at[1]`; occupies `x ∈ [0,w]`, `y ∈ [0,h]`, `z ∈ [0,d]` from `at`, or centred in x/z with `centered: true`. `cut: true` subtracts (`bodies` scopes it); `merge: false` keeps it as a separate body. |
| `cylinder(r, h, opts)` | `axis` `"y"` (default), `"x"` or `"z"`; `at`; `cut`; `merge`; `bodies`. |
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
| `extrude` | `sketch`, `depth`, `end` (`"blind" \| "through" \| "mid"`), `reverse`, `cut`, `dir2`, `depth2`, `end2`, `draft` (degrees, optional), `draftOut`, `normalCut` (boolean, cuts on sheet-metal parts; `generateScript` emits `normalCut: true` only when set), `merge` (boolean, default true; `false` on a boss keeps it a separate body), `bodies` (cuts only: the indices of the bodies to cut, absent = all; see *Multi-body parts*) |
| `revolve` | `sketch`, `angle`, `axis`, `reverse`, `cut`, `merge`, `bodies` |
| `lpattern` | `feature`, `d1`, `rev1`, `s1`, `n1`, `d2`, `rev2`, `s2`, `n2`, `merge`, `bodies` |
| `cpattern` | `feature`, `axis`, `center`, `n`, `angle`, `equal`, `merge`, `bodies` |
| `mirror` | `plane`, `offset`, and either `feature` or `body: true`; `merge`, `bodies` |
| `chamfer` / `fillet` | `d` or `r`, `edges: [{ at: [x, y, z], chain }]` (edges are re-resolved against the body at rebuild time, so they survive upstream edits as long as the point still lies near an edge) |
| `flange` | `length`, `angle`, `reverse`, `radius` (`null` = sheet radius), `edges: [{ at }]`, `position`, `toward` (optional `[x, y, z]`), `miter` (boolean, default false), `miterGap` (default 0), `relief` (`"none"` \| `"rect"` \| `"obround"`, default `"none"`), `reliefWidth` / `reliefDepth` (`null` = T / T/2), `hem: true` for hems. `generateScript` emits only the non-default values. |
| `jog` | `height`, `length`, `angle`, `reverse`, `radius`, `position`, `edges: [{ at }]` |
| `sweep` | `profile` (sketch id), `path` (sketch id or `[[x, y, z], …]`), `cut`, `merge`, `bodies` |
| `loft` | `sketches: [id, …]` (two or more, in order), `cut`, `merge`, `bodies` |
| `shell` | `thickness`, `faces: [{ at: [x, y, z] }]` (faces to remove; may be empty) |

An `extrude` with `sheetBase: true` is the base flange; `model.sheet = { thickness, bendRadius, kFactor }` holds the sheet parameters. `merge` and `bodies` are written only when set (`merge: false`, a non-empty `bodies` list), and `generateScript` emits them only then; `bodies` indices refer to the body list as it stands just before that feature.

Feature names auto-number per type (`Sketch1`, `Boss-Extrude1`, `Cut-Extrude1`, `Revolve1`, `LPattern1`, `CirPattern1`, `Mirror1`, `Plane1`, `Chamfer1`, `Fillet1`, `Sweep1`, `Cut-Sweep1`, `Loft1`, `Cut-Loft1`, `Shell1`, `Edge-Flange1`, `Hem1`, `Jog1`). A flange accepted from the Miter Flange PropertyManager is named `Miter-Flange1`; scripted mitred flanges keep the `Edge-Flange` name unless `name` is given.

### Kernel API (no UI needed)

```js
var model = Kernel.newModel("Part1");
Kernel.runScript(model, code);              // executes the script against model
var b = Kernel.rebuild(model, prevBuild.cache); // { body, bodies, bodyFeatures, tools, planes, errors: {id: msg}, warnings, time, cache, reused }; pass the previous cache to rebuild only from the first changed feature
                                            // bodies: one CSG per solid body in creation order; bodyFeatures: the id of the feature that started each body; body = combineBodies(bodies)
var mesh = Kernel.meshFromBody(b.body);     // { positions, normals, faces: [{ normal, w, start, count, centroid, area, body }], triCount } — faces are grouped by plane and body; face.body is the body index
Kernel.combineBodies(bodies);               // one solid of every body's polygons (the body itself for one, null for none); every polygon gets polygon.body = its index
Kernel.bodyInfo(b, model);                  // [{ index, featureId, name, volume }] — name is the creating feature's name (Body<n> if it is gone)
Kernel.bodyNearPoint(bodies, [x, y, z]);    // index of the body with the vertex nearest the point (−1 for none): how picked features find their body
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
Kernel.normalCutTool(tool, body, model, dir); // the Normal-cut replacement for a cut tool: the outlines of the sheet faces it enters (n·dir < 0), re-extruded straight through the thickness; rebuild applies it to cuts with normalCut on a part that has model.sheet
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
Kernel.packBuild(b); Kernel.unpackBuild(obj);   // rebuild result ↔ structured-clone-safe object of typed arrays (unpacked builds have cache: null and carry profiles); the separate bodies and bodyFeatures travel, and unpackBuild recombines body with combineBodies so the face tags survive the worker; a packed build with only a body (no bodies list) unpacks to one body
Kernel.applyProfiles(model, profiles);      // put the sketch profiles computed elsewhere (the worker) back on the model's sketch features
Kernel.cacheFromBuild(model, build);        // { steps } for Kernel.rebuild from a build that came back from the worker: one step per feature (key, tool, plane, flange, profile, error, warning), the body only on the last step, `partial: true` on the others — an unchanged model reuses every feature, an appended feature reuses the previous count, a change in the middle reuses nothing
Kernel.cutDirectionHint(model, sketchId, body); // true = a new cut on that sketch should be reversed to go into the body, false = forward already goes into it, null = undetermined (no body, unknown sketch, the probe along the sketch normal misses the body, or the sketch plane lies inside the material). Never throws.
csg.pack(); CSG.unpack(obj); CSG.packTransferables(obj);   // one solid ↔ typed arrays (exact volume, same polygon order), and its ArrayBuffers for postMessage transfer
csg.getBounds();                            // { min: [x, y, z], max: [x, y, z] } of the solid's vertices
```

**Boolean early-out.** Before a boolean clips anything, `csg.js` compares the two operands' bounding boxes (`getBounds`). Fully disjoint operands short-circuit: a union is the two polygon lists concatenated, a subtract returns the body untouched, an intersect is empty. Otherwise each polygon whose own bounding box does not overlap the other operand's box skips the BSP clipping: it is kept as it is for a union and for the body side of a subtract, and dropped for the tool side of a subtract and for both sides of an intersect. Only the polygons near the other operand go through the tree, so a small cut or boss on a large part costs about what the small feature costs. The result is identical to the full clip (the `csg early-out` kernel tests pin volumes, centroids and polygon counts, and every Design Library part's volume, before and after), and `tests/bench.html` prints the sum of the per-part medians as one before/after number.

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

**Mitred corners.** `flange(L, edges, { miter: true })` (the *Miter Flange* ribbon button presets it) joins the walls of one feature wherever two selected edges share a corner: each bend + wall is extended past the corner and clipped by the bisector plane through the shared vertex (45° for a square corner), so the corner is closed instead of leaving a square notch. `miterGap` opens the joint by that distance, measured normal to the bisector and split evenly between the two walls. Edges that are collinear or fold in opposite directions are not mitred. A mitred square corner adds exactly twice the first moment of the flange section about the edge line to the volume, which is what the kernel tests check. In the flat pattern the bend strip of a mitred flange ends on the mitre line: its end edge at the shared corner runs straight from the base corner to the wall's extended corner, so the blank has no step there (the base corner stays a vertex of the outline and the old strip corners at *BA* from it are gone).

**Normal cut.** A cut sketched on a plane that is not parallel to the sheet (a face of another wall, a tilted reference plane) would normally leave an oblique window whose walls follow the sketch direction. With `normalCut: true` (the *Normal cut* checkbox in the Cut-Extrude PropertyManager's *Sheet Metal* group, on by default for a new cut on a sheet-metal part) the kernel intersects the plain tool with the body, takes the outlines of the sheet faces the tool enters through, and re-extrudes them straight through the thickness, so the window has walls square to the sheet and the same size on both faces — what a laser or punch would cut in the flat. A blind normal cut always goes through the sheet. When the sketch is parallel to the sheet the result is the plain cut; when the tool crosses no sheet face at all the plain tool is used and the feature gets the warning *Normal cut: the cut does not cross a sheet face; a plain cut was made.* The option is ignored on parts without sheet parameters.

```js
p.sheet(2, 2, 0.71);
p.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);
p.flange(30, [[100, 2, 30]]);                      // wall at x in [102,104]
// a 45° plane outside the wall: the 12 × 8 sketch lands as a 12 × 11.3 window with square walls
p.sketch({ custom: true, origin: [115, 3, 30], x: [0, 0, 1], y: [-0.7071, -0.7071, 0], n: [0.7071, -0.7071, 0] }, 0)
  .rect(-6, -4, 12, 8).cut("through", { reverse: true, normalCut: true });
```

**Bend reliefs.** `relief: "rect"` or `"obround"` cuts a slot from the base before the flange is added, at every flange end where the sheet continues beyond the end (a wall that stops part-way along a plate edge, or an edge that meets a tab or a wider region). The slot is `reliefWidth` wide along the edge (default T), starts `reliefDepth` inside the edge (default T/2) and runs out past the bend zone (to R + T + `reliefDepth`), through the full thickness; `"obround"` rounds the inner end. Ends at convex sheet corners and ends shared with another edge of the same feature (mitred or collinear) get no relief. The relief appears in the flat pattern as a slot beside the bend strip.

```js
p.sheet(2, 2, 0.71);
p.sketch("Top").polyline([[0, 0], [100, 0], [100, 30], [60, 30], [60, 60], [0, 60]], true).end().baseFlange(2); // L plate
p.flange(20, [[0, 2, 30], [50, 2, 0]], { miter: true });                 // two walls joined at the (0, 0) corner
p.flange(10, [[60, 2, -45]], { relief: "obround", reliefWidth: 2 });    // wall on the notch edge, relief where it meets the wider plate
```

## Multi-body parts

A part is a list of separate solid bodies, as in SolidWorks. Most parts have one; a second appears when a boss is made with *Merge result* off, or when a boss lands clear of everything already there.

- **Merge rule.** A boss (extrude, revolve, sweep, loft, pattern, mirror) unions with every existing body whose bounding box its own overlaps or touches; when it touches several they collapse into the first one's slot. A boss that touches nothing starts a new body. `merge: false` (the *Merge result* checkbox unchecked) always starts a new body, even where it overlaps another.
- **Feature scope.** A cut subtracts from every body unless it carries `bodies: [i, …]`, the *Feature Scope* group of the Cut PropertyManager (*All bodies* / *Selected bodies* with one checkbox per body, shown when the part has two or more bodies). A body a cut empties is removed from the list. The warning *Cut removed no material* appears only when no body in the scope changed.
- **Picked features.** Shell, fillet, chamfer, edge flange, hem and jog act on the body nearest their first pick point (`edges[0].at` / `faces[0].at`; a shell with no faces takes body 0). `mirror` with `body: true` mirrors the whole part and then applies the merge rule.
- **Solid Bodies folder.** The FeatureManager's *Solid Bodies(n)* folder holds one row per body, named after the feature that created it (`Boss-Extrude1`, `Mirror1`, …); it opens by default when there is more than one. Clicking a row selects the body (`UI.selectBody(i)`, `App.sel = { kind: 'body', index }`), and a body can be hidden from the viewport with `UI.setBodyHidden(i, hidden)` / `UI.isBodyHidden(i)` (`App.hiddenBodies`) without changing the mesh, the mass properties or the exports. *Mass Properties* lists each body's volume when there are two or more.
- **Automation.** `anvil.bodies()` returns `bodyInfo` with volumes to 3 decimals, `anvil.selectBody(i)` selects one, and `anvil.summary().bodies` is the count. The *Two-body clamp* example in the Design Library shows all of it.

```js
p.box(60, 30, 10);                                   // base: one body
p.box(60, 30, 6, { at: [0, 15, 0], merge: false }); // a cap 5 mm above it, kept as body 1
p.hole("Top", 10, -15, 6, { offset: 21, bodies: [1] }); // through the cap only; the base below stays solid
p.fillet(3, [[5, 0, 0]]);                            // picked near a base corner: rounds the base only
```

## Equations

Global variables, as in SolidWorks' *Equations, Global Variables, and Dimensions*: a part keeps an ordered list `model.equations = [{ name: "T", expr: "10" }, { name: "W", expr: "T*2" }]`. Each expression may use the variables above it; the list is evaluated top to bottom on every rebuild.

- **"=" fields.** Any numeric field of a feature (extrude `depth` / `depth2`, `angle`, `draft`, pattern spacing and count, fillet `r`, chamfer `d`, shell `thickness`, flange `length`, plane and sketch-plane `offset`, sheet parameters, nested fields such as `dir2.depth`) may hold a string that starts with `=` instead of a number: `{ type: "extrude", depth: "=W+1" }`. The model keeps the text; rebuild evaluates a resolved copy. Sketch geometry and references (`entities`, `profile`, `sketch`, `edges`, `faces`, `bodies`, `feature`, `id`, `name`) are never expressions: sketch sizes are plain numbers.
- **Grammar.** Numbers (`1.5`, `.5`, `2e3`), `+ - * /`, `^` (or `**`, right-associative: `2^3^2` is 512; unary minus binds looser, so `-2^2` is −4), parentheses, variables, the constants `pi` and `e` (a variable of that name wins), and functions: `sin cos tan asin acos atan sinh cosh tanh` (radians), `sind cosd tand asind acosd atand` (degrees), `deg(x)`, `rad(x)`, `sqrt cbrt abs floor ceil round trunc sign exp log log10 log2`, `atan2(y, x)`, `pow(a, b)`, `min(…)`, `max(…)`, `hypot(…)`. No `eval`: a hand-written parser.
- **Errors.** An unknown name, a wrong argument count, a stray character, division by zero or a non-finite result is an error. A failing variable (or a duplicate or invalid name) is left out of the variables and reported in `build.equationErrors` (`{ name: message }`); a feature whose field fails gets the error `"<field>: <message>"` (`"depth: Unknown variable \"Q\""`) and leaves the body alone. Rebuild never throws for either.
- **Rebuild cache.** Features are keyed by their resolved values, so changing `T` rebuilds only the features whose numbers change; editing an equation's text without changing its value reuses everything.
- **Script.** `p.equations({ T: 10, W: "=T*2" })` (object form; a leading `=` is dropped) or `p.equations([{ name: "T", expr: "10" }, …])` (array form, kept as written; what `generateScript` emits) replaces the list; numeric arguments of script calls accept `"=…"` strings: `.extrude("=W")`, `p.sketch("Front", "=H")`, `p.linearPattern({ spacing: "=L/4", count: "=N" })`. Sizes that become sketch geometry (`p.box` width and depth, `p.cylinder` radius, `p.hole` diameter) are evaluated when the script runs.
- **Kernel API.** `Kernel.isExpression(v)`, `Kernel.evalExpression(expr, vars)`, `Kernel.resolveEquations(model)` → `{ vars, errors }`, `Kernel.resolveFeature(f, vars)`, `Kernel.resolvedModel(model)` → `{ model, vars, errors, featureErrors, sheetError }`, `Kernel.hasExpressions(f)`; a rebuild result carries `equations` (the values) and `equationErrors`, and both survive `packBuild` / `unpackBuild`.
- **UI.** *Tools ▸ Equations…* (also a double-click on the FeatureManager's *Equations* folder) opens a table of name / value-or-equation / evaluates-to rows with add, move up / down and delete; each keystroke re-evaluates the list, rows in error turn red and OK is refused until they are fixed; OK is one undo step. PropertyManager number fields accept `=`: typing `=W+1` turns the box into an equation, the hint beside it shows the value (red with the message when it fails, and OK is disabled). The sketch *Modify* box accepts `=T*3` or plain arithmetic and stores the resulting number. Equation errors show in the status bar as *Equation W: …*.
- **Automation.** `anvil.equations()` returns a copy of the list; `anvil.equations({ T: 12 })` or `anvil.equations([...])` replaces it and returns a Promise of the summary; `anvil.summary().equations` and `.equationErrors` hold the evaluated values and errors. `UI.showEquations()`, `UI.pmSetField(key, text)`, `UI.pmExpressions()`, `UI.evalInput(text)`, `UI.equationVars()` and `UI.editDim(i, text)` drive the same paths from code. The *Parametric plate* example in the Design Library uses all of it.

```js
p.equations({ L: 120, W: 80, T: 8, E: 15, D: 8 });
p.box("=L", "=W", "=T");                                  // thickness stays live
p.hole("Top", 15, -15, "=D", { offset: "=T" });
p.linearPattern({ dir: "x", spacing: "=L - 2*E", count: 2, dir2: "z", spacing2: "=W - 2*E", count2: 2 });
```

## Configurations

Named sets of values for the global variables, as in SolidWorks' *ConfigurationManager*: one part, several sizes. A configuration overrides the expressions of the variables it names; the others keep their base expression from `model.equations`.

```js
model.configurations = [{ name: "Small", values: { T: "6", N: "2" } }, { name: "Large", values: { T: "12", D: "T-4" } }];
model.activeConfiguration = "Small";   // absent, null or an unknown name: the base equations
```

- **Values** are expression strings without the leading `=`. They are evaluated in the equations' order, so a value may use the variables above it (`D: "T-4"` sees the configuration's `T`). A value for a name that is not an equation is ignored.
- **What follows a switch.** Every live feature field (extrude and cut depth, plane and sketch-plane offset, pattern spacing and count, fillet `r`, chamfer `d`, shell thickness, …) resolves against the active set on every rebuild. Sizes that a script turns into sketch geometry (`p.box` width and depth, `p.cylinder` radius, `p.hole` diameter, sketch dimensions typed as `=…`) are evaluated once, when the script runs, with the configuration active at that line; they do not change on a later switch.
- **Rebuild cache.** Cache keys follow the resolved values, so switching configuration rebuilds only the features whose numbers change (`build.reused` counts the reused steps), and switching back gives the identical body.
- **Script.** `p.configurations([{ name, values }], active?)` replaces the list (numbers become strings, a leading `=` is dropped; an empty list removes the configurations and the active name). `p.activeConfiguration(name)` activates one and throws for an unknown name; `p.activeConfiguration(null)` returns to the base equations. `generateScript` writes both right after `p.equations(...)`.
- **Kernel API.** `Kernel.configurationList(model)`, `Kernel.findConfiguration(model, name)`, `Kernel.activeConfiguration(model)` → the object or `null`, `Kernel.effectiveEquations(model)` → `[{ name, expr }]` with the active overrides, `Kernel.captureConfiguration(model)` → `{ name: expr }` (what a new configuration starts from), `Kernel.applyEquations(model, list)` (writes an edited list back: without an active configuration it replaces `model.equations`; with one, a variable the configuration names changes in that configuration only and any other variable changes in the base; a name dropped from the list leaves every configuration). `resolveEquations`, `resolvedModel` and a rebuild result carry `configuration` (the active name or `null`), and it survives `packBuild` / `unpackBuild`.
- **UI.** The *ConfigurationManager* tab above the FeatureManager lists the configurations; the active one is marked, and the buttons add, rename, delete and activate (each one undo step). The first *Add* on a part without configurations creates *Default* (a copy of the current values) plus the new one and activates the new one. The Equations dialog edits the active configuration's values, and the part row of the tree reads *Name (Config)*.
- **Automation.** `anvil.configurations()` → `{ active, list: [{ name, values }] }`; `anvil.configurations(list, active?)`, `anvil.activateConfiguration(name)` and `anvil.configurations.add / rename / remove / activate` return a Promise of the summary; `anvil.summary().configuration` is the active name and `.configurations` the names. `UI.configurations` has the same operations, and `UI.setFmTab('config')` opens the tab. The *Configured spacer* example in the Design Library has three configurations.

```js
p.equations({ T: 10, N: 3, S: 20, D: "=T/2" });
p.configurations([
  { name: "Small", values: { T: 6, N: 2, D: 3 } },
  { name: "Large", values: { T: 12, N: 4, S: 18, D: "=T-4" } }
], "Small");
p.sketch("Front").rect(0, 0, 80, 40).extrude("=T");
p.sketch("Front", "=T").rect(10, 10, 10, 20).cut("=D", { reverse: true });
p.linearPattern({ dir: "x", spacing: "=S", count: "=N" });
```

## Assemblies

An assembly document places parts (*components*) in space and positions them with *mates*, as in SolidWorks. `assembly.js` (global `Assembly`, no DOM, loaded after `kernel.js`) holds the model, the mate solver, the script API and mass properties; the UI switches its ribbon, tree and commands when the open document is an assembly.

### Model JSON

```js
{ type: "assembly", name: "Assem1", units: "mm",
  features: [],                        // always empty, so part-oriented code stays safe
  components: [{ id: 1, name: "Plate<1>", source: { example: "Plate with bolt holes" }, fixed: true,
                 transform: { position: [0, 0, 0], rotation: [1, 0, 0, 0, 1, 0, 0, 0, 1] } }],
  mates: [{ id: 3, name: "Concentric1", type: "concentric", a: Ref, b: Ref, alignment: "aligned", suppressed: false }],
  nextId: 4 }                          // shared id counter for components and mates
```

- **Transform.** `world = R · local + position`, `R` a row-major 3×3 proper rotation. The rebuild writes the solved transforms back into the model, so a saved assembly keeps its solved positions and re-solving it changes nothing (beyond 1e-9).
- **Source** — exactly one of `{ example: name }` (a Design Library part; assembly entries cannot be inserted), `{ script: "p.cylinder(4, 20);" }` (a part script) or `{ model: { …part JSON… } }` (an embedded part). A string source is an example name.
- **Names.** A component is named after its part model plus an instance number: `Plate<1>`, `Plate<2>`, `Pin<1>`. Mates are `Coincident1`, `Concentric2`, … (next free number per type).
- **Fixed.** The first component of an empty assembly is fixed (shown `(f)` in the tree); later ones float (`(-)` while under-defined) unless inserted with `fixed: true`.

### References

A reference (`Ref`) names geometry on a component by id (the script also accepts a name), in the component's **local** coordinates; without `component` it is the assembly origin.

| Ref | Resolves to |
| --- | --- |
| `{ component, face: [x, y, z] }` | the planar face of that component containing the point |
| `{ component, plane: "Front" \| "Top" \| "Right" }` | the component's standard plane through its origin (normals +Z, +Y, +X) |
| `{ component, cylinder: [x, y, z] }` | the axis of the cylindrical (faceted) face through or nearest the point |
| `{ component, axis: "x" \| "y" \| "z" }` | the component's local axis through its origin |
| `{ plane: "Top" }`, `{ axis: "y" }` | the assembly origin planes and axes (fixed in the world) |

### Mates

- **Coincident** — two planes (faces or planes) coincide. `alignment: "anti-aligned"` makes the normals opposite (faces touching), `"aligned"` makes them equal. Default: anti-aligned when both refs are faces, otherwise aligned.
- **Concentric** — two axes (cylinders or axes) coincide. Directions equal (`"aligned"`, default) or opposite (`"anti-aligned"`). A cylinder's direction is canonical: the sign whose largest-magnitude local component is positive.
- **Errors, never exceptions.** Wrong reference kinds give *Coincident needs two planar faces or planes* / *Concentric needs two cylindrical faces or axes*; a mate the solver cannot satisfy (over-defined or conflicting, or between two fixed components or two refs on one component when not already satisfied) gets *Mate cannot be satisfied (over-defined or conflicting)*; a face point that lies on no face and a part that fails to build are errors on the mate or component. Suppressed mates are ignored.
- **Degrees of freedom.** Each component reports `dof` (0–6, 0 when fixed) and `underDefined`: a pin concentric with a hole has 2 (slide and spin), adding a coincident face leaves 1 (spin).
- **Solver.** Fixed components never move. Floating components are placed mate by mate, then refined by damped least squares over all mates; `dof` comes from the rank of each component's Jacobian.

### Script API

An assembly script sees `a` (and `asm`, the same Builder) and `Math`. `Assembly.isAssemblyScript(code)` recognises one (`a.insert`, `a.mate`, `a.coincident`, `a.concentric`), and `anvil.run(code)` / *File ▸ Open* open such a script as an assembly.

| Method | Notes |
| --- | --- |
| `name(s)`, `units(u)` | Chainable. |
| `insert(source, opts) → id` | `opts`: `name`, `position` (alias `at`), `rotation` (9 numbers, row-major), `fixed`. |
| `mate(type, a, b, opts) → id` | `type` `"coincident"` \| `"concentric"`; `opts`: `alignment`, `name`, `suppressed`. |
| `coincident(a, b, opts)`, `concentric(a, b, opts)` → id | Shortcuts for `mate`. |
| `fix(c)`, `float(c)` | Fix or float a component (id or name). |

```js
a.name("Pinned Plate").units("mm");
var plate = a.insert({ example: "Plate with bolt holes" }, { fixed: true });
var pin = a.insert({ script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [40, 30, -20] });
a.concentric({ component: pin, cylinder: [4, 10, 0] }, { component: plate, cylinder: [14, 4, 10] });
a.coincident({ component: pin, face: [1, 0, 1] }, { component: plate, face: [50, 0, 30] }, { alignment: "aligned" });
// the pin now stands in the (10, 10) hole with its bottom flush: origin [10, 0, 10], axis +Y, 1 DOF (spin) left
```

`Assembly.generateScript(model)` writes the same form back (numbers rounded to 1e-6, rotation only when not identity, alignment only when it differs from the default).

### Kernel API

| Call | Result |
| --- | --- |
| `Assembly.isAssembly(model)`, `Assembly.newAssembly(name?)` | Type test; a fresh assembly (`Assem1`). |
| `Assembly.partModel(source)` | A fresh part model for a source; throws `Unknown Design Library part "X"`. |
| `Assembly.insert(model, source, opts?)`, `Assembly.addMate(model, type, a, b, opts?)` | Add a component / mate (mutates, returns it). |
| `Assembly.removeComponent(model, id)` (and its mates), `Assembly.removeMate(model, id)`, `Assembly.setFixed(model, id, fixed)` | Edit. |
| `Assembly.findComponent(model, idOrName)`, `Assembly.findMate(model, idOrName)` | The object or `null`. |
| `Assembly.rebuild(model, cache?)` | `{ assembly: true, body, bodies, bodyFeatures, bodyNames, components: [{ id, name, index, fixed, dof, underDefined, error }], mates: { id: { ok, residual, error } }, errors, warnings, partBuilds, cache, … }`. `body` is every component in world space with `polygon.body` = component index (so `Kernel.meshFromBody(build.body)` faces carry `face.body`); volumes add, components are never merged. Pass `build.cache` back to reuse the part builds. |
| `Assembly.solve(model, partBuilds)`, `Assembly.resolveRef(model, partBuilds, ref, transforms?)` | Solver; a ref as `{ kind: "plane", point, normal }` or `{ kind: "axis", point, dir }` in world coordinates (throws a readable Error). |
| `Assembly.refFromPick(model, build, faceIndex, worldPoint, mesh)` | The Ref for a viewport pick: `{ component, cylinder }` on a cylindrical face, else `{ component, face }`, in local coordinates rounded to 1e-6; `null` when nothing applies. |
| `Assembly.massProps(model, build)` | `{ volume, area, mass, centroid, bbox, components: [{ id, name, index, volume, mass, density, centroid }] }`: mass = Σ volume · density with each part's own density, centroid mass-weighted. |
| `Assembly.runScript(model, code)`, `Assembly.generateScript(model)`, `Assembly.isAssemblyScript(code)` | Script round trip. |
| `Assembly.transformPoint(T, p)`, `inverseTransformPoint(T, p)`, `transformDir(T, d)`, `IDENTITY` | Transform helpers. |

### UI

- **File ▸ New** → *New assembly* (or `anvil.newAssembly()`; *New part* / `anvil.newPart()` goes back) opens an empty assembly; the ribbon shows the *Assembly* tab (*Insert Components*, *Mate*, *Fix*, *Float*, *Hide/Show Components*) and *Evaluate*; part-only commands refuse with a message. Sketches are not available in an assembly document.
- **Insert Components** PropertyManager (`UI.cmdInsertComponent()`): pick a Design Library part, the last open part, or *Browse…* for a part JSON file, and the X/Y/Z position of its origin. The first component is fixed; later ones float until mated.
- **Mate** PropertyManager (`UI.cmdMate(existing?)`): *Mate Selections* takes two viewport picks (a cylindrical face gives an axis, a flat face a plane, an origin plane its plane); *Standard Mates* defaults to *Concentric* for two cylinders and *Coincident* otherwise; *Mate alignment* Aligned / Anti-Aligned. The graphics area previews the solved result, ✓ commits it, Cancel restores the model; double-clicking a mate row reopens it.
- **FeatureManager.** One row per component, `(f) Plate<1>` when fixed and `(-) Pin<1>` while under-defined, then a *Mates* folder with a row per mate (errors in red). Clicking a component row selects its body; hover reads *Component: Pin<1>*.
- **Mass Properties** lists each component with its own volume, density and mass, and the mass-weighted totals.
- Every edit is one undo step; saving and *File ▸ Open* round-trip the assembly JSON and script.

### Automation

`anvil.newAssembly(name?)`, `anvil.newPart(name?)`, `anvil.isAssembly()`; `anvil.insert(source, opts)` and `anvil.mate(type, a, b, opts)` return a Promise of the summary; `anvil.components()` → `[{ id, name, index, fixed, dof, underDefined, position, rotation, volume, error }]`, `anvil.mates()` → `[{ id, name, type, ok, error, suppressed }]`; `anvil.fix(idOrName, fixed)`, `anvil.removeComponent(id)`, `anvil.removeMate(id)`; `anvil.mass()` is `Assembly.massProps` in an assembly; `anvil.script()`, `anvil.run(code)`, `anvil.model()` and `anvil.load(json)` work on assemblies; `anvil.summary().type` is `"part"` or `"assembly"`, with `components` and `mates` counts. `UI.isAssembly()`, `UI.selectComponent(id)`, `UI.componentIndex(id)` and `UI.bodyName(i)` (the component name) drive the same paths. The *Pinned plate assembly* example in the Design Library is a fixed plate with two pins mated into its holes and a cap seated on it.

## Background rebuilds

By default (when the page is served over HTTP) the rebuild runs in a Web Worker: `worker.js` loads `csg.js` and `kernel.js`, receives `{ type: 'rebuild', seq, model }`, keeps its own rebuild cache between messages and answers `{ type: 'built', seq, build }` with `Kernel.packBuild(build)` (typed arrays, transferred rather than copied) or `{ type: 'error', seq, message }`. The main thread unpacks the result with `Kernel.unpackBuild`, puts the sketch profiles back with `Kernel.applyProfiles`, and only then swaps the mesh, tree and status. While a build is in flight the status bar shows *Rebuilding…*; rapid edits are coalesced, so only the latest model is built. *Edit ▸ Rebuild in background (Web Worker)* toggles the mode (`App.workerOn`, persisted in `localStorage` under `anvil.worker`); with it off every rebuild is synchronous, as before, which is also the fallback when workers are unavailable (`file://`).

For code that drives the app, `UI.rebuild(opts)` and `UI.pmOK()` return Promises, `UI.whenIdle()` resolves once no rebuild is queued or in flight, and `anvil.run` / `append` / `load` / `rebuild` return Promises resolving to the summary they used to return directly (`anvil.busy()` says whether a build is in flight, `anvil.workerOn(bool)` reads or sets the mode). In synchronous mode the work is done before the Promise is returned, so `anvil.summary()` is already up to date when the call returns.

## Automation from the browser console

`ui-app.js` exposes `window.anvil` for driving the running app. `run`, `append`, `load` and `rebuild` return Promises (see *Background rebuilds*); `await` them, or `await UI.whenIdle()` after any UI action, before reading `summary()`.

| Call | Effect |
| --- | --- |
| `anvil.run(code)` / `anvil.append(code)` | Replace or extend the model from a script. Returns a Promise that resolves to a summary, or rejects with the first feature error. |
| `anvil.model()` / `anvil.load(json)` | Get or set the feature JSON (`load` returns a Promise of the summary). |
| `anvil.rebuild()` | Rebuild and resolve to the summary. |
| `anvil.busy()`, `anvil.workerOn()` / `anvil.workerOn(bool)` | Whether a rebuild is in flight; read or set background-rebuild mode. |
| `anvil.script()` | Script regenerated from the model. |
| `anvil.stl()`, `anvil.dxfFace(i)`, `anvil.dxfSketch(id)` | Export text. |
| `anvil.mass()`, `anvil.faces()`, `anvil.features()` | Mass properties; face list with index, normal, area, centroid; feature list with errors. |
| `anvil.select(i)`, `anvil.view(name)`, `anvil.fit()` | Select a face, set a standard view, zoom to fit. |
| `anvil.bodies()`, `anvil.selectBody(i)` | The solid bodies (`[{ index, featureId, name, volume }]`, volumes to 3 decimals); select one. |
| `anvil.theme()` / `anvil.theme("dark" \| "light")` | Read or set the workspace theme (same as *View ▸ Theme*). |
| `anvil.png()` | Data URL of the current viewport. |
| `anvil.equations()` / `anvil.equations(list \| { T: 10 })` | Read (a copy) or replace the global variables; setting returns a Promise of the summary (see *Equations*). |
| `anvil.summary()` | `{ type, name, features, errors, volume, bbox, faces, bodies, rebuildMs, equations, equationErrors }`, plus `components` and `mates` counts; `type` is `"part"` or `"assembly"`. |
| `anvil.newAssembly(name?)`, `anvil.newPart(name?)`, `anvil.isAssembly()`, `anvil.insert(…)`, `anvil.mate(…)`, `anvil.components()`, `anvil.mates()`, `anvil.fix(…)`, `anvil.removeComponent(id)`, `anvil.removeMate(id)` | Assembly documents (see *Assemblies*). |
| `anvil.drawing.*` | Drawing documents: `make()`, `summary()`, `svg()`, `dxf()`, `pdf()`, … (see *Drawings*). |
| `anvil.examples` | The Design Library entries. |

## Drawings

*File ▸ Make Drawing from Part* opens a drawing document of the active part (SolidWorks placement): a **Drawing** ribbon tab (*Standard 3 View*, *Model View*, *Projected View*, *Section View*, *Detail View*, *Smart Dimension*, *Model Items*, *Sheet Properties*, *Save as SVG / DXF / PDF*, *Close Drawing*), a drawing FeatureManager (*Draw1* ▸ *Annotations*, *Sheet1* ▸ *Sheet Format1*, *Drawing View1…n* with the part under each), the sheet in place of the viewport with a *Sheet1* tab and a tab back to the part, and drawing menus (*File ▸ Save Drawing as…*, *Insert ▸ Drawing View*, *Window* switches between the part and its drawing). The first drawing is made with *Standard 3 View*: Front, Top and Right, third-angle by default (Top above Front, Right to its right; *Sheet Properties ▸ First angle* puts Top below and Right to the left), plus an Isometric in the free corner. The sheet is A3 for mm parts and ANSI B for inch parts, with a border and a title block (part name, drawing number, scale, units, date, projection, sheet 1 of 1); the scale is the largest standard one (10:1 … 1:200) at which the three views fit, or a fixed one from *Sheet Properties*; a view may have its own scale (shown under it).

Views are **projected from the mesh, not rendered**: every edge where faces meet at more than 23° (the kernel's coarsest round facets turn 22.5°) and every silhouette of a faceted curved face (a smooth edge between a face turned toward the viewer and one that is not) is clipped exactly against the front-facing triangles. Along an edge, "inside the triangle's projection" and "behind the triangle's plane" are both linear, so each triangle hides one parameter interval; the rest is visible. Collinear pieces are merged, a hidden piece under a visible one is dropped, and closed chains of equal chords on one circle come back as true circles. Orthographic views default to *Hidden Lines Visible* (dashed), pictorial views to *Hidden Lines Removed*; right-click a view to switch. Model dimensions (*Model Items*, on by default) are the overall width and height on the Front view, the depth on the Top view and every distinct visible circle diameter once (`4X Ø8` for a pattern), with leaders pointing out of the view. *Smart Dimension* (D) adds a horizontal, vertical or aligned length on a clicked edge or a diameter on a clicked circle of an orthographic view. Drag a view to move it (Top and Right stay aligned with Front and follow it); Delete removes a selected view or dimension (a removed model dimension stays hidden); the wheel zooms, dragging the empty desk pans, F fits the sheet. Drawings are made from parts only: in an assembly document *Make Drawing from Part* is disabled and `anvil.drawing.make()` refuses with a status message, and the *Window* menu lists the open part or assembly and the part's drawings. Drawings are stored on the part (`model.drawings`), follow every rebuild, and every drawing edit is one undo step.

**Projected, Section and Detail views** (*Drawing* tab and *Insert ▸ Drawing View*):
- *Projected View*: select a view (or click one after pressing the button), move the pointer above, below, left or right of it and click. The new view looks from that side (third angle; the opposite side in first angle), has the parent's scale, stays aligned with it (dragging it slides it along the projection only) and follows the parent when that moves. Front + down is *Bottom*; a projection that is not a standard view (up from *Top*: the back, upside down) is named *Projected*.
- *Section View*: the PropertyManager picks a *Horizontal* or *Vertical* cutting line and the label; click in a view to place the line (it snaps to hole and boss centres within 8 px), then click on the side where the view goes. The part is cut exactly (every body intersected with a box that ends on the cutting plane, so the cut faces are true faces of the result), the cut faces are hatched ANSI31 at 45° (135° on every other body, 2.5 mm apart on paper, anchored to the sheet), and the parent shows a thick chain line past the view with arrows pointing along the line of sight and the letters. The view is aligned with its parent, placed on the viewer's side in third angle and on the arrow side in first angle, labelled *SECTION A-A*, hidden lines removed. Letters run A, B, C… skipping I, O and Q.
- *Detail View*: click the centre of the detail circle in a view, click again for its radius, click where the view goes. It shows the parent inside the circle at twice the parent's scale (change it in the view's properties): lines are clipped to the circle, circles it cuts become arcs, a section's hatch is redrawn at the detail's scale. The parent shows the circle and the letter; the view is labelled *DETAIL B* / *SCALE 4:1*.
- Deleting a view deletes the section and detail views cut from it; projected views keep their direction and become free views.

**Dimensions that follow the part.** A Smart Dimension stores the edge or circle it was placed on. After every rebuild it is reattached to the same geometry in the new projection: the unchanged edge; else the best of the collinear edges that overlap it (an edge that grew or shrank) and the parallel edges within a quarter of the view that overlap at least half their union (a face that moved), scored by overlap / union and offset; circles by centre (a hole that changed size), then by radius near the old centre (a hole that moved). The value follows. With no match the dimension is **dangling**: it keeps its last position and is drawn in olive (`#a07c00`, DXF colour 42, like SolidWorks' dangling annotations); undoing the change reattaches it.

Exports: **SVG** at the real sheet size (`width="420mm"`), one `<g data-layer>` per view, hidden edges dashed; **DXF** R12 in paper units with one layer per view (`FRONT`, `TOP`, `RIGHT`, `ISOMETRIC`, `SECTION_A`, `DETAIL_B`, …) plus `DIMENSIONS` and `SHEET`, hidden edges on the `HIDDEN` linetype, cutting lines on `PHANTOM`, holes as `CIRCLE`s and clipped circles as `ARC`s, hatching as `LINE`s; **PDF** 1.4, one page at the sheet size, Helvetica text.

```js
var m = Kernel.newModel('Plate'); Kernel.runScript(m, code);
var mesh = Kernel.meshFromBody(Kernel.rebuild(m).body);
var doc = Drawing.newDrawing(m, { projection: 'third' });      // { format, scale: [1, 2], date, autoDims } optional
Drawing.standard3View(doc, mesh, m.units);                       // Front / Top / Right + Isometric, scale and layout
var sheet = Drawing.compute(doc, mesh, m);                       // paper-space primitives, views, dims
Drawing.toSVG(sheet); Drawing.toDXF(sheet); Drawing.toPDF(sheet);
Drawing.projectView(mesh, 'Front');                              // { lines: { visible, hidden }, circles, bounds, stats }
Drawing.addProjectedView(doc, mesh, frontId, 'down');            // up | down | left | right; { x, y } optional
Drawing.addSectionView(doc, mesh, frontId, { axis: 'h', at: 4, sign: 1 });   // cut at v = 4 (parent's frame), viewer on +v
Drawing.addDetailView(doc, mesh, topId, { c: [10, -10], r: 8 });  // scale defaults to 2x the parent's
Drawing.sectionOf(mesh, [0, 1, 0], 4);                           // { mesh, caps: [face], area }: keeps p.e <= 4
```

In the app: `anvil.drawing.make()` (File ▸ Make Drawing from Part; returns the summary), `open(i)`, `close()`, `isOpen()`, `summary()` (`{ name, sheet, views: [{ id, name, orient, kind: 'model' | 'projected' | 'section' | 'detail', label, parent, x, y, scale, extents, box, stats: { visibleLines, hiddenLines, visibleCircles, hiddenCircles }, hatch, sectionArea }], dims, dangling }`), `standard3View()`, `addView(orient, { x, y, display, scale })`, `setSheet({ format, scale: '1:2' | 'auto', projection: 'first' | 'third' })`, `projectedView(parentId, dir, { x, y })`, `sectionView(parentId, { axis, at, sign, x, y, label })`, `detailView(parentId, { c, r, scale, x, y, label })`, `deleteView(id)`, `modelItems(bool)`, `svg()`, `dxf()`, `pdf()`, `doc()`.

## Exports

- **STL** (ASCII) of the whole body.
- **DXF** of a sketch (LINE, CIRCLE, ARC, POLYLINE entities), of a selected planar face, or of the sheet-metal flat pattern, with the shop's `OUTLINE` / `HOLES` / `BEND` / `NOTES` layer table and `$INSUNITS` set from the document units.
- **Script** (`*.anvil.js`) and **JSON** (`*.anvil.json`) of the model. Both reopen through *File ▸ Open*.
- **PNG** screenshot of the viewport.
- **Drawing** of the part as SVG, DXF (one layer per view) or PDF (see *Drawings*).

Downloads are blocked inside some sandboxes; every export dialog also offers *Copy*.

## Tests

`tests/kernel-tests.html` builds parts through the script API and checks them against known volumes, bounding boxes, face counts, profile nesting, edge extraction, chamfers and fillets, sheet-metal flanges and flat patterns (including the mitred-corner blank and two Material Outside flanges sharing a corner: blank 9692.80 with bend allowance 5.372), export contents, error messages and script round-trips, then builds every entry in `examples/examples.js` and round-trips each one through `generateScript`. The `normal cut` group checks that a cut parallel to the sheet is unchanged, that a 45° sketch removes a straight prism (same volume as the oblique slab, centroid z −29.8069 instead of −29.7827 on the 100×60×2 sheet, every face axis-aligned), that a window through a flange wall removes outline × T from either side and in both directions, that the option is ignored without sheet parameters and warns when the tool crosses no sheet face. The `pack & worker` group round-trips solids and whole builds through `pack`/`unpack`, clones a packed build through a `MessageChannel`, checks `cacheFromBuild` (step shape, full reuse, appended feature, change in the middle) and drives `worker.js` end to end (build, cache reuse, a broken feature). The `csg early-out` group checks `getBounds`, disjoint / touching / overlapping / nested cubes (volumes, the unsplit 12 quads of a disjoint union), a far boss and hole on a plate (analytic volume and centroid), pack/unpack of an early-out result, and pins every Design Library part's volume in `EXPECTED_VOLUMES` (an entry at `null` is only checked to be finite and positive; the page records the numbers in `window.__anvilVolumes` and `window.__anvilVolumesJS()` prints them ready to paste). The `cut direction hint` group covers `Kernel.cutDirectionHint` on a Front sheet and a Top box: top face true, bottom face false, planes above and below the body, a plane whose normal line misses the body, a plane inside the material, face frames from `planeFromFace`, and the null cases (no body, unknown or non-sketch id, no model) without throwing. The `multi-body` group builds two cubes with `merge: false` and checks the body list (`bodies`, `bodyFeatures`, `bodyInfo` names, face and polygon tags), unscoped and scoped cuts (600 + 600, 1000 + 600), the merge rule (a touching boss joins body 0, a bridging boss collapses both into slot 0, a disjoint boss starts a third body, a cut that empties a body removes it, `merge: false` on an overlapping boss, a cylinder, a revolve and a pattern), fillet / chamfer / shell acting on the picked body only (1000 stays exactly 1000; 424 + 1000 for the shell), the *removed no material* warning with and without scope, mirror-body copies apart and touching, the `generateScript` round trip (`merge: false`, `bodies: [1]`), pack / unpack of the bodies and of a legacy single-body build, the rebuild cache with and after the worker, `bodyNearPoint` and the empty model. The `equations` group covers the expression grammar (precedence, right-associative powers, unary minus, functions, degree helpers), every error case, `resolveEquations` order, forward references, duplicate and invalid names, `resolveFeature` on nested and skipped fields, rebuilds driven by `=` fields (T = 10 → 2000, T = 5 → 1000; sketch-plane offset, pattern spacing and count), feature and equation errors that never throw, the `generateScript` round trip, `packBuild` / `unpackBuild`, the rebuild cache (only dependants rebuild; a same-value edit reuses everything) and the *Parametric plate* example at T = 12. The `configurations` group covers the Builder calls (strings stored, `=` stripped, an unknown active name throws, `null` clears), resolving with and without an active configuration, an unknown active name, an override that uses an earlier variable and one that is ignored, `effectiveEquations` / `captureConfiguration`, `applyEquations` in both modes and for dropped names, analytic volumes per configuration, the rebuild cache on a switch (only the dependants rebuild; switching back is bit-identical), the `generateScript` round trip, `packBuild` / `unpackBuild`, and every configuration of each Design Library example that documents them (*Configured spacer*: Small 18000, Medium 29000, Large 32000). The `assembly` group drives `assembly.js` directly: the new model's shape, insert naming (`Plate<1>`, `Plate<2>`, first fixed), `partModel` for every source kind and the unknown-example error, rebuild bodies / names / polygon and face tags, volumes that add regardless of placement, a pin inserted at an arbitrary position and rotation mated concentric into the plate's (10, 10) hole with flush bottoms (origin [10, 0, 10], axis +Y), a rotated block seated face to face on the plate top (bottom at y = 8), plane, origin and axis refs, alignment flips, DOF counts (6 unmated, 2 concentric, 1 with the coincident, 0 fixed), wrong-kind, conflicting and unresolvable mates reported as errors, suppressed mates, removing components and mates, rebuild stability (1e-9), part-build cache reuse, the `generateScript` → `runScript` round trip, `isAssemblyScript`, `refFromPick` (face vs cylinder) and mass properties with two densities. Assembly examples (`kind: "assembly"`) are built with `Assembly.runScript` + `Assembly.rebuild`, checked against their documented volume, pinned in `EXPECTED_VOLUMES`, their `checks` (solved component positions) verified to 1e-6, and round-tripped through `Assembly.generateScript`. The `csg overlap split` group checks union / subtract / intersect of overlapping, nested, disjoint and touching boxes and n-gon prisms against analytic volumes, watertight meshes and no degenerate polygons, faces away from the overlap left unsplit, a half ring, and shell-like slab unions (six walls = 3904 in any order, stacked and staircase slabs). The `drawings` group (drawing.js) checks the view frames, a box (4 lines per ortho view, 9 visible + 3 hidden in the isometric), a blind hole (two hidden walls and the hidden bottom), a post split into visible and hidden pieces by a wall in front of it, the Bushing's silhouettes and hidden bore, the Design Library *Plate with bolt holes* drawing (extents 100×8 / 100×60 / 60×8 and the isometric from its corners, 4 + 4 hidden lines in Front and Right, 4 Ø8 circles in Top, A3 at 2:1, third-angle alignment, dimensions `100, 8, 60, 4X Ø8`), an independent ray cast from points on every drawn piece (visible pieces unblocked, hidden ones blocked) on four parts in all four views, first-angle placement on A2 at 1:1, an inch part on ANSI B, the SVG / DXF / PDF writers (parsed back: dashes, layers, `HIDDEN` linetype, circles, xref offsets, stream length), `moveView` alignment and suppressed dimensions, and every part example's view extents against its bounding box (assembly examples are skipped). 408 tests at the time of writing. A test may return a Promise: its row shows *WAIT* until it settles, a pending test fails after 10 s, and the summary and `window.__anvilTests` are written only once every test has settled. Run it after touching `csg.js`, `kernel.js` or `worker.js`. Circles are polygonal in the kernel, so tests compare against the polygonal area (`n/2 · r² · sin(2π/n)` with `n = clamp(round(8√r), 16, 72)`) rather than `πr²`.

`tests/bench.html` times every example and a set of stress parts and reports medians; `tests/BENCHMARKS.md` keeps dated baselines so performance work in Phase 4 has something to compare against.

`tests/ui-smoke.html` is the app-level regression: it loads `index.html` in a frame and walks the main workflows through the same functions the ribbon and PropertyManager call (`UI.cmdSketch`, `UI.pmOK`, `UI.deleteFeature`, …), asserting volumes after each step and failing on any uncaught error or `console.error` inside the app. Every step awaits the rebuild it triggers (`await anvil.run(...)`, `await UI.pmOK()`, `await UI.whenIdle()`). Later steps cover the Cut-Extrude *Normal cut* checkbox (on by default on a sheet part, absent on a plain part, `normalCut: true` in the committed feature), the Cut-Extrude *Reverse direction* default (checked for a sketch on the top face of a sheet, clear for one on the bottom face, and the cut removes 10 × 10 × 2 either way), the icon set (every ribbon, tree and panel icon id renders as an `<svg` string that `DOMParser` accepts, and the rendered ribbon SVGs re-parse), *View ▸ Theme* (`UI.setTheme`, `anvil.theme`, `localStorage`, `UI.viewportTheme`, the menu check marks), and background rebuilds: worker mode on by default, synchronous mode when off, coalescing of three rapid runs, the *Rebuild in background* menu item, and the main-thread cache after a worker build (`UI.buildCacheInfo()`, a following `UI.rebuild({ sync: true })` reuses every feature). The multi-body steps build two cubes with `merge: false` and check the *Solid Bodies(2)* folder and its rows, `anvil.bodies()` / `anvil.selectBody()` / `UI.selectBody()` / a click on a body row, `UI.setBodyHidden` (viewport only: the mesh and mass properties keep both bodies), the Boss-Extrude *Merge result* checkbox (checked by default; unchecked commits `merge: false` and a second body, re-checked merges again), the Cut-Extrude *Feature Scope* group (*Selected bodies* ▸ *Boss-Extrude2* commits `bodies: [1]` and cuts body 1 only, and the edit PM reopens on it; absent on a single-body part) and the per-body volumes in *Mass Properties*. Run it after touching any `ui-*.js` file or `worker.js`. Results are also exposed as `window.__anvilSmoke`. The equations steps cover `anvil.equations()` get / set / undo, the *Equations* folder and rows, *Tools ▸ Equations…* (live re-evaluation, OK rebuilds, a red row refuses OK, add / reorder / delete, Cancel), a Boss-Extrude depth of `=W+1` (hint, committed text, follows T, a broken equation disables OK), *Equation W: …* in the status bar, `UI.evalInput` and the sketch Modify box (`UI.editDim(0, "=T*3")`, an unknown name keeps the box open), and `UI.bodyBounds` / `UI.zoomToBody`. The configurations steps cover `anvil.configurations()` get / set / activate with volumes and `summary().configuration(s)`, the *ConfigurationManager* tab (`#config-panel`, `.cfg-row` active and selected, the part row *Name (Config)*), the first *Add* creating *Default* plus the new one, Rename / Activate / Delete through the panel buttons and the name prompt, `UI.configurations` and `anvil.configurations.add / rename / remove / activate`, one undo step per operation, the Equations dialog editing only the active configuration, and every configuration of the *Configured spacer* example. The assembly steps open an assembly with `anvil.newAssembly`, insert a plate and a pin (`anvil.components()`, tree rows `(f) Plate<1>` / `(-) Pin<1>`), mate the pin into a hole (it moves to [10, 0, 10], *Mates* folder and rows, 1 DOF, `UI.selectComponent`), undo / redo a mate, round-trip `anvil.script()` through `anvil.run` and `anvil.model()` through `anvil.load`, check `anvil.mass()`, fix / float / remove through `anvil`, open the *Pinned plate assembly* from the Design Library, and return to a part with `anvil.newPart`. The drawing steps open *File ▸ Make Drawing from Part* on the bolt-hole plate (Drawing tab only, drawing tree rows, layers, extents and hidden counts, dimensions), add a *Smart Dimension* by clicking the Front view's bottom edge and undo it, drag the Top view (x stays on Front's), place a Bottom view through the *Model View* PropertyManager and a click, switch to first angle in *Sheet Properties*, open the three export dialogs, check that part shortcuts are swallowed and that a depth change redraws the views, go back to the part and reopen the drawing from the *Window* menu, and, on the *Pinned plate assembly* example, check that *Make Drawing from Part* is disabled and refused, that *Window* lists the assembly, and that *File ▸ New ▸ Assembly* from a drawing leaves it. 75 steps at the time of writing.

## Known limitations

- No draft, rib or wrap yet (see `ROADMAP.md`). Chamfers and fillets work on straight and polygonal edges between planar faces; a fillet is a polygonal arc. Sweeps use mitred polyline paths (arcs are polygonal), lofts are ruled surfaces between resampled outlines, and Shell is exact for planar faces; on polygonal round faces the cavity is the polygonal offset.
- Circles and arcs are polygons; volumes of round parts are up to ~2 % under the analytic value.
- CSG is BSP based: a few hundred features is fine, thousands of polygons per feature starts to take hundreds of milliseconds per rebuild.
- Tools that only touch the body along a face can leave hairline slivers.
- Mitres join flanges of one feature only, at corners where both fold the same way; a flange meeting another flange at a concave (inside) corner is not closed or relieved automatically. Reliefs are straight slots normal to the edge; there is no tear or bend-line relief.
