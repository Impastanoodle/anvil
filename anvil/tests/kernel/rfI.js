  // --- rfI (2026-10-08 bug-fix follow-ups): coplanar faces clustered by tolerance (no rounded plane key), pick
  // tolerances in the model's units, round holes across a bend as true circles in the flat, 82° countersinks ---
  (function () {
    group('rfI: plane clustering, unit-aware picks, flat circles across bends, countersinks');
    var V = CSG.Vector;
    function quad(w, dw, x0, n) {   // a unit square in the plane y = w, its plane offset by dw (noise), normal n (default +y)
      var pts = [[x0, w, 0], [x0, w, -1], [x0 + 1, w, -1], [x0 + 1, w, 0]].map(function (p) { return new CSG.Vertex(new V(p[0], p[1], p[2])); });
      return new CSG.Polygon(pts, null, new CSG.Plane(n || new V(0, 1, 0), w + dw));
    }
    test('rfI: polygons of one plane on a 0.01 rounding boundary (0.075, 0.005, 0.015, 0.125, 2.005, −0.075) with ±1e-12 noise are one face; 1e-3 apart, tilted 0.01 rad or in another body they stay apart', function () {
      [0.075, 0.005, 0.015, 0.125, 2.005, -0.075].forEach(function (w) {
        assert(Math.round((w + 1e-12) * 100) !== Math.round((w - 1e-12) * 100), w + ' is a boundary of the old key');
        var m = K.meshFromBody({ polygons: [quad(w, 1e-12, 0), quad(w, -1e-12, 1)] });
        assert(m.faces.length === 1, w + ': ' + m.faces.length + ' faces');
        near(m.faces[0].area, 2, 1e-12, w + ': area');
      });
      assert(K.meshFromBody({ polygons: [quad(0.075, 0, 0), quad(0.076, 0, 1)] }).faces.length === 2, '1e-3 apart: two faces');
      var tilt = new V(0, Math.cos(0.01), Math.sin(0.01));
      assert(K.meshFromBody({ polygons: [quad(0.075, 0, 0), quad(0.075, 0, 1, tilt)] }).faces.length === 2, 'tilted: two faces');
      var a = quad(0.075, 1e-12, 0), b = quad(0.075, -1e-12, 1); b.body = 1;
      assert(K.meshFromBody({ polygons: [a, b] }).faces.length === 2, 'two bodies: two faces');
      return 'ok';
    });
    test('rfI: a cut plate whose top sits on a rounding boundary (0.075 in, 0.015 in, 0.005 mm, 2.005 mm) has one top face, area = bottom face = plate − hole − slot', function () {
      var out = [];
      [[0.075, 'in', 2], [0.015, 'in', 2], [0.005, 'mm', 50], [2.005, 'mm', 50]].forEach(function (c) {
        var T = c[0], s = c[2], r = build('p.units("' + c[1] + '");\np.box(' + s + ', ' + s / 2 + ', ' + T + ');\np.sketch("Top", ' + T + ').circle(' + s / 4 + ', -' + s / 4 + ', ' + s / 10 + ').slot(' + s / 2 + ', -' + s / 4 + ', ' + 0.8 * s + ', -' + s / 4 + ', ' + s / 10 + ').cut("through", { reverse: true });');
        noErrors(r);
        var tops = r.mesh.faces.filter(function (f) { return f.normal[1] > 0.999 && Math.abs(f.w - T) < 1e-9; });
        assert(tops.length === 1, T + ' ' + c[1] + ': ' + tops.length + ' top faces');
        var bots = r.mesh.faces.filter(function (f) { return f.normal[1] < -0.999 && Math.abs(f.w) < 1e-9; });
        assert(bots.length === 1, T + ' ' + c[1] + ': ' + bots.length + ' bottom faces');
        nearRel(tops[0].area, bots[0].area, 1e-9, T + ' ' + c[1] + ': top area = bottom area');
        nearRel(tops[0].area, s * s / 2 - Math.PI * s * s / 100 - (0.3 * s * s / 10 + Math.PI * s * s / 400), 2e-3, T + ' ' + c[1] + ': plate − hole − slot');
        out.push(T + ' ' + c[1]);
      });
      return out.join(', ');
    });
    test('rfI: pick tolerance is 0.5 mm in the model\'s units (0.5 / 25.4 in an inch part) or the feature size; a fillet 0.3 mm off its edge is found, 1.5 mm off is refused, inch and mm alike', function () {
      near(K.pickTol('in', 0), 0.5 / 25.4, 1e-15, 'inch floor'); near(K.pickTol('mm', 0), 0.5, 1e-15, 'mm floor'); near(K.pickTol('in', 0.1), 0.1, 1e-15, 'size wins');
      [['in', 1], ['mm', 25.4]].forEach(function (c) {
        var s = c[1], head = 'p.units("' + c[0] + '");\np.box(' + s + ', ' + 0.5 * s + ', ' + 0.1 * s + ');\n', R = 0.03 * s;
        // the top front edge (y = 0.1, z = 0), picked on the top face 0.3 mm (found) and 1.5 mm (refused) behind it
        var ok = build(head + 'p.fillet(' + R + ', [[' + 0.5 * s + ', ' + 0.1 * s + ', ' + 0.3 * s / 25.4 + ']]);');
        noErrors(ok);
        nearRel(ok.mp.volume, 0.05 * s * s * s - (1 - Math.PI / 4) * R * R * s, 2e-3, c[0] + ': fillet volume');
        var far = build(head + 'p.fillet(' + R + ', [[' + 0.5 * s + ', ' + 0.1 * s + ', ' + 1.5 * s / 25.4 + ']]);');
        assert(Object.keys(far.errors).some(function (k) { return /No edges found/.test(far.errors[k]); }), c[0] + ': 1.5 mm off is refused, got ' + JSON.stringify(far.errors));
      });
      return 'ok';
    });
    test('rfI: shell of a small inch box (1 × 1 × .5, wall .05, top open) removes .9 × .9 × .45; a pick .15 in above the top face is refused (it was taken under the old 0.5-unit tolerance)', function () {
      var head = 'p.units("in");\np.box(1, 1, 0.5);\n';
      var r = build(head + 'p.shell(0.05, [[0.5, 0.5, 0.5]]);');
      noErrors(r);
      nearRel(r.mp.volume, 0.5 - 0.9 * 0.9 * 0.45, 1e-9, 'shell volume');
      var far = build(head + 'p.shell(0.05, [[0.5, 0.65, 0.5]]);');
      assert(Object.keys(far.errors).some(function (k) { return /not found/.test(far.errors[k]); }), 'refused, got ' + JSON.stringify(far.errors));
      return fmt(r.mp.volume);
    });
    // a circle's points with two of them moved onto a chord (where a sheet hole meets a bend's cutout polygon)
    function chordedCircle(c, r, n, start) {
      var pts = [];
      for (var i = 0; i < n; i++) { var a = start - 2 * Math.PI * i / n; pts.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); }
      var mid = function (p, q, t) { return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; };
      pts[3] = mid(pts[2], pts[4], 0.5); pts[n - 5] = mid(pts[n - 6], pts[n - 4], 0.4);
      return pts;
    }
    test('rfI: snapFlatCircle redraws a circle joined from two tessellations as a regular polygon on the true circle (centre and radius exact, turn kept); a hexagon, a bumpy circle and a slot are left alone', function () {
      var c = [5.85, -2], r = 0.1405, loop = chordedCircle(c, r, 40, 0.3), tol = K.flatCircleTol('in', r);
      var s = K.snapFlatCircle(loop, tol);
      assert(s !== loop && s.length === 40, 'snapped, ' + s.length + ' points');
      s.forEach(function (p, i) { near(Math.hypot(p[0] - c[0], p[1] - c[1]), r, 1e-12, 'point ' + i + ' on the circle'); });
      var area = 0; s.forEach(function (p, i) { var q = s[(i + 1) % s.length]; area += p[0] * q[1] - q[0] * p[1]; });
      assert(area < 0, 'clockwise like the input');
      near(s[0][0], loop[0][0], 1e-12, 'starts where the loop did');
      var reg = K.snapFlatCircle(s, tol);
      assert(reg === s, 'a regular polygon is returned as is');
      var hex = []; for (var i = 0; i < 6; i++) hex.push([Math.cos(i * Math.PI / 3), Math.sin(i * Math.PI / 3)]);
      assert(K.snapFlatCircle(hex, 1) === hex, 'hexagon (60° gaps) kept');
      var bumpy = chordedCircle([0, 0], 0.25, 48, 0); bumpy[10] = [bumpy[10][0] * 0.97, bumpy[10][1] * 0.97];
      assert(K.snapFlatCircle(bumpy, K.flatCircleTol('in', 0.25)) === bumpy, 'a bump of .0075 in kept');
      var slot = []; for (i = 0; i <= 16; i++) slot.push([1 + 0.2 * Math.cos(-Math.PI / 2 + Math.PI * i / 16), 0.2 * Math.sin(-Math.PI / 2 + Math.PI * i / 16)]);
      for (i = 0; i <= 16; i++) slot.push([-1 + 0.2 * Math.cos(Math.PI / 2 + Math.PI * i / 16), 0.2 * Math.sin(Math.PI / 2 + Math.PI * i / 16)]);
      assert(K.snapFlatCircle(slot, 1) === slot, 'slot kept');
      return 'tol ' + fmt(tol);
    });
    test('rfI: a Ø.281 hole through the bend of an inch Edge Flange (Material Inside) and a Ø7 hole on a mm one flatten to one CIRCLE on HOLES at the drilled centre (DXF, entities and polyline styles)', function () {
      var T = 0.0598, out = [];
      [['p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.sketch("Top", ' + T + ').circle(5.85, -2, 0.1405).cut("through", { reverse: true });\np.flange(1, [[6, ' + T + ', 1]], { position: "inside" });', 'in', [5.85, -2], 0.1405],
       ['p.sheet(1.5, 1.5, 0.5);\np.sketch("Top").rect(0, -100, 150, 100).end().baseFlange();\np.sketch("Top", 1.5).circle(145, -50, 3.5).cut("through", { reverse: true });\np.flange(25, [[150, 1.5, 20]], { position: "inside" });', 'mm', [145, -50], 3.5]].forEach(function (c) {
        var r = build(c[0]);
        noErrors(r);
        var flat = K.flatPattern(r.model, r.build, r.mesh);
        assert(flat.loops.length === 2 && flat.bends.length === 1, c[1] + ': loops ' + flat.loops.length + ', bends ' + flat.bends.length);
        flat.loops[1].forEach(function (p) { near(Math.hypot(p[0] - c[2][0], p[1] - c[2][1]), c[3], 1e-9, c[1] + ': hole point on the drilled circle'); });
        ['entities', 'polyline'].forEach(function (st) {
          var dxf = K.exportDXFFlat(flat, c[1], { style: st, origin: false }), holes = dxf.match(/\n\s*0\s*\n(LINE|ARC|CIRCLE|POLYLINE|LWPOLYLINE)\s*\n\s*8\s*\nHOLES\b/g) || [];
          assert(holes.length === 1 && /CIRCLE/.test(holes[0]), c[1] + ' ' + st + ': HOLES entities ' + JSON.stringify(holes));
        });
        out.push(c[1] + ' ' + flat.loops[1].length + ' pts');
      });
      return out.join(', ');
    });
    test('rfI: ANSI Inch 82° countersinks for 7/8 and 1 flat heads are Ø1.625 and Ø1.875 (ASME B18.6.2 / B18.3 head Ø max, theoretical sharp)', function () {
      if (typeof HoleWizard === 'undefined') fail('HoleWizard is undefined');
      [['7/8', 1.625], ['1', 1.875], ['3/4', 1.375], ['1/2', 0.875]].forEach(function (c) {
        var s = HoleWizard.spec({ standard: HoleWizard.ANSI, holeType: 'csk', size: c[0], fit: 'normal' }, 'in');
        near(s.csk.dia, c[1], 1e-12, c[0]); assert(s.csk.angle === 82, c[0] + ' angle ' + s.csk.angle);
      });
      return 'ok';
    });
  })();
  // --- end rfI ---
