// node head-tools/make-index.js [--check]
// Writes anvil/docs/INDEX.md: every anvil/*.js file (not vendor/, tests/, examples/) with its symbols and line numbers,
// so an agent greps the index (`grep -n setTool anvil/docs/INDEX.md`) instead of searching 75K lines of code.
// Symbols: namespace assignments (UI.x =, Kernel.x / K.x =, Kernel._.x, SketchSolver.x / S.x =, Drawing.x / D.x =,
// DW.x = (UI.drawingInternal), Materials.x, Nest.x, window.x, any `var Name = (function` module), the names in
// export lines (`UI.a = a; UI.b = b;`) and `return { a: a }` objects, and first-level `function name(` declarations
// of the file's IIFE (indent 0 or 2; nested helpers are skipped). An exported function is listed once, under its
// exported name, at its declaration line. Uncommented private helpers are packed onto "more:" lines.
// --check: exit 1 when INDEX.md differs from what this script would write (run it after changing code).
'use strict';
var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'anvil');
var OUT = path.join(SRC, 'docs', 'INDEX.md');
var CMT = 90;      // comment width
var WRAP = 112;    // "more:" line width

var GLOBALS = { UI: 'UI', Kernel: 'Kernel', SketchSolver: 'SketchSolver', Drawing: 'Drawing', Materials: 'Materials', Nest: 'Nest', window: 'window' };
// what a local alias can point at -> the name shown in the index
var TARGETS = {
  'UI': 'UI', 'window.UI': 'UI', 'Kernel': 'Kernel', 'UI.K': 'Kernel', 'Kernel._': 'Kernel._', 'window.Kernel': 'Kernel',
  'SketchSolver': 'SketchSolver', 'window.SketchSolver': 'SketchSolver', 'Drawing': 'Drawing', 'Drawing._': 'Drawing._',
  'UI.drawingInternal': 'DW', 'DW': 'DW', 'Materials': 'Materials', 'Nest': 'Nest', 'window.Nest': 'Nest'
};

function listFiles() {
  return fs.readdirSync(SRC).filter(function (f) { return /\.js$/.test(f) && fs.statSync(path.join(SRC, f)).isFile(); }).sort();
}

function indentOf(s) { var m = /^[ \t]*/.exec(s); return m[0].replace(/\t/g, '  ').length; }

function clip(s, n) {
  s = s.replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + ' …' : s;
}

// index of a `//` comment outside strings on a code line, or -1
function trailingComment(l) {
  var q = null;
  for (var k = 0; k < l.length; k++) {
    var ch = l[k];
    if (q) { if (ch === '\\') k++; else if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'" || ch === '`') q = ch;
    else if (ch === '/' && l[k + 1] === '/' && /\s/.test(l[k - 1] || '')) return /\S/.test(l.slice(0, k)) ? k : -1;
  }
  return -1;
}

// The comment block directly above line i (contiguous // lines, divider lines dropped), else the trailing // comment.
function commentFor(lines, i) {
  var parts = [], j = i - 1;
  while (j >= 0 && /^\s*\/\//.test(lines[j])) {
    var t = lines[j].replace(/^\s*\/\/+\s?/, '');
    if (/-{10,}|={10,}/.test(t)) break;        // a section divider ends the block
    t = t.replace(/^[-=]{2,}\s*/, '').replace(/\s*[-=]{2,}$/, '').trim();
    if (t) parts.unshift(t);
    j--;
  }
  var c = parts.join(' ').trim();
  if (!c) { var at = trailingComment(lines[i]); if (at > 0) c = lines[i].slice(at).replace(/^\/\/+\s*/, ''); }
  return c ? clip(c, CMT) : '';
}

function scan(file) {
  var src = fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\r\n?/g, '\n');
  var lines = src.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  var alias = {}, k, m, i;
  for (k in GLOBALS) alias[k] = GLOBALS[k];

  // `var Name = (function` modules at column 0
  var modules = {};
  lines.forEach(function (l) { var mm = /^var ([A-Za-z_$][\w$]*) = \(function\b/.exec(l); if (mm) { alias[mm[1]] = mm[1]; modules[mm[1]] = true; } });
  // IIFE parameters: `(function (K, _) {` ... `})(Kernel, Kernel._);` (paired in order)
  var opens = [], closes = [];
  lines.forEach(function (l, n) {
    var a = /^\(function \(([^)]*)\)\s*\{/.exec(l); if (a && a[1].trim()) opens.push({ n: n, params: a[1].split(',').map(function (s) { return s.trim(); }) });
    var b = /^\}\)\((.*)\);?\s*$/.exec(l); if (b) closes.push({ n: n, args: b[1] });
  });
  opens.forEach(function (o) {
    var c = closes.filter(function (x) { return x.n > o.n; })[0]; if (!c) return;
    var args = c.args.replace(/typeof (\w+) !== 'undefined' \? \1 : null/g, '$1').split(',').map(function (s) { return s.trim(); });
    o.params.forEach(function (p, q) { if (TARGETS[args[q]]) alias[p] = TARGETS[args[q]]; });
  });
  // first-level aliases: `var App = UI.App, K = UI.K, S = window.SketchSolver;`
  lines.forEach(function (l) {
    if (indentOf(l) > 2 || !/^\s*var /.test(l)) return;
    var re = /(?:var |,\s*)([A-Za-z_$][\w$]*) = ([A-Za-z_$][\w$.]*)(?=\s*(?:[,;|]|=(?!=)|$))/g, mm;   // `var DW = UI.drawingInternal = {}` too
    while ((mm = re.exec(l))) if (TARGETS[mm[2]] && !(mm[1] in GLOBALS)) alias[mm[1]] = TARGETS[mm[2]];
  });

  var funcs = {}, vars = {}, entries = [], byName = {};
  for (i = 0; i < lines.length; i++) {
    var l = lines[i], ind = indentOf(l);
    if (ind > 2) continue;
    m = /^\s*function ([A-Za-z_$][\w$]*)\s*\(/.exec(l);
    if (m && !funcs[m[1]]) funcs[m[1]] = i;
    m = /^\s*var ([A-Za-z_$][\w$]*)\s*=/.exec(l);
    if (m && !vars[m[1]]) vars[m[1]] = i;
  }
  var exported = {}, varsOut = {};  // function / var name -> [{ name: exported name, at }]

  function add(name, line, comment, isFn) {
    if (byName[name]) { if (byName[name].also.indexOf(line) < 0 && byName[name].line !== line) byName[name].also.push(line); return; }
    var e = { name: name, line: line, comment: comment, also: [], exported: !isFn };
    byName[name] = e; entries.push(e);
  }
  function exportName(full, rhs, n) {
    var id = /^([A-Za-z_$][\w$]*)\s*[;,]?\s*$/.exec(rhs);
    if (id && funcs[id[1]] !== undefined) { (exported[id[1]] = exported[id[1]] || []).push({ name: full, at: n }); return; }
    if (id && vars[id[1]] !== undefined) { (varsOut[id[1]] = varsOut[id[1]] || []).push({ name: full, at: n }); return; }
    add(full, n, commentFor(lines, n));
  }

  var nsRe = /(^|[;{}\s(])([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)(?:\.([A-Za-z_$][\w$]*))?\s*=(?![=>])\s*([^;]*)/g;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i], d = indentOf(line), mm;
    if (/^\s*\/\//.test(line)) continue;
    nsRe.lastIndex = 0;
    while ((mm = nsRe.exec(line))) {
      var ns = alias[mm[2]]; if (!ns) continue;
      var rhs = mm[5].trim(), isFnRhs = /^function\b/.test(rhs);
      if (mm[4]) { if (d > 2 || !isFnRhs) continue; }       // UI.sketchToolPMs.line = function — registries only
      else if (d > 2 && !isFnRhs) continue;                  // deeper: runtime state unless it defines a function
      var full = ns + '.' + mm[3] + (mm[4] ? '.' + mm[4] : '');
      if (rhs.indexOf(mm[2] + '.' + mm[3] + ' ||') === 0 || rhs.indexOf(ns + '.' + mm[3] + ' ||') === 0) continue; // X = X || {}
      if (ns === 'window' && modules[mm[3]]) continue;
      // the rest of an export line is picked up by the loop (each `NS.a = a;` matches separately)
      exportName(full, rhs.split(/\s*;/)[0], i);
    }
  }
  // `return { a: a, b: function … }` of a `var Name = (function` module (at indent 2)
  Object.keys(modules).forEach(function (mod) {
    for (var n = lines.length - 1; n >= 0; n--) {
      if (!/^  return \{/.test(lines[n])) continue;
      var end = n;
      if (!/\}\s*;?\s*(\/\/.*)?$/.test(lines[n])) { end = n + 1; while (end < lines.length && !/^  \}\s*;?\s*$/.test(lines[end])) end++; }
      var kv = /(?:[{,]|^)\s*([A-Za-z_$][\w$]*)\s*:\s*([A-Za-z_$][\w$]*|function\b)/g, z;
      for (var off = n; off <= end && off < lines.length; off++) {
        var bl = lines[off].replace(/\/\/.*$/, '').replace(/^\s*return\s*/, '');
        kv.lastIndex = 0;
        while ((z = kv.exec(bl))) {
          if (z[2] === 'function') add(mod + '.' + z[1], off, commentFor(lines, off));
          else exportName(mod + '.' + z[1], z[2], off);
        }
      }
      break;
    }
  });
  // functions: exported ones under their exported name(s), the rest as private names
  function label(local, list) {
    var names = list.map(function (x) { return x.name; }).filter(function (v, q, a) { return a.indexOf(v) === q; });
    return names.join(', ') + (names.every(function (nm) { return nm.split('.').pop() === local; }) ? '' : ' (' + local + ')');
  }
  Object.keys(funcs).forEach(function (fn) {
    var at = funcs[fn], c = commentFor(lines, at);
    if (exported[fn]) { var lb = label(fn, exported[fn]); add(lb, at, c, false); byName[lb].exported = true; }
    else add(fn, at, c, true);
  });
  // exported first-level vars (tables, constants, objects): at their `var` line
  Object.keys(varsOut).forEach(function (v) { add(label(v, varsOut[v]), vars[v], commentFor(lines, vars[v])); });
  entries.sort(function (a, b) { return a.line - b.line; });
  var header = '';
  for (i = 0; i < Math.min(lines.length, 6); i++) {
    var hm = /^\/\/\s?(.*)$/.exec(lines[i]); if (hm) { header = hm[1]; break; }
  }
  return { file: file, lines: lines.length, header: header, entries: entries };
}

function render(scans) {
  var out = [], total = 0;
  out.push('# Anvil code index');
  out.push('');
  out.push('Generated by `node head-tools/make-index.js` from `anvil/*.js` (not vendor/, tests/, examples/). Do not edit by hand: rerun it after changing code; `--check` exits 1 when this file is stale.');
  out.push('Use: `grep -n <name> anvil/docs/INDEX.md`, then read that line range of the file. Each line: `name  L<line>  — <comment above it>`.');
  out.push('Namespaced names are exported (UI.x, Kernel.x, Kernel._.x = shared kernel privates, SketchSolver.x, Drawing.x, Drawing._.x, DW.x = UI.drawingInternal.x, Assembly.x …); `(fn)` is the local function name when it differs; `also` = the name is assigned again there (often a wrapper). Bare names are file-private first-level functions; `more:` lines pack the uncommented ones.');
  out.push('Area maps (how things are done, data shapes, traps): `anvil/docs/areas/*.md`.');
  scans.forEach(function (s) {
    out.push('');
    out.push('## ' + s.file + ' (' + s.lines + ' lines)');
    if (s.header) out.push('> ' + clip(s.header.replace(/^[\w.-]+\.js\s*[—-]\s*/, ''), 150));
    var more = [];
    s.entries.forEach(function (e) {
      if (!e.exported && !e.comment) { more.push(e.name + ' L' + (e.line + 1)); return; }
      var also = e.also.length ? ' (also L' + e.also.slice(0, 4).map(function (x) { return x + 1; }).join(', L') + (e.also.length > 4 ? ' …' : '') + ')' : '';
      out.push(e.name + '  L' + (e.line + 1) + also + (e.comment ? '  — ' + e.comment : ''));
      total++;
    });
    if (more.length) {
      var row = 'more:';
      more.forEach(function (x) {
        if ((row + ' ' + x).length > WRAP) { out.push(row); row = 'more:'; }
        row += ' ' + x + ',';
      });
      out.push(row.replace(/,$/, ''));
      total += more.length;
    }
  });
  out.push('');
  return { text: out.join('\n'), symbols: total, lines: out.length };
}

// every `var Name = (function` module of any file is a global another file may alias (`AS = Assembly`) or extend
listFiles().forEach(function (f) {
  var re = /^var ([A-Za-z_$][\w$]*) = \(function\b/gm, m, src = fs.readFileSync(path.join(SRC, f), 'utf8');
  while ((m = re.exec(src))) { GLOBALS[m[1]] = m[1]; TARGETS[m[1]] = m[1]; }
});
var scans = listFiles().map(scan);
var r = render(scans);
var check = process.argv.indexOf('--check') >= 0;
if (check) {
  var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8').replace(/\r\n?/g, '\n') : '';
  if (cur !== r.text) { console.error('anvil/docs/INDEX.md is stale: run node head-tools/make-index.js'); process.exit(1); }
  console.log('anvil/docs/INDEX.md is up to date (' + r.lines + ' lines, ' + r.symbols + ' symbols)');
} else {
  if (!fs.existsSync(path.dirname(OUT))) fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, r.text);
  console.log('wrote anvil/docs/INDEX.md: ' + r.lines + ' lines, ' + r.symbols + ' symbols in ' + scans.length + ' files');
}
