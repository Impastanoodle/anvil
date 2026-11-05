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
// --port <n> (debugging port, default 9333; shard i uses port + i), --keep (leave Chrome running for a look with a
// debugger), --slowest [n] (after the run, the n slowest steps and step-title groups by the page's MS column, default
// 25), --shards <n> (n Chromes at once, each running a consecutive block of the GROUPS files, `?files=a-b`, balanced
// by headless/smoke-timings.json; every Chrome loads every group file, so helpers are all there, and the driver checks
// the blocks ran each declared step exactly once), --save-timings (seconds per group file into smoke-timings.json),
// --json <file> (passed, total, seconds, failures), --part <i>/<n> (only block i of n, see above).
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
const slowest = args.includes('--slowest') ? (Number(opt('--slowest', 25)) || 25) : 0;
const shards = Math.max(1, Math.floor(Number(opt('--shards', 1))) || 1);
// --part i/n: run only block i (1-based) of the n --shards blocks, in one Chrome (CI runs each block on its own machine)
const part = (/^(\d+)\/(\d+)$/.exec(opt('--part', '')) || []).slice(1).map(Number);
const PAGE = path.join(__dirname, '..', 'tests', 'ui-smoke.html');
const TIMINGS = path.join(__dirname, 'smoke-timings.json');
const GAP_MS = 30;   // the page's pause between steps

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

// the page's GROUPS list, in order
function groupList() {
  const m = /var GROUPS = \[([\s\S]*?)\];/.exec(fs.readFileSync(PAGE, 'utf8'));
  if (!m) throw new Error('no GROUPS list in ' + PAGE);
  return (m[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));
}
// n consecutive blocks of the files with the smallest largest block (recorded seconds; a file with no record counts as
// the median) -> [[from, to), …]
function blocks(files, n) {
  let rec = {};
  try { rec = JSON.parse(fs.readFileSync(TIMINGS, 'utf8')).seconds || {}; } catch (e) { }
  const known = files.map((f) => rec[f]).filter((s) => s > 0).sort((a, b) => a - b), mid = known.length ? known[known.length >> 1] : 1;
  const w = files.map((f) => (rec[f] > 0 ? rec[f] : mid));
  const pre = [0];
  w.forEach((x, i) => { pre[i + 1] = pre[i] + x; });
  const N = files.length, k = Math.min(n, N);
  // best[j][i]: the smallest largest block cutting the first i files into j blocks
  const best = [], cut = [];
  for (let j = 0; j <= k; j++) { best.push(new Array(N + 1).fill(Infinity)); cut.push(new Array(N + 1).fill(0)); }
  best[0][0] = 0;
  for (let j = 1; j <= k; j++) for (let i = j; i <= N; i++) for (let s = j - 1; s < i; s++) {
    const v = Math.max(best[j - 1][s], pre[i] - pre[s]);
    if (v < best[j][i]) { best[j][i] = v; cut[j][i] = s; }
  }
  const out = [];
  for (let j = k, i = N; j > 0; j--) { const s = cut[j][i]; out.unshift([s, i]); i = s; }
  return out;
}

// one Chrome on one page -> { ok, summary, results, declared, size, seconds } or { error }
async function runChrome(chrome, pageUrl, dbgPort, tag) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-ui-smoke-'));
  const proc = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-proxy-server', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars',
    '--window-size=1600,1000', '--remote-debugging-port=' + dbgPort, '--user-data-dir=' + profile]
    // ANVIL_CHROME_FLAGS: extra switches, space-separated (CI's Linux runners pass --no-sandbox)
    .concat(String(process.env.ANVIL_CHROME_FLAGS || '').split(/\s+/).filter(Boolean), [pageUrl]), { stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => { stderr += d; });
  const cleanup = () => { if (!keep) { try { proc.kill(); } catch (e) { } setTimeout(() => { try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { } }, 500); } };
  process.on('exit', cleanup);
  try {
    const base = 'http://127.0.0.1:' + dbgPort;
    const version = await waitFor(() => fetchJson(base + '/json/version'), 15000);
    if (!version) return { error: 'Chrome did not open its debugging port ' + dbgPort + '.\n' + stderr.slice(-600), code: 2 };
    // the page is the tab Chrome opened for the URL on its command line (the same path as --dump-dom); creating a
    // target with /json/new and navigating it over the protocol stopped loading pages with Chrome 154
    const target = await waitFor(async () => (await fetchJson(base + '/json/list')).find((t) => t.type === 'page' && t.url.indexOf(pageUrl.split('?')[0]) === 0), 15000);
    if (!target) return { error: 'Chrome did not open the page tab.', code: 2 };
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = () => reject(new Error('websocket failed')); });
    const page = new Page(ws);
    await page.send('Runtime.enable');
    const t0 = Date.now();
    let last = '';
    let pageDone = false;
    const summary = await waitFor(async () => {
      const s = await page.eval("(function(){var e=document.getElementById('summary');return (window.occtTestsDone ? '\\u0001' : '') + (e?e.textContent:'')})()");
      pageDone = s.charAt(0) === '\u0001';
      const text = pageDone ? s.slice(1) : s;
      if (text !== last) { last = text; console.error('[' + tag + Math.round((Date.now() - t0) / 1000) + ' s] ' + text); }
      return /\/\s*\d+\s*passed/.test(text) || pageDone ? text : null;
    }, timeoutS * 1000, 2000);
    const seconds = Math.round((Date.now() - t0) / 1000);
    if (!summary) { ws.close(); return { error: 'TIMEOUT after ' + timeoutS + ' s: ' + last, code: 1, seconds }; }
    if (!/\/\s*\d+\s*passed/.test(summary)) { ws.close(); return { error: 'the page stopped without a result: ' + summary, code: 1, seconds }; }
    // ui-smoke.html leaves its results in window.__anvilSmoke; another page (occt-tests.html): its PASS / FAIL rows
    const got = JSON.parse(await page.eval("JSON.stringify(window.__anvilSmoke ? { declared: window.__anvilSmoke.declared, startState: window.__anvilSmoke.startState, endState: window.__anvilSmoke.endState, results: window.__anvilSmoke.results.map(function (r) { return { name: r.name, ok: r.ok, detail: r.detail || '', ms: r.ms, file: r.file, waited: r.waited || 0, setup: !!r.setup }; }) }"
      + " : { declared: null, results: Array.prototype.slice.call(document.querySelectorAll('tr')).filter(function (tr) { return tr.children.length > 1 && /^(PASS|FAIL)$/.test(tr.children[0].textContent); }).map(function (tr) { var c = tr.children; return { name: c[1].textContent, ok: c[0].textContent === 'PASS', detail: c[2] ? c[2].textContent : '', ms: parseFloat(c[c.length - 1].textContent) || 0, file: '' }; }) })"));
    const size = await page.eval('innerWidth + "x" + innerHeight + " visible=" + document.visibilityState');
    ws.close();
    return { summary, results: got.results, declared: got.declared, startState: got.startState, endState: got.endState, size, seconds };
  } finally { cleanup(); }
}

async function main() {
  const chrome = findChrome();
  if (!chrome) { console.error('No Chrome or Edge found; pass --chrome <path> or set CHROME_PATH.'); return 2; }
  // HEAD, and never a GET whose body goes unread: anvil/serve.ps1 is single-threaded and blocks on writing a response
  // the client does not drain, which starved the browser's own request for the page
  const probe = await fetch(url, { method: 'HEAD' }).catch(() => null);
  if (!probe || !probe.ok) { console.error('Nothing serves ' + url + ' (start anvil/serve.ps1 -Port 8812 first).'); return 2; }

  const t0 = Date.now();
  const files = groupList();
  const cuts = part.length && part[1] > 1 ? [blocks(files, part[1])[part[0] - 1]] : shards > 1 ? blocks(files, shards) : [null];
  const runs = await Promise.all(cuts.map((c, i) => {
    const u = c ? url + (url.indexOf('?') >= 0 ? '&' : '?') + 'files=' + c[0] + '-' + c[1] : url;
    return runChrome(chrome, u, port + i, c ? 'shard ' + (i + 1) + '/' + cuts.length + ', ' : '');
  }));
  const seconds = Math.round((Date.now() - t0) / 1000);
  const bad = runs.filter((r) => r.error);
  // merged in GROUPS order; a group file that did not load is a FAIL row (no file) in every shard: keep one; a shard's
  // setup row (the suite's first step, run again by a shard that does not hold it) only when it failed
  const results = [], seenLoad = {};
  runs.forEach((r) => (r.results || []).forEach((x) => {
    if (x.setup && x.ok) return;
    if (x.file == null) { if (seenLoad[x.name]) return; seenLoad[x.name] = true; }
    results.push(x);
  }));
  const notes = [], boundary = [];
  if (cuts.length > 1 && !bad.length) {
    const decl = Array.from(new Set(runs.map((r) => r.declared))), ran = results.filter((x) => x.file != null).length;
    if (decl.length !== 1 || ran !== decl[0]) {
      results.push({ name: 'shards: every step once', ok: false, detail: 'declared ' + decl.join(' / ') + ', ran ' + ran, ms: 0, file: null });
    }
    notes.push(cuts.length + ' shards: ' + cuts.map((c, i) => 'files ' + c[0] + '–' + (c[1] - 1) + ' ' + runs[i].seconds + ' s').join(', '));
    // what a shard's first step inherits that differs from what the full run hands it (the end of the shard before)
    for (let i = 1; i < runs.length; i++) {
      const a = runs[i - 1].endState || {}, b = runs[i].startState || {}, diff = [];
      new Set(Object.keys(a).concat(Object.keys(b))).forEach((k) => { if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) diff.push(k + ' ' + JSON.stringify(a[k]) + ' → ' + JSON.stringify(b[k])); });
      if (diff.length) boundary.push('shard ' + (i + 1) + ' starts with settings the full run would not hand it (full run → shard): ' + diff.join('; '));
    }
  }
  bad.forEach((r, i) => console.log(r.error));
  const failed = results.filter((x) => !x.ok), passed = results.length - failed.length;
  const summary = cuts.length === 1 && runs[0].summary ? runs[0].summary
    : passed + ' / ' + results.length + ' passed' + (failed.length ? ' — ' + failed.length + ' FAILED' : '');
  console.log(summary + '  (' + ((runs.find((r) => r.size) || {}).size || '?') + ', ' + seconds + ' s' + (notes.length ? '; ' + notes.join('; ') : '') + ')');
  for (const f of failed) console.log('  FAIL | ' + f.name + ' | ' + f.detail + ' | ' + (f.ms || 0).toFixed(1));
  boundary.forEach((b) => console.log('  note: ' + b));
  if (slowest) {
    // every step's title and time; groups by the title's prefix before ':' ("rfHL: …", "smooth/responsive: …")
    const rows = results.map((x) => [x.name, x.ms || 0]);
    const total = rows.reduce((s, r) => s + r[1], 0), byGroup = {};
    rows.forEach((r) => { const m = /^([^:]{1,40}):/.exec(r[0]), g = m ? m[1] : '(no prefix)'; byGroup[g] = byGroup[g] || [0, 0]; byGroup[g][0] += r[1]; byGroup[g][1]++; });
    const sec = (ms) => (ms / 1000).toFixed(1).padStart(6) + ' s';
    console.log('\nSlowest ' + slowest + ' steps (of ' + rows.length + ', ' + sec(total).trim() + ' in steps):');
    rows.slice().sort((a, b) => b[1] - a[1]).slice(0, slowest).forEach((r) => console.log(sec(r[1]) + '  ' + r[0].slice(0, 130)));
    console.log('\nSlowest ' + slowest + ' groups:');
    Object.keys(byGroup).sort((a, b) => byGroup[b][0] - byGroup[a][0]).slice(0, slowest).forEach((g) => console.log(sec(byGroup[g][0]) + '  ' + String(byGroup[g][1]).padStart(3) + ' steps  ' + g));
    // wait(ms) calls: what each step asked to sleep (a race against a long wait counts in full, so read it as an upper bound)
    const asked = results.filter((x) => x.waited > 0), askedSum = asked.reduce((s, x) => s + Math.min(x.waited, x.ms || 0), 0);
    if (asked.length) {
      console.log('\nMost time in wait() (' + asked.length + ' steps, at most ' + sec(askedSum).trim() + ' of the step time; each step\'s sleep capped at its own time):');
      asked.slice().sort((a, b) => Math.min(b.waited, b.ms) - Math.min(a.waited, a.ms)).slice(0, slowest).forEach((x) => console.log(sec(Math.min(x.waited, x.ms)) + ' of ' + sec(x.ms).trim() + '  ' + x.name.slice(0, 120)));
    }
  }
  if (args.includes('--save-timings') && !bad.length) {
    let old = {};
    try { old = JSON.parse(fs.readFileSync(TIMINGS, 'utf8')).seconds || {}; } catch (e) { }
    const s = {};
    results.forEach((x) => { if (x.file) s[x.file] = (s[x.file] || 0) + (x.ms || 0) + GAP_MS; });
    Object.keys(s).forEach((f) => { old[f] = +(s[f] / 1000).toFixed(2); });
    const sorted = {};
    Object.keys(old).sort().forEach((f) => { sorted[f] = old[f]; });
    fs.writeFileSync(TIMINGS, JSON.stringify({ note: 'seconds per smoke group file, for cutting --shards into even blocks: node anvil/headless/ui-smoke.js <url> --save-timings', seconds: sorted }, null, 1) + '\n');
  }
  const jsonOut = opt('--json', null);
  if (jsonOut) fs.writeFileSync(path.resolve(process.cwd(), jsonOut), JSON.stringify({ passed, total: results.length, seconds, errors: bad.map((r) => r.error), notes: boundary,
    failures: failed.map((x) => ({ name: x.name, detail: x.detail, file: x.file || null })) }, null, 1) + '\n');
  if (bad.length) return Math.max.apply(null, bad.map((r) => r.code || 1));
  return failed.length || /FAILED/.test(summary) ? 1 : 0;
}

main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 800); }, (e) => { console.error(e && e.stack || e); process.exitCode = 2; setTimeout(() => process.exit(2), 800); });
