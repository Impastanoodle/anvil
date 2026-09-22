# ''anything'' — scheduled-task workspace

This folder is the workspace for the `daily-code-limit` scheduled task: keep pouring effort into ONE ongoing project across sessions. The user picked the project on 2026-09-21 and does not want it switched again without asking:

> a CAD program that is best for Claude's own use to draw and create 3D models, with a UI that has all features in the same placement as SolidWorks.

## The project: Anvil (`anvil/`)

Browser-based parametric solid modeler. Static files, no build step. three.js r128 loads from cdnjs; everything else is hand-written.

**Start every session by reading, in this order:**
1. `anvil/SESSION_LOG.md` — what the last session did, known bugs, "next up".
2. `anvil/ROADMAP.md` — phased plan with checkboxes.
3. `anvil/README.md` — script API and feature JSON (owned by a parallel session; may lag the code).

**End every session by:** appending a dated entry to `anvil/SESSION_LOG.md`, ticking `ROADMAP.md`, opening `http://localhost:8765/tests/kernel-tests.html` in the browser pane and confirming all tests pass, loading the app to confirm no console errors, and republishing the artifact (`Artifact` with `url` https://claude.ai/artifact/Dhex98h8xugn5w2RXraAPS, `root: anvil`, files map of style.css, csg.js, kernel.js, icons.js, examples/examples.js, ui-*.js).

Browser-pane testing notes: navigating to the same URL can serve stale scripts, so reload with `location.reload()` through `javascript_tool`; never name a REPL variable `top` (it is `window.top`).

## Files and ownership

| File | Purpose |
|---|---|
| `csg.js` | BSP CSG booleans (`CSG.fromPolygons`, `union`, `subtract`, `intersect`, `transform`, `volume`) |
| `kernel.js` | `Kernel`: planes, sketch profiles, extrude/revolve/pattern/mirror tools, `rebuild`, `meshFromBody`, `massProps`, `faceOutline`, STL/DXF export, `Builder` script API, `generateScript` |
| `icons.js` | `Icons(name, size)` inline SVG set |
| `ui-core.js` | `UI` namespace: state (`UI.App`), three.js scene, camera, picking, highlights, edges, rebuild wrapper, undo |
| `ui-sketch.js` | viewport mouse/touch, sketch mode, sketch tools |
| `ui-commands.js` | PropertyManager renderer and every feature command |
| `ui-panels.js` | ribbon, menu bar, feature tree, HUD, status, modal |
| `ui-app.js` | task pane, script console, files/exports, mass properties, shortcuts, `window.anvil`, boot |
| `serve.ps1` | local static server (`.claude/launch.json` config "anvil", port 8765) |
| `tests/`, `examples/`, `README.md` | owned by the parallel helper session; report kernel bugs to it rather than expecting it to edit kernel.js |

## Coordinating with other sessions

Cross-session messaging is enabled for this project in `.claude/settings.json` (`crossSessionInbound: "accept"`, `SendMessage` and `ListAgents` allowed). At the start of a session, run `/list-agents` (alias `/peers`) or call `ListAgents` to see which peer sessions are running. If a helper session is listed, use `SendMessage` to hand it kernel bug reports, test/README updates, or a short "what I changed this session" note instead of leaving it only in `SESSION_LOG.md`. Peer sessions only appear while they are running; if the list is empty, work solo and record everything in `SESSION_LOG.md` as usual. Never add `SendMessage` or `ListAgents` to a `permissions.deny` list — that also disables messaging to subagents.

## Running locally

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File anvil\serve.ps1 -Port 8765
```
Then open http://localhost:8765/ in the browser pane. `window.anvil` exposes `run(code)`, `append(code)`, `script()`, `model()`, `load(json)`, `stl()`, `dxfFace(i)`, `mass()`, `faces()`, `png()`, `summary()` for driving it from `javascript_tool`.

## Conventions

- ES5-style JavaScript (`var`, function expressions) so the files stay readable and diff-friendly; no bundler.
- Sketch frames: Front (x=X, y=Y, n=Z), Top (x=X, y=-Z, n=Y), Right (x=-Z, y=Y, n=X). Extrudes go along +n unless `reverse`.
- Every new feature type needs: kernel `buildTool` case, `isCut` handling, `generateScript` case, a PropertyManager command, `editFeature` dispatch, a tree icon, and a ROADMAP tick.
- UI text follows SolidWorks names (Boss-Extrude, Cut-Extrude, LPattern, PropertyManager, FeatureManager) so users find things where they expect them.
- No git repo has been initialised (the user has not asked for one); do not `git init` unprompted.
