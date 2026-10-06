// ui-smoke.js — runs tests/ui-smoke.html in headless Chrome from a shell: `node anvil/headless/ui-smoke.js [url]`.
// The smoke test drives the real app in an iframe with pointer events and requestAnimationFrame, so it needs a
// visible, wide (>= 880 px) page that nobody resizes while it runs; the Claude browser pane and a background
// Chrome tab are neither. Headless Chrome (`--headless=new`) reports its page as visible, never throttles timers,
// and has whatever window size it is given, so results are repeatable. Chrome is driven over the DevTools
// protocol with Node's built-in WebSocket (Node 22+), no npm packages: start Chrome with a debugging port,
// open the page, then poll `#summary` every two seconds until the harness writes the final count (or the
// timeout passes), print the summary and every FAIL row, and exit 0 when all passed, 1 on failures or a
// timeout, 2 when Chrome or the server is missing. The server must already be running (anvil/serve.ps1;
// default URL http://localhost:8812/tests/ui-smoke.html). Options: --timeout <s> (default 420), --chrome <path>,
// --port <n> (debugging port, default 9333), --keep (leave Chrome running for a look with a debugger).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
function opt(name, dflt) { const i = args.indexOf(name); return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : dflt; }
const url = args.find((a) => /^https?:\/\//.test(a)) || 'http://localhost:8812/tests/ui-smoke.html';
const timeoutS = Number(opt('--timeout', 420));
const port = Number(opt('--port', 9333));
const keep = args.includes('--keep');

function findChrome() {
  const given = opt('--chrome', null);
  const candidates = [given, process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(os.homedir(), 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe'),
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return candidates.find((c) => { try { return fs.statSync(c).isFile(); } catch (e) { return false; } }) || null;
}

async function fetchJson(u, method) {
  const res = await fetch(u, { method: method || 'GET' });
  if (!res.ok) throw new Error(method + ' ' + u + ' -> ' + res.status);
  return res.json();
}

async function waitFor(fn, ms, every) {
  const t0 = Date.now();
  for (;;) {
    try { const v = await fn(); if (v) return v; } catch (e) { /* not yet */ }
    if (Date.now() - t0 > ms) return null;
    await new Promise((r) => setTimeout(r, every || 500));
  }
}

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data)); }
  onMessage(m) { if (m.id && this.pending.has(m.id)) { const p = this.pending.get(m.id); this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }
  send(method, params) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params: params || {} })); });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r.result.value;
  }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.error('No Chrome or Edge found; pass --chrome <path> or set CHROME_PATH.'); return 2; }
  const probe = await fetch(url).catch(() => null);
  if (!probe || !probe.ok) { console.error('Nothing serves ' + url + ' (start anvil/serve.ps1 -Port 8812 first).'); return 2; }

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-ui-smoke-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--window-size=1600,1000', '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  const cleanup = () => { if (!keep) { try { proc.kill(); } catch (e) { } setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { } }, 500); } };
  process.on('exit', cleanup);

  const base = 'http://127.0.0.1:' + port;
  const version = await waitFor(() => fetchJson(base + '/json/version'), 15000);
  if (!version) { console.error('Chrome did not open its debugging port.\n' + stderr.slice(-600)); return 2; }
  const target = await fetchJson(base + '/json/new?' + encodeURIComponent(url), 'PUT');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('websocket failed')); });
  const page = new Page(ws);
  await page.send('Runtime.enable');

  const t0 = Date.now();
  let last = '';
  const summary = await waitFor(async () => {
    const s = await page.eval("(function(){var e=document.getElementById('summary');return e?e.textContent:''})()");
    if (s !== last) { last = s; console.error('[' + Math.round((Date.now() - t0) / 1000) + ' s] ' + s); }
    return /\/\s*\d+\s*passed/.test(s) ? s : null;
  }, timeoutS * 1000, 2000);

  if (!summary) {
    console.log('TIMEOUT after ' + timeoutS + ' s: ' + last);
    return 1;
  }
  const fails = await page.eval("JSON.stringify(Array.prototype.slice.call(document.querySelectorAll('tr')).filter(function(tr){return /^FAIL/.test(tr.textContent)}).map(function(tr){return Array.prototype.map.call(tr.children,function(td){return td.textContent}).join(' | ')}))");
  const size = await page.eval('innerWidth + "x" + innerHeight + " visible=" + document.visibilityState');
  console.log(summary + '  (' + size + ', ' + Math.round((Date.now() - t0) / 1000) + ' s)');
  for (const f of JSON.parse(fails)) console.log('  ' + f);
  ws.close();
  return /FAILED/.test(summary) ? 1 : 0;
}

main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 800); }, (e) => { console.error(e && e.stack || e); process.exitCode = 2; setTimeout(() => process.exit(2), 800); });
