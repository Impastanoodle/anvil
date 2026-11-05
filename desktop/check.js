// check.js — proves the built app works, by script (Chrome DevTools Protocol over --remote-debugging-port, Node's own
// WebSocket; no packages). Every run uses a throw-away user-data folder in %TEMP%, never the real %APPDATA%\Anvil.
//   node check.js app     [--exe dist\win-unpacked\Anvil.exe]  load, no console errors, a part (volume 4), OpenCascade
//                         drives it, Save As of a DXF, DXF->DWG->DXF through the converter endpoints, one instance only;
//                         then a restart: settings kept, OpenCascade loads again, and the 503 reply with no converter;
//                         then the engines checks below
//   node check.js engines [--exe ...]  OpenCascade for Windows (occt-host.js) is the engine; volume 4; an example and a
//                         perforated panel match the WebAssembly engine to 1e-9; Cancel mid-build; the engine process
//                         killed; the addon folder hidden / an addon that cannot load fall back to WebAssembly; and a
//                         timing table, WebAssembly against native, inside the app
//   node check.js tests   [--only rfA]   the kernel tests (one slice) inside the app's app:// protocol (ANVIL_ROOT=../anvil)
//   node check.js update  --folder <release folder> [--exe ...]  the app offers the update found in that folder
//   node check.js files   [--exe ...]  File ▸ Open / Ctrl+S / Save As / exports through Windows' boxes (stood in for)
//   node check.js update-restart [--exe ...]  Restart to update end to end with a stand-in installer (.cmd), both a
//                         good install and a failed one; update.log
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
const cmd = args[0] || 'app';
function opt(name, def) { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; }
const EXE = path.resolve(opt('exe', args.includes('--dev') ? path.join(__dirname, 'node_modules', 'electron', 'dist', 'electron.exe') : path.join(__dirname, 'dist', 'win-unpacked', 'Anvil.exe')));
const PORT = +opt('port', 9493);
const WORK = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-check-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function ok(cond, what, detail) { console.log((cond ? 'PASS ' : 'FAIL ') + what + (detail !== undefined ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : '')); if (!cond) failures++; }

function launch(env, extra) {
  // --dev runs the sources with the installed Electron instead of the built exe
  const pre = args.includes('--dev') ? [__dirname] : [];
  const child = spawn(EXE, pre.concat(['--remote-debugging-port=' + PORT], extra || []),{ env: Object.assign({}, process.env, env), stdio: 'ignore' });
  child.exitPromise = new Promise((r) => child.on('exit', (code) => r(code)));
  return child;
}
async function connect(urlPrefix, timeoutMs) {
  const t0 = Date.now();
  for (;;) {
    try {
      const list = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const t = list.find((x) => x.type === 'page' && x.url.startsWith(urlPrefix));
      if (t) return cdp(t.webSocketDebuggerUrl);
    } catch (e) { /* not up yet */ }
    if (Date.now() - t0 > (timeoutMs || 30000)) throw new Error('no page ' + urlPrefix + ' on port ' + PORT);
    await sleep(300);
  }
}
function cdp(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl), pending = new Map(), errors = [], warnings = [];
    let id = 0;
    ws.onerror = (e) => reject(new Error('websocket: ' + (e.message || 'error')));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); return; }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'warning') warnings.push(msg.params.args.map((a) => a.value || a.description).join(' '));
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') errors.push(msg.params.entry.text + ' ' + (msg.params.entry.url || ''));
    };
    const send = (method, params) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
    // evaluates an expression (awaiting a promise) and returns its JSON value
    const ev = async (expr, timeoutMs) => {
      const r = await Promise.race([send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }),
        sleep(timeoutMs || 120000).then(() => { throw new Error('timed out: ' + expr.slice(0, 80)); })]);
      if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception && r.exceptionDetails.exception.description) || r.exceptionDetails.text);
      return r.result.value;
    };
    const waitFor = async (expr, timeoutMs) => {
      const t0 = Date.now();
      for (;;) { try { const v = await ev(expr, 10000); if (v) return v; } catch (e) { /* page still loading */ } if (Date.now() - t0 > (timeoutMs || 60000)) throw new Error('waited too long for ' + expr); await sleep(250); }
    };
    ws.onopen = async () => { await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); resolve({ ws, send, ev, waitFor, errors, warnings, close: () => ws.close() }); };
  });
}
function readLog(file) { try { return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch (e) { return []; } }
// closes the app the way a user does (WM_CLOSE to its window, as the X button), skipping Anvil's "unsaved changes"
// question
async function quit(page, child) {
  await page.ev("if (window.UI) UI.isDirty = function () { return false; }; true");
  page.close();
  spawn('taskkill', ['/PID', String(child.pid)], { stdio: 'ignore' });
  const code = await Promise.race([child.exitPromise, sleep(15000).then(() => 'still running')]);
  if (code === 'still running') child.kill();
  return code;
}

async function checkApp() {
  const ud = path.join(WORK, 'userdata'), saveDir = path.join(WORK, 'saved'), log = path.join(WORK, 'events.log');
  fs.mkdirSync(saveDir, { recursive: true });
  // an update folder that does not exist: no checks, no messages
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ updateFolder: path.join(WORK, 'no-such-folder') }));
  const env = { ANVIL_USER_DATA: ud, ANVIL_TEST_SAVE_DIR: saveDir, ANVIL_TEST_LOG: log, ANVIL_UPDATE_DELAY_MS: '500' };
  let child = launch(env);
  let page = await connect('app://anvil/');
  await page.waitFor('window.anvil && window.anvil.run && document.readyState === "complete"', 60000);
  ok(await page.ev('location.origin') === 'app://anvil', 'served from app://anvil', await page.ev('location.href'));
  ok(await page.ev('!!(window.anvilDesktop && window.anvilDesktop.isDesktop)'), 'desktop bridge present', await page.ev('window.anvilDesktop.version'));
  ok(await page.ev('window.isSecureContext && !!crypto.subtle'), 'secure context (crypto.subtle, needed by the engine check)');
  // a part
  await page.ev('anvil.run(\'p.sketch("Front").rect(0,0,4,2).extrude(0.5)\')');
  const vol = await page.ev('anvil.mass().volume');
  ok(Math.abs(vol - 4) < 1e-6, 'p.sketch("Front").rect(0,0,4,2).extrude(0.5) builds a part of volume 4', vol);
  // OpenCascade: on by default when the engine is served; it loads and drives the part
  await page.waitFor('anvil.occt().on', 20000).catch(() => null);
  const t0 = Date.now();
  await page.ev('anvil.occtIdle()', 180000);
  await page.waitFor('anvil.occt().state === "ok" && anvil.occt().driving', 120000).catch(() => null);
  const occ = await page.ev('anvil.occt()');
  ok(occ && occ.state === 'ok' && occ.driving, 'OpenCascade loads in the app and drives the part', { state: occ.state, driving: occ.driving, loadMs: occ.loadMs, waitedMs: Date.now() - t0, error: occ.error });
  const vol2 = await page.ev('anvil.mass().volume');
  ok(Math.abs(vol2 - 4) < 1e-4, 'volume with OpenCascade driving', vol2);
  // the engine is OpenCascade for Windows (desktop/native, in occt-host.js's process), not the WebAssembly worker
  const nready = readLog(log).find((e) => e.event === 'occt-native-ready');
  ok(occ.engine === 'native' && !!nready, 'the page uses OpenCascade for Windows (native engine process)', { engine: occ.engine, hostReady: nready || null });
  ok(Math.abs(occ.volume - 4) < 1e-9, 'Front 4 x 2 x 0.5: OpenCascade\'s own volume is 4', occ.volume);
  // Save As of a DXF (the dialog is stood in for by ANVIL_TEST_SAVE_DIR; the offer and its defaults are logged)
  const dxf = await page.ev('anvil.dxfFace(anvil.faces().findIndex(function (f) { return f.normal[2] > 0.99; }))');
  ok(typeof dxf === 'string' && /ENTITIES/.test(dxf), 'a DXF of the front face', (dxf || '').length + ' chars');
  await page.ev('UI.download("bracket.dxf", ' + JSON.stringify(dxf) + ', "application/dxf"); true');
  await page.waitFor('true', 1000);
  for (let i = 0; i < 40 && !readLog(log).some((e) => e.event === 'download-done'); i++) await sleep(250);
  const offered = readLog(log).find((e) => e.event === 'download-offered'), done = readLog(log).find((e) => e.event === 'download-done');
  ok(offered && offered.name === 'bracket.dxf' && /bracket\.dxf$/.test(offered.defaultPath) && offered.filters[0] === 'dxf', 'Save As offered with the suggested name and a DXF filter', offered);
  ok(done && done.state === 'completed' && fs.existsSync(path.join(saveDir, 'bracket.dxf')) && fs.readFileSync(path.join(saveDir, 'bracket.dxf'), 'utf8') === dxf, 'the DXF saved byte for byte', done && done.path);
  // errors so far, before (test log) and after (DevTools) the debugger attached; the probes below answer 4xx on purpose
  const errs = page.errors.concat(readLog(log).filter((e) => e.event === 'console-error').map((e) => e.message + ' ' + e.source + ':' + e.line));
  ok(errs.length === 0, 'no console errors', errs.slice(0, 5));
  // the converter endpoints
  const head = await page.ev("fetch('api/dxf2dwg', { method: 'HEAD' }).then(function (r) { return { status: r.status, conv: r.headers.get('X-Anvil-Converter') }; })");
  ok(head.status === 200 || head.status === 503, 'HEAD api/dxf2dwg answers', head);
  if (head.status === 200) {
    const r = await page.ev("fetch('api/dxf2dwg', { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: " + JSON.stringify(dxf) + " }).then(function (r) { return r.arrayBuffer().then(function (b) { window.__dwg = b; var u = new Uint8Array(b); return { status: r.status, type: r.headers.get('Content-Type'), disp: r.headers.get('Content-Disposition'), conv: r.headers.get('X-Anvil-Converter'), bytes: b.byteLength, tag: String.fromCharCode.apply(null, u.slice(0, 6)) }; }); })");
    ok(r.status === 200 && r.type === 'application/acad' && /^AC10/.test(r.tag), 'POST api/dxf2dwg converts the DXF to a DWG', r);
    const back = await page.ev("fetch('api/dwg2dxf', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: window.__dwg }).then(function (r) { return r.text().then(function (t) { return { status: r.status, type: r.headers.get('Content-Type'), hasEntities: /ENTITIES/.test(t), chars: t.length }; }); })");
    ok(back.status === 200 && back.type === 'application/dxf' && back.hasEntities, 'POST api/dwg2dxf reads the DWG back to a DXF', back);
    const bad = await page.ev("fetch('api/dwg2dxf', { method: 'POST', body: 'hello world' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })");
    ok(bad.status === 400 && /Not a DWG file/.test(bad.body.error), 'a non-DWG upload gets serve.ps1\'s 400', bad);
    const empty = await page.ev("fetch('api/dxf2dwg', { method: 'POST', body: '  ' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })");
    ok(empty.status === 400 && /Empty request body/.test(empty.body.error), 'an empty DXF gets serve.ps1\'s 400', empty);
    const put = await page.ev("fetch('api/dxf2dwg', { method: 'PUT', body: 'x' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })");
    ok(put.status === 405, 'a PUT gets serve.ps1\'s 405', put);
  }
  const miss = await page.ev("fetch('no-such-file.js').then(function (r) { return r.status; })");
  ok(miss === 404, 'a missing file is a 404');
  const wasm = await page.ev("fetch('vendor/occt/opencascade.full.wasm', { method: 'HEAD' }).then(function (r) { return { status: r.status, type: r.headers.get('Content-Type'), length: r.headers.get('Content-Length') }; })");
  ok(wasm.status === 200 && wasm.type === 'application/wasm', 'the engine is served as application/wasm', wasm);
  // one instance: a second launch hands over to the first and exits
  const second = spawn(EXE, args.includes('--dev') ? [__dirname] : [], { env: Object.assign({}, process.env, env), stdio: 'ignore' });
  const code2 = await Promise.race([new Promise((r) => second.on('exit', r)), sleep(15000).then(() => 'still running')]);
  if (code2 === 'still running') second.kill();
  ok(code2 === 0, 'a second launch exits and focuses the first window', code2);
  ok(await page.ev('!!window.anvil'), 'the first window is still there');
  await page.ev("localStorage.setItem('anvil.desktopCheck', 'kept'); true");
  const updLog = readLog(log).filter((e) => e.event === 'update-check');
  ok(updLog.length && updLog[0].result === 'no folder' && !(await page.ev("!!document.getElementById('anvil-desktop-update')")), 'no update folder: a silent check, no prompt', updLog[0]);
  const exit1 = await quit(page, child);
  ok(exit1 === 0, 'closed cleanly', exit1 === 0 ? 0 : { exit: exit1, events: readLog(log).slice(-4).map((e) => e.event) });
  const wstate = JSON.parse(fs.readFileSync(path.join(ud, 'window-state.json'), 'utf8'));
  ok(wstate.window && wstate.window.bounds && wstate.window.bounds.width > 0, 'window size and place remembered', wstate.window);

  // ---- a restart, now with no converter (ANVIL_LIBREDWG names a folder without one; ODA not installed)
  fs.writeFileSync(log, '');
  child = launch(Object.assign({}, env, { ANVIL_LIBREDWG: path.join(WORK, 'no-converter') }));
  page = await connect('app://anvil/');
  await page.waitFor('window.anvil && window.anvil.run && document.readyState === "complete"', 60000);
  ok(await page.ev("localStorage.getItem('anvil.desktopCheck')") === 'kept', 'localStorage kept across a restart');
  await page.ev('anvil.run(\'p.sketch("Front").rect(0,0,4,2).extrude(0.5)\')');
  await page.waitFor('anvil.occt().on', 20000).catch(() => null);
  const t1 = Date.now();
  await page.ev('anvil.occtIdle()', 180000);
  await page.waitFor('anvil.occt().state === "ok" && anvil.occt().driving', 120000).catch(() => null);
  const occ2 = await page.ev('anvil.occt()');
  ok(occ2.state === 'ok' && occ2.driving, 'after a restart OpenCascade is on again and drives the part', { state: occ2.state, driving: occ2.driving, loadMs: occ2.loadMs, waitedMs: Date.now() - t1 });
  const errs2 = page.errors.concat(readLog(log).filter((e) => e.event === 'console-error').map((e) => e.message));
  ok(errs2.length === 0, 'no console errors after the restart', errs2.slice(0, 5));
  const h503 = await page.ev("fetch('api/dxf2dwg', { method: 'HEAD' }).then(function (r) { return r.status; })");
  const p503 = await page.ev("fetch('api/dxf2dwg', { method: 'POST', body: '0\\nEOF' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })");
  const d503 = await page.ev("fetch('api/dwg2dxf', { method: 'POST', body: 'AC1015xx' }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })");
  ok(h503 === 503 && p503.status === 503 && p503.body.error === 'No DXF to DWG converter on this server' && d503.status === 503 && d503.body.error === 'No DWG to DXF converter on this server',
    'with no converter: the same 503 replies as serve.ps1', { head: h503, post: p503, dwg2dxf: d503.status });
  await quit(page, child);
}

// ---- OpenCascade engines: the native one (occt-host.js) against the WebAssembly worker, inside the app ------------
const EXAMPLE = 'Sheet-metal U-bracket';
function panelCode(cols, rows) {   // desktop/native/bench.js's perforated panel: cols x rows Ø6 holes at 10 mm pitch
  let code = 'p.units("mm");\np.sketch("Front").rect(0, 0, ' + (cols * 10 + 10) + ', ' + (rows * 10 + 10) + ').extrude(2);\nvar s = p.sketch("Front", 2);\n';
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) code += 's.circle(' + (10 + 10 * i) + ', ' + (10 + 10 * j) + ', 3);\n';
  return code + 's.cut("through", { reverse: true });\n';
}
const PANEL = [15, 10];   // 150 holes: a few seconds natively (600 take ~45 s native, ~3.5 min WebAssembly)
function panelVolume(cols, rows) { return (cols * 10 + 10) * (rows * 10 + 10) * 2 - cols * rows * Math.PI * 9 * 2; }
// a build sent straight to the engine (the page's own worker object, its reply caught before ui-occt.js sees it), so
// Anvil's own kernel does not build the holes first; cancelAfter: switch OpenCascade off (terminate) after that
// many ms instead of waiting
function directBuild(page, code, cancelAfter) {
  return page.ev("(function () { var m = Kernel.newModel('B'); Kernel.runScript(m, " + JSON.stringify(code) + "); var w = UI.App.occt.worker, prev = w.onmessage, t0 = performance.now(), SEQ = 990001;" +
    "return new Promise(function (res) {" +
    "  w.onmessage = function (e) { var d = e.data || {}; if (d.seq !== SEQ) return prev && prev.call(w, e); w.onmessage = prev; var r = d.result || {};" +
    "    res({ type: d.type, occtMs: performance.now() - t0, buildMs: r.ms && r.ms.build, meshMs: r.ms && r.ms.mesh, volume: r.volume, valid: r.valid, message: d.message }); };" +
    "  w.postMessage({ type: 'build', seq: SEQ, model: JSON.parse(JSON.stringify(m)), noCache: true });" +
    (cancelAfter != null ? "  setTimeout(function () { w.onmessage = prev; anvil.occt(false); res({ cancelled: true, afterMs: performance.now() - t0 }); }, " + cancelAfter + ");" : '') +
    "}); })()", 600000);
}
// ms since the page opened until OpenCascade said ready
const FIRST_READY = "new Promise(function (res) { (function p() { var s = window.UI && UI.App && UI.App.occt; if (s && s.ready) res({ ms: performance.now(), engine: s.engine, loadMs: s.loadMs }); else if (s && s.state === 'failed') res({ failed: s.error }); else setTimeout(p, 5); })(); })";
// switch OpenCascade off and on (a fresh engine process / worker): ms until ready, and until the part is built
const RESTART = "new Promise(function (res) { anvil.occt(false); var t0 = performance.now(), tr = null; anvil.occt(true); (function poll() { var s = UI.App.occt; if (s.ready && tr == null) tr = performance.now() - t0; " +
  "if (tr != null && s.state !== 'loading' && s.state !== 'building' && !s.busy) return res({ readyMs: tr, builtMs: performance.now() - t0, loadMs: s.loadMs, state: s.state, engine: s.engine }); if (performance.now() - t0 > 300000) return res({ timeout: true, state: s.state }); setTimeout(poll, 5); })(); })";
// runs a script; Anvil's own build, then OpenCascade's (engine times: r.ms.build / r.ms.mesh)
function timeRun(page, code) {
  return page.ev('(function () { var t0 = performance.now(); return anvil.run(' + JSON.stringify(code) + ').then(function () { var t1 = performance.now(); return anvil.occtIdle().then(function (s) { ' +
    'return { anvilMs: t1 - t0, totalMs: performance.now() - t0, occtMs: performance.now() - t1, state: s.state, engine: s.engine, volume: s.volume, faces: s.faces, buildMs: s.ms && s.ms.build, meshMs: s.ms && s.ms.mesh }; }); }); })()', 600000);
}
const r1 = (x) => (x == null ? '-' : Math.round(x));

async function engineRun(name, env, opts) {
  const ud = path.join(WORK, 'ud-' + name), log = path.join(WORK, 'events-' + name + '.log');
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ updateFolder: path.join(WORK, 'no-such-folder') }));
  const child = launch(Object.assign({ ANVIL_USER_DATA: ud, ANVIL_TEST_LOG: log, ANVIL_UPDATE_DELAY_MS: '3600000' }, env));
  const page = await connect('app://anvil/');
  const out = { name };
  try {
    await page.waitFor('window.anvil && window.anvil.run && window.UI && UI.App && UI.App.occt && document.readyState === "complete"', 60000);
    out.first = await page.ev(FIRST_READY, 300000);
    const simple = await timeRun(page, 'p.sketch("Front").rect(0,0,4,2).extrude(0.5)');
    out.simple = simple;
    out.engine = simple.engine;
    if (opts.fallback) {
      // the Windows engine could not load: the WebAssembly worker took over, once, quietly but for a console note
      const notes = page.warnings.filter((w) => /OpenCascade for Windows did not run/.test(w));
      const errs = page.errors.concat(readLog(log).filter((e) => e.event === 'console-error').map((e) => e.message));
      ok(simple.engine === 'wasm' && simple.state === 'ok' && Math.abs(simple.volume - 4) < 1e-9 && notes.length === 1 && errs.length === 0,
        opts.fallback + ': the WebAssembly engine takes over, builds the part (volume 4) and says so once on the console',
        { engine: simple.engine, state: simple.state, volume: simple.volume, consoleNotes: notes, errors: errs.slice(0, 3), host: readLog(log).filter((e) => /^occt-native/.test(e.event)).map((e) => e.event + (e.message ? ': ' + e.message : '')).slice(0, 3) });
      return out;
    }
    ok(simple.engine === opts.engine && simple.state === 'ok' && Math.abs(simple.volume - 4) < 1e-9, name + ': Front 4 x 2 x 0.5 through OpenCascade has volume 4', { engine: simple.engine, state: simple.state, volume: simple.volume });
    out.restart = await page.ev(RESTART, 300000);
    ok(out.restart.state === 'ok' && out.restart.engine === opts.engine, name + ': switched off and on, a fresh engine starts and builds the part', out.restart);
    const code = await page.ev('(AnvilExamples.filter(function (e) { return e.name === ' + JSON.stringify(EXAMPLE) + '; })[0] || {}).code');
    out.example = await timeRun(page, code);
    ok(out.example.state === 'ok', name + ': ' + EXAMPLE + ' is built by OpenCascade', { state: out.example.state, volume: out.example.volume, faces: out.example.faces });
    out.panel = await directBuild(page, panelCode(PANEL[0], PANEL[1]));
    const pv = panelVolume(PANEL[0], PANEL[1]);
    ok(out.panel.type === 'built' && out.panel.valid && Math.abs(out.panel.volume - pv) < 1e-6 * pv, name + ': a ' + PANEL[0] * PANEL[1] + '-hole panel is built by OpenCascade', { type: out.panel.type, volume: out.panel.volume, expected: pv, buildMs: r1(out.panel.buildMs), message: out.panel.message });
    // Cancel: the same long build stopped half way (switching OpenCascade off terminates the engine), then on again:
    // the part on screen (the example) is built again
    const before = readLog(log).length;
    const cancelAt = Math.max(50, Math.round((out.panel.buildMs || 400) / 4));
    const cancel = await directBuild(page, panelCode(PANEL[0], PANEL[1]), cancelAt);
    await sleep(1000);
    const exits = readLog(log).slice(before).filter((e) => e.event === 'occt-native-exit');
    const back = await page.ev(RESTART, 300000);
    const vol = await page.ev('anvil.occt().volume');
    ok(cancel.cancelled && back.state === 'ok' && back.engine === opts.engine && Math.abs(vol - out.example.volume) < 1e-9 * vol && (opts.engine !== 'native' || (exits.length === 1 && exits[0].stopped)),
      name + ': Cancel ' + cancelAt + ' ms into a ' + r1(out.panel.buildMs) + ' ms build stops it' + (opts.engine === 'native' ? ' (the engine process is ended)' : '') + ' and the next start builds the part',
      { cancel, hostExit: exits[0] || null, back: { state: back.state, readyMs: r1(back.readyMs), builtMs: r1(back.builtMs) }, volume: vol });
    if (opts.engine === 'native') {
      // the engine process dies while Anvil runs (a crash): the WebAssembly worker takes over and builds the part again
      const ready = readLog(log).filter((e) => e.event === 'occt-native-ready').pop();
      try { process.kill(ready.pid); } catch (e) { /* gone */ }
      await page.waitFor("UI.App.occt.engine === 'wasm'", 30000).catch(() => null);
      const after = await page.ev("anvil.occtIdle().then(function () { return new Promise(function (res) { (function p() { var s = UI.App.occt; if (s.ready && !s.busy && s.state !== 'loading' && s.state !== 'building') res(anvil.occt()); else setTimeout(p, 20); })(); }); })", 300000);
      const notes = page.warnings.filter((w) => /OpenCascade for Windows did not run/.test(w));
      ok(after.engine === 'wasm' && after.state === 'ok' && Math.abs(after.volume - vol) < 1e-6 * Math.abs(vol) && notes.length === 1, name + ': the engine process killed mid-session: the WebAssembly engine takes over and rebuilds the part, one console note',
        { engine: after.engine, state: after.state, volume: after.volume, note: notes[0] });
    }
    const errs = page.errors.concat(readLog(log).filter((e) => e.event === 'console-error').map((e) => e.message));
    ok(errs.length === 0, name + ': no console errors', errs.slice(0, 5));
  } finally {
    await quit(page, child);
  }
  return out;
}

async function checkEngines() {
  const dev = args.includes('--dev');
  const native = await engineRun('native', {}, { engine: 'native' });
  const wasm = await engineRun('wasm', { ANVIL_OCCT_ENGINE: 'wasm' }, { engine: 'wasm' });
  if (native.example && wasm.example) {
    const a = native.example.volume, b = wasm.example.volume;
    ok(a > 0 && Math.abs(a - b) <= 1e-9 * Math.abs(b), EXAMPLE + ': OpenCascade for Windows and WebAssembly give the same volume (1e-9)', { native: a, wasm: b, relDiff: Math.abs(a - b) / Math.abs(b) });
    const pa = native.panel.volume, pb = wasm.panel.volume;
    ok(pa > 0 && Math.abs(pa - pb) <= 1e-9 * Math.abs(pb), PANEL[0] * PANEL[1] + '-hole panel: the same volume on both engines (1e-9)', { native: pa, wasm: pb });
  }
  // the addon folder hidden (as if the program were installed without it): the WebAssembly engine
  const res = path.join(path.dirname(EXE), 'resources', 'occt-native');
  if (!dev && fs.existsSync(res)) {
    const hidden = res + '.hidden-by-check';
    fs.renameSync(res, hidden);
    try { await engineRun('hidden', {}, { fallback: 'the addon folder hidden' }); }
    finally { fs.renameSync(hidden, res); }
  } else {
    if (!dev) ok(false, 'the build has resources\\occt-native', res);
    await engineRun('hidden', { ANVIL_OCCT_NATIVE: path.join(WORK, 'no-addon') }, { fallback: 'no addon folder' });
  }
  // an addon that cannot load (as a missing OpenCascade DLL does): the WebAssembly engine
  const broken = path.join(WORK, 'broken-addon');
  fs.mkdirSync(broken, { recursive: true });
  fs.writeFileSync(path.join(broken, 'index.js'), "exports.load = function () { throw new Error('The specified module could not be found. (TKernel.dll, a test stand-in)'); };\n");
  await engineRun('broken', { ANVIL_OCCT_NATIVE: broken }, { fallback: 'an addon whose DLL does not load' });
  // the timing table
  const row = (what, f) => console.log('  ' + what.padEnd(46) + String(f(wasm)).padStart(10) + String(f(native)).padStart(10));
  const g = (o, k, j) => { try { return r1(o[k][j]); } catch (e) { return '-'; } };
  console.log('\nOpenCascade inside the app, ms               wasm    native');
  row('first start (page open -> engine ready)', (o) => g(o, 'first', 'ms'));
  row('engine load (inside the worker / process)', (o) => g(o, 'first', 'loadMs'));
  row('restart (switch on -> ready)', (o) => g(o, 'restart', 'readyMs'));
  row('restart (switch on -> 4x2x0.5 built)', (o) => g(o, 'restart', 'builtMs'));
  row(EXAMPLE + ': OpenCascade build', (o) => g(o, 'example', 'buildMs'));
  row(EXAMPLE + ': build + mesh + round trip', (o) => g(o, 'example', 'occtMs'));
  row(PANEL[0] * PANEL[1] + '-hole panel: OpenCascade build', (o) => g(o, 'panel', 'buildMs'));
  row(PANEL[0] * PANEL[1] + '-hole panel: mesh', (o) => g(o, 'panel', 'meshMs'));
  row(PANEL[0] * PANEL[1] + '-hole panel: build + mesh + round trip', (o) => g(o, 'panel', 'occtMs'));
  console.log('');
}

async function checkTests() {
  const only = opt('only', 'rfA');
  const dir = path.resolve(__dirname, '..', 'anvil');
  const files = fs.readdirSync(path.join(dir, 'tests', 'kernel')).filter((f) => f.startsWith(only) && f.endsWith('.js')).map((f) => 'kernel/' + f);
  const ud = path.join(WORK, 'userdata');
  const child = launch({ ANVIL_USER_DATA: ud, ANVIL_ROOT: dir, ANVIL_UPDATE_DELAY_MS: '3600000' });
  const page = await connect('app://anvil/');
  const sel = {}; files.forEach((f) => { sel[f] = true; });
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__anvilOnly = ' + JSON.stringify(sel) + ';' });
  await page.send('Page.navigate', { url: 'app://anvil/tests/kernel-tests.html' });
  const t0 = Date.now();
  const r = await page.waitFor('window.__anvilTests && location.pathname.endsWith("kernel-tests.html") && { passed: __anvilTests.passed, total: __anvilTests.total, failed: __anvilTests.results.filter(function (x) { return !x.ok && !x.pass; }).slice(0, 5).map(function (x) { return x.name; }) }', 900000);
  ok(r.total > 0 && r.passed === r.total, 'kernel tests (' + files.length + ' files ' + only + '*) inside app://anvil', { passed: r.passed, total: r.total, seconds: Math.round((Date.now() - t0) / 1000) });
  await quit(page, child);
}

async function checkUpdate() {
  const folder = path.resolve(opt('folder'));
  const ud = path.join(WORK, 'userdata'), log = path.join(WORK, 'events.log');
  fs.mkdirSync(ud, { recursive: true });
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ updateFolder: folder, checkEveryHours: 2 }));
  const child = launch({ ANVIL_USER_DATA: ud, ANVIL_TEST_LOG: log, ANVIL_UPDATE_DELAY_MS: '1000' });
  const page = await connect('app://anvil/');
  const current = await page.waitFor('window.anvilDesktop && window.anvilDesktop.version', 30000);
  const text = await page.waitFor("(document.getElementById('anvil-desktop-update') || {}).innerText", 60000).catch(() => null);
  const latest = JSON.parse(fs.readFileSync(path.join(folder, 'latest.json'), 'utf8'));
  ok(!!text && text.indexOf('Anvil ' + latest.version + ' is ready') >= 0 && /Restart to update/.test(text) && /Later/.test(text), 'Anvil ' + current + ' offers ' + latest.version + ' from ' + folder, text && text.replace(/\s+/g, ' '));
  ok(readLog(log).some((e) => e.event === 'update-offered' && e.version === latest.version), 'the installer matched latest.json\'s sha256');
  await page.ev("document.getElementById('anvil-desktop-update-later').click(); true");
  ok(!(await page.ev("!!document.getElementById('anvil-desktop-update')")), 'Later dismisses it (Restart is not pressed in this check)');
  await quit(page, child);
}

// ---- File ▸ Open / Save / Save As / exports through Windows' own boxes (stood in for by ANVIL_TEST_OPEN_FILE and
// ANVIL_TEST_SAVE_DIR; main.js logs each box's defaults) --------------------------------------------------------
async function checkFiles() {
  const ud = path.join(WORK, 'userdata'), log = path.join(WORK, 'events.log'), inDir = path.join(WORK, 'Jobs in'), saveDir = path.join(WORK, 'saved');
  fs.mkdirSync(ud, { recursive: true }); fs.mkdirSync(inDir, { recursive: true }); fs.mkdirSync(saveDir, { recursive: true });
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ updateFolder: path.join(WORK, 'no-such-folder'), occtEngine: 'wasm' }));
  const part = path.join(inDir, 'HZ part.anvil.json');
  const env = { ANVIL_USER_DATA: ud, ANVIL_TEST_LOG: log, ANVIL_TEST_SAVE_DIR: saveDir, ANVIL_TEST_OPEN_FILE: part, ANVIL_UPDATE_DELAY_MS: '3600000' };
  const child = launch(env);
  const page = await connect('app://anvil/');
  try {
    await page.waitFor('window.anvil && window.anvil.run && document.readyState === "complete"', 60000);
    ok(await page.ev('!!(window.anvilDesktop && window.anvilDesktop.files && window.anvilDesktop.files.open)'), 'the bridge has files (open, saveDialog, write, setDocument)');
    // a part file on disk, made by the app itself
    await page.ev('anvil.run(\'p.name("HZPart").units("in");\\np.sketch("Front").rect(0,0,4,2).extrude(0.5);\')');
    fs.writeFileSync(part, await page.ev('JSON.stringify(UI.App.model)'));
    await page.ev('anvil.newPart().then(function () { UI.markClean(); return true; })');
    // File ▸ Open: Windows' Open box (its filters), the part opens, the path is kept, the window title names the file
    await page.ev('UI.fileOpen(); true');
    await page.waitFor('UI.App.filePath', 20000).catch(() => null);
    const opened = await page.ev('({ path: UI.App.filePath, name: UI.App.model.name, volume: anvil.mass().volume, modal: !document.getElementById("modal").hidden })');
    const dOpen = readLog(log).find((e) => e.event === 'dialog-open');
    ok(dOpen && dOpen.filters.some((f) => /step/.test(f)) && dOpen.filters.some((f) => /dxf/.test(f)) && opened.path === part && opened.name === 'HZPart' && Math.abs(opened.volume - 4) < 1e-9 && !opened.modal,
      'File ▸ Open: Windows\' Open box, the part opens and keeps its path', { opened, filters: dOpen && dOpen.filters.slice(0, 3) });
    let docLog = readLog(log).filter((e) => e.event === 'document').pop();
    ok(docLog && docLog.path === part && /^HZ part\.anvil\.json( \*)? - Anvil$/.test(docLog.title), 'the window title names the file', docLog);
    // Ctrl+S: straight to that file, no box
    await page.ev('anvil.append(\'p.sketch("Front", 0.5).circle(1, 1, 0.25).cut("through", { reverse: true });\')');
    const boxes0 = readLog(log).filter((e) => e.event === 'dialog-save').length;
    await page.ev('document.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true })); true');
    await page.waitFor('!UI.isDirty()', 10000).catch(() => null);
    const onDisk = JSON.parse(fs.readFileSync(part, 'utf8'));
    ok(onDisk.features.length === await page.ev('UI.App.model.features.length') && readLog(log).filter((e) => e.event === 'dialog-save').length === boxes0 && !(await page.ev('UI.isDirty()')),
      'Ctrl+S writes the opened file in place, no Save box', { features: onDisk.features.length });
    ok(fs.readdirSync(inDir).every((f) => !/\.tmp$/.test(f)), 'no temporary file left beside it', fs.readdirSync(inDir));
    // the page cannot write anywhere it likes
    const evil = path.join(WORK, 'not-picked.txt');
    const refused = await page.ev('anvilDesktop.files.write(' + JSON.stringify(evil) + ', "x")');
    ok(refused && refused.code === 'NOTALLOWED' && !fs.existsSync(evil), 'a path not picked in a box is refused', refused);
    const sib = await page.ev('anvilDesktop.files.write(' + JSON.stringify(part) + ', "x", { sibling: "..\\\\evil.mtl" })');
    ok(sib && sib.code === 'NOTALLOWED', 'a companion file name with a folder is refused', sib);
    // Save As: Windows' Save box in the document's folder with its name; the copy becomes the document
    await page.ev('UI.fileSaveAs(); true');
    const copy = path.join(saveDir, 'HZPart.anvil.json');
    await page.waitFor('UI.App.filePath === ' + JSON.stringify(copy), 10000).catch(() => null);
    const dAs = readLog(log).filter((e) => e.event === 'dialog-save').pop();
    ok(dAs && dAs.defaultPath === path.join(inDir, 'HZPart.anvil.json') && dAs.filters[0] === 'json' && dAs.kind === 'document' && fs.existsSync(copy) && await page.ev('UI.App.filePath') === copy,
      'Save As: Windows\' Save box in the part\'s folder, the copy is now the document', dAs);
    // Export STEP: the last folder used, the STEP type first; the document stays where it is
    await page.ev('UI.fileSaveAs("step"); true');
    const step = path.join(saveDir, 'HZPart.step');
    for (let i = 0; i < 40 && !fs.existsSync(step); i++) await sleep(250);
    const dStep = readLog(log).filter((e) => e.event === 'dialog-save').pop();
    ok(dStep && dStep.defaultPath === step && /^step/.test(dStep.filters[0]) && /^ISO-10303-21;/.test(fs.existsSync(step) ? fs.readFileSync(step, 'utf8') : '') && await page.ev('UI.App.filePath') === copy,
      'Export STEP: Windows\' Save box in the last folder, the STEP written', dStep);
    // a download from any command (UI.download): the box with that type
    await page.ev('UI.download("flat.dxf", "0\\nEOF\\n", "application/dxf"); true');
    for (let i = 0; i < 40 && !fs.existsSync(path.join(saveDir, 'flat.dxf')); i++) await sleep(250);
    const dDxf = readLog(log).filter((e) => e.event === 'dialog-save').pop();
    ok(dDxf.defaultPath === path.join(saveDir, 'flat.dxf') && dDxf.filters[0] === 'dxf' && fs.readFileSync(path.join(saveDir, 'flat.dxf'), 'utf8') === '0\nEOF\n', 'a DXF download: the Save box with a DXF filter, written byte for byte', dDxf);
    // a read-only file: an Anvil message, the document stays open and unsaved, the file untouched
    const before = fs.readFileSync(copy, 'utf8');
    fs.chmodSync(copy, 0o444);
    await page.ev('anvil.append(\'p.sketch("Front", 0.5).circle(3, 1, 0.25).cut("through", { reverse: true });\')');
    await page.ev('UI.fileSave(); true');
    await page.waitFor('!document.getElementById("modal").hidden', 10000).catch(() => null);
    const ro = await page.ev('({ modal: !document.getElementById("modal").hidden, text: document.getElementById("modal-body").textContent, dirty: UI.isDirty(), path: UI.App.filePath })');
    ok(ro.modal && /read-only/.test(ro.text) && ro.dirty && ro.path === copy && fs.readFileSync(copy, 'utf8') === before && fs.readdirSync(saveDir).every((f) => !/\.tmp$/.test(f)),
      'a read-only file: a message, still unsaved, the file untouched', ro);
    fs.chmodSync(copy, 0o666);
    await page.ev('UI.closeModal(); UI.fileSave(); true');
    await page.waitFor('!UI.isDirty()', 10000).catch(() => null);
    ok(!(await page.ev('UI.isDirty()')) && JSON.parse(fs.readFileSync(copy, 'utf8')).features.length === await page.ev('UI.App.model.features.length'), 'saved once it can be written');
    // New: no path, the title is the page's own again
    await page.ev('anvil.newPart().then(function () { return true; })');
    await sleep(300);
    docLog = readLog(log).filter((e) => e.event === 'document').pop();
    ok(await page.ev('UI.App.filePath == null') && docLog.path === null, 'File ▸ New: no document path', docLog);
    // (a source folder without the OpenCascade engine, vendor/get-occt.ps1 not run there, 404s its probe)
    const noEngine = !fs.existsSync(path.join(__dirname, '..', 'anvil', 'vendor', 'occt', 'opencascade.full.wasm'));
    const errs = page.errors.concat(readLog(log).filter((e) => e.event === 'console-error').map((e) => e.message)).filter((m) => !(noEngine && /vendor\/occt\/opencascade/.test(m)));
    ok(errs.length === 0, 'no console errors', errs.slice(0, 5));
  } finally { await quit(page, child); }
}

// ---- Restart to update, end to end with a stand-in installer (a .cmd that records its arguments and starts the app
// again; never a real installer) ----------------------------------------------------------------------------------
async function updateRun(name, stubBody, opts) {
  const ud = path.join(WORK, 'ud-' + name), log = path.join(WORK, 'events-' + name + '.log'), rel = path.join(WORK, 'releases-' + name), tmp = path.join(WORK, 'update-temp-' + name);
  fs.mkdirSync(ud, { recursive: true }); fs.mkdirSync(rel, { recursive: true });
  fs.writeFileSync(path.join(ud, 'settings.json'), JSON.stringify({ updateFolder: rel, occtEngine: 'wasm' }));
  const stub = path.join(rel, 'Anvil Setup 99.0.0.cmd'), argsFile = path.join(WORK, 'stub-args-' + name + '.txt');
  const relaunch = '"' + EXE + '"' + (args.includes('--dev') ? ' "' + __dirname + '"' : '') + ' --remote-debugging-port=' + PORT;
  fs.writeFileSync(stub, '@echo off\r\necho %*> "' + argsFile + '"\r\n' + stubBody(relaunch).join('\r\n') + '\r\n');
  const sha = require('crypto').createHash('sha256').update(fs.readFileSync(stub)).digest('hex');
  fs.writeFileSync(path.join(rel, 'latest.json'), JSON.stringify({ version: '99.0.0', file: path.basename(stub), sha256: sha, notes: 'check.js stand-in' }));
  const env = { ANVIL_USER_DATA: ud, ANVIL_TEST_LOG: log, ANVIL_UPDATE_DELAY_MS: '500', ANVIL_UPDATE_TEMP: tmp, ANVIL_UPDATE_SETTLE_MS: '20000',
    ANVIL_TEST_UNLOAD_ANSWERS: opts.answers || 'close', ANVIL_TEST_DIALOGS: 'log' };
  const child = launch(env);
  let page = await connect('app://anvil/');
  await page.waitFor("(document.getElementById('anvil-desktop-update') || {}).innerText", 60000);
  if (opts.dirty) {
    // unsaved work (a user gesture first, so the page's beforeunload may ask): the first Restart is cancelled at the question
    await page.send('Runtime.evaluate', { expression: "anvil.run('p.sketch(\"Front\").rect(0,0,1,1).extrude(1)').then(function () { UI.App.dirty = true; })", awaitPromise: true, userGesture: true });
    await page.ev("document.getElementById('anvil-desktop-update-restart').click(); true");
    await page.waitFor("(function () { var b = document.getElementById('anvil-desktop-update-restart'); return !!b && !b.disabled; })()", 20000).catch(() => null);
    for (let i = 0; i < 40 && !readLog(log).some((e) => e.event === 'update-cancelled'); i++) await sleep(250);
    const q = readLog(log).find((e) => e.event === 'unload-question');
    ok(q && q.updating && readLog(log).some((e) => e.event === 'update-cancelled') && await page.ev("!!document.getElementById('anvil-desktop-update-restart') && !document.getElementById('anvil-desktop-update-restart').disabled") && await page.ev('!!window.anvil'),
      name + ': unsaved work: Restart asks first; Cancel keeps Anvil open with the update still offered', { question: q || null });
  }
  const pid0 = readLog(log).find((e) => e.event === 'started').pid;
  await page.ev("document.getElementById('anvil-desktop-update-restart').click(); true");
  const code = await Promise.race([child.exitPromise, sleep(30000).then(() => 'still running')]);
  ok(code !== 'still running', name + ': Anvil quits for the install', { exit: code });
  page.close();
  // the helper runs the stand-in and Anvil comes back (started by it, or by the helper)
  let started = null;
  for (let i = 0; i < 160 && !started; i++) { await sleep(250); started = readLog(log).filter((e) => e.event === 'started' && e.pid !== pid0).pop(); }
  ok(!!started, name + ': Anvil starts again', started);
  const stubArgs = fs.existsSync(argsFile) ? fs.readFileSync(argsFile, 'utf8').trim() : null;
  ok(stubArgs === '/S --updated --force-run', name + ': the installer was run silently, for this user, to start Anvil after (/S --updated --force-run)', stubArgs);
  if (started) {
    // the window is up once the result of the last update is written (main.js reportLastUpdate, at ready-to-show)
    for (let i = 0; i < 240; i++) { const t = fs.readFileSync(path.join(ud, 'update.log'), 'utf8'); if (t.includes(opts.expectLast) && t.includes('helper-done')) break; await sleep(250); }
  }
  const steps = fs.existsSync(path.join(ud, 'update.log')) ? fs.readFileSync(path.join(ud, 'update.log'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l.replace(/^﻿/, '')); } catch (e) { return { step: '?' }; } }) : [];
  if (started) { try { process.kill(started.pid); } catch (e) { /* gone */ } }
  await sleep(1500);
  return { steps: steps.map((s) => s.step + (s.exitCode != null ? '(' + s.exitCode + ')' : '')), log: readLog(log), stubArgs, started };
}
async function checkUpdateRestart() {
  // 1. the installer works (exit 0) and starts the new version (the stand-in starts this app as 99.0.0)
  const good = await updateRun('installs', (relaunch) => ['set ANVIL_TEST_VERSION=99.0.0', 'start "" ' + relaunch, 'exit /b 0'], { dirty: true, answers: 'cancel,close', expectLast: 'update-succeeded' });
  const want = ['update-restart-clicked', 'update-armed', 'update-quitting', 'update-helper-started', 'helper-started', 'anvil-closed', 'installer-started', 'installer-finished(0)', 'update-succeeded'];
  const got = good.steps.filter((s) => want.indexOf(s) >= 0);
  const order = want.every((w, i) => got.indexOf(w) >= 0 && (i === 0 || got.indexOf(w) > got.indexOf(want[i - 1])));
  ok(order && good.steps.indexOf('anvil-running-again') > 0 && good.steps.indexOf('helper-done') > 0, 'installs: update.log in the user-data folder has every step in order, then update-succeeded from the new version', good.steps);
  // 2. the installer fails (exit 2, nothing installed): the helper starts Anvil again and it says so
  const bad = await updateRun('fails', () => ['exit /b 2'], { expectLast: 'update-not-installed' });
  ok(bad.steps.indexOf('installer-finished(2)') >= 0 && bad.steps.indexOf('install-failed(2)') >= 0 && bad.steps.indexOf('started-anvil') >= 0 && bad.steps.indexOf('update-not-installed') >= 0,
    'fails: the helper starts the old Anvil again and update.log says why', bad.steps);
  ok(bad.log.some((e) => e.event === 'update-not-installed-shown' && e.wanted === '99.0.0'), 'fails: the old Anvil tells the user the update was not installed');
}

(async () => {
  console.log('check.js ' + cmd + ': ' + EXE + ' (work folder ' + WORK + ')');
  try {
    if (cmd === 'app') { await checkApp(); await checkEngines(); }
    else if (cmd === 'engines') await checkEngines();
    else if (cmd === 'tests') await checkTests();
    else if (cmd === 'update') await checkUpdate();
    else if (cmd === 'files') await checkFiles();
    else if (cmd === 'update-restart') await checkUpdateRestart();
    else throw new Error('unknown check ' + cmd);
  } catch (e) { ok(false, 'check ran to the end', e.stack || e.message); }
  console.log(failures ? failures + ' FAILED' : 'all passed');
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (e) { /* in use */ }
  process.exit(failures ? 1 : 0);
})();
