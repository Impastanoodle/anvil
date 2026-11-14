// stage.js — copies the files the app runs from ../anvil into stage/anvil, which electron-builder bundles as
// resources\anvil. Only what Anvil loads: index.html, the top-level scripts and stylesheets (the page, its workers),
// vendor/three.min.js, examples/examples.js, the OpenCascade engine (vendor/occt, required: checked against the
// pinned fingerprints of vendor/get-occt.ps1) and LibreDWG (vendor/libredwg, when it is there, with its licence).
// Tests, docs, experiments, the Node runner and the local-server scripts are left out.
// The engine is looked for in ../anvil/vendor/occt, else in %ANVIL_OCCT_DIR%.
// Also OpenCascade for Windows (the native addon, required) into stage/occt-native; see the end of this file.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const SRC = path.resolve(__dirname, '..', 'anvil');
const OUT = path.join(__dirname, 'stage', 'anvil');
// the official opencascade.js 2.0.0-beta.b5ff984 build (the same fingerprints as occt-worker.js)
const JS_SHA256 = '8016d504d881f5f3b9f9431524dc8dadd03088588b828e2d18e096bc5fedd5ba';
const WASM_SHA256 = '4b6a74398987eb3ca6bedc7d1b29d6a5af74d0613a9f3bf013a52d7d5d1b5937';

function fail(msg) { console.error('\nstage.js: ' + msg + '\n'); process.exit(1); }
function sha(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function copy(rel, from) {
  const src = from || path.join(SRC, rel), dst = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  return fs.statSync(dst).size;
}

if (!fs.existsSync(path.join(SRC, 'index.html'))) fail('anvil/index.html not found next to desktop/ (' + SRC + ')');
fs.rmSync(OUT, { recursive: true, force: true });
let bytes = 0, files = 0;
const add = (rel, from) => { bytes += copy(rel, from); files++; };

// the page and its scripts / stylesheets / workers
const LEAVE_OUT = /\.(ps1|md)$/i;
fs.readdirSync(SRC).forEach((f) => {
  const full = path.join(SRC, f);
  if (!fs.statSync(full).isFile() || LEAVE_OUT.test(f)) return;
  if (/\.(html|js|css)$/i.test(f)) add(f);
});
add('vendor/three.min.js');
add('examples/examples.js');

// every script index.html loads must be here
const html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const missing = [];
html.replace(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g, (m, ref) => { if (!/^[a-z]+:/i.test(ref) && !fs.existsSync(path.join(OUT, ref))) missing.push(ref); return m; });
if (missing.length) fail('index.html loads files that were not staged: ' + missing.join(', '));

// the OpenCascade engine: required
const occtDirs = [path.join(SRC, 'vendor', 'occt'), process.env.ANVIL_OCCT_DIR].filter(Boolean);
const occt = occtDirs.find((d) => fs.existsSync(path.join(d, 'opencascade.full.wasm')) && fs.existsSync(path.join(d, 'opencascade.full.js')));
if (!occt) {
  fail('The OpenCascade engine is missing, so the installer was NOT built.\n' +
    '  Expected opencascade.full.js and opencascade.full.wasm in ' + occtDirs.join(' or ') + '.\n' +
    '  Fetch it once with:  powershell -ExecutionPolicy Bypass -File anvil\\vendor\\get-occt.ps1\n' +
    '  (or set ANVIL_OCCT_DIR to a folder that has both files).');
}
if (sha(path.join(occt, 'opencascade.full.js')) !== JS_SHA256 || sha(path.join(occt, 'opencascade.full.wasm')) !== WASM_SHA256) {
  fail('The OpenCascade engine in ' + occt + ' is not the official opencascade.js 2.0.0-beta.b5ff984 build (fingerprint mismatch); fetch it again with anvil\\vendor\\get-occt.ps1.');
}
add('vendor/occt/opencascade.full.js', path.join(occt, 'opencascade.full.js'));
add('vendor/occt/opencascade.full.wasm', path.join(occt, 'opencascade.full.wasm'));
const lic = path.join(occt, 'LICENSE-opencascade.js.txt');
if (fs.existsSync(lic)) add('vendor/occt/LICENSE-opencascade.js.txt', lic);

// LibreDWG (DWG save / open without the ODA File Converter): optional
const dwg = path.join(SRC, 'vendor', 'libredwg');
let withDwg = false;
if (fs.existsSync(path.join(dwg, 'dxf2dwg.exe'))) {
  fs.readdirSync(dwg).forEach((f) => { if (/\.(exe|dll)$/i.test(f) || /^(COPYING|README)/i.test(f)) add('vendor/libredwg/' + f); });
  withDwg = true;
}
console.log('stage.js: ' + files + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB in stage/anvil (OpenCascade from ' + occt + (withDwg ? ', LibreDWG included' : ', no LibreDWG') + ')');

// OpenCascade for Windows (desktop/native: index.js, occt_native.node, the OpenCascade DLLs and their licences):
// required; electron-builder ships stage/occt-native as resources\occt-native, outside the asar (the app falls back to
// the WebAssembly engine above if it cannot load). From ANVIL_OCCT_NATIVE, else Desktop\Output\Anvil Native\addon.
const NATIVE = path.resolve(process.env.ANVIL_OCCT_NATIVE || path.join(require('./output-dir.js')(), 'Anvil Native', 'addon'));
const NOUT = path.join(__dirname, 'stage', 'occt-native');
const need = ['index.js', 'occt_native.node', 'TKernel.dll', 'TKBO.dll', 'TKSTEP.dll', 'TKIGES.dll', 'TKMesh.dll'];
const lacking = need.filter((f) => !fs.existsSync(path.join(NATIVE, f)));
if (lacking.length) {
  fail('The native OpenCascade engine is missing, so the installer was NOT built.\n' +
    '  Expected ' + lacking.join(', ') + ' in ' + NATIVE + '.\n' +
    '  Build it with desktop\\native (README.md there: npm run occt, gen, build, collect), or set ANVIL_OCCT_NATIVE to the addon folder.');
}
fs.rmSync(NOUT, { recursive: true, force: true });
fs.mkdirSync(NOUT, { recursive: true });
let nfiles = 0, nbytes = 0, dlls = 0;
fs.readdirSync(NATIVE).forEach((f) => {
  const src = path.join(NATIVE, f);
  if (!fs.statSync(src).isFile() || !/\.(js|node|dll|txt)$/i.test(f)) return;
  fs.copyFileSync(src, path.join(NOUT, f));
  nfiles++; nbytes += fs.statSync(src).size; if (/\.dll$/i.test(f)) dlls++;
});
console.log('stage.js: ' + nfiles + ' files (' + dlls + ' DLLs), ' + (nbytes / 1048576).toFixed(1) + ' MB in stage/occt-native (from ' + NATIVE + ')');
