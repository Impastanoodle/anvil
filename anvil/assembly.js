// assembly.js — Anvil assembly documents: insert parts as components, mate them (Standard mates Coincident / Parallel /
// Perpendicular / Tangent / Concentric / Distance / Angle, Advanced mates Width / Limit Distance / Limit Angle, the
// Mechanical Gear mate), solve, move and rotate components, detect interference, pattern and mirror components
// (Linear / Circular Component Pattern, Mirror Components) and explode them (Exploded View steps and explode lines).
// Components may be sub-assemblies (rigid, or Flexible: their own mates solved in context) and live links to documents
// in the document store ({ file: name }) instead of embedded copies; BOM, mass properties and interference go through
// every level.
// Plain script (no modules): defines the global `Assembly`. Loaded after csg.js and kernel.js; no DOM, no three.js.
//
// An assembly model is plain JSON (see README "Assemblies"):
//   { type: 'assembly', name, units, features: [], components: [Component], mates: [Mate], patterns: [Pattern],
//     explodedViews: [ExplodedView], exploded?: viewId, nextId }
// A component places a part (a Design Library example, a part script or an embedded part model) with a rigid transform
// world = R · local + position (R row-major 3x3). Mates reference geometry on components in component-local coords;
// `rebuild` builds each part once (cached by source), solves the mates and writes the solved transforms back.
var Assembly = (function () {
  'use strict';

  var IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  var TOL_OK = 1e-6;       // a mate whose residual stays above this is reported as not satisfied
  var TOL_DONE = 1e-9;     // a mate below this counts as already satisfied (no greedy move, solver not started)

  // ------------------------------------------------------------------ small vector / matrix helpers (double precision)
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function scale(a, s) { return [a[0] * s, a[1] * s, a[2] * s]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function norm(a) { var l = len(a); return l > 1e-300 ? scale(a, 1 / l) : [0, 0, 0]; }
  function arr(v) { return [v.x, v.y, v.z]; }
  function copy3(a) { return [+a[0], +a[1], +a[2]]; }

  function matVec(R, v) {
    return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
  }
  function matTVec(R, v) { // R^T · v
    return [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
  }
  function matMul(A, B) {
    var C = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) C[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
    return C;
  }
  // Rotation matrix for a rotation vector w (axis · angle), Rodrigues' formula.
  function rotVec(w) {
    var th = len(w);
    if (th < 1e-300) return IDENTITY.slice();
    var k = scale(w, 1 / th), c = Math.cos(th), s = Math.sin(th), t = 1 - c;
    var x = k[0], y = k[1], z = k[2];
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
            t * x * y + s * z, t * y * y + c, t * y * z - s * x,
            t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  // Nearest proper rotation to a 3x3 (Gram-Schmidt on the rows): a script's rounded rotation becomes orthonormal again.
  function orthonormalize(R) {
    var r0 = norm([R[0], R[1], R[2]]), r1 = [R[3], R[4], R[5]];
    r1 = norm(sub(r1, scale(r0, dot(r0, r1))));
    if (len(r0) < 0.5 || len(r1) < 0.5) return IDENTITY.slice();
    var r2 = cross(r0, r1);
    return [r0[0], r0[1], r0[2], r1[0], r1[1], r1[2], r2[0], r2[1], r2[2]];
  }

  function tf(T) { // normalised transform (tolerates a missing / partial transform)
    T = T || {};
    return { position: T.position ? copy3(T.position) : [0, 0, 0], rotation: T.rotation && T.rotation.length === 9 ? T.rotation.map(Number) : IDENTITY.slice() };
  }
  function transformPoint(T, p) { T = tf(T); return add(matVec(T.rotation, p), T.position); }
  function inverseTransformPoint(T, p) { T = tf(T); return matTVec(T.rotation, sub(p, T.position)); }
  function transformDir(T, d) { T = tf(T); return matVec(T.rotation, d); }

  // ------------------------------------------------------------------ model helpers
  function isAssembly(model) { return !!(model && model.type === 'assembly'); }

  function newAssembly(name) {
    return { type: 'assembly', name: name || 'Assem1', units: 'mm', features: [], components: [], mates: [], nextId: 1 };
  }

  function examplesList() { return (typeof AnvilExamples !== 'undefined' && AnvilExamples) ? AnvilExamples : []; }

  function isAssemblyScript(code) { return /\b(a|asm)\.(insert|mate|coincident|concentric|distance|angle|parallel|perpendicular|tangent|width|gear|limitDistance|limitAngle|linearPattern|circularPattern|mirrorComponents|explode)\s*\(/.test(String(code || '')); }

  // ------------------------------------------------------------------ documents: live links to part / assembly files
  // A component source { file: name } is a live link to a document in the document store instead of an embedded copy
  // (SolidWorks' external references). The store has two layers: `open` holds documents edited in memory and not saved
  // yet (dirty), the backing store holds saved ones. The UI (ui-assembly.js) backs it with the browser's saved files
  // (localStorage 'anvil.files', File ▸ Save); the default backing is an in-memory map (tests, scripts). A rebuild reads
  // the current document every time, so editing a referenced part updates every assembly that uses it; a name the
  // store does not know is a broken reference (the component is shown suppressed, with a warning).
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function memoryBacking() {
    var docs = {};
    return {
      get: function (n) { return Object.prototype.hasOwnProperty.call(docs, n) ? docs[n] : null; },
      put: function (n, m) { docs[n] = m; },
      remove: function (n) { delete docs[n]; },
      list: function () { return Object.keys(docs); }
    };
  }
  var backing = memoryBacking(), openDocs = {};
  function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function rawDoc(name) { name = String(name); return has(openDocs, name) ? openDocs[name] : backing.get(name); }
  var Documents = {
    // use(backing | null): { get(name) -> model | null, put(name, model), remove(name), list() -> names }; null: a fresh
    // in-memory store. Unsaved (dirty) documents are dropped.
    use: function (b) { backing = b || memoryBacking(); openDocs = {}; return Documents; },
    get: function (name) { var m = rawDoc(name); return m ? clone(m) : null; },
    has: function (name) { return !!rawDoc(name); },
    // put(name, model, { dirty }): save to the backing store, or with dirty keep it in memory only (an edit not saved)
    put: function (name, model, opts) {
      name = String(name);
      if (opts && opts.dirty) openDocs[name] = clone(model);
      else { backing.put(name, clone(model)); delete openDocs[name]; }
      return name;
    },
    isDirty: function (name) { return has(openDocs, String(name)); },
    dirty: function () { return Object.keys(openDocs); },
    save: function (name) { name = String(name); if (!has(openDocs, name)) return false; backing.put(name, openDocs[name]); delete openDocs[name]; return true; },
    revert: function (name) { var d = has(openDocs, String(name)); delete openDocs[String(name)]; return d; },
    remove: function (name) { name = String(name); delete openDocs[name]; backing.remove(name); },
    list: function () { var seen = {}; (backing.list() || []).concat(Object.keys(openDocs)).forEach(function (n) { seen[n] = true; }); return Object.keys(seen).sort(); }
  };
  function hashString(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }
  var MAX_DEPTH = 16;
  function isLinkish(src) { return !!(src && typeof src === 'object' && (src.file != null || (src.model && isAssembly(src.model)))); }
  // sourceStamp(source) -> '' for a source that is its own content; for a link, a hash of the document (and of the
  // documents it links to in turn), so a cached build is reused only while none of them changed
  function sourceStamp(source, depth) {
    depth = depth || 0;
    if (!isLinkish(source) || depth > MAX_DEPTH) return '';
    var m = null, s = '';
    if (source.file != null) { m = rawDoc(source.file); s = m ? hashString(JSON.stringify(m)) : 'missing'; }
    else m = source.model;
    if (m && isAssembly(m)) (m.components || []).forEach(function (c) { if (isLinkish(c.source)) s += '|' + sourceStamp(c.source, depth + 1); });
    return s;
  }
  // references(model) -> the document names a model links to, directly or through its sub-assemblies (sorted)
  function references(model, out, depth) {
    out = out || {};
    depth = depth || 0;
    if (!model || depth > MAX_DEPTH) return Object.keys(out).sort();
    (model.components || []).forEach(function (c) {
      var src = c.source;
      if (!src) return;
      if (src.file != null) {
        var first = !out[src.file];
        out[src.file] = true;
        var m = first ? rawDoc(src.file) : null;
        if (m && isAssembly(m)) references(m, out, depth + 1);
      } else if (src.model && isAssembly(src.model)) references(src.model, out, depth + 1);
    });
    return Object.keys(out).sort();
  }
  // saveReferences(model) -> the names saved: File ▸ Save of an assembly also saves the referenced documents that were
  // edited in memory (Open Part / Edit Part) and not saved yet
  function saveReferences(model) { return references(model).filter(function (n) { return Documents.save(n); }); }
  // packAndGo(model) -> { model, embedded: [names], missing: [names] }: a copy with every linked document embedded
  // ({ file } -> { model }, sub-assemblies packed in turn), so the file stands alone (SolidWorks Pack and Go)
  function packAndGo(model, depth) {
    depth = depth || 0;
    var out = clone(model), embedded = {}, missing = {};
    (out.components || []).forEach(function (c) {
      var src = c.source;
      if (!src || typeof src !== 'object') return;
      var m = null;
      if (src.file != null) {
        m = Documents.get(src.file);
        if (!m) { missing[src.file] = true; return; }
        embedded[src.file] = true;
      } else if (src.model && isAssembly(src.model)) m = src.model;
      if (!m) return;
      if (isAssembly(m) && depth < MAX_DEPTH) {
        var r = packAndGo(m, depth + 1);
        m = r.model;
        r.embedded.forEach(function (n) { embedded[n] = true; });
        r.missing.forEach(function (n) { missing[n] = true; });
      }
      c.source = { model: m };
    });
    return { model: out, embedded: Object.keys(embedded).sort(), missing: Object.keys(missing).sort() };
  }

  function exampleEntry(name) {
    var ex = null;
    examplesList().forEach(function (e) { if (!ex && e && e.name === name) ex = e; });
    return ex;
  }
  function isAssemblyExample(ex) { return !!(ex && (ex.kind === 'assembly' || ex.assembly || ex.type === 'assembly' || isAssemblyScript(ex.code))); }
  // resolveSource(source) -> { kind: 'part' | 'assembly', model (a fresh copy), file? }. Sources: { example } (a Design
  // Library part or assembly), { script } (a part or assembly script), { model } (an embedded part or assembly) and
  // { file } (a live link to the document store). Throws a readable Error; a missing document throws one with
  // `broken: true`.
  function resolveSource(source) {
    if (typeof source === 'string') source = { example: source };
    if (!source || typeof source !== 'object') throw new Error('Component source must be { example }, { script }, { model } or { file }');
    var m;
    if (source.file != null) {
      m = Documents.get(source.file);
      if (!m) { var err = new Error('Cannot find the referenced document "' + source.file + '"'); err.broken = true; throw err; }
      if (isAssembly(m)) m.features = m.features || [];
      return { kind: isAssembly(m) ? 'assembly' : 'part', model: m, file: String(source.file) };
    }
    if (source.example != null) {
      var ex = exampleEntry(source.example);
      if (!ex) throw new Error('Unknown Design Library part "' + source.example + '"');
      if (isAssemblyExample(ex)) { m = newAssembly(ex.name); runScript(m, ex.code); return { kind: 'assembly', model: m }; }
      m = Kernel.newModel();
      Kernel.runScript(m, ex.code);
      return { kind: 'part', model: m };
    }
    if (source.script != null) {
      if (isAssemblyScript(source.script)) { m = newAssembly('SubAssem'); runScript(m, String(source.script)); return { kind: 'assembly', model: m }; }
      m = Kernel.newModel();
      Kernel.runScript(m, String(source.script));
      return { kind: 'part', model: m };
    }
    if (source.model) {
      m = clone(source.model);
      if (isAssembly(m)) { m.features = m.features || []; return { kind: 'assembly', model: m }; }
      return { kind: 'part', model: m };
    }
    throw new Error('Component source must be { example }, { script }, { model } or { file }');
  }
  // A fresh model JSON for a component source: a part model, or an assembly model for a sub-assembly source.
  function partModel(source) { return resolveSource(source).model; }

  function findComponent(model, idOrName) {
    if (idOrName == null || !model || !model.components) return null;
    var list = model.components, i;
    for (i = 0; i < list.length; i++) if (list[i].id === idOrName) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === idOrName) return list[i];
    if (typeof idOrName === 'string' && /^\d+$/.test(idOrName)) return findComponent(model, +idOrName);
    return null;
  }
  function findMate(model, idOrName) {
    if (idOrName == null || !model || !model.mates) return null;
    var list = model.mates, i;
    for (i = 0; i < list.length; i++) if (list[i].id === idOrName) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === idOrName) return list[i];
    if (typeof idOrName === 'string' && /^\d+$/.test(idOrName)) return findMate(model, +idOrName);
    return null;
  }
  function componentIndex(model, id) {
    for (var i = 0; i < model.components.length; i++) if (model.components[i].id === id) return i;
    return -1;
  }

  function nextNumber(names, base) { // 1 + the largest n among names 'base<n>' / 'baseN'
    var max = 0;
    names.forEach(function (nm) {
      if (typeof nm !== 'string' || nm.indexOf(base) !== 0) return;
      var n = parseInt(nm.slice(base.length).replace(/^</, ''), 10);
      if (n > max) max = n;
    });
    return max + 1;
  }

  function ensureLists(model) {
    if (!model.components) model.components = [];
    if (!model.mates) model.mates = [];
    if (!model.features) model.features = [];
    if (!(model.nextId > 0)) {
      var max = 0;
      model.components.concat(model.mates, model.patterns || [], model.explodedViews || []).forEach(function (o) { if (o.id > max) max = o.id; });
      (model.explodedViews || []).forEach(function (v) { (v.steps || []).forEach(function (st) { if (st.id > max) max = st.id; }); });
      model.nextId = max + 1;
    }
  }

  // insert(model, source, opts) -> the new component. source may be an example name string.
  function insert(model, source, opts) {
    opts = opts || {};
    ensureLists(model);
    if (typeof source === 'string') source = { example: source };
    source = JSON.parse(JSON.stringify(source || {}));
    var base = source.file != null ? String(source.file) : 'Part';
    if (source.file == null) try { base = partModel(source).name || 'Part'; } catch (e) { /* rebuild reports the error on the component */ }
    var name = opts.name || (base + '<' + nextNumber(model.components.map(function (c) { return c.name; }), base) + '>');
    var fixed = model.components.length === 0 ? opts.fixed !== false : opts.fixed === true;
    var pos = opts.position || opts.at;
    var comp = {
      id: model.nextId++, name: name, source: source, fixed: fixed,
      transform: { position: pos ? copy3(pos) : [0, 0, 0], rotation: opts.rotation ? orthonormalize(opts.rotation.map(Number)) : IDENTITY.slice() }
    };
    // a sub-assembly is rigid unless inserted with flexible: true (then its internal mates are solved in context)
    if (opts.flexible) comp.flexible = true;
    if (opts.flexState && typeof opts.flexState === 'object') comp.flexState = clone(opts.flexState);
    model.components.push(comp);
    return comp;
  }
  // setFlexible(model, id, on): Solve as Flexible (the sub-assembly's own mates are solved in the assembly, so parts of
  // it can move) or Rigid (it moves as one body). Throws for a component that is not a sub-assembly.
  function setFlexible(model, id, on) {
    var c = findComponent(model, id);
    if (!c) throw new Error('Unknown component ' + JSON.stringify(id));
    var kind = null;
    try { kind = resolveSource(c.source).kind; } catch (e) { kind = null; }
    if (kind !== 'assembly') throw new Error(c.name + ' is not a sub-assembly');
    if (on) c.flexible = true; else { delete c.flexible; delete c.flexState; }
    return c;
  }
  function isSubAssemblySource(source) { try { return resolveSource(source).kind === 'assembly'; } catch (e) { return false; } }

  var MATE_BASE = { coincident: 'Coincident', concentric: 'Concentric', distance: 'Distance', angle: 'Angle',
    parallel: 'Parallel', perpendicular: 'Perpendicular', tangent: 'Tangent', width: 'Width', gear: 'Gear',
    limitdistance: 'LimitDistance', limitangle: 'LimitAngle' };
  var MATE_TYPES = ['coincident', 'concentric', 'distance', 'angle', 'parallel', 'perpendicular', 'tangent', 'width', 'gear', 'limitdistance', 'limitangle'];
  // Mate PropertyManager groups, as in SolidWorks (types Anvil does not have yet are left out)
  var MATE_GROUPS = {
    standard: ['coincident', 'parallel', 'perpendicular', 'tangent', 'concentric', 'distance', 'angle'],
    advanced: ['width', 'limitdistance', 'limitangle'],
    mechanical: ['gear']
  };
  function mateTypeName(t) { t = String(t || '').toLowerCase(); return t === 'limitdistance' ? 'limitDistance' : t === 'limitangle' ? 'limitAngle' : t; }

  function normRef(model, ref) {
    var r = JSON.parse(JSON.stringify(ref || {}));
    if (r.component != null && typeof r.component !== 'number') {
      var c = findComponent(model, r.component);
      if (c) r.component = c.id;
    }
    return r;
  }

  // addMate(model, type, a, b, opts) -> the new mate
  function addMate(model, type, a, b, opts) {
    opts = opts || {};
    ensureLists(model);
    type = String(type || '').toLowerCase().replace(/[^a-z]/g, '');
    var base = MATE_BASE[type] || 'Mate';
    var m = {
      id: model.nextId++,
      name: opts.name || (base + nextNumber(model.mates.map(function (x) { return x.name; }), base)),
      type: type, a: normRef(model, a), b: normRef(model, b)
    };
    // Width: a / a2 are the two width faces, b / b2 the two tab faces (or b alone: a cylindrical tab)
    if (opts.a2) m.a2 = normRef(model, opts.a2);
    if (opts.b2) m.b2 = normRef(model, opts.b2);
    if (opts.alignment) m.alignment = opts.alignment;
    if (opts.phase && opts.phase.length === 2) m.phase = [+opts.phase[0], +opts.phase[1]];
    setMateValues(m, opts);
    if (opts.suppressed) m.suppressed = true;
    model.mates.push(m);
    return m;
  }

  // Mate values: Distance { distance } (mm, >= 0), Angle { angle } (degrees, 0..180), Coincident { offset } (mm, >= 0,
  // left out when 0), Limit Distance / Limit Angle { min, max } (the range the value may take), Gear { ratio: [a, b] }
  // (B turns a/b times as far as A; a number r means [r, 1]); `flip: true` (Flip dimension) puts the distance / offset /
  // range on the other side, measures the angle the other way round, makes a Tangent internal (cylinders) or puts the
  // cylinder on the back of the plane, and makes a Gear turn both components the same way (SolidWorks' Reverse).
  // Keys that do not belong to the mate type are removed.
  var FLIP_TYPES = { distance: 1, angle: 1, coincident: 1, tangent: 1, gear: 1, limitdistance: 1, limitangle: 1 };
  function setMateValues(m, opts) {
    opts = opts || {};
    ['distance', 'angle', 'offset', 'min', 'max'].forEach(function (k) { if (opts[k] != null) m[k] = +opts[k]; });
    if (opts.ratio != null) m.ratio = Array.isArray(opts.ratio) ? [+opts.ratio[0], +opts.ratio[1]] : [+opts.ratio, 1];
    if (opts.flip != null) { if (opts.flip) m.flip = true; else delete m.flip; }
    var limit = m.type === 'limitdistance' || m.type === 'limitangle';
    if (m.type !== 'distance') delete m.distance;
    if (m.type !== 'angle') delete m.angle;
    if (m.type !== 'coincident' || !m.offset) delete m.offset;
    if (!limit) { delete m.min; delete m.max; }
    if (m.type !== 'gear') { delete m.ratio; delete m.phase; }
    if (m.type !== 'width') { delete m.a2; delete m.b2; }
    if (m.type === 'distance' && m.distance == null) m.distance = 0;
    if (m.type === 'angle' && m.angle == null) m.angle = 0;
    if (limit && m.min == null) m.min = 0;
    if (limit && m.max == null) m.max = m.min;
    if (m.type === 'gear' && m.ratio == null) m.ratio = [1, 1];
    if (!FLIP_TYPES[m.type] || (m.type === 'coincident' && !m.offset)) delete m.flip;
    return m;
  }

  function refUses(ref, id) { return ref && ref.component != null && ref.component === id; }
  function removeComponent(model, id) {
    var c = findComponent(model, id);
    if (!c) return false;
    var gone = {};
    gone[c.id] = true;
    // a seed takes its pattern instances along; a pattern left without seeds is deleted
    (model.patterns || []).forEach(function (p) { p.seeds = (p.seeds || []).filter(function (s) { return s !== c.id; }); });
    model.patterns = (model.patterns || []).filter(function (p) { return p.seeds.length > 0; });
    model.components.forEach(function (x) { if (x.pattern != null && (x.seed === c.id || !findPattern(model, x.pattern))) gone[x.id] = true; });
    dropComponents(model, gone);
    return true;
  }
  // remove the components in `gone` (id -> true), the mates that reference them and their explode-step entries
  function dropComponents(model, gone) {
    model.components = model.components.filter(function (x) { return !gone[x.id]; });
    model.mates = model.mates.filter(function (m) { return ['a', 'b', 'a2', 'b2'].every(function (k) { return !(m[k] && gone[m[k].component]); }); });
    if (model.ignoredInterferences) {   // r5/asm5: ignored interferences of a deleted component go with it
      model.ignoredInterferences = model.ignoredInterferences.filter(function (k) { var s = ignoreSides(k); return ![s.a, s.b].some(function (x) { var m = /^(\d+)(\/|$)/.exec(x); return m && gone[+m[1]]; }); });
      if (!model.ignoredInterferences.length) delete model.ignoredInterferences;
    }
    (model.explodedViews || []).forEach(function (v) {
      (v.steps || []).forEach(function (st) { st.components = (st.components || []).filter(function (id) { return !gone[id]; }); });
      v.steps = (v.steps || []).filter(function (st) { return st.components.length > 0; });
    });
  }
  function removeMate(model, id) {
    var m = findMate(model, id);
    if (!m) return false;
    model.mates.splice(model.mates.indexOf(m), 1);
    return true;
  }
  function setFixed(model, id, fixed) {
    var c = findComponent(model, id);
    if (c) c.fixed = !!fixed;
    return c;
  }

  // ------------------------------------------------------------------ part geometry: meshes, patches, cylinders
  // Each part build gets a local mesh plus "patches": the polygons of one planar mesh face split into connected pieces
  // (two coplanar hole facets of patterned holes are one mesh face but two patches). Cylinder detection works on patches.
  function vkey(p) { return Math.round(p[0] * 1e5) + ',' + Math.round(p[1] * 1e5) + ',' + Math.round(p[2] * 1e5); }

  function partGeom(build) {
    if (!build || !build.body) return null;
    if (build.__asmGeom) return build.__asmGeom;
    var mesh = Kernel.meshFromBody(build.body);
    var patches = [], vertPatches = {};
    mesh.faces.forEach(function (f, fi) {
      // union-find over the face's polygons by shared vertex
      var polys = f.polys, parent = polys.map(function (_, i) { return i; }), owner = {};
      function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
      polys.forEach(function (p, i) {
        p.vertices.forEach(function (v) {
          var k = vkey(arr(v.pos));
          if (owner[k] == null) owner[k] = i; else { var a = find(owner[k]), b = find(i); if (a !== b) parent[a] = b; }
        });
      });
      var byRoot = {};
      polys.forEach(function (p, i) {
        var r = find(i);
        if (!byRoot[r]) { byRoot[r] = { face: fi, normal: f.normal, w: f.w, polys: [], keys: {} }; patches.push(byRoot[r]); }
        byRoot[r].polys.push(p);
      });
    });
    patches.forEach(function (pt, pi) {
      pt.index = pi;
      pt.polys.forEach(function (p) {
        p.vertices.forEach(function (v) {
          var k = vkey(arr(v.pos));
          pt.keys[k] = true;
          (vertPatches[k] = vertPatches[k] || []);
          if (vertPatches[k].indexOf(pi) < 0) vertPatches[k].push(pi);
        });
      });
    });
    patches.forEach(function (pt) {
      var nb = {};
      Object.keys(pt.keys).forEach(function (k) { vertPatches[k].forEach(function (q) { if (q !== pt.index) nb[q] = true; }); });
      pt.neighbors = Object.keys(nb).map(Number);
    });
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    build.body.polygons.forEach(function (p) {
      p.vertices.forEach(function (v) { var q = arr(v.pos); for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
    });
    if (!(min[0] <= max[0])) { min = [0, 0, 0]; max = [0, 0, 0]; }
    var geom = { mesh: mesh, patches: patches, cyl: {}, center: scale(add(min, max), 0.5), size: Math.max(1e-9, len(sub(max, min))) };
    try { Object.defineProperty(build, '__asmGeom', { value: geom, enumerable: false, configurable: true, writable: true }); } catch (e) { /* frozen build: recompute next time */ }
    return geom;
  }

  // distance from p to a convex polygon
  function polyDistance(poly, p) {
    var vs = poly.vertices.map(function (v) { return arr(v.pos); });
    var n = arr(poly.plane.normal), d = dot(n, p) - poly.plane.w;
    var q = sub(p, scale(n, d)), inside = true;
    for (var i = 0; i < vs.length; i++) {
      var a = vs[i], b = vs[(i + 1) % vs.length];
      if (dot(cross(sub(b, a), sub(q, a)), n) < -1e-12) { inside = false; break; }
    }
    if (inside) return Math.abs(d);
    var best = Infinity;
    for (i = 0; i < vs.length; i++) {
      var A = vs[i], B = vs[(i + 1) % vs.length], ab = sub(B, A), L2 = dot(ab, ab);
      var t = L2 > 0 ? Math.max(0, Math.min(1, dot(sub(p, A), ab) / L2)) : 0;
      var dd = len(sub(p, add(A, scale(ab, t))));
      if (dd < best) best = dd;
    }
    return best;
  }
  function patchDistance(pt, p) {
    var best = Infinity;
    for (var i = 0; i < pt.polys.length; i++) { var d = polyDistance(pt.polys[i], p); if (d < best) best = d; }
    return best;
  }
  function patchesByDistance(geom, p) {
    return geom.patches.map(function (pt) { return { pt: pt, d: patchDistance(pt, p) }; }).sort(function (a, b) { return a.d - b.d; });
  }

  // Jacobi eigen-decomposition of a symmetric n x n matrix (array of rows) -> { values, vectors (columns as arrays) }
  function eigSym(A) {
    var n = A.length, a = A.map(function (r) { return r.slice(); }), V = [], i, j, k;
    for (i = 0; i < n; i++) { V.push([]); for (j = 0; j < n; j++) V[i].push(i === j ? 1 : 0); }
    for (var sweep = 0; sweep < 60; sweep++) {
      var off = 0, tot = 0;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) { tot += a[i][j] * a[i][j]; if (i !== j) off += a[i][j] * a[i][j]; }
      if (off <= 1e-30 * Math.max(tot, 1e-300)) break;
      for (var p = 0; p < n - 1; p++) {
        for (var q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-300) continue;
          var th = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          var t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1));
          var c = 1 / Math.sqrt(t * t + 1), s = t * c;
          for (k = 0; k < n; k++) { // rotate columns p, q
            var akp = a[k][p], akq = a[k][q];
            a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
          }
          for (k = 0; k < n; k++) { // rotate rows p, q
            var apk = a[p][k], aqk = a[q][k];
            a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
          }
          for (k = 0; k < n; k++) {
            var vkp = V[k][p], vkq = V[k][q];
            V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
          }
        }
      }
    }
    var values = [], vectors = [];
    for (i = 0; i < n; i++) { values.push(a[i][i]); vectors.push(V.map(function (row) { return row[i]; })); }
    return { values: values, vectors: vectors };
  }

  // Canonical axis direction: the sign that makes the largest-magnitude component positive (ties: x, then y, then z).
  function canonicalDir(d) {
    var best = 0;
    for (var k = 1; k < 3; k++) if (Math.abs(d[k]) > Math.abs(d[best]) + 1e-9) best = k;
    return d[best] < 0 ? scale(d, -1) : d.slice();
  }

  // Grow a faceted cylindrical surface from a seed patch -> { point, dir, radius, patches } (local coords) or null.
  // Neighbouring facets of a cylinder have normals perpendicular to one common axis and turn by a small angle
  // (circles use >= 16 segments, revolves 48 steps); box sides (90°) and hex flats (60°) are not cylinders.
  var MAX_TURN = Math.cos(40 * Math.PI / 180), MIN_TURN = Math.cos(0.2 * Math.PI / 180);
  function cylinderFromPatch(geom, seed) {
    if (geom.cyl[seed.index] !== undefined) return geom.cyl[seed.index];
    var P = geom.patches, n0 = seed.normal, axis = null;
    seed.neighbors.forEach(function (qi) {
      if (axis) return;
      var c = dot(n0, P[qi].normal);
      if (c < MIN_TURN && c > MAX_TURN) axis = norm(cross(n0, P[qi].normal));
    });
    var result = null;
    if (axis) {
      var inRegion = {}, region = [seed], queue = [seed];
      inRegion[seed.index] = true;
      while (queue.length) {
        var r = queue.shift();
        r.neighbors.forEach(function (qi) {
          if (inRegion[qi]) return;
          var q = P[qi];
          if (Math.abs(dot(q.normal, axis)) > 2e-3) return;
          if (dot(q.normal, r.normal) < MAX_TURN) return;
          inRegion[qi] = true; region.push(q); queue.push(q);
        });
      }
      // at least three distinct facet directions
      var dirs = [];
      region.forEach(function (q) { if (!dirs.some(function (d) { return dot(d, q.normal) > MIN_TURN; })) dirs.push(q.normal); });
      if (dirs.length >= 3) result = fitCylinder(region, axis);
    }
    region = null;
    // every patch of the region maps to the same cylinder
    if (result) result.patches.forEach(function (q) { geom.cyl[q.index] = result; });
    else geom.cyl[seed.index] = null;
    return result;
  }

  // Least-squares cylinder through facet planes: axis = direction least represented in the facet normals (smallest
  // eigenvector of Σ n nᵀ); centre c and signed radius k from n_i · c + k = w_i (k > 0 for a boss, < 0 for a hole).
  function fitCylinder(region, axis0) {
    var M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    region.forEach(function (q) { for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) M[i][j] += q.normal[i] * q.normal[j]; });
    var eg = eigSym(M), lo = 0;
    for (var i = 1; i < 3; i++) if (eg.values[i] < eg.values[lo]) lo = i;
    var axis = norm(eg.vectors[lo]);
    if (dot(axis, axis0) < 0) axis = scale(axis, -1);
    var e1 = norm(cross(axis, Math.abs(axis[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])), e2 = cross(axis, e1);
    // normal equations for unknowns (a, b, k): n·(a e1 + b e2) + k = w
    var N = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], rhs = [0, 0, 0];
    region.forEach(function (q) {
      var row = [dot(q.normal, e1), dot(q.normal, e2), 1];
      for (var r = 0; r < 3; r++) { rhs[r] += row[r] * q.w; for (var c = 0; c < 3; c++) N[r][c] += row[r] * row[c]; }
    });
    var sol = solveLinear(N, rhs);
    if (!sol) return null;
    var point = add(scale(e1, sol[0]), scale(e2, sol[1]));
    return { point: point, dir: canonicalDir(axis), radius: Math.abs(sol[2]), patches: region };
  }

  // Gaussian elimination with partial pivoting; A is n x n (array of rows), destroyed copy. -> x | null
  function solveLinear(A, b) {
    var n = b.length, M = A.map(function (r, i) { return r.slice().concat([b[i]]); }), i, j, k;
    for (i = 0; i < n; i++) {
      var piv = i;
      for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[piv][i])) piv = j;
      if (!(Math.abs(M[piv][i]) > 1e-300)) return null;
      var tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      for (j = i + 1; j < n; j++) {
        var f = M[j][i] / M[i][i];
        if (f === 0) continue;
        for (k = i; k <= n; k++) M[j][k] -= f * M[i][k];
      }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) {
      var s = M[i][n];
      for (j = i + 1; j < n; j++) s -= M[i][j] * x[j];
      x[i] = s / M[i][i];
    }
    return x;
  }

  // True curves (cloud-2026-09-26r): a patch whose facets carry an exact cylinder record (polygon.surf, kernel.js) is
  // that cylinder: its axis and radius come from the record, not from a fit to the facets, so Concentric, Tangent and
  // Distance between cylinders use the true radius. -> { point, dir, radius, patches, exact: true } | null
  function analyticCylinder(geom, pt) {
    if (!geom.acyl) geom.acyl = {};
    if (geom.acyl[pt.index] !== undefined) return geom.acyl[pt.index];
    var S = null;
    for (var i = 0; i < pt.polys.length && !S; i++) { var F = pt.polys[i].surf; if (F && F.s && F.s.t === 'cyl') S = F.s; }
    var out = null;
    if (S) {
      var d = canonicalDir(norm(copy3(S.d))), o = copy3(S.o);
      out = { point: sub(o, scale(d, dot(o, d))), dir: d, radius: Math.abs(+S.r), patches: [pt], exact: true, surf: S };
    }
    geom.acyl[pt.index] = out;
    return out;
  }
  function patchCylinder(geom, pt) { return analyticCylinder(geom, pt) || cylinderFromPatch(geom, pt); }

  // The cylinder through / nearest a local point: the nearest patch that belongs to a cylindrical surface (exact
  // record first, else a facet fit for meshes without records, e.g. legacy tessellation or imported STL).
  function findCylinder(geom, p) {
    var list = patchesByDistance(geom, p);
    for (var i = 0; i < list.length; i++) {
      var c = patchCylinder(geom, list[i].pt);
      if (c) return c;
    }
    return null;
  }

  // ------------------------------------------------------------------ references
  var STD_PLANE_NORMALS = { front: [0, 0, 1], top: [0, 1, 0], right: [1, 0, 0] };
  var AXIS_DIRS = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

  function fmtPt(p) { return '[' + p.map(function (x) { return +(+x).toFixed(4); }).join(', ') + ']'; }

  // Resolve a ref in its component's LOCAL frame -> { kind, point, normal|dir, comp (component or null), refKind }
  function localRef(model, partBuilds, ref) {
    if (!ref || typeof ref !== 'object') throw new Error('Missing mate reference');
    var comp = null, geom = null;
    if (ref.component != null) {
      comp = findComponent(model, ref.component);
      if (!comp) throw new Error('Unknown component ' + JSON.stringify(ref.component));
      // { component: sub-assembly, path: [inner id | name, …], face | cylinder | plane | axis }: geometry of a component
      // inside a sub-assembly, in that inner component's local frame; resolved there and carried into the
      // sub-assembly's frame by the inner transforms (the sub-assembly build's own, or its in-context ones when flexible)
      if (ref.path && ref.path.length) {
        var sb = partBuilds && partBuilds[comp.id];
        if (!sb || !sb.model || !isAssembly(sb.model)) throw new Error(comp.name + ' is not a sub-assembly');
        var inner = findComponent(sb.model, ref.path[0]);
        if (!inner) throw new Error('Unknown component ' + JSON.stringify(ref.path[0]) + ' in ' + comp.name);
        var iref = {};
        Object.keys(ref).forEach(function (k) { iref[k] = ref[k]; });
        iref.component = inner.id;
        if (ref.path.length > 1) iref.path = ref.path.slice(1); else delete iref.path;
        var ilr = localRef(sb.model, sb.partBuilds, iref);
        var w = worldOf(ilr, tf(inner.transform));
        w.comp = comp; w.refKind = ilr.refKind; w.inner = inner;
        return w;
      }
    }
    function needGeom() {
      var b = partBuilds && partBuilds[comp.id];
      geom = partGeom(b);
      if (!geom) throw new Error(comp.name + ' has no geometry');
      return geom;
    }
    var out = { comp: comp };
    if (ref.plane != null) {
      var n = STD_PLANE_NORMALS[String(ref.plane).toLowerCase()];
      if (!n) throw new Error('Unknown plane "' + ref.plane + '"');
      out.kind = 'plane'; out.refKind = 'plane'; out.point = [0, 0, 0]; out.normal = n.slice();
    } else if (ref.axis != null) {
      var d = AXIS_DIRS[String(ref.axis).toLowerCase()];
      if (!d) throw new Error('Unknown axis "' + ref.axis + '"');
      out.kind = 'axis'; out.refKind = 'axis'; out.point = [0, 0, 0]; out.dir = d.slice();
    } else if (ref.face) {
      if (!comp) throw new Error('A face reference needs a component');
      var p = copy3(ref.face), g = needGeom(), memo = g.refMemo || (g.refMemo = {}), fk = 'f' + p.join(),
        best = memo[fk] !== undefined ? memo[fk] : (memo[fk] = patchesByDistance(g, p)[0] || null);   // (memo: every solve resolves every ref)
      var tol = Math.max(1e-4, 1e-5 * g.size);
      if (!best || best.d > tol) throw new Error('No face at ' + fmtPt(p) + ' on ' + comp.name);
      var nn = best.pt.normal;
      out.kind = 'plane'; out.refKind = 'face'; out.normal = nn.slice();
      out.point = sub(p, scale(nn, dot(nn, p) - best.pt.w)); // projected onto the face plane
    } else if (ref.cylinder) {
      if (!comp) throw new Error('A cylindrical face reference needs a component');
      var pc = copy3(ref.cylinder), gc = needGeom(), memc = gc.refMemo || (gc.refMemo = {}), ck = 'c' + pc.join(),
        cy = memc[ck] !== undefined ? memc[ck] : (memc[ck] = findCylinder(gc, pc));
      if (!cy) throw new Error('No cylindrical face near ' + fmtPt(pc) + ' on ' + comp.name);
      out.kind = 'axis'; out.refKind = 'cylinder'; out.dir = cy.dir.slice();
      out.point = add(cy.point, scale(cy.dir, dot(sub(pc, cy.point), cy.dir))); // axis point nearest the given point
      out.radius = cy.radius;
    } else throw new Error('A mate reference needs face, plane, cylinder or axis');
    // an axis carries a fixed reference direction square to it: the Gear mate measures the component's turn with it
    if (out.dir) out.ref = perpTo(out.dir);
    return out;
  }

  function worldOf(lr, T) {
    if (!lr.comp) return { kind: lr.kind, refKind: lr.refKind, point: lr.point.slice(), normal: lr.normal && lr.normal.slice(), dir: lr.dir && lr.dir.slice(), ref: lr.ref && lr.ref.slice(), radius: lr.radius };
    var o = { kind: lr.kind, refKind: lr.refKind, point: transformPoint(T, lr.point), radius: lr.radius };
    if (lr.normal) o.normal = transformDir(T, lr.normal);
    if (lr.dir) o.dir = transformDir(T, lr.dir);
    if (lr.ref) o.ref = transformDir(T, lr.ref);
    return o;
  }

  function resolveRef(model, partBuilds, ref, transforms) {
    var lr = localRef(model, partBuilds, ref);
    var T = lr.comp ? ((transforms && transforms[lr.comp.id]) || lr.comp.transform) : null;
    var w = worldOf(lr, T);
    if (w.kind === 'plane') return { kind: 'plane', point: w.point, normal: w.normal };
    var o = { kind: 'axis', point: w.point, dir: w.dir };
    if (lr.radius != null) o.radius = lr.radius;
    return o;
  }

  // ------------------------------------------------------------------ mate residuals
  function isAxisRef(r) { return !!(r && (r.cylinder || r.axis != null)); }
  // Default alignment: Coincident / Distance / Limit Distance between two faces are anti-aligned (the faces touch), with a
  // plane aligned; Concentric and Angle aligned. The newer mates (Parallel, Perpendicular, Tangent, Width, a Distance
  // that involves a cylinder or axis) take the closest alignment, as SolidWorks does: 'closest' keeps whichever sign the
  // two directions have when the mate is solved (so the component turns the least).
  function defaultAlignment(m) {
    var t = m.type;
    if (t === 'parallel' || t === 'perpendicular' || t === 'tangent' || t === 'width' || t === 'gear') return 'closest';
    if (t === 'coincident' || t === 'distance' || t === 'limitdistance') {
      if (t !== 'coincident' && (isAxisRef(m.a) || isAxisRef(m.b))) return 'closest';
      return (m.a && m.a.face && m.b && m.b.face) ? 'anti-aligned' : 'aligned';
    }
    return 'aligned';
  }
  // every mate but Gear has an alignment (Aligned / Anti-Aligned / Closest) the user may flip
  function hasAlignment(m) { return !!(m && m.type !== 'gear'); }
  function alignSign(m) { var a = m.alignment || defaultAlignment(m); return a === 'anti-aligned' ? -1 : a === 'closest' ? 0 : 1; }

  // Signed plane gap a Coincident / Distance mate holds: B's plane lies `target` along A's normal (flip: the other side).
  function gapTarget(m) {
    var v = m.type === 'distance' ? +m.distance || 0 : m.type === 'coincident' ? +m.offset || 0 : 0;
    return m.flip ? -v : v;
  }
  // Signed angle an Angle mate holds (radians), measured from A's direction to B's (times the alignment sign) about the
  // mate's angle axis k; flip measures it the other way round.
  function angleTarget(m) { var a = (+m.angle || 0) * Math.PI / 180; return m.flip ? -a : a; }
  function wrapAngle(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }
  function dirOf(W) { return W.normal || W.dir; }
  // The signed angle from direction p to q seen along k (both projected onto the plane normal to k).
  function signedAngle(p, q, k) {
    var pp = sub(p, scale(k, dot(p, k))), qq = sub(q, scale(k, dot(q, k)));
    return Math.atan2(dot(k, cross(pp, qq)), dot(pp, qq));
  }
  // An axis normal to direction d (for an angle axis when the two directions are parallel).
  function perpTo(d) { return norm(cross(d, Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); }

  // Residual vector of a prepared mate given world refs A, B (and the world angle axis k for an Angle mate).
  // Coincident / Distance: nA − s·nB (3) and the plane gap minus its target (1).
  // Concentric: dA − s·dB (3) and B's axis point offset perpendicular to A's axis (3).
  // Angle: the signed angle from dA to s·dB about k minus its target (1, wrapped to ±π).
  //
  // The newer mates, by the kinds of their two refs (pair 'pp' plane–plane, 'aa' axis–axis, 'ap' / 'pa' mixed):
  // Parallel: pp / aa dA − s·dB (3), mixed dA · dB (1).  Perpendicular: pp / aa dA · dB (1), mixed dA − s·dB (3).
  // Distance aa: dA − s·dB (3) and the axis-to-axis distance minus d; ap: axis · normal (1) and the axis' signed height
  // above the plane minus ±d. Tangent: as Distance with d = the radius (cylinder–plane) or rA + rB / |rA − rB| (two
  // cylinders). Width: the tab's mid-plane (two faces) or axis (a cylinder) parallel to and on the mid-plane of the two
  // width faces. Limit Distance / Limit Angle: the directions as for Distance / Angle and the amount by which the value
  // lies outside [min, max] (0 inside, so the component moves freely there). Gear: B's turn about its axis plus
  // ±(a/b)·A's turn, both measured from the phase stored when the mate was first solved.
  function clampExcess(v, lo, hi) { return v < lo ? v - lo : v > hi ? v - hi : 0; }
  function axisDistance(A, B) { var v = sub(B.point, A.point); return len(sub(v, scale(A.dir, dot(v, A.dir)))); }
  function planeGap(P, X) { return dot(sub(X.point, P.point), P.normal); }   // X's point above P, along P's normal
  function axisTurn(W) { return signedAngle(perpTo(W.dir), W.ref, W.dir); }   // the component's turn about its axis
  function limitRange(pm, toRad) {
    var f = toRad ? Math.PI / 180 : 1, lo = (+pm.mate.min || 0) * f, hi = (+pm.mate.max || 0) * f;
    return pm.mate.flip && pm.pair !== 'aa' ? [-hi, -lo] : [lo, hi];
  }
  // the scalar a distance-like mate holds: 'pp' the plane gap, 'aa' the axis distance, 'ap' / 'pa' the axis height
  function distValue(pm, A, B) {
    var s = pm.sign || 1;
    if (pm.pair === 'pp') return 0.5 * (dot(sub(B.point, A.point), A.normal) + s * dot(sub(B.point, A.point), B.normal));
    if (pm.pair === 'aa') return axisDistance(A, B);
    return pm.pair === 'pa' ? planeGap(A, B) : planeGap(B, A);
  }
  function dirResidual(pm, A, B) {   // the direction part of a distance-like mate
    if (pm.pair === 'pp' || pm.pair === 'aa') { var d = sub(dirOf(A), scale(dirOf(B), pm.sign || 1)); return [d[0], d[1], d[2]]; }
    return [dot(dirOf(A), dirOf(B))];
  }
  function mateResidual(pm, A, B, k, A2, B2) {
    var s = pm.sign;
    if (pm.type === 'coincident' || (pm.type === 'distance' && pm.pair === 'pp')) {
      var dn = sub(A.normal, scale(B.normal, s));
      var gap = 0.5 * (dot(sub(B.point, A.point), A.normal) + s * dot(sub(B.point, A.point), B.normal));
      return [dn[0], dn[1], dn[2], gap - pm.target];
    }
    if (pm.type === 'angle') return [wrapAngle(signedAngle(dirOf(A), scale(dirOf(B), s), k) - pm.target)];
    if (pm.type === 'limitangle') { var rg = limitRange(pm, true); return [clampExcess(wrapAngle(signedAngle(dirOf(A), scale(dirOf(B), s || 1), k)), rg[0], rg[1])]; }
    if (pm.type === 'distance' || pm.type === 'tangent') return dirResidual(pm, A, B).concat([distValue(pm, A, B) - pm.target]);
    if (pm.type === 'limitdistance') { var lr = limitRange(pm, false); return dirResidual(pm, A, B).concat([clampExcess(distValue(pm, A, B), lr[0], lr[1])]); }
    if (pm.type === 'parallel' || pm.type === 'perpendicular') {
      var same = pm.pair === 'pp' || pm.pair === 'aa';
      if (same === (pm.type === 'parallel')) { var dp = sub(dirOf(A), scale(dirOf(B), s || 1)); return [dp[0], dp[1], dp[2]]; }
      return [dot(dirOf(A), dirOf(B))];
    }
    if (pm.type === 'width') {
      var nW = A.normal, mid = scale(add(A.point, A2.point), 0.5);
      if (B.kind === 'axis') return [dot(B.dir, nW), dot(sub(B.point, mid), nW)];
      var dw = sub(nW, scale(B.normal, s || 1)), midB = scale(add(B.point, B2.point), 0.5);
      return [dw[0], dw[1], dw[2], dot(sub(midB, mid), nW)];
    }
    if (pm.type === 'gear') {
      var ph = pm.phase, dA = wrapAngle(axisTurn(A) - ph[0]), dB = wrapAngle(axisTurn(B) - ph[1]);
      return [wrapAngle(dB + (pm.mate.flip ? -1 : 1) * pm.ratio * dA)];
    }
    var dd = sub(A.dir, scale(B.dir, s)), v = sub(B.point, A.point);
    var perp = sub(v, scale(A.dir, dot(v, A.dir)));
    return [dd[0], dd[1], dd[2], perp[0], perp[1], perp[2]];
  }
  function vnorm(r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * r[i]; return Math.sqrt(s); }

  // ------------------------------------------------------------------ solver
  // Unknowns: 6 per floating component, an incremental move about a pivot c (the part's centre in world):
  //   R' = E(w) R,  p' = E(w)(p − c) + c + d.
  function perturb(T, pivot, x, o) {
    var E = rotVec([x[o + 3], x[o + 4], x[o + 5]]);
    return { rotation: matMul(E, T.rotation), position: add(add(matVec(E, sub(T.position, pivot)), pivot), [x[o], x[o + 1], x[o + 2]]) };
  }

  // solve(model, partBuilds, opts?) — opts.drag: see dragTo below
  function solve(model, partBuilds, opts) {
    ensureLists(model);
    var comps = model.components, transforms = {}, pivots = {}, mateOut = {};
    comps.forEach(function (c) { transforms[c.id] = tf(c.transform); });
    // pattern instances are placed from their seeds (placeInstances), never by the mate solver
    // r5/asm5: `held` components are held still for one solve step (the hub of a large floating cluster, see freeHub)
    var held = {};
    function movable(comp) { return !!(comp && !comp.fixed && comp.pattern == null && !held[comp.id]); }
    if (opts && opts.drag && opts.drag.point && opts.drag.target && movable(findComponent(model, opts.drag.id))) {
      // a drag first slides the component so the grabbed point is on the target (a free component just follows)
      var dT = transforms[opts.drag.id], slide = sub(copy3(opts.drag.target), transformPoint(dT, copy3(opts.drag.point)));
      transforms[opts.drag.id] = { rotation: dT.rotation, position: add(dT.position, slide) };
    }
    function pivotOf(comp) {
      var g = partGeom(partBuilds && partBuilds[comp.id]);
      return transformPoint(transforms[comp.id], g ? g.center : [0, 0, 0]);
    }

    // prepare mates: resolve local refs, check kinds
    var prepared = [];
    model.mates.forEach(function (m) {
      if (m.suppressed) { mateOut[m.id] = { ok: true, residual: 0, error: null, suppressed: true }; return; }
      var pm = { mate: m, id: m.id, type: m.type, sign: alignSign(m), target: gapTarget(m), kL: null };
      try {
        if (MATE_TYPES.indexOf(m.type) < 0) throw new Error('Unknown mate type "' + m.type + '"');
        if (m.type === 'distance' && !(isFinite(+m.distance) && +m.distance >= 0)) throw new Error('Distance must be a number ≥ 0');
        if (m.type === 'angle' && !(isFinite(+m.angle) && +m.angle >= 0 && +m.angle <= 180)) throw new Error('Angle must be between 0° and 180°');
        if (m.type === 'coincident' && m.offset != null && !(isFinite(+m.offset) && +m.offset >= 0)) throw new Error('Offset must be a number ≥ 0');
        pm.A = localRef(model, partBuilds, m.a);
        pm.B = localRef(model, partBuilds, m.b);
        pm.pair = (pm.A.kind === 'plane' ? 'p' : 'a') + (pm.B.kind === 'plane' ? 'p' : 'a');
        if (m.type === 'coincident' && pm.pair !== 'pp') throw new Error('Coincident needs two planar faces or planes');
        if (m.type === 'concentric' && pm.pair !== 'aa') throw new Error('Concentric needs two cylindrical faces or axes');
        // Distance / Limit Distance: between two planes, or between two cylinders (axes: centre distance)
        if ((m.type === 'distance' || m.type === 'limitdistance') && pm.pair !== 'pp' && pm.pair !== 'aa')
          throw new Error((m.type === 'distance' ? 'Distance' : 'Limit Distance') + ' needs two planar faces or planes, or two cylindrical faces or axes');
        if (m.type === 'tangent') {
          var ra = pm.A.refKind === 'cylinder' ? pm.A.radius : null, rb = pm.B.refKind === 'cylinder' ? pm.B.radius : null;
          if ((ra == null && rb == null) || pm.pair === 'pp') throw new Error('Tangent needs a cylindrical face and a planar or cylindrical face');
          if (pm.pair === 'aa') pm.target = m.flip ? Math.abs((ra || 0) - (rb || 0)) : (ra || 0) + (rb || 0);
          else { var r = pm.A.kind === 'axis' ? ra : rb; pm.target = m.flip ? -r : r; }
        }
        if (m.type === 'distance' && pm.pair === 'aa') pm.target = +m.distance;
        if (m.type === 'limitdistance' || m.type === 'limitangle') {
          var hiLim = m.type === 'limitangle' ? 180 : Infinity, nm = m.type === 'limitangle' ? 'Limit Angle' : 'Limit Distance';
          if (!(isFinite(+m.min) && isFinite(+m.max) && +m.min >= 0 && +m.max >= +m.min && +m.max <= hiLim))
            throw new Error(nm + ' needs 0 ≤ minimum ≤ maximum' + (m.type === 'limitangle' ? ' ≤ 180°' : ''));
        }
        if (m.type === 'width') {
          if (!m.a2 || (pm.B.kind === 'plane' && !m.b2)) throw new Error('Width needs two width faces and two tab faces (or one cylindrical tab)');
          pm.A2 = localRef(model, partBuilds, m.a2);
          if (m.b2) pm.B2 = localRef(model, partBuilds, m.b2);
          if (pm.A.kind !== 'plane' || pm.A2.kind !== 'plane' || (pm.B2 && pm.B2.kind !== 'plane')) throw new Error('Width needs two width faces and two tab faces (or one cylindrical tab)');
          if (pm.A2.comp !== pm.A.comp || (pm.B2 && pm.B2.comp !== pm.B.comp)) throw new Error('Width: both width faces must be on one component, both tab faces on another');
          if (len(cross(pm.A.normal, pm.A2.normal)) > 1e-6 || (pm.B2 && len(cross(pm.B.normal, pm.B2.normal)) > 1e-6)) throw new Error('Width: each pair of faces must be parallel');
        }
        if (m.type === 'gear') {
          if (pm.pair !== 'aa') throw new Error('Gear needs a cylindrical face or axis on each of two components');
          if (!pm.A.comp || !pm.B.comp || pm.A.comp === pm.B.comp) throw new Error('Gear needs two rotating components');
          var ratio = m.ratio || [1, 1];
          if (!(isFinite(+ratio[0]) && isFinite(+ratio[1]) && +ratio[0] > 0 && +ratio[1] > 0)) throw new Error('Gear ratio must be two numbers > 0');
          pm.ratio = +ratio[0] / +ratio[1];
        }
        if (m.type === 'angle') pm.target = angleTarget(m);
      } catch (e) {
        mateOut[m.id] = { ok: false, residual: null, error: e.message || String(e) };
        return;
      }
      pm.ca = pm.A.comp; pm.cb = pm.B.comp;
      // 'closest' alignment: the sign the two directions have now (Width: the width normal and the tab normal)
      if (pm.sign === 0) {
        var wa = worldOf(pm.A, pm.ca ? transforms[pm.ca.id] : null), wb = worldOf(pm.B, pm.cb ? transforms[pm.cb.id] : null);
        pm.sign = dot(dirOf(wa), dirOf(wb)) < -1e-9 ? -1 : 1;
        // (an Angle keeps the sense it starts with: its signed angle is measured from it)
        if (pm.type !== 'angle' && pm.type !== 'limitangle') pm.closest = true;
      }
      if (pm.type === 'gear') {
        // the phase is the two components' turns when the mate is first solved; it is stored with the mate
        if (!(m.phase && m.phase.length === 2 && isFinite(+m.phase[0]) && isFinite(+m.phase[1]))) {
          m.phase = [axisTurn(worldOf(pm.A, transforms[pm.ca.id])) * 180 / Math.PI, axisTurn(worldOf(pm.B, transforms[pm.cb.id])) * 180 / Math.PI];
        }
        pm.phase = [+m.phase[0] * Math.PI / 180, +m.phase[1] * Math.PI / 180];
      }
      pm.rigid = (pm.ca && pm.cb && pm.ca === pm.cb) || (!movable(pm.ca) && !movable(pm.cb));
      if (pm.type === 'angle' || pm.type === 'limitangle') setAngleAxis(pm, null);
      prepared.push(pm);
    });

    // An Angle mate's axis k is fixed for the solve and rides with A's component (kL is in A's local frame, or world).
    // k is the line normal to both directions when the mate is placed, with its sign made canonical, so re-solving a
    // solved assembly measures the same signed angle; when the directions are parallel it is the hinge axis earlier
    // mates left the moving component (lockAxis), else any normal to A's direction.
    function angleAxisWorld(pm, T) {
      T = T || transforms;
      return pm.ca ? transformDir(T[pm.ca.id], pm.kL) : pm.kL.slice();
    }
    function setAngleAxis(pm, lockAxis) {
      var Aw = worldOf(pm.A, pm.ca ? transforms[pm.ca.id] : null), Bw = worldOf(pm.B, pm.cb ? transforms[pm.cb.id] : null);
      var a = dirOf(Aw), b = scale(dirOf(Bw), pm.sign), c = cross(a, b), k;
      if (lockAxis && Math.abs(dot(lockAxis, a)) < 1e-6 && (len(c) < 1e-6 || len(cross(c, lockAxis)) < 1e-6 * len(c))) k = canonicalDir(norm(lockAxis));
      else if (len(c) > 1e-9) k = canonicalDir(norm(c));
      else k = canonicalDir(lockAxis && Math.abs(dot(lockAxis, a)) < 1e-6 ? norm(lockAxis) : perpTo(a));
      pm.kL = pm.ca ? matTVec(transforms[pm.ca.id].rotation, k) : k;
    }

    function residualOf(pm, T) {
      T = T || transforms;
      var Aw = worldOf(pm.A, pm.ca ? T[pm.ca.id] : null), Bw = worldOf(pm.B, pm.cb ? T[pm.cb.id] : null);
      // 'closest' alignment holds either sense: whichever the two directions have now, so a later mate may still turn
      // the component over (a roller made Perpendicular to a face, then its end face Coincident with that face)
      if (pm.closest) pm.sign = dot(dirOf(Aw), dirOf(Bw)) < 0 ? -1 : 1;
      return mateResidual(pm, Aw, Bw, pm.kL ? angleAxisWorld(pm, T) : null,
        pm.A2 ? worldOf(pm.A2, pm.ca ? T[pm.ca.id] : null) : null, pm.B2 ? worldOf(pm.B2, pm.cb ? T[pm.cb.id] : null) : null);
    }

    // ---- greedy placement of one mate: rotate then translate the component being brought to the other side
    var locks = {}, grounded = {};
    comps.forEach(function (c) { locks[c.id] = { axis: null, point: null, full: false, trans: [] }; if (c.fixed) grounded[c.id] = true; });
    function lockTrans(L, d) {
      d = d.slice();
      L.trans.forEach(function (t) { d = sub(d, scale(t, dot(d, t))); });
      if (len(d) > 1e-6 && L.trans.length < 3) L.trans.push(norm(d));
    }
    function rotateAbout(id, R, pivot) {
      var T = transforms[id];
      transforms[id] = { rotation: matMul(R, T.rotation), position: add(matVec(R, sub(T.position, pivot)), pivot) };
    }
    function moverIsB(pm) {
      var aMov = movable(pm.ca), bMov = movable(pm.cb);
      if (!aMov) return true;
      if (!bMov) return false;
      var hs = hubSet();   // r5/asm5: the hub of a floating cluster stays still, the component mated to it moves
      if (hs[pm.ca.id] && !hs[pm.cb.id]) return true;
      if (hs[pm.cb.id] && !hs[pm.ca.id]) return false;
      if (grounded[pm.ca.id] && !grounded[pm.cb.id]) return true;
      if (grounded[pm.cb.id] && !grounded[pm.ca.id]) return false;
      return true;
    }
    // Angle mate: turn the moving component about the angle axis k (its hinge, when earlier mates left one) until the
    // signed angle reaches the target; a hinged component is then fully oriented.
    function greedyAngle(pm) {
      var moveB = moverIsB(pm), C = moveB ? pm.cb : pm.ca, oc = moveB ? pm.ca : pm.cb, L = locks[C.id];
      if (!L.full) {
        var k = angleAxisWorld(pm), ax = L.axis && len(cross(L.axis, k)) < 1e-6 ? L.axis : k;
        var err = residualOf(pm)[0];
        if (Math.abs(err) > TOL_DONE) {
          // turning B by +t about k raises the angle by t, turning A by +t lowers it
          var t = (moveB ? -err : err) * (dot(ax, k) < 0 ? -1 : 1);
          var mw = worldOf(moveB ? pm.B : pm.A, transforms[C.id]);
          rotateAbout(C.id, rotVec(scale(ax, t)), ax === L.axis ? L.point : mw.point);
        }
        if (L.axis && pm.type === 'angle') L.full = true;   // a Limit Angle leaves the turn free inside its range
      }
      if (!oc || grounded[oc.id]) grounded[C.id] = true;
    }
    // Turn direction u (about `axis` when given, else about u × t) so that u · t = 0; null when it cannot.
    function perpRotation(u, t, axis) {
      if (!axis) {
        var ax = cross(u, t), sn = len(ax), c = dot(u, t);
        if (sn < 1e-12) return c === 0 ? null : rotVec(scale(perpTo(u), Math.PI / 2));
        return rotVec(scale(ax, (Math.atan2(sn, c) - Math.PI / 2) / sn));
      }
      // u(φ) · t = p + q cos φ + r sin φ with u = u∥ + u⊥ turned about the axis
      var up = scale(axis, dot(u, axis)), uq = sub(u, up), ur = cross(axis, uq);
      var P = dot(up, t), Q = dot(uq, t), Rr = dot(ur, t), A = Math.sqrt(Q * Q + Rr * Rr);
      if (A < 1e-12 || Math.abs(P) > A) return null;
      var base = Math.atan2(Rr, Q), d = Math.acos(-P / A), f1 = base + d, f2 = base - d;
      var phi = Math.abs(wrapAngle(f1)) < Math.abs(wrapAngle(f2)) ? wrapAngle(f1) : wrapAngle(f2);
      return Math.abs(phi) > 1e-15 ? rotVec(scale(axis, phi)) : null;
    }
    // Rotation turning u onto t (about L's hinge axis when earlier mates left one), or null.
    function alignRotation(u, t, L) {
      if (!L.axis) {
        var ax = cross(u, t), sn = len(ax), c = dot(u, t);
        if (sn > 1e-12) return rotVec(scale(ax, Math.atan2(sn, c) / sn));
        return c < 0 ? rotVec(scale(perpTo(u), Math.PI)) : null;
      }
      var a = L.axis, up = sub(u, scale(a, dot(u, a))), tp = sub(t, scale(a, dot(t, a)));
      if (len(up) < 1e-9 || len(tp) < 1e-9) return null;
      var ang = Math.atan2(dot(a, cross(up, tp)), dot(up, tp));
      return Math.abs(ang) > 1e-15 ? rotVec(scale(a, ang)) : null;
    }
    // Greedy placement for Parallel, Perpendicular, Tangent, Width, Gear, Limit Distance and Distance between cylinders:
    // turn the moving component so the directions satisfy the mate, then slide it to the distance / mid-plane it holds.
    function greedyMore(pm) {
      var moveB = moverIsB(pm), C = moveB ? pm.cb : pm.ca, oc = moveB ? pm.ca : pm.cb, L = locks[C.id];
      var mine = moveB ? pm.B : pm.A, other = moveB ? pm.A : pm.B;
      function W(lr, comp) { return worldOf(lr, comp ? transforms[comp.id] : null); }
      if (pm.type === 'gear') {
        var err = residualOf(pm)[0], Mg = W(mine, C);
        if (Math.abs(err) > TOL_DONE) {
          // B's turn enters with weight 1, A's with ±ratio
          var t = moveB ? -err : -err / ((pm.mate.flip ? -1 : 1) * pm.ratio);
          rotateAbout(C.id, rotVec(scale(Mg.dir, t)), Mg.point);
        }
        if (L.axis && len(cross(L.axis, Mg.dir)) < 1e-6) L.full = true;
        if (!oc || grounded[oc.id]) grounded[C.id] = true;
        return;
      }
      var same = pm.pair === 'pp' || pm.pair === 'aa';
      // which direction condition: 'align' (u = ±t) or 'perp' (u · t = 0)
      var rot = pm.type === 'perpendicular' ? (same ? 'perp' : 'align') : pm.type === 'parallel' ? (same ? 'align' : 'perp')
        : pm.type === 'width' ? (pm.B.kind === 'axis' ? 'perp' : 'align') : same ? 'align' : 'perp';
      var dirRef = pm.type === 'width' ? (moveB ? pm.B : pm.A) : mine, dirOther = pm.type === 'width' ? (moveB ? pm.A : pm.B) : other;
      if (!L.full && vnorm(residualOf(pm)) > TOL_DONE) {
        var M = W(dirRef, C), O = W(dirOther, oc), u = dirOf(M), tt = dirOf(O), R = null;
        if (rot === 'align') R = alignRotation(u, scale(tt, pm.sign || 1), L);
        else R = perpRotation(u, tt, L.axis);
        if (R) rotateAbout(C.id, R, L.axis ? L.point : M.point);
      }
      // translation along the one direction the mate measures
      var A = W(pm.A, pm.ca), B = W(pm.B, pm.cb), e = null, amount = 0, lockIt = pm.type !== 'limitdistance';
      if (pm.type === 'width') {
        var A2 = W(pm.A2, pm.ca), mid = scale(add(A.point, A2.point), 0.5);
        var midB = pm.B2 ? scale(add(B.point, W(pm.B2, pm.cb).point), 0.5) : B.point;
        e = A.normal; amount = -dot(sub(midB, mid), e);                   // move the tab (B) by amount along e
      } else if (pm.type === 'distance' || pm.type === 'tangent' || pm.type === 'limitdistance') {
        var v = distValue(pm, A, B), target = pm.target;
        if (pm.type === 'limitdistance') { var rg = limitRange(pm, false); target = Math.min(rg[1], Math.max(rg[0], v)); }
        if (pm.pair === 'pp') { e = A.normal; amount = target - v; }
        else if (pm.pair === 'aa') {
          var dv = sub(B.point, A.point), pp = sub(dv, scale(A.dir, dot(dv, A.dir)));
          e = len(pp) > 1e-9 ? norm(pp) : perpTo(A.dir); amount = target - v;
        } else {
          var P = pm.pair === 'pa' ? A : B;
          e = P.normal; amount = (target - v) * (pm.pair === 'pa' ? 1 : -1);  // B is the axis in 'pa', the plane in 'ap'
        }
      }
      if (e && Math.abs(amount) > TOL_DONE) {
        var delta = scale(e, moveB ? amount : -amount);
        L.trans.forEach(function (tr) { delta = sub(delta, scale(tr, dot(delta, tr))); });
        transforms[C.id].position = add(transforms[C.id].position, delta);
      }
      // what this mate locks on the moved component
      if (rot === 'align') {
        var Mw = W(dirRef, C), dir = dirOf(Mw);
        if (!L.axis) { L.axis = dir.slice(); L.point = Mw.point.slice(); }
        else if (len(cross(L.axis, dir)) > 1e-6) L.full = true;
      }
      if (e && lockIt) lockTrans(L, e);
      if (!oc || grounded[oc.id]) grounded[C.id] = true;
    }
    var MORE = { parallel: 1, perpendicular: 1, tangent: 1, width: 1, gear: 1, limitdistance: 1 };
    function greedy(pm) {
      if (pm.rigid) return;
      if (pm.type === 'angle' || pm.type === 'limitangle') { greedyAngle(pm); return; }
      if (MORE[pm.type] || (pm.type === 'distance' && pm.pair === 'aa')) { greedyMore(pm); return; }
      var moveB = moverIsB(pm);
      var C = moveB ? pm.cb : pm.ca, mine = moveB ? pm.B : pm.A, other = moveB ? pm.A : pm.B;
      var oc = moveB ? pm.ca : pm.cb, L = locks[C.id];
      if (L.full && L.trans.length === 3) { /* fully placed by earlier mates: leave it to the solver */ }
      else if (vnorm(residualOf(pm)) > TOL_DONE) {
        var O = worldOf(other, oc ? transforms[oc.id] : null);
        var M = worldOf(mine, transforms[C.id]);
        var u = M.normal || M.dir, t = scale(O.normal || O.dir, pm.sign);
        // rotation: bring my direction onto the target direction
        if (!L.full) {
          var R = null, pivot = M.point;
          if (!L.axis) {
            var ax = cross(u, t), s = len(ax), c = dot(u, t);
            if (s > 1e-12) R = rotVec(scale(ax, Math.atan2(s, c) / s));
            else if (c < 0) { var perp = norm(cross(u, Math.abs(u[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); R = rotVec(scale(perp, Math.PI)); }
          } else {
            var a = L.axis, up = sub(u, scale(a, dot(u, a))), tp = sub(t, scale(a, dot(t, a)));
            if (len(up) > 1e-9 && len(tp) > 1e-9) {
              var ang = Math.atan2(dot(a, cross(up, tp)), dot(up, tp));
              if (Math.abs(ang) > 1e-15) R = rotVec(scale(a, ang));
            }
            pivot = L.point;
          }
          if (R) rotateAbout(C.id, R, pivot);
          M = worldOf(mine, transforms[C.id]);
        }
        // translation: close the gap (to its target), keeping directions earlier mates locked
        var delta;
        if (pm.type !== 'concentric') {
          var nA = moveB ? O.normal : M.normal, g = dot(sub(moveB ? M.point : O.point, moveB ? O.point : M.point), nA);
          delta = scale(nA, moveB ? pm.target - g : g - pm.target);
        } else { var v = sub(O.point, M.point); delta = sub(v, scale(O.dir, dot(v, O.dir))); }
        L.trans.forEach(function (tr) { delta = sub(delta, scale(tr, dot(delta, tr))); });
        transforms[C.id].position = add(transforms[C.id].position, delta);
      }
      // record what this mate locks on the moved component
      var Mw = worldOf(mine, transforms[C.id]), dir = Mw.normal || Mw.dir;
      if (!L.axis) { L.axis = dir.slice(); L.point = Mw.point.slice(); }
      else if (len(cross(L.axis, dir)) > 1e-6) L.full = true;
      if (pm.type !== 'concentric') lockTrans(L, dir);
      else { var e1 = norm(cross(dir, Math.abs(dir[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])); lockTrans(L, e1); lockTrans(L, cross(dir, e1)); }
      if (!oc || grounded[oc.id]) grounded[C.id] = true;
    }

    // ---- Levenberg–Marquardt over the active mates (numeric Jacobian)
    function unknowns(active) {
      var ids = [], seen = {};
      active.forEach(function (pm) {
        [pm.ca, pm.cb].forEach(function (c) { if (movable(c) && !seen[c.id]) { seen[c.id] = true; ids.push(c.id); } });
      });
      return ids;
    }
    // ex (a drag, below): the mate rows weighted by ex.w and ex.extra(T)'s rows appended
    // groupsOf(mates, only?) -> the mates split into independent groups: linked through the floating components they
    // move (fixed components, the world and pattern instances do not link). With `only` (a mate): just its group.
    function groupsOf(list, only) {
      var parent = {};
      function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
      function key(pm) { var c = movable(pm.ca) ? pm.ca : movable(pm.cb) ? pm.cb : null; return c ? find(String(c.id)) : 'm' + pm.id; }
      list.forEach(function (pm) {
        var ks = [pm.ca, pm.cb].filter(movable).map(function (c) { var k = String(c.id); if (!(k in parent)) parent[k] = k; return find(k); });
        if (ks.length === 2 && ks[0] !== ks[1]) parent[ks[0]] = ks[1];
      });
      var out = {}, order = [];
      list.forEach(function (pm) { var k = key(pm); if (!out[k]) { out[k] = []; order.push(k); } out[k].push(pm); });
      if (only) { var ko = key(only); return [out[ko] || [only]]; }
      return order.map(function (k) { return out[k]; });
    }
    function evalAll(active, T, ex) {
      var r = [], w = ex ? ex.w : 1;
      active.forEach(function (pm) { var q = residualOf(pm, T); for (var i = 0; i < q.length; i++) r.push(w * q[i]); });
      if (ex) { var e = ex.extra(T); for (var j = 0; j < e.length; j++) r.push(e[j]); }
      return r;
    }
    function applyX(ids, piv, x) {
      var T = {};
      comps.forEach(function (c) { T[c.id] = transforms[c.id]; });
      ids.forEach(function (id, j) { T[id] = perturb(transforms[id], piv[id], x, 6 * j); });
      return T;
    }
    function jacobian(active, ids, piv, ex) {
      var n = ids.length * 6, x = [], cols = [], h = 1e-6, k;
      for (k = 0; k < n; k++) x.push(0);
      for (k = 0; k < n; k++) {
        x[k] = h; var rp = evalAll(active, applyX(ids, piv, x), ex);
        x[k] = -h; var rm = evalAll(active, applyX(ids, piv, x), ex);
        x[k] = 0;
        cols.push(rp.map(function (v, i) { return (v - rm[i]) / (2 * h); }));
      }
      return cols; // cols[k][row]
    }
    function cost(r) { var s = 0; for (var i = 0; i < r.length; i++) s += r[i] * r[i]; return s; }
    // r5/asm5: a large cluster of floating components mated only to each other (a Flexible sub-assembly that is not
    // mated in the assembly yet, an assembly with nothing fixed) can move as a whole, so its rigid motion is free: the
    // solver holds its hub (the component most mates reference) still and solves each component mated to it on its
    // own, instead of one Levenberg–Marquardt / null space over every component of it (30 pins in a floating flexible
    // sub-assembly: 0.3–16 s per solve -> a few ms). Smaller clusters (< FREE_HUB components) are solved as before.
    // The hubs are chosen once per solve from every mate, so a hub stays still from the first mate on.
    var FREE_HUB = 6, hubs = null;
    function hubSet() {
      if (!hubs) {
        hubs = {};
        groupsOf(prepared.filter(function (pm) { return !pm.rigid; })).forEach(function (g) {
          var ids = unknowns(g), count = {}, best = null;
          if (ids.length < FREE_HUB || !g.every(function (pm) { return movable(pm.ca) && movable(pm.cb); })) return;   // grounded: a fixed component, an instance or the world
          g.forEach(function (pm) { count[pm.ca.id] = (count[pm.ca.id] || 0) + 1; count[pm.cb.id] = (count[pm.cb.id] || 0) + 1; });
          ids.forEach(function (id) { if (best == null || count[id] > count[best]) best = id; });
          hubs[best] = true;
        });
      }
      return hubs;
    }
    function freeHub(active) {
      var hub = null;
      hubSet();
      for (var i = 0; i < active.length; i++) {
        var pm = active[i];
        if (!movable(pm.ca) || !movable(pm.cb)) return null;
        if (hubs[pm.ca.id]) hub = pm.ca.id; else if (hubs[pm.cb.id]) hub = pm.cb.id;
      }
      return hub;
    }
    function lm(active, ex, only) {   // only: just the part of a floating cluster this mate links (the rest is solved)
      if (!ex) {
        var hub = freeHub(active);
        if (hub != null) {
          held[hub] = true;
          try { (only ? groupsOf(active, only) : groupsOf(active)).forEach(function (g) { lm(g); }); } finally { delete held[hub]; }
          return;
        }
      }
      var ids = ex ? ex.ids : unknowns(active);
      if (!ids.length) return;
      var lambda = 1e-3, iters = ex ? ex.iters : 200;
      for (var iter = 0; iter < iters; iter++) {
        var r = evalAll(active, transforms, ex), f = cost(r);
        if (f < (opts && opts.quick ? 1e-20 : 1e-26)) return;   // (r5/asm5: a drag frame stops at 1e-10, the release solves exactly)
        var piv = {};
        ids.forEach(function (id) { piv[id] = pivotOf(findComponent(model, id)); });
        var J = jacobian(active, ids, piv, ex), n = J.length, i, j, k;
        var JtJ = [], g = [], maxd = 0;
        for (i = 0; i < n; i++) {
          JtJ.push([]);
          var gi = 0;
          for (k = 0; k < r.length; k++) gi += J[i][k] * r[k];
          g.push(-gi);
          for (j = 0; j < n; j++) { var s = 0; for (k = 0; k < r.length; k++) s += J[i][k] * J[j][k]; JtJ[i].push(s); }
          if (JtJ[i][i] > maxd) maxd = JtJ[i][i];
        }
        var improved = false;
        while (lambda < 1e14) {
          var A = JtJ.map(function (row, ii) { var rr = row.slice(); rr[ii] += lambda * (row[ii] + 1e-9 * Math.max(maxd, 1e-12)); return rr; });
          var dx = solveLinear(A, g);
          if (dx) {
            var Tn = applyX(ids, piv, dx), fn = cost(evalAll(active, Tn, ex));
            if (fn < f) {
              ids.forEach(function (id) { transforms[id] = Tn[id]; });
              lambda = Math.max(lambda * 0.2, 1e-15);
              improved = true;
              if (f - fn < (ex ? 1e-10 : 1e-16) * f && fn > 1e-20) return; // stalled at a non-zero minimum
              break;
            }
          }
          lambda *= 10;
        }
        if (!improved) return;
      }
    }

    // ---- drag (SolidWorks' free drag of an under-defined component): opts.drag = { id, point (local, the grabbed point
    // on the component), target (world) }. The component was first slid so the point sits on the target; once the mates
    // are solved the grabbed point is pulled as close to the target as the free degrees of freedom allow (mates weighted
    // far above the pull, then polished exactly), moving the components mated to it (a linkage follows its crank).
    function dragTo(d) {
      var c0 = findComponent(model, d.id);
      if (!movable(c0) || !d.point || !d.target) return;
      // r5/asm5: in a large floating cluster the dragged component first moves as far as its mates to the hub let it
      // (the hub held), then the whole cluster follows the rest of the pull (a translation keeps every mate)
      var linked = active.filter(function (pm) { return pm.ca === c0 || pm.cb === c0; });
      var cl = linked.length ? groupsOf(active, linked[0])[0] : [], hub = cl.length ? freeHub(cl) : null;
      if (hub != null) {
        if (hub !== c0.id) { held[hub] = true; try { dragTo(d); } finally { delete held[hub]; } }
        var rest = sub(copy3(d.target), transformPoint(transforms[c0.id], copy3(d.point)));
        unknowns(cl).forEach(function (id) { var T = transforms[id]; transforms[id] = { rotation: T.rotation, position: add(T.position, rest) }; });
        return;
      }
      // the components reached from the dragged one through accepted mates (fixed ones stop the walk)
      var inGroup = {}, queue = [c0.id], group = [];
      inGroup[c0.id] = true;
      while (queue.length) {
        var id = queue.shift();
        group.push(id);
        active.forEach(function (pm) {
          if (!((pm.ca && pm.ca.id === id) || (pm.cb && pm.cb.id === id))) return;
          [pm.ca, pm.cb].forEach(function (c) { if (movable(c) && !inGroup[c.id]) { inGroup[c.id] = true; queue.push(c.id); } });
        });
      }
      var mates = active.filter(function (pm) { return (pm.ca && inGroup[pm.ca.id]) || (pm.cb && inGroup[pm.cb.id]); });
      var pt = copy3(d.point), tg = copy3(d.target);
      // Gauss–Newton on the pull restricted to the free motions (the null space of the mates' Jacobian, so to first
      // order the step keeps every mate), then the mates made exact again (the least motion), with step halving when
      // the pull does not improve. A pull the mates cannot follow (out of the plane a face mate holds) is left.
      var ex = { ids: group, w: 1, extra: function (T) { return sub(transformPoint(T[c0.id], pt), tg); } };
      function pull() { return vnorm(ex.extra(transforms)); }
      function snapAll() { var s = {}; comps.forEach(function (c) { s[c.id] = transforms[c.id]; }); return s; }
      var cur = pull();
      var quick = !!(opts && opts.quick);   // a drag frame (r3/assembly3): a micron is close enough, the release solves exactly
      for (var it = 0; it < 40 && cur > (quick ? 1e-4 : 1e-9); it++) {
        var piv = {};
        group.forEach(function (id) { piv[id] = pivotOf(findComponent(model, id)); });
        var n = group.length * 6, i, j, k, N = [];
        if (mates.length) {
          var Jm = jacobian(mates, group, piv), M = [], maxe = 0;
          for (i = 0; i < n; i++) { M.push([]); for (j = 0; j < n; j++) { var s = 0; for (k = 0; k < Jm[i].length; k++) s += Jm[i][k] * Jm[j][k]; M[i].push(s); } }
          var eg = eigSym(M);
          eg.values.forEach(function (v) { if (v > maxe) maxe = v; });
          eg.values.forEach(function (v, q) { if (v <= 1e-10 * Math.max(maxe, 1e-30)) N.push(eg.vectors[q]); });
        } else for (i = 0; i < n; i++) { var e = []; for (j = 0; j < n; j++) e.push(i === j ? 1 : 0); N.push(e); }
        if (!N.length) return;
        // the pull's Jacobian along the free motions: B = Jd · N (3 × q); y = (BᵀB + ε)⁻¹ (−Bᵀ rd), dx = N y
        var Jd = jacobian([], group, piv, ex), rd = ex.extra(transforms), q = N.length, B = [], H = [], h = [], tr = 0;
        for (var row = 0; row < 3; row++) { B.push([]); for (var a = 0; a < q; a++) { var sb = 0; for (k = 0; k < n; k++) sb += Jd[k][row] * N[a][k]; B[row].push(sb); } }
        for (i = 0; i < q; i++) {
          H.push([]);
          h.push(-(B[0][i] * rd[0] + B[1][i] * rd[1] + B[2][i] * rd[2]));
          for (j = 0; j < q; j++) H[i].push(B[0][i] * B[0][j] + B[1][i] * B[1][j] + B[2][i] * B[2][j]);
          tr += H[i][i];
        }
        for (i = 0; i < q; i++) H[i][i] += 1e-12 * tr + 1e-15;
        var y = solveLinear(H, h);
        if (!y) return;
        var dx = [];
        for (k = 0; k < n; k++) { var sx = 0; for (i = 0; i < q; i++) sx += N[i][k] * y[i]; dx.push(sx); }
        var saved = snapAll(), step = 1, better = false, now = cur;
        for (var ls = 0; ls < 8 && !better; ls++) {
          var Tn = applyX(group, piv, dx.map(function (v) { return v * step; }));
          group.forEach(function (id) { transforms[id] = Tn[id]; });
          lm(mates);   // (only the dragged group moved)
          now = pull();
          if (now < cur - 1e-12) better = true;
          else { comps.forEach(function (c) { transforms[c.id] = saved[c.id]; }); step *= 0.5; }
        }
        if (!better) return;
        var gain = cur - now;
        cur = now;
        if (gain < (quick ? 1e-5 : 1e-7) * Math.max(cur, 1e-9)) return;
      }
    }

    // ---- incremental solve: add mates one at a time; a mate that cannot be met with the earlier ones is rejected
    var active = [];
    prepared.forEach(function (pm) {
      if (pm.rigid) {
        var res = vnorm(residualOf(pm));
        mateOut[pm.id] = res <= TOL_OK ? { ok: true, residual: res, error: null }
          : { ok: false, residual: res, error: (pm.ca && pm.ca === pm.cb) ? 'Both references are on ' + pm.ca.name + ' and do not coincide'
            : 'Mate cannot be satisfied: both references are fixed' };
        return;
      }
      var snapT = {}, snapLocks = JSON.stringify(locks), snapG = JSON.stringify(grounded);
      comps.forEach(function (c) { snapT[c.id] = transforms[c.id]; });
      if (pm.type === 'angle' || pm.type === 'limitangle') { var mv = moverIsB(pm) ? pm.cb : pm.ca; setAngleAxis(pm, locks[mv.id].full ? null : locks[mv.id].axis); }
      var trial = active.concat([pm]);
      function attempt() {
        greedy(pm);
        lm(groupsOf(trial, pm)[0], null, pm);   // only the mates linked to this one can move (r5/asm5: in a floating cluster, only those its hub does not hold)
        var worst = 0;
        trial.forEach(function (q) { worst = Math.max(worst, vnorm(residualOf(q))); });
        return worst <= TOL_OK;
      }
      function undo() {
        comps.forEach(function (c) { transforms[c.id] = snapT[c.id]; });
        locks = JSON.parse(snapLocks); grounded = JSON.parse(snapG);
      }
      if (attempt()) { active = trial; return; }
      // Earlier mates ('closest' ones, or ones the component meets either way round) may have left the moving component
      // facing the wrong way for this one, and turning it over (half a turn) is a saddle the least-squares refinement
      // cannot leave: try it turned half a turn about the direction it is locked to and about either axis normal to it,
      // before rejecting the mate (Flip Mate Alignment relies on this too).
      undo();
      var mov = moverIsB(pm) ? pm.cb : pm.ca;
      var flippable = movable(mov) && locks[mov.id].axis;
      if (flippable) {
        var ax0 = locks[mov.id].axis, p1 = perpTo(ax0), flips = [ax0, p1, cross(ax0, p1)];
        for (var fi = 0; fi < flips.length; fi++) {
          var Rf = rotVec(scale(flips[fi], Math.PI)), pv = pivotOf(mov), Lf = locks[mov.id];
          rotateAbout(mov.id, Rf, pv);
          Lf.axis = matVec(Rf, Lf.axis);
          if (Lf.point) Lf.point = add(matVec(Rf, sub(Lf.point, pv)), pv);
          if (attempt()) { active = trial; return; }
          undo();
        }
      }
      // reject: the placement before this mate stays
      mateOut[pm.id] = { ok: false, residual: vnorm(residualOf(pm)), error: 'Mate cannot be satisfied (over-defined or conflicting)' };
    });
    // final polish over all accepted mates (each independent group of components on its own)
    groupsOf(active).forEach(function (g) { lm(g); });
    if (opts && opts.drag) dragTo(opts.drag);
    active.forEach(function (pm) {
      var res = vnorm(residualOf(pm));
      mateOut[pm.id] = res <= TOL_OK ? { ok: true, residual: res, error: null } : { ok: false, residual: res, error: 'Mate cannot be satisfied (over-defined or conflicting)' };
    });

    // ---- degrees of freedom: motions of each component left free by the accepted mates (null space of J projected
    // onto the component's 6 unknowns), so a part mated to an under-defined part is under-defined too
    var dofs = {};
    comps.forEach(function (c) { dofs[c.id] = c.fixed || c.pattern != null ? 0 : 6; });
    // Limit Distance / Limit Angle remove nothing: inside their range the component still moves
    var holding = active.filter(function (pm) { return pm.type !== 'limitdistance' && pm.type !== 'limitangle'; });
    // components that share no mate (through floating components) are independent: one small null space per group
    // instead of one over every component (30 pinned pins: ~100 ms -> a few ms per rebuild)
    if (!(opts && opts.quick)) groupsOf(holding).forEach(function (grp) { dofOf(grp); });   // (a drag frame shows placements only)
    function dofOf(holding) {
      var ids = unknowns(holding);
      // r5/asm5: a cluster mated only to itself moves as a whole: every component in it has all 6 free (no null space)
      if (ids.length && holding.every(function (pm) { return movable(pm.ca) && movable(pm.cb); })) { ids.forEach(function (id) { dofs[id] = 6; }); return; }
      if (ids.length) {
        var piv = {};
        ids.forEach(function (id) { piv[id] = pivotOf(findComponent(model, id)); });
        var J = jacobian(holding, ids, piv), n = J.length, JtJ = [], i, j, k, maxe = 0;
        for (i = 0; i < n; i++) { JtJ.push([]); for (j = 0; j < n; j++) { var s = 0; for (k = 0; k < J[i].length; k++) s += J[i][k] * J[j][k]; JtJ[i].push(s); } }
        var eg = eigSym(JtJ);
        eg.values.forEach(function (v) { if (v > maxe) maxe = v; });
        var nullVecs = [];
        eg.values.forEach(function (v, ii) { if (v <= 1e-10 * Math.max(maxe, 1e-30)) nullVecs.push(eg.vectors[ii]); });
        ids.forEach(function (id, jj) {
          if (!nullVecs.length) { dofs[id] = 0; return; }
          var P = [];
          for (var a = 0; a < 6; a++) {
            P.push([]);
            for (var b = 0; b < 6; b++) {
              var s2 = 0;
              nullVecs.forEach(function (v) { s2 += v[6 * jj + a] * v[6 * jj + b]; });
              P[a].push(s2);
            }
          }
          dofs[id] = eigSym(P).values.filter(function (v) { return v > 1e-7; }).length;
        });
      }
    }
    // over defined (SolidWorks' "(+)"): a floating component a mate that cannot be satisfied tries to move
    var over = {};
    prepared.forEach(function (pm) {
      var r = mateOut[pm.id];
      if (r && r.error) [pm.ca, pm.cb].forEach(function (c) { if (movable(c) && !over[c.id]) over[c.id] = pm.mate.name || String(pm.id); });
    });
    var compOut = comps.map(function (c, idx) {
      var o = { id: c.id, name: c.name, index: idx, fixed: !!c.fixed, dof: dofs[c.id], underDefined: dofs[c.id] > 0, error: null };
      if (c.pattern != null) o.instance = true;
      if (over[c.id]) { o.overDefined = true; o.overMate = over[c.id]; }
      return o;
    });
    return { transforms: transforms, mates: mateOut, components: compOut };
  }

  // ------------------------------------------------------------------ component patterns and Mirror Components
  // A pattern { id, name, type, seeds: [component ids], ... } makes instance components: ordinary entries of
  // model.components carrying { pattern: pattern id, seed: seed id, instance: k } whose transforms are recomputed from
  // the seed's solved transform on every rebuild (seed-driven, as in SolidWorks: move the seed and the instances follow).
  // The solver never moves an instance; mates may reference one (it is then like a fixed component).
  //   linear   { direction: Ref, spacing, count, reverse?, direction2?: Ref, spacing2?, count2?, reverse2? }   LocalLPattern1
  //   circular { axis: Ref, angle, count, equal?, reverse? }  equal: `angle` is the total (360 = full turn)  LocalCirPattern1
  //   mirror   { plane: Ref, oppositeHand? }  a copy placed at the mirror image (proper rotation), or with oppositeHand
  //            the reflected (left-hand) version of the part                                           MirrorComponent1
  // A direction Ref is a face / plane (its normal) or a cylinder / axis (its direction); the axis Ref of a circular
  // pattern must be a cylinder or an axis; the mirror plane a face or plane.
  var PATTERN_BASE = { linear: 'LocalLPattern', circular: 'LocalCirPattern', mirror: 'MirrorComponent' };
  function findPattern(model, idOrName) {
    var list = (model && model.patterns) || [], i;
    for (i = 0; i < list.length; i++) if (list[i].id === idOrName) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === idOrName) return list[i];
    if (typeof idOrName === 'string' && /^\d+$/.test(idOrName)) return findPattern(model, +idOrName);
    return null;
  }
  var PATTERN_KEYS = { linear: ['direction', 'spacing', 'count', 'reverse', 'direction2', 'spacing2', 'count2', 'reverse2'],
    circular: ['axis', 'angle', 'count', 'equal', 'reverse'], mirror: ['plane', 'oppositeHand'] };
  // setPatternValues(model, p, opts): copy the keys of p.type from opts (refs normalised, numbers as numbers)
  function setPatternValues(model, p, opts) {
    (PATTERN_KEYS[p.type] || []).forEach(function (k) {
      if (opts[k] === undefined) return;
      if (opts[k] === null || opts[k] === false) { delete p[k]; return; }
      if (k === 'direction' || k === 'direction2' || k === 'axis' || k === 'plane') p[k] = normRef(model, opts[k]);
      else if (k === 'reverse' || k === 'reverse2' || k === 'equal' || k === 'oppositeHand') p[k] = true;
      else p[k] = +opts[k];
    });
    if (p.type === 'linear') { if (p.count == null) p.count = 2; if (p.spacing == null) p.spacing = 10; if (!p.direction2) { delete p.spacing2; delete p.count2; delete p.reverse2; } }
    if (p.type === 'circular') { if (p.count == null) p.count = 2; if (p.angle == null) p.angle = p.equal ? 360 : 90; }
    return p;
  }
  // addPattern(model, 'linear' | 'circular' | 'mirror', seeds, opts) -> the pattern (instances are made by syncPatterns)
  function addPattern(model, type, seeds, opts) {
    ensureLists(model);
    if (!model.patterns) model.patterns = [];
    type = String(type || '').toLowerCase();
    if (!PATTERN_BASE[type]) throw new Error('Unknown pattern type "' + type + '"');
    var ids = (Array.isArray(seeds) ? seeds : [seeds]).map(function (x) {
      var c = findComponent(model, x);
      if (!c) throw new Error('Unknown component ' + JSON.stringify(x));
      if (c.pattern != null) throw new Error(c.name + ' is a pattern instance: pattern its seed instead');
      return c.id;
    });
    if (!ids.length) throw new Error('Select the components to pattern');
    opts = opts || {};
    var base = PATTERN_BASE[type];
    var p = { id: model.nextId++, name: opts.name || (base + nextNumber(model.patterns.map(function (x) { return x.name; }), base)), type: type, seeds: ids };
    setPatternValues(model, p, opts);
    model.patterns.push(p);
    syncPatterns(model);
    return p;
  }
  function removePattern(model, id) {
    var p = findPattern(model, id);
    if (!p) return false;
    model.patterns.splice(model.patterns.indexOf(p), 1);
    syncPatterns(model);
    return true;
  }
  function patternCount(p) {
    var n1 = Math.floor(+p.count), n2 = p.type === 'linear' && p.direction2 ? Math.floor(+p.count2 || 1) : 1;
    if (p.type === 'mirror') return 2;
    return isFinite(n1) && n1 >= 1 && isFinite(n2) && n2 >= 1 ? Math.min(n1 * n2, 1000) : 1;
  }
  function baseName(name) { return String(name || 'Part').replace(/<\d+>$/, ''); }
  // Make model.components match the patterns: one instance per seed and per pattern position after the first,
  // appended after the other components; instances of deleted patterns / seeds (and their mates) are removed.
  function syncPatterns(model) {
    ensureLists(model);
    var pats = model.patterns || [], want = {}, have = {};
    pats.forEach(function (p) {
      p.seeds = (p.seeds || []).filter(function (sid) { var c = findComponent(model, sid); return c && c.pattern == null; });
      var n = patternCount(p);
      p.seeds.forEach(function (sid) { for (var k = 1; k < n; k++) want[p.id + ':' + sid + ':' + k] = { p: p, seed: sid, k: k }; });
    });
    var gone = {};
    model.components.forEach(function (c) {
      if (c.pattern == null) return;
      var key = c.pattern + ':' + c.seed + ':' + c.instance;
      if (want[key] && !have[key]) have[key] = c; else gone[c.id] = true;
    });
    if (Object.keys(gone).length) dropComponents(model, gone);
    Object.keys(want).forEach(function (key) {
      var w = want[key], seed = findComponent(model, w.seed), c = have[key];
      if (!c) {
        var base = baseName(seed.name);
        c = { id: model.nextId++, name: base + '<' + nextNumber(model.components.map(function (x) { return x.name; }), base) + '>', source: null, fixed: false,
          transform: tf(seed.transform), pattern: w.p.id, seed: w.seed, instance: w.k };
        model.components.push(c);
      }
      c.source = JSON.parse(JSON.stringify(seed.source));
      c.fixed = false;
      delete c.flexible; delete c.flexState;   // an instance of a sub-assembly moves as one body
    });
    model.patterns = pats.filter(function (p) { return p.seeds.length > 0; });
  }
  function worldRefOf(model, partBuilds, ref, transforms) {
    var lr = localRef(model, partBuilds, ref);
    return worldOf(lr, lr.comp ? transforms[lr.comp.id] || tf(lr.comp.transform) : null);
  }
  // patternTransforms(model, partBuilds, transforms, p) -> { k: T } for one seed (a function of the seed's transform)
  function patternPlacer(model, partBuilds, transforms, p) {
    if (p.type === 'linear') {
      var n1 = Math.floor(+p.count), n2 = p.direction2 ? Math.floor(+p.count2 || 1) : 1;
      if (!(n1 >= 1 && n1 <= 1000)) throw new Error('Number of instances must be a whole number ≥ 1');
      if (!(n2 >= 1 && n1 * n2 <= 1000)) throw new Error('Number of instances (direction 2) must be a whole number ≥ 1');
      if (!isFinite(+p.spacing) || (p.direction2 && !isFinite(+p.spacing2 || 0))) throw new Error('Spacing must be a number');
      if (!p.direction) throw new Error('Pick a direction (a face, plane, cylinder or axis)');
      var W1 = worldRefOf(model, partBuilds, p.direction, transforms), d1 = scale(norm(dirOf(W1)), p.reverse ? -1 : 1), d2 = [0, 0, 0];
      if (p.direction2) { var W2 = worldRefOf(model, partBuilds, p.direction2, transforms); d2 = scale(norm(dirOf(W2)), p.reverse2 ? -1 : 1); }
      return function (T, k) {
        var i = k % n1, j = Math.floor(k / n1);
        return { rotation: T.rotation.slice(), position: add(T.position, add(scale(d1, i * +p.spacing), scale(d2, j * (+p.spacing2 || 0)))) };
      };
    }
    if (p.type === 'circular') {
      var n = Math.floor(+p.count);
      if (!(n >= 1 && n <= 1000)) throw new Error('Number of instances must be a whole number ≥ 1');
      if (!isFinite(+p.angle)) throw new Error('Angle must be a number');
      if (!p.axis) throw new Error('Pick an axis (a cylindrical face or an axis)');
      var WA = worldRefOf(model, partBuilds, p.axis, transforms);
      if (WA.kind !== 'axis') throw new Error('Pattern axis must be a cylindrical face or an axis');
      var step = +p.angle;
      if (p.equal) step = Math.abs(Math.abs(step) - 360) < 1e-9 ? step / n : n > 1 ? step / (n - 1) : 0;
      var ax = scale(norm(WA.dir), p.reverse ? -1 : 1), o = WA.point;
      return function (T, k) {
        var Q = rotVec(scale(ax, k * step * Math.PI / 180));
        return { rotation: matMul(Q, T.rotation), position: add(matVec(Q, sub(T.position, o)), o) };
      };
    }
    if (!p.plane) throw new Error('Pick a mirror plane (a planar face or plane)');
    var WP = worldRefOf(model, partBuilds, p.plane, transforms);
    if (WP.kind !== 'plane') throw new Error('Mirror plane must be a planar face or plane');
    var nrm = norm(WP.normal), q = WP.point;
    var H = [1 - 2 * nrm[0] * nrm[0], -2 * nrm[0] * nrm[1], -2 * nrm[0] * nrm[2], -2 * nrm[1] * nrm[0], 1 - 2 * nrm[1] * nrm[1], -2 * nrm[1] * nrm[2], -2 * nrm[2] * nrm[0], -2 * nrm[2] * nrm[1], 1 - 2 * nrm[2] * nrm[2]];
    function reflect(x) { return sub(x, scale(nrm, 2 * dot(sub(x, q), nrm))); }
    return function (T, k, seedId) {
      if (p.oppositeHand) return { rotation: matMul(H, T.rotation), position: reflect(T.position), mirrored: true };
      // copy: flip the part's own axis closest to the plane normal, so the rotation stays proper and a part symmetric
      // about that local plane lands exactly on its mirror image (its bounding-box centre is reflected)
      var nl = matTVec(T.rotation, nrm), kx = 0;
      for (var a = 1; a < 3; a++) if (Math.abs(nl[a]) > Math.abs(nl[kx])) kx = a;
      var F = IDENTITY.slice(); F[kx * 4] = -1;
      var R = matMul(matMul(H, T.rotation), F);
      var g = partGeom(partBuilds && partBuilds[seedId]), cL = g ? g.center : [0, 0, 0];
      return { rotation: R, position: sub(reflect(add(matVec(T.rotation, cL), T.position)), matVec(R, cL)) };
    };
  }
  // Place every instance from its seed's current transform; errors keyed by pattern id.
  function placeInstances(model, partBuilds, transforms, errors) {
    var out = {};
    (model.patterns || []).forEach(function (p) {
      var info = { ok: true, error: null, instances: [] };
      out[p.id] = info;
      var place = null;
      try { place = patternPlacer(model, partBuilds, transforms, p); } catch (e) { info.ok = false; info.error = e.message || String(e); errors[p.id] = info.error; }
      model.components.forEach(function (c) {
        if (c.pattern !== p.id) return;
        info.instances.push(c.id);
        if (!place) return;
        var seedT = transforms[c.seed] || tf((findComponent(model, c.seed) || {}).transform);
        var T = place(seedT, c.instance, c.seed);
        transforms[c.id] = { position: T.position, rotation: T.rotation };
        c.transform = { position: T.position.slice(), rotation: T.rotation.slice() };
      });
    });
    return out;
  }
  function isMirroredRotation(R) {   // det < 0: an opposite-hand instance
    return R[0] * (R[4] * R[8] - R[5] * R[7]) - R[1] * (R[3] * R[8] - R[5] * R[6]) + R[2] * (R[3] * R[7] - R[4] * R[6]) < 0;
  }

  // ------------------------------------------------------------------ Exploded View
  // model.explodedViews = [{ id, name: 'ExplView1', steps: [{ id, name: 'Explode Step1', components: [ids],
  // direction: [x, y, z] (unit, world), distance }] }]; model.exploded = the id of the view shown exploded (absent:
  // collapsed). Steps run in order; a component moves by the sum of its steps' direction · distance. The explode is
  // display state only: component transforms (and mates) stay collapsed, the exploded offsets are added to the world
  // bodies of the build, and build.explode carries { view, t, offsets: { id: [dx, dy, dz] }, lines } where the explode
  // lines run through each moved component's centre, one segment per step.
  function findExplodedView(model, idOrName) {
    var list = (model && model.explodedViews) || [], i;
    if (idOrName == null) return list[0] || null;
    for (i = 0; i < list.length; i++) if (list[i].id === idOrName) return list[i];
    for (i = 0; i < list.length; i++) if (list[i].name === idOrName) return list[i];
    if (typeof idOrName === 'string' && /^\d+$/.test(idOrName)) return findExplodedView(model, +idOrName);
    return null;
  }
  function addExplodedView(model, opts) {
    ensureLists(model);
    if (!model.explodedViews) model.explodedViews = [];
    opts = opts || {};
    var v = { id: model.nextId++, name: opts.name || ('ExplView' + nextNumber(model.explodedViews.map(function (x) { return x.name; }), 'ExplView')), steps: [] };
    model.explodedViews.push(v);
    return v;
  }
  function explodeDir(d) {
    if (typeof d === 'string') {
      var neg = d.charAt(0) === '-', a = AXIS_DIRS[d.replace(/^[-+]/, '').toLowerCase()];
      if (!a) throw new Error('Explode direction must be "x", "y", "z", "-x", … or [x, y, z]');
      return neg ? scale(a, -1) : a.slice();
    }
    var v = d && d.length === 3 ? copy3(d) : null;
    if (!v || !(len(v) > 1e-12) || !isFinite(len(v))) throw new Error('Explode direction must be "x", "y", "z", "-x", … or [x, y, z]');
    return norm(v);
  }
  // addExplodeStep(model, view (id, name or null: the first, made when missing), components, direction, distance, opts)
  function addExplodeStep(model, view, comps, direction, distance, opts) {
    ensureLists(model);
    opts = opts || {};
    var v = findExplodedView(model, view);
    if (!v) v = addExplodedView(model, view != null && typeof view === 'string' && !/^\d+$/.test(view) ? { name: view } : {});
    var ids = (Array.isArray(comps) ? comps : [comps]).map(function (x) {
      var c = findComponent(model, x);
      if (!c) throw new Error('Unknown component ' + JSON.stringify(x));
      return c.id;
    });
    if (!ids.length) throw new Error('Select the components to explode');
    if (!(isFinite(+distance))) throw new Error('Explode distance must be a number');
    var st = { id: model.nextId++, name: opts.name || ('Explode Step' + nextNumber(v.steps.map(function (x) { return x.name.replace(/\s+/g, ''); }), 'ExplodeStep')),
      components: ids, direction: explodeDir(direction).map(r6), distance: +distance };
    v.steps.push(st);
    return st;
  }
  function findExplodeStep(model, id) {
    var out = null;
    (model.explodedViews || []).forEach(function (v) { (v.steps || []).forEach(function (st) { if (st.id === id || st.name === id) out = { view: v, step: st }; }); });
    return out;
  }
  function removeExplodeStep(model, id) {
    var f = findExplodeStep(model, id);
    if (!f) return false;
    f.view.steps.splice(f.view.steps.indexOf(f.step), 1);
    return true;
  }
  function removeExplodedView(model, id) {
    var v = findExplodedView(model, id);
    if (!v) return false;
    model.explodedViews.splice(model.explodedViews.indexOf(v), 1);
    if (model.exploded === v.id) delete model.exploded;
    return true;
  }
  // setExploded(model, view | true | false): explode (the given or first view) or collapse
  function setExploded(model, view) {
    if (view === false || view == null) { delete model.exploded; return null; }
    var v = findExplodedView(model, view === true ? null : view);
    if (!v) throw new Error('No exploded view' + (view === true ? '' : ' "' + view + '"'));
    model.exploded = v.id;
    return v;
  }
  // explodeOffsets(model, view, t, centers?) -> { offsets, lines }. t in [0, 1] runs the steps one after another
  // (the animation); centers { id: world point } give the explode lines their start points.
  function explodeOffsets(model, view, t, centers) {
    var v = typeof view === 'object' && view ? view : findExplodedView(model, view), offsets = {}, lines = [];
    if (!v) return { offsets: offsets, lines: lines };
    var steps = v.steps || [], n = steps.length, p = (t == null ? 1 : Math.max(0, Math.min(1, +t))) * n;
    steps.forEach(function (st, i) {
      var f = Math.max(0, Math.min(1, p - i));
      if (!(f > 0)) return;
      var d;
      try { d = explodeDir(st.direction); } catch (e) { return; }
      var mv = scale(d, (+st.distance || 0) * f);
      (st.components || []).forEach(function (id) {
        if (!findComponent(model, id)) return;
        var before = offsets[id] || [0, 0, 0], after = add(before, mv);
        offsets[id] = after;
        if (centers && centers[id]) lines.push({ component: id, step: st.id, from: add(centers[id], before), to: add(centers[id], after) });
      });
    });
    return { offsets: offsets, lines: lines };
  }

  // ------------------------------------------------------------------ rebuild
  function now() { return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now(); }

  // buildPart(source) -> cache entry { kind: 'part' | 'assembly', model, build, error, warning, broken, stamp }. A
  // sub-assembly source is built by rebuild() in turn (its own mates solved, collapsed): entry.build is that assembly
  // build, whose `body` holds every inner component in the sub-assembly's frame and whose `model` carries the solved
  // inner transforms. A document that contains itself (directly or further down) is an error, not a loop.
  var building = [];
  // setPartBuilder(fn | null): fn(partModel) -> a build of that part, or null for Kernel.rebuild (ui-occt.js hands in
  // OpenCascade's builds of the parts while it rebuilds the assembly around them)
  var partBuilder = null;
  function setPartBuilder(fn) { partBuilder = fn || null; }
  function guardKey(source) { return source && source.file != null ? 'file:' + source.file : source && source.example != null ? 'example:' + source.example : null; }
  function buildPart(source, stamp) {
    var entry = { kind: 'part', model: null, build: null, error: null, stamp: stamp || '' };
    var gk = guardKey(source);
    try {
      if (gk && building.indexOf(gk) >= 0) throw new Error('Circular reference: ' + gk.replace(/^\w+:/, '') + ' contains itself');
      if (building.length > MAX_DEPTH) throw new Error('Sub-assemblies nested too deeply');
      var r = resolveSource(source);
      entry.model = r.model; entry.kind = r.kind;
      if (r.file) entry.file = r.file;
      if (r.kind === 'assembly') {
        delete entry.model.exploded;   // a sub-assembly takes part collapsed
        building.push(gk || '(embedded)');
        try { entry.build = rebuild(entry.model); } finally { building.pop(); }
        if (!entry.build.body || !entry.build.body.polygons.length) entry.error = (entry.model.components || []).length ? 'Sub-assembly has no solid body' : 'Sub-assembly has no components';
        else {
          var errs = Object.keys(entry.build.errors || {});
          if (errs.length) entry.warning = 'Sub-assembly has errors: ' + entry.build.errors[errs[0]];
          else if (Object.keys(entry.build.warnings || {}).length) { var wk = Object.keys(entry.build.warnings); entry.warning = entry.build.warnings[wk[0]]; }
        }
        return entry;
      }
      entry.build = (partBuilder && partBuilder(entry.model)) || Kernel.rebuild(entry.model);
      if (!entry.build || !entry.build.body || !entry.build.body.polygons.length) entry.error = 'Part has no solid body';
      else {
        var perrs = entry.build.errors && Object.keys(entry.build.errors);
        if (perrs && perrs.length) entry.warning = 'Part has rebuild errors: ' + entry.build.errors[perrs[0]];
      }
    } catch (e) {
      entry.error = e.message || String(e);
      if (e.broken) entry.broken = true;
    }
    return entry;
  }

  // composeSub(subModel, subBuild, only?) -> a build-like object for a sub-assembly placed with subModel's inner
  // transforms (a Flexible instance's in-context positions): { assembly, subAssembly, model, body, bodies, partBuilds,
  // components, mates, errors, warnings, cache }; `only` (id -> true) keeps just those inner components (the rigid
  // base of a Flexible sub-assembly).
  function composeSub(sm, sb, only) {
    var status = {};
    (sb.components || []).forEach(function (co) { status[co.id] = co; });
    var bodies = sm.components.map(function (k) {
      var pb = sb.partBuilds && sb.partBuilds[k.id], co = status[k.id];
      if ((only && !only[k.id]) || !pb || !pb.body || (co && (co.error || co.suppressed))) return CSG.fromPolygons([]);
      return worldBody(pb.body, k.transform);
    });
    var body = bodies.length ? Kernel.combineBodies(bodies) : CSG.fromPolygons([]);
    return { assembly: true, subAssembly: true, model: sm, body: body, bodies: bodies, partBuilds: sb.partBuilds,
      bodyFeatures: sm.components.map(function (c) { return c.id; }), bodyNames: sm.components.map(function (c) { return c.name; }),
      components: sb.components, mates: sb.mates, errors: sb.errors || {}, warnings: sb.warnings || {}, cache: sb.cache, patterns: sb.patterns };
  }
  function composeT(A, B) { A = tf(A); B = tf(B); return { rotation: matMul(A.rotation, B.rotation), position: add(matVec(A.rotation, B.position), A.position) }; }
  function relativeT(A, B) { A = tf(A); B = tf(B); var Rt = [A.rotation[0], A.rotation[3], A.rotation[6], A.rotation[1], A.rotation[4], A.rotation[7], A.rotation[2], A.rotation[5], A.rotation[8]]; return { rotation: matMul(Rt, B.rotation), position: matTVec(A.rotation, sub(B.position, A.position)) }; }
  function refComponents(m) { return ['a', 'b', 'a2', 'b2'].map(function (k) { return m[k] && m[k].component != null ? m[k].component : null; }).filter(function (x) { return x != null; }); }

  // virtualModel(model, entries, partBuilds) -> null when the model can be solved as it is, else { model, builds, … }:
  // the model the mate solver sees. Broken references (suppressed components) are held fixed and the mates on them left
  // out; a Flexible sub-assembly S becomes a rigid base (id S.id: its fixed inner components, in S's frame) plus one
  // floating component per floating inner component (id 'S/k', placed S·k), and S's own mates are added with their
  // references rewritten ('S/k', or { component: S, path: [k] } for the base). Parent mates and pattern references
  // that point into S by path are rewritten the same way. Pattern instances inside S stay with the base.
  function virtualModel(model, entries, partBuilds) {
    var flex = {}, broken = {}, anyFlex = false, anyBroken = false;
    model.components.forEach(function (c) {
      var e = entries[c.id];
      if (e && e.broken) { broken[c.id] = true; anyBroken = true; }
      else if (c.flexible && c.pattern == null && e && e.kind === 'assembly' && e.build && !e.error) { flex[c.id] = e; anyFlex = true; }
    });
    if (!anyFlex && !anyBroken) return null;
    function shallow(o) { var r = {}; Object.keys(o).forEach(function (k) { r[k] = o[k]; }); return r; }
    var V = { type: 'assembly', name: model.name, units: model.units, features: [], components: [], mates: [], nextId: model.nextId },
      builds = {}, copies = [], skipped = [], innerMates = {};
    Object.keys(partBuilds).forEach(function (k) { builds[k] = partBuilds[k]; });
    function floatingInner(k) { return k && !k.fixed && k.pattern == null; }
    function outer(ref) {   // a parent-level ref pointing into a flexible sub-assembly by path
      if (!ref || ref.component == null || !ref.path || !ref.path.length) return ref;
      var c = findComponent(model, ref.component), e = c && flex[c.id];
      if (!e) return ref;
      var k = findComponent(e.model, ref.path[0]);
      if (!floatingInner(k)) return ref;
      var r = shallow(ref);
      r.component = c.id + '/' + k.id;
      if (ref.path.length > 1) r.path = ref.path.slice(1); else delete r.path;
      return r;
    }
    model.components.forEach(function (c) {
      var vc = shallow(c);
      if (broken[c.id] && c.pattern == null) vc.fixed = true;
      V.components.push(vc);
      var e = flex[c.id];
      if (!e) return;
      var sm = e.model, st = c.flexState || {}, only = {};
      sm.components.forEach(function (k) { if (!floatingInner(k)) only[k.id] = true; });
      builds[c.id] = composeSub(sm, e.build, only);
      var status = {};
      (e.build.components || []).forEach(function (co) { status[co.id] = co; });
      sm.components.forEach(function (k) {
        if (!floatingInner(k)) return;
        var vid = c.id + '/' + k.id, co = status[k.id], ok = e.build.partBuilds[k.id] && !(co && (co.error || co.suppressed));
        V.components.push({ id: vid, name: c.name + '/' + k.name, fixed: !ok, transform: composeT(c.transform, st[k.id] || k.transform), flexOf: c.id, inner: k.id });
        builds[vid] = e.build.partBuilds[k.id];
      });
      function inner(ref) {
        var r = shallow(ref || {});
        if (r.component == null) { r.component = c.id; return r; }   // the sub-assembly's own origin planes / axes
        var k = findComponent(sm, r.component);
        if (floatingInner(k)) { r.component = c.id + '/' + k.id; return r; }
        r.path = [k ? k.id : r.component].concat(r.path || []);
        r.component = c.id;
        return r;
      }
      innerMates[c.id] = [];
      sm.mates.forEach(function (m) {
        var sbm = e.build.mates && e.build.mates[m.id];
        if (m.suppressed || (sbm && sbm.suppressed)) return;
        var cp = shallow(m);
        cp.id = c.id + '/' + m.id;
        ['a', 'b', 'a2', 'b2'].forEach(function (k) { if (m[k]) cp[k] = inner(m[k]); });
        innerMates[c.id].push({ mate: m, copy: cp });
      });
    });
    // parent mates first (they place the sub-assembly bases), then each flexible sub-assembly's own mates
    model.mates.forEach(function (m) {
      if (refComponents(m).some(function (id) { return broken[id]; })) { skipped.push(m); return; }
      var cp = m, changed = false;
      ['a', 'b', 'a2', 'b2'].forEach(function (k) {
        if (!m[k]) return;
        var r = outer(m[k]);
        if (r !== m[k]) { if (!changed) { cp = shallow(m); changed = true; } cp[k] = r; }
      });
      if (changed) copies.push({ mate: m, copy: cp });
      V.mates.push(cp);
    });
    Object.keys(innerMates).forEach(function (id) { innerMates[id].forEach(function (x) { V.mates.push(x.copy); }); });
    if (model.patterns) V.patterns = model.patterns.map(function (p) {
      var q = shallow(p);
      ['direction', 'direction2', 'axis', 'plane'].forEach(function (k) { if (p[k]) q[k] = outer(p[k]); });
      return q;
    });
    return { model: V, builds: builds, flex: flex, broken: broken, copies: copies, skipped: skipped, innerMates: innerMates };
  }
  // finishVirtual: carry a solve of the virtual model back to the real one — solved Flexible positions into
  // c.flexState (inner transforms relative to the sub-assembly), a per-instance build for each Flexible sub-assembly
  // (partBuilds), statuses for the real components only, and warnings for mates left out.
  function finishVirtual(ctx, sol, model, partBuilds, warnings, poseOnly) {
    ctx.copies.forEach(function (x) { if (x.copy.phase && !x.mate.phase) x.mate.phase = x.copy.phase.slice(); });
    var byId = {};
    sol.components.forEach(function (co) { byId[co.id] = co; });
    Object.keys(ctx.flex).forEach(function (sid) {
      var e = ctx.flex[sid], c = findComponent(model, +sid), Ts = sol.transforms[c.id] || tf(c.transform);
      var sm = clone(e.model), st = {}, comps = [], mates = {};
      var status = {};
      (e.build.components || []).forEach(function (co) { status[co.id] = co; });
      sm.components.forEach(function (k, i) {
        var vid = c.id + '/' + k.id, T = sol.transforms[vid];
        var co = byId[vid], base = status[k.id] || { id: k.id, name: k.name, index: i, fixed: !!k.fixed, dof: 0, underDefined: false, error: null };
        if (T) { var rel = relativeT(Ts, T); k.transform = rel; st[k.id] = { position: rel.position.slice(), rotation: rel.rotation.slice() }; }
        var o = {};
        Object.keys(base).forEach(function (q) { o[q] = base[q]; });
        if (co) { o.dof = co.dof; o.underDefined = co.underDefined; }
        comps.push(o);
      });
      (ctx.innerMates[sid] || []).forEach(function (x) {
        var r = sol.mates[x.copy.id];
        if (!r) return;
        mates[x.mate.id] = r;
        if (x.copy.phase && !x.mate.phase) x.mate.phase = x.copy.phase.slice();
        if (r.error && !warnings[c.id]) warnings[c.id] = 'Flexible: ' + x.mate.name + ': ' + r.error;
      });
      (e.model.mates || []).forEach(function (m) { if (!mates[m.id] && e.build.mates && e.build.mates[m.id]) mates[m.id] = e.build.mates[m.id]; });
      c.flexState = st;
      var sb = {};
      Object.keys(e.build).forEach(function (q) { sb[q] = e.build[q]; });
      sb.components = comps; sb.mates = mates;
      if (poseOnly) return;   // r4/asm4: a pose (drag frame) needs flexState only, not the composed body
      partBuilds[c.id] = composeSub(sm, sb);
      partBuilds[c.id].flexible = true;
    });
    ctx.skipped.forEach(function (m) { sol.mates[m.id] = { ok: true, residual: 0, error: null, suppressed: true, warning: 'References a suppressed component' }; });
    var mo = {};
    model.mates.forEach(function (m) { if (sol.mates[m.id]) mo[m.id] = sol.mates[m.id]; });
    sol.mates = mo;
    sol.components = model.components.map(function (c, i) {
      var co = byId[c.id] || { id: c.id, name: c.name, fixed: !!c.fixed, dof: 0, underDefined: false, error: null };
      var o = {};
      Object.keys(co).forEach(function (q) { o[q] = co[q]; });
      o.index = i; o.fixed = !!c.fixed;
      if (ctx.broken[c.id]) { o.dof = 0; o.underDefined = false; }
      return o;
    });
    Object.keys(sol.transforms).forEach(function (id) { if (String(id).indexOf('/') >= 0) delete sol.transforms[id]; });   // the virtual 'S/k' ones
  }

  // rebuild(model, cache?, opts?) — opts.explodeT (0..1) shows the exploded view part-way (the explode animation);
  // opts.drag { id, point, target } solves with a component dragged (solve's dragTo).
  function rebuild(model, cache, opts) {
    var t0 = now();
    ensureLists(model);
    migrateIgnored(model);   // r5/asm5: ignored interferences of older saves, by name -> by component id
    opts = opts || {};
    syncPatterns(model);
    cache = cache || {};
    var newCache = {}, partBuilds = {}, errors = {}, warnings = {}, entries = {};
    model.components.forEach(function (c) {
      var key = JSON.stringify(c.source), stamp = sourceStamp(c.source);
      var entry = newCache[key] || (cache[key] && cache[key].stamp === stamp ? cache[key] : null) || buildPart(c.source, stamp);
      newCache[key] = entry;
      entries[c.id] = entry;
      if (entry.build) partBuilds[c.id] = entry.build;
      if (entry.broken) warnings[c.id] = entry.error;
      else if (entry.error) errors[c.id] = entry.error;
      else if (entry.warning) warnings[c.id] = entry.warning;
    });
    var sol, patOut = {}, patErr = {}, ctx = null;
    try { ctx = virtualModel(model, entries, partBuilds); } catch (e) { ctx = null; errors.solver = 'Mate solver failed: ' + (e.message || e); }
    var SM = ctx ? ctx.model : model, SB = ctx ? ctx.builds : partBuilds;
    function instanceMates() {   // mates that reference a pattern instance: solved again once the instances moved
      return SM.mates.some(function (m) {
        return !m.suppressed && ['a', 'b', 'a2', 'b2'].some(function (k) { var c = m[k] && m[k].component != null ? findComponent(SM, m[k].component) : null; return c && c.pattern != null; });
      });
    }
    try {
      var T0 = {};
      SM.components.forEach(function (c) { T0[c.id] = tf(c.transform); });
      patOut = placeInstances(SM, SB, T0, patErr);
      sol = solve(SM, SB, opts.drag ? { drag: opts.drag, quick: !!opts.quick } : null);
      patErr = {}; patOut = placeInstances(SM, SB, sol.transforms, patErr);
      if (instanceMates()) { sol = solve(SM, SB, opts.drag ? { drag: opts.drag, quick: !!opts.quick } : null); patErr = {}; patOut = placeInstances(SM, SB, sol.transforms, patErr); }
      if (ctx) finishVirtual(ctx, sol, model, partBuilds, warnings, !!opts.poseOnly);
    } catch (e) {
      sol = { transforms: {}, mates: {}, components: model.components.map(function (c, i) { return { id: c.id, name: c.name, index: i, fixed: !!c.fixed, dof: c.fixed ? 0 : 6, underDefined: !c.fixed, error: null }; }) };
      model.components.forEach(function (c) { sol.transforms[c.id] = tf(c.transform); });
      errors.solver = 'Mate solver failed: ' + (e.message || e);
    }
    Object.keys(patErr).forEach(function (id) { errors[id] = patErr[id]; });
    // write the solved transforms back (the model keeps solved positions)
    model.components.forEach(function (c) {
      var T = sol.transforms[c.id];
      if (T) c.transform = { position: T.position.slice(), rotation: T.rotation.slice() };
    });
    Object.keys(sol.mates).forEach(function (id) { if (sol.mates[id].error) errors[id] = sol.mates[id].error; else if (sol.mates[id].warning) warnings[id] = sol.mates[id].warning; });
    sol.components.forEach(function (co) {
      var e = entries[co.id];
      co.error = errors[co.id] || null;
      if (e && e.kind === 'assembly') { co.subAssembly = true; if (findComponent(model, co.id).flexible && !e.error) co.flexible = true; }
      if (e && e.file) co.file = e.file;
      var c = findComponent(model, co.id);
      if (c && c.source && c.source.file != null) co.file = String(c.source.file);
      if (e && e.broken) { co.suppressed = true; co.broken = true; co.dof = 0; co.underDefined = false; }
      if (warnings[co.id]) co.warning = warnings[co.id];
    });
    // the exploded view shown (display only: the offsets are added to the world bodies, not to the transforms)
    var explode = null, xv = model.exploded != null ? findExplodedView(model, model.exploded) : null;
    if (model.exploded != null && !xv) delete model.exploded;
    if (xv) {
      var centers = {};
      model.components.forEach(function (c) { var g = partGeom(partBuilds[c.id]); centers[c.id] = transformPoint(c.transform, g ? g.center : [0, 0, 0]); });
      var xo = explodeOffsets(model, xv, opts.explodeT == null ? 1 : opts.explodeT, centers);
      explode = { view: xv.id, name: xv.name, t: opts.explodeT == null ? 1 : +opts.explodeT, offsets: xo.offsets, lines: xo.lines };
    }
    // opts.poseOnly (r3/assembly3): the solved transforms and explode offsets only, no world bodies; the viewport moves
    // the components it already shows (ui-assembly.js UI.asmPose) while a drag or an explode animation runs
    if (opts.poseOnly) {
      return { assembly: true, pose: true, model: model, body: null, bodies: null, explode: explode, patterns: patOut,
        components: sol.components, mates: sol.mates, errors: errors, warnings: warnings, partBuilds: partBuilds, cache: newCache, time: now() - t0 };
    }
    // world-space bodies, one per component (an empty CSG keeps indices aligned when a part failed or is suppressed)
    var bodies = model.components.map(function (c) {
      return worldBody(partBuilds[c.id] && !entries[c.id].error ? partBuilds[c.id].body : null, c.transform, explode && explode.offsets[c.id]);
    });
    var body = bodies.length ? Kernel.combineBodies(bodies) : null;
    return {
      assembly: true, model: model, body: body, bodies: bodies, explode: explode, patterns: patOut,
      bodyFeatures: model.components.map(function (c) { return c.id; }),
      bodyNames: model.components.map(function (c) { return c.name; }),
      components: sol.components, mates: sol.mates, errors: errors, warnings: warnings,
      partBuilds: partBuilds, cache: newCache, equations: {}, equationErrors: {}, time: now() - t0
    };
  }

  // A part body placed in the world: world = R · local + position (+ an explode offset). An opposite-hand (mirrored)
  // instance has det R < 0, so its polygons are turned round to keep the normals pointing out.
  function worldBody(b, transform, offset) {
    if (!b) return CSG.fromPolygons([]);
    var T = tf(transform), R = T.rotation, P = offset ? add(T.position, offset) : T.position;
    return b.transform(function (v) {
      return new CSG.Vector(R[0] * v.x + R[1] * v.y + R[2] * v.z + P[0], R[3] * v.x + R[4] * v.y + R[5] * v.z + P[1], R[6] * v.x + R[7] * v.y + R[8] * v.z + P[2]);
    }, isMirroredRotation(R));
  }
  // explodedBodies(model, build, view?, t?) -> the world bodies of the components in that exploded view (default: the
  // first view, fully exploded) without re-solving. The hook for drawings ("Show in exploded state") and animations.
  function explodedBodies(model, build, view, t) {
    var v = findExplodedView(model, view), offs = v ? explodeOffsets(model, v, t == null ? 1 : t).offsets : {};
    return model.components.map(function (c) {
      var pb = build && build.partBuilds && build.partBuilds[c.id], e = build && build.cache && build.cache[JSON.stringify(c.source)];
      return worldBody(pb && !(e && e.error) ? pb.body : null, c.transform, offs[c.id]);
    });
  }

  // ------------------------------------------------------------------ Move / Rotate Component
  // These only change a floating component's stored transform; the next rebuild re-solves the mates, so the component
  // keeps the part of the move its free degrees of freedom allow (SolidWorks: dragging respects mates).
  function movableComponent(model, id) {
    var c = findComponent(model, id);
    if (!c) throw new Error('Unknown component ' + JSON.stringify(id));
    if (c.fixed) throw new Error(c.name + ' is fixed: Float it to move it');
    if (c.pattern != null) throw new Error(c.name + ' is a pattern instance: move its seed ' + ((findComponent(model, c.seed) || {}).name || ''));
    return c;
  }
  // moveComponent(model, id, delta) -> the component, translated by delta (world)
  function moveComponent(model, id, delta) {
    var c = movableComponent(model, id), T = tf(c.transform);
    c.transform = { position: add(T.position, copy3(delta)), rotation: T.rotation };
    return c;
  }
  // rotateComponent(model, id, axis, degrees, pivot?) -> the component, turned about the world axis through pivot
  // (default: the component's origin; the UI passes componentCenter)
  function rotateComponent(model, id, axis, deg, pivot) {
    var c = movableComponent(model, id), T = tf(c.transform);
    var ax = typeof axis === 'string' ? AXIS_DIRS[axis.toLowerCase()] : axis && norm(copy3(axis));
    if (!ax || len(ax) < 0.5) throw new Error('Rotate needs an axis: "x", "y", "z" or [x, y, z]');
    var R = rotVec(scale(ax, (+deg || 0) * Math.PI / 180)), P = pivot ? copy3(pivot) : T.position;
    c.transform = { rotation: orthonormalize(matMul(R, T.rotation)), position: add(matVec(R, sub(T.position, P)), P) };
    return c;
  }
  // the world centre of a component's bounding box (its origin when it has no geometry)
  function componentCenter(model, build, id) {
    var c = findComponent(model, id);
    if (!c) return null;
    var g = partGeom(build && build.partBuilds && build.partBuilds[c.id]);
    return transformPoint(c.transform, g ? g.center : [0, 0, 0]);
  }

  // ------------------------------------------------------------------ Interference Detection
  // interference(model, build, opts?) -> { pairs: [{ a, b, aName, bName, aIndex, bIndex, volume, body }], volume, checked }
  // Every pair of components whose world bounding boxes overlap is intersected (CSG.intersect); pairs whose common
  // volume exceeds the tolerance are listed, largest first. Faces that only touch (coincident mates) have no common
  // volume and are not interferences. opts.minVolume overrides the tolerance (1e-9 · assembly bbox diagonal³).
  function bodyBox(csg) {
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    csg.polygons.forEach(function (p) {
      p.vertices.forEach(function (v) { var q = arr(v.pos); for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
    });
    return min[0] <= max[0] ? { min: min, max: max } : null;
  }
  // Sub-assemblies: by default every part inside them is checked too (pairs between parts of one sub-assembly, and
  // between those parts and the rest), named 'Sub<1>/Pin<1>' with aPath / bPath the inner ids; aIndex / bIndex stay
  // the top-level component (body) index. opts.subAssembliesAsComponents: true (SolidWorks' "Treat subassemblies as
  // components") checks each sub-assembly as one body.
  // leafBodies(model, build) -> [{ top (component id), index (top-level body index), name, path: [inner ids], body (world) }]
  // With asComponents a sub-assembly is one body: the union of its parts (their shells side by side are not a solid
  // the boolean can intersect when they touch).
  function leafBodies(model, build, asComponents) {
    var out = [];
    (model.components || []).forEach(function (c, i) {
      var pb = build.partBuilds && build.partBuilds[c.id], wb = build.bodies[i];
      if (asComponents && pb && pb.assembly && pb.model && wb && wb.polygons.length) {
        var parts = leafBodies({ components: [c] }, { partBuilds: build.partBuilds, bodies: [wb], explode: build.explode }, false), u = null;
        parts.forEach(function (l) { u = u ? u.union(l.body) : l.body; });
        out.push({ top: c.id, index: i, name: c.name, path: null, body: u || wb });
        return;
      }
      if (!asComponents && pb && pb.assembly && pb.model && wb && wb.polygons.length) {
        var off = build.explode && build.explode.offsets && build.explode.offsets[c.id];
        (function walk(sm, sb, T, names, path) {
          sm.components.forEach(function (k, j) {
            var kb = sb.partBuilds && sb.partBuilds[k.id], TK = composeT(T, k.transform), co = (sb.components || [])[j];
            if (!kb || !kb.body || (co && (co.error || co.suppressed))) return;
            if (kb.assembly && kb.model) { walk(kb.model, kb, TK, names.concat(k.name), path.concat(k.id)); return; }
            out.push({ top: c.id, index: i, name: names.concat(k.name).join('/'), path: path.concat(k.id), body: worldBody(kb.body, TK, off) });
          });
        })(pb.model, pb, c.transform, [c.name], []);
        return;
      }
      out.push({ top: c.id, index: i, name: c.name, path: null, body: wb });
    });
    return out;
  }
  // exactVolume(csg): the kernel's exact volume (curve correction from the facets' surface records) when the common
  // body has curved facets, so two analytic bodies report the true common volume (0 for a shaft in its own-size bore)
  function exactVolume(csg) {
    if (!csg || !csg.polygons.length) return 0;
    if (!csg.polygons.some(function (p) { return p.surf; })) return csg.volume();
    var v = Kernel.massProps(Kernel.meshFromBody(csg)).volume;
    return isFinite(v) ? v : csg.volume();
  }
  function interference(model, build, opts) {
    opts = opts || {};
    if (!build || !build.bodies) build = rebuild(model);
    var comps = leafBodies(model, build, !!opts.subAssembliesAsComponents), boxes = [], all = null;
    comps.forEach(function (c, i) {
      var b = c.body, bx = b && b.polygons.length ? bodyBox(b) : null;   // a part that failed has an empty body
      boxes.push(bx);
      if (bx) all = all ? { min: all.min.map(function (v, k) { return Math.min(v, bx.min[k]); }), max: all.max.map(function (v, k) { return Math.max(v, bx.max[k]); }) } : { min: bx.min.slice(), max: bx.max.slice() };
    });
    var diag = all ? len(sub(all.max, all.min)) : 0;
    var tol = opts.minVolume != null ? +opts.minVolume : Math.max(1e-12, 1e-9 * diag * diag * diag);
    var pairs = [], checked = 0;
    for (var i = 0; i < comps.length; i++) {
      for (var j = i + 1; j < comps.length; j++) {
        var A = boxes[i], B = boxes[j];
        if (!A || !B) continue;
        var e = 1e-9 * Math.max(1, diag);
        if (A.min[0] > B.max[0] - e || B.min[0] > A.max[0] - e || A.min[1] > B.max[1] - e || B.min[1] > A.max[1] - e || A.min[2] > B.max[2] - e || B.min[2] > A.max[2] - e) continue;
        checked++;
        var common = comps[i].body.intersect(comps[j].body), v = exactVolume(common);
        if (v > tol) {
          var pr = { a: comps[i].top, b: comps[j].top, aName: comps[i].name, bName: comps[j].name, aIndex: comps[i].index, bIndex: comps[j].index, volume: v, body: common };
          if (comps[i].path) pr.aPath = comps[i].path;
          if (comps[j].path) pr.bPath = comps[j].path;
          pairs.push(pr);
        }
      }
    }
    pairs.sort(function (p, q) { return q.volume - p.volume; });
    return { pairs: pairs, volume: pairs.reduce(function (s, p) { return s + p.volume; }, 0), checked: checked, tolerance: tol };
  }

  // ------------------------------------------------------------------ picking
  function r6(x) { var r = Math.round(x * 1e6) / 1e6; return Math.abs(r) < 1e-9 ? 0 : r; }

  function refFromPick(model, build, faceIndex, worldPoint, mesh) {
    if (!model || !build || !worldPoint) return null;
    var face = mesh && mesh.faces ? mesh.faces[faceIndex] : null;
    var idx = face ? (face.body || 0) : -1;
    var comp = model.components[idx];
    if (!comp) return null;
    var off = build.explode && build.explode.offsets && build.explode.offsets[comp.id];   // picked in the exploded view
    var T = tf(comp.transform), p = inverseTransformPoint(T, off ? sub(worldPoint, off) : worldPoint);
    var pbs = build.partBuilds && build.partBuilds[comp.id];
    if (pbs && pbs.assembly && pbs.model) {   // a face inside a sub-assembly: a path ref to the part under the pick
      var hit = pickInner(pbs.model, pbs, p, face ? matTVec(T.rotation, face.normal) : null);
      if (!hit) return null;
      var pr = { component: comp.id, path: hit.path };
      pr[hit.cylinder ? 'cylinder' : 'face'] = hit.point.map(r6);
      return pr;
    }
    var geom = partGeom(pbs);
    var lp = p.map(r6);
    if (!geom) return { component: comp.id, face: lp };
    var ln = face ? matTVec(T.rotation, face.normal) : null;
    // the local patch under the pick: nearest, preferring one with the picked face's normal
    var list = patchesByDistance(geom, p), best = null;
    for (var i = 0; i < list.length && i < 12; i++) {
      if (!ln || dot(list[i].pt.normal, ln) > 1 - 1e-6) { best = list[i].pt; break; }
    }
    if (!best && list.length) best = list[0].pt;
    if (best && patchCylinder(geom, best)) return { component: comp.id, cylinder: lp };
    return { component: comp.id, face: lp };
  }

  // pickInner(subModel, subBuild, p, n) -> { path: [inner ids], point (the leaf part's local coords), cylinder, d }: the
  // inner part whose face lies nearest p (a point in the sub-assembly's frame), preferring faces with normal n
  function pickInner(sm, sb, p, n) {
    var best = null;
    (sm.components || []).forEach(function (k, j) {
      var kb = sb.partBuilds && sb.partBuilds[k.id], co = (sb.components || [])[j];
      if (!kb || !kb.body || (co && (co.error || co.suppressed))) return;
      var T = tf(k.transform), lp = inverseTransformPoint(T, p), ln = n ? matTVec(T.rotation, n) : null, hit;
      if (kb.assembly && kb.model) {
        hit = pickInner(kb.model, kb, lp, ln);
        if (hit) hit.path = [k.id].concat(hit.path);
      } else {
        var g = partGeom(kb);
        if (!g) return;
        var list = patchesByDistance(g, lp), pt = null, d = Infinity;
        for (var i = 0; i < list.length && i < 12; i++) if (!ln || dot(list[i].pt.normal, ln) > 1 - 1e-6) { pt = list[i].pt; d = list[i].d; break; }
        if (!pt && list.length) { pt = list[0].pt; d = list[0].d + 1e-3 * g.size; }
        if (!pt) return;
        hit = { path: [k.id], point: lp, cylinder: !!patchCylinder(g, pt), d: d };
      }
      if (hit && (!best || hit.d < best.d - 1e-9)) best = hit;
    });
    return best;
  }

  // ------------------------------------------------------------------ mass properties
  function massProps(model, build) {
    var comps = [], vol = 0, area = 0, mass = 0, mc = [0, 0, 0];
    var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    var entries = build && build.cache ? build.cache : {};
    model.components.forEach(function (c, i) {
      var pb = build && build.partBuilds && build.partBuilds[c.id];
      var e = entries[JSON.stringify(c.source)];
      // a sub-assembly: its own mass properties (every level down), carried into this frame
      if (pb && pb.assembly && pb.model && !(e && e.error)) {
        var sm = massProps(pb.model, pb), TT = tf(c.transform), scen = transformPoint(TT, sm.centroid);
        var kids = sm.components.map(function place(k) {   // centroids in this assembly's frame, every level down
          var o = {};
          Object.keys(k).forEach(function (q) { o[q] = k[q]; });
          o.centroid = transformPoint(TT, k.centroid);
          if (k.components) o.components = k.components.map(place);
          return o;
        });
        vol += sm.volume; area += sm.area; mass += sm.mass;
        mc = add(mc, scale(scen, sm.mass));
        comps.push({ id: c.id, name: c.name, index: i, volume: sm.volume, mass: sm.mass, density: sm.volume > 0 ? sm.mass / sm.volume : 0, material: null, centroid: scen, subAssembly: true, components: kids });
        var sw = build.bodies && build.bodies[i];
        if (sw) sw.polygons.forEach(function (p) {
          p.vertices.forEach(function (v) { var q = arr(v.pos); for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
        });
        return;
      }
      var density = (e && e.model && e.model.density > 0) ? e.model.density : 7850;
      var geom = partGeom(pb);
      if (!geom || (e && e.error)) { var z = { id: c.id, name: c.name, index: i, volume: 0, mass: 0, density: density, centroid: [0, 0, 0] }; if (e && e.broken) z.suppressed = true; comps.push(z); return; }
      var mp = Kernel.massProps(geom.mesh, density), T = tf(c.transform);
      // materials.js: the part's material name, and bodies with their own material weigh with their own density
      var matName = null;
      if (typeof Materials !== 'undefined' && e && e.model) {
        matName = Materials.materialName(e.model);
        if (Materials.hasBodyMaterials(e.model)) { var pm = Materials.massProps(e.model, pb, geom.mesh); mp = { volume: pm.volume, area: pm.area, centroid: pm.centroid }; density = pm.density; }
      }
      var cen = transformPoint(T, mp.centroid), m = mp.volume * density;
      vol += mp.volume; area += mp.area; mass += m;
      mc = add(mc, scale(cen, m));
      comps.push({ id: c.id, name: c.name, index: i, volume: mp.volume, mass: m, density: density, material: matName, centroid: cen });
      var wb = build.bodies && build.bodies[i];
      if (wb) wb.polygons.forEach(function (p) {
        p.vertices.forEach(function (v) { var q = arr(v.pos); for (var k = 0; k < 3; k++) { if (q[k] < min[k]) min[k] = q[k]; if (q[k] > max[k]) max[k] = q[k]; } });
      });
    });
    if (!(min[0] <= max[0])) { min = [0, 0, 0]; max = [0, 0, 0]; }
    return { volume: vol, area: area, mass: mass, centroid: mass > 0 ? scale(mc, 1 / mass) : [0, 0, 0], bbox: { min: min, max: max }, components: comps };
  }

  // ------------------------------------------------------------------ Bill of Materials across levels
  // bom(model, build?, { type }) -> rows [{ item, level, name, kind: 'part' | 'assembly', key, qty, components: [ids],
  // file? }]. Components with the same source count together (their key); suppressed (broken) components are left out.
  //   'top'      Top-level only: this assembly's components, a sub-assembly as one row.
  //   'indented' Indented: as Top-level, each sub-assembly followed by its own rows one level in (items 1.1, 1.2, …;
  //              qty per one of its parent).
  //   'parts'    Parts only: every part at any depth, quantities multiplied through the levels; no assembly rows.
  // The sub-assembly layouts come from the build when given (build.partBuilds), else from the sources.
  // Each row has a `description` (r3/assembly3), as the drawing BOM's DESCRIPTION: the part's "Description" property
  // (Materials.sheetProperty, links evaluated), else the model's description, else its Design Library name.
  function describe(m, source) {
    var d = '';
    if (typeof Materials !== 'undefined' && Materials.sheetProperty) { try { d = String(Materials.sheetProperty(m, 'Description') || ''); } catch (e) { d = ''; } }
    if (!d.trim()) d = m.description || (source && source.example != null ? String(source.example) : '');
    return d;
  }
  function bom(model, build, opts) {
    opts = opts || {};
    var type = opts.type === 'indented' || opts.type === 'parts' ? opts.type : 'top';
    var names = {};
    function info(c, pb) {
      var key = JSON.stringify(c.source);
      if (!names[key]) {
        var r = null;
        try { r = resolveSource(c.source); } catch (e) { r = null; }
        names[key] = { name: c.source && c.source.file != null ? String(c.source.file) : (r && r.model && r.model.name) || baseName(c.name), kind: r ? r.kind : 'part', model: r ? r.model : null, broken: !r,
          description: r && r.model ? describe(r.model, c.source) : '' };
      }
      var inf = names[key];
      return { key: key, name: inf.name, description: inf.description, kind: inf.kind, broken: inf.broken, sub: inf.kind === 'assembly' ? { model: pb && pb.model ? pb.model : inf.model, build: pb && pb.assembly ? pb : null } : null };
    }
    function groups(m, b) {
      var out = [], by = {};
      (m.components || []).forEach(function (c) {
        var st = b && b.components ? b.components.filter(function (x) { return x.id === c.id; })[0] : null;
        if (st && st.suppressed) return;
        var it = info(c, b && b.partBuilds ? b.partBuilds[c.id] : null);
        if (it.broken) return;
        var g = by[it.key];
        if (!g) { g = by[it.key] = { key: it.key, name: it.name, description: it.description, kind: it.kind, sub: it.sub, components: [], file: c.source && c.source.file != null ? String(c.source.file) : null }; out.push(g); }
        g.components.push(c.id);
      });
      return out;
    }
    var rows = [];
    function row(g, item, level, qty) {
      var r = { item: String(item), level: level, name: g.name, description: g.description || '', kind: g.kind, key: g.key, qty: qty, components: g.components.slice() };
      if (g.file) r.file = g.file;
      rows.push(r);
      return r;
    }
    if (type === 'parts') {
      var byKey = {};
      (function walk(m, b, mult, depth) {
        groups(m, b).forEach(function (g) {
          if (g.kind === 'assembly' && g.sub && g.sub.model && depth < MAX_DEPTH) { walk(g.sub.model, g.sub.build, mult * g.components.length, depth + 1); return; }
          var r = byKey[g.key];
          if (!r) r = byKey[g.key] = row(g, rows.length + 1, 0, 0);
          r.qty += mult * g.components.length;
        });
      })(model, build, 1, 0);
      return rows;
    }
    (function walk(m, b, prefix, level) {
      groups(m, b).forEach(function (g, i) {
        var item = prefix ? prefix + '.' + (i + 1) : i + 1;
        row(g, item, level, g.components.length);
        if (type === 'indented' && g.kind === 'assembly' && g.sub && g.sub.model && level < MAX_DEPTH) walk(g.sub.model, g.sub.build, String(item), level + 1);
      });
    })(model, build, '', 0);
    return rows;
  }

  // ------------------------------------------------------------------ script API
  function Builder(model) { this.model = model; ensureLists(model); }
  function compId(model, c) {
    if (c == null) return null;
    var comp = findComponent(model, c);
    if (!comp) throw new Error('Unknown component ' + JSON.stringify(c));
    return comp.id;
  }
  function builderRef(model, ref) {
    var r = JSON.parse(JSON.stringify(ref || {}));
    if (r.component != null) r.component = compId(model, r.component);
    return r;
  }
  Builder.prototype.name = function (s) { this.model.name = String(s); return this; };
  Builder.prototype.units = function (u) { this.model.units = String(u); return this; };
  Builder.prototype.insert = function (source, opts) { return insert(this.model, source, opts).id; };
  Builder.prototype.mate = function (type, a, b, opts) {
    return addMate(this.model, type, builderRef(this.model, a), builderRef(this.model, b), opts).id;
  };
  Builder.prototype.coincident = function (a, b, opts) { return this.mate('coincident', a, b, opts); };
  Builder.prototype.concentric = function (a, b, opts) { return this.mate('concentric', a, b, opts); };
  function withValue(opts, key, v) { var o = JSON.parse(JSON.stringify(opts || {})); if (v != null) o[key] = v; return o; }
  Builder.prototype.distance = function (a, b, d, opts) { return this.mate('distance', a, b, withValue(opts, 'distance', d)); };
  Builder.prototype.angle = function (a, b, deg, opts) { return this.mate('angle', a, b, withValue(opts, 'angle', deg)); };
  Builder.prototype.parallel = function (a, b, opts) { return this.mate('parallel', a, b, opts); };
  Builder.prototype.perpendicular = function (a, b, opts) { return this.mate('perpendicular', a, b, opts); };
  Builder.prototype.tangent = function (a, b, opts) { return this.mate('tangent', a, b, opts); };
  // width(widthFace1, widthFace2, tabFace1, tabFace2 | null (cylindrical tab), opts)
  Builder.prototype.width = function (a, a2, b, b2, opts) {
    var o = JSON.parse(JSON.stringify(opts || {}));
    o.a2 = builderRef(this.model, a2);
    if (b2) o.b2 = builderRef(this.model, b2);
    return this.mate('width', a, b, o);
  };
  Builder.prototype.gear = function (a, b, ratio, opts) { return this.mate('gear', a, b, withValue(opts, 'ratio', ratio)); };
  Builder.prototype.limitDistance = function (a, b, min, max, opts) { return this.mate('limitdistance', a, b, withValue(withValue(opts, 'min', min), 'max', max)); };
  Builder.prototype.limitAngle = function (a, b, min, max, opts) { return this.mate('limitangle', a, b, withValue(withValue(opts, 'min', min), 'max', max)); };
  function patternOpts(model, opts) {
    var o = JSON.parse(JSON.stringify(opts || {}));
    ['direction', 'direction2', 'axis', 'plane'].forEach(function (k) { if (o[k]) o[k] = builderRef(model, o[k]); });
    return o;
  }
  function builderPattern(model, type, seeds, opts) {
    var p = addPattern(model, type, (Array.isArray(seeds) ? seeds : [seeds]).map(function (x) { return compId(model, x); }), patternOpts(model, opts));
    // instanceNames (generateScript): keep the instance names of the saved assembly
    if (opts && Array.isArray(opts.instanceNames)) {
      var inst = model.components.filter(function (c) { return c.pattern === p.id; });
      opts.instanceNames.forEach(function (nm, i) { if (inst[i] && nm) inst[i].name = String(nm); });
    }
    return p.id;
  }
  Builder.prototype.linearPattern = function (seeds, opts) { return builderPattern(this.model, 'linear', seeds, opts); };
  Builder.prototype.circularPattern = function (seeds, opts) { return builderPattern(this.model, 'circular', seeds, opts); };
  Builder.prototype.mirrorComponents = function (seeds, opts) { return builderPattern(this.model, 'mirror', seeds, opts); };
  // explode(components, direction ("x", "-y", [x, y, z]), distance, { view, name }) -> the step id
  Builder.prototype.explode = function (comps, dir, dist, opts) {
    var model = this.model;
    opts = opts || {};
    return addExplodeStep(model, opts.view != null ? opts.view : null, (Array.isArray(comps) ? comps : [comps]).map(function (x) { return compId(model, x); }), dir, dist, { name: opts.name }).id;
  };
  // exploded(view | true): show that exploded view exploded; exploded(false): collapse
  Builder.prototype.exploded = function (v) { setExploded(this.model, v === undefined ? true : v); return this; };
  // flexible(c, on = true): Solve as Flexible / Rigid for a sub-assembly component
  Builder.prototype.flexible = function (c, on) { setFlexible(this.model, compId(this.model, c), on !== false); return this; };
  Builder.prototype.fix = function (c) { setFixed(this.model, compId(this.model, c), true); return this; };
  Builder.prototype.float = function (c) { setFixed(this.model, compId(this.model, c), false); return this; };
  // r4/asm4: Interference Detection results ignored by the user are saved with the assembly (SolidWorks keeps them in
  // the document): model.ignoredInterferences = ['3|7' (component ids, r5/asm5; sorted), + '#c' for a coincidence]
  function interferenceKey(a, b, coincident) { return [String(a), String(b)].sort().join('|') + (coincident ? '#c' : ''); }
  function setInterferenceIgnored(model, key, on) {
    var list = (model.ignoredInterferences || []).filter(function (k) { return k !== key; });
    if (on) list.push(String(key));
    if (list.length) model.ignoredInterferences = list; else delete model.ignoredInterferences;
    return list;
  }
  // r5/asm5: each side is a component id ('3|7'; a body of a multibody part '3/Body2'), so a renamed component keeps
  // its ignored results. ignoreSide(model, x): a component (id or name) or 'Name/Body' -> that form (unknown: as given).
  // Keys saved by name (before r5) are moved to ids when the assembly is rebuilt (migrateIgnored); scripts name them.
  function ignoreSide(model, x) {
    if (typeof x === 'number') return String(x);
    var s = String(x), c;
    if (/^\d+(\/|$)/.test(s)) return s;
    c = findComponent(model, s);
    if (c) return String(c.id);
    for (var i = s.lastIndexOf('/'); i > 0; i = s.lastIndexOf('/', i - 1)) { c = findComponent(model, s.slice(0, i)); if (c) return c.id + s.slice(i); }
    return s;
  }
  function ignoreSides(k) { var co = /#c$/.test(k), ab = String(k).replace(/#c$/, '').split('|'); return { a: ab[0], b: ab.slice(1).join('|'), co: co }; }
  function migrateIgnored(model) {
    if (!model.ignoredInterferences || !model.ignoredInterferences.length) return;
    var out = [];
    model.ignoredInterferences.forEach(function (k) {
      var s = ignoreSides(k), n = interferenceKey(ignoreSide(model, s.a), ignoreSide(model, s.b), s.co);
      if (out.indexOf(n) < 0) out.push(n);
    });
    model.ignoredInterferences = out;
  }
  function sideName(model, s) { var m = /^(\d+)(\/.*)?$/.exec(s), c = m ? findComponent(model, +m[1]) : null; return c ? c.name + (m[2] || '') : s; }
  // ignoreInterference(a, b, { coincident }): a and b are components (ids, names) or body names ('Part<1>/Body2')
  Builder.prototype.ignoreInterference = function (a, b, opts) {
    var model = this.model;
    setInterferenceIgnored(model, interferenceKey(ignoreSide(model, a), ignoreSide(model, b), opts && opts.coincident), true);
    return this;
  };

  function runScript(model, code) {
    var b = new Builder(model);
    var fn = new Function('a', 'asm', 'Math', '"use strict";\n' + code);
    fn(b, b, Math);
    return b;
  }

  function numList(a) { return '[' + a.map(function (x) { return String(r6(+x)); }).join(', ') + ']'; }
  function isIdentity(R) { for (var i = 0; i < 9; i++) if (Math.abs(r6(R[i]) - IDENTITY[i]) > 0) return false; return true; }
  function sourceText(src) {
    if (src.file != null) return '{ file: ' + JSON.stringify(src.file) + ' }';
    if (src.example != null) return '{ example: ' + JSON.stringify(src.example) + ' }';
    if (src.script != null) return '{ script: ' + JSON.stringify(src.script) + ' }';
    return '{ model: ' + JSON.stringify(src.model) + ' }';
  }
  function refText(ref, varOf) {
    if (!ref) return 'null';
    var parts = [];
    if (ref.component != null) parts.push('component: ' + (varOf[ref.component] || JSON.stringify(ref.component)));
    if (ref.path && ref.path.length) parts.push('path: ' + JSON.stringify(ref.path));
    ['face', 'cylinder'].forEach(function (k) { if (ref[k]) parts.push(k + ': ' + numList(ref[k])); });
    ['plane', 'axis'].forEach(function (k) { if (ref[k] != null) parts.push(k + ': ' + JSON.stringify(ref[k])); });
    return '{ ' + parts.join(', ') + ' }';
  }

  function generateScript(model) {
    var out = ['// ' + model.name + ' — generated by Anvil (assembly)', 'a.name(' + JSON.stringify(model.name) + ').units(' + JSON.stringify(model.units || 'mm') + ');'];
    var varOf = {}, emitted = {}, patDone = {};
    var PAT_CALL = { linear: 'linearPattern', circular: 'circularPattern', mirror: 'mirrorComponents' };
    function emitPattern(p) {
      if (patDone[p.id] || !p.seeds.every(function (sid) { return emitted[sid]; })) return;
      patDone[p.id] = true;
      var opts = ['name: ' + JSON.stringify(p.name)];
      (PATTERN_KEYS[p.type] || []).forEach(function (k) {
        if (p[k] == null) return;
        if (k === 'direction' || k === 'direction2' || k === 'axis' || k === 'plane') opts.push(k + ': ' + refText(p[k], varOf));
        else if (p[k] === true) opts.push(k + ': true');
        else opts.push(k + ': ' + String(r6(+p[k])));
      });
      var inst = (model.components || []).filter(function (c) { return c.pattern === p.id; });
      if (inst.length) opts.push('instanceNames: ' + JSON.stringify(inst.map(function (c) { return c.name; })));
      out.push('var p' + p.id + ' = a.' + PAT_CALL[p.type] + '([' + p.seeds.map(function (sid) { return varOf[sid]; }).join(', ') + '], { ' + opts.join(', ') + ' });');
      inst.forEach(function (c) { varOf[c.id] = JSON.stringify(c.name); emitted[c.id] = true; });
    }
    (model.components || []).forEach(function (c, i) {
      if (c.pattern != null) { var pp = findPattern(model, c.pattern); if (pp) emitPattern(pp); return; }
      var v = 'c' + c.id;
      varOf[c.id] = v;
      emitted[c.id] = true;
      var T = tf(c.transform), opts = ['name: ' + JSON.stringify(c.name)];
      if (c.fixed) opts.push('fixed: true');
      else if (i === 0) opts.push('fixed: false');
      if (T.position.some(function (x) { return r6(x) !== 0; })) opts.push('position: ' + numList(T.position));
      if (!isIdentity(T.rotation)) opts.push('rotation: ' + numList(T.rotation));
      if (c.flexible) {
        opts.push('flexible: true');
        var fs = c.flexState ? Object.keys(c.flexState) : [];
        if (fs.length) opts.push('flexState: { ' + fs.map(function (k) { var q = tf(c.flexState[k]); return JSON.stringify(k) + ': { position: ' + numList(q.position) + ', rotation: ' + numList(q.rotation) + ' }'; }).join(', ') + ' }');
      }
      out.push('var ' + v + ' = a.insert(' + sourceText(c.source || {}) + ', { ' + opts.join(', ') + ' });');
    });
    (model.patterns || []).forEach(emitPattern);
    (model.mates || []).forEach(function (m) {
      var opts = ['name: ' + JSON.stringify(m.name)];
      if (m.alignment && m.alignment !== defaultAlignment(m)) opts.push('alignment: ' + JSON.stringify(m.alignment));
      ['distance', 'angle', 'offset', 'min', 'max'].forEach(function (k) { if (m[k] != null) opts.push(k + ': ' + String(r6(+m[k]))); });
      if (m.ratio) opts.push('ratio: ' + numList(m.ratio));
      if (m.phase) opts.push('phase: ' + numList(m.phase));
      if (m.a2) opts.push('a2: ' + refText(m.a2, varOf));
      if (m.b2) opts.push('b2: ' + refText(m.b2, varOf));
      if (m.flip) opts.push('flip: true');
      if (m.suppressed) opts.push('suppressed: true');
      out.push('a.mate(' + JSON.stringify(m.type) + ', ' + refText(m.a, varOf) + ', ' + refText(m.b, varOf) + ', { ' + opts.join(', ') + ' });');
    });
    (model.explodedViews || []).forEach(function (v) {
      (v.steps || []).forEach(function (st) {
        out.push('a.explode([' + st.components.map(function (id) { return varOf[id] || JSON.stringify(id); }).join(', ') + '], ' + numList(st.direction) + ', ' + String(r6(+st.distance)) +
          ', { view: ' + JSON.stringify(v.name) + ', name: ' + JSON.stringify(st.name) + ' });');
      });
      if (!(v.steps || []).length) out.push('// ' + v.name + ' has no explode steps');
    });
    var xv = model.exploded != null ? findExplodedView(model, model.exploded) : null;
    if (xv && (xv.steps || []).length) out.push('a.exploded(' + JSON.stringify(xv.name) + ');');
    (model.ignoredInterferences || []).forEach(function (k) {   // r4/asm4
      var s = ignoreSides(k);   // r5/asm5: saved by component id, written by name (a script's ids may differ)
      out.push('a.ignoreInterference(' + JSON.stringify(sideName(model, s.a)) + ', ' + JSON.stringify(sideName(model, s.b)) + (s.co ? ', { coincident: true }' : '') + ');');
    });
    return out.join('\n') + '\n';
  }

  return {
    IDENTITY: IDENTITY,
    isAssembly: isAssembly, newAssembly: newAssembly, partModel: partModel,
    insert: insert, addMate: addMate, removeComponent: removeComponent, removeMate: removeMate,
    findComponent: findComponent, findMate: findMate, setFixed: setFixed, componentIndex: componentIndex,
    rebuild: rebuild, setPartBuilder: setPartBuilder, solve: solve, resolveRef: resolveRef, refFromPick: refFromPick, massProps: massProps,
    transformPoint: transformPoint, inverseTransformPoint: inverseTransformPoint, transformDir: transformDir,
    Builder: Builder, runScript: runScript, isAssemblyScript: isAssemblyScript, generateScript: generateScript,
    defaultAlignment: defaultAlignment, hasAlignment: hasAlignment, setMateValues: setMateValues, MATE_TYPES: MATE_TYPES.slice(),
    moveComponent: moveComponent, rotateComponent: rotateComponent, componentCenter: componentCenter, interference: interference,
    MATE_GROUPS: JSON.parse(JSON.stringify(MATE_GROUPS)), MATE_NAMES: JSON.parse(JSON.stringify(MATE_BASE)),
    addPattern: addPattern, removePattern: removePattern, findPattern: findPattern, setPatternValues: setPatternValues, syncPatterns: syncPatterns,
    addExplodedView: addExplodedView, addExplodeStep: addExplodeStep, removeExplodeStep: removeExplodeStep, removeExplodedView: removeExplodedView,
    findExplodedView: findExplodedView, findExplodeStep: findExplodeStep, setExploded: setExploded, explodeOffsets: explodeOffsets,
    explodedBodies: explodedBodies, explodeDir: explodeDir,
    Documents: Documents, documents: Documents, resolveSource: resolveSource, references: references, saveReferences: saveReferences,
    packAndGo: packAndGo, setFlexible: setFlexible, isSubAssemblySource: isSubAssemblySource, bom: bom, leafBodies: leafBodies,
    composeTransforms: composeT, relativeTransform: relativeT, interferenceKey: interferenceKey, setInterferenceIgnored: setInterferenceIgnored, ignoreSide: ignoreSide, migrateIgnored: migrateIgnored,
    findCylinder: function (build, p) { var g = partGeom(build); return g ? findCylinder(g, p) : null; }
  };
})();
