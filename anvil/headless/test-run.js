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
// one run of the page; only = list of group files, or a map file -> true | { rows, from } (a part of a split file), or
// null for all of them
async function runPage(env, only) {
  let map = null;
  if (Array.isArray(only)) { map = {}; only.forEach((f) => { map[f] = true; }); } else if (only) map = only;
  globalThis.__anvilOnly = map || undefined;
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
    runPage(env, m.only).then((r) => {
      process.send({ results: r.results, fileMs: r.fileMs, fileRows: r.fileRows || {}, maxRSS: process.resourceUsage().maxRSS * 1024 });
    }, (e) => {
      process.send({ error: String((e && e.stack) || e), fileMs: {}, fileRows: {}, maxRSS: process.resourceUsage().maxRSS * 1024 });
    });
  });
  process.send({ ready: true });
}

// ------------------------------------------------------------------ the pool
// test-timings.json: { seconds: { file: s }, rows: { file: [ms of each test, in file order] } } (rows only for the slow files)
function recorded() { try { const j = JSON.parse(fs.readFileSync(TIMINGS, 'utf8')); return { seconds: j.seconds || {}, rows: j.rows || {} }; } catch (e) { return { seconds: {}, rows: {} }; } }
const ROWS_MIN_S = 8;   // --save-timings keeps each test's time for files at least this long: the ones that may be split
const JOB_START_S = 0.6;   // a job's own cost: a process, the engine and every group file's top level
// The jobs: one per group file, except that a file longer than a third of the even share (all files / n) is split into
// parts by its rows, each part at most that long, so the run is no longer bound by its slowest file (rfGH, rfGI were 145 s
// and 137 s of a 129 s share). A part is a run of consecutive rows (each test still sees the tests before it in its own
// part, as in the page), chosen from the recorded row times; with no row times on record, every k-th row. Longest first.
// -> [{ file, part: null | { rows, from } | { mod, rem }, est, label }]
function planJobs(files, n, rec, split) {
  const seconds = rec.seconds;
  const known = files.map((f) => seconds[f]).filter((s) => s > 0).sort((a, b) => a - b);
  const mid = known.length ? known[known.length >> 1] : 1;
  const est = (f) => (seconds[f] > 0 ? seconds[f] : mid);
  const total = files.reduce((s, f) => s + est(f) + JOB_START_S, 0);
  const cap = Math.max(total / n / 3, ROWS_MIN_S);
  const jobs = [];
  files.forEach((f) => {
    const s = est(f), times = rec.rows[f];
    if (!split || n < 2 || s <= cap) { jobs.push({ file: f, part: null, est: s, label: f }); return; }
    if (!times || times.length < 2) {
      const k = Math.min(n, Math.ceil(s / cap));
      for (let j = 0; j < k; j++) jobs.push({ file: f, part: { mod: k, rem: j }, est: s / k, label: f + ' (every ' + k + 'th row from ' + j + ')' });
      return;
    }
    const parts = [];
    let cur = [], sum = 0;
    times.forEach((ms, i) => {
      const t = ms / 1000;
      if (cur.length && sum + t > cap) { parts.push({ rows: cur, s: sum }); cur = []; sum = 0; }
      cur.push(i); sum += t;
    });
    if (cur.length) parts.push({ rows: cur, s: sum });
    if (parts.length < 2) { jobs.push({ file: f, part: null, est: s, label: f }); return; }
    parts.forEach((p, k) => {
      const rows = {};
      p.rows.forEach((i) => { rows[i] = true; });
      // the last part also takes any row added since the times were recorded
      const last = k === parts.length - 1;
      jobs.push({ file: f, part: { rows, from: last ? times.length : null }, est: p.s, label: f + ' (rows ' + p.rows[0] + '–' + (last ? 'end' : p.rows[p.rows.length - 1]) + ')' });
    });
  });
  return jobs.sort((a, b) => b.est - a.est);
}
function crashRow(file, why, label) {
  return { group: file, name: (label || file) + ' job', file, ok: false, detail: why, ms: 0, pending: false };
}
// one job in a child process of its own -> Promise of { job, rows, fileRows, crashed, fileMs, seconds, maxRSS }
const JOB_LIMIT_S = 1200;   // a test stuck in a loop: that job fails, the others finish
function runJob(job) {
  return new Promise((resolve) => {
    // V8 gives a process 4 helper threads by default: 8 jobs could ask for 40 threads and peg every core of the PC
    const c = cp.fork(__filename, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'], execArgv: process.execArgv.concat(V8_POOL) });
    const file = job.file, t0 = Date.now();
    let out = null, why = null;
    const limit = setTimeout(() => { why = 'no result within ' + JOB_LIMIT_S + ' s: the job was stopped'; c.kill(); }, JOB_LIMIT_S * 1000);
    c.on('message', (m) => {
      if (m.ready) { const only = {}; only[file] = job.part || true; c.send({ only }); return; }
      out = { job, rows: m.error ? [crashRow(file, m.error, job.part && job.label)] : m.results, fileRows: m.fileRows || {}, crashed: !!m.error,
        fileMs: m.fileMs[file] || 0, seconds: (Date.now() - t0) / 1000, maxRSS: m.maxRSS || 0 };
      c.kill();
    });
    c.on('exit', (code, signal) => {
      clearTimeout(limit);
      resolve(out || { job, rows: [crashRow(file, why || 'the job\'s process ended early (exit code ' + code + (signal ? ', ' + signal : '') + ')', job.part && job.label)],
        fileRows: {}, crashed: true, fileMs: 0, seconds: (Date.now() - t0) / 1000, maxRSS: 0 });
    });
  });
}
// the finished jobs -> { done, fileMs, jobSeconds, maxRSS } (what mergeRows and printTimings read)
function poolResult(done) {
  const fileMs = {}, jobSeconds = {};
  let maxRSS = 0;
  done.forEach((d) => {
    const f = d.job.file;
    fileMs[f] = (fileMs[f] || 0) + d.fileMs;
    jobSeconds[f] = Math.max(jobSeconds[f] || 0, d.seconds);
    maxRSS = Math.max(maxRSS, d.maxRSS);
  });
  return { done, fileMs, jobSeconds, maxRSS };
}
// run every job, at most n at a time, longest first (the order of `jobs`)
function runPool(jobs, n) {
  const done = [];
  let next = 0;
  return new Promise((resolve) => {
    let live = 0;
    function spawn() {
      if (next >= jobs.length) { if (!live) resolve(poolResult(done)); return; }
      live++;
      runJob(jobs[next++]).then((d) => { done.push(d); live--; spawn(); });
    }
    for (let i = 0; i < n; i++) spawn();
  });
}
// rows in the order the serial page gives them; a load-failure row (no file) comes from every job: keep one of each. The
// parts of a split file must agree on its test count and have run each of its rows exactly once, else a FAIL row says so.
function mergeRows(files, pool) {
  const byFile = new Map();
  pool.done.forEach((d) => { if (!byFile.has(d.job.file)) byFile.set(d.job.file, []); byFile.get(d.job.file).push(d); });
  const out = [], late = new Map();
  files.forEach((f) => {
    const parts = byFile.get(f) || [];
    let mine = [];
    parts.forEach((d) => d.rows.forEach((r) => { if (r.file) mine.push(r); else if (!late.has(r.name)) late.set(r.name, r); }));
    if (parts.length > 1 || (parts[0] && parts[0].job.part)) {
      const ok = parts.filter((d) => !d.crashed), counts = Array.from(new Set(ok.map((d) => d.fileRows[f])));
      const ran = mine.filter((r) => r.idx != null).map((r) => r.idx).sort((a, b) => a - b);
      let why = null;
      if (ok.length === parts.length) {
        if (counts.length !== 1 || !(counts[0] >= 0)) why = 'the parts declared different test counts: ' + counts.join(', ');
        else if (ran.length !== counts[0] || ran.some((x, i) => x !== i)) {
          const seen = {}, missing = [], twice = [];
          ran.forEach((x) => { if (seen[x]) twice.push(x); seen[x] = true; });
          for (let i = 0; i < counts[0]; i++) if (!seen[i]) missing.push(i);
          why = counts[0] + ' tests declared, ' + ran.length + ' ran; rows not run: [' + missing.join(', ') + '], run twice: [' + twice.join(', ') + ']';
        }
      }
      mine = mine.sort((a, b) => (a.idx == null ? 1e9 : a.idx) - (b.idx == null ? 1e9 : b.idx));
      if (why) mine.push({ group: f, name: f + ' split across ' + parts.length + ' jobs: every row once', file: f, ok: false, detail: why, ms: 0, pending: false });
    }
    out.push.apply(out, mine);
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
// the files run (seconds per file, and each test's ms for the slow ones) merge into the record: an --only run keeps the rest
function saveTimings(fileMs, results) {
  let old = {};
  try { old = JSON.parse(fs.readFileSync(TIMINGS, 'utf8')); } catch (e) { }
  const seconds = Object.assign({}, old.seconds || {}), rows = Object.assign({}, old.rows || {});
  Object.keys(fileMs).forEach((f) => { seconds[f] = +(fileMs[f] / 1000).toFixed(2); delete rows[f]; });
  const byFile = {};
  results.forEach((r) => { if (r.file && r.idx != null) (byFile[r.file] = byFile[r.file] || [])[r.idx] = Math.round(r.ms); });
  Object.keys(byFile).forEach((f) => { if (seconds[f] >= ROWS_MIN_S) rows[f] = Array.from(byFile[f], (x) => x || 0); });
  const sorted = (o) => { const out = {}; Object.keys(o).sort().forEach((k) => { out[k] = o[k]; }); return out; };
  const text = JSON.stringify({ note: 'seconds per group file (longest first), and each test\'s ms in the files of ' + ROWS_MIN_S + ' s or more (how a slow file is split across jobs): node anvil/headless/anvil.js test --save-timings', seconds: sorted(seconds), rows: {} }, null, 1)
    .replace(/"rows": \{\}/, '"rows": {\n' + Object.keys(sorted(rows)).map((f) => '  ' + JSON.stringify(f) + ': ' + JSON.stringify(rows[f])).join(',\n') + '\n }');
  fs.writeFileSync(TIMINGS, text + '\n');
}
async function cmdTest(flags) {
  const html = fs.readFileSync(TESTS_PAGE, 'utf8'), all = groupList(html);
  const only = flags.only ? selectGroups(flags.only, all) : null;
  const files = only || all;
  const jobs = flags.jobs ? Math.floor(Number(flags.jobs)) : defaultJobs();
  if (!(jobs >= 1)) throw Object.assign(new Error('--jobs: give a whole number of at least 1'), { code: 2 });
  const t0 = performance.now();
  let results, fileMs, jobSeconds = null, maxRSS;
  const plan = flags.serial || jobs === 1 ? null : planJobs(files, jobs, recorded(), !flags['no-split']);
  if (!plan || plan.length === 1) {
    const r = await runPage(pageEnv(), only);
    results = r.results; fileMs = r.fileMs; maxRSS = process.resourceUsage().maxRSS * 1024;
  } else {
    const pool = await runPool(plan, Math.min(jobs, plan.length));
    results = mergeRows(files, pool); fileMs = pool.fileMs; jobSeconds = pool.jobSeconds; maxRSS = pool.maxRSS;
    const split = plan.filter((j) => j.part);
    if (flags.timings && split.length) process.stdout.write(plan.length + ' jobs, ' + split.length + ' of them parts of ' + new Set(split.map((j) => j.file)).size + ' split files\n');
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
  if (flags['save-timings']) saveTimings(fileMs, results);
  const seconds = (performance.now() - t0) / 1000;
  if (flags.json) fs.writeFileSync(path.resolve(process.cwd(), String(flags.json)), JSON.stringify({ passed: results.length - failures.length, total: results.length, seconds: +seconds.toFixed(1),
    failures: failures.map((r) => ({ name: r.name, file: r.file, detail: String(r.detail || '') })) }, null, 1) + '\n');
  process.stdout.write((results.length - failures.length) + ' / ' + results.length + ' passed' + (failures.length ? ' — ' + failures.length + ' FAILED' : '') + '  ·  ' + seconds.toFixed(1) + ' s\n');
  return failures.length ? 1 : 0;
}

// the whole kernel page as jobs, for headless/verify.js: { files (GROUPS order), jobs (longest first) }
function kernelPlan(opts) {
  const files = groupList(fs.readFileSync(TESTS_PAGE, 'utf8'));
  return { files, jobs: planJobs(files, (opts && opts.jobs) || defaultJobs(), recorded(), !(opts && opts.noSplit)) };
}

if (require.main === module && process.send) childMain();
module.exports = { cmdTest, kernelPlan, runJob, poolResult, mergeRows };
