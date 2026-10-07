// kernel-script.js — Anvil kernel, exports and the script API: STL and DXF writers (`exportSTL`, `exportDXFSketch`,
// `exportDXFFace`, `exportDXFFlat`), the `Builder` / `SketchBuilder` the scripts talk to, `runScript` and
// `generateScript` (model -> script round trip). Loaded last, after every other kernel-*.js file. No DOM.
(function (K, _) {
  'use strict';
  var faceCopy = _.faceCopy, norm = _.norm, planeFromFace = _.planeFromFace, scale = _.scale, tidyPlane = _.tidyPlane;   // kernel.js
  var dimGeometry = _.dimGeometry, entityPolylines = _.entityPolylines, mirrorAxis = _.mirrorAxis, mirrorEntity = _.mirrorEntity, setDimValue = _.setDimValue, signedArea = _.signedArea, translateEntity = _.translateEntity, trimEntity = _.trimEntity;   // kernel-sketch.js
  var configExpr = _.configExpr, evalExpression = _.evalExpression, findConfiguration = _.findConfiguration, isExpression = _.isExpression, resolveEquations = _.resolveEquations;   // kernel-equations.js
  var faceOutline = _.faceOutline;   // kernel-mesh.js
  var featureName = _.featureName, featureTypes = _.featureTypes, scriptSections = _.scriptSections, sketchScripts = _.sketchScripts;   // kernel-rebuild.js

  function exportDXFFlat(flat, units) {
    var d = new DXF(units);
    flat.loops.forEach(function (l, i) {
      var layer = i === 0 ? 'OUTLINE' : 'HOLES';
      var c = loopAsCircle(l);
      if (c) d.circle(layer, c.c, c.r); else d.polyline(layer, l, true);
    });
    flat.bends.forEach(function (b) {
      d.line('BEND', b.a, b.b);
      d.text('NOTES', [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], Math.max(1.5, flat.sheet.thickness), b.label);
    });
    var s = flat.sheet;
    d.text('NOTES', [flat.bbox.min[0], flat.bbox.min[1] - Math.max(3, s.thickness * 2)], Math.max(1.5, s.thickness), 'T=' + s.thickness + ' R=' + s.bendRadius + ' K=' + s.kFactor);
    return d.toString();
  }

  // ------------------------------------------------------------------ exports
  function fmt(n) { return (Math.round(n * 1e6) / 1e6).toString(); }

  function exportSTL(mesh, name) {
    var p = mesh.positions, n = mesh.normals, out = ['solid ' + (name || 'anvil')];
    for (var i = 0; i < p.length; i += 9) {
      out.push('  facet normal ' + fmt(n[i]) + ' ' + fmt(n[i + 1]) + ' ' + fmt(n[i + 2]));
      out.push('    outer loop');
      for (var k = 0; k < 3; k++) out.push('      vertex ' + fmt(p[i + k * 3]) + ' ' + fmt(p[i + k * 3 + 1]) + ' ' + fmt(p[i + k * 3 + 2]));
      out.push('    endloop');
      out.push('  endfacet');
    }
    out.push('endsolid ' + (name || 'anvil'));
    return out.join('\n');
  }

  function DXF(units) {
    this.lines = [];
    this.insunits = units === 'in' ? 1 : 4;
  }
  DXF.prototype.pair = function (code, value) { this.lines.push(String(code), String(value)); };
  DXF.prototype.line = function (layer, a, b) {
    this.pair(0, 'LINE'); this.pair(8, layer);
    this.pair(10, fmt(a[0])); this.pair(20, fmt(a[1])); this.pair(30, 0);
    this.pair(11, fmt(b[0])); this.pair(21, fmt(b[1])); this.pair(31, 0);
  };
  DXF.prototype.circle = function (layer, c, r) {
    this.pair(0, 'CIRCLE'); this.pair(8, layer);
    this.pair(10, fmt(c[0])); this.pair(20, fmt(c[1])); this.pair(30, 0); this.pair(40, fmt(r));
  };
  DXF.prototype.arc = function (layer, c, r, a0, a1) {
    this.pair(0, 'ARC'); this.pair(8, layer);
    this.pair(10, fmt(c[0])); this.pair(20, fmt(c[1])); this.pair(30, 0); this.pair(40, fmt(r));
    this.pair(50, fmt(a0)); this.pair(51, fmt(a1));
  };
  DXF.prototype.text = function (layer, p, height, text) {
    this.pair(0, 'TEXT'); this.pair(8, layer);
    this.pair(10, fmt(p[0])); this.pair(20, fmt(p[1])); this.pair(30, 0); this.pair(40, fmt(height)); this.pair(1, text);
  };
  DXF.prototype.polyline = function (layer, pts, closed) {
    this.pair(0, 'POLYLINE'); this.pair(8, layer); this.pair(66, 1); this.pair(70, closed ? 1 : 0);
    for (var i = 0; i < pts.length; i++) {
      this.pair(0, 'VERTEX'); this.pair(8, layer);
      this.pair(10, fmt(pts[i][0])); this.pair(20, fmt(pts[i][1])); this.pair(30, 0);
    }
    this.pair(0, 'SEQEND');
  };
  DXF.prototype.toString = function () {
    var head = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', String(this.insunits), '0', 'ENDSEC',
      '0', 'SECTION', '2', 'TABLES', '0', 'TABLE', '2', 'LAYER', '70', '4',
      '0', 'LAYER', '2', 'OUTLINE', '70', '0', '62', '7', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'HOLES', '70', '0', '62', '1', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'BEND', '70', '0', '62', '3', '6', 'CONTINUOUS',
      '0', 'LAYER', '2', 'NOTES', '70', '0', '62', '5', '6', 'CONTINUOUS',
      '0', 'ENDTAB', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
    return head.concat(this.lines, ['0', 'ENDSEC', '0', 'EOF']).join('\n');
  };

  // A loop that is a regular sampling of a circle becomes a true CIRCLE entity.
  function loopAsCircle(pts) {
    if (pts.length < 12) return null;
    var cx = 0, cy = 0;
    pts.forEach(function (p) { cx += p[0]; cy += p[1]; });
    cx /= pts.length; cy /= pts.length;
    var r = 0;
    pts.forEach(function (p) { r += Math.hypot(p[0] - cx, p[1] - cy); });
    r /= pts.length;
    for (var i = 0; i < pts.length; i++) if (Math.abs(Math.hypot(pts[i][0] - cx, pts[i][1] - cy) - r) > r * 0.01 + 1e-6) return null;
    return { c: [cx, cy], r: r };
  }

  function exportDXFSketch(sketch, units) {
    var d = new DXF(units);
    (sketch.entities || []).forEach(function (e) {
      if (e.t === 'circle') { d.circle('OUTLINE', [e.cx, e.cy], e.r); return; }
      if (e.t === 'arc') { d.arc('OUTLINE', [e.cx, e.cy], e.r, e.a0, e.a1); return; }
      if (e.t === 'line') { d.line('OUTLINE', [e.x1, e.y1], [e.x2, e.y2]); return; }
      if (e.t === 'point') return;
      entityPolylines(e).forEach(function (pl) { d.polyline('OUTLINE', pl.pts, pl.closed); });
    });
    return d.toString();
  }

  function exportDXFFace(mesh, faceIndex, units) {
    var o = faceOutline(mesh, faceIndex);
    if (!o) return null;
    var d = new DXF(units);
    var areas = o.loops.map(function (l) { return Math.abs(signedArea(l)); });
    var outerIdx = areas.indexOf(Math.max.apply(null, areas));
    o.loops.forEach(function (l, i) {
      var layer = i === outerIdx ? 'OUTLINE' : 'HOLES';
      var c = loopAsCircle(l);
      if (c) d.circle(layer, c.c, c.r); else d.polyline(layer, l, true);
    });
    return d.toString();
  }

  // ------------------------------------------------------------------ script builder (the API scripts talk to)
  function Builder(model) {
    this.model = model;
    this.lastId = null;
    this.lastSketchId = null;
    this.lastSolidId = null;
  }
  Builder.prototype._add = function (f) {
    f.id = this.model.nextId++;
    if (!f.name) f.name = featureName(this.model, f.type, f.cut);
    this.model.features.push(f);
    this.lastId = f.id;
    if (f.type === 'sketch') this.lastSketchId = f.id;
    else if (f.type !== 'plane') this.lastSolidId = f.id;
    return f;
  };
  // num(x): a numeric argument, or an equation ('=T*2') passed through untouched for rebuild to resolve
  function num(x) { return isExpression(x) ? x : +x; }
  Builder.prototype.name = function (n) { this.model.name = String(n); return this; };
  Builder.prototype.units = function (u) { this.model.units = u === 'in' ? 'in' : 'mm'; return this; };
  Builder.prototype.density = function (d) { this.model.density = +d; return this; };
  Builder.prototype.color = function (c) { this.model.color = String(c); return this; };
  // equations({ T: 10, W: '=T*2' }) or equations([{ name, expr }]): the model's global variables, in order (replaces
  // any earlier list). Numbers are stored as their string. The object form drops a leading "="; the array form (what
  // generateScript writes) keeps each expr string exactly, so a script round trip reproduces model.equations.
  Builder.prototype.equations = function (spec) {
    var list = [];
    function expr(v) { return String(v == null ? '' : v).replace(/^\s*=/, '').trim(); }
    if (Array.isArray(spec)) spec.forEach(function (e) {
      if (!e) return;
      var q = {};
      Object.keys(e).forEach(function (k) { q[k] = e[k]; }); // extra fields (a comment, say) ride along
      q.name = String(e.name);
      q.expr = typeof e.expr === 'string' ? e.expr : String(e.expr == null ? '' : e.expr);
      list.push(q);
    });
    else if (spec && typeof spec === 'object') Object.keys(spec).forEach(function (k) { list.push({ name: k, expr: expr(spec[k]) }); });
    this.model.equations = list;
    return this;
  };
  // configurations([{ name, values: { T: 6, N: '=2' } }], active?): the model's named variable sets (replaces any
  // earlier list). Values are stored as expression strings without a leading "=". `active` (optional) activates one.
  Builder.prototype.configurations = function (list, active) {
    var out = [];
    (Array.isArray(list) ? list : []).forEach(function (c) {
      if (!c || c.name == null) return;
      var q = {}, vals = {};
      Object.keys(c).forEach(function (k) { q[k] = c[k]; });
      Object.keys(c.values || {}).forEach(function (k) { vals[k] = configExpr(c.values[k]); });
      q.name = String(c.name); q.values = vals;
      out.push(q);
    });
    if (out.length) this.model.configurations = out; else { delete this.model.configurations; delete this.model.activeConfiguration; }
    if (active != null) this.activeConfiguration(active);
    return this;
  };
  // activeConfiguration(name): the configuration whose values drive the equations (null: the base equations)
  Builder.prototype.activeConfiguration = function (name) {
    if (name == null) { delete this.model.activeConfiguration; return this; }
    if (!findConfiguration(this.model, name)) throw new Error('activeConfiguration: no configuration named "' + name + '"');
    this.model.activeConfiguration = String(name);
    return this;
  };
  // _value(x): a number for a sketch dimension that must be numeric now (box, cylinder, hole sizes): an equation is
  // evaluated against the current variables at script time, since sketch entities hold no expressions.
  Builder.prototype._value = function (x, what) {
    if (!isExpression(x)) return +x;
    try { return evalExpression(x, resolveEquations(this.model).vars); } catch (e) { throw new Error(what + ': ' + e.message); }
  };
  Builder.prototype.plane = function (ref, offset, name) {
    var f = this._add({ type: 'plane', ref: ref || 'Front', offset: num(offset) || 0, name: name });
    return f.id;
  };
  Builder.prototype._planeRef = function (spec, offset) {
    if (spec == null) return { ref: 'Front', offset: 0 };
    if (typeof spec === 'number') return { featureId: spec };
    if (typeof spec === 'string') return { ref: spec, offset: num(offset) || 0 };
    // r10/facesketch10: a sketch on a face of a feature, which follows that face at rebuild:
    //   p.sketch({ face: boss, normal: [0, 0, 1] })   the face of feature `boss` whose outward normal is `normal`
    //     (an extrude's end cap is found from the extrude itself; for other faces give `at`, a point on the face, or
    //     `offset`, the face plane's distance along the normal, and the nearest such face is taken);
    //   a full frame { custom: true, origin, x, y, n, offset, face: { feature, role, cap?, inst?, lx?, ln? } } as
    //   generateScript writes it; `cap: 'far' | 'near'` (r11/faceref11) keeps the sketch on its cap when the extrude is reversed.
    var fr = spec.face;
    if (fr != null && typeof fr !== 'object') fr = { feature: fr, role: spec.role || 'cap' };
    if (fr && spec.cap && !fr.cap) fr = faceCopy(fr, { cap: spec.cap });
    if (spec.custom) {
      if (!fr) return spec;
      var cp = JSON.parse(JSON.stringify(spec)); cp.face = faceCopy(fr);
      return cp;
    }
    if (fr) {
      var n = spec.normal || spec.n || [0, 0, 1], nn = norm(n);
      var pl = tidyPlane(planeFromFace(nn, spec.at ? spec.at : scale(nn, num(spec.offset || offset || 0))));
      pl.face = faceCopy(fr);
      return pl;
    }
    if (spec.featureId != null) return { featureId: spec.featureId };
    return { ref: spec.ref || 'Front', offset: num(spec.offset || offset || 0) };
  };
  Builder.prototype.sketch = function (spec, offset, name) {
    var f = this._add({ type: 'sketch', plane: this._planeRef(spec, offset), entities: [], name: name });
    return new SketchBuilder(this, f);
  };
  Builder.prototype._sketchId = function (opts) {
    var id = opts && opts.sketch != null ? opts.sketch : this.lastSketchId;
    if (id == null) throw new Error('No sketch to use. Call sketch(...) first.');
    return id;
  };
  Builder.prototype.extrude = function (depth, opts) {
    opts = opts || {};
    var f = this._add({
      type: 'extrude', sketch: this._sketchId(opts), depth: depth == null ? 0 : num(depth), end: opts.throughAll ? 'through' : (opts.midplane ? 'mid' : 'blind'),
      reverse: !!opts.reverse || opts.dir === -1, cut: !!opts.cut, dir2: !!opts.depth2 || !!opts.both,
      depth2: opts.depth2 != null ? num(opts.depth2) : (opts.both ? num(depth) : 0), end2: opts.throughAll2 ? 'through' : 'blind', name: opts.name
    });
    if (opts.sheetBase) f.sheetBase = true;
    if (opts.draft) { f.draft = num(opts.draft); if (opts.draftOutward) f.draftOut = true; }
    if (opts.cut && opts.normalCut) f.normalCut = true; // sheet metal Normal Cut: the tool is made normal to the sheet
    bodyOpts(f, opts);
    return this;
  };
  // Multi-body options shared by every boss and cut: `merge: false` keeps a boss as a separate body, `bodies: [i, …]`
  // limits a cut to those bodies. A pattern or mirror takes both and the rebuild applies whichever fits its source.
  function bodyOpts(f, opts) {
    if (!opts) return f;
    var patternLike = f.type === 'lpattern' || f.type === 'cpattern' || f.type === 'mirror';
    if (opts.merge === false && (!f.cut || patternLike)) f.merge = false;
    if ((f.cut || patternLike) && Array.isArray(opts.bodies) && opts.bodies.length) f.bodies = opts.bodies.map(function (i) { return i | 0; });
    return f;
  }
  // Sheet metal parameters used by baseFlange/flange/flatten: thickness T, inside bend radius R (default T) and the
  // K-factor (BA = θ·(R + K·T); default 0.5, SolidWorks' default). opts (SolidWorks' Bend Allowance group and gauge
  // table): bendAllowanceType ('kfactor' | 'allowance' | 'deduction' | 'table'), bendAllowance (BA), bendDeduction (BD),
  // bendTable ({ kind: 'BA' | 'BD', name?, tolerance?, rows: [{ thickness, radius, angle, value }] }), gaugeTable (a
  // built-in table name, Kernel.gaugeTables, or a table object) and gauge: with a gauge, T, R and K (or BD) that are
  // left null come from the table's row.
  Builder.prototype.sheet = function (thickness, bendRadius, kFactor, opts) {
    opts = opts || {};
    var g = null;
    if (opts.gauge != null) {
      g = K.gaugeRow(opts.gaugeTable, opts.gauge, this.model.units);
      if (!g) throw new Error('Gauge ' + JSON.stringify(String(opts.gauge)) + ' is not in the gauge table ' + JSON.stringify((opts.gaugeTable && opts.gaugeTable.name) || opts.gaugeTable || K.DEFAULT_GAUGE_TABLE) + '.');
    }
    if (thickness == null && !g) throw new Error('sheet() needs a thickness (or a gauge).');
    var T = thickness != null ? num(thickness) : g.thickness;
    var o = { thickness: T, bendRadius: bendRadius != null ? num(bendRadius) : (g ? g.radius : T), kFactor: kFactor != null ? num(kFactor) : (g && g.kFactor != null ? g.kFactor : K.DEFAULT_K_FACTOR) };
    o.bendAllowanceType = opts.bendAllowanceType || (g && g.bendDeduction != null && opts.bendDeduction == null ? 'deduction' : 'kfactor');
    if (opts.bendAllowance != null) o.bendAllowance = num(opts.bendAllowance);
    if (opts.bendDeduction != null) o.bendDeduction = num(opts.bendDeduction);
    else if (g && g.bendDeduction != null) o.bendDeduction = g.bendDeduction;
    if (opts.bendTable) o.bendTable = opts.bendTable;
    if (g) { o.gaugeTable = opts.gaugeTable != null ? opts.gaugeTable : K.DEFAULT_GAUGE_TABLE; o.gauge = g.gauge; }
    this.model.sheet = K.makeSheet(o);
    return this;
  };
  Builder.prototype.baseFlange = function (thickness, opts) {
    opts = opts || {};
    // no sheet yet: baseFlange(T) sets one (R = T, K = 0.5 unless opts say otherwise); after sheet(...) it keeps that
    // sheet's radius, K-factor and bend allowance method and changes only what it is given
    if (!this.model.sheet) this.sheet(thickness != null ? thickness : 2, opts.bendRadius, opts.kFactor);
    else if (thickness != null || opts.bendRadius != null || opts.kFactor != null) {
      var s = Object.assign({}, this.model.sheet);
      if (thickness != null && num(thickness) !== s.thickness) { s.thickness = num(thickness); delete s.gauge; delete s.gaugeTable; }
      if (opts.bendRadius != null) s.bendRadius = num(opts.bendRadius);
      if (opts.kFactor != null) s.kFactor = num(opts.kFactor);
      s.bendAllowanceType = s.bendAllowanceType || 'kfactor';
      this.model.sheet = K.makeSheet(s);
    }
    var T = this.model.sheet.thickness;
    var f = this.extrude(T, Object.assign({}, opts, { sheetBase: true, name: opts.name || 'Base-Flange1' }));
    return f;
  };
  // Custom Bend Allowance of a flange, hem or jog: { type: 'kfactor' | 'allowance' | 'deduction' | 'table', value }
  // (value: K, BA or BD; none for 'table', which uses the sheet's bend table), overriding the sheet's method
  function customBendAllowance(f, c) {
    if (!c) return f;
    if (K.BEND_ALLOWANCE_TYPES.indexOf(c.type) < 0) throw new Error('bendAllowance.type must be one of ' + K.BEND_ALLOWANCE_TYPES.join(', ') + '.');
    f.bendAllowance = { type: c.type };
    if (c.type !== 'table') {
      if (c.value == null || (!isExpression(c.value) && !isFinite(+c.value))) throw new Error('bendAllowance.value must be a number.');
      f.bendAllowance.value = num(c.value);
    }
    return f;
  }
  // edges: [[x,y,z], ...] points on straight edges of the flat sheet face
  // opts: angle, reverse, radius, position, toward, name, miter (bool), miterGap, relief ('none' | 'rect' | 'obround'),
  // reliefWidth (default T), reliefDepth (default T/2), bendAllowance ({ type, value }: Custom Bend Allowance)
  Builder.prototype.flange = function (length, edges, opts) {
    opts = opts || {};
    var f = { type: 'flange', length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside', toward: opts.toward ? [num(opts.toward[0]), num(opts.toward[1]), num(opts.toward[2])] : undefined,
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name,
      miter: !!opts.miter, relief: opts.relief === 'rect' || opts.relief === 'obround' ? opts.relief : 'none' };
    if (opts.miterGap != null) f.miterGap = num(opts.miterGap);
    if (opts.reliefWidth != null) f.reliefWidth = num(opts.reliefWidth);
    if (opts.reliefDepth != null) f.reliefDepth = num(opts.reliefDepth);
    customBendAllowance(f, opts.bendAllowance);
    this._add(f);
    return this;
  };
  // hem: a 180° flange folded back over the sheet; `gap` is the opening between the flats (default T/2, open hem).
  // A numeric gap is stored as the bend radius; a gap (or sheet thickness) given as an equation is kept as `gap`
  // and the radius is derived from it at rebuild.
  Builder.prototype.hem = function (length, edges, opts) {
    opts = opts || {};
    var T = this.model.sheet ? this.model.sheet.thickness : 2;
    var gap = opts.gap != null ? num(opts.gap) : (isExpression(T) ? '=(' + T.replace(/^\s*=/, '') + ')/2' : T / 2);
    var f = { type: 'flange', hem: true, length: num(length), angle: 180, reverse: !!opts.reverse, position: 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name };
    if (isExpression(gap) || isExpression(T)) { f.gap = gap; f.radius = null; }
    else f.radius = Math.max(gap / 2, 0.02 * T);
    f.name = f.name || featureName(this.model, 'hem');
    customBendAllowance(f, opts.bendAllowance);
    this._add(f);
    return this;
  };
  // jog: two bends offsetting the sheet by `height`, then `length` of flat parallel to the base
  Builder.prototype.jog = function (height, length, edges, opts) {
    opts = opts || {};
    this._add(customBendAllowance({ type: 'jog', height: num(height), length: num(length), angle: opts.angle == null ? 90 : num(opts.angle), reverse: !!opts.reverse, radius: opts.radius != null ? num(opts.radius) : null, position: opts.position || 'bendOutside',
      edges: (edges || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name }, opts.bendAllowance));
    return this;
  };
  Builder.prototype.cut = function (depth, opts) {
    opts = Object.assign({}, opts || {}, { cut: true });
    if (depth === 'through' || depth == null) { opts.throughAll = true; depth = 0; }
    return this.extrude(depth, opts);
  };
  Builder.prototype.revolve = function (angle, opts) {
    opts = opts || {};
    bodyOpts(this._add({ type: 'revolve', sketch: this._sketchId(opts), angle: angle == null ? 360 : num(angle), axis: opts.axis == null ? 'y' : opts.axis, reverse: !!opts.reverse, cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  Builder.prototype.revolveCut = function (angle, opts) { return this.revolve(angle, Object.assign({}, opts || {}, { cut: true })); };
  // sweep: profile sketch swept along a path (a sketch id of lines/arcs, or [[x,y,z],...])
  Builder.prototype.sweep = function (opts) {
    opts = opts || {};
    var profile = opts.profile != null ? opts.profile : this.lastSketchId;
    if (profile == null || opts.path == null) throw new Error('sweep needs {profile, path}.');
    bodyOpts(this._add({ type: 'sweep', profile: profile, path: opts.path, cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  // loft: blend between two or more sketches, each holding exactly one closed profile
  Builder.prototype.loft = function (sketches, opts) {
    opts = opts || {};
    if (!Array.isArray(sketches) || sketches.length < 2) throw new Error('loft needs an array of at least two sketch ids.');
    bodyOpts(this._add({ type: 'loft', sketches: sketches.slice(), cut: !!opts.cut, name: opts.name }), opts);
    return this;
  };
  // shell: hollow the body with wall thickness t; faces: [[x,y,z], ...] points on the faces to remove (open)
  Builder.prototype.shell = function (t, faces, opts) {
    opts = opts || {};
    this._add({ type: 'shell', thickness: num(t), faces: (faces || []).map(function (e) { return Array.isArray(e) ? { at: e } : e; }), name: opts.name });
    return this;
  };
  Builder.prototype._srcId = function (opts) {
    var id = opts && opts.feature != null ? opts.feature : this.lastSolidId;
    if (id == null) throw new Error('No feature to pattern. Create a boss or cut first.');
    return id;
  };
  Builder.prototype.linearPattern = function (opts) {
    opts = opts || {};
    bodyOpts(this._add({
      type: 'lpattern', feature: this._srcId(opts), d1: opts.dir || 'x', rev1: !!opts.reverse, s1: num(opts.spacing) || 10, n1: num(opts.count) || 2,
      d2: opts.dir2 || null, rev2: !!opts.reverse2, s2: num(opts.spacing2) || 0, n2: num(opts.count2) || 1, name: opts.name
    }), opts);
    return this;
  };
  Builder.prototype.circularPattern = function (opts) {
    opts = opts || {};
    bodyOpts(this._add({ type: 'cpattern', feature: this._srcId(opts), axis: opts.axis || 'z', center: opts.center ? opts.center.map(num) : [0, 0, 0], n: num(opts.count) || 4, angle: opts.angle == null ? 360 : num(opts.angle), equal: opts.equal !== false, name: opts.name }), opts);
    return this;
  };
  Builder.prototype.mirror = function (plane, opts) {
    opts = opts || {};
    var f = { type: 'mirror', plane: plane || 'Right', offset: num(opts.offset) || 0, name: opts.name };
    if (opts.body) f.body = true; else f.feature = this._srcId(opts);
    bodyOpts(this._add(f), opts);
    return this;
  };
  // edges: [[x,y,z], ...] points on (or near) the edges to modify; chain=false disables tangent propagation
  Builder.prototype.chamfer = function (d, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'chamfer', d: num(d), edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.fillet = function (r, edges, opts) {
    opts = opts || {};
    var specs = (edges || []).map(function (e) { return Array.isArray(e) ? { at: e, chain: opts.chain !== false } : e; });
    this._add({ type: 'fillet', r: num(r), edges: specs, name: opts.name });
    return this;
  };
  Builder.prototype.hole = function (planeSpec, x, y, dia, opts) {
    opts = opts || {};
    var s = this.sketch(planeSpec, opts.offset);
    s.circle(x, y, this._value(dia, 'hole diameter') / 2);
    var f = s.end();
    if (opts.depth) f.cut(opts.depth, { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name, bodies: opts.bodies });
    else f.cut('through', { reverse: !opts.forward, sketch: this.lastSketchId, name: opts.name, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.box = function (w, d, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0];
    w = this._value(w, 'box width'); d = this._value(d, 'box depth'); // sketch sizes are numbers; h may stay an equation
    // sketch on Top: u = x, v = -z
    var s = this.sketch('Top', at[1]);
    if (opts.centered) s.centerRect(at[0], -at[2], w, d); else s.rect(at[0], -at[2] - d, w, d);
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name, merge: opts.merge, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.cylinder = function (r, h, opts) {
    opts = opts || {};
    var at = opts.at || [0, 0, 0], axis = opts.axis || 'y';
    r = this._value(r, 'cylinder radius'); // the sketch circle is a number; h may stay an equation
    var s;
    if (axis === 'y') s = this.sketch('Top', at[1]).circle(at[0], -at[2], r);
    else if (axis === 'z') s = this.sketch('Front', at[2]).circle(at[0], at[1], r);
    else s = this.sketch('Right', at[0]).circle(-at[2], at[1], r);
    s.end().extrude(h, { cut: !!opts.cut, name: opts.name, merge: opts.merge, bodies: opts.bodies });
    return this;
  };
  Builder.prototype.last = function () { return this.lastId; };

  function SketchBuilder(part, feature) { this.part = part; this.f = feature; }
  SketchBuilder.prototype._e = function (e) { this.f.entities.push(e); return this; };
  // sketch entities hold plain numbers: a value given as an equation ('=T/2') is evaluated against the current
  // variables when the script runs (the entity keeps the number, not the expression)
  SketchBuilder.prototype._v = function (x) { return isExpression(x) ? this.part._value(x, 'sketch value') : +x; };
  SketchBuilder.prototype.line = function (x1, y1, x2, y2) { var s = this; return this._e({ t: 'line', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2) }); };
  SketchBuilder.prototype.rect = function (x, y, w, h) { var s = this; return this._e({ t: 'rect', x: s._v(x), y: s._v(y), w: s._v(w), h: s._v(h) }); };
  SketchBuilder.prototype.centerRect = function (cx, cy, w, h) { var s = this; return this._e({ t: 'crect', cx: s._v(cx), cy: s._v(cy), w: s._v(w), h: s._v(h) }); };
  SketchBuilder.prototype.circle = function (cx, cy, r) { var s = this; return this._e({ t: 'circle', cx: s._v(cx), cy: s._v(cy), r: s._v(r) }); };
  SketchBuilder.prototype.polygon = function (cx, cy, r, n, rot) { var s = this; return this._e({ t: 'poly', cx: s._v(cx), cy: s._v(cy), r: s._v(r), n: s._v(n) | 0 || 6, rot: s._v(rot) || 0 }); };
  SketchBuilder.prototype.slot = function (x1, y1, x2, y2, w) { var s = this; return this._e({ t: 'slot', x1: s._v(x1), y1: s._v(y1), x2: s._v(x2), y2: s._v(y2), w: s._v(w) }); };
  SketchBuilder.prototype.arc = function (cx, cy, r, a0, a1) { var s = this; return this._e({ t: 'arc', cx: s._v(cx), cy: s._v(cy), r: s._v(r), a0: s._v(a0), a1: s._v(a1) }); };
  SketchBuilder.prototype.polyline = function (pts, closed) { var s = this; return this._e({ t: 'polyline', pts: pts.map(function (p) { return [s._v(p[0]), s._v(p[1])]; }), closed: closed !== false }); };
  SketchBuilder.prototype.point = function (x, y) { var s = this; return this._e({ t: 'point', x: s._v(x), y: s._v(y) }); };
  // mirror entities across 'x' | 'y' | a line entity index | {x1,y1,x2,y2}; opts.entities = indices (default all), opts.copy=false replaces
  SketchBuilder.prototype.mirrorEntities = function (axis, opts) {
    opts = opts || {};
    var ents = this.f.entities, ax = mirrorAxis(axis, ents);
    var idx = opts.entities || ents.map(function (e, i) { return i; });
    var copies = idx.map(function (i) { return mirrorEntity(ents[i], ax); }).filter(Boolean);
    if (opts.copy === false) this.f.entities = ents.filter(function (e, i) { return idx.indexOf(i) < 0; });
    copies.forEach(function (c) { this.f.entities.push(c); }, this);
    return this;
  };
  // linear pattern of entities: { dx, dy, count, dx2, dy2, count2, entities } (steps are vectors in sketch units)
  SketchBuilder.prototype.patternEntities = function (opts) {
    opts = opts || {};
    var ents = this.f.entities, idx = opts.entities || ents.map(function (e, i) { return i; });
    var n1 = Math.max(1, opts.count | 0), n2 = Math.max(1, opts.count2 | 0), src = idx.map(function (i) { return ents[i]; });
    for (var i = 0; i < n1; i++) for (var j = 0; j < n2; j++) {
      if (!i && !j) continue;
      src.forEach(function (e) { this.f.entities.push(translateEntity(e, i * (+opts.dx || 0) + j * (+opts.dx2 || 0), i * (+opts.dy || 0) + j * (+opts.dy2 || 0))); }, this);
    }
    return this;
  };
  // trim entity `index` at the sketch point (u, v): removes the portion between neighbouring intersections
  SketchBuilder.prototype.trim = function (index, u, v) { if (Array.isArray(u)) { v = u[1]; u = u[0]; } this.f.entities = trimEntity(this.f.entities, index, [+u, +v]); return this; };
  // Smart Dimension on entity `index`: kind per dimForEntity ('len', 'dx', 'dy', 'w', 'h', 'dia', 'r', 'seg');
  // opts: { i (edge / segment), off, ang (placement), value (drive the entity to this value first) }
  SketchBuilder.prototype.dim = function (index, kind, opts) {
    opts = opts || {};
    var e = this.f.entities[index];
    if (!e) throw new Error('No sketch entity ' + index + ' to dimension.');
    var d = { e: index | 0, k: kind };
    if (opts.i != null) d.i = opts.i | 0;
    if (opts.off != null) d.off = +opts.off;
    if (opts.ang != null) d.ang = +opts.ang;
    if (!dimGeometry(e, d)) throw new Error('Dimension ' + JSON.stringify(kind) + ' does not apply to a ' + e.t + '.');
    if (opts.value != null) setDimValue(e, d, opts.value);
    (this.f.dims = this.f.dims || []).push(d);
    return this;
  };
  SketchBuilder.prototype.id = function () { return this.f.id; };
  SketchBuilder.prototype.end = function () { return this.part; };
  ['extrude', 'cut', 'revolve', 'revolveCut', 'baseFlange'].forEach(function (m) {
    SketchBuilder.prototype[m] = function (a, opts) {
      opts = Object.assign({}, opts || {}, { sketch: this.f.id });
      return this.part[m](a, opts);
    };
  });

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('p', 'part', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  // Regenerate a script from a model so the two representations stay interchangeable.
  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil', 'p.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units) + ');'];
    scriptSections.forEach(function (sec) { if (sec.head) out = out.concat(sec.head(model) || []); });
    // equations first, so every "=" field below resolves against them; the array form keeps each expr string exactly
    if (Array.isArray(model.equations) && model.equations.length) out.push('p.equations(' + JSON.stringify(model.equations) + ');');
    // configurations right after, so a box/hole size given as "=..." is evaluated with the active set as the model had it
    if (Array.isArray(model.configurations) && model.configurations.length) {
      out.push('p.configurations(' + JSON.stringify(model.configurations) + ');');
      if (model.activeConfiguration != null && findConfiguration(model, model.activeConfiguration)) out.push('p.activeConfiguration(' + JSON.stringify(String(model.activeConfiguration)) + ');');
    }
    if (model.sheet) {
      // a sheet without a stored K (made before bend deductions existed) is written with the K its flat always used
      var sh = model.sheet, so = {};
      if (sh.bendAllowanceType && sh.bendAllowanceType !== 'kfactor') so.bendAllowanceType = sh.bendAllowanceType;
      if (sh.bendAllowance != null) so.bendAllowance = numOut(sh.bendAllowance);
      if (sh.bendDeduction != null) so.bendDeduction = numOut(sh.bendDeduction);
      if (sh.bendTable) so.bendTable = sh.bendTable;
      if (sh.gaugeTable != null && sh.gauge != null) { so.gaugeTable = sh.gaugeTable; so.gauge = sh.gauge; }
      out.push('p.sheet(' + nv(sh.thickness) + ', ' + nv(sh.bendRadius) + ', ' + nv(sh.kFactor != null && sh.kFactor !== '' ? sh.kFactor : K.LEGACY_K_FACTOR) + (Object.keys(so).length ? ', ' + optsStr(so) : '') + ');');
    }
    var idVar = {};
    model.features.forEach(function (f) {
      var v = 'f' + f.id;
      idVar[f.id] = v;
      switch (f.type) {
        case 'plane':
          out.push('var ' + v + ' = p.plane(' + JSON.stringify(f.ref) + ', ' + nv(f.offset) + ', ' + JSON.stringify(f.name) + ');');
          break;
        case 'sketch': {
          var pl = f.plane || {};
          // r10/facesketch10: a face reference names its feature by the script variable (ids are renumbered)
          var plj = pl.custom && pl.face ? JSON.stringify(pl, function (k, x) { return k === 'face' ? undefined : x; }) : null;
          if (plj && idVar[pl.face.feature]) plj = plj.slice(0, -1) + ',"face":' + JSON.stringify(faceCopy(pl.face, { feature: 0 })).replace('"feature":0', '"feature":' + idVar[pl.face.feature]) + '}';
          var spec = plj ? plj : pl.custom ? JSON.stringify(pl) : (pl.featureId != null ? idVar[pl.featureId] : JSON.stringify(pl.ref || 'Front') + ', ' + nv(pl.offset || 0));
          var s = 'var ' + v + ' = p.sketch(' + spec + (pl.custom || pl.featureId != null ? ', 0' : '') + ', ' + JSON.stringify(f.name) + ')';
          f.entities.forEach(function (e) {
            switch (e.t) {
              case 'line': s += '\n  .line(' + [e.x1, e.y1, e.x2, e.y2].join(', ') + ')'; break;
              case 'rect': s += '\n  .rect(' + [e.x, e.y, e.w, e.h].join(', ') + ')'; break;
              case 'crect': s += '\n  .centerRect(' + [e.cx, e.cy, e.w, e.h].join(', ') + ')'; break;
              case 'circle': s += '\n  .circle(' + [e.cx, e.cy, e.r].join(', ') + ')'; break;
              case 'poly': s += '\n  .polygon(' + [e.cx, e.cy, e.r, e.n, e.rot || 0].join(', ') + ')'; break;
              case 'slot': s += '\n  .slot(' + [e.x1, e.y1, e.x2, e.y2, e.w].join(', ') + ')'; break;
              case 'arc': s += '\n  .arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')'; break;
              case 'polyline': s += '\n  .polyline(' + JSON.stringify(e.pts) + ', ' + !!e.closed + ')'; break;
              case 'point': s += '\n  .point(' + e.x + ', ' + e.y + ')'; break;
            }
          });
          (f.dims || []).forEach(function (d) {
            var o = {};
            if (d.i != null) o.i = d.i;
            if (d.off != null) o.off = Math.round(d.off * 1e4) / 1e4;
            if (d.ang != null) o.ang = Math.round(d.ang * 1e4) / 1e4;
            s += '\n  .dim(' + d.e + ', ' + JSON.stringify(d.k) + (Object.keys(o).length ? ', ' + optsStr(o) : '') + ')';
          });
          sketchScripts.forEach(function (fn) { s += fn(f) || ''; });
          out.push(s + '\n  .id();');
          break;
        }
        case 'extrude': {
          var o = { sketch: '@' + idVar[f.sketch], name: f.name };
          if (f.end === 'through') o.throughAll = true;
          if (f.end === 'mid') o.midplane = true;
          if (f.reverse) o.reverse = true;
          if (f.dir2) { o.depth2 = f.depth2; if (f.end2 === 'through') o.throughAll2 = true; }
          if (f.sheetBase) o.sheetBase = true;
          if (f.draft) { o.draft = f.draft; if (f.draftOut) o.draftOutward = true; }
          if (f.cut && f.normalCut) o.normalCut = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'cut' : 'extrude') + '(' + nv(f.depth) + ', ' + optsStr(bodyOptsOut(o, f)) + ').last();');
          break;
        }
        default:
          if (featureTypes[f.type] && featureTypes[f.type].script) out.push(featureTypes[f.type].script(f, v, idVar, optsStr));
          break;
        case 'flange': {
          var fspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var fo = { angle: f.angle, name: f.name };
          if (f.reverse) fo.reverse = true;
          if (f.radius != null) fo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') fo.position = f.position;
          if (f.toward) fo.toward = f.toward.map(function (x) { return isExpression(x) ? x : Math.round(x * 1e4) / 1e4; });
          if (f.miter) fo.miter = true;
          if (f.miterGap != null && (isExpression(f.miterGap) || +f.miterGap !== 0)) fo.miterGap = numOut(f.miterGap);
          if (f.relief && f.relief !== 'none') fo.relief = f.relief;
          if (f.reliefWidth != null) fo.reliefWidth = numOut(f.reliefWidth);
          if (f.reliefDepth != null) fo.reliefDepth = numOut(f.reliefDepth);
          if (f.bendAllowance) fo.bendAllowance = bendAllowanceOut(f.bendAllowance);
          if (f.hem) {
            var ho = { gap: f.gap != null ? numOut(f.gap) : Math.round(f.radius * 2 * 1e4) / 1e4, name: f.name };
            if (f.reverse) ho.reverse = true;
            if (f.bendAllowance) ho.bendAllowance = bendAllowanceOut(f.bendAllowance);
            out.push('var ' + v + ' = p.hem(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(ho) + ').last();');
          } else out.push('var ' + v + ' = p.flange(' + nv(f.length) + ', ' + fspecs + ', ' + optsStr(fo) + ').last();');
          break;
        }
        case 'jog': {
          var jspecs = JSON.stringify((f.edges || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          var jo = { angle: f.angle, name: f.name };
          if (f.reverse) jo.reverse = true;
          if (f.radius != null) jo.radius = f.radius;
          if (f.position && f.position !== 'bendOutside') jo.position = f.position;
          if (f.bendAllowance) jo.bendAllowance = bendAllowanceOut(f.bendAllowance);
          out.push('var ' + v + ' = p.jog(' + nv(f.height) + ', ' + nv(f.length) + ', ' + jspecs + ', ' + optsStr(jo) + ').last();');
          break;
        }
        case 'revolve': {
          var ro = { sketch: '@' + idVar[f.sketch], name: f.name, axis: f.axis };
          if (f.reverse) ro.reverse = true;
          out.push('var ' + v + ' = p.' + (f.cut ? 'revolveCut' : 'revolve') + '(' + nv(f.angle) + ', ' + optsStr(bodyOptsOut(ro, f)) + ').last();');
          break;
        }
        case 'lpattern': {
          var lo = { feature: '@' + idVar[f.feature], dir: f.d1, spacing: f.s1, count: f.n1, name: f.name };
          if (f.rev1) lo.reverse = true;
          if (f.d2) { lo.dir2 = f.d2; lo.spacing2 = f.s2; lo.count2 = f.n2; if (f.rev2) lo.reverse2 = true; }
          out.push('var ' + v + ' = p.linearPattern(' + optsStr(bodyOptsOut(lo, f)) + ').last();');
          break;
        }
        case 'cpattern':
          out.push('var ' + v + ' = p.circularPattern(' + optsStr(bodyOptsOut({ feature: '@' + idVar[f.feature], axis: f.axis, center: f.center, count: f.n, angle: f.angle, equal: f.equal !== false, name: f.name }, f)) + ').last();');
          break;
        case 'mirror': {
          var mo = { name: f.name, offset: f.offset || 0 };
          if (f.body) mo.body = true; else mo.feature = '@' + idVar[f.feature];
          out.push('var ' + v + ' = p.mirror(' + JSON.stringify(f.plane) + ', ' + optsStr(bodyOptsOut(mo, f)) + ').last();');
          break;
        }
        case 'sweep': {
          var so = { profile: '@' + idVar[f.profile], path: Array.isArray(f.path) ? f.path : '@' + idVar[f.path], name: f.name };
          if (f.cut) so.cut = true;
          out.push('var ' + v + ' = p.sweep(' + optsStr(bodyOptsOut(so, f)) + ').last();');
          break;
        }
        case 'loft': {
          var lo2 = { name: f.name };
          if (f.cut) lo2.cut = true;
          out.push('var ' + v + ' = p.loft([' + f.sketches.map(function (id) { return idVar[id]; }).join(', ') + '], ' + optsStr(bodyOptsOut(lo2, f)) + ').last();');
          break;
        }
        case 'chamfer':
        case 'fillet': {
          var specs = JSON.stringify((f.edges || []).map(function (e) { return { at: e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }), chain: e.chain !== false }; }));
          out.push('var ' + v + ' = p.' + f.type + '(' + nv(f.type === 'chamfer' ? f.d : f.r) + ', ' + specs + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
        case 'shell': {
          var fspecs2 = JSON.stringify((f.faces || []).map(function (e) { return e.at.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }));
          out.push('var ' + v + ' = p.shell(' + nv(f.thickness) + ', ' + fspecs2 + ', ' + optsStr({ name: f.name }) + ').last();');
          break;
        }
      }
    });
    var tail = [];
    scriptSections.forEach(function (sec) { if (sec.tail) tail = tail.concat(sec.tail(model, idVar) || []); });
    return out.join('\n') + (tail.length ? '\n' + tail.join('\n') + '\n' : '');
  }
  // The multi-body fields of a feature, added to its emitted opts: `merge: false` on a boss kept separate, `bodies`
  // on a scoped cut. Nothing is emitted for the defaults, so an ordinary part's script reads as before.
  // nv(x): a numeric argument as script text, an equation ('=T*2') as its quoted string
  function nv(x) { return isExpression(x) ? JSON.stringify(x) : String(x); }
  // numOut(x): an option value, a number or the equation string untouched (optsStr quotes strings)
  function numOut(x) { return isExpression(x) ? x : +x; }
  function bendAllowanceOut(c) { var o = { type: c.type }; if (c.value != null) o.value = numOut(c.value); return o; }
  function bodyOptsOut(o, f) {
    if (f.merge === false) o.merge = false;
    if (Array.isArray(f.bodies) && f.bodies.length) o.bodies = f.bodies.slice();
    return o;
  }
  function optsStr(o) {
    var parts = [];
    Object.keys(o).forEach(function (k) {
      var v = o[k];
      if (v === undefined || v === null || (v === false && k !== 'merge')) return;
      if (typeof v === 'string' && v.charAt(0) === '@') parts.push(k + ': ' + v.slice(1));
      else parts.push(k + ': ' + JSON.stringify(v));
    });
    return '{ ' + parts.join(', ') + ' }';
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.exportSTL = exportSTL; K.exportDXFSketch = exportDXFSketch; K.exportDXFFace = exportDXFFace; K.exportDXFFlat = exportDXFFlat;
  K.Builder = Builder; K.runScript = runScript; K.generateScript = generateScript;
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.fmt = fmt;
})(Kernel, Kernel._);
