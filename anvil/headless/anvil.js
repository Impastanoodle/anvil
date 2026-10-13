// headless/anvil.js — Anvil without a browser: `node anvil/headless/anvil.js <command>` builds parts and assemblies
// with the engine loaded by headless/load.js (plain Node built-ins, no npm packages) and prints a JSON summary, writes
// STL / STEP / DXF / DWG / JSON / script files (DWG through headless/dwg.js: the ODA File Converter or LibreDWG),
// makes drawings (SVG / DXF / DWG / PDF), builds the bundled examples against their documented volumes, compares a
// part with OpenCascade (headless/occt.js) and runs tests/kernel-tests.html under a small DOM and Worker shim. Paths
// are resolved from this file, so it works from any current directory. Exit codes: 0 ok, 1 feature errors / failed
// checks / failed tests, 2 usage error or missing engine / converter. `--help` prints the commands.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const threads = require('worker_threads');
const { load, ANVIL_DIR, TESTS_PAGE } = require('./load');

const USAGE = [
  'usage: node anvil/headless/anvil.js <command> [options]',
  '',
  '  build <file> [--stl out] [--step out] [--dxf-flat out] [--dxf-face <index> out] [--dwg-flat out] [--dwg-face <index> out]',
  '               [--json out] [--script out] [--occt]',
  '               [--dxf-version r12|2000] [--dxf-style polyline|entities] [--no-bends] [--no-notes] [--no-origin] [--origin]',
  '      <file>: a part / assembly script (.js, the Builder API) or a saved model JSON. Prints a summary JSON.',
  '      --dxf-*: laser-ready (true circles and arcs, joined loops, units header), R12 by default; the flat at 0,0, a face',
  '               in its own frame unless --origin; each file is read back by headless/dxf-check.js and the result is in',
  '               the summary (a failed check exits 1)',
  "      --step: OpenCascade's exact STEP with --occt, else Anvil's own; the summary names the file's length unit",
  '      --dwg-*: the DXF through a converter (ODA File Converter, else vendor/libredwg from vendor/get-libredwg.ps1)',
  '  drawing <file> [--svg out] [--dxf out] [--dwg out] [--pdf out] [--views Front,Top,Right,Isometric] [--scale 1:2]',
  '               [--dxf-version r12|2000]   the sheet DXF (one layer per view) R12 by default; a DWG is made from R2000',
  '  example <name | index> [build options]     a bundled example (name case-insensitive, prefix allowed)',
  '  example --all [--occt]                      every example against its documented volume',
  '  examples                                    list the examples with their documented volumes',
  '  test                                        run tests/kernel-tests.html under Node',
  '  dxf2sketch <file.dxf | file.dwg> [--dxf out] what File > Open brings into a sketch: units, layers, entities, extents,',
  '                                              Check Sketch summary (a DWG through the ODA File Converter or LibreDWG)',
  '',
  'Global options: --quiet (summary only on stdout), --verbose (list the engine files as they load).'
].join('\n');

// ------------------------------------------------------------------ arguments
const VALUED = { stl: 1, step: 1, 'dxf-flat': 1, 'dwg-flat': 1, json: 1, script: 1, svg: 1, dxf: 1, dwg: 1, pdf: 1, views: 1, scale: 1, 'dxf-face': 2, 'dwg-face': 2,
  'dxf-version': 1, 'dxf-style': 1 };
function parseArgs(argv) {
  const out = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.slice(0, 2) !== '--') { out._.push(a); continue; }
    const name = a.slice(2), n = VALUED[name] || 0;
    if (n === 0) { out.flags[name] = true; continue; }
    const vals = argv.slice(i + 1, i + 1 + n);
    if (vals.length < n || vals.some((v) => v.slice(0, 2) === '--')) throw usage('--' + name + ' needs ' + n + ' value' + (n > 1 ? 's' : ''));
    out.flags[name] = n === 1 ? vals[0] : vals;
    i += n;
  }
  return out;
}
function usage(msg) { const e = new Error(msg + '\n\n' + USAGE); e.code = 2; return e; }

// ------------------------------------------------------------------ helpers
function r6(x) { return typeof x === 'number' && isFinite(x) ? Math.round(x * 1e6) / 1e6 : x; }
function pct(rel) { return '±' + String(+(rel * 100).toPrecision(6)) + '%'; }   // 0.02 -> ±2%, 1e-6 -> ±0.0001%
function vec6(v) { return v ? Array.from(v, r6) : v; }
function writeOut(file, text, encoding) {
  const f = path.resolve(process.cwd(), file);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, text, encoding || 'utf8');
  return { file: f, bytes: Buffer.byteLength(text, encoding || 'utf8') };
}
function note(quiet, s) { if (!quiet) process.stderr.write(s + '\n'); }

// DXF text -> DWG bytes through headless/dwg.js; records which converter did it in summary.converter.
// No converter: exit 2 with the hint; a converter failure: exit 1 with its first stderr lines.
function toDwg(dxfText, summary) {
  const Dwg = require('./dwg');
  const conv = Dwg.which();
  if (!conv) throw Object.assign(new Error('No DXF to DWG converter on this machine. ' + Dwg.HINT), { code: 2 });
  const bytes = Dwg.convert(dxfText, conv);
  summary.converter = conv.name;
  return bytes;
}

// a part or assembly from a file: a script (.js) or a model JSON; { kind, name, code | model }
function sourceFromFile(file) {
  const f = path.resolve(process.cwd(), file);
  if (!fs.existsSync(f)) throw usage('no such file: ' + f);
  const text = fs.readFileSync(f, 'utf8'), base = path.basename(f);
  if (/\.json$/i.test(f) || /^\s*\{/.test(text)) {
    const model = JSON.parse(text);
    return { kind: model.type === 'assembly' ? 'assembly' : 'part', name: model.name || base, model };
  }
  const { Assembly } = load();
  return { kind: Assembly.isAssemblyScript(text) ? 'assembly' : 'part', name: base.replace(/\.anvil\.js$|\.js$/i, ''), code: text };
}
function sourceFromExample(ex) { return { kind: ex.kind === 'assembly' ? 'assembly' : 'part', name: ex.name, code: ex.code, example: ex }; }

// ------------------------------------------------------------------ build
// buildSource(src) -> { kind, model, build, mesh, mp, summary }: runs the script (or takes the JSON), rebuilds, meshes
// and measures. Feature errors go into summary.errors; the build itself throwing is an ordinary exception.
function buildSource(src) {
  const { Kernel, Assembly } = load();
  const t0 = performance.now();
  let model, build;
  if (src.kind === 'assembly') {
    model = src.model || Assembly.newAssembly(src.name);
    if (src.code) Assembly.runScript(model, src.code);
    build = Assembly.rebuild(model);
  } else {
    model = src.model || Kernel.newModel(src.name || 'Part1');
    if (src.code) Kernel.runScript(model, src.code);
    build = Kernel.rebuild(model);
  }
  const ms = performance.now() - t0;
  const mesh = build.body ? Kernel.meshFromBody(build.body) : { positions: new Float32Array(0), normals: new Float32Array(0), faces: [], triCount: 0 };
  // mass the way the UI's Mass Properties reports it: per-body materials, in kg (Materials.massProps / assemblyMass)
  const { Materials } = load();
  const mp = src.kind === 'assembly' ? (Materials && Materials.assemblyMass ? Materials.assemblyMass(model, build) : Assembly.massProps(model, build))
    : (Materials && mesh.triCount ? Materials.massProps(model, build, mesh) : Kernel.massProps(mesh, model.density));
  const toKg = (massUnits) => (model.units === 'in' ? 1.6387064e-5 : 1e-9) * massUnits;   // density is kg/m³, volume in mm³ or in³
  const featureName = (id) => { const f = (model.features || []).filter((x) => x.id === id)[0]; return f ? f.name || f.type : null; };
  const errors = Object.keys(build.errors || {}).map((id) => ({ id: isNaN(+id) ? id : +id, feature: featureName(+id) || featureName(id), message: build.errors[id] }));
  const warnings = Object.keys(build.warnings || {}).map((id) => ({ id: isNaN(+id) ? id : +id, feature: featureName(+id) || featureName(id), message: build.warnings[id] }));
  const summary = {
    name: model.name, kind: src.kind, units: model.units || 'mm',
    features: (model.features || []).length,
    bodies: (build.bodies || (build.body ? [build.body] : [])).length,
    volume: r6(mp.volume), area: r6(mp.area), centroid: vec6(mp.centroid),
    bbox: mp.bbox ? { min: vec6(mp.bbox.min), max: vec6(mp.bbox.max) } : null,
    massKg: r6(mp.massKg != null ? mp.massKg : toKg(mp.mass)), density: r6(mp.density), material: mp.material || model.material || null,
    faces: mesh.faces.length, triangles: mesh.triCount,
    errors, warnings, rebuildMs: Math.round(ms * 10) / 10
  };
  if (src.kind === 'assembly') {
    summary.components = (model.components || []).map((c) => {
      const mc = (mp.components || []).filter((x) => x.id === c.id || x.name === c.name)[0] || {};
      return { name: c.name, fixed: !!c.fixed, volume: r6(mc.volume), massKg: mc.mass != null ? r6(toKg(mc.mass)) : null };
    });
    summary.mates = (model.mates || []).length;
    (build.components || []).forEach((c) => { if (c.error) summary.errors.push({ id: c.id, feature: c.name, message: c.error }); });
  }
  if (mp.polygonal && mp.curved) summary.polygonalVolume = r6(mp.polygonal.volume);
  return { kind: src.kind, model, build, mesh, mp, summary };
}

async function withOcct(r, wantStep, quiet) {
  const { Kernel, OcctKernel } = load({ occt: true });
  const { loadOpenCascade } = require('./occt');
  if (r.kind === 'assembly') { r.summary.occt = { skipped: 'OpenCascade comparison is for parts (an assembly builds each part on its own)' }; return null; }
  const t0 = performance.now();
  const { oc, loadMs } = await loadOpenCascade();
  note(quiet, 'OpenCascade loaded in ' + Math.round(loadMs) + ' ms');
  const o = OcctKernel.build(oc, Kernel, r.model, { exports: !!wantStep });
  const diff = r.mp.volume > 0 && o.volume != null ? Math.abs(o.volume - r.mp.volume) / r.mp.volume : null;
  r.summary.occt = {
    volume: r6(o.volume), valid: !!o.valid, faces: (o.faces || []).length, bodies: o.bodies, unsupported: o.unsupported || null, ok: !!o.ok,
    ms: Math.round(((o.ms && (o.ms.build + (o.ms.mesh || 0))) || (performance.now() - t0)) * 10) / 10,
    loadMs: Math.round(loadMs), tolerance: o.tolerance, volumeDiff: diff == null ? null : r6(diff), agrees: diff != null && o.tolerance != null ? diff <= o.tolerance : null
  };
  if (o.exportError) r.summary.occt.exportError = o.exportError;
  const failed = Object.keys(o.status || {}).filter((k) => /^error/.test(o.status[k]));
  if (failed.length) r.summary.occt.failed = failed.map((k) => k + ': ' + o.status[k]);
  return o;
}

// the DXF writer options from the flags: --dxf-version r12 | 2000, --dxf-style polyline | entities, --no-bends,
// --no-notes, --no-origin; a DWG is always converted from an R2000 DXF (LibreDWG reads R12 entities without their
// model space)
function dxfOptions(flags, forDwg) {
  const v = String(flags['dxf-version'] || 'r12').toLowerCase().replace(/^ac/, '');
  let version;
  if (/^r?12$|^1009$/.test(v)) version = 'R12';
  else if (/^r?2000$|^1015$/.test(v)) version = 'R2000';
  else throw usage('--dxf-version: r12 or 2000, not "' + flags['dxf-version'] + '"');
  const style = String(flags['dxf-style'] || 'polyline').toLowerCase();
  if (style !== 'polyline' && style !== 'entities') throw usage('--dxf-style: polyline or entities, not "' + flags['dxf-style'] + '"');
  return { version: forDwg ? 'R2000' : version, style, bendLines: !flags['no-bends'], notes: !flags['no-notes'], origin: !flags['no-origin'] };
}
// a written DXF read back (headless/dxf-check.js): the summary's `check`, and a failed check as a summary error
function dxfChecked(text, units, summary, what) {
  const DxfCheck = require('./dxf-check');
  const c = DxfCheck.check(text, { units });
  const loops = c.loops.length, circles = c.circles.length;
  const out = { ok: c.ok, version: c.version, insunits: c.insunits, loops, closed: c.loops.filter((l) => l.closed).length, circles,
    radii: Array.from(new Set(c.circles.map((q) => r6(q.r)))).sort((a, b) => a - b), counts: c.counts,
    extents: c.extents ? { min: c.extents.min.map(r6), max: c.extents.max.map(r6) } : null };
  if (!c.ok) { out.errors = c.errors.slice(0, 20); summary.errors.push({ id: null, feature: 'DXF check (' + what + ')', message: c.errors.slice(0, 5).join('; ') }); }
  return out;
}
// the length unit a STEP file declares: 'in', 'mm' (or another SI prefix + 'm'), null when none is found
function stepUnits(text) {
  const cb = /CONVERSION_BASED_UNIT\s*\(\s*'([^']+)'/.exec(text);
  if (cb) return /INCH/i.test(cb[1]) ? 'in' : cb[1].toLowerCase();
  const si = /LENGTH_UNIT\s*\(\s*\)\s*NAMED_UNIT\s*\(\s*\*\s*\)\s*SI_UNIT\s*\(\s*(\$|\.(\w+)\.)\s*,\s*\.METRE\.\s*\)/.exec(text) || /SI_UNIT\s*\(\s*(\$|\.(\w+)\.)\s*,\s*\.METRE\.\s*\)/.exec(text);
  if (si) return si[2] === 'MILLI' ? 'mm' : si[2] === 'CENTI' ? 'cm' : si[1] === '$' ? 'm' : (si[2] || '').toLowerCase() + 'm';
  return null;
}

async function runBuildOptions(r, flags, quiet) {
  const { Kernel, Exchange } = load();
  const outputs = {};
  let occ = null;
  if (flags.occt) occ = await withOcct(r, !!flags.step, quiet);
  if (flags.stl) outputs.stl = writeOut(flags.stl, Kernel.exportSTL(r.mesh, r.model.name || 'Part'));
  if (flags.step) {
    let text = occ && occ.step ? occ.step : null, exact = !!text;
    if (!text) {
      if (flags.occt) note(quiet, 'OpenCascade gave no STEP (' + (occ ? (occ.unsupported ? 'unsupported feature ' + occ.unsupported : occ.exportError || 'solid not valid') : 'not a part') + '); writing Anvil\'s own STEP instead');
      text = Exchange.exportSTEP(r.model, r.build);
    }
    const units = stepUnits(text), want = r.model.units === 'in' ? 'in' : 'mm';
    outputs.step = Object.assign(writeOut(flags.step, text), { exact, units });
    if (units !== want) r.summary.errors.push({ id: null, feature: 'STEP units', message: 'the STEP file declares ' + units + ' for a part in ' + want });
    // OpenCascade's STEP read back by OpenCascade (in mm): its size must be the B-rep's own times 25.4 for an inch part
    if (exact && occ && occ.bbox) {
      const { OcctKernel } = load({ occt: true });
      const { oc } = await require('./occt').loadOpenCascade();
      const imp = OcctKernel.importFile(oc, 'step', text), lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      imp.solids.forEach((s) => { for (let i = 0; i < s.positions.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], s.positions[i + k]); hi[k] = Math.max(hi[k], s.positions[i + k]); } });
      const k = want === 'in' ? 25.4 : 1, size = hi.map((x, i) => x - lo[i]), expect = [0, 1, 2].map((i) => (occ.bbox[1][i] - occ.bbox[0][i]) * k);
      const ok = size.every((x, i) => Math.abs(x - expect[i]) <= 1e-4 * (1 + expect[i]));
      outputs.step.readBack = { sizeMm: size.map(r6), expectedMm: expect.map(r6), ok };
      if (!ok) r.summary.errors.push({ id: null, feature: 'STEP size', message: 'read back the STEP is ' + size.map(r6).join(' × ') + ' mm, the part ' + expect.map(r6).join(' × ') + ' mm' });
    }
  }
  if (flags['dxf-flat'] || flags['dwg-flat']) {
    const opt = flags['dxf-flat'] ? '--dxf-flat' : '--dwg-flat';
    if (r.kind === 'assembly' || !r.model.sheet) throw Object.assign(new Error(opt + ': the part has no sheet-metal parameters (model.sheet); it needs a Base Flange'), { code: 1 });
    const flat = Kernel.flatPattern(r.model, r.build, r.mesh), units = r.model.units === 'in' ? 'in' : 'mm';
    const info = { bends: (flat.bends || []).length, bbox: flat.bbox };
    if (flags['dxf-flat']) {
      const o = dxfOptions(flags, false), text = Kernel.exportDXFFlat(flat, units, o);
      outputs.dxfFlat = Object.assign(writeOut(flags['dxf-flat'], text), info, { version: o.version, style: o.style, check: dxfChecked(text, units, r.summary, 'flat') });
    }
    if (flags['dwg-flat']) {
      const text = Kernel.exportDXFFlat(flat, units, dxfOptions(flags, true));
      outputs.dwgFlat = Object.assign(writeOut(flags['dwg-flat'], toDwg(text, r.summary)), info);
    }
  }
  for (const opt of ['dxf-face', 'dwg-face']) {
    if (!flags[opt]) continue;
    const idx = +flags[opt][0];
    if (!(idx >= 0 && idx < r.mesh.faces.length)) throw usage('--' + opt + ': face index ' + flags[opt][0] + ' is not in 0..' + (r.mesh.faces.length - 1));
    const units = r.model.units === 'in' ? 'in' : 'mm', o = dxfOptions(flags, opt === 'dwg-face');
    o.origin = !!flags.origin;   // a face keeps its own frame's coordinates unless --origin
    const text = Kernel.exportDXFFace(r.mesh, idx, units, o);
    if (opt === 'dxf-face') outputs.dxfFace = Object.assign(writeOut(flags[opt][1], text), { version: o.version, check: dxfChecked(text, units, r.summary, 'face ' + idx) });
    else outputs.dwgFace = writeOut(flags[opt][1], toDwg(text, r.summary));
  }
  if (flags.json) outputs.json = writeOut(flags.json, JSON.stringify(r.model, null, 1));
  if (flags.script) {
    const { Assembly } = load();
    outputs.script = writeOut(flags.script, r.kind === 'assembly' ? Assembly.generateScript(r.model) : Kernel.generateScript(r.model));
  }
  if (Object.keys(outputs).length) r.summary.outputs = outputs;
}

async function cmdBuild(src, flags) {
  const quiet = !!flags.quiet;
  const r = buildSource(src);
  await runBuildOptions(r, flags, quiet);
  process.stdout.write(JSON.stringify(r.summary, null, 2) + '\n');
  return r.summary.errors.length ? 1 : 0;
}

// ------------------------------------------------------------------ drawing
const ROLES = { Front: 'front', Back: 'front', Top: 'top', Bottom: 'top', Right: 'right', Left: 'right', Isometric: 'iso', Dimetric: 'iso', Trimetric: 'iso' };
function parseScale(s) {
  const m = /^\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*$/.exec(String(s));
  if (!m || !(+m[1] > 0) || !(+m[2] > 0)) throw usage('--scale: expected n:m, for example 1:2');
  return [+m[1], +m[2]];
}
async function cmdDrawing(src, flags) {
  const { Drawing } = load();
  if (!flags.svg && !flags.dxf && !flags.dwg && !flags.pdf) throw usage('drawing: give at least one of --svg, --dxf, --dwg, --pdf');
  const r = buildSource(src);
  if (r.summary.errors.length) note(flags.quiet, 'feature errors: ' + r.summary.errors.map((e) => (e.feature || e.id) + ': ' + e.message).join(' | '));
  if (!r.mesh.triCount) throw Object.assign(new Error('drawing: the model has no solid body to draw'), { code: 1 });
  const opts = { projection: 'third' };
  if (flags.scale) opts.scale = parseScale(flags.scale);
  const doc = Drawing.newDrawing(r.model, opts), units = r.model.units === 'in' ? 'in' : 'mm';
  let names;
  if (flags.views) {
    names = String(flags.views).split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
      const k = Object.keys(ROLES).filter((o) => o.toLowerCase() === s.toLowerCase() || (s.toLowerCase() === 'iso' && o === 'Isometric'))[0];
      if (!k) throw usage('--views: unknown view "' + s + '" (one of ' + Object.keys(ROLES).join(', ') + ')');
      return k;
    });
    const used = {};
    doc.views = []; doc.nextView = 1;
    names.forEach((n) => {
      const role = ROLES[n];
      if (used[role]) throw usage('--views: ' + n + ' and ' + used[role] + ' would take the same place on the sheet (one of Front/Back, Top/Bottom, Right/Left and one pictorial view)');
      used[role] = n;
      const props = { role };
      if (role === 'top' && used.front) { props.parent = doc.views[0].id; props.align = 'x'; }
      if (role === 'right' && used.front) { props.parent = doc.views[0].id; props.align = 'y'; }
      Drawing.addView(doc, n, props);
    });
    Drawing.layout(doc, r.mesh, units);
  } else {
    Drawing.standard3View(doc, r.mesh, units);
    names = doc.views.map((v) => v.orient);
  }
  const t0 = performance.now();
  const sheet = Drawing.compute(doc, r.mesh, r.model);
  const outputs = {}, conv = {};
  if (flags.svg) outputs.svg = writeOut(flags.svg, Drawing.toSVG(sheet));
  // the drawing DXF: R12 by default, --dxf-version 2000 for R2000; read back by dxf-check (no cut layers on a drawing:
  // the check is the header, units and entities); a DWG goes through an R2000 DXF, as the flat's does
  if (flags.dxf) {
    const dv = dxfOptions(flags, false).version, text = Drawing.toDXF(sheet, { version: dv }), c = require('./dxf-check').check(text, { units, layers: [] });
    outputs.dxf = Object.assign(writeOut(flags.dxf, text), { version: dv, check: { ok: c.ok, version: c.version, insunits: c.insunits, entities: c.entities, counts: c.counts } });
    if (!c.ok) r.summary.errors.push({ id: null, feature: 'DXF check (drawing)', message: c.errors.slice(0, 5).join('; ') });
  }
  if (flags.dwg) outputs.dwg = writeOut(flags.dwg, toDwg(Drawing.toDXF(sheet, { version: 'R2000' }), conv));
  if (flags.pdf) outputs.pdf = writeOut(flags.pdf, Drawing.toPDF(sheet), 'latin1');
  const summary = {
    name: r.model.name, kind: r.kind, sheet: { format: doc.sheet.format, scale: doc.sheet.scale, projection: doc.sheet.projection, units },
    views: doc.views.map((v) => ({ id: v.id, name: v.name, orient: v.orient, x: r6(v.x), y: r6(v.y), scale: v.scale || null })),
    dims: (sheet.dims || []).length, computeMs: Math.round((performance.now() - t0) * 10) / 10, outputs, errors: r.summary.errors
  };
  if (conv.converter) summary.converter = conv.converter;
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return r.summary.errors.length ? 1 : 0;
}

// ------------------------------------------------------------------ examples
function findExample(key) {
  const { AnvilExamples } = load();
  if (/^\d+$/.test(key)) {
    const ex = AnvilExamples[+key];
    if (!ex) throw usage('example: index ' + key + ' is not in 0..' + (AnvilExamples.length - 1));
    return ex;
  }
  const k = key.toLowerCase();
  const exact = AnvilExamples.filter((e) => e.name.toLowerCase() === k);
  if (exact.length === 1) return exact[0];
  const prefix = AnvilExamples.filter((e) => e.name.toLowerCase().indexOf(k) === 0);
  if (prefix.length === 1) return prefix[0];
  const within = AnvilExamples.filter((e) => e.name.toLowerCase().indexOf(k) >= 0);
  if (within.length === 1) return within[0];
  const cands = prefix.length ? prefix : within;
  if (cands.length > 1) throw usage('example: "' + key + '" matches ' + cands.map((e) => '"' + e.name + '"').join(', '));
  throw usage('example: no example named "' + key + '" (see `examples`)');
}
function cmdExamples() {
  const { AnvilExamples } = load();
  const w = Math.max.apply(null, AnvilExamples.map((e) => e.name.length));
  AnvilExamples.forEach((e, i) => {
    const vol = e.volume == null ? '(no documented volume)' : r6(e.volume) + ' ' + pct(e.tolerance || 0.02);
    process.stdout.write(String(i).padStart(2) + '  ' + e.name.padEnd(w) + '  ' + (e.kind === 'assembly' ? 'assembly' : 'part    ') + '  ' + vol + '\n');
  });
  return 0;
}
async function cmdExampleAll(flags) {
  const { AnvilExamples } = load();
  const rows = [];
  let failed = 0;
  for (const ex of AnvilExamples) {
    const row = { name: ex.name, kind: ex.kind === 'assembly' ? 'assembly' : 'part', documented: ex.volume == null ? null : ex.volume, tolerance: ex.volume == null ? null : (ex.tolerance || 0.02) };
    try {
      const r = buildSource(sourceFromExample(ex));
      row.volume = r.mp.volume; row.ms = r.summary.rebuildMs;
      if (r.summary.errors.length) row.error = r.summary.errors.map((e) => (e.feature || e.id) + ': ' + e.message).join(' | ');
      else if (!(r.mp.volume > 0)) row.error = 'volume is not positive';
      else if (ex.volume != null) {
        row.diff = Math.abs(r.mp.volume - ex.volume) / Math.abs(ex.volume);
        if (row.diff > row.tolerance) row.error = 'volume ' + r.mp.volume + ' vs documented ' + ex.volume + ' (' + (row.diff * 100).toFixed(3) + '% > ' + row.tolerance * 100 + '%)';
      }
      if (flags.occt && row.kind === 'part') {
        const o = await withOcct(r, false, true);
        row.occt = r.summary.occt;
        if (o && !o.unsupported && o.valid && r.summary.occt.agrees === false) row.error = (row.error ? row.error + '; ' : '') + 'OpenCascade volume ' + o.volume + ' differs by ' + (r.summary.occt.volumeDiff * 100).toFixed(4) + '%';
      }
    } catch (e) { row.error = 'threw: ' + (e && e.message || e); }
    if (row.error) failed++;
    rows.push(row);
    const occText = row.occt ? '  occt ' + (row.occt.unsupported ? 'n/a (' + row.occt.unsupported + ')' : row.occt.volume + (row.occt.volumeDiff != null ? ' (' + (row.occt.volumeDiff * 100).toFixed(4) + '%)' : '')) : '';
    process.stdout.write((row.error ? 'FAIL' : 'PASS') + '  ' + row.name.padEnd(32) + '  ' + (row.volume != null ? r6(row.volume) : '-').toString().padStart(18)
      + '  ' + (row.documented != null ? r6(row.documented) + ' ' + pct(row.tolerance) : '(not documented)').padEnd(28)
      + (row.diff != null ? '  ' + (row.diff * 100).toFixed(4) + '%' : '         ') + (row.ms != null ? '  ' + row.ms + ' ms' : '') + occText + (row.error ? '\n      ' + row.error : '') + '\n');
  }
  process.stdout.write((rows.length - failed) + ' / ' + rows.length + ' examples ' + (failed ? 'ok, ' + failed + ' FAILED' : 'ok') + '\n');
  return failed ? 1 : 0;
}

// ------------------------------------------------------------------ test (tests/kernel-tests.html under Node)
// The page's inline script is run as is. It needs: document.createElement / getElementById for its result table (a
// few plain objects here), window, a synchronous XMLHttpRequest for tests/fixtures and for the page's test group files
// (tests/kernel/*.js in its GROUPS list, which the page joins and evals in its own scope; both read from disk), and Worker
// (worker_threads with importScripts / postMessage / onmessage bridged, as worker.js expects). The harness sets
// window.__anvilTests once every test, sync and async, has settled.
const WORKER_BOOT = `
  'use strict';
  const { parentPort, workerData } = require('worker_threads');
  const fs = require('fs'), path = require('path'), vm = require('vm');
  const dir = path.dirname(workerData.file);
  globalThis.self = globalThis;
  globalThis.importScripts = function () {
    Array.prototype.forEach.call(arguments, function (name) { const f = path.resolve(dir, name); vm.runInThisContext(fs.readFileSync(f, 'utf8'), { filename: f }); });
  };
  globalThis.postMessage = function (msg) { parentPort.postMessage(msg); };   // the transfer list is ignored: buffers are cloned
  parentPort.on('message', function (data) { if (typeof globalThis.onmessage === 'function') globalThis.onmessage({ data: data }); });
  vm.runInThisContext(fs.readFileSync(workerData.file, 'utf8'), { filename: workerData.file });
`;
function domShim(pageDir) {
  const workers = new Set();
  function node(tag) {
    const n = {
      tagName: tag, children: [], className: '', _text: '', hidden: false,
      get firstChild() { return this.children[0] || null; },
      get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._text; },
      set textContent(s) { this.children = []; this._text = String(s); },
      // the harness's row templates: '<td class="st"></td><td></td>…' -> td children
      set innerHTML(html) {
        this.children = []; this._text = '';
        const re = /<(\w+)([^>]*)>/g;
        let m;
        while ((m = re.exec(String(html)))) {
          if (m[1].toLowerCase() === 'td') { const c = node('td'), cls = /class\s*=\s*"([^"]*)"/.exec(m[2]); if (cls) c.className = cls[1]; this.children.push(c); }
        }
      },
      appendChild(c) { this.children.push(c); return c; },
      setAttribute() { }, addEventListener() { }
    };
    return n;
  }
  const byId = { rows: node('tbody'), summary: node('div') };
  const g = globalThis;
  g.window = g;
  if (typeof g.DOMParser === 'undefined') g.DOMParser = require('./xmldom').DOMParser;   // the SVG export checks
  g.document = {
    createElement: (tag) => node(tag), createElementNS: (ns, tag) => node(tag),
    getElementById: (id) => byId[id] || null, body: node('body'), head: node('head'), addEventListener() { }
  };
  g.XMLHttpRequest = class XMLHttpRequest {
    open(method, url) { this._url = url; this.status = 0; this.responseText = ''; }
    send() {
      const f = path.resolve(pageDir, String(this._url).replace(/[?#].*$/, '').replace(/^\//, ''));
      if (fs.existsSync(f)) { this.status = 200; this.responseText = fs.readFileSync(f, 'utf8'); } else { this.status = 404; }
    }
  };
  g.Worker = class Worker {
    constructor(url) {
      const file = path.resolve(pageDir, String(url));
      if (!fs.existsSync(file)) throw new Error('Worker: no such file ' + file);
      this.onmessage = null; this.onerror = null;
      this._w = new threads.Worker(WORKER_BOOT, { eval: true, workerData: { file } });
      this._w.on('message', (data) => { if (typeof this.onmessage === 'function') this.onmessage({ data }); });
      this._w.on('error', (err) => { if (typeof this.onerror === 'function') this.onerror({ message: (err && err.message) || String(err) }); });
      workers.add(this);
    }
    postMessage(msg) { this._w.postMessage(msg); }
    terminate() { workers.delete(this); return this._w.terminate(); }
  };
  return { workers, byId };
}
function inlineScript(html) {
  const re = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let m, last = null;
  while ((m = re.exec(html))) last = { code: m[1], index: m.index + m[0].indexOf(m[1]) };
  if (!last) throw new Error('no inline <script> block in ' + TESTS_PAGE);
  last.line = html.slice(0, last.index).split('\n').length - 1;
  return last;
}
async function cmdTest(flags) {
  load();
  const pageDir = path.dirname(TESTS_PAGE), html = fs.readFileSync(TESTS_PAGE, 'utf8');
  const shim = domShim(pageDir);
  const script = inlineScript(html);
  const t0 = performance.now();
  vm.runInThisContext(script.code, { filename: TESTS_PAGE, lineOffset: script.line });
  const result = await new Promise((resolve, reject) => {
    const limit = 300000, started = Date.now();
    const timer = setInterval(() => {
      if (globalThis.__anvilTests) { clearInterval(timer); resolve(globalThis.__anvilTests); }
      else if (Date.now() - started > limit) { clearInterval(timer); reject(new Error('the test page did not settle within ' + limit / 1000 + ' s: ' + shim.byId.summary.textContent)); }
    }, 50);
  });
  for (const w of Array.from(shim.workers)) { try { w.terminate(); } catch (e) { } }
  const failures = result.results.filter((r) => !r.ok);
  if (!flags.quiet) {
    let group = null;
    result.results.forEach((r) => {
      if (flags.verbose && r.group !== group) { group = r.group; process.stdout.write('\n' + group + '\n'); }
      if (flags.verbose || !r.ok) process.stdout.write((r.ok ? 'PASS  ' : 'FAIL  ') + r.name + (r.detail ? '\n      ' + String(r.detail).replace(/\n/g, '\n      ') : '') + '\n');
    });
  }
  process.stdout.write(result.passed + ' / ' + result.total + ' passed' + (failures.length ? ' — ' + failures.length + ' FAILED' : '') + '  ·  ' + ((performance.now() - t0) / 1000).toFixed(1) + ' s\n');
  return failures.length ? 1 : 0;
}

// ------------------------------------------------------------------ dxf2sketch (DWG / DXF import)
// What File ▸ Open of the file would bring into a sketch (dxf-import.js): units, layers, entities by type, extents and
// Check Sketch for Feature's summary; a .dwg goes through headless/dwg.js toDxf (ODA File Converter or LibreDWG's
// dwg2dxf) first. --dxf out also writes the DXF read. Exit 1 when there is no geometry in model space.
function cmdDxf2Sketch(file, flags) {
  const f = path.resolve(process.cwd(), file);
  if (!fs.existsSync(f)) throw usage('no such file: ' + f);
  load();
  const DxfImport = globalThis.DxfImport;
  let bytes = fs.readFileSync(f), converter = null;
  if (/\.dwg$/i.test(f)) {
    const Dwg = require('./dwg');
    const conv = Dwg.which('dwg2dxf');
    if (!conv) throw Object.assign(new Error('No DWG to DXF converter on this machine. ' + Dwg.HINT), { code: 2 });
    bytes = Dwg.toDxf(bytes, conv);
    converter = conv.name;
  }
  // DXF before AutoCAD 2007 (AC1021) is ANSI, later UTF-8
  const head = bytes.slice(0, 4000).toString('latin1'), ver = /\$ACADVER\s*[\r\n]+\s*1\s*[\r\n]+\s*AC(\d{4})/.exec(head);
  const text = ver && +ver[1] < 1021 ? bytes.toString('latin1') : bytes.toString('utf8');
  const outputs = {};
  if (flags.dxf) outputs.dxf = writeOut(flags.dxf, bytes, null);
  const p = DxfImport.parse(text), byType = {};
  p.entities.forEach((e) => { byType[e.t] = (byType[e.t] || 0) + 1; });
  const b = DxfImport.bounds(p.entities), tol = p.units === 'in' ? 0.001 : 0.025, issues = DxfImport.check(p.entities, tol, { unit: p.units || '' });
  const summary = { file: f, converter, version: ver ? 'AC' + ver[1] : null, units: p.units, entities: p.entities.length, byType,
    layers: p.layers.map((l) => ({ name: l.name, color: l.color, count: l.count })),
    extents: b ? { min: [r6(b[0]), r6(b[1])], max: [r6(b[2]), r6(b[3])], size: [r6(b[2] - b[0]), r6(b[3] - b[1])] } : null,
    check: issues.summary || 'No problems found', contours: issues.contours || null, warnings: p.warnings, outputs };
  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
  return p.entities.length ? 0 : 1;
}

// ------------------------------------------------------------------ main
async function main(argv) {
  const args = parseArgs(argv), cmd = args._[0], flags = args.flags;
  if (!cmd || flags.help || cmd === 'help') { process.stdout.write(USAGE + '\n'); return cmd ? 0 : 2; }
  if (flags.verbose) load({ verbose: true });
  switch (cmd) {
    case 'build':
      if (!args._[1]) throw usage('build: give a script or model file');
      return cmdBuild(sourceFromFile(args._[1]), flags);
    case 'drawing':
      if (!args._[1]) throw usage('drawing: give a script or model file');
      return cmdDrawing(sourceFromFile(args._[1]), flags);
    case 'examples':
      return cmdExamples();
    case 'example':
      if (flags.all) return cmdExampleAll(flags);
      if (!args._[1]) throw usage('example: give a name or index, or --all');
      if (flags.svg || flags.dxf || flags.dwg || flags.pdf) return cmdDrawing(sourceFromExample(findExample(args._[1])), flags);
      return cmdBuild(sourceFromExample(findExample(args._[1])), flags);
    case 'test':
      return cmdTest(flags);
    case 'dxf2sketch':
      if (!args._[1]) throw usage('dxf2sketch: give a .dxf or .dwg file');
      return cmdDxf2Sketch(args._[1], flags);
    default:
      throw usage('unknown command "' + cmd + '"');
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }, (e) => {
    // usage errors and known failures (e.code set) print their message; anything else is a bug and shows its stack
    const known = e && e.code != null;
    process.stderr.write((known ? '' : 'error: ') + ((e && (known ? e.message : e.stack || e.message)) || String(e)) + '\n');
    process.exitCode = e && e.code ? e.code : 1;
  });
}

module.exports = { main, buildSource, sourceFromFile, findExample, ANVIL_DIR };
