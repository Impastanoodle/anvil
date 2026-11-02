// headless/test-run.js — `node anvil/headless/anvil.js test`: tests/kernel-tests.html under Node.
// The page's inline script is run as is. It needs: document.createElement / getElementById for its result table (a
// few plain objects here), window, a synchronous XMLHttpRequest for tests/fixtures and for the page's test group files
// (tests/kernel/*.js in its GROUPS list, which the page joins and evals in its own scope; both read from disk), and Worker
// (worker_threads with importScripts / postMessage / onmessage bridged, as worker.js expects). The harness sets
// window.__anvilTests once every test, sync and async, has settled.
//
// A job is one group file: a child process (the same main-thread limits as the serial run) that loads the engine, runs
// the whole page script with window.__anvilOnly naming that file, and sends its rows back. Every group file's top level
// runs in every job, so a file sees exactly the helpers it sees in the full page, and --only is the same thing as one
// job: what passes under the filter passes in the suite. The parent hands out files longest first (test-timings.json,
// the recorded seconds per file), merges the rows back in GROUPS order and prints what the serial run prints. A process
// per file is cheap (0.4 s for the engine and the page) and worth it: a long process slows down, rfGH's hole plates take
// 98 s in a fresh one and 383 s at the end of a serial run.
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const threads = require('worker_threads');
const { load, TESTS_PAGE } = require('./load');

const TIMINGS = path.join(__dirname, 'test-timings.json');
const ASYNC_LIMIT_S = 10;   // the page's ASYNC_TIMEOUT_MS
const V8_POOL = ['--v8-pool-size=1'];
const WORKER_BOOT = `
  'use strict';
  const { parentPort, workerData } = require('worker_threads');
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const dir = path.dirname(workerData.file);
  globalThis.self = globalThis;
  globalThis.importScripts = function () {
    Array.prototype.forEach.call(arguments, function (name) { const f = path.resolve(dir, name); vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); });
  };
  globalThis.postMessage = function (msg) { parentPort.postMessage(msg); };   // the transfer list is ignored: buffers are cloned
  parentPort.on('message', function (data) { if (typeof globalThis.onmessage === 'function') globalThis.onmessage({ data: data }); });
  vm.runInThisContext(fs.readFileSync(workerData.file, 'utf8'), { filename: workerData.file });
`;
function domShim(pageDir) {
  const workers = new Set();
  function node(tag) {
    const n = {
      tagName: tag, children: [], className: '', _text: '', hidden: false,
      get firstChild() { return this.children[0] || null; },
      get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; },
      set textContent(s) { this.children = []; this._text = String(s); },
      // the harness's row templates: '<td class="st"></td><td></td>…' -> td children
      set innerHTML(html) {
        this.children = []; this._text = '';
        const re = /<(\w+)([^>]*)>/g;
        let m;
        while ((m = re.exec(String(html)))) {
          if (m[1].toLowerCase() === 'td') { const c = node('td'), cls = /class\s*=\s*"([^"]*)"/.exec(m[2]); if (cls) c.className = cls[1]; this.children.push(c); }
        }
      },
      appendChild(c) { this.children.push(c); return c; },
      setAttribute() { }, addEventListener() { }
    };
    return n;
  }
  const byId = { rows: node('tbody'), summary: node('div') };
  const g = globalThis;
  g.window = g;
  if (typeof g.DOMParser === 'undefined') g.DOMParser = require('./xmldom').DOMParser;   // the SVG export checks
  g.document = {
    createElement: (tag) => node(tag), createElementNS: (ns, tag) => node(tag),
    getElementById: (id) => byId[id] || null, body: node('body'), head: node('head'), addEventListener() { }
  };
  g.XMLHttpRequest = class XMLHttpRequest {
    open(method, url) { this._url = url; this.status = 0; this.responseText = ''; }
    send() {
      const f = path.resolve(pageDir, String(this._url).replace(/[?#].*$/, '').replace(/^\//, ''));
      if (fs.existsSync(f)) { this.status = 200; this.responseText = fs.readFileSync(f, 'utf8'); } else { this.status = 404; }
    }
  };
  g.Worker = class Worker {
    constructor(url) {
      const file = path.resolve(pageDir, String(url));
      if (!fs.existsSync(file)) throw new Error('Worker: no such file ' + file);
      this.onmessage = null; this.onerror = null;
      this._w = new threads.Worker(WORKER_BOOT, { eval: true, workerData: { file } });
      this._w.on('message', (data) => { if (typeof this.onmessage === 'function') this.onmessage({ data }); });
      this._w.on('error', (err) => { if (typeof this.onerror === 'function') this.onerror({ message: (err && err.message) || String(err) }); });
      workers.add(this);
    }
    postMessage(msg) { this._w.postMessage(msg); }
    terminate() { workers.delete(this); return this._w.terminate(); }
  };
  return { workers, byId };
}
function inlineScript(html) {
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, last = null;
  while ((m = re.exec(html))) last = { code: m[1], index: m.index + m[0].indexOf(m[1]) };
  if (!last) throw new Error('no inline <script> block in ' + TESTS_PAGE);
  last.line = html.slice(0, last.index).split('\n').length - 1;
  return last;
}
// the page's GROUPS list, in order
function groupList(html) {
  const m = /var GROUPS = \[([\s\S]*?)\];/.exec(html);
  if (!m) throw new Error('no GROUPS list in ' + TESTS_PAGE);
  return (m[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));
}
// the engine and the page's script in this process, once
function pageEnv() {
  load();
  const pageDir = path.dirname(TESTS_PAGE), html = fs.readFileSync(TESTS_PAGE, 'utf8');
  return { shim: domShim(pageDir), script: inlineScript(html) };
}
// one run of the page; only = list of group files, or null for all of them
async function runPage(env, only) {
  const map = {};
  (only || []).forEach((f) => { map[f] = true; });
  globalThis.__anvilOnly = only ? map : undefined;
  delete globalThis.__anvilTests;
  env.shim.byId.rows.children = [];
  vm.runInThisContext(env.script.code, { filename: TESTS_PAGE, lineOffset: env.script.line });
  const result = await new Promise((resolve, reject) => {
    const limit = 300000, started = Date.now();
    const timer = setInterval(() => {
      if (globalThis.__anvilTests) { clearInterval(timer); resolve(globalThis.__anvilTests); }
      else if (Date.now() - started > limit) { clearInterval(timer); reject(new Error('the test page did not settle within ' + limit / 1000 + ' s: ' + env.shim.byId.summary.textContent)); }
    }, 50);
  });
  for (const w of Array.from(env.shim.workers)) { try { w.terminate(); } catch (e) { } }
  return result;
}

// ------------------------------------------------------------------ a job (the forked child)
function childMain() {
  const env = pageEnv();
  process.on('message', (m) => {
    runPage(env, m.files).then((r) => {
      process.send({ files: m.files, results: r.results, fileMs: r.fileMs, maxRSS: process.resourceUsage().maxRSS * 1024 });
    }, (e) => {
      process.send({ files: m.files, error: String((e && e.stack) || e), fileMs: {}, maxRSS: process.resourceUsage().maxRSS * 1024 });
    });
  });
  process.send({ ready: true });
}

// ------------------------------------------------------------------ the pool
function recorded() { try { return JSON.parse(fs.readFileSync(TIMINGS, 'utf8')).seconds || {}; } catch (e) { return {}; } }
// longest first; a file with no record counts as the median
function longestFirst(files, seconds) {
  const known = files.map((f) => seconds[f]).filter((s) => s > 0).sort((a, b) => a - b);
  const mid = known.length ? known[known.length >> 1] : 1;
  const est = (f) => (seconds[f] > 0 ? seconds[f] : mid);
  return files.slice().sort((a, b) => est(b) - est(a));
}
function crashRow(file, why) {
  return { group: file, name: file + ' job', file, ok: false, detail: why, ms: 0, pending: false };
}
// run every file in a child of its own, at most n at a time -> { rows: Map(file -> rows), jobSeconds, peak, sumPeak }
function runPool(files, n) {
  const JOB_LIMIT_S = 1200;   // a test stuck in a loop: that job fails, the others finish
  const queue = longestFirst(files, recorded());
  const rows = new Map(), fileMs = {}, jobSeconds = {};
  let next = 0, live = 0, maxRSS = 0;
  return new Promise((resolve) => {
    const kids = new Set();
    const watch = setInterval(() => {
      kids.forEach((c) => {
        if (c.job && Date.now() - c.job.t0 > JOB_LIMIT_S * 1000) { c.job.why = 'no result within ' + JOB_LIMIT_S + ' s: the job was stopped'; c.kill(); }
      });
    }, 1000);
    function spawn() {
      if (next >= queue.length) return;
      // V8 gives a process 4 helper threads by default: 8 jobs could ask for 40 threads and peg every core of the PC
      const c = cp.fork(__filename, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], execArgv: process.execArgv.concat(V8_POOL) });
      const file = queue[next++];
      c.job = { file, t0: Date.now(), why: null };
      kids.add(c); live++;
      c.on('message', (m) => {
        if (m.ready) { c.send({ files: [file] }); return; }
        rows.set(file, m.error ? [crashRow(file, m.error)] : m.results);
        fileMs[file] = m.fileMs[file] || 0;
        jobSeconds[file] = (Date.now() - c.job.t0) / 1000;
        maxRSS = Math.max(maxRSS, m.maxRSS || 0);
        c.job = null;
        c.kill();
      });
      c.on('exit', (code, signal) => {
        kids.delete(c); live--;
        if (c.job) rows.set(file, [crashRow(file, c.job.why || 'the job\'s process ended early (exit code ' + code + (signal ? ', ' + signal : '') + ')')]);
        spawn();
        if (!live) { clearInterval(watch); resolve({ rows, fileMs, jobSeconds, maxRSS }); }
      });
    }
    for (let i = 0; i < n; i++) spawn();
    if (!live) { clearInterval(watch); resolve({ rows, fileMs, jobSeconds, maxRSS }); }
  });
}
// rows in the order the serial page gives them; a load-failure row (no file) comes from every job: keep one of each
function mergeRows(files, pool) {
  const out = [], late = new Map();
  files.forEach((f) => {
    (pool.rows.get(f) || []).forEach((r) => {
      if (r.file) out.push(r); else if (!late.has(r.name)) late.set(r.name, r);
    });
  });
  return out.concat(Array.from(late.values()));
}

// ------------------------------------------------------------------ the command
// half the machine's threads, so the PC stays usable while the suite runs (user, 2026-11-02): 8 on the 16-thread shop PC
function defaultJobs() {
  return Math.max(1, Math.floor((os.availableParallelism ? os.availableParallelism() : os.cpus().length) / 2));
}
function selectGroups(spec, files) {
  const base = (f) => f.replace(/^.*\//, '').replace(/\.js$/, '').toLowerCase();
  const picked = new Set();
  const names = String(spec).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!names.length) throw Object.assign(new Error('--only: give group names, e.g. --only rfGM,rfGN'), { code: 2 });
  names.forEach((s) => {
    let hit = files.filter((f) => base(f) === s);
    if (!hit.length) hit = files.filter((f) => base(f).indexOf(s) >= 0);
    if (!hit.length) throw Object.assign(new Error('--only: no group file named or containing "' + s + '" in the GROUPS list'), { code: 2 });
    hit.forEach((f) => picked.add(f));
  });
  return files.filter((f) => picked.has(f));
}
function printTimings(results, fileMs, jobSeconds, maxRSS) {
  const count = {};
  results.forEach((r) => { count[r.file] = (count[r.file] || 0) + 1; });
  const rows = Object.keys(count).filter((f) => f !== 'null').map((f) => ({ f, s: (fileMs[f] || 0) / 1000, j: jobSeconds ? jobSeconds[f] : null })).sort((a, b) => b.s - a.s);
  const w = (s) => process.stdout.write(s + '\n');
  w('seconds per group file' + (jobSeconds ? ' (and its whole job, process start included)' : '') + ':');
  rows.forEach((r) => w(r.s.toFixed(1).padStart(8) + ' s ' + (r.j == null ? '' : ('(' + r.j.toFixed(1) + ' s) ').padStart(11)) + String(count[r.f]).padStart(4) + ' tests  ' + r.f));
  w('slowest tests:');
  results.filter((r) => !r.async).sort((a, b) => b.ms - a.ms).slice(0, 25).forEach((r) => w((r.ms / 1000).toFixed(1).padStart(8) + ' s  ' + r.file + ': ' + r.name));
  w('slowest async tests (each has ' + ASYNC_LIMIT_S + ' s once its process is idle):');
  results.filter((r) => r.async).sort((a, b) => b.ms - a.ms).slice(0, 8).forEach((r) => w((r.ms / 1000).toFixed(1).padStart(8) + ' s  ' + r.file + ': ' + r.name));
  w('largest process: ' + Math.round(maxRSS / 1048576) + ' MB');
}
function saveTimings(fileMs) {
  const seconds = {};
  Object.keys(fileMs).sort().forEach((f) => { seconds[f] = +(fileMs[f] / 1000).toFixed(2); });
  fs.writeFileSync(TIMINGS, JSON.stringify({ note: 'seconds per group file, for handing out the longest first: node anvil/headless/anvil.js test --save-timings', seconds }, null, 1) + '\n');
}
async function cmdTest(flags) {
  const html = fs.readFileSync(TESTS_PAGE, 'utf8'), all = groupList(html);
  const only = flags.only ? selectGroups(flags.only, all) : null;
  const files = only || all;
  const jobs = flags.jobs ? Math.floor(Number(flags.jobs)) : defaultJobs();
  if (!(jobs >= 1)) throw Object.assign(new Error('--jobs: give a whole number of at least 1'), { code: 2 });
  const t0 = performance.now();
  let results, fileMs, jobSeconds = null, maxRSS;
  if (flags.serial || jobs === 1 || files.length === 1) {
    const r = await runPage(pageEnv(), only);
    results = r.results; fileMs = r.fileMs; maxRSS = process.resourceUsage().maxRSS * 1024;
  } else {
    const pool = await runPool(files, Math.min(jobs, files.length));
    results = mergeRows(files, pool); fileMs = pool.fileMs; jobSeconds = pool.jobSeconds; maxRSS = pool.maxRSS;
  }
  const failures = results.filter((r) => !r.ok);
  if (!flags.quiet) {
    let group = null;
    results.forEach((r) => {
      if (flags.verbose && r.group !== group) { group = r.group; process.stdout.write('\n' + group + '\n'); }
      if (flags.verbose || !r.ok) process.stdout.write((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '\n      ' + String(r.detail).replace(/\n/g, '\n      ') : '') + '\n');
    });
  }
  if (flags.timings) printTimings(results, fileMs, jobSeconds, maxRSS);
  if (flags['save-timings']) saveTimings(fileMs);
  process.stdout.write((results.length - failures.length) + ' / ' + results.length + ' passed' + (failures.length ? ' — ' + failures.length + ' FAILED' : '') + '  ·  ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s\n');
  return failures.length ? 1 : 0;
}

if (require.main === module && process.send) childMain();
module.exports = { cmdTest };
