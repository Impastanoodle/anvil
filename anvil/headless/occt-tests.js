// headless/occt-tests.js — tests/occt-tests.html without a browser: the page's own test script runs in Node against
// a stand-in for its worker that runs occt-worker.js's message handler (the real file, its engine loading swapped for
// the engine already loaded here) on the WebAssembly engine, or with --native on the native OpenCascade addon
// (desktop/native). Messages are structured-cloned both ways, as a worker's are. The page's rows are printed as
// PASS / FAIL / TODO lines; exit 0 when no row failed, 1 on a failed row, 2 when the engine is missing.
//
//   node anvil/headless/occt-tests.js [--native [dir]] [--json out] [--only text] [--quiet]
//
// --only: rows whose name contains the text are printed (every row still runs: the page is one script).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { load, scriptList, runScript, ANVIL_DIR } = require('./load');

const PAGE = path.join(ANVIL_DIR, 'tests', 'occt-tests.html');
const WORKER = path.join(ANVIL_DIR, 'occt-worker.js');

function parse(argv) {
  const o = { native: null, json: null, only: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--native') { o.native = true; if (argv[i + 1] && argv[i + 1].slice(0, 2) !== '--') o.native = argv[++i]; }
    else if (a === '--json') o.json = argv[++i];
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--help' || a === '-h') { process.stdout.write('usage: node anvil/headless/occt-tests.js [--native [dir]] [--json out] [--only text] [--quiet]\n'); process.exit(0); }
    else throw Object.assign(new Error('unknown option ' + a), { code: 2 });
  }
  return o;
}

// a minimal DOM: the page only makes table rows (tr with four cells through innerHTML) and sets the summary's text
function fakeElement(tag) {
  const el = { tagName: String(tag).toUpperCase(), className: '', textContent: '', children: [], appendChild(c) { this.children.push(c); return c; } };
  Object.defineProperty(el, 'innerHTML', {
    set(html) { const n = (String(html).match(/<td\b/g) || []).length; el.children = []; for (let i = 0; i < n; i++) el.children.push(fakeElement('td')); },
    get() { return ''; }
  });
  return el;
}

// the worker: occt-worker.js's own source with the block that fetches and loads the engine replaced by the engine
// loaded here; its `self` is a scope object whose postMessage hands the (cloned) reply to the page's onmessage
function makeWorkerClass(oc, loadMs) {
  let src = fs.readFileSync(WORKER, 'utf8');
  const a = src.indexOf('const ready = (async () => {');
  const b = a < 0 ? -1 : src.indexOf('})();', a);
  if (a < 0 || b < 0) throw new Error('occt-worker.js: the engine loading block (const ready = (async () => { … })();) was not found');
  src = src.slice(0, a) + 'const ready = (async () => { self.postMessage({ type: \'ready\', loadMs: __loadMs }); return __oc; })();' + src.slice(b + 5);
  const factory = vm.runInThisContext('(function (self, __oc, __loadMs) {' + src + '\n})', { filename: WORKER });
  return class FakeWorker {
    constructor() {
      const page = this;
      this.onmessage = null; this.onerror = null;
      this.scope = {
        Kernel: globalThis.Kernel, CSG: globalThis.CSG, location: { href: 'file:///' + WORKER.replace(/\\/g, '/') },
        onmessage: null,
        postMessage(data) { const d = structuredClone(data); setImmediate(() => { if (page.onmessage) page.onmessage({ data: d }); }); }
      };
      factory(this.scope, oc, loadMs);
    }
    postMessage(data) { const d = structuredClone(data), s = this.scope; setImmediate(() => { if (s.onmessage) s.onmessage({ data: d }); }); }
    terminate() { }
  };
}

async function main() {
  const opts = parse(process.argv.slice(2));
  const g = load({ occt: true });
  // anything the page loads that the kernel test page does not
  const have = new Set(g.files.map((f) => path.resolve(f)));
  scriptList(PAGE).forEach((f) => { if (!have.has(path.resolve(f))) runScript(f); });
  const { loadOpenCascade } = require('./occt');
  const { oc, loadMs } = await loadOpenCascade({ native: opts.native });
  const html = fs.readFileSync(PAGE, 'utf8');
  const inline = [];
  const re = /<script>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) inline.push(m[1]);
  if (!inline.length) throw new Error('no inline <script> in ' + PAGE);

  const els = { rows: fakeElement('tbody'), summary: fakeElement('div') };
  const document = { getElementById: (id) => els[id] || (els[id] = fakeElement('div')), createElement: fakeElement };
  let finished;
  const done = new Promise((res) => { finished = res; });
  const window = {};
  Object.defineProperty(window, 'occtTestsDone', { set(v) { if (v) finished(); }, get() { return false; } });
  const Worker = makeWorkerClass(oc, loadMs);
  const t0 = performance.now();
  const run = vm.runInThisContext('(function (document, window, Worker) {' + inline.join('\n') + '\n})', { filename: PAGE });
  run(document, window, Worker);
  await done;
  const ms = performance.now() - t0;

  const rows = els.rows.children.map((tr) => ({ status: tr.children[0].textContent, name: tr.children[1].textContent, detail: tr.children[2].textContent, ms: tr.children[3].textContent === '' ? null : +tr.children[3].textContent }));
  const counts = { pass: 0, fail: 0, todo: 0 };
  rows.forEach((r) => { counts[r.status === 'PASS' ? 'pass' : r.status === 'FAIL' ? 'fail' : 'todo']++; });
  if (!opts.quiet) rows.forEach((r) => {
    if (opts.only && r.name.indexOf(opts.only) < 0) return;
    process.stdout.write(r.status + '  ' + r.name + (r.status === 'PASS' ? '' : '\n      ' + r.detail.replace(/\n/g, '\n      ')) + '\n');
  });
  const engine = opts.native ? 'native OpenCascade 7.6.3' : 'opencascade.js (WebAssembly)';
  process.stdout.write(els.summary.textContent + '\n' + rows.length + ' rows: ' + counts.pass + ' pass, ' + counts.fail + ' fail, ' + counts.todo + ' todo · ' + engine + ' · ' + (ms / 1000).toFixed(1) + ' s\n');
  if (opts.json) fs.writeFileSync(path.resolve(opts.json), JSON.stringify({ engine, loadMs, ms, counts, summary: els.summary.textContent, rows }, null, 1) + '\n');
  return counts.fail ? 1 : 0;
}

main().then((code) => { process.exitCode = code; }, (e) => { process.stderr.write(((e && e.stack) || e) + '\n'); process.exitCode = e && e.code === 2 ? 2 : 1; });
