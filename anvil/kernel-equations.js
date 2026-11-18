// kernel-equations.js — Anvil kernel, equations (global variables, the expression grammar and EXPR_FN) and
// configurations (named sets of variable values). Self-contained: loaded after kernel.js, uses nothing from the other
// kernel files. No DOM.
(function (K, _) {
  'use strict';

  // ------------------------------------------------------------------ equations (global variables)
  // model.equations = [{ name: 'T', expr: '10' }, ...] in order; each expression may use the ones before it. Any
  // numeric field of a feature (depth, angle, spacing, count, r, d, thickness, offset, ... at any depth) may hold a
  // string beginning with "=" instead of a number ('=T*2'); rebuild resolves it against the variables first.
  // References and sketch geometry are never expressions: the keys in EXPR_SKIP are copied untouched.
  var EXPR_SKIP = { id: 1, type: 1, name: 1, entities: 1, profile: 1, sketch: 1, path: 1, edges: 1, faces: 1, bodies: 1, feature: 1 };
  var EXPR_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
  var EXPR_CONST = { pi: Math.PI, e: Math.E };
  function fixedArity(fn, n, name) {
    return function (args) {
      if (args.length !== n) throw new Error('"' + name + '" expects ' + n + ' argument' + (n === 1 ? '' : 's'));
      return fn.apply(null, args);
    };
  }
  function variadic(fn, name) {
    return function (args) {
      if (!args.length) throw new Error('"' + name + '" expects at least 1 argument');
      return fn.apply(null, args);
    };
  }
  var D2R = Math.PI / 180;
  var EXPR_FN = {};
  ['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'trunc', 'sign', 'exp', 'log', 'log10', 'log2'].forEach(function (n) {
    var fn = Math[n] || (n === 'cbrt' ? function (x) { return x < 0 ? -Math.pow(-x, 1 / 3) : Math.pow(x, 1 / 3); } :
      n === 'sinh' ? function (x) { return (Math.exp(x) - Math.exp(-x)) / 2; } :
      n === 'cosh' ? function (x) { return (Math.exp(x) + Math.exp(-x)) / 2; } :
      n === 'tanh' ? function (x) { var a = Math.exp(x), b = Math.exp(-x); return (a - b) / (a + b); } :
      n === 'trunc' ? function (x) { return x < 0 ? Math.ceil(x) : Math.floor(x); } :
      n === 'sign' ? function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; } :
      n === 'log10' ? function (x) { return Math.log(x) / Math.LN10; } :
      n === 'log2' ? function (x) { return Math.log(x) / Math.LN2; } : null);
    EXPR_FN[n] = fixedArity(fn, 1, n);
  });
  EXPR_FN.atan2 = fixedArity(Math.atan2, 2, 'atan2');
  EXPR_FN.pow = fixedArity(Math.pow, 2, 'pow');
  EXPR_FN.min = variadic(Math.min, 'min');
  EXPR_FN.max = variadic(Math.max, 'max');
  EXPR_FN.hypot = variadic(function () { var s = 0; for (var i = 0; i < arguments.length; i++) s += arguments[i] * arguments[i]; return Math.sqrt(s); }, 'hypot');
  EXPR_FN.sind = fixedArity(function (x) { return Math.sin(x * D2R); }, 1, 'sind');
  EXPR_FN.cosd = fixedArity(function (x) { return Math.cos(x * D2R); }, 1, 'cosd');
  EXPR_FN.tand = fixedArity(function (x) { return Math.tan(x * D2R); }, 1, 'tand');
  EXPR_FN.asind = fixedArity(function (x) { return Math.asin(x) / D2R; }, 1, 'asind');
  EXPR_FN.acosd = fixedArity(function (x) { return Math.acos(x) / D2R; }, 1, 'acosd');
  EXPR_FN.atand = fixedArity(function (x) { return Math.atan(x) / D2R; }, 1, 'atand');
  EXPR_FN.deg = fixedArity(function (x) { return x / D2R; }, 1, 'deg');
  EXPR_FN.rad = fixedArity(function (x) { return x * D2R; }, 1, 'rad');

  // isExpression(v) -> true for a string that starts with "=" (after trimming)
  function isExpression(v) { return typeof v === 'string' && /^\s*=/.test(v); }

  function tokenizeExpr(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src.charAt(i);
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
      var m;
      if ((m = /^(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i)))) {
        toks.push({ t: 'num', v: parseFloat(m[0]), s: m[0] }); i += m[0].length; continue;
      }
      if ((m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i)))) {
        toks.push({ t: 'id', v: m[0], s: m[0] }); i += m[0].length; continue;
      }
      if (c === '*' && src.charAt(i + 1) === '*') { toks.push({ t: 'op', v: '^', s: '**' }); i += 2; continue; }
      if ('+-*/^(),'.indexOf(c) >= 0) { toks.push({ t: 'op', v: c, s: c }); i++; continue; }
      throw new Error('Unexpected "' + c + '"');
    }
    return toks;
  }

  // evalExpression(expr, vars) -> number. Grammar: numbers, + - * / and ^ (right-associative; ** is accepted), unary
  // - and +, parentheses, variables from `vars`, the constants pi and e (unless a variable shadows them) and the
  // functions in EXPR_FN (angles in radians; sind/cosd/... and deg()/rad() for degrees). A leading "=" is stripped.
  // A hand-rolled recursive-descent parser: no eval, no Function.
  function evalExpression(expr, vars) {
    var src = String(expr == null ? '' : expr).replace(/^\s*=/, '');
    vars = vars || {};
    var toks = tokenizeExpr(src), pos = 0;
    function peek() { return toks[pos]; }
    function isOp(v) { var t = toks[pos]; return t && t.t === 'op' && t.v === v; }
    function next() { return toks[pos++]; }
    function expect(v) {
      var t = next();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.t !== 'op' || t.v !== v) throw new Error('Unexpected "' + t.s + '"');
    }
    function parseSum() {
      var v = parseTerm();
      while (isOp('+') || isOp('-')) { var op = next().v, r = parseTerm(); v = op === '+' ? v + r : v - r; }
      return v;
    }
    function parseTerm() {
      var v = parseUnary();
      while (isOp('*') || isOp('/')) {
        var op = next().v, r = parseUnary();
        if (op === '*') v = v * r;
        else { if (r === 0) throw new Error('Division by zero'); v = v / r; }
      }
      return v;
    }
    function parseUnary() {
      if (isOp('-')) { next(); return -parseUnary(); }
      if (isOp('+')) { next(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      var base = parseAtom();
      if (isOp('^')) { next(); var ex = parseUnary(); return Math.pow(base, ex); }
      return base;
    }
    function parseAtom() {
      var t = next();
      if (!t) throw new Error('Unexpected end of expression');
      if (t.t === 'num') return t.v;
      if (t.t === 'id') {
        if (isOp('(')) {
          next();
          var fn = EXPR_FN.hasOwnProperty(t.v) ? EXPR_FN[t.v] : null;
          if (!fn) throw new Error('Unknown function "' + t.v + '"');
          var args = [];
          if (!isOp(')')) {
            args.push(parseSum());
            while (isOp(',')) { next(); args.push(parseSum()); }
          }
          expect(')');
          return fn(args);
        }
        if (Object.prototype.hasOwnProperty.call(vars, t.v) && typeof vars[t.v] === 'number') return vars[t.v];
        if (EXPR_CONST.hasOwnProperty(t.v)) return EXPR_CONST[t.v];
        throw new Error('Unknown variable "' + t.v + '"');
      }
      if (t.v === '(') { var v = parseSum(); expect(')'); return v; }
      throw new Error('Unexpected "' + t.s + '"');
    }
    if (!toks.length) throw new Error('Unexpected end of expression');
    var value = parseSum();
    if (peek()) throw new Error('Unexpected "' + peek().s + '"');
    if (typeof value !== 'number' || !isFinite(value)) throw new Error('Result is not a number');
    return value;
  }

  // resolveEquations(model) -> { vars: { name: number }, errors: { name: message } }: model.equations evaluated in
  // order, each seeing the ones before it. A failing or invalid variable is absent from vars and named in errors.
  function resolveEquations(model) {
    var vars = {}, errors = {};
    var list = effectiveEquations(model);
    list.forEach(function (eq) {
      var name = eq && eq.name != null ? String(eq.name) : '';
      if (!EXPR_NAME.test(name)) { errors[name] = 'Invalid name "' + name + '"'; return; }
      if (Object.prototype.hasOwnProperty.call(vars, name)) { errors[name] = 'Duplicate name "' + name + '"'; return; }
      try {
        vars[name] = evalExpression(eq.expr == null ? '' : eq.expr, vars);
      } catch (e) {
        errors[name] = e.message || String(e);
      }
    });
    var ac = activeConfiguration(model);
    return { vars: vars, errors: errors, configuration: ac ? ac.name : null };
  }

  // ------------------------------------------------------------------ configurations (named sets of variable values)
  // model.configurations = [{ name: 'Small', values: { T: '6', N: '2' } }, ...]; model.activeConfiguration = 'Small'.
  // A configuration overrides the expression of each global variable it names (values are expression strings without
  // the leading "=", evaluated in the equations' order, so they may use the variables above them). Variables it does
  // not name keep model.equations' expr; a value for a name that is not an equation is ignored. No configurations, or
  // an active name that matches none, means the base equations. Everything downstream (resolvedModel, rebuild, cache
  // keys, Builder._value) goes through resolveEquations, so switching configuration rebuilds exactly the features
  // whose resolved values change.
  function configurationList(model) {
    return model && Array.isArray(model.configurations) ? model.configurations.filter(function (c) { return c && c.name != null; }) : [];
  }
  function findConfiguration(model, name) {
    var list = configurationList(model);
    for (var i = 0; i < list.length; i++) if (String(list[i].name) === String(name)) return list[i];
    return null;
  }
  // activeConfiguration(model) -> the active configuration object, or null
  function activeConfiguration(model) {
    if (!model || model.activeConfiguration == null) return null;
    return findConfiguration(model, model.activeConfiguration);
  }
  function configExpr(v) { return String(v == null ? '' : v).replace(/^\s*=\s*/, '').trim(); }
  // effectiveEquations(model) -> [{ name, expr }]: model.equations with the active configuration's values applied
  function effectiveEquations(model) {
    var list = model && Array.isArray(model.equations) ? model.equations : [];
    var ac = activeConfiguration(model), vals = ac && ac.values && typeof ac.values === 'object' ? ac.values : null;
    if (!vals) return list;
    return list.map(function (eq) {
      if (!eq || eq.name == null || !Object.prototype.hasOwnProperty.call(vals, String(eq.name))) return eq;
      return { name: eq.name, expr: configExpr(vals[String(eq.name)]) };
    });
  }
  // captureConfiguration(model) -> { name: expr } for every equation, as the active set resolves it (a new
  // configuration starts as a copy of what the model shows now)
  function captureConfiguration(model) {
    var out = {};
    effectiveEquations(model).forEach(function (eq) { if (eq && eq.name != null) out[String(eq.name)] = String(eq.expr == null ? '' : eq.expr); });
    return out;
  }
  // applyEquations(model, list) -> model: write an edited equation list ([{ name, expr }], e.g. from the Equations
  // dialog) back. With no active configuration it replaces model.equations (an empty list deletes it). With one, the
  // list's names and order become model.equations; a variable the active configuration names gets its new expr in
  // that configuration only (the base expr and the other configurations keep theirs), any other variable gets it in
  // model.equations. A name dropped from the list is dropped from every configuration's values too.
  function applyEquations(model, list) {
    list = (list || []).filter(function (q) { return q && q.name != null && String(q.name) !== ''; })
      .map(function (q) { return { name: String(q.name), expr: String(q.expr == null ? '' : q.expr) }; });
    var ac = activeConfiguration(model), vals = ac ? (ac.values && typeof ac.values === 'object' ? ac.values : (ac.values = {})) : null;
    var base = {};
    (Array.isArray(model.equations) ? model.equations : []).forEach(function (q) { if (q && q.name != null) base[String(q.name)] = q; });
    var names = {};
    var out = list.map(function (q) {
      names[q.name] = true;
      if (vals && Object.prototype.hasOwnProperty.call(vals, q.name)) {
        vals[q.name] = q.expr;
        var old = base[q.name];
        return old ? old : { name: q.name, expr: q.expr };
      }
      var o = {}, b = base[q.name];
      if (b) Object.keys(b).forEach(function (k) { o[k] = b[k]; }); // extra fields ride along
      o.name = q.name; o.expr = q.expr;
      return o;
    });
    configurationList(model).forEach(function (c) {
      if (c.values && typeof c.values === 'object') Object.keys(c.values).forEach(function (k) { if (!names[k]) delete c.values[k]; });
    });
    if (out.length) model.equations = out; else delete model.equations;
    return model;
  }

  function cloneValue(v) {
    if (Array.isArray(v)) return v.map(cloneValue);
    if (v && typeof v === 'object') { var o = {}; Object.keys(v).forEach(function (k) { o[k] = cloneValue(v[k]); }); return o; }
    return v;
  }
  function resolveValue(v, vars, path) {
    if (isExpression(v)) {
      try { return evalExpression(v, vars); } catch (e) { throw new Error(path + ': ' + (e.message || String(e))); }
    }
    if (Array.isArray(v)) return v.map(function (x, i) { return resolveValue(x, vars, path + '.' + i); });
    if (v && typeof v === 'object') {
      var o = {};
      Object.keys(v).forEach(function (k) {
        // a computed sketch profile is shared, not copied: rebuild replaces it wholesale and never edits it in place
        o[k] = k === 'profile' ? v[k] : EXPR_SKIP[k] ? cloneValue(v[k]) : resolveValue(v[k], vars, path ? path + '.' + k : k);
      });
      return o;
    }
    return v;
  }
  // resolveFeature(f, vars) -> a deep copy of f with every "=" string replaced by its value; throws
  // "<field>: <message>" (nested fields as dir2.depth) for the first field that fails.
  function resolveFeature(f, vars) { return resolveValue(f, vars || {}, ''); }
  // hasExpressions(f) -> true when the feature holds any "=" string outside the skipped keys
  function hasExpressions(f) {
    if (isExpression(f)) return true;
    if (Array.isArray(f)) { for (var i = 0; i < f.length; i++) if (hasExpressions(f[i])) return true; return false; }
    if (f && typeof f === 'object') {
      var ks = Object.keys(f);
      for (var j = 0; j < ks.length; j++) if (!EXPR_SKIP[ks[j]] && hasExpressions(f[ks[j]])) return true;
    }
    return false;
  }
  // ------------------------------------------------------------------ rfOD: sketch dimensions driven by variables
  // A sketch dimension (sketch.dims[i], or a distance / angle relation) may carry expr: '=W' (sketchflow2: typed as
  // "=W" in the Modify box; the Design Table links its D1@Sketch1 columns the same way). The UI re-solves the model's
  // sketch before each rebuild (UI.syncSketchDimExprs); resolvedModel does it too, on a copy, so the kernel alone (the
  // headless runner, a configuration's flat pattern) builds each configuration with its own values. Dimension names
  // follow ui-sketch-dims.js: D<n> in the order Smart Dimensions, then the dimension relations, unless d.name is set.
  var DIM_REL_TYPES = { distance: 1, angle: 1, arclength: 1, chamfer: 1, pathlength: 1, runangle: 1 };
  function sketchDimItems(sk) {
    var out = [], T = typeof SketchSolver !== 'undefined' && SketchSolver.TYPES;
    (sk.dims || []).forEach(function (d, i) { if (d) out.push({ src: 'dim', index: i, d: d }); });
    // rfPR: the worker has no SketchSolver until a sketch needs one: the dimension relation types are known here too,
    // or D<n> numbering and named relations went missing there (an equation naming a distance: Unknown dimension)
    (sk.rels || []).forEach(function (r, i) { if (r && (T && T[r.type] ? T[r.type].dim : DIM_REL_TYPES[r.type])) out.push({ src: 'rel', index: i, d: r }); });
    out.forEach(function (it, k) { it.name = it.d.name ? String(it.d.name) : 'D' + (k + 1); });
    return out;
  }
  // the value a dimension shows (a diameter shown as a radius reads half)
  function sketchDimScale(d) { return d.k === 'dia' && d.show === 'r' ? 0.5 : d.k === 'r' && d.show === 'dia' ? 2 : 1; }
  function sketchDimValue(sk, it) {
    if (it.src === 'rel') return +it.d.v;
    var e = sk.entities && sk.entities[it.d.e];
    return e && K.dimValue ? K.dimValue(e, it.d) * sketchDimScale(it.d) : NaN;
  }
  var sketchSolveCache = [];
  // sketchWithExprs(orig, r, vars) -> null (nothing to change), { sketch } (a solved copy of r) or { error }
  // rfPR (lane sketchflow6): an equation naming sketch dimensions, as the Modify box keeps it ("D1@Sketch1"/2, stored
  // without its "=" so resolveValue leaves it alone; ui-sketch-dims.js parseLinked): the quoted or X@Sketch names, and a
  // bare name that is no variable, constant or function, of sketch `here`, become placeholder variables valued by
  // value(name, sketchName). Returns the expression for evalExpression and its variables, or null (no name in it).
  function linkedExpr(text, hereName, vars, value) {
    var s = String(text == null ? '' : text).trim().replace(/^=\s*/, ''), named = false, own = {}, n = 0, err = null;
    Object.keys(vars || {}).forEach(function (k) { own[k] = vars[k]; });
    function sub(name, strict) {
      var m = /^\s*([^@]+?)\s*(?:@\s*(.+?)\s*)?$/.exec(name), v = m ? value(m[1], m[2] || hereName) : null;
      if (v == null || !isFinite(v)) { if (strict) err = err || 'Unknown dimension "' + name + '"'; return null; }
      var id = '_sd' + (n++); own[id] = v; named = true; return id;
    }
    var out = s.replace(/"([^"]*)"|([A-Za-z_]\w*@\w+)|([A-Za-z_]\w*)(?=\s*(\()?)/g, function (m0, q, at, id, call) {
      if (q != null) { if (!/@/.test(q) && Object.prototype.hasOwnProperty.call(own, q)) return q; return sub(q, true) || m0; }
      if (at != null) return sub(at, true) || m0;
      if (call || Object.prototype.hasOwnProperty.call(own, id) || EXPR_CONST.hasOwnProperty(id)) return m0;
      return sub(id, false) || m0;
    });
    if (err) throw new Error(err);
    return named ? { expr: out, vars: own } : null;
  }
  // value(name, sketchName) for linkedExpr: a dimension's value in that sketch, from `targets` (values this resolve is
  // setting, keyed sketch name -> item name) first, then the resolved sketches (`done`), then the model
  function dimLookup(model, done, targets) {
    return function (name, skName) {
      var tk = targets && targets[skName];
      if (tk && Object.prototype.hasOwnProperty.call(tk, name)) return tk[name];
      var sk = done && done[skName];
      if (!sk) sk = (model.features || []).filter(function (x) { return x && x.type === 'sketch' && x.name === skName; })[0];
      if (!sk) return null;
      var items = sketchDimItems(sk), it = items.filter(function (x) { return x.d.name != null && String(x.d.name) === name; })[0] || items.filter(function (x) { return x.d.name == null && x.name === name; })[0];
      return it ? sketchDimValue(sk, it) : null;
    };
  }
  function linkedItem(d) { var s = d && d.expr != null ? String(d.expr) : ''; return !!s && (isExpression(s) || /"|@/.test(s)); }
  function sketchWithExprs(orig, r, vars, ctx) {
    var items = sketchDimItems(orig).filter(function (it) { return it.d.expr && linkedItem(it.d) && !it.d.driven; });
    if (!items.length) return null;
    // rfPR: values in passes, so an equation of another linked dimension of this sketch reads its new value
    var mine = {}, look = dimLookup(ctx && ctx.model || { features: [orig] }, ctx && ctx.done, (function () { var o = {}; o[orig.name] = mine; return o; })());
    var vals = [];
    for (var pass = 0; pass < 8; pass++) {
      var moved = false;
      for (var i = 0; i < items.length; i++) {
        var it = items[i], v;
        try {
          var lk = linkedExpr(it.d.expr, orig.name, vars, look);
          v = lk ? evalExpression(lk.expr, lk.vars) : evalExpression(String(it.d.expr), vars);
        } catch (e) { return { error: it.name + '@' + orig.name + ': ' + (e.message || String(e)) }; }
        if (!isFinite(v)) return { error: it.name + '@' + orig.name + ' is not a number' };
        if (vals[i] == null || Math.abs(vals[i] - v) > 1e-12 * Math.max(1, Math.abs(v))) { vals[i] = v; mine[it.name] = v; moved = true; }
      }
      if (!moved) break;
    }
    var todo = [];
    items.forEach(function (it, i) {
      var v = vals[i], cur = sketchDimValue(orig, it);
      if (!(Math.abs(v - cur) <= 1e-9 * Math.max(1, Math.abs(v)))) todo.push({ it: it, v: v });
    });
    if (!todo.length) return null;
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null;
    var what = todo.map(function (t) { return t.it.name + '@' + orig.name + ' = ' + (Math.round(t.v * 1e6) / 1e6); }).join(', ');
    if (!S || !S.setDim) return { error: orig.name + ' cannot take ' + what + ': the sketch\'s relations or dimensions do not allow it.' };
    var key = orig.id + '|' + what + '|' + JSON.stringify(orig.entities) + JSON.stringify(orig.dims || []) + JSON.stringify(orig.rels || []);
    for (var c = 0; c < sketchSolveCache.length; c++) if (sketchSolveCache[c].key === key) return sketchSolveCache[c].out;
    var copy = {};
    Object.keys(r).forEach(function (k) { if (k !== 'profile') copy[k] = k === 'entities' || k === 'dims' || k === 'rels' ? cloneValue(orig[k]) : r[k]; });
    var out = null;
    if (todo.length > 1 && S.solve) {
      // several values at once (a configuration changes width and depth): one solve with every target, so a value
      // that is only reachable together with another (a line's length and its horizontal distance) is not refused
      var dimT = {}, relT = {}, saved = cloneValue(copy.entities);
      todo.forEach(function (t) {
        if (t.it.src === 'rel') { relT[t.it.index] = t.v; return; }
        var e = copy.entities[t.it.d.e], v1 = t.v / sketchDimScale(t.it.d);
        dimT[t.it.index] = v1;
        try { if (e) K.setDimValue(e, t.it.d, v1); } catch (x) { }
      });
      var all;
      try { all = S.solve(copy, { dimTargets: dimT, relTargets: relT }); } catch (x) { all = null; }
      if (all && all.ok) {
        todo.forEach(function (t) { if (t.it.src === 'rel') copy.rels[t.it.index].v = t.v; });
        todo = [];
      } else copy.entities = saved;
    }
    for (var j = 0; j < todo.length && !out; j++) {
      var t = todo[j], res;
      try { res = t.it.src === 'rel' ? S.setRelValue(copy, t.it.index, t.v) : S.setDim(copy, t.it.index, t.v / sketchDimScale(t.it.d)); } catch (e) { res = { ok: false, error: e.message || String(e) }; }
      if (!res || !res.ok) out = { error: t.it.name + '@' + orig.name + ' = ' + (Math.round(t.v * 1e6) / 1e6) + ': ' + ((res && res.error) || 'the sketch cannot take this value.') };
    }
    if (!out) out = { sketch: copy };
    sketchSolveCache.push({ key: key, out: out });
    if (sketchSolveCache.length > 16) sketchSolveCache.shift();
    return out;
  }
  K.sketchDimItems = function (sk) { return sketchDimItems(sk).map(function (it) { return { src: it.src, index: it.index, name: it.name, driven: !!it.d.driven, expr: it.d.expr || null, value: sketchDimValue(sk, it) }; }); };

  // resolvedModel(model) -> { model: rm, vars, errors, featureErrors: { id: message }, sheetError }: a shallow copy of
  // the model whose features and sheet parameters have their expressions evaluated. A feature without expressions
  // is the original object (so rebuild's sketch profiles land on the model as before); one that fails to resolve
  // stays the original and is named in featureErrors. Nothing on the original model is changed.
  function resolvedModel(model) {
    var eq = resolveEquations(model), vars = eq.vars, featureErrors = {}, sheetError = null;
    var rm = {}, sup = suppressedIds(model);   // rfFC: suppressed features (own, per configuration, with their children)
    Object.keys(model).forEach(function (k) { rm[k] = model[k]; });
    var done = {};   // rfPR: sketch name -> its resolved copy, for equations naming an earlier sketch's dimensions
    rm.features = model.features.map(function (f) {
      if (sup[f.id]) return f.suppressed ? f : suppressedCopy(f, true);
      var r = f;
      if (hasExpressions(f)) try { r = resolveFeature(f, vars); } catch (e) { featureErrors[f.id] = e.message || String(e); }
      if (f.type === 'sketch' && !featureErrors[f.id]) {   // rfOD: sketch dimensions linked to variables (Design Table)
        var sx = sketchWithExprs(f, r, vars, { model: model, done: done });
        if (sx && sx.error) featureErrors[f.id] = sx.error; else if (sx) r = sx.sketch;
      }
      if (f.type === 'sketch' && f.name) done[f.name] = r;
      return f.suppressed ? suppressedCopy(r, false) : r;   // rfFC: unsuppressed in the active configuration
    });
    if (model.sheet && hasExpressions(model.sheet)) {
      try { rm.sheet = resolveFeature(model.sheet, vars); } catch (e) { sheetError = 'sheet.' + (e.message || String(e)); }
    }
    return { model: rm, vars: vars, errors: eq.errors, featureErrors: featureErrors, sheetError: sheetError, configuration: eq.configuration, suppressed: sup };
  }

  // ------------------------------------------------------------------ rfFC: feature suppression (SolidWorks Suppress)
  // A feature is suppressed by `f.suppressed: true` (every configuration that does not say otherwise) and per
  // configuration by `configuration.suppressed = { <feature id>: true | false }` (true: suppressed there, false:
  // unsuppressed there even when f.suppressed). A feature whose parent (its sketch, pattern seed, sketch plane, face
  // sketch's feature, reference axis …) is suppressed is suppressed with it. resolvedModel hands the rebuild copies
  // with `suppressed: true` (and without it for an unsuppressed one), so both kernels skip them by that flag alone.
  function hasOwn(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }
  function suppressedCopy(f, on) {
    var c = {};
    Object.keys(f).forEach(function (k) { c[k] = f[k]; });
    if (on) c.suppressed = true; else delete c.suppressed;
    return c;
  }
  // featureParents(f) -> [feature id]: the features f references by id
  function featureParents(f) {
    var out = [];
    function add(x) { if (typeof x === 'number' && isFinite(x)) out.push(x); else if (typeof x === 'string' && /^ref:\d+$/.test(x)) out.push(+x.slice(4)); }
    ['sketch', 'feature', 'path', 'axisRef'].forEach(function (k) { add(f[k]); });
    if (typeof f.axis === 'string') add(f.axis);   // 'ref:<id>' (a revolve's numeric axis is a sketch entity index)
    if (f.type !== 'sketch') add(f.profile);
    ['sketches', 'features', 'guides', 'profiles'].forEach(function (k) { if (Array.isArray(f[k])) f[k].forEach(add); });
    if (f.plane && typeof f.plane === 'object') { add(f.plane.featureId); if (f.plane.face) add(f.plane.face.feature); }
    var refs = (Array.isArray(f.refs) ? f.refs : []).concat(['origin', 'x', 'y', 'z'].map(function (k) { return f[k]; }));
    refs.forEach(function (r) { if (r && typeof r === 'object' && !Array.isArray(r)) ['plane', 'axis', 'point', 'sketch'].forEach(function (k) { add(r[k]); }); });
    return out.filter(function (id) { return id !== f.id; });
  }
  // ownSuppressed(model, f, cfg?) -> the feature's own state in configuration cfg (default: the active one)
  function ownSuppressed(model, f, cfg) {
    var c = cfg === undefined ? activeConfiguration(model) : cfg, map = c && c.suppressed;
    if (map && hasOwn(map, String(f.id))) return !!map[String(f.id)];
    return !!f.suppressed;
  }
  // suppressedIds(model, cfgName?) -> { id: true } for every feature suppressed in that configuration (default: the
  // active one), its own state or a parent's
  function suppressedIds(model, cfgName) {
    var cfg = cfgName === undefined ? activeConfiguration(model) : (cfgName == null ? null : findConfiguration(model, cfgName));
    var out = {};
    (model && model.features || []).forEach(function (f) {
      if (ownSuppressed(model, f, cfg) || featureParents(f).some(function (id) { return out[id]; })) out[f.id] = true;
    });
    return out;
  }
  // featureChildren(model, id) -> [id]: every later feature that references id by id, directly or further down
  function featureChildren(model, id) {
    var set = {}, out = [];
    set[id] = true;
    (model.features || []).forEach(function (f) {
      if (f.id !== id && featureParents(f).some(function (p) { return set[p]; })) { set[f.id] = true; out.push(f.id); }
    });
    return out;
  }
  // featureAncestors(model, id) -> [id]: the features id needs (its parents, theirs …)
  function featureAncestors(model, id) {
    var out = [], seen = {}, stack = [id];
    while (stack.length) {
      var f = findFeatureById(model, stack.pop());
      if (!f) continue;
      featureParents(f).forEach(function (p) { if (!seen[p]) { seen[p] = true; out.push(p); stack.push(p); } });
    }
    return out;
  }
  function findFeatureById(model, id) { var fs = model.features || []; for (var i = 0; i < fs.length; i++) if (fs[i].id === id) return fs[i]; return null; }
  // setSuppressed(model, ids, on, scope?) -> model. scope: 'all' (default without configurations: f.suppressed, the
  // per-configuration overrides of those features cleared), 'this' (the active configuration; f.suppressed when there
  // is none), or [names] (those configurations; the others keep the state they show now).
  function setSuppressed(model, ids, on, scope) {
    ids = (Array.isArray(ids) ? ids : [ids]).map(Number);
    var list = configurationList(model), ac = activeConfiguration(model);
    if (scope == null) scope = 'all';
    if (scope === 'this' && !ac) scope = 'all';
    var names = scope === 'all' ? null : scope === 'this' ? [String(ac.name)] : (Array.isArray(scope) ? scope : [scope]).map(String);
    ids.forEach(function (id) {
      var f = findFeatureById(model, id);
      if (!f) return;
      if (!names) {
        if (on) f.suppressed = true; else delete f.suppressed;
        list.forEach(function (c) { if (c.suppressed) delete c.suppressed[String(id)]; });
        return;
      }
      // the configurations not named keep what they show now; the named ones get the new state
      list.forEach(function (c) {
        var named = names.indexOf(String(c.name)) >= 0, now = ownSuppressed(model, f, c);
        var want = named ? !!on : now;
        if (want === !!f.suppressed) { if (c.suppressed) delete c.suppressed[String(id)]; }
        else (c.suppressed = c.suppressed || {})[String(id)] = want;
      });
    });
    list.forEach(function (c) { if (c.suppressed && !Object.keys(c.suppressed).length) delete c.suppressed; });
    return model;
  }


  // ------------------------------------------------------------------ rfFC: design table (SolidWorks Insert ▸ Tables ▸ Design Table)
  // A grid of strings: grid[0] = header ['', col1, col2 …], grid[r] = [configuration name, cell …]. A column is a global
  // variable ('W'), a feature dimension ('D1@Boss-Extrude1' in the feature's DIM_FIELDS order, or '<field>@<feature>',
  // e.g. 'depth@Boss-Extrude1'), or a suppression state ('$STATE@Cut-Extrude1', cells S / U). A dimension column is
  // driven through a global variable: Apply links the field to one ('=D1_Boss_Extrude1', made with `dim` naming the
  // column) unless the field already reads '=<variable>'. Values are expressions without the leading '=' (they may use
  // the variables to their left in the equations' order).
  var DIM_FIELDS = { extrude: ['depth', 'depth2', 'draft'], revolve: ['angle'], fillet: ['r'], chamfer: ['d', 'd2', 'angle'], shell: ['thickness'],
    lpattern: ['s1', 'n1', 's2', 'n2'], cpattern: ['n', 'angle'], plane: ['offset'], hole: ['depth'], flange: ['length', 'angle'],
    jog: ['height', 'length', 'angle'], sketchedBend: ['angle'], mirror: ['offset'] };
  function featureByName(model, name) { var fs = model.features || []; for (var i = 0; i < fs.length; i++) if (String(fs[i].name) === String(name)) return fs[i]; return null; }
  function eqList(model) { return Array.isArray(model.equations) ? model.equations : []; }
  function eqByName(model, n) { var l = eqList(model); for (var i = 0; i < l.length; i++) if (l[i] && String(l[i].name) === String(n)) return l[i]; return null; }
  // parseColumn(model, label) -> { kind: 'var' | 'dim' | 'state', label, name?, feature?, field? } or { error }
  function parseColumn(model, label) {
    var s = String(label == null ? '' : label).trim();
    if (!s) return { error: 'Empty column header' };
    var at = s.indexOf('@');
    if (at < 0) {
      var linked = eqList(model).filter(function (q) { return q && q.dim && String(q.name) === s; })[0];
      if (!EXPR_NAME.test(s)) return { error: '"' + s + '" is not a variable name (letters, digits, _), a D1@Feature dimension or $STATE@Feature' };
      return { kind: 'var', label: s, name: s, linked: !!linked };
    }
    var head = s.slice(0, at), fname = s.slice(at + 1), f = featureByName(model, fname);
    if (/^sheet-?metal$/i.test(fname) && !f) return { error: SHEET_T_REASON };   // rfOD: Thickness@Sheet-Metal
    if (!f) return { error: 'No feature named "' + fname + '"' };
    if (/^\$state$/i.test(head)) return { kind: 'state', label: '$STATE@' + f.name, feature: f.id };
    if (f.type === 'sketch') {   // rfOD: D1@Sketch1, a sketch dimension (by its name), driven through a variable
      var items = sketchDimItems(f), it = null;
      for (var q = 0; q < items.length; q++) if (items[q].name.toLowerCase() === head.toLowerCase()) it = items[q];
      if (!it) return { error: f.name + ' has no dimension ' + head };
      if (it.d.driven) return { error: head + '@' + f.name + ' is a driven dimension: make it driving to configure it' };
      return { kind: 'sdim', label: it.name + '@' + f.name, feature: f.id, src: it.src, index: it.index };
    }
    if (f.sheetBase && (/^D1$/i.test(head) || head === 'depth')) return { error: head + '@' + f.name + ' is the sheet thickness. ' + SHEET_T_REASON };
    var field = null, dm = /^D(\d+)$/i.exec(head);
    if (dm) { field = (DIM_FIELDS[f.type] || [])[+dm[1] - 1]; if (!field) return { error: f.name + ' has no dimension D' + dm[1] }; }
    else field = head;
    var v = f[field];
    if (v == null || !(typeof v === 'number' || isExpression(v))) return { error: f.name + ' has no numeric value "' + head + '"' };
    return { kind: 'dim', label: s, feature: f.id, field: field };
  }
  // rfOD: why the sheet thickness is not a Design Table column (SolidWorks' Thickness@Sheet-Metal1)
  var SHEET_T_REASON = 'The thickness belongs to the Sheet-Metal parameters (gauge, bend radius and allowance go with it): a Design Table does not drive it yet; make one part per gauge';
  function sdimItem(model, col) {
    var f = findFeatureById(model, col.feature);
    return f ? (col.src === 'rel' ? (f.rels || [])[col.index] : (f.dims || [])[col.index]) : null;
  }
  // the variable that drives a dimension column now ('=W' in the field), or null
  function dimVar(model, col) {
    if (col.kind === 'sdim') {
      var di = sdimItem(model, col), mm = di && isExpression(di.expr) && /^\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(di.expr);
      return mm && eqByName(model, mm[1]) ? mm[1] : null;
    }
    var f = findFeatureById(model, col.feature), v = f && f[col.field];
    var m = isExpression(v) && /^\s*=\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/.exec(v);
    return m && eqByName(model, m[1]) ? m[1] : null;
  }
  function cellOfVar(model, cfg, name) {
    if (cfg && cfg.values && hasOwn(cfg.values, name)) return configExpr(cfg.values[name]);
    var q = eqByName(model, name);
    return q ? configExpr(q.expr) : '';
  }
  // designTable(model) -> grid: the configurations as rows (none: one row named for the model's state now, 'Default'),
  // columns = every global variable (a dimension-linked one under its D1@Feature name), then $STATE@ of every feature
  // suppressed in any configuration
  function designTable(model) {
    var cols = [], seenVar = {};
    eqList(model).forEach(function (q) { if (!q || q.name == null) return; seenVar[q.name] = true; cols.push(q.dim ? q.dim : String(q.name)); });
    var cfgs = configurationList(model), stateIds = {};
    (model.features || []).forEach(function (f) {
      if (f.suppressed) stateIds[f.id] = true;
      cfgs.forEach(function (c) { if (c.suppressed && hasOwn(c.suppressed, String(f.id))) stateIds[f.id] = true; });
    });
    (model.features || []).forEach(function (f) { if (stateIds[f.id]) cols.push('$STATE@' + f.name); });
    var rows = cfgs.length ? cfgs : [null];
    var grid = [[''].concat(cols)];
    rows.forEach(function (c) {
      var row = [c ? String(c.name) : 'Default'];
      cols.forEach(function (label) { row.push(tableCell(model, label, c)); });
      grid.push(row);
    });
    return grid;
  }
  // tableCell(model, label, cfg) -> the cell text of column `label` as configuration cfg (null: the base) shows it
  function tableCell(model, label, c) {
    var col = parseColumn(model, label);
    if (col.kind === 'state') return ownSuppressed(model, findFeatureById(model, col.feature), c) ? 'S' : 'U';
    if (col.kind === 'sdim') {   // rfOD: its variable, else the value the sketch shows now
      var sv = dimVar(model, col) || (eqList(model).filter(function (q) { return q.dim === col.label; })[0] || {}).name;
      if (sv) return cellOfVar(model, c, sv);
      var sk = findFeatureById(model, col.feature), its = sketchDimItems(sk).filter(function (x) { return x.src === col.src && x.index === col.index; })[0];
      return its ? String(Math.round(sketchDimValue(sk, its) * 1e9) / 1e9) : '';
    }
    if (col.kind === 'dim') {
      var dv = dimVar(model, col) || (eqList(model).filter(function (q) { return q.dim === col.label; })[0] || {}).name;
      var raw = findFeatureById(model, col.feature)[col.field];
      return dv ? cellOfVar(model, c, dv) : isExpression(raw) ? configExpr(raw) : String(raw);
    }
    return col.kind ? cellOfVar(model, c, col.name) : '';
  }
  K.designTableCell = function (model, label, cfgName) { return tableCell(model, label, cfgName == null ? null : findConfiguration(model, cfgName)); };
  function stateCell(v) {
    var s = String(v == null ? '' : v).trim().toLowerCase();
    if (s === 's' || s === 'suppressed' || s === '1' || s === 'true' || s === 'yes') return true;
    if (s === 'u' || s === 'unsuppressed' || s === 'resolved' || s === 'r' || s === '0' || s === 'false' || s === 'no' || s === '') return false;
    return null;
  }
  // applyDesignTable(model, grid) -> { ok, errors: [{ row, col, message }] (grid indices), created: [variable] }. Writes
  // the configurations (and links / creates the variables of dimension columns) only when every cell is good.
  function applyDesignTable(model, grid) {
    var errors = [], created = [];
    function bad(r, c, msg) { errors.push({ row: r, col: c, message: msg }); }
    grid = (Array.isArray(grid) ? grid : []).map(function (r) { return (Array.isArray(r) ? r : []).map(function (x) { return x == null ? '' : String(x); }); });
    if (!grid.length) return { ok: false, errors: [{ row: 0, col: 0, message: 'The table is empty' }], created: created };
    var head = grid[0], cols = [], seenCol = {};
    for (var c = 1; c < head.length; c++) {
      if (String(head[c]).trim() === '') { cols.push(null); continue; }
      var pc = parseColumn(model, head[c]);
      if (pc.error) { bad(0, c, pc.error); cols.push(null); continue; }
      if (seenCol[pc.label]) { bad(0, c, 'Column "' + pc.label + '" appears twice'); cols.push(null); continue; }
      seenCol[pc.label] = true;
      cols.push(pc);
    }
    var rows = grid.slice(1).filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); }), seenRow = {};
    rows.forEach(function (r, i) {
      var n = String(r[0] || '').trim();
      if (!n) bad(i + 1, 0, 'A configuration needs a name');
      else if (seenRow[n]) bad(i + 1, 0, 'Configuration "' + n + '" appears twice');
      seenRow[n] = true;
    });
    if (errors.length) return { ok: false, errors: errors, created: created };
    // the trial model: a deep copy with the dimension columns linked and the new configurations written
    var t = JSON.parse(JSON.stringify(model, function (k, v) { return k === 'profile' ? undefined : v; }));
    if (!Array.isArray(t.equations)) t.equations = [];
    var colVar = cols.map(function (col, ci) {
      if (!col || col.kind === 'state') return null;
      if (col.kind === 'var') {
        if (!eqByName(t, col.name)) { t.equations.push({ name: col.name, expr: configExpr(rows.length ? rows[0][ci + 1] : '0') || '0' }); created.push(col.name); }
        return col.name;
      }
      var have = dimVar(t, col) || (eqList(t).filter(function (q) { return q.dim === col.label; })[0] || {}).name;
      var f = findFeatureById(t, col.feature);
      if (!have) {
        var base = (head0(col.label) + '_' + String(f.name)).replace(/[^A-Za-z0-9_]/g, '_').replace(/^([^A-Za-z_])/, '_$1'), nm = base;
        for (var k = 2; eqByName(t, nm); k++) nm = base + '_' + k;
        var cur = col.kind === 'sdim' ? tableCell(t, col.label, null) : f[col.field];
        t.equations.push({ name: nm, expr: isExpression(cur) ? configExpr(cur) : String(cur), dim: col.label });
        created.push(nm);
        have = nm;
      }
      if (col.kind === 'sdim') sdimItem(t, col).expr = '=' + have;   // rfOD: the sketch dimension follows the variable
      else f[col.field] = '=' + have;
      return have;
    });
    function head0(label) { return String(label).split('@')[0]; }
    var old = {};
    configurationList(t).forEach(function (cf) { old[String(cf.name)] = cf; });
    t.configurations = rows.map(function (r) {
      var name = String(r[0]).trim(), was = old[name], cf = { name: name, values: was && was.values ? JSON.parse(JSON.stringify(was.values)) : {} };
      if (was && was.suppressed) cf.suppressed = JSON.parse(JSON.stringify(was.suppressed));
      return cf;
    });
    rows.forEach(function (r, i) {
      var cf = t.configurations[i];
      cols.forEach(function (col, ci) {
        if (!col) return;
        var cell = r[ci + 1] == null ? '' : String(r[ci + 1]).trim();
        if (col.kind === 'state') {
          var s = stateCell(cell);
          if (s == null) { bad(i + 1, ci + 1, '"' + cell + '": use S (suppressed) or U (unsuppressed)'); return; }
          var f = findFeatureById(t, col.feature), key = String(col.feature);
          if (s === !!f.suppressed) { if (cf.suppressed) delete cf.suppressed[key]; }
          else (cf.suppressed = cf.suppressed || {})[key] = s;
          return;
        }
        if (cell === '') { bad(i + 1, ci + 1, 'Enter a value'); return; }
        cf.values[colVar[ci]] = configExpr(cell);
      });
      if (cf.suppressed && !Object.keys(cf.suppressed).length) delete cf.suppressed;
    });
    // every row resolved as its configuration: a variable that fails names its cell
    rows.forEach(function (r, i) {
      t.activeConfiguration = t.configurations[i].name;
      var res = resolveEquations(t);
      cols.forEach(function (col, ci) {
        if (!col || col.kind === 'state' || errors.some(function (e) { return e.row === i + 1 && e.col === ci + 1; })) return;
        var err = res.errors[colVar[ci]];
        if (err) bad(i + 1, ci + 1, err);
        else if ((col.kind === 'dim' || col.kind === 'sdim') && !(isFinite(res.vars[colVar[ci]]))) bad(i + 1, ci + 1, 'Not a number');
        else if (col.kind === 'sdim' && !(res.vars[colVar[ci]] > 0) && sdimItem(t, col) && sdimItem(t, col).k !== 'angle') bad(i + 1, ci + 1, 'A sketch dimension must be greater than 0');
      });
    });
    if (errors.length) return { ok: false, errors: errors, created: [] };
    // write it back: equations, the linked feature fields, the configurations and the active one
    model.equations = t.equations;
    if (!model.equations.length) delete model.equations;
    cols.forEach(function (col) {
      if (col && col.kind === 'dim') findFeatureById(model, col.feature)[col.field] = findFeatureById(t, col.feature)[col.field];
      if (col && col.kind === 'sdim') sdimItem(model, col).expr = sdimItem(t, col).expr;   // rfOD
    });
    if (t.configurations.length) {
      model.configurations = t.configurations;
      if (model.activeConfiguration == null || !findConfiguration(model, model.activeConfiguration)) model.activeConfiguration = t.configurations[0].name;
    } else { delete model.configurations; delete model.activeConfiguration; }
    return { ok: true, errors: [], created: created };
  }
  // grid <-> tab-separated text (what Excel copies and pastes)
  function gridToTSV(grid) { return grid.map(function (r) { return r.map(function (x) { return String(x == null ? '' : x).replace(/[\t\r\n]+/g, ' '); }).join('\t'); }).join('\r\n'); }
  function tsvToGrid(text) {
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    while (lines.length && lines[lines.length - 1].trim() === '') lines.pop();
    var g = lines.map(function (l) { return l.split('\t').map(function (x) { return x.replace(/^"(.*)"$/, '$1').trim(); }); });
    var w = g.reduce(function (m, r) { return Math.max(m, r.length); }, 0);
    g.forEach(function (r) { while (r.length < w) r.push(''); });
    return g;
  }
  // rfOD: designTableColumns(model, used?) -> what the Design Table's Add Column list offers, in tree order:
  // [{ label, group, disabled?, reason? }]. group: '' for the global variables, else the feature's name; a sketch's
  // dimensions are grouped under the feature built from it ('Base-Flange1 (Sketch1)'). A sheet-metal Base Flange's
  // D1 (the sheet thickness) is a disabled row with the reason. `used` (labels already in the table) are left out.
  function designTableColumns(model, used) {
    used = used || {};
    var out = [];
    function add(label, group, reason) { if (used[label]) return; var o = { label: label, group: group }; if (reason) { o.disabled = true; o.reason = reason; } out.push(o); }
    eqList(model).forEach(function (q) { if (q && q.name != null) add(q.dim || String(q.name), ''); });
    var fs = model.features || [], consumer = {};
    fs.forEach(function (f) {
      if (f.type === 'sketch') return;
      [f.sketch].concat(Array.isArray(f.sketches) ? f.sketches : []).forEach(function (id) { if (id != null && consumer[id] == null) consumer[id] = f; });
    });
    fs.forEach(function (f) {
      if (f.type === 'sketch') {
        var g = consumer[f.id] ? consumer[f.id].name + ' (' + f.name + ')' : f.name;
        sketchDimItems(f).forEach(function (it) { add(it.name + '@' + f.name, g, it.d.driven ? 'A driven dimension: its value follows the geometry' : null); });
        return;
      }
      (DIM_FIELDS[f.type] || []).forEach(function (fld, i) {
        if (f[fld] == null) return;
        add('D' + (i + 1) + '@' + f.name, f.name, f.sheetBase && fld === 'depth' ? 'The sheet thickness. ' + SHEET_T_REASON : null);
      });
      add('$STATE@' + f.name, f.name);
    });
    if (model.sheet) add('Thickness@Sheet-Metal', 'Sheet-Metal', SHEET_T_REASON);
    return out;
  }
  K.designTableColumns = designTableColumns;
  K.DIM_FIELDS = DIM_FIELDS; K.designTable = designTable; K.applyDesignTable = applyDesignTable; K.designTableColumn = function (model, label) { return parseColumn(model, label); };
  K.gridToTSV = gridToTSV; K.tsvToGrid = tsvToGrid;

  // ------------------------------------------------------------------ public API (Kernel.*)
  K.isExpression = isExpression; K.evalExpression = evalExpression; K.resolveEquations = resolveEquations; K.resolvedModel = resolvedModel;
  K.resolveFeature = resolveFeature; K.hasExpressions = hasExpressions; K.configurationList = configurationList;
  K.findConfiguration = findConfiguration; K.activeConfiguration = activeConfiguration; K.effectiveEquations = effectiveEquations;
  K.captureConfiguration = captureConfiguration; K.applyEquations = applyEquations; K.EXPR_FUNCTIONS = Object.keys(EXPR_FN);
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.configExpr = configExpr; _.evalExpression = evalExpression; _.findConfiguration = findConfiguration; _.isExpression = isExpression;
  _.resolveEquations = resolveEquations; _.resolvedModel = resolvedModel;
  // rfFC: feature suppression
  K.suppressedIds = suppressedIds; K.isSuppressed = function (model, id, cfgName) { return !!suppressedIds(model, cfgName)[id]; };
  K.featureParents = featureParents; K.featureChildren = featureChildren; K.featureAncestors = featureAncestors;
  K.setSuppressed = setSuppressed; K.ownSuppressed = function (model, f, cfgName) { return ownSuppressed(model, f, cfgName === undefined ? undefined : cfgName == null ? null : findConfiguration(model, cfgName)); };
})(Kernel, Kernel._);
