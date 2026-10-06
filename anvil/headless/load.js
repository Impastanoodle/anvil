// headless/load.js — loads Anvil's DOM-free engine into a Node.js process the way occt-worker.js loads it into its
// worker: every script is run in the global scope with vm.runInThisContext (so its top-level `var`s become globals and
// stack traces name the file), with `self` pointing at globalThis. The file list is not hard-coded: it is read from the
// <script src="../x.js"> tags of tests/kernel-tests.html, which is by definition the engine set that runs without a
// DOM, so a split of kernel.js or drawing.js into several files is picked up as soon as that page lists them.
// load({ occt }) returns the globals (Kernel, CSG, Drawing, Assembly, Materials, Exchange, AnvilExamples, SketchSolver,
// Evaluate, HoleWizard, BoxSelect, and OcctKernel when occt is set); the engine is loaded once per process.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ANVIL_DIR = path.resolve(__dirname, '..');                       // anvil/ (the scripts' folder)
const TESTS_PAGE = path.join(ANVIL_DIR, 'tests', 'kernel-tests.html');
const GLOBALS = ['Kernel', 'CSG', 'Drawing', 'Assembly', 'Materials', 'Exchange', 'AnvilExamples', 'SketchSolver',
  'Evaluate', 'HoleWizard', 'BoxSelect', 'OcctKernel'];

let loaded = null;

// the <script src="…"> files of a page, in order, resolved against the page's folder
function scriptList(pagePath) {
  const html = fs.readFileSync(pagePath, 'utf8'), dir = path.dirname(pagePath), out = [];
  const re = /<script\s[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) out.push(path.resolve(dir, m[1]));
  return out;
}

// run a classic script in the global scope (an indirect eval with a file name)
function runScript(file) {
  const src = fs.readFileSync(file, 'utf8');
  vm.runInThisContext(src, { filename: file });
}

function installShims() {
  const g = globalThis;
  if (typeof g.self === 'undefined') g.self = g;
  if (typeof g.performance === 'undefined') g.performance = require('perf_hooks').performance;
  if (typeof g.TextEncoder === 'undefined') g.TextEncoder = require('util').TextEncoder;
  if (typeof g.TextDecoder === 'undefined') g.TextDecoder = require('util').TextDecoder;
}

function collect() {
  const out = {};
  GLOBALS.forEach((k) => { if (typeof globalThis[k] !== 'undefined') out[k] = globalThis[k]; });
  return out;
}

// load({ occt: false, verbose: false }) -> the engine globals. With occt, occt-kernel.js is loaded too (OcctKernel);
// the OpenCascade module itself comes from headless/occt.js. The list of files that were run is in `.files`.
function load(opts) {
  opts = opts || {};
  installShims();
  if (!loaded) {
    const files = scriptList(TESTS_PAGE);
    if (!files.length) throw new Error('no <script src> tags found in ' + TESTS_PAGE);
    files.forEach((f) => {
      if (opts.verbose) process.stderr.write('load ' + path.relative(ANVIL_DIR, f) + '\n');
      runScript(f);
    });
    loaded = { files: files.slice() };
  }
  if (opts.occt && typeof globalThis.OcctKernel === 'undefined') {
    const f = path.join(ANVIL_DIR, 'occt-kernel.js');
    runScript(f);
    loaded.files.push(f);
  }
  const out = collect();
  out.files = loaded.files.slice();
  out.dir = ANVIL_DIR;
  return out;
}

module.exports = { load, scriptList, runScript, installShims, ANVIL_DIR, TESTS_PAGE };
