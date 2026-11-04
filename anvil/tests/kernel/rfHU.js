  // --- rfHU (2026-11-04, lane occt) --- A fillet or chamfer whose size uses up the whole face beside its edge (the
  // user's part: Fillet2 R50 on the top edge of a block 50 deep). OpenCascade refused these ("radius too large?"),
  // so its solid did not drive; occt-tests.html "rfHU" rows now hold OpenCascade to the same closed forms (1e-9, the
  // B-rep face counts SolidWorks shows). Here Anvil's own engine is held to them, and the perforated panels those rows
  // time (one Boolean per nesting level of the sketch) are checked for volume.
  var rfHU = (function () {
    var PI = Math.PI, q = 1 - PI / 4;
    // the chamfer's wedge under the R50 round: ∫0..15 (15 − x)(25 + √(2500 − x²)) dx
    function F(x) { var s = Math.sqrt(2500 - x * x); return 15 * (x * s / 2 + 1250 * Math.asin(x / 50)) + Math.pow(2500 - x * x, 1.5) / 3; }
    var wedge = 25 * 112.5 + F(15) - F(0);
    function perf(n, boss) {
      var cols = n === 600 ? 30 : n === 1800 ? 60 : 10, rows = n / cols, T = 0.0598, r = 0.125, c = '';
      for (var i = 0; i < cols; i++) for (var j = 0; j < rows; j++) c += '.circle(' + (0.25 + i * 0.5) + ', ' + (0.25 + j * 0.5) + ', ' + r + ')';
      var W = cols * 0.5, H = rows * 0.5;
      return { code: 'p.units("in");\n' + (boss ? 'p.sketch("Top").rect(0, 0, ' + W + ', ' + H + ')' + c + '.end().extrude(' + T + ');\n'
        : 'p.sketch("Top").rect(0, 0, ' + W + ', ' + H + ').end().extrude(' + T + ');\np.sketch("Top", ' + T + ')' + c + '.end().cut("through", { reverse: true });\n'),
        want: (W * H - n * PI * r * r) * T };
    }
    return {
      CASES: [
        { name: 'the user\'s part: 120 × 75 × 50 in, R3 and R50 (eats the 50 deep top face) on the end, chamfer 15', faces: 8,
          code: 'p.units("in");\np.sketch("Right").rect(-56.975, -37.075, 120, 75).end().extrude(50);\np.fillet(3, [[50, -37.075, -3.025]]);\np.fillet(50, [[50, 37.925, -3.025]]);\np.chamfer(15, [[0, 0.425, 56.975]]);\n',
          want: 450000 - q * 9 * 120 - q * 2500 * 120 - wedge },
        { name: 'R3 on a block 3 deep: the top face is used up', faces: 6,
          code: 'p.sketch("Front").rect(0, 0, 4, 5).end().extrude(3);\np.fillet(3, [[2, 5, 3]]);\n', want: 60 - q * 36 },
        { name: 'chamfer 3 on a block 3 deep: the top face is used up', faces: 6,
          code: 'p.sketch("Front").rect(0, 0, 4, 5).end().extrude(3);\np.chamfer(3, [[2, 5, 3]]);\n', want: 42 },
        { name: 'R2 on a 2 × 2 bar: both faces used up (a quarter round)', faces: 5,
          code: 'p.sketch("Front").rect(0, 0, 2, 2).end().extrude(6);\np.fillet(2, [[2, 2, 3]]);\n', want: 6 * PI },
        { name: 'concave R3 in a step 3 high: the riser is used up', faces: 8,
          code: 'p.sketch("Front").polyline([[0, 0], [6, 0], [6, 2], [2, 2], [2, 5], [0, 5]], true).end().extrude(4);\np.fillet(3, [[2, 2, 2]]);\n', want: 72 + q * 36 }
      ],
      perf: perf
    };
  })();
  (function () {
    group('rfHU: fillets / chamfers that use up a face; perforated panels');
    rfHU.CASES.forEach(function (c) {
      test('rfHU: ' + c.name + ' (Anvil = closed form, 1e-6)', function () {
        var r = build(c.code);
        noErrors(r);
        assert(r.build.bodies.length === 1, r.build.bodies.length + ' bodies');
        nearRel(r.mp.volume, c.want, 1e-6, 'volume');
      });
    });
    test('rfHU: 60-hole perforated panel (occt-tests times 600 and 1800), cut and boss-with-holes: π r² T per hole', function () {
      [false, true].forEach(function (boss) {
        var p = rfHU.perf(60, boss), r = build(p.code);
        noErrors(r);
        nearRel(r.mp.volume, p.want, 1e-6, (boss ? 'boss' : 'cut') + ' volume');
      });
    });
  })();
