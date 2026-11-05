  // --- rfIF (2026-11-05, lane dimprec) --- the document's dimension precision (SolidWorks: Document Properties ▸
  // Dimensions ▸ Primary precision) in scripts: p.dimPrecision({ linear, angular }) builds (Node too), the model carries
  // model.dimPrecision, generateScript writes it back right after p.name(…).units(…), a part without one writes nothing
  // new; the drawing's own decimal places go up to 8 (Drawing.inchText / dimStyle).
  (function () {
    group('rfIF: dimension precision in scripts (p.dimPrecision) and 8-place drawing text');
    var BASE = 'p.units("in");\np.sketch("Front").rect(0, 0, 2, 1).end().extrude(0.5);\n';

    test('rfIF: p.dimPrecision({ linear: 4, angular: 1 }) builds and is stored; generateScript writes it once; the script round-trips', function () {
      var r = build(BASE + 'p.dimPrecision({ linear: 4, angular: 1 });\n');
      noErrors(r);
      assert(JSON.stringify(r.model.dimPrecision) === '{"linear":4,"angular":1}', 'stored ' + JSON.stringify(r.model.dimPrecision));
      var s = K.generateScript(r.model), lines = s.split('\n');
      assert(lines.filter(function (l) { return l === 'p.dimPrecision({"linear":4,"angular":1});'; }).length === 1, 'written: ' + s);
      assert(lines.indexOf('p.dimPrecision({"linear":4,"angular":1});') === 2 && /^p\.name\(/.test(lines[1]), 'right after p.name / units: ' + lines.slice(0, 4).join(' / '));
      var r2 = build(s);
      noErrors(r2);
      assert(JSON.stringify(r2.model.dimPrecision) === JSON.stringify(r.model.dimPrecision), 'round trip ' + JSON.stringify(r2.model.dimPrecision));
      near(r2.mp.volume, r.mp.volume, 1e-9, 'same part');
      return s.split('\n')[2];
    });

    test('rfIF: one field only, clamped to 8 places; an empty object removes it; a part without one writes no p.dimPrecision', function () {
      var r = build(BASE + 'p.dimPrecision({ linear: 12 });\n');
      assert(JSON.stringify(r.model.dimPrecision) === '{"linear":8}', 'clamped ' + JSON.stringify(r.model.dimPrecision));
      assert(K.generateScript(r.model).indexOf('p.dimPrecision({"linear":8});') >= 0, 'written');
      var r2 = build(BASE + 'p.dimPrecision({ linear: 3 });\np.dimPrecision({});\n');
      assert(r2.model.dimPrecision === undefined, 'removed ' + JSON.stringify(r2.model.dimPrecision));
      var r3 = build(BASE);
      assert(r3.model.dimPrecision === undefined && K.generateScript(r3.model).indexOf('dimPrecision') < 0, 'nothing written for a part without one');
    });

    test('rfIF: drawing text up to 8 places: inchText(1.93812345, 7 / 8), dimStyle keeps 7 and 8', function () {
      assert(Drawing.inchText(1.93812345, 8) === '1.93812345' && Drawing.inchText(1.93812345, 7) === '1.9381235' && Drawing.inchText(0.5, 8) === '.50000000', 'inchText ' + Drawing.inchText(1.93812345, 8) + ' ' + Drawing.inchText(1.93812345, 7));
      assert(Drawing.dimStyle({ options: { dimPrec: 8 } }).prec === 8 && Drawing.dimStyle({ options: { dimPrec: 7 } }).prec === 7 && Drawing.dimStyle({ options: { dimPrec: 12 } }).prec === 8, 'dimStyle');
      assert(Drawing.dimStyle({ options: {} }).prec === null, 'default stays null');
    });
  })();
