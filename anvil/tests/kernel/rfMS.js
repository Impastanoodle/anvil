  // --- rfMS (2026-11-15, lane MS: drawing leftovers): holes and cuts across curved faces drawn as smooth curves from
  // the true intersection (SVG / PDF Béziers, DXF R2000 SPLINE, R12 POLYLINE), exploded state per view, Bend Table
  // Fixed Face note, view scale text ---
  (function () {
    group('rfMS: intersection curves smooth (cross-drilled tube, hole through a bend), exploded views, Fixed Face note, scale text');
    var DW = Drawing;
    var rfMSTube = 'p.units("in");\np.sketch("Front").circle(0, 0, 1).circle(0, 0, 0.8).extrude(4);\np.sketch("Top").circle(0, -2, 0.25).cut("through", { both: true });';
    var rfMSChannel = 'p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\np.flange(1, [[4, 0.06, 1.5]]);\np.flange(1, [[0, 0.06, 1.5]]);\n' +
      'p.sketch("Top").circle(4.02, -1.5, 0.1).cut("through", { both: true });';
    function rfMSDrawing(code) {
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-15', projection: 'third' });
      DW.standard3View(doc, r.mesh, r.model.units === 'in' ? 'in' : 'mm');
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model);
      return r;
    }
    // the true intersection curves of hole cylinder H with every other cylinder of the part, densely, in 3D: along each
    // ruling of the hole, the sign changes of the other surface's distance
    function rfMSTrueCurves(mesh, H) {
      var CV = DW.meshCurves(mesh), K = Kernel, V = K.vec, out = [], seen = {}, f = DW._.surfDist;
      var e1 = Math.abs(H.d[0]) < 0.9 ? V.norm(V.cross(H.d, [1, 0, 0])) : V.norm(V.cross(H.d, [0, 1, 0])), e2 = V.cross(H.d, e1);
      CV.faceSurf.concat((H.planes || []).map(function (pl, i) { return { key: 'pl' + i, s: pl }; })).forEach(function (fs) {
        if (!fs || (fs.s.t !== 'cyl' && fs.s.t !== 'pln') || seen[fs.key]) return;
        seen[fs.key] = true;
        var S = fs.s;
        if (S.t === 'cyl' && Math.abs(V.dot(S.d, H.d)) > 1 - 1e-9 && V.len(V.cross(V.sub(S.o, H.o), H.d)) < 1e-9 && Math.abs(S.r - H.r) < 1e-9) return;   // the hole itself
        for (var i = 0; i < 4000; i++) {
          var th = 2 * Math.PI * i / 4000, base = V.add(H.o, V.add(V.scale(e1, H.r * Math.cos(th)), V.scale(e2, H.r * Math.sin(th))));
          var prev = null, ps = null;
          for (var s = -6; s <= 6; s += 0.01) {
            var p = V.add(base, V.scale(H.d, s)), g = f(S, p);
            if (!g) { prev = null; continue; }
            if (prev != null && prev * g[0] <= 0) {
              var a = ps, b = s;
              for (var it = 0; it < 50; it++) { var m = (a + b) / 2, gm = f(S, V.add(base, V.scale(H.d, m)))[0]; if ((gm <= 0) === (f(S, V.add(base, V.scale(H.d, a)))[0] <= 0)) a = m; else b = m; }
              out.push(V.add(base, V.scale(H.d, (a + b) / 2)));
            }
            prev = g[0]; ps = s;
          }
        }
      });
      // (H.endsZ: the circles where cylinders along Z end on the planes z = c: a bend's arcs at the channel's ends)
      (H.endsZ || []).forEach(function (zc) {
        CV.faceSurf.forEach(function (fs) {
          var S = fs && fs.s;
          if (!S || S.t !== 'cyl' || Math.abs(Math.abs(S.d[2]) - 1) > 1e-9) return;
          for (var i = 0; i < 4000; i++) { var th = 2 * Math.PI * i / 4000; out.push([S.o[0] + S.r * Math.cos(th), S.o[1] + S.r * Math.sin(th), zc]); }
        });
      });
      return out;
    }
    // every smooth piece of the sheet: sampled, back in the view frame, against the true curves projected (grid lookup)
    function rfMSCheckCurves(r, H, size) {
      var pts3 = rfMSTrueCurves(r.mesh, H), V = Kernel.vec, worst = 0, n = 0, views = [], far = [], bentBack = 0;
      r.sheet.views.forEach(function (w) {
        var pr = w.proj, U = pr.u, Vv = pr.v, cell = 0.01, grid = {};
        pts3.forEach(function (p) { var u = V.dot(p, U), v = V.dot(p, Vv), k = Math.round(u / cell) + ',' + Math.round(v / cell); (grid[k] || (grid[k] = [])).push([u, v]); });
        var nb = 0;
        r.sheet.prims.forEach(function (p) {
          if (p.layer !== w.layer || p.k !== 'line' || !p.bz) return;
          nb++;
          function dist(q) {
            var best = Infinity, i0 = Math.round(q[0] / cell), j0 = Math.round(q[1] / cell);
            for (var i = i0 - 1; i <= i0 + 1; i++) for (var j = j0 - 1; j <= j0 + 1; j++) (grid[i + ',' + j] || []).forEach(function (c) { best = Math.min(best, Math.hypot(c[0] - q[0], c[1] - q[1])); });
            return best;
          }
          // (on Anvil's faceted solid a chain is pulled back onto a facet corner where the true curve runs out of the
          // solid (projectView, r5): there the drawn points themselves are off the true curve; the cubic between two
          // points is held to no worse than its own ends)
          var ends = Math.max(dist(w.fromSheet(p.a)), dist(w.fromSheet(p.b)));
          if (ends > 1e-4 * size) bentBack++;
          [0.25, 0.5, 0.75].forEach(function (t) {
            var q = w.fromSheet(DW._.bzAt(p, t)), best = dist(q), over = best - Math.max(0, ends > 1e-4 * size ? ends : 0);
            if (!(over <= 1e-4 * size)) far.push(w.view.orient + ' ' + q.map(function (x) { return x.toFixed(4); }).join(',') + ' ' + (best === Infinity ? 'none' : best.toExponential(1)));
            worst = Math.max(worst, over); n++;
          });
        });
        views.push(w.view.orient + ' ' + nb);
      });
      // (the true points are 2π·r / 4000 apart along the curve: half that is the sampling's own error)
      var slack = Math.PI * H.r / 4000;
      assert(n > 0, 'smooth pieces drawn');
      assert(worst <= 1e-4 * size + slack, 'every smooth piece within 1e-4 x part size of the true curve: worst ' + worst.toExponential(2) + ' (' + pts3.length + ' true points; ' + far.length + ' far: ' + far.slice(0, 6).join(' | ') + ')');
      return views.join(', ') + ' smooth pieces; worst ' + worst.toExponential(2) + ' in (' + bentBack + ' pulled back onto facet corners)';
    }
    // straight pieces shorter than minLen that run on from a smooth curve (meeting a Bézier piece's end within 30° of
    // its tangent there): a facet chord left in the curve
    function rfMSShortStraight(r, minLen) {
      var bad = [];
      r.sheet.views.forEach(function (w) {
        var bz = r.sheet.prims.filter(function (p) { return p.layer === w.layer && p.k === 'line' && p.bz; });
        r.sheet.prims.forEach(function (p) {
          if (p.layer !== w.layer || p.k !== 'line' || p.bz) return;
          var L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]);
          if (L >= minLen || L < 1e-9) return;
          var d = [(p.b[0] - p.a[0]) / L, (p.b[1] - p.a[1]) / L];
          var runsOn = bz.some(function (q) {
            return [[q.a, q.bz[0]], [q.b, q.bz[1]]].some(function (e) {
              var t = [e[1][0] - e[0][0], e[1][1] - e[0][1]], tl = Math.hypot(t[0], t[1]);
              if (!(tl > 0)) return false;
              var touch = [p.a, p.b].some(function (x) { return Math.hypot(x[0] - e[0][0], x[1] - e[0][1]) < 1e-6; });
              return touch && Math.abs(t[0] * d[0] + t[1] * d[1]) / tl > Math.cos(Math.PI / 6);
            });
          });
          if (runsOn) bad.push(w.view.orient + ' ' + L.toFixed(5) + ' at ' + p.a.map(function (x) { return x.toFixed(3); }).join(','));
        });
      });
      return bad;
    }
    function rfMSAudit(r) {
      var r12 = DW.toDXF(r.sheet), r2 = DW.toDXF(r.sheet, { version: 'R2000' });
      // (the audit's "duplicate DIMENSION" on a tube's Ø2.000 / 2.000 model items is the dimensions', not this lane's)
      var errs = function (a) { return a.errors.filter(function (e) { return !/duplicate DIMENSION/.test(e); }); };
      var a12 = errs(DxfCheck.audit(r12, { units: 'in' })), a2 = errs(DxfCheck.audit(r2, { units: 'in' }));
      assert(!a12.length, 'R12 audit: ' + a12.slice(0, 3).join(' | '));
      assert(!a2.length, 'R2000 audit: ' + a2.slice(0, 3).join(' | '));
      var cnt = function (t, e) { return (t.match(new RegExp('\\n\\s*0\\r?\\n' + e + '\\r?\\n', 'g')) || []).length; };
      return { spl: cnt(r2, 'SPLINE'), lines12: cnt(r12, 'LINE'), lines2: cnt(r2, 'LINE'), poly12: cnt(r12, 'POLYLINE') };
    }
    test('rfMS: cross-drilled tube: the saddle curves in Right and Isometric are smooth Béziers on the true curve, DXF SPLINEs, audit clean', function () {
      var r = rfMSDrawing(rfMSTube);
      var det = rfMSCheckCurves(r, { o: [0, 0, 2], d: [0, 1, 0], r: 0.25 }, 4);
      var bad = rfMSShortStraight(r, 0.05);
      assert(!bad.length, 'no straight piece shorter than .05 in: ' + bad.slice(0, 5).join(', '));
      var svg = DW.toSVG(r.sheet), cs = (svg.match(/ C/g) || []).length;
      assert(cs > 100, 'SVG paths with cubic segments: ' + cs);
      var pdf = DW.toPDF(r.sheet);
      assert(/ c( S)?\n/.test(pdf) || / c S/.test(pdf) || / c\n/.test(pdf), 'PDF curve operators');
      var d = rfMSAudit(r);
      assert(d.spl >= 4 && d.lines2 < 120, 'R2000: ' + d.spl + ' SPLINEs, ' + d.lines2 + ' LINEs (were ~690 LINEs)');
      assert(d.poly12 >= 4, 'R12: ' + d.poly12 + ' POLYLINEs');
      return det + '; R2000 ' + d.spl + ' SPLINE / ' + d.lines2 + ' LINE; R12 ' + d.poly12 + ' POLYLINE / ' + d.lines12 + ' LINE';
    });
    test('rfMS: U channel with a Ø.2 hole through a bend: the hole wall across the bend is smooth in Top, Right and Isometric, on the true curve, audit clean', function () {
      var r = rfMSDrawing(rfMSChannel);
      var det = rfMSCheckCurves(r, { o: [4.02, 0, 1.5], d: [0, 1, 0], r: 0.1, planes: [{ t: 'pln', n: [0, 1, 0], c: 0 }, { t: 'pln', n: [0, 1, 0], c: 0.06 }, { t: 'pln', n: [0, 1, 0], c: 1.12 }, { t: 'pln', n: [1, 0, 0], c: 4.12 }, { t: 'pln', n: [1, 0, 0], c: 4.06 }], endsZ: [0, 3] }, 4.2);
      // (dots under 0.001 in (0.025 mm, inside the line width) are left where the bend's tangent lines cross the hole:
      // four lines meet there, no chain runs through)
      var bad = rfMSShortStraight(r, 0.05).filter(function (s) { return +s.split(' ')[1] >= 0.001; });
      assert(!bad.length, 'no straight piece between .001 and .05 in running on from a curve: ' + bad.join(', '));
      var d = rfMSAudit(r);
      assert(d.spl >= 4, 'R2000: ' + d.spl + ' SPLINEs');
      return det + '; R2000 ' + d.spl + ' SPLINE / ' + d.lines2 + ' LINE';
    });
    // a base plate with a block on it, the block exploded 30 mm up (Y)
    var rfMSAsm = 'var b = a.insert({ script: \'p.name("Base"); p.box(100, 50, 10);\' }, { fixed: true });\n' +
      'var k = a.insert({ script: \'p.name("Block"); p.box(20, 20, 10);\' }, { position: [40, 10, 15], fixed: true });\n' +
      'a.explode([k], "y", 30);';
    test('rfMS: assembly drawing: Front exploded next to a collapsed Front (per view), saved with the view, script / summary, refusals', function () {
      var r = buildAsm(rfMSAsm);
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      var doc = DW.newDrawing(r.model, { date: '2026-11-15' });
      DW.addView(doc, 'Front', { x: 80, y: 120 }); DW.addView(doc, 'Front', { x: 250, y: 120 });
      var ids = doc.views.map(function (v) { return v.id; });
      DW.setViewExploded(doc, ids[1], true, r.model);
      assert(doc.views[1].exploded === r.model.explodedViews[0].id, 'stored as the Exploded View id: ' + doc.views[1].exploded);
      assert(JSON.parse(JSON.stringify(doc)).views[1].exploded === doc.views[1].exploded, 'saved in the drawing (JSON)');
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      function height(w) { var b = w.proj.bounds; return b.vmax - b.vmin; }
      var h0 = height(sh.views[0]), h1 = height(sh.views[1]);
      near(h0, 20, 1e-6, 'collapsed Front: plate 10 + block 10 high');
      near(h1, 50, 1e-6, 'exploded Front: the block 30 up (10 + 30 + 10)');
      assert(sh.views[0].proj.lines.visible.length !== sh.views[1].proj.lines.visible.length || h0 !== h1, 'two different pictures');
      // the collapsed build's mesh is not touched: a recompute with the view collapsed again is the collapsed picture
      DW.setViewExploded(doc, ids[1], false);
      assert(doc.views[1].exploded === false, 'cleared: stored false');
      near(height(DW.compute(doc, r.mesh, r.model, { build: r.build }).views[1]), 20, 1e-6, 'collapsed again');
      // by name; refusals
      DW.setViewExploded(doc, ids[1], 'ExplView1', r.model);
      assert(doc.views[1].exploded === r.model.explodedViews[0].id, 'by name');
      var msg = '';
      try { DW.setViewExploded(doc, ids[1], 'Nope', r.model); } catch (e) { msg = e.message; }
      assert(/No exploded view/.test(msg), 'an unknown explode refused: ' + msg);
      var p = build('p.box(10, 10, 10);'), pd = DW.newDrawing(p.model, {});
      DW.addView(pd, 'Front', {});
      msg = '';
      try { DW.setViewExploded(pd, pd.views[0].id, true, p.model); } catch (e) { msg = e.message; }
      assert(/not of an assembly/.test(msg), 'a part drawing refused: ' + msg);
      var b2 = buildAsm('var b = a.insert({ script: \'p.box(10, 10, 10);\' }, { fixed: true });'), d2 = DW.newDrawing(b2.model, {});
      DW.addView(d2, 'Front', {});
      msg = '';
      try { DW.setViewExploded(d2, d2.views[0].id, true, b2.model); } catch (e) { msg = e.message; }
      assert(/no exploded view/.test(msg), 'an assembly without an explode refused: ' + msg);
      return 'collapsed ' + h0 + ' mm high, exploded ' + h1 + ' mm';
    });
    test('rfMS: an assembly shown exploded: a view without the key (saved before) follows it, a cleared box draws it collapsed, views made now are ticked (explodedNow), a projected view takes its parent\'s box', function () {
      var r = buildAsm(rfMSAsm + '\na.exploded();');
      assert(r.model.exploded != null, 'the assembly is shown exploded');
      var doc = DW.newDrawing(r.model, { date: '2026-11-15' });
      DW.addView(doc, 'Front', { x: 80, y: 120 }); DW.addView(doc, 'Front', { x: 250, y: 120 });
      assert(doc.views[0].exploded === undefined, 'no app hook: no key (as an old drawing)');
      DW.setViewExploded(doc, doc.views[1].id, false, r.model);
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      function height(w) { var b = w.proj.bounds; return b.vmax - b.vmin; }
      near(height(sh.views[0]), 50, 1e-6, 'old view follows the assembly: exploded');
      near(height(sh.views[1]), 20, 1e-6, 'cleared box: collapsed');
      assert(DW.explodedShown(doc.views[0], r.model) === r.model.exploded && DW.explodedShown(doc.views[1], r.model) === false, 'effective values');
      var keep = DW.explodedNow;
      try {
        DW.explodedNow = function () { return true; };
        var nv = DW.addView(doc, 'Top', { x: 80, y: 200 });
        assert(nv.exploded === true, 'a view made now is ticked');
        var pv = DW.addProjectedView(doc, r.mesh, doc.views[1].id, 'right', {});
        assert(pv.exploded === false, 'projected from the cleared view: cleared');
      } finally { if (keep) DW.explodedNow = keep; else delete DW.explodedNow; }
      return 'old view ' + height(sh.views[0]) + ', cleared ' + height(sh.views[1]);
    });
    test('rfMS: a part with no intersection curve draws no Bézier (plain plate with holes: SVG / DXF as before)', function () {
      var r = rfMSDrawing('p.units("in");\np.box(4, 2, 0.25);\np.hole("Top", 1, -1, 0.25, { offset: 2 });');
      assert(!r.sheet.prims.some(function (p) { return p.bz; }), 'no smooth pieces');
      assert(!r.sheet.views.some(function (w) { return w.proj.isect; }), 'no intersection points');
      assert(!/ C/.test(DW.toSVG(r.sheet)) && DW.toDXF(r.sheet, { version: 'R2000' }).indexOf('SPLINE') < 0, 'no curves written');
      return 'plain';
    });
  })();
