  // --- rfNX (2026-11-16, lane smaudit: the folded part against its blank, every sheet-metal feature) ---
  // The shop cuts blanks from the flat pattern. For every bend, the folded bend metal is (R + T/2)·A·T per unit width
  // and the blank strip BA per unit width, so: folded volume = T·(blank area − Σ strips) + Σ strip·(R + T/2)·A / BA·T
  // (rfNXidentity; strips = the blank inside bend line ± BA/2). The blank's size is the closed form of each feature
  // (SolidWorks' definitions; test-reports/2026-11-16-sheetmetal-blank-audit.md lists them) under K-factor, Bend
  // Deduction and a Bend Table. Fixed in this lane: Sketched Bend / Jog Material Inside / Outside off 90° place the wall
  // as Edge Flange does; a flange whose wall crosses an earlier wall is refused (it was hidden by the union: blank
  // notched, folded 0.7 % over it); Corner Relief at a corner that is not square is refused by name.
  (function () {
    group('rfNX: folded part = blank (strip identity), blank = closed forms under K / BD / bend table, walls where the position puts them, crossing walls refused');
    var D = Math.PI / 180;
    function rfNXossb(A, R, T) { return A <= Math.PI / 2 + 1e-12 ? (R + T) * Math.tan(A / 2) : R + T; }
    // the bend-allowance methods: K .33, a Bend Deduction (BD90 of K .42, every angle), a BD bend table interpolated
    function rfNXmethods(T, R) {
      var BD = 2 * (R + T) - Math.PI / 2 * (R + 0.42 * T), tA = [30, 90, 150, 180, 270];
      var rows = tA.map(function (a) { return { thickness: T, radius: R, angle: a, value: 2 * rfNXossb(a * D, R, T) - a * D * (R + 0.4 * T) }; });
      function tbd(deg) { for (var i = 0; i + 1 < tA.length; i++) if (deg >= tA[i] - 1e-9 && deg <= tA[i + 1] + 1e-9) return rows[i].value + (rows[i + 1].value - rows[i].value) * (deg - tA[i]) / (tA[i + 1] - tA[i]); return null; }
      return [
        { name: 'K .33', k: 0.33, opts: null, BA: function (A, r) { return A * (r + 0.33 * T); } },
        { name: 'BD', k: 0.5, opts: { bendAllowanceType: 'deduction', bendDeduction: BD }, BA: function (A, r) { return 2 * rfNXossb(A, r, T) - BD; } },
        { name: 'table', k: 0.5, opts: { bendAllowanceType: 'table', bendTable: { kind: 'BD', name: 'rfNX', rows: rows } }, BA: function (A, r) { return Math.abs(r - R) > 1e-9 ? A * (r + 0.5 * T) : 2 * rfNXossb(A, r, T) - tbd(A / D); } }   // no row for the radius: the sheet's K (a warning)
      ];
    }
    function rfNXhead(T, R, m) { return 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + m.k + (m.opts ? ', ' + JSON.stringify(m.opts) : '') + ');\n'; }
    function rfNXclip(l, H) {
      var out = l;
      H.forEach(function (h) {
        var inp = out; out = [];
        for (var i = 0; i < inp.length; i++) {
          var p = inp[i], q = inp[(i + 1) % inp.length], dp = h.n[0] * p[0] + h.n[1] * p[1] - h.w, dq = h.n[0] * q[0] + h.n[1] * q[1] - h.w;
          if (dp <= 0) out.push(p);
          if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { var t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        }
      });
      return out;
    }
    function rfNXarea(fl) { return fl.loops.reduce(function (s, l, i) { return s + (i === 0 ? 1 : -1) * Math.abs(K.signedArea(l)); }, 0); }
    // the folded volume the blank stands for
    function rfNXidentity(fl) {
      var T = +fl.sheet.thickness, v = T * rfNXarea(fl);
      (fl.bends || []).forEach(function (b) {
        if (!(b.ba > 0)) return;
        var dx = b.b[0] - b.a[0], dy = b.b[1] - b.a[1], L = Math.hypot(dx, dy), d = [dx / L, dy / L], n = [-d[1], d[0]];
        var c = n[0] * b.a[0] + n[1] * b.a[1], t0 = d[0] * b.a[0] + d[1] * b.a[1];
        var H = [{ n: n, w: c + b.ba / 2 }, { n: [-n[0], -n[1]], w: -(c - b.ba / 2) }, { n: d, w: t0 + L }, { n: [-d[0], -d[1]], w: -t0 }];
        var S = fl.loops.reduce(function (s, l, i) { var q = rfNXclip(l, H); return s + (q.length > 2 ? (i === 0 ? 1 : -1) * Math.abs(K.signedArea(q)) : 0); }, 0);
        v += T * S * ((b.R + T / 2) * Math.abs(b.angle) * D / b.ba - 1);
      });
      return v;
    }
    function rfNXflat(code) { var r = build(code); noErrors(r); r.flat = K.flatPattern(r.model, r.build, r.mesh); return r; }
    function rfNXclosed(r, label) { var q = K.meshQuality(r.mesh); assert(q.openEdges === 0 && q.nonManifoldEdges === 0, label + ': ' + q.openEdges + ' open, ' + q.nonManifoldEdges + ' non-manifold edges'); }
    function rfNXsize(fl) { return [Math.max(fl.size[0], fl.size[1]), Math.min(fl.size[0], fl.size[1])]; }
    function rfNXshift(pos, A, R, T) {
      if (pos === 'bendOutside') return 0;
      if (pos === 'virtualSharp') return (R + T) * Math.tan(A / 2);
      if (Math.abs(A - Math.PI / 2) < 1e-12) return pos === 'inside' ? R + T : R;
      return pos === 'inside' ? ((R + T) - R * Math.cos(A)) / Math.sin(A) : R * Math.tan(A / 2);
    }
    var GA = [[20, 0.0359], [11, 0.1196]];

    test('rfNX: Edge Flange 30° to 150°, Material Inside / Outside / Virtual Sharp, 20 and 11 ga under K .33, a Bend Deduction and a bend table: blank 6 × (4 − shift + BA + wall), bend line at −shift + BA/2, folded = the blank\'s identity (1e-9), closed', function () {
      var n = 0, refused = 0;
      GA.forEach(function (g) {
        var T = g[1], R = T;
        rfNXmethods(T, R).forEach(function (m) {
          [30, 60, 90, 120, 150].forEach(function (deg) {
            ['inside', 'outside', 'virtualSharp'].forEach(function (pos) {
              var A = deg * D, BA = m.BA(A, R), label = g[0] + ' ga ' + m.name + ' ' + deg + '° ' + pos;
              var code = rfNXhead(T, R, m) + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.flange(1, [[3, ' + T + ', 0]], { angle: ' + deg + ', position: "' + pos + '", lengthRef: "outer" });\n';
              if (BA < 0) {   // a single BD larger than twice the setback of a small angle: the flat refuses, never a negative strip
                var e = build(code), msg = '';
                try { K.flatPattern(e.model, e.build, e.mesh); } catch (x) { msg = x.message; }
                assert(/bend deduction .* is larger than twice the outside setback/.test(msg), label + ': refused (' + msg + ')');
                refused++;
                return;
              }
              var r = rfNXflat(code), fl = r.flat, sh = rfNXshift(pos, A, R, T), Lw = 1 - (R + T) * Math.tan(A / 2);
              var sz = rfNXsize(fl);
              near(sz[0], 6, 1e-9, label + ': blank width');
              near(sz[1], 4 - sh + BA + Lw, 1e-9, label + ': blank length across the bend');
              assert(fl.bends.length === 1, label + ': one bend line');
              near(fl.bends[0].a[1], -sh + BA / 2, 1e-9, label + ': bend line');
              near(fl.bends[0].ba, BA, 1e-12, label + ': BA');
              nearRel(r.mp.volume, rfNXidentity(fl), 1e-9, label + ': folded vs blank');
              nearRel(r.mp.volume, T * 6 * (4 - sh + Lw) + (R + T / 2) * A * T * 6, 1e-9, label + ': folded vs closed form');
              rfNXclosed(r, label);
              n++;
            });
          });
        });
      });
      return n + ' built exact, ' + refused + ' refused (BD at 30° / 60°)';
    });

    test('rfNX: hems (Closed, Open, Tear Drop 200° / 250°, Rolled 270° / 180°; Material Inside and Bend Outside), 11 ga K .33 and bend table: blank 4 − shift + BA + leg, bend line, folded = the blank\'s identity (1e-9)', function () {
      var T = 0.1196, R = T, MM = 1 / 25.4, n = 0;
      rfNXmethods(T, R).filter(function (m) { return m.name !== 'BD'; }).forEach(function (m) {
        [['closed', ''], ['open', ', gap: ' + 2 * T], ['teardrop', ', hemAngle: 200, hemRadius: ' + R], ['teardrop', ', hemAngle: 250, hemRadius: 0.1'], ['rolled', ', hemAngle: 270, hemRadius: ' + R], ['rolled', ', hemAngle: 180, hemRadius: 0.1']].forEach(function (h) {
          ['inside', 'outside'].forEach(function (hp) {
            var type = h[0], r0, A, Lw;
            if (type === 'closed') { r0 = 0.05 * MM; A = Math.PI; Lw = 0.5 - r0 - T; }
            else if (type === 'open') { r0 = T; A = Math.PI; Lw = 0.5 - r0 - T; }
            else {
              A = +/hemAngle: (\d+)/.exec(h[1])[1] * D; r0 = +/hemRadius: ([\d.]+)/.exec(h[1])[1];
              Lw = type === 'rolled' ? 0 : Math.max(0, Math.min(r0 - r0 * Math.cos(A), r0 - (r0 + T) * Math.cos(A)) / -Math.sin(A) - 0.2 * MM);
            }
            var sh = hp === 'inside' ? r0 + T : 0, BA = m.BA(A, r0), label = m.name + ' ' + type + h[1] + ' ' + hp;
            var r = rfNXflat(rfNXhead(T, R, m) + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.hem(0.5, [[3, ' + T + ', 0]], { hemType: "' + type + '", hemPosition: "' + hp + '"' + h[1] + ' });\n');
            near(rfNXsize(r.flat)[1], 4 - sh + BA + Lw, 1e-9, label + ': blank length');
            near(r.flat.bends[0].a[1], -sh + BA / 2, 1e-9, label + ': bend line');
            nearRel(r.mp.volume, rfNXidentity(r.flat), 1e-9, label + ': folded vs blank');
            rfNXclosed(r, label);
            n++;
          });
        });
      });
      return n + ' hems exact';
    });

    // the moved wall's faces run on to the plane of the bend's inside face: Material Inside puts the outer face on the
    // sketch line, Material Outside the inner face (SolidWorks' Edge Flange rule, now also Sketched Bend and Jog)
    function rfNXwall(r, A, rev) {
      var sy = rev ? -1 : 1, yIn = rev ? 0 : +r.model.sheet.thickness, out = {};
      [['outer', [Math.sin(A), -sy * Math.cos(A)]], ['inner', [-Math.sin(A), sy * Math.cos(A)]]].forEach(function (w) {
        var best = null;
        r.mesh.faces.forEach(function (f) {
          if (Math.abs(f.normal[0] - w[1][0]) > 1e-7 || Math.abs(f.normal[1] - w[1][1]) > 1e-7 || Math.abs(f.normal[2]) > 1e-7) return;
          var x = (f.w - f.normal[1] * yIn) / f.normal[0];
          if (best == null || Math.abs(x - 3) < Math.abs(best - 3)) best = x;
        });
        out[w[0]] = best;
      });
      return out;
    }
    test('rfNX: Sketched Bend and Jog at 45° / 60° / 120°, Material Inside: the wall\'s outer face on the line; Material Outside: its inner face (was R + T / R back at any angle: .0205 short at 45°, 11 ga); blank unchanged', function () {
      var n = 0;
      GA.forEach(function (g) {
        var T = g[1], R = T, head = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.33);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Top", ' + T + ').line(3, 0, 3, -2)';
        [45, 60, 120].forEach(function (deg) {
          ['inside', 'outside'].forEach(function (pos) {
            var A = deg * D, BA = A * (R + 0.33 * T), sh = rfNXshift(pos, A, R, T), label = g[0] + ' ga ' + deg + '° ' + pos;
            var sb = rfNXflat(head + '.sketchedBend(' + deg + ', { fixed: [1, ' + T + ', 1], position: "' + pos + '" });\n'), w = rfNXwall(sb, A, false);
            near(w[pos === 'inside' ? 'outer' : 'inner'], 3, 1e-9, 'Sketched Bend ' + label + ': the wall face on the line');
            near(sb.flat.bends[0].a[0], 3 - sh + BA / 2, 1e-9, 'Sketched Bend ' + label + ': bend line');
            near(rfNXsize(sb.flat)[0], 4, 1e-12, 'Sketched Bend ' + label + ': blank is the plate');
            nearRel(sb.mp.volume, rfNXidentity(sb.flat), 1e-9, 'Sketched Bend ' + label + ': folded vs blank');
            if (deg === 120) return;
            var j = rfNXflat(head + '.jog(0.5, { fixed: [1, ' + T + ', 1], angle: ' + deg + ', offsetRef: "outside", position: "' + pos + '", reverse: true });\n'), wj = rfNXwall(j, A, true);
            near(wj[pos === 'inside' ? 'outer' : 'inner'], 3, 1e-9, 'Jog ' + label + ': the riser face on the line');
            nearRel(j.mp.volume, rfNXidentity(j.flat), 1e-9, 'Jog ' + label + ': folded vs blank');
            n += 2;
          });
        });
      });
      // 90°: the old R + T / R, bit for bit
      var T0 = 0.0598, r9 = rfNXflat('p.units("in");\np.sheet(' + T0 + ', ' + T0 + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.sketch("Top", ' + T0 + ').line(3, 0, 3, -2).sketchedBend(90, { fixed: [1, ' + T0 + ', 1], position: "inside" });\n');
      assert(r9.flat.bends[0].a[0] === 3 - (T0 + T0) + Math.PI / 2 * (T0 + 0.5 * T0) / 2, '90° Material Inside bend line bit for bit: ' + r9.flat.bends[0].a[0]);
      return n + ' sketched bends / jogs';
    });

    var TRAY = function (a, b, pos) {
      var T = 0.0598;
      return 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, ' + T + ', 1.5]], { angle: ' + a + ', position: "' + pos + '", lengthRef: "outer" });\np.flange(1, [[2, ' + T + ', 3]], { angle: ' + b + ', position: "' + pos + '", lengthRef: "outer" });\n';
    };
    test('rfNX: two Edge Flanges on neighbouring edges whose walls cross (120° / 120°, 120° then 90°, 100° Bend Outside), a flange into a hem: a feature warning naming the other (the union hid it: blank notched, folded 0.2 % to 1 % over); 90° then 120° (no crossing) and a curved sheet\'s end flange build without it', function () {
      [[120, 120, 'inside'], [120, 90, 'inside'], [120, 120, 'bendOutside'], [100, 100, 'bendOutside'], [150, 150, 'outside']].forEach(function (c) {
        var r = build(TRAY(c[0], c[1], c[2])), w = Object.keys(r.warnings || {}).map(function (k) { return r.warnings[k]; }).join(' ');
        noErrors(r);
        assert(/runs into the flange on edge \(4, 0\.0598, 1\.5\): the two cross at the corner/.test(w), c.join(' ') + ': ' + (w || 'no warning'));
      });
      var hm = build('p.units("in");\np.sheet(0.0747, 0.0747, 0.5);\np.sketch("Top").rect(0, -4, 4.75, 4).end().baseFlange();\np.hem(0.5, [[4.75, 0.0747, 2]], { hemType: "open" });\np.flange(1.125, [[2.375, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\n');
      assert(/runs into the hem on edge \(4\.75, 0\.0747, 2\)/.test(Object.keys(hm.warnings || {}).map(function (k) { return hm.warnings[k]; }).join(' ')), 'flange into a hem warned');
      var ok = rfNXflat(TRAY(90, 120, 'inside'));
      assert(!Object.keys(ok.warnings || {}).length, '90° then 120°: no warning');
      nearRel(ok.mp.volume, rfNXidentity(ok.flat), 1e-9, '90° then 120°: folded vs blank');
      rfNXclosed(ok, '90° then 120°');
      var cyl = build('p.units("in");\np.sheet(0.06, 0.06, 0.5);\nvar path = p.sketch("Top").arc(0, 0, 5, 0, 90).id();\nvar prof = p.sketch("Front").line(5, 0, 5, 2).id();\np.sweptFlange(prof, path, { flatten: "path" });\np.flange(1, [[5, 1, 0]], { angle: 120 });\n');
      assert(!Object.keys(cyl.warnings || {}).length, 'a 120° flange on a rolled sheet\'s end (its chords): no warning');
      // one feature over both edges mitres the corner: builds (SolidWorks' mitre, folded under its blank as SolidWorks')
      var one = build('p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, 0.0598, 1.5], [2, 0.0598, 3]], { angle: 120, position: "inside", lengthRef: "outer" });\n');
      noErrors(one);
    });

    test('rfNX: Corner Relief at a corner that is not square (a trapezoid, 71.6°) is refused by name; a square corner beside it still builds', function () {
      var T = 0.0598, TZ = 'p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").polyline([[0, 0], [6, 0], [5, -3], [1, -3]], true).end().baseFlange();\n' +
        'p.flange(0.94, [[3, ' + T + ', 0]], { position: "inside" });\np.flange(0.94, [[5.5, ' + T + ', 1.5]], { position: "inside" });\n';
      var r = build(TZ + 'p.cornerRelief([[5.8, ' + T + ', 0.15]], 0.25, { reliefType: "rect" });\n'), e = Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }).join(' ');
      assert(/meet at 71\.6°; Corner Relief is built only where two bends meet square/.test(e), 'refused by name: ' + (e || 'built'));
      var sq = rfNXflat('p.units("in");\np.sheet(' + T + ', ' + T + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\np.flange(1, [[2, ' + T + ', 3]], { position: "inside", lengthRef: "outer" });\np.cornerRelief([[3.88, ' + T + ', 2.88]], 0.25);\n');
      nearRel(sq.mp.volume, rfNXidentity(sq.flat), 1e-9, 'square corner relief: folded vs blank');
    });
  })();
