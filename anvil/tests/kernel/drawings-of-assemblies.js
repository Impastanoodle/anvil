  // ------------------------------------------------------------------ drawings of assemblies (run cloud-2026-09-25h)
  // The Design Library assemblies drawn from their solved component meshes: Bill of Materials, Standard 3 View extents,
  // hidden lines across components (independent ray casts), Auto Balloon, and section hatching per component.
  group('assembly drawings');
  if (!DW || typeof Assembly === 'undefined') test('drawing.js and assembly.js load', function () { fail('Drawing or Assembly is not defined'); });
  else (function () {
    function asmExample(name) { return AnvilExamples.filter(function (e) { return e.name === name; })[0]; }
    function asmDrawing(name, opts) {
      var r = buildAsm(asmExample(name).code);
      assert(!Object.keys(r.errors).length, name + ' errors ' + JSON.stringify(r.errors));
      var doc = DW.newDrawing(r.model, Object.assign({ date: '2026-09-26' }, opts || {}));
      DW.standard3View(doc, r.mesh, r.model.units);
      r.doc = doc; r.sheet = DW.compute(doc, r.mesh, r.model);
      r.view = function (orient) { return r.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; };
      r.recompute = function () { r.sheet = DW.compute(r.doc, r.mesh, r.model); return r.sheet; };
      return r;
    }
    function ext(w) { var b = w.proj.bounds; return [b.umax - b.umin, b.vmax - b.vmin]; }
    function overlap(a, b) { return a.x1 > b.x0 && a.x0 < b.x1 && a.y1 > b.y0 && a.y0 < b.y1; }
    // the drawing checks below are pinned to the first three Design Library assemblies (later ones, e.g. Gear train and
    // patterns, are covered by their own BOM test); every one of them must still exist
    var ASMS = ['Pinned plate assembly', 'Distance and angle mates', 'Interference check'].filter(function (n) { return AnvilExamples.some(function (e) { return e.name === n && isAsmExample(e); }); });
    var BOMS = {
      'Pinned plate assembly': [['Plate', 'Plate with bolt holes', 1, 'Plate<1>'], ['Pin', '8 x 20 x 8', 2, 'Pin<1>,Pin<2>'], ['Cap', '30 x 5 x 20', 1, 'Cap<1>']],
      'Distance and angle mates': [['Base', '100 x 10 x 60', 1, 'Base<1>'], ['Block', '20 x 20 x 20', 1, 'Block<1>'], ['Bar', '40 x 4 x 10', 1, 'Bar<1>']],
      'Interference check': [['Base', '60 x 10 x 40', 1, 'Base<1>'], ['Block', '20 x 20 x 20', 1, 'Block<1>'], ['Pin', '8 x 20 x 8', 2, 'Pin<1>,Pin<2>']]
    };
    test('Bill of Materials of every Design Library assembly: identical components (same source) on one row, QTY = instances, items in insertion order, part size as description', function () {
      assert(ASMS.length === 3, 'assembly examples ' + ASMS.join(', '));
      ASMS.forEach(function (name) {
        var r = buildAsm(asmExample(name).code), rows = DW.bomRows(r.model, r.mesh), want = BOMS[name];
        assert(rows.length === want.length, name + ' rows ' + rows.length);
        rows.forEach(function (row, i) {
          var names = row.components.map(function (id) { return Assembly.findComponent(r.model, id).name; }).join(',');
          assert(row.item === i + 1 && row.partNumber === want[i][0] && row.description === want[i][1] && row.qty === want[i][2] && names === want[i][3],
            name + ' row ' + (i + 1) + ': ' + JSON.stringify([row.item, row.partNumber, row.description, row.qty, names]));
        });
        assert(rows.reduce(function (a, x) { return a + x.qty; }, 0) === r.model.components.length, name + ' QTY total');
      });
      assert(DW.bomRows(build('p.box(1, 1, 1);').model).length === 0, 'a part has no BOM');
      return ASMS.map(function (n) { return n.split(' ')[0] + ' ' + BOMS[n].map(function (x) { return x[0] + ' x' + x[2]; }).join(' / '); }).join('; ');
    });
    test('Standard 3 View of each assembly: Front / Top / Right extents are the solved assembly bounding box (Distance and angle: bar turned 30 deg reaches x = -5); BOM top-right, clear of every view', function () {
      var want = { 'Pinned plate assembly': [100, 20, 60], 'Distance and angle mates': [105, 45, 70], 'Interference check': [60, 30, 40] }, out = [];
      ASMS.forEach(function (name) {
        var r = asmDrawing(name), bb = r.mp.bbox, W = want[name];
        near(bb.min[0], name === 'Distance and angle mates' ? -5 : 0, 1e-9, name + ' xmin');
        [['Front', W[0], W[1]], ['Top', W[0], W[2]], ['Right', W[2], W[1]]].forEach(function (c) {
          var e = ext(r.view(c[0]));
          near(e[0], c[1], 1e-9, name + ' ' + c[0] + ' width'); near(e[1], c[2], 1e-9, name + ' ' + c[0] + ' height');
        });
        near(bb.max[0] - bb.min[0], W[0], 1e-9, 'bbox x'); near(bb.max[1] - bb.min[1], W[1], 1e-9, 'bbox y'); near(bb.max[2] - bb.min[2], W[2], 1e-9, 'bbox z');
        var B = r.sheet.bom.box, cols = DW.BOM_COLS.reduce(function (a, c) { return a + c[1]; }, 0);
        near(B.x1, 410, 1e-9, 'BOM right edge on the border'); near(B.y1, 287, 1e-9, 'BOM top on the border');
        near(B.x1 - B.x0, cols, 1e-9, 'BOM width'); near(B.y1 - B.y0, 7 * (r.sheet.bom.rows.length + 1), 1e-9, 'BOM height');
        r.sheet.views.forEach(function (w) { assert(!overlap(w.box, B), name + ': ' + w.view.orient + ' covers the BOM'); });
        assert(r.doc.autoDims === false, 'assembly drawings start without model dimensions');
        out.push(name.split(' ')[0] + ' ' + DW.scaleText(r.doc.sheet.scale));
      });
      return out.join(', ');
    });
    test('BOM anchors: bottom-right sits on the title block, bottom-left / top-left on the border; Standard 3 View keeps every view off the table for every anchor', function () {
      ASMS.forEach(function (name) {
        DW.BOM_ANCHORS.forEach(function (a) {
          var r = asmDrawing(name, { bomAnchor: a }), B = r.sheet.bom.box;
          if (a === 'bottom-right') { near(B.y0, 50, 1e-9, 'above the title block'); near(B.x1, 410, 1e-9); }
          if (a === 'bottom-left') { near(B.y0, 10, 1e-9); near(B.x0, 10, 1e-9); }
          if (a === 'top-left') { near(B.y1, 287, 1e-9); near(B.x0, 10, 1e-9); }
          r.sheet.views.forEach(function (w) { assert(!overlap(w.box, B), name + ' ' + a + ': ' + w.view.orient + ' covers the BOM'); });
        });
      });
      var r2 = asmDrawing('Pinned plate assembly', { bom: false });
      assert(r2.sheet.bom === null && !r2.sheet.prims.some(function (q) { return q.layer === 'BOM'; }), 'bom: false');
      return DW.BOM_ANCHORS.join(', ');
    });
    test('hidden lines across components: Pinned plate Top view shows the hole under the cap hidden and the pins / open hole visible; no facet lines of a pin inside its hole; ray casts confirm every drawn piece in Front / Top / Right', function () {
      var r = asmDrawing('Pinned plate assembly'), T = r.view('Top').proj, F = r.view('Front').proj;
      function at(list, u, v) { return list.filter(function (c) { return Math.hypot(c.c[0] - u, c.c[1] - v) < 1e-6 && Math.abs(c.r - 4) < 1e-6; }).length; }
      assert(at(T.circles.visible, 10, -10) && at(T.circles.visible, 90, -10) && at(T.circles.visible, 90, -50) && !at(T.circles.visible, 10, -50), 'visible circles ' + JSON.stringify(T.circles.visible));
      assert(at(T.circles.hidden, 10, -50), 'the hole under the cap is hidden');
      // pin 1 (x 6..14) seen from the front: only its two sides, hidden where the plate or the cap is in front of it
      var inside = F.lines.visible.concat(F.lines.hidden).filter(function (l) { return Math.abs(l[0] - l[2]) < 1e-9 && l[0] > 6 + 1e-6 && l[0] < 14 - 1e-6; });
      assert(!inside.length, 'facet lines inside pin 1: ' + segsStr(inside));
      assert(hasLine(F.lines.hidden, [6, 0, 6, 13]) && hasLine(F.lines.visible, [6, 13, 6, 20]), 'pin 1 side: hidden 0..13 behind plate and cap, visible 13..20');
      var n = 0, bad = [];
      ['Front', 'Top', 'Right'].forEach(function (o) { var c = checkRays(r, o); n += c.n; bad = bad.concat(c.bad); });
      assert(!bad.length, bad.slice(0, 5).join('; '));
      var r2 = asmDrawing('Distance and angle mates'), n2 = 0;
      ['Front', 'Top', 'Right'].forEach(function (o) { var c = checkRays(r2, o); n2 += c.n; bad = bad.concat(c.bad); });
      assert(!bad.length, bad.slice(0, 5).join('; '));
      return (n + n2) + ' ray casts';
    });
    test('Auto Balloon on the isometric: one balloon per BOM item, number = item, leader ends on a visible edge of that component, balloons outside the view and apart; per-instance balloons with ignoreMultiple false', function () {
      var out = [];
      ASMS.forEach(function (name) {
        var r = asmDrawing(name), iso = r.doc.views.filter(function (v) { return v.role === 'iso'; })[0];
        DW.autoBalloon(r.doc, r.model, iso.id);
        var sh = r.recompute(), w = sh.views.filter(function (x) { return x.view.id === iso.id; })[0], rows = sh.bom.rows, B = sh.balloons;
        assert(B.length === rows.length, name + ' balloons ' + B.length);
        B.forEach(function (b) {
          var row = rows.filter(function (x) { return x.key === b.key; })[0];
          assert(row && row.item === b.item && row.components.indexOf(b.component) >= 0, name + ' balloon ' + b.item);
          // the attach point is on a visible line or circle of that row's component(s)
          var m = w.fromSheet(b.attach), on = w.proj.lines.visible.some(function (l) {
            if (row.indices.indexOf(l[4]) < 0) return false;
            var dx = l[2] - l[0], dy = l[3] - l[1], L = dx * dx + dy * dy, t = ((m[0] - l[0]) * dx + (m[1] - l[1]) * dy) / L;
            return t >= -1e-9 && t <= 1 + 1e-9 && Math.hypot(l[0] + t * dx - m[0], l[1] + t * dy - m[1]) < 1e-6;
          }) || w.proj.circles.visible.some(function (c) { return row.indices.indexOf(c.body) >= 0 && Math.abs(Math.hypot(m[0] - c.c[0], m[1] - c.c[1]) - c.r) < 1e-6; })
            // true curves: an isometric draws round edges as exact ellipses c + cos t ax + sin t ay, so the farthest
            // visible edge may be one; on it when (cos t, sin t) solved from [ax ay] has length 1 and t is in [t0, t1]
            || (w.proj.ellipses ? w.proj.ellipses.visible : []).some(function (el) {
              if (row.indices.indexOf(el.body) < 0) return false;
              var det = el.ax[0] * el.ay[1] - el.ax[1] * el.ay[0], x = m[0] - el.c[0], y = m[1] - el.c[1];
              var cs = (x * el.ay[1] - y * el.ay[0]) / det, sn = (el.ax[0] * y - el.ax[1] * x) / det, t = Math.atan2(sn, cs);
              return Math.abs(Math.hypot(cs, sn) - 1) < 1e-6 && [-1, 0, 1].some(function (j) { return t + 2 * Math.PI * j >= el.t0 - 1e-9 && t + 2 * Math.PI * j <= el.t1 + 1e-9; });
            });
          assert(on, name + ' balloon ' + b.item + ' attach point not on its component');
          assert(b.c[0] < w.box.x0 || b.c[0] > w.box.x1 || b.c[1] < w.box.y0 || b.c[1] > w.box.y1, 'balloon inside the view');
          var txt = sh.prims.filter(function (q) { return q.layer === 'BALLOONS' && q.k === 'text' && Math.hypot(q.p[0] - b.c[0], q.p[1] - (b.c[1] - 1.25)) < 1e-9; });
          assert(txt.length === 1 && txt[0].text === String(b.item), 'balloon text');
        });
        for (var i = 0; i < B.length; i++) for (var j = i + 1; j < B.length; j++) assert(Math.hypot(B[i].c[0] - B[j].c[0], B[i].c[1] - B[j].c[1]) >= 2 * B[i].r - 1e-9, name + ' balloons overlap');
        assert(sh.prims.filter(function (q) { return q.layer === 'BALLOONS' && q.k === 'circle'; }).length === B.length, 'circles');
        out.push(name.split(' ')[0] + ' ' + B.length);
      });
      var r = asmDrawing('Pinned plate assembly'), iso2 = r.doc.views.filter(function (v) { return v.role === 'iso'; })[0];
      DW.autoBalloon(r.doc, r.model, iso2.id, { ignoreMultiple: false });
      var items = r.recompute().balloons.map(function (b) { return b.item; }).sort().join(',');
      assert(items === '1,2,2,3', 'per instance ' + items);
      var fr = r.doc.views.filter(function (v) { return v.role === 'front'; })[0];
      DW.autoBalloon(r.doc, r.model, fr.id);
      assert(r.recompute().balloons.filter(function (b) { return b.view === fr.id; }).length === 3, 'Front view balloons');
      return out.join(', ') + '; per instance ' + items;
    });
    test('balloons follow the BOM: removing the plate renumbers Pin 1 / Cap 2 and drops its balloon; a new pin raises QTY without a new balloon', function () {
      var r = asmDrawing('Pinned plate assembly'), iso = r.doc.views.filter(function (v) { return v.role === 'iso'; })[0];
      DW.autoBalloon(r.doc, r.model, iso.id);
      Assembly.removeComponent(r.model, Assembly.findComponent(r.model, 'Plate<1>').id);
      var b = Assembly.rebuild(r.model); r.mesh = K.meshFromBody(b.body);
      var sh = r.recompute(), got = sh.balloons.map(function (x) { return x.item + ':' + Assembly.findComponent(r.model, x.component).name; }).sort().join(' ');
      assert(sh.bom.rows.map(function (x) { return x.partNumber + x.qty; }).join(' ') === 'Pin2 Cap1', 'BOM ' + JSON.stringify(sh.bom.rows));
      assert(got === '1:Pin<1> 2:Cap<1>', 'balloons ' + got);
      Assembly.insert(r.model, { script: 'p.name("Pin"); p.cylinder(4, 20);' }, { position: [200, 0, 0] });
      b = Assembly.rebuild(r.model); r.mesh = K.meshFromBody(b.body); sh = r.recompute();
      assert(sh.bom.rows[0].qty === 3 && sh.balloons.length === 2, 'QTY 3, still 2 balloons');
      return got;
    });
    test('Section View of the Pinned plate through the pins (Top, z = 10): one cap per component, areas 672 + 2 x 160, each component hatched at its own angle and only inside its own cut face', function () {
      var r = asmDrawing('Pinned plate assembly'), top = r.doc.views.filter(function (v) { return v.role === 'top'; })[0];
      var sv = DW.addSectionView(r.doc, r.mesh, top.id, { axis: 'h', at: -10, sign: 1 });
      var sh = r.recompute(), w = sh.views.filter(function (x) { return x.view.id === sv.id; })[0], S = w.section;
      assert(S.caps.length === 3, 'caps ' + S.caps.length);
      var byBody = {};
      S.caps.forEach(function (fi) { byBody[S.mesh.faces[fi].body] = S.mesh.faces[fi].area; });
      near(byBody[0], 100 * 8 - 2 * 8 * 8, 1e-9, 'plate cap (cut through two hole centres, 16-gon width 8)');
      near(byBody[1], 8 * 20, 1e-9, 'Pin<1> cap'); near(byBody[2], 8 * 20, 1e-9, 'Pin<2> cap');
      near(byBody[0] + (byBody[1] + byBody[2]) * 8 / 20, 800, 1e-9, 'pins fill the plate holes');
      // (r11/hatch11: both pins touch the plate, so the second one is 135° wider apart, not 30° beside the plate's 45°)
      var want = { 0: 45, 1: 135, 2: 135 }, wantSp = { 0: 1, 1: 1, 2: 1.6 };
      assert(w.hatches.length === 3, 'hatches ' + JSON.stringify(w.hatches));
      w.hatches.forEach(function (h) { assert(h.angle === want[h.body] && Math.abs(h.spacing / 2.5 - wantSp[h.body]) < 1e-9, 'body ' + h.body + ' angle ' + h.angle + ' spacing ' + h.spacing); });
      // every hatch line: its angle is its component's, and its midpoint lies inside that component's cap (even-odd)
      var loops = {};
      S.caps.forEach(function (fi) {
        var o = K.faceOutline(S.mesh, fi), F = w.frame;
        loops[S.mesh.faces[fi].body] = o.loops.map(function (l) { return l.map(function (p2) { var q = K.to3D(o.plane, p2[0], p2[1]); return w.toSheet([V.dot(q, F.u), V.dot(q, F.v)]); }); });
      });
      function inside(pt, ls) {
        var c = false;
        ls.forEach(function (l) { for (var i = 0, j = l.length - 1; i < l.length; j = i++) if ((l[i][1] > pt[1]) !== (l[j][1] > pt[1]) && pt[0] < (l[j][0] - l[i][0]) * (pt[1] - l[i][1]) / (l[j][1] - l[i][1]) + l[i][0]) c = !c; });
        return c;
      }
      var lines = sh.prims.filter(function (q) { return q.layer === w.layer && q.style === 'hatch'; }), len = {};
      assert(lines.length === w.hatch && lines.length > 30, 'hatch lines ' + lines.length);
      lines.forEach(function (q) {
        var ang = Math.atan2(q.b[1] - q.a[1], q.b[0] - q.a[0]) * 180 / Math.PI; ang = (ang + 360) % 180;
        assert(Math.abs(ang - want[q.body]) < 1e-6, 'hatch of body ' + q.body + ' at ' + ang);
        assert(inside([(q.a[0] + q.b[0]) / 2, (q.a[1] + q.b[1]) / 2], loops[q.body]), 'hatch of body ' + q.body + ' outside its cut face');
        len[q.body] = (len[q.body] || 0) + Math.hypot(q.b[0] - q.a[0], q.b[1] - q.a[1]);
      });
      var s2 = Math.pow(DW.scaleValue(r.doc.sheet.scale), 2);
      [0, 1, 2].forEach(function (bi) { nearRel(len[bi] * 2.5 * wantSp[bi], byBody[bi] * s2, 0.06, 'hatched length x spacing = cut area, body ' + bi); });
      // hatch styles: 12 components -> 12 distinct (angle, spacing) pairs
      var seen = {};
      for (var bi = 0; bi < 12; bi++) { var hs = DW.hatchStyle(bi); seen[hs.angle + '/' + hs.spacing] = 1; }
      assert(Object.keys(seen).length === 12, 'distinct hatch styles');
      return lines.length + ' hatch lines: ' + w.hatches.map(function (h) { return h.angle + '° x' + h.lines; }).join(', ');
    });
    test('exports of an assembly drawing: SVG BOM / BALLOONS layers, DXF BOM text cells and balloon circles, PDF BOM text', function () {
      var r = asmDrawing('Pinned plate assembly'), iso = r.doc.views.filter(function (v) { return v.role === 'iso'; })[0];
      DW.autoBalloon(r.doc, r.model, iso.id);
      var sh = r.recompute(), svg = DW.toSVG(sh), dxf = DW.toDXF(sh), pdf = DW.toPDF(sh);
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml');
      assert(d.querySelectorAll('g[data-layer="BOM"] text').length === 16 && d.querySelectorAll('g[data-layer="BALLOONS"] circle').length === 3, 'SVG BOM texts / balloon circles');
      assert(/>PINNED PLATE</.test(svg) && />Plate with bolt holes</.test(svg), 'SVG title and description');
      var ents = [], L = dxf.split('\n');
      for (var i = 0; i + 1 < L.length; i += 2) if (L[i] === '0') ents.push({ type: L[i + 1], layer: L[i + 3] === undefined ? '' : L[i + 3] });
      var bomText = 0, bomLine = 0, bal = 0;
      for (var j = 0; j + 3 < L.length; j += 2) if (L[j] === '0' && L[j + 2] === '8') { if (L[j + 3] === 'BOM') { if (L[j + 1] === 'TEXT') bomText++; if (L[j + 1] === 'LINE') bomLine++; } if (L[j + 3] === 'BALLOONS' && L[j + 1] === 'CIRCLE') bal++; }
      assert(bomText === 16 && bomLine === 4 + 3 + 3 && bal === 3, 'DXF BOM texts ' + bomText + ', lines ' + bomLine + ', balloons ' + bal);
      assert(/\(ITEM NO\.\) Tj/.test(pdf) && /\(DESCRIPTION\) Tj/.test(pdf) && /\(Plate with bolt holes\) Tj/.test(pdf) && /\(30 x 5 x 20\) Tj/.test(pdf), 'PDF BOM text');
      return bomText + ' BOM cells, ' + bal + ' balloons';
    });
  })();

