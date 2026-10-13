  // ---- rfAI (shop workflow audit 2, 2026-10-12): a Normal cut sketched on the outer face of a 16 ga Edge Flange
  // lands in the flat pattern on the flange leg, measured from the leg's far edge (Outer Virtual Sharp, Bend Outside)
  (function () {
    group('rfAI: Normal cut on an Edge Flange face in the flat pattern');
    var T = 0.0598, RT = 2 * T;   // R = T: the flange's outer face is at x = -(R + T)
    function flatOf(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function loopBox(l) { var xs = l.map(function (p) { return p[0]; }), ys = l.map(function (p) { return p[1]; }); return { c: [(Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2, (Math.min.apply(null, ys) + Math.max.apply(null, ys)) / 2], r: (Math.max.apply(null, xs) - Math.min.apply(null, xs)) / 2 }; }
    test('rfAI: 10 x 6 blank, 1.5 Edge Flange on x = 0, a Ø.5 Normal cut through the flange wall at its centre — flat 11.5213 x 6 with the hole at u = -(1.5213 - (1.5 - .8098)) = -.8311, v = -3, r .25', function () {
      var r = flatOf('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -6, 10, 6).circle(1, -1, 0.1405).circle(9, -1, 0.1405).circle(1, -5, 0.1405).circle(9, -5, 0.1405).end().baseFlange(' + T + ');\n' +
        'p.flange(1.5, [[0, ' + T + ', 3]], { lengthRef: "outer" });\n' +   // Outer Virtual Sharp, the Edge Flange PM's default (the script default is "wall")
        'p.sketch({ custom: true, origin: [' + (-RT) + ', 0, 0], x: [0, 0, 1], y: [0, 1, 0], n: [-1, 0, 0], offset: ' + RT + ' }).circle(3, ' + ((RT + 1.5) / 2) + ', 0.25).end();\n' +
        'p.cut(1, { throughAll: true, reverse: true, normalCut: true });');
      var fl = r.flat;
      near(fl.size[0], 11.5213, 2e-4, 'flat length'); near(fl.size[1], 6, 1e-9, 'flat width');
      assert(fl.loops.length === 6 && fl.bends.length === 1, 'outer loop, four holes and the cut, one bend: ' + fl.loops.length + ' loops, ' + fl.bends.length + ' bends');
      var holes = fl.loops.slice(1).map(loopBox).sort(function (a, b) { return a.c[0] - b.c[0]; });
      near(holes[0].r, 0.25, 2e-3, 'the cut is r .25'); near(holes[0].c[1], -3, 1e-6, 'the cut at the flange middle');
      near(holes[0].c[0], -(fl.size[0] - 10) + (1.5 - (RT + 1.5) / 2), 2e-4, 'the cut sits (1.5 - .8098) from the leg\'s far edge');
      near(holes[1].c[0], 1, 1e-6, 'blank hole x = 1 stays at u = 1');
      return 'flat ' + fl.size[0].toFixed(4) + ' x ' + fl.size[1] + ', cut at u = ' + holes[0].c[0].toFixed(4);
    });
  })();
  // --- end rfAI ---
