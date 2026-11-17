  // --- rfOD (2026-11-17, lane shopsmall) --- C1: the Hole Wizard writes THRU ALL for a Through All end (HoleWizard.callout,
  // the PM's Hole line and the tree tooltip). A1: a Design Table column D1@Sketch1 drives a sketch dimension per
  // configuration (Kernel.applyDesignTable links it to a variable; resolvedModel re-solves the sketch on a copy); a
  // sheet-metal Base Flange's D1 and Thickness@Sheet-Metal are refused with the reason. F2: a cut whose sketch lies
  // beside the part says so (Kernel.cutMissMessage). Self-contained.
  (function () {
    group('rfOD: THRU ALL, Design Table sketch dimensions, a cut beside the part');
    var HW = HoleWizard, D = Math.PI / 180;

    test('rfOD: Hole Wizard callouts: THRU ALL for Through All on the drill and thread lines (hole, counterbore, countersink, tap; ANSI Inch and ISO), the depth symbol for Blind', function () {
      function co(o, u) { return HW.callout(HW.newFeature(o, u), u).join(' | '); }
      var rows = [
        [{ type: 'hole', sizeType: 'drill', size: '#7', end: 'through' }, 'in', 'Ø.201 THRU ALL'],
        [{ type: 'hole', sizeType: 'drill', size: '#7', depth: 0.5 }, 'in', 'Ø.201 ↧ .500'],
        [{ type: 'cbore', size: '1/4', end: 'through' }, 'in', 'Ø.266 THRU ALL | ⌴ Ø.438 ↧ .250'],
        [{ type: 'csk', size: '#10', end: 'through' }, 'in', 'Ø.201 THRU ALL | ⌵ Ø.385 X 82°'],
        [{ type: 'tap', size: '1/4-20 UNC', end: 'through' }, 'in', 'Ø.201 THRU ALL | 1/4-20 UNC - 2B THRU ALL'],
        [{ type: 'tap', size: '1/4-20 UNC', depth: 0.75, threadDepth: 0.5 }, 'in', 'Ø.201 ↧ .750 | 1/4-20 UNC - 2B ↧ .500'],
        [{ type: 'hole', size: 'M6', end: 'through' }, 'mm', 'Ø6.6 THRU ALL'],
        [{ type: 'tap', size: 'M8', end: 'through' }, 'mm', 'Ø6.8 THRU ALL | M8x1.25 THRU ALL']
      ];
      rows.forEach(function (r) { var got = co(r[0], r[1]); assert(got === r[2], JSON.stringify(r[0]) + ': ' + got + ' (want ' + r[2] + ')'); });
      return rows.length + ' callouts';
    });

    // a 14 ga L bracket: base W x 2 (Sketch1: D1 = width, D2 = depth), one Edge Flange of length L on the edge z = 0
    var T = 0.0747, R = 0.0747, KF = 0.44, DEP = 2;
    var LB = 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\n' +
      'p.sketch("Top").rect(0, -' + DEP + ', 3, ' + DEP + ').dim(0, "w").dim(0, "h", { i: 1 }).end().baseFlange();\n' +
      'p.flange(1, [[0.25, ' + T + ', 0]], { position: "inside", lengthRef: "outer" });\n';
    var FAMILY = [['', 'D1@Sketch1', 'D1@Edge-Flange1'], ['Narrow', '3', '1'], ['Medium', '4.5', '1.5'], ['Wide', '6', '2.25']];
    function rfODclosed(W, L) {
      var BA = Math.PI / 2 * (R + KF * T), sh = R + T, Lw = L - (R + T);
      return { blank: [W, DEP - sh + BA + Lw], vol: T * W * (DEP - sh + Lw) + (R + T / 2) * (Math.PI / 2) * T * W };
    }
    function rfODcfg(model, name) {
      model.activeConfiguration = name;
      var b = K.rebuild(model), mesh = K.meshFromBody(b.body), mp = K.massProps(mesh, model.density);
      var fl = Object.keys(b.errors).length || !model.sheet ? null : K.flatPattern(model, b, mesh);
      return { build: b, mp: mp, flat: fl };
    }
    function rfODfamily() {
      var model = K.newModel('rfOD'); K.runScript(model, LB);
      var res = K.applyDesignTable(model, FAMILY);
      assert(res.ok, 'applied: ' + JSON.stringify(res.errors));
      return { model: model, res: res };
    }

    test('rfOD: Design Table column list: every sketch dimension grouped under its feature, the Base Flange\'s D1 and Thickness@Sheet-Metal greyed with the reason, which applyDesignTable gives too', function () {
      var model = K.newModel('rfOD'); K.runScript(model, LB); K.rebuild(model);
      var cols = K.designTableColumns(model), by = {};
      cols.forEach(function (c) { by[c.label] = c; });
      assert(by['D1@Sketch1'] && by['D2@Sketch1'] && by['D1@Sketch1'].group === 'Base-Flange1 (Sketch1)' && !by['D1@Sketch1'].disabled, 'sketch dims: ' + JSON.stringify(cols.slice(0, 4)));
      assert(by['D1@Base-Flange1'] && by['D1@Base-Flange1'].disabled && /sheet thickness/.test(by['D1@Base-Flange1'].reason), 'base flange D1: ' + JSON.stringify(by['D1@Base-Flange1']));
      assert(by['Thickness@Sheet-Metal'] && by['Thickness@Sheet-Metal'].disabled, 'thickness row');
      assert(by['D1@Edge-Flange1'] && !by['D1@Edge-Flange1'].disabled, 'flange length');
      var bad = K.applyDesignTable(model, [['', 'D1@Base-Flange1', 'Thickness@Sheet-Metal'], ['A', '0.06', '0.06']]);
      assert(!bad.ok && bad.errors.length === 2 && bad.errors.every(function (e) { return /Design Table does not drive it yet/.test(e.message); }), JSON.stringify(bad.errors));
      return cols.length + ' columns offered';
    });

    test('rfOD: a 14 ga L bracket family by base width and flange length (D1@Sketch1, D1@Edge-Flange1): each configuration\'s flat pattern and volume equal the closed form (1e-9), the three blanks nest side by side on one 48 x 120 sheet', function () {
      var fam = rfODfamily(), model = fam.model, x = 0, out = [], gap = 0.25;
      assert(fam.res.created.indexOf('D1_Sketch1') >= 0, 'variable for the sketch dimension: ' + fam.res.created);
      assert(model.features[0].dims[0].expr === '=D1_Sketch1', 'the dimension is linked: ' + JSON.stringify(model.features[0].dims[0]));
      FAMILY.slice(1).forEach(function (row) {
        var W = +row[1], L = +row[2], c = rfODcfg(model, row[0]), cf = rfODclosed(W, L);
        assert(!Object.keys(c.build.errors).length, row[0] + ': ' + JSON.stringify(c.build.errors));
        var sz = [Math.max(c.flat.size[0], c.flat.size[1]), Math.min(c.flat.size[0], c.flat.size[1])], want = [Math.max(cf.blank[0], cf.blank[1]), Math.min(cf.blank[0], cf.blank[1])];
        near(sz[0], want[0], 1e-9, row[0] + ' blank long side'); near(sz[1], want[1], 1e-9, row[0] + ' blank short side');
        nearRel(c.mp.volume, cf.vol, 1e-9, row[0] + ' folded volume');
        assert(Math.abs(K.designTableCell(model, 'D1@Sketch1', row[0]) - W) < 1e-12, row[0] + ' cell');
        out.push({ name: row[0], x: x, w: sz[0], h: sz[1] });
        x += sz[0] + gap;
      });
      // the nest: blanks side by side along the 120 in length, each inside the 48 in width, none overlapping
      assert(x - gap <= 120 && out.every(function (o) { return o.h <= 48; }), 'fits: ' + JSON.stringify(out));
      for (var i = 1; i < out.length; i++) assert(out[i].x >= out[i - 1].x + out[i - 1].w + gap - 1e-12, 'no overlap');
      // the model's own sketch is untouched by a rebuild (the kernel solves a copy)
      assert(model.features[0].entities[0].w === 3, 'Sketch1 stored geometry kept: ' + model.features[0].entities[0].w);
      return out.map(function (o) { return o.name + ' ' + o.w.toFixed(4) + ' x ' + o.h.toFixed(4); }).join('; ');
    });

    test('rfOD: the family survives the script (generateScript -> runScript), JSON save / open, and switching configurations back', function () {
      var fam = rfODfamily(), model = fam.model;
      var again = K.newModel('rfOD2'); K.runScript(again, K.generateScript(model));
      var saved = JSON.parse(JSON.stringify(model, function (k, v) { return k === 'profile' ? undefined : v; }));
      [again, saved].forEach(function (m, mi) {
        FAMILY.slice(1).forEach(function (row) {
          var c = rfODcfg(m, row[0]), cf = rfODclosed(+row[1], +row[2]);
          nearRel(c.mp.volume, cf.vol, 1e-9, (mi ? 'saved ' : 'script ') + row[0]);
        });
      });
      var back = rfODcfg(model, 'Narrow');
      nearRel(back.mp.volume, rfODclosed(3, 1).vol, 1e-9, 'back to Narrow');
      return 'script and JSON: 3 configurations each';
    });

    test('rfOD: a value the sketch cannot take marks that configuration with the solver\'s message on the sketch; the other configurations build', function () {
      var model = K.newModel('rfODbad');
      K.runScript(model, 'p.box(10, 10, 10);\np.sketch("Front", 20).line(0, 0, 3, 0).dim(0, "len").dim(0, "dx").end();\n');
      K.rebuild(model);
      var sk = model.features.filter(function (f) { return f.type === 'sketch'; }).pop();
      // D1 the line's length, D2 its horizontal distance: Ok (2, 2) is reachable, Bad (5, 6) is not (dx > length)
      var res = K.applyDesignTable(model, [['', 'D1@' + sk.name, 'D2@' + sk.name], ['Ok', '2', '2'], ['Bad', '5', '6']]);
      assert(res.ok, JSON.stringify(res.errors));
      var ok = rfODcfg(model, 'Ok'), bad = rfODcfg(model, 'Bad');
      assert(!Object.keys(ok.build.errors).length, 'Ok: ' + JSON.stringify(ok.build.errors));
      var e = bad.build.errors[sk.id] || '';
      assert(/D\d@Sketch\d+ = [56]/.test(e), 'Bad names the dimension: ' + JSON.stringify(bad.build.errors));
      near(bad.mp.volume, 1000, 1e-9, 'the box still builds');
      return e;
    });

    test('rfOD: a cut whose sketch lies beside the part names its sketch (Kernel.cutMissMessage); one over the part pointing away keeps "Reverse its direction"', function () {
      var r = build('p.box(10, 10, 10);\np.sketch("Top", 10).rect(30, -5, 4, 4).end().cut(3);\n');
      var cut = r.model.features[r.model.features.length - 1], sk = K.findFeature(r.model, cut.sketch);
      var ctx = { bodies: [K.rebuild(r.model, null).body], sketches: {}, planes: {} };
      // the part before the cut: rebuild without it
      var m0 = JSON.parse(JSON.stringify(r.model)); m0.features.pop(); ctx.bodies = [K.rebuild(m0).body];
      var msg = K.cutMissMessage(cut, r.model, ctx, K.CUT_MISS);
      assert(msg === cut.name + '\'s sketch (' + sk.name + ') lies outside the part: Edit Sketch to move it.', msg);
      var e = r.errors[cut.id] || '';
      assert(e === msg || e === K.CUT_MISS, 'rebuild error: ' + e);
      // over the part, pointing away (a blind cut up from the top face)
      var r2 = build('p.box(10, 10, 10);\np.sketch("Top", 10).rect(2, -8, 4, 4).end().cut(3, { reverse: true });\n');
      var c2 = r2.model.features[r2.model.features.length - 1];
      if (r2.errors[c2.id]) assert(r2.errors[c2.id] === K.CUT_MISS, 'over the part: ' + r2.errors[c2.id]);
      assert(K.cutMissMessage(c2, r2.model, ctx, K.CUT_MISS) === K.CUT_MISS, 'over the part keeps the old wording');
      // a Hole Wizard hole whose point is off the part
      var r3 = build('p.units("in");\np.box(2, 2, 0.25);\np.holeWizard({ face: "Top", offset: 0.25, points: [[5, -1]], type: "hole", sizeType: "drill", size: "#7", end: "through" });\n');
      var h = r3.model.features[r3.model.features.length - 1], hs = K.findFeature(r3.model, h.sketch);
      var m3 = JSON.parse(JSON.stringify(r3.model)); m3.features.splice(m3.features.length - 2, 2);
      var hm = K.cutMissMessage(h, r3.model, { bodies: [K.rebuild(m3).body], sketches: {} }, K.CUT_MISS);
      assert(hm === h.name + '\'s sketch (' + hs.name + ') lies outside the part: Edit Sketch to move it.', hm);
      return msg + ' / ' + hm;
    });
  })();
