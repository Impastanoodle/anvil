  // --- rfQD (2026-11-19, lane shopflow8, test-reports/2026-11-19-shop-flow-8.md) --- the shop audit, round 8: the jobs'
  // parts against the closed form. Job 3: a 16 ga U channel with a 60 degree flange (louvers, a dimple, countersunk
  // holes Up To Next on a flange, a Vent, a Normal Cut through the slanted flange; a rib across a bend refused): every
  // stage closed, blank = lines - 2 R tan(A/2) + A (R + K T) (sketch lines on the inside face), the flat DXF's layers.
  // Job 4a: an Anvil bracket written to STEP, read back dumb, Insert Bends, K changed, a flange lengthened by a Tab, a
  // hole. Job 4b: a DXF flat with a duplicate line, a .002 gap and BEND-layer lines: check / repair, Base Flange, one
  // Sketched Bend on the DXF's bend lines: the flat is the DXF's outline and its bend lines the DXF's.
  (function () {
    var T = 0.0598, R = 0.0625, KF = 0.44;
    function rfQDba(deg) { return deg * Math.PI / 180 * (R + KF * T); }
    function rfQDlong(fl) { return Math.max(fl.size[0], fl.size[1]); }
    var C60 = 6 + 2 * Math.cos(Math.PI / 3), S60 = 2 * Math.sin(Math.PI / 3);
    var J3 = 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\n' +
      'p.sketch("Front").polyline([[0, 2], [0, 0], [6, 0], [' + C60 + ', ' + S60 + ']], false).end().baseFlange(null, { depth: 10 });\n';
    var J3BLANK = 10 - 2 * R * (Math.tan(Math.PI / 4) + Math.tan(Math.PI / 6)) + rfQDba(90) + rfQDba(60);
    var J3STEPS = [
      'p.formingTool("louver", [1.5, 0, 1.5], { angle: 0 });\n',
      'p.formingTool("louver", [1.5, 0, 3], { angle: 0 });\n',
      'p.formingTool("dimple", [4.5, 0, 8.5], {});\n',
      'p.holeWizard({ face: "Right", offset: 0, points: [[-2, 1], [-4, 1], [-6, 1], [-8, 1]], standard: "ANSI Inch", type: "csk", size: "#10", end: "next" });\n',
      'p.sketch("Top").circle(4, -4, 0.9).line(3.1, -4, 4.9, -4).line(4, -4.9, 4, -3.1).end().vent({ ribWidth: 0.1 });\n',
      'p.sketch("Right", 8).rect(-6, 0.5, 2, 0.7).end().cut(2.5, { reverse: true, normalCut: true });\n'
    ];

    test('rfQD: job 3, 16 ga U channel 2 + 6 + 2 at 60 degrees, 10 long (T .0598 R .0625 K .44): each stage closed (two louvers, a dimple, 4 countersunk #10 Up To Next in the 90 degree flange, a Vent, a Normal Cut through the 60 degree flange) and the blank 10 - 2R (tan 45 + tan 30) + BA90 + BA60 = 10.035340 x 10', function () {
      var code = J3, out = [], vols = [];
      for (var k = 0; k <= J3STEPS.length; k++) {
        if (k) code += J3STEPS[k - 1];
        var r = build(code);
        noErrors(r);
        var q = K.meshQuality(r.mesh);
        assert(q.openEdges === 0 && q.nonManifoldEdges === 0, 'stage ' + k + ' closed: ' + q.openEdges + ' open');
        var fl = K.flatPattern(r.model, r.build, r.mesh);
        near(rfQDlong(fl), J3BLANK, 1e-6, 'stage ' + k + ' blank');
        near(Math.min(fl.size[0], fl.size[1]), 10, 1e-9, 'stage ' + k + ' width');
        vols.push(r.mp.volume); out.push(fl.loops.length);
      }
      // the Normal Cut's window: 2 along the channel, .7 of height up a 60 degree flange = .7 / sin 60 along it, square walls
      near(vols[5] - vols[6], 2 * 0.7 / Math.sin(Math.PI / 3) * T, 1e-6, 'normal cut window x T');
      assert(out.join(',') === '1,2,3,3,7,11,12', 'flat loops per stage ' + out.join(','));
      var fl6 = K.flatPattern(build(code).model, build(code).build, build(code).mesh);
      return 'blank ' + fl6.size.map(function (x) { return x.toFixed(6); }).join(' x ') + ', loops ' + out.join(',');
    });

    test('rfQD: job 3, the flat DXF for the laser: one outline, the louver lances, the Vent\'s four openings and the Normal Cut window as closed polylines on HOLES, the four countersinks as Ø .281 circles (the through diameter at the far face), the forms on FORM with notes, two bend lines', function () {
      var r = build(J3 + J3STEPS.join(''));
      noErrors(r);
      var fl = K.flatPattern(r.model, r.build, r.mesh), dxf = K.exportDXFFlat(fl, r.model.units, { bendLines: true, notes: true, formingTools: true });
      function count(ent, layer) { var re = new RegExp('\\n0\\n' + ent + '\\n8\\n' + layer + '\\n', 'g'); return (dxf.match(re) || []).length; }
      assert(count('POLYLINE', 'OUTLINE') === 1 && count('POLYLINE', 'HOLES') === 7 && count('CIRCLE', 'HOLES') === 4 && count('LINE', 'BEND') === 2, 'layers: outline ' + count('POLYLINE', 'OUTLINE') + ', holes ' + count('POLYLINE', 'HOLES') + ' + ' + count('CIRCLE', 'HOLES') + ', bends ' + count('LINE', 'BEND'));
      assert(count('POLYLINE', 'FORM') + count('LINE', 'FORM') + count('CIRCLE', 'FORM') > 0 && /DIMPLE/.test(dxf) && /LOUVER/.test(dxf), 'forming tools marked');
      var radii = (dxf.match(/\n0\nCIRCLE\n8\nHOLES\n[\s\S]*?\n40\n([\d.]+)/g) || []).map(function (s) { return +/\n40\n([\d.]+)$/.exec(s)[1]; });
      radii.forEach(function (x) { near(x, 0.140517, 2e-6, 'countersink through radius'); });
      return radii.length + ' circles r ' + radii[0];
    });

    test('rfQD: job 3, a rib forming tool across the 90 degree bend is refused with the reason (SolidWorks places forming tools on a flat face only; a rib across a bend is a Sheet Metal Gusset there)', function () {
      var r = build(J3 + 'p.formingTool("rib", [0.2, 0, 6], { angle: 0, length: 1.5 });\n');
      var e = Object.keys(r.errors).map(function (k) { return r.errors[k]; }).join(' ');
      assert(/does not fit on the face.*across a bend/.test(e), 'refused: ' + e);
      return e;
    });

    // QD2: a pattern / mirror of a Forming Tool = the same tools placed one by one (volume to 1e-9, the flat's loops and
    // forming marks / notes the same to 1e-7, every copy in the flat DXF)
    var QPLATE = 'p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -10, 10, 10).end().baseFlange();\n';
    function rfQDft(tool, x, z, ang) { return 'p.formingTool("' + tool + '", [' + x + ', ' + T + ', ' + z + '], { angle: ' + ang + ' });\n'; }
    function rfQDsig(code) {
      var r = build(QPLATE + code);
      noErrors(r);
      assert(K.meshQuality(r.mesh).openEdges === 0, 'closed');
      var fl = K.flatPattern(r.model, r.build, r.mesh), r7 = function (v) { return Math.round(v * 1e7) / 1e7; };
      var loops = fl.loops.map(function (l) { return l.map(function (p) { return p.map(r7).join(','); }).sort().join(';'); }).sort();
      var et = (fl.etch || []).filter(function (i) { return i.form != null; }).map(function (i) {
        return JSON.stringify([i.t, i.kind, i.text || '', (i.pts || [i.a, i.b, i.c].filter(Boolean)).map(function (p) { return p.map(r7).join(','); }).sort(), i.r ? r7(i.r) : 0]);
      }).sort();
      return { vol: r.mp.volume, loops: JSON.stringify(loops), nl: loops.length, et: JSON.stringify(et), ne: et.length, dxf: K.exportDXFFlat(fl, 'in', { bendLines: true, notes: true, formingTools: true }) };
    }
    function rfQDsame(a, b, what) {
      near(a.vol, b.vol, 1e-9, what + ' volume');
      assert(a.loops === b.loops, what + ': the flat\'s loops (' + a.nl + ' / ' + b.nl + ')');
      assert(a.et === b.et, what + ': the forming marks and notes (' + a.ne + ' / ' + b.ne + ')');
    }

    test('rfQD: QD2, Linear Pattern of a louver x4 (1.5 apart) = four louvers placed one by one: volume, flat loops (four lance slits), marks and notes; the flat DXF has four LOUVER notes', function () {
      var a = rfQDsig(rfQDft('louver', 2, 2, 0) + 'p.linearPattern({ dir: "z", spacing: 1.5, count: 4 });\n');
      var b = rfQDsig(rfQDft('louver', 2, 2, 0) + rfQDft('louver', 2, 3.5, 0) + rfQDft('louver', 2, 5, 0) + rfQDft('louver', 2, 6.5, 0));
      rfQDsame(a, b, 'louver x4');
      assert(a.nl === 5 && (a.dxf.match(/LOUVER/g) || []).length === 4, 'four lances, four notes: ' + a.nl);
      return 'volume ' + a.vol.toFixed(9) + ', ' + a.nl + ' loops, ' + a.ne + ' marks';
    });

    test('rfQD: QD2, Circular Pattern of a dimple and of a louver about the plate\'s centre (4 equal): each copy turned with the rotation (seed angle - 90 k), as placed one by one', function () {
      var cp = 'p.circularPattern({ axis: "y", center: [5, 0, 5], count: 4 });\n';
      rfQDsame(rfQDsig(rfQDft('dimple', 8, 5, 0) + cp), rfQDsig(rfQDft('dimple', 8, 5, 0) + rfQDft('dimple', 5, 8, 270) + rfQDft('dimple', 2, 5, 180) + rfQDft('dimple', 5, 2, 90)), 'dimple');
      var a = rfQDsig(rfQDft('louver', 8, 5, 90) + cp);
      rfQDsame(a, rfQDsig(rfQDft('louver', 8, 5, 90) + rfQDft('louver', 5, 8, 0) + rfQDft('louver', 2, 5, 270) + rfQDft('louver', 5, 2, 180)), 'louver');
      return 'louver ' + a.nl + ' loops';
    });

    test('rfQD: QD2, Mirror of a louver (angle 90 at x 3) about x = 5: the mirrored louver opens the mirrored way (= a louver at x 7, angle 270, not angle 90)', function () {
      var a = rfQDsig(rfQDft('louver', 3, 5, 90) + 'p.mirror("Right", { offset: 5 });\n');
      rfQDsame(a, rfQDsig(rfQDft('louver', 3, 5, 90) + rfQDft('louver', 7, 5, 270)), 'mirror');
      assert(a.loops !== rfQDsig(rfQDft('louver', 3, 5, 90) + rfQDft('louver', 7, 5, 90)).loops, 'not the same louver moved');
      return a.nl + ' loops';
    });

    test('rfQD: job 4a, a 4 x 3 bracket with two 1.5 flanges and two holes written to STEP, read back as a dumb solid, Insert Bends with the base picked: blank 4 - 2(R + T) + 2(1.5 - R - T) + 2 BA; K .5: + 2 x A T (.06); the right flange 0.5 longer by a Tab: + .5; a hole: one more loop', function () {
      var src = build('p.units("in");\np.sheet(' + T + ', ' + R + ', ' + KF + ');\np.sketch("Top").rect(0, -3, 4, 3).end().baseFlange();\n' +
        'p.flange(1.5, [[0, ' + T + ', 1.5], [4, ' + T + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.sketch("Top").circle(2, -1.5, 0.25).circle(1, -1.5, 0.125).end().cut("through", { both: true });\n');
      noErrors(src);
      var imp = Exchange.importFile('customer.step', Exchange.exportSTEP(src.model, src.build, {}), { units: 'in' }), m = Exchange.newPartFromImport(imp);
      new K.Builder(m).insertBends([2, 0, 1.5], { kFactor: KF, radius: R, thickness: T });
      function flat() { var b = K.rebuild(m), me = K.meshFromBody(b.body); assert(!Object.keys(b.errors).length, JSON.stringify(b.errors)); assert(K.meshQuality(me).openEdges === 0, 'closed'); return K.flatPattern(m, b, me); }
      var base = 4 - 2 * (R + T) + 2 * (1.5 - R - T), fl = flat(), notes = [];
      near(rfQDlong(fl), base + 2 * rfQDba(90), 1e-6, 'K .44'); assert(fl.loops.length === 3, 'two holes');
      notes.push(rfQDlong(fl).toFixed(6));
      m.sheet.kFactor = 0.5; fl = flat();
      near(rfQDlong(fl), base + 2 * Math.PI / 2 * (R + 0.5 * T), 1e-6, 'K .5'); notes.push(rfQDlong(fl).toFixed(6));
      m.sheet.kFactor = KF;
      new K.Builder(m).sketch({ custom: true, origin: [4, 0, 0], x: [0, 0, -1], y: [0, 1, 0], n: [1, 0, 0] }, 0).rect(-3, 1.4, 3, 0.6).end().tab();
      fl = flat(); near(rfQDlong(fl), base + 2 * rfQDba(90) + 0.5, 1e-6, 'flange + .5 by a Tab'); notes.push(rfQDlong(fl).toFixed(6));
      new K.Builder(m).sketch('Top').circle(3, -1, 0.1875).end().cut('through', { both: true });
      fl = flat(); assert(fl.loops.length === 4, 'the new hole in the flat: ' + fl.loops.length);
      return notes.join(' -> ');
    });

    test('rfQD: job 4b, a DXF flat 6.8 x 3 with a duplicate edge, a .002 gap and two BEND-layer lines: check finds the duplicate and the gap, repair (tol .003) leaves 4 lines with no problem; Base Flange; one Sketched Bend on the two bend lines (centreline): the folded part closed, its flat 6.8 x 3 with its bend lines at x 1.4 and 5.4', function () {
      var W = 6.8, L = 3, o = ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
      function line(layer, a, b) { o.push('0', 'LINE', '8', layer, '10', String(a[0]), '20', String(a[1]), '30', '0', '11', String(b[0]), '21', String(b[1]), '31', '0'); }
      line('OUTLINE', [0, 0], [W, 0]); line('OUTLINE', [W, 0], [W, L]); line('OUTLINE', [W, L], [0, L]); line('OUTLINE', [W, L], [0, L]); line('OUTLINE', [0, L], [0, 0.002]);
      line('BEND', [1.4, 0], [1.4, L]); line('BEND', [5.4, 0], [5.4, L]);
      o.push('0', 'ENDSEC', '0', 'EOF');
      var p = DxfImport.parse(o.join('\n') + '\n'), out = p.entities.filter(function (e) { return e.layer !== 'BEND'; }), bends = p.entities.filter(function (e) { return e.layer === 'BEND'; });
      var iss = DxfImport.check(out, 0.003), kinds = iss.map(function (i) { return i.kind || i.type; });
      assert(kinds.indexOf('duplicate') >= 0 && kinds.indexOf('gap') >= 0, 'check: ' + iss.summary);
      var rep = DxfImport.repair(out, { tol: 0.003, gaps: true, merge: true, join: true, tiny: true });
      assert(rep.entities.length === 4 && !DxfImport.check(rep.entities, 0.003).length, 'repaired: ' + rep.entities.length);
      var m = K.newModel('P'), b = new K.Builder(m);
      b.sheet(T, R, KF);
      var s = b.sketch('Top');
      rep.entities.forEach(function (e) { s.line(e.x1, e.y1, e.x2, e.y2); });
      s.end().baseFlange();
      var s2 = b.sketch('Top', T);
      bends.forEach(function (e) { s2.line(e.x1, e.y1, e.x2, e.y2); });
      s2.end();
      b.sketchedBend(90, { position: 'centerline', fixed: [3.4, T, -1.5] });
      var r = K.rebuild(m), me = K.meshFromBody(r.body);
      assert(!Object.keys(r.errors).length && K.meshQuality(me).openEdges === 0, 'built, closed: ' + JSON.stringify(r.errors));
      var fl = K.flatPattern(m, r, me);
      near(rfQDlong(fl), W, 1e-9, 'blank length = the DXF'); near(Math.min(fl.size[0], fl.size[1]), L, 1e-9, 'blank width');
      assert(fl.bends.length === 2, 'two bends');
      var xs = fl.bends.map(function (bb) { return (bb.a[0] + bb.b[0]) / 2; }).sort(function (u, v) { return u - v; });
      near(xs[0], 1.4, 1e-6, 'bend line 1'); near(xs[1], 5.4, 1e-6, 'bend line 2');
      return iss.summary + '; flat ' + fl.size.join(' x ') + ', bend lines ' + xs.join(', ');
    });
  })();
