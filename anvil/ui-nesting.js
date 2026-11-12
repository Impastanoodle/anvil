// ui-nesting.js — Transform ▸ Geometry Nesting (Mastercam's nesting PropertyManager), UI.cmdTNesting. The engine is
// nest.js (Nest); this file is the PropertyManager:
//   Parts       the current part's flat pattern, the open (or selected) sketch's closed profiles, or a DXF file's;
//               a quantity each
//   Sheet       size presets 48 × 96, 60 × 120, 48 × 120 in (in the document's units) or custom, material and thickness
//   Parameters  part spacing, sheet margin, rotation (none, 90°, 45°, every n°), mirror, nest in holes, start corner,
//               direction, maximum sheets, accuracy (the raster cell: the sheet's longer side / 1000, 2000 or 3000)
//   Results     Nest (and live re-nesting while it stays quick), a preview of each sheet with its utilisation, Save DXF
//               (one file per sheet, layer CUT, R12 or R2000 through the kernel's DXF writer)
// ✓ makes a new document "Nest" holding one sketch per sheet on the Top plane (the sheets side by side along X), the
// placed geometry on layer CUT and the sheet outline as construction. Works with no sketch open.
// For scripts and tests: UI.nestState(), UI.nestAddFlat(), UI.nestAddSketch(), UI.nestAddDXFText(text, name),
// UI.nestRun(), UI.nestSheetDXF(k, version), UI.nestSaveDXF(version).
(function () {
  'use strict';
  if (typeof UI === 'undefined' || !UI.openPM || !UI.K || typeof Nest === 'undefined') return;
  var App = UI.App, K = UI.K;
  var PRESETS = [['48x96', '48 × 96 in', 96, 48], ['60x120', '60 × 120 in', 120, 60], ['48x120', '48 × 120 in', 120, 48], ['custom', 'Custom', 0, 0]];
  var LIVE_MS = 400;   // re-nest as the values change while a nest takes less than this
  var ns = null;       // { parts: [{ name, part, qty, src }], result, sheet, stale, ms, vals }
  var last = null;     // the last result (Save DXF after ✓)

  function inchK() { return App.model && App.model.units === 'mm' ? 25.4 : 1; }
  function units() { return App.model && App.model.units === 'mm' ? 'mm' : 'in'; }
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  function fmt(x) { return UI.fmtNum ? UI.fmtNum(x, units() === 'in' ? 3 : 1) : String(r6(x)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function icon() { return Icons && Icons.has && Icons.has('tNesting') ? 'tNesting' : 'lpattern'; }
  // lane BO: a sheet preset is named in the document's units (an mm document: "1219 × 2438 mm (48 × 96 in)")
  function presetLabel(p) { return !p[2] || units() === 'in' ? p[1] : Math.round(p[3] * 25.4) + ' × ' + Math.round(p[2] * 25.4) + ' mm (' + p[1] + ')'; }

  // ------------------------------------------------------------------ parts
  function addPart(p, qty, src) {
    if (!p) return null;
    var rec = { name: p.name, part: p, qty: Math.max(1, Math.round(qty || 1)), src: src };
    ns.parts.push(rec);
    return rec;
  }
  function addFlat() {
    var m = App.model;
    if (!m || m.type === 'assembly' || !m.sheet) return { error: 'The current part has no flat pattern: make a Base Flange first (Sheet Metal tab), or add a sketch\'s profiles or a DXF.' };
    var flat;
    try { flat = K.flatPattern(m, App.build, App.mesh); } catch (e) { return { error: 'Flat pattern: ' + ((e && e.message) || e) }; }
    var p = Nest.part({ name: m.name || 'Part1', loops: flat.loops });
    if (!p) return { error: 'The flat pattern has no closed outline.' };
    if (flat.sheet && +flat.sheet.thickness > 0 && ns.vals && !(+ns.vals.thick > 0)) ns.vals.thick = +flat.sheet.thickness;
    addPart(p, 1, 'flat');
    return { ok: true, added: 1 };
  }
  function sketchFeature() {
    if (App.mode === 'sketch' && UI.activeSketchFeature) return UI.activeSketchFeature();
    var s = App.sel && App.sel.kind === 'feature' && App.model && App.model.features ? App.model.features.filter(function (f) { return f.id === App.sel.id && f.type === 'sketch'; })[0] : null;
    return s || null;
  }
  function addLoops(loops, name, src) {
    var parts = Nest.partsFromLoops(loops, name);
    parts.forEach(function (p) { addPart(p, 1, src); });
    return parts.length;
  }
  function addSketch() {
    var f = sketchFeature();
    if (!f) return { error: 'Open a sketch (or select one in the FeatureManager) to add its closed profiles.' };
    var prof;
    try { prof = K.sketchProfile(f); } catch (e) { return { error: 'Sketch profiles: ' + ((e && e.message) || e) }; }
    var loops = (prof.loops || []).filter(function (l) { return !l.cross && !l.meet; });
    var n = addLoops(loops, f.name || 'Sketch', 'sketch');
    return n ? { ok: true, added: n } : { error: f.name + ' has no closed profile.' };
  }
  function addDXFText(text, name) {
    if (typeof DxfImport === 'undefined') return { error: 'The DXF reader (dxf-import.js) is not loaded.' };
    var d;
    try { d = DxfImport.parse(text); } catch (e) { return { error: 'DXF: ' + ((e && e.message) || e) }; }
    // a layer the file has frozen or off stays out of the nest, as in the sketch import (local-2026-11-11a)
    var hid = {};
    (d.layers || []).forEach(function (l) { if (l.frozen || l.off) hid[l.name] = true; });
    var ents = (d.entities || []).filter(function (e) { return e.t !== 'text' && e.t !== 'point' && !hid[e.layer]; });
    var prof;
    try { prof = K.sketchProfile({ entities: ents }); } catch (e2) { return { error: 'DXF profiles: ' + ((e2 && e2.message) || e2) }; }
    // the file's units into the document's
    var s = d.units && d.units !== units() ? (d.units === 'in' ? 25.4 : 1 / 25.4) : 1;
    var loops = (prof.loops || []).filter(function (l) { return !l.cross && !l.meet; }).map(function (l) { return l.pts.map(function (p) { return [p[0] * s, p[1] * s]; }); });
    var n = addLoops(loops, String(name || 'DXF').replace(/\.dxf$/i, ''), 'dxf');
    return n ? { ok: true, added: n } : { error: (name || 'The DXF') + ' has no closed profile.' };
  }

  // ------------------------------------------------------------------ nesting
  function nestOptions(v) {
    var big = Math.max(+v.width || 0, +v.height || 0);
    var rot = v.rotation === 'custom' ? Math.max(0, +v.rotStep || 0) : +v.rotation || 0;
    return { width: +v.width, height: +v.height, spacing: Math.max(0, +v.spacing || 0), margin: Math.max(0, +v.margin || 0), rotation: rot,
      mirror: !!v.mirror, holes: !!v.holes, maxSheets: Math.max(1, Math.round(+v.maxSheets || 1)), corner: v.corner, direction: v.direction,
      cell: big > 0 ? big / (+v.accuracy || 2000) : undefined };
  }
  function runNest() {
    var v = ns.vals;
    if (!ns.parts.length) { ns.result = null; return { error: 'Add parts first: the flat pattern, a sketch\'s profiles or a DXF.' }; }
    if (!(+v.width > 0 && +v.height > 0)) return { error: 'Give the sheet a size.' };
    var t0 = Date.now();
    // the prepared parts (Nest.part) with this list's quantities, in list order (its order is the priority on ties)
    var parts = ns.parts.map(function (r) { var p = r.part; return { name: p.name, loops: p.loops, area: p.area, box: p.box, size: p.size, qty: Math.max(0, Math.round(+r.qty || 0)), priority: 0 }; });
    var res;
    try { res = Nest.run(parts, nestOptions(v)); } catch (e) { ns.result = null; return { error: 'Nesting failed: ' + ((e && e.message) || e) }; }
    ns.ms = Date.now() - t0;
    ns.result = res; last = { result: res, units: units(), name: ns.parts[0].name };
    ns.stale = false;
    if (ns.sheet >= res.sheets.length) ns.sheet = Math.max(0, res.sheets.length - 1);
    return { ok: true, result: res };
  }
  function summary() {
    var r = ns && ns.result;
    if (!r) return ns && ns.parts.length ? (ns.stale ? 'Values changed: press Nest.' : 'Press Nest to place the parts.') : 'Add parts, set the sheet, then Nest.';
    var s = r.placed + ' of ' + r.total + ' parts on ' + r.sheets.length + ' sheet' + (r.sheets.length === 1 ? '' : 's') + ', ' + r.utilization.toFixed(1) + ' % used';
    if (r.unplaced.length) s += '; ' + r.unplaced.length + ' did not fit';
    return s + (ns.stale ? ' (values changed: press Nest)' : '');
  }
  function setMessage() {
    var spec = UI.pmSpec && UI.pmSpec();
    if (!spec || !ns || spec !== ns.spec) return;
    spec.message = summary();
    spec.messageOk = !!(ns.result && !ns.stale && !ns.result.unplaced.length);
  }
  function rerender() { setMessage(); if (UI.renderPM) UI.renderPM(); updateOverlay(); }
  function doNest() {
    var r = runNest();
    if (r.error) { UI.setStatus(r.error); UI.toast(r.error); rerender(); return r; }
    UI.setStatus('Geometry Nesting: ' + summary() + '.');
    rerender();
    return r;
  }
  // lane progress: the Nest button. Nest.run works on the main thread in one piece, so when this nest is expected to
  // take a while (the last one took over 300 ms, or more than 40 parts are asked for) the card "Geometry Nesting" is
  // painted before it starts; a quick one runs at once as before
  function nestWithBar() {
    if (!UI.progress) return doNest();
    var qty = 0;
    (ns && ns.parts || []).forEach(function (r) { qty += Math.max(0, Math.round(+r.qty || 0)); });
    return UI.progress.run('Geometry Nesting', function (h) { if (h) h.set(null, qty + ' part' + (qty === 1 ? '' : 's')); return doNest(); },
      { card: true, paint: (ns && ns.ms > 300) || qty > 40 });
  }
  // a value changed: re-nest at once while nesting is quick, else ask for Nest
  function changed() {
    if (!ns) return;
    if (ns.result && ns.ms != null && ns.ms < LIVE_MS) { var r = runNest(); if (r.error) ns.stale = true; }
    else if (ns.result) ns.stale = true;
    rerender();
  }

  // ------------------------------------------------------------------ preview (inline SVG of one sheet)
  function sheetSVG(k, fill, role) {
    var r = ns && ns.result, v = ns && ns.vals;
    var W = r ? r.opts.width : +v.width, H = r ? r.opts.height : +v.height;
    if (!(W > 0 && H > 0)) return '';
    var pad = Math.max(W, H) * 0.02, S = r && r.sheets[k], body = '';
    var tol = Math.max(W, H) / 1500;
    if (S) S.placements.forEach(function (pl) {
      var d = Nest.placedLoops(r, pl).map(function (L) {
        return 'M' + Nest.loopPoly(L, tol).map(function (p) { return r6(p[0]) + ' ' + r6(H - p[1]); }).join('L') + 'Z';
      }).join('');
      body += '<path d="' + d + '" fill="#b4b4b4" fill-rule="evenodd" stroke="#2a2a2a" stroke-width="1" vector-effect="non-scaling-stroke"><title>' + esc(pl.name + ' #' + (pl.copy + 1) + (pl.angle ? ', ' + r6(pl.angle) + '°' : '') + (pl.mirror ? ', mirrored' : '')) + '</title></path>';
    });
    var m = r ? r.opts.margin : +v.margin || 0, marg = m > 0 ? '<rect x="' + m + '" y="' + m + '" width="' + r6(W - 2 * m) + '" height="' + r6(H - 2 * m) + '" fill="none" stroke="#a0a0a0" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke"/>' : '';
    return '<svg class="nest-preview" data-role="' + role + '" viewBox="' + r6(-pad) + ' ' + r6(-pad) + ' ' + r6(W + 2 * pad) + ' ' + r6(H + 2 * pad) + '" width="100%"' + (fill ? ' height="100%"' : '') + ' style="display:block;' + (fill ? '' : 'max-height:300px;') + 'background:#fff;border:1px solid #c8c8c8" preserveAspectRatio="xMidYMid meet">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#f0f0f0" stroke="#555555" stroke-width="1.2" vector-effect="non-scaling-stroke"/>' + marg + body + '</svg>';
  }
  // the graphics-area preview (Mastercam shows the nest there): one tab per sheet with its utilisation, the sheet below
  function updateOverlay() {
    var vp = document.getElementById('viewport'), ov = document.getElementById('nest-overlay');
    var want = !!(vp && ns && ns.spec && ns.vals.overlay && ns.result && ns.result.sheets.length);
    if (!want) { if (ov) ov.remove(); return; }
    if (!ov) {
      ov = document.createElement('div');
      ov.id = 'nest-overlay';   // lane BO: styled by style.css (#nest-overlay) so it follows the light / dark theme
      vp.appendChild(ov);
    }
    var r = ns.result;
    var tabs = r.sheets.map(function (S, k) {
      var on = k === ns.sheet;
      return '<button type="button" class="nest-tab" data-k="' + k + '" aria-pressed="' + on + '">Sheet ' + (k + 1) + ' · ' + S.placements.length + ' · ' + S.utilization.toFixed(1) + ' %</button>';
    }).join('');
    ov.innerHTML = '<div class="nest-overlay-head"><b>Geometry Nesting</b>' + tabs +
      '<span class="nest-overlay-sum">' + esc(summary()) + ' · ' + fmt(r.opts.width) + ' × ' + fmt(r.opts.height) + ' ' + units() + '</span></div>' +
      '<div style="flex:1;min-height:0">' + sheetSVG(ns.sheet, true, 'nest-overlay-sheet') + '</div>';
  }
  function partsHTML() {
    if (!ns.parts.length) return '<div class="pm-note" data-role="nest-parts">No parts yet.</div>';
    return '<div class="nest-parts" data-role="nest-parts">' + ns.parts.map(function (p, i) {
      return '<div class="pm-row nest-part" style="grid-template-columns:minmax(0,1fr) 58px 22px"><label title="' + esc(p.name) + '">' + esc(p.name) + ' <span class="static">' + fmt(p.part.size[0]) + ' × ' + fmt(p.part.size[1]) + '</span></label>' +
        '<input type="text" inputmode="numeric" pattern="[0-9]*" class="pm-num nest-qty" data-key="nestqty' + i + '" data-i="' + i + '" value="' + p.qty + '" title="Quantity (Enter nests)" style="width:58px;box-sizing:border-box">' +
        '<button type="button" class="nest-rm" data-i="' + i + '" style="padding:0 4px;min-width:0" title="Remove ' + esc(p.name) + '">✕</button></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ the Nest document
  function nestModel(res, v) {
    var m = K.newModel('Nest');
    m.units = units();
    var gap = Math.max(res.opts.width, res.opts.height) * 0.1;
    res.sheets.forEach(function (S, k) {
      m.features.push({ id: m.nextId++, type: 'sketch', name: 'Sheet' + (k + 1), plane: { ref: 'Top', offset: 0 },
        entities: Nest.sheetEntities(res, k, { offset: [k * (S.width + gap), 0] }), layers: [{ name: 'CUT', color: null }] });
    });
    m.nest = { sheet: [res.opts.width, res.opts.height], spacing: res.opts.spacing, margin: res.opts.margin, rotation: res.opts.rotation,
      mirror: res.opts.mirror, holes: res.opts.holes, material: v.material || '', thickness: +v.thick || 0, placed: res.placed, total: res.total,
      parts: ns.parts.map(function (p) { return { name: p.name, qty: p.qty }; }),
      sheets: res.sheets.map(function (S) { return { parts: S.placements.length, utilization: r6(S.utilization) }; }) };
    return m;
  }
  function sheetDXF(k, version, res, u) {
    res = res || (ns && ns.result) || (last && last.result);
    if (!res || !res.sheets[k]) return null;
    return Nest.sheetDXF(res, k, u || (ns && ns.result === res ? units() : last ? last.units : units()), { version: version || 'R12' });
  }
  function saveDXF(version) {
    var res = (ns && ns.result) || (last && last.result);
    if (!res || !res.sheets.length) { UI.toast('Nest first.'); return 0; }
    var base = String((ns && ns.parts[0] && ns.parts[0].name) || (last && last.name) || 'Nest').replace(/[^\w.-]+/g, '_') + '-nest';
    res.sheets.forEach(function (S, k) { UI.download(base + '-sheet' + (k + 1) + '.dxf', sheetDXF(k, version, res), 'application/dxf'); });
    UI.setStatus('Saved ' + res.sheets.length + ' DXF file' + (res.sheets.length === 1 ? '' : 's') + ' (' + (version || 'R12') + ', layer CUT).');
    return res.sheets.length;
  }

  // ------------------------------------------------------------------ the PropertyManager
  function openNesting() {
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    var k = inchK();
    // lane BO: the parts list and the values stay for the next opening in the same document (Save DXF again, add a
    // part); another document (New, Open) starts with an empty list. The document is told by a tag it gets here;
    // a model made by New or Open has none (or another one)
    var tag = App.model ? App.model.nestSession : null;
    if (ns && (!tag || tag !== ns.session)) ns = null;
    if (App.model && !tag) tag = App.model.nestSession = 'n' + Date.now().toString(36);
    var keep = ns && ns.vals ? ns.vals : null;
    var vals = keep || { preset: '48x96', width: r6(96 * k), height: r6(48 * k), material: '', thick: App.model && App.model.sheet ? +App.model.sheet.thickness || 0 : 0,
      spacing: r6(0.25 * k), margin: r6(0.5 * k), rotation: '90', rotStep: 15, mirror: false, holes: true, corner: 'bl', direction: 'x',
      maxSheets: 10, accuracy: 2000, dxfVersion: 'R12', overlay: true };
    ns = { parts: ns && ns.parts ? ns.parts : [], result: null, sheet: 0, stale: false, ms: null, vals: vals, session: tag };
    var spec = {
      title: 'Geometry Nesting', icon: icon(), values: vals, noFocus: true,
      help: 'Geometry Nesting: add parts (the flat pattern, a sketch\'s closed profiles or a DXF), set the quantity of each, the sheet and the spacing, then Nest. ✓ makes a Nest document with one sketch per sheet; Save DXF writes one file per sheet.',
      message: '',
      groups: [
        { title: 'Parts', fields: [
          { type: 'buttons', buttons: [
            { label: 'Add flat pattern', onclick: function () { report(addFlat()); } },
            { label: 'Add sketch', onclick: function () { report(addSketch()); } },
            { label: 'Add DXF…', onclick: pickDXF }] },
          { type: 'html', html: function () { return partsHTML(); } }] },
        { title: 'Sheet', fields: [
          { type: 'select', label: 'Size', key: 'preset', rerender: true, options: PRESETS.map(function (p) { return [p[0], presetLabel(p)]; }) },
          { type: 'number', label: 'Length (X)', key: 'width', unit: 'u', min: 0 },
          { type: 'number', label: 'Width (Y)', key: 'height', unit: 'u', min: 0 },
          { type: 'text', label: 'Material', key: 'material' },
          { type: 'number', label: 'Thickness', key: 'thick', unit: 'u', min: 0 }] },
        { title: 'Parameters', fields: [
          { type: 'number', label: 'Part spacing', key: 'spacing', unit: 'u', min: 0 },
          { type: 'number', label: 'Sheet margin', key: 'margin', unit: 'u', min: 0 },
          { type: 'select', label: 'Rotation', key: 'rotation', rerender: true, options: [['0', 'None'], ['90', '90° steps'], ['45', '45° steps'], ['custom', 'Every n°']] },
          { type: 'number', label: 'Rotation step', key: 'rotStep', unit: '°', min: 0, show: function (w) { return w.rotation === 'custom'; } },
          { type: 'check', label: 'Allow mirror', key: 'mirror' },
          { type: 'check', label: 'Nest in holes', key: 'holes' },
          { type: 'select', label: 'Start corner', key: 'corner', options: [['bl', 'Lower left'], ['br', 'Lower right'], ['tl', 'Upper left'], ['tr', 'Upper right']] },
          { type: 'select', label: 'Direction', key: 'direction', options: [['x', 'Rows along X'], ['y', 'Columns along Y']] },
          { type: 'number', label: 'Max sheets', key: 'maxSheets', min: 1, step: 1 },
          { type: 'select', label: 'Accuracy', key: 'accuracy', options: [[1000, 'Fast'], [2000, 'Normal'], [3000, 'Fine']] }] },
        { title: 'Results', fields: [
          { type: 'buttons', buttons: [{ label: 'Nest', onclick: function () { nestWithBar(); } }] },
          { type: 'static', label: 'Sheet', value: function () { var r = ns.result; return r && r.sheets.length ? (ns.sheet + 1) + ' of ' + r.sheets.length + ' · ' + r.sheets[ns.sheet].placements.length + ' parts · ' + r.sheets[ns.sheet].utilization.toFixed(1) + ' % used' : '—'; } },
          { type: 'buttons', show: function () { return !!(ns.result && ns.result.sheets.length > 1); }, buttons: [
            { label: '◀ Previous', onclick: function () { if (ns.sheet > 0) { ns.sheet--; rerender(); } } },
            { label: 'Next ▶', onclick: function () { if (ns.result && ns.sheet < ns.result.sheets.length - 1) { ns.sheet++; rerender(); } } }] },
          { type: 'html', html: function () { return sheetSVG(ns.sheet, false, 'nest-preview'); } },
          { type: 'check', label: 'Preview in graphics area', key: 'overlay' },
          { type: 'select', label: 'DXF version', key: 'dxfVersion', options: [['R12', 'R12 (AC1009)'], ['R2000', 'R2000 (AC1015)']] },
          { type: 'buttons', buttons: [{ label: 'Save DXF', onclick: function (w) { if (ns.stale || !ns.result) doNest(); saveDXF(w.dxfVersion); } }] }] }],
      onChange: function (v, key) {
        if (!key) return;
        if (key === 'preset') {
          var p = PRESETS.filter(function (q) { return q[0] === v.preset; })[0];
          if (p && p[2]) { v.width = r6(p[2] * inchK()); v.height = r6(p[3] * inchK()); }
        } else if (key === 'width' || key === 'height') {
          var match = PRESETS.filter(function (q) { return q[2] && Math.abs(q[2] * inchK() - v.width) < 1e-6 && Math.abs(q[3] * inchK() - v.height) < 1e-6; })[0];
          v.preset = match ? match[0] : 'custom';
        }
        if (key === 'overlay') { updateOverlay(); return; }
        if (/^(material|thick|dxfVersion)$/.test(key)) return;
        changed();
      },
      okBlocked: function () { return ns && ns.parts.length ? '' : 'Add parts to nest first'; },
      onOK: function (v) {
        if (ns.stale || !ns.result) { var r = runNest(); if (r.error) { UI.toast(r.error); rerender(); return false; } }
        var res = ns.result;
        if (!res.placed) { UI.toast('No part fits on the sheet.'); rerender(); return false; }
        var model = nestModel(res, v), msg = 'Nest: ' + summary() + '.';
        var pre = App.mode === 'sketch' && UI.exitSketch ? Promise.resolve(UI.exitSketch()) : Promise.resolve();
        return pre.then(function () {
          return new Promise(function (resolve) {
            var go = function () { UI.loadModel(model).then(function (b) { UI.setStatus(msg); resolve(b); }, function (e) { UI.toast((e && e.message) || String(e)); resolve(null); }); };
            if (UI.confirmDiscard) UI.confirmDiscard(null, go); else go();
          });
        });
      },
      onClose: function () { if (ns) ns.spec = null; updateOverlay(); }
    };
    ns.spec = spec;
    spec.message = summary();
    UI.openPM(spec);
    UI.setStatus('Geometry Nesting: add the parts, set the sheet, then Nest.');
  }
  function report(r) {
    if (r.error) { UI.setStatus(r.error); UI.toast(r.error); }
    else UI.setStatus('Added ' + r.added + ' part' + (r.added === 1 ? '' : 's') + ' to the nest.');
    if (r.ok) ns.stale = !!ns.result;
    // lane BO: the first part added is nested at once (the Nest button sits below the fold); later ones re-nest live
    if (r.ok && ns.result) changed(); else if (r.ok) doNest(); else rerender();
    return r;
  }
  var fileInput = null;
  function pickDXF() {
    if (!fileInput) {
      fileInput = document.createElement('input');
      fileInput.type = 'file'; fileInput.accept = '.dxf'; fileInput.hidden = true;
      fileInput.addEventListener('change', function () {
        var f = fileInput.files && fileInput.files[0];
        if (!f) return;
        var rd = new FileReader();
        rd.onload = function () { if (ns) report(addDXFText(String(rd.result), f.name)); fileInput.value = ''; };
        rd.readAsText(f);
      });
      document.body.appendChild(fileInput);
    }
    fileInput.click();
  }
  // the quantity boxes and remove buttons of the parts list (plain html rows)
  // lane BO: a quantity is read as it is typed but the re-nest waits until typing pauses (re-rendering the panel on
  // every keystroke put the caret at the start, so "12" came out "21"); leaving the box or Enter re-nests at once
  var qtyTimer = null;
  function qtyRead(t) {
    var p = ns && ns.parts[+t.getAttribute('data-i')];
    if (!p) return false;
    var n = Math.round(+t.value);
    if (!isFinite(n) || n < 0 || t.value.trim() === '') return false;
    p.qty = n;
    return true;
  }
  function qtyFlush() { if (qtyTimer) { clearTimeout(qtyTimer); qtyTimer = null; changed(); } }
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!ns || !t || !t.classList || !t.classList.contains('nest-qty')) return;
    if (!qtyRead(t)) return;
    clearTimeout(qtyTimer);
    qtyTimer = setTimeout(function () { qtyTimer = null; changed(); }, 350);
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target;
    if (!ns || !t || !t.classList || !t.classList.contains('nest-qty')) return;
    if (qtyRead(t)) qtyFlush(); else t.value = String((ns.parts[+t.getAttribute('data-i')] || {}).qty || 1);
  });
  // Enter in a Geometry Nesting box with a new entry nests (the value is in) and keeps the panel; Enter with nothing
  // new typed is ✓, which makes the Nest document (lane BP: the one Enter rule of ui-commands.js pmEnter)
  document.addEventListener('keydown', function (ev) {
    if (ev.key !== 'Enter' || !ns || !ns.spec || !UI.pmSpec || UI.pmSpec() !== ns.spec) return;
    var t = ev.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '', pm = document.getElementById('pm');
    if (!pm || !pm.contains(t) || tag === 'button' || tag === 'textarea') return;
    ev.preventDefault(); ev.stopPropagation();
    UI.pmEnter(t, function () {
      if (t.classList && t.classList.contains('nest-qty')) {
        if (!qtyRead(t)) { UI.setStatus('Quantity: type a whole number of 1 or more.'); return false; }
        if (qtyTimer) { clearTimeout(qtyTimer); qtyTimer = null; }
      }
      doNest();
      UI.setStatus('Nested with the new value — press Enter again to make the Nest document, or keep changing the settings.');
    });
  }, true);
  document.addEventListener('click', function (ev) {
    var tab = ev.target && ev.target.closest ? ev.target.closest('.nest-tab') : null;
    if (ns && tab) { ns.sheet = +tab.getAttribute('data-k') || 0; rerender(); return; }
    var t = ev.target && ev.target.closest ? ev.target.closest('.nest-rm') : null;
    if (!ns || !t) return;
    ns.parts.splice(+t.getAttribute('data-i'), 1);
    if (!ns.parts.length) { ns.result = null; ns.stale = false; rerender(); return; }
    changed();
  });

  UI.cmdTNesting = openNesting;
  UI.nestState = function () { return ns ? { parts: ns.parts, result: ns.result, sheet: ns.sheet, stale: ns.stale, values: ns.vals } : null; };
  UI.nestAddFlat = function () { if (!ns) return { error: 'Open Geometry Nesting first.' }; return report(addFlat()); };
  UI.nestAddSketch = function () { if (!ns) return { error: 'Open Geometry Nesting first.' }; return report(addSketch()); };
  UI.nestAddDXFText = function (text, name) { if (!ns) return { error: 'Open Geometry Nesting first.' }; return report(addDXFText(text, name)); };
  UI.nestRun = function () { return ns ? doNest() : { error: 'Open Geometry Nesting first.' }; };
  UI.nestSheetDXF = function (k, version) { return sheetDXF(k || 0, version); };
  UI.nestSaveDXF = saveDXF;
})();
