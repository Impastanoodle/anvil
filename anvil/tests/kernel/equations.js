  // ------------------------------------------------------------------ equations
  // model.equations = [{ name, expr }] in order; any numeric feature field may be an "=expr" string resolved at rebuild.
  // Kernel.isExpression, evalExpression(expr, vars), resolveEquations(model) -> { vars, errors }, resolveFeature,
  // resolvedModel, hasExpressions; build.equations / build.equationErrors; Builder .equations({...} | [...]).
  group('equations');
  var EQ_API = ['isExpression', 'evalExpression', 'resolveEquations', 'resolvedModel', 'resolveFeature', 'hasExpressions'];
  function evalEq(expr, vars) { return K.evalExpression(expr, vars || {}); }
  function evalThrows(expr, re, vars) {
    var threw = false, msg = '';
    try { var v = K.evalExpression(expr, vars || {}); msg = 'returned ' + v; } catch (e) { threw = true; msg = String(e.message || e); }
    assert(threw, '"' + expr + '" should throw, ' + msg);
    if (re) assert(re.test(msg), '"' + expr + '" threw "' + msg + '", expected ' + re);
    return msg;
  }
  test('Kernel exports the equations API', function () {
    var missing = EQ_API.filter(function (n) { return typeof K[n] !== 'function'; });
    assert(!missing.length, 'missing Kernel.' + missing.join(', Kernel.'));
    assert(typeof K.Builder.prototype.equations === 'function', 'Builder.prototype.equations missing');
  });
  test('isExpression: strings starting with "=" (after spaces) only', function () {
    assert(K.isExpression('=1') && K.isExpression('  =T*2') && K.isExpression('='), '"=" strings');
    assert(!K.isExpression('1') && !K.isExpression('T*2') && !K.isExpression(5) && !K.isExpression(null) && !K.isExpression(undefined) && !K.isExpression(''), 'non-expressions');
  });
  test('grammar and precedence: * before +, left-assoc - and /, parentheses, "=" stripped', function () {
    near(evalEq('1+2*3'), 7, 0, '1+2*3'); near(evalEq('(1+2)*3'), 9, 0, '(1+2)*3');
    near(evalEq('1-2-3'), -4, 0, '1-2-3'); near(evalEq('24/4/2'), 3, 0, '24/4/2'); near(evalEq('10/4'), 2.5, 0, '10/4');
    near(evalEq('=1+1'), 2, 0, '=1+1'); near(evalEq('  = 2 * ( 3 + 4 ) '), 14, 0, 'spaces');
    near(evalEq('1e3+1'), 1001, 0, '1e3+1'); near(evalEq('.5*2'), 1, 0, '.5*2'); near(evalEq('2.5E-1*4'), 1, 1e-15, '2.5E-1*4');
    near(evalEq('((((7))))'), 7, 0, 'nested parens');
  });
  test('powers: ^ and ** are right-associative (2^3^2 = 512), unary minus binds looser (-2^2 = -4), 2^-1 = 0.5', function () {
    near(evalEq('2^3^2'), 512, 0, '2^3^2'); near(evalEq('2**3**2'), 512, 0, '2**3**2'); near(evalEq('(2^3)^2'), 64, 0, '(2^3)^2');
    near(evalEq('-2^2'), -4, 0, '-2^2'); near(evalEq('(-2)^2'), 4, 0, '(-2)^2'); near(evalEq('2^-1'), 0.5, 0, '2^-1');
    near(evalEq('2*3^2'), 18, 0, '2*3^2'); near(evalEq('--3'), 3, 0, '--3'); near(evalEq('+4'), 4, 0, '+4'); near(evalEq('3-(-2)'), 5, 0, '3-(-2)');
  });
  test('variables and constants: T*W, pi, e; a variable named pi shadows the constant', function () {
    near(evalEq('T*W', { T: 10, W: 20 }), 200, 0, 'T*W'); near(evalEq('pi'), Math.PI, 1e-15, 'pi'); near(evalEq('e'), Math.E, 1e-15, 'e');
    near(evalEq('pi', { pi: 3 }), 3, 0, 'shadowed pi'); near(evalEq('_a1+B_2', { _a1: 1, B_2: 2 }), 3, 0, 'underscores and digits');
    near(evalEq('2*pi*r', { r: 5 }), 10 * Math.PI, 1e-12, '2*pi*r');
  });
  test('functions: roots, rounding, exp/log, trig, hyperbolic, pow/min/max/hypot/atan2', function () {
    var c = [['sqrt(16)', 4], ['cbrt(-27)', -3], ['cbrt(8)', 2], ['abs(-2.5)', 2.5], ['floor(-2.5)', -3], ['ceil(-2.5)', -2], ['round(2.5)', 3], ['trunc(-2.7)', -2], ['trunc(2.7)', 2],
      ['sign(-3)', -1], ['sign(0)', 0], ['sign(7)', 1], ['exp(0)', 1], ['log(e)', 1], ['log10(1000)', 3], ['log2(8)', 3], ['sin(pi/2)', 1], ['cos(0)', 1], ['tan(0)', 0],
      ['asin(1)', Math.PI / 2], ['acos(1)', 0], ['atan(1)', Math.PI / 4], ['sinh(0)', 0], ['cosh(0)', 1], ['tanh(0)', 0], ['sinh(1)', (Math.E - 1 / Math.E) / 2],
      ['atan2(1, 1)', Math.PI / 4], ['pow(2, 10)', 1024], ['min(3, 1, 2)', 1], ['max(3, 1, 2)', 3], ['min(4)', 4], ['hypot(3, 4)', 5], ['hypot(2, 3, 6)', 7],
      ['sqrt(max(9, 4)) + 2*min(1, 5)', 5]];
    c.forEach(function (t) { near(evalEq(t[0]), t[1], 1e-12, t[0]); });
    return c.length + ' calls';
  });
  test('degree helpers: sind/cosd/tand, asind/acosd/atand, deg(), rad()', function () {
    var c = [['sind(30)', 0.5], ['cosd(60)', 0.5], ['tand(45)', 1], ['asind(0.5)', 30], ['acosd(0.5)', 60], ['atand(1)', 45], ['deg(pi)', 180], ['rad(180)', Math.PI], ['sind(90)*cosd(0)', 1]];
    c.forEach(function (t) { near(evalEq(t[0]), t[1], 1e-12, t[0]); });
  });
  test('errors: unknown variable / function, wrong arity, bad character, incomplete input, division by zero, NaN', function () {
    var m = [];
    m.push(evalThrows('X+1', /X/));
    m.push(evalThrows('foo(1)', /foo/));
    m.push(evalThrows('sqrt(1, 2)', /sqrt/));
    m.push(evalThrows('atan2(1)', /atan2/));
    m.push(evalThrows('min()', /min/));
    m.push(evalThrows('2 $ 3', /\$/));
    m.push(evalThrows('2 # 3'));
    m.push(evalThrows('', null));
    m.push(evalThrows('=', null));
    m.push(evalThrows('(1+2', null));
    m.push(evalThrows('1+', null));
    m.push(evalThrows('1 2', null));
    m.push(evalThrows('1/0', /zero/i));
    m.push(evalThrows('sqrt(-1)', null));
    m.push(evalThrows('T', /T/, { T: 'abc' })); // a non-number variable is not a value
    return m.length + ' error cases';
  });
  test('resolveEquations: in order, each sees the earlier ones; later names are not visible yet', function () {
    var r = K.resolveEquations({ equations: [{ name: 'T', expr: '10' }, { name: 'W', expr: 'T*2' }, { name: 'H', expr: '=W+T/2' }] });
    near(r.vars.T, 10, 0, 'T'); near(r.vars.W, 20, 0, 'W'); near(r.vars.H, 25, 0, 'H (leading "=" accepted)');
    assert(!Object.keys(r.errors).length, 'errors: ' + JSON.stringify(r.errors));
    var f = K.resolveEquations({ equations: [{ name: 'A', expr: 'B+1' }, { name: 'B', expr: '1' }] });
    assert(f.errors.A && !('A' in f.vars), 'forward reference A should fail: ' + JSON.stringify(f));
    near(f.vars.B, 1, 0, 'B');
    var chain = K.resolveEquations({ equations: [{ name: 'A', expr: '1/0' }, { name: 'B', expr: 'A+1' }, { name: 'C', expr: '3' }] });
    assert(chain.errors.A && chain.errors.B, 'a failing variable fails its dependents: ' + JSON.stringify(chain.errors));
    near(chain.vars.C, 3, 0, 'an independent variable after a failure still resolves');
    var none = K.resolveEquations(K.newModel('E'));
    assert(!Object.keys(none.vars).length && !Object.keys(none.errors).length, 'no equations: empty result');
  });
  test('resolveEquations: duplicate and invalid names go to errors, the first definition wins', function () {
    var r = K.resolveEquations({ equations: [{ name: 'T', expr: '1' }, { name: 'T', expr: '2' }, { name: '2x', expr: '3' }, { name: 'a b', expr: '4' }, { name: '', expr: '5' }, { name: 'ok', expr: 'T+1' }] });
    near(r.vars.T, 1, 0, 'T keeps its first value');
    assert(/dup/i.test(r.errors.T || ''), 'duplicate T: ' + JSON.stringify(r.errors));
    assert(r.errors['2x'] && r.errors['a b'], 'invalid names: ' + JSON.stringify(r.errors));
    assert(!('2x' in r.vars) && !('a b' in r.vars), 'invalid names are not variables');
    near(r.vars.ok, 2, 0, 'ok');
    return JSON.stringify(r.errors);
  });
  test('resolveFeature / hasExpressions: nested fields resolve, sketch geometry and references are never expressions', function () {
    var f = { id: 3, type: 'extrude', sketch: 2, depth: '=W', dir2: { depth: '=T/2' }, entities: [{ t: 'rect', w: '=T' }], name: '=not me' };
    assert(K.hasExpressions(f), 'hasExpressions');
    assert(!K.hasExpressions({ id: 1, type: 'sketch', entities: [{ t: 'rect', w: '=T' }], name: '=x' }), 'expressions inside skipped keys do not count');
    var r = K.resolveFeature(f, { T: 10, W: 20 });
    near(r.depth, 20, 0, 'depth'); near(r.dir2.depth, 5, 0, 'dir2.depth');
    assert(r.entities[0].w === '=T' && r.name === '=not me', 'skipped keys copied untouched: ' + JSON.stringify(r));
    assert(f.depth === '=W' && f.dir2.depth === '=T/2', 'the input feature is not changed');
    var msg = '';
    try { K.resolveFeature({ id: 4, type: 'extrude', dir2: { depth: '=Z' } }, {}); } catch (e) { msg = String(e.message || e); }
    assert(/dir2\.depth/.test(msg) && /Z/.test(msg), 'nested failure names the field path: "' + msg + '"');
    return msg;
  });
  test('rebuild: T = 10, W = T*2, 10 × 10 rect extruded "=W" is 2000; T = 5 gives 1000; the model keeps "=W"', function () {
    var r = build('p.equations({ T: 10, W: "=T*2" });\np.sketch("Front").rect(0, 0, 10, 10).extrude("=W");');
    noErrors(r);
    near(r.mp.volume, 2000, 1e-6, 'volume at T = 10');
    assert(r.build.equations && r.build.equations.T === 10 && r.build.equations.W === 20, 'build.equations: ' + JSON.stringify(r.build.equations));
    assert(r.build.equationErrors && !Object.keys(r.build.equationErrors).length, 'build.equationErrors: ' + JSON.stringify(r.build.equationErrors));
    var ex = r.model.features[r.model.features.length - 1];
    assert(ex.depth === '=W', 'feature depth stays the expression: ' + JSON.stringify(ex.depth));
    assert(JSON.stringify(r.model.equations) === JSON.stringify([{ name: 'T', expr: '10' }, { name: 'W', expr: 'T*2' }]), 'model.equations: ' + JSON.stringify(r.model.equations));
    r.model.equations[0].expr = '5';
    var b = K.rebuild(r.model);
    noErrors({ errors: b.errors });
    near(K.massProps(K.meshFromBody(b.body), 1).volume, 1000, 1e-6, 'volume at T = 5');
    assert(ex.depth === '=W', 'still "=W" after the rebuild');
    return 'bbox z ' + fmt(r.mp.bbox.max[2]) + ' → ' + fmt(K.massProps(K.meshFromBody(b.body), 1).bbox.max[2]);
  });
  test('Builder.equations: the array form keeps each expr string as written (numbers become strings); a later call replaces the list', function () {
    var m = K.newModel('Q');
    K.runScript(m, 'p.equations([{ name: "L", expr: 40 }, { name: "S", expr: "=L/4" }]);');
    assert(JSON.stringify(m.equations) === JSON.stringify([{ name: 'L', expr: '40' }, { name: 'S', expr: '=L/4' }]), 'array form: ' + JSON.stringify(m.equations));
    near(K.resolveEquations(m).vars.S, 10, 0, 'S = L/4 with or without the "="');
    K.runScript(m, 'p.equations({ L: 40, S: "=L/4" });');
    assert(JSON.stringify(m.equations) === JSON.stringify([{ name: 'L', expr: '40' }, { name: 'S', expr: 'L/4' }]), 'object form drops the "=": ' + JSON.stringify(m.equations));
    K.runScript(m, 'p.equations({ A: 1 });');
    assert(m.equations.length === 1 && m.equations[0].name === 'A', 'replaced: ' + JSON.stringify(m.equations));
  });
  test('expressions drive a sketch plane offset and a linear pattern spacing', function () {
    var r = build('p.equations({ H: 5, S: 20, N: 3 });\np.sketch("Front", "=H").rect(0, 0, 10, 10).extrude(2);\np.linearPattern({ dir: "x", spacing: "=S", count: "=N" });');
    noErrors(r);
    near(r.mp.bbox.min[2], 5, 1e-9, 'plane offset =H puts the boss at z = 5');
    near(r.mp.volume, 3 * 200, 1e-6, 'three instances');
    near(r.mp.bbox.max[0], 2 * 20 + 10, 1e-9, 'pattern spacing =S');
  });
  test('a failing feature expression is that feature\'s error ("depth: …"), not a throw; the rest still builds', function () {
    var r = build('p.box(10, 10, 10);\np.sketch("Front").rect(20, 0, 5, 5).extrude("=Q*2");');
    var id = r.model.features[r.model.features.length - 1].id;
    assert(r.errors[id], 'the extrude should have an error: ' + JSON.stringify(r.errors));
    assert(/^depth: /.test(r.errors[id]) && /Q/.test(r.errors[id]), 'error text: "' + r.errors[id] + '"');
    near(r.mp.volume, 1000, 1e-6, 'the box is untouched');
    var ids = Object.keys(r.errors);
    assert(ids.length === 1, 'only the extrude fails: ' + JSON.stringify(r.errors));
    return r.errors[id];
  });
  test('a failing equation lands in build.equationErrors; a feature that uses it errors, rebuild does not throw', function () {
    var r = build('p.equations({ A: "1/0", B: 4 });\np.box(10, 10, "=B");\np.sketch("Front", 4).rect(20, 0, 5, 5).extrude("=A");');
    assert(r.build.equationErrors && r.build.equationErrors.A, 'equationErrors: ' + JSON.stringify(r.build.equationErrors));
    near(r.mp.volume, 400, 1e-6, 'the "=B" box builds');
    var id = r.model.features[r.model.features.length - 1].id;
    assert(r.errors[id] && /A/.test(r.errors[id]), 'extrude error: ' + JSON.stringify(r.errors));
    return r.build.equationErrors.A + ' | ' + r.errors[id];
  });
  test('generateScript round trip: p.equations and "=" fields come back identical, and the script is a fixed point', function () {
    var code = 'p.equations({ T: 10, W: "=T*2", R: "=T/4" });\np.sketch("Front").rect(0, 0, 10, 10).extrude("=W");\np.fillet("=R/2", [[5, 10, 20]]);\np.sketch("Front", "=W").circle(5, 5, 2).cut("=T/2", { reverse: true });';
    var a = build(code);
    noErrors(a);
    var s = K.generateScript(a.model);
    assert(/p\.equations\(/.test(s), 'script lacks p.equations: ' + s.split('\n').slice(0, 4).join(' / '));
    assert(s.indexOf('"=W"') >= 0 && s.indexOf('"=T/2"') >= 0, 'script lacks the "=" fields');
    var b = build(s);
    noErrors(b);
    assert(JSON.stringify(b.model.equations) === JSON.stringify(a.model.equations), 'equations ' + JSON.stringify(b.model.equations) + ' vs ' + JSON.stringify(a.model.equations));
    a.model.features.forEach(function (f, i) {
      var g = b.model.features[i];
      ['depth', 'r', 'offset'].forEach(function (k) { if (f[k] !== undefined) assert(JSON.stringify(g[k]) === JSON.stringify(f[k]), f.name + '.' + k + ': ' + JSON.stringify(g[k]) + ' vs ' + JSON.stringify(f[k])); });
      if (f.plane) assert(JSON.stringify(g.plane) === JSON.stringify(f.plane), f.name + '.plane: ' + JSON.stringify(g.plane) + ' vs ' + JSON.stringify(f.plane));
    });
    nearRel(b.mp.volume, a.mp.volume, 1e-9, 'volume');
    assert(K.generateScript(b.model) === s, 'generateScript is not stable across the round trip');
    return s.split('\n').length + ' lines, volume ' + fmt(a.mp.volume);
  });
  test('packBuild / unpackBuild keep build.equations and build.equationErrors', function () {
    var r = build('p.equations({ T: 10, W: "=T*2", Bad: "nope" });\np.sketch("Front").rect(0, 0, 10, 10).extrude("=W");');
    var packed = K.packBuild(r.build, r.model);
    assert(packed.equations && packed.equations.W === 20, 'packed.equations: ' + JSON.stringify(packed.equations));
    assert(packed.equationErrors && packed.equationErrors.Bad, 'packed.equationErrors: ' + JSON.stringify(packed.equationErrors));
    var u = K.unpackBuild(K.packBuild(r.build, r.model));
    assert(JSON.stringify(u.equations) === JSON.stringify(r.build.equations), 'unpacked equations: ' + JSON.stringify(u.equations));
    assert(JSON.stringify(u.equationErrors) === JSON.stringify(r.build.equationErrors), 'unpacked equationErrors: ' + JSON.stringify(u.equationErrors));
    near(u.body.volume(), 2000, 1e-9, 'unpacked body');
  });
  test('rebuild cache: changing T rebuilds only the features whose values change', function () {
    var model = K.newModel('EqCache');
    K.runScript(model, 'p.equations({ T: 10, W: "=T*2" });\np.sketch("Front").rect(0, 0, 10, 10).extrude(5);\np.sketch("Front").rect(20, 0, 10, 10).extrude("=W");');
    var n = model.features.length, b1 = K.rebuild(model);
    near(b1.body.volume(), 500 + 2000, 1e-9, 'first build');
    model.equations[0].expr = '5';
    var b2 = K.rebuild(model, b1.cache);
    assert(b2.reused === n - 1, 'T changed: reused ' + b2.reused + ' of ' + n + ' (only the "=W" extrude depends on it)');
    near(b2.body.volume(), 500 + 1000, 1e-9, 'after T = 5');
    near(b2.body.volume(), K.rebuild(JSON.parse(JSON.stringify(model))).body.volume(), 1e-9, 'cached equals fresh');
    model.equations[0].expr = '10/2'; // same value, different text
    var b3 = K.rebuild(model, b2.cache);
    assert(b3.reused === n, 'an equation edit that changes no value reuses everything: ' + b3.reused + ' of ' + n);
    model.equations.push({ name: 'Unused', expr: '99' });
    var b4 = K.rebuild(model, b3.cache);
    assert(b4.reused === n, 'a new unused variable reuses everything: ' + b4.reused + ' of ' + n);
    model.equations[0].expr = '1'; // W = 2 now: the first feature stays, the second extrude rebuilds
    var b5 = K.rebuild(model, b4.cache);
    assert(b5.reused === n - 1, 'T = 1: reused ' + b5.reused);
    near(b5.body.volume(), 500 + 200, 1e-9, 'after T = 1');
    return 'reused ' + b2.reused + ', ' + b3.reused + ', ' + b4.reused + ', ' + b5.reused + ' of ' + n;
  });
  test('Design Library "Parametric plate": T = 12 instead of 8 scales the volume by exactly 1.5 (the plate and the hole sketches follow T)', function () {
    var ex = (typeof AnvilExamples !== 'undefined' ? AnvilExamples : []).filter(function (e) { return e.name === 'Parametric plate'; })[0];
    assert(ex, 'example "Parametric plate" missing from examples.js');
    var r = build(ex.code);
    noErrors(r);
    var v8 = r.body.volume(), eqT = r.model.equations.filter(function (q) { return q.name === 'T'; })[0];
    assert(eqT, 'no T equation');
    eqT.expr = '12';
    var b = K.rebuild(r.model, r.build.cache);
    noErrors({ errors: b.errors });
    nearRel(b.body.volume(), v8 * 1.5, 1e-9, 'volume at T = 12 (every hole goes through)');
    return 'volume ' + fmt(v8) + ' → ' + fmt(b.body.volume()) + ', reused ' + b.reused + ' of ' + r.model.features.length;
  });
  test('resolvedModel does not change the model and reports feature errors by id', function () {
    var m = K.newModel('RM');
    K.runScript(m, 'p.equations({ T: 3 });\np.sketch("Front").rect(0, 0, 10, 10).extrude("=T");\np.sketch("Front", 10).rect(0, 0, 5, 5).extrude("=Nope");');
    var before = JSON.stringify(m);
    var rm = K.resolvedModel(m);
    assert(JSON.stringify(m) === before, 'model changed by resolvedModel');
    near(rm.model.features[1].depth, 3, 0, 'resolved depth');
    assert(rm.model.features[0] === m.features[0], 'a feature without expressions is the same object');
    assert(rm.featureErrors[m.features[3].id], 'featureErrors: ' + JSON.stringify(rm.featureErrors));
    assert(rm.vars.T === 3, 'vars: ' + JSON.stringify(rm.vars));
  });

