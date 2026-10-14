# Tests — agent map
Read this first; find line numbers with `grep -n <name> anvil/docs/INDEX.md`. Update this card at the end of any lane that touched this area (add what you had to dig for; fix what is wrong).

## Files — one line each: what the file owns
- `tests/kernel-tests.html` — engine tests, no UI (~445 lines: script list, harness, helpers, `GROUPS`, loader, summary). Loads csg / kernel*.js, sketch-font, dxf-import, nest, holewizard, sketch-solver, exchange, assembly, materials, examples, drawing*.js (engine only), evaluate, ui-select, headless/dxf-check. Runs in the browser or under Node.
- `tests/kernel/*.js` — ~145 kernel group files (`drawings.js`, `sheet-metal.js`, `p9-*.js`, `r3…r15-*.js`, `rfXX.js`).
- `tests/ui-smoke.html` — app-level regression (~430 lines): loads `../index.html` in an iframe (880 px min width) and drives it; helpers, `GROUPS`, loader, runner (30 s per step), `?only=`, `?watch`.
- `tests/smoke/*.js` — ~168 smoke group files, same naming.
- `tests/split-tests.js` — `--check` (default): every `GROUPS` file exists and parses, every folder `.js` is listed, the page helpers need no group-only name; notes duplicate top-level names. `--split` was the one-off splitter.
- `tests/occt-tests.html` — every example + feature models on both kernels (OpenCascade valid, volume / bbox / body count match, STEP / IGES round trips); needs `vendor/occt` (`vendor/get-occt.ps1`); browser only (87 rows).
- `tests/bench.html` + `tests/BENCHMARKS.md` — timings and dated baselines. `tests/fixtures/` — DXF / DWG / STEP inputs.
- `headless/anvil.js` — Node runner (`test`, `example`, `build`, `drawing`, `dxf2sketch`); `headless/load.js` loads the engine from the kernel-tests script list; `headless/ui-smoke.js` — headless Chrome driver for ui-smoke over DevTools (Node 22+, no npm).

## Entry points — commands
- `node anvil/tests/split-tests.js --check` — after adding / renaming any group file. Exit 1 on a problem.
- `node anvil/headless/anvil.js test` (`npm test`) — whole kernel page under Node (1157 / 1157 at 2026-10-14; about a minute). No per-group filter: run it all.
- `node anvil/headless/anvil.js example --all [--occt]` — every Design Library example against its documented volume (29 / 29, both kernels).
- `node anvil/headless/ui-smoke.js http://localhost:<89xx>/tests/ui-smoke.html --port <94xx>` — full smoke (701 / 701, about 1.5 min); options `--timeout <s>` (420), `--chrome <path>`, `--keep`. Needs the server running; prints the summary and every FAIL row; exit 0 / 1 / 2.
- One area only: `.../tests/ui-smoke.html?only=rfXX` (substring of the step name) through the same driver.
- Server: `powershell -NoProfile -ExecutionPolicy Bypass -File anvil\serve.ps1 -Port <89xx>` in the background from your own worktree; stop it when done.
- occt: open `http://localhost:<port>/tests/occt-tests.html`, `location.reload()`, poll the PASS / FAIL count about every 30 s; every non-TODO row must pass.
- Results in-page: `window.__anvilSmoke = { passed, total, results, errors }`, `window.__anvilTests` (kernel).

## How things are done here — the patterns to copy
- A lane adds `tests/smoke/rfXX.js` and / or `tests/kernel/rfXX.js` (next free letters: `ls anvil/tests/smoke anvil/tests/kernel`) and one `GROUPS` line in each page, normally at the end, **with a trailing comma** (`'smoke/rfXX.js',`) so parallel lanes append without touching the line above. Then `split-tests.js --check`.
- File head: a marker comment `// --- rfXX (date, lane XX: what) ---`, then code indented two spaces (the files are joined and run by one direct `eval` inside the page script, so they see every page helper and each other's top-level names).
- Smoke step: `step('rfXX: what the user does and sees', async function () { await anvil.newPart(); await idle(); …; return 'detail'; });` — imitate `smoke/rfCB.js`. Start from a fresh document, await every rebuild (`await anvil.run(code); await idle();`, `await UI.pmOK(); await idle();`), drive with real DOM events, reset any setting you change (theme, units, localStorage), return a short detail string.
- Kernel group: `(function () { group('rfXX: …'); test('rfXX: …', function () { var r = build(code); noErrors(r); nearRel(r.mp.volume, expected, 1e-9, 'volume'); }); })();` — imitate `kernel/rfBZ.js`. Analytic expectations, not snapshots. A test returning a thenable is async (10 s timeout).
- Self-contained: helpers only your file uses are prefixed with the group name (`rfBXclick`, `caSettle`). Reusing an earlier group's helper works (rfCA uses rfBX's) but ties the files; a helper several groups share belongs above `GROUPS` in the page.
- Step titles are single-quoted strings: escape apostrophes (`\'`).
- For agents: read only the page helper section (top to `// ---- test groups`) and your own group file; never the whole `GROUPS` list or other groups unless you need a helper.

## Data shapes — helpers worth using
ui-smoke.html (page): `W` (app window), `D` (app document), `K` (Kernel), `UI`, `anvil`, `$(id)`, `errors` (uncaught / console.error from the app).
- `step(name, fn)` register; `assert(c, msg)`, `fail(msg)`, `near(a, b, tol, label)`, `wait(ms)`, `idle()` (= `UI.whenIdle()`), `fmt(n)`.
- `pmField(labelText)` — the input of the PM row whose label contains the text; `pmInputs()`, `pmNumber(i)`, `setInput(inp, v)` (fires input + change), `clickPmButton(text)`, `pmAccept()` (pmOK + idle).
- `pressEnter(el)`, `enterTwice(el)` — the two-Enter rule (commit, then ✓).
- `modalOpen()`, `clickModalButton(text)`, `menuRows(text)` (opens the menu bar entries, returns matching rows), `statusText()`, `names()` (feature names).
- `faceWithNormal([x, y, z])` (largest face with that normal), `edgeNear(p)`, `polyCircleArea(r)`, `meshSegs(r)`, `meshCircleArea(r)`.
Shared helpers declared in group files (usable by later groups):
- `sketch-relations-and-the-constraint.js`: `vpEvent(type, p, target)`, `skScreen(u, v)`, `skClick(u, v)`, `activeSketch()`, `relList()`, `statusRight()`.
- `drawings.js`: `ribbonButton(label)`, `dwTab(name)`, `dwMenu(text)`, `ribbonTabs()`, `dwView(orient)`, `paperToClient(p)`, `sheetMouse(type, p)`, `key(k)`, `plateCode()`.
- `sub-assemblies.js`: `until(fn, ms, label)` (poll), `rightClick(row)`; `advanced-mates.js`: `pmSelect(key)`, `pmButton(text)`, `ribbonLabelButton(re)`; `distance-angle-mates.js`: `exByName(name)`, `dragViewport(from, to)`; `materials-and-custom-properties.js`: `menuItem(re)`; `selection.js`: `selClick`, `selDrag`, `selKey`.
kernel-tests.html: `group(name)`, `test(name, fn)`, `assert`, `near`, `nearRel(a, b, rel)`, `nearVec`, `build(code)` -> `{ model, build, body, mesh, mp, errors, warnings }`, `buildAsm(code)`, `buildExample(ex)`, `noErrors(r)`, `consistentVolume(r)`, `polyVol(mp)`, `withLegacy(fn)`, `circleArea(r)`, `segsForRadius(r)`; `kernel/drawings.js` adds `drawingOf(code, opts)` (doc + Standard 3 View + compute).

## Tests — how to run fast
1. While working: `node anvil/headless/anvil.js test` (engine) and `ui-smoke.html?only=rfXX` through `headless/ui-smoke.js`.
2. Before reporting: `split-tests.js --check`, the full kernel run, `example --all`, one full ui-smoke run. The head runs `example --all --occt` and occt-tests.html.

## Traps
- Ports: 8812 is the head's server; agents use 89xx for serve.ps1 and 94xx for Chrome's debugging port (`--port`); 8883 / 8884 are taken (Dell SupportAssist); 8765 cannot be bound on this machine.
- The browser pane is shared and gives unreliable smoke runs (needs ≥ 880 px, visible, not resized); use headless Chrome. In the pane a plain navigate can serve stale scripts: `location.reload()`; never name a REPL variable `top`.
- serve.ps1 is single-threaded; a client that does not drain a response blocks it (the driver's pre-flight is a HEAD for that reason).
- Known flakes on this machine: `r11/occtswap11` (held-frame timing, ~1500 ms estimate) and `r13/trim13` (timing) fail now and then in full runs and pass alone: rerun alone with `?only=` before chasing them.
- A group file that fails to load or parse shows as one FAIL row and is not filtered by `?only` (you will see it on every filtered run).
- Two group files declaring the same top-level name: the later one wins everywhere (split-tests lists it as a note), silently changing other groups' helpers. Prefix your helpers.
- The page clears `anvil.worker`, `anvil.theme`, panel widths (`anvil.fmWidth` / `tpWidth`), `anvil.drawingTemplates`, `anvil.recover` at load and **sets `anvil.units` to 'mm'**: new documents in the suite are metric (the app's default is inches), so an inch test starts its script with `p.units("in");`. Anything else you set in localStorage leaks into later groups: reset it.
- `errors[]` is not asserted globally: assert it yourself around your steps (`var e0 = errors.length; … assert(errors.length === e0, errors.slice(e0).join(' | '))`, as basics.js does).
- Drawings: views arrive from a worker; `await UI.drawing.ready()` after `anvil.drawing.make()` or an edit. Rebuilds: always `await idle()`.
- Every step has a 30 s timeout ("a rebuild never settled?").
- A new engine file must be added to the kernel-tests.html script list (headless/load.js reads it) or Node tests will not see it.
- Kernel bugs found from the tests lane are reported to the head, not fixed in kernel files from this lane (CLAUDE.md).
- Colour tests (rfBQ / rfBU / rfCD / rfBR) scan style.css, drawing.css and icons for blue: a blue literal anywhere fails them.
