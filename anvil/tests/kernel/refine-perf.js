  // --- refine/perf ---
  // Rebuild speed and robustness of the modelling core (refine/perf lane): the shell is one intersection, the BSP
  // split test has a bounding-sphere shortcut, and clipping appends instead of copying lists at every tree level.
  group('refine/perf');
  (function () {
    // the solid just before feature `upto` (exclusive) and that feature, for calling K.buildShell directly
    function before(code, typeName) {
      var model = K.newModel('P'); K.runScript(model, code);
      var i = model.features.map(function (f) { return f.type; }).lastIndexOf(typeName);
      var m2 = JSON.parse(JSON.stringify(model)); m2.features = m2.features.slice(0, i);
      return { body: K.rebuild(m2).body, f: JSON.parse(JSON.stringify(model.features[i])) };
    }
    var SHELLS = [
      'p.box(60, 40, 20);\np.shell(2, [[30, 20, 20]]);',
      'p.box(60, 40, 10);\np.box(10, 40, 50);\np.shell(2, []);',
      'p.cylinder(20, 30);\np.shell(2, [[0, 30, 0]]);',
      'p.box(60, 40, 20);\np.hole("Top", 30, -20, 10, { offset: 20 });\np.shell(2, [[10, 20, 10]]);',
      'var s1 = p.sketch("Top").centerRect(0, 0, 40, 40).id();\nvar s2 = p.sketch("Top", 30).centerRect(0, 0, 20, 20).id();\np.loft([s1, s2]);\np.shell(2, [[0, 30, 0]]);',
      AnvilExamples.filter(function (e) { return e.name === 'Funnel'; })[0].code
    ];
    test('shell walls = body ∩ slab union, the same solid as body − cavity (the old construction) to 1e-9 on 6 parts incl. the Funnel', function () {
      var worst = 0;
      SHELLS.forEach(function (code, k) {
        var s = before(code, 'shell'), r = K.buildShell(s.f, { body: s.body });
        var old = s.body.subtract(r.inner).volume(), v = r.body.volume();
        nearRel(v, old, 1e-9, 'shell ' + k);
        worst = Math.max(worst, Math.abs(v - old) / old);
      });
      return 'worst relative difference ' + worst.toExponential(1);
    });
    test('the shell cavity is built only when read (rebuilds skip it; the Shell PM preview still gets it)', function () {
      var r = build(SHELLS[0]);
      noErrors(r);
      var shf = r.model.features.filter(function (f) { return f.type === 'shell'; })[0];
      assert(r.build.tools[shf.id] === null, 'no cavity tool kept by the rebuild');
      var s = before(SHELLS[0], 'shell'), sh = K.buildShell(s.f, { body: s.body });
      near(sh.inner.intersect(s.body).volume(), 56 * 36 * 18, 1e-6, 'cavity of the open box inside the part');
      assert(sh.inner === sh.inner, 'cavity cached');
    });
    test('shell with every face removed says what to change instead of returning an empty part', function () {
      var r = build('p.box(10, 10, 10);\np.shell(1, [[5, 10, 5], [5, 0, 5], [0, 5, 5], [10, 5, 5], [5, 5, 0], [5, 5, 10]]);');
      assert(/leave at least one face/i.test(r.errors[3] || ''), 'error: ' + JSON.stringify(r.errors));
      near(r.mp.volume, 1000, 1e-9, 'part left as it was');
    });
    test('bounding-sphere split shortcut changes nothing: every part example rebuilds to the identical volume and polygon count with it off', function () {
      var n = 0, msOn = 0, msOff = 0;
      AnvilExamples.forEach(function (ex) {
        if (isAsmExample(ex)) return;
        var t0 = performance.now(), a = build(ex.code);
        msOn += performance.now() - t0;
        CSG.options.sphereTest = false;
        try { t0 = performance.now(); var b = build(ex.code); msOff += performance.now() - t0; } finally { CSG.options.sphereTest = true; }
        assert(a.body.volume() === b.body.volume(), ex.name + ': volume ' + a.body.volume() + ' vs ' + b.body.volume());
        assert(a.body.polygons.length === b.body.polygons.length, ex.name + ': polygons ' + a.body.polygons.length + ' vs ' + b.body.polygons.length);
        n++;
      });
      return n + ' parts identical; ' + msOn.toFixed(0) + ' ms with the shortcut, ' + msOff.toFixed(0) + ' ms without';
    });
    test('sweep along a closed path mitres the start / end joint: volume = section area × path length (a 40 × 30 ring: 140), was 2 % short', function () {
      var A = build('p.sketch("Right").circle(0, 0, 3).extrude(10);').body.volume() / 10;
      var r = build('var prof = p.sketch("Right").circle(0, 0, 3).id();\nvar path = p.sketch("Front").polyline([[0,0],[0,-30],[40,-30],[40,0]], true).id();\np.sweep({ profile: prof, path: path });');
      noErrors(r);
      nearRel(r.body.volume(), A * 140, 1e-9, 'closed rectangular ring');
      var o = build('var prof = p.sketch("Right").circle(0, 0, 3).id();\nvar path = p.sketch("Front").polyline([[0,0],[0,-30],[40,-30],[40,0]], false).id();\np.sweep({ profile: prof, path: path });');
      nearRel(o.body.volume(), A * 100, 1e-9, 'open path unchanged');
      return fmt(r.body.volume()) + ' = ' + fmt(A) + ' × 140';
    });
    test('deep BSP chains: a 400-facet prism intersected with a 300-facet one clips in linear-copy time and gives the exact lens volume', function () {
      function ngon(n, r, cx) {
        var pts = []; for (var i = 0; i < n; i++) pts.push([cx + r * Math.cos(2 * Math.PI * i / n), r * Math.sin(2 * Math.PI * i / n)]);
        return pts;
      }
      var a = build('p.sketch("Front").polyline(' + JSON.stringify(ngon(400, 20, 0)) + ', true).extrude(10);').body;
      var b = build('p.sketch("Front").polyline(' + JSON.stringify(ngon(300, 20, 15)) + ', true).extrude(10);').body;
      var t0 = performance.now(), x = a.intersect(b), ms = performance.now() - t0;
      // the two polygons' common area by Sutherland-Hodgman, times the depth
      var clip = ngon(400, 20, 0), poly = ngon(300, 20, 15);
      for (var i = 0; i < poly.length; i++) {
        var p1 = poly[i], p2 = poly[(i + 1) % poly.length], out = [];
        function inside(q) { return (p2[0] - p1[0]) * (q[1] - p1[1]) - (p2[1] - p1[1]) * (q[0] - p1[0]) >= 0; }
        function cut(s, e) { var dx = e[0] - s[0], dy = e[1] - s[1], ex = p2[0] - p1[0], ey = p2[1] - p1[1], t = (ex * (s[1] - p1[1]) - ey * (s[0] - p1[0])) / (ey * dx - ex * dy); return [s[0] + t * dx, s[1] + t * dy]; }
        for (var j = 0; j < clip.length; j++) {
          var s = clip[(j + clip.length - 1) % clip.length], e = clip[j];
          if (inside(e)) { if (!inside(s)) out.push(cut(s, e)); out.push(e); } else if (inside(s)) out.push(cut(s, e));
        }
        clip = out;
      }
      var area = 0; for (var k = 0; k < clip.length; k++) { var u = clip[k], w = clip[(k + 1) % clip.length]; area += u[0] * w[1] - w[0] * u[1]; }
      nearRel(x.volume(), Math.abs(area) / 2 * 10, 1e-9, 'lens volume');
      return x.polygons.length + ' polygons, ' + ms.toFixed(1) + ' ms';
    });
  })();
  // --- end refine/perf ---
