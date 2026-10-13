// split-tests.js — checks the test group files of tests/ui-smoke.html (tests/smoke/*.js) and tests/kernel-tests.html
// (tests/kernel/*.js) against each page's GROUPS list, and holds the one-off tool that made the split (2026-10-13).
//   node anvil/tests/split-tests.js --check     (the default) every listed file exists and parses as a script, every
//                                               .js file in the folder is listed, the page's helpers and runner use no
//                                               name that only a group file declares; exit 1 on a problem
//   node anvil/tests/split-tests.js --split [--dry]   the split itself: only on a page that still holds its groups inline
// Each page reads its group files in GROUPS order, joins them and runs them with one direct eval inside the page script,
// so the files share one scope exactly as when they were written inline: a group may call a top-level helper that an
// earlier (or later) group file declares. Two files declaring the same top-level name is legal JS (the later one wins
// everywhere) but is listed as a note.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const TESTS = __dirname;

// ------------------------------------------------------------------ a small JS scanner (enough for depth and names)
const KEYWORD_BEFORE_REGEX = { return: 1, typeof: 1, case: 1, do: 1, else: 1, in: 1, of: 1, new: 1, delete: 1, void: 1, throw: 1, instanceof: 1, yield: 1, await: 1 };
function scan(src) {
  const toks = [];
  let i = 0, line = 1, depth = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); line += src.slice(i, e + 2).split('\n').length - 1; i = e + 2; continue; }
    if (c === '"' || c === '\'') {
      let j = i + 1; while (j < n && src[j] !== c) { if (src[j] === '\\') j++; j++; }
      toks.push({ t: 'str', v: c, line, depth }); i = j + 1; continue;
    }
    if (c === '`') {
      let j = i + 1, nest = 0;
      while (j < n) {
        if (src[j] === '\\') { j += 2; continue; }
        if (nest === 0 && src[j] === '`') break;
        if (src[j] === '$' && src[j + 1] === '{') { nest++; j += 2; continue; }
        if (nest > 0 && src[j] === '}') nest--;
        if (src[j] === '\n') line++;
        j++;
      }
      toks.push({ t: 'str', v: '`', line, depth }); i = j + 1; continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1; while (j < n && /[\w$]/.test(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j), line, depth }); i = j; continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++;
      toks.push({ t: 'num', v: src.slice(i, j), line, depth }); i = j; continue;
    }
    if (c === '/') {
      const p = toks.length ? toks[toks.length - 1] : null;
      if (!p || (p.t === 'punct' && !/^[)\]}]$/.test(p.v)) || (p.t === 'id' && KEYWORD_BEFORE_REGEX[p.v])) {
        let j = i + 1, cls = false;
        while (j < n) {
          if (src[j] === '\\') { j += 2; continue; }
          if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false;
          else if (src[j] === '/' && !cls) break;
          j++;
        }
        j++; while (j < n && /[a-z]/.test(src[j])) j++;
        toks.push({ t: 'regex', v: '/', line, depth }); i = j; continue;
      }
    }
    if (c === '{' || c === '(' || c === '[') { toks.push({ t: 'punct', v: c, line, depth }); depth++; i++; continue; }
    if (c === '}' || c === ')' || c === ']') { depth--; toks.push({ t: 'punct', v: c, line, depth }); i++; continue; }
    toks.push({ t: 'punct', v: c, line, depth }); i++;
  }
  return { toks, depth };
}
// top-level declarations (function NAME / var a, b) at depth d0, and every identifier used (not after a '.')
function namesOf(toks, d0) {
  const decl = new Set(), used = new Set();
  for (let k = 0; k < toks.length; k++) {
    const t = toks[k], p = toks[k - 1];
    if (t.t !== 'id') continue;
    if (p && p.t === 'punct' && p.v === '.') continue;
    used.add(t.v);
    if (t.depth !== d0) continue;
    const stmtStart = !p || (p.t === 'punct' && /^[;{}]$/.test(p.v)) || (p.t === 'id' && p.v === 'async');
    if (t.v === 'function' && stmtStart && toks[k + 1] && toks[k + 1].t === 'id') decl.add(toks[k + 1].v);
    if (t.v === 'var' && stmtStart) {
      let expectName = true;
      for (let m = k + 1; m < toks.length; m++) {
        const q = toks[m];
        if (q.depth === d0 && q.t === 'punct' && q.v === ';') break;
        if (expectName && q.t === 'id') { decl.add(q.v); expectName = false; }
        else if (q.depth === d0 && q.t === 'punct' && q.v === ',') expectName = true;
      }
    }
  }
  return { decl, used };
}
// a group file must parse as a strict script on its own (no top-level return: it runs inside an eval)
function parseError(code) {
  try { new vm.Script('\'use strict\';\n' + code); return null; } catch (e) { return e.message; }
}

// ------------------------------------------------------------------ pages
const PAGES = [
  { page: 'ui-smoke.html', dir: 'smoke', what: 'steps', firstGroup: /^  \/\/ ---- steps\r?\n?$/, runner: /^  \/\/ ---- runner\r?\n?$/ },
  { page: 'kernel-tests.html', dir: 'kernel', what: 'tests', firstGroup: /^  \/\/ -{60,} CSG primitives\r?\n?$/, runner: /^  \/\/ -{60,} summary\r?\n?$/ }
];
function splitLines(text) { return text.match(/[^\n]*\n|[^\n]+$/g) || []; }
const START = /^  \/\/ -{3,}(?!-)\s*(?!end\b)(\S.*?)\r?\n?$/;
function fileNameFor(title, taken) {
  title = title.replace(/\s*-{3,}\s*$/, '').trim();
  let m, base;
  if ((m = /^(rf[A-Z]{1,3})\b/.exec(title))) base = m[1];
  else if ((m = /^([a-z][\w]*(?:\/[\w-]+)+)/.exec(title))) base = m[1].replace(/\//g, '-');
  else if ((m = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)+)\b/.exec(title))) base = m[1];
  else {
    title = title.replace(/\(.*?\)/g, ' ');
    const lead = title.split(/[,:—]/)[0].trim();   // the heading's lead words when they say enough ("Evaluate tab: …")
    if (lead.length >= 4) title = lead;
    base = title.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim()
      .split(' ').filter(Boolean).slice(0, 5).join('-') || 'group';
  }
  let name = base, k = 2;
  while (taken.has(name.toLowerCase())) name = base + '-' + (k++);
  taken.add(name.toLowerCase());
  return name + '.js';
}

function splitPage(cfg) {
  const file = path.join(TESTS, cfg.page), text = fs.readFileSync(file, 'utf8'), lines = splitLines(text);
  const eol = /\r\n/.test(text) ? '\r\n' : '\n';
  const first = lines.findIndex((l) => cfg.firstGroup.test(l));
  const runner = lines.findIndex((l) => cfg.runner.test(l));
  if (first < 0 || runner < 0) throw new Error(cfg.page + ': group / runner markers not found (already split?)');
  const scriptStart = lines.findIndex((l, i) => i < first && /^<script>\r?\n?$/.test(l));
  // brace depth at every line start, from the scanner run over the inline script up to the runner
  const body = lines.slice(scriptStart + 1, runner).join(''), sc = scan(body), lineDepth = [];
  { let k = 0; const nl = body.split('\n').length; for (let L = 1; L <= nl; L++) { while (k < sc.toks.length && sc.toks[k].line < L) k++; lineDepth[L] = k < sc.toks.length ? sc.toks[k].depth : sc.depth; } }
  const depthAt = (i) => lineDepth[i - scriptStart];
  const d0 = depthAt(first);
  // cut at the first group line and at every section marker at the page script's top level
  const cuts = [first];
  for (let i = first + 1; i < runner; i++) if (START.test(lines[i]) && depthAt(i) === d0) cuts.push(i);
  cuts.push(runner);
  const segs = [];
  for (let c = 0; c < cuts.length - 1; c++) segs.push({ from: cuts[c], to: cuts[c + 1] });
  // a piece that does not parse alone is merged into the next one
  for (let s = 0; s < segs.length; s++) {
    const err = parseError(lines.slice(segs[s].from, segs[s].to).join(''));
    if (!err) continue;
    if (s + 1 >= segs.length) throw new Error(cfg.page + ': the last piece does not parse: ' + err);
    console.log('  merge line ' + (segs[s].from + 1) + ' into the next piece: ' + err);
    segs[s + 1].from = segs[s].from; segs.splice(s, 1); s--;
  }
  const taken = new Set();
  segs.forEach((s) => {
    const head = START.exec(lines[s.from]);
    s.file = cfg.dir + '/' + fileNameFor(head && head[1] !== 'steps' ? head[1] : 'basics', taken);
    s.code = lines.slice(s.from, s.to).join('');
  });
  return { cfg, file, text, lines, eol, first, runner, segs, d0, scriptStart };
}

// the page's loader, in place of the groups (ES5, like the pages)
function loaderBlock(cfg, files, eol) {
  const virt = cfg.page.replace(/\.html$/, '') + '.groups.js', virtRe = virt.replace(/\./g, '\\.');
  const failRow = cfg.dir === 'smoke'
    ? '  groupSet.failed.forEach(function (f) { steps.push({ name: f.file + \' loads\', fn: function () { throw f.error; } }); });'
    : '  groupSet.failed.forEach(function (f) { group(f.file); test(f.file + \' loads\', function () { throw f.error; }); });';
  const src = String.raw`  // ---- test groups (tests/${cfg.dir}/*.js)
  // Every group of ${cfg.what} lives in its own file under tests/${cfg.dir}/ and runs in the order of GROUPS. The files are
  // read with a synchronous XMLHttpRequest ${cfg.dir === 'smoke' ? 'from the server (the page needs HTTP, as the app frame does), joined in\n  // that order' : '(under Node, the XMLHttpRequest shim of headless/anvil.js reads them from\n  // disk), joined in that order'} and run by ONE direct eval right here: they see every helper above, and each other's
  // top-level helpers, exactly as when they were written inline in this script. Stack traces name ${virt};
  // groupLines() turns those into tests/${cfg.dir}/<file>:<line>. A file that cannot be read or does not parse is left
  // out and shows as one FAIL row${cfg.dir === 'smoke' ? ' (not filtered by ?only)' : ''}. To add a group: write tests/${cfg.dir}/<name>.js (rfXX.js per
  // lane), add one line to GROUPS, and run node anvil/tests/split-tests.js --check. See README *Tests*.
  var GROUPS = [
${files.map((f) => '    \'' + f + '\'').join(',\n')}
  ];
  var groupFiles = [], groupSet = loadGroups(GROUPS, '${virt}');
  try { eval(groupSet.source); } catch (e) { groupSet.failed.push({ file: groupWhere(e && e.stack) || '${virt}', error: e }); }
  // a group file that did not load, parse or run to its end: one FAIL row
${failRow}
  function loadGroups(files, name) {
    var base = (typeof location !== 'undefined' && location.href) ? String(location.href).replace(/[?#].*$/, '').replace(/[^\/]*$/, '') : '';
    var texts = [], failed = [];
    files.forEach(function (file) {
      try {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', file, false);
        if (xhr.overrideMimeType) xhr.overrideMimeType('text/plain; charset=utf-8');
        xhr.send();
        if (xhr.status !== 200 && !(xhr.status === 0 && xhr.responseText)) throw new Error('could not read ' + file + ' (HTTP ' + xhr.status + ')');
        var text = String(xhr.responseText);
        texts.push({ file: file, text: /\n$/.test(text) ? text : text + '\n' });
      } catch (e) { failed.push({ file: 'tests/' + file, error: e }); }
    });
    // a syntax error in one file would stop them all: find the files that do not parse and leave them out
    var all = texts.map(function (t) { return t.text; }).join('');
    try { new Function('\'use strict\';\n' + all); } catch (e) {
      texts = texts.filter(function (t) {
        try { new Function('\'use strict\';\n' + t.text); return true; } catch (e2) { failed.push({ file: 'tests/' + t.file, error: e2 }); return false; }
      });
    }
    var line = 1;
    texts.forEach(function (t) { t.first = line; line += t.text.split('\n').length - 1; });
    groupFiles = texts;
    return { source: texts.map(function (t) { return t.text; }).join('') + '//# sourceURL=' + base + name, failed: failed };
  }
  // "…/${virt}:LINE" in a stack or message -> "tests/${cfg.dir}/<file>:<line>"
  function groupLines(text) {
    return String(text).replace(/[^\s()@]*${virtRe}:(\d+)/g, function (m, n) {
      for (var i = groupFiles.length - 1; i >= 0; i--) if (+n >= groupFiles[i].first) return 'tests/' + groupFiles[i].file + ':' + (+n - groupFiles[i].first + 1);
      return m;
    });
  }
  // the first group file location in a stack, or null
  function groupWhere(stack) {
    var m = stack && /tests\/${cfg.dir}\/[^\s():]+:\d+/.exec(groupLines(stack));
    return m ? m[0] : null;
  }
`;
  return src.replace(/\r?\n/g, eol);
}

function check(pages) {
  let problems = 0;
  pages.forEach((r) => {
    const H = namesOf(scan(r.helpers).toks, 2), R = namesOf(scan(r.runnerCode).toks, 0);
    const per = r.segs.map((s) => namesOf(scan(s.code).toks, 0));
    const declaredBy = new Map();
    per.forEach((p, i) => p.decl.forEach((nm) => { if (!declaredBy.has(nm)) declaredBy.set(nm, []); declaredBy.get(nm).push(i); }));
    declaredBy.forEach((js, nm) => {
      if (js.length > 1) console.log('  note: ' + nm + ' is declared at top level in ' + js.map((j) => r.segs[j].file).join(', ') + ' (the last one wins)');
      if (H.decl.has(nm)) console.log('  note: ' + nm + ' in ' + js.map((j) => r.segs[j].file).join(', ') + ' shadows the page helper of that name');
    });
    // group declarations live in the eval's scope: the page's helpers and runner cannot see them
    [['helpers', H], ['runner', R]].forEach(([part, X]) => X.used.forEach((nm) => {
      if (X.decl.has(nm) || H.decl.has(nm) || !declaredBy.has(nm)) return;
      problems++; console.log('  ' + r.cfg.page + ' ' + part + ' use ' + nm + ', which only ' + declaredBy.get(nm).map((j) => r.segs[j].file).join(', ') + ' declares');
    }));
    r.segs.forEach((s) => { const err = parseError(s.code); if (err) { problems++; console.log('  ' + s.file + ' does not parse: ' + err); } });
  });
  return problems;
}

// an already split page: its helpers, GROUPS list and runner, and the group files from disk
function readSplit(cfg) {
  const text = fs.readFileSync(path.join(TESTS, cfg.page), 'utf8'), lines = splitLines(text);
  const g0 = lines.findIndex((l) => /^  var GROUPS = \[/.test(l));
  if (g0 < 0) return null;
  const files = [];
  for (let i = g0 + 1; !/^  \];/.test(lines[i]); i++) { const m = /'([^']+)'/.exec(lines[i]); if (m) files.push(m[1]); }
  const scriptStart = lines.findIndex((l) => /^<script>\r?\n?$/.test(l));
  const first = lines.findIndex((l) => /^  \/\/ ---- test groups/.test(l));
  const runner = lines.findIndex((l, i) => i > g0 && cfg.runner.test(l));
  let problems = 0;
  const segs = [];
  files.forEach((f) => {
    const p = path.join(TESTS, f);
    if (!fs.existsSync(p)) { problems++; console.log('  ' + cfg.page + ' lists ' + f + ', which does not exist'); return; }
    segs.push({ file: f, code: fs.readFileSync(p, 'utf8') });
  });
  fs.readdirSync(path.join(TESTS, cfg.dir)).filter((f) => /\.js$/.test(f) && files.indexOf(cfg.dir + '/' + f) < 0).forEach((f) => {
    problems++; console.log('  ' + cfg.dir + '/' + f + ' is not in the GROUPS list of ' + cfg.page);
  });
  return { cfg, segs, problems, helpers: lines.slice(scriptStart + 1, first).join(''), runnerCode: lines.slice(runner).join(''), pageLines: lines.length };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--split')) {
    const results = PAGES.map(splitPage);
    results.forEach((r) => { r.helpers = r.lines.slice(r.scriptStart + 1, r.first).join(''); r.runnerCode = r.lines.slice(r.runner).join(''); });
    results.forEach((r) => console.log(r.cfg.page + ': ' + r.segs.length + ' group files'));
    const problems = check(results);
    if (args.includes('--dry')) { results.forEach((r) => r.segs.forEach((s) => console.log('  ' + (s.from + 1) + '-' + s.to + ' ' + s.file))); return; }
    if (problems) throw new Error(problems + ' problem(s): not split');
    results.forEach((r) => {
      fs.mkdirSync(path.join(TESTS, r.cfg.dir), { recursive: true });
      r.segs.forEach((s) => fs.writeFileSync(path.join(TESTS, s.file), s.code));
      const page = r.lines.slice(0, r.first).join('') + loaderBlock(r.cfg, r.segs.map((s) => s.file), r.eol) + r.lines.slice(r.runner).join('');
      fs.writeFileSync(r.file, page);
      // helpers + the group files in order + runner must give back the original page byte for byte
      const back = r.lines.slice(0, r.first).join('') + r.segs.map((s) => fs.readFileSync(path.join(TESTS, s.file), 'utf8')).join('') + r.lines.slice(r.runner).join('');
      if (back !== r.text) throw new Error(r.cfg.page + ': the split does not round-trip');
      console.log(r.cfg.page + ': written, ' + splitLines(page).length + ' lines; the group files join back to the original byte for byte');
    });
    return;
  }
  const pages = PAGES.map(readSplit).filter(Boolean);
  const problems = pages.reduce((s, p) => s + p.problems, 0) + check(pages);
  console.log(pages.map((p) => p.cfg.page + ': ' + p.pageLines + ' lines, ' + p.segs.length + ' group files').join('; ') + ' — ' + (problems ? problems + ' problem(s)' : 'ok'));
  process.exitCode = problems ? 1 : 0;
}
main();
