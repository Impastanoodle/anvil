  // --- rfLS (2026-11-11, lane stepreal2) --- The rest of what the shop's own STEP files tripped over (second pass; the
  // files are not in this repository: every fault is rebuilt here with a part made in the test).
  // (1) Open edges: the ear clipping threw points away. A run of an edge's samples that is straight in the face's own
  //     parameters (a latitude circle in a cylinder's (angle, height), an ellipse along an extrusion's u) lies on the far
  //     side of an ear to within rounding; the ear was cut across it and the run, left as a ring of no area, was dropped:
  //     the face had one long chord where the face beside it has every sample. Now an ear is refused while any point lies
  //     in it or a hair outside, and a point that can only leave as a triangle of no area leaves as one.
  // (2) Refused files: a SURFACE_OF_LINEAR_EXTRUSION of an ELLIPSE (OpenCascade's elliptic cylinder); a cylinder face
  //     bounded by one circle alone (SolidWorks' hole or boss of no height: the flat disc inside the circle); a file with
  //     no solid says what it holds instead.
  // (3) Sphere and torus patches of any outline are exact: their facets say their corners lie on the surface (`g`) and
  //     massProps takes the column from each facet point out along the ray from the centre / the tube's centre circle. A
  //     dome closed through its pole has points along the cut meridian (it was one chord: a notch 0.29 r deep).
  // (4) The flat of an imported part whose fixed point was picked within R + T of the bend (off the plate once the
  //     bend is in), or right under the other wall (the "thickness" measured there was that wall's height).
  // (5) Anvil's STEP of a bent imported part: a bend whose points are a millionth off its cylinder (another CAD system's
  //     numbers) went back to planar facets, so the file read back 0.03 % light. Written whole now, and the file reads
  //     back to the same volume and writes again with the same faces.
  (function () {
    group('rfLS: real shop STEP files, second pass: every edge point kept, elliptic extrusions, cylinders of no height, exact sphere / torus patches, fixed point beside the bend, bent imported parts through STEP');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfLSneedX() { if (!X) fail('exchange.js is not loaded'); }
    function rfLSread(step, units) {
      var res = X.importFile('rfLS.step', step, { units: units || 'in' }), b = K.rebuild(X.newPartFromImport(res));
      var mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, 1);
      return { res: res, build: b, mesh: mesh, mp: mp, volume: mp.volume, closed: typeof Evaluate === 'undefined' || Evaluate.checkBody(b.body, { maxPairs: 1 }).ok };
    }
    function rfLSpart(code) { var m = K.newModel('rfLS'); K.runScript(m, 'p.units("in");\n' + code); var b = K.rebuild(m); noErrors({ errors: b.errors }); return { model: m, build: b, step: X.exportSTEP(m, b) }; }
    function rfLScount(s, re) { return (s.match(re) || []).length; }

    // ---- (1) the triangulator
    function rfLSears(P, ring) {
      var tri = X.earcut(P, ring, []), use = {}, area = 0, flat = 0;
      for (var t = 0; t < tri.length; t += 3) {
        var a = P[tri[t]], b = P[tri[t + 1]], c = P[tri[t + 2]], ar = ((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
        area += ar;
        if (!(ar > 1e-9)) flat++;
        for (var e = 0; e < 3; e++) { var i = tri[t + e], j = tri[t + (e + 1) % 3], k = i < j ? i + ',' + j : j + ',' + i; use[k] = (use[k] || 0) + 1; }
      }
      var missing = 0;
      ring.forEach(function (i, q) { var j = ring[(q + 1) % ring.length], k = i < j ? i + ',' + j : j + ',' + i; if (use[k] !== 1) missing++; });
      return { n: tri.length / 3, area: area, flat: flat, missing: missing };
    }
    test('rfLS: the ear clipping keeps every boundary point: a rectangle with 12 points along two sides that are straight to within 1e-13 (above, below, alternating), and a far corner over a run that bulges 1e-13: every boundary edge in one triangle, no triangle without area (was: the run dropped, or zero-area triangles)', function () {
      rfLSneedX();
      var out = [];
      [['below', function () { return -1e-13; }], ['above', function () { return 1e-13; }], ['alternating', function (i) { return i % 2 ? 1e-13 : -1e-13; }], ['exact', function () { return 0; }]].forEach(function (c) {
        var P = [], ring = [], n = 12, i;
        for (i = 0; i <= n; i++) P.push([i, i === 0 || i === n ? 0 : c[1](i)]);
        for (i = n; i >= 0; i--) P.push([i, 5 + (i === 0 || i === n ? 0 : c[1](i))]);
        for (i = 0; i < P.length; i++) ring.push(i);
        var r = rfLSears(P, ring);
        assert(r.n === ring.length - 2, c[0] + ': ' + r.n + ' triangles of ' + (ring.length - 2));
        assert(r.missing === 0, c[0] + ': ' + r.missing + ' boundary edges not in the triangles');
        assert(r.flat === 0, c[0] + ': ' + r.flat + ' triangles without area');
        near(r.area, 5 * n, 1e-9, c[0] + ' area');
        out.push(c[0] + ' ' + r.n);
      });
      // a run bulging outward by 1e-13 under a far apex
      var Q = [], rq = [];
      for (var x = -5; x <= 5; x++) Q.push([x, -1e-13 * (1 - x * x / 25)]);
      Q.push([0, 5]);
      for (var k = 0; k < Q.length; k++) rq.push(k);
      var rr = rfLSears(Q, rq);
      assert(rr.n === 10 && rr.missing === 0 && rr.flat === 0, 'bulging run: ' + JSON.stringify(rr));
      near(rr.area, 25, 1e-9, 'bulging run area');
      return out.join(', ') + ', bulging run ' + rr.n;
    });

    // ---- (2) files written by hand: a small B-rep writer (millimetres)
    function rfLSwriter() {
      var L = [], n = 1;
      function add(s) { L.push('#' + (++n) + '=' + s + ';'); return '#' + n; }
      function num(x) { var s = String(Math.round(x * 1e9) / 1e9); if (/e/.test(s)) s = x.toFixed(12); return /\./.test(s) ? s : s + '.'; }
      function vec(p) { return '(' + p.map(num).join(',') + ')'; }
      var w = {
        pt: function (p) { return add('CARTESIAN_POINT(\'\',' + vec(p) + ')'); },
        dir: function (d) { return add('DIRECTION(\'\',' + vec(d) + ')'); },
        ax: function (o, z, x) { return add('AXIS2_PLACEMENT_3D(\'\',' + w.pt(o) + ',' + w.dir(z) + ',' + w.dir(x) + ')'); },
        vtx: function (p) { return add('VERTEX_POINT(\'\',' + w.pt(p) + ')'); },
        line: function (a, b) { var d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]); return add('LINE(\'\',' + w.pt(a) + ',' + add('VECTOR(\'\',' + w.dir(d.map(function (q) { return q / l; })) + ',' + num(l) + ')') + ')'); },
        circle: function (o, z, x, r) { return add('CIRCLE(\'\',' + w.ax(o, z, x) + ',' + num(r) + ')'); },
        ellipse: function (o, z, x, a, b) { return add('ELLIPSE(\'\',' + w.ax(o, z, x) + ',' + num(a) + ',' + num(b) + ')'); },
        edge: function (v1, v2, g) { return add('EDGE_CURVE(\'\',' + v1 + ',' + v2 + ',' + g + ',.T.)'); },
        loop: function (es) { return add('EDGE_LOOP(\'\',(' + es.map(function (e) { return add('ORIENTED_EDGE(\'\',*,*,' + e[0] + ',' + (e[1] === false ? '.F.' : '.T.') + ')'); }).join(',') + '))'); },
        face: function (loops, surf, sense) { return add('ADVANCED_FACE(\'\',(' + loops.map(function (l, i) { return add((i ? 'FACE_BOUND' : 'FACE_OUTER_BOUND') + '(\'\',' + l + ',.T.)'); }).join(',') + '),' + surf + ',' + (sense === false ? '.F.' : '.T.') + ')'); },
        plane: function (o, z, x) { return add('PLANE(\'\',' + w.ax(o, z, x) + ')'); },
        cyl: function (o, z, x, r) { return add('CYLINDRICAL_SURFACE(\'\',' + w.ax(o, z, x) + ',' + num(r) + ')'); },
        add: add,
        solid: function (faces) { return add('MANIFOLD_SOLID_BREP(\'rfLS\',' + add('CLOSED_SHELL(\'\',(' + faces.join(',') + '))') + ')'); },
        text: function () {
          return 'ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'\'),\'2;1\');\nFILE_NAME(\'rfLS\',\'\',(\'\'),(\'\'),\'\',\'\',\'\');\nFILE_SCHEMA((\'AUTOMOTIVE_DESIGN\'));\nENDSEC;\nDATA;\n' +
            '#1=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));\n' + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
        }
      };
      return w;
    }
    var Z = [0, 0, 1], XD = [1, 0, 0];

    test('rfLS: an elliptic cylinder whose side faces are SURFACE_OF_LINEAR_EXTRUSIONs of an ELLIPSE (as OpenCascade writes it; was refused) reads closed: every ellipse sample is on both the cap and the side (they are straight in the side\'s own (u, w): the run the ear clipping dropped), volume between the sampled prism and π a b h', function () {
      rfLSneedX();
      var w = rfLSwriter(), a = 30, b = 15, h = 20;
      var P1 = w.vtx([a, 0, 0]), P2 = w.vtx([-a, 0, 0]), Q1 = w.vtx([a, 0, h]), Q2 = w.vtx([-a, 0, h]);
      var Eb = w.ellipse([0, 0, 0], Z, XD, a, b), Et = w.ellipse([0, 0, h], Z, XD, a, b);
      var e1 = w.edge(P1, P2, Eb), e2 = w.edge(P2, P1, Eb), f1 = w.edge(Q1, Q2, Et), f2 = w.edge(Q2, Q1, Et);
      var l1 = w.edge(P1, Q1, w.line([a, 0, 0], [a, 0, h])), l2 = w.edge(P2, Q2, w.line([-a, 0, 0], [-a, 0, h]));
      function sweep() { return w.add('SURFACE_OF_LINEAR_EXTRUSION(\'\',' + Eb + ',' + w.add('VECTOR(\'\',' + w.dir(Z) + ',1.)') + ')'); }
      w.solid([
        w.face([w.loop([[e1], [e2]])], w.plane([0, 0, 0], Z, XD), false),
        w.face([w.loop([[f1], [f2]])], w.plane([0, 0, h], Z, XD), true),
        w.face([w.loop([[e1], [l2], [f1, false], [l1, false]])], sweep(), true),
        w.face([w.loop([[e2], [l1], [f2, false], [l2, false]])], sweep(), true)]);
      var r = rfLSread(w.text(), 'mm'), exact = Math.PI * a * b * h;
      assert(!r.res.stats.openEdges, 'open edges: ' + r.res.stats.openEdges + ' ' + r.res.warnings.join('; '));
      assert(r.closed, 'closed solid');
      assert(r.volume <= exact * (1 + 1e-9) && r.volume >= exact * (1 - 1.5e-2), 'volume ' + r.volume + ' of ' + exact);
      assert(r.res.stats.triangles < 4000, 'not over-refined: ' + r.res.stats.triangles + ' triangles');
      return 'volume ' + r.volume.toFixed(3) + ' of ' + exact.toFixed(3) + ', ' + r.res.stats.triangles + ' triangles';
    });

    test('rfLS: a cylinder face bounded by one whole circle alone (a hole of no height in the top, a boss of no height on the bottom, as SolidWorks writes them; was refused "trimmed by curves other than …") is the flat disc inside the circle: closed, the puck\'s exact volume, a warning that says so', function () {
      rfLSneedX();
      var w = rfLSwriter(), R = 20, h = 10;
      var Vb = w.vtx([R, 0, 0]), Vt = w.vtx([R, 0, h]), Cb = w.edge(Vb, Vb, w.circle([0, 0, 0], Z, XD, R)), Ct = w.edge(Vt, Vt, w.circle([0, 0, h], Z, XD, R));
      var S1 = w.vtx([9, 0, h]), S2 = w.vtx([1, 0, h]), cs = w.circle([5, 0, h], Z, XD, 4), A1 = w.edge(S1, S2, cs), A2 = w.edge(S2, S1, cs);
      var U1 = w.vtx([-3, 3, 0]), U2 = w.vtx([-9, 3, 0]), cu = w.circle([-6, 3, 0], Z, XD, 3), B1 = w.edge(U1, U2, cu), B2 = w.edge(U2, U1, cu);
      w.solid([
        w.face([w.loop([[Cb]]), w.loop([[B1], [B2]])], w.plane([0, 0, 0], Z, XD), false),
        w.face([w.loop([[Ct]]), w.loop([[A1], [A2]])], w.plane([0, 0, h], Z, XD), true),
        w.face([w.loop([[Cb]]), w.loop([[Ct]])], w.cyl([0, 0, 0], Z, XD, R), true),
        w.face([w.loop([[A1], [A2]])], w.cyl([5, 0, h], Z, XD, 4), false),                // the hole of no height: its loop turns about +z
        w.face([w.loop([[B2, false], [B1, false]])], w.cyl([-6, 3, 0], Z, XD, 3), true)]);   // the boss of no height: about -z
      var r = rfLSread(w.text(), 'mm');
      assert(!r.res.stats.openEdges, 'open edges: ' + r.res.stats.openEdges);
      assert(r.closed, 'closed solid');
      nearRel(r.volume, Math.PI * R * R * h, 1e-9, 'volume');
      assert(r.res.warnings.length === 1 && /2 cylinder faces with no height/.test(r.res.warnings[0]), 'warning: ' + r.res.warnings.join(' | '));
      return 'volume ' + r.volume.toFixed(4) + '; ' + r.res.warnings[0];
    });

    test('rfLS: a STEP file with no solid says what it holds: a wireframe export (curves in a GEOMETRIC_SET), surfaces only (an OPEN_SHELL)', function () {
      rfLSneedX();
      var w = rfLSwriter();
      w.add('GEOMETRIC_SET(\'\',(' + w.line([0, 0, 0], [10, 0, 0]) + ',' + w.circle([0, 0, 0], Z, XD, 5) + ',' + w.pt([1, 2, 3]) + '))');
      var msg = '';
      try { X.importFile('wire.step', w.text(), { units: 'mm' }); } catch (e) { msg = String(e.message); }
      assert(/No solid bodies/.test(msg) && /only wireframe geometry \(2 curves, no faces\)/.test(msg) && /DXF/.test(msg), 'wireframe: ' + msg);
      var s = rfLSwriter(), V = s.vtx([5, 0, 0]), C = s.edge(V, V, s.circle([0, 0, 0], Z, XD, 5));
      s.add('OPEN_SHELL(\'\',(' + s.face([s.loop([[C]])], s.plane([0, 0, 0], Z, XD), true) + '))');
      var msg2 = '';
      try { X.importFile('surf.step', s.text(), { units: 'mm' }); } catch (e2) { msg2 = String(e2.message); }
      assert(/only surfaces \(1 face that do not close a volume\)/.test(msg2), 'surfaces: ' + msg2);
      return msg;
    });

    // ---- (3) sphere and torus patches
    test('rfLS: sphere and torus patches of any outline are exact: a quarter torus between two meridian circles (π r² · 2πR / 4 and its centroid, 1e-9), a hemisphere bounded by its circle alone (2π / 3, centroid 3 / 8, 1e-9), a cap on a cylinder bounded by a small circle (2e-6: only the slivers at the rim are left); the dome has no flat notch (every facet within a chord\'s sagitta of the sphere; was 0.29 r along the cut meridian)', function () {
      rfLSneedX();
      var out = [];
      var t = rfLSpart('p.sketch("Front").circle(2, 0, 0.5).end().revolve(90);\n'), rt = rfLSread(t.step), vt = Math.PI * 0.25 * 2 * Math.PI * 2 / 4;
      assert(rt.closed, 'torus closed');
      assert((rt.res.solids[0].curves.recs || []).some(function (q) { return q.g; }), 'the torus patch says its corners lie on the surface');
      nearRel(rt.volume, vt, 1e-9, 'quarter torus volume');
      var own = K.massProps(K.meshFromBody(t.build.body), 1);
      nearVec(rt.mp.centroid, own.centroid, 1e-8, 'quarter torus centroid');
      near(Math.hypot(rt.mp.centroid[0], rt.mp.centroid[2]), (2 + 0.25 / 8) * Math.sin(Math.PI / 4) / (Math.PI / 4), 1e-8, 'centroid radius (R + r² / 4R) sin(α/2) / (α/2)');
      out.push('torus ' + ((rt.volume - vt) / vt).toExponential(1));
      [['hemisphere', 'p.sketch("Front").arc(0, 0, 1, 0, 90).line(0, 1, 0, 0).line(0, 0, 1, 0).end().revolve(360);\n', 2 / 3 * Math.PI, 1e-9, 0.375],
        ['cap on a cylinder', 'p.sketch("Front").arc(0, 0, 1, 30, 90).line(0, 1, 0, -1).line(0, -1, ' + Math.cos(Math.PI / 6) + ', -1).line(' + Math.cos(Math.PI / 6) + ', -1, ' + Math.cos(Math.PI / 6) + ', 0.5).end().revolve(360);\n', null, 2e-6, null]].forEach(function (c) {
        var p = rfLSpart(c[1]), lone = p.step.replace(/EDGE_LOOP\('',\((#\d+),#\d+,#\d+\)\)/, 'EDGE_LOOP(\'\',($1))');
        assert(lone !== p.step, c[0] + ': the seam edges taken out (the sphere face keeps its circle alone)');
        var r = rfLSread(lone), want = c[2] != null ? c[2] : K.massProps(K.meshFromBody(p.build.body), 1).volume;
        assert(r.closed, c[0] + ': closed');
        nearRel(r.volume, want, c[3], c[0] + ' volume');
        if (c[4] != null) nearVec(r.mp.centroid, [0, c[4], 0], 1e-8, c[0] + ' centroid');
        // no notch: every sphere facet's centre within the sagitta of a 1.5 step chord (r (1 - cos(0.75 step)))
        var deep = 0, nS = 0;
        r.build.body.polygons.forEach(function (pg) {
          if (!pg.surf || pg.surf.s.t !== 'sph') return;
          nS++;
          var S = pg.surf.s, cx = 0, cy = 0, cz = 0, nv = pg.vertices.length;
          pg.vertices.forEach(function (v) { cx += v.pos.x / nv; cy += v.pos.y / nv; cz += v.pos.z / nv; });
          deep = Math.max(deep, S.r - Math.hypot(cx - S.o[0], cy - S.o[1], cz - S.o[2]));
        });
        assert(nS > 50 && deep < 0.02, c[0] + ': deepest facet ' + deep.toFixed(4) + ' under the sphere (' + nS + ' facets)');
        out.push(c[0] + ' ' + ((r.volume - want) / want).toExponential(1) + ', deepest facet ' + deep.toFixed(4));
      });
      return out.join('; ');
    });

    // ---- (4) the fixed point beside the bend
    test('rfLS: the flat of an imported sharp L (3 × 2 legs, T .1, 4 long): the fixed point far from the bend, .15 from the outer corner (inside R + T: off the plate once the bend is in), .05 and .01 from it (under the other wall: its height was taken for the thickness), on the other leg and .05 from the corner there: the same blank every time, legs less setbacks + BA', function () {
      rfLSneedX();
      var T = 0.1, p = rfLSpart('p.sketch("Front").polyline([[0, 0], [3, 0], [3, 2], [' + (3 - T) + ', 2], [' + (3 - T) + ', ' + T + '], [0, ' + T + ']], true).end().extrude(4);\n');
      var out = [], want = null;
      [[1.5, 0, 2], [2.85, 0, 3.9], [2.95, 0, 2], [2.99, 0, 0.5], [3, 1, 2], [3, 0.05, 2]].forEach(function (P) {
        var m = X.newPartFromImport(X.importFile('L.step', p.step, { units: 'in' }));
        new K.Builder(m).insertBends(P, {});
        var b = K.rebuild(m), tag = JSON.stringify(P);
        assert(!Object.keys(b.errors || {}).length, tag + ' Insert Bends: ' + JSON.stringify(b.errors));
        near(+m.sheet.thickness, T, 1e-9, tag + ' T measured');
        var fl = K.flatPattern(m, b, K.meshFromBody(b.body)), lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        fl.loops[0].forEach(function (q) { for (var k = 0; k < 2; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } });
        var R = +m.sheet.bendRadius, KF = +m.sheet.kFactor, len = (3 - R - T) + (2 - R - T) + Math.PI / 2 * (R + KF * T);
        assert(fl.bends.length === 1 && !(fl.warnings || []).length, tag + ': ' + fl.bends.length + ' bends, ' + (fl.warnings || []).join('; '));
        near(Math.max(hi[0] - lo[0], hi[1] - lo[1]), len, 1e-9, tag + ' blank length');
        near(Math.min(hi[0] - lo[0], hi[1] - lo[1]), 4, 1e-9, tag + ' blank width');
        want = len;
        out.push(tag);
      });
      // a block is still not sheet metal from any point
      var q = rfLSpart('p.sketch("Top").rect(0, -3, 4, 3).end().extrude(1);\n'), mq = X.newPartFromImport(X.importFile('block.step', q.step, { units: 'in' }));
      near(K.sheetThicknessAt(K.rebuild(mq).body, [2, 1, 1.5], 'in'), 1, 1e-9, 'a block measures its own height');
      return 'blank ' + want.toFixed(6) + ' × 4 from ' + out.join(' ');
    });

    // ---- (5) bent imported parts through Anvil's STEP
    var T5 = 0.06, K5 = 0.44, R5 = 0.25, BA5 = Math.PI / 2 * (R5 + K5 * T5), MID5 = R5 + T5 - BA5 / 2;
    function rfLSbent(cut) {
      return 'p.sheet(' + T5 + ', ' + R5 + ', ' + K5 + ');\np.sketch("Top").rect(0, -4, 2, 4).end().baseFlange();\n' +
        'p.flange(2, [[0, ' + T5 + ', 2], [2, ' + T5 + ', 2]], { position: "inside" });\np.unfold([1, ' + T5 + ', 2], null);\n' +
        'p.sketch("Top")' + cut + '.end().extrude(1, { cut: true, through: true, both: true });\np.fold(null);\n';
    }
    // the file -> imported, Insert Bends at the base -> Anvil's STEP of that -> read back -> written once more
    function rfLStrip(step0, P) {
      P = P || [1.5, 0, 3.5];
      var i1 = X.importFile('customer.step', step0, { units: 'in' }), m1 = X.newPartFromImport(i1);
      assert(!i1.stats.openEdges, 'the file reads closed: ' + i1.stats.openEdges + ' open edges');
      new K.Builder(m1).insertBends(P, { kFactor: K5 });
      var b1 = K.rebuild(m1);
      assert(!Object.keys(b1.errors).length, 'Insert Bends: ' + JSON.stringify(b1.errors));
      var s1 = X.exportSTEP(m1, b1), i2 = X.importFile('back.step', s1, { units: 'in' }), m2 = X.newPartFromImport(i2), b2 = K.rebuild(m2);
      assert(!i2.stats.openEdges && !i2.warnings.length, 'Anvil\'s STEP of it reads closed: ' + i2.stats.openEdges + ' open edges ' + i2.warnings.join('; '));
      if (typeof Evaluate !== 'undefined') assert(Evaluate.checkBody(b2.body, { maxPairs: 1 }).ok, 'read back: a closed solid');
      var fl1 = K.flatPattern(m1, b1, K.meshFromBody(b1.body));
      new K.Builder(m2).insertBends(P, { kFactor: K5 });
      var b3 = K.rebuild(m2);
      assert(!Object.keys(b3.errors).length, 'Insert Bends on the read-back: ' + JSON.stringify(b3.errors));
      var fl3 = K.flatPattern(m2, b3, K.meshFromBody(b3.body));
      function area(fl) { return fl.loops.reduce(function (s, l, i) { var a = Math.abs(K.signedArea(l)); return s + (i ? -a : a); }, 0); }
      return { s1: s1, s2: X.exportSTEP(m2, b2), v1: K.massProps(K.meshFromBody(b1.body)).volume, v2: K.massProps(K.meshFromBody(b2.body)).volume, bends1: fl1.bends.length, bends3: fl3.bends.length, a1: area(fl1), a3: area(fl3) };
    }
    function rfLSfaces(s) { return ['ADVANCED_FACE', 'CYLINDRICAL_SURFACE', 'PLANE'].map(function (k) { return rfLScount(s, new RegExp('=' + k + '\\(', 'g')); }).join(' / '); }

    test('rfLS: a bent part with two holes and a slot across the bend, imported from Anvil\'s own STEP, Insert Bends, written again: reads back closed with the same volume (1e-9), both bends found, the same flat, and writes once more with the same faces (count, cylinders, planes)', function () {
      rfLSneedX();
      var src = build('p.units("in");\n' + rfLSbent('.circle(' + MID5 + ', -1, 0.125).circle(' + (MID5 + 0.1) + ', -3, 0.2).slot(' + (MID5 - 0.3) + ', -2, ' + (MID5 + 0.3) + ', -2, 0.1)'));
      noErrors(src);
      var r = rfLStrip(X.exportSTEP(src.model, src.build, { faceted: true }));
      nearRel(r.v2, r.v1, 1e-9, 'read-back volume');
      assert(rfLSfaces(r.s2) === rfLSfaces(r.s1), 'faces (all / cylinders / planes): ' + rfLSfaces(r.s1) + ' then ' + rfLSfaces(r.s2));
      assert(rfLScount(r.s1, /=CYLINDRICAL_SURFACE\(/g) === 8, 'both bends and the holes\' flat parts whole: ' + rfLScount(r.s1, /=CYLINDRICAL_SURFACE\(/g) + ' cylinders');
      assert(r.bends1 === 2 && r.bends3 === 2, 'bends: ' + r.bends1 + ' / ' + r.bends3);
      nearRel(r.a3, r.a1, 1e-9, 'flat area');
      return 'volume ' + r.v1.toFixed(6) + ' back ' + ((r.v2 - r.v1) / r.v1).toExponential(1) + ', faces ' + rfLSfaces(r.s1);
    });

    test('rfLS: a small U channel with an oblique notch across one bend, from a file whose numbers stop at 6 decimals (another CAD system\'s precision: points half a millionth off the bend\'s cylinders): Anvil\'s STEP of the bent imported part keeps all six cylinders (was: the notched bend written as 400 planar facets, the file read back 0.075 % light with 3 open edges), reads back closed to the same volume (1e-8), and the bends stay cylinders when that is written again', function () {
      rfLSneedX();
      var src = build('p.units("in");\np.sheet(' + T5 + ', ' + R5 + ', ' + K5 + ');\np.sketch("Top").rect(0, -1.8, 1, 1.8).end().baseFlange();\n' +
        'p.flange(0.9, [[0, ' + T5 + ', 0.9], [1, ' + T5 + ', 0.9]], { position: "inside" });\n' +
        'p.sketch("Top").polyline([[-0.5, -0.6], [0.7, -0.8], [0.7, -1.0], [-0.5, -1.2]], true).end().extrude(1, { cut: true, through: true, both: true });\n');
      noErrors(src);
      var coarse = X.exportSTEP(src.model, src.build).replace(/CARTESIAN_POINT\('',\(([^)]*)\)\)/g, function (all, xs) {
        return 'CARTESIAN_POINT(\'\',(' + xs.split(',').map(function (x) { var s = String(Math.round(+x * 1e6) / 1e6); return /[.e]/.test(s) ? s : s + '.'; }).join(',') + '))';
      });
      var r = rfLStrip(coarse, [0.5, 0, 1.5]);
      assert(rfLScount(r.s1, /=CYLINDRICAL_SURFACE\(/g) === 6, 'both bends whole: ' + rfLScount(r.s1, /=CYLINDRICAL_SURFACE\(/g) + ' cylinders');
      nearRel(r.v2, r.v1, 1e-8, 'read-back volume');
      assert(rfLScount(r.s2, /=CYLINDRICAL_SURFACE\(/g) === 6, 'still whole when written again: ' + rfLScount(r.s2, /=CYLINDRICAL_SURFACE\(/g) + ' cylinders');
      assert(r.bends1 === 2 && r.bends3 === 2, 'bends: ' + r.bends1 + ' / ' + r.bends3);
      nearRel(r.a3, r.a1, 1e-6, 'flat area');
      return 'volume ' + r.v1.toFixed(6) + ' back ' + ((r.v2 - r.v1) / r.v1).toExponential(1) + ', cylinders ' + rfLScount(r.s1, /=CYLINDRICAL_SURFACE\(/g);
    });
  })();
  // --- end rfLS ---
