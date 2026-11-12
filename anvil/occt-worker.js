// occt-worker.js — the OpenCascade kernel's worker (a module worker: opencascade.js is an ES module). Started by
// ui-core.js only while Tools ▸ OpenCascade kernel is on, so the 50 MB engine never loads otherwise. Loads csg.js,
// kernel.js, holewizard.js, exchange.js and occt-kernel.js as classic scripts (their top-level `var`s become
// globals through an indirect eval), then OpenCascade from vendor/occt (fetched by vendor/get-occt.ps1), checked
// against pinned fingerprints before it runs (below).
//
// Messages in:   { type: 'engine', bytes }                the engine file a user picked (no engine on the server); null: none
//                { type: 'build', seq, model, exports?, cacheKey?, noCache?, anvil? }  model: a clone of App.model (or an assembly's
//                  part); exports adds STEP / IGES text; cacheKey picks a per-part rebuild cache; upto: n builds only the
//                  first n features from the cache, leaving it untouched (Edit Feature's rollback; the reply carries upto)
//                { type: 'import', seq, format, text }    a STEP / IGES file read and tessellated (-> 'imported' / 'importError')
// Messages out:  { type: 'ready', loadMs }                once, when OpenCascade has loaded
//                { type: 'built', seq, result }           OcctKernel.build's result (mesh arrays transferred)
//                                                         result.edges: Kernel.bodyEdges of the mesh it makes (parts),
//                                                         result.curves / normals: its Kernel.meshCurveInfo / analyticNormals,
//                                                         result.packed: its bodies (OcctKernel.toBodies) packed, when
//                                                         anvil { key, positions, triShared } (the Anvil mesh) came along
//                { type: 'error', seq, message }          the build itself threw, or the engine could not load
// The engine is checked before it runs: the loader script and the WebAssembly binary must match the fingerprints of
// the official opencascade.js 2.0.0-beta.b5ff984 build (pinned in vendor/get-occt.ps1); anything else is refused and
// Anvil keeps its own kernel. Locally the plain .wasm is used; the published copy ships it gzipped
// (opencascade.full.wasm.gz, under the 15 MB per-file limit) and it is unpacked here.
const OCCT_DIR = './vendor/occt/';
const JS_SHA256 = '8016d504d881f5f3b9f9431524dc8dadd03088588b828e2d18e096bc5fedd5ba';
const WASM_SHA256 = '4b6a74398987eb3ca6bedc7d1b29d6a5af74d0613a9f3bf013a52d7d5d1b5937';
async function sha256(buf) {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  let s = '';
  for (let i = 0; i < d.length; i++) s += d[i].toString(16).padStart(2, '0');
  return s;
}
async function verified(bytes, want, what) {
  const got = await sha256(bytes);
  if (got !== want) throw new Error(what + ' failed its integrity check (sha256 ' + got.slice(0, 12) + '…, expected ' + want.slice(0, 12) + '…); refused');
  return bytes;
}
async function gunzipIfNeeded(bytes) {
  const head = new Uint8Array(bytes, 0, 2);
  if (!(head[0] === 0x1f && head[1] === 0x8b)) return bytes;   // not gzipped (or a server already unpacked it)
  if (typeof DecompressionStream === 'undefined') throw new Error('this browser cannot unpack the engine (no DecompressionStream)');
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
// a page with no engine on its server (the published copy) is sent the bytes of a file the user picked
// ({ type: 'engine', bytes }, ui-occt.js); they get the same check as a served file
let engineFromPage = null;
const pageEngine = new Promise((res) => { engineFromPage = res; });
async function engineBinary() {
  let bytes = null;
  for (const f of ['opencascade.full.wasm', 'opencascade.full.wasm.gz']) {
    let res = null;
    try { res = await fetch(OCCT_DIR + f); } catch (e) { res = null; }
    if (res && res.ok) { bytes = await res.arrayBuffer(); break; }
  }
  if (!bytes) bytes = await pageEngine;
  if (!bytes) throw new Error('engine file missing');
  return verified(await gunzipIfNeeded(bytes), WASM_SHA256, 'opencascade.full.wasm');
}
async function engineFactory() {
  const url = OCCT_DIR + 'opencascade.full.js';
  const res = await fetch(url);
  if (!res.ok) throw new Error('engine loader missing (HTTP ' + res.status + ')');
  await verified(await res.arrayBuffer(), JS_SHA256, 'opencascade.full.js');
  return (await import(url)).default;   // the same file, imported only once its bytes have checked out
}

// (rfIO) Why OpenCascade took ~3.5 s to start, measured in the Windows app (desktop/check.js occt-start) and a
// profile: fetching + checking the 48 MB binary ~0.25 s, compiling it ~0.08 s (V8 compiles WebAssembly lazily),
// instantiating ~0.05 s, and ~3.3 s in embind's start-up, which builds one JavaScript wrapper per bound C++ method with
// `new Function(source)` (createNamedFunction, craftInvokerFunction): tens of thousands of pieces of source that V8
// parses and compiles one by one, on every start (no code cache keeps eval'd code; a WebAssembly code cache would save
// only the 0.08 s). fastFunction stands in for the global Function constructor while the engine starts, and for those
// two shapes of source only: a createNamedFunction wrapper is made as a closure (no source at all), and an invoker's
// source is compiled once per shape (its name, its comments and the method name in its error message taken out as
// parameters) and reused for every method of that shape, so a few hundred compiles replace tens of thousands. The
// functions it returns do what the generated ones did (same arguments, same name, same error text). Any other source
// goes to the real Function. opencascade.full.js itself is untouched and still checked against its fingerprint.
function fastFunction(RealFunction) {
  const memo = new Map();
  const NAMED = /^return function ([\w$]+)\(\) \{\n {4}"use strict"; {4}return body\.apply\(this, arguments\);\n\};\n$/;
  const INVOKER = /^return function ([\w$]+)\(([\w, ]*)\) \{\nif \(arguments\.length !== (\d+)\) \{\nthrowBindingError\('function ([^'\\\n]*) called with ' \+ arguments\.length \+ ' arguments, expected \3 args!'\);\n\}\n/;
  const stats = { named: 0, invokers: 0, compiled: 0, other: 0 };
  function named(fn, name) { try { Object.defineProperty(fn, 'name', { value: name, configurable: true }); } catch (e) { } return fn; }
  function F() {
    const n = arguments.length, body = n ? String(arguments[n - 1]) : '';
    const params = Array.prototype.slice.call(arguments, 0, Math.max(0, n - 1)).map(String);
    let m;
    if (params.length === 1 && params[0] === 'body' && (m = NAMED.exec(body))) {
      const name = m[1];
      stats.named++;
      return function (b) { return named(function () { 'use strict'; return b.apply(this, arguments); }, name); };
    }
    if ((m = INVOKER.exec(body)) && params.every((p) => /^[\w$]+$/.test(p) && p !== '__anvilHuman')) {
      const fname = m[1], human = m[4];
      const rest = body.slice(m[0].length).replace(/ \/\/ [^\n]*\n/g, '\n');
      const key = params.join(',') + '|' + m[2] + '|' + m[3] + '|' + rest;
      let factory = memo.get(key);
      if (!factory) {
        factory = RealFunction.apply(null, params.concat(['__anvilHuman', 'return function (' + m[2] + ') {\nif (arguments.length !== ' + m[3] + ') {\n' +
          "throwBindingError('function ' + __anvilHuman + ' called with ' + arguments.length + ' arguments, expected " + m[3] + " args!');\n}\n" + rest]));
        memo.set(key, factory);
        stats.compiled++;
      }
      stats.invokers++;
      return function () { return named(factory.apply(this, Array.prototype.slice.call(arguments, 0, params.length).concat([human])), fname); };
    }
    stats.other++;
    return RealFunction.apply(this, arguments);
  }
  F.prototype = RealFunction.prototype;   // `x instanceof Function` (embind's new_) answers as before
  F.stats = stats;
  return F;
}
// runs start() with fastFunction in place of the global Function, which comes back however start() ends
async function withFastFunction(start, phases) {
  if (/[?&]plainstart\b/.test(self.location.search)) { if (phases) phases.functions = 'plain'; return start(); }   // ui-occt.js plainStart (measuring only)
  const Real = self.Function;
  const fast = fastFunction(Real);
  self.Function = fast;
  try { return await start(); } finally { self.Function = Real; if (phases) phases.functions = fast.stats; }
}

async function classic(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(url + ': HTTP ' + res.status);
  (0, eval)((await res.text()) + '\n//# sourceURL=' + new URL(url, self.location.href).href);
  loadNote(Math.min(0.2, ++loadStep * 0.014), 'Loading ' + url);   // lane progress
}
// lane progress: { type: 'loading', fraction (0..1 or null), text } while the engine starts (ui-occt.js shows the bar)
let loadStep = 0;
function loadNote(fraction, text) { try { self.postMessage({ type: 'loading', fraction, text }); } catch (e) { } }

// the rebuild cache (OcctKernel.build opts.cache): snapshots after each feature, reused while the prefix is unchanged
let cache = {};
// assemblies: one cache per part (message cacheKey), the most recent 32 kept
const caches = new Map();
// an evicted cache frees its snapshot handles (OpenCascade objects are not garbage collected)
function freeCache(c) {
  (c.states || []).forEach((S) => S.bodies.forEach((b) => { try { b.delete(); } catch (e) { } }));
  Object.values(c.tools || {}).forEach((t) => { try { t.delete(); } catch (e) { } });
}
function cacheFor(key) {
  if (!key) return cache;
  let c = caches.get(key);
  if (!c) {
    c = {}; caches.set(key, c);
    if (caches.size > 32) { const old = caches.keys().next().value; freeCache(caches.get(old)); caches.delete(old); }
  }
  return c;
}

const ready = (async () => {
  for (const f of ['csg.js', 'kernel.js', 'sketch-font.js', 'kernel-sketch.js', 'kernel-curves.js', 'kernel-equations.js', 'kernel-mesh.js', 'kernel-rebuild.js', 'kernel-features.js', 'kernel-sheetmetal.js', 'kernel-script.js', 'holewizard.js', 'exchange.js', 'occt-kernel.js']) await classic(f);
  const t0 = performance.now();
  // the Windows app runs this same file in a process of its own (desktop/occt-host.js) and sets anvilNativeEngine,
  // which returns OpenCascade built for Windows (desktop/native: the same `oc` API); a browser never has it
  let oc;
  const phases = {};
  loadNote(0.22, 'Reading the engine');   // lane progress
  if (typeof self.anvilNativeEngine === 'function') oc = await self.anvilNativeEngine();
  else {
    const [opencascade, wasmBinary] = await Promise.all([engineFactory(), engineBinary()]);
    phases.bytesMs = performance.now() - t0;
    loadNote(0.3, 'Compiling the engine');   // lane progress
    let t1 = performance.now();
    // the engine's own start-up (emscripten + embind), timed in phases: compile, instantiate, init (embind's wrappers)
    const mod = await WebAssembly.compile(wasmBinary);
    phases.compileMs = performance.now() - t1; t1 = performance.now();
    loadNote(null, 'Starting the engine (once per session)');   // lane progress: embind's start-up, no count to give
    let failed;
    const failure = new Promise((res, rej) => { failed = rej; });
    oc = await withFastFunction(() => Promise.race([failure, new opencascade({ locateFile: (p) => OCCT_DIR + p, instantiateWasm: (imports, done) => {
      WebAssembly.instantiate(mod, imports).then((inst) => { phases.instantiateMs = performance.now() - t1; t1 = performance.now(); done(inst, mod); }).catch(failed);
      return {};
    } })]), phases);
    phases.initMs = performance.now() - t1;
  }
  const loadMs = performance.now() - t0;
  self.postMessage({ type: 'ready', loadMs, phases });
  return oc;
})();
ready.catch((e) => self.postMessage({ type: 'error', seq: -1, message: 'OpenCascade did not load: ' + ((e && e.message) || e) + (/integrity/.test(String(e && e.message)) ? '' : ' (run vendor/get-occt.ps1)') }));

self.onmessage = async (e) => {
  const m = e.data || {};
  if (m.type === 'engine') { engineFromPage(m.bytes || null); return; }
  let oc;
  try { oc = await ready; } catch (err) { if (m.type === 'import') self.postMessage({ type: 'importError', seq: m.seq, message: 'OpenCascade is not installed (run vendor/get-occt.ps1).' }); return; }
  // { type: 'import', seq, format: 'step' | 'iges', text } -> { type: 'imported', seq, result: OcctKernel.importFile(...) }
  if (m.type === 'import') {
    // (rfMG) { type: 'importProgress', seq, fraction (0..1 or null), text } while the file is read and meshed, only
    // when the post says progress: true: a consumer that takes the first message with its seq as the answer
    // (tests/occt-tests.html) gets 'imported' first, as before
    const say = m.progress ? (fraction, text) => { try { self.postMessage({ type: 'importProgress', seq: m.seq, fraction, text }); } catch (e) { } } : null;
    try { self.postMessage({ type: 'imported', seq: m.seq, result: OcctKernel.importFile(oc, m.format, m.text, say) }); }
    catch (err) { self.postMessage({ type: 'importError', seq: m.seq, message: (err && err.message) || String(err) }); }
    return;
  }
  if (m.type !== 'build') return;
  try {
    // r11/occtswap11: upto (Edit Feature's rollback, ui-occt.js): the part's first `upto` features only, from the
    // rebuild cache's snapshots, which it reads but leaves untouched (OcctKernel.build opts.readOnly)
    const rolled = m.upto != null;
    if (rolled && m.model && m.model.features) m.model.features = m.model.features.slice(0, m.upto);
    const r = OcctKernel.build(oc, self.Kernel, m.model, { chord: m.chord, exports: !!m.exports && !rolled, cache: m.noCache ? null : cacheFor(m.cacheKey), readOnly: rolled });
    // the main thread's work on the result is done here too (r3/engine3; the edges since smooth/responsive): the solids
    // as Anvil bodies (OcctKernel.toBodies, tagged with the features of m.anvil, the Anvil mesh on screen: positions and
    // triShared), packed for ui-occt.js to unpack (OcctKernel.fromPacked) instead of running toBuild; and on the mesh the
    // main thread will make from them (Kernel.meshFromBody), its edges, curved faces / true circles and smooth normals,
    // which applyBuild then uses instead of computing them
    const transfer = r.mesh ? [r.mesh.positions.buffer, r.mesh.faceOf.buffer] : [];
    if (r.mesh && r.valid && m.part == null) {
      try {
        const K = self.Kernel, A = m.anvil || null;
        const bodies = OcctKernel.toBodies(r, A && A.positions ? { positions: A.positions } : null, A ? A.triShared : null, self.CSG);
        const body = K.combineBodies(bodies);
        const mesh = body ? K.meshFromBody(body) : null;
        r.edges = mesh ? K.bodyEdges(mesh) : null;
        try { r.curves = mesh && K.meshCurveInfo ? K.meshCurveInfo(mesh) : null; } catch (e2) { r.curves = null; }
        try { r.normals = mesh && K.analyticNormals ? K.analyticNormals(mesh) : null; } catch (e3) { r.normals = null; }
        if (r.normals) transfer.push(r.normals.buffer);
        if (A) {
          r.packed = bodies.map((b) => b.pack());
          r.packed.forEach((p) => { for (const buf of self.CSG.packTransferables(p)) transfer.push(buf); });
          r.anvilKey = A.key;
        }
      } catch (e) { r.edges = null; r.curves = null; r.normals = null; r.packed = null; }
    }
    self.postMessage({ type: 'built', seq: m.seq, part: m.part, upto: rolled ? m.upto : undefined, result: r }, transfer);
  } catch (err) {
    if (m.upto != null) { /* read-only: the cache is as it was */ } else if (m.cacheKey) caches.delete(m.cacheKey); else cache = {};   // a build that threw may have left the snapshots half-updated
    self.postMessage({ type: 'error', seq: m.seq, part: m.part, upto: m.upto, message: (err && err.message) || String(err) });
  }
};
