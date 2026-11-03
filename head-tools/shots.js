// shots.js — full-resolution screenshots of the running app in headless Chrome, for look work (before / after).
// node head-tools/shots.js --out <dir> [--url http://localhost:8812/] [--port 9480] [--steps steps.json]
//   [--size 1600x1000] [--scale 1] [--theme light|dark]
// The server must already run (anvil/serve.ps1). Each step is { "name", "js"?, "wait"? (ms, default 1200),
// "clip"? { x, y, width, height } (page px; saved at --scale, so --scale 2 gives a 2x zoom of that box) }: the js is
// evaluated in the page (Promises are awaited, its value is printed), then the page is captured to <out>/<name>.png.
// Without --steps a default tour runs: main window, Sketch tab, an Edit Feature PropertyManager, a drawing.
// --scale 1.25 / 1.5 renders as Windows display scaling does, which is where blurry icons and half-pixel lines show.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const args = process.argv.slice(2);
function opt(n, d) { const i = args.indexOf(n); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d; }
const out = opt('--out', null), url = opt('--url', 'http://localhost:8812/'), port = Number(opt('--port', 9480));
const size = opt('--size', '1600x1000').split('x').map(Number), scale = Number(opt('--scale', 1)), theme = opt('--theme', null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DEFAULT_STEPS = [
  { name: '01-main' },
  { name: '02-sketch-tab', js: "(function(){var t=[].slice.call(document.querySelectorAll('*')).find(function(e){return e.children.length===0&&e.textContent==='Sketch'});t.click();return !!t})()" },
  { name: '03-edit-feature-pm', js: "(function(){var f=UI.App.model.features.find(function(f){return f.type==='extrude'});UI.editFeature(f);return f&&f.name})()", wait: 2000 },
  { name: '04-drawing', js: "(function(){UI.pmCancel&&UI.pmCancel();return anvil.drawing.make()?'ok':'null'})()", wait: 5000 }
];
function findChrome() {
  return [process.env.CHROME_PATH, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'), 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe']
    .filter(Boolean).find((c) => { try { return fs.statSync(c).isFile(); } catch (e) { return false; } });
}
async function fj(u) { const r = await fetch(u); return r.json(); }
async function waitFor(fn, ms) { const t0 = Date.now(); for (;;) { try { const v = await fn(); if (v) return v; } catch (e) { } if (Date.now() - t0 > ms) return null; await sleep(400); } }
class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.p = new Map(); ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && this.p.has(m.id)) { const q = this.p.get(m.id); this.p.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result); } }; }
  send(method, params) { const id = ++this.id; return new Promise((resolve, reject) => { this.p.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); }); }
  async eval(e) { const r = await this.send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) return 'ERR ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text); return r.result.value; }
}
(async () => {
  if (!out) { console.error('usage: node head-tools/shots.js --out <dir> [--url u] [--port n] [--steps f.json] [--size WxH] [--scale s] [--theme light|dark]'); process.exit(2); }
  const steps = opt('--steps', null) ? JSON.parse(fs.readFileSync(opt('--steps'), 'utf8')) : DEFAULT_STEPS;
  const chrome = findChrome();
  if (!chrome) { console.error('No Chrome or Edge found (set CHROME_PATH).'); process.exit(2); }
  fs.mkdirSync(out, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-shots-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-proxy-server', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--window-size=' + size[0] + ',' + size[1], '--force-device-scale-factor=' + scale, '--remote-debugging-port=' + port, '--user-data-dir=' + profile, url], { stdio: 'ignore' });
  const done = (code) => { try { proc.kill(); } catch (e) { } setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { } process.exit(code); }, 800); };
  const base = 'http://127.0.0.1:' + port;
  if (!await waitFor(() => fj(base + '/json/version'), 15000)) { console.error('Chrome did not open port ' + port); return done(2); }
  const t = await waitFor(async () => (await fj(base + '/json/list')).find((x) => x.type === 'page' && x.url.indexOf(url.split('?')[0]) === 0), 15000);
  if (!t) { console.error('Chrome did not open ' + url); return done(2); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((r) => { ws.onopen = r; });
  const page = new Page(ws);
  await page.send('Runtime.enable');
  await waitFor(() => page.eval('!!(window.anvil && window.UI && UI.App && UI.App.mesh)'), 30000);
  if (theme) await page.eval("anvil.theme('" + theme + "')");
  await sleep(2500);
  for (const s of steps) {
    if (s.js) console.log(s.name + ' -> ' + JSON.stringify(await page.eval(s.js)).slice(0, 300));
    await sleep(s.wait || 1200);
    const p = { format: 'png' };
    if (s.clip) p.clip = Object.assign({ scale: 1 }, s.clip);
    const shot = await page.send('Page.captureScreenshot', p);
    fs.writeFileSync(path.join(out, s.name + '.png'), Buffer.from(shot.data, 'base64'));
  }
  ws.close();
  done(0);
})();
