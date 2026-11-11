  // --- rfLE (2026-11-11, lane realfiles) --- What the shop's own STEP files tripped over, each reproduced with a part
  // built here (no customer geometry): (1) SolidWorks writes an assembly's placing relationships assembly first
  // (rep_1 the assembly, items swapped): every instance was read once, at the part's own origin; (2) Mastercam writes
  // edges as QUASI_UNIFORM_CURVEs (no knots: the form gives them): refused as "curves other than …"; (3) a torus /
  // sphere / cone face bounded by anything but latitude circles (a revolve's meridian ends, fillet corners split by
  // meridians, cones to their apex, B-spline intersection curves) was refused: now any patch of a cylinder, cone,
  // sphere or torus is unrolled into its (u, v), ear clipped and refined (paramPatch), a band between two loops that
  // wind round it cut along the period; (4) a flat plate (a blank sent as a solid) refused by Insert Bends ("no sharp
  // corner"): SolidWorks makes it a sheet-metal part with no bends, so does Anvil now.
  (function () {
    group('rfLE: real shop STEP files: SolidWorks assembly order, Mastercam quasi-uniform curves, any analytic patch, flat plates through Insert Bends');
    var X = typeof Exchange !== 'undefined' ? Exchange : null;
    function rfLEneedX() { if (!X) fail('exchange.js is not loaded'); }
    function rfLEbox(res) {
      var min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      res.solids.forEach(function (s) { for (var i = 0; i < s.positions.length; i += 3) for (var a = 0; a < 3; a++) { min[a] = Math.min(min[a], s.positions[i + a]); max[a] = Math.max(max[a], s.positions[i + a]); } });
      return { min: min, max: max };
    }
    function rfLEread(step, units) {
      var res = X.importFile('rfLE.step', step, { units: units || 'in' }), b = K.rebuild(X.newPartFromImport(res));
      var bodies = b.bodies && b.bodies.length ? b.bodies : [b.body], vol = 0, closed = true;
      bodies.forEach(function (body) {
        vol += K.massProps(K.meshFromBody(body), 1).volume;
        if (typeof Evaluate !== 'undefined' && !Evaluate.checkBody(body, { maxPairs: 1 }).ok) closed = false;
      });
      return { res: res, build: b, volume: vol, closed: closed, box: rfLEbox(res) };
    }
    function rfLEpart(code) { var m = K.newModel('rfLE'); K.runScript(m, 'p.units("in");\n' + code); var b = K.rebuild(m); noErrors({ errors: b.errors }); return { model: m, build: b, step: X.exportSTEP(m, b) }; }

    test('rfLE: an assembly STEP written assembly first (as SolidWorks does: rep_1 the assembly, rep_2 the part, the transform items swapped) places every instance where the part-first file does', function () {
      rfLEneedX();
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Pinned plate assembly'; })[0];
      if (!ex) fail('no Pinned plate assembly example');
      var r = buildExample(ex), step = X.exportSTEP(r.model, r.build);
      var sw = step.replace(/(REPRESENTATION_RELATIONSHIP\('[^']*','[^']*',)(#\d+),(#\d+)\)/g, '$1$3,$2)')
        .replace(/(ITEM_DEFINED_TRANSFORMATION\('[^']*','[^']*',)(#\d+),(#\d+)\)/g, '$1$3,$2)');
      assert(sw !== step && (sw.match(/ITEM_DEFINED_TRANSFORMATION\(/g) || []).length === 4, 'rewritten');
      var a = rfLEread(step, 'auto'), b = rfLEread(sw, 'auto');
      assert(b.res.solids.length === 4, 'four instances: ' + b.res.solids.map(function (s) { return s.name; }).join(','));
      nearRel(b.volume, a.volume, 1e-9, 'volume');
      nearVec(b.box.min, a.box.min, 1e-6, 'bbox min'); nearVec(b.box.max, a.box.max, 1e-6, 'bbox max');
      return 'volume ' + fmt(b.volume) + ', 4 instances placed';
    });

    // every LINE of an EDGE_CURVE replaced by a degree-1 QUASI_UNIFORM_CURVE through its two vertices (simple entity, or
    // the complex form Mastercam writes)
    function rfLEquasi(text, complex) {
      var byId = {}, maxId = 0, extra = [];
      text.split('\n').forEach(function (l) { var m = /^#(\d+)=(.*);\s*$/.exec(l); if (m) { byId[m[1]] = m[2]; maxId = Math.max(maxId, +m[1]); } });
      var out = text.replace(/^(#\d+=EDGE_CURVE\('[^']*',)#(\d+),#(\d+),#(\d+),(\.[TF]\.)\);/gm, function (all, head, v1, v2, c, sense) {
        if (!/^LINE\(/.test(byId[c] || '')) return all;
        var p1 = /VERTEX_POINT\('[^']*',#(\d+)\)/.exec(byId[v1])[1], p2 = /VERTEX_POINT\('[^']*',#(\d+)\)/.exec(byId[v2])[1], id = ++maxId;
        var poles = sense === '.T.' ? '(#' + p1 + ',#' + p2 + ')' : '(#' + p2 + ',#' + p1 + ')';
        extra.push('#' + id + '=' + (complex ? '(B_SPLINE_CURVE(1,' + poles + ',.POLYLINE_FORM.,.F.,.F.)BOUNDED_CURVE()CURVE()GEOMETRIC_REPRESENTATION_ITEM()QUASI_UNIFORM_CURVE()REPRESENTATION_ITEM(\'\'))' : 'QUASI_UNIFORM_CURVE(\'\',1,' + poles + ',.POLYLINE_FORM.,.F.,.F.)') + ';');
        return head + '#' + v1 + ',#' + v2 + ',#' + id + ',' + sense + ');';
      });
      var at = out.lastIndexOf('ENDSEC;');
      return out.slice(0, at) + extra.join('\n') + '\n' + out.slice(at);
    }
    test('rfLE: edges written as QUASI_UNIFORM_CURVEs (simple and complex entity, no knots in the file) read as the lines they are: plate with a hole and a slot, exact volume', function () {
      rfLEneedX();
      var p = rfLEpart('p.sketch("Top").rect(0, -3, 4, 3).circle(1, -1, 0.25).slot(2, -2, 3, -2, 0.2).end().extrude(0.075);\n');
      var want = K.massProps(K.meshFromBody(p.build.body), 1).volume, out = [];
      [false, true].forEach(function (complex) {
        var q = rfLEquasi(p.step, complex);
        assert((q.match(/QUASI_UNIFORM_CURVE/g) || []).length >= 8, 'every straight edge rewritten');
        var r = rfLEread(q);
        assert(r.closed, (complex ? 'complex' : 'simple') + ': closed');
        nearRel(r.volume, want, 1e-9, (complex ? 'complex' : 'simple') + ' volume');
        out.push((complex ? 'complex ' : 'simple ') + fmt(r.volume));
      });
      return out.join(', ');
    });

    test('rfLE: a torus face between two meridian circles (a 90° revolve of a circle: a band winding round the tube, no seam edge) reads closed, within 0.5 % of π r² · 2πR / 4 (sphere / torus facets carry no profile chord)', function () {
      rfLEneedX();
      var p = rfLEpart('p.sketch("Front").circle(2, 0, 0.5).end().revolve(90);\n');
      assert(/TOROIDAL_SURFACE/.test(p.step), 'Anvil writes the torus whole');
      var r = rfLEread(p.step), exact = Math.PI * 0.25 * 2 * Math.PI * 2 / 4;
      assert(r.closed, 'closed solid');
      nearRel(r.volume, exact, 5e-3, 'volume');
      assert(r.res.stats.triangles < 8000, 'not over-refined: ' + r.res.stats.triangles + ' triangles');
      return 'volume ' + r.volume.toFixed(6) + ' of ' + exact.toFixed(6) + ', ' + r.res.stats.triangles + ' triangles';
    });

    test('rfLE: a 90° revolve of a half disc (sphere wedge: meridian ends through both poles) and of a ring (cylinder and torus bands, cone patch) read closed', function () {
      rfLEneedX();
      var out = [];
      [['sphere wedge', 'p.sketch("Front").arc(0, 0, 1, -90, 90).line(0, 1, 0, -1).end().revolve(90);\n', Math.PI / 3],
        ['rounded ring', 'p.sketch("Front").polyline([[1, -0.5], [2, -0.5], [2.5, 0.5], [1, 0.5]], true).end().revolve(120);\n', null]].forEach(function (c) {
        var p = rfLEpart(c[1]), want = c[2] != null ? c[2] : K.massProps(K.meshFromBody(p.build.body), 1).volume, r = rfLEread(p.step);
        assert(r.closed, c[0] + ': closed');
        nearRel(r.volume, want, 1e-2, c[0] + ' volume');
        out.push(c[0] + ' ' + r.volume.toFixed(5));
      });
      return out.join(', ');
    });

    test('rfLE: a dome whose sphere face is bounded by its circle alone (no seam edge, no vertex loop, as SolidWorks writes it) closes through the right pole, up and down', function () {
      rfLEneedX();
      var out = [];
      [['up', 'p.sketch("Front").arc(0, 0, 1, 0, 90).line(0, 1, 0, 0).line(0, 0, 1, 0).end().revolve(360);\n', 1],
        ['down', 'p.sketch("Front").arc(0, 0, 1, -90, 0).line(1, 0, 0, 0).line(0, 0, 0, -1).end().revolve(360);\n', -1]].forEach(function (c) {
        var p = rfLEpart(c[1]), lone = p.step.replace(/EDGE_LOOP\('',\((#\d+),#\d+,#\d+\)\)/, 'EDGE_LOOP(\'\',($1))');
        assert(lone !== p.step, c[0] + ': the seam edges taken out');
        var r = rfLEread(lone);
        assert(r.closed, c[0] + ': closed');
        near(c[2] > 0 ? r.box.max[1] : -r.box.min[1], 1, 1e-9, c[0] + ': the pole on the dome\'s side');
        near(c[2] > 0 ? r.box.min[1] : -r.box.max[1], 0, 1e-9, c[0] + ': the base');
        nearRel(r.volume, 2 / 3 * Math.PI, 1.5e-2, c[0] + ' volume (sphere facets: polygonal)');
        out.push(c[0] + ' ' + r.volume.toFixed(4));
      });
      return out.join(', ');
    });

    test('rfLE: a flat plate sent as a solid (STEP) goes through Insert Bends: no bends, the flat is the plate (holes and slot on HOLES), the DXF audits clean; a solid block still has nothing to bend', function () {
      rfLEneedX();
      var p = rfLEpart('p.sketch("Top").rect(0, -3, 4, 3).circle(1, -1, 0.25).slot(2, -2, 3, -2, 0.2).end().extrude(0.075);\n');
      var res = X.importFile('plate.step', p.step, { units: 'in' }), m = X.newPartFromImport(res);
      new K.Builder(m).insertBends([3.5, 0.075, 0.5], {});
      var b = K.rebuild(m);
      assert(!Object.keys(b.errors || {}).length, 'no errors: ' + JSON.stringify(b.errors));
      near(+m.sheet.thickness, 0.075, 1e-9, 'T measured');
      var mesh = K.meshFromBody(b.body), fl = K.flatPattern(m, b, mesh);
      assert(fl.bends.length === 0 && fl.loops.length === 3, 'no bends, outline + hole + slot: ' + fl.bends.length + ' / ' + fl.loops.length);
      var A = 0;
      fl.loops.forEach(function (L, i) { A += (i ? -1 : 1) * Math.abs(K.signedArea(L)); });
      var mp = K.massProps(mesh, 1);
      nearRel(A * 0.075, mp.polygonal ? mp.polygonal.volume : mp.volume, 1e-6, 'blank × T = the plate');
      var dxf = K.exportDXFFlat(fl, 'in'), au = DxfCheck.audit(dxf, { units: 'in', layers: ['OUTLINE', 'HOLES', 'RELIEF'] });
      assert(au.ok, 'DXF audit: ' + au.errors.join('; '));
      // a block 1 thick measured at .25: not a plate of that thickness
      var q = rfLEpart('p.sketch("Top").rect(0, -3, 4, 3).end().extrude(1);\n'), mq = X.newPartFromImport(X.importFile('block.step', q.step, { units: 'in' }));
      new K.Builder(mq).insertBends([2, 1, 1.5], { thickness: 0.25 });
      var bq = K.rebuild(mq), e = Object.keys(bq.errors || {}).map(function (k) { return String(bq.errors[k].message || bq.errors[k]); }).join('; ');
      assert(/no sharp corner/.test(e), 'block refused: ' + e);
      return 'blank ' + A.toFixed(6) + ' in²';
    });
  })();
