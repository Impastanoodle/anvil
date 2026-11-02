  // ------------------------------------------------------------------ rfGK: Cross-Break
  // SolidWorks' Sheet Metal ▸ Cross-Break: an X, corner to corner, on a planar sheet face. Cosmetic: the volume and the
  // blank do not change; the lines are BEND marks in the flat DXF, with one UP / DOWN note.
  (function () {
    group('rfGK: Cross-Break, cosmetic X on a sheet face, BEND marks and an UP / DOWN note in the flat');
    var T = 0.0598, R = 0.0598, KF = 0.5;
    var BASE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function rfGKBuild(code) {
      var m = K.newModel('rfGK');
      K.runScript(m, code);
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!Object.keys(b.errors).length, 'errors ' + JSON.stringify(b.errors));
      return { model: m, build: b, mesh: mesh, mp: K.massProps(mesh), flat: K.flatPattern(m, b, mesh) };
    }
    function rfGKMarks(flat) { return (flat.etch || []).filter(function (it) { return it.crossBreak; }); }
    function rfGKEnts(dxf, layer) {
      var L = dxf.split(/\r?\n/), out = [], cur = null, inEnt = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '2' && v === 'ENTITIES') { inEnt = true; continue; }
        if (!inEnt) continue;
        if (c === '0') { if (v === 'ENDSEC') break; cur = { t: v }; out.push(cur); continue; }
        if (cur && !(c in cur)) cur[c] = /^(8|1|2|3|7)$/.test(c) ? v : +v;
      }
      return out.filter(function (e) { return e['8'] === layer; });
    }
    function rfGKPt(p) { return p.map(function (x) { return Math.round(x * 1e4) / 1e4; }); }
    var plain = rfGKBuild(BASE);
    var TOP = [1, T, 0.5], XB = BASE + 'p.crossBreak(' + JSON.stringify(TOP) + ', { radius: 0.25, angle: 2 });\n';

    test('the solid, the volume and the blank do not change', function () {
      var r = rfGKBuild(XB);
      near(r.mp.volume, plain.mp.volume, 1e-12);
      near(r.mesh.triCount || r.mesh.positions.length, plain.mesh.triCount || plain.mesh.positions.length, 0);
      near(r.flat.size[0], plain.flat.size[0], 1e-12);
      near(r.flat.size[1], plain.flat.size[1], 1e-12);
      assert(r.flat.bends.length === plain.flat.bends.length, 'bends ' + r.flat.bends.length);
      assert(r.flat.loops.length === plain.flat.loops.length, 'loops');
    });
    test('feature JSON, name and defaults', function () {
      var m = K.newModel('rfGK');
      K.runScript(m, BASE + 'p.crossBreak(' + JSON.stringify(TOP) + ');\np.crossBreak(' + JSON.stringify(TOP) + ', { reverse: true });\n');
      var fs = m.features.filter(function (f) { return f.type === 'crossBreak'; });
      assert(fs.length === 2, 'two features');
      assert(fs[0].name === 'Cross-Break1' && fs[1].name === 'Cross-Break2', fs[0].name + ' ' + fs[1].name);
      near(fs[0].radius, R, 1e-12); near(fs[0].angle, 1, 1e-12);
      assert(fs[0].reverse === false && fs[1].reverse === true, 'reverse');
      assert(!K.isCut(fs[0], m), 'not a cut');
    });
    test('the X runs corner to corner of the face', function () {
      var r = rfGKBuild(XB), id = r.model.features.filter(function (f) { return f.type === 'crossBreak'; })[0].id, rec = r.build.planes[id];
      assert(rec && rec.lines.length === 2, 'two lines');
      rec.lines.forEach(function (l) {
        near(l.a[1], T, 1e-6); near(l.b[1], T, 1e-6);
        near(Math.hypot(l.a[0] - l.b[0], l.a[2] - l.b[2]), Math.hypot(4, 2), 1e-5);
        near(Math.abs(l.a[0] - l.b[0]), 4, 1e-5);
      });
      var m = rfGKMarks(r.flat);
      assert(m.length === 2, 'two marks ' + m.length);
      var bb = r.flat.bbox;
      m.forEach(function (it) {
        near(Math.abs(it.a[0] - it.b[0]), bb.max[0] - bb.min[0], 1e-5);
        near(Math.abs(it.a[1] - it.b[1]), bb.max[1] - bb.min[1], 1e-5);
      });
      assert(m.filter(function (it) { return it.note; }).length === 1, 'one note per X');
    });
    test('the DXF has the marks on BEND and the UP / DOWN note on NOTES; Reverse and the other face flip it', function () {
      function note(code) {
        var r = rfGKBuild(code), dxf = K.exportDXFFlat(r.flat, 'in');
        var bend = rfGKEnts(dxf, 'BEND'), notes = rfGKEnts(dxf, 'NOTES').filter(function (e) { return /CROSS BREAK/.test(e['1'] || ''); });
        assert(bend.length === r.flat.bends.length + 2, 'BEND lines ' + bend.length);
        assert(notes.length === 1, 'one note ' + notes.length);
        assert(!rfGKEnts(dxf, 'ETCH').length, 'nothing on ETCH');
        assert(!/CROSS BREAK/.test(K.exportDXFFlat(r.flat, 'in', { notes: false })), 'notes off');
        assert(rfGKEnts(K.exportDXFFlat(r.flat, 'in', { bendLines: false }), 'BEND').length === 0, 'bend lines off');
        return notes[0]['1'];
      }
      var up = note(XB);
      assert(/^CROSS BREAK UP 2\S* R\.250$/.test(up), up);
      var down = note(BASE + 'p.crossBreak(' + JSON.stringify(TOP) + ', { radius: 0.25, angle: 2, reverse: true });\n');
      assert(/^CROSS BREAK DOWN 2/.test(down), down);
      var under = note(BASE + 'p.crossBreak([1, 0, 0.5], { radius: 0.25, angle: 2 });\n');
      assert(/^CROSS BREAK DOWN 2/.test(under), under);
    });
    test('a wall of a flanged part: the X lands on the wall in the flat, the flat is unchanged', function () {
      var part = BASE + 'p.flange(1, [[2, ' + T + ', 0]]);\n', f0 = rfGKBuild(part);
      var wall = f0.mesh.faces.filter(function (fc) { return Math.abs(fc.normal[2]) > 0.99 && !(fc.polys || []).some(function (q) { return q.surf; }); }).sort(function (a, b) { return b.area - a.area; })[0];
      var r = rfGKBuild(part + 'p.crossBreak(' + JSON.stringify(wall.centroid) + ', { radius: 0.1, angle: 1 });\n');
      near(r.mp.volume, f0.mp.volume, 1e-12);
      near(r.flat.size[1], f0.flat.size[1], 1e-12);
      var m = rfGKMarks(r.flat);
      assert(m.length === 2, 'marks ' + m.length);
      m.forEach(function (it) { assert(Math.abs(it.a[0] - it.b[0]) > 3.9, 'runs along the wall'); });
    });
    test('Edit Cross-Break Sketch: a sketch on the face gives the lines', function () {
      var r = rfGKBuild(BASE + 'p.sketch("Top").line(0.5, -0.5, 3.5, -0.5).line(0.5, -1.5, 3.5, -1.5).crossBreak(' + JSON.stringify(TOP) + ', { radius: 0.1, angle: 1 });\n');
      var m = rfGKMarks(r.flat);
      assert(m.length === 2, 'sketch lines ' + m.length);
      m.forEach(function (it) { near(Math.abs(it.a[0] - it.b[0]), 3, 1e-6); near(Math.abs(it.a[1] - it.b[1]), 0, 1e-6); });
    });
    test('a Flat-Pattern grain turns the marks with the blank', function () {
      var r = rfGKBuild(XB), a = rfGKMarks(r.flat);
      r.model.flatGrain = { at: [0, T, 1], dir: [0, 0, 1] };
      var turned = K.flatPattern(r.model, r.build, r.mesh), b = rfGKMarks(turned);
      assert(b.length === 2, 'marks');
      near(Math.hypot(b[0].a[0] - b[0].b[0], b[0].a[1] - b[0].b[1]), Math.hypot(a[0].a[0] - a[0].b[0], a[0].a[1] - a[0].b[1]), 1e-9);
      var bb = turned.bbox;
      b.forEach(function (it) { [it.a, it.b].forEach(function (p) { assert(p[0] >= bb.min[0] - 1e-6 && p[0] <= bb.max[0] + 1e-6 && p[1] >= bb.min[1] - 1e-6 && p[1] <= bb.max[1] + 1e-6, 'inside the blank'); }); });
    });
    test('generateScript round trip', function () {
      var r = rfGKBuild(XB), code = K.generateScript(r.model);
      assert(/p\.crossBreak\(\[1,0\.0598,0\.5\]/.test(code), code);
      var again = rfGKBuild(code), f = again.model.features.filter(function (g) { return g.type === 'crossBreak'; })[0];
      near(f.radius, 0.25, 1e-12); near(f.angle, 2, 1e-12);
      assert(f.reverse === false && f.name === 'Cross-Break1', 'fields');
      assert(rfGKMarks(again.flat).length === 2, 'marks');
      var sk = rfGKBuild(BASE + 'p.sketch("Top").line(0.5, -1, 3.5, -1).crossBreak(' + JSON.stringify(TOP) + ', { reverse: true });\n');
      var skAgain = rfGKBuild(K.generateScript(sk.model));
      assert(rfGKMarks(skAgain.flat).length === 1, 'sketch kept');
    });
    test('a suppressed Cross-Break leaves no mark; a point off the sheet is a plain error and the solid stays', function () {
      var m = K.newModel('rfGK');
      K.runScript(m, XB);
      var f = m.features.filter(function (g) { return g.type === 'crossBreak'; })[0];
      f.suppressed = true;
      var b = K.rebuild(m), mesh = K.meshFromBody(b.body);
      assert(!rfGKMarks(K.flatPattern(m, b, mesh)).length, 'no marks');
      f.suppressed = false; f.face = [50, 50, 50];
      var b2 = K.rebuild(m);
      assert(/planar sheet face/.test(b2.errors[f.id] || ''), JSON.stringify(b2.errors));
      near(K.massProps(K.meshFromBody(b2.body)).volume, plain.mp.volume, 1e-12);
    });
    test('the second rebuild from the cache keeps the marks', function () {
      var m = K.newModel('rfGK');
      K.runScript(m, XB);
      var b = K.rebuild(m), b2 = K.rebuild(m, b.cache), mesh = K.meshFromBody(b2.body);
      assert(rfGKMarks(K.flatPattern(m, b2, mesh)).length === 2, 'marks');
    });
  })();
