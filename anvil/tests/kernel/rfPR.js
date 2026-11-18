  // --- rfPR (local-2026-11-17c, lane sketchflow6: sketching like a SolidWorks user, report
  // test-reports/2026-11-18-sketch-flow-6.md) --- a trimmed copy of an Offset Entities chain keeps the chain's Offset
  // relation (the other copies whole, the pieces on their offset lines, the untouched corners Coincident), and a drag
  // the relations cannot follow all the way no longer flies off (the least-squares pass keeps a damping floor).
  (function () {
    if (typeof Kernel === 'undefined' || typeof SketchSolver === 'undefined') return;
    var K = Kernel, S = SketchSolver;
    group('rfPR: trimmed offset chains; drags that cannot follow the mouse');
    // a 6 x 2 outline (width and height dimensioned, corner at the origin), offset .5 inward as one chain, a level line
    // across the middle from the left copy to the right copy, then the top half trimmed away (a U)
    function rfPRU() {
      var r = build('p.units("in");\np.sketch("Front").line(0, 0, 6, 0).line(6, 0, 6, 2).line(6, 2, 0, 2).line(0, 2, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"]).dim(0, "len").dim(1, "len").end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      var o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true });
      assert(o.ok, 'offset: ' + o.error);
      var inside = f.entities.slice(4).every(function (e) { return e.x1 > 0.1 && e.x1 < 5.9; });
      if (!inside) {
        f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
        o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true, reverse: true });
        assert(o.ok, 'offset reversed: ' + o.error);
      }
      assert(f.entities.length === 8 && f.entities.slice(4).every(function (e) { return e.x1 > 0.1 && e.x1 < 5.9; }), 'four copies inside: ' + JSON.stringify(f.entities.slice(4)));
      var ch = f.rels.filter(function (x) { return x.type === 'offset'; })[0];
      assert(ch && ch.chain && ch.refs.length === 8, 'one chain relation: ' + JSON.stringify(ch));
      // which copy is which (the chain may start anywhere)
      var cp = f.entities.map(function (e, i) { return i; }).slice(4), by = {};
      cp.forEach(function (i) { var e = f.entities[i]; if (Math.abs(e.y1 - e.y2) < 1e-9) by[e.y1 < 1 ? 'bottom' : 'top'] = i; else by[e.x1 < 3 ? 'left' : 'right'] = i; });
      f.entities.push({ t: 'line', x1: 0.5, y1: 1, x2: 5.5, y2: 1 });
      var mid = f.entities.length - 1;
      f.rels.push({ type: 'coincident', refs: [mid + '.p1', String(by.left)] }, { type: 'coincident', refs: [mid + '.p2', String(by.right)] }, { type: 'horizontal', refs: [String(mid)] });
      assert(S.solve(f).ok, 'solved with the middle line');
      return { f: f, by: by, copy0: +ch.refs[4] };
    }
    test('rfPR: the top half of an offset outline trimmed away: the Offset relation keeps the bottom copy whole and the two side pieces on their offset lines; the bottom corners stay Coincident; the base made 8 wide, the right piece follows to x 7.5 (before: the relation went, the pieces stayed)', function () {
      var u = rfPRU(), f = u.f, by = u.by;
      assert(u.copy0 !== by.top && u.copy0 !== by.left && u.copy0 !== by.right, 'the dimensioned first copy is the bottom one here: ' + u.copy0 + ' ' + JSON.stringify(by));
      var a0 = S.analyze(f);
      // Power trim: across the top copy (nothing crosses it: it goes), across the upper halves of both sides
      var n = S.powerTrim(f, [3, 1.6], [3, 1.4]);
      n += S.powerTrim(f, [0.3, 1.3], [0.7, 1.3]);
      n += S.powerTrim(f, [5.3, 1.3], [5.7, 1.3]);
      assert(n === 3, 'three segments trimmed: ' + n);
      var ch = (f.rels || []).filter(function (x) { return x.type === 'offset'; })[0];
      assert(ch && ch.chain && Array.isArray(ch.chain.slot) && ch.chain.cut, 'the chain relation stays, with slot / cut: ' + JSON.stringify(f.rels));
      assert(ch.refs.length === 4 + 3, 'four bases, the bottom copy and two side pieces: ' + ch.refs.join());
      var an = S.analyze(f);
      assert(an.conflicts === 0 && an.redundant === 0, 'nothing over defined: ' + JSON.stringify([an.conflicts, an.redundant]));
      var corners = f.rels.filter(function (x) { return x.type === 'coincident' && x.refs.every(function (r) { return /^\d+\.p\d$/.test(r); }) && x.refs.some(function (r) { return ch.refs.slice(4).indexOf(r.split('.')[0]) >= 0; }) && x.refs.every(function (r) { return ch.refs.slice(4).indexOf(r.split('.')[0]) >= 0; }); });
      assert(corners.length === 2, 'the two bottom corners Coincident: ' + JSON.stringify(corners));
      // the width 6 -> 8: the right piece rides its offset line
      var di = f.dims.findIndex ? f.dims.findIndex(function (d) { return d.e === 0; }) : 0;
      var r = S.setDim(f, di, 8);
      assert(r.ok, 'width 8: ' + r.error);
      var sides = ch.refs.slice(4).map(Number).filter(function (i) { var e = f.entities[i]; return Math.abs(e.x1 - e.x2) < 1e-9; }).map(function (i) { return f.entities[i]; });
      assert(sides.length === 2, 'two vertical pieces: ' + JSON.stringify(sides));
      var right = sides[0].x1 > sides[1].x1 ? sides[0] : sides[1], left = right === sides[0] ? sides[1] : sides[0];
      near(right.x1, 7.5, 1e-9, 'the right piece at 7.5'); near(left.x1, 0.5, 1e-9, 'the left piece stays at .5');
      near(Math.min(right.y1, right.y2), 0.5, 1e-9, 'the right piece still meets the bottom copy');
      var bottom = f.entities[u.copy0];
      near(Math.max(bottom.x1, bottom.x2), 7.5, 1e-9, 'the bottom copy follows (whole)');
      near(f.entities[f.entities.length - 1].x2 - f.entities[f.entities.length - 1].x1, 7, 1e-9, 'the middle line spans 7');
      // generateScript keeps slot / cut
      var s = K.generateScript({ name: 'P', units: 'in', features: [Object.assign({ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 } }, { entities: f.entities, rels: f.rels, dims: f.dims })] });
      assert(/"slot":\[/.test(s) && /"cut":\{/.test(s), 'the script carries the trimmed chain: ' + s.split('\n').filter(function (l) { return /offset/.test(l); }).join(' / ').slice(0, 300));
      var r2 = build(s);
      noErrors(r2);
      var g = r2.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(JSON.stringify(g.rels.filter(function (x) { return x.type === 'offset'; })[0].chain) === JSON.stringify(ch.chain), 'read back the same');
      assert(a0.conflicts === 0, 'clean before');
    });
    test('rfPR: a trimmed copy that is the dimensioned first copy, or a base, still drops the relation as before (nothing half held)', function () {
      var u = rfPRU(), f = u.f;
      var e = f.entities[u.copy0], my = (e.y1 + e.y2) / 2, mx = (e.x1 + e.x2) / 2;
      // cut the bottom copy (the first one) at its middle: the trail crosses it between the side copies
      S.powerTrim(f, [mx - 1, my - 0.2], [mx - 1, my + 0.2]);
      assert(!(f.rels || []).some(function (x) { return x.type === 'offset'; }), 'the relation went: ' + JSON.stringify((f.rels || []).map(function (x) { return x.type; })));
    });
    test('rfPR: a U trimmed out of an offset outline (base outline held, its first copy the right side), a level line from the middle of the U\'s middle line to the right side; that point dragged up and to the right: it moves right only, nothing flies off (the same U on a flange face, smoke rfPR flow 3, flew 1,500 in off before the least-squares damping floor)', function () {
      var r = build('p.units("in");\np.sketch("Front").line(6, 0, 6, 2).line(6, 2, 0, 2).line(0, 2, 0, 0).line(0, 0, 6, 0)' +
        '.rel("fix", ["0"]).rel("fix", ["1"]).rel("fix", ["2"]).rel("fix", ["3"]).end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      var o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true });
      if (o.ok && !f.entities.slice(4).every(function (e) { return e.x1 > 0.1 && e.x1 < 5.9; })) {
        f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
        o = S.offsetSelection(f, [0, 1, 2, 3], { d: 0.5, chain: true, dims: true, reverse: true });
      }
      assert(o.ok, 'offset: ' + o.error);
      var ch = f.rels.filter(function (x) { return x.type === 'offset'; })[0], c0 = f.entities[+ch.refs[4]];
      assert(Math.abs(c0.x1 - 5.5) < 1e-9 && Math.abs(c0.x2 - 5.5) < 1e-9, 'the first copy is the right side: ' + JSON.stringify(c0));
      var by = {};
      f.entities.slice(4).forEach(function (e, k) { var i = k + 4; if (Math.abs(e.y1 - e.y2) < 1e-9) by[e.y1 < 1 ? 'bottom' : 'top'] = i; else by[e.x1 < 3 ? 'left' : 'right'] = i; });
      f.entities.push({ t: 'line', x1: 3, y1: 0.5, x2: 3, y2: 1.5 });
      var m = f.entities.length - 1;
      f.rels.push({ type: 'midpoint', refs: [m + '.p1', String(by.bottom)] }, { type: 'midpoint', refs: [m + '.p2', String(by.top)] });
      assert(S.solve(f).ok, 'solved');
      S.powerTrim(f, [0.3, 1], [0.8, 1.1]); S.powerTrim(f, [1.5, 1.6], [1.6, 1.4]); S.powerTrim(f, [1.5, 0.6], [1.6, 0.4]);
      assert(f.entities.length === 8, 'the U: ' + f.entities.length);
      m = f.entities.map(function (e, i) { return i; }).filter(function (i) { var e = f.entities[i]; return i >= 4 && Math.abs(e.x1 - 3) < 1e-6 && Math.abs(e.x2 - 3) < 1e-6; })[0];
      var right = f.entities.map(function (e, i) { return i; }).filter(function (i) { var e = f.entities[i]; return i >= 4 && Math.abs(e.x1 - 5.5) < 1e-6 && Math.abs(e.x2 - 5.5) < 1e-6; })[0];
      f.entities.push({ t: 'line', x1: 3, y1: 1, x2: 5.5, y2: 1 });
      var s = f.entities.length - 1;
      f.rels.push({ type: 'midpoint', refs: [s + '.p1', String(m)] }, { type: 'coincident', refs: [s + '.p2', String(right)] }, { type: 'horizontal', refs: [String(s)] });
      assert(S.solve(f).ok, 'solved with the level line');
      var an0 = S.analyze(f);
      assert(an0.conflicts === 0 && an0.redundant === 0, 'clean: ' + JSON.stringify([an0.conflicts, an0.redundant, an0.dof]));
      var start = JSON.parse(JSON.stringify(f.entities));
      var dr = S.drag(f, s + '.p1', [3.7, 1.3], start);
      assert(dr.ok, 'dragged');
      var far = 0;
      f.entities.forEach(function (e) { ['x1', 'y1', 'x2', 'y2'].forEach(function (k) { if (e[k] != null) far = Math.max(far, Math.abs(e[k])); }); });
      assert(far < 10, 'everything stays near the part: max |coordinate| ' + far);
      near(f.entities[s].x1, 3.7, 1e-3, 'the point went right to x 3.7 (a drag frame is a least-squares pull)');
      near(f.entities[s].y1, 1, 1e-9, 'and stayed on the middle (it cannot go up)');
    });    test('rfPR: mirrorAxisJoins: a three-line half mirrored about a centerline (copies held only by Symmetric) gives the Coincidents the copy needs when the centerline goes: the copy\'s two inner joins and its two ends on the line, none an existing one already makes (the half\'s own joins)', function () {
      var r = build('p.units("in");\np.sketch("Front").line(0, 0, 0, 4).line(0, 0, 3, 0).line(3, 0, 3, 2).line(3, 2, 0, 3)' +
        '.line(0, 0, -3, 0).line(-3, 0, -3, 2).line(-3, 2, 0, 3).construction([0])' +
        '.rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["1.p1", "O"])' +
        '.rel("symmetric", ["1", "4", "0"]).rel("symmetric", ["2", "5", "0"]).rel("symmetric", ["3", "6", "0"]).end();\n');
      noErrors(r);
      var f = JSON.parse(JSON.stringify(r.model.features.filter(function (x) { return x.type === 'sketch'; })[0]));
      var j = S.mirrorAxisJoins(f, 0).map(function (x) { return x.refs.slice().sort().join('~'); }).sort();
      assert(j.join(' ') === ['1.p1~4.p1', '3.p2~6.p2', '4.p2~5.p1', '5.p2~6.p1'].sort().join(' '), 'joins: ' + j.join(' '));
      assert(!S.mirrorAxisJoins(f, 2).length, 'a line that is no mirror axis: none');
      // the centerline deleted with them: the copy keeps its shape (each line 4 dof less 2 per join)
      var joins = S.mirrorAxisJoins(f, 0);
      f.entities.splice(0, 1); S.removeEntity(f, 0);
      var loose = S.analyze(JSON.parse(JSON.stringify(f))).dof;
      joins.forEach(function (x) { f.rels.push({ type: 'coincident', refs: x.refs.map(function (q) { var e = +q.split('.')[0]; return (e - 1) + q.slice(String(e).length); }) }); });
      var an = S.analyze(f);
      assert(an.redundant === 0 && an.conflicts === 0, 'no repeats: ' + JSON.stringify([an.redundant, an.conflicts]));
      assert(loose - an.dof === 8, 'four joins take 8 degrees of freedom: ' + loose + ' -> ' + an.dof);
    });    test('rfPR follow-up: a sketch dimension linked to another by an equation ("D1@Sketch1"/4, as the Modify box keeps it, no "=") re-evaluates in the kernel: a headless build after W changes, each configuration, a chain through a second sketch, the script round trip; an unknown name is the sketch\'s error', function () {
      var code = 'p.units("in");\np.equations({ W: 4 });\n' +
        'p.configurations([{ name: "Small", values: { W: 4 } }, { name: "Big", values: { W: 6 } }], "Small");\n' +
        'p.sketch("Front", 0, "Sketch1").line(0, 0, 4, 0).line(4, 0, 4, 1).line(4, 1, 0, 1).line(0, 1, 0, 0)' +
        '.rel("coincident", ["0.p1", "O"]).rel("coincident", ["0.p2", "1.p1"]).rel("coincident", ["1.p2", "2.p1"]).rel("coincident", ["2.p2", "3.p1"]).rel("coincident", ["3.p2", "0.p1"])' +
        '.rel("horizontal", ["0"]).rel("horizontal", ["2"]).rel("vertical", ["1"]).rel("vertical", ["3"])' +
        '.dim(0, "len").dim(1, "len").dimProps([[0, { expr: "=W", name: "D1" }], [1, { expr: "\\"D1@Sketch1\\"/4" }]]).extrude(0.5);\n';
      var r = build(code);
      noErrors(r);
      nearRel(r.mp.volume, 4 * 1 * 0.5, 1e-9, 'W 4: 4 x 1');
      var m = r.model;
      m.activeConfiguration = 'Big';
      var b = K.rebuild(m), mp = K.massProps(K.meshFromBody(b.body), 1);
      assert(!Object.keys(b.errors).length, 'Big: ' + JSON.stringify(b.errors));
      nearRel(mp.volume, 6 * 1.5 * 0.5, 1e-9, 'configuration Big: 6 x 1.5 (D2 = D1 / 4 followed)');
      m.activeConfiguration = 'Small';
      b = K.rebuild(m); mp = K.massProps(K.meshFromBody(b.body), 1);
      nearRel(mp.volume, 4 * 1 * 0.5, 1e-9, 'back to Small');
      // the script keeps the equation; built again it is the same part
      var s = K.generateScript(m);
      assert(/\\"D1@Sketch1\\"\/4/.test(s), 'the script: ' + s.split('\n').filter(function (l) { return /dimProps/.test(l); }).join(' / '));
      var r2 = build(s); noErrors(r2);
      nearRel(r2.mp.volume, 2, 1e-9, 'script round trip');
      // a second sketch on the part's top whose circle diameter is "D2@Sketch1"/2: it follows through Sketch1
      var code2 = code.replace('.extrude(0.5);\n', '.extrude(0.5);\n') +
        'p.sketch("Front", 0.5, "Sketch2").circle(2, 0.5, 0.25).dim(0, "dia").dimProps([[0, { expr: "\\"D2@Sketch1\\"/2" }]]).cut(0.5);\n';
      var r3 = build(code2); noErrors(r3);
      nearRel(r3.mp.volume, 2 - Math.PI * 0.25 * 0.25 * 0.5, 1e-9, 'Ø.5 hole (D2 1 / 2)');
      r3.model.activeConfiguration = 'Big';
      b = K.rebuild(r3.model); mp = K.massProps(K.meshFromBody(b.body), 1);
      assert(!Object.keys(b.errors).length, 'Big with the hole: ' + JSON.stringify(b.errors));
      nearRel(mp.volume, 4.5 - Math.PI * 0.375 * 0.375 * 0.5, 1e-9, 'Big: Ø.75 hole (D2 1.5 / 2)');
      // a name that is not there
      var bad = build(code.replace('\\"D1@Sketch1\\"/4', '\\"D9@Sketch1\\"/4'));
      var e = Object.keys(bad.errors).map(function (k) { return bad.errors[k]; }).join(' | ');
      assert(/D9@Sketch1/.test(e), 'the error names it: ' + e);
    });  })();
