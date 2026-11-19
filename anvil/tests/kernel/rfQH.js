  // --- rfQH (local-2026-11-18b, lane sketchflow9: dimension names that never renumber, report
  // test-reports/2026-11-19-sketch-flow-9.md) --- the kernel resolves a name stored after a delete, and the script keeps it.
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel;
    group('rfQH: dimension names kept after a delete');
    test('rfQH: a sketch whose D2 was deleted keeps D1 and D3 (stored on the second, its place says D2); "D3@Sketch1"/4 resolves to it, D2@Sketch1 is the error; the generated script and its build keep the names', function () {
      var code = 'p.units("in");\np.equations({ W: 4 });\n' +
        'p.sketch("Front", 0, "Sketch1").line(0, 0, 4, 0).line(4, 0, 4, 1).line(4, 1, 0, 1).line(0, 1, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"])' +
        '.dim(0, "len").dim(1, "len").dimProps([[0, { expr: "=W" }], [1, { expr: "\\"D1@Sketch1\\"/4", name: "D3" }]]).extrude(0.5);\n';
      var r = build(code);
      noErrors(r);
      var sk = r.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(K.sketchDimItems(sk).map(function (it) { return it.name; }).join(' ') === 'D1 D3', 'names: ' + JSON.stringify(K.sketchDimItems(sk)));
      var code2 = code;
      var r2 = build(code2); noErrors(r2);
      nearRel(r2.mp.volume, 4 * 1 * 0.5, 1e-9, 'D3 = D1 / 4 = 1');
      var code3 = code2.replace('W: 4', 'W: 6');
      var r3 = build(code3); noErrors(r3);
      nearRel(r3.mp.volume, 6 * 1.5 * 0.5, 1e-9, 'D1 6: D3 1.5');
      // a second sketch's circle by "D3@Sketch1": the stored name, not the place
      var code4 = code2 + 'p.sketch("Front", 0.5, "Sketch2").circle(2, 0.5, 0.25).dim(0, "dia").dimProps([[0, { expr: "\\"D3@Sketch1\\"/2" }]]).cut(0.5);\n';
      var r4 = build(code4); noErrors(r4);
      nearRel(r4.mp.volume, 2 - Math.PI * 0.25 * 0.25 * 0.5, 1e-9, 'a Ø.5 hole from D3 1 / 2');
      var bad = build(code4.replace('\\"D3@Sketch1\\"/2', '\\"D2@Sketch1\\"/2'));
      var e = Object.keys(bad.errors).map(function (k) { return bad.errors[k]; }).join(' | ');
      assert(/D2@Sketch1/.test(e), 'D2 is gone, the error names it: ' + e);
      var s = K.generateScript(r4.model);
      var r5 = build(s); noErrors(r5);
      var sk5 = r5.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(K.sketchDimItems(sk5).map(function (it) { return it.name; }).join(' ') === 'D1 D3', 'script round trip names');
      nearRel(r5.mp.volume, r4.mp.volume, 1e-9, 'script round trip volume');
    });
    test('rfQH: an outline offset .5 inward as one chain; deleting one base line (the top, then the dimensioned bottom one in a second copy) keeps the other copies held by a shorter open chain: the offset dimension and a base length still drive them (before: the whole chain relation went)', function () {
      var S = SketchSolver;
      var r = build('p.units("in");\np.sketch("Front").line(0, 0, 6, 0).line(6, 0, 6, 2).line(6, 2, 0, 2).line(0, 2, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"]).dim(0, "len").dim(1, "len").end();\n');
      noErrors(r);
      var sk0 = r.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      [2, 0].forEach(function (gone) {
        var f = JSON.parse(JSON.stringify(sk0));
        var o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true });
        assert(o.ok, 'offset: ' + o.error);
        if (!f.entities.slice(4).every(function (e) { return e.x1 > 0.1 && e.x1 < 5.9; })) {
          f = JSON.parse(JSON.stringify(sk0));
          o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true, reverse: true });
        }
        var ch = f.rels.filter(function (x) { return x.type === 'offset'; })[0], bases = ch.refs.slice(0, 4).map(Number);
        var copyOf = {}; bases.forEach(function (b, q) { copyOf[b] = +ch.refs[4 + q]; });
        var victim = gone;
        S.removeEntity(f, victim);
        f.entities.splice(victim, 1);
        f.dims = (f.dims || []).filter(function (d) { return d.e !== victim; }).map(function (d) { if (d.e > victim) d.e--; return d; });
        var sh = function (i) { return i > victim ? i - 1 : i; };
        var chs = f.rels.filter(function (x) { return x.type === 'offset' && x.chain; });
        assert(chs.length === 1 && chs[0].chain.n === 3 && !chs[0].chain.closed, 'one open chain of 3: ' + JSON.stringify(chs));
        assert(S.solve(f).ok, 'solves');
        var an = S.analyze(f);
        assert(an.conflicts === 0 && an.redundant === 0, 'nothing over defined: ' + JSON.stringify([an.conflicts, an.redundant]));
        // the right side's copy follows the bottom length 6 -> 7 (dims[0] while the bottom line stays)
        var right = sh(1), cr = sh(copyOf[1]);
        if (victim !== 0) {
          var di = -1; f.dims.forEach(function (d, i) { if (d.e === sh(0) && d.k === 'len') di = i; });
          var res = S.setDim(f, di, 7);
          assert(res.ok, 'bottom 7: ' + res.error);
          near(f.entities[right].x1, 7, 1e-9, 'the right side at 7');
          near(f.entities[cr].x1, 6.5, 1e-9, 'its copy follows at 6.5');
        }
        var dist = f.rels.map(function (x, i) { return i; }).filter(function (i) { return f.rels[i].type === 'distance' && f.rels[i].v != null; });
        if (victim !== 0) {
          var rr = S.setRelValue(f, dist[0], 0.25);
          assert(rr.ok, 'offset .25: ' + rr.error);
          near(Math.abs(f.entities[cr].x1 - f.entities[right].x1), 0.25, 1e-9, 'the right copy at .25');
          var cl = sh(copyOf[3]);
          near(Math.abs(f.entities[cl].x1 - f.entities[sh(3)].x1), 0.25, 1e-9, 'the left copy at .25');
        } else {
          // the dimensioned pair went: the others still keep one distance from their bases (one free value)
          near(Math.abs(f.entities[cr].x1 - f.entities[right].x1), Math.abs(f.entities[sh(copyOf[3])].x1 - f.entities[sh(3)].x1), 1e-9, 'one offset for all');
        }
      });
    });
  })();
