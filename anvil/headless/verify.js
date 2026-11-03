// verify.js — the head's whole check in one command: `node anvil/headless/verify.js` (also `anvil.js verify`).
// Runs, at the same time and never more than --slots busy processes (default half the threads: 8 on the shop PC):
//   kernel    tests/kernel-tests.html under Node (anvil.js test: one job per group file, slow files split by rows)
//   examples  anvil.js example --all              (every Design Library example against its documented volume)
//   ex-occt   anvil.js example --all --occt       (the same on OpenCascade under Node; needs vendor/occt)
//   smoke     ui-smoke.js on tests/ui-smoke.html  (headless Chrome, --shards Chromes at once, 2 slots each)
//   occt      ui-smoke.js on tests/occt-tests.html (headless Chrome, 2 slots; needs vendor/occt)
// One slot pool, longest first: the Chromes and the two example runs start at once, kernel jobs fill every slot left
// and take over the slots the others free. Prints one table and every FAIL row; exit 0 all green, 1 any failure, 2 when
// something could not run. The server: --url (default http://localhost:8812); when nothing answers there and the port is
// local, serve.ps1 is started on it for the run and stopped after. Options: --slots n, --shards n (default 2), --port n
// (first Chrome debugging port, default 9312), --slowest [n], --skip kernel,examples,ex-occt,smoke,occt, --keep-logs.
// Every suite's full output goes to a log folder (printed). Test counts and per-suite seconds of the last green run are
// kept in headless/verify-timings.json (what the scheduler expects; a missing file only costs ordering).
'use strict';
const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const TR = require('./test-run');

const HERE = __dirname, ANVIL = path.join(HERE, '..'), NODE = process.execPath;
const TIMES = path.join(HERE, 'verify-timings.json');
const OCCT_WASM = path.join(ANVIL, 'vendor', 'occt', 'opencascade.full.wasm');

function parseFlags(argv) {
  const f = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!/^--/.test(a)) continue;
    const k = a.slice(2), v = argv[i + 1];
    if (v !== undefined && !/^--/.test(v)) { f[k] = v; i++; } else f[k] = true;
  }
  return f;
}
function sec(ms) { return Math.round(ms / 1000); }
async function up(u) { try { const r = await fetch(u, { method: 'HEAD' }); return r.ok; } catch (e) { return false; } }

// a child process whose output goes to a log file -> Promise of { code, out, ms }
function runLogged(name, args, logDir) {
  const t0 = Date.now(), log = path.join(logDir, name + '.txt');
  return new Promise((resolve) => {
    const c = cp.spawn(NODE, args, { cwd: path.join(ANVIL, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { err += d; });
    c.on('exit', (code) => {
      fs.writeFileSync(log, out + (err ? '\n--- stderr ---\n' + err : ''));
      resolve({ code: code == null ? 2 : code, out, err, ms: Date.now() - t0, log });
    });
  });
}
// "28 / 29 examples ok, 1 FAILED" and its FAIL rows (the line after a FAIL row is its reason)
function exampleResult(r) {
  const m = /(\d+) \/ (\d+) examples/.exec(r.out), fails = [], L = r.out.split('\n');
  L.forEach((l, i) => { if (/^FAIL\s/.test(l)) fails.push(l.replace(/\s+/g, ' ').trim() + (L[i + 1] && /^\s{4,}/.test(L[i + 1]) ? ' — ' + L[i + 1].trim() : '')); });
  if (!m) return { passed: 0, total: 0, fails: ['did not finish (exit ' + r.code + '): see ' + r.log], broken: true };
  return { passed: +m[1], total: +m[2], fails };
}
function pageResult(r, json) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(json, 'utf8')); } catch (e) { }
  if (!j) return { passed: 0, total: 0, fails: ['did not finish (exit ' + r.code + '): see ' + r.log], broken: true };
  const fails = (j.errors || []).concat(j.failures.map((f) => f.name + ' — ' + String(f.detail).split('\n')[0].slice(0, 300)));
  return { passed: j.passed, total: j.total, fails, raw: j.failures, notes: j.notes || [], broken: r.code === 2 || (j.errors || []).length > 0 };
}

async function main(argv) {
  const flags = parseFlags(argv || process.argv.slice(2));
  const threads = os.availableParallelism ? os.availableParallelism() : os.cpus().length;
  const slots = Math.max(2, Math.floor(Number(flags.slots) || threads / 2));
  const shards = Math.max(1, Math.floor(Number(flags.shards) || 2));
  const base = String(flags.url || 'http://localhost:8812').replace(/\/+$/, '');
  const dbgPort = Number(flags.port) || 9312;
  const skip = new Set(String(flags.skip || '').split(',').map((s) => s.trim()).filter(Boolean));
  const occtHere = fs.existsSync(OCCT_WASM);
  const slowest = flags.slowest ? (Number(flags.slowest) || 15) : 0;
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anvil-verify-'));
  let rec = {};
  try { rec = JSON.parse(fs.readFileSync(TIMES, 'utf8')); } catch (e) { }
  const recS = rec.seconds || {};
  const t0 = Date.now();
  const log = (s) => process.stdout.write('[' + sec(Date.now() - t0) + ' s] ' + s + '\n');

  // the server, for the two pages
  let server = null;
  const needPages = !skip.has('smoke') || (!skip.has('occt') && occtHere);
  if (needPages && !(await up(base + '/tests/ui-smoke.html'))) {
    const m = /^https?:\/\/(localhost|127\.0\.0\.1):(\d+)$/.exec(base);
    if (!m || process.platform !== 'win32') { process.stderr.write('Nothing serves ' + base + ' (start anvil/serve.ps1 first, or pass --url).\n'); return 2; }
    server = cp.spawn('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ANVIL, 'serve.ps1'), '-Port', m[2]], { stdio: 'ignore' });
    for (let i = 0; i < 60 && !(await up(base + '/tests/ui-smoke.html')); i++) await new Promise((r) => setTimeout(r, 500));
    if (!(await up(base + '/tests/ui-smoke.html'))) { try { server.kill(); } catch (e) { } process.stderr.write('serve.ps1 did not come up on ' + base + '.\n'); return 2; }
    log('started serve.ps1 on ' + base + ' for this run');
  }

  // the tasks: { name, label, slots, est (s), run() -> Promise<{ passed, total, fails, broken }> }
  const tasks = [];
  const smokeJson = path.join(logDir, 'smoke.json'), occtJson = path.join(logDir, 'occt.json');
  if (!skip.has('smoke')) tasks.push({ name: 'smoke', label: 'ui-smoke (' + shards + ' Chrome' + (shards > 1 ? 's' : '') + ')', slots: 2 * shards, est: recS.smoke || 400 / shards,
    run: async () => pageResult(await runLogged('smoke', [path.join(HERE, 'ui-smoke.js'), base + '/tests/ui-smoke.html', '--port', String(dbgPort), '--timeout', '900', '--shards', String(shards), '--json', smokeJson].concat(slowest ? ['--slowest', String(slowest)] : []), logDir), smokeJson) });
  // the occt page's Chrome idles while OpenCascade's worker builds: one slot (measured below 1.2 cores; a smoke Chrome 1.8)
  if (!skip.has('occt') && occtHere) tasks.push({ name: 'occt', label: 'occt-tests page', slots: 1, est: recS.occt || 190,
    run: async () => pageResult(await runLogged('occt', [path.join(HERE, 'ui-smoke.js'), base + '/tests/occt-tests.html', '--port', String(dbgPort + shards), '--timeout', '900', '--json', occtJson], logDir), occtJson) });
  if (!skip.has('ex-occt') && occtHere) tasks.push({ name: 'ex-occt', label: 'example --all --occt', slots: 1, est: recS['ex-occt'] || 90,
    run: async () => exampleResult(await runLogged('ex-occt', [path.join(HERE, 'anvil.js'), 'example', '--all', '--occt'], logDir)) });
  if (!skip.has('examples')) tasks.push({ name: 'examples', label: 'example --all', slots: 1, est: recS.examples || 30,
    run: async () => exampleResult(await runLogged('examples', [path.join(HERE, 'anvil.js'), 'example', '--all'], logDir)) });
  if (slots < Math.max.apply(null, tasks.map((t) => t.slots).concat([1]))) { process.stderr.write('--slots ' + slots + ' is fewer than one task needs (ui-smoke: 2 per Chrome).\n'); return 2; }

  // the kernel suite as single jobs in the same pool
  let kernel = null;
  if (!skip.has('kernel')) {
    const k = TR.kernelPlan({ jobs: slots });
    kernel = { files: k.files, jobs: k.jobs, done: [], next: 0, t0: 0, ms: 0 };
  }

  // the pool: longest first; a task waits until its slots are free; kernel jobs (1 slot) fill the gaps
  const finished = {}, started = {};
  let used = 0;
  let liveKernel = 0, beat = null;
  await new Promise((resolve) => {
    const queue = tasks.slice().sort((a, b) => b.est - a.est);
    function pump() {
      while (queue.length && used + queue[0].slots <= slots) {
        const t = queue.shift();
        used += t.slots; started[t.name] = Date.now();
        t.run().then((r) => {
          r.ms = Date.now() - started[t.name]; finished[t.name] = r; used -= t.slots;
          log(t.label + ': ' + r.passed + ' / ' + r.total + (r.fails.length ? ', ' + r.fails.length + ' FAILED' : '') + ' in ' + sec(r.ms) + ' s');
          pump();
        });
      }
      // kernel jobs take the free slots once every other task has started (they are the shortest, ≤ 1/3 of an even share)
      while (kernel && !queue.length && kernel.next < kernel.jobs.length && used < slots) {
        const job = kernel.jobs[kernel.next++];
        if (!kernel.t0) kernel.t0 = Date.now();
        used++; liveKernel++;
        TR.runJob(job).then((d) => {
          kernel.done.push(d); used--; liveKernel--;
          if (kernel.next >= kernel.jobs.length && !liveKernel) { kernel.ms = Date.now() - kernel.t0; log('kernel tests: ' + kernel.jobs.length + ' jobs done in ' + sec(kernel.ms) + ' s'); }
          pump();
        });
      }
      const kernelDone = !kernel || (kernel.next >= kernel.jobs.length && !liveKernel);
      if (!queue.length && kernelDone && Object.keys(finished).length === tasks.length) resolve();
    }
    beat = setInterval(() => {
      const live = tasks.filter((t) => started[t.name] && !finished[t.name]).map((t) => t.name);
      log('running: ' + live.concat(kernel && (liveKernel || kernel.next < kernel.jobs.length) ? ['kernel ' + kernel.done.length + ' / ' + kernel.jobs.length + ' jobs'] : []).join(', ') + ' (' + used + ' / ' + slots + ' slots)');
    }, 30000);
    pump();
  });
  clearInterval(beat);

  // A smoke step that failed while everything ran at once is run again alone, on the now quiet machine, in its own
  // shard of one file (the suite's setup step first): the timing steps (r13/trim13 …) are written for a quiet machine.
  // The table says so; a step that fails alone too stays a failure. More than --retry (default 3) failures: no rerun.
  const sm = finished.smoke, maxRetry = flags.retry != null ? Number(flags.retry) : 3;
  if (sm && !sm.broken && sm.raw && sm.raw.length && sm.raw.length <= maxRetry && sm.raw.every((f) => f.file)) {
    const groups = (/var GROUPS = \[([\s\S]*?)\];/.exec(fs.readFileSync(path.join(ANVIL, 'tests', 'ui-smoke.html'), 'utf8'))[1].match(/'[^']+'/g) || []).map((s) => s.slice(1, -1));
    sm.retried = [];
    const still = [];
    for (const f of sm.raw) {
      const i = groups.indexOf(f.file), json = path.join(logDir, 'retry-' + sm.retried.length + '.json');
      const r = pageResult(await runLogged('retry-' + sm.retried.length, [path.join(HERE, 'ui-smoke.js'), base + '/tests/ui-smoke.html?files=' + i + '-' + (i + 1) + '&only=' + encodeURIComponent(f.name), '--port', String(dbgPort), '--timeout', '300', '--json', json], logDir), json);
      const ok = i >= 0 && !r.broken && !r.fails.length && r.total >= 1;
      log('smoke step rerun alone: ' + (ok ? 'PASS' : 'FAIL') + '  ' + f.name.slice(0, 100));
      (ok ? sm.retried : still).push(f.name + ' — under load: ' + String(f.detail).split('\n')[0].slice(0, 200));
    }
    if (!still.length) { sm.passed += sm.raw.length; sm.fails = []; } else sm.fails = still.concat(sm.retried.map((x) => '(passed alone) ' + x));
  }
  if (server) { try { cp.execSync('taskkill /pid ' + server.pid + ' /T /F', { stdio: 'ignore' }); } catch (e) { } }

  // the kernel rows, merged as anvil.js test merges them
  if (kernel) {
    const pool = TR.poolResult(kernel.done), results = TR.mergeRows(kernel.files, pool), bad = results.filter((r) => !r.ok);
    finished.kernel = { passed: results.length - bad.length, total: results.length, ms: kernel.ms, fails: bad.map((r) => r.name + ' — ' + String(r.detail || '').split('\n')[0].slice(0, 300)) };
    fs.writeFileSync(path.join(logDir, 'kernel.txt'), results.map((r) => (r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '\n      ' + String(r.detail).replace(/\n/g, '\n      ') : '')).join('\n') + '\n');
    if (slowest) {
      finished.kernel.slow = results.filter((r) => !r.async).sort((a, b) => b.ms - a.ms).slice(0, slowest).map((r) => (r.ms / 1000).toFixed(1).padStart(6) + ' s  ' + r.file + ': ' + r.name.slice(0, 110));
    }
  }

  // the table
  const wall = Date.now() - t0;
  const order = [['kernel', 'kernel tests'], ['examples', 'example --all'], ['ex-occt', 'example --all --occt'], ['smoke', (tasks.find((t) => t.name === 'smoke') || {}).label || 'ui-smoke'], ['occt', 'occt-tests page']];
  const w = (s) => process.stdout.write(s + '\n');
  w('');
  w('suite                   result          time');
  let anyFail = false, anyBroken = false;
  order.forEach(([k, label]) => {
    const r = finished[k];
    if (!r) { w(label.padEnd(22) + '  ' + (skip.has(k) ? 'skipped' : k === 'occt' || k === 'ex-occt' ? 'skipped (no vendor/occt)' : '-')); return; }
    const ok = !r.fails.length && !r.broken && r.passed === r.total && r.total > 0;
    if (!ok) anyFail = true;
    if (r.broken) anyBroken = true;
    const was = (rec.counts || {})[k], extra = [];
    if (was != null && r.total !== was) extra.push((r.total < was ? 'FEWER tests than' : 'was') + ' ' + was + ' at the last green verify');
    if (r.retried && r.retried.length) extra.push(r.retried.length + ' failed under load, passed alone (below)');
    w(label.padEnd(22) + '  ' + ((ok ? 'PASS ' : 'FAIL ') + r.passed + ' / ' + r.total).padEnd(14) + String(sec(r.ms)).padStart(5) + ' s' + (extra.length ? '   ' + extra.join('; ') : ''));
  });
  w('whole verify'.padEnd(22) + '  ' + (anyFail ? 'FAIL' : 'PASS').padEnd(14) + String(sec(wall)).padStart(5) + ' s   (' + slots + ' slots; logs in ' + logDir + ')');
  const sm2 = finished.smoke;
  if (sm2 && sm2.retried && sm2.retried.length && !sm2.fails.length) { w('\nui-smoke steps that failed with every suite running and passed rerun alone (timing under load; look if one repeats):'); sm2.retried.forEach((f) => w('  ' + f)); }
  if (sm2 && sm2.notes && sm2.notes.length && (sm2.fails.length || (sm2.retried && sm2.retried.length))) { w('\nui-smoke shard boundary (settings a shard starts with that the full run would not hand it; matters only if a step there fails):'); sm2.notes.forEach((n) => w('  ' + n.slice(0, 600))); }
  order.forEach(([k, label]) => {
    const r = finished[k];
    if (r && r.fails.length) { w('\n' + label + ' — FAIL rows:'); r.fails.forEach((f) => w('  ' + f)); }
  });
  if (slowest) {
    if (finished.kernel && finished.kernel.slow) { w('\nslowest kernel tests:'); finished.kernel.slow.forEach((l) => w(l)); }
    try {
      const s = fs.readFileSync(path.join(logDir, 'smoke.txt'), 'utf8'), i = s.indexOf('\nSlowest');
      if (i >= 0) w(s.slice(i, s.indexOf('\n--- stderr ---') > i ? s.indexOf('\n--- stderr ---') : undefined).trimEnd());
    } catch (e) { }
  }
  if (!anyFail) {
    const seconds = Object.assign({}, recS), counts = Object.assign({}, rec.counts || {});
    Object.keys(finished).forEach((k) => { seconds[k] = sec(finished[k].ms); counts[k] = finished[k].total; });
    seconds.wall = sec(wall);
    fs.writeFileSync(TIMES, JSON.stringify({ note: 'the last green verify: seconds per suite (scheduling order) and test counts: node anvil/headless/verify.js', seconds, counts }, null, 1) + '\n');
    if (!flags['keep-logs']) { /* logs stay in the temp folder either way; they are small */ }
  }
  return anyBroken ? 2 : anyFail ? 1 : 0;
}

if (require.main === module) main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 300); }, (e) => { console.error(e && e.stack || e); process.exit(2); });
module.exports = { main };
