  // --- p9-sketch: shop input (SketchSolver.parseValue, behind UI.parseLength) and the chained tangent ---
  (function () {
    group('p9-sketch: fractions, mixed numbers, unit suffixes and arithmetic in typed values; Tangent through a chain');
    if (typeof SketchSolver === 'undefined' || !SketchSolver.parseValue) return;
    var SS = SketchSolver;
    function pv(t, kind, units) { return SS.parseValue(t, { kind: kind || 'length', units: units || 'in' }); }
    function val(t, kind, units) { var r = pv(t, kind, units); assert(r.error == null, JSON.stringify(t) + ' -> error ' + r.error); return r.value; }
    test('p9-sketch: decimals and fractions read exactly (.375, 3/8, 0.375, 5/16, -3/8)', function () {
      assert(val('.375') === 0.375 && val('3/8') === 0.375 && val('0.375') === 0.375 && val('5/16') === 0.3125 && val('-3/8') === -0.375, 'values');
      assert(val('  3/8  ') === 0.375, 'spaces around');
    });
    test('p9-sketch: mixed numbers — 1-1/2 and 1 1/2 are 1.5, 10-3/4 is 10.75, 3-1/2 is 3.5 (shop), 3 - 1/2 with spaces subtracts, 5-3/2 (not a proper fraction) subtracts', function () {
      assert(val('1-1/2') === 1.5 && val('1 1/2') === 1.5 && val('10-3/4') === 10.75 && val('3-1/2') === 3.5, 'mixed');
      assert(val('3 - 1/2') === 2.5 && val('5-3/2') === 3.5, 'subtraction');
      assert(val('-1-1/2') === -1.5 && val('2+1-1/2') === 3.5 && val('(1-1/2)*2') === 3, 'mixed inside arithmetic');
      assert(val('3/4-1/2') === 0.25, 'a fraction minus a fraction is a subtraction: ' + val('3/4-1/2'));
    });
    test('p9-sketch: unit suffixes convert to the document units — 25mm in an inch part is 25/25.4, 1in in a mm part 25.4, 2.5cm, 1ft = 12 in, 1\' 6-1/2" = 18.5 in, 3/8" and 3/8 in', function () {
      nearRel(val('25mm'), 25 / 25.4, 1e-15, '25mm');
      assert(Math.abs(val('25mm') - 0.984251968503937) < 1e-12, '25mm = 0.984252');
      assert(val('25 mm', 'length', 'mm') === 25 && val('1in', 'length', 'mm') === 25.4 && val('2.5cm', 'length', 'mm') === 25, 'mm part');
      assert(val('1ft') === 12 && val("1'") === 12 && val('3/8"') === 0.375 && val('3/8 in') === 0.375 && val('3/8IN') === 0.375, 'inch part');
      assert(val("1' 6-1/2\"") === 18.5 && val('1ft 3in') === 15 && val("2'6\"") === 30, 'feet and inches add: ' + val("1' 6-1/2\""));
      nearRel(val('1in + 25.4mm'), 2, 1e-15, 'mixed units in a sum');
      nearRel(val('(1+1/2)in', 'length', 'mm'), 38.1, 1e-14, 'a unit after parentheses');
    });
    test('p9-sketch: arithmetic — 2*3/8 = 0.75, 1.5+1/16 = 1.5625, (1+1/2)*2 = 3, 2^3 = 8, 6/4 = 1.5', function () {
      assert(val('2*3/8') === 0.75 && val('1.5+1/16') === 1.5625 && val('(1+1/2)*2') === 3 && val('2^3') === 8 && val('6/4') === 1.5, 'arithmetic');
      assert(val('2×3/8') === 0.75, 'the times sign');
    });
    test('p9-sketch: angles — 45, 45deg, 45°, 22-1/2°, pi/4 rad as 45; an angle unit in a length box and a length unit in an angle box are refused with the reason', function () {
      assert(val('45', 'angle') === 45 && val('45deg', 'angle') === 45 && val('45°', 'angle') === 45 && val('22-1/2°', 'angle') === 22.5, 'angles');
      nearRel(val('0.7853981633974483rad', 'angle'), 45, 1e-12, 'rad');
      var a = pv('45deg', 'length'), b = pv('25mm', 'angle'), c = pv('3mm', 'number');
      assert(a.error && /angle unit/.test(a.error), 'deg in a length: ' + a.error);
      assert(b.error && /length unit/.test(b.error), 'mm in an angle: ' + b.error);
      assert(c.error && /no units/.test(c.error), 'units in a count: ' + c.error);
      assert(val('45deg', 'any') === 45 && val('25mm', 'any', 'mm') === 25, 'kind any takes both');
    });
    test('p9-sketch: errors are messages, never NaN — empty, 3//8, 1/0, (1+2, 3/, 1\' 6 (no unit), an unknown name (flagged ident so the UI may try it as an equation variable)', function () {
      ['', '   ', '3//8', '1/0', '(1+2', '3/', "1' 6", '1..5', '3 # 8'].forEach(function (t) {
        var r = pv(t);
        assert(r.error && typeof r.error === 'string' && r.value === undefined, JSON.stringify(t) + ' -> ' + JSON.stringify(r));
      });
      assert(/Division by zero/.test(pv('1/0').error), pv('1/0').error);
      var u = pv('3 xyz');
      assert(u.ident && /Unknown unit "xyz"/.test(u.error), JSON.stringify(u));
      assert(pv('T*2').ident, 'a variable name is flagged ident');
    });
    test('p9-sketch: "=" text is left to the equations (passthrough): parseValue answers { equation: true } and the kernel evaluates it as before', function () {
      assert(pv('=T*3').equation === true && pv('  =3/8').equation === true, 'equation passthrough');
      assert(Kernel.evalExpression('=3/8', {}) === 0.375 && Kernel.evalExpression('=T*3', { T: 2 }) === 6, 'kernel equations unchanged');
    });
    test('p9-sketch: Tangent through a chain — a line drawn on from the end of a line that ends on a circle gets Tangent with the circle (the start Coincident is with the chain end, not the circle), not redundant', function () {
      // circle R10 at the origin; line 1 from (-30, 10) ends on the circle top (0, 10); line 2 leaves (0, 10) along +x
      var sk = { entities: [{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'line', x1: -30, y1: 20, x2: 0, y2: 10 }] };
      SS.infer(sk, 1);
      assert((sk.rels || []).some(function (r) { return r.type === 'coincident' && r.refs.join() === '1.p2,0'; }), 'line 1 end on the circle: ' + JSON.stringify(sk.rels));
      sk.entities.push({ t: 'line', x1: 0, y1: 10, x2: 25, y2: 10 });
      var added = SS.infer(sk, 2).map(function (r) { return r.type + ':' + r.refs.join(','); }).sort().join(' ');
      assert(/tangent:2,0/.test(added) && /coincident:2.p1,1.p2/.test(added), 'chained line: ' + added);
      var an = SS.analyze(sk);
      assert(!an.redundant && !an.conflicts, 'not over-defined: ' + JSON.stringify(an));
      // the Tangent holds: drag line 2's end down and the line stays tangent at (0, 10)
      var res = SS.drag(sk, '2.p2', [25, 2], JSON.parse(JSON.stringify(sk.entities)));
      assert(res.ok, 'drag solved');
      var e = sk.entities[2], c = sk.entities[0], ux = e.x2 - e.x1, uy = e.y2 - e.y1, L = Math.hypot(ux, uy);
      var dist = Math.abs((c.cx - e.x1) * uy - (c.cy - e.y1) * ux) / L;
      near(dist, c.r, 1e-6, 'centre-to-line distance after the drag');
    });
  })();
  // --- end p9-sketch ---
