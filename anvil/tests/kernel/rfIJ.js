  // --- rfIJ (2026-11-05, lane drawfix): joined edges meet exactly in the DXF, sections placed by default land on the
  // sheet, SolidWorks' scale texts, exact arcs / circles for tangent edges and round silhouettes ---
  (function () {
    group('rfIJ: isometric ends meet in the DXF, default section placement inside the border, scale texts, exact tangent arcs');
    var DW = Drawing;
    var IJ_BRACKET = 'p.name("Bracket").units("in");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[0, 0.0598, 1.5]]);\np.flange(2, [[6, 0.0598, 1.5]], { reverse: true });\n' +
      'p.hole("Top", 1.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -0.75, 0.281, { offset: 0.0598 });\n' +
      'p.hole("Top", 1.5, -2.25, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -2.25, 0.281, { offset: 0.0598 });\np.hole("Top", 3, -1.5, 0.5, { offset: 0.0598 });';
    var IJ_BOX = 'p.name("Box").units("mm");\np.box(100, 60, 30);\np.hole("Top", 20, -15, 10, { offset: 30 });\np.hole("Top", 80, -45, 12, { offset: 30 });\np.hole("Front", 50, 15, 8, { offset: 60 });';
    var IJ_BOSS = 'p.name("Boss").units("mm");\np.sketch("Front").rect(-40, -30, 80, 60).extrude(10);\np.sketch("Front", 10).circle(0, 0, 15).extrude(20);\np.fillet(3, [[15, 0, 10]]);\np.fillet(2, [[15, 0, 30]]);';
    function ijDrawing(code, opts) {
      var r = build(code); noErrors(r);
      var doc = DW.newDrawing(r.model, Object.assign({ date: '2026-11-05', projection: 'third' }, opts || {}));
      DW.standard3View(doc, r.mesh, r.model.units === 'in' ? 'in' : 'mm');
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model);
      return r;
    }
    // the entities of a DXF: [{ t, g: { code: first value } }]
    function ijEntities(dxf) {
      var L = dxf.split(/\r?\n/), out = [], cur = null;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1].trim();
        if (c === '0') { cur = { t: v, g: {}, pts: [] }; out.push(cur); }
        else if (cur) { if (!(c in cur.g)) cur.g[c] = v; if (cur.t === 'VERTEX' && c === '20') cur.pts.push([+cur.g['10'], +v]); }
      }
      return out;
    }
    // the end points of one layer's LINE / ARC / ELLIPSE / open POLYLINE entities: [{ p, id }]
    function ijDxfEnds(ents, layer) {
      var E = [], poly = null;
      ents.forEach(function (e, i) {
        var g = e.g;
        if (e.t === 'SEQEND') { if (poly && poly.v.length > 1 && !poly.closed) { E.push({ p: poly.v[0], id: poly.id }); E.push({ p: poly.v[poly.v.length - 1], id: poly.id }); } poly = null; return; }
        if (e.t === 'VERTEX') { if (poly) poly.v.push([+g['10'], +g['20']]); return; }
        if (g['8'] !== layer) return;
        if (e.t === 'POLYLINE') { poly = { id: i, v: [], closed: (+g['70'] & 1) === 1 }; return; }
        if (e.t === 'LINE') { E.push({ p: [+g['10'], +g['20']], id: i }); E.push({ p: [+g['11'], +g['21']], id: i }); }
        if (e.t === 'ARC') { var R = +g['40'], a0 = +g['50'] * Math.PI / 180, a1 = +g['51'] * Math.PI / 180; E.push({ p: [+g['10'] + R * Math.cos(a0), +g['20'] + R * Math.sin(a0)], id: i }); E.push({ p: [+g['10'] + R * Math.cos(a1), +g['20'] + R * Math.sin(a1)], id: i }); }
        if (e.t === 'ELLIPSE' && Math.abs(+g['42'] - +g['41'] - 2 * Math.PI) > 1e-9) {
          var M = [+g['11'], +g['21']], q = +g['40'], N = [-M[1] * q, M[0] * q];
          [+g['41'], +g['42']].forEach(function (t) { E.push({ p: [+g['10'] + Math.cos(t) * M[0] + Math.sin(t) * N[0], +g['20'] + Math.cos(t) * M[1] + Math.sin(t) * N[1]], id: i }); });
        }
      });
      return E;
    }
    // ends that come close to another entity's end without meeting it (1e-6 < d < 0.05 paper units)
    function ijGaps(E) {
      var out = [];
      E.forEach(function (a) {
        var best = Infinity;
        E.forEach(function (b) { if (b.id !== a.id) best = Math.min(best, Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1])); });
        if (best > 1e-6 && best < 0.05) out.push(+best.toExponential(2));
      });
      return out;
    }
    [['bent inch bracket', IJ_BRACKET], ['box with holes (mm)', IJ_BOX]].forEach(function (c) {
      test('rfIJ: ' + c[0] + ', isometric view: every visible edge end meets the next exactly in the DXF (R2000 and R12, within 1e-6)', function () {
        var r = ijDrawing(c[1]), n = 0;
        ['R2000', 'R12'].forEach(function (ver) {
          var E = ijDxfEnds(ijEntities(DW.toDXF(r.sheet, { version: ver })), 'ISOMETRIC'), g = ijGaps(E);
          assert(E.length >= 16, ver + ': ' + E.length + ' ends on the ISOMETRIC layer');
          assert(!g.length, ver + ': ' + g.length + ' ends miss their neighbour by ' + g.slice(0, 6).join(', '));
          n += E.length;
        });
        return n + ' ends, 0 gaps';
      });
    });
    test('rfIJ: Handlebar isometric (swept tube): line ends a few millionths apart (over 1e-6) are welded into one point', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Handlebar'; })[0], r = build(ex.code), pr = DW.projectView(r.mesh, 'Isometric', { display: 'hlr' });
      var E = [], bad = 0;
      pr.lines.visible.forEach(function (l, i) { E.push({ p: [l[0], l[1]], id: i }); E.push({ p: [l[2], l[3]], id: i }); });
      E.forEach(function (a) { E.forEach(function (b) { if (b.id !== a.id) { var d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]); if (d > 1e-6 && d < 1e-4) bad++; } }); });
      assert(bad === 0, bad + ' line ends under 0.0001 mm from another without being the same point');
      return E.length + ' line ends';
    });
    test('rfIJ: a section view added by the script API (anvil.drawing.sectionView: fit) with no position on a full ANSI A sheet lands inside the border, clear of the title block (and the blocks left of it) and every view (h / v, both sides, inch and mm parts)', function () {
      var parts = [
        'p.name("Plate").units("in");\np.box(10, 6, 0.5);\np.hole("Top", 2, -2, 0.5, { offset: 0.5 });',
        IJ_BRACKET,
        'p.name("Box").units("mm");\np.box(100, 60, 30);\np.hole("Top", 20, -15, 10, { offset: 30 });'
      ], out = [];
      parts.forEach(function (code) {
        var r = build(code); noErrors(r);
        var units = r.model.units === 'in' ? 'in' : 'mm', bd = DW.projectView(r.mesh, 'Front', {}).bounds;
        [['h', 1], ['h', -1], ['v', 1], ['v', -1]].forEach(function (cut) {
          var doc = DW.newDrawing(r.model, { format: 'ANSI A', projection: 'third' });
          DW.standard3View(doc, r.mesh, units);
          var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
          var sv = DW.addSectionView(doc, r.mesh, F.id, { axis: cut[0], sign: cut[1], fit: true, at: cut[0] === 'h' ? (bd.vmin + bd.vmax) / 2 : (bd.umin + bd.umax) / 2 });
          var sh = DW.compute(doc, r.mesh, r.model), S = sh.size, k = units === 'in' ? 1 / 25.4 : 1, b1 = 10 * k;
          var w = sh.views.filter(function (x) { return x.view.id === sv.id; })[0], b = w.box, tag = r.model.name + ' ' + cut.join('');
          assert(!sv.offSheet, tag + ': not beside the sheet');
          // the view and its label (SECTION A-A and its scale, under the view)
          var lab = sh.prims.filter(function (p) { return p.k === 'text' && /^(SECTION [A-Z]+-|SCALE d)/.test(p.text) && p.p[0] > b.x0 - 1e-9 && p.p[0] < b.x1 + 1e-9 && p.p[1] < b.y0 + 1e-9; });
          var y0 = Math.min.apply(null, [b.y0].concat(lab.map(function (p) { return p.p[1] - p.h; })));
          assert(b.x0 >= b1 && y0 >= b1 && b.x1 <= S[0] - b1 && b.y1 <= S[1] - b1, tag + ': inside the border ' + JSON.stringify([b.x0, y0, b.x1, b.y1]) + ' of ' + JSON.stringify(S));
          DW.tbRects(S, units).forEach(function (t) { assert(b.x1 <= t.x0 || b.x0 >= t.x1 || b.y1 <= t.y0 || y0 >= t.y1, tag + ": clear of the title block " + JSON.stringify(t) + " view " + JSON.stringify([b.x0, y0, b.x1, b.y1]) + " labels " + JSON.stringify(lab.map(function (p) { return [p.text, p.p]; }))); });
          sh.views.forEach(function (o) { if (o !== w) assert(b.x1 <= o.box.x0 || b.x0 >= o.box.x1 || b.y1 <= o.box.y0 || b.y0 >= o.box.y1, tag + ': over ' + o.view.name); });
          out.push(tag + (sv.align ? '' : '*') + (sv.scale && DW.scaleValue(sv.scale) !== DW.scaleValue(F.scale || doc.sheet.scale) ? ' ' + DW.scaleText(sv.scale) : ''));
        });
      });
      return out.join(', ');
    });
    test('rfIJ: a given position is kept; without fit (the engine default) a section stays aligned at its parent\'s scale', function () {
      var r = build('p.name("Plate").units("in");\np.box(10, 6, 0.5);'), doc = DW.newDrawing(r.model, { format: 'ANSI A', projection: 'third' });
      DW.standard3View(doc, r.mesh, 'in');
      var F = doc.views.filter(function (v) { return v.orient === 'Front'; })[0];
      var a = DW.addSectionView(doc, r.mesh, F.id, { axis: 'v', at: 5, sign: 1, x: 30 });
      near(a.x, 30, 1e-12, 'x kept'); near(a.y, F.y, 1e-12, 'aligned with Front');
      var c = DW.addSectionView(doc, r.mesh, F.id, { axis: 'v', at: 5, sign: 1 });
      assert(!c.offSheet && c.align === 'y' && c.y === F.y && JSON.stringify(c.scale) === JSON.stringify(F.scale || null), 'no fit: never shrinks, keeps alignment');
    });
    test('rfIJ: scale texts as SolidWorks writes them: SCALE 2 : 1 under detail / section / labelled views, 1:2 in the title block and the scale lists', function () {
      assert(DW.scaleLabel([2, 1]) === 'SCALE 2 : 1' && DW.scaleLabel([1, 2]) === 'SCALE 1 : 2' && DW.scaleLabel([1, 2.5]) === 'SCALE 1 : 2.5', DW.scaleLabel([1, 2]));
      assert(DW.scaleText([1, 2]) === '1:2' && DW.scaleText([2, 1]) === '2:1', DW.scaleText([1, 2]));
      var r = ijDrawing(IJ_BOX, { format: 'ANSI B' }), F = r.doc.views.filter(function (v) { return v.orient === 'Front'; })[0], T = r.doc.views.filter(function (v) { return v.orient === 'Top'; })[0];
      var sc = r.doc.sheet.scale;
      var S = DW.addSectionView(r.doc, r.mesh, F.id, { axis: 'v', at: 50, sign: 1, scale: [sc[0], sc[1] * 2] });
      var Dt = DW.addDetailView(r.doc, r.mesh, T.id, { c: [20, -15], r: 8 });
      var I = r.doc.views.filter(function (v) { return v.orient === "Isometric"; })[0];
      DW.setViewLabel(r.doc, I.id, true);
      var sh = DW.compute(r.doc, r.mesh, r.model), txt = sh.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      var want = ['SECTION ' + S.label + '-' + S.label, DW.scaleLabel(S.scale), 'DETAIL ' + Dt.label, DW.scaleLabel(Dt.scale), 'ISOMETRIC', DW.scaleLabel(sc)];
      want.forEach(function (w) { assert(txt.indexOf(w) >= 0, 'label "' + w + '" in ' + txt.filter(function (t) { return /SCALE|SECTION|DETAIL|ISO/.test(t); }).join(' | ')); });
      assert(/^SCALE \d+ : \d+$/.test(DW.scaleLabel(S.scale)), DW.scaleLabel(S.scale));
      assert(!txt.some(function (t) { return /^SCALE\s*\d+:\d/.test(t) || /^SCALE \d+ :\d|^SCALE \d+: \d/.test(t); }), 'no unspaced view scale');
      var tb = DW.titleBlock(r.doc, r.model);
      assert(tb.scale === DW.scaleText(sc), 'title block SCALE field ' + tb.scale);
      return want.join(' / ') + '; title block ' + tb.scale;
    });
    test('rfIJ: Front view of a cylinder boss with fillets: its round and tangent edges are CIRCLE / ARC entities (no chords); the Top view\'s fillet silhouettes are exact ARCs', function () {
      var r = ijDrawing(IJ_BOSS);
      r.doc.views.forEach(function (v) { v.tangent = 'visible'; });
      var sh = DW.compute(r.doc, r.mesh, r.model);
      ['R2000', 'R12'].forEach(function (ver) {
        var ents = ijEntities(DW.toDXF(sh, { version: ver })), F = ents.filter(function (e) { return e.g['8'] === 'FRONT'; });
        var circ = F.filter(function (e) { return e.t === 'CIRCLE'; }), lines = F.filter(function (e) { return e.t === 'LINE'; });
        assert(circ.length === 3, ver + ': 3 circles (boss Ø30 and the fillets\' tangent edges Ø26 / Ø36), ' + circ.length);
        var rs = circ.map(function (e) { return +e.g['40']; }).sort(function (a, b) { return a - b; }), s = DW.scaleValue(r.doc.sheet.scale);
        [13, 15, 18].forEach(function (R, i) { near(rs[i], R * s, 1e-9, ver + ' radius ' + R); });
        assert(lines.length === 4, ver + ': the plate\'s four edges and no chords: ' + lines.length);
        var T = ents.filter(function (e) { return e.g['8'] === 'TOP' && e.t === 'ARC'; });
        var fil = T.filter(function (e) { return Math.abs(+e.g['40'] - 2 * s) < 1e-9; });
        assert(fil.length === 2, ver + ': the R2 fillet\'s silhouette arcs in the Top view, ' + T.map(function (e) { return e.g['40']; }).join(','));
      });
      var svg = DW.toSVG(sh);
      assert((svg.match(/<circle/g) || []).length >= 3, 'SVG circles');
    });
    test('rfIJ: tangent edges partly hidden in the view are exact ARCs, end to end with the hidden piece', function () {
      var r = build('p.name("Boss2").units("mm");\np.box(100, 80, 10);\np.cylinder(15, 20, { at: [0, 10, 0] });\np.fillet(3, [[15, 10, 0]]);\np.fillet(2, [[15, 30, 0]]);\np.sketch("Front", -5).rect(-50, 40, 100, 5).extrude(10);\np.sketch("Front", -5).rect(-50, 0, 5, 45).extrude(10);');
      noErrors(r);
      var pr = DW.projectView(r.mesh, 'Top', { display: 'hlr', tangent: 'visible' });
      assert(pr.arcs.tangent.length === 2 && pr.arcs.tangent.every(function (a) { return a.exact && Math.abs(a.r - 13) < 1e-9 && Math.hypot(a.c[0], a.c[1]) < 1e-9; }), 'two exact R13 arcs: ' + JSON.stringify(pr.arcs.tangent));
      assert(pr.arcs.visible.length === 2 && pr.arcs.visible.every(function (a) { return Math.abs(a.r - 15) < 1e-9; }), 'the boss rim (R15) in two arcs');
      return pr.arcs.tangent.map(function (a) { return a.a0.toFixed(2) + '..' + a.a1.toFixed(2); }).join(', ');
    });
  })();
