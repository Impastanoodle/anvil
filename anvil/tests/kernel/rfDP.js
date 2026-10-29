  // ------------------------------------------------------------------ rfDP: ETCH marks across bends; exact Selected Contours
  // (1) flatEtch: a mark drawn on a face that runs off it over a bend is cut at the bend's edge and the part over the
  // bend is projected along the sketch normal onto the bend's surface and unrolled by angle (s = BA·θ/A), the way the
  // flat's strip is; past 90° it is lost (warning), under 90° it goes on onto the wall. The CUT outline is unchanged.
  // (2) Selected Contours on a spline / ellipse region extrude to the same exact surface as the full profile.
  (function () {
    group('rfDP: ETCH marks across bends in the flat DXF; exact spline / ellipse Selected Contours');
    var T = 0.0598, R = 0.0598, KF = 0.5;
    var LAY = '.layers([{ name: "ETCH", color: "#1e9e3c", aci: 3, noProfile: true }])';
    var HEAD = 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function rfDPFlat(code) {
      var m = K.newModel('rfDP');
      K.runScript(m, code);
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, 'errors ' + JSON.stringify(b.errors));
      return { model: m, build: b, flat: K.flatPattern(m, b, K.meshFromBody(b.body)) };
    }
    function rfDPLine(f, a, b, tol) {
      return f.etch.filter(function (it) {
        if (it.t !== 'line') return false;
        function d(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); }
        return (d(it.a, a) < tol && d(it.b, b) < tol) || (d(it.a, b) < tol && d(it.b, a) < tol);
      }).length;
    }
    // DXF entities: [{ t, '8': layer, '10': x, … }] (first value of each group code)
    function rfDPEnts(dxf) {
      var L = dxf.split(/\r?\n/), out = [], cur = null, inEnt = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '2' && v === 'ENTITIES') { inEnt = true; continue; }
        if (!inEnt) continue;
        if (c === '0') { if (v === 'ENDSEC') break; cur = { t: v }; out.push(cur); continue; }
        if (cur && !(c in cur)) cur[c] = /^(8|1|2|3|7|100|5|330)$/.test(c) ? v : +v;
      }
      return out.filter(function (e) { return e.t !== 'VERTEX' && e.t !== 'SEQEND'; });
    }
    var BA90 = K.bendAllowance(Math.PI / 2, R, T, KF), S60 = Math.sin(Math.PI / 3);
    // base top face: a 0.5 line, a line square to the bend into it up to θ = 60°, a slanted line to the same depth;
    // the flange's inner face (Front at z = −R): a circle and a line coming down into the bend to θ = 60° from the wall
    var PART = HEAD + 'p.flange(1, [[2, ' + T + ', 0]]);\n' +
      'p.sketch("Top", ' + T + ').line(1, -1, 1.5, -1).line(3, -0.5, 3, ' + (R * S60) + ').line(2, -0.5, 2.5, ' + (R * S60) + ')' + LAY + '.layer("ETCH", [0, 1, 2]).end();\n' +
      'p.sketch("Front", ' + (-R) + ').circle(2, 0.6, 0.1).line(3, 0.6, 3, ' + (T + R - R * 0.5) + ')' + LAY + '.layer("ETCH", [0, 1]).end();\n';
    test('rfDP: ETCH lines / circles on the base and the flange go to the flat at the developed positions; a line into the bend is split at the bend edge and unrolled (s = BA·θ/A)', function () {
      var r = rfDPFlat(PART), f = r.flat, BA = f.bends[0].ba, wall0 = T + R;   // the wall's start line (inner face) at Y = T + R
      nearRel(BA, BA90, 1e-12, 'BA');
      assert(!f.warnings.some(function (w) { return /etch/i.test(w); }), 'warnings ' + JSON.stringify(f.warnings));
      assert(rfDPLine(f, [1, -1], [1.5, -1], 1e-9) === 1, 'the 0.5 base line copied straight');
      assert(rfDPLine(f, [3, -0.5], [3, 0], 1e-9) === 1, 'the square line: base piece to the bend edge');
      assert(rfDPLine(f, [3, 0], [3, 2 * BA / 3], 1e-9) === 1, 'the square line: bend piece to s = 2·BA/3');
      var c = f.etch.filter(function (it) { return it.t === 'circle'; });
      assert(c.length === 1 && Math.hypot(c[0].c[0] - 2, c[0].c[1] - (BA + 0.6 - wall0)) < 1e-9 && Math.abs(c[0].r - 0.1) < 1e-12, 'flange circle at (2, BA + 0.6 − (T + R)): ' + JSON.stringify(c));
      assert(rfDPLine(f, [3, BA + 0.6 - wall0], [3, BA], 1e-9) === 1, 'the wall line down to the wall start');
      assert(rfDPLine(f, [3, BA], [3, 2 * BA / 3], 1e-9) === 1, 'the wall line over the bend: from BA back to θ = 60°');
      // the slanted line: a polyline on the bend, every point at s = BA·asin(d / R)/(π/2), d its distance past the edge
      var poly = f.etch.filter(function (it) { return it.t === 'poly'; });
      assert(poly.length === 1, poly.length + ' polylines');
      var dEnd = R * S60, worst = 0;
      poly[0].pts.forEach(function (p) {
        var d = (p[0] - 2) / 0.5 * (0.5 + dEnd) - 0.5;
        worst = Math.max(worst, Math.abs(p[1] - BA * Math.asin(Math.min(1, d / R)) / (Math.PI / 2)));
      });
      assert(worst < 1e-9, 'developed slanted piece off by ' + worst);
      var last = poly[0].pts[poly[0].pts.length - 1];
      assert(Math.hypot(last[0] - 2.5, last[1] - 2 * BA / 3) < 1e-9, 'slanted line ends at (2.5, 2·BA/3): ' + JSON.stringify(last));
      return f.etch.length + ' marks, BA ' + fmt(BA);
    });
    test('rfDP: exportDXFFlat writes the developed marks on ETCH in R12 and R2000; the CUT outline is the same as without the marks', function () {
      var r = rfDPFlat(PART), f = r.flat, plain = rfDPFlat(HEAD + 'p.flange(1, [[2, ' + T + ', 0]]);\n').flat, BA = f.bends[0].ba;
      assert(JSON.stringify(f.loops) === JSON.stringify(plain.loops), 'blank loops changed by the etch sketches');
      var sh = [-f.bbox.min[0], -f.bbox.min[1]];
      ['R12', 'R2000'].forEach(function (v) {
        var ents = rfDPEnts(K.exportDXFFlat(f, 'in', { version: v })), ents0 = rfDPEnts(K.exportDXFFlat(plain, 'in', { version: v }));
        var on = function (es, l) { return es.filter(function (e) { return e['8'] === l; }); };
        assert(on(ents, 'ETCH').length === f.etch.length, v + ' ETCH entities ' + on(ents, 'ETCH').length + ' of ' + f.etch.length);
        var geo = function (es) { return JSON.stringify(es.map(function (e) { var o = {}; Object.keys(e).forEach(function (k) { if (k !== '5' && k !== '330') o[k] = e[k]; }); return o; })); };
        assert(geo(on(ents, 'OUTLINE')) === geo(on(ents0, 'OUTLINE')), v + ' OUTLINE differs');
        var hit = on(ents, 'ETCH').filter(function (e) {
          return e.t === 'LINE' && Math.abs(e['10'] - (3 + sh[0])) < 1e-9 && Math.abs(e['11'] - (3 + sh[0])) < 1e-9 &&
            Math.abs(Math.min(e['20'], e['21']) - sh[1]) < 1e-9 && Math.abs(Math.max(e['20'], e['21']) - (2 * BA / 3 + sh[1])) < 1e-9;
        });
        assert(hit.length === 1, v + ' the bend piece of the square line in the DXF');
        assert(on(ents, 'ETCH').some(function (e) { return e.t === (v === 'R12' ? 'POLYLINE' : 'LWPOLYLINE'); }), v + ' the slanted bend piece as a polyline');
        if (typeof DxfCheck !== 'undefined') { var c = DxfCheck.check(K.exportDXFFlat(f, 'in', { version: v }), { units: 'in' }); assert(c.ok, v + ' read back: ' + c.errors.slice(0, 3).join('; ')); }
      });
      return 'R12 + R2000';
    });
    test('rfDP: a mark sketched on the sheet\'s other side (a frame looking up, mirrored) develops on the outer surface (R + T)', function () {
      var f = rfDPFlat(HEAD + 'p.flange(1, [[2, ' + T + ', 0]]);\n' +
        'p.sketch({ custom: true, origin: [0, 0, 0], x: [1, 0, 0], y: [0, 0, 1], n: [0, -1, 0] }).line(3, 0.5, 3, ' + (-(R + T) * S60) + ')' + LAY + '.layer("ETCH", [0]).end();\n').flat, BA = f.bends[0].ba;
      assert(rfDPLine(f, [3, -0.5], [3, 0], 1e-9) === 1, 'base piece');
      assert(rfDPLine(f, [3, 0], [3, 2 * BA / 3], 1e-9) === 1, 'bend piece at θ = 60° on the outer surface: ' + JSON.stringify(f.etch));
      return 'ok';
    });
    test('rfDP: under 90° a mark goes on past the bend onto the wall (BA + ℓ); past a 90° bend\'s reach the rest is left out with a warning', function () {
      var A = Math.PI / 3, ell = 0.3, dEnd = R * Math.sin(A) + ell * Math.cos(A);
      var f = rfDPFlat(HEAD + 'p.flange(1, [[2, ' + T + ', 0]], { angle: 60 });\n' +
        'p.sketch("Top", ' + T + ').line(3, -0.5, 3, ' + dEnd + ')' + LAY + '.layer("ETCH", [0]).end();\n').flat, BA = f.bends[0].ba;
      nearRel(BA, K.bendAllowance(A, R, T, KF), 1e-12, 'BA 60°');
      assert(rfDPLine(f, [3, 0], [3, BA + ell], 1e-9) === 1, 'bend + wall piece to BA + ℓ: ' + JSON.stringify(f.etch));
      var g = rfDPFlat(PART.replace('line(3, -0.5, 3, ' + (R * S60) + ')', 'line(3, -0.5, 3, 0.3)')).flat;
      assert(rfDPLine(g, [3, -0.5], [3, 0], 1e-9) === 1 && rfDPLine(g, [3, 0], [3, g.bends[0].ba], 1e-9) === 1, 'kept up to s = BA');
      assert(g.warnings.some(function (w) { return /past a bend/.test(w); }), 'warning: ' + JSON.stringify(g.warnings));
      return 'ok';
    });
  })();
  // ---- (2) Selected Contours on splines / ellipses: the region's run along the curve is sampled again between the
  // crossings (moved onto the true curve) and made area-true, with fseg for OpenCascade
  (function () {
    var CAP = 4 * (2 * Math.PI / 3 - Math.sin(2 * Math.PI / 3));   // the ellipse (rx 4, ry 2) above y = 4: ab/2·(Δ − sin Δ), Δ = 120°
    function rfDPBuild(code) {
      var m = K.newModel('rfDP2');
      K.runScript(m, code);
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, 'errors ' + JSON.stringify(b.errors));
      var mesh = K.meshFromBody(b.body);
      return { model: m, build: b, mesh: mesh, v: K.massProps(mesh).volume };
    }
    test('rfDP: Selected Contours on an ellipse cut by a line: both regions extrude to the exact volume (area-true), the cap with the faces of a plain Partial Ellipse + line extrude', function () {
      var cap = rfDPBuild('p.sketch("Front").rect(0, 0, 10, 4).ellipse(5, 3, 4, 2, 0).end().extrude(2, { contours: [[5, 4.5]] });');
      var low = rfDPBuild('p.sketch("Front").rect(0, 0, 10, 4).ellipse(5, 3, 4, 2, 0).end().extrude(2, { contours: [[5, 3]] });');
      var plain = rfDPBuild('p.sketch("Front").partialEllipse(5, 3, 4, 2, 0, 30, 150).line(' + (5 - 4 * Math.cos(Math.PI / 6)) + ', 4, ' + (5 + 4 * Math.cos(Math.PI / 6)) + ', 4).end().extrude(2);');
      nearRel(cap.v, 2 * CAP, 1e-12, 'cap volume');
      nearRel(plain.v, 2 * CAP, 1e-12, 'plain cap volume');
      nearRel(low.v, 2 * (8 * Math.PI - CAP), 1e-12, 'ellipse below the line');
      // the cap's run keeps the whole ellipse's samples between the crossings (so it shares them with the region below);
      // a plain Partial Ellipse spreads round(N / 3) chords over its 120° — the same count only when N / 3 is whole
      // (N = 24 before the 10° angular limit; rfFE2: N = 40, 14 chords vs 13): the faces are 2 caps + the line + chords
      var N = K.segsForRadius(4), inside = 0;
      for (var q = 1; q < N; q++) if (360 * q / N > 30 + 1e-9 && 360 * q / N < 150 - 1e-9) inside++;
      assert(cap.mesh.faces.length === inside + 1 + 3, 'faces ' + cap.mesh.faces.length + ' = 3 + ' + (inside + 1) + ' chords');
      assert(plain.mesh.faces.length === Math.round(N / 3) + 3, 'plain faces ' + plain.mesh.faces.length);
      var prof = K.contourProfile(cap.model.features[0], [[5, 4.5]]), fs = prof.loops[0].fseg || [];
      assert(prof.free && prof.free[0].t === 'ellipse', 'profile.free ' + JSON.stringify(prof.free));
      var on = fs.filter(function (q) { return q !== -1; });
      assert(on.length >= 2 && on.length === fs.length - 1, 'fseg: every chord but the line on the ellipse: ' + JSON.stringify(fs));
      var ends = [], lo, hi;
      on.forEach(function (q) { ends.push(q[1], q[2]); });
      lo = Math.min.apply(null, ends); hi = Math.max.apply(null, ends);
      near(lo, Math.PI / 6, 1e-12, 'ellipse run from 30°'); near(hi, 5 * Math.PI / 6, 1e-12, 'to 150°');
      return fmt(cap.v) + ' / ' + fmt(low.v) + ', ' + cap.mesh.faces.length + ' faces';
    });
    test('rfDP: Selected Contours on a spline across a rectangle: the region below it extrudes to ∫ y dx exactly (Gauss on the Bézier spans); its run on the spline starts and ends on the true curve at x = 0 and x = 10', function () {
      var SP = [[-2, 2], [3, 5], [7, 1], [12, 3]];
      var low = rfDPBuild('p.sketch("Front").rect(0, 0, 10, 6).spline(' + JSON.stringify(SP) + ').end().extrude(2, { contours: [[1, 0.5]] });');
      var top = rfDPBuild('p.sketch("Front").rect(0, 0, 10, 6).spline(' + JSON.stringify(SP) + ').end().extrude(2, { contours: [[1, 5.5]] });');
      var g = K.splineGeom({ t: 'spline', pts: SP });
      function bp(B, s) { var u = 1 - s; return [0, 1].map(function (k) { return u * u * u * B[0][k] + 3 * u * u * s * B[1][k] + 3 * u * s * s * B[2][k] + s * s * s * B[3][k]; }); }
      function bd(B, s) { var u = 1 - s; return [0, 1].map(function (k) { return 3 * u * u * (B[1][k] - B[0][k]) + 6 * u * s * (B[2][k] - B[1][k]) + 3 * s * s * (B[3][k] - B[2][k]); }); }
      // the span and its parameter where x = X (x increases along this spline), by bisection
      function at(X) {
        for (var j = 0; j < g.bez.length; j++) {
          var B = g.bez[j];
          if (B[0][0] > X || B[3][0] < X) continue;
          var lo = 0, hi = 1;
          for (var k = 0; k < 80; k++) { var m = (lo + hi) / 2; if (bp(B, m)[0] < X) lo = m; else hi = m; }
          return [j, (lo + hi) / 2];
        }
        return null;
      }
      var a = at(0), b = at(10), area = 0, G = [[-Math.sqrt(0.6), 5 / 9], [0, 8 / 9], [Math.sqrt(0.6), 5 / 9]];
      for (var j = a[0]; j <= b[0]; j++) {
        var s0 = j === a[0] ? a[1] : 0, s1 = j === b[0] ? b[1] : 1, B = g.bez[j];
        G.forEach(function (gw) { var s = (s0 + s1) / 2 + (s1 - s0) / 2 * gw[0]; area += gw[1] * (s1 - s0) / 2 * bp(B, s)[1] * bd(B, s)[0]; });
      }
      nearRel(low.v, 2 * area, 1e-12, 'region below the spline');
      nearRel(low.v + top.v, 120, 1e-12, 'the two regions make the rectangle');
      var prof = K.contourProfile(low.model.features[0], [[1, 0.5]]), l = prof.loops[0];
      assert(prof.free && prof.free[0].t === 'spline' && l.fseg, 'profile.free / fseg');
      var idx = [];
      l.fseg.forEach(function (q, i) { if (q !== -1) idx.push(i); });
      assert(idx.length >= 3, 'spline chords ' + idx.length);
      var ends = [l.pts[idx[0]], l.pts[(idx[idx.length - 1] + 1) % l.pts.length]].sort(function (p, q) { return p[0] - q[0]; });
      near(ends[0][0], 0, 1e-12, 'run start x'); near(ends[1][0], 10, 1e-12, 'run end x');
      near(ends[0][1], bp(g.bez[a[0]], a[1])[1], 1e-9, 'start on the spline'); near(ends[1][1], bp(g.bez[b[0]], b[1])[1], 1e-9, 'end on the spline');
      return fmt(low.v) + ' + ' + fmt(top.v);
    });
  })();
