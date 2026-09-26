// holewizard.js — Hole Wizard: standard holes as one 'hole' feature (Counterbore, Countersink, Hole, Straight Tap).
// Loaded after kernel.js (app, tests, rebuild worker). No DOM, no three.js.
//
// Feature JSON:
//   { type: 'hole', holeType: 'cbore' | 'csk' | 'hole' | 'tap', standard: 'ISO', size: 'M8', fit: 'close' | 'normal' | 'loose',
//     end: 'blind' | 'through', depth, threadDepth (tap, blind), sketch: <id of a sketch of points on a planar face> }
// Each point of the positions sketch is a hole; the hole runs into the face (against the sketch plane's normal).
// The tool is a revolve of the hole's half section about its axis (Kernel.buildTool 'revolve' on a plane through the
// axis), so its walls carry true-curve records: cylinders and the countersink cone are exact. Blind depth is measured
// from the face to the flat bottom (no drill point) and includes the counterbore / countersink.
//
// Script: p.holeWizard({ sketch: f3, type: 'cbore', size: 'M8', fit: 'normal', depth: 20 })            (a points sketch)
//         p.holeWizard({ face: 'Top', offset: 20, points: [[0, 0], [20, 0]], type: 'tap', size: 'M6', depth: 12 })
var HoleWizard = (function () {
  'use strict';
  var K = Kernel, V = K.vec;

  // ISO metric coarse series. clr: ISO 273 clearance holes [close, normal, loose]; pitch: ISO 261 coarse; tap: tap
  // drill (D - P); cb: counterbore for ISO 4762 socket head cap screws [diameter, depth] (head dk + clearance, depth
  // head k + clearance); csk: countersink diameter for ISO 10642 countersunk screws (head dk max, 90°; M2 / M2.5 from
  // ISO 7046).
  var ISO = [
    { size: 'M2', d: 2, pitch: 0.4, tap: 1.6, clr: [2.2, 2.4, 2.6], cb: [4.4, 2.2], csk: 4.4 },
    { size: 'M2.5', d: 2.5, pitch: 0.45, tap: 2.05, clr: [2.7, 2.9, 3.1], cb: [5.5, 2.7], csk: 5.5 },
    { size: 'M3', d: 3, pitch: 0.5, tap: 2.5, clr: [3.2, 3.4, 3.6], cb: [6.5, 3.3], csk: 6.72 },
    { size: 'M4', d: 4, pitch: 0.7, tap: 3.3, clr: [4.3, 4.5, 4.8], cb: [8, 4.4], csk: 8.96 },
    { size: 'M5', d: 5, pitch: 0.8, tap: 4.2, clr: [5.3, 5.5, 5.8], cb: [10, 5.4], csk: 11.2 },
    { size: 'M6', d: 6, pitch: 1, tap: 5, clr: [6.4, 6.6, 7], cb: [11, 6.5], csk: 13.44 },
    { size: 'M8', d: 8, pitch: 1.25, tap: 6.8, clr: [8.4, 9, 10], cb: [15, 8.6], csk: 17.92 },
    { size: 'M10', d: 10, pitch: 1.5, tap: 8.5, clr: [10.5, 11, 12], cb: [18, 10.8], csk: 22.4 },
    { size: 'M12', d: 12, pitch: 1.75, tap: 10.2, clr: [13, 13.5, 14.5], cb: [20, 13], csk: 26.88 },
    { size: 'M14', d: 14, pitch: 2, tap: 12, clr: [15, 15.5, 16.5], cb: [24, 15], csk: 30.8 },
    { size: 'M16', d: 16, pitch: 2, tap: 14, clr: [17, 17.5, 18.5], cb: [26, 17.5], csk: 33.6 },
    { size: 'M20', d: 20, pitch: 2.5, tap: 17.5, clr: [21, 22, 24], cb: [33, 21.5], csk: 40.32 }
  ];
  var TYPES = [['cbore', 'Counterbore'], ['csk', 'Countersink'], ['hole', 'Hole'], ['tap', 'Straight Tap']];
  var FITS = [['close', 'Close'], ['normal', 'Normal'], ['loose', 'Loose']];
  var FIT_INDEX = { close: 0, normal: 1, loose: 2 };
  var CSK_ANGLE = 90;
  var TOP = 0.01; // the tool starts this far above the face so the cut never leaves a skin

  function sizeRow(size) {
    for (var i = 0; i < ISO.length; i++) if (ISO[i].size === size) return ISO[i];
    throw new Error('Unknown ISO size ' + size + '.');
  }

  // spec(f) -> { dia, cbore: { dia, depth } | null, csk: { dia, angle } | null, thread: { major, pitch, label } | null }
  function spec(f) {
    var row = sizeRow(f.size || 'M6'), t = f.holeType || 'hole';
    var clr = row.clr[FIT_INDEX[f.fit] != null ? FIT_INDEX[f.fit] : 1];
    var out = { dia: t === 'tap' ? row.tap : clr, cbore: null, csk: null, thread: null, row: row };
    if (t === 'cbore') out.cbore = { dia: row.cb[0], depth: row.cb[1] };
    if (t === 'csk') out.csk = { dia: row.csk, angle: CSK_ANGLE };
    if (t === 'tap') out.thread = { major: row.d, pitch: row.pitch, label: row.size + 'x' + row.pitch };
    return out;
  }

  // half section (r, z) of one hole, z up out of the face, down to z = -L
  function section(s, L) {
    var R = s.dia / 2, pts = [[0, TOP]];
    if (s.cbore) {
      var Rc = s.cbore.dia / 2;
      if (s.cbore.depth >= L) throw new Error('The hole must be deeper than its counterbore.');
      pts.push([Rc, TOP], [Rc, -s.cbore.depth], [R, -s.cbore.depth]);
    } else if (s.csk) {
      var Rs = s.csk.dia / 2, k = Math.tan(s.csk.angle / 2 * Math.PI / 180), h = (Rs - R) / k;
      if (h >= L) throw new Error('The hole must be deeper than its countersink.');
      pts.push([Rs + TOP * k, TOP], [R, -h]);
    } else pts.push([R, TOP]);
    pts.push([R, -L], [0, -L]);
    return pts;
  }

  function positions(f, model, ctx) {
    var sk = (ctx && ctx.sketches && ctx.sketches[f.sketch]) || K.findFeature(model, f.sketch);
    if (!sk || sk.type !== 'sketch') throw new Error('Hole Wizard: select the positions sketch.');
    var plane = K.resolvePlane(sk.plane, model, ctx && ctx.planes);
    var pts = (sk.entities || []).filter(function (e) { return e.t === 'point' && !e.construction; });
    if (!pts.length) throw new Error('Hole Wizard: place at least one point on the face.');
    return { plane: plane, pts: pts.map(function (e) { return { uv: [e.x, e.y], p: K.to3D(plane, e.x, e.y) }; }) };
  }

  function holeDepth(f, ctx) {
    if (f.end === 'through') {
      var b = ctx && ctx.body && ctx.body.getBounds();
      var diag = b ? Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) : 0;
      return Math.max(ctx && ctx.throughLimit || 0, diag * 2 + 10, 100);
    }
    var d = +f.depth;
    if (!(d > 0)) throw new Error('Hole depth must be greater than 0.');
    return d;
  }

  function build(f, model, ctx) {
    var s = spec(f), pos = positions(f, model, ctx), L = holeDepth(f, ctx), prof = section(s, L);
    var n = pos.plane.n, x = pos.plane.x, tools = pos.pts.map(function (q) {
      var y = n, nn = V.cross(x, y);
      var rp = { custom: true, origin: q.p, x: x.slice(), y: y.slice(), n: nn, offset: V.dot(nn, q.p) };
      var sk = { id: -1, type: 'sketch', plane: rp, entities: [{ t: 'polyline', pts: prof, closed: true }] };
      return K.buildTool({ id: f.id, type: 'revolve', sketch: -1, axis: { x1: 0, y1: 0, x2: 0, y2: 1 }, angle: 360, cut: true }, model, { sketches: { '-1': sk }, planes: {} });
    });
    var t = tools[0];
    for (var i = 1; i < tools.length; i++) t = t.union(tools[i]);
    return t;
  }

  // threads(model) -> cosmetic threads of every Straight Tap hole: [{ featureId, p, n (into the part), r (major
  // radius), depth (null through), label }]
  function threads(model) {
    var out = [];
    (model.features || []).forEach(function (f) {
      if (f.type !== 'hole' || f.holeType !== 'tap' || f.suppressed) return;
      try {
        var s = spec(f), pos = positions(f, model, null);
        var depth = f.end === 'through' ? null : +(f.threadDepth || f.depth);
        pos.pts.forEach(function (q) { out.push({ featureId: f.id, p: q.p, n: V.scale(pos.plane.n, -1), r: s.thread.major / 2, depth: depth, label: s.thread.label, drill: s.dia }); });
      } catch (e) { }
    });
    return out;
  }

  // the feature's name, SolidWorks style: 'CBORE for M8 Socket Head Cap Screw1', 'M8x1.25 Tapped Hole1'
  function baseName(f) {
    var s = spec(f);
    switch (f.holeType) {
      case 'cbore': return 'CBORE for ' + f.size + ' Socket Head Cap Screw';
      case 'csk': return 'CSK for ' + f.size + ' Flat Head Screw';
      case 'tap': return s.thread.label + ' Tapped Hole';
    }
    return 'Ø' + s.dia + ' (' + f.size + ') Clearance Hole';
  }
  function holeName(model, f) {
    var base = baseName(f), n = 1;
    (model.features || []).forEach(function (g) { if (g !== f && g.type === 'hole') n++; });
    return base + n;
  }

  function newFeature(o) {
    var f = { type: 'hole', standard: 'ISO', holeType: o.type || o.holeType || 'hole', size: o.size || 'M6', fit: o.fit || 'normal',
      end: o.end === 'through' || o.throughAll || o.depth === 'through' ? 'through' : 'blind', depth: o.depth === 'through' ? 0 : +(o.depth || 0) };
    if (f.end === 'blind' && !(f.depth > 0)) f.depth = 2 * sizeRow(f.size).d + 5;
    if (f.holeType === 'tap' && f.end === 'blind') f.threadDepth = +(o.threadDepth || f.depth);
    return f;
  }

  K.registerFeature('hole', {
    cut: true,
    build: build,
    script: function (f, v, idVar, optsStr) {
      var o = { sketch: '@' + idVar[f.sketch], type: f.holeType, size: f.size, fit: f.fit };
      if (f.end === 'through') o.end = 'through'; else o.depth = f.depth;
      if (f.holeType === 'tap' && f.end !== 'through' && f.threadDepth !== f.depth) o.threadDepth = f.threadDepth;
      o.name = f.name;
      return 'var ' + v + ' = p.holeWizard(' + optsStr(o) + ').last();';
    }
  });

  if (K.Builder) K.Builder.prototype.holeWizard = function (o) {
    o = o || {};
    var sid = o.sketch;
    if (sid == null) {
      if (!o.points || !o.points.length) throw new Error('holeWizard: give a positions sketch or face + points.');
      var s = this.sketch(o.face || 'Top', o.offset || 0);
      o.points.forEach(function (q) { s.point(q[0], q[1]); });
      s.end();
      sid = this.lastSketchId;
    }
    var f = newFeature(o);
    f.sketch = sid;
    sizeRow(f.size);
    f.name = o.name || holeName(this.model, f);
    this._add(f);
    return this;
  };

  return { ISO: ISO, TYPES: TYPES, FITS: FITS, CSK_ANGLE: CSK_ANGLE, sizeRow: sizeRow, spec: spec, section: section, threads: threads,
    holeName: holeName, newFeature: newFeature, build: build };
})();
if (typeof module !== 'undefined') module.exports = HoleWizard;
