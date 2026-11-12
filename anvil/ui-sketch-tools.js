// ui-sketch-tools.js — Sketch Fillet / Chamfer, Offset, Trim / Extend, Convert, Intersection Curve, Move / Copy / Rotate / Scale / Stretch, Linear / Circular Sketch Pattern, Dynamic Mirror: their SolidWorks PropertyManagers.
// Registers tool PMs in UI.sketchToolPMs[tool] (opened by setTool in ui-sketch.js); see README *Sketch tab*.
// These are commands (each opens its PropertyManager at once, with SolidWorks 2024's groups, fields, names and
// defaults); the geometry is SketchSolver's (sketch-solver.js: filletPair, chamferPair, offsetSelection,
// transformEntities, linearPattern, circularPattern, trimAt …), which is all or nothing: a tool that fails leaves the
// sketch exactly as it was, and its undo step is taken back.
(function () {
  'use strict';
  if (typeof UI === 'undefined') return;
  UI.sketchToolPMs = UI.sketchToolPMs || {};
  var App = UI.App, K = UI.K, $ = UI.$, S = window.SketchSolver;
  if (!S || !UI.openPM) return;

  // ------------------------------------------------------------------ shared helpers
  var PICK_STYLE = 'stroke:#ffd400;stroke-dasharray:6 4;stroke-width:3;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.75';
  var HOT_STYLE = 'stroke:#e8891c;stroke-width:2.5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  function sketch() { var f = UI.activeSketchFeature(); if (!f) UI.toast('Open a sketch first.'); return f; }
  // rfCY: fn run with the entities on a hidden layer of sketch f left out of Power trim's trail and Extend's targets
  // (SketchSolver.withSkip): what cannot be seen is neither trimmed by a drag nor extended to
  function unhidden(f, fn) {
    if (!S.withSkip || !UI.entityLayerHidden) return fn();
    var hid = f.entities.filter(function (e) { return e && UI.entityLayerHidden(f, e); });   // once per call (a Power trim move): no layer hidden, no cost
    return hid.length ? S.withSkip(function (e) { return hid.indexOf(e) >= 0; }, fn) : fn();
  }
  function toUV(mx, my) { return UI.screenToPlane(mx, my, UI.activePlane()); }
  function scr(q) { return UI.worldToScreen(K.to3D(UI.activePlane(), q[0], q[1])); }
  // sketch units per screen pixel at (mx, my)
  function pxWorld(mx, my) { var a = toUV(mx, my), b = toUV(mx + 1, my); return a && b ? Math.hypot(b[0] - a[0], b[1] - a[1]) : 1; }
  function entPts(e) { return K.entityPolylines(e).map(function (l) { return l.closed && l.pts.length ? l.pts.concat([l.pts[0]]) : l.pts; }); }
  function ring(p, px) { var s = scr(p), out = []; for (var k = 0; k <= 16; k++) { var a = k * Math.PI / 8, q = toUV(s[0] + px * Math.cos(a), s[1] + px * Math.sin(a)); if (q) out.push(q); } return out; }
  // the sketch entities selected (in the graphics area or the PropertyManager), in index order
  function selIdx(f) {
    var out = [];
    if (UI.selection) UI.selection().forEach(function (s) { if (s.kind === 'entity' && out.indexOf(s.index) < 0) out.push(s.index); });
    if (App.sel && App.sel.kind === 'entity' && out.indexOf(App.sel.index) < 0) out.push(App.sel.index);
    return out.filter(function (i) { return f.entities[i]; }).sort(function (a, b) { return a - b; });
  }
  var NAMES = { line: 'Line', circle: 'Circle', arc: 'Arc', rect: 'Rectangle', crect: 'Rectangle', poly: 'Polygon', slot: 'Slot', point: 'Point', polyline: 'Polyline' };
  function entityLabel(e, i) { return (e && e.sharp ? 'Sharp' : NAMES[e && e.t] || 'Entity') + (i + 1); }
  // One sketch action, one undo step: fn() returns { ok, error }; a failure takes the undo step back (the solver has
  // already put the sketch back). always: the step is pushed even inside one gesture (a PropertyManager's ✓).
  function step(fn, always) {
    var pushed = always || !App.sketchDirty;
    if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
    var r;
    try { r = fn(); } catch (e) { r = { ok: false, error: e.message }; }
    if (!r || !r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } }
    return r || { ok: false };
  }
  function changed() { App.sel = null; App.sel2 = null; App.gridStale = true; App.dimsStale = true; UI.updateSketches(); UI.refreshTree(); }
  function clearPreview() { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
  // A selection box of sketch entities (Entities to Mirror / Pattern / Move …): the selection when the command starts
  // plus what is clicked while it is open (a click toggles); a row's Delete takes it out.
  function entityBox(f, v, icon, onChange, opts) {
    opts = opts || {};
    return { type: 'pick', icon: icon, placeholder: opts.placeholder || 'Select sketch entities…',
      value: function (x) { return x.entities.length ? x.entities.length + ' entit' + (x.entities.length > 1 ? 'ies' : 'y') : ''; },
      active: opts.box ? function (x) { return x.box === 'entities'; } : undefined, onActivate: opts.box ? function () { opts.box('entities'); } : undefined,
      items: function (x) { return x.entities.map(function (i) { return { label: entityLabel(f.entities[i], i) }; }); },
      onRemove: function (x, i) { x.entities.splice(i, 1); if (UI.setSelection) UI.setSelection(x.entities.map(function (k) { return { kind: 'entity', index: k }; })); UI.renderPM(); onChange(); },
      onClear: function (x) { x.entities.length = 0; if (UI.setSelection) UI.setSelection([]); UI.renderPM(); onChange(); } };
  }
  function syncSelection(f, v, onChange) {
    return function () {
      if (v.box && v.box !== 'entities') return;
      var s = selIdx(f);
      if (s.join() === v.entities.join()) return;
      v.entities = s;
      UI.renderPM(); onChange();
    };
  }
  // the sketch point (an end, a centre, the origin) within 9 px of the cursor, else the point under it
  // sketch-refine: where the drawing tools would put it (UI.sketchInferPoint: sketch and model points, curves,
  // alignment, and a free point rounded to the roundest value under the cursor, 10 not 10.125), as SolidWorks infers
  // the From / To points
  function snapPoint(f, uv, mx, my) {
    if (UI.sketchInferPoint) { var inf = UI.sketchInferPoint(uv, mx, my); if (inf && inf.p) return inf.p.slice(); }
    var best = null, bd = 9;
    f.entities.forEach(function (e, i) { S.pointRefs(f, i).forEach(function (pr) { if (/\.mid$/.test(pr.ref)) return; var s = scr(pr.pt), d = Math.hypot(s[0] - mx, s[1] - my); if (d < bd) { bd = d; best = pr.pt; } }); });
    var o = scr([0, 0]);
    if (Math.hypot(o[0] - mx, o[1] - my) < bd) best = [0, 0];
    return best ? best.slice() : uv.slice();
  }
  function fmtPt(p) { return '(' + UI.fmtDim(p[0]) + ', ' + UI.fmtDim(p[1]) + ')'; }   // sketch-units: the document's dimension style

  // ------------------------------------------------------------------ Sketch Fillet / Sketch Chamfer
  // SolidWorks: Sketch tab ▸ Sketch Fillet (flyout: Sketch Chamfer). Pick a vertex (a corner where two lines / arcs
  // meet, a rectangle's, polygon's or polyline's corner) or two entities; the fillet (chamfer) is made at once and
  // listed in Entities to Fillet, where it stays live: a new Radius re-makes every one of them (rfCE). ✓ closes;
  // ✗ takes back every one made while the PropertyManager was open.
  function cornerTool(kind) {
    var f = sketch();
    if (!f) return;
    var chamfer = kind === 'chamfer';
    var v = chamfer ? { type: 'distance', equal: true, d1: UI.lenDefault(10), d2: UI.lenDefault(10), angle: 45, items: [] }
      : { r: UI.lenDefault(10), keepCorner: true, dimEach: false, chain: false, items: [] };
    var snap = snapOf(f), undo0 = App.undo.length, first = null, picked = null;
    // rfCE: the session's picks stay live while the PropertyManager is open (SolidWorks' Sketch Fillet): each one is
    // recorded as it was picked and listed in Entities to Fillet, and a new Radius (Distance, type, option) re-makes
    // every one of them at once from the sketch as the command found it (replay); the whole session is one undo step
    var specs = [];      // the picks in order: { k: 'corner' | 'rect' | 'pl' | 'pair' | 'sel', … , skip: [corner points left out] }
    var rows = [];       // the Entities to Fillet rows: { label, at, spec (index into specs; -1 while previewed) }
    var madeEnts = [];   // copies of the arcs (chamfer lines) made this session: the highlight
    var good = null;     // the values of the last successful make; a failed replay keeps the sketch at these
    var goodV = null;    // the same, per key (what a box goes back to while a new value is being typed)
    var typed = null;    // rfCE 2: a value typed but not yet committed, { key, value }: Enter, a spin, another box, a pick or leaving the box applies it
    var made = false;    // AZ: something was made while the PropertyManager was open (✗ takes it back)
    var root = document.getElementById('pm');
    function snapOf(g) { return JSON.stringify({ entities: g.entities, rels: g.rels || null, dims: g.dims || null }); }
    function restore(s) { var s0 = JSON.parse(s); f.entities = s0.entities; if (s0.rels) f.rels = s0.rels; else delete f.rels; if (s0.dims) f.dims = s0.dims; else delete f.dims; }
    function valuesNow() { return JSON.stringify(chamfer ? [v.type, !!v.equal, +v.d1, +v.d2, +v.angle] : [+v.r, v.keepCorner !== false, !!v.dimEach, !!v.chain]); }
    function valuesOf() { var o = {}; Object.keys(v).forEach(function (k) { if (k !== 'items') o[k] = v[k]; }); return o; }
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    function cornerTol(mx, my) { return 12 * pxWorld(mx, my); }
    function cornerTolAt(at) { return 1e-6 * Math.max(1, Math.abs(at[0]), Math.abs(at[1])); }
    // sketch-fillet2: what each tool takes as it is (lines; a fillet: arcs, circles and open splines too) and what is made
    // into lines (and arcs) first, as SolidWorks draws it: a rectangle, a polygon, a straight slot
    function direct(e) { return !!e && (e.t === 'line' || (!chamfer && (e.t === 'arc' || e.t === 'circle' || (e.t === 'spline' && !e.closed && e.pts.length > 1)))); }
    // (rfAF: an arc slot too, for a fillet: its outer / inner / end arcs, SketchSolver.explodeArcSlot through explodeSlot)
    function explodable(e) { return !!e && (e.t === 'rect' || e.t === 'crect' || e.t === 'poly' || e.t === 'slot' || (e.t === 'aslot' && !chamfer)); }
    // entity i made into its lines (and arcs): the indices of the block it became (later indices shift)
    function explodeBlock(i) {
      var e = f.entities[i], n0 = f.entities.length;
      if (e.t === 'rect' || e.t === 'crect') S.explodeRect(f, i); else if (e.t === 'poly') S.explodePoly(f, i); else if (e.t === 'slot' || e.t === 'aslot') { if (S.explodeSlot(f, i) < 0) return null; } else return null;
      var shift = f.entities.length - n0, out = [];
      for (var k = i; k <= i + shift; k++) out.push(k);
      if (first != null && first > i) first += shift;
      if (picked && picked.i > i) picked.i += shift;
      return { list: out, shift: shift };
    }
    function distTo(e, uv) {
      var best = Infinity;
      K.entityPolylines(e).forEach(function (l) {
        var pts = l.closed && l.pts.length ? l.pts.concat([l.pts[0]]) : l.pts;
        for (var k = 0; k + 1 < pts.length; k++) {
          var a = pts[k], b = pts[k + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((uv[0] - a[0]) * dx + (uv[1] - a[1]) * dy) / L2)) : 0;
          best = Math.min(best, Math.hypot(uv[0] - a[0] - t * dx, uv[1] - a[1] - t * dy));
        }
      });
      return best;
    }
    // the curve of a block the tool takes that lies nearest uv (not its construction geometry), other than `not`
    function nearestIn(list, uv, not) {
      var best = null, bd = Infinity;
      list.forEach(function (k) { var e = f.entities[k]; if (k === not || !direct(e) || e.construction) return; var d = distTo(e, uv); if (d < bd) { bd = d; best = k; } });
      return best;
    }
    // rfCL: a pick is recorded by where it was made, never by an entity index: the indices of the sketch as the pick
    // found it no longer hold once an earlier pick is dropped (its rectangle not made into lines, its polyline corner
    // not rounded), so every make re-finds the entity (the vertex) at the pick's point. The entity the tool takes (or
    // makes into lines first) nearest uv, within tol (the pick's tolerance in sketch units; none: the nearest), or null
    function entityAt(uv, tol) {
      var best = null, bd = tol == null ? Infinity : tol;
      f.entities.forEach(function (e, k) {
        if (!direct(e) && !explodable(e)) return;
        if (UI.entityLayerHidden && UI.entityLayerHidden(f, e)) return;
        var d = distTo(e, uv);
        if (d < bd) { bd = d; best = k; }
      });
      return best;
    }
    // a shape's vertex re-found at a pick's point: exactly there, but for the 1e-4 rounding of a rounded polyline
    function vertexTol(at) { return Math.max(1e-3, 10 * cornerTolAt(at)); }
    // two picks { i, uvi, j, uvj }: a rectangle, polygon or slot picked is made into lines first and the line (or arc)
    // picked in it is taken; null when that leaves nothing the tool takes
    function resolvePicks(spec) {
      var i = spec.i, j = spec.j;
      if (i === j) {
        var b0 = explodable(f.entities[i]) ? explodeBlock(i) : null;
        if (!b0) return null;
        var a0 = nearestIn(b0.list, spec.uvi), c0 = nearestIn(b0.list, spec.uvj, a0);
        return a0 != null && c0 != null ? { i: a0, uvi: spec.uvi, j: c0, uvj: spec.uvj } : null;
      }
      if (explodable(f.entities[i])) { var bi = explodeBlock(i); if (!bi) return null; if (j > i) j += bi.shift; i = nearestIn(bi.list, spec.uvi); if (i == null) return null; }
      if (explodable(f.entities[j])) { var bj = explodeBlock(j); if (!bj) return null; if (i > j) i += bj.shift; j = nearestIn(bj.list, spec.uvj); if (j == null) return null; }
      return { i: i, uvi: spec.uvi, j: j, uvj: spec.uvj };
    }
    function skipped(sp, at) { return (sp.skip || []).some(function (q) { return Math.hypot(q[0] - at[0], q[1] - at[1]) <= 10 * cornerTolAt(at); }); }
    function eqTo() { return !v.dimEach && first != null && f.entities[first] && f.entities[first].t === 'arc' ? first : null; }
    function vertexRow(at) { return { label: 'Vertex ' + fmtPt(at), at: at.slice() }; }
    function copyEnt(i) { var e = f.entities[i]; return e ? JSON.parse(JSON.stringify(e)) : null; }
    // one recorded pick made on f as it is (no undo step): { ok, error, rows: [{ label, at }], ents: [copies of the
    // arcs / chamfer lines it made] }. 'corner': a vertex of two curves (re-found at its point); 'rect': a rectangle's
    // or polygon's corner (the shape becomes lines first, as SolidWorks draws it); 'pl': a closed polyline's corner,
    // rounded in place; 'pair': two entities; 'sel': the entities selected when the command started (their corners)
    function runSpec(sp) {
      var o, r, rows1, spec, cs, k, sc;
      if (sp.k === 'pl') {
        // the polyline's vertex re-found at the pick's point (rfCL: its index moves once an earlier corner is rounded)
        sc = shapeCorner(sp.at, 'pl');
        if (!sc || sc.d > vertexTol(sp.at)) return { ok: false, error: 'No corner there.' };
        var e = sc.e, ei = sc.ei, pi = sc.pi, pts = e.pts, out = pts.slice(), ats = [];
        // sketch-tools2: Fillet all corners of the chain: every corner, from the last to the first so the indices still to do do not move
        if (v.chain || sp.chain) { for (k = pts.length - 1; k >= 0; k--) { if (skipped(sp, pts[k])) continue; out = K.filletPolyline(out, k, +v.r); ats.unshift(pts[k]); } }
        else { out = K.filletPolyline(pts, pi, +v.r); ats = [pts[pi]]; }
        f.entities[ei] = { t: 'polyline', pts: out.map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true };
        if (e.construction) f.entities[ei].construction = true;
        if (e.layer != null) f.entities[ei].layer = e.layer;   // rfCY: the rounded outline stays on its layer
        S.clean(f);
        return { ok: true, rows: ats.map(vertexRow), ents: [] };
      }
      if (sp.k === 'sel') {
        var list = [];
        sp.all.slice().sort(function (a, b) { return b - a; }).forEach(function (i) {
          if (!explodable(f.entities[i])) { list.push(i); return; }
          var b = explodeBlock(i);
          if (!b) return;
          list = list.map(function (q) { return q > i ? q + b.shift : q; }).concat(b.list);
        });
        cs = S.selectionCorners(f, list).filter(function (c) { return !skipped(sp, c.at); });
        if (!cs.length) return { ok: false, rows: [], error: 'The selected entities meet at no corner: select entities that share end points, or pick a vertex.' };
        rows1 = cs.map(function (c) { return vertexRow(c.at); });
        return finish(S.filletCorners(f, cs.map(function (c) { return c.at; }), +v.r, { keepCorner: v.keepCorner !== false, dimEach: !!v.dimEach, equalTo: eqTo() }), rows1);
      }
      if (sp.k === 'pair') {
        rows1 = [{ label: sp.label, at: null }];
        // the two entities re-found at the picks' points (rfCL); a preselected pair (always the first pick, made on the
        // sketch as the command found it, no tol) keeps its indices
        var i = sp.i, j = sp.j;
        if (sp.tol != null) { i = entityAt(sp.uvi, sp.tol); j = i == null ? null : entityAt(sp.uvj, sp.tol); }
        spec = i == null || j == null ? null : resolvePicks({ i: i, uvi: sp.uvi, j: j, uvj: sp.uvj });
        if (!spec) return { ok: false, rows: rows1, error: chamfer ? 'Pick two lines (or two sides of a rectangle or polygon).' : 'Pick two lines, arcs or circles (or a spline and a line or arc).' };
      } else {
        // 'rect': the rectangle's (polygon's) vertex at sp.at, re-found (rfCL), becomes lines first; 'corner': a corner
        // of curves at sp.at, else a shape's vertex there made into lines (the corner was picked on lines a pick since
        // dropped had made of it)
        spec = sp.k === 'rect' ? null : S.curveCorner(f, sp.at, cornerTolAt(sp.at));
        if (!spec) {
          sc = shapeCorner(sp.at, 'shape');
          if (sc && sc.d <= vertexTol(sp.at)) explodeBlock(sc.ei);
          spec = S.curveCorner(f, sp.at, cornerTolAt(sp.at));
        }
        if (!spec) return { ok: false, error: 'No corner there.' };
        rows1 = [vertexRow(spec.at)];
      }
      if (chamfer) return finish(S.chamferPair(f, spec, { type: v.type, d1: +v.d1, d2: +v.d2, angle: +v.angle, equal: !!v.equal }), rows1);
      o = { keepCorner: v.keepCorner !== false };
      var eq = eqTo();
      if (eq != null) { o.equalTo = eq; o.dimension = false; }
      // sketch-tools2: Fillet all corners of the chain — a vertex rounds every corner of its chain of lines / arcs
      if ((v.chain || sp.chain) && spec.ei) {   // (rfCY: sp.chain, a chain picked by a double-click on one of its entities)
        cs = S.chainCorners(f, spec).filter(function (c) { return !skipped(sp, c.at); });
        if (!cs.length) return { ok: false, error: 'No corner there.' };
        return finish(S.filletCorners(f, cs.map(function (c) { return c.at; }), +v.r, { keepCorner: o.keepCorner, dimEach: !!v.dimEach, equalTo: eq }), cs.map(function (c) { return vertexRow(c.at); }));
      }
      return finish(S.filletPair(f, spec, +v.r, o), rows1);
    }
    // a solver result with its rows: `first` (the arc later fillets are Equal to) and the copies for the highlight
    function finish(r, rows1) {
      if (!r || !r.ok) return { ok: false, error: r && r.error, rows: rows1 };
      var made1 = r.arcs || [chamfer ? r.line : r.arc];
      made1.forEach(layerMade);   // rfCY: the fillet arc (chamfer line) on the layer of the entities it joins
      if (r.sharp != null && r.sharp >= 0 && f.entities[r.sharp] && f.entities[r.sharp].layer == null && made1[0] != null && f.entities[made1[0]] && f.entities[made1[0]].layer != null) f.entities[r.sharp].layer = f.entities[made1[0]].layer;
      if (!chamfer && first == null && made1[0] != null) first = made1[0];
      return { ok: true, rows: rows1, ents: made1.map(copyEnt).filter(Boolean) };
    }
    // rfCY: made entity k takes the layer of the entities its ends are Coincident with, when they all share one (a
    // fillet on a CUT outline stays on CUT, as the trimmed pieces do); entities on different layers leave it as made
    function layerMade(k) {
      var e = f.entities[k];
      if (!e || e.layer != null) return;
      var re = new RegExp('^' + k + '\\.p[12]$'), lay = {};
      (f.rels || []).forEach(function (rel) {
        if (rel.type !== 'coincident' || !(rel.refs || []).some(function (q) { return re.test(q); })) return;
        rel.refs.forEach(function (q) { var j = parseInt(q, 10), o = f.entities[j]; if (isNaN(j) || j === k || !o) return; lay[o.layer == null ? '' : String(o.layer)] = 1; });
      });
      var ks = Object.keys(lay);
      if (ks.length === 1 && ks[0] !== '') e.layer = ks[0];
    }
    // every recorded pick made in order on f as it is: { ok, rows, ents, error }
    function runAll() {
      var rows2 = [], ents2 = [];
      for (var k = 0; k < specs.length; k++) {
        var r;
        try { r = runSpec(specs[k]); } catch (e) { r = { ok: false, error: e.message }; }
        if (!r.ok) return { ok: false, error: r.error || 'The ' + (chamfer ? 'chamfer' : 'fillet') + ' could not be made.' };
        r.rows.forEach(function (q) { q.spec = k; rows2.push(q); });
        ents2 = ents2.concat(r.ents);
      }
      return { ok: true, rows: rows2, ents: ents2 };
    }
    function sizeText() { return chamfer ? 'Chamfer ' + UI.fmtLen(+v.d1) + (v.type === 'angle' ? ' × ' + UI.fmtNum(+v.angle, 2) + '°' : v.equal ? '' : ' × ' + UI.fmtLen(+v.d2)) : 'Fillet R' + UI.fmtLen(+v.r); }   // sketch-units
    function sayMade(n, re) { UI.setStatus(sizeText() + (re ? ' re-made' : ' made') + (n > 1 ? ' at ' + n + ' corners' : '') + '. Pick another vertex or two entities, or press ✓.'); }
    function listRows() { v.items = rows.map(function (q) { return q.label; }); }
    // the fillets (chamfers) of this session stay highlighted, in the selection colour, while the PropertyManager is open
    function showMade() { if (madeEnts.length) UI.sketchPreview([].concat.apply([], madeEnts.map(entPts)), PICK_STYLE, 'sk-fillet-made'); }
    function typing() { var ev = window.event; return !!(ev && ev.type === 'input' && ev.inputType); }   // a keystroke in a box (not Enter, a spin, a check box or a test's set value)
    function box(key) { return key ? document.querySelector('#pm input.pm-num[data-key="' + key + '"]') : null; }
    function markBad(key, msg) { var inp = box(key); if (inp) { inp.classList.add('expr-err'); inp.title = msg; } }
    // rfCE 2: Enter completes a typed value (user, 2026-10-13): a keystroke in Radius / Distance / Angle does not re-make
    // the fillets (no R1 flash on the way to 1/8); the value typed is kept aside and the box's value put back, so the
    // first Enter's commit (UI.pmEnter), a spin, a check box, a pick or leaving the box applies it (applyTyped). An
    // equation box stays live: its value is applied as it is typed, in every PropertyManager.
    function noteTyped(key) {
      typed = { key: key, value: v[key] };
      v[key] = goodV[key];
      var val = +typed.value, txt = key === 'angle' ? UI.fmtNum(val, 2) + '°' : (key === 'r' ? 'R' : '') + UI.fmtLen(val);
      UI.setStatus('Press Enter to apply ' + txt + '.');
    }
    // the value typed applied and the fillets re-made; false when it is refused (the sketch stays at the good values)
    function applyTyped() {
      if (!typed) return true;
      var k = typed.key, val = typed.value;
      typed = null;
      if (val === v[k]) return true;
      v[k] = val;
      if (!replay(k)) return false;
      var inp = box(k);   // the entry is committed: the next Enter in the box is ✓ (UI.pmArm, the two-Enter rule)
      if (inp && UI.pmArm) UI.pmArm(inp);
      return true;
    }
    // a re-render from inside a value box's keydown (Enter's commit, a spin) waits for the key to be through: the box
    // must stay in the document for the key handlers after this one (ui-app.js leaves a connected box its Enter)
    function rerender() {
      var ev = window.event;
      if (ev && ev.type === 'keydown' && ev.target && ev.target.tagName === 'INPUT') setTimeout(function () { if (UI.hasPM()) UI.renderPM(); }, 0);
      else UI.renderPM();
    }
    function onBlur(e) {   // the box left with a typed value: applied once the click that took the focus is through
      var t = e.target;
      if (!typed || !t || !t.getAttribute || t.getAttribute('data-key') !== typed.key) return;
      setTimeout(function () { if (typed && UI.hasPM() && t.isConnected && document.activeElement !== t) applyTyped(); }, 0);
    }
    // a pick (or the previewed selection on ✓) made on the sketch as it is and recorded; null, the sketch untouched,
    // when it cannot be. The first one pushes the session's one undo step: the sketch as the command found it.
    function pick(sp) {
      fresh();
      // rfCL: a value refused since the last make (the box marked bad) must fit now, or be put right, before another
      // corner is added: every pick follows the one committed value, as ✓ waits for a good one
      if (specs.length && good != null && valuesNow() !== good && !replay()) return null;
      var back = snapOf(f), first0 = first, fresh0 = !specs.length, r;
      if (fresh0) { App.undo.length = Math.min(App.undo.length, undo0); UI.pushUndo(); }
      App.sketchDirty = true;
      try { r = runSpec(sp); } catch (e) { r = { ok: false, error: e.message }; }
      if (!r.ok) {
        restore(back); first = first0;
        if (fresh0) { App.undo.length = Math.min(App.undo.length, undo0); App.sketchDirty = false; }
        UI.toast(r.error || 'The ' + (chamfer ? 'chamfer' : 'fillet') + ' could not be made.'); UI.updateSketches();
        return null;
      }
      specs.push(sp);
      r.rows.forEach(function (q) { q.spec = specs.length - 1; rows.push(q); });
      madeEnts = madeEnts.concat(r.ents);
      made = true; good = valuesNow(); goodV = valuesOf();
      listRows(); changed(); UI.renderPM(); UI.sketchFeedbackClear(); showMade();
      return r;
    }
    // rfCE: a changed value (Radius, Distance, type, an option): every recorded pick re-made at once from the sketch
    // as the command found it, with the values as they are now (still the one undo step). A pick that no longer fits
    // (a radius too large for one corner) keeps the sketch at the last good values, says why in the status line (a
    // toast too, unless the value is still being typed) and marks the box bad; ✓ waits until it is fixed.
    function replay(key) {
      fresh();
      if (!specs.length) return true;
      var back = snapOf(f), first0 = first, picked0 = picked ? picked.i : null, r;
      restore(snap); first = null;
      r = runAll();
      if (!r.ok) {
        restore(back); first = first0;
        if (picked) picked.i = picked0;   // (explodeBlock moved it while the picks were re-made)
        UI.updateSketches(); UI.setStatus(r.error);
        if (!typing()) UI.toast(r.error);
        markBad(key, r.error);
        return false;
      }
      // rfCL: the first entity picked (of two) stays picked across a value change, re-found at its point in the re-made sketch
      if (picked) { var pi = entityAt(picked.uv, picked.tol); if (pi == null) picked = null; else picked.i = pi; }
      rows = r.rows; madeEnts = r.ents; good = valuesNow(); goodV = valuesOf();
      App.sketchDirty = true;
      listRows(); changed(); rerender(); UI.sketchFeedbackClear(); showMade();
      sayMade(rows.length, true);
      return true;
    }
    // every pick dropped: the sketch as the command found it, the undo step taken back, the PropertyManager waits for picks
    function reset() {
      fresh(); restore(snap);
      App.undo.length = Math.min(App.undo.length, undo0); App.sketchDirty = false;
      specs = []; rows = []; madeEnts = []; first = null; picked = null; made = false; good = null; goodV = null; typed = null;
      listRows(); changed(); UI.renderPM(); UI.sketchFeedbackClear();
    }
    // a row's Delete (or right-click ▸ Delete): that corner leaves the set and the rest are re-made; a previewed
    // selection's corner leaves the preview
    function dropRow(i) {
      var row = rows[i];
      if (!row) return;
      if (pending) {
        if (pending.all && row.at && rows.length > 1) { pending.skip = (pending.skip || []).concat([row.at]); previewPending(); }
        else dropAll();
        return;
      }
      var sp = specs[row.spec], siblings = rows.filter(function (q) { return q.spec === row.spec; }).length, undoIt;
      if (sp.skip && row.at && siblings > 1) { sp.skip.push(row.at); undoIt = function () { sp.skip.pop(); }; }
      else { specs.splice(row.spec, 1); undoIt = function () { specs.splice(row.spec, 0, sp); }; }
      if (!specs.length) { reset(); UI.setStatus('Nothing left to ' + (chamfer ? 'chamfer' : 'fillet') + ': pick a vertex or two entities.'); return; }
      picked = null;   // (the set of picks changes: a first entity picked is dropped with it)
      if (!replay()) undoIt();
    }
    function dropAll() {
      if (pending) { pending = null; rows = []; listRows(); App.tempEntities = []; UI.updateTemp(); UI.renderPM(); UI.setStatus('Pick a vertex or two entities.'); return; }
      if (specs.length) { reset(); UI.setStatus('Nothing left to ' + (chamfer ? 'chamfer' : 'fillet') + ': pick a vertex or two entities.'); }
    }
    // the nearest vertex of a rectangle, polygon or closed polyline: { e, ei, pts, pi, d }; only: 'shape' (a rectangle
    // or polygon, made into lines to be filleted) or 'pl' (a closed polyline, rounded in place)
    function shapeCorner(uv, only) {
      var best = null;
      f.entities.forEach(function (e, ei) {
        var pl = e.t === 'polyline' && !!e.closed, shape = e.t === 'rect' || e.t === 'crect' || e.t === 'poly';
        if (!(pl || shape) || (only === 'pl' && !pl) || (only === 'shape' && !shape)) return;
        var pts = e.t === 'polyline' ? e.pts : K.entityPolylines(e)[0].pts;
        pts.forEach(function (p, pi) { var d = Math.hypot(p[0] - uv[0], p[1] - uv[1]); if (!best || d < best.d) best = { e: e, ei: ei, pts: pts, pi: pi, d: d }; });
      });
      return best;
    }
    function pickDone(r) { if (r) sayMade(r.rows.length); }
    var chainAt = null, vp = document.getElementById('viewport');   // rfCY: where the last chain was picked; the viewport (double-clicks)
    // rfCY: Fillet Chain from an entity (SolidWorks: Sketch Fillet with the chain option, or a double-click on one entity
    // of a chain): the pick that rounds every corner of the chain entity i is part of, recorded by a corner's point (a
    // corner at one of its ends; a rectangle's or polygon's first vertex; a closed polyline's first vertex), or null
    // when the entity meets nothing at a corner. sp.chain makes it a chain pick whatever the check box says.
    function chainPick(i) {
      var e = f.entities[i];
      if (!e || e.construction) return null;
      if (e.t === 'rect' || e.t === 'crect' || e.t === 'poly') return { k: 'rect', at: K.entityPolylines(e)[0].pts[0].slice(), skip: [], chain: true };
      if (e.t === 'polyline' && e.closed && e.pts.length > 2) return { k: 'pl', at: e.pts[0].slice(), skip: [], chain: true };
      if (!direct(e) || !K.entityEnds) return null;
      var ends = K.entityEnds(e);
      for (var q = 0; q < ends.length; q++) {
        var c = S.curveCorner(f, ends[q], cornerTolAt(ends[q]));
        if (c && (c.i === i || c.j === i)) return { k: 'corner', at: c.at.slice(), skip: [], chain: true };
      }
      return null;
    }
    // the corners chain pick sp would round, for the hover rings (sp as chainPick made it)
    function chainRings(sp) {
      if (sp.k === 'corner') { var c = S.curveCorner(f, sp.at, cornerTolAt(sp.at)); return c ? S.chainCorners(f, c).map(function (k) { return k.at; }) : []; }
      var sc = shapeCorner(sp.at, sp.k === 'pl' ? 'pl' : 'shape');
      return sc ? sc.pts.slice() : [];
    }
    // rfCY: a double-click on an entity rounds every corner of its chain (the check box need not be on): the two clicks
    // before it picked the entity (the first of a pair), which the chain pick replaces
    function onDbl(ev) {
      if (chamfer || App.mode !== 'sketch' || !UI.hasPM() || !vp || !vp.contains(ev.target)) return;
      if (v.chain) { picked = null; return; }   // the first click took the chain already
      var r0 = vp.getBoundingClientRect(), mx = ev.clientX - r0.left, my = ev.clientY - r0.top;
      fresh();
      var hit = UI.pickEntity(mx, my);
      if (!hit || !f.entities[hit.index]) return;
      var cp = chainPick(hit.index);
      if (!cp) { UI.setStatus('That entity meets no other at a corner: there is no chain to fillet.'); return; }
      picked = null;
      pickDone(pick(cp));
    }
    function click(uv, mx, my) {
      if (pending && !commitPending()) return;   // AZ: the previewed selection is made first, then the pick
      if (!applyTyped()) return;   // rfCE 2: a value typed in a box is committed by the pick (as leaving the box does); refused: no pick
      fresh();
      var tol = cornerTol(mx, my), c = S.curveCorner(f, uv, tol), cd = c ? Math.hypot(c.at[0] - uv[0], c.at[1] - uv[1]) : Infinity, sc = shapeCorner(uv);
      if (chamfer && c && (f.entities[c.i].t !== 'line' || f.entities[c.j].t !== 'line')) { c = null; cd = Infinity; }
      if (sc && sc.d <= tol && sc.d < cd) {
        var at = sc.pts[sc.pi].slice();
        // a rectangle's corner: the rectangle becomes four lines first (as SolidWorks draws it); sketch-fillet2: a
        // polygon's corner the same (still a regular polygon), rounded (chamfered) with its relations and the radius dimension
        if (sc.e.t === 'rect' || sc.e.t === 'crect' || sc.e.t === 'poly') { picked = null; pickDone(pick({ k: 'rect', at: at, skip: [] })); return; }
        if (chamfer) { UI.toast('Sketch Chamfer works on lines: a polyline\'s corner cannot be chamfered.'); return; }
        // a closed polyline's corner: the outline is rounded in place (it stays one entity); rfCL: recorded by its point
        pickDone(pick({ k: 'pl', at: at, skip: [] }));
        return;
      }
      if (c) { picked = null; pickDone(pick({ k: 'corner', at: c.at.slice(), skip: [] })); return; }
      // two entities picked one after the other (two sides of one rectangle, polygon or slot too)
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (!e || !(direct(e) || explodable(e))) { UI.setStatus(chamfer ? 'Pick a corner, or two lines.' : 'Pick a corner, or two sketch entities: lines, arcs, circles, or a spline and a line or arc.'); return; }
      // rfCY: Fillet all corners of the chain with an entity picked (not a vertex): every corner of its chain at once
      if (!chamfer && v.chain && !picked) {
        if (chainAt && Math.hypot(uv[0] - chainAt[0], uv[1] - chainAt[1]) <= tol / 3) return;   // a double-click's second click: the first took the chain
        var cp = chainPick(hit.index);
        if (cp) { if (pick(cp)) { chainAt = uv.slice(); sayMade(rows.length); } return; }
      }
      // rfCY: the second click of a double-click on the entity just picked is no second pick (the double-click takes its chain)
      if (picked && picked.i === hit.index && Math.hypot(uv[0] - picked.uv[0], uv[1] - picked.uv[1]) <= tol / 3) return;
      if (!picked || (picked.i === hit.index && !explodable(e))) { picked = { i: hit.index, uv: uv, tol: tol }; UI.sketchFeedbackClear(); showMade(); UI.sketchPreview(entPts(e), PICK_STYLE, 'sk-trim-pick'); UI.setStatus('Pick the second entity.'); return; }
      // (rfCL: i and j name the entities for the label; the make re-finds them at uvi / uvj within tol)
      var sp = { k: 'pair', i: picked.i, uvi: picked.uv, j: hit.index, uvj: uv, tol: Math.max(picked.tol || 0, tol), label: entityLabel(f.entities[picked.i], picked.i) + ', ' + entityLabel(e, hit.index) };
      picked = null;
      pickDone(pick(sp));
    }
    function hover(uv, mx, my) {
      fresh();
      UI.sketchFeedbackClear();
      showMade();
      if (picked && f.entities[picked.i]) UI.sketchPreview(entPts(f.entities[picked.i]), PICK_STYLE, 'sk-trim-pick');
      var tol = cornerTol(mx, my), c = S.curveCorner(f, uv, tol), sc = shapeCorner(uv);
      if (c) { UI.sketchPreview((!chamfer && v.chain ? S.chainCorners(f, c) : [c]).map(function (k) { return ring(k.at, 7); }), HOT_STYLE, 'sk-trim-end'); return; }
      if (sc && sc.d <= tol) { UI.sketchPreview([ring(sc.pts[sc.pi], 7)], HOT_STYLE, 'sk-trim-end'); return; }
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (e && (direct(e) || explodable(e))) UI.sketchPreview(entPts(e), HOT_STYLE, 'sk-trim-span');
      // rfCY: with the chain option an entity shows the corners its pick rounds
      var cpH = e && !chamfer && v.chain && !picked ? chainPick(hit.index) : null;
      if (cpH) UI.sketchPreview(chainRings(cpH).map(function (p) { return ring(p, 7); }), HOT_STYLE, 'sk-trim-end');
    }
    var groups = [{ title: chamfer ? 'Entities to Chamfer' : 'Entities to Fillet', fields: [{ type: 'pick', icon: chamfer ? 'skChamfer' : 'fillet', placeholder: 'Select sketch vertices or entities…', value: function (x) { return x.items.length ? x.items.length + (chamfer ? ' chamfer' : ' fillet') + (x.items.length > 1 ? 's' : '') : ''; }, items: function (x) { return x.items.map(function (t) { return { label: t }; }); },
      onRemove: function (x, i) { dropRow(i); }, onClear: function () { dropAll(); } }] }];
    if (chamfer) groups.push({ title: 'Chamfer Parameters', fields: [
      { type: 'radio', key: 'type', options: [['angle', 'Angle-distance'], ['distance', 'Distance-distance']], rerender: true },
      { type: 'check', label: 'Equal distance', key: 'equal', rerender: true, show: function (x) { return x.type === 'distance'; } },
      { type: 'number', label: 'Distance 1', key: 'd1', unit: 'u', min: 0 },
      { type: 'number', label: 'Direction 1 Angle', key: 'angle', unit: '°', min: 0, show: function (x) { return x.type === 'angle'; } },
      { type: 'number', label: 'Distance 2', key: 'd2', unit: 'u', min: 0, show: function (x) { return x.type === 'distance' && !x.equal; } }
    ] });
    else groups.push({ title: 'Fillet Parameters', fields: [
      { type: 'number', label: 'Radius', key: 'r', unit: 'u', min: 0 },
      { type: 'check', label: 'Keep constrained corners', key: 'keepCorner' },
      { type: 'check', label: 'Dimension each fillet', key: 'dimEach' },
      { type: 'check', label: 'Fillet all corners of the chain', key: 'chain' }
    ] });
    UI.openPM({
      title: chamfer ? 'Sketch Chamfer' : 'Sketch Fillet', icon: chamfer ? 'skChamfer' : 'skFillet', values: v,
      message: chamfer ? 'Select a sketch vertex or two sketch lines to chamfer.' : 'Select a sketch vertex or two sketch entities to fillet.',
      command: { ownHover: true, sketchFillet: true, onSketchPoint: click, onSketchMove: hover },
      groups: groups,
      onChange: function (x, key) {
        if (pending) { previewPending(); return; }
        if (!specs.length) return;
        var inp = box(key);
        if (typing() && inp && goodV && Object.prototype.hasOwnProperty.call(goodV, key) && !inp.classList.contains('expr')) { noteTyped(key); return; }
        if (typed) { if (typed.key !== key) v[typed.key] = typed.value; typed = null; }   // a value typed in another box goes in with this change
        if (valuesNow() !== good) replay(key);
      },
      onOK: function () {
        if (pending && !commitPending()) return false;
        if (!applyTyped()) return false;   // rfCE 2: ✓ commits a typed value first; refused: ✓ waits for a good one
        if (specs.length && good != null && valuesNow() !== good && !replay()) return false;   // a value still refused: ✓ waits for a good one
      },
      onCancel: function () {
        pending = null; App.tempEntities = []; UI.updateTemp();
        if (!made) return;   // AZ: a previewed selection never touched the sketch
        fresh(); restore(snap);
        if (App.undo.length > undo0) App.undo.length = undo0;
        changed();
      },
      onClose: function () { pending = null; typed = null; if (root) root.removeEventListener('focusout', onBlur); document.removeEventListener('dblclick', onDbl, true); App.tempEntities = []; UI.updateTemp(); UI.sketchFeedbackClear(); }
    });
    if (root) root.addEventListener('focusout', onBlur);
    if (!chamfer) document.addEventListener('dblclick', onDbl, true);   // rfCY (removed by onClose)
    // AZ: a selection when the command starts is previewed, not made, as SolidWorks does: several entities (a box over
    // a contour, a rectangle, a polygon, a slot; rfAX: every corner where they meet one another, one radius, Equal to
    // the first) or two entities (filleted / chamfered where they meet). Its corners are listed in Entities to Fillet
    // and the fillets drawn as a preview at the current radius; a change of a parameter redraws it, ✓ makes them (one
    // undo step), ✗ leaves the sketch untouched. A pick in the graphics area makes the previewed ones first.
    var pending = null;   // { all: [entity indices], skip } or { spec, label } (two entities)
    function pendingSpec() { return pending.all ? { k: 'sel', all: pending.all.slice(), skip: (pending.skip || []).slice() } : { k: 'pair', i: pending.spec.i, uvi: pending.spec.uvi, j: pending.spec.j, uvj: pending.spec.uvj, label: pending.label }; }
    function what(n) { return n + (chamfer ? ' chamfer' : ' fillet') + (n === 1 ? '' : 's') + (chamfer ? '' : ' R' + UI.fmtLen(+v.r)); }
    // the preview: the pending fillets made on a copy of the sketch, their arcs (chamfer lines) drawn as temporary geometry
    function previewPending() {
      var real = f, first0 = first, g = {}, r;
      Object.keys(real).forEach(function (k) { if (k !== 'pictures') g[k] = real[k]; });
      g = JSON.parse(JSON.stringify(g));
      f = g;
      try { r = runSpec(pendingSpec()); } catch (e) { r = { ok: false, error: e.message }; }
      f = real; first = first0;
      rows = (r.rows || []).map(function (q) { q.spec = -1; return q; });
      listRows();
      App.tempEntities = r.ok ? r.ents : [];
      UI.updateTemp();
      UI.renderPM();
      UI.setStatus(r.ok ? 'Preview: ' + what(r.ents.length) + '. ✓ makes ' + (r.ents.length === 1 ? 'it' : 'them') + ', ✗ leaves the sketch as it is.' : (r.error || 'Nothing to ' + (chamfer ? 'chamfer' : 'fillet') + ' at this size.'));
      return r;
    }
    // ✓ (or a pick): the pending fillets made and recorded, one undo step; false when they cannot be (the sketch is left as it was)
    function commitPending() {
      var sp = pendingSpec(), rows0 = rows;
      App.tempEntities = []; UI.updateTemp();
      rows = [];
      var r = pick(sp);
      if (!r) { rows = rows0; listRows(); return false; }
      pending = null;
      sayMade(r.rows.length);
      return true;
    }
    var all = selIdx(f).filter(function (i) { return f.entities[i]; }), pre = all.filter(function (i) { return direct(f.entities[i]); });
    if (!chamfer && all.length && (all.length > 2 || all.some(function (i) { return explodable(f.entities[i]); }))) pending = { all: all };
    else if (pre.length === 2) {
      var mid = function (e) {
        if (e.t === 'line') return [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2];
        if (e.t === 'spline') return e.pts[Math.floor(e.pts.length / 2)].slice();
        var am = e.t === 'circle' ? 90 : (e.a0 + e.a1) / 2;
        return [e.cx + e.r * Math.cos(am * Math.PI / 180), e.cy + e.r * Math.sin(am * Math.PI / 180)];
      };
      pending = { spec: { i: pre[0], uvi: mid(f.entities[pre[0]]), j: pre[1], uvj: mid(f.entities[pre[1]]) }, label: entityLabel(f.entities[pre[0]], pre[0]) + ', ' + entityLabel(f.entities[pre[1]], pre[1]) };
    }
    if (pending) {
      var r0 = previewPending();
      // a selection that meets at no corner: nothing to preview, the PropertyManager waits for picks
      if (!r0.ok && pending.all && !(r0.rows || []).length) { pending = null; rows = []; listRows(); UI.renderPM(); UI.toast(r0.error); }
    }
  }
  function cmdSketchFillet() { cornerTool('fillet'); }
  function cmdSketchChamfer() { cornerTool('chamfer'); }

  // ------------------------------------------------------------------ Offset Entities
  // SolidWorks: Sketch tab ▸ Offset Entities. Parameters: Offset distance, Add dimensions, Reverse, Select chain,
  // Bi-directional, Cap ends (Arcs / Lines), Construction geometry (Base geometry / Offset geometry). The selection is
  // offset (a click in the graphics area adds or removes an entity); the preview follows every change. Lines and arcs
  // joined end to end go as a chain with sharp corners, one Offset relation and one offset dimension. With nothing
  // selected in a sketch on a face, the face's outline is offset (as polylines).
  function cmdOffsetEntities() {
    var f = sketch();
    if (!f) return;
    var v = { entities: selIdx(f), d: UI.lenDefault(10), dims: true, reverse: false, chain: true, bi: false, cap: false, capType: 'arc', baseCons: false, offCons: false };
    function faceMode() { return !v.entities.length && f.faceLoops && f.faceLoops.length; }
    function opts(extra) { var o = { d: +v.d, reverse: !!v.reverse, chain: !!v.chain, bi: !!v.bi, cap: v.bi && v.cap ? v.capType : '', dims: !!v.dims, base: !!v.baseCons, offset: !!v.offCons }; if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
    function faceLoopsOffset() {
      return f.faceLoops.map(function (loop) {
        var isCcw = K.signedArea(loop) >= 0, sign = (v.reverse ? -1 : 1) * (isCcw ? 1 : -1);
        var e = { t: 'polyline', pts: K.offsetLoop(loop, sign * Math.abs(+v.d || 0)).map(function (p) { return [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]; }), closed: true };
        if (v.offCons) e.construction = true;
        return e;
      });
    }
    // sketchflow2: the face's edges come in as construction lines / arcs On Edge and the offset is made from them, so
    // it is one chain per loop held by an Offset relation and the offset dimension (as SolidWorks' Offset of a face:
    // fully defined, the distance editable), not a loose polyline. tgt: the sketch (or a copy for the preview).
    function faceOffsetOn(tgt, prev) {
      var fi = sketchFaceIndex(f);
      if (fi == null) return null;
      var geo = convertGeometry(edgeList([{ kind: 'face', index: fi }], { inner: true })), idx = [];
      if (!geo.length) return null;
      geo.forEach(function (g) {
        g.construction = true;
        tgt.entities.push(g);
        idx.push(tgt.entities.length - 1);
        if (!prev) { var ar = S.addRelation(tgt, 'onEdge', [String(tgt.entities.length - 1)]); if (!ar.ok) throw new Error(ar.error); if (g._src && UI.attachModelRef && ar.rels && ar.rels.length) UI.attachModelRef(tgt, ar.rels[0], g._src); }
      });
      return S.offsetSelection(tgt, idx, opts(prev ? { preview: true } : null));
    }
    function preview() {
      var ents = [];
      try {
        var fp = faceMode() ? faceOffsetOn({ entities: JSON.parse(JSON.stringify(f.entities)), rels: [] }, true) : null;
        if (fp && fp.ok) ents = fp.entities;
        else if (faceMode()) ents = faceLoopsOffset();
        else if (v.entities.length) { var r = S.offsetSelection(f, v.entities, opts({ preview: true })); if (r.ok) ents = r.entities; else UI.setStatus(r.error); }
      } catch (e) { UI.setStatus(e.message); }
      App.tempEntities = ents; UI.updateTemp();
    }
    UI.openPM({
      title: 'Offset Entities', icon: 'offset', values: v,
      message: 'Select sketch entities to offset; set the distance. The preview shows where the offset goes.',
      onSelection: syncSelection(f, v, preview),
      groups: [{ title: 'Parameters', fields: [
        { type: 'number', label: 'Offset distance', key: 'd', unit: 'u', min: 0 },
        { type: 'check', label: 'Add dimensions', key: 'dims' },
        { type: 'check', label: 'Reverse', key: 'reverse' },
        { type: 'check', label: 'Select chain', key: 'chain' },
        { type: 'check', label: 'Bi-directional', key: 'bi', rerender: true },
        { type: 'check', label: 'Cap ends', key: 'cap', rerender: true, disabled: function (x) { return !x.bi; } },
        { type: 'radio', key: 'capType', options: [['arc', 'Arcs'], ['line', 'Lines']], show: function (x) { return x.bi && x.cap; } },
        { type: 'static', label: 'Construction geometry:', value: '' },
        { type: 'check', label: 'Base geometry', key: 'baseCons' },
        { type: 'check', label: 'Offset geometry', key: 'offCons' }
      ] }],
      onChange: preview,
      okBlocked: function () { return v.entities.length || faceMode() ? '' : 'Select the sketch entities to offset.'; },
      onOK: function () {
        if (!(+v.d > 0)) { UI.toast('The offset distance must be a positive number.'); return false; }
        if (faceMode() && sketchFaceIndex(f) != null) {
          var snapF = JSON.stringify([f.entities, f.rels || null, f.dims || null]), dims1 = UI.dimsSnapshot ? UI.dimsSnapshot(f) : null;
          var rf = step(function () {
            var r0 = faceOffsetOn(f, false);
            if (!r0 || !r0.ok) { var o = JSON.parse(snapF); f.entities = o[0]; if (o[1]) f.rels = o[1]; else delete f.rels; if (o[2]) f.dims = o[2]; else delete f.dims; }
            return r0 || { ok: false, error: 'The face edges could not be found.' };
          }, true);
          if (!rf.ok) { UI.toast(rf.error); return false; }
          clearPreview(); changed();
          if (dims1 && v.dims && UI.clearDimPlacement) { try { UI.clearDimPlacement(f, UI.newDimsSince(f, dims1)); } catch (err) { console.error('dimension placement: ' + (err && err.message)); } }
          UI.setStatus('Offset the face edges by ' + UI.fmtLen(+v.d) + (v.dims ? ', with the offset dimension.' : '.') + ' ' + (App.sketchState ? S.STATUS_TEXT[App.sketchState.status] + '.' : ''));
          return;
        }
        if (faceMode()) {
          var loops = faceLoopsOffset();
          step(function () { loops.forEach(function (e) { f.entities.push(e); }); return { ok: true }; }, true);
          clearPreview(); changed();
          UI.setStatus('Offset ' + loops.length + ' face loop' + (loops.length === 1 ? '' : 's') + ' by ' + UI.fmtLen(+v.d) + '.');
          return;
        }
        var dims0 = UI.dimsSnapshot ? UI.dimsSnapshot(f) : null;
        var r = step(function () { return S.offsetSelection(f, v.entities, opts()); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        if (dims0 && v.dims && UI.clearDimPlacement) { try { UI.clearDimPlacement(f, UI.newDimsSince(f, dims0)); } catch (err) { console.error('dimension placement: ' + (err && err.message)); } }   // rfHW: the offset dimension clear of the others
        UI.setStatus('Offset ' + r.added.length + ' entit' + (r.added.length === 1 ? 'y' : 'ies') + ' by ' + UI.fmtLen(+v.d) + (v.dims ? ', with the offset dimension.' : '.'));
      },
      onCancel: clearPreview
    });
    if (!v.entities.length && !faceMode()) UI.setStatus('Select the sketch entities to offset in the graphics area.');
    preview();
  }

  // sketchflow2: the model face sketch f lies on (its plane, the outline closest to f.faceLoops), or null
  function sketchFaceIndex(f) {
    var pl = UI.activePlane(), m = App.mesh, V = K.vec, loops = f.faceLoops;
    if (!m || !m.faces || !pl || !loops || !loops.length || !App.edges) return null;
    function box(pts) { var b = [Infinity, Infinity, -Infinity, -Infinity]; pts.forEach(function (p) { b[0] = Math.min(b[0], p[0]); b[1] = Math.min(b[1], p[1]); b[2] = Math.max(b[2], p[0]); b[3] = Math.max(b[3], p[1]); }); return b; }
    var want = box(loops[0]), size = Math.max(1e-9, want[2] - want[0], want[3] - want[1]), best = null, bd = 0.05 * size;
    m.faces.forEach(function (fc, i) {
      if (!fc || !fc.normal || !fc.centroid || Math.abs(Math.abs(V.dot(fc.normal, pl.n)) - 1) > 1e-6) return;
      if (Math.abs(V.dot(pl.n, V.sub(fc.centroid, pl.origin))) > 1e-6 * Math.max(1, size)) return;
      var pts = [];
      App.edges.forEach(function (e) { if (e.faces.indexOf(i) >= 0) { pts.push(K.to2D(pl, e.a)); pts.push(K.to2D(pl, e.b)); } });
      if (!pts.length) return;
      var b = box(pts), d = Math.max(Math.abs(b[0] - want[0]), Math.abs(b[1] - want[1]), Math.abs(b[2] - want[2]), Math.abs(b[3] - want[3]));
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  }
  UI.sketchFaceIndex = function () { var f = UI.activeSketchFeature(); return f ? sketchFaceIndex(f) : null; };   // test hook

  // ------------------------------------------------------------------ Trim Entities / Extend Entities
  // r13/trim13: Trim Entities as in SolidWorks, with its five options (the last one used stays for the next time) and
  // the two check boxes under them: Keep trimmed entities as construction geometry, Ignore trimming of construction
  // geometry (both remembered too). Power trim (the default): press and drag; a grey trail follows the cursor and every
  // entity segment it crosses goes at once (one undo step per drag). Pressed on the free end of a line or an arc, the
  // drag extends or shortens it along itself instead, snapping onto the entities in its way. Corner: two entities meet,
  // each keeping the side clicked. Trim away inside / outside: two bounding entities, then the entities to trim. Trim
  // to closest: a click removes the segment under the cursor (Power trim's click does too). In every mode the part that
  // would go is highlighted first.
  var trimMode = 'power', trimKeep = false, trimIgnore = false;
  var TRIM_MODES = [['power', 'Power trim'], ['corner', 'Corner'], ['inside', 'Trim away inside'], ['outside', 'Trim away outside'], ['closest', 'Trim to closest']];
  var TRIM_MSG = {
    power: '<b>Press and drag across the entities to trim.</b> Every segment the trail crosses goes. Drag from the free end of a line or an arc to extend or shorten it; a click trims the segment under the cursor.',
    corner: '<b>Select two entities.</b> They are extended or trimmed until they meet, each keeping the side you click.',
    inside: '<b>Select two bounding entities, then the entities to trim.</b> The part between the bounding entities goes.',
    outside: '<b>Select two bounding entities, then the entities to trim.</b> The parts outside the bounding entities go.',
    closest: '<b>Click the part of an entity to remove.</b> The segment between its neighbouring intersections goes away; an entity with nothing crossing it is deleted.'
  };
  var TRIM_HINT = { power: '<b>Power trim:</b> drag across entities to trim them; drag a free end to extend it.', corner: '<b>Corner:</b> click two entities to make them meet.', inside: '<b>Trim away inside:</b> click two bounding entities, then the entities to trim.', outside: '<b>Trim away outside:</b> click two bounding entities, then the entities to trim.', closest: '<b>Trim to closest:</b> click the segment to remove.' };
  var TRIM_SPAN = 'stroke:#e8891c;stroke-width:4;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.85';
  var TRIM_PICK = PICK_STYLE;
  var TRIM_TRAIL = 'stroke:#8c8c8c;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:0.9';
  UI.trimStats = UI.trimStats || { moves: 0, total: 0, max: 0 };   // per pointer move of a Power trim drag (ms), for the smoothness checks
  function cmdTrimEntities() {
    var f = sketch();
    if (!f) return;
    // the sketch as it is now (an undo or a rebuild may have replaced the feature object since the PM opened)
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    var count = 0, picks = [], vals = { mode: trimMode, keepCons: trimKeep, ignoreCons: trimIgnore };   // picks: { e: the entity object, uv: where it was clicked }
    var hint0 = $('sketch-hint') ? $('sketch-hint').innerHTML : null;
    function setHint() { var h = $('sketch-hint'); if (h && App.mode === 'sketch') h.innerHTML = TRIM_HINT[mode()] || ''; }
    function mode() { return vals.mode || 'power'; }
    function topts(o) { o = o || {}; o.keepConstruction = !!vals.keepCons; o.ignoreConstruction = !!vals.ignoreCons; return o; }
    function ignored(e) { return !!(vals.ignoreCons && e && e.construction); }
    function pickIdx() { picks = picks.filter(function (p) { return f.entities.indexOf(p.e) >= 0; }); return picks.map(function (p) { return f.entities.indexOf(p.e); }); }
    function pickNames() { var ix = pickIdx(); return ix.length ? ix.map(function (i) { return S.refName(f, String(i)); }).join(', ') : '(none)'; }
    function changedSketch(n) {
      count += n; App.sel = null; App.gridStale = true;
      UI.updateSketches(); UI.refreshTree();
      UI.setStatus((mode() === 'corner' ? 'Made ' + count + ' corner' : 'Trimmed ' + count + ' segment') + (count === 1 ? '' : 's') + '. Continue, or press ✓ to finish.');
    }
    // the free end of a line or an arc within 8 px of the cursor (Power trim drags it): { i, end, pt }
    function freeEndAt(mx, my) {
      var best = null, bd = 8;
      f.entities.forEach(function (e, i) {
        if ((e.t !== 'line' && e.t !== 'arc') || e.infinite || ignored(e) || (UI.entityLayerHidden && UI.entityLayerHidden(f, e))) return;   // (rfCY: not a hidden one)
        ['p1', 'p2'].forEach(function (end) {
          var p = S.refPoint(f, i + '.' + end), s = p && scr(p), d = s ? Math.hypot(s[0] - mx, s[1] - my) : Infinity;
          if (d < bd && !S.endJoined(f, i + '.' + end)) { bd = d; best = { i: i, end: end, pt: p }; }
        });
      });
      return best;
    }
    function drawPicks() { pickIdx().forEach(function (i) { UI.sketchPreview(entPts(f.entities[i]), TRIM_PICK, 'sk-trim-pick'); }); }
    // the hover preview: what a click (or a crossing) would remove, or what would be picked
    function hover(uv, mx, my) {
      fresh();
      if (!uv) return;
      UI.sketchFeedbackClear();
      drawPicks();
      var m = mode(), hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (m === 'power' || m === 'closest') {
        var fe = m === 'power' ? freeEndAt(mx, my) : null;
        if (fe) { UI.sketchPreview([ring(fe.pt, 6)], TRIM_SPAN.replace('stroke-width:4', 'stroke-width:2'), 'sk-trim-end'); return; }
        var sp = e && e.t !== 'point' && !ignored(e) ? S.trimSpan(f, hit.index, uv) : null;
        if (sp) UI.sketchPreview([sp.pts], TRIM_SPAN, 'sk-trim-span');
        return;
      }
      if (!e || e.t === 'point') return;
      var ix = pickIdx();
      if (m === 'corner') {
        UI.sketchPreview(entPts(e), TRIM_SPAN.replace('stroke-width:4', 'stroke-width:2.5'), 'sk-trim-span');
        if (ix.length === 1) {
          var pv = S.cornerPreview(f, ix[0], picks[0].uv, hit.index, uv);
          if (pv) UI.sketchPreview(pv.map(function (c) { return entPts(c)[0]; }));   // the dashed orange result
        }
        return;
      }
      if (ix.length < 2) { UI.sketchPreview(entPts(e), TRIM_SPAN.replace('stroke-width:4', 'stroke-width:2.5'), 'sk-trim-span'); return; }
      if (ignored(e)) return;
      var spans = S.betweenSpans(f, hit.index, uv, ix, m === 'outside');
      if (spans) UI.sketchPreview(spans, TRIM_SPAN, 'sk-trim-span');
    }
    // a rectangle is four lines in SolidWorks: the edge picked becomes a line of its own (relations kept); rfAF: a
    // script's slot / arc slot its sides and end arcs (SketchSolver.explodeSlot)
    function explodeAt(hit, mx, my) {
      var e = f.entities[hit.index];
      if (!e || (e.t !== 'rect' && e.t !== 'crect' && e.t !== 'slot' && e.t !== 'aslot')) return hit;
      if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; }
      if (e.t === 'slot' || e.t === 'aslot') S.explodeSlot(f, hit.index); else S.explodeRect(f, hit.index);
      return UI.pickEntity(mx, my) || hit;
    }
    function click(uv, mx, my) {
      fresh();
      var m = mode(), hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index], pushed, r;
      if (!e || e.t === 'point') { UI.setStatus(m === 'corner' || ((m === 'inside' || m === 'outside') && picks.length < 2) ? 'Click a line or an arc.' : 'Click on an entity to trim it.'); return; }
      if (m === 'power' || m === 'closest') {
        if (ignored(e)) { UI.setStatus('Construction geometry is not trimmed (Ignore trimming of construction geometry).'); return; }
        r = step(function () { return S.trimAt(f, hit.index, uv, topts()); });
        if (!r.ok) { UI.toast(r.error); return; }
        changedSketch(1);
      } else if (m === 'corner' && pickIdx().length < 1) {
        hit = explodeAt(hit, mx, my);
        picks = [{ e: f.entities[hit.index], uv: uv }];
        UI.renderPM(); UI.updateSketches();
        UI.setStatus('Select the second entity.');
      } else if (m === 'corner') {
        hit = explodeAt(hit, mx, my);
        var i0 = pickIdx()[0];
        pushed = !App.sketchDirty;
        if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
        r = S.cornerTrim(f, i0, picks[0].uv, hit.index, uv);
        picks = [];
        UI.renderPM();
        if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); UI.updateSketches(); }
        else changedSketch(1);
      } else if (pickIdx().length < 2) {
        if (picks.some(function (p) { return p.e === e; })) return;
        picks.push({ e: e, uv: uv });
        UI.renderPM();
        UI.setStatus(picks.length < 2 ? 'Select the second bounding entity.' : 'Now click the entities to trim.');
      } else {
        if (ignored(e)) { UI.setStatus('Construction geometry is not trimmed (Ignore trimming of construction geometry).'); return; }
        hit = explodeAt(hit, mx, my);
        pushed = !App.sketchDirty;
        if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
        r = S.trimBetween(f, hit.index, uv, pickIdx(), m === 'outside', topts());
        if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); return; }
        changedSketch(1);
        UI.renderPM();
      }
      hover(uv, mx, my);   // the highlight follows the new geometry
    }
    // The sketch is redrawn once per animation frame, in the frame itself (a fast drag across many entities never
    // queues redraws, and nothing is drawn that the screen would not show). ctx.analysis, when a trim left one, is the
    // sketch's state already: the redraw reuses it instead of analysing the sketch again.
    function painter(ctx) {
      var frame = 0;
      function paint() {
        frame = 0; App.gridStale = true;
        var reuse = !!(ctx && ctx.analysis);
        if (reuse) { App.sketchState = ctx.analysis; App.sketchDragging = true; }
        try { UI.updateSketches(); } finally { if (reuse) App.sketchDragging = false; }
      }
      return {
        mark: function () { if (!frame) frame = requestAnimationFrame(paint); },
        flush: function () { if (frame) { cancelAnimationFrame(frame); paint(); } }
      };
    }
    function trailHook(p) {
      var uv0 = toUV(p[0], p[1]);
      if (!uv0) return null;
      var trail = [uv0], last = uv0, n0 = count, ctx = topts({ conflicts: App.sketchState ? App.sketchState.conflicts : null }), pt = painter(ctx);
      return {
        start: function () { },
        move: function (q) {
          var uv = toUV(q[0], q[1]);
          if (!uv) return;
          var t0 = performance.now();
          var n = unhidden(f, function () { return S.powerTrim(f, last, uv, function () { if (!App.sketchDirty) { UI.pushUndo(); App.sketchDirty = true; } }, ctx); });
          trail.push(uv); last = uv;
          if (n) { count += n; App.sel = null; pt.mark(); }
          UI.sketchPreview([trail], TRAIL_STYLE(), 'sk-trim-trail');
          var dt = performance.now() - t0, st = UI.trimStats;
          st.moves++; st.total += dt; if (dt > st.max) st.max = dt;
        },
        end: function () {
          pt.flush();
          UI.sketchFeedbackClear();
          if (count > n0) changedSketch(0);
        }
      };
    }
    function TRAIL_STYLE() { return TRIM_TRAIL; }
    function extendHook(fe) {
      var st = null, landed = false, pushed = false, ctx = {}, pt = painter(ctx);
      return {
        start: function () {
          pushed = !App.sketchDirty;
          if (pushed) { UI.pushUndo(); App.sketchDirty = true; }
          st = unhidden(f, function () { return S.extendBegin(f, fe.i, fe.end); });
          ctx.analysis = st ? S.analyze(f) : null;   // the drag changes no relation: the state is drawn from this one
        },
        move: function (q) {
          var uv = st && toUV(q[0], q[1]);
          if (!uv) return;
          var t0 = performance.now(), p = S.extendMove(f, st, uv, null), sp = scr(p), snap = null, bd = 8;
          // it lands exactly on an entity its line (or circle) crosses when it comes within 8 px of the crossing
          st.hits.forEach(function (h) { var s = scr(h), d = Math.hypot(s[0] - sp[0], s[1] - sp[1]); if (d < bd) { bd = d; snap = h; } });
          if (snap) p = S.extendMove(f, st, uv, snap);
          landed = !!snap;
          pt.mark();
          if (snap) UI.sketchSnapMark(p, q, true, 'coincident');
          var dt = performance.now() - t0, s2 = UI.trimStats;
          s2.moves++; s2.total += dt; if (dt > s2.max) s2.max = dt;
        },
        end: function () {
          if (!st) return;
          pt.flush();
          UI.sketchFeedbackClear();
          var r = S.extendEnd(f, st, landed);
          if (!r.ok) { if (pushed) { App.undo.pop(); App.sketchDirty = false; } UI.toast(r.error); UI.updateSketches(); return; }
          App.sel = null; App.gridStale = true; UI.updateSketches(); UI.refreshTree();
          UI.setStatus(r.held ? 'Its relations or dimensions hold the entity where it was.' : landed ? 'Extended to the entity in its way.' : 'Extended. Drag another, or press ✓ to finish.');
        }
      };
    }
    function drag(p) {
      fresh();
      if (mode() !== 'power') return null;
      var fe = freeEndAt(p[0], p[1]);
      return fe ? extendHook(fe) : trailHook(p);
    }
    UI.openPM({
      title: 'Trim Entities', icon: 'trim', values: vals, message: TRIM_MSG[vals.mode],
      // lane CY2: Ctrl+Z undoes the last trim and Trim stays open (ui-app.js undoCommand); the picks named old geometry
      undoInside: UI.undoMark ? UI.undoMark() : null, onUndoInside: function () { fresh(); picks = []; UI.renderPM(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); },
      command: { ownHover: true, onSketchMove: hover, onSketchPoint: click, onSketchDrag: drag },
      groups: [
        { title: 'Options', fields: [{ type: 'radio', key: 'mode', options: TRIM_MODES },
          { type: 'check', label: 'Keep trimmed entities as construction geometry', key: 'keepCons' },
          { type: 'check', label: 'Ignore trimming of construction geometry', key: 'ignoreCons' }] },
        { title: 'Selections', show: function (v) { return v.mode !== 'power' && v.mode !== 'closest'; }, fields: [
          { type: 'static', label: 'Selected', value: pickNames },
          { type: 'buttons', buttons: [{ label: 'Clear Selections', onclick: function () { picks = []; UI.renderPM(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); } }] }
        ] }
      ],
      onChange: function (v, key) {
        trimKeep = !!v.keepCons; trimIgnore = !!v.ignoreCons;
        if (key !== 'mode') return;
        trimMode = v.mode; picks = [];
        var sp = UI.pmSpec();
        if (sp) sp.message = TRIM_MSG[v.mode] || TRIM_MSG.power;
        UI.renderPM();
        if (UI.sketchFeedbackClear) UI.sketchFeedbackClear();
        setHint();
      },
      onOK: function () { },
      onClose: function () { var h = $('sketch-hint'); if (h && hint0 != null) h.innerHTML = hint0; if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); }
    });
    setHint();
  }
  // Extend Entities (r3/sketch3; Trim flyout): the end of a line or an arc nearest the click grows to the first entity
  // in its way; hovering previews the extension (SketchSolver.extendTarget).
  function cmdExtendEntities() {
    var f = sketch();
    if (!f) return;
    var count = 0;
    function target(uv, mx, my) {
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (!e || !(e.t === 'line' || e.t === 'arc' || e.t === 'pellipse' || (e.t === 'spline' && !e.closed))) return null;
      var tg = unhidden(f, function () { return S.extendTarget(f, hit.index, uv); });
      return tg ? { i: hit.index, e: e, tg: tg } : null;
    }
    UI.openPM({
      title: 'Extend Entities', icon: 'extend',
      // lane CY2: Ctrl+Z undoes the last extension and Extend stays open (ui-app.js undoCommand)
      undoInside: UI.undoMark ? UI.undoMark() : null, onUndoInside: function () { f = UI.activeSketchFeature() || f; if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); },
      message: '<b>Click a line, an arc, an open spline or a partial ellipse near the end to lengthen.</b> It grows to the first entity in its way; the orange preview shows where.',
      command: {
        onSketchMove: function (uv, mx, my) {
          var t = target(uv, mx, my);
          if (!t || !UI.sketchPreview) return;
          var pts = [t.tg.from, t.tg.to];
          // sketch-refine: a partial ellipse runs on round its ellipse, a spline along its end span
          var fc = (t.e.t === 'spline' || t.e.t === 'pellipse') && S.freeCurve ? S.freeCurve(t.e) : null;
          if (fc) pts = S.freePts(fc, t.tg.end === 'p2' ? fc.t1 : t.tg.t, t.tg.end === 'p2' ? t.tg.t : fc.t0);
          else if (t.e.t === 'arc') {
            var from = t.tg.end === 'p2' ? t.e.a1 : t.tg.a, to = t.tg.end === 'p2' ? t.tg.a : t.e.a0;
            pts = [];
            for (var k = 0; k <= 32; k++) { var a = (from + (to - from) * k / 32) * Math.PI / 180; pts.push([t.e.cx + t.e.r * Math.cos(a), t.e.cy + t.e.r * Math.sin(a)]); }
          }
          UI.sketchPreview([pts]);
        },
        onSketchPoint: function (uv, mx, my) {
          var hit = UI.pickEntity(mx, my);
          if (!hit) { UI.setStatus('Click a line or an arc near the end to extend.'); return; }
          var r = step(function () { return unhidden(f, function () { return S.extendEntity(f, hit.index, uv); }); });
          if (!r.ok) { UI.toast(r.error); return; }
          count++;
          App.sel = null; App.gridStale = true;
          UI.updateSketches(); UI.refreshTree();
          UI.setStatus('Extended ' + count + ' entit' + (count === 1 ? 'y' : 'ies') + '. Click another, or press ✓ to finish.');
        }
      },
      groups: [{ title: 'Options', fields: [{ type: 'static', label: 'Mode', value: 'Extend to closest' }] }],
      onChange: function () { }, onOK: function () { }
    });
  }

  // ------------------------------------------------------------------ Convert Entities
  // SolidWorks: Sketch tab ▸ Convert Entities. Entities to Convert: model edges, loops or faces picked in the graphics
  // area (a face converts its edges; Inner loops off: its outer loop only); Select chain: an edge brings the rest of its
  // face's loop. Each edge comes in projected onto the sketch plane: straight edges as lines (collinear pieces joined),
  // circular ones as true circles / arcs when they lie square to the sketch, held by On Edge relations.
  function edgeList(items, v) {
    var out = [];
    function add(e) { if (out.indexOf(e) < 0) out.push(e); }
    var pl = UI.activePlane();
    items.forEach(function (it) {
      if (it.kind === 'face') { faceLoops(it.index, true).forEach(function (loop, k) { if (k === 0 || v.inner) loop.forEach(add); }); return; }
      if (!v.chain) { if (it.edge.curve != null && App.curves && App.curves[it.edge.curve]) App.curves[it.edge.curve].edges.forEach(add); else add(it.edge); return; }
      // the loop of the face most nearly in the sketch plane that holds the edge
      var best = null, bd = -1;
      it.edge.faces.forEach(function (fi) { var fc = App.mesh.faces[fi], d = fc && fc.normal ? Math.abs(K.vec.dot(fc.normal, pl.n)) : 0; if (d > bd) { bd = d; best = fi; } });
      var loops = best != null ? faceLoops(best) : [];
      var loop = loops.filter(function (l) { return l.indexOf(it.edge) >= 0; })[0];
      (loop || [it.edge]).forEach(add);
    });
    return out;
  }
  // the boundary edges of face fi grouped into loops, the outer (largest) first. whole: a face picked for Convert
  // Entities keeps its tangent (smooth) edges too, e.g. the bend line of an Edge Flange's wall, so the contour closes
  // (shop audit 2026-10-12 #1); a chain from an edge still skips them so it does not run round a bend
  function faceLoops(fi, whole) {
    var edges = (App.edges || []).filter(function (e) { return (whole || !e.smooth) && e.faces.indexOf(fi) >= 0; }), loops = [], used = [];
    edges.forEach(function (e0) {
      if (used.indexOf(e0) >= 0) return;
      var loop = [], stack = [e0];
      while (stack.length) {
        var e = stack.pop();
        if (used.indexOf(e) >= 0) continue;
        used.push(e); loop.push(e);
        edges.forEach(function (o) { if (used.indexOf(o) < 0 && (o.ka === e.ka || o.ka === e.kb || o.kb === e.ka || o.kb === e.kb)) stack.push(o); });
      }
      loops.push(loop);
    });
    function size(l) { var mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity]; l.forEach(function (e) { [e.a, e.b].forEach(function (p) { for (var k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }); }); return Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]); }
    return loops.sort(function (a, b) { return size(b) - size(a); });
  }
  // sketch entities for model edges: one circle / arc per true curve that lies square to the sketch, else lines
  // lane sketchref: each entity carries the model edge it came from as a non-enumerable `_src` (3D: { k: 'edge', a, b }
  // with a, b at x1 y1 / x2 y2, or { k: 'circle', c, n, r, full }), for UI.attachModelRef
  function withSrc(e, src) { try { Object.defineProperty(e, '_src', { value: src, enumerable: false, writable: true, configurable: true }); } catch (err) { } return e; }
  function convertGeometry(edges, keepPieces) {
    var pl = UI.activePlane(), V = K.vec, out = [], seenCurve = {};
    function r6(x) { return Math.round(x * 1e6) / 1e6; }
    function p2(p) { var q = K.to2D(pl, p); return [r6(q[0]), r6(q[1])]; }
    edges.forEach(function (e) {
      var c = e.curve != null && App.curves ? App.curves[e.curve] : null;
      if (c && c.curve && Math.abs(Math.abs(V.dot(c.curve.normal, pl.n)) - 1) < 1e-6) {
        if (seenCurve[e.curve]) return;
        seenCurve[e.curve] = true;
        var C = c.curve, yd = V.cross(C.normal, C.xdir), at = function (a) { return V.add(C.center, V.add(V.scale(C.xdir, Math.cos(a) * C.radius), V.scale(yd, Math.sin(a) * C.radius))); };
        var cen = p2(C.center), sweep = C.a1 - C.a0, csrc = { k: 'circle', c: C.center.slice(), n: C.normal.slice(), r: C.radius, full: sweep >= 2 * Math.PI - 1e-6 };
        if (sweep >= 2 * Math.PI - 1e-6) { out.push(withSrc({ t: 'circle', cx: cen[0], cy: cen[1], r: r6(C.radius) }, csrc)); return; }
        var s0 = p2(at(C.a0)), s1 = p2(at(C.a1)), b0 = Math.atan2(s0[1] - cen[1], s0[0] - cen[0]) * 180 / Math.PI, b1 = Math.atan2(s1[1] - cen[1], s1[0] - cen[0]) * 180 / Math.PI;
        var sw = sweep * 180 / Math.PI, a0 = V.dot(C.normal, pl.n) > 0 ? b0 : b1;
        while (a0 < 0) a0 += 360;
        while (a0 >= 360) a0 -= 360;
        out.push(withSrc({ t: 'arc', cx: cen[0], cy: cen[1], r: r6(C.radius), a0: r6(a0), a1: r6(a0 + sw) }, csrc));
        return;
      }
      var a = p2(e.a), b = p2(e.b);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) return;   // square to the sketch: a point, nothing to draw
      out.push(withSrc({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, { k: 'edge', a: e.a.slice(), b: e.b.slice() }));
    });
    if (keepPieces) return out;   // Close Sketch to Model: edges projected onto one another must not be joined here
    // collinear pieces of one straight edge (a face outline split it) join into one line
    for (var again = true; again;) {
      again = false;
      for (var i = 0; i < out.length && !again; i++) for (var j = i + 1; j < out.length && !again; j++) {
        var L = out[i], M = out[j];
        if (L.t !== 'line' || M.t !== 'line') continue;
        var ends = [[L.x1, L.y1], [L.x2, L.y2]], mends = [[M.x1, M.y1], [M.x2, M.y2]];
        for (var p = 0; p < 2 && !again; p++) for (var q = 0; q < 2 && !again; q++) {
          if (Math.hypot(ends[p][0] - mends[q][0], ends[p][1] - mends[q][1]) > 1e-6) continue;
          var u = [ends[1][0] - ends[0][0], ends[1][1] - ends[0][1]], w = [mends[1][0] - mends[0][0], mends[1][1] - mends[0][1]];
          if (Math.abs(u[0] * w[1] - u[1] * w[0]) > 1e-9 * Math.hypot(u[0], u[1]) * Math.hypot(w[0], w[1])) continue;
          var A = ends[1 - p], B = mends[1 - q], sL = L._src, sM = M._src;
          out[i] = withSrc({ t: 'line', x1: A[0], y1: A[1], x2: B[0], y2: B[1] }, sL && sM ? { k: 'edge', a: p === 0 ? sL.b : sL.a, b: q === 0 ? sM.b : sM.a } : null);
          out.splice(j, 1);
          again = true;
        }
      }
    }
    return out;
  }
  // lane DF2: a reference Point / Coordinate System origin converts to a sketch point, a reference Axis to a construction
  // line (its drawn ends projected; square to the sketch: a point); each held Fixed (reference geometry has no edge for
  // On Edge). Only reference geometry before the sketch (and not rolled back) converts.
  function refConvertPick(f, mx, my) {
    var r = UI.pickRefGeo ? UI.pickRefGeo(mx, my) : null, feats = App.model.features || [];
    if (!r) return null;
    var fi = -1, si = feats.indexOf(f);
    feats.forEach(function (g, i) { if (g.id === r.id) fi = i; });
    if (fi < 0 || (si >= 0 && fi >= si) || (App.rollback != null && fi >= App.rollback)) return null;
    return { kind: 'ref', id: r.id, name: r.name || ('Feature ' + r.id) };
  }
  function refConvertGeometry(items) {
    var pl = UI.activePlane(), planes = App.build && App.build.planes, out = [];
    function r6(x) { return Math.round(x * 1e6) / 1e6; }
    function p2(p) { var q = K.to2D(pl, p); return [r6(q[0]), r6(q[1])]; }
    items.forEach(function (it) {
      var g = planes && planes[it.id];
      if (!g || !g.refgeo) return;
      if (g.refgeo === 'point' || g.refgeo === 'csys') { var q = p2(g.p || g.origin); out.push({ t: 'point', x: q[0], y: q[1] }); return; }
      if (g.refgeo === 'axis' && g.a && g.b) {
        var a = p2(g.a), b = p2(g.b);
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-6) out.push({ t: 'point', x: a[0], y: a[1] });
        else out.push({ t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1], construction: true });
      }
    });
    return out;
  }
  function cmdConvertEntities() {
    var f = sketch();
    if (!f) return;
    var v = { items: [], chain: false, inner: true };
    function itemLabel(it, k) { return it.kind === 'ref' ? it.name : it.kind === 'face' ? 'Face<' + (k + 1) + '>' : 'Edge<' + (k + 1) + '>'; }
    function same(a, b) { return a.kind === b.kind && (a.kind === 'face' ? a.index === b.index : a.kind === 'ref' ? a.id === b.id : a.edge === b.edge); }
    function modelItems(list) { return list.filter(function (it) { return it.kind !== 'ref'; }); }
    function refItems(list) { return list.filter(function (it) { return it.kind === 'ref'; }); }
    function allGeometry(list) { return convertGeometry(edgeList(modelItems(list), v)).concat(refConvertGeometry(refItems(list))); }
    function pick(mx, my) { var rf = refConvertPick(f, mx, my); if (rf) return rf; var ed = UI.pickEdge ? UI.pickEdge(mx, my) : null; if (ed && ed.edge) return { kind: 'edge', edge: ed.edge }; var fc = UI.pickFace ? UI.pickFace(mx, my) : null; return fc && fc.index != null ? { kind: 'face', index: fc.index } : null; }
    function preview() {
      UI.sketchFeedbackClear();
      try { App.tempEntities = v.items.length ? allGeometry(v.items) : []; } catch (e) { App.tempEntities = []; }
      UI.updateTemp();
    }
    UI.openPM({
      title: 'Convert Entities', icon: 'convert', values: v,
      message: 'Select model edges, loops or faces to convert into the sketch.',
      command: {
        ownHover: true,
        onSketchMove: function (uv, mx, my) {
          UI.sketchFeedbackClear();
          var it = pick(mx, my);
          if (!it) return;
          try { UI.sketchPreview(allGeometry([it]).map(function (e) { return entPts(e)[0]; }), HOT_STYLE, 'sk-trim-span'); } catch (e) { }
        },
        onSketchPoint: function (uv, mx, my) {
          var it = pick(mx, my);
          if (!it) { UI.setStatus('Click a model edge or face, or a reference point / axis.'); return; }
          var k = -1;
          v.items.forEach(function (x, i) { if (same(x, it)) k = i; });
          if (k >= 0) v.items.splice(k, 1); else v.items.push(it);
          UI.renderPM(); preview();
        }
      },
      groups: [{ title: 'Entities to Convert', fields: [
        { type: 'pick', icon: 'convert', placeholder: 'Select edges, loops or faces…', value: function (x) { return x.items.length ? x.items.length + ' item' + (x.items.length > 1 ? 's' : '') : ''; },
          items: function (x) { return x.items.map(function (it, k) { return { label: itemLabel(it, k) }; }); },
          onRemove: function (x, i) { x.items.splice(i, 1); UI.renderPM(); preview(); }, onClear: function (x) { x.items.length = 0; UI.renderPM(); preview(); } },
        { type: 'check', label: 'Select chain', key: 'chain' },
        { type: 'check', label: 'Inner loops', key: 'inner' }
      ] }],
      onChange: preview,
      okBlocked: function () { return v.items.length ? '' : 'Select the model edges or faces to convert.'; },
      onOK: function () {
        var geo = convertGeometry(edgeList(modelItems(v.items), v)), rgeo = refConvertGeometry(refItems(v.items)), n = 0;
        var r = step(function () {
          geo.concat(rgeo).forEach(function (g, gi) {
            var keys = S.paramNames(g);
            var dup = f.entities.some(function (o) { return o.t === g.t && keys.every(function (k) { return Math.abs((+o[k] || 0) - g[k]) < 1e-6 * Math.max(1, Math.abs(g[k])); }); });
            if (dup) return;
            f.entities.push(g);
            var ar = S.addRelation(f, gi < geo.length ? 'onEdge' : 'fix', [String(f.entities.length - 1)]);   // lane DF2: reference geometry is Fixed
            if (!ar.ok) throw new Error(ar.error);
            if (gi < geo.length && g._src && UI.attachModelRef && ar.rels && ar.rels.length) UI.attachModelRef(f, ar.rels[0], g._src);   // lane sketchref: follows its edge
            n++;
          });
          return n ? { ok: true } : { ok: false, error: 'Those edges are already in the sketch.' };
        }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus('Converted ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + ' (On Edge).');
      },
      onCancel: clearPreview
    });
    if (!App.edges || !App.edges.length) UI.setStatus('There is no model to convert yet: Convert Entities projects model edges into the sketch.');
  }

  // ------------------------------------------------------------------ Move / Copy / Rotate / Scale / Stretch Entities
  // SolidWorks: Sketch tab ▸ Move Entities flyout. Entities to Move (Copy, Rotate, Scale, Stretch): the selection plus
  // what is clicked while the box is active; Keep relations (Move, Copy, Rotate). Parameters: From/To (click the Start
  // point box, then the base point and the point it goes to: the second click finishes) or X/Y (ΔX, ΔY, Repeat);
  // Rotate: Center of rotation and Angle; Scale: Scale about, Scale Factor, Copy with Number of copies. Stretch moves
  // the selection and stretches what is joined to it.
  var XF = {
    move: { title: 'Move', icon: 'moveEnt', box: 'Entities to Move' }, copy: { title: 'Copy', icon: 'copyEnt', box: 'Entities to Copy' },
    rotate: { title: 'Rotate', icon: 'rotateEnt', box: 'Entities to Rotate' }, scale: { title: 'Scale', icon: 'scaleEnt', box: 'Entities to Scale' },
    stretch: { title: 'Stretch', icon: 'stretchEnt', box: 'Entities to Stretch' }
  };
  function transformTool(kind) {
    var f = sketch();
    if (!f) return;
    var K0 = XF[kind], linear = kind === 'move' || kind === 'copy' || kind === 'stretch';
    var v = { entities: selIdx(f), keep: false, mode: 'fromto', dx: 0, dy: 0, angle: 0, scale: 1, copy: true, count: 1, repeat: 1, base: null, to: null, box: 'entities' };
    var cmd = { ownHover: false };
    function xf(to) {
      if (linear) {
        if (v.mode === 'xy') return { dx: +v.dx || 0, dy: +v.dy || 0 };
        var t = to || v.to;
        return v.base && t ? { dx: t[0] - v.base[0], dy: t[1] - v.base[1] } : null;
      }
      if (!v.base) return null;
      return kind === 'rotate' ? { rot: +v.angle || 0, cx: v.base[0], cy: v.base[1] } : { s: +v.scale, cx: v.base[0], cy: v.base[1] };
    }
    function times() { return linear && v.mode === 'xy' ? Math.max(1, v.repeat | 0) : 1; }
    function isCopy() { return kind === 'copy' || (kind === 'scale' && v.copy); }
    function nCopies() { return kind === 'scale' ? Math.max(1, v.count | 0) : times(); }
    function previewWith(x) {
      var out = [];
      if (x && v.entities.length) {
        var nn = isCopy() ? nCopies() : 1;
        for (var c = 1; c <= nn; c++) {
          var xk = isCopy() ? power(x, c) : power(x, times());
          v.entities.forEach(function (i) { var o = f.entities[i] && S.xfEntity(f.entities[i], xk); if (!o && f.entities[i] && (f.entities[i].t === 'rect' || f.entities[i].t === 'crect')) { o = { t: 'polyline', pts: K.entityPolylines(f.entities[i])[0].pts.map(function (p) { return rotPt(p, xk); }), closed: true }; } if (o) out.push(o); });
        }
      }
      App.tempEntities = out; UI.updateTemp();
    }
    function rotPt(p, x) { var a = x.rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), dx = p[0] - x.cx, dy = p[1] - x.cy; return [x.cx + c * dx - s * dy, x.cy + s * dx + c * dy]; }
    function power(x, n) { if (x.rot != null) return { rot: x.rot * n, cx: x.cx, cy: x.cy }; if (x.s != null) return { s: Math.pow(x.s, n), cx: x.cx, cy: x.cy }; return { dx: x.dx * n, dy: x.dy * n }; }
    function preview() { previewWith(xf()); }
    // rfBC: Stretch after a window / crossing box (made before the command or while its box is active) moves the points
    // inside the box and stretches what crosses it (SketchSolver.stretchEntities); entities picked one by one move whole
    // and what is joined to them stretches, as before
    function stretchBox() {
      if (kind !== 'stretch') return null;
      var b = UI.lastSketchBox;
      return b && b.sketch === f.id && b.sel.join() === v.entities.join() ? b.poly : null;
    }
    if (kind === 'stretch') previewWith = (function (plain) {
      return function (x) {
        var poly = stretchBox();
        if (!poly || !x || !v.entities.length) return plain(x);
        var g = JSON.parse(JSON.stringify({ entities: f.entities, rels: f.rels, dims: f.dims, blocks: f.blocks }));
        var r = S.stretchEntities(g, v.entities, poly, x);
        if (!r.ok) return plain(x);
        var same = g.entities.length === f.entities.length;
        App.tempEntities = g.entities.filter(function (e, i) { return same ? JSON.stringify(e) !== JSON.stringify(f.entities[i]) : r.entities.indexOf(i) >= 0; });
        UI.updateTemp();
      };
    })(previewWith);
    function setBox(b) {
      v.box = b;
      cmd.onSketchPoint = b === 'base' || b === 'to' ? pointClick : null;
      cmd.onSketchMove = b === 'to' ? function (uv, mx, my) { previewWith(xf(snapPoint(f, uv, mx, my))); } : null;
      UI.renderPM();
      UI.setStatus(b === 'base' ? (linear ? 'Click the start point.' : kind === 'rotate' ? 'Click the center of rotation.' : 'Click the point to scale about.') : b === 'to' ? 'Click where the start point goes.' : 'Click sketch entities to add them (click again to remove).');
    }
    function pointClick(uv, mx, my) {
      var p = snapPoint(f, uv, mx, my);
      if (v.box === 'base') {
        v.base = p;
        if (linear && v.mode === 'fromto') { setBox('to'); return; }
        setBox('entities'); preview();
        return;
      }
      v.to = p;
      UI.pmOK();
    }
    function apply() {
      var x = xf();
      if (!x) { UI.toast(linear ? 'Click the start point and where it goes, or set ΔX / ΔY.' : 'Click the ' + (kind === 'rotate' ? 'center of rotation.' : 'point to scale about.')); return false; }
      var o = { keepRelations: kind === 'stretch' ? true : !!v.keep };
      if (isCopy()) { o.copy = true; o.count = nCopies(); }
      else if (times() > 1) x = power(x, times());
      var poly = stretchBox();
      var r = step(function () { return poly ? S.stretchEntities(f, v.entities, poly, x) : S.transformEntities(f, v.entities, x, o); }, true);
      if (!r.ok) { UI.toast(r.error); if (v.box === 'to') { v.to = null; } return false; }
      clearPreview(); changed();
      if (poly) UI.lastSketchBox = null;
      UI.setStatus((isCopy() ? 'Copied: ' + r.added.length : K0.title.replace(/e$/, '') + 'ed ' + r.entities.length) + ' entit' + ((isCopy() ? r.added.length : r.entities.length) === 1 ? 'y' : 'ies') + '.');
      return true;
    }
    var params = [];
    if (linear) params.push(
      { type: 'radio', key: 'mode', options: [['fromto', 'From/To'], ['xy', 'X/Y']], rerender: true },
      { type: 'pick', icon: 'point', placeholder: 'Start point', value: function (x) { return x.base ? 'Base defined ' + fmtPt(x.base) : ''; }, show: function (x) { return x.mode === 'fromto'; }, active: function (x) { return x.box === 'base' || x.box === 'to'; }, onActivate: function () { v.base = null; v.to = null; setBox('base'); } },
      { type: 'number', label: 'ΔX', key: 'dx', unit: 'u', show: function (x) { return x.mode === 'xy'; } },
      { type: 'number', label: 'ΔY', key: 'dy', unit: 'u', show: function (x) { return x.mode === 'xy'; } },
      { type: 'buttons', show: function (x) { return x.mode === 'xy'; }, buttons: [{ label: 'Repeat', onclick: function () { v.repeat = Math.max(1, v.repeat | 0) + 1; UI.renderPM(); preview(); UI.setStatus('Repeat: ' + v.repeat + ' × (ΔX, ΔY).'); } }] });
    else params.push({ type: 'pick', icon: 'point', placeholder: kind === 'rotate' ? 'Center of rotation' : 'Scale about', value: function (x) { return x.base ? 'Base defined ' + fmtPt(x.base) : ''; }, active: function (x) { return x.box === 'base'; }, onActivate: function () { setBox('base'); } });
    if (kind === 'rotate') params.push({ type: 'number', label: 'Angle', key: 'angle', unit: '°' });
    if (kind === 'scale') params.push({ type: 'number', label: 'Scale Factor', key: 'scale', min: 0, spin: 0.1 }, { type: 'check', label: 'Copy', key: 'copy', rerender: true }, { type: 'number', label: 'Number of copies', key: 'count', step: 1, min: 1, show: function (x) { return x.copy; } });
    var boxFields = [entityBox(f, v, K0.icon, preview, { box: setBox, placeholder: 'Sketch items or annotations' })];
    if (kind !== 'scale' && kind !== 'stretch') boxFields.push({ type: 'check', label: 'Keep relations', key: 'keep' });
    UI.openPM({
      title: K0.title, icon: K0.icon, values: v,
      message: kind === 'stretch' ? 'Drag a box over the points to move (right to left: crossing), or select whole entities: what crosses the box, or is joined to them, stretches.' : 'Select the sketch entities, then set where they go.',
      command: cmd,
      onSelection: syncSelection(f, v, preview),
      onEntityPick: function () { return v.box !== 'entities'; },
      groups: [{ title: K0.box, fields: boxFields }, { title: 'Parameters', fields: params }],
      onChange: function (x, key) { if (key === 'mode') { v.base = null; v.to = null; v.repeat = 1; if (v.box !== 'entities') setBox('entities'); } preview(); },
      okBlocked: function () { return !v.entities.length ? 'Select the entities first.' : !xf() && !(linear && v.mode === 'fromto' && v.base) ? (linear ? 'Click the start point, or use X/Y.' : kind === 'rotate' ? 'Click the center of rotation.' : 'Click the point to scale about.') : ''; },
      onOK: function () { return apply(); },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    if (!v.entities.length) UI.setStatus('Select the sketch entities in the graphics area.');
    else if (linear && v.mode === 'fromto') setBox('base');
    else if (!linear) setBox('base');
    preview();
  }

  // ------------------------------------------------------------------ Linear / Circular Sketch Pattern
  // SolidWorks: Sketch tab ▸ Linear Sketch Pattern (flyout: Circular Sketch Pattern). Entities to Pattern holds the
  // sketch selection when the command starts plus whatever is clicked while it is open (nothing selected: nothing is
  // patterned); Instances to Skip: click its box, then the instances (dots in the preview) to leave out. The copies stay
  // tied to their seeds (one Pattern relation), so editing the seed or a spacing dimension moves the whole pattern.
  function anchorPt(e) { var r = S.anchorRef(e, 0); return r ? S.refPoint({ entities: [e] }, r) : null; }
  function skipBox(v, onChange, setBox) {
    return { type: 'pick', icon: 'sketchPattern', placeholder: 'Click instances to skip…', value: function (x) { return x.skip.length ? x.skip.length + ' instance' + (x.skip.length > 1 ? 's' : '') : ''; },
      active: function (x) { return x.box === 'skip'; }, onActivate: function () { setBox(v.box === 'skip' ? 'entities' : 'skip'); },
      items: function (x) { return x.skip.map(function (k) { return { label: '(' + k.split(',').map(function (n) { return +n + 1; }).join(', ') + ')' }; }); },
      onRemove: function (x, i) { x.skip.splice(i, 1); UI.renderPM(); onChange(); }, onClear: function (x) { x.skip.length = 0; UI.renderPM(); onChange(); } };
  }
  function patternTool(circular, edit) {
    var f = sketch();
    if (!f) return;
    if (!f.entities.length) { UI.toast('Draw something to pattern first.'); return; }
    var v = circular ? { entities: selIdx(f), rev: false, cx: 0, cy: 0, angle: 360, equal: true, dimRadius: true, dimAngle: true, count: 4, radius: 0, arcAngle: 0, skip: [], box: 'entities', showCount: false }
      : { entities: selIdx(f), ref1: 'x', rev1: false, spacing: UI.lenDefault(20), dims: true, count: 3, angle: 0, ref2: 'y', rev2: false, spacing2: UI.lenDefault(20), dimY: false, count2: 1, angle2: 90, dimAngle: false, skip: [], box: 'entities' };
    if (edit) Object.keys(edit.values).forEach(function (k) { v[k] = edit.values[k]; });   // lane DM: Edit Circular Pattern
    var cmd = {};
    function seedPt() { var e = v.entities.length ? f.entities[v.entities[0]] : null; return e ? anchorPt(e) : null; }
    // circular: Radius / Arc angle are the seed's place round the centre
    function syncPolar() { var p = seedPt(); if (!p) return; v.radius = Math.round(Math.hypot(p[0] - v.cx, p[1] - v.cy) * 1e6) / 1e6; v.arcAngle = Math.round(Math.atan2(p[1] - v.cy, p[0] - v.cx) * 180 / Math.PI * 1e6) / 1e6; }
    function linSpec() { return { angle1: +v.angle + (v.rev1 ? 180 : 0), spacing1: +v.spacing, count1: v.count | 0, angle2: +v.angle2 + (v.rev2 ? 180 : 0), spacing2: +v.spacing2, count2: v.count2 | 0, skip: v.skip.slice(), dimX: !!v.dims, dimY: !!v.dimY, dimAngle: !!v.dimAngle }; }
    function circSpec() { return { cx: +v.cx, cy: +v.cy, count: v.count | 0, angle: (v.rev ? -1 : 1) * +v.angle, equal: !!v.equal, skip: v.skip.map(Number), dimRadius: !!v.dimRadius, dimAngle: !!v.dimAngle }; }
    // the instances and how far each moves: [{ key, xf }]
    function instances() {
      var out = [];
      if (circular) {
        var n = v.count | 0, tot = (v.rev ? -1 : 1) * +v.angle, st = !v.equal ? tot : Math.abs(tot) >= 360 - 1e-9 ? tot / n : tot / Math.max(1, n - 1);
        for (var k = 1; k < n; k++) out.push({ key: String(k), xf: { rot: k * st, cx: +v.cx, cy: +v.cy } });
        return out;
      }
      var s = linSpec(), a1 = s.angle1 * Math.PI / 180, a2 = s.angle2 * Math.PI / 180, n1 = Math.max(1, s.count1), n2 = Math.max(1, s.count2);
      for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
        if (!i && !j) continue;
        out.push({ key: i + ',' + j, xf: { dx: i * s.spacing1 * Math.cos(a1) + j * s.spacing2 * Math.cos(a2), dy: i * s.spacing1 * Math.sin(a1) + j * s.spacing2 * Math.sin(a2) } });
      }
      return out;
    }
    function preview() {
      var out = [];
      if (v.entities.length) instances().forEach(function (q) {
        if (v.skip.indexOf(q.key) >= 0) return;
        v.entities.forEach(function (i) { var e = f.entities[i], o = e && S.xfEntity(e, q.xf); if (!o && e && (e.t === 'rect' || e.t === 'crect')) o = { t: 'polyline', pts: K.entityPolylines(e)[0].pts.map(function (p) { var x = q.xf, a = x.rot * Math.PI / 180, dx = p[0] - x.cx, dy = p[1] - x.cy; return [x.cx + Math.cos(a) * dx - Math.sin(a) * dy, x.cy + Math.sin(a) * dx + Math.cos(a) * dy]; }), closed: true }; if (o) out.push(o); });
      });
      App.tempEntities = out; UI.updateTemp();
      UI.sketchFeedbackClear();
      // in the Instances to Skip box every instance shows a dot (an orange ring when skipped)
      var p0 = seedPt();
      // lane DE2: Display instance count (SolidWorks): the count by the last instance of each direction
      if (p0 && UI.sketchPreviewText) {
        var lastOf = function (key) { var q = instances().filter(function (x) { return x.key === key; })[0]; if (!q) return null; var at = S.xfEntity({ t: 'point', x: p0[0], y: p0[1] }, q.xf); return [at.x, at.y]; };
        if (circular) { if (v.showCount && (v.count | 0) > 1) { var lc = lastOf(String((v.count | 0) - 1)); if (lc) UI.sketchPreviewText(lc, v.count | 0, 'sk-count', 0, -18); } }
        else {
          if (v.showCount && (v.count | 0) > 1) { var l1 = lastOf(((v.count | 0) - 1) + ',0'); if (l1) UI.sketchPreviewText(l1, v.count | 0, 'sk-count', 0, -18); }
          if (v.showCount2 && (v.count2 | 0) > 1) { var l2 = lastOf('0,' + ((v.count2 | 0) - 1)); if (l2) UI.sketchPreviewText(l2, v.count2 | 0, 'sk-count', 18, 0); }
        }
      }
      if (v.box === 'skip' && p0) instances().forEach(function (q) {
        var at = S.xfEntity({ t: 'point', x: p0[0], y: p0[1] }, q.xf);
        UI.sketchPreview([ring([at.x, at.y], v.skip.indexOf(q.key) >= 0 ? 7 : 3)], v.skip.indexOf(q.key) >= 0 ? HOT_STYLE : PICK_STYLE, 'sk-skip');
      });
    }
    function setBox(b) {
      v.box = b;
      cmd.onSketchPoint = b === 'skip' ? skipClick : b === 'dir1' || b === 'dir2' ? dirClick : null;
      UI.renderPM(); preview();
      UI.setStatus(b === 'skip' ? 'Click the instances to skip (click again to keep).' : b === 'dir1' || b === 'dir2' ? 'Click a line for the direction, or the box again for the sketch axis.' : 'Click sketch entities to add them to Entities to Pattern (click again to remove).');
    }
    function skipClick(uv, mx, my) {
      var p0 = seedPt(), best = null, bd = 15;
      if (!p0) return;
      instances().forEach(function (q) { var at = S.xfEntity({ t: 'point', x: p0[0], y: p0[1] }, q.xf), s = scr([at.x, at.y]), d = Math.hypot(s[0] - mx, s[1] - my); if (d < bd) { bd = d; best = q.key; } });
      if (best == null) { UI.setStatus('Click an instance (its dot) to skip it.'); return; }
      var k = v.skip.indexOf(best);
      if (k >= 0) v.skip.splice(k, 1); else v.skip.push(best);
      UI.renderPM(); preview();
    }
    // a line clicked for Direction 1 / 2: the direction runs along it
    function dirClick(uv, mx, my) {
      var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
      if (!e || e.t !== 'line') { UI.setStatus('Click a line for the direction.'); return; }
      var a = Math.round(Math.atan2(e.y2 - e.y1, e.x2 - e.x1) * 180 / Math.PI * 1e6) / 1e6;
      if (v.box === 'dir1') { v.ref1 = String(hit.index); v.angle = a; } else { v.ref2 = String(hit.index); v.angle2 = a; }
      setBox('entities');
    }
    function refLabel(r) { return r === 'x' ? 'X-axis' : r === 'y' ? 'Y-axis' : 'Line' + (+r + 1); }
    function dirBox(n) {
      return { type: 'pick', icon: 'centerline', value: function (x) { return refLabel(n === 1 ? x.ref1 : x.ref2); }, active: function (x) { return x.box === 'dir' + n; },
        onActivate: function () { if (v.box === 'dir' + n) { if (n === 1) { v.ref1 = 'x'; v.angle = 0; } else { v.ref2 = 'y'; v.angle2 = 90; } setBox('entities'); } else setBox('dir' + n); } };
    }
    var groups;
    if (circular) groups = [
      { title: 'Parameters', fields: [
        { type: 'check', label: 'Reverse direction', key: 'rev' },
        { type: 'number', label: 'Center X', key: 'cx', unit: 'u' }, { type: 'number', label: 'Center Y', key: 'cy', unit: 'u' },
        { type: 'number', label: 'Spacing', key: 'angle', unit: '°' },
        { type: 'check', label: 'Equal spacing', key: 'equal' },
        { type: 'check', label: 'Dimension radius', key: 'dimRadius' },
        { type: 'check', label: 'Dimension angular spacing', key: 'dimAngle' },
        { type: 'number', label: 'Number of instances', key: 'count', step: 1, min: 2 },
        { type: 'check', label: 'Display instance count', key: 'showCount' },   // lane DM (as Linear's, lane DE2)
        { type: 'number', label: 'Radius', key: 'radius', unit: 'u', min: 0 },
        { type: 'number', label: 'Arc angle', key: 'arcAngle', unit: '°' }
      ] },
      { title: 'Entities to Pattern', fields: [entityBox(f, v, 'cSketchPattern', preview, { box: setBox })] },
      { title: 'Instances to Skip', collapsed: true, fields: [skipBox(v, preview, setBox)] }
    ];
    else groups = [
      { title: 'Direction 1', fields: [dirBox(1), { type: 'check', label: 'Reverse direction', key: 'rev1' },
        { type: 'number', label: 'Spacing', key: 'spacing', unit: 'u' }, { type: 'check', label: 'Dimension X spacing', key: 'dims' },
        { type: 'number', label: 'Number of instances', key: 'count', step: 1, min: 1 }, { type: 'number', label: 'Angle', key: 'angle', unit: '°' },
        { type: 'check', label: 'Display instance count', key: 'showCount' }] },   // lane DE2
      { title: 'Direction 2', fields: [dirBox(2), { type: 'check', label: 'Reverse direction', key: 'rev2' },
        { type: 'number', label: 'Spacing', key: 'spacing2', unit: 'u' }, { type: 'check', label: 'Dimension Y spacing', key: 'dimY' },
        { type: 'number', label: 'Number of instances', key: 'count2', step: 1, min: 1 }, { type: 'check', label: 'Display instance count', key: 'showCount2' }, { type: 'number', label: 'Angle', key: 'angle2', unit: '°' },
        { type: 'check', label: 'Dimension angle between axes', key: 'dimAngle' }] },
      { title: 'Entities to Pattern', fields: [entityBox(f, v, 'sketchPattern', preview, { box: setBox })] },
      { title: 'Instances to Skip', collapsed: true, fields: [skipBox(v, preview, setBox)] }
    ];
    var sync = syncSelection(f, v, function () { if (circular) syncPolar(); UI.renderPM(); preview(); });
    UI.openPM({
      title: edit ? (circular ? 'Edit Circular Pattern' : 'Edit Linear Pattern') : circular ? 'Circular Pattern' : 'Linear Pattern', icon: circular ? 'cSketchPattern' : 'sketchPattern', values: v,
      command: cmd,
      onSelection: sync,
      onEntityPick: function () { return v.box !== 'entities'; },
      groups: groups,
      onChange: function (x, key) {
        if (circular && (key === 'radius' || key === 'arcAngle')) {
          // Radius / Arc angle move the centre (the seed stays)
          var p = seedPt();
          if (p) { var a = +v.arcAngle * Math.PI / 180; v.cx = Math.round((p[0] - +v.radius * Math.cos(a)) * 1e6) / 1e6; v.cy = Math.round((p[1] - +v.radius * Math.sin(a)) * 1e6) / 1e6; UI.renderPM(); }
        } else if (circular && (key === 'cx' || key === 'cy')) { syncPolar(); UI.renderPM(); }
        if (key === 'count' || key === 'count2') v.skip = v.skip.filter(function (k) { return instances().some(function (q) { return q.key === k; }); });
        preview();
      },
      okBlocked: function () { return v.entities.length ? '' : 'Select the entities to pattern first.'; },
      onOK: function () {
        if (!v.entities.length) { UI.toast('Select the entities to pattern first.'); return false; }
        var r = step(function () {
          if (!circular) {
            // lane DS: Edit Linear Pattern takes the old copies (and the construction points / lines the pattern made)
            // out first, as the circular edit does; the PM's settings ride on the Pattern relation (pat.spec)
            if (edit) removePatternMade(f, edit.rel);
            var rl = S.linearPattern(f, v.entities, linSpec()), lr = rl.ok ? lastPatternRel(f, true) : null;
            if (lr) lr.pat.spec = { ref1: v.ref1, angle: +v.angle, rev1: !!v.rev1, spacing: +v.spacing, count: v.count | 0, dims: !!v.dims, showCount: !!v.showCount,
              ref2: v.ref2, angle2: +v.angle2, rev2: !!v.rev2, spacing2: +v.spacing2, count2: v.count2 | 0, dimY: !!v.dimY, showCount2: !!v.showCount2, dimAngle: !!v.dimAngle };
            return rl;
          }
          // lane DM: Edit Circular Pattern takes the old instances and construction lines out first (a failure pops the
          // whole edit: step())
          if (edit) removePatternMade(f, edit.rel);
          var rc = S.circularPattern(f, v.entities, circSpec());
          // lane DM: what the pattern was made with rides on its Pattern relation (feature JSON), for Edit Circular
          // Pattern and Display instance count (drawn by the last instance, sketchPatternCounts)
          var pr = rc.ok ? lastPatternRel(f) : null;
          if (pr) { pr.pat.spec = { count: v.count | 0, angle: +v.angle, rev: !!v.rev, equal: !!v.equal, dimRadius: !!v.dimRadius, dimAngle: !!v.dimAngle }; if (v.showCount) pr.pat.showCount = true; }
          return rc;
        }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        if (UI.setSelection) UI.setSelection([]);
        UI.setStatus('Added ' + r.copies.length + ' patterned entit' + (r.copies.length === 1 ? 'y' : 'ies') + '.');
      },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); if (UI.sketchFeedbackClear) UI.sketchFeedbackClear(); if (edit) editHideOff(); }
    });
    // lane DS: while an Edit Circular / Linear Pattern PM is open the old instances (and the pattern's construction
    // lines, points and dimensions) are hidden, so only the preview shows where the instances will be; ✗ shows them again
    if (edit) editHideOn(f, edit.rel);
    if (circular) { syncPolar(); UI.renderPM(); }
    if (!v.entities.length) UI.setStatus('Select the sketch entities to pattern in the graphics area.');
    preview();
  }
  function cmdSketchPattern() { patternTool(false); }
  function cmdCircularSketchPattern() { patternTool(true); }

  // ------------------------------------------------------------------ lane DM: Edit Circular Pattern, instance count
  // A circular sketch pattern is the seeds, their copies and two construction lines from the centre (L0 to the seed,
  // L1 one step on) held by one Pattern relation (S.circularPattern: refs [L0, L1, m seeds, copies], pat { circ, m,
  // inst }); the PM's settings are kept on it as pat.spec, and pat.showCount = Display instance count. Edit Circular
  // Pattern (right-click an instance or seed) reopens the PM with them; ✓ takes out the old copies and lines (their
  // relations and dimensions go with them, S.removeEntity) and makes the pattern again from the same seeds.
  function lastPatternRel(f, linear) { for (var j = (f.rels || []).length - 1; j >= 0; j--) if (f.rels[j].type === 'pattern' && f.rels[j].pat && !f.rels[j].pat.circ === !!linear) return f.rels[j]; return null; }
  function circPatternOf(f, i) {
    var found = null;
    (f.rels || []).forEach(function (rel, j) { if (found == null && rel.type === 'pattern' && rel.pat && rel.pat.circ && rel.refs.slice(2).indexOf(String(i)) >= 0) found = j; });
    return found;
  }
  // the entities a sketch pattern made (lane DS: linear too): circular — the two construction lines and the copies;
  // linear (refs [A00, one anchor per direction, m seeds, copies], pat { nd, m, inst }) — the copies, a construction
  // point standing for a skipped first instance, and the two construction lines of Dimension angle between axes
  // (Coincident from their p1 to A00 and their p2 to a direction anchor)
  function patternMadeIdx(f, ri) {
    var rel = f.rels[ri], pat = rel.pat, m = pat.m | 0, out;
    if (pat.circ) out = [+rel.refs[0], +rel.refs[1]].concat(rel.refs.slice(2 + m).map(Number));
    else {
      var nd = pat.nd | 0, A00 = rel.refs[0], dirA = rel.refs.slice(1, 1 + nd), seeds = rel.refs.slice(1 + nd, 1 + nd + m).map(Number);
      out = rel.refs.slice(1 + nd + m).map(Number);
      dirA.forEach(function (a) { var e = /^\d+$/.test(a) ? f.entities[+a] : null; if (e && e.t === 'point' && e.construction && seeds.indexOf(+a) < 0 && out.indexOf(+a) < 0) out.push(+a); });
      (f.rels || []).forEach(function (c) {
        var mm = c.type === 'coincident' && c.refs[1] === A00 && /^(\d+)\.p1$/.exec(c.refs[0]), L = mm ? +mm[1] : -1, e = L >= 0 ? f.entities[L] : null;
        if (!e || e.t !== 'line' || !e.construction || out.indexOf(L) >= 0 || seeds.indexOf(L) >= 0) return;
        if (f.rels.some(function (c2) { return c2.type === 'coincident' && c2.refs[0] === L + '.p2' && dirA.indexOf(c2.refs[1]) >= 0; })) out.push(L);
      });
    }
    return out.filter(function (i) { return i >= 0 && !!f.entities[i]; });
  }
  function removePatternMade(f, ri) {
    patternMadeIdx(f, ri).sort(function (a, b) { return b - a; }).forEach(function (i) { if (f.entities[i]) { S.removeEntity(f, i); f.entities.splice(i, 1); } });
  }
  // lane DS: the old instances are hidden while the edit PM is open: by entity object (indices do not move until ✓),
  // through the layer hooks every draw / pick / snap path already asks (UI.sketchLayerStyle, UI.entityLayerHidden:
  // wrapped once, on the first edit, so the layer and level wrappers loaded after this file sit inside), plus the
  // dimensions and the instance count drawn on them (the drawDims wrapper below)
  var editHide = null;
  function editHidden(f, e) { return !!(editHide && f && f.id === editHide.sketch && e && editHide.ents.indexOf(e) >= 0); }
  function editHideOn(f, ri) {
    if (!UI.rfDSHideWrapped) {
      UI.rfDSHideWrapped = true;
      var baseStyle = UI.sketchLayerStyle, baseHidden = UI.entityLayerHidden;
      UI.sketchLayerStyle = function (f2, e) { if (editHidden(f2, e)) return { hidden: true, mat: null, dashed: false }; return baseStyle ? baseStyle.apply(this, arguments) : null; };
      UI.entityLayerHidden = function (f2, e) { return editHidden(f2, e) || (baseHidden ? baseHidden.apply(this, arguments) : false); };
    }
    editHide = { sketch: f.id, rel: f.rels[ri], ents: patternMadeIdx(f, ri).map(function (i) { return f.entities[i]; }) };
    App.dimsStale = true; UI.updateSketches();
  }
  function editHideOff() { if (!editHide) return; editHide = null; App.dimsStale = true; UI.updateSketches(); }
  UI.sketchPatternEditHidden = function () { return editHide ? editHide.ents.length : 0; };
  // the dimensions (placed, or distance / angle relations) on a hidden instance are not drawn while the edit is open
  function hideEditDims() {
    var host = document.getElementById('dim-layer'), f = App.mode === 'sketch' ? UI.activeSketchFeature() : null;
    if (!host) return;
    Array.prototype.forEach.call(host.querySelectorAll('text'), function (t) {
      var it = t._d, g = t.parentNode, hide = false;
      if (!it || !g || !g.style) return;
      if (editHide && f && f.id === editHide.sketch) {
        if (it.rel != null) { var rel = f.rels && f.rels[it.rel]; hide = !!rel && rel.refs.some(function (r) { return editHidden(f, f.entities[parseInt(r, 10)]); }); }
        else if (it.d && it.d.e != null) hide = editHidden(f, f.entities[it.d.e]);
      }
      g.style.display = hide ? 'none' : '';
    });
  }
  function editCircularPattern(i) {
    var f = sketch();
    if (!f) return;
    var ri = circPatternOf(f, i);
    if (ri == null) { UI.toast('That entity is not part of a circular sketch pattern.'); return; }
    var rel = f.rels[ri], pat = rel.pat, m = pat.m | 0, E = f.entities, L0 = E[+rel.refs[0]], L1 = E[+rel.refs[1]], sp = pat.spec || {};
    var seeds = rel.refs.slice(2, 2 + m).map(Number), C = [L0.x1, L0.y1];
    var stepA = (Math.atan2(L1.y2 - C[1], L1.x2 - C[0]) - Math.atan2(L0.y2 - C[1], L0.x2 - C[0])) * 180 / Math.PI;
    while (stepA > 180) stepA -= 360;
    while (stepA <= -180) stepA += 360;
    var n = sp.count || (Math.max.apply(null, pat.inst) + 1), equal = sp.equal != null ? sp.equal : true;
    var tot = sp.angle != null ? sp.angle : Math.abs(stepA) * (Math.abs(stepA * n) >= 360 - 1e-6 ? n : n - 1);
    var skip = [];
    for (var k = 1; k < n; k++) if (pat.inst.indexOf(k) < 0) skip.push(String(k));
    patternTool(true, { rel: ri, values: { entities: seeds, cx: Math.round(C[0] * 1e6) / 1e6, cy: Math.round(C[1] * 1e6) / 1e6, count: n, angle: tot, rev: sp.rev != null ? sp.rev : stepA < 0, equal: equal,
      dimRadius: sp.dimRadius != null ? sp.dimRadius : true, dimAngle: sp.dimAngle != null ? sp.dimAngle : true, skip: skip, showCount: !!pat.showCount } });
  }
  UI.editCircularPattern = editCircularPattern;
  // lane DS: Edit Linear Pattern (right-click an instance or seed of a linear sketch pattern), as the circular one: the
  // PM reopens with the pattern's settings (pat.spec when the PM made it; else read back from the anchors: each
  // direction's spacing and angle from the seed's anchor to its first instance, the counts and skipped instances from
  // pat.inst, Dimension X / Y spacing from the distance relations on those anchors)
  function linPatternOf(f, i) {
    var found = null;
    (f.rels || []).forEach(function (rel, j) { if (found == null && rel.type === 'pattern' && rel.pat && !rel.pat.circ && rel.refs.slice(1 + (rel.pat.nd | 0)).indexOf(String(i)) >= 0) found = j; });
    return found;
  }
  function editLinearPattern(i) {
    var f = sketch();
    if (!f) return;
    var ri = linPatternOf(f, i);
    if (ri == null) { UI.toast('That entity is not part of a linear sketch pattern.'); return; }
    var rel = f.rels[ri], pat = rel.pat, nd = pat.nd | 0, m = pat.m | 0, sp = pat.spec, A00 = rel.refs[0], P00 = S.refPoint(f, A00);
    var vals = { entities: rel.refs.slice(1 + nd, 1 + nd + m).map(Number) };
    function r6v(x) { return Math.round(x * 1e6) / 1e6; }
    // which grid index each pat.inst column is: [i] / [i, j] when both directions are there; a pattern along
    // direction 2 alone (count 1 in direction 1) keeps [j]
    var cols = nd > 1 ? [0, 1] : sp && (sp.count | 0) < 2 && (sp.count2 | 0) > 1 ? [1] : [0];
    if (sp) Object.keys(sp).forEach(function (k) { vals[k] = sp[k]; });
    else {
      var dirs = rel.refs.slice(1, 1 + nd).map(function (a) { var q = S.refPoint(f, a); return q && P00 ? [q[0] - P00[0], q[1] - P00[1]] : [1, 0]; });
      var hasDim = function (a) { return (f.rels || []).some(function (r) { return r.type === 'distance' && r.refs[0] === A00 && r.refs[1] === a; }); };
      var cnt = function (c) { var mx = 0; pat.inst.forEach(function (q) { mx = Math.max(mx, q[c] | 0); }); return mx + 1; };
      vals.ref1 = 'x'; vals.ref2 = 'y'; vals.rev1 = vals.rev2 = false;
      vals.angle = r6v(Math.atan2(dirs[0][1], dirs[0][0]) * 180 / Math.PI); vals.spacing = r6v(Math.hypot(dirs[0][0], dirs[0][1])); vals.count = cnt(0); vals.dims = hasDim(rel.refs[1]);
      if (nd > 1) { vals.angle2 = r6v(Math.atan2(dirs[1][1], dirs[1][0]) * 180 / Math.PI); vals.spacing2 = r6v(Math.hypot(dirs[1][0], dirs[1][1])); vals.count2 = cnt(1); vals.dimY = hasDim(rel.refs[2]); }
      else vals.count2 = 1;
    }
    var have = {}, skip = [];
    pat.inst.forEach(function (q) { var ij = [0, 0]; cols.forEach(function (c, k) { ij[c] = q[k] | 0; }); have[ij[0] + ',' + ij[1]] = true; });
    for (var a = 0; a < Math.max(1, vals.count | 0); a++) for (var b = 0; b < Math.max(1, vals.count2 | 0); b++) if ((a || b) && !have[a + ',' + b]) skip.push(a + ',' + b);
    vals.skip = skip;
    patternTool(false, { rel: ri, values: vals });
  }
  UI.editLinearPattern = editLinearPattern;
  UI.linearPatternOf = function (i) { var f = sketch(); return f ? linPatternOf(f, i) : null; };
  // lane DS2: the direction line saved in pat.spec (ref1 / ref2, an entity index) follows deletions and renumbering
  // (Kernel.patternEntityRemoved / remapPatternRefs), wrapped round the solver's remap points as Sketch Text's path is
  if (S && K.patternEntityRemoved) {
    var baseRemoveP = S.removeEntity, baseRemapP = S.remap, baseAfterTrimP = S.afterTrim;
    if (baseRemoveP) S.removeEntity = function (sk, index) { var r = baseRemoveP.apply(this, arguments); K.patternEntityRemoved(sk, index); return r; };
    if (baseRemapP) S.remap = function (sk, before) { var r = baseRemapP.apply(this, arguments); K.remapPatternRefs(sk, before); return r; };
    if (baseAfterTrimP) S.afterTrim = function (sk, before) { var r = baseAfterTrimP.apply(this, arguments); K.remapPatternRefs(sk, before); return r; };
  }
  UI.circularPatternOf = function (i) { var f = sketch(); return f ? circPatternOf(f, i) : null; };
  // the count labels: by the last instance of every pattern with Display instance count, in #dim-layer (redrawn with
  // the dimensions: UI.drawDims below), orange as SolidWorks shows the instance count
  var countLayer = null, SVGNS_C = 'http://www.w3.org/2000/svg';
  function sketchPatternCounts() {
    var host = document.getElementById('dim-layer');
    if (!host) return [];
    if (!countLayer) { countLayer = document.createElementNS(SVGNS_C, 'g'); countLayer.setAttribute('class', 'sk-pat-counts'); countLayer.setAttribute('pointer-events', 'none'); }
    while (countLayer.firstChild) countLayer.removeChild(countLayer.firstChild);
    var f = App.mode === 'sketch' ? UI.activeSketchFeature() : null, out = [];
    ((f && f.rels) || []).forEach(function (rel) {
      if (rel.type !== 'pattern' || !rel.pat || !rel.pat.showCount || (editHide && editHide.rel === rel)) return;   // lane DS: not on instances an edit hides
      var m = rel.pat.m | 0, last = rel.refs[rel.refs.length - m], e = last != null ? f.entities[+last] : null, p = e && anchorPt(e);
      if (!p) return;
      var n = rel.pat.spec && rel.pat.spec.count ? rel.pat.spec.count : rel.pat.inst.length + 1, s = scr(p);
      var t = document.createElementNS(SVGNS_C, 'text');
      t.setAttribute('x', s[0].toFixed(1)); t.setAttribute('y', (s[1] - 18).toFixed(1)); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'sk-pat-count');
      t.setAttribute('style', 'fill:#e8891c;font:600 13px sans-serif');
      t.textContent = String(n);
      countLayer.appendChild(t); out.push({ text: String(n), at: p });
    });
    if (out.length) host.appendChild(countLayer); else if (countLayer.parentNode) countLayer.parentNode.removeChild(countLayer);
    return out;
  }
  UI.sketchPatternCounts = sketchPatternCounts;
  if (UI.drawDims) {
    var baseDrawDimsCount = UI.drawDims;
    UI.drawDims = function () { var r = baseDrawDimsCount.apply(this, arguments); try { sketchPatternCounts(); hideEditDims(); } catch (err) { /* an overlay: never break the dimensions */ } return r; };
  }
  // the right-click row on an instance or seed of a circular pattern (before Properties…, with the entity commands)
  if (UI.sketchMenuItems) {
    var baseSketchMenuItems = UI.sketchMenuItems;
    UI.sketchMenuItems = function () {
      var items = baseSketchMenuItems.apply(this, arguments), f = App.mode === 'sketch' ? UI.activeSketchFeature() : null;
      var sel = f ? selIdx(f) : [], ri = sel.length === 1 ? circPatternOf(f, sel[0]) : null, li = sel.length === 1 && ri == null ? linPatternOf(f, sel[0]) : null;
      if ((ri == null && li == null) || !Array.isArray(items)) return items;
      var row = ri != null ? { label: 'Edit Circular Pattern', icon: 'cSketchPattern', action: function () { if (App.mode === 'sketch') editCircularPattern(sel[0]); } }
        : { label: 'Edit Linear Pattern', icon: 'sketchPattern', action: function () { if (App.mode === 'sketch') editLinearPattern(sel[0]); } };   // lane DS
      var at = -1;
      items.forEach(function (it, k) { if (it && it.label === 'Properties…') at = k; });
      if (at < 0) items.push(row); else items.splice(at, 0, row);
      return items;
    };
  }


  // ------------------------------------------------------------------ Intersection Curve (Convert Entities flyout)
  // SolidWorks: Sketch tab ▸ Convert Entities ▸ Intersection Curve. Selections: model faces (planar or curved) picked in
  // the graphics area (a click toggles; faces selected when the command starts come in too); ✓ adds sketch curves where
  // the sketch plane cuts them. The cut is taken from the face's mesh triangles (each triangle against the plane, the
  // pieces chained end to end); a planar face gives lines (collinear pieces joined), a cylinder or cone square to the
  // sketch, or a sphere, a true circle or arc (the analytic surface records the facets carry, as Convert Entities uses
  // App.curves), any other curved face a chain of lines. Like converted entities they are held by On Edge.
  function r6(x) { return Math.round(x * 1e6) / 1e6; }
  // the faces a picked face stands for: every facet of its curved face (UI.faceGroup), a planar face alone
  function ixcGroup(fi) { var g = UI.faceGroup ? UI.faceGroup(fi) : [fi]; return g && g.length ? g.slice() : [fi]; }
  // the pieces of the faces' triangles in the sketch plane: [[a, b]] in sketch coordinates, each piece once
  function ixcSegments(group, pl) {
    var M = App.mesh, P = M.positions64 || M.positions, n = pl.n, o = pl.origin, out = [], seen = {};
    function key(p) { return Math.round(p[0] * 1e6) + ',' + Math.round(p[1] * 1e6); }
    group.forEach(function (fi) {
      var fc = M.faces[fi];
      if (!fc) return;
      for (var t = fc.start; t < fc.start + fc.count; t++) {
        var v = [], d = [], big = 1, k;
        for (k = 0; k < 3; k++) {
          var b = (t * 3 + k) * 3, p = [P[b], P[b + 1], P[b + 2]];
          v.push(p); d.push((p[0] - o[0]) * n[0] + (p[1] - o[1]) * n[1] + (p[2] - o[2]) * n[2]);
          big = Math.max(big, Math.abs(p[0]), Math.abs(p[1]), Math.abs(p[2]));
        }
        var eps = 1e-9 * big, pts = [];
        for (k = 0; k < 3; k++) if (Math.abs(d[k]) <= eps) pts.push(v[k]);
        if (pts.length === 3) continue;   // the triangle lies in the plane: no curve
        for (k = 0; k < 3; k++) {
          var l = (k + 1) % 3;
          if ((d[k] > eps && d[l] < -eps) || (d[k] < -eps && d[l] > eps)) { var s = d[k] / (d[k] - d[l]); pts.push([v[k][0] + (v[l][0] - v[k][0]) * s, v[k][1] + (v[l][1] - v[k][1]) * s, v[k][2] + (v[l][2] - v[k][2]) * s]); }
        }
        if (pts.length !== 2) continue;   // touches the plane at a corner only
        var a = K.to2D(pl, pts[0]), c = K.to2D(pl, pts[1]);
        if (Math.hypot(c[0] - a[0], c[1] - a[1]) < 1e-9 * big) continue;
        var ka = key(a), kc = key(c), kk = ka < kc ? ka + '|' + kc : kc + '|' + ka;
        if (seen[kk]) continue;   // an edge in the plane is in both triangles that share it
        seen[kk] = true;
        out.push([a, c]);
      }
    });
    return out;
  }
  // the pieces chained end to end: [{ pts, closed }] (open chains from their free ends first)
  function ixcChains(segs) {
    function key(p) { return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5); }
    var adj = {}, used = [], chains = [];
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { var k = key(s[e]); (adj[k] = adj[k] || []).push({ i: i, e: e }); }); });
    function walk(i0, e0) {
      var pts = [segs[i0][e0], segs[i0][1 - e0]], cur = i0, end = 1 - e0;
      used[i0] = true;
      for (;;) {
        var nx = (adj[key(segs[cur][end])] || []).filter(function (a) { return !used[a.i]; })[0];
        if (!nx) break;
        used[nx.i] = true; cur = nx.i; end = 1 - nx.e;
        pts.push(segs[cur][end]);
      }
      var closed = pts.length > 3 && key(pts[0]) === key(pts[pts.length - 1]);
      if (closed) pts.pop();
      return { pts: pts, closed: closed };
    }
    segs.forEach(function (s, i) { [0, 1].forEach(function (e) { if (!used[i] && (adj[key(s[e])] || []).length === 1) chains.push(walk(i, e)); }); });
    segs.forEach(function (s, i) { if (!used[i]) chains.push(walk(i, 0)); });
    return chains;
  }
  // a chain with its collinear runs joined (the triangles of a planar face cut one straight line into pieces)
  function ixcSimplify(ch) {
    var p = ch.pts, n = p.length, out = [];
    function straight(a, b, c) {
      var u = [b[0] - a[0], b[1] - a[1]], w = [c[0] - b[0], c[1] - b[1]], lu = Math.hypot(u[0], u[1]), lw = Math.hypot(w[0], w[1]);
      return lu < 1e-9 || lw < 1e-9 || (Math.abs(u[0] * w[1] - u[1] * w[0]) <= 1e-7 * lu * lw && u[0] * w[0] + u[1] * w[1] > 0);
    }
    for (var i = 0; i < n; i++) {
      if (!ch.closed && (i === 0 || i === n - 1)) { out.push(p[i]); continue; }
      var prev = out.length ? out[out.length - 1] : p[(i - 1 + n) % n];
      if (!straight(prev, p[i], p[(i + 1) % n])) out.push(p[i]);
    }
    if (ch.closed) while (out.length > 3 && straight(out[out.length - 1], out[0], out[1])) out.shift();
    return { pts: out, closed: ch.closed };
  }
  // the circle a curved face's surface makes in the sketch plane: { c: [u, v], r } or null (not a circle there)
  function ixcCircle(group, pl) {
    var fc = App.mesh.faces[group[0]], p0 = fc && fc.polys && fc.polys[0], S0 = p0 && p0.surf && p0.surf.s, V = K.vec;
    if (!S0 || !S0.o || !S0.d) return null;
    var n = pl.n, c3, R;
    if (S0.t === 'cyl' || S0.t === 'cone') {
      var dn = V.dot(S0.d, n);
      if (Math.abs(Math.abs(dn) - 1) > 1e-9) return null;   // the axis is not square to the sketch
      var z = V.dot(V.sub(pl.origin, S0.o), n) / dn;
      c3 = V.add(S0.o, V.scale(S0.d, z)); R = S0.r + (S0.t === 'cone' ? (S0.k || 0) * z : 0);
    } else if (S0.t === 'sph') {
      var h = V.dot(V.sub(S0.o, pl.origin), n);
      if (!(S0.r > Math.abs(h))) return null;
      c3 = V.sub(S0.o, V.scale(n, h)); R = Math.sqrt(S0.r * S0.r - h * h);
    } else return null;
    return R > 1e-9 ? { c: K.to2D(pl, c3), r: R } : null;
  }
  // lane sketchgaps-3: the ellipse a cylinder makes in a sketch plane its axis crosses at an angle (SolidWorks gives an
  // ellipse there, Anvil gave the facets' lines): centre where the axis meets the plane, minor semi-axis r square to
  // the axis, major r / |cos| along the axis' shadow. -> { c, rx, ry, rot (degrees), frame } or null
  function ixcEllipse(group, pl) {
    var fc = App.mesh.faces[group[0]], p0 = fc && fc.polys && fc.polys[0], S0 = p0 && p0.surf && p0.surf.s, V = K.vec;
    if (!S0 || S0.t !== 'cyl' || !S0.o || !S0.d || !(S0.r > 0)) return null;
    var n = pl.n, d = V.norm(S0.d), dn = V.dot(d, n);
    if (Math.abs(dn) < 1e-6 || Math.abs(Math.abs(dn) - 1) <= 1e-9) return null;   // along the plane (lines) or square (a circle)
    var z = V.dot(V.sub(pl.origin, S0.o), n) / dn, c3 = V.add(S0.o, V.scale(d, z));
    var w3 = V.norm(V.sub(d, V.scale(n, dn))), c = K.to2D(pl, c3), wTip = K.to2D(pl, V.add(c3, w3));
    return { c: c, rx: S0.r / Math.abs(dn), ry: S0.r, rot: Math.atan2(wTip[1] - c[1], wTip[0] - c[0]) * 180 / Math.PI };
  }
  // sketch entities where the sketch plane cuts the faces of one picked face: circles / arcs, ellipses / partial
  // ellipses, else lines
  // lane sketchref2: each piece names the face it came from (src k 'xsect', non-enumerable _src), so UI.attachModelRef
  // makes its On Edge follow the model (kernel-sketch.js resolveXsect)
  function ixcGeometry(fi) {
    var out = ixcGeometry0(fi), fc = App.mesh && App.mesh.faces[fi], p0 = fc && fc.polys && fc.polys[0], pl = UI.activePlane();
    var fid = p0 && p0.shared != null ? p0.shared : App.triShared && fc ? App.triShared[fc.start] : null, curved = !!(p0 && p0.surf);
    if (fid == null || fid < 0 || !fc) return out;
    out.forEach(function (e) {
      var form = e.t === 'line' ? 'line' : e.t === 'circle' || e.t === 'arc' ? 'circle' : 'ellipse';
      var at = e.t === 'line' ? K.to3D(pl, (e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2) : K.to3D(pl, e.cx, e.cy);
      try { Object.defineProperty(e, '_src', { value: { k: 'xsect', fid: fid, n: curved ? null : fc.normal.slice(), form: form, at: at, full: e.t !== 'arc' && e.t !== 'pellipse' }, enumerable: false, configurable: true, writable: true }); } catch (err) { /* frozen */ }
    });
    return out;
  }
  function ixcGeometry0(fi) {
    var pl = UI.activePlane(), group = ixcGroup(fi), chains = ixcChains(ixcSegments(group, pl)), circ = chains.length ? ixcCircle(group, pl) : null, out = [];
    var ell = chains.length && !circ ? ixcEllipse(group, pl) : null;
    chains.forEach(function (ch) {
      if (ell && ch.pts.length >= 2) {
        var cr = Math.cos(ell.rot * Math.PI / 180), sr = Math.sin(ell.rot * Math.PI / 180);
        var par = function (q) { var x = q[0] - ell.c[0], y = q[1] - ell.c[1]; return Math.atan2((-sr * x + cr * y) / ell.ry, (cr * x + sr * y) / ell.rx); };
        var near = ch.pts.every(function (q) { var x = q[0] - ell.c[0], y = q[1] - ell.c[1], u = (cr * x + sr * y) / ell.rx, v = (-sr * x + cr * y) / ell.ry; return Math.abs(Math.hypot(u, v) - 1) <= 0.05; });
        if (near) {
          var base = { cx: r6(ell.c[0]), cy: r6(ell.c[1]), rx: r6(ell.rx), ry: r6(ell.ry), rot: r6(((ell.rot % 180) + 180) % 180) };
          if (base.rot !== r6(ell.rot)) { cr = -cr; sr = -sr; }   // the axis turned by 180°: the parameter turns with it
          var es = 0;
          for (var q = 1; q < ch.pts.length; q++) { var du = par(ch.pts[q]) - par(ch.pts[q - 1]); while (du > Math.PI) du -= 2 * Math.PI; while (du < -Math.PI) du += 2 * Math.PI; es += du; }
          if (ch.closed || Math.abs(es) >= 2 * Math.PI - 1e-6) { out.push(Object.assign({ t: 'ellipse' }, base)); return; }
          var u0 = (es >= 0 ? par(ch.pts[0]) : par(ch.pts[ch.pts.length - 1])) * 180 / Math.PI, swE = Math.abs(es) * 180 / Math.PI;
          while (u0 < 0) u0 += 360;
          while (u0 >= 360) u0 -= 360;
          out.push(Object.assign({ t: 'pellipse' }, base, { a0: r6(u0), a1: r6(u0 + swE) }));
          return;
        }
      }
      if (circ && ch.pts.length >= 2) {
        var C = circ.c, R = circ.r, onIt = ch.pts.every(function (q) { return Math.abs(Math.hypot(q[0] - C[0], q[1] - C[1]) - R) <= 0.05 * R + 1e-6; });
        if (onIt) {
          if (ch.closed) { out.push({ t: 'circle', cx: r6(C[0]), cy: r6(C[1]), r: r6(R) }); return; }
          // an arc from the chain's first point to its last, the way the chain runs (stored counter-clockwise)
          var ang = function (q) { return Math.atan2(q[1] - C[1], q[0] - C[0]); }, sweep = 0;
          for (var k = 1; k < ch.pts.length; k++) { var dA = ang(ch.pts[k]) - ang(ch.pts[k - 1]); while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI; sweep += dA; }
          var a0 = (sweep >= 0 ? ang(ch.pts[0]) : ang(ch.pts[ch.pts.length - 1])) * 180 / Math.PI, sw = Math.abs(sweep) * 180 / Math.PI;
          if (sw >= 360 - 1e-6) { out.push({ t: 'circle', cx: r6(C[0]), cy: r6(C[1]), r: r6(R) }); return; }
          while (a0 < 0) a0 += 360;
          while (a0 >= 360) a0 -= 360;
          out.push({ t: 'arc', cx: r6(C[0]), cy: r6(C[1]), r: r6(R), a0: r6(a0), a1: r6(a0 + sw) });
          return;
        }
      }
      var s = ixcSimplify(ch), q = s.pts, m = s.closed ? q.length : q.length - 1;
      for (var i = 0; i < m; i++) {
        var a = q[i], b = q[(i + 1) % q.length];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-9) out.push({ t: 'line', x1: r6(a[0]), y1: r6(a[1]), x2: r6(b[0]), y2: r6(b[1]) });
      }
    });
    return out;
  }
  UI.intersectionCurveGeometry = function (faces) { var out = []; (faces || []).forEach(function (fi) { out = out.concat(ixcGeometry(fi)); }); return out; };
  UI.intersectionCurveOpen = function () { var sp = UI.pmSpec && UI.pmSpec(); return !!(sp && sp.intersectionCurve); };
  function cmdIntersectionCurve(faces) {
    var f = sketch();
    if (!f) return;
    if (!App.mesh || !App.mesh.faces || !App.mesh.faces.length) { UI.toast('There is no model yet: Intersection Curve cuts model faces with the sketch plane.'); return; }
    var v = { items: [] };   // picked faces: { index, group }
    function has(fi) { var k = -1; v.items.forEach(function (it, i) { if (it.group.indexOf(fi) >= 0) k = i; }); return k; }
    function addFace(fi) { if (fi == null || !App.mesh.faces[fi]) return; var k = has(fi); if (k >= 0) v.items.splice(k, 1); else v.items.push({ index: fi, group: ixcGroup(fi) }); }
    function geometry() { var out = []; v.items.forEach(function (it) { out = out.concat(ixcGeometry(it.index)); }); return out; }
    function preview() {
      var g = [];
      try { g = geometry(); } catch (e) { UI.setStatus(e.message); }
      App.tempEntities = g; UI.updateTemp();
      if (v.items.length && !g.length) UI.setStatus('The sketch plane does not cut the selected faces.');
    }
    // faces selected when the command starts (or passed in by a script) come in at once
    var pre = Array.isArray(faces) ? faces : (UI.selection ? UI.selection() : []).filter(function (s) { return s.kind === 'face'; }).map(function (s) { return s.index; });
    pre.forEach(function (fi) { if (has(fi) < 0) addFace(fi); });
    UI.openPM({
      title: 'Intersection Curve', icon: 'intersectCurve', values: v, intersectionCurve: true,
      message: 'Select faces to intersect with the sketch plane. The curves where the plane cuts them are added to the sketch.',
      command: {
        ownHover: true,
        onSketchMove: function (uv, mx, my) {
          UI.sketchFeedbackClear();
          var fc = UI.pickFace ? UI.pickFace(mx, my) : null;
          if (!fc || fc.index == null) return;
          try { UI.sketchPreview(ixcGeometry(fc.index).map(function (e) { return entPts(e)[0]; }), HOT_STYLE, 'sk-trim-span'); } catch (e) { }
        },
        onSketchPoint: function (uv, mx, my) {
          var fc = UI.pickFace ? UI.pickFace(mx, my) : null;
          if (!fc || fc.index == null) { UI.setStatus('Click a model face.'); return; }
          addFace(fc.index);
          UI.renderPM(); preview();
        }
      },
      groups: [{ title: 'Selections', fields: [
        { type: 'pick', icon: 'intersectCurve', placeholder: 'Select faces…', value: function (x) { return x.items.length ? x.items.length + ' face' + (x.items.length > 1 ? 's' : '') : ''; },
          items: function (x) { return x.items.map(function (it, k) { return { label: 'Face<' + (k + 1) + '>' }; }); },
          onRemove: function (x, i) { x.items.splice(i, 1); UI.renderPM(); preview(); }, onClear: function (x) { x.items.length = 0; UI.renderPM(); preview(); } }
      ] }],
      onChange: preview,
      okBlocked: function () { return v.items.length ? '' : 'Select the faces to intersect with the sketch plane.'; },
      onOK: function () {
        var geo = geometry(), n = 0;
        if (!geo.length) { UI.toast('The sketch plane does not cut the selected faces.'); return false; }
        var r = step(function () {
          geo.forEach(function (g) {
            var keys = S.paramNames(g);
            var dup = f.entities.some(function (o) { return o.t === g.t && keys.every(function (k) { return Math.abs((+o[k] || 0) - g[k]) < 1e-6 * Math.max(1, Math.abs(g[k])); }); });
            if (dup) return;
            f.entities.push(g);
            var ar = S.addRelation(f, 'onEdge', [String(f.entities.length - 1)]);
            if (!ar.ok) throw new Error(ar.error);
            if (g._src && UI.attachModelRef && ar.rels && ar.rels.length) UI.attachModelRef(f, ar.rels[0], g._src);   // lane sketchref2: follows its face
            n++;
          });
          return n ? { ok: true } : { ok: false, error: 'Those intersection curves are already in the sketch.' };
        }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus('Intersection Curve: ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + ' added where the sketch plane cuts the face' + (v.items.length === 1 ? '' : 's') + ' (On Edge).');
      },
      onCancel: clearPreview,
      onClose: function () { UI.sketchFeedbackClear(); }
    });
    preview();
    if (!v.items.length) UI.setStatus('Select model faces: the sketch plane cuts them in the curves added.');
  }

  // ------------------------------------------------------------------ Dynamic Mirror (Mirror Entities flyout)
  // SolidWorks: Tools ▸ Sketch Tools ▸ Dynamic Mirror. With a centerline (or any line) selected, the button turns it on:
  // the line shows "=" marks at its ends, and every entity drawn while it is on is mirrored about it — the mirror image
  // shows while drawing, and on placement both go into the sketch, the copy held Symmetric to its original as Mirror
  // Entities holds it (SketchSolver.mirrorRelations), in the same undo step. Nothing selected: the Mirror
  // PropertyManager asks for the line. Off: the button again, Esc with no tool (Esc twice while drawing), or leaving the
  // sketch. sketch-hooks: the drawing tools commit through ui-sketch.js placePoint (Spline and the tools that add
  // their own entities call UI.afterSketchCommit themselves), and UI.sketchCommitHooks runs dynCommit in that same
  // click, after the tool's own after() hooks and typed dimensions; the mirror image of the entity being drawn comes
  // through UI.tempEntityHooks and the "=" marks through UI.sketchOverlayHooks (ui-core.js).
  var dyn = null;   // { sketch: id, axis: index, ax: [x1, y1, x2, y2], last: { src, copies } }
  var DYN_TOOLS_OFF = { select: 1, dimension: 1 };
  // a drawing tool is out, or a command that places sketch entities and says so (command.dynMirror: Parallel Line)
  function dynDrawing() {
    if (App.mode !== 'sketch') return false;
    if (App.command && App.command.dynMirror) return true;
    return !!App.tool && !DYN_TOOLS_OFF[App.tool] && !(App.command && App.command.onSketchPoint);
  }
  // the mirror line in sketch f: its index (it may have moved in the list), or -1 when it is gone
  function dynAxis(f) {
    if (!dyn || !f) return -1;
    var e = f.entities[dyn.axis];
    if (e && e.t === 'line') { dyn.ax = [e.x1, e.y1, e.x2, e.y2]; return dyn.axis; }
    for (var i = 0; i < f.entities.length; i++) {
      var o = f.entities[i];
      if (o && o.t === 'line' && Math.abs(o.x1 - dyn.ax[0]) < 1e-9 && Math.abs(o.y1 - dyn.ax[1]) < 1e-9 && Math.abs(o.x2 - dyn.ax[2]) < 1e-9 && Math.abs(o.y2 - dyn.ax[3]) < 1e-9) { dyn.axis = i; return i; }
    }
    return -1;
  }
  function tidy(e) { Object.keys(e).forEach(function (k) { if (typeof e[k] === 'number') e[k] = +e[k].toPrecision(12) + 0; }); if (e.pts) e.pts = e.pts.map(function (p) { return [+p[0].toPrecision(12) + 0, +p[1].toPrecision(12) + 0]; }); return e; }
  // e's mirror image is e itself (a line along the mirror line, a circle centred on it …)
  function selfMirror(e, m) {
    if (e.t !== m.t) return false;
    function near(a, b) { return Math.abs(a - b) <= 1e-7 * Math.max(1, Math.abs(a), Math.abs(b)); }
    if (e.t === 'line' && near(e.x1, m.x2) && near(e.y1, m.y2) && near(e.x2, m.x1) && near(e.y2, m.y1)) return true;
    if (e.pts || m.pts) return JSON.stringify(e.pts) === JSON.stringify(m.pts);
    return S.paramNames(e).every(function (k) { return typeof e[k] !== 'number' || near(e[k], m[k]); });
  }
  function dynMirrorOf(f, ai, list) {
    var ax = K.mirrorAxis(ai, f.entities), out = [];
    list.forEach(function (e) { var m = null; try { m = K.mirrorEntity(e, ax); } catch (x) { m = null; } out.push(m && !selfMirror(e, m) ? tidy(m) : null); });
    return out;
  }
  function dynOn(f, i) {
    var e = f.entities[i];
    dyn = { sketch: f.id, axis: i, ax: [e.x1, e.y1, e.x2, e.y2], last: null };
    UI.updateSketches(); UI.refreshRibbon();
    UI.setStatus('Dynamic Mirror on about ' + (e.construction ? 'Centerline' : 'Line') + (i + 1) + ': what you draw is mirrored about it. Click Dynamic Mirror again (or Esc with no tool) to turn it off.');
  }
  function dynOff(msg) {
    if (!dyn) return;
    dyn = null;
    if (App.tempEntities && App.tempEntities.length) UI.updateTemp();
    UI.updateSketches(); UI.refreshRibbon();
    if (msg) UI.setStatus(msg);
  }
  // one Esc ends every function (user, 2026-10-14): Dynamic Mirror goes off with the tool in hand (ui-commands.js escapeCommand)
  UI.escapeTools = UI.escapeTools || [];
  UI.escapeTools.push(function () { if (!dyn) return false; dynOff('Dynamic Mirror off.'); return true; });
  // a drawing tool committed f.entities.slice(n0) (UI.sketchCommitHooks): each is mirrored at once, in the same undo
  // step, the copy held Symmetric to its original (only drawing tools call the hook: Text has already put itself
  // down when it does, so the tool in hand is not asked again)
  function dynCommit(f, n0) {
    if (!dyn || !f || f.id !== dyn.sketch || App.mode !== 'sketch' || App.activeSketch !== dyn.sketch) return;
    var n = f.entities.length;
    if (!(n0 < n)) return;
    var ai = dynAxis(f);
    if (ai < 0) { dynOff('Dynamic Mirror is off: its mirror line is gone.'); return; }
    var src = [], k;
    for (k = n0; k < n; k++) if (k !== ai && f.entities[k]) src.push(k);
    var ms = dynMirrorOf(f, ai, src.map(function (i) { return f.entities[i]; })), pairs = [];
    src.forEach(function (i, j) { if (!ms[j]) return; f.entities.push(ms[j]); pairs.push([i, f.entities.length - 1]); });
    if (!pairs.length) return;
    var nSym = 0;
    try { nSym = S.mirrorRelations(f, pairs, ai); } catch (x) { nSym = 0; }
    dyn.last = { src: pairs.map(function (p) { return p[0]; }), copies: pairs.map(function (p) { return p[1]; }) };
    App.gridStale = true; App.dimsStale = true;
    UI.updateSketches(); UI.refreshTree();
    UI.setStatus('Dynamic Mirror: ' + pairs.length + ' entit' + (pairs.length === 1 ? 'y' : 'ies') + ' mirrored' + (nSym ? ', held Symmetric about Line' + (ai + 1) : '') + '.');
  }
  // the "=" marks at the mirror line's ends (drawn with the sketch, through the sketch-regions hook of the redraw)
  var dynMat = null;
  function dynMarks(f, pl) {
    var ai = dynAxis(f);
    if (ai < 0 || typeof THREE === 'undefined') return [];
    var e = f.entities[ai], A = [e.x1, e.y1], B = [e.x2, e.y2], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (L < 1e-12) return [];
    var s = (UI.cam && UI.cam.scale) || 0.1, u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], nr = [-u[1], u[0]], half = 5 * s, pos = [];
    [[A, 1], [B, -1]].forEach(function (q) {
      [7, 11].forEach(function (px) {
        var c = [q[0][0] + u[0] * q[1] * Math.min(px * s, L / 3), q[0][1] + u[1] * q[1] * Math.min(px * s, L / 3)];
        pos.push.apply(pos, K.to3D(pl, c[0] - nr[0] * half, c[1] - nr[1] * half));
        pos.push.apply(pos, K.to3D(pl, c[0] + nr[0] * half, c[1] + nr[1] * half));
      });
    });
    if (!dynMat) dynMat = new THREE.LineBasicMaterial({ color: 0x1f8a3a, depthTest: false, transparent: true });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    var ls = new THREE.LineSegments(g, dynMat);
    ls.renderOrder = 12;
    ls.userData = { dynMirrorMarks: true };
    return [ls];
  }
  // sketch-hooks: the marks go with the active sketch's redraw, the mirror image of the entity being drawn with the
  // preview, the copies in the committing click, and leaving the sketch turns it off
  if (UI.sketchOverlayHooks) UI.sketchOverlayHooks.push(function (f, pl) { return dyn && f && f.id === dyn.sketch ? dynMarks(f, pl) : []; });
  if (UI.tempEntityHooks) UI.tempEntityHooks.push(function (list) {
    if (!dyn || !list || !list.length || !dynDrawing() || App.activeSketch !== dyn.sketch) return null;
    var f = UI.activeSketchFeature(), ai = dynAxis(f);
    return ai < 0 ? null : dynMirrorOf(f, ai, list).filter(Boolean);
  });
  if (UI.sketchCommitHooks) UI.sketchCommitHooks.push(dynCommit);
  if (UI.sketchExitHooks) UI.sketchExitHooks.push(function () { if (dyn) dynOff(); });
  // Esc with no tool and no PropertyManager (the second Esc while drawing) turns it off
  document.addEventListener('keydown', function (ev) {
    if (!dyn || ev.key !== 'Escape' || App.mode !== 'sketch') return;
    var tag = (ev.target && ev.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (App.tool === 'select' && !(UI.hasPM && UI.hasPM())) dynOff('Dynamic Mirror off.');
  }, true);
  // A double-click ends a Line chain and ui-sketch.js takes back the stub its second click placed, when that stub is the
  // last entity: its mirror image (added after it) goes first, so the stub can go too.
  document.addEventListener('dblclick', function () {
    if (!dyn || !dyn.last || App.mode !== 'sketch' || App.tool !== 'line') return;
    var st = App.toolState, f = UI.activeSketchFeature(), L = dyn.last;
    if (!st || !st.lastSeg || !st.lastSeg.quick || !f || L.src.length !== 1 || L.src[0] !== st.lastSeg.index || L.copies[0] !== f.entities.length - 1 || st.lastSeg.index !== f.entities.length - 2) return;
    var e = f.entities[st.lastSeg.index], pl = UI.activePlane();
    if (!e || e.t !== 'line') return;
    var a = UI.worldToScreen(K.to3D(pl, e.x1, e.y1)), b = UI.worldToScreen(K.to3D(pl, e.x2, e.y2));
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) >= 6) return;
    var ci = f.entities.length - 1;
    f.entities.pop();
    S.removeEntity(f, ci);
    if (f.dims) f.dims = f.dims.filter(function (d) { return d.e !== ci; });
    dyn.last = null;
  }, true);
  UI.dynamicMirrorOn = function () { return !!dyn && App.mode === 'sketch' && App.activeSketch === dyn.sketch; };
  UI.dynamicMirrorState = function () { return dyn ? { sketch: dyn.sketch, axis: dyn.axis } : null; };
  function cmdDynamicMirror() {
    if (dyn) { dynOff('Dynamic Mirror off.'); return; }
    var f = sketch();
    if (!f) return;
    var lines = selIdx(f).filter(function (i) { return f.entities[i].t === 'line'; });
    if (lines.length === 1) { dynOn(f, lines[0]); return; }
    // nothing (or more than one line) selected: the Mirror PropertyManager asks for the line to mirror about
    var v = { axis: null };
    UI.openPM({
      title: 'Mirror', icon: 'dynMirror', values: v,
      message: 'Select a centerline or a line to mirror about. Dynamic Mirror then mirrors every entity you draw about it.',
      onSelection: function () { },   // plain clicks come to this PM (UI.pmCollectsSelection), the line to onEntityPick
      onEntityPick: function (hit) {
        var e = f.entities[hit.index];
        if (!e || e.t !== 'line') { UI.setStatus('Dynamic Mirror needs a line or centerline to mirror about.'); return true; }
        v.axis = hit.index;
        UI.closePM();
        if (UI.setSelection) UI.setSelection([]);
        dynOn(UI.activeSketchFeature() || f, hit.index);
        return true;
      },
      groups: [{ title: 'Mirror about', fields: [{ type: 'pick', icon: 'centerline', placeholder: 'Select a line or centerline…', active: function () { return true; }, value: function () { return ''; } }] }],
      okBlocked: function () { return 'Select a line or centerline to mirror about.'; },
      onOK: function () { return false; }
    });
    UI.setStatus('Dynamic Mirror: click a centerline or a line to mirror about.');
  }

  // ------------------------------------------------------------------ Modify Sketch (rfAP)
  // SolidWorks: Tools ▸ Sketch Tools ▸ Modify. The whole sketch moves, turns, scales or flips with its relations and
  // dimensions (SketchSolver.modifySketch), the way an imported DXF blank is put in place: Translate (by ΔX / ΔY, or a
  // corner / the centre of the sketch's box onto the origin), Rotate and Scale about the sketch origin or a point, Flip
  // left-right / upside down. Each Apply is done at once (one undo step); in the graphics area a drag moves the sketch
  // and a Shift+drag turns it about the rotation centre. ✓ keeps what was done; ✗ puts the sketch back as it was.
  function cmdModifySketch() {
    var f = sketch();
    if (!f) return;
    if (!f.entities.length) { UI.toast('The sketch is empty: there is nothing to modify.'); return; }
    var start = JSON.stringify({ e: f.entities, r: f.rels || null, d: f.dims || null }), applied = 0, undo0 = App.undo.length;
    var v = { dx: 0, dy: 0, angle: 90, factor: 1, about: 'origin', cx: 0, cy: 0 };
    function centre() { return v.about === 'point' ? [+v.cx || 0, +v.cy || 0] : [0, 0]; }
    function run(op, what) {
      var r = step(function () { return S.modifySketch(f, op); }, true);
      if (!r.ok) { UI.toast(r.error); return false; }
      applied++;
      clearPreview(); changed();
      var msg = what + (r.dropped ? ' (' + r.dropped + ' relation' + (r.dropped === 1 ? '' : 's') + ' to the origin or Fixed deleted: they would hold it where it was)' : '') + '.';
      UI.setStatus(msg); spec.message = msg; UI.renderPM();
      return true;
    }
    function box() { return S.sketchBox(f) || { x0: 0, y0: 0, x1: 0, y1: 0 }; }
    var spec = {
      title: 'Modify Sketch', icon: 'moveEnt', values: v,
      message: 'Moves, turns, scales or flips the whole sketch with its relations. Drag in the graphics area to move it; Shift+drag turns it about the rotation centre.',
      command: { onSketchDrag: dragHook },
      groups: [
        { title: 'Translate', fields: [
          { type: 'number', label: 'ΔX', key: 'dx', unit: 'u' }, { type: 'number', label: 'ΔY', key: 'dy', unit: 'u' },
          { type: 'buttons', buttons: [{ label: 'Apply', onclick: function () { run({ dx: +v.dx || 0, dy: +v.dy || 0 }, 'Moved the sketch by (' + UI.fmtDim(+v.dx || 0) + ', ' + UI.fmtDim(+v.dy || 0) + ')'); } }] },
          { type: 'buttons', buttons: [
            { label: 'Lower-left to origin', onclick: function () { var b = box(); run({ dx: -b.x0, dy: -b.y0 }, 'The lower-left corner of the sketch is on the origin'); } },
            { label: 'Center on origin', onclick: function () { var b = box(); run({ dx: -(b.x0 + b.x1) / 2, dy: -(b.y0 + b.y1) / 2 }, 'The sketch is centred on the origin'); } }] }
        ] },
        { title: 'Rotate / Scale About', fields: [
          { type: 'radio', key: 'about', options: [['origin', 'Sketch origin'], ['point', 'Point (X, Y)']], rerender: true },
          { type: 'number', label: 'X', key: 'cx', unit: 'u', show: function (x) { return x.about === 'point'; } },
          { type: 'number', label: 'Y', key: 'cy', unit: 'u', show: function (x) { return x.about === 'point'; } }
        ] },
        { title: 'Rotate', fields: [
          { type: 'number', label: 'Angle', key: 'angle', unit: '°' },
          { type: 'buttons', buttons: [{ label: 'Apply', onclick: function () { var c = centre(); run({ rot: +v.angle || 0, cx: c[0], cy: c[1] }, 'Rotated the sketch ' + (+v.angle || 0) + '°'); } }] }
        ] },
        { title: 'Scale', fields: [
          { type: 'number', label: 'Factor', key: 'factor', min: 0, spin: 0.1 },
          { type: 'buttons', buttons: [{ label: 'Apply', onclick: function () { var c = centre(); run({ s: +v.factor, cx: c[0], cy: c[1] }, 'Scaled the sketch × ' + (+v.factor)); } }] }
        ] },
        { title: 'Flip', fields: [
          { type: 'buttons', buttons: [
            { label: 'Flip Horizontal', onclick: function () { var c = centre(); run({ flip: 'h', cx: c[0], cy: c[1] }, 'Flipped the sketch left to right'); } },
            { label: 'Flip Vertical', onclick: function () { var c = centre(); run({ flip: 'v', cx: c[0], cy: c[1] }, 'Flipped the sketch upside down'); } }] }
        ] }
      ],
      onOK: function () { clearPreview(); return true; },
      onCancel: function () {
        clearPreview();
        if (!applied) return;
        var s = JSON.parse(start);
        f.entities = s.e; if (s.r) f.rels = s.r; else delete f.rels; if (s.d) f.dims = s.d; else delete f.dims;
        App.undo.length = Math.min(App.undo.length, undo0);
        changed();
        UI.setStatus('Modify Sketch cancelled: the sketch is where it was.');
      },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    };
    // a drag in the graphics area: the sketch follows the mouse (Shift: turns about the rotation centre), done on release
    function dragHook(p, ev) {
      var uv0 = toUV(p[0], p[1]), rotate = !!(ev && ev.shiftKey), op = null;
      if (!uv0) return null;
      function opAt(q) {
        var uv = toUV(q[0], q[1]);
        if (!uv) return null;
        if (!rotate) return { dx: uv[0] - uv0[0], dy: uv[1] - uv0[1] };
        var c = centre(), a0 = Math.atan2(uv0[1] - c[1], uv0[0] - c[0]), a1 = Math.atan2(uv[1] - c[1], uv[0] - c[0]);
        return { rot: Math.round((a1 - a0) * 180 / Math.PI), cx: c[0], cy: c[1] };
      }
      return {
        start: function () { },
        move: function (q) {
          op = opAt(q);
          if (!op) return;
          var xf = op.rot != null ? { rot: op.rot, cx: op.cx, cy: op.cy } : op, out = [];
          f.entities.forEach(function (e) { var o = S.xfEntity(e, xf); if (o) out.push(o); });
          App.tempEntities = out; UI.updateTemp();
          UI.setStatus(op.rot != null ? 'Rotate ' + op.rot + '°' : 'Move (' + UI.fmtDim(op.dx) + ', ' + UI.fmtDim(op.dy) + ')');
        },
        end: function () {
          clearPreview();
          if (!op || (op.rot != null ? !op.rot : Math.hypot(op.dx, op.dy) < 1e-12)) return;
          run(op, op.rot != null ? 'Rotated the sketch ' + op.rot + '°' : 'Moved the sketch by (' + UI.fmtDim(op.dx) + ', ' + UI.fmtDim(op.dy) + ')');
        }
      };
    }
    UI.openPM(spec);
    UI.setStatus('Modify Sketch: set a value and Apply, or drag the sketch.');
    return spec;
  }

  // ------------------------------------------------------------------ Segment (rfAP)
  // SolidWorks: Tools ▸ Sketch Tools ▸ Segment. Pick a line, arc or circle; Number of instances divides it into that
  // many equal segments with sketch points (Coincident with it), or, with Sketch segments, splits it into equal pieces.
  // lane HP: splines, style splines, ellipses and partial ellipses too (equal arc length, as a live SolidWorks does)
  var SEG_TYPES = /^(line|arc|circle|spline|ellipse|pellipse)$/;
  function cmdSegment() {
    var f = sketch();
    if (!f) return;
    var sel = selIdx(f).filter(function (i) { return SEG_TYPES.test(f.entities[i].t); });
    var v = { entities: sel.slice(0, 1), n: 4, kind: 'points' };
    function preview() {
      var e = f.entities[v.entities[0]], out = [];
      if (e) {
        var copy = { entities: [JSON.parse(JSON.stringify(e))] }, r = S.segmentEntity(copy, 0, v.n | 0, {});
        if (r.ok) r.points.forEach(function (p) { out.push({ t: 'point', x: p[0], y: p[1] }); });
      }
      App.tempEntities = out; UI.updateTemp();
    }
    UI.openPM({
      title: 'Segment', icon: 'point', values: v,
      message: 'Select a line, arc, circle, spline or ellipse, set the number of segments, then ✓.',
      onSelection: function () {
        var s = selIdx(f).filter(function (i) { return SEG_TYPES.test(f.entities[i].t); });
        var last = s.filter(function (i) { return v.entities.indexOf(i) < 0; })[0];
        if (last == null) last = s[0];
        v.entities = last == null ? [] : [last];
        UI.renderPM(); preview();
      },
      groups: [
        { title: 'Segment Entity', fields: [entityBox(f, v, 'line', preview, { placeholder: 'Line, arc, circle, spline or ellipse' })] },
        { title: 'Segment Parameters', fields: [
          { type: 'radio', key: 'kind', options: [['points', 'Sketch points'], ['segments', 'Sketch segments']] },
          { type: 'number', label: 'Number of instances', key: 'n', step: 1, min: 2 }] }
      ],
      onChange: preview,
      okBlocked: function () { return !v.entities.length ? 'Select a line, arc, circle, spline or ellipse.' : !((v.n | 0) >= 2) ? 'Set 2 segments or more.' : ''; },
      onOK: function () {
        var i = v.entities[0], r = step(function () { return S.segmentEntity(f, i, v.n | 0, { split: v.kind === 'segments' }); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus('Divided into ' + (v.n | 0) + ' equal segments' + (v.kind === 'segments' ? '.' : ' with ' + r.added.length + ' sketch points.'));
        return true;
      },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    });
    preview();
  }

  // ------------------------------------------------------------------ Equation Driven Curve (rfAP)
  // SolidWorks: Sketch tab ▸ Spline ▾ ▸ Equation Driven Curve. Explicit y = f(x) between x1 and x2, or Parametric
  // x(t), y(t) between t1 and t2; the curve is a spline through points sampled along it, the equation stored on the
  // spline (e.eq) so editing it (Properties… / this command with the curve selected) re-makes the points.
  function cmdEquationCurve(editIndex) {
    var f = sketch();
    if (!f) return;
    if (editIndex == null) { var s0 = selIdx(f).filter(function (i) { return f.entities[i].eq; }); if (s0.length) editIndex = s0[0]; }
    var old = editIndex != null && f.entities[editIndex] && f.entities[editIndex].eq;
    var v = old ? { kind: old.kind || 'explicit', y: old.y || '', x: old.x || '', x0: old.x0, x1: old.x1, t0: old.t0, t1: old.t1, n: old.n || 24 }
      : { kind: 'explicit', y: '', x: '', x0: '0', x1: '1', t0: '0', t1: '1', n: 24 };
    function eqOf() {
      var e = { kind: v.kind, n: Math.max(2, v.n | 0) };
      if (v.kind === 'parametric') { e.x = v.x; e.y = v.y; e.t0 = v.t0; e.t1 = v.t1; } else { e.y = v.y; e.x0 = v.x0; e.x1 = v.x1; }
      return e;
    }
    function preview() {
      var r = S.equationPoints(eqOf());
      App.tempEntities = r.ok ? [{ t: 'spline', pts: r.pts }] : []; UI.updateTemp();
      spec.message = r.ok ? (old ? 'Editing the curve\'s equation.' : 'The curve is a spline through ' + r.pts.length + ' points of the equation.') : r.error;
      spec.messageOk = r.ok;
      var m = document.querySelector('.pm-msg');
      if (m) { m.textContent = spec.message; m.classList.toggle('ok', r.ok); }
    }
    var spec = {
      title: 'Equation Driven Curve', icon: 'spline', values: v,
      message: 'Type the equation and its range.',
      groups: [
        { title: 'Equation Type', fields: [{ type: 'radio', key: 'kind', options: [['explicit', 'Explicit'], ['parametric', 'Parametric']], rerender: true }] },
        { title: 'Parameters', fields: [
          { type: 'text', label: 'yx =', key: 'y', show: function (x) { return x.kind === 'explicit'; } },
          { type: 'text', label: 'x1', key: 'x0', show: function (x) { return x.kind === 'explicit'; } },
          { type: 'text', label: 'x2', key: 'x1', show: function (x) { return x.kind === 'explicit'; } },
          { type: 'text', label: 'xt =', key: 'x', show: function (x) { return x.kind === 'parametric'; } },
          { type: 'text', label: 'yt =', key: 'y', show: function (x) { return x.kind === 'parametric'; } },
          { type: 'text', label: 't1', key: 't0', show: function (x) { return x.kind === 'parametric'; } },
          { type: 'text', label: 't2', key: 't1', show: function (x) { return x.kind === 'parametric'; } },
          { type: 'number', label: 'Points (segments)', key: 'n', step: 1, min: 2 }] }
      ],
      onChange: preview,
      okBlocked: function () { var r = S.equationPoints(eqOf()); return r.ok ? '' : r.error; },
      onOK: function () {
        var eq = eqOf(), r = S.equationPoints(eq);
        if (!r.ok) { UI.toast(r.error); return false; }
        var res = step(function () {
          if (old) { var e = f.entities[editIndex]; e.pts = r.pts; e.eq = eq; delete e.tans; S.solve(f); return { ok: true }; }
          f.entities.push({ t: 'spline', pts: r.pts, eq: eq });
          return { ok: true };
        }, true);
        if (!res.ok) { UI.toast(res.error); return false; }
        clearPreview(); changed();
        UI.setStatus(old ? 'Equation Driven Curve updated.' : 'Equation Driven Curve made: a spline through ' + r.pts.length + ' points.');
        return true;
      },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    };
    UI.openPM(spec);
    preview();
    return spec;
  }
  UI.cmdModifySketch = cmdModifySketch; UI.cmdSegment = cmdSegment; UI.cmdEquationCurve = cmdEquationCurve;

  UI.cmdSketchFillet = cmdSketchFillet; UI.cmdSketchChamfer = cmdSketchChamfer;
  UI.cmdOffsetEntities = cmdOffsetEntities; UI.cmdTrimEntities = cmdTrimEntities; UI.cmdExtendEntities = cmdExtendEntities;
  UI.cmdConvertEntities = cmdConvertEntities; UI.cmdIntersectionCurve = cmdIntersectionCurve; UI.cmdDynamicMirror = cmdDynamicMirror;
  UI.cmdSketchPattern = cmdSketchPattern; UI.cmdCircularSketchPattern = cmdCircularSketchPattern;
  UI.cmdMoveEntities = function () { transformTool('move'); }; UI.cmdCopyEntities = function () { transformTool('copy'); };
  UI.cmdRotateEntities = function () { transformTool('rotate'); }; UI.cmdScaleEntities = function () { transformTool('scale'); };
  UI.cmdStretchEntities = function () { transformTool('stretch'); };

  // ------------------------------------------------------------------ rfAT: Jog Line (Tools ▸ Sketch Tools ▸ Jog Line)
  // As SolidWorks: click a line where the jog starts, move the mouse along the line and off it (the jog's width and
  // depth follow), click to place. Or type Width / Depth in the PM and press ✓. The line becomes five connected
  // lines: the two outer pieces Collinear, the jog's top Parallel to them and its sides Perpendicular, all joined by
  // Coincident; the line's relations stay on its pieces (its end relations on the matching end), its length
  // dimension goes. UI.jogLine(i, t1, t2, depth) is the same without the mouse (t along the line from its start).
  function jogGeom(e, t1, t2, depth) {
    var A = [e.x1, e.y1], B = [e.x2, e.y2], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
    if (!(L > 1e-12)) return null;
    var u = [(B[0] - A[0]) / L, (B[1] - A[1]) / L], n = [-u[1], u[0]];
    var a = Math.min(t1, t2), b = Math.max(t1, t2);
    if (!(a > 1e-9 && b < L - 1e-9 && b - a > 1e-9) || !(Math.abs(depth) > 1e-9)) return null;
    function at(t, h) { return [+(A[0] + u[0] * t + n[0] * h).toPrecision(12), +(A[1] + u[1] * t + n[1] * h).toPrecision(12)]; }
    return { A: A, B: B, J1: at(a, 0), H1: at(a, depth), H2: at(b, depth), J2: at(b, 0), L: L, u: u, n: n };
  }
  function jogRound(x, h) {
    if (!(h > 0) || !isFinite(x)) return x;
    for (var k = Math.ceil(Math.log10(2 * h)); k > -12; k--) {
      var s1 = Math.pow(10, k), q = Math.round(x / s1) * s1;
      if (Math.abs(q - x) <= h) return +q.toFixed(Math.max(0, -k));
      var s2 = s1 / 2;
      q = Math.round(x / s2) * s2;
      if (Math.abs(q - x) <= h) return +q.toFixed(Math.max(0, 1 - k));
    }
    return x;
  }
  UI.sketchNiceRound = UI.sketchNiceRound || jogRound;
  function jogEntities(e, g) {
    function line(p, q) { var l = { t: 'line', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }; if (e.construction) l.construction = true; if (e.layer != null) l.layer = e.layer; return l; }
    return [line(g.A, g.J1), line(g.J1, g.H1), line(g.H1, g.H2), line(g.H2, g.J2), line(g.J2, g.B)];
  }
  function jogApply(f, i, t1, t2, depth) {
    var e = f.entities[i];
    if (!e || e.t !== 'line' || e.infinite || e.blk != null) return { ok: false, error: 'Jog Line needs a sketch line.' };
    var g = jogGeom(e, t1, t2, depth);
    if (!g) return { ok: false, error: 'The jog must lie inside the line and have a width and a depth.' };
    var ls = jogEntities(e, g), n0 = f.entities.length;
    // the line keeps its first piece; its second end's relations go to the last piece
    e.x2 = g.J1[0]; e.y2 = g.J1[1];
    ls.slice(1).forEach(function (l) { f.entities.push(l); });
    var s1 = n0, top = n0 + 1, s2 = n0 + 2, last = n0 + 3;
    if (f.rels) f.rels = f.rels.filter(function (rel) { return rel.refs.indexOf(i + '.mid') < 0; });
    (f.rels || []).forEach(function (rel) { rel.refs = rel.refs.map(function (r) { return String(r) === i + '.p2' ? last + '.p2' : r; }); });
    if (f.dims) { f.dims = f.dims.filter(function (d) { return d.e !== i; }); if (!f.dims.length) delete f.dims; }
    var made = [['coincident', [i + '.p2', s1 + '.p1']], ['coincident', [s1 + '.p2', top + '.p1']], ['coincident', [top + '.p2', s2 + '.p1']], ['coincident', [s2 + '.p2', last + '.p1']],
      ['collinear', [String(i), String(last)]], ['parallel', [String(top), String(i)]], ['perpendicular', [String(s1), String(i)]], ['perpendicular', [String(s2), String(i)]]];
    var n = 0;
    made.forEach(function (m) { var r = S.addRelation(f, m[0], m[1], { rejectOver: true }); if (r && r.ok) n++; });
    S.solve(f);
    return { ok: true, lines: [i, s1, top, s2, last], relations: n };
  }
  UI.jogLine = function (i, t1, t2, depth) {
    var f = UI.activeSketchFeature();
    if (!f) return { ok: false, error: 'Open a sketch first.' };
    var r = step(function () { return jogApply(f, i, t1, t2, depth); }, true);
    if (r.ok) changed();
    return r;
  };
  function cmdJogLine() {
    var f = sketch();
    if (!f) return;
    var v = { w: 0, d: 0 }, st = { i: -1, t1: 0 };
    function lineAt(mx, my) {
      var px = pxWorld(mx, my), uv = toUV(mx, my), best = -1, bd = 8 * px;
      if (!uv) return null;
      f.entities.forEach(function (e, i) {
        if (!e || e.t !== 'line' || e.infinite || e.blk != null) return;
        var A = [e.x1, e.y1], B = [e.x2, e.y2], L2 = (B[0] - A[0]) * (B[0] - A[0]) + (B[1] - A[1]) * (B[1] - A[1]);
        if (!(L2 > 0)) return;
        var t = Math.max(0, Math.min(1, ((uv[0] - A[0]) * (B[0] - A[0]) + (uv[1] - A[1]) * (B[1] - A[1])) / L2));
        var d = Math.hypot(A[0] + (B[0] - A[0]) * t - uv[0], A[1] + (B[1] - A[1]) * t - uv[1]);
        if (d < bd) { bd = d; best = i; }
      });
      return best >= 0 ? { i: best, uv: uv } : null;
    }
    // where uv is along line e (t from its start) and off it (h, to its left), each rounded to the roundest value
    // inside the pixel (as the sketcher rounds a free point: 10 rather than 10.0371)
    function along(e, uv, mx, my) {
      var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1), u = [(e.x2 - e.x1) / L, (e.y2 - e.y1) / L], h = mx != null ? 0.5 * pxWorld(mx, my) * 1.05 : 0;
      return { t: jogRound((uv[0] - e.x1) * u[0] + (uv[1] - e.y1) * u[1], h), h: jogRound(-(uv[0] - e.x1) * u[1] + (uv[1] - e.y1) * u[0], h) };
    }
    function hint() { UI.setStatus(st.i < 0 ? 'Jog Line: click a line where the jog starts.' : 'Jog Line: move along the line and off it, then click to place the jog (or type Width and Depth and press ✓).'); }
    function preview(uv, mx, my) {
      var e = st.i >= 0 ? f.entities[st.i] : null;
      if (!e) { App.tempEntities = []; UI.updateTemp(); return; }
      var t2 = st.t1 + (+v.w || 0), h = +v.d || 0;
      if (uv) { var q = along(e, uv, mx, my); t2 = q.t; h = q.h; v.w = Math.round((t2 - st.t1) * 1e6) / 1e6; v.d = Math.round(h * 1e6) / 1e6; UI.renderPM(); }
      var g = jogGeom(e, st.t1, t2, h);
      App.tempEntities = g ? jogEntities(e, g) : [];
      UI.updateTemp();
    }
    function place(t2, h) {
      var r = step(function () { return jogApply(f, st.i, st.t1, t2, h); }, true);
      if (!r.ok) { UI.toast(r.error); return false; }
      st.i = -1; clearPreview(); changed();
      UI.setStatus('Jog placed (' + r.relations + ' relations). Click another line, or ✓ to finish.');
      return true;
    }
    UI.openPM({
      title: 'Jog Line', icon: 'jogLine', values: v, noFocus: true,
      message: 'Click a line where the jog starts, then move along and off the line and click to place it.',
      command: {
        onSketchMove: function (uv, mx, my) { if (st.i >= 0) preview(uv || toUV(mx, my), mx, my); },
        onSketchPoint: function (uv, mx, my) {
          if (st.i < 0) {
            var hit = lineAt(mx, my);
            if (!hit) { UI.setStatus('Jog Line: click on a sketch line.'); return; }
            st.i = hit.i; st.t1 = along(f.entities[hit.i], uv || hit.uv, mx, my).t;
            hint();
            return;
          }
          var q = along(f.entities[st.i], uv || toUV(mx, my), mx, my);
          place(q.t, q.h);
        }
      },
      groups: [{ title: 'Jog', fields: [{ type: 'number', key: 'w', label: 'Width', unit: 'u' }, { type: 'number', key: 'd', label: 'Depth', unit: 'u' }] }],
      onChange: function () { preview(null); },
      onOK: function () { if (st.i >= 0 && !place(st.t1 + (+v.w || 0), +v.d || 0)) return false; },
      onClose: clearPreview
    });
    hint();
  }
  UI.cmdJogLine = cmdJogLine;

  // ------------------------------------------------------------------ Close Arc (lane BS)
  // Mastercam: Wireframe ▸ Modify ▸ Close Arc. Each arc in Arcs to Close (the selection when the command starts plus
  // what is clicked while it is open; anything else is ignored) becomes the full circle it lies on: same centre and
  // radius, its construction flag, layer and level kept. Its radius dimension stays (on the circle, still read as R),
  // and so do its Concentric / Coradial / Tangent / Equal relations and those of its centre; relations and dimensions
  // on its end points go (a circle has none). A partial ellipse closes to its ellipse the same way. ✓: one undo step.
  function closable(e) { return !!e && (e.t === 'arc' || e.t === 'pellipse') && e.blk == null; }
  // the refs a closed arc keeps: the whole curve and its centre (an ellipse also its axis ends)
  function keepsRef(e, p) { return p.s === null || p.s === 'c' || (e.t === 'ellipse' && p.s === 'v'); }
  var ARC_ONLY = { arclength: 1, pathlength: 1, runangle: 1 };   // dimensions of an arc's sweep or a chain's length
  function closeArcs(f, list) {
    var idx = (list || []).filter(function (i, k, a) { return closable(f.entities[i]) && a.indexOf(i) === k; });
    if (!idx.length) return { ok: false, error: 'Select an arc to close.' };
    var set = {}, rels = 0, dims = 0;
    idx.forEach(function (i) {
      var e = f.entities[i], c = JSON.parse(JSON.stringify(e));
      c.t = e.t === 'arc' ? 'circle' : 'ellipse';
      delete c.a0; delete c.a1;
      f.entities[i] = c; set[i] = true;
    });
    if (f.rels) {
      var n0 = f.rels.length;
      f.rels = f.rels.filter(function (rel) {
        return !(rel.refs || []).some(function (r) {
          var p = S.parseRef(r);
          return !!p && !p.o && set[p.e] && (!keepsRef(f.entities[p.e], p) || !!ARC_ONLY[rel.type]);
        });
      });
      rels = n0 - f.rels.length;
      if (!f.rels.length) delete f.rels;
      rels += S.clean(f) || 0;   // and whatever no longer holds on a full circle
    }
    if (f.dims) {
      var d0 = f.dims.length;
      f.dims = f.dims.filter(function (d) {
        if (!set[d.e]) return true;
        var c = f.entities[d.e];
        if (c.t === 'ellipse') return d.k === 'rx' || d.k === 'ry';
        if (d.k !== 'r') return false;
        d.k = 'dia';   // a circle's size is its diameter: shown as the radius it was (or as a diameter if it was shown so)
        if (d.show === 'dia') delete d.show; else d.show = 'r';
        return true;
      });
      dims = d0 - f.dims.length;
      if (!f.dims.length) delete f.dims;
    }
    return { ok: true, closed: idx, relations: rels, dimensions: dims };
  }
  function closeArcMessage(r) {
    var n = r.closed.length, gone = [];
    if (r.relations) gone.push(r.relations + ' end-point relation' + (r.relations === 1 ? '' : 's'));
    if (r.dimensions) gone.push(r.dimensions + ' dimension' + (r.dimensions === 1 ? '' : 's'));
    return 'Closed ' + n + ' arc' + (n === 1 ? '' : 's') + (gone.length ? ' (' + gone.join(' and ') + ' removed)' : '') + '.';
  }
  // the piece a closed arc gains, for the preview
  function closingPiece(e) {
    var sw = ((e.a1 - e.a0) % 360 + 360) % 360, o = JSON.parse(JSON.stringify(e));
    if (sw < 1e-9) return null;
    o.a0 = e.a0 + sw; o.a1 = e.a0 + 360;
    delete o.construction;
    return o;
  }
  function cmdCloseArc() {
    var f = sketch();
    if (!f) return;
    var v = { entities: [] }, spec = null, HELP = 'Select the arcs to close; ✓ turns each into the full circle it lies on (same centre and radius).';
    // the arcs of the selection; what else is selected is ignored, and the PropertyManager and the status bar say so
    // (the status after the selection's own "n entities selected")
    function pick() {
      var s = selIdx(f), arcs = s.filter(function (i) { return closable(f.entities[i]); }), other = s.length - arcs.length;
      v.entities = arcs;
      var msg = other ? other + ' selected entit' + (other === 1 ? 'y is' : 'ies are') + ' not an arc and ' + (other === 1 ? 'is' : 'are') + ' ignored.' : '';
      if (spec) spec.message = msg ? HELP + '<br>' + msg : HELP;
      var st = 'Close Arc: ' + (msg || (arcs.length ? '✓ closes ' + arcs.length + ' arc' + (arcs.length === 1 ? '' : 's') + ' to full circles.' : 'select the arcs to close.'));
      UI.setStatus(st);
      setTimeout(function () { if (UI.pmSpec && UI.pmSpec() === spec) UI.setStatus(st); }, 0);
    }
    function preview() {
      App.tempEntities = v.entities.map(function (i) { return f.entities[i] && closingPiece(f.entities[i]); }).filter(Boolean);
      UI.updateTemp();
    }
    spec = {
      title: 'Close Arc', icon: 'closeArc', values: v, message: HELP,
      onSelection: function () {
        var before = v.entities.join() + '|' + spec.message;
        pick();
        if (v.entities.join() + '|' + spec.message !== before) UI.renderPM();
        preview();
      },
      groups: [{ title: 'Arcs to Close', fields: [entityBox(f, v, 'arc', preview, { placeholder: 'Select arcs…' })] }],
      okBlocked: function () { return v.entities.length ? '' : 'Select an arc to close.'; },
      onOK: function () {
        var list = v.entities.slice(), r = step(function () { return closeArcs(f, list); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus(closeArcMessage(r));
        return true;
      },
      onCancel: clearPreview,
      onClose: function () { App.tempEntities = []; UI.updateTemp(); }
    };
    pick();
    UI.openPM(spec);
    preview();
    return spec;
  }
  UI.cmdCloseArc = cmdCloseArc;

  // ------------------------------------------------------------------ Replace Entity (rfCR)
  // SolidWorks' Sketch Tools ▸ Replace Entity (also on the sketch right-click menu): pick the entity to replace, then
  // the entity that replaces it; ✓ moves the old entity's relations and dimensions onto the new one (each end to the
  // nearest end, SketchSolver.replaceEntity) and deletes the old entity, or keeps it as construction geometry (Make
  // construction). A selected entity when the command opens is the one to replace. One undo step; Esc ends it.
  function cmdReplaceEntity() {
    var f = sketch();
    if (!f) return;
    var v = { old: null, neu: null, construction: false, box: 'old' }, spec = null;
    var HELP = 'Select the entity to replace, then the entity that replaces it. ✓ moves its relations and dimensions onto the new entity.';
    var pre = selIdx(f);
    if (pre.length === 1 && f.entities[pre[0]] && f.entities[pre[0]].t !== 'point' && f.entities[pre[0]].t !== 'text') { v.old = pre[0]; v.box = 'neu'; }
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    function label(i) { return i != null && f.entities[i] ? entityLabel(f.entities[i], i) : ''; }
    function preview() {
      UI.sketchFeedbackClear();
      if (v.old != null && f.entities[v.old]) UI.sketchPreview(entPts(f.entities[v.old]), PICK_STYLE, 'sk-replace-old');
      if (v.neu != null && f.entities[v.neu]) UI.sketchPreview(entPts(f.entities[v.neu]), HOT_STYLE, 'sk-replace-new');
    }
    function hint() {
      UI.setStatus(v.old == null ? 'Replace Entity: select the entity to replace.' : v.neu == null ? 'Replace Entity: ' + label(v.old) + ' will be replaced; select the entity that replaces it.' : 'Replace Entity: ' + label(v.old) + ' → ' + label(v.neu) + '. Press ✓ to replace it.');
    }
    function pickBox(key, icon, placeholder) {
      return { type: 'pick', icon: icon, placeholder: placeholder, value: function (x) { return label(x[key]); },
        active: function (x) { return x.box === key; }, onActivate: function () { v.box = key; UI.renderPM(); hint(); },
        items: function (x) { return x[key] != null ? [{ label: label(x[key]) }] : []; },
        onRemove: function (x) { x[key] = null; x.box = key; UI.renderPM(); preview(); hint(); },
        onClear: function (x) { x[key] = null; x.box = key; UI.renderPM(); preview(); hint(); } };
    }
    spec = {
      title: 'Replace Entity', icon: 'moveEnt', values: v, message: HELP, keepSelection: true,
      command: { onSketchPoint: function (uv, mx, my) {
        fresh();
        var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
        if (!e || e.t === 'point' || e.t === 'text') { UI.setStatus('Click a line, arc, circle or curve.'); return; }
        var key = v.box === 'neu' && v.old != null ? 'neu' : v.old == null ? 'old' : 'neu';
        if (key === 'neu' && hit.index === v.old) { UI.toast('The replacement has to be another entity.'); return; }
        if (key === 'old' && hit.index === v.neu) v.neu = null;
        v[key] = hit.index;
        v.box = key === 'old' && v.neu == null ? 'neu' : key;
        if (UI.setSelection) UI.setSelection([hit]);
        UI.renderPM(); preview(); hint();
      } },
      groups: [
        { title: 'Entities', fields: [pickBox('old', 'moveEnt', 'Entity to replace…'), pickBox('neu', 'moveEnt', 'Replacement entity…')] },
        { title: 'Options', fields: [{ type: 'check', key: 'construction', label: 'Make construction' }] }
      ],
      okBlocked: function () { return v.old == null ? 'Select the entity to replace.' : v.neu == null ? 'Select the entity that replaces it.' : ''; },
      onOK: function () {
        fresh();
        var i = v.old, j = v.neu, nameOld = label(i), nameNew = label(j);
        var r = step(function () { return S.replaceEntity(f, i, j, { construction: !!v.construction }); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        if (UI.setSelection) UI.setSelection([{ kind: 'entity', index: r.index }]);
        UI.setStatus(nameOld + ' replaced by ' + nameNew + ': ' + r.moved + ' relation' + (r.moved === 1 ? '' : 's') + ' and ' + r.dims + ' dimension' + (r.dims === 1 ? '' : 's') + ' moved' + (v.construction ? '; the old entity stays as construction geometry.' : '.'));
        return true;
      },
      onCancel: function () { clearPreview(); UI.setStatus('Replace Entity cancelled.'); },
      help: 'Replace Entity: pick the entity to replace, then its replacement. The relations and dimensions of the first move to the second (each end to the nearest end); the first is deleted, or kept as construction geometry with Make construction.'
    };
    UI.openPM(spec);
    preview(); hint();
    return spec;
  }
  UI.cmdReplaceEntity = cmdReplaceEntity;

  // ------------------------------------------------------------------ Close Sketch to Model (lane sketch-path)
  // SolidWorks' Tools ▸ Sketch Tools ▸ Close Sketch to Model: an open profile whose two ends lie on model edges is
  // closed along those edges, so it extrudes as a closed profile. The closure runs the shorter way round
  // (Kernel.closeToModel); Reverse direction of closure takes the other way. Edges in the sketch plane are used when the
  // ends lie on them, else the model's edges projected onto the sketch. A selected open contour is the one closed, else
  // every open contour. The new lines and arcs are held On Edge and Coincident with each other and the profile's ends.
  function closeModelEdges(inPlane) {
    var pl = UI.activePlane(), V = K.vec, edges = App.edges || [];
    function near(p) { return Math.abs(V.dot(V.sub(p, K.to3D(pl, 0, 0)), pl.n)) < 1e-6; }
    var geo = convertGeometry(edges.filter(function (e) { return inPlane ? near(e.a) && near(e.b) : !e.smooth; }), true), seen = {};
    // an edge once: the back of a block projects onto its front, and Reverse must not take the same line again
    return geo.filter(function (g) {
      var k = g.t === 'line' ? [[g.x1, g.y1].join(), [g.x2, g.y2].join()].sort().join(';') : [g.t, g.cx, g.cy, g.r, g.a0, g.a1].join();
      if (seen[k]) return false;
      seen[k] = true;
      return true;
    });
  }
  function closeSize(f, geo) {
    var m = 1;
    geo.concat(f.entities).forEach(function (g) { if (g) K.entityPolylines(g).forEach(function (l) { l.pts.forEach(function (p) { m = Math.max(m, Math.abs(p[0]), Math.abs(p[1])); }); }); });
    return m;
  }
  // { ok, entities (closing geometry, chain by chain), runs: [{ chain, ents }], other } or { ok: false, error }
  function closePlan(f, reverse) {
    if (!App.edges || !App.edges.length) return { ok: false, error: 'There is no model to close the sketch to.' };
    var chains = K.openSketchChains(f), sel = selIdx(f);
    if (!chains.length) return { ok: false, error: 'The sketch has no open profile to close.' };
    var picked = chains.filter(function (c) { return c.ents.some(function (i) { return sel.indexOf(i) >= 0; }); });
    if (picked.length) chains = picked;
    var flat = closeModelEdges(true), all = null, runs = [], other = false, why = null;
    chains.forEach(function (c) {
      var tol = 1e-5 * closeSize(f, flat), r = flat.length ? K.closeToModel(c.a, c.b, flat, { reverse: reverse, tol: tol }) : { ok: false, why: 'end' };
      if (!r.ok) {
        all = all || closeModelEdges(false);
        var r2 = K.closeToModel(c.a, c.b, all, { reverse: reverse, tol: 1e-5 * closeSize(f, all) });
        if (r2.ok || r.why === 'end') r = r2;
      }
      if (!r.ok) { why = why || r.why; return; }
      runs.push({ chain: c, ents: r.entities });
      other = other || r.other;
    });
    if (!runs.length) return { ok: false, error: why === 'path' ? 'The ends of the open profile lie on model edges that do not connect, so they cannot close it.' : 'The ends of the open profile have to lie on model edges.' };
    return { ok: true, runs: runs, entities: runs.reduce(function (o, q) { return o.concat(q.ents); }, []), other: other };
  }
  function refNear(f, i, p) {
    var best = null, bd = 1e-4;
    S.pointRefs(f, i).forEach(function (q) { if (/\.(mid|c)$/.test(q.ref)) return; var d = Math.hypot(q.pt[0] - p[0], q.pt[1] - p[1]); if (d < bd) { bd = d; best = q.ref; } });
    return best;
  }
  function closeApply(f, plan) {
    var made = 0, ends = 0;
    plan.runs.forEach(function (run) {
      var c = run.chain, idx = [];
      run.ents.forEach(function (g) {
        var keys = S.paramNames(g), at = -1;
        f.entities.forEach(function (o, i) { if (at < 0 && o && !o.construction && o.t === g.t && keys.every(function (k) { return Math.abs((+o[k] || 0) - g[k]) < 1e-6 * Math.max(1, Math.abs(g[k])); })) at = i; });
        if (at >= 0) { idx.push(at); return; }   // that edge is already in the sketch (a converted edge)
        f.entities.push(g);
        at = f.entities.length - 1;
        idx.push(at); made++;
        var ar = S.addRelation(f, 'onEdge', [String(at)]);
        if (!ar.ok) throw new Error(ar.error);
      });
      // the ends: chain end to first entity, entity to entity, last entity to chain end. A relation the solver finds
      // redundant is dropped: the points are coincident already
      function tie(i, j, p) {
        var A = refNear(f, i, p), B = refNear(f, j, p);
        if (A && B && S.addRelation(f, 'coincident', [A, B]).ok) ends++;
      }
      function chainEntAt(p) { var hit = -1; c.ents.forEach(function (i) { if (hit < 0 && refNear(f, i, p)) hit = i; }); return hit; }
      var ia = chainEntAt(c.a), ib = chainEntAt(c.b), P = c.a;
      idx.forEach(function (i, k) {
        var ee = K.entityEnds(f.entities[i]), far = Math.hypot(ee[0][0] - P[0], ee[0][1] - P[1]) < Math.hypot(ee[1][0] - P[0], ee[1][1] - P[1]) ? ee[1] : ee[0];
        if (!k && ia >= 0) tie(ia, i, P);
        if (k) tie(idx[k - 1], i, P);
        P = far;
      });
      if (ib >= 0 && idx.length) tie(idx[idx.length - 1], ib, c.b);
    });
    return { ok: true, made: made, ties: ends };
  }
  function closeMessage(r) { return 'Sketch closed to the model: ' + r.made + ' entit' + (r.made === 1 ? 'y' : 'ies') + ' added along the model edges (On Edge).'; }
  function cmdCloseSketchToModel() {
    var f = sketch();
    if (!f) return;
    var v = { reverse: false }, plan = null, spec = null;
    var HELP = 'The open profile closes along the model edges its ends lie on. Reverse direction of closure takes the other way round.';
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    function replan() {
      fresh();
      try { plan = closePlan(f, !!v.reverse); } catch (e) { plan = { ok: false, error: e.message }; }
      App.tempEntities = plan.ok ? plan.entities : [];
      UI.updateTemp();
      UI.setStatus(plan.ok ? 'Close Sketch to Model: ✓ closes the open profile along the model edges.' : plan.error);
    }
    spec = {
      title: 'Close Sketch to Model', icon: 'closeArc', values: v, message: HELP, keepSelection: true,
      groups: [{ title: 'Options', fields: [{ type: 'check', key: 'reverse', label: 'Reverse direction of closure' }] }],
      onChange: replan,
      onSelection: replan,
      okBlocked: function () { return plan && !plan.ok ? plan.error : ''; },
      onOK: function () {
        replan();
        if (!plan.ok) { UI.toast(plan.error); return false; }
        var p = plan, r = step(function () { return closeApply(f, p); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus(closeMessage(r));
        return true;
      },
      onCancel: function () { clearPreview(); UI.setStatus('Close Sketch to Model cancelled.'); },
      onClose: function () { App.tempEntities = []; UI.updateTemp(); },
      help: 'Close Sketch to Model: closes an open profile against the model edges its ends lie on, so it extrudes as a closed profile. Reverse direction of closure takes the other way round the edges.'
    };
    replan();
    UI.openPM(spec);
    return spec;
  }
  UI.cmdCloseSketchToModel = cmdCloseSketchToModel;
  // UI.closeSketchToModel({ reverse }) closes at once (one undo step), as the PropertyManager's ✓ does
  UI.closeSketchToModel = function (o) {
    var f = sketch();
    if (!f) return { ok: false, error: 'Open a sketch first.' };
    var p = closePlan(f, !!(o && o.reverse));
    if (!p.ok) return p;
    var r = step(function () { return closeApply(f, p); }, true);
    if (r.ok) { changed(); UI.setStatus(closeMessage(r)); }
    return r;
  };

  // ------------------------------------------------------------------ Make Path (lane sketch-path)
  // SolidWorks' Tools ▸ Sketch Tools ▸ Make Path: one entity selected brings in everything tangent-connected to it, and
  // a click in the graphics area does the same (a click on a member takes that entity out). Several entities selected
  // stay as they are; ✓ makes them one path (Kernel.makeSketchPath), one undo step. Right-click a member: Edit Path
  // (id given: the same PropertyManager on that path) and Dissolve Path (the entities stay, the path goes).
  function cmdMakePath(editId) {
    var f = sketch();
    if (!f) return;
    var edit = editId != null, pre = edit ? [] : selIdx(f), v = { entities: [] }, spec = null;
    var HELP = 'Select the sketch entities of the path; a click takes in what is tangent-connected to the entity. ✓ makes them one path.';
    if (edit) K.sketchPaths(f).forEach(function (p) { if (p.id === editId) v.entities = p.ents.slice(); });
    else v.entities = pre.length === 1 ? K.tangentChain(f, pre[0]) : pre;
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    function show() { if (UI.setSelection) UI.setSelection(v.entities.map(function (k) { return { kind: 'entity', index: k }; })); }
    function hint() { UI.setStatus(v.entities.length ? (edit ? 'Edit Path: ' : 'Make Path: ') + v.entities.length + ' entit' + (v.entities.length === 1 ? 'y' : 'ies') + ' in the path; press ✓.' : 'Make Path: select the sketch entities of the path.'); }
    spec = {
      title: edit ? 'Edit Path' : 'Make Path', icon: 'pathLengthDim', values: v, message: HELP, keepSelection: true,
      command: { onSketchPoint: function (uv, mx, my) {
        fresh();
        var hit = UI.pickEntity(mx, my), e = hit && f.entities[hit.index];
        if (!e || e.t === 'point' || e.t === 'text') { UI.setStatus('Click a line, arc or curve.'); return; }
        var at = v.entities.indexOf(hit.index);
        if (at >= 0) v.entities.splice(at, 1);
        else K.tangentChain(f, hit.index).forEach(function (i) { if (v.entities.indexOf(i) < 0) v.entities.push(i); });
        show(); UI.renderPM(); hint();
      } },
      groups: [{ title: 'Selected Entities', fields: [entityBox(f, v, 'pathLengthDim', hint)] }],
      okBlocked: function () { return v.entities.length ? '' : 'Select the sketch entities of the path.'; },
      onOK: function () {
        fresh();
        var list = v.entities.slice(), r = step(function () { return K.makeSketchPath(f, list, edit ? editId : undefined); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        changed();
        UI.setStatus((edit ? 'Path' + r.id + ' now has ' : 'Path' + r.id + ' made of ') + r.ents.length + ' entit' + (r.ents.length === 1 ? 'y' : 'ies') + '.');
        return true;
      },
      onCancel: function () { UI.setStatus((edit ? 'Edit Path' : 'Make Path') + ' cancelled.'); },
      help: 'Make Path: joins sketch entities that run end to end into one path. Right-click a member for Edit Path and Dissolve Path.'
    };
    show();
    UI.openPM(spec);
    hint();
    return spec;
  }
  UI.cmdMakePath = function () { return cmdMakePath(); };
  UI.editSketchPath = function (i) {
    var f = sketch(), e = f && f.entities[i];
    return e && e.pathId != null ? cmdMakePath(e.pathId) : null;
  };
  UI.dissolveSketchPath = function (i) {
    var f = sketch();
    if (!f) return 0;
    var n = 0, r = step(function () { n = K.dissolveSketchPath(f, i); return n ? { ok: true } : { ok: false, error: 'That entity is not in a path.' }; }, true);
    if (!r.ok) { UI.toast(r.error); return 0; }
    changed();
    UI.setStatus('Path dissolved: ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + ' stay in the sketch.');
    return n;
  };
  // the right-click rows on a member of a path (before Properties…, with the entity commands)
  if (UI.sketchMenuItems) {
    var basePathMenuItems = UI.sketchMenuItems;
    UI.sketchMenuItems = function () {
      var items = basePathMenuItems.apply(this, arguments), f = App.mode === 'sketch' ? UI.activeSketchFeature() : null;
      var sel = f ? selIdx(f) : [], e = sel.length ? f.entities[sel[0]] : null;
      if (!e || e.pathId == null || !Array.isArray(items) || !sel.every(function (i) { return f.entities[i].pathId === e.pathId; })) return items;
      if (items.some(function (it) { return it && it.label === 'Edit Path'; })) return items;   // a list built already and passed through again
      var at = -1, who = sel[0];
      items.forEach(function (it, k) { if (it && it.label === 'Properties…') at = k; });
      var rows = [{ label: 'Edit Path', icon: 'pathLengthDim', action: function () { if (App.mode === 'sketch') UI.editSketchPath(who); } },
        { label: 'Dissolve Path', icon: 'pathLengthDim', action: function () { if (App.mode === 'sketch') UI.dissolveSketchPath(who); } }];
      // rfIT: the path's length as one dimension (Path Length Dimension with the whole path picked)
      if (UI.pathLengthDimForPath && UI.sketchPathMembers && UI.sketchPathMembers(who)) rows.push({ label: 'Path Length Dimension', icon: 'pathLengthDim', action: function () { if (App.mode === 'sketch') UI.pathLengthDimForPath(who); } });
      if (at < 0) items.push.apply(items, rows); else items.splice.apply(items, [at, 0].concat(rows));
      return items;
    };
  }

  // ------------------------------------------------------------------ Align Grid/Origin (rfIX)
  // SolidWorks' Tools ▸ Sketch Tools ▸ Align ▸ Grid/Origin: the sketch origin moves to the point picked (a sketch point
  // or a model vertex) and its X axis turns along the line picked (a sketch line or a model edge; Reverse direction
  // turns it the other way); the geometry stays where it is (S.alignGrid, sketch-solver.js), the sketch plane takes the
  // new frame, and Selected Contours of the features on the sketch follow. One undo step.
  function alignFrom(f, pick) {
    var pl = UI.activePlane(), p = pick && pick.ref ? null : pick;
    if (!pick) return null;
    if (pick.ref) {
      var q = S.refPoint(f, pick.ref);
      if (q) return { kind: 'point', uv: q, label: S.refName(f, pick.ref) };
      var c = S.refCurve(f, pick.ref);
      if (c && c.kind === 'line') return { kind: 'line', dir: [c.b[0] - c.a[0], c.b[1] - c.a[1]], at: c.a, label: S.refName(f, pick.ref) };
      return null;
    }
    if (p.vertex) return { kind: 'point', uv: K.to2D(pl, p.vertex), label: 'Vertex' };
    if (p.edge) {
      var a = K.to2D(pl, p.edge.a), b = K.to2D(pl, p.edge.b);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9) return null;   // an edge square to the sketch
      return { kind: 'line', dir: [b[0] - a[0], b[1] - a[1]], at: a, label: 'Edge' };
    }
    return null;
  }
  function alignApply(f, o) {
    var pl = UI.activePlane(), r = S.alignGrid(f, pl, o);
    if (!r.ok) return r;
    f.plane = r.plane;
    delete f.profile;
    (App.model.features || []).forEach(function (g) {
      if (g === f || !Array.isArray(g.contours) || (g.sketch !== f.id && g.profile !== f.id)) return;
      g.contours = g.contours.map(function (p) { var q = r.map(p); return [Math.round(q[0] * 1e9) / 1e9, Math.round(q[1] * 1e9) / 1e9]; });
    });
    return r;
  }
  function alignMessage(r) {
    var parts = [];
    if (Math.abs(r.u0) > 1e-12 || Math.abs(r.v0) > 1e-12) parts.push('origin moved ' + UI.fmtLen(r.u0) + ', ' + UI.fmtLen(r.v0));
    if (r.ang) parts.push('X axis turned ' + (+r.ang.toFixed(4)) + '°');
    return 'Grid aligned: ' + parts.join(', ') + '; the geometry stays where it is.';
  }
  function cmdAlignGrid() {
    var f = sketch();
    if (!f) return;
    var v = { org: null, xax: null, reverse: false, box: 'org' }, spec = null;
    var HELP = 'Select the point or vertex for the origin, then the line or edge for the X axis. ✓ aligns the sketch grid and origin; the geometry stays where it is.';
    var pre = UI.selection ? UI.selection() : [];
    pre.forEach(function (s) {
      var it = s.kind === 'sketchPoint' || s.kind === 'sketchRef' ? alignFrom(f, { ref: s.ref }) : s.kind === 'entity' ? alignFrom(f, { ref: String(s.index) }) : null;
      if (it && it.kind === 'point' && !v.org) v.org = it;
      else if (it && it.kind === 'line' && !v.xax) v.xax = it;
    });
    if (v.org && !v.xax) v.box = 'xax';
    function fresh() { var g = UI.activeSketchFeature(); if (g) f = g; }
    function opts() {
      var d = v.xax ? (v.reverse ? [-v.xax.dir[0], -v.xax.dir[1]] : v.xax.dir) : null;
      return { origin: v.org ? v.org.uv : [0, 0], dir: d };
    }
    function hint() { UI.setStatus(!v.org && !v.xax ? 'Align Grid/Origin: select the point for the origin and the line for the X axis.' : 'Align Grid/Origin: ' + (v.org ? 'origin at ' + v.org.label : 'origin stays') + ', ' + (v.xax ? 'X axis along ' + v.xax.label : 'X axis stays') + '; press ✓.'); }
    function preview() {
      UI.sketchFeedbackClear();
      var o = opts(), L = 30 * ((UI.cam && UI.cam.scale) || 0.01), d = o.dir ? o.dir : [1, 0], n = Math.hypot(d[0], d[1]), ux = [d[0] / n, d[1] / n], uy = [-ux[1], ux[0]], c = o.origin;
      UI.sketchPreview([[c, [c[0] + L * ux[0], c[1] + L * ux[1]]], [c, [c[0] + L * uy[0], c[1] + L * uy[1]]]], HOT_STYLE, 'sk-align-axes');
      if (UI.sketchPreviewText) { UI.sketchPreviewText([c[0] + L * ux[0], c[1] + L * ux[1]], 'X', 'sk-align-label', 4, 0); UI.sketchPreviewText([c[0] + L * uy[0], c[1] + L * uy[1]], 'Y', 'sk-align-label', 4, 0); }
    }
    function pickBox(key, icon, placeholder) {
      return { type: 'pick', icon: icon, placeholder: placeholder, value: function (x) { return x[key] ? x[key].label : ''; },
        active: function (x) { return x.box === key; }, onActivate: function () { v.box = key; UI.renderPM(); hint(); },
        items: function (x) { return x[key] ? [{ label: x[key].label }] : []; },
        onRemove: function (x) { x[key] = null; x.box = key; UI.renderPM(); preview(); hint(); },
        onClear: function (x) { x[key] = null; x.box = key; UI.renderPM(); preview(); hint(); } };
    }
    spec = {
      title: 'Align Grid/Origin', icon: 'moveEnt', values: v, message: HELP, keepSelection: true,
      command: { onSketchPoint: function (uv, mx, my) {
        fresh();
        var ref = UI.pickSketchRef ? UI.pickSketchRef(mx, my) : null, it = null;
        if (ref && ref !== 'O') it = alignFrom(f, { ref: ref });
        if (!it && UI.pickVertex) { var vx = UI.pickVertex(mx, my); if (vx && vx.point) it = alignFrom(f, { vertex: vx.point }); }
        if (!it && UI.pickEdge) { var ed = UI.pickEdge(mx, my); if (ed && ed.edge && ed.edge.a && ed.edge.b) it = alignFrom(f, { edge: ed.edge }); }
        if (!it) { UI.setStatus('Click a sketch point or model vertex for the origin, a sketch line or straight model edge for the X axis.'); return; }
        if (it.kind === 'point') { v.org = it; if (!v.xax) v.box = 'xax'; }
        else { v.xax = it; if (!v.org) v.box = 'org'; }
        UI.renderPM(); preview(); hint();
      } },
      groups: [
        { title: 'Selections', fields: [pickBox('org', 'point', 'Origin (point or vertex)…'), pickBox('xax', 'line', 'X axis (line or edge)…'),
          { type: 'check', key: 'reverse', label: 'Reverse direction' }] }
      ],
      onChange: preview,
      okBlocked: function () { return v.org || v.xax ? '' : 'Select the point for the origin or the line for the X axis.'; },
      onOK: function () {
        fresh();
        var o = opts(), r = step(function () { return alignApply(f, o); }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        clearPreview(); changed();
        UI.setStatus(alignMessage(r));
        return true;
      },
      onCancel: function () { clearPreview(); UI.setStatus('Align Grid/Origin cancelled.'); },
      onClose: function () { UI.sketchFeedbackClear(); },
      help: 'Align Grid/Origin: moves the sketch origin to a point and turns its X axis along a line or edge; the sketch geometry stays where it is.'
    };
    UI.openPM(spec);
    preview(); hint();
    return spec;
  }
  UI.cmdAlignGrid = cmdAlignGrid;
  // UI.alignSketchGrid({ origin: [u, v], dir: [du, dv] }) aligns at once (one undo step), as the PropertyManager's ✓
  UI.alignSketchGrid = function (o) {
    var f = sketch();
    if (!f) return { ok: false, error: 'Open a sketch first.' };
    var r = step(function () { return alignApply(f, o || {}); }, true);
    if (r.ok) { changed(); UI.setStatus(alignMessage(r)); }
    return r;
  };

  // UI.closeArcs([entity indices]) closes those arcs of the open sketch at once (one undo step): { ok, closed,
  // relations, dimensions } (the counts removed), as the PropertyManager's ✓ does
  UI.closeArcs = function (list) {
    var f = sketch();
    if (!f) return { ok: false, error: 'Open a sketch first.' };
    var r = step(function () { return closeArcs(f, list); }, true);
    if (r.ok) { changed(); UI.setStatus(closeArcMessage(r)); }
    return r;
  };

  // rfKU: Mirror Entities with a box-selected slot. A centrepoint / straight slot carries a construction centerline
  // between its cap centres; with that the only centerline in the preselection, the PM (ui-commands.js) took it as
  // *Mirror about* and mirrored the part about the slot's own axis, and the next click on the real centerline was added
  // to the entities. A centerline whose end holds a selected arc's / circle's centre is part of that geometry: it opens
  // as an entity to mirror and Mirror about waits for the click, as in SolidWorks.
  function innerCenterlines(f, sel) {
    var on = {};
    sel.forEach(function (i) { on[i] = true; });
    return sel.filter(function (i) {
      var e = f.entities[i];
      if (!e || e.t !== 'line' || !e.construction) return false;
      return (f.rels || []).some(function (r) {
        if (r.type !== 'coincident') return false;
        var mine = r.refs.some(function (x) { return x === i + '.p1' || x === i + '.p2'; });
        return mine && r.refs.some(function (x) { var m = /^(\d+)\.c$/.exec(x); return m && +m[1] !== i && on[+m[1]]; });
      });
    });
  }
  UI.sketchInnerCenterlines = function (sel) { var f = UI.activeSketchFeature(); return f ? innerCenterlines(f, sel) : []; };
  // ================================================================== rfLF: Check Sketch for Feature, Repair Sketch
  // These two commands moved here from ui-sketch-import.js (lane sketchfix, 2026-11-11); they are installed on UI after
  // every script has loaded (see the end), so they win over the older copies there. The geometry tests are dxf-import.js'
  // (DxfImport.check / ends / overlaps / crossings, its arc3 / setEnd / splitAt / repair for one merge or join at a time).
  var LF_SVG = 'http://www.w3.org/2000/svg';
  function lfEsc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function lfPlural(n, one, many) { return n + ' ' + (n === 1 ? one : many || one + 's'); }
  // SolidWorks' defaults: a gap is anything under 0.001 in (0.025 mm)
  function lfGapTol() { return App.model && App.model.units === 'in' ? 0.001 : 0.025; }
  function lfDist(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
  function lfClone(o) { return JSON.parse(JSON.stringify(o)); }
  function lfName(e, i) { return entityLabel(e, i); }
  function lfLen(x) { return UI.fmtLen ? UI.fmtLen(x) : String(Math.round(x * 1e6) / 1e6); }
  // frame the sketch box b ([x0, y0, x1, y1]) in the graphics area (at least minW wide)
  function lfFrame(b, minW) {
    if (!b || !UI.zoomToArea || !UI.size || !UI.cam) return;
    if (UI.finishViewAnimation) UI.finishViewAnimation();
    var pl = UI.activePlane(), c = [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], s = UI.worldToScreen(K.to3D(pl, c[0], c[1]));
    var w = Math.max(b[2] - b[0], (b[3] - b[1]) * UI.size.w / Math.max(1, UI.size.h), minW || 0) * 1.5;
    if (!(w > 0) || !isFinite(s[0])) return;
    UI.zoomToArea(s[0], s[1], w / (UI.size.w * UI.cam.scale));
  }
  // markers over the sketch, redrawn with the dimension layer: { list: [{ at, kind: 'issue' | 'fix' | 'skip' }], cur }
  var lfMarks = null, lfLayer = null;
  function lfSetMarks(m) { lfMarks = m; App.dimsStale = true; if (UI.requestRender) UI.requestRender(); lfDrawMarks(); }
  function lfDrawMarks() {
    var host = $('dim-layer');
    if (!host) return;
    if (!lfLayer) { lfLayer = document.createElementNS(LF_SVG, 'g'); lfLayer.setAttribute('class', 'dxi-marks'); lfLayer.setAttribute('pointer-events', 'none'); }
    while (lfLayer.firstChild) lfLayer.removeChild(lfLayer.firstChild);
    if (!lfMarks || App.mode !== 'sketch' || !lfMarks.list.length) { if (lfLayer.parentNode) lfLayer.parentNode.removeChild(lfLayer); return; }
    host.appendChild(lfLayer);
    var pl = UI.activePlane();
    lfMarks.list.forEach(function (m, i) {
      var s = UI.worldToScreen(K.to3D(pl, m.at[0], m.at[1])), cur = i === lfMarks.cur, col = m.kind === 'fix' ? '#2f9e5b' : m.kind === 'skip' ? '#b08a1e' : '#d9453b';
      var c = document.createElementNS(LF_SVG, 'circle');
      c.setAttribute('cx', s[0]); c.setAttribute('cy', s[1]); c.setAttribute('r', cur ? 11 : 7);
      c.setAttribute('class', 'dxi-mark' + (cur ? ' cur' : '') + (m.kind === 'skip' ? ' skip' : ''));
      c.setAttribute('style', 'fill:' + col + ';fill-opacity:' + (cur ? 0.25 : 0.12) + ';stroke:' + col + ';stroke-width:' + (cur ? 2.5 : 1.6));
      lfLayer.appendChild(c);
    });
  }
  if (UI.drawDims) {
    var lfBaseDrawDims = UI.drawDims;
    UI.drawDims = function () { var r = lfBaseDrawDims.apply(this, arguments); lfDrawMarks(); return r; };
  }
  function lfHighlight(list) { if (UI.setSelection) UI.setSelection((list || []).map(function (i) { return { kind: 'entity', index: i }; })); }
  var lfRowClick = null;
  if ($('pm')) $('pm').addEventListener('click', function (ev) {
    var t = ev.target && ev.target.closest ? ev.target.closest('[data-lfi]') : null;
    if (t && lfRowClick) lfRowClick(+t.getAttribute('data-lfi'));
  });

  // ------------------------------------------------------------------ contours
  // the profile geometry (not construction, points, text) joined at its ends: [{ ents, open, branch }]
  function lfGeom(e) { return !!e && !e.construction && e.t !== 'point' && e.t !== 'text'; }
  function lfFix(e) { return lfGeom(e) && !e.blk; }   // a block instance's entities are rigid: never repaired
  function lfContours(E, eps) {
    var par = E.map(function (e, i) { return i; }), pts = [];
    function find(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }
    E.forEach(function (e, i) { if (lfGeom(e)) DxfImport.ends(e).forEach(function (en) { pts.push({ i: i, p: en.p }); }); });
    var cl = [];
    pts.forEach(function (x) {
      for (var k = 0; k < cl.length; k++) if (lfDist(cl[k].p, x.p) <= eps) { cl[k].n.push(x.i); return; }
      cl.push({ p: x.p, n: [x.i] });
    });
    cl.forEach(function (c) { for (var k = 1; k < c.n.length; k++) par[find(c.n[k])] = find(c.n[0]); });
    var by = {};
    E.forEach(function (e, i) { if (lfGeom(e)) { var r = find(i); (by[r] = by[r] || { ents: [], open: false, branch: false, ends: [] }).ents.push(i); } });
    cl.forEach(function (c) {
      var g = by[find(c.n[0])];
      if (!g) return;
      if (c.n.length === 1) { g.open = true; g.ends.push(c.p); }
      if (c.n.length >= 3) g.branch = true;
    });
    return Object.keys(by).map(function (k) { return by[k]; });
  }

  // ------------------------------------------------------------------ Feature usage (Check Sketch for Feature)
  // SolidWorks 2024: Tools ▸ Sketch Tools ▸ Check Sketch for Feature: Feature usage, and the Contour type the usage needs
  // (read-only). Rules: open 'none' | 'single' (one open contour and nothing else) | 'any'; closed 'none' | 'single' |
  // 'multi'; one: exactly one contour; lines / linesArcs: entity types; cross / branch: crossings and endpoints shared by
  // three or more entities allowed; need: 'closed' (at least one closed contour)
  var LF_USAGES = [
    { id: 'general', label: 'General (any feature)', contour: 'Any', open: 'any', closed: 'multi', cross: false, branch: false, general: true },
    { id: 'extrude', label: 'Base / Boss Extrude', contour: 'Disjoint or nested closed contours, or one open contour (thin feature)', open: 'single', closed: 'multi' },
    { id: 'cutExtrude', label: 'Cut Extrude', contour: 'Disjoint or nested closed contours, or one open contour (thin feature)', open: 'single', closed: 'multi' },
    { id: 'revolve', label: 'Revolve / Cut Revolve', contour: 'Closed contours, or one open contour (thin feature), on one side of the centerline', open: 'single', closed: 'multi', axis: true },
    { id: 'sweepSection', label: 'Sweep section', contour: 'Single closed contour (one open contour: thin feature)', open: 'single', closed: 'single', one: true },
    { id: 'sweepPath', label: 'Sweep path', contour: 'Single open or closed contour, no self-intersection', open: 'single', closed: 'single', one: true },
    { id: 'loftSection', label: 'Loft section', contour: 'Single open or closed contour', open: 'single', closed: 'single', one: true },
    { id: 'rib', label: 'Rib', contour: 'Open contours', open: 'any', closed: 'none', cross: true, branch: true },
    { id: 'baseFlange', label: 'Base Flange', contour: 'Single open contour, or disjoint / nested closed contours', open: 'single', closed: 'multi' },
    { id: 'edgeFlange', label: 'Edge Flange profile', contour: 'Single open contour', open: 'single', closed: 'none', one: true },
    { id: 'miterFlange', label: 'Miter Flange profile', contour: 'Single open contour of lines and arcs', open: 'single', closed: 'none', one: true, linesArcs: true },
    { id: 'sketchedBend', label: 'Sketched Bend', contour: 'Lines only (one or more bend lines)', open: 'any', closed: 'none', lines: true, cross: true, branch: true },
    { id: 'loftedBend', label: 'Lofted-Bend profile', contour: 'Single open contour of lines and arcs', open: 'single', closed: 'none', one: true, linesArcs: true },
    { id: 'jog', label: 'Hem / Jog line', contour: 'Single line', open: 'single', closed: 'none', lines: true, single: true },
    { id: 'vent', label: 'Vent', contour: 'A closed boundary, with lines and closed contours for ribs, spars and fill-in', open: 'any', closed: 'multi', cross: true, branch: true, need: 'closed' }
  ];
  function lfUsage(id) { return LF_USAGES.filter(function (u) { return u.id === id; })[0] || LF_USAGES[0]; }
  // the usage of the feature that uses sketch f (the feature being edited), else General
  function lfUsageOf(f) {
    var feats = (App.model && App.model.features) || [], id = f && f.id;
    for (var i = 0; i < feats.length; i++) {
      var x = feats[i];
      if (!x || x === f) continue;
      if (x.type === 'sweep') { if (x.profile === id) return 'sweepSection'; if (x.path === id) return 'sweepPath'; continue; }
      if (x.type === 'loft' && (x.sketches || []).indexOf(id) >= 0) return 'loftSection';
      if (x.type === 'loftedBend' && (x.sketches || []).indexOf(id) >= 0) return 'loftedBend';
      if (x.sketch !== id) continue;
      switch (x.type) {
        case 'extrude': return x.sheetBase && !x.tab ? 'baseFlange' : x.cut ? 'cutExtrude' : 'extrude';
        case 'revolve': return 'revolve';
        case 'rib': return 'rib';
        case 'sketchedBend': return 'sketchedBend';
        case 'jog': case 'hem': return 'jog';
        case 'vent': return 'vent';
        case 'miterFlange': return 'miterFlange';
        case 'flange': return 'edgeFlange';
      }
    }
    return 'general';
  }
  // the problems of sketch f for a usage: DxfImport.check's list (gaps, open ends, shared ends, duplicates, tiny,
  // crossings), kept or dropped by the usage's rules, then one message per broken contour rule
  function lfCheck(f, usageId, tol, unit) {
    var u = lfUsage(usageId), E = f.entities;
    var base = DxfImport.check(E, tol, { unit: unit });
    if (u.general) return base;
    var b = DxfImport.bounds(E.filter(lfGeom)), scale = b ? Math.max(1, Math.hypot(b[2] - b[0], b[3] - b[1])) : 1, eps = 1e-9 * scale;
    var cs = lfContours(E, eps), open = cs.filter(function (c) { return c.open; }), closed = cs.filter(function (c) { return !c.open; });
    var singleOpen = open.length === 1 && cs.length === 1 && u.open !== 'none';
    var out = base.filter(function (x) {
      if (x.type === 'open') return u.open === 'none' || (u.open === 'single' && !singleOpen);
      if (x.type === 'cross' || x.type === 'touch') return !u.cross;
      if (x.type === 'branch') return !u.branch;
      return true;
    });
    function all(list) { var o = []; list.forEach(function (c) { o = o.concat(c.ents); }); return o; }
    function at(list) { var bb = DxfImport.bounds(all(list).map(function (i) { return E[i]; })); return bb ? [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2] : [0, 0]; }
    function add(msg, list, ents) { out.push({ type: 'contour', at: at(list), entities: ents || all(list), msg: msg }); }
    var need = u.label + ' needs: ' + u.contour.charAt(0).toLowerCase() + u.contour.slice(1) + '.';
    if (!cs.length) out.push({ type: 'contour', at: [0, 0], entities: [], msg: 'The sketch has no profile geometry. ' + need });
    else {
      if (u.one && cs.length > 1) add('The sketch has ' + cs.length + ' contours. ' + need, cs);
      else {
        if (u.open === 'none' && open.length) add(lfPlural(open.length, 'open contour') + '. ' + need, open);
        if (u.open === 'single' && open.length && cs.length > 1) add(lfPlural(open.length, 'open contour') + ' with ' + lfPlural(cs.length - open.length, 'other contour') + '. ' + need, open);
        if (u.closed === 'none' && closed.length) add(lfPlural(closed.length, 'closed contour') + '. ' + need, closed);
        if (u.closed === 'single' && closed.length > 1) add(lfPlural(closed.length, 'closed contour') + '. ' + need, closed);
      }
      if (u.need === 'closed' && !closed.length) add('No closed boundary. ' + need, cs);
      if (u.lines || u.linesArcs) {
        var bad = [];
        E.forEach(function (e, i) { if (lfGeom(e) && e.t !== 'line' && !(u.linesArcs && e.t === 'arc')) bad.push(i); });
        if (bad.length) out.push({ type: 'contour', at: DxfImport.bounds([E[bad[0]]]) ? (function (bb) { return [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2]; })(DxfImport.bounds([E[bad[0]]])) : [0, 0], entities: bad,
          msg: (bad.length === 1 ? lfName(E[bad[0]], bad[0]) + ' is not a ' + (u.linesArcs ? 'line or an arc' : 'line') : lfPlural(bad.length, 'entity', 'entities') + ' are not ' + (u.linesArcs ? 'lines or arcs' : 'lines')) + '. ' + need });
      }
      if (u.single) { var n = E.filter(lfGeom).length; if (n > 1) add('The sketch has ' + n + ' entities. ' + need, cs); }
      if (u.axis) {
        var cls = E.map(function (e, i) { return e && e.t === 'line' && e.construction ? i : -1; }).filter(function (i) { return i >= 0; });
        if (cls.length === 1) {
          var c = E[cls[0]], d = [c.x2 - c.x1, c.y2 - c.y1], L = Math.hypot(d[0], d[1]), side = {};
          if (L > 0) E.forEach(function (e, i) {
            if (!lfGeom(e)) return;
            K.entityPolylines(e).forEach(function (pl) { pl.pts.forEach(function (p) { var s = ((p[0] - c.x1) * d[1] - (p[1] - c.y1) * d[0]) / L; if (s > tol) side.r = i + 1; if (s < -tol) side.l = i + 1; }); });
          });
          if (side.l && side.r) add('The profile crosses the centerline ' + lfName(c, cls[0]) + ' (it has to lie on one side of the axis). ' + need, cs, [side.l - 1, side.r - 1, cls[0]]);
        }
      }
    }
    out.contours = { open: open.length, closed: closed.length };
    var nonC = out.filter(function (x) { return x.type !== 'contour'; }), parts = [];
    var nOpen = nonC.filter(function (x) { return x.type === 'open'; }).length;
    if (nOpen) parts.push(lfPlural(nOpen, 'open endpoint'));
    if (nonC.length > nOpen) { var s1 = DxfImport.summary(nonC, tol, unit); if (s1 !== 'No problems found') parts.push(s1); }
    if (out.length > nonC.length) parts.push(lfPlural(out.length - nonC.length, 'contour problem'));
    out.summary = parts.length ? parts.join(', ') : 'No problems found';
    return out;
  }

  function cmdCheckSketch() {
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.cancelTool) UI.cancelTool();
    var v = { usage: lfUsageOf(f), tol: lfGapTol(), cur: -1 }, issues = [], spec = null;
    function run() {
      var g = UI.activeSketchFeature();
      if (g) f = g;
      issues = lfCheck(f, v.usage, +v.tol > 0 ? +v.tol : lfGapTol(), UI.unitLabel());
      if (v.cur >= issues.length) v.cur = issues.length - 1;
      lfSetMarks({ list: issues.map(function (x) { return { at: x.at, kind: 'issue' }; }), cur: v.cur });
      if (spec) {
        var cc = issues.contours || { open: 0, closed: 0 };
        spec.message = (issues.length ? lfEsc(issues.summary) : 'No problems found: the sketch is good for ' + (v.usage === 'general' ? 'a feature' : lfEsc(lfUsage(v.usage).label)) + '.') + '<br>' + lfPlural(cc.closed, 'closed contour') + ', ' + lfPlural(cc.open, 'open contour') + '.';
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
      lfSetMarks({ list: issues.map(function (y) { return { at: y.at, kind: 'issue' }; }), cur: v.cur });
      lfHighlight(x.entities);
      var b = DxfImport.bounds((x.entities || []).map(function (i) { return f.entities[i]; }).filter(Boolean)) || DxfImport.bounds(f.entities), span = b ? Math.hypot(b[2] - b[0], b[3] - b[1]) : 1;
      var w = Math.max((x.size || 0) * 60, x.type === 'contour' ? span : span * 0.08);
      lfFrame(x.type === 'contour' && b ? b : [x.at[0] - w / 2, x.at[1] - w / 2, x.at[0] + w / 2, x.at[1] + w / 2], w);
      UI.setStatus((v.cur + 1) + ' of ' + issues.length + ': ' + x.msg);
      UI.renderPM();
    }
    lfRowClick = function (i) { if (issues[i]) { v.cur = i; show(); } };
    function listHtml() {
      if (!issues.length) return '<div class="pm-note">No problems found.</div>';
      var rows = issues.slice(0, 200).map(function (x, i) {
        return '<div class="pm-row dxi-issue' + (i === v.cur ? ' sel' : '') + '" data-lfi="' + i + '" data-dxi="' + i + '" style="cursor:pointer;' + (i === v.cur ? 'font-weight:600;' : '') + '">' +
          '<span style="color:#d9453b">●</span>&nbsp;' + lfEsc(x.msg) + '</div>';
      });
      if (issues.length > 200) rows.push('<div class="pm-note">… and ' + (issues.length - 200) + ' more</div>');
      return rows.join('');
    }
    spec = {
      title: 'Check Sketch for Feature', icon: 'checkSketch', values: v, noFocus: true, keepSelection: true, message: '',
      groups: [
        { title: 'Feature usage', fields: [
          { type: 'select', label: 'Feature usage', key: 'usage', options: LF_USAGES.map(function (u) { return [u.id, u.label]; }) },
          { type: 'static', label: 'Contour type', value: function (x) { return lfUsage(x.usage).contour; } },
          { type: 'number', label: 'Gap tolerance', key: 'tol', unit: 'u', min: 0 },
          { type: 'buttons', buttons: [{ label: 'Check', onclick: function () { v.cur = -1; run(); UI.renderPM(); UI.setStatus('Check Sketch: ' + (issues.length ? issues.summary : 'no problems found') + '.'); } }] }
        ] },
        { title: 'Results', fields: [
          { type: 'buttons', buttons: [{ label: 'Previous', onclick: function () { go(-1); } }, { label: 'Next', onclick: function () { go(1); } }, { label: 'Repair Sketch…', onclick: function () { cmdRepairSketch(); } }] },
          { type: 'html', html: listHtml }
        ] }
      ],
      onChange: function (vals, key) { if (key === 'usage') v.cur = -1; run(); UI.renderPM(); },
      onOK: function () { },
      onClose: function () { lfRowClick = null; lfSetMarks(null); }
    };
    UI.openPM(spec);   // its onChange runs the first check
    if (!spec.message) { run(); UI.renderPM(); }
    UI.setStatus(issues.length ? 'Check Sketch: ' + issues.summary + '. Next / Previous zoom to each problem.' : 'Check Sketch: no problems found.');
    return issues;
  }

  // ------------------------------------------------------------------ Repair Sketch
  // SolidWorks: Tools ▸ Sketch Tools ▸ Repair Sketch. Each repair is an option with its count; the list shows every
  // repair to be made (green) or skipped with the reason (amber); ✓ applies them as one undo step. As SolidWorks closes a
  // gap: two lines meet where they cross (each keeps its direction: extended or trimmed), a line and an arc meet on the
  // arc (its centre and radius kept), collinear overlapping lines merge into one, zero-length entities go. An end that
  // is held (fixed, dimensioned, at the origin, or already joined to other ends) does not move: the other end comes to
  // it. Relations and dimensions of the repaired entities are kept (a merged entity's move to the one that stays); a
  // repair that would over-define the sketch, change a dimension or move other geometry by more than the tolerance is
  // skipped and listed with the reason. Construction geometry, points and text are left alone.
  var LF_LABELS = { gaps: 'Close gaps', merge: 'Merge overlapping / duplicate entities', join: 'Join collinear lines and co-radial arcs', tiny: 'Remove zero-length / tiny entities (below tolerance)', split: 'Split at crossings' };
  function lfSave(sk) { return { entities: lfClone(sk.entities), rels: sk.rels ? lfClone(sk.rels) : null, dims: sk.dims ? lfClone(sk.dims) : null }; }
  function lfRestore(sk, s) { sk.entities = lfClone(s.entities); if (s.rels) sk.rels = lfClone(s.rels); else delete sk.rels; if (s.dims) sk.dims = lfClone(s.dims); else delete sk.dims; }
  function lfEndPt(e, k) {
    if (e.t === 'line') return k === 1 ? [e.x1, e.y1] : [e.x2, e.y2];
    var en = DxfImport.ends(e).filter(function (x) { return x.k === k; })[0];
    return en ? en.p : null;
  }
  // the points of an entity a relation can name, for the drift check
  function lfKeyPts(e) {
    if (!e) return [];
    var out = DxfImport.ends(e).map(function (x) { return x.p; });
    if (e.cx != null) out.push([e.cx, e.cy]);
    if (e.r != null) out.push([e.r, 0]);
    if (e.x != null && e.y != null) out.push([e.x, e.y]);
    return out;
  }
  // is end k of entity i held where it is: fixed, at the origin, named by a dimension (its entity's own, or a distance /
  // angle to it), or joined to another entity's end (a Coincident, or the same point)
  function lfHeld(sk, i, k, eps) {
    var ref = i + '.p' + k, whole = String(i), held = false, p = lfEndPt(sk.entities[i], k);
    (sk.dims || []).forEach(function (d) { if (d.e === i && !d.driven) held = true; });
    (sk.rels || []).forEach(function (r) {
      var refs = r.refs || [];
      if (r.type === 'fix' && (refs.indexOf(ref) >= 0 || refs.indexOf(whole) >= 0)) held = true;
      if ((r.type === 'distance' || r.type === 'angle') && r.v != null && !r.driven && refs.indexOf(ref) >= 0) held = true;
      if (r.type === 'coincident' && refs.indexOf(ref) >= 0 && refs.some(function (x) { return x !== ref && (x === 'O' || /^\d+\.(p\d|c)$/.test(x)); })) held = true;
    });
    if (!held && p) sk.entities.forEach(function (e, j) {
      if (j === i || !lfFix(e)) return;
      DxfImport.ends(e).forEach(function (en) { if (lfDist(en.p, p) <= eps) held = true; });
    });
    return held;
  }
  function lfLinked(sk, a, b) { return (sk.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.indexOf(a) >= 0 && r.refs.indexOf(b) >= 0; }); }
  function lfLineCircle(l, c, r) {
    var d = [l.x2 - l.x1, l.y2 - l.y1], f = [l.x1 - c[0], l.y1 - c[1]], A = d[0] * d[0] + d[1] * d[1], B = 2 * (f[0] * d[0] + f[1] * d[1]), C = f[0] * f[0] + f[1] * f[1] - r * r, D = B * B - 4 * A * C;
    if (!(A > 0) || D < 0) return [];
    var s = Math.sqrt(D);
    return [(-B - s) / (2 * A), (-B + s) / (2 * A)].map(function (t) { return [l.x1 + d[0] * t, l.y1 + d[1] * t]; });
  }
  function lfCircleCircle(c1, r1, c2, r2) {
    var d = lfDist(c1, c2);
    if (!(d > 0) || d > r1 + r2 || d < Math.abs(r1 - r2)) return [];
    var a = (r1 * r1 - r2 * r2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, r1 * r1 - a * a)), ux = (c2[0] - c1[0]) / d, uy = (c2[1] - c1[1]) / d, px = c1[0] + ux * a, py = c1[1] + uy * a;
    return [[px - uy * h, py + ux * h], [px + uy * h, py - ux * h]];
  }
  function lfNearest(list, p) { var best = null, bd = Infinity; list.forEach(function (q) { var d = lfDist(q, p); if (d < bd) { bd = d; best = q; } }); return best; }
  // move end k of e to p: a line's end, an arc's end along its circle when p is on it (centre and radius kept), else the
  // arc through its middle (DxfImport's setEnd)
  function lfSetEnd(e, k, p, tol) {
    if (e.t === 'arc' && Math.abs(lfDist([e.cx, e.cy], p) - e.r) <= 1e-9 * Math.max(1, e.r)) {
      var a = Math.atan2(p[1] - e.cy, p[0] - e.cx) * 180 / Math.PI, ref = k === 1 ? e.a0 : e.a1;
      while (a - ref > 180) a -= 360;
      while (a - ref < -180) a += 360;
      if (k === 1) e.a0 = a; else e.a1 = a;
      if (e.a1 <= e.a0) return false;
      while (e.a0 < 0) { e.a0 += 360; e.a1 += 360; }
      while (e.a0 >= 360) { e.a0 -= 360; e.a1 -= 360; }
      return true;
    }
    return DxfImport._.setEnd(e, k, p);
  }
  // where a gap's two ends meet when neither is held
  function lfMeet(ea, pa, eb, pb, tol) {
    var mid = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2], t = null;
    if (ea.t === 'line' && eb.t === 'line') {
      var d1 = [ea.x2 - ea.x1, ea.y2 - ea.y1], d2 = [eb.x2 - eb.x1, eb.y2 - eb.y1], cr = d1[0] * d2[1] - d1[1] * d2[0], l1 = Math.hypot(d1[0], d1[1]), l2 = Math.hypot(d2[0], d2[1]);
      if (l1 > 0 && l2 > 0 && Math.abs(cr) > 1e-6 * l1 * l2) {
        var s = ((eb.x1 - ea.x1) * d2[1] - (eb.y1 - ea.y1) * d2[0]) / cr;
        t = [ea.x1 + d1[0] * s, ea.y1 + d1[1] * s];
      }
    } else if (ea.t === 'line' && eb.t === 'arc') t = lfNearest(lfLineCircle(ea, [eb.cx, eb.cy], eb.r), mid);
    else if (eb.t === 'line' && ea.t === 'arc') t = lfNearest(lfLineCircle(eb, [ea.cx, ea.cy], ea.r), mid);
    else if (ea.t === 'arc' && eb.t === 'arc') t = lfNearest(lfCircleCircle([ea.cx, ea.cy], ea.r, [eb.cx, eb.cy], eb.r), mid);
    if (t && lfDist(t, pa) <= tol && lfDist(t, pb) <= tol) return t;
    // a line and a curve that do not cross near the gap: the line comes to the curve's end (the curve keeps its shape)
    if (ea.t === 'line' && eb.t !== 'line') return pb;
    if (eb.t === 'line' && ea.t !== 'line') return pa;
    return mid;
  }
  // the end refs of an entity, as the solver names them
  function lfEndRef(sk, i, k) { return i + '.p' + k; }
  function lfRelName(r) { return (S.TYPES && S.TYPES[r.type] && (S.TYPES[r.type].name || S.TYPES[r.type])) || r.type; }
  // entity b (merged or joined into a) goes; a takes geometry geom. Every relation and dimension of a and b is moved onto
  // the new a: an end to the end of a now at the same place (a Coincident there to a's line instead, when that end is now
  // inside it), the whole entity to a, a centre / midpoint where it stays. A relation that cannot move, or a dimension
  // whose value would change, refuses the repair ({ why }). Relations that now tie a to itself go; repeats go.
  function lfMergeInto(sk, a, b, geom, tol) {
    var E = sk.entities, A0 = lfClone(E[a]), B0 = lfClone(E[b]);
    var ne = lfClone(E[a]);
    Object.keys(ne).forEach(function (k) { if (k !== 'layer' && k !== 'construction' && k !== 'style' && k !== 'color') delete ne[k]; });
    Object.keys(geom).forEach(function (k) { if (k !== 'layer' && k !== 'construction') ne[k] = geom[k]; });
    var newEnds = [1, 2].map(function (k) { return { k: k, p: lfEndPt(ne, k) }; }).filter(function (x) { return x.p; });
    function mapRef(r, rel) {
      var p = S.parseRef(r);
      if (!p || p.o || (p.e !== a && p.e !== b)) return r;
      var old = p.e === a ? A0 : B0;
      if (p.s === null) return String(a);
      if (p.s === 'p') {
        var at = lfEndPt(old, p.k), hit = null;
        if (!at) return null;
        newEnds.forEach(function (x) { if (!hit && lfDist(x.p, at) <= tol) hit = a + '.p' + x.k; });
        if (hit) return hit;
        return rel.type === 'coincident' ? String(a) : null;
      }
      if ((p.s === 'c' || p.s === 'mid') && old.t === ne.t) {
        if (p.s === 'c' && ne.cx != null && lfDist([old.cx, old.cy], [ne.cx, ne.cy]) <= tol) return a + '.c';
        if (p.s === 'mid' && old.t === 'line' && lfDist([(old.x1 + old.x2) / 2, (old.y1 + old.y2) / 2], [(ne.x1 + ne.x2) / 2, (ne.y1 + ne.y2) / 2]) <= tol) return a + '.mid';
      }
      return null;
    }
    var why = null, seen = {};
    var rels = [];
    (sk.rels || []).forEach(function (rel) {
      if (why) return;
      var touches = (rel.refs || []).some(function (r) { var p = S.parseRef(r); return p && !p.o && (p.e === a || p.e === b); });
      if (!touches) { rels.push(rel); return; }
      var refs = rel.refs.map(function (r) { return mapRef(r, rel); });
      if (refs.some(function (r) { return r == null; })) { why = 'its ' + lfRelName(rel) + ' relation cannot move to the merged entity'; return; }
      var onA = refs.every(function (r) { var p = S.parseRef(r); return p && !p.o && p.e === a; });
      if (onA && rel.refs.length > 1) return;   // it tied the two together: nothing to hold now
      var key = rel.type + ':' + refs.slice().sort().join(',') + ':' + (rel.v == null ? '' : rel.v);
      if (seen[key]) return;
      seen[key] = true;
      var c = lfClone(rel);
      c.refs = refs;
      rels.push(c);
    });
    if (why) return { why: why };
    var dims = [], dseen = {};
    (sk.dims || []).forEach(function (d) {
      if (why) return;
      if (d.e !== a && d.e !== b) { dims.push(d); return; }
      var v0 = K.dimValue(d.e === a ? A0 : B0, d), v1 = K.dimValue(ne, d);
      if (v0 == null || v1 == null || Math.abs(v0 - v1) > Math.max(tol, 1e-9)) { why = 'a dimension on it would change' + (v0 != null && v1 != null ? ' from ' + lfLen(v0) + ' to ' + lfLen(v1) : ''); return; }
      var key = d.k + ':' + (d.i == null ? '' : d.i);
      if (dseen[key]) return;
      dseen[key] = true;
      var c = lfClone(d); c.e = a; dims.push(c);
    });
    if (why) return { why: why };
    E[a] = ne;
    sk.rels = rels; if (!sk.rels.length) delete sk.rels;
    sk.dims = dims; if (!sk.dims.length) delete sk.dims;
    S.removeEntity(sk, b);
    E.splice(b, 1);
    (sk.dims || []).forEach(function (d) { if (d.e > b) d.e--; });
    return { ok: true };
  }
  // remove entity z (zero-length or tiny); the ends it joined are joined to each other when it had no length
  function lfRemove(sk, z, zero) {
    var E = sk.entities, groups = [[], []];
    if ((sk.dims || []).some(function (d) { return d.e === z && !d.driven; })) return { why: 'it has a dimension' };
    if (zero) (sk.rels || []).forEach(function (r) {
      if (r.type !== 'coincident') return;
      [1, 2].forEach(function (k) { if (r.refs.indexOf(z + '.p' + k) >= 0) r.refs.forEach(function (x) { var p = S.parseRef(x); if (x !== z + '.p' + k && (p && (p.o || p.e !== z))) groups[k - 1].push(x); }); });
    });
    S.removeEntity(sk, z);
    E.splice(z, 1);
    if (sk.dims) { sk.dims = sk.dims.filter(function (d) { return d.e !== z; }).map(function (d) { if (d.e > z) d.e--; return d; }); if (!sk.dims.length) delete sk.dims; }
    function shift(x) { var p = S.parseRef(x); return !p || p.o || p.e < z ? x : (p.e - 1) + String(x).slice(String(p.e).length); }
    var all = groups[0].concat(groups[1]).map(shift).filter(function (x, i, arr) { return arr.indexOf(x) === i; });
    for (var k = 1; k < all.length; k++) if (!lfLinked(sk, all[0], all[k])) (sk.rels = sk.rels || []).push({ type: 'coincident', refs: [all[0], all[k]] });
    return { ok: true };
  }
  // the whole repair on a copy of sketch f: { sk, items: [{ type, at, msg, ok, why }], count: { gaps, merge, join, tiny, split } }
  function lfRepair(f, o) {
    var sk = Object.assign({}, f);
    sk.entities = lfClone(f.entities);
    if (f.rels) sk.rels = lfClone(f.rels); else delete sk.rels;
    if (f.dims) sk.dims = lfClone(f.dims); else delete sk.dims;
    var tol = o.tol * (1 + 1e-6), items = [], count = { gaps: 0, merge: 0, join: 0, tiny: 0, split: 0 };
    var b0 = DxfImport.bounds(sk.entities.filter(lfGeom)), scale = b0 ? Math.max(1, Math.hypot(b0[2] - b0[0], b0[3] - b0[1])) : 1, eps = 1e-9 * scale;
    var solver = !!((sk.rels && sk.rels.length) || (sk.dims && sk.dims.length));
    var an0 = solver ? S.analyze(sk) : null, tried = {};
    function key(type, list) { return type + ':' + JSON.stringify(list.map(function (i) { return sk.entities[i]; })); }
    function attempt(type, opt, at, msg, fn) {
      var saved = lfSave(sk), r;
      try { r = fn(); } catch (e) { r = { why: e.message }; }
      if (r && r.why) { lfRestore(sk, saved); items.push({ type: type, at: at, msg: msg, ok: false, why: r.why }); return false; }
      if (solver) {
        var planned = sk.entities.map(lfKeyPts), res = S.solve(sk), an = res && res.ok ? S.analyze(sk) : null, drift = 0;
        if (an) sk.entities.forEach(function (e, i) { var q = lfKeyPts(e); (planned[i] || []).forEach(function (p, j) { if (q[j]) drift = Math.max(drift, lfDist(p, q[j])); }); });
        var whyS = !an ? 'it would over-define the sketch (its relations and dimensions could not all hold)' : an.conflicts > an0.conflicts || an.redundant > an0.redundant || (an.status === 'over' && an0.status !== 'over') ? 'it would over-define the sketch' : drift > tol ? 'it would move other geometry ' + lfLen(drift) : null;
        if (whyS) { lfRestore(sk, saved); items.push({ type: type, at: at, msg: msg, ok: false, why: whyS }); return false; }
        an0 = an;
      }
      items.push({ type: type, at: at, msg: msg, ok: true });
      count[opt]++;
      return true;
    }
    // 1. zero-length and tiny entities
    if (o.tiny) for (var g1 = 0; g1 < 500; g1++) {
      var z = -1, E1 = sk.entities;
      for (var i = 0; i < E1.length && z < 0; i++) if (lfFix(E1[i]) && DxfImport._.entLength(E1[i]) < tol && !tried[key('tiny', [i])]) z = i;
      if (z < 0) break;
      tried[key('tiny', [z])] = true;
      var L = DxfImport._.entLength(E1[z]), zero = L <= eps, mid = DxfImport.bounds([E1[z]]);
      mid = mid ? [(mid[0] + mid[2]) / 2, (mid[1] + mid[3]) / 2] : [0, 0];
      attempt('removed', 'tiny', mid, (zero ? 'Zero-length ' : 'Tiny ') + lfName(E1[z], z) + (zero ? '' : ' (' + lfLen(L) + ')') + ' removed', (function (zz, zr) { return function () { return lfRemove(sk, zz, zr); }; })(z, zero));
    }
    // 2. duplicates and overlaps: the one with more relations and dimensions stays, the union of both
    if (o.merge) for (var g2 = 0; g2 < 500; g2++) {
      var E2 = sk.entities, hits = DxfImport.overlaps(E2, tol).filter(function (h) { return !tried[key('merge', [h.i, h.j])]; });
      if (!hits.length) break;
      var h = hits[0];
      tried[key('merge', [h.i, h.j])] = true;
      var w = function (i) { return (sk.rels || []).filter(function (r) { return r.refs.some(function (x) { var p = S.parseRef(x); return p && !p.o && p.e === i; }); }).length + (sk.dims || []).filter(function (d) { return d.e === i; }).length; };
      var keep = w(h.j) > w(h.i) ? h.j : h.i, gone = keep === h.i ? h.j : h.i;
      var rr = DxfImport.repair([E2[keep], E2[gone]], { tol: o.tol, merge: true, closeGaps: false, join: false, removeTiny: false, split: false });
      if (rr.entities.length !== 1) { items.push({ type: 'merged', at: h.at, msg: (h.kind === 'duplicate' ? 'Duplicate ' : 'Overlapping ') + lfName(E2[gone], gone) + ' and ' + lfName(E2[keep], keep), ok: false, why: 'they do not merge into one entity' }); continue; }
      attempt('merged', 'merge', h.at, (h.kind === 'duplicate' ? 'Duplicate ' : 'Overlapping ') + lfName(E2[gone], gone) + ' merged into ' + lfName(E2[keep], keep), (function (kk, gg, geom) { return function () { return lfMergeInto(sk, kk, gg, geom, tol); }; })(keep, gone, rr.entities[0]));
    }
    // 3. gaps: each free end and the nearest end of another entity within the tolerance
    if (o.gaps) for (var g3 = 0; g3 < 2000; g3++) {
      var E3 = sk.entities, ends = [], best = null;
      E3.forEach(function (e, i) { if (lfFix(e)) DxfImport.ends(e).forEach(function (en) { ends.push({ i: i, k: en.k, p: en.p, rigid: !!en.rigid }); }); });
      ends.forEach(function (x) {
        // a free end: no other entity's end on it
        if (ends.some(function (y) { return y.i !== x.i && lfDist(y.p, x.p) <= eps; })) return;
        ends.forEach(function (y) {
          if (y.i === x.i) return;
          var d = lfDist(x.p, y.p);
          if (d <= eps || d > tol) return;
          var kk = x.i < y.i ? key('gap', [x.i, y.i]) + x.k + y.k : key('gap', [y.i, x.i]) + y.k + x.k;   // either way round
          if (tried[kk] || (best && best.d <= d)) return;
          if (lfLinked(sk, lfEndRef(sk, x.i, x.k), lfEndRef(sk, y.i, y.k))) return;
          best = { x: x, y: y, d: d, key: kk };
        });
      });
      if (!best) break;
      tried[best.key] = true;
      (function (bx) {
        var x = bx.x, y = bx.y, ex = sk.entities[x.i], ey = sk.entities[y.i];
        var hx = x.rigid || lfHeld(sk, x.i, x.k, eps), hy = y.rigid || lfHeld(sk, y.i, y.k, eps);
        var at = [(x.p[0] + y.p[0]) / 2, (x.p[1] + y.p[1]) / 2], msg = 'Gap of ' + lfLen(bx.d) + ' between ' + lfName(ex, x.i) + ' and ' + lfName(ey, y.i) + ' closed';
        if (hx && hy) { items.push({ type: 'gap', at: at, msg: msg, ok: false, why: 'both ends are held (fixed, dimensioned or joined)' }); return; }
        attempt('gap', 'gaps', at, msg, function () {
          var t = hx ? x.p : hy ? y.p : lfMeet(ex, x.p, ey, y.p, tol);
          t = [t[0], t[1]];
          if ((!hx && lfDist(t, x.p) > tol) || (!hy && lfDist(t, y.p) > tol)) return { why: 'the ends would move more than the tolerance' };
          if (!hx && lfDist(t, x.p) > 0 && !lfSetEnd(sk.entities[x.i], x.k, t, tol)) return { why: lfName(ex, x.i) + ' cannot reach the other end' };
          if (!hy && lfDist(t, y.p) > 0 && !lfSetEnd(sk.entities[y.i], y.k, t, tol)) return { why: lfName(ey, y.i) + ' cannot reach the other end' };
          (sk.rels = sk.rels || []).push({ type: 'coincident', refs: [lfEndRef(sk, x.i, x.k), lfEndRef(sk, y.i, y.k)] });
          return { ok: true };
        });
      })(best);
    }
    // 4. collinear lines and co-radial arcs meeting end to end (and nothing else there): one entity
    if (o.join) for (var g4 = 0; g4 < 500; g4++) {
      var E4 = sk.entities, ends4 = [], pair = null;
      E4.forEach(function (e, i) { if (lfFix(e) && (e.t === 'line' || e.t === 'arc')) DxfImport.ends(e).forEach(function (en) { ends4.push({ i: i, k: en.k, p: en.p }); }); });
      var allEnds = [];
      E4.forEach(function (e, i) { if (lfFix(e)) DxfImport.ends(e).forEach(function (en) { allEnds.push({ i: i, p: en.p }); }); });
      for (var a4 = 0; a4 < ends4.length && !pair; a4++) for (var b4 = a4 + 1; b4 < ends4.length && !pair; b4++) {
        var x4 = ends4[a4], y4 = ends4[b4];
        if (x4.i === y4.i || E4[x4.i].t !== E4[y4.i].t || lfDist(x4.p, y4.p) > eps) continue;
        if (allEnds.filter(function (q) { return lfDist(q.p, x4.p) <= eps; }).length !== 2) continue;
        var k4 = key('join', [x4.i, y4.i]);
        if (tried[k4]) continue;
        var j = DxfImport.repair([E4[x4.i], E4[y4.i]], { tol: o.tol, merge: false, closeGaps: false, join: true, removeTiny: false, split: false });
        if (j.entities.length !== 1) continue;
        tried[k4] = true;
        pair = { a: x4.i, b: y4.i, at: x4.p, geom: j.entities[0], keep: j.map[0] === 0 };
      }
      if (!pair) break;
      (function (pr) {
        var keep = pr.keep ? pr.a : pr.b, gone = keep === pr.a ? pr.b : pr.a;
        attempt('joined', 'join', pr.at, lfName(sk.entities[gone], gone) + ' joined to ' + lfName(sk.entities[keep], keep), function () { return lfMergeInto(sk, keep, gone, pr.geom, tol); });
      })(pair);
    }
    // 5. split lines, arcs and circles where they cross (entities with no relations or dimensions)
    if (o.split) for (var g5 = 0; g5 < 500; g5++) {
      var E5 = sk.entities, xs = DxfImport.crossings(E5, Math.max(eps, Math.min(tol, 1e-6 * scale))).filter(function (c) { return !c.touch && !tried['split:' + c.at.join(',')]; });
      if (!xs.length) break;
      var c5 = xs[0];
      tried['split:' + c5.at.join(',')] = true;
      (function (c) {
        var held = [c.i, c.j].filter(function (i) { return (sk.rels || []).some(function (r) { return r.refs.some(function (x) { var p = S.parseRef(x); return p && !p.o && p.e === i; }); }) || (sk.dims || []).some(function (d) { return d.e === i; }); });
        var msg = lfName(E5[c.i], c.i) + ' and ' + lfName(E5[c.j], c.j) + ' split where they cross';
        if (held.length) { items.push({ type: 'split', at: c.at, msg: msg, ok: false, why: lfName(E5[held[0]], held[0]) + ' has relations or dimensions (use Trim Entities)' }); return; }
        attempt('split', 'split', c.at, msg, function () {
          var hi = Math.max(c.i, c.j), lo = Math.min(c.i, c.j), add = [];
          [hi, lo].forEach(function (i) {
            var pcs = DxfImport._.splitAt(sk.entities[i], [c.at], tol);
            if (!pcs || pcs.length < 2) return;
            var e0 = sk.entities[i];
            pcs.forEach(function (p) { if (e0.layer) p.layer = e0.layer; });
            sk.entities[i] = pcs[0];
            add = add.concat(pcs.slice(1));
          });
          if (!add.length) return { why: 'nothing to split' };
          add.forEach(function (p) { sk.entities.push(p); });
          return { ok: true };
        });
      })(c5);
    }
    if (S.clean) S.clean(sk);
    return { sk: sk, items: items, count: count };
  }

  function cmdRepairSketch() {
    var f = UI.activeSketchFeature();
    if (!f || App.mode !== 'sketch') { UI.toast('Open a sketch first.'); return; }
    if (UI.cancelTool) UI.cancelTool();
    var v = { tol: lfGapTol(), gaps: true, merge: true, join: true, tiny: true, split: false }, res = null, spec = null;
    var F = {};
    Object.keys(LF_LABELS).forEach(function (k) { F[k] = { type: 'check', label: LF_LABELS[k], key: k }; });
    function opts() { return { tol: +v.tol > 0 ? +v.tol : lfGapTol(), gaps: !!v.gaps, merge: !!v.merge, join: !!v.join, tiny: !!v.tiny, split: !!v.split }; }
    function made(r) { return r.items.filter(function (x) { return x.ok; }).length; }
    function run() {
      var g = UI.activeSketchFeature();
      if (g) f = g;
      res = lfRepair(f, opts());
      Object.keys(F).forEach(function (k) { F[k].label = LF_LABELS[k] + (v[k] ? ' (' + res.count[k] + ')' : ''); });
      lfSetMarks({ list: res.items.map(function (x) { return { at: x.at, kind: x.ok ? 'fix' : 'skip' }; }), cur: -1 });
      var n = made(res), skipped = res.items.length - n;
      spec.message = n ? 'Repairs to make: ' + lfPlural(n, 'repair') + (skipped ? ', ' + lfPlural(skipped, 'skipped') : '') + '. ✓ applies them as one undo step.' : skipped ? 'Nothing can be repaired: ' + lfPlural(skipped, 'repair') + ' skipped (see the list).' : 'Nothing to repair at this tolerance.';
      spec.messageOk = !res.items.length;
    }
    lfRowClick = function (i) {
      var x = res && res.items[i];
      if (!x) return;
      lfSetMarks({ list: res.items.map(function (y) { return { at: y.at, kind: y.ok ? 'fix' : 'skip' }; }), cur: i });
      var b = DxfImport.bounds(f.entities), span = b ? Math.hypot(b[2] - b[0], b[3] - b[1]) : 1, w = Math.max(+v.tol * 60, span * 0.08);
      lfFrame([x.at[0] - w / 2, x.at[1] - w / 2, x.at[0] + w / 2, x.at[1] + w / 2], w);
      UI.setStatus(x.msg + (x.ok ? '.' : ': skipped, ' + x.why + '.'));
    };
    function listHtml() {
      if (!res || !res.items.length) return '<div class="pm-note">Nothing to repair.</div>';
      return res.items.slice(0, 200).map(function (x, i) {
        return '<div class="pm-row lf-repair' + (x.ok ? '' : ' lf-skip') + '" data-lfi="' + i + '" style="cursor:pointer">' +
          '<span style="color:' + (x.ok ? '#2f9e5b' : '#b08a1e') + '">●</span>&nbsp;' + lfEsc(x.msg) + (x.ok ? '' : ' — skipped: ' + lfEsc(x.why)) + '</div>';
      }).join('') + (res.items.length > 200 ? '<div class="pm-note">… and ' + (res.items.length - 200) + ' more</div>' : '');
    }
    spec = {
      title: 'Repair Sketch', icon: 'repairSketch', values: v, noFocus: true, message: '',
      groups: [
        { title: 'Tolerance', fields: [{ type: 'number', label: 'Gap tolerance', key: 'tol', unit: 'u', min: 0 }] },
        { title: 'Options', fields: [F.gaps, F.merge, F.join, F.tiny, F.split] },
        { title: 'Repairs', fields: [{ type: 'html', html: listHtml }] }
      ],
      onChange: function () { run(); UI.renderPM(); },
      okBlocked: function () { return res && made(res) ? '' : res && res.items.length ? 'Nothing can be repaired: every repair is skipped (see the list).' : 'Nothing to repair at this tolerance.'; },
      onOK: function () {
        var out = null;
        var r = step(function () {
          var g = UI.activeSketchFeature() || f, rr = lfRepair(g, opts());
          if (!made(rr)) return { ok: false, error: 'Nothing to repair at this tolerance.' };
          g.entities = rr.sk.entities;
          if (rr.sk.rels && rr.sk.rels.length) g.rels = rr.sk.rels; else delete g.rels;
          if (rr.sk.dims && rr.sk.dims.length) g.dims = rr.sk.dims; else delete g.dims;
          out = rr;
          return { ok: true };
        }, true);
        if (!r.ok) { UI.toast(r.error); return false; }
        changed();
        var c = out.count, sk = out.items.filter(function (x) { return !x.ok; }).length;
        UI.setStatus('Repaired: ' + [lfPlural(c.gaps, 'gap') + ' closed', lfPlural(c.merge, 'duplicate') + ' merged', lfPlural(c.join, 'join'), lfPlural(c.tiny, 'tiny entity', 'tiny entities') + ' removed'].concat(c.split ? [lfPlural(c.split, 'split')] : []).concat(sk ? [lfPlural(sk, 'repair') + ' skipped'] : []).join(', ') + '.');
      },
      onClose: function () { lfRowClick = null; lfSetMarks(null); }
    };
    UI.openPM(spec);   // its onChange runs the first preview
    if (!res) { run(); UI.renderPM(); }
    return res;
  }
  // test hooks: the plans without the PropertyManagers
  UI.sketchRepairPlan = function (opts) { var f = UI.activeSketchFeature(); return f ? lfRepair(f, Object.assign({ tol: lfGapTol(), gaps: true, merge: true, join: true, tiny: true, split: false }, opts || {})) : null; };
  UI.sketchCheckFor = function (usage, tol) { var f = UI.activeSketchFeature(); return f ? lfCheck(f, usage, tol || lfGapTol(), UI.unitLabel()) : null; };
  UI.sketchUsageOf = function () { return lfUsageOf(UI.activeSketchFeature()); };
  UI.sketchFeatureUsages = function () { return LF_USAGES.map(function (u) { return { id: u.id, label: u.label, contour: u.contour }; }); };
  // the one copy of Check Sketch for Feature and Repair Sketch (lane sketchref2 removed the older ones from ui-sketch-import.js)
  UI.cmdCheckSketch = cmdCheckSketch; UI.cmdRepairSketch = cmdRepairSketch;
  UI.sketchCheckMarks = function () { return lfMarks ? { cur: lfMarks.cur, list: lfMarks.list.slice() } : null; };
})();
