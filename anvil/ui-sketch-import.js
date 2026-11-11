// ui-sketch-import.js — DXF into a sketch (Insert DXF, File ▸ Open of a .dxf), Check Sketch for Feature and Repair
// Sketch: their SolidWorks PropertyManagers. The geometry is dxf-import.js's (DxfImport.parse / check / repair), so it
// runs and is tested without the UI. The file's TEXT / MTEXT come in as Etch Sketch Text on their layers; its
// DIMENSIONs and HATCHes are left out and counted in the message ("2 dimensions and 1 hatch skipped").
//   UI.cmdInsertDXF()                  Insert DXF / DWG: file picker, then the DXF/DWG Import PropertyManager into the active
//                                      sketch (a new sketch on the Top Plane when none is open); a .dwg is converted to DXF
//                                      by the local server first (UI.dwgToDxf, UI.importDWGData, UI.openDWGFile below)
//   UI.importDXFText(text, opts?)      the same from DXF text (scripts, tests): opts { name, units: 'file' | 'in' | 'mm',
//                                      origin: 'file' | 'lowerleft' | 'center', dx, dy, rot, tol, gap, repair, relations,
//                                      layers: { name: false }, blocks (false: blocks exploded), ok: true (accept at
//                                      once) } -> the PM values, or null. AZ: the file's INSERTs come in as sketch
//                                      blocks (Tools > Blocks: rigid instances of one definition each, Kernel.adoptBlocks)
//                                      when "Import blocks as blocks" is on (the default, as SolidWorks keeps them)
//   UI.openDXFFile(name, data)         File ▸ Open of a .dxf: a new part named after the file, the DXF in Sketch1 on the
//                                      Top Plane ("Import to a new part as 2D sketch")
//   UI.cmdCheckSketch()                Check Sketch for Feature (read-only; markers, Previous / Next zoom to each problem)
//   UI.cmdRepairSketch()               Repair Sketch (one undo step; relations and dimensions on surviving entities kept)
(function () {
  'use strict';
  if (typeof UI === 'undefined' || typeof DxfImport === 'undefined' || !UI.openPM) return;
  var App = UI.App, K = UI.K, $ = UI.$, S = window.SketchSolver;
  var SVGNS = 'http://www.w3.org/2000/svg';

  function partUnits() { return App.model && App.model.units === 'in' ? 'in' : 'mm'; }
  function conv(from, to) { return !from || from === to ? 1 : from === 'in' ? 25.4 : 1 / 25.4; }
  var UNIT_TEXT = { 'in': 'Inches', mm: 'Millimeters' };
  // SolidWorks' defaults: merge points closer than 0.0005 in (0.01 mm); a gap is anything under 0.001 in (0.025 mm)
  function mergeTol() { return partUnits() === 'in' ? 0.0005 : 0.01; }
  function gapTol() { return partUnits() === 'in' ? 0.001 : 0.025; }
  function isAsm() { return UI.isAssembly ? UI.isAssembly() : !!(App.model && App.model.type === 'assembly'); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  // One sketch action, one undo step: fn() returns { ok, error }; a failure takes the undo step back
  function undoStep(fn) {
    var was = App.sketchDirty, r;
    UI.pushUndo(); App.sketchDirty = true;
    try { r = fn(); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) { App.undo.pop(); App.sketchDirty = was; }
    return r || { ok: false };
  }
  function changed() { App.sel = null; App.sel2 = null; App.gridStale = true; App.dimsStale = true; UI.updateSketches(); UI.refreshTree(); }
  function clearPreview() { App.tempEntities = []; UI.updateTemp(); }
  // frame the sketch box b ([x0, y0, x1, y1]) in the graphics area (at least minW wide)
  function frame(b, minW) {
    if (!b || !UI.zoomToArea || !UI.size || !UI.cam) return;
    if (UI.finishViewAnimation) UI.finishViewAnimation();   // the screen position below is for the final view
    var pl = UI.activePlane(), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], s = UI.worldToScreen(K.to3D(pl, c[0], c[1]));
    var w = Math.max(b[2] - b[0], (b[3] - b[1]) * UI.size.w / Math.max(1, UI.size.h), minW || 0) * 1.5;   // room for the heads-up toolbar and the confirmation corner
    if (!(w > 0) || !isFinite(s[0])) return;
    UI.zoomToArea(s[0], s[1], w / (UI.size.w * UI.cam.scale));
  }

  // ------------------------------------------------------------------ markers (Check / Repair Sketch)
  // drawn over the sketch in the dimension layer, redrawn with it (so they follow zoom and pan): { list: [{ at, kind }],
  // cur } — red for problems, green for repairs, the current one larger
  var marks = null, markLayer = null;
  function setMarks(m) { marks = m; App.dimsStale = true; if (UI.requestRender) UI.requestRender(); drawMarks(); }
  function drawMarks() {
    var host = $('dim-layer');
    if (!host) return;
    if (!markLayer) { markLayer = document.createElementNS(SVGNS, 'g'); markLayer.setAttribute('class', 'dxi-marks'); markLayer.setAttribute('pointer-events', 'none'); }
    while (markLayer.firstChild) markLayer.removeChild(markLayer.firstChild);
    if (!marks || App.mode !== 'sketch' || !marks.list.length) { if (markLayer.parentNode) markLayer.parentNode.removeChild(markLayer); return; }
    host.appendChild(markLayer);
    var pl = UI.activePlane();
    marks.list.forEach(function (m, i) {
      var s = UI.worldToScreen(K.to3D(pl, m.at[0], m.at[1])), cur = i === marks.cur, fix = m.kind === 'fix';
      var c = document.createElementNS(SVGNS, 'circle');
      c.setAttribute('cx', s[0]); c.setAttribute('cy', s[1]); c.setAttribute('r', cur ? 11 : 7);
      c.setAttribute('class', 'dxi-mark' + (cur ? ' cur' : ''));
      c.setAttribute('style', 'fill:' + (fix ? '#2f9e5b' : '#d9453b') + ';fill-opacity:' + (cur ? 0.25 : 0.12) + ';stroke:' + (fix ? '#2f9e5b' : '#d9453b') + ';stroke-width:' + (cur ? 2.5 : 1.6));
      markLayer.appendChild(c);
    });
  }
  if (UI.drawDims) {
    var baseDrawDims = UI.drawDims;
    UI.drawDims = function () { var r = baseDrawDims.apply(this, arguments); drawMarks(); return r; };
  }
  UI.sketchCheckMarks = function () { return marks ? { cur: marks.cur, list: marks.list.slice() } : null; };   // test hook

  // ------------------------------------------------------------------ relations and dimensions after a repair
  // map: old entity index -> new (-1 removed); changed: new indices whose shape changed (joined, merged, split): their
  // relations and dimensions go, those of every other surviving entity are re-indexed
  function remapSketch(f, map, changedList) {
    var ch = {};
    (changedList || []).forEach(function (i) { ch[i] = true; });
    function mapRef(r) {
      var m = /^(\d+)(.*)$/.exec(String(r));
      if (!m) return r;
      var n = map[+m[1]];
      return n == null || n < 0 || ch[n] ? null : n + m[2];
    }
    if (f.rels) {
      f.rels = f.rels.filter(function (rel) {
        var refs = (rel.refs || []).map(mapRef);
        if (refs.some(function (x) { return x == null; })) return false;
        rel.refs = refs;
        return true;
      });
      if (!f.rels.length) delete f.rels;
    }
    if (f.dims) {
      f.dims = f.dims.filter(function (d) { var n = map[d.e]; if (n == null || n < 0 || ch[n]) return false; d.e = n; return true; });
      if (!f.dims.length) delete f.dims;
    }
  }
  // Coincident relations for each list of end refs that meet (the first end with each of the others)
  function addJoints(f, joints, offset) {
    var have = {}, n = 0;
    (f.rels || []).forEach(function (r) { if (r.type === 'coincident' && r.refs.length === 2) have[r.refs.slice().sort().join('|')] = 1; });
    joints.forEach(function (j) {
      for (var k = 1; k < j.length; k++) {
        var a = shiftRef(j[0], offset), b = shiftRef(j[k], offset), key = [a, b].sort().join('|');
        if (have[key]) continue;
        have[key] = 1;
        (f.rels = f.rels || []).push({ type: 'coincident', refs: [a, b] });
        n++;
      }
    });
    return n;
  }
  function shiftRef(r, off) { var m = /^(\d+)(.*)$/.exec(r); return m ? (+m[1] + off) + m[2] : r; }

  // ------------------------------------------------------------------ DXF/DWG Import
  // SolidWorks: File ▸ Open a .dxf ▸ Import to a new part as 2D sketch, or Insert ▸ DXF / DWG into an open sketch. The
  // PropertyManager: Units (the file's, or inches / millimetres; scaled into the part's units), Layers (each with its
  // entity count), Position (as in the file, lower-left corner of the box at the origin or its centre on the origin;
  // X / Y offset; rotation about the origin), Options (Merge points closer than; Repair after import: tiny entities
  // removed, duplicates and overlaps merged; Add Coincident relations). Live preview; ✓ adds the entities as one undo
  // step, their ends snapped exactly together so the outline is a closed profile, with Coincident relations where ends
  // meet. Above MAX_AUTO_RELS joints the relations start off: the solver's analysis of a sketch grows with its
  // relations (1200 Coincidents: about 1 s per sketch update), and the snapped ends make the profile on their own.
  var MAX_AUTO_RELS = 300;
  // the joints between ends of the entities, block instances' entities left out (a block is rigid: a Coincident inside
  // one is redundant, and its ends are where its definition puts them)
  function plainJoints(ents) {
    return DxfImport.endJoints(ents).map(function (j) { return j.filter(function (r) { return ents[parseInt(r, 10)].blk == null; }); }).filter(function (j) { return j.length >= 2; });
  }
  function jointCount(ents) { return plainJoints(ents).reduce(function (n, j) { return n + j.length - 1; }, 0); }
  function blockIds(ents) { var ids = {}; ents.forEach(function (e) { if (e.blk != null && e.blkDef != null) ids[e.blk] = e.blkDef; }); return ids; }
  function importDXFText(text, opts) {
    opts = opts || {};
    var name = String(opts.name || 'Drawing.dxf').replace(/^.*[\\\/]/, '');
    if (isAsm()) { UI.toast('DXF files are imported into a part sketch: open a part first.'); return null; }
    var parsed, parsedB = null, parsedX = null, hasBlocks = false;
    try {
      // AZ: INSERTs as block instances (DxfImport.parse blocks option); the exploded reading only when that is turned off
      if (opts.blocks !== false && K.blockEntity) { parsedB = DxfImport.parse(text, { blocks: true }); hasBlocks = parsedB.entities.some(function (e) { return e.blkDef != null; }); }
      if (!hasBlocks || opts.blocks === false) parsedX = DxfImport.parse(text);
      if (opts.blocks === false && K.blockEntity) hasBlocks = DxfImport.parse(text, { blocks: true }).entities.some(function (e) { return e.blkDef != null; });
    } catch (e) { UI.toast('Could not read ' + name + ': ' + e.message); return null; }
    parsed = hasBlocks && opts.blocks !== false ? parsedB : parsedX;
    if (!parsed.entities.length) { UI.toast(name + ' has no sketch geometry in model space' + (parsed.warnings.length ? ' (' + parsed.warnings.join(' ') + ')' : '.')); return null; }
    if (App.mode === 'sketch' && UI.cancelTool) UI.cancelTool();
    if (App.mode !== 'sketch') UI.newSketchOnPlane('Top');
    var f = UI.activeSketchFeature();
    if (!f) { UI.toast('Could not open a sketch for the DXF.'); return null; }
    var pu = partUnits();
    var v = { units: opts.units || 'file', origin: opts.origin || 'file', dx: +opts.dx || 0, dy: +opts.dy || 0, rot: +opts.rot || 0,
      tol: opts.tol != null ? +opts.tol : mergeTol(), gap: opts.gap != null ? +opts.gap : gapTol(), repair: opts.repair !== false, rels: true, blocks: opts.blocks !== false };
    // lane dxfaudit: a layer the file has frozen or off starts unchecked (AutoCAD does not show it); opts.layers wins
    function layerOn(l) { var o = opts.layers && opts.layers[l.name]; return o != null ? !!o : !(l.frozen || l.off); }
    parsed.layers.forEach(function (l, i) { v['L' + i] = layerOn(l); });
    var built = null;
    function srcUnits() { return v.units === 'in' || v.units === 'mm' ? v.units : (parsed.units || pu); }
    // the DXF layers the imported entities use, added to the sketch's layer table: a preset's settings for CUT /
    // ETCH / BEND (and marking layers named like ETCH: MARK, SCRIBE, ENGRAVE, which make no solid), else the
    // file's colour
    function addLayers(g, geo) {
      var ACI = { 1: '#e02020', 2: '#d8b400', 3: '#1e9e3c', 4: '#1aa6b8', 5: '#1f5fd0', 6: '#b0309c', 8: '#808080', 9: '#b0b0b0', 30: '#c77700' };
      var presets = (K.LAYER_PRESETS || []), used = {};
      geo.forEach(function (e) { if (e.layer) used[e.layer] = true; });
      Object.keys(used).forEach(function (n) {
        g.layers = g.layers || [];
        if (g.layers.some(function (l) { return l.name === n; })) return;
        var up = n.toUpperCase(), pre = presets.filter(function (p) { return p.name === up; })[0] ||
          (/ETCH|MARK|SCRIBE|ENGRAV/.test(up) ? presets.filter(function (p) { return p.name === 'ETCH'; })[0] : null);
        var src = parsed.layers.filter(function (l) { return l.name === n; })[0], aci = src ? Math.abs(+src.color) : 7;
        var L = { name: n, color: pre ? pre.color : (ACI[aci] || null), aci: pre && pre.aci != null ? pre.aci : aci };
        if (pre && pre.noProfile) L.noProfile = true;
        if (pre && pre.lineType) L.lineType = pre.lineType;
        g.layers.push(L);
      });
    }
    function layerFields() { return parsed.layers.map(function (l, i) { return { type: 'check', label: l.name + ' (' + l.count + ')' + (l.frozen ? ', frozen in the file' : l.off ? ', off in the file' : ''), key: 'L' + i }; }); }
    // the imported blocks' definitions into sketch g: a name g already uses for other geometry gets a suffix (-2, -3 ...)
    // on the imported instances; one it uses for the same geometry is shared
    function adoptImported(g, geo) {
      if (!K.blockDefs) return;
      var defs = K.blockDefs({ entities: geo }), have = g.blocks || {}, rename = {};
      function key(d) { return JSON.stringify(d.ents, function (k, x) { return typeof x === 'number' ? Math.round(x * 1e6) / 1e6 : x; }); }
      Object.keys(defs).forEach(function (n) {
        if (!have[n] || key(have[n]) === key(defs[n])) return;
        var k = 2;
        while (have[n + '-' + k] || defs[n + '-' + k]) k++;
        rename[n] = n + '-' + k;
      });
      geo.forEach(function (e) { if (e.blkDef != null && rename[e.blkDef]) e.blkDef = rename[e.blkDef]; });
    }
    function build() {
      // lane sketchgaps-2: the pipeline is DxfImport.prepare (dxf-import.js): layers on / off, data units, position,
      // Merge points closer than, Repair after import (tiny entities, duplicates / overlaps, gaps up to Close gaps up to)
      var off = {};
      parsed.layers.forEach(function (l, i) { off[l.name] = !!v['L' + i]; });   // (true: a frozen / off layer checked on)
      built = DxfImport.prepare(parsed, { partUnits: pu, units: srcUnits(), layers: off, origin: v.origin, dx: v.dx, dy: v.dy, rot: v.rot, tol: Math.max(0, +v.tol || 0), gap: v.gap, repair: !!v.repair });
      return built;
    }
    function preview() {
      try { build(); } catch (e) { built = { entities: [], report: null, error: e.message }; }
      App.tempEntities = built.entities.slice();
      UI.updateTemp();
      var rep = built.report;
      // lane dxfaudit: gaps a little wider than Close gaps up to (a customer's .002 in at a corner) are named with their
      // size, so the profile is not left open without a word; raising the field closes them
      var gl = v.repair ? Math.max(0, +v.gap || 0) : 0, E = built.entities.filter(function (e) { return e.t !== 'text' && e.t !== 'point' && e.blk == null; });
      var wide = E.length && E.length <= 5000 ? DxfImport.check(E, Math.max(10 * gl, pu === 'in' ? 0.01 : 0.25)).filter(function (i) { return i.type === 'gap' && i.size > gl; }) : [];
      built.openGaps = wide.map(function (i) { return i.size; });
      if (spec) {
        var nTxt = built.entities.filter(function (e) { return e.t === 'text' && e.blk == null; }).length, bi = blockIds(built.entities), nIns = Object.keys(bi).length;
        var nDef = Object.keys(bi).map(function (k) { return bi[k]; }).filter(function (n, i, a) { return a.indexOf(n) === i; }).length;
        spec.message = '<b>' + esc(name) + '</b>: ' + plural(built.entities.length, 'entity', 'entities') + ' to import' + (nTxt ? ', ' + plural(nTxt, 'text') + ' as Etch Sketch Text' : '') +
          (nIns ? ', ' + plural(nIns, 'block instance') + ' of ' + plural(nDef, 'block') : '') +
          (rep && (rep.gaps || rep.merged || rep.removed) ? ' (' + [rep.gaps ? plural(rep.gaps, 'gap') + ' closed' : '', rep.merged ? plural(rep.merged, 'duplicate') + ' merged' : '', rep.removed ? plural(rep.removed, 'tiny entity', 'tiny entities') + ' removed' : ''].filter(Boolean).join(', ') + ')' : '') + '.' +
          (wide.length ? ' ' + plural(wide.length, 'gap') + ' left open (' + (wide.length === 1 ? '' : 'largest ') + UI.fmtNum(Math.max.apply(null, built.openGaps), 4) + ' ' + pu + '): ' + (v.repair ? 'raise Close gaps up to' : 'turn on Repair after import') + ' to close ' + (wide.length === 1 ? 'it' : 'them') + '.' : '') +
          (parsed.skippedNote ? ' ' + esc(parsed.skippedNote.charAt(0).toUpperCase() + parsed.skippedNote.slice(1)) + '.' : '') +
          (parsed.warnings.length ? '<br>' + parsed.warnings.map(esc).join('<br>') : '');
        UI.renderPM();
      }
    }
    try { build(); } catch (e) { built = null; }
    var nJoints = built ? jointCount(built.entities) : 0;
    v.rels = opts.relations != null ? !!opts.relations : nJoints <= MAX_AUTO_RELS;
    // lane dwgin: units the file only implies ($INSUNITS 0, $MEASUREMENT 0 / 1) say so
    var fileUnits = parsed.units ? UNIT_TEXT[parsed.units] + (parsed.unitsFrom === 'MEASUREMENT' ? ' (assumed: no $INSUNITS, $MEASUREMENT ' + (parsed.units === 'in' ? '0' : '1') + ')' : '') : 'Not set (taken as ' + UNIT_TEXT[pu].toLowerCase() + ')';
    var spec = null;
    spec = {
      title: 'DXF/DWG Import', icon: 'importDxf', values: v, noFocus: true,
      message: '',
      groups: [
        { title: 'Units', fields: [
          { type: 'static', label: 'File units', value: fileUnits },
          { type: 'select', label: 'Import as', key: 'units', rerender: true, options: [['file', 'As in file'], ['in', 'Inches'], ['mm', 'Millimeters']] },
          { type: 'static', label: 'Scale into the part', value: function () { return '× ' + UI.fmtNum(conv(srcUnits(), pu), 6) + ' (' + UNIT_TEXT[srcUnits()].toLowerCase() + ' → ' + UNIT_TEXT[pu].toLowerCase() + ')'; } }
        ] },
        { title: 'Layers', fields: layerFields() },
        { title: 'Position', fields: [
          { type: 'radio', key: 'origin', options: [['file', 'As in file'], ['lowerleft', 'Lower-left corner at the origin'], ['center', 'Center on the origin']] },
          { type: 'number', label: 'X offset', key: 'dx', unit: 'u' },
          { type: 'number', label: 'Y offset', key: 'dy', unit: 'u' },
          { type: 'number', label: 'Rotation', key: 'rot', unit: '°' }
        ] },
        { title: 'Options', fields: [
          { type: 'number', label: 'Merge points closer than', key: 'tol', unit: 'u', min: 0 },
          { type: 'check', label: 'Repair after import', key: 'repair' },
          { type: 'number', label: 'Close gaps up to', key: 'gap', unit: 'u', min: 0, show: function () { return !!v.repair; } },
          { type: 'check', label: 'Add Coincident relations', key: 'rels' },
          { type: 'check', label: 'Import blocks as blocks', key: 'blocks', show: function () { return hasBlocks; } },
          { type: 'html', show: function () { return nJoints > MAX_AUTO_RELS; }, html: '<div class="pm-note">' + nJoints + ' joints: with that many relations the sketch solves slowly, so they start off. The ends are snapped together either way.</div>' }
        ] }
      ],
      onChange: function (x, key) {
        // AZ: blocks on / off reads the file the other way; the layers keep their on / off by name
        if (key === 'blocks' && hasBlocks) {
          var was = {};
          parsed.layers.forEach(function (l, i) { was[l.name] = v['L' + i]; });
          if (!v.blocks && !parsedX) parsedX = DxfImport.parse(text);
          if (v.blocks && !parsedB) parsedB = DxfImport.parse(text, { blocks: true });
          parsed = v.blocks ? parsedB : parsedX;
          Object.keys(v).forEach(function (k) { if (/^L\d+$/.test(k)) delete v[k]; });
          parsed.layers.forEach(function (l, i) { v['L' + i] = was[l.name] != null ? was[l.name] : layerOn(l); });
          spec.groups[1].fields = layerFields();
        }
        preview();
      },
      okBlocked: function () { return built && built.entities.length ? '' : 'Turn on a layer with geometry to import.'; },
      onOK: function () {
        var geo = build().entities;
        if (!geo.length) { UI.toast('Nothing to import: every layer is off.'); return false; }
        var n0 = 0, nRel = 0, nIns = Object.keys(blockIds(geo)).length;
        var r = undoStep(function () {
          var g = UI.activeSketchFeature() || f;
          n0 = g.entities.length;
          if (nIns) adoptImported(g, geo);
          geo.forEach(function (e) { g.entities.push(e); });
          addLayers(g, geo);
          if (v.rels) nRel = addJoints(g, plainJoints(geo), n0);
          if (nIns && K.adoptBlocks) K.adoptBlocks(g);
          if (S && S.clean) S.clean(g);
          return { ok: true };
        });
        if (!r.ok) { UI.toast(r.error || 'Import failed.'); return false; }
        clearPreview(); changed();
        frame(DxfImport.bounds(geo));
        var g2 = UI.activeSketchFeature() || f, chk = DxfImport.check(g2.entities.slice(n0), gapTol(), { unit: UI.unitLabel() });
        var nTx = geo.filter(function (e) { return e.t === 'text' && e.blk == null; }).length;
        UI.setStatus('Imported ' + plural(geo.length, 'entity', 'entities') + ' from ' + name + ' (' + plural(nRel, 'Coincident relation') + (nTx ? ', ' + plural(nTx, 'text') : '') + (nIns ? ', ' + plural(nIns, 'block instance') : '') + '). ' +
          (parsed.skippedNote ? parsed.skippedNote.charAt(0).toUpperCase() + parsed.skippedNote.slice(1) + '. ' : '') +
          (chk.summary === 'No problems found' ? 'Check Sketch: no problems found.' : 'Check Sketch: ' + chk.summary + '.'));
      },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    };
    UI.openPM(spec);   // its onChange builds the first preview
    if (UI.finishViewAnimation) UI.finishViewAnimation();   // a new sketch turns the view to the Top Plane first
    frame(built && DxfImport.bounds(built.entities));
    if (opts.ok) UI.pmOK();
    return v;
  }
  function decode(data) {
    if (typeof data === 'string') return data;
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    // DXF before AutoCAD 2007 is ANSI (Windows-1252); later files are UTF-8
    var head = String.fromCharCode.apply(null, Array.prototype.slice.call(bytes, 0, Math.min(bytes.length, 4000)));
    var ver = /\$ACADVER\s*[\r\n]+\s*1\s*[\r\n]+\s*AC(\d{4})/.exec(head), enc = ver && +ver[1] < 1021 ? 'windows-1252' : 'utf-8';
    try { return new TextDecoder(enc).decode(bytes); } catch (e) { return new TextDecoder('utf-8').decode(bytes); }
  }
  // ------------------------------------------------------------------ DWG import
  // A DWG goes to the local server (serve.ps1: POST api/dwg2dxf, LibreDWG's dwg2dxf or the ODA File Converter) and its
  // DXF comes back into the DXF import above. The published static copy has no server API: it says so plainly.
  //   UI.dwgToDxf(name, data)       -> Promise of the DXF text; rejects with a message (e.noServer when there is no API)
  //   UI.openDWGFile(name, data)    File ▸ Open of a .dwg: as openDXFFile, after the conversion
  //   UI.importDWGData(name, data, opts?) Insert DXF / DWG of a .dwg: the import PM (opts as importDXFText); failures toast
  var DWG_NO_SERVER = 'DWG needs the local Anvil server; save the file as DXF or run Anvil from the desktop shortcut.';
  function isDwg(name) { return /\.dwg$/i.test(String(name || '')); }
  function dwgBytes(data) {
    if (data instanceof Uint8Array) return data;
    if (typeof data !== 'string') return new Uint8Array(data);
    var b = new Uint8Array(data.length);
    for (var i = 0; i < data.length; i++) b[i] = data.charCodeAt(i) & 255;
    return b;
  }
  function noServer() { var e = new Error(DWG_NO_SERVER); e.noServer = true; return e; }
  function dwgToDxf(name, data) {
    var file = String(name || 'Drawing.dwg').replace(/^.*[\\\/]/, ''), bytes = dwgBytes(data);
    // every DWG starts with its AutoCAD version, "AC1012" .. "AC1032"
    if (bytes.length < 6 || bytes[0] !== 65 || bytes[1] !== 67) return Promise.reject(new Error(file + ' is not a DWG file.'));
    if (typeof fetch !== 'function' || location.protocol === 'file:') return Promise.reject(noServer());
    return fetch('api/dwg2dxf', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: bytes }).then(function (r) {
      if (r.ok) return r.arrayBuffer().then(function (buf) {
        var text = decode(buf);
        // a static host that answers every path with a page is not the converter
        if (!/^\s*0\s*[\r\n]+\s*SECTION/i.test(text.slice(0, 2000)) && !/^\s*999/.test(text)) throw noServer();
        return text;
      });
      var json = /json/i.test(r.headers.get('Content-Type') || '');
      if (!json || r.status === 404 || r.status === 405 || r.status === 501) throw noServer();
      return r.json().then(function (j) {
        if (r.status === 503) throw new Error('No DWG converter on the local server: run anvil/vendor/get-libredwg.ps1, or install the free ODA File Converter, then open ' + file + ' again.');
        throw new Error('Could not convert ' + file + ': ' + ((j && j.error) || 'HTTP ' + r.status) + '.');
      }, function () { throw noServer(); });
    }, function () { throw noServer(); });
  }
  function openDWGFile(name, data) {
    UI.setStatus('Converting ' + String(name || '').replace(/^.*[\\\/]/, '') + ' to DXF…');
    return dwgToDxf(name, data).then(function (text) { return openDXFFile(name, text); });
  }
  function importDWGData(name, data, opts) {
    if (isAsm()) { UI.toast('DWG files are imported into a part sketch: open a part first.'); return Promise.resolve(null); }
    UI.setStatus('Converting ' + String(name || '').replace(/^.*[\\\/]/, '') + ' to DXF…');
    return dwgToDxf(name, data).then(function (text) {
      var o = {}, k;
      for (k in (opts || {})) o[k] = opts[k];
      o.name = name;
      return importDXFText(text, o);
    }, function (e) { UI.toast(e.message); UI.setStatus('DWG: ' + e.message); return null; });
  }
  // Insert DXF / DWG (Sketch tab, File ▸ Import DXF / DWG into Sketch…, Tools ▸ Sketch Tools)
  function cmdInsertDXF() {
    if (isAsm()) { UI.toast('DXF and DWG files are imported into a part sketch: open a part first.'); return; }
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.dxf,.dwg'; inp.style.display = 'none';
    inp.addEventListener('change', function () {
      var file = inp.files && inp.files[0];
      inp.remove();
      if (!file) return;
      var rd = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = function () { rej(fr.error); }; fr.readAsArrayBuffer(file); });
      rd.then(function (buf) {
        if (isDwg(file.name)) importDWGData(file.name, buf);
        else importDXFText(decode(buf), { name: file.name });
      }, function (e) { UI.toast('Could not read ' + file.name + ': ' + (e && e.message || e)); });
    });
    document.body.appendChild(inp);
    inp.click();
  }
  // File ▸ Open of a .dxf: a new part named after the file with the DXF in Sketch1 on the Top Plane
  function openDXFFile(name, data) {
    var text = decode(data), base = String(name || 'Drawing').replace(/^.*[\\\/]/, '').replace(/\.[^.]+$/, '') || 'Part1';
    var test;
    try { test = DxfImport.parse(text); } catch (e) { return Promise.reject(new Error('Could not read ' + name + ': ' + e.message)); }
    if (!test.entities.length) return Promise.reject(new Error(name + ' has no sketch geometry in model space.'));
    return window.anvil.newPart(base).then(function () {
      if (!importDXFText(text, { name: name })) throw new Error('Could not import ' + name + '.');
      return window.anvil.summary();
    });
  }

  // ------------------------------------------------------------------ Check Sketch for Feature
  // SolidWorks: Tools ▸ Sketch Tools ▸ Check Sketch for Feature. Read-only: the problems that keep a sketch from being
  // a clean profile (open endpoints, gaps with their size, endpoints shared by three or more entities, zero-length and
  // tiny entities, duplicates and overlaps, crossings), red markers in the graphics area, Previous / Next zoom to each.
  var issueClick = null;
  if ($('pm')) $('pm').addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-dxi]') : null;
    if (t && issueClick) issueClick(+t.getAttribute('data-dxi'));
  });
  function cmdCheckSketch() {
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.cancelTool) UI.cancelTool();
    var v = { tol: gapTol(), cur: -1 }, issues = [], spec = null;
    function run() {
      var g = UI.activeSketchFeature();
      if (g) f = g;
      issues = DxfImport.check(f.entities, +v.tol > 0 ? +v.tol : gapTol(), { unit: UI.unitLabel() });
      if (v.cur >= issues.length) v.cur = issues.length - 1;
      setMarks({ list: issues.map(function (x) { return { at: x.at, kind: 'issue' }; }), cur: v.cur });
      if (spec) {
        var cc = issues.contours || { open: 0, closed: 0 };
        spec.message = (issues.length ? esc(issues.summary) : 'No problems found: the sketch is good for a feature.') + '<br>' + plural(cc.closed, 'closed contour') + ', ' + plural(cc.open, 'open contour') + '.';
        spec.messageOk = !issues.length;
      }
    }
    function go(d) {
      if (!issues.length) return;
      v.cur = v.cur < 0 ? (d > 0 ? 0 : issues.length - 1) : (v.cur + d + issues.length) % issues.length;
      show();
    }
    function show() {
      var x = issues[v.cur];
      setMarks({ list: issues.map(function (y) { return { at: y.at, kind: 'issue' }; }), cur: v.cur });
      var b = DxfImport.bounds(f.entities), span = b ? Math.hypot(b[2] - b[0], b[3] - b[1]) : 1, w = Math.max((x.size || 0) * 60, span * 0.08);
      frame([x.at[0] - w / 2, x.at[1] - w / 2, x.at[0] + w / 2, x.at[1] + w / 2], w);
      UI.setStatus((v.cur + 1) + ' of ' + issues.length + ': ' + x.msg);
      UI.renderPM();
    }
    issueClick = function (i) { if (issues[i]) { v.cur = i; show(); } };
    function listHtml() {
      if (!issues.length) return '<div class="pm-note">Nothing to show.</div>';
      var rows = issues.slice(0, 200).map(function (x, i) {
        return '<div class="pm-row dxi-issue' + (i === v.cur ? ' sel' : '') + '" data-dxi="' + i + '" style="cursor:pointer;' + (i === v.cur ? 'font-weight:600;' : '') + '">' +
          '<span style="color:#d9453b">●</span>&nbsp;' + esc(x.msg) + '</div>';
      });
      if (issues.length > 200) rows.push('<div class="pm-note">… and ' + (issues.length - 200) + ' more</div>');
      return rows.join('');
    }
    spec = {
      title: 'Check Sketch for Feature', icon: 'checkSketch', values: v, noFocus: true, message: '',
      groups: [
        { title: 'Options', fields: [{ type: 'number', label: 'Gap tolerance', key: 'tol', unit: 'u', min: 0 }] },
        { title: 'Results', fields: [
          { type: 'buttons', buttons: [{ label: 'Previous', onclick: function () { go(-1); } }, { label: 'Next', onclick: function () { go(1); } }, { label: 'Repair Sketch…', onclick: function () { cmdRepairSketch(); } }] },
          { type: 'html', html: listHtml }
        ] }
      ],
      onChange: function () { run(); UI.renderPM(); },
      onOK: function () { },
      onClose: function () { issueClick = null; setMarks(null); }
    };
    UI.openPM(spec);   // its onChange runs the first check
    UI.setStatus(issues.length ? 'Check Sketch: ' + issues.summary + '. Next / Previous zoom to each problem.' : 'Check Sketch: no problems found.');
    return issues;
  }

  // ------------------------------------------------------------------ Repair Sketch
  // SolidWorks: Tools ▸ Sketch Tools ▸ Repair Sketch, with each repair as an option and the tolerance below which a
  // gap closes or an entity counts as tiny; the counts preview what ✓ will do (markers where), and ✓ applies them as
  // one undo step. No point moves more than the tolerance; relations and dimensions of the entities that survive
  // unchanged are kept (re-indexed), closed gaps get Coincident.
  function cmdRepairSketch() {
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.cancelTool) UI.cancelTool();
    var v = { tol: gapTol(), gaps: true, merge: true, join: true, tiny: true, split: false }, res = null;
    var F = {
      gaps: { type: 'check', label: 'Close gaps', key: 'gaps' },
      merge: { type: 'check', label: 'Merge overlapping / duplicate entities', key: 'merge' },
      join: { type: 'check', label: 'Join collinear lines and co-radial arcs', key: 'join' },
      tiny: { type: 'check', label: 'Remove zero-length / tiny entities (below tolerance)', key: 'tiny' },
      split: { type: 'check', label: 'Split at crossings', key: 'split' }
    };
    var LABELS = { gaps: 'Close gaps', merge: 'Merge overlapping / duplicate entities', join: 'Join collinear lines and co-radial arcs', tiny: 'Remove zero-length / tiny entities (below tolerance)', split: 'Split at crossings' };
    function opts() { return { tol: +v.tol > 0 ? +v.tol : gapTol(), closeGaps: !!v.gaps, merge: !!v.merge, join: !!v.join, removeTiny: !!v.tiny, split: !!v.split }; }
    function total(r) { return r.removed + r.merged + r.gaps + r.joined + r.split; }
    function run() {
      var g = UI.activeSketchFeature();
      if (g) f = g;
      res = DxfImport.repair(f.entities, opts());
      var r = res.report, cnt = { gaps: r.gaps, merge: r.merged, join: r.joined, tiny: r.removed, split: r.split };
      Object.keys(F).forEach(function (k) { F[k].label = LABELS[k] + (v[k] ? ' (' + cnt[k] + ')' : ''); });
      setMarks({ list: r.spots.map(function (s) { return { at: s.at, kind: 'fix' }; }), cur: -1 });
      spec.message = total(r) ? 'Repairs to make: ' + [r.gaps ? plural(r.gaps, 'gap') + ' closed' : '', r.merged ? plural(r.merged, 'duplicate / overlap', 'duplicates / overlaps') + ' merged' : '',
        r.joined ? plural(r.joined, 'join') : '', r.removed ? plural(r.removed, 'tiny entity', 'tiny entities') + ' removed' : '', r.split ? plural(r.split, 'split') : ''].filter(Boolean).join(', ') +
        '. Largest point move ' + UI.fmtNum(r.maxMove, 6) + ' ' + UI.unitLabel() + '.' : 'Nothing to repair at this tolerance.';
      spec.messageOk = !total(r);
    }
    var spec = {
      title: 'Repair Sketch', icon: 'repairSketch', values: v, noFocus: true, message: '',
      groups: [
        { title: 'Tolerance', fields: [{ type: 'number', label: 'Gap tolerance', key: 'tol', unit: 'u', min: 0 }] },
        { title: 'Options', fields: [F.gaps, F.merge, F.join, F.tiny, F.split] }
      ],
      onChange: function () { run(); UI.renderPM(); },
      okBlocked: function () { return res && total(res.report) ? '' : 'Nothing to repair at this tolerance.'; },
      onOK: function () {
        var out = null;
        var r = undoStep(function () {
          var g = UI.activeSketchFeature() || f, rr = DxfImport.repair(g.entities, opts());
          if (!total(rr.report)) return { ok: false, error: 'Nothing to repair at this tolerance.' };
          g.entities = rr.entities;
          remapSketch(g, rr.map, rr.changed);
          rr.nRel = addJoints(g, rr.report.joints, 0);
          if (S && S.clean) S.clean(g);
          out = rr;
          return { ok: true };
        });
        if (!r.ok) { UI.toast(r.error); return false; }
        changed();
        var rp = out.report;
        UI.setStatus('Repaired: ' + [plural(rp.gaps, 'gap') + ' closed', plural(rp.merged, 'duplicate') + ' merged', plural(rp.joined, 'join'), plural(rp.removed, 'tiny entity', 'tiny entities') + ' removed'].concat(rp.split ? [plural(rp.split, 'split')] : []).join(', ') + '.');
      },
      onClose: function () { setMarks(null); }
    };
    UI.openPM(spec);   // its onChange runs the first preview
    return res;
  }

  UI.cmdInsertDXF = cmdInsertDXF; UI.importDXFText = importDXFText; UI.openDXFFile = openDXFFile;
  UI.dwgToDxf = dwgToDxf; UI.openDWGFile = openDWGFile; UI.importDWGData = importDWGData;   // DWG import
  UI.cmdCheckSketch = cmdCheckSketch; UI.cmdRepairSketch = cmdRepairSketch;
})();
