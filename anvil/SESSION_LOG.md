# Anvil session log

Newest entry last. Each entry: what was done, decisions, and "next up" for the following session.

## Session 1 — 2026-09-21

**Context.** Scheduled task `daily-code-limit`. The user rejected two earlier directions this session (a scripting language, then a roguelike) and asked for: a CAD program that is best for Claude's own use to draw and create 3D models, with a UI whose features sit in the same places as SolidWorks. A parallel Claude session joined mid-way and owns `tests/`, `examples/` and `README.md`.

**Done.**
- Wrote the whole application from scratch as static files (no build step; three.js r128 from cdnjs):
  `csg.js` (BSP CSG), `kernel.js` (sketches, features, rebuild, meshing, mass props, STL/DXF, script builder), `icons.js`, `style.css`, `index.html`, `ui-core.js` (scene, camera, picking, highlights, edges), `ui-sketch.js` (mouse, sketch tools), `ui-commands.js` (PropertyManager + commands), `ui-panels.js` (ribbon, menus, tree, HUD, modal), `ui-app.js` (task pane, script console, files, exports, shortcuts, `window.anvil`, boot).
- `serve.ps1` + `.claude/launch.json` serve the folder on http://localhost:8765 (PowerShell HttpListener, since there is no node/python).
- Verified in the browser pane: loads with no console errors, sample bracket (12 features) rebuilds in ~17–30 ms, face selection highlights, layout correct at 1024 px after fixing the ribbon overflow and the initial fit timing.

**Decisions.**
- Model = feature list JSON; the script API is a builder over that list and `generateScript` regenerates code from the tree, so both representations stay interchangeable.
- Sketch frames follow SolidWorks: Front (x=X, y=Y, n=Z), Top (x=X, y=-Z, n=Y), Right (x=-Z, y=Y, n=X).
- Holes in profiles are subtracted as slightly over-long prisms to avoid coplanar-cap artifacts.
- Edges are drawn from kernel face outlines (T-junction aware) with tangent edges (< 22°) hidden, not from `THREE.EdgesGeometry`.
- Polygon tags (`shared`) carry the owning feature id through CSG so selecting a feature highlights its faces and double-clicking a face opens its feature.
- No fillet/chamfer/shell yet: they need edge selection and offset geometry (Phase 2).

**Known gaps / bugs to check first next session.**
- Sketch tools were only exercised by reading the code, not by clicking through in the browser; test Line/Rect/Circle drawing, entity PM editing, exit sketch → extrude.
- Revolve: holes inside revolved profiles are revolved at exactly the same radius as the outer loop caps; coplanar end caps may leave slivers for partial revolves.
- Circular pattern preview uses the source's cached tool; for patterns-of-patterns the tool exists but `isCut` follows only one level.
- `featureFamily` in ui-core returns only the feature itself; pattern/mirror copies keep the source's tag, so selecting a pattern highlights nothing (selecting the source highlights all copies).
- Downloads are inert inside the claude.ai artifact sandbox; the export dialogs offer Copy as the fallback.
- **Published artifact:** https://claude.ai/artifact/Dhex98h8xugn5w2RXraAPS (multi-file; republish with `url` from any session, `root: anvil`, files map of style.css, csg.js, kernel.js, icons.js, examples/examples.js, ui-*.js).
- Click-tested in the browser pane: Sketch → Top plane → Circle tool → Exit Sketch → Extruded Boss/Base PM (depth edit, yellow preview, ✓ commit) all work; the parallel session's kernel test page passes 101/101 after two kernel fixes it found (generateScript round-trip vars, slot tangent vertices).

**Later in session 1 (same day).**
- Edge selection (kernel `bodyEdges` with interior directions from outline winding, tangent chains; viewport `pickEdge` with occlusion test) and **Fillet / Chamfer** features with mitred caps at shared vertices (`p.fillet(r, [[x,y,z]])`, `p.chamfer(d, [...])`). Verified in the browser: hole-rim chamfer as one 31-edge chain, four top edges filleted in one feature, clean corners.
- **Sheet metal**: `p.sheet(T,R,K)`, `baseFlange`, **Edge Flange** feature (bend + wall swept along picked edges, reverse side), **Flatten** viewer (SVG blank with bend centre lines, UP/DOWN labels, BA = angle·(R+K·T)) and **Flat to DXF** (OUTLINE/HOLES/BEND/NOTES). Verified: 100×60 base with two flanges → 120.37 × 85.37 blank.
- Convexity bug found by testing (centroid test failed on faces with holes) fixed by using outline winding.

- Parallel session click-tested the UI (all core flows pass) and reported 8 issues; all fixed: cut defaults (Through All + Reverse for face sketches, "cut removed no material" warning), modal confirm/prompt replacing blocked native dialogs, face-first picking with the Sketch PM, empty new sketches discarded, preview through-all clamped, status text on exit, narrow-window layout, export textarea/hole rounding cosmetics.
- Sketch tools added: Convert Entities, Offset Entities (PM), Sketch Fillet (PM + click a corner). Kernel `offsetLoop`, `filletPolyline`.
- Testing note: in the browser pane, navigating to the same localhost URL can serve stale scripts; use `location.reload()` via javascript_tool. Never name a REPL variable `top` (it is window.top).

**Next up.**
1. Sweep and loft features (kernel + PMs), then wire the greyed Swept/Lofted ribbon buttons.
2. Phase 2: Convert Entities / Offset Entities in sketches on faces, sketch fillet, Shell, sweep/loft, driven dimensions display.
3. Sheet metal: Material Inside placement, flanges on flanges in the flat pattern, holes on flange walls.
4. Performance: incremental rebuild (cache tools for unchanged prefix), Web Worker.

## Session 2 — 2026-09-22

**Context.** Scheduled task `daily-code-limit`, unattended. Five interactive peer sessions were active on the folder at the same time (one had just added `tests/ui-smoke.html`, three pattern tests and README text); I messaged all of them with the file split (this session: `kernel.js`, `ui-*.js`; helpers: `tests/`, `examples/`, `README.md`) and only touched their files additively.

**Found on arrival.** Sweep and loft were already implemented in the kernel and UI at the end of session 1 but never verified, tested, documented or logged (the log's "next up" was stale). Verified them headlessly against analytic volumes (straight tube, mitred L, 3D-point path, line+arc path, swept cut, square frustum 7000 exact, lofted cut) and by clicking through the Swept/Lofted PMs.

**Done.**
- Sweep polish: path sketches no longer raise the "open contour" warning (they are open by design); path entities that do not connect produce a warning on the sweep instead of vanishing silently; the Sweep PM pairs the closed sketch as profile and the open one as path automatically.
- **Shell** feature (`p.shell(t, [[x,y,z]…])`, feature `{type:'shell', thickness, faces:[{at}]}`): `Kernel.resolveFaces` (point → mesh face by plane distance + outline containment), `Kernel.buildShell` builds the inner solid as body − ⋃(slab behind each kept face) ∪ extensions through removed faces, then body − inner. Slab outlines are grown per edge by T·tan(φ/2) (φ = dihedral angle to the neighbour, via `offsetLoopVar`), which is exactly where the two offset planes meet: sharp offset corners at concave edges, no over-cut at tangent facets (the uniform-T version left a star pattern around polygonal holes). Exact results: closed box 15744, open box 11712, two open faces 11280, L block 19264; cup and holed box within 0.02 %. Shell PM: click faces to remove (highlighted), thickness, red cavity preview; editing an existing shell previews on the body rebuilt up to that feature (`bodyBefore`). Ribbon Shell button, Insert menu, tree icon and description.
- `unionTree` (balanced pairwise union) for shell slabs and sweep segments: bushing shell 4.1 s → 0.39 s, cup 110 → 16 ms. NOT used for patterns: a tree union of coincident copies loses material (three pattern tests fail with it).
- Kernel bug fixed (found by the helper session's new tests): a pattern's tool holds only its copies, so a pattern/mirror of a pattern missed the seed instance (3 holes instead of 4). `familyTool` now unions the seed recursively for `lpattern`/`cpattern`/feature `mirror` sources.
- Tests added to `tests/kernel-tests.html` (groups `sweep`, `loft`, `shell`: 19 tests) — 169/169 pass; `tests/ui-smoke.html` 16/16. Examples added: Mug (shell + swept handle), Funnel (loft + shell open both ends), Handlebar (3D-point sweep with a swept-cut bore). README: Part methods, feature JSON, kernel API, ribbon/menu lists, known limitations.
- Status bar says "updated" instead of "created" when a feature edit is committed.

**Notes.**
- The browser-pane `key: Return` does not reach the page's keydown handler; click the ✓ button (`find "OK (Enter)"`) to accept a PM when driving the UI from tools. Enter works for real users (ui-app keydown + number inputs).
- Shell on a revolved part (~300 faces) takes ~0.4 s; on a loft-with-spout funnel ~0.55 s. Fine interactively, but the PM recomputes the preview on every keystroke in the thickness field.
- Editing an existing Shell cannot re-pick removed faces (they no longer exist on the displayed body); delete and recreate instead.

**Next up.**
1. Draft on extrudes (tapered prism; the greyed Draft button), then Rib.
2. Sketch tools: Trim, Mirror Entities, Linear Sketch Pattern; driven dimensions display.
3. Sheet metal: Material Inside placement, flanges on flanges in the flat pattern, holes on flange walls.
4. Performance: cache tools for an unchanged feature prefix; Web Worker rebuilds.

**Later in session 2 (continued on request).**
- **Draft on extrudes**: `extrude(d, { draft: deg, draftOutward })` / feature fields `draft`, `draftOut`. `taperedPrism` offsets the section by depth·tan(angle) at each end (mitred `offsetLoop`, so side quads stay planar); holes offset the other way (they widen as material narrows); mid-plane and direction-2 ranges are split at the sketch plane so the taper starts there on both sides. Collapse is detected by edge reversal (a square offset past its centre keeps a positive area) and reported as "Draft angle is too large for this depth". Draft group (on/angle/outward) in the Boss/Cut-Extrude PM, tree description shows the angle. 4 tests (frustum volumes exact to Float32 precision, outward, mid-plane, drafted cut, boss with widening hole, error, round-trip) — 173/173 pass; committed from the PM with the exact expected volume.
- Note for tests: mesh positions are Float32, so volume checks on non-integer geometry need `nearRel(…, 1e-6)`, not an absolute 1e-6.
- The ribbon "Draft" button stays greyed: SolidWorks' Draft feature drafts existing faces about a neutral plane, which is a different (harder) operation than the extrude option.

**Later in session 2 (sketch tools).**
- **Trim Entities** (`Kernel.trimEntity`, `SketchBuilder.trim(i, u, v)`): entities are decomposed into exact primitives (segments and circular arcs; slots explode into 2 lines + 2 arcs, rects/polygons become polylines), intersections are analytic (seg–seg, seg–arc, arc–arc), and the span of the clicked primitive between its neighbouring intersections is removed: lines split, arcs split, a full circle becomes the remaining arc, a closed polyline opens, an entity nothing crosses is deleted. PM "Trim Entities" (click to trim, repeat, ✓ to finish); `onSketchPoint` now also receives the screen coordinates so the command can use `UI.pickEntity`.
- **Mirror Entities** (`Kernel.mirrorAxis/mirrorEntity`, `SketchBuilder.mirrorEntities(axis, {entities, copy})`): axes = sketch X/Y or a line entity; arcs reflect as 2φ − a with the sweep re-ordered, regular polygons keep their type (rot' = 2φ − rot), rects/crects keep their type for axis-aligned mirrors and become polylines otherwise. PM previews the copies as temp entities; mirrors the selected entity or all.
- **Linear Sketch Pattern** (`Kernel.translateEntity`, `SketchBuilder.patternEntities({dx, dy, count, dx2, dy2, count2})`): PM with angle/spacing/instances for two directions, temp preview.
- Kernel: `meshFromBody` now keeps `positions64` (Float64) and `massProps` uses it, so volumes are exact in double precision instead of carrying the Float32 render error (about 4e-8 relative) — this made the helper session's absolute-tolerance draft tests pass.
- Coordination: the helper session wrote its own `draft` test group with a `frustum` helper that shadowed mine (function declarations hoist), so I removed my draft group and kept theirs. Tests: 185/185; sketch tools have 7 tests in the `sketch tools` group.

**Later in session 2 (sheet metal).**
- **Flat pattern rewritten as a recursive unfold.** The base face (largest face on the +n side of the base sketch plane) is mapped into the sketch frame; each flange attached to an unfolded face adds a bend strip of length BA beyond its edge and then unfolds its wall face on the tracked side of the sheet (inner radius when the fold comes toward that side, outer radius otherwise) with a rigid map built from the arc-end line, the wall direction and the edge direction, recursively. Regions (real face outlines, holes included) are merged by extruding them 1 unit in the Front frame and unioning with the CSG kernel; the merged top face outline is the blank, so collinear points vanish (the two-flange test now expects 6 outline points, not 8). Verified: hole on a wall lands at BA + 8 in the flat, Z bracket flat = 100 + 2·BA + 30 + 25, Flatten dialog draws both.
- **Flange placement** (`position`: `bendOutside` default, `outside` = Material Outside, `inside` = Material Inside): the bend section shifts inward by R or R + T and a strip of the base of that width is cut first (`ctx.flangeCut`), so the envelope keeps the base size. Flange info now stores the shifted edge, `mid`, `origin` and `T` for the flat pattern. PM has a Flange Position select; script generation emits `position` when not default.
- Tests: three new sheet-metal tests (wall hole, Z bracket, placements + round trip); 188 expected.

**Later in session 2 (smart dimensions).**
- **Smart Dimension** (driven, editable): in sketch mode each entity gets HTML labels positioned by `worldToScreen` every frame (`UI.frameDims` from the render loop; `App.dimsStale` set by `updateSketches` rebuilds them): line length, circle Ø, arc R, rect/crect w and h, polygon R, slot length and width. Clicking a label swaps in a number input; Enter applies (line keeps its start and direction, slot keeps centre 1), Esc/blur cancels or commits; one undo step per edit. `App.view.showDims` (default on) is toggled by the ribbon Smart Dimension button, which now shows an active state (generic `active()` hook for ribbon items). Overlay is `#dims` in index.html with styles at the end of style.css.
- The local server had gone away mid-session (no listener on 8765); `preview_start` still refuses unattended sessions, so serve.ps1 was started in the background from PowerShell as CLAUDE.md documents.

**Later in session 2 (hem, jog, `toward`).**
- `p.hem(L, edges, {gap})` is a flange feature with `hem: true`, angle 180 and R = gap/2 (default gap T/2); script generation emits `p.hem`. `p.jog(height, length, edges, {angle, reverse, radius, position})` is a new `jog` feature: `buildJog` builds the first flange, applies it to a temporary body, computes the wall's end-edge mid-thickness point and builds the second flange there with `toward` = the outward direction, so it folds back parallel to the base; both flange infos are recorded so the recursive flat pattern unfolds them (UP then DOWN). Wall length = (H − 2R(1−cosA) + T·cosA)/sinA so the jogged flat sits `height` from the base's fold-side face.
- `buildFlange` gained `toward: [x,y,z]` (a world direction that decides the fold side, overriding `reverse`), and the bend origin is now derived from the actual fold side (`dot(u, nF) > 0`) rather than from `reverse` — this was wrong whenever `toward` flipped the side.
- A peer session is mid-way through its own SVG dimension layer (`#dim-layer`, `#dim-edit`, `UI.drawDims`, `App.dimsStale`) in index.html, style.css, ui-core.js. My HTML dimension labels now use `App.dimLabelsStale` so the two do not fight; the next session should keep one of the two implementations. Peer sessions were not reachable by message when this was written.

## Run 2026-09-22T12 — first routine run under the head-and-subagents protocol

**Context.** Scheduled task `daily-code-limit`, unattended, head + three parallel subagents (kernel, commands, tests). No open board requests; no peer sessions (`ListAgents` is not available in the scheduled session, so the head worked solo). Two subagents were killed mid-read by the account's session rate limit at 12:4x and resumed with `SendMessage` after the 13:00 reset; the resumed agents kept their context and finished. Baseline before the run: kernel tests 199/199, UI smoke 20/20.

**Queue item resolved without code.** "Decide between the two sketch-dimension overlays": the baseline commit only contains the SVG `#dim-layer` implementation (`drawDims` in ui-sketch.js, `#dim-layer`/`#dim-edit` in index.html and style.css); the HTML-label version (`#dims`, `frameDims`, `dimLabelsStale`) no longer exists anywhere. The `dimensions` test group passes, so the decision is: SVG layer stays, nothing to delete.

**Done per lane.**
- `kernel` (kernel.js, csg.js): **Miter flange** — `flange` feature fields `miter` (bool), `miterGap` (default 0). `buildFlange` now builds a per-edge record list; ends of two selected edges within `max(1e-4, 1e-3·len)` are a shared corner. With `miter`, each tool is swept past the corner by `wmax·dot(o, n_b)/dot(dIn, n_b)` (capped at 4·wmax, +1) and clipped by the bisector plane through the shift-corrected corner point, offset by `miterGap/2` toward its own side (`CSG.prototype.clipByPlane(normal, w)`: intersection with an enclosing box whose one face is the plane, so the cap is watertight). Collinear neighbours, opposite fold directions and corners sharper than ~18° are left unmitred. **Auto relief** — `relief: 'none' | 'rect' | 'obround'`, `reliefWidth` (null = T), `reliefDepth` (null = T/2). At every unshared flange end two probe points half a thickness past the end (one inside the base plate, one on the outward side of the edge) are tested with `CSG.prototype.pointTester()` (BSP descent, boundary counts inside); if either is inside the body a slot `[tEnd, tEnd + w] × [−(shift + d), R + T + d]` through the full thickness is added to `ctx.flangeCut`, which `rebuild` already subtracts before the union; obround rounds the inner end with 12 segments. `Kernel.flangeProfile(A, R, T, L, ov)` exports the section loop. Flange info records gain `mitred: [bool, bool]`. Builder `p.flange(L, edges, { miter, miterGap, relief, reliefWidth, reliefDepth })`; `generateScript` emits only non-defaults (fixed point verified). **Degenerate geometry guards** — `sketchProfile` drops zero-area loops with the warning "N zero-area contour(s) was/were ignored." (through `profile.warnings`, same path as the open-contour warning) and tags self-crossing loops with `cross` (exact segment–segment test, O(n²)); `checkProfile` throws "Sketch profile crosses itself near (x, y). Trim or move the entities so the contour does not self-intersect." from extrude, revolve, sweep and loft. Non-finite depth/angle/draft/path coordinates error with "… must be a number." (`Builder.extrude` no longer coerces NaN to 0).
- `commands` (ui-commands.js, ui-panels.js, ui-app.js, icons.js): Edge-Flange PM gains a **Miter** group (Miter corners check, Gap when on) and an **Auto Relief** group (type select; "Use default width (T)"/value and "Use default depth (T/2)"/value pairs, folded back into `reliefWidth`/`reliefDepth` null-or-number by `toFeature`, UI-only keys deleted so they never reach the model or the cache key). `UI.cmdMiterFlange()` opens the same PM titled Miter-Flange with `miter: true`; ribbon Miter Flange button wired (new `miter` icon), Insert ▸ Sheet Metal ▸ Miter Flange, unnamed mitred flanges become `Miter-FlangeN`, tree icon and title ("Miter flange 20 long, 90°, 2 edges, mitred", ", relief rectangle|obround"). **Ribbon tooltips**: `UI.shortcutFor(id)` in ui-app.js mirrors the keydown handler (S, E, L, R, C, A, P, T, D, F, Ctrl+Z/Y/B/S/N/O, Ctrl+8, Space, Del, F2); `ribbonTitle` in ui-panels.js renders `Label (Key) — description` from a label-keyed help map, keeps the "not available in this build yet" suffix and sets `aria-label`. No CSS or DOM changes.
- `tests` (tests/, examples/, README.md): kernel-tests group `miter & relief` (6 tests: corner volume = 2·first moment of the o ≥ 0 profile, gap opens the corner and leaves 45° faces, three mitred edges, relief slot 9600 − 24 + F with obround bounds and a notched flat, no relief at a convex corner, script round-trip) plus 5 error/warning tests (bow-tie, NaN depth/string depth/NaN revolve, zero-area rect, nothing-left → no closed profile). UI smoke: two new steps (mitred flange through `anvil.run` with the tree title checked; the Miter-Flange PM flow picking two edges → `Miter-Flange1`). Example "Tray" (120×80 base, five-edge mitred flange with obround relief, hanging hole). README: ribbon list, Part methods, feature JSON, sheet-metal section, kernel API, diagnostics, limitations.

**Verified by the head.** kernel-tests 210/210, ui-smoke 22/22, app loads with no console errors; click flow Sheet Metal ▸ Miter Flange ▸ two edge picks ▸ ✓ commits `Miter-Flange1` (volume 20175.27 on the 100×60 sheet), the generated script line is `p.flange(20, [[0,2,30],[50,2,0]], { angle: 90, name: "Miter-Flange1", miter: true })`.

**Decisions.**
- Web Worker rebuilds were deferred (queue item 3): making `UI.rebuild` asynchronous ripples through every PM commit, `window.anvil.run` and the smoke tests, which is a three-lane change that needs a design first (see QUEUE.md note).
- Relief is opt-in (`relief: 'none'` default) so every existing sheet-metal volume test stays exact.
- The miter clip plane is offset along its normal by `gap/2`, so the material removed by a gap is √2·A·gap on a square corner, not A·gap; the test allows that range.

**Known gaps.**
- Flat pattern of a mitred flange: the wall unfolds with its real 45° extension but the bend strip stays edge-length, leaving a small step in the blank at each mitred corner (flat area = base + Σ len·(BA + L) + 2·R·L per corner). Cosmetic; queued.
- Relief slots that lie fully inside the plate appear in the flat as an enclosed slot loop rather than an outline notch; the test accepts either.

**Next up.**
1. Web Worker rebuilds (design first; see QUEUE.md).
2. Flat pattern: bend strips to the mitre line; thickness-aware normal cut.
3. Phase 4: faster CSG (bounding-box early-out per polygon).
4. Phase 6: icons closer to the SolidWorks set; dark theme.

## Run 2026-09-22T13 — Web Worker rebuilds, mitre flat pattern

**Context.** Scheduled task, head + three parallel subagents (kernel; sketch+commands as one subagent; tests). No open board requests, no peer sessions (`ListAgents` is not available in the scheduled session). The previous run's commit landed at 13:31 while this run was taking stock, so the tree was clean at planning time. Baseline: kernel tests 210/210, UI smoke 22/22. Mid-run another session committed a protocol change (per-lane board documents and run phases); the lane documents for this run were written by the head after the subagents returned. Queue item 1 (Web Worker rebuilds) was taken with the design fixed in the briefs: the worker owns `Kernel.rebuild` and its cache and posts back a packed build; `UI.rebuild` keeps a synchronous fallback.

**Done per lane.**
- `kernel` (csg.js, kernel.js, new worker.js): `CSG.prototype.pack()` → `{ verts: Float64Array(3·V), counts: Int32Array(P), planes: Float64Array(4·P), shared }`, `CSG.unpack(obj)` (planes copied, so `volume()` is bit-identical), `CSG.packTransferables`. `Kernel.rebuild` now also returns `profiles: {sketchId: profile}`; `Kernel.packBuild(build)`, `packTransferables`, `unpackBuild` (`cache: null`), `applyProfiles(model, profiles)`. Planes and flange records were already plain JSON, so no conversions. `worker.js`: `importScripts('csg.js', 'kernel.js')`, keeps the feature cache between messages, `{type:'rebuild', seq, model}` → `{type:'built', seq, build}` or `{type:'error', seq, message}`. **Mitre flat pattern:** flange info records gain `miterPlanes: [{n, w}|null, {n, w}|null]`; in `flatPattern` each mitred strip end is derived from that plane (wall corner at `ext = t0 + κ·Rt·sinA`, `κ = (o·n)/(dIn·n)`), so the bend strip is a trapezoid ending on the mitre line and the bend line reaches it too. Reference model (100×60 sheet, two mitred 20 mm flanges sharing a corner): e = R = 2, the step vertices at (−BA, 0)/(0, BA) are gone, blank area = old + R·BA = 10150.284, 8 outline points.
- `sketch` + `commands` (ui-core.js, ui-sketch.js, ui-commands.js, ui-panels.js, ui-app.js, style.css): `UI.rebuild(opts)` returns a Promise. Sync path (`App.workerOn` false, `opts.sync`, or no `Worker`) runs `rebuildSync` and returns a resolved promise flagged `applied: true`; async path posts the model to a lazily created `worker.js`, one message in flight, later calls coalesce into one pending request (`noSave` AND-ed) that is posted when the reply lands, stale replies (seq mismatch) dropped, reply → `unpackBuild` → `applyProfiles` → `applyBuild` (shared tail; `lastRebuildMs` = kernel time + apply time). Worker `error`/`messageerror`/`{type:'error'}`/`postMessage` throw → `disableWorker` (one toast) and a synchronous finish, so the promise always resolves. A sync rebuild while a worker request is in flight detaches it so the stale reply is ignored. New: `UI.afterRebuild(p, fn)`, `UI.whenIdle()`, `UI.setWorkerOn(on)` (localStorage `anvil.worker`, `'1'`/`'0'`), `App.workerOn` (default `window.Worker && http(s)`), `App.rebuilding`, status "Rebuilding…" with a pulsing `busy` dot. Boot uses `{ noSave: true, sync: true }` so the first frame has a body. Converted call sites: `commitFeature` (returns a promise resolving to the feature; all 13 `onOK` handlers return it; `pmOK` returns it or `whenIdle()`), `newSketchOnPlane/OnFace` (`enterSketch` in the tail), Hole Wizard, `deleteFeature`, `exitSketch` (pending callback and selection in the tail), `runScript` (resolves `{ok}`/`{error}`), macro pane, `fileOpen`, Ctrl+B and Edit ▸ Rebuild toast, `undo`/`redo`/`afterModelSwap`/`loadModel` (return the promise; `zoomToFit` in the tail). `window.anvil.run/append/load/rebuild` return promises (run/append reject on a script error, as they threw before); `anvil.busy()`, `anvil.idle()`, `anvil.workerOn(bool)`. Menu: Edit ▸ "Rebuild in background (Web Worker)" (checked). PM live previews stay synchronous.
- `tests` (tests/, README.md): `test(name, fn)` accepts a thenable (row shown as WAIT, settled on resolve/reject, 10 s timeout; summary and `__anvilTests` written only when nothing is pending). New group `pack & worker` (5 tests: exact pack/unpack round trip, packBuild/unpackBuild of the Sheet Metal Bracket incl. flatPattern equality, MessageChannel clone, transferables, worker end-to-end with cache reuse and a broken feature) and the mitre flat-pattern test in `miter & relief` → 216. Smoke: all steps converted to `await anvil.run` / `pmAccept()` / `await idle()`, 30 s per-step timeout, `localStorage['anvil.worker']` cleared before the frame loads; four new steps (worker on by default with busy and "Rebuilding…" observed, worker off is synchronous and persisted, three back-to-back runs coalesce to the last model, the Edit menu item toggles `workerOn`) → 26. README: `worker.js` row, "Background rebuilds" section, automation table, kernel API lines, mitre note.

**Verified by the head (over HTTP, port 8765).** kernel-tests 216/216, ui-smoke 26/26 (busy and "Rebuilding…" observed, coalescing volume 3000, menu check mark toggles), app loads with no console errors. Funnel + closed shell through the worker: 8.9 s build during which a 10 ms interval fired 873 times on the main thread (the UI stays live). Ribbon flow Boss-Extrude ▸ ✓ click with the worker on commits `Boss-Extrude1` (volume 8000, selection set, status line written from the promise tail).

**Decisions.**
- The worker keeps the feature cache; the main thread's `App.buildCache` is only refreshed on synchronous rebuilds, so the first sync rebuild after a worker phase is a full build. Acceptable; noted in QUEUE.
- `anvil.run`/`append` reject on script errors (unchanged behaviour, now asynchronous); `runScript` in the UI resolves `{error}` instead.
- The mitre strip end follows the wall's clipped end line (a pentagon with the epsilon overlap) so non-90° mitres give no slivers.

**Known gaps.**
- Pre-existing (found by the kernel lane): two `position: "outside"` flanges sharing a corner do not attach in the flat pattern; the `attached` check uses the untrimmed edge ends. Queued.
- Kernel tests run from `file://` in headless Chrome with a virtual-time budget time out on the worker test; over HTTP with real time it passes.

**Next up.**
1. Thickness-aware "normal cut" for sheet metal (kernel + PM).
2. Flat pattern: attach Material-Outside flanges that share a corner.
3. Phase 4: faster CSG (bounding-box early-out per polygon).
4. Phase 6: icons closer to the SolidWorks set; dark theme.
