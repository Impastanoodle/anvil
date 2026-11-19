  // --- rfQK (2026-11-19, lane drawdxf): drawing DXF / DWG output: a dimension with Break Lines or a foreshortened
  // radius is a DIMENSION in R2000 (its block holds the cut lines / the zigzag as drawn) ---
  (function () {
    group('rfQK: R2000: a dimension with Break Lines and a foreshortened radius are DIMENSION entities whose blocks draw what the sheet draws');
    if (typeof Drawing === 'undefined') return;
    var DW = Drawing, IN = 25.4, QT = 0.0747;
    // group-code pairs -> entities { type, block (null: ENTITIES), c: { code: [values] } }
    function rfQKEnts(dxf) {
      var t = String(dxf).split(/\r?\n/), P = [], i;
      for (i = 0; i + 1 < t.length; i += 2) P.push([t[i].trim(), t[i + 1]]);
      var out = [], sec = null, blk = null, cur = null;
      P.forEach(function (q) {
        var c = q[0], v = q[1];
        if (c === '0') {
          cur = null;
          if (v === 'SECTION' || v === 'ENDSEC' || v === 'EOF') { sec = v === 'SECTION' ? '?' : null; return; }
          if (sec === 'BLOCKS' && v === 'BLOCK') { blk = '?'; cur = { type: 'BLOCK', c: {} }; return; }
          if (sec === 'BLOCKS' && v === 'ENDBLK') { blk = null; return; }
          if (sec === 'ENTITIES' || (sec === 'BLOCKS' && blk)) { cur = { type: v, block: sec === 'BLOCKS' ? blk : null, c: {} }; out.push(cur); }
          return;
        }
        if (c === '2' && sec === '?') { sec = v; return; }
        if (cur && cur.type === 'BLOCK' && c === '2' && blk === '?') { blk = v; return; }
        if (cur) (cur.c[c] = cur.c[c] || []).push(v);
      });
      return out;
    }
    function rfQKLines(ents, pick) {
      return ents.filter(function (e) { return e.type === 'LINE' && pick(e); }).map(function (e) { return [e.c['10'][0], e.c['20'][0], e.c['11'][0], e.c['21'][0]].join(','); }).sort();
    }
    // every LINE / TEXT / SOLID of the picture (ENTITIES and the dimensions' blocks), as strings
    function rfQKPicture(dxf) {
      var E = rfQKEnts(dxf), dims = {};
      E.forEach(function (e) { if (e.type === 'DIMENSION') dims[e.c['2'][0]] = 1; });
      return E.filter(function (e) { return (e.block === null || dims[e.block]) && { LINE: 1, TEXT: 1, SOLID: 1 }[e.type]; }).map(function (e) {
        var k = ['10', '20', '11', '21', '12', '22', '13', '23', '1'].filter(function (c) { return e.c[c]; }).map(function (c) { return e.c[c][0]; });
        return e.type + ':' + k.join(',');
      }).sort();
    }
    function rfQKCheck(dxf, sh, out) {
      if (typeof DxfCheck !== 'undefined') { var au = DxfCheck.audit(dxf, { units: sh.units === 'mm' ? 'mm' : 'in' }); assert(!au.errors.length, 'audit: ' + au.errors.slice(0, 3).join(' | ')); out.push('audit clean'); }
      if (typeof DWG !== 'undefined') { var bytes = DWG.fromDXF(dxf); assert(bytes && bytes.length > 1000, 'DWG'); out.push('DWG ' + bytes.length + ' bytes'); }
    }
    function rfQKPlate() {
      return build('p.units("in");\nvar s = p.sketch("Top").rect(0, -3, 6, 3);\ns.end().extrude(0.1);\n' +
        'p.sketch("Top", 0.1).circle(1.5, -0.75, 0.14).circle(4.5, -0.75, 0.14).cut("through", { reverse: true });');
    }
    test('Break Lines: the .750 with both extension lines cut .0625 each side of the 3.000 is the second DIMENSION; its block holds the four cut pieces; the picture is the exploded one', function () {
      var r = rfQKPlate(); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      var v = DW.addView(doc, 'Top', { x: 6, y: 5 }), vd = DW.findView(doc, v.id);
      var A = DW.smartDim({ point: [6, 0] }, { point: [6, -3] }, [6.5, -1.5], { lock: 'v', scale: 1 });
      var B = DW.smartDim({ point: [4.5, -0.75] }, { point: [4.5, 0] }, [7.2, -0.4], { lock: 'v', scale: 1 });
      DW.setDimProps(B, { brk: true });
      vd.dims = [A, B];
      var sh = DW.compute(doc, r.mesh, r.model), out = [];
      var cut = sh.prims.filter(function (p) { return p.dimIx === 1 && p.k === 'line' && p.brk; });
      assert(cut.length === 4, 'four cut pieces on the sheet: ' + cut.length);
      var dxf = DW.toDXF(sh, { version: 'R2000' }), E = rfQKEnts(dxf), D = E.filter(function (e) { return e.type === 'DIMENSION'; });
      assert(D.length === sh.dims.length && D.length === 2, 'a DIMENSION per dimension: ' + D.length + ' / ' + sh.dims.length);
      var bn = D[1].c['2'][0];
      assert(+D[1].c['42'][0] === 0.75 && /^\.750$/.test(D[1].c['1'][0]), 'value ' + D[1].c['42'] + ' ' + D[1].c['1']);
      var own = rfQKLines(E, function (e) { return e.block === bn; });
      var want = sh.prims.filter(function (p) { return p.dimIx === 1 && p.k === 'line'; }).length;
      assert(own.length === want && want === 6, 'block ' + bn + ' lines ' + own.length + ' / sheet ' + want);
      var ex = rfQKPicture(DW.toDXF(sh, { version: 'R2000', dimensions: false })), dm = rfQKPicture(dxf);
      assert(ex.length === dm.length && ex.join('|') === dm.join('|'), 'same picture: ' + ex.length + ' / ' + dm.length);
      rfQKCheck(dxf, sh, out);
      return D.length + ' DIMENSIONs, ' + own.length + ' lines in ' + bn + ', ' + out.join(', ');
    });
    test('Foreshortened R22.600 (14 ga bracket, centre 22 in off the view): one radial DIMENSION (70 = 4 | 32 | 128) on the true centre and the arc, value 22.6, its block the zigzag (5 lines) and the arrow', function () {
      var r = build('p.name("DET-BRKT").units("in");\np.sheet(' + QT + ', 0.06, 0.44);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
        'var RA = 22.6, A0 = Math.atan2(22.4, 3) * 180 / Math.PI;\np.sketch("Top", ' + QT + ').arc(3, -25.4, RA, A0, 180 - A0).line(0, -3, 6, -3).cut("through", { reverse: true });\n' +
        'p.flange(1.5, [[6, ' + QT + ', 1.5]], { position: "inside", lengthRef: "outer" });\n' +
        'p.flange(1, [[0, ' + QT + ', 1.5]], { position: "inside", lengthRef: "outer", reverse: true });\n');
      noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19', scale: [1, 1] });
      doc.autoDims = false;
      DW.standard3View(doc, r.mesh, r.model.units);
      var top = doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var d = DW.smartDim({ arc: { c: [3, -25.4], r: 22.6, a0: 82.37, a1: 97.63 } }, null, [4, -2.2], { scale: 1 });
      d.fs = true; top.dims = [d];
      var sh = DW.compute(doc, r.mesh, r.model), w = sh.views.filter(function (x) { return x.view.orient === 'Top'; })[0], out = [];
      var dxf = DW.toDXF(sh, { version: 'R2000' }), E = rfQKEnts(dxf), D = E.filter(function (e) { return e.type === 'DIMENSION'; });
      assert(D.length === 1, 'one DIMENSION: ' + D.length);
      var c = D[0].c, ctr = w.toSheet([3, -25.4]), tip = w.toSheet([3, -2.8]);
      assert(+c['70'][0] === (4 | 32 | 128) && +c['42'][0] === 22.6 && c['1'][0] === 'R22.600', '70 ' + c['70'] + ' 42 ' + c['42'] + ' 1 ' + c['1']);
      assert(Math.abs(+c['10'][0] - ctr[0]) < 1e-4 && Math.abs(+c['20'][0] - ctr[1]) < 1e-4, 'centre ' + c['10'] + ',' + c['20'] + ' want ' + ctr.join(','));
      assert(Math.abs(+c['15'][0] - tip[0]) < 1e-4 && Math.abs(+c['25'][0] - tip[1]) < 1e-4, 'arc point ' + c['15'] + ',' + c['25'] + ' want ' + tip.join(','));
      var bn = c['2'][0], L = rfQKLines(E, function (e) { return e.block === bn; }), S = E.filter(function (e) { return e.block === bn && e.type === 'SOLID'; });
      assert(L.length === 5 && S.length === 1, 'block ' + bn + ': ' + L.length + ' lines, ' + S.length + ' arrow');
      var ex = rfQKPicture(DW.toDXF(sh, { version: 'R2000', dimensions: false })), dm = rfQKPicture(dxf);
      assert(ex.join('|') === dm.join('|'), 'same picture: ' + ex.length + ' / ' + dm.length);
      rfQKCheck(dxf, sh, out);
      return 'block ' + bn + ', ' + out.join(', ');
    });

    group('rfQK: Dual dimensions display: a slot callout carries the dual value after each size, as a hole callout does');
    test('a straight and an arc slot callout with dual on: .375 [9.53] X 1.375 [34.93] SLOT, R1.000 [25.40] ARC SLOT .250 [6.35] WIDE 60°; drawn so and in the R12 / R2000 DXF; the callout\'s own dual off gives the plain text', function () {
      var r = build('p.units("in");\np.sketch("Front").rect(0, 0, 10, 6).slot(2, 3, 3, 3, 0.375).arcSlot(7, 3, 1, 30, 90, 0.25).extrude(0.25);'); noErrors(r);
      var doc = DW.newDrawing(r.model, { date: '2026-11-19' }); DW.standard3View(doc, r.mesh, 'in'); doc.autoDims = false;
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var fv = doc.views.filter(function (v) { return v.orient === 'Front'; })[0], w = sh.views.filter(function (x) { return x.view.id === fv.id; })[0];
      var ss = DW.slotsIn(w.proj)[0], as = DW.arcSlotsIn(w.proj)[0];
      assert(ss && as, 'both slots found');
      DW.addSlotCallout(doc, fv.id, w.proj, { c: ss.ends[0].c, r: ss.ends[0].r });
      DW.addSlotCallout(doc, fv.id, w.proj, { c: as.sides[0].c, r: as.sides[0].r });
      (doc.options || (doc.options = {})).dual = true;
      sh = DW.compute(doc, r.mesh, r.model, { build: r.build });
      var texts = sh.dims.filter(function (d) { return d.view === fv.id; }).map(function (d) { return d.text; });
      var S1 = '.375 [9.53] X 1.375 [34.93] SLOT', S2 = 'R1.000 [25.40] ARC SLOT .250 [6.35] WIDE 60°';
      assert(texts.indexOf(S1) >= 0 && texts.indexOf(S2) >= 0, 'texts ' + texts.join(' | '));
      var drawn = sh.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      assert(drawn.indexOf(S1) >= 0 && drawn.indexOf(S2) >= 0, 'drawn: ' + drawn.filter(function (t) { return /SLOT/.test(t); }).join(' | '));
      ['R12', 'R2000'].forEach(function (v) { var x = DW.toDXF(sh, { version: v }); assert(x.indexOf(S1) >= 0 && x.indexOf('ARC SLOT .250 [6.35] WIDE') >= 0, v + ' DXF'); });
      fv.dims.forEach(function (d) { if (d.slotCallout) d.dual = false; });
      var sh2 = DW.compute(doc, r.mesh, r.model, { build: r.build }), t2 = sh2.dims.filter(function (d) { return d.view === fv.id; }).map(function (d) { return d.text; });
      assert(t2.indexOf('.375 X 1.375 SLOT') >= 0 && t2.indexOf('R1.000 ARC SLOT .250 WIDE 60°') >= 0, 'own dual off: ' + t2.join(' | '));
      return S1 + ' / ' + S2;
    });
  })();
