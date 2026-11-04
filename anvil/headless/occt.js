// headless/occt.js — loads the OpenCascade engine (opencascade.js, vendor/occt, fetched by vendor/get-occt.ps1) in
// Node.js. Both files are checked against the pinned SHA-256 of the official opencascade.js 2.0.0-beta.b5ff984 build
// before anything runs, exactly as occt-worker.js does on the page. The loader is an ES module (`export default
// Module`) whose emscripten factory, in Node, reads `__dirname` and `require`, which an `import()` does not provide;
// so the file is run as a CommonJS-style function with those names bound and its `export default` turned into a
// `return`. loadOpenCascade() -> Promise<{ oc, loadMs }>; a missing engine throws an error with `.code = 2`.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const OCCT_DIR = path.resolve(__dirname, '..', 'vendor', 'occt');
// pinned in anvil/vendor/get-occt.ps1 (and checked by occt-worker.js): the loader and the WebAssembly binary
const JS_SHA256 = '8016d504d881f5f3b9f9431524dc8dadd03088588b828e2d18e096bc5fedd5ba';
const WASM_SHA256 = '4b6a74398987eb3ca6bedc7d1b29d6a5af74d0613a9f3bf013a52d7d5d1b5937';
const FETCH_HINT = 'run  powershell -ExecutionPolicy Bypass -File anvil\\vendor\\get-occt.ps1  to fetch it (50 MB, not in git)';

// the native engine (desktop/native: OpenCascade 7.6.3 built for Windows behind a Node-API addon with the same `oc`
// API): a folder holding index.js, occt_native.node and the OpenCascade DLLs (desktop/native/collect.js puts them in
// Output\Anvil Native\addon); --native with no folder takes ANVIL_OCCT_NATIVE, else that folder
const NATIVE_DEFAULT = process.env.ANVIL_OCCT_NATIVE || path.join(require('os').homedir(), 'Desktop', 'Output', 'Anvil Native', 'addon');

let loading = null, loadingNative = null;

function fail(message) { const e = new Error(message); e.code = 2; return e; }

// ANVIL_OCCT_RECORD=<file.json>: record every OpenCascade call (desktop/native/record-surface.js) into that file
function maybeRecord(oc) {
  if (process.env.ANVIL_OCCT_RECORD) require(path.resolve(__dirname, '..', '..', 'desktop', 'native', 'record-surface.js')).instrument(oc, path.resolve(process.env.ANVIL_OCCT_RECORD));
  return oc;
}

// loadNative(dir) -> Promise<{ oc, loadMs, native: dir }>: the addon's `oc` (the same API as opencascade.js)
function loadNative(dir) {
  if (loadingNative) return loadingNative;
  loadingNative = (async () => {
    const d = path.resolve(dir === true || !dir ? NATIVE_DEFAULT : dir);
    if (!fs.existsSync(path.join(d, 'index.js'))) throw fail('native OpenCascade engine missing: ' + d + ' (build it: desktop/native/README.md)');
    const t0 = performance.now();
    const oc = require(path.join(d, 'index.js')).load();
    return { oc, loadMs: performance.now() - t0, native: d };
  })();
  loadingNative.catch(() => { loadingNative = null; });
  return loadingNative;
}

function readVerified(file, want, what) {
  if (!fs.existsSync(file)) throw fail('OpenCascade engine missing: ' + file + '; ' + FETCH_HINT);
  const bytes = fs.readFileSync(file);
  const got = crypto.createHash('sha256').update(bytes).digest('hex');
  if (got !== want) throw fail(what + ' failed its integrity check (sha256 ' + got.slice(0, 12) + '…, expected ' + want.slice(0, 12) + '…); refused. ' + FETCH_HINT);
  return bytes;
}

function installed() {
  return fs.existsSync(path.join(OCCT_DIR, 'opencascade.full.js')) && fs.existsSync(path.join(OCCT_DIR, 'opencascade.full.wasm'));
}

// loadOpenCascade(opts) -> Promise<{ oc, loadMs }>; opts.native (true or a folder): the native addon instead
async function loadOpenCascade(opts) {
  if (opts && opts.native) return loadNative(opts.native);
  if (loading) return loading;
  loading = (async () => {
    const t0 = performance.now();
    const jsFile = path.join(OCCT_DIR, 'opencascade.full.js'), wasmFile = path.join(OCCT_DIR, 'opencascade.full.wasm');
    let src = readVerified(jsFile, JS_SHA256, 'opencascade.full.js').toString('utf8');
    const wasmBinary = readVerified(wasmFile, WASM_SHA256, 'opencascade.full.wasm');
    if (!/export\s+default\s+Module\s*;?\s*$/.test(src)) throw fail('opencascade.full.js does not end with "export default Module"');
    src = src.replace(/export\s+default\s+Module\s*;?\s*$/, 'return Module;');
    const wrapper = vm.runInThisContext('(function (require, __filename, __dirname) {' + src + '\n})', { filename: jsFile });
    const factory = wrapper(require, jsFile, OCCT_DIR + path.sep);
    // the engine's own console output (the STEP writer's transfer statistics) goes to stderr, never into the
    // JSON on stdout; silent unless ANVIL_OCCT_LOG is set
    const log = process.env.ANVIL_OCCT_LOG ? (s) => process.stderr.write(String(s) + '\n') : () => { };
    const oc = await new factory({ wasmBinary, locateFile: (p) => path.join(OCCT_DIR, p), print: log, printErr: log });
    return { oc: maybeRecord(oc), loadMs: performance.now() - t0 };
  })();
  loading.catch(() => { loading = null; });
  return loading;
}

module.exports = { loadOpenCascade, installed, OCCT_DIR, JS_SHA256, WASM_SHA256, NATIVE_DEFAULT };
