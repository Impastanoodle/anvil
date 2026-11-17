  // --- rfNY (2026-11-16, lane unitsmate) --- B1: a flat sheet-metal face beside a bend is a plane in the Mate
  // PropertyManager, not a cylinder (assembly.js cylinderFromPatch); real cylinders (bends, hole walls) stay cylinders.
  // D1: Tools > Units converts a part's stored lengths (Kernel-free helper UI.convertModelUnits when loaded). Self-contained.
  (function () {
    group('rfNY: sheet-metal flats mate as planes; document units convert');
    var AS = Assembly, T16 = 0.0598;
    var RFNY_HEAD = 'p.units("in");\np.sheet(' + T16 + ', 0.06, 0.42);\n';
    var RFNY_PARTS = {
      bracket: RFNY_HEAD + 'p.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.hole("Top", 2, -1.5, 0.281, { offset: ' + T16 + ' });\np.flange(2, [[0, ' + T16 + ', 1.5]]);\n',
      tray: RFNY_HEAD + 'p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\np.flange(2, [[0, ' + T16 + ', 3], [8, ' + T16 + ', 3], [4, ' + T16 + ', 0], [4, ' + T16 + ', 6]]);\n',
      cover: RFNY_HEAD + 'p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\np.flange(0.75, [[4, ' + T16 + ', 0], [4, ' + T16 + ', 6]], { reverse: true });\n'
    };
    function rfNYTri(mesh, fi) {
      var P = mesh.positions64, k = mesh.faces[fi].start * 9;
      return [(P[k] + P[k + 3] + P[k + 6]) / 3, (P[k + 1] + P[k + 4] + P[k + 7]) / 3, (P[k + 2] + P[k + 5] + P[k + 8]) / 3];
    }
    // the faces of one part (body index) in the assembly mesh: flat ones (axis-aligned normal) and bend / hole ones
    function rfNYFaces(mesh, body) {
      var flats = [], curved = [];
      mesh.faces.forEach(function (f, i) {
        if ((f.body || 0) !== body) return;
        var ax = Math.max(Math.abs(f.normal[0]), Math.abs(f.normal[1]), Math.abs(f.normal[2]));
        (ax > 1 - 1e-9 ? flats : curved).push(i);
      });
      return { flats: flats, curved: curved };
    }
    function rfNYAsm(name, strip) {
      var m = AS.newAssembly(); m.units = 'in';
      var c = AS.insert(m, { script: RFNY_PARTS[name] }, { fixed: true });
      var b = AS.rebuild(m);
      assert(!(b.errors && b.errors.length), name + ': ' + JSON.stringify(b.errors));
      if (strip) b.partBuilds[c.id].body.polygons.forEach(function (p) { delete p.surf; });   // an STL-like mesh: no curve records
      return { m: m, b: b, c: c, mesh: Kernel.meshFromBody(b.body) };
    }

    ['bracket', 'tray', 'cover'].forEach(function (name) {
      [false, true].forEach(function (strip) {
        test('rfNY: 16 ga ' + name + (strip ? ' without curve records (facet fit)' : '') + ': every flat face picks as a face, every bend / hole face as a cylinder', function () {
          var s = rfNYAsm(name, strip), F = rfNYFaces(s.mesh, 0), badFlat = [], badCyl = [];
          F.flats.forEach(function (fi) {
            var r = AS.refFromPick(s.m, s.b, fi, rfNYTri(s.mesh, fi), s.mesh);
            if (!r || !r.face || r.cylinder) badFlat.push(fi + ':' + JSON.stringify(r));
          });
          F.curved.forEach(function (fi) {
            var r = AS.refFromPick(s.m, s.b, fi, rfNYTri(s.mesh, fi), s.mesh);
            if (!r || !r.cylinder) badCyl.push(fi + ':' + JSON.stringify(r));
          });
          assert(F.flats.length >= 6 && F.curved.length >= 2, 'faces ' + F.flats.length + ' / ' + F.curved.length);
          assert(!badFlat.length, 'flat faces read as cylinders: ' + badFlat.slice(0, 3).join(' '));
          assert(!badCyl.length, 'curved faces not cylinders: ' + badCyl.slice(0, 3).join(' '));
          return F.flats.length + ' flat faces, ' + F.curved.length + ' curved';
        });
      });
    });

    test('rfNY: bracket bottom Coincident to the tray floor (both flats beside bends) solves, the bracket sits on the floor', function () {
      var m = AS.newAssembly(); m.units = 'in';
      var tray = AS.insert(m, { script: RFNY_PARTS.tray }, { fixed: true });
      var br = AS.insert(m, { script: RFNY_PARTS.bracket }, { position: [2, 1, 1.5] });
      var b = AS.rebuild(m), mesh = Kernel.meshFromBody(b.body), fl = -1, bot = -1;
      mesh.faces.forEach(function (f, i) {
        if ((f.body || 0) === 0 && f.normal[1] > 1 - 1e-9 && (fl < 0 || f.area > mesh.faces[fl].area)) fl = i;
        if ((f.body || 0) === 1 && f.normal[1] < -1 + 1e-9 && (bot < 0 || f.area > mesh.faces[bot].area)) bot = i;
      });
      var ra = AS.refFromPick(m, b, bot, rfNYTri(mesh, bot), mesh), rb = AS.refFromPick(m, b, fl, rfNYTri(mesh, fl), mesh);
      assert(ra && ra.face && rb && rb.face, JSON.stringify([ra, rb]));
      var pa = AS.resolveRef(m, b.partBuilds, ra), pb = AS.resolveRef(m, b.partBuilds, rb);
      assert(pa && pa.kind === 'plane' && pb && pb.kind === 'plane', 'planes: ' + JSON.stringify([pa && pa.kind, pb && pb.kind]));
      AS.addMate(m, 'coincident', ra, rb);
      var b2 = AS.rebuild(m);
      assert(!(b2.errors && b2.errors.length), JSON.stringify(b2.errors));
      var c = m.components.filter(function (x) { return x.id === br.id; })[0], t = c.transform;
      var ty = t.position ? t.position[1] : (t.translation ? t.translation[1] : t[13]);
      near(ty, T16, 1e-9, 'bracket bottom on the floor (y = T)');
      return 'y = ' + ty;
    });

    // D1: Assembly.convertUnits (Tools ▸ Units)
    var RFNY_MMBR = 'p.name("Bracket").units("mm");\np.sheet(2, 2, 0.42);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange();\n' +
      'p.hole("Top", 50, -30, 10, { offset: 2 });\np.flange(25, [[0, 2, 30]]);\np.flange(15, [[50, 2, 0]], { reverse: true });\n';
    function rfNYBuild(model) {
      var b = Kernel.rebuild(model), mesh = Kernel.meshFromBody(b.body);
      return { b: b, mesh: mesh, vol: Kernel.massProps(mesh, model.density).volume, errs: Object.keys(b.errors || {}).length };
    }
    test('rfNY: convertUnits: a 100 mm sheet-metal bracket to inches keeps its size (volume, flat), reads 3.937, and back to mm is the same part to 1e-12', function () {
      var m = Kernel.newModel('Bracket'); Kernel.runScript(m, RFNY_MMBR);
      var r = AS.convertUnits(m, 'in');
      assert(r.ok, r.msg);
      assert(m.units === 'mm' && r.model.units === 'in', 'the input is not changed');
      near(r.factor, 1 / 25.4, 1e-15, 'factor');
      var sk = r.model.features[0], rc = sk.entities[0];
      near(rc.w, 100 / 25.4, 1e-12, 'width reads 3.937'); near(+(rc.w).toFixed(3), 3.937, 1e-12, 'width 3 places');
      near(r.model.sheet.thickness, 2 / 25.4, 1e-15, 'T'); near(r.model.sheet.bendRadius, 2 / 25.4, 1e-15, 'R'); near(r.model.sheet.kFactor, 0.42, 0, 'K stays');
      var fl = r.model.features.filter(function (f) { return f.type === 'flange'; });
      near(fl[0].length, 25 / 25.4, 1e-15, 'flange length'); near(fl[0].angle, 90, 0, 'angle stays');
      var a = rfNYBuild(m), b = rfNYBuild(r.model);
      assert(a.errs === 0 && b.errs === 0, 'errors ' + a.errs + ' / ' + b.errs);
      // the inch document builds at its own default tessellation (0.002 in, not 0.05 mm): the faceted bends differ by < 1e-4
      var rel = Math.abs(b.vol * Math.pow(25.4, 3) - a.vol) / a.vol;
      assert(rel < 1e-4, 'volume in mm³ ' + a.vol + ' vs ' + b.vol * Math.pow(25.4, 3));
      var fa = Kernel.flatPattern(m, a.b, a.mesh), fb = Kernel.flatPattern(r.model, b.b, b.mesh);
      near(fb.size[0] * 25.4, fa.size[0], 1e-9, 'flat X'); near(fb.size[1] * 25.4, fa.size[1], 1e-9, 'flat Y');
      var back = AS.convertUnits(r.model, 'mm');
      assert(back.ok && back.model.units === 'mm', back.msg);
      var c = rfNYBuild(back.model);
      near(c.vol, a.vol, 1e-12 * a.vol, 'mm -> in -> mm volume');
      near(back.model.features[0].entities[0].w, 100, 1e-12, 'width back to 100');
      return 'V ' + a.vol.toFixed(6) + ' mm³, in: ' + b.vol.toFixed(9) + ' in³; flat ' + fb.size[0].toFixed(4) + ' x ' + fb.size[1].toFixed(4) + ' in';
    });
    test('rfNY: convertUnits: an mm part with equations, a fillet, a pattern and a mirror: lengths convert, equations keep their text (fields wrapped /25.4 and unwrapped on the way back), angles and counts stay', function () {
      var code = 'p.units("mm");\np.equations({ L: 80, D: 8 });\np.sketch("Front").rect(0, 0, "=L", 40).extrude(20);\np.hole("Front", 15, 15, "=D", { offset: 20 });\n' +
        'p.linearPattern({ dir: "x", spacing: "=L/2", count: 2 });\np.fillet(3, [[0, 40, 10]]);\np.sketch("Front").rect(0, 0, 10, 10).extrude(5, { reverse: true });\n';
      var m = Kernel.newModel('P'); Kernel.runScript(m, code);
      var r = AS.convertUnits(m, 'in');
      assert(r.ok, r.msg);
      var lp = r.model.features.filter(function (f) { return f.type === 'lpattern'; })[0], fi = r.model.features.filter(function (f) { return f.type === 'fillet'; })[0];
      assert(lp.s1 === '=(L/2)/25.4' && lp.n1 === 2, 'pattern ' + JSON.stringify(lp));
      near(fi.r, 3 / 25.4, 1e-15, 'fillet r');
      assert(JSON.stringify(r.model.equations) === JSON.stringify(m.equations), 'equations unchanged');
      var a = rfNYBuild(m), b = rfNYBuild(r.model);
      assert(a.errs === 0 && b.errs === 0, 'errors ' + a.errs + ' / ' + b.errs);
      near(b.vol * Math.pow(25.4, 3), a.vol, 1e-6 * a.vol, 'same size');
      var back = AS.convertUnits(r.model, 'mm');
      var lp2 = back.model.features.filter(function (f) { return f.type === 'lpattern'; })[0];
      assert(lp2.s1 === '=L/2', 'wrapper taken off: ' + lp2.s1);
      near(rfNYBuild(back.model).vol, a.vol, 1e-12 * a.vol, 'round trip');
      return 'V ' + a.vol.toFixed(4) + ' mm³';
    });
    test('rfNY: convertUnits refuses what it cannot convert (a bend table, an unknown feature type) and names it; same units is a copy', function () {
      var m = Kernel.newModel('B'); Kernel.runScript(m, RFNY_MMBR);
      var same = AS.convertUnits(m, 'mm');
      assert(same.ok && same.factor === 1 && same.model !== m, 'same units');
      var t = JSON.parse(JSON.stringify(m)); t.sheet.bendTable = { kind: 'BD', rows: [] };
      var r1 = AS.convertUnits(t, 'in');
      assert(!r1.ok && /bend table/.test(r1.msg), r1.msg);
      var u = JSON.parse(JSON.stringify(m)); u.features.push({ id: 99, type: 'wrap', name: 'Wrap1' });
      var r2 = AS.convertUnits(u, 'in');
      assert(!r2.ok && /Wrap1/.test(r2.msg), r2.msg);
      return r1.msg + ' | ' + r2.msg;
    });
  })();
