  // --- rfDK (2026-10-27, lane DK) --- Flat-Pattern1's Fixed face / Grain direction (model.flatFixed, model.flatGrain:
  // the flat, its DXF and flatBody turn / move rigidly, the notes unchanged), Closed Corner's Open bend region cleared
  // (closeBend: the bend's end is filled too, the flat strip runs on) and Jog's Fix projected length (fixLength).
  // 16 ga steel, T = R = 0.0598, K = 0.5. The new fields have no script option yet, so the tests set them on the model.
  (function () {
    group('rfDK: Flat-Pattern fixed face / grain direction, Closed Corner bend region, Jog Fix projected length');
    var T = 0.0598, R = 0.0598, BA = Math.PI / 2 * (R + 0.5 * T), GAP = 0.01;
    function rfDKbuild(code, mutate) {
      var model = K.newModel('Test');
      K.runScript(model, code);
      if (mutate) mutate(model);
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body);
      return { model: model, build: b, body: b.body, mesh: mesh, mp: K.massProps(mesh, model.density), errors: b.errors, warnings: b.warnings };
    }
    function rfDKflat(r) { return K.flatPattern(r.model, r.build, r.mesh); }
    function rfDKbox(body) {
      var lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      body.polygons.forEach(function (p) { p.vertices.forEach(function (v) { var q = [v.pos.x, v.pos.y, v.pos.z]; for (var k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], q[k]); hi[k] = Math.max(hi[k], q[k]); } }); });
      return { lo: lo, hi: hi };
    }
    function rfDKarea(flat) { return flat.loops.reduce(function (s, l, i) { return s + (i === 0 ? K.signedArea(l) : -Math.abs(K.signedArea(l))); }, 0); }
    function rfDKpip(p, l) { var c = false; for (var i = 0, j = l.length - 1; i < l.length; j = i++) { var a = l[i], b = l[j]; if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
    function rfDKin(flat, p) { return rfDKpip(p, flat.loops[0]) && !flat.loops.slice(1).some(function (h) { return rfDKpip(p, h); }); }
    // 4 × 2 base (x 0..4, z 0..2), one 1.5 Edge Flange on the 2 in edge at x = 4 (Material Inside, outer length)
    var L42 = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\np.flange(1.5, [[4, ' + T + ', 1]], { position: "inside", lengthRef: "outer" });\n';
    var W42 = 4 + 1.5 - (2 * (R + T) - BA);   // 4 + 1.5 − BD

    test('rfDK: Grain direction = the 2 in edge: the flat turns a quarter (2 × ' + W42.toFixed(4) + ' instead of ' + W42.toFixed(4) + ' × 2), the bend line turns with it, the note reads the same; Flatten\'s solid stays where it lies', function () {
      var r = rfDKbuild(L42), f0 = rfDKflat(r);
      near(f0.size[0], W42, 1e-9, 'plain: width'); near(f0.size[1], 2, 1e-9, 'plain: height');
      var b0 = f0.bends[0];
      near(b0.a[0], b0.b[0], 1e-9, 'plain: the bend line runs along Y');
      r.model.flatGrain = { at: [0, T, 1], dir: [0, 0, 1] };
      var f1 = rfDKflat(r), b1 = f1.bends[0];
      near(f1.size[0], 2, 1e-9, 'grain: width = the 2 in edge'); near(f1.size[1], W42, 1e-9, 'grain: height = 4 + flange − BD');
      near(b1.a[1], b1.b[1], 1e-9, 'grain: the bend line runs along X');
      near(Math.hypot(b1.b[0] - b1.a[0], b1.b[1] - b1.a[1]), 2, 1e-9, 'grain: bend line length');
      assert(b1.label === b0.label && b1.up === b0.up && b1.angle === b0.angle, 'note unchanged: ' + b0.label + ' / ' + b1.label);
      near(rfDKarea(f1), rfDKarea(f0), 1e-9, 'same blank area');
      assert(!f1.warnings.length, 'no warning: ' + f1.warnings.join('; '));
      // the 2D motion is exact: every coordinate a quarter turn of the plain one (no 6e-17 noise)
      assert(f1.loops[0].every(function (p) { return f0.loops[0].some(function (q) { return Math.abs(p[0] + q[1]) < 1e-12 && Math.abs(p[1] - q[0]) < 1e-12 || Math.abs(p[0] - q[1]) < 1e-12 && Math.abs(p[1] + q[0]) < 1e-12; }); }), 'quarter turn of the plain outline');
      var fb0 = K.flatBody(r.model, r.build, f0), fb1 = K.flatBody(r.model, r.build, f1), x0 = rfDKbox(fb0.body), x1 = rfDKbox(fb1.body);
      for (var k = 0; k < 3; k++) { near(x1.lo[k], x0.lo[k], 1e-9, 'flatBody lo ' + k); near(x1.hi[k], x0.hi[k], 1e-9, 'flatBody hi ' + k); }
      var dxf = K.exportDXFFlat(f1, 'in', { version: 'R2000', style: 'entities' }), c = DxfCheck.check(dxf, { units: 'in' });
      assert(c.ok, 'dxf-check: ' + c.errors.join('; '));
      assert(dxf.indexOf('BLANK 2 X ' + (Math.round(W42 * 1e4) / 1e4)) >= 0 || /BLANK 2(\.0+)? X/.test(dxf), 'DXF blank note: 2 wide');
      // grain along the 4 in edge: nothing turns
      r.model.flatGrain = { at: [2, T, 0], dir: [-1, 0, 0] };
      var f2 = rfDKflat(r);
      near(f2.size[0], W42, 1e-9, 'grain along X: width'); near(f2.size[1], 2, 1e-9, 'grain along X: height');
      return 'flat ' + fmt(f1.size[0]) + ' × ' + fmt(f1.size[1]);
    });

    test('rfDK: Fixed face = the flange wall\'s outer face: the flat lies in the wall\'s plane, the wall where it was; size, area and notes as before', function () {
      var r = rfDKbuild(L42), f0 = rfDKflat(r);
      r.model.flatFixed = [4, 0.8, 1];
      var f1 = rfDKflat(r);
      assert(!f1.warnings.length, 'no warning: ' + f1.warnings.join('; '));
      near(Math.abs(f1.plane.n[0]), 1, 1e-12, 'flat plane normal along X');
      near(Math.min(f1.size[0], f1.size[1]), 2, 1e-9, 'short side'); near(Math.max(f1.size[0], f1.size[1]), W42, 1e-9, 'long side');
      near(rfDKarea(f1), rfDKarea(f0), 1e-9, 'same blank area');
      assert(f1.bends[0].label === f0.bends[0].label && f1.bends[0].up === f0.bends[0].up, 'note unchanged');
      var x = rfDKbox(K.flatBody(r.model, r.build, f1).body);
      near(x.lo[0], 4 - T, 1e-9, 'flatBody in the wall\'s thickness (x lo)'); near(x.hi[0], 4, 1e-9, 'x hi');
      near(x.hi[1], 1.5, 1e-9, 'the wall\'s top edge stays at y 1.5'); near(x.lo[1], 1.5 - W42, 1e-9, 'the blank hangs below it');
      near(x.lo[2], 0, 1e-9, 'z lo'); near(x.hi[2], 2, 1e-9, 'z hi');
      // the base's own top face: the flat as with no fixed face
      r.model.flatFixed = [1, T, 1];
      var f2 = rfDKflat(r);
      near(f2.size[0], f0.size[0], 1e-9, 'base face: width'); near(f2.size[1], f0.size[1], 1e-9, 'base face: height');
      near(f2.bbox.min[0], f0.bbox.min[0], 1e-9, 'base face: same place');
      // a point on the bend: not a flat face, the flat stays as it was with a warning
      r.model.flatFixed = [4 - R - T + (R + T) * Math.sin(Math.PI / 4), T + R - (R + T) * Math.cos(Math.PI / 4), 1];
      var f3 = rfDKflat(r);
      assert(f3.warnings.some(function (w) { return /fixed face/.test(w); }), 'warning: ' + f3.warnings.join('; '));
      near(f3.size[0], f0.size[0], 1e-9, 'bad fixed face: unchanged');
      // a grain edge across the thickness: warning, not turned
      delete r.model.flatFixed;
      r.model.flatGrain = { at: [0, T / 2, 0], dir: [0, 1, 0] };
      var f4 = rfDKflat(r);
      assert(f4.warnings.some(function (w) { return /grain direction/.test(w); }), 'grain warning: ' + f4.warnings.join('; '));
      near(f4.size[0], f0.size[0], 1e-9, 'bad grain: unchanged');
      return 'ok';
    });

    // the rfCS tray (4 × 3, four 1 in flanges as separate features) with the flanges placed `pos`
    function tray(pos) {
      return 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        [[2, T, 0], [4, T, 1.5], [2, T, 3], [0, T, 1.5]].map(function (e) { return 'p.flange(1, [' + JSON.stringify(e) + '], { position: "' + pos + '", lengthRef: "outer" });\n'; }).join('');
    }
    function cc(faces, closeBend) {
      return function (m) { m.features.push({ id: 900, type: 'closedCorner', faces: faces, cornerType: 'butt', gap: GAP, ratio: 1, coplanar: false, name: 'Closed Corner1', closeBend: closeBend || undefined }); };
    }

    test('rfDK: Closed Corner, Open bend region cleared (Bend Outside tray): the bend\'s end is filled R − gap across, volume + the bend section × (R − gap) exactly; the flat strip runs on BA × (R − gap), one loop, the notch beside the tab gone', function () {
      var code = tray('bendOutside'), face = [[-(R + T / 2), 0.6, 0]];
      var b = rfDKbuild(code), o = rfDKbuild(code, cc(face, false)), c = rfDKbuild(code, cc(face, true));
      noErrors(o); noErrors(c);
      var sec = K.signedArea(K.flangeProfile(Math.PI / 2, R, T, 0, 0));   // the bend's faceted section (as built)
      nearRel(c.mp.volume - o.mp.volume, sec * (R - GAP), 1e-6, 'bend-region fill');
      consistentVolume(c);
      var fo = rfDKflat(o), fc = rfDKflat(c);
      assert(fc.loops.length === 1, 'one loop: ' + fc.loops.length);
      nearRel(rfDKarea(fc) - rfDKarea(fo), BA * (R - GAP), 1e-6, 'blank area: the strip runs on');
      assert(fc.loops[0].length === fo.loops[0].length - 2, 'two outline corners fewer (the step beside the tab): ' + fo.loops[0].length + ' -> ' + fc.loops[0].length);
      near(fc.size[0], fo.size[0], 1e-9, 'flat width'); near(fc.size[1], fo.size[1], 1e-9, 'flat height');
      // in the flat (Top frame: u = x, v = −z) the left strip is u ∈ [−BA, 0] past the base's left edge; the corner is v > 0
      var u = fc.bbox.min[0] + (fc.size[0] - 4) / 2 - BA / 2, v = (R - GAP) / 2;
      assert(!rfDKin(fo, [u, v]) && rfDKin(fc, [u, v]), 'the bend strip covers the corner up to the tab');
      assert(!rfDKin(fc, [u, R - GAP + 0.002]), 'and stops the gap short');
      var inside = c.build.body.pointTester();
      assert(inside([-(R + T) / 2 - 0.0, T / 4, -(R - GAP) / 2]) || inside([-R / 2, T / 2, -(R - GAP) / 2]), 'the bend region is closed');
      var dxf = K.exportDXFFlat(fc, 'in', { version: 'R2000', style: 'entities' }), ck = DxfCheck.check(dxf, { units: 'in' });
      assert(ck.ok, 'dxf-check: ' + ck.errors.join('; '));
      var rec = c.build.flanges[900];
      assert(rec && rec.length === 1 && rec[0].kind === 'ccExtend' && Math.abs(rec[0].by - (R - GAP)) < 1e-12, 'record: ' + JSON.stringify(rec));
      return 'fill ' + fmt(c.mp.volume - o.mp.volume);
    });

    test('rfDK: Closed Corner bend region on the Material Inside tray: the fill stops the gap short of the front flange\'s bend (less than the full section), the flat stays one loop', function () {
      var code = tray('inside'), face = [[T / 2, 0.6, R + T]];
      var o = rfDKbuild(code, cc(face, false)), c = rfDKbuild(code, cc(face, true));
      noErrors(c);
      var sec = K.signedArea(K.flangeProfile(Math.PI / 2, R, T, 0, 0)), add = c.mp.volume - o.mp.volume;
      assert(add > 0.1 * sec * (R - GAP) && add < sec * (R - GAP) - 1e-7, 'clipped fill: ' + add + ' of ' + sec * (R - GAP));
      consistentVolume(c);
      var fc = rfDKflat(c);
      assert(fc.loops.length === 1, 'one loop');
      assert(rfDKarea(fc) >= rfDKarea(rfDKflat(o)) - 1e-9, 'no material lost in the flat');
      // the open default: a feature with no closeBend builds as before
      var plain = rfDKbuild(code, cc(face, false));
      near(plain.mp.volume, o.mp.volume, 1e-12, 'no closeBend: as before');
      return 'fill ' + fmt(add);
    });

    var PLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n';
    var JOG = PLATE + 'p.sketch("Top", ' + T + ').line(2, 0, 2, -3).jog(0.5, { fixed: [0.5, ' + T + ', 1.5] });\n';
    function jogFix(on, ref) { return function (m) { var j = m.features.filter(function (f) { return f.type === 'jog'; })[0]; if (on) j.fixLength = true; if (ref) j.offsetRef = ref; }; }

    test('rfDK: Jog, Fix projected length: the far end stays at x = 4 (off: the jog takes 2·BA + g − (2R + T) of it); material added = that × 3 × T; the flat is that much longer; offsets measure as before', function () {
      var off = rfDKbuild(JOG, jogFix(false)), on = rfDKbuild(JOG, jogFix(true));
      noErrors(off); noErrors(on);
      var g = 0.5 - T - 2 * R, delta = 2 * BA + g - (2 * R + T);
      near(rfDKbox(off.body).hi[0], 4 - delta, 1e-9, 'off: the jog uses up length');
      var xb = rfDKbox(on.body);
      near(xb.hi[0], 4, 1e-9, 'on: the far end stays');
      near(xb.lo[1], 0, 1e-12, 'on: base bottom'); near(xb.hi[1], 0.5 + T, 1e-9, 'on: outside offset 0.5 (jogged top = 0.5 + T)');
      nearRel(on.mp.volume - off.mp.volume, delta * 3 * T, 1e-9, 'added material');
      var ff = rfDKflat(on), fo = rfDKflat(off);
      near(fo.size[0], 4, 1e-9, 'off: flat 4 long'); near(ff.size[0], 4 + delta, 1e-9, 'on: flat 4 + delta'); near(ff.size[1], 3, 1e-9, 'flat width');
      assert(ff.loops.length === 1 && ff.bends.length === 2 && /^UP 90/.test(ff.bends[0].label) && /^DOWN 90/.test(ff.bends[1].label), 'bends: ' + ff.bends.map(function (b) { return b.label; }).join(', '));
      // Inside offset with the fix: the riser grows by T, the far end still stays
      var ins = rfDKbuild(JOG, jogFix(true, 'inside'));
      noErrors(ins);
      near(rfDKbox(ins.body).hi[0], 4, 1e-9, 'inside: far end stays');
      near(rfDKbox(ins.body).hi[1], 0.5 + 2 * T, 1e-9, 'inside offset 0.5 (base top to jog bottom)');
      return 'delta ' + fmt(delta);
    });

    // lane DK2: the script round trip of closeBend, fixLength and p.flatPattern
    function rfDKtrip(code) {
      var a = build(code); noErrors(a);
      var s1 = K.generateScript(a.model), b = build(s1); noErrors(b);
      var s2 = K.generateScript(b.model);
      assert(s1 === s2, 'script -> model -> script is stable:\n' + s1 + '\n----\n' + s2);
      nearRel(b.mp.volume, a.mp.volume, 1e-12, 'same volume after the round trip');
      return { a: a, b: b, s: s1 };
    }

    test('rfDK2: script round trip — closedCorner({ closeBend: true }) and jog({ fixLength: true }) are written back and build the same solid; without them nothing is written (old scripts keep the open corner)', function () {
      var cc1 = rfDKtrip(tray('bendOutside') + 'p.closedCorner([[' + (-(R + T / 2)) + ', 0.6, 0]], { cornerType: "butt", gap: 0.01, coplanar: false, closeBend: true });\n');
      var f = cc1.b.model.features[cc1.b.model.features.length - 1];
      assert(f.closeBend === true && /closeBend: true/.test(cc1.s), 'closeBend kept: ' + JSON.stringify(f));
      var cc0 = rfDKtrip(tray('bendOutside') + 'p.closedCorner([[' + (-(R + T / 2)) + ', 0.6, 0]], { cornerType: "butt", gap: 0.01, coplanar: false });\n');
      assert(!cc0.b.model.features[cc0.b.model.features.length - 1].closeBend && !/closeBend/.test(cc0.s), 'no closeBend: open, nothing written');
      var sec = K.signedArea(K.flangeProfile(Math.PI / 2, R, T, 0, 0));
      nearRel(cc1.b.mp.volume - cc0.b.mp.volume, sec * (R - GAP), 1e-6, 'closed minus open = the bend-region fill');
      var j = rfDKtrip(PLATE + 'p.sketch("Top", ' + T + ').line(2, 0, 2, -3).jog(0.5, { fixed: [0.5, ' + T + ', 1.5], fixLength: true });\n');
      var jf = j.b.model.features[j.b.model.features.length - 1];
      assert(jf.fixLength === true && /fixLength: true/.test(j.s), 'fixLength kept: ' + JSON.stringify(jf));
      near(rfDKbox(j.b.body).hi[0], 4, 1e-9, 'the far end stays at x = 4');
      return 'ok';
    });

    test('rfDK2: p.flatPattern({ fixedFace, grain }) sets model.flatFixed / flatGrain, generateScript writes it after the features, the round trip gives the same flat; {} clears both; bad points are refused', function () {
      var code = L42 + 'p.flatPattern({ fixedFace: [4, 0.8, 1], grain: { at: [0, ' + T + ', 1], dir: [0, 0, 1] } });\n';
      var r = rfDKtrip(code), m = r.b.model;
      assert(m.flatFixed && m.flatFixed[0] === 4 && m.flatGrain && m.flatGrain.dir[2] === 1, 'fields: ' + JSON.stringify([m.flatFixed, m.flatGrain]));
      var lines = r.s.trim().split('\n'), li = lines.length - 1;
      while (li >= 0 && !/^p\.flatPattern\(/.test(lines[li])) li--;
      assert(li >= 0 && lines.slice(li + 1).every(function (l) { return !/^var |p\.(flange|sketch)\(/.test(l); }), 'p.flatPattern after the features:\n' + r.s);
      var fa = K.flatPattern(r.a.model, r.a.build, r.a.mesh), fb = K.flatPattern(m, r.b.build, r.b.mesh);
      near(fb.size[0], fa.size[0], 1e-9, 'flat width'); near(fb.size[1], fa.size[1], 1e-9, 'flat height');
      near(fb.plane.n[0], fa.plane.n[0], 1e-12, 'same plane');
      near(Math.min(fb.size[0], fb.size[1]), 2, 1e-9, 'turned / laid as asked');
      var c = build(code + 'p.flatPattern({});\n');
      assert(!c.model.flatFixed && !c.model.flatGrain && !/flatPattern/.test(K.generateScript(c.model)), '{} clears both');
      var threw = false;
      try { build(L42 + 'p.flatPattern({ grain: { at: [0, 0, 0], dir: [0, 0, 0] } });\n'); } catch (e) { threw = /grain dir/.test(e.message); }
      assert(threw, 'a zero grain direction is refused');
      return 'ok';
    });
  })();
