// check.js — proves the built app works, by script (Chrome DevTools Protocol over --remote-debugging-port, Node's own
// WebSocket; no packages). Every run uses a throw-away user-data folder in %TEMP%, never the real %APPDATA%\Anvil.
//   node check.js app     [--exe dist\win-unpacked\Anvil.exe]  load, no console errors, a part (volume 4), OpenCascade
//                         drives it, Save As of a DXF, DXF->DWG->DXF through the converter endpoints, one instance only;
//                         then a restart: settings kept, OpenCascade loads again, and the 503 reply with no converter
//   node check.js tests   [--only rfA]   the kernel tests (one slice) inside the app's app:// protocol (ANVIL_ROOT=../anvil)
//   node check.js update  --folder <release folder> [--exe ...]  the app offers the update found in that folder
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
    const ws = new WebSocket(wsUrl), pending = new Map(), errors = [];
    let id = 0;
    ws.onerror = (e) => reject(new Error('websocket: ' + (e.message || 'error')));
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(msg.error.message)) : p.res(msg.result); return; }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
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
    ws.onopen = async () => { await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); resolve({ ws, send, ev, waitFor, errors, close: () => ws.close() }); };
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

(async () => {
  console.log('check.js ' + cmd + ': ' + EXE + ' (work folder ' + WORK + ')');
  try {
    if (cmd === 'app') await checkApp();
    else if (cmd === 'tests') await checkTests();
    else if (cmd === 'update') await checkUpdate();
    else throw new Error('unknown check ' + cmd);
  } catch (e) { ok(false, 'check ran to the end', e.stack || e.message); }
  console.log(failures ? failures + ' FAILED' : 'all passed');
  try { fs.rmSync(WORK, { recursive: true, force: true }); } catch (e) { /* in use */ }
  process.exit(failures ? 1 : 0);
})();
