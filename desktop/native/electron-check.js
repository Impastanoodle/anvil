// electron-check.js — loads the native engine inside Electron's Node (the app's runtime) and builds a part with it, to
// show the same occt_native.node works there (Node-API is ABI-stable: one build for Node and every Electron).
//   set ELECTRON_RUN_AS_NODE=1 && desktop\node_modules\electron\dist\electron.exe desktop\native\electron-check.js [addonDir]
'use strict';
const path = require('path');
(async () => {
  const dir = process.argv[2] || path.join(require('os').homedir(), 'Desktop', 'Output', 'Anvil Native', 'addon');
  const { load } = require(path.join(__dirname, '..', '..', 'anvil', 'headless', 'load.js'));
  const { Kernel, OcctKernel } = load({ occt: true });
  const t0 = performance.now();
  const oc = require(path.join(dir, 'index.js')).load();
  const loadMs = performance.now() - t0;
  const m = Kernel.newModel('E');
  Kernel.runScript(m, 'p.box(40, 30, 20);\np.hole("Top", 20, -15, 10, { offset: 20 });\np.fillet(2, [[0, 15, 0]]);');
  const r = OcctKernel.build(oc, Kernel, m, {});
  console.log(JSON.stringify({ electron: process.versions.electron || null, node: process.versions.node, napi: process.versions.napi, occt: oc.occtVersion, loadMs: Math.round(loadMs), ok: r.ok, valid: r.valid, volume: r.volume, faces: r.faces.length }));
})().catch((e) => { console.error(e && e.stack || e); process.exitCode = 1; });
