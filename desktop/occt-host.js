// occt-host.js — OpenCascade built for Windows (desktop/native: OpenCascade 7.6.3 behind a Node-API addon with the same
// `oc` API as opencascade.js) in a process of its own. main.js starts it with Electron's utilityProcess, one process
// per engine start; stopping the engine (Cancel, another model, a reload) kills the process, so even a long Boolean
// stops at once, and the next start is a fresh process. The addon's type tables are per process, so one engine per
// process is also what the addon needs.
//
// It runs anvil/occt-worker.js itself, unchanged, so the messages and the result shapes are the page worker's by
// construction: the Anvil engine files are read from the anvil folder (a stand-in fetch), and occt-worker.js's
// anvilNativeEngine hook hands it the addon's `oc` (with OpenCascade's own threads on) instead of the WebAssembly one.
//   args: --root <anvil folder> --addon <folder with index.js, occt_native.node and the OpenCascade DLLs>
//   main.js sends one message carrying a MessagePort; the page's messages arrive on that port and the replies go back
//   on it (ready, built, error, imported, importError; a plain copy each, there are no transfer lists across processes).
//   If the engine cannot load (addon or DLL missing, ...) the reply is { type: 'hostFailed', message } and the page
//   uses the WebAssembly worker instead. To main.js (parentPort): { type: 'ready', loadMs } / { type: 'hostFailed', message }.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { pathToFileURL, fileURLToPath } = require('url');

function arg(name) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : null; }
const ROOT = path.resolve(arg('root') || path.join(__dirname, '..', 'anvil'));
const ADDON = path.resolve(arg('addon') || '.');
const WORKER = path.join(ROOT, 'occt-worker.js');
const BASE = pathToFileURL(WORKER).href;
const parent = process.parentPort;

// the addon keeps its STEP / IGES scratch files in a temporary folder that it removes on exit; a killed process (Cancel)
// never gets there, so each process works in %TEMP%\anvil-occt-host\<pid> and removes the folders of ended ones
(function scratch() {
  try {
    const top = path.join(require('os').tmpdir(), 'anvil-occt-host');
    fs.mkdirSync(top, { recursive: true });
    fs.readdirSync(top).forEach((d) => {
      const pid = +d;
      let alive = false;
      try { process.kill(pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
      if (pid > 0 && !alive) fs.rmSync(path.join(top, d), { recursive: true, force: true });
    });
    const mine = path.join(top, String(process.pid));
    fs.mkdirSync(mine, { recursive: true });
    process.env.TEMP = process.env.TMP = mine;
  } catch (e) { /* the system temporary folder, as before */ }
})();

// ---- the page's port (queued until main.js hands it over)
let port = null;
const outbox = [];
function toPage(m) { if (port) port.postMessage(m); else outbox.push(m); }
function toMain(m) { try { parent.postMessage(m); } catch (e) { /* main gone */ } }
let failed = false;
function hostFailed(message) {
  if (failed) return;
  failed = true;
  const m = { type: 'hostFailed', message: String(message || 'the engine did not load').replace(/ \(run vendor\/get-occt\.ps1\)$/, '') };
  toPage(m); toMain(m);
}

// ---- what occt-worker.js expects of a worker scope
globalThis.self = globalThis;
self.location = { href: BASE };
// files of the anvil folder only (the engine scripts); the worker's fetches are relative to occt-worker.js
self.fetch = async function (u) {
  let bytes = null;
  try {
    const f = fileURLToPath(new URL(String(u), BASE));
    if (f === ROOT || f.startsWith(ROOT + path.sep)) bytes = await fs.promises.readFile(f);
  } catch (e) { bytes = null; }
  return { ok: !!bytes, status: bytes ? 200 : 404,
    text: async () => (bytes ? bytes.toString('utf8') : ''),
    arrayBuffer: async () => (bytes ? bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) : new ArrayBuffer(0)) };
};
self.postMessage = function (m) {   // the transfer list is not needed: the port copies
  if (m && m.type === 'error' && m.seq === -1) { hostFailed(m.message); return; }
  if (m && m.type === 'ready') toMain({ type: 'ready', loadMs: m.loadMs });
  toPage(m);
};
self.anvilNativeEngine = function () {
  const oc = require(path.join(ADDON, 'index.js')).load();
  if (typeof oc.setParallel === 'function') oc.setParallel(true);   // OpenCascade's own threads for Booleans and meshing
  return oc;
};
process.on('uncaughtException', (e) => { hostFailed('the engine process failed: ' + ((e && e.message) || e)); setTimeout(() => process.exit(1), 50); });

parent.on('message', (e) => {
  if (port || !e.ports || !e.ports.length) return;
  port = e.ports[0];
  port.on('message', (ev) => { if (typeof self.onmessage === 'function') self.onmessage({ data: ev.data }); });
  port.start();
  outbox.splice(0).forEach((m) => port.postMessage(m));
});

// occt-worker.js, in a function scope of its own (its top-level names stay out of the global scope the engine scripts
// are evaluated into); it starts loading at once and answers on self.postMessage
try {
  const src = fs.readFileSync(WORKER, 'utf8');
  vm.runInThisContext('(function () {' + src + '\n})();', { filename: WORKER });
} catch (e) {
  hostFailed('occt-worker.js did not run: ' + ((e && e.message) || e));
}
