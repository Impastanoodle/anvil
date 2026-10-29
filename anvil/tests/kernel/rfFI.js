  // --- rfFI (2026-10-29, lane FI: rims end on the exact silhouette of the curved face that hides them) ---
  (function () {
    group('rfFI: a rim hidden by a swept tube ends on the tube\'s exact silhouette (Mug isometric, any tessellation)');
    var DW = Drawing;
    function mug() { return build(AnvilExamples.filter(function (e) { return e.name === 'Mug'; })[0].code); }
    function segD(p, l) { var dx = l[2] - l[0], dy = l[3] - l[1], L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, ((p[0] - l[0]) * dx + (p[1] - l[1]) * dy) / L2)) : 0; return Math.hypot(p[0] - l[0] - t * dx, p[1] - l[1] - t * dy); }
    function ellAt(q, t) { return [q.c[0] + Math.cos(t) * q.ax[0] + Math.sin(t) * q.ay[0], q.c[1] + Math.cos(t) * q.ax[1] + Math.sin(t) * q.ay[1]]; }
    // distance in the view from p to the exact silhouette of the handle's bend (torus: centre (44, 45, 0), axis z,
    // R 25, r 5), sampled every 0.01° of its sweep (to within 0.003 mm)
    function torusSilD(pr, p) {
      var e = pr.e, bb = e[2], best = Infinity;
      for (var i = 0; i <= 18000; i++) {
        var f = -Math.PI / 2 + Math.PI * i / 18000, w = [Math.cos(f), Math.sin(f), 0], aa = w[0] * e[0] + w[1] * e[1], h = Math.hypot(aa, bb);
        [1, -1].forEach(function (sg) {
          var c = sg * bb / h, s = -sg * aa / h, X = [44 + w[0] * (25 + 5 * c), 45 + w[1] * (25 + 5 * c), 5 * s];
          best = Math.min(best, Math.hypot(X[0] * pr.u[0] + X[1] * pr.u[1] + X[2] * pr.u[2] - p[0], X[0] * pr.v[0] + X[1] * pr.v[1] + X[2] * pr.v[2] - p[1]));
        });
      }
      return best;
    }
    // the bottom rim (centre at the origin) and the point where its visible run ends under the handle
    function rimEnd(pr) {
      var q = pr.ellipses.visible.filter(function (x) { return !x.full && Math.hypot(x.c[0], x.c[1]) < 1e-9; })[0];
      assert(q, 'the bottom rim is a partial ellipse');
      return { q: q, p: ellAt(q, q.t1) };
    }
    [['default tessellation (maxAngle 12°)', null], ['maxAngle off (the old tessellation)', { maxAngle: 0 }]].forEach(function (cfg) {
      test('rfFI: Mug isometric, ' + cfg[0] + ': the bottom rim ends on the handle\'s drawn exact silhouette, which meets it there; hidden-line view continues it as hidden from the same point', function () {
        var was = K.setTessellation({});
        try {
          if (cfg[1]) K.setTessellation(cfg[1]);
          var r = mug(); noErrors(r);
          var pr = DW.projectView(r.mesh, 'Isometric', { display: 'hlr' }), en = rimEnd(pr);
          var md = Infinity, on = null;
          pr.lines.visible.forEach(function (l) { var d = segD(en.p, l); if (d < md) { md = d; on = l; } });
          assert(md < 1e-6, 'the rim end lies on a drawn line (' + md.toFixed(5) + ' mm off)');
          // that line is the handle's exact silhouette (chord ends on it), and the rim end is on the true outline
          var ds = Math.max(torusSilD(pr, [on[0], on[1]]), torusSilD(pr, [on[2], on[3]]));
          assert(ds < 0.01, 'the line it ends on is the bend\'s exact silhouette (' + ds.toFixed(5) + ' mm off)');
          var de = torusSilD(pr, en.p);
          assert(de < 0.02, 'the rim end is within a silhouette chord\'s sagitta of the true outline (' + de.toFixed(4) + ' mm)');
          // Hidden Lines Visible: the hidden part of the same rim starts where the visible part stops
          var hv = DW.projectView(r.mesh, 'Isometric', { display: 'hlv' }), ev = rimEnd(hv);
          var hs = hv.ellipses.hidden.filter(function (x) { return Math.hypot(x.c[0], x.c[1]) < 1e-9 && Math.hypot(x.ax[0] - ev.q.ax[0], x.ax[1] - ev.q.ax[1]) < 1e-9; });
          assert(hs.length, 'the rim has hidden pieces in Hidden Lines Visible');
          var gap = Math.min.apply(null, hs.map(function (x) { var a = ellAt(x, x.t0), b = ellAt(x, x.t1); return Math.min(Math.hypot(a[0] - ev.p[0], a[1] - ev.p[1]), Math.hypot(b[0] - ev.p[0], b[1] - ev.p[1])); }));
          assert(gap < 1e-9, 'a hidden piece of the rim starts at the visible end (' + gap + ' mm apart)');
          return 'rim end ' + de.toFixed(4) + ' mm from the true outline; silhouette chord ends ' + ds.toExponential(1) + ' mm';
        } finally { K.setTessellation(was); }
      });
    });
  })();
  // --- end rfFI ---
