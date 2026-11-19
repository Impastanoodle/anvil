  // --- rfQA (local-2026-11-18b, lane sketchflow8: sketching like a SolidWorks user, report
  // test-reports/2026-11-19-sketch-flow-8.md) --- a trimmed dimensioned first copy of an Offset Entities chain keeps the
  // chain relation; D-names in creation order; arc angle dimensions; Exit Sketch guard.
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfQA: trimmed first offset copy; dimension names; arcs');
    // a 6 x 2 outline offset .5 inward as one chain (the first copy, the dimensioned one, is the bottom one), with
    // vertical lines crossing the bottom copy at x = xs
    function rfQAU(xs) {
      var r = build('p.units("in");\np.sketch("Front").line(0, 0, 6, 0).line(6, 0, 6, 2).line(6, 2, 0, 2).line(0, 2, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"]).dim(0, "len").dim(1, "len").end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      var o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true });
      assert(o.ok, 'offset: ' + o.error);
      if (!f.entities.slice(4).every(function (e) { return e.x1 > 0.1 && e.x1 < 5.9; })) {
        f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
        o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true, reverse: true });
        assert(o.ok, 'offset reversed: ' + o.error);
      }
      var ch = f.rels.filter(function (x) { return x.type === 'offset'; })[0];
      var c0 = +ch.refs[4], e0 = f.entities[c0];
      assert(Math.abs(e0.y1 - 0.5) < 1e-9 && Math.abs(e0.y2 - 0.5) < 1e-9, 'the first copy is the bottom one: ' + JSON.stringify(e0));
      xs.forEach(function (x) {
        f.entities.push({ t: 'line', x1: x, y1: 0.2, x2: x, y2: 1.2 });
        var i = f.entities.length - 1;
        f.rels.push({ type: 'vertical', refs: [String(i)] });
        f.dims.push({ e: i, k: 'len', v: 1 });
      });
      assert(S.solve(f).ok, 'solved with the crossing lines');
      return { f: f, c0: c0 };
    }
    function rfQADist(f) { for (var i = 0; i < f.rels.length; i++) if (f.rels[i].type === 'distance' && f.rels[i].v != null) return i; return -1; }
    function rfQACheck(f, label) {
      var ch = (f.rels || []).filter(function (x) { return x.type === 'offset'; })[0];
      assert(ch && ch.chain, label + ': the chain relation stays: ' + JSON.stringify((f.rels || []).map(function (x) { return x.type; })));
      var an = S.analyze(f);
      assert(an.conflicts === 0 && an.redundant === 0, label + ': nothing over defined: ' + JSON.stringify([an.conflicts, an.redundant]));
      var di = rfQADist(f);
      assert(di >= 0, label + ': the offset dimension stays');
      var r = S.setRelValue(f, di, 0.25);
      assert(r.ok, label + ': offset .25: ' + r.error);
      ch.refs.slice(4).map(Number).forEach(function (i) {
        var e = f.entities[i], h = Math.abs(e.y1 - e.y2) < 1e-9;
        if (h) { var y = e.y1; assert(Math.abs(y - 0.25) < 1e-7 || Math.abs(y - 1.75) < 1e-7, label + ': a level copy at .25 or 1.75: ' + JSON.stringify(e)); }
        else { var x = e.x1; assert(Math.abs(x - 0.25) < 1e-7 || Math.abs(x - 5.75) < 1e-7, label + ': an upright copy at .25 or 5.75: ' + JSON.stringify(e)); }
      });
    }
    test('rfQA: the dimensioned first copy of an offset chain trimmed back to a crossing line (one piece left): the chain relation stays and the offset .5 -> .25 moves every copy and the piece (before: the relation went, only the piece moved)', function () {
      var u = rfQAU([3]), f = u.f;
      var n = S.powerTrim(f, [1.5, 0.3], [1.5, 0.7]);
      assert(n === 1, 'one segment trimmed: ' + n);
      rfQACheck(f, 'one piece');
    });
    test('rfQA: the dimensioned first copy cut in two between two crossing lines (two pieces): the chain relation stays and the offset .5 -> .25 moves both pieces and every copy', function () {
      var u = rfQAU([2, 4]), f = u.f;
      var n = S.powerTrim(f, [3, 0.3], [3, 0.7]);
      assert(n === 1, 'one segment trimmed: ' + n);
      rfQACheck(f, 'two pieces');
    });
    test('rfQA: an Arc Angle dimension (refs [arc], degrees) drives the arc\'s sweep, reads back from the script, and refuses 0 or 360', function () {
      var r = build('p.units("in");\np.sketch("Front").arc(0, 0, 2, 0, 90).rel("coincident", ["0.c", "O"]).rel("fix", ["0.p1"]).rel("arcangle", ["0"], 90).end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      assert(S.analyze(f).status === 'full', 'fully defined: ' + S.analyze(f).status);
      var ri = f.rels.findIndex(function (x) { return x.type === 'arcangle'; });
      var res = S.setRelValue(f, ri, 135);
      assert(res.ok, '135: ' + res.error);
      near(f.entities[0].a1 - f.entities[0].a0, 135, 1e-9, 'sweep 135');
      near(f.entities[0].a0, 0, 1e-9, 'the fixed end stays');
      assert(!S.setRelValue(f, ri, 360).ok && !S.setRelValue(f, ri, 0).ok, '360 and 0 refused');
      near(S.measure(f, 'arcangle', ['0']), 135, 1e-9, 'measure');
      var s = K.generateScript({ name: 'P', units: 'in', features: [Object.assign({ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 } }, { entities: f.entities, rels: f.rels, dims: f.dims })] });
      assert(/"arcangle", \["0"\], 135/.test(s), 'the script line: ' + s.split('\n').filter(function (l) { return /arcangle/.test(l); }).join(' '));
    });
    test('rfQA: Mirror Entities holds an arc copy whole (Symmetric with ends: its start mirrors the original\'s end), so a mirrored slot cap adds no DOF; the script keeps ends; an arc copy whose ends are held already keeps the plain Symmetric', function () {
      var r = build('p.units("in");\np.sketch("Front").line(0, -1, 0, 1).arc(2, 0, 1, -60, 60).line(-3, 0, -3, 0.5).rel("vertical", ["0"]).rel("coincident", ["0.p1", "O"]).rel("fix", ["1"]).end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      f.entities.push({ t: 'arc', cx: -2.00004, cy: 0, r: 1, a0: 120.0001, a1: 240 });
      var d0 = S.analyze(f).dof, n = S.mirrorRelations(f, [[1, 3]], 0);
      assert(n === 1, 'held: ' + n);
      var sr = f.rels.filter(function (x) { return x.type === 'symmetric'; })[0];
      assert(sr && sr.ends === true, 'Symmetric with ends: ' + JSON.stringify(sr));
      near(S.analyze(f).dof, d0 - 5, 0, 'the copy adds no DOF (it took 5 away)');
      var c = f.entities[3];
      near(c.a0, 120, 1e-9, 'start'); near(c.a1, 240, 1e-9, 'end'); near(c.cx, -2, 1e-9, 'centre');
      var s = K.generateScript({ name: 'P', units: 'in', features: [Object.assign({ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 } }, { entities: f.entities, rels: f.rels, dims: f.dims })] });
      assert(/"symmetric", \["1","3","0"\], \{"ends":true\}|"symmetric", \["1", "3", "0"\], \{"ends":true\}/.test(s), 'the script keeps ends: ' + s.split('\n').filter(function (l) { return /symmetric/.test(l); }).join(' '));
      // the copy's ends already held (Coincident to two fixed points): plain Symmetric
      var g = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      g.entities.push({ t: 'arc', cx: -2, cy: 0, r: 1, a0: 120, a1: 240 }, { t: 'point', x: -2.5, y: Math.sqrt(3) / 2 }, { t: 'point', x: -2.5, y: -Math.sqrt(3) / 2 });
      g.rels.push({ type: 'fix', refs: ['4'] }, { type: 'fix', refs: ['5'] }, { type: 'coincident', refs: ['3.p1', '4'] }, { type: 'coincident', refs: ['3.p2', '5'] });
      S.mirrorRelations(g, [[1, 3]], 0);
      var gs = g.rels.filter(function (x) { return x.type === 'symmetric'; });
      assert(gs.length <= 1 && !(gs[0] && gs[0].ends), 'no ends where they are held already: ' + JSON.stringify(gs));
      assert(S.analyze(g).redundant === 0, 'nothing redundant');
    });
    test('rfQA: a tangent arc\'s R changed so far the line before it would turn round (the mirrored solution of the Tangent join) is refused with the reason and nothing moves; a smaller change is taken', function () {
      var r = build('p.units("in");\np.sketch("Front").line(0, 0, 2, 0).arc(2, 1, 1, -90, 0).line(3, 1, 3, 3)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("horizontal", ["0"]).rel("tangent", ["0", "1"]).rel("tangent", ["2", "1"]).rel("fix", ["2.p2"]).dim(1, "r").end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      var a = S.setDim(f, 0, 2.5);
      assert(a.ok, 'R 2.5: ' + a.error);
      assert(f.entities[0].x2 > 0.3 && f.entities[0].x2 < 1, 'the line shortens: ' + f.entities[0].x2);
      var s0 = JSON.stringify(f.entities), b = S.setDim(f, 0, 4);
      assert(!b.ok && /inside out/.test(b.error), 'R 4 refused with the reason: ' + JSON.stringify(b));
      assert(JSON.stringify(f.entities) === s0, 'nothing moved');
    });
  })();
