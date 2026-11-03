  // ------------------------------------------------------------------ rfHI: Forming Tools (lane forming)
  // SolidWorks' Design Library forming tools on a 16 ga sheet: Dimple, Extruded Hole, Louver, Lance, Rib. Each form is a
  // shell of the sheet's thickness: the volume is checked against the section worked out by hand (Pappus for the round
  // ones, prism areas for the others; massProps is exact through the curved facets' records). The flat lays the formed
  // area back as plain sheet with FORM marks, lance slits and the extruded hole's developed pierce hole.
  (function () {
    group('rfHI: Forming Tools (dimple, extruded hole, louver, lance, rib): exact volumes, the flat, DXF, round trip, refusals');
    var T = 0.0598, KF = 0.5, V0 = 4 * 3 * T;
    var BASE = 'p.units("in");\np.sheet(' + T + ', ' + T + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var C = '[2, ' + T + ', 1.5]';
    function rfHIBuild(code) {
      var m = K.newModel('rfHI');
      K.runScript(m, BASE + code);
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      return { model: m, build: b, mesh: mesh, mp: K.massProps(mesh), errors: b.errors };
    }
    function rfHIOk(code) {
      var r = rfHIBuild(code);
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      var q = K.meshQuality(r.mesh);
      assert(q.closed && !q.openEdges && !q.nonManifoldEdges, 'closed solid: ' + q.openEdges + ' open, ' + q.nonManifoldEdges + ' non-manifold');
      r.flat = K.flatPattern(r.model, r.build, r.mesh);
      return r;
    }
    function rfHIArea(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += a[0] * b[1] - b[0] * a[1]; } return Math.abs(s / 2); }
    // a polygon (r, z) revolved a full turn (Pappus)
    function rfHIRev(P) { var s = 0; for (var i = 0; i < P.length; i++) { var a = P[i], b = P[(i + 1) % P.length]; s += (a[0] * b[1] - b[0] * a[1]) * (a[0] + b[0]); } return Math.abs(Math.PI * s / 3); }
    // the dimple / rib half section clipped at the footprint: top (0,H) (Rt,H) (Rb,0); the bottom is the top offset T
    // inward: the wall line (r − Rb)·H + z·a = −T·L (a = Rb − Rt, L its length) meets z = H − T and z = −T
    function rfHIDimpleSec(Rb, H, deg) {
      var Rt = Rb - H * Math.tan(deg * Math.PI / 180), a = Rb - Rt, L = Math.hypot(a, H);
      return [[0, H], [Rt, H], [Rb, 0], [Rb, -T], [Rb - T * (L - a) / H, -T], [Rb + (-T * L - (H - T) * a) / H, H - T], [0, H - T]];
    }
    function rfHIBlank(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * rfHIArea(l); }, 0); }
    function rfHIForm(flat) { return (flat.etch || []).filter(function (it) { return it.form != null; }); }
    function rfHIDxfLayers(dxf) {
      var L = dxf.split(/\r?\n/), out = {}, inEnt = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '2' && v === 'ENTITIES') inEnt = true;
        if (inEnt && c === '8') out[v] = (out[v] || 0) + 1;
      }
      return out;
    }

    test('Kernel.FORMING_TOOLS lists the five tools with defaults; the Builder fills the dims and names them', function () {
      assert(K.FORMING_TOOLS.map(function (t) { return t.id; }).join() === 'dimple,extrudedHole,louver,lance,rib', 'ids');
      K.FORMING_TOOLS.forEach(function (t) { assert(t.label && t.help && t.params.length >= 3, t.id); });
      var d = K.formingToolDefaults('louver', 'in');
      near(d.length, 1.5, 0); near(d.width, 0.375, 0); near(K.formingToolDefaults('louver', 'mm').length, 40, 0);
      var r = rfHIBuild('p.formingTool("dimple", ' + C + ');\np.formingTool("dimple", [1, ' + T + ', 1]);\np.formingTool("louver", [3, ' + T + ', 1.5]);\n');
      var fs = r.model.features.filter(function (f) { return f.type === 'formingTool'; });
      assert(fs.map(function (f) { return f.name; }).join() === 'Dimple1,Dimple2,Louver1', fs.map(function (f) { return f.name; }).join());
      near(fs[0].diameter, 0.75, 0); near(fs[0].sideAngle, 30, 0);
      assert(!K.isCut(fs[0], r.model), 'a form is not a cut');
    });
    test('Dimple: volume = sheet − footprint + the revolved shell (Pappus), up and down alike', function () {
      var exp = V0 - Math.PI * 0.375 * 0.375 * T + rfHIRev(rfHIDimpleSec(0.375, 0.125, 30));
      near(rfHIOk('p.formingTool("dimple", ' + C + ');').mp.volume, exp, 1e-12);
      near(rfHIOk('p.formingTool("dimple", ' + C + ', { flip: true });').mp.volume, exp, 1e-12);
      var exp2 = V0 - Math.PI * 0.25 * 0.25 * T + rfHIRev(rfHIDimpleSec(0.25, 0.1, 0));
      near(rfHIOk('p.formingTool("dimple", ' + C + ', { diameter: 0.5, height: 0.1, sideAngle: 0 });').mp.volume, exp2, 1e-12);
    });
    test('Dimple: the bbox rises by the height on the picked side, or drops below the sheet reversed', function () {
      var up = rfHIOk('p.formingTool("dimple", ' + C + ');').build.body.getBounds(), dn = rfHIOk('p.formingTool("dimple", ' + C + ', { flip: true });').build.body.getBounds();
      near(up.max[1], T + 0.125, 1e-9); near(up.min[1], 0, 1e-9);
      near(dn.min[1], -0.125, 1e-9); near(dn.max[1], T, 1e-9);
    });
    test('Extruded Hole: collar ring + quarter-annulus bend (Pappus) exact; the flat has the developed pierce hole', function () {
      var rh = 0.125, H = 0.125, ri = 0.03, rc = rh + T + ri, Ro = ri + T;
      var Aq = Math.PI / 4 * (Ro * Ro - ri * ri), rb = rc - 4 / (3 * Math.PI) * (Ro * Ro * Ro - ri * ri * ri) / (Ro * Ro - ri * ri);
      var exp = V0 - Math.PI * rc * rc * T + Math.PI * ((rh + T) * (rh + T) - rh * rh) * (H - ri) + 2 * Math.PI * rb * Aq;
      var r = rfHIOk('p.formingTool("extrudedHole", ' + C + ');');
      near(r.mp.volume, exp, 1e-12);
      var rp = rc - Math.PI / 2 * (ri + KF * T) - (H - ri);
      assert(r.flat.loops.length === 2, 'blank + pierce hole: ' + r.flat.loops.length);
      near(rfHIBlank(r.flat), 12 - Math.PI * rp * rp, 1e-5);
      var dxf = K.exportDXFFlat(r.flat, 'in');
      assert(/PIERCE %%c\.0514/.test(dxf) && /EXTRUDED HOLE %%c\.25 X \.125 UP/.test(dxf), 'note with the pierce size');
      assert(/\nCIRCLE\r?\n/.test(dxf.replace(/\r/g, '')), 'the pierce hole is a CIRCLE');
    });
    test('Louver: hinge arc + straight hood + two end walls exact; one lance slit through the blank', function () {
      var L = 1.5, W = 0.375, H = 0.125, R = 0.03, lo = 0, hi = Math.PI / 2;
      function g(b) { return (W - R * Math.sin(b)) * Math.sin(b) - (H - R * (1 - Math.cos(b))) * Math.cos(b); }
      for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2; if (g(mid) > 0) hi = mid; else lo = mid; }
      var be = (lo + hi) / 2, Pb = [-W / 2 + R * Math.sin(be), R - R * Math.cos(be)], Bb = [-W / 2 + (R + T) * Math.sin(be), R - (R + T) * Math.cos(be)];
      var zb = Bb[1] + (W / 2 - Bb[0]) * Math.tan(be);
      var Sh = be / 2 * ((R + T) * (R + T) - R * R) + rfHIArea([Pb, [W / 2, H], [W / 2, zb], Bb]);
      var Se = rfHIArea([[-W / 2, 0], Pb, [W / 2, H], [W / 2, 0]]) - R * R / 2 * (be - Math.sin(be));
      var r = rfHIOk('p.formingTool("louver", ' + C + ');');
      near(r.mp.volume, V0 - L * W * T + L * Sh + 2 * T * Se, 1e-12);
      assert(r.flat.loops.length === 2, 'blank + one slit: ' + r.flat.loops.length);
      var slit = r.flat.loops[1], xs = slit.map(function (q) { return q[0]; }), ys = slit.map(function (q) { return q[1]; });
      near(Math.max.apply(null, xs) - Math.min.apply(null, xs), L, 1e-6);
      near(Math.max.apply(null, ys) - Math.min.apply(null, ys), 0.01, 1e-6);
      near(rfHIBlank(r.flat), 12 - L * 0.01, 1e-9);
      // R = 0: a sharp hinge (the bottom still bends round the top corner at radius T)
      var be0 = Math.atan2(H, W), B0 = [-W / 2 + T * Math.sin(be0), -T * Math.cos(be0)], z0 = B0[1] + (W / 2 - B0[0]) * Math.tan(be0);
      var exp0 = V0 - L * W * T + L * (be0 / 2 * T * T + rfHIArea([[-W / 2, 0], [W / 2, H], [W / 2, z0], B0])) + 2 * T * W * H / 2;
      near(rfHIOk('p.formingTool("louver", ' + C + ', { radius: 0 });').mp.volume, exp0, 1e-12);
    });
    test('Lance: the bridge section (legs at 45° and 60°) exact; two slits of the lance length', function () {
      [45, 60].forEach(function (deg) {
        var L = 1, W = 0.25, H = 0.125, run = H / Math.tan(deg * Math.PI / 180), t = Math.tan(deg * Math.PI / 360), s = Math.sin(deg * Math.PI / 180);
        // bottom corners: the concave top corners at (∓L/2, 0) give (∓(L/2 − T·tan(θ/2)), −T); the convex ones at the top give
        // (∓(L/2 − run − T·tan(θ/2)... the offset of the top's corners inward: x shifts by T·tan(θ/2) toward the middle
        var bx0 = -L / 2 + T * t, bx1 = -L / 2 + run + T * t - 0 * s;
        var sec = [[-L / 2, 0], [-L / 2 + run, H], [L / 2 - run, H], [L / 2, 0], [L / 2, -T], [-bx0, -T], [-bx1, H - T], [bx1, H - T], [bx0, -T], [-L / 2, -T]];
        var r = rfHIOk('p.formingTool("lance", ' + C + ', { legAngle: ' + deg + ' });');
        near(r.mp.volume, V0 - L * W * T + W * rfHIArea(sec), 1e-12);
        assert(r.flat.loops.length === 3, 'blank + two slits: ' + r.flat.loops.length);
        near(rfHIBlank(r.flat), 12 - 2 * L * 0.01, 1e-9);
      });
    });
    test('Rib: straight part + two half-revolved ends exact; length along the rotation angle', function () {
      var L = 2, W = 0.375, D = 0.125, Rb = W / 2, a = L / 2 - Rb, sec = rfHIDimpleSec(Rb, D, 30);
      var exp = V0 - T * (Math.PI * Rb * Rb + 4 * a * Rb) + rfHIRev(sec) + 2 * a * 2 * rfHIArea(sec);
      var r = rfHIOk('p.formingTool("rib", ' + C + ');');
      near(r.mp.volume, exp, 1e-12);
      var bb = r.build.body.getBounds();
      var r90 = rfHIOk('p.formingTool("rib", ' + C + ', { angle: 90 });');
      near(r90.mp.volume, exp, 1e-12);
      // the formed area's extent above the sheet: 2 long along X at 0°, along Z at 90°
      function ext(rr) {
        var lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
        rr.build.body.polygons.forEach(function (pg) { pg.vertices.forEach(function (v) { if (v.pos.y > T + 1e-6) { lo[0] = Math.min(lo[0], v.pos.x); hi[0] = Math.max(hi[0], v.pos.x); lo[1] = Math.min(lo[1], v.pos.z); hi[1] = Math.max(hi[1], v.pos.z); } }); });
        return [hi[0] - lo[0], hi[1] - lo[1]];
      }
      assert(ext(r)[0] > ext(r)[1] * 3 && ext(r90)[1] > ext(r90)[0] * 3, 'rotated: ' + JSON.stringify([ext(r), ext(r90)]));
      near(bb.max[1], T + D, 1e-9);
    });
    test('the flat: the formed area is plain sheet again, FORM outline + centre mark, a note UP / DOWN', function () {
      var r = rfHIOk('p.formingTool("dimple", ' + C + ');\np.formingTool("rib", [2, ' + T + ', 2.4], { flip: true });');
      assert(r.flat.loops.length === 1, 'one loop, no hole: ' + r.flat.loops.length);
      near(r.flat.size[0], 4, 1e-9); near(r.flat.size[1], 3, 1e-9);
      near(rfHIBlank(r.flat), 12, 1e-9);
      var it = rfHIForm(r.flat), circ = it.filter(function (x) { return x.t === 'circle'; });
      assert(circ.length === 1, 'the dimple outline is one circle'); near(circ[0].r, 0.375, 1e-12);
      assert(it.filter(function (x) { return x.t === 'line' && x.kind === 'mark'; }).length === 4, 'two centre marks of two lines');
      var notes = it.filter(function (x) { return x.kind === 'note'; }).map(function (x) { return x.text; });
      assert(notes.join('|') === 'DIMPLE Ø.75 X .125 UP|RIB 2 X .375 X .125 DOWN', notes.join('|'));
      var lay = rfHIDxfLayers(K.exportDXFFlat(r.flat, 'in'));
      assert(lay.FORM > 0 && lay.OUTLINE >= 1 && !lay.HOLES && !lay.ETCH, 'layers ' + JSON.stringify(lay));
      // the marks follow a Flat-Pattern grain turn
      r.model.flatGrain = { at: [2, T, 0], dir: [0, 0, 1] };
      var f2 = K.flatPattern(r.model, r.build, r.mesh), c2 = rfHIForm(f2).filter(function (x) { return x.t === 'circle'; })[0];
      near(f2.size[0], 3, 1e-9);
      near(c2.c[0] - f2.bbox.min[0], 1.5, 1e-9);
    });
    test('the DXF: FORM, NOTES, lance slits closed on HOLES (R12 and R2000 read back)', function () {
      var r = rfHIOk('p.formingTool("louver", [1.2, ' + T + ', 1.5], { angle: 90 });\np.formingTool("lance", [2.8, ' + T + ', 1.5], { angle: 30 });\np.formingTool("extrudedHole", [2, ' + T + ', 0.5]);');
      ['R12', 'R2000'].forEach(function (ver) {
        var dxf = K.exportDXFFlat(r.flat, 'in', { version: ver }), lay = rfHIDxfLayers(dxf);
        assert(lay.FORM > 0 && lay.NOTES >= 4 && lay.HOLES >= 1, ver + ' ' + JSON.stringify(lay));
        if (typeof DxfCheck !== 'undefined') { var ck = DxfCheck.check(dxf); assert(!ck.errors.length, ver + ': ' + ck.errors.join('; ')); }
      });
      assert(r.flat.loops.length === 1 + 1 + 2 + 1, 'blank, louver slit, two lance slits, pierce hole: ' + r.flat.loops.length);
    });
    test('script round trip: generateScript → runScript gives the same features and volume', function () {
      var r = rfHIOk('p.formingTool("louver", ' + C + ', { angle: 30, at: [2.1, -1.4], flip: true, height: 0.15 });\np.formingTool("extrudedHole", [0.6, ' + T + ', 0.6], { holeDiameter: 0.2 });\np.formingTool("rib", [2, ' + T + ', 2.6], { length: 1.5 });');
      var s = K.generateScript(r.model);
      assert((s.match(/p\.formingTool\(/g) || []).length === 3, s);
      var m2 = K.newModel('rt'); K.runScript(m2, s);
      var b2 = K.rebuild(m2);
      assert(!Object.keys(b2.errors).length, JSON.stringify(b2.errors));
      near(K.massProps(K.meshFromBody(b2.body)).volume, r.mp.volume, 1e-12);
      var f1 = r.model.features.filter(function (f) { return f.type === 'formingTool'; }), f2 = m2.features.filter(function (f) { return f.type === 'formingTool'; });
      f1.forEach(function (f, i) { ['tool', 'angle', 'flip', 'name'].forEach(function (k) { assert(JSON.stringify(f[k]) === JSON.stringify(f2[i][k]), k + ' ' + f[k] + ' ' + f2[i][k]); }); });
    });
    test('position: at [u, v] in the face sketch frame (Top face: u = X, v = −Z), equal to the face point', function () {
      var a = rfHIOk('p.formingTool("dimple", [1, ' + T + ', 1], { at: [2, -1.5] });'), b = rfHIOk('p.formingTool("dimple", ' + C + ');');
      near(a.mp.volume, b.mp.volume, 1e-12);
      var lay = K.formingToolLayout(a.model.features[2], a.model, { body: K.rebuild(Object.assign({}, a.model, { features: a.model.features.slice(0, 2) })).body });
      near(lay.at[0], 2, 1e-12); near(lay.at[2], 1.5, 1e-12); near(lay.uv[0], 2, 1e-12); near(lay.uv[1], -1.5, 1e-12);
    });
    test('refused: off the face, past an edge, across a bend, too small for the thickness, a low lance, an unknown tool', function () {
      function err(code) { var r = rfHIBuild(code), e = Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' | '); assert(e, 'expected a refusal: ' + code); return e; }
      assert(/no flat face of the sheet/.test(err('p.formingTool("dimple", [9, ' + T + ', 1.5]);')), 'off the face');
      assert(/does not fit on the face/.test(err('p.formingTool("dimple", [0.3, ' + T + ', 1.5]);')), 'past an edge');
      assert(/does not fit on the face/.test(err('p.formingTool("louver", ' + C + ', { at: [3.4, -1.5] });')), 'louver past an edge');
      var fl = 'p.flange(1, [[2, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
      assert(/does not fit on the face/.test(err(fl + 'p.formingTool("dimple", [2, ' + T + ', 0.3]);')), 'across the bend');
      var ok = rfHIOk(fl + 'p.formingTool("dimple", ' + C + ');');
      assert(ok.flat.bends.length === 1 && ok.flat.loops.length === 1, 'clear of the bend: the flange flat stays one blank with its bend');
      assert(/does not fit on the face/.test(err('p.formingTool("dimple", ' + C + ');\np.formingTool("dimple", [2.6, ' + T + ', 1.5]);')), 'over another form');
      assert(/too small for the sheet thickness|leaves no top/.test(err('p.formingTool("dimple", ' + C + ', { diameter: 0.1, height: 0.04, sideAngle: 0 });')), 'too small');
      assert(/more than the sheet thickness/.test(err('p.formingTool("lance", ' + C + ', { height: 0.05 });')), 'low lance');
      var thrown = '';
      try { K.runScript(K.newModel('x'), BASE + 'p.formingTool("knurl", ' + C + ');'); } catch (e) { thrown = e.message; }
      assert(/unknown tool/.test(thrown), 'unknown tool: ' + thrown);
    });
    test('on a flange wall and on 14 ga in mm: the flat keeps the wall\'s bend and fills the form', function () {
      var r = rfHIOk('p.flange(1.5, [[2, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\np.formingTool("dimple", [2, 0.8, 0], { diameter: 0.5, height: 0.1 });');
      assert(r.flat.bends.length === 1 && r.flat.loops.length === 1, 'one blank with its bend: ' + r.flat.loops.length);
      assert(rfHIForm(r.flat).filter(function (x) { return x.t === 'circle'; }).length === 1, 'the dimple mark on the wall');
      var m = K.newModel('mm');
      K.runScript(m, 'p.units("mm");\np.sheet(1.9, 1.9, 0.5);\np.sketch("Top").rect(0, -80, 100, 80).end().baseFlange();\np.formingTool("louver", [50, 1.9, 40]);\np.formingTool("dimple", [20, 1.9, 20]);');
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors).length, JSON.stringify(b.errors));
      var f = K.flatPattern(m, b, K.meshFromBody(b.body));
      near(rfHIBlank(f), 8000 - 40 * 0.254, 1e-6);
    });
  })();
