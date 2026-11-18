  // --- rfPJ (2026-11-17, lane sketchdual) --- a sketch dimension's own Dual Dimension setting (d.dual true / false over
  // the part's Dual dimensions display) goes through scripts on Smart Dimensions (.dimProps) and distance relations
  // (.rel options), false included; Fully Define Sketch on a straight slot entity keeps SolidWorks' measured rule (its
  // centre and first end centre placed, no centre-to-centre length: rfMM, head-tools/sw-reference/ref3_auto.py).
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfPJ: dual dimension per dimension in scripts; Fully Define on a slot');
    test('rfPJ: dual false on a Smart Dimension and dual true on a distance relation survive generateScript and build back the same', function () {
      var code = 'p.units("in");\np.sketch("Front").line(0, 0, 3, 0).line(0, 1, 3, 1).circle(5, 0.5, 0.25)' +
        '.dim(0, "len", { off: -0.5 }).dim(2, "dia", { ang: 45, off: 0.6 }).dimProps([[0, { dual: false }]])' +
        '.rel("distance", ["0", "1"], { value: 1, off: 0.4, dual: true }).end();\n';
      var r = build(code);
      noErrors(r);
      var f = r.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(f.dims[0].dual === false && f.dims[1].dual == null, 'the dimension keeps dual false: ' + JSON.stringify(f.dims));
      var rel = f.rels.filter(function (x) { return x.type === 'distance'; })[0];
      assert(rel && rel.dual === true, 'the relation keeps dual true: ' + JSON.stringify(rel));
      var s = K.generateScript(r.model);
      assert(/"dual":false/.test(s) && /"dual":true/.test(s), 'written: ' + s.split('\n').filter(function (l) { return /dual/.test(l); }).join(' / '));
      var r2 = build(s);
      noErrors(r2);
      var g = r2.model.features.filter(function (x) { return x.type === 'sketch'; })[0], rel2 = g.rels.filter(function (x) { return x.type === 'distance'; })[0];
      assert(g.dims[0].dual === false && g.dims[1].dual == null && rel2.dual === true, 'read back: ' + JSON.stringify([g.dims[0].dual, g.dims[1].dual, rel2.dual]));
      assert(K.generateScript(r2.model) === s, 'the same script again');
      return s.split('\n').filter(function (l) { return /dual/.test(l); }).join(' / ');
    });
    test('rfPJ: p.dualDimensions({ on, prec, pos, showUnits }) is stored without its defaults, written once right after the units line, and round-trips; an inch part defaults to mm .12; off alone removes it', function () {
      var BASE = 'p.units("in");\np.sketch("Front").rect(0, 0, 2, 1).end().extrude(0.5);\n';
      var r = build(BASE + 'p.dualDimensions({ on: true, units: "mm", prec: 3, pos: "right", showUnits: true });\n');
      noErrors(r);
      assert(JSON.stringify(r.model.dualDimensions) === '{"on":true,"prec":3,"showUnits":true}', 'stored ' + JSON.stringify(r.model.dualDimensions));
      var s = K.generateScript(r.model), lines = s.split('\n'), want = 'p.dualDimensions({"on":true,"prec":3,"showUnits":true});';
      assert(lines.filter(function (l) { return l === want; }).length === 1 && lines.indexOf(want) === 2, 'written after the units line: ' + lines.slice(0, 4).join(' / '));
      var r2 = build(s);
      noErrors(r2);
      assert(JSON.stringify(r2.model.dualDimensions) === JSON.stringify(r.model.dualDimensions), 'round trip ' + JSON.stringify(r2.model.dualDimensions));
      near(r2.mp.volume, r.mp.volume, 1e-9, 'same part');
      var r3 = build('p.units("mm");\np.sketch("Front").rect(0, 0, 20, 10).end().extrude(5);\np.dualDimensions({ on: true, units: "in", prec: 3, pos: "left" });\n');
      assert(JSON.stringify(r3.model.dualDimensions) === '{"on":true,"pos":"left"}', 'mm part: inches .123 are the default: ' + JSON.stringify(r3.model.dualDimensions));
      var r4 = build(BASE + 'p.dualDimensions({ on: true });\np.dualDimensions({ on: false });\n');
      assert(r4.model.dualDimensions === undefined && K.generateScript(r4.model).indexOf('dualDimensions') < 0, 'off removes it, nothing written');
      return want;
    });
    test('rfPJ: Fully Define Sketch (baseline) on a straight slot entity 2.5 -> 3.5 at y 1 in a 4 x 3 plate places the slot by its centre (x 3.0) and first end centre (x 2.5) with no centre-to-centre length, as SolidWorks 2022 measured (2026-11-02 row 10); Fully Defined', function () {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 4, y1: 0, x2: 4, y2: 3 }, { t: 'line', x1: 4, y1: 3, x2: 0, y2: 3 }, { t: 'line', x1: 0, y1: 3, x2: 0, y2: 0 },
        { t: 'slot', x1: 2.5, y1: 1, x2: 3.5, y2: 1, w: 0.5 }],
        rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] }, { type: 'coincident', refs: ['0.p1', 'O'] },
          { type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['2'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['3'] }] };
      var r = S.fullyDefine(f, { relations: true, hScheme: 'baseline', vScheme: 'baseline', units: 'in' });
      assert(r.status === 'full', 'status ' + r.status);
      var slotRels = (f.rels || []).filter(function (q) { return (q.type === 'distance') && q.refs.some(function (x) { return /^4\./.test(x); }); });
      var hs = slotRels.filter(function (q) { return q.dir === 'h'; }).map(function (q) { return q.refs.filter(function (x) { return /^4\./.test(x); })[0] + ' ' + (+q.v).toFixed(3); }).sort();
      var desc = slotRels.map(function (q) { return q.dir + ' ' + q.refs.join(',') + ' ' + (+q.v).toFixed(3); }).join('; ') + ' | dims ' + JSON.stringify((f.dims || []).filter(function (d) { return d.e === 4; }).map(function (d) { return d.k; }));
      assert(hs.length === 2 && hs[0] === '4.c 3.000' && hs[1] === '4.p1 2.500', 'centre and first end centre: ' + desc);
      assert(!(f.dims || []).some(function (d) { return d.e === 4 && d.k === 'len'; }), 'no centre-to-centre length: ' + desc);
      return desc;
    });
  })();
