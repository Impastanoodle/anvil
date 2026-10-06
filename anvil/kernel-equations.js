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
  // resolvedModel(model) -> { model: rm, vars, errors, featureErrors: { id: message }, sheetError }: a shallow copy of
  // the model whose features and sheet parameters have their expressions evaluated. A feature without expressions
  // is the original object (so rebuild's sketch profiles land on the model as before); one that fails to resolve
  // stays the original and is named in featureErrors. Nothing on the original model is changed.
  function resolvedModel(model) {
    var eq = resolveEquations(model), vars = eq.vars, featureErrors = {}, sheetError = null;
    var rm = {};
    Object.keys(model).forEach(function (k) { rm[k] = model[k]; });
    rm.features = model.features.map(function (f) {
      if (!hasExpressions(f)) return f;
      try { return resolveFeature(f, vars); } catch (e) { featureErrors[f.id] = e.message || String(e); return f; }
    });
    if (model.sheet && hasExpressions(model.sheet)) {
      try { rm.sheet = resolveFeature(model.sheet, vars); } catch (e) { sheetError = 'sheet.' + (e.message || String(e)); }
    }
    return { model: rm, vars: vars, errors: eq.errors, featureErrors: featureErrors, sheetError: sheetError, configuration: eq.configuration };
  }


  // ------------------------------------------------------------------ public API (Kernel.*)
  K.isExpression = isExpression; K.evalExpression = evalExpression; K.resolveEquations = resolveEquations; K.resolvedModel = resolvedModel;
  K.resolveFeature = resolveFeature; K.hasExpressions = hasExpressions; K.configurationList = configurationList;
  K.findConfiguration = findConfiguration; K.activeConfiguration = activeConfiguration; K.effectiveEquations = effectiveEquations;
  K.captureConfiguration = captureConfiguration; K.applyEquations = applyEquations; K.EXPR_FUNCTIONS = Object.keys(EXPR_FN);
  // ------------------------------------------------------------------ shared with the other kernel files (Kernel._)
  _.configExpr = configExpr; _.evalExpression = evalExpression; _.findConfiguration = findConfiguration; _.isExpression = isExpression;
  _.resolveEquations = resolveEquations; _.resolvedModel = resolvedModel;
})(Kernel, Kernel._);
