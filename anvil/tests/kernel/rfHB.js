  // --- rfHB (2026-11-03, lane drawing-look: "clean, sharp and professional") --- the paper side of the drawing look:
  // the line weight hierarchy (visible edges clearly heavier than dimension / extension / centre / hidden lines) and an
  // ANSI title block that reads: captions 2.8 mm type (capitals .08 in), values 3.5 mm, TITLE 6 mm, captions 1.5 mm
  // in from each cell's top-left corner, values centred under their caption, no text touching another or a cell line.
  (function () {
    group('rfHB: line weights and the title block on paper');
    var HB = typeof Drawing !== 'undefined' ? Drawing : null;
    var HB_PART = 'p.name("HBPlate").units("in");\np.box(4, 2, 0.25);\np.hole("Top", 1, -1, 0.25, { offset: 0.25 });';
    function rfHBSheet(units) {
      var r = build(units === 'mm' ? HB_PART.replace('units("in")', 'units("mm")').replace('p.box(4, 2, 0.25)', 'p.box(100, 50, 6)').replace('1, -1, 0.25, { offset: 0.25 }', '25, -25, 6, { offset: 6 }') : HB_PART);
      noErrors(r);
      var doc = HB.newDrawing(r.model, { date: '2026-11-03', scale: [1, 1] });
      HB.standard3View(doc, r.mesh, units);
      return HB.compute(doc, r.mesh, r.model);
    }
    test('rfHB: visible edges at least 1.4 × the weight of dimension, centre, hidden and hatch lines; the border and title block frame heavier still', function () {
      var S = HB.STROKE;
      ['thin', 'center', 'hidden', 'hatch', 'bendup', 'benddown'].forEach(function (k) { assert(S.visible >= 1.4 * S[k], 'visible ' + S.visible + ' against ' + k + ' ' + S[k]); });
      assert(S.thick > S.visible, 'thick ' + S.thick);
      return 'visible ' + S.visible + ' mm, thin ' + S.thin + ', thick ' + S.thick;
    });
    ['in', 'mm'].forEach(function (units) {
      test('rfHB: title block (' + units + '): caption, value and TITLE sizes, captions on one inset, values centred under them, nothing overlaps', function () {
        var sh = rfHBSheet(units), k = units === 'in' ? 1 / 25.4 : 1, CAP = Drawing._.CAP_EM;
        var F = HB.TB_FIELDS, S = sh.size, txt = sh.prims.filter(function (p) { return p.k === 'text' && p.layer === 'SHEET'; });
        var shown = 0;
        F.forEach(function (f) {
          var cap = txt.filter(function (p) { return p.fmt === 'field:' + f.key && p.text === f.label; })[0];
          if (!cap) return;   // a left block that does not fit this sheet
          shown++;
          var r = HB.titleFieldAt(S, units, [cap.p[0] + 0.01 * k, cap.p[1] + 0.01 * k]);
          assert(r && r.field.key === f.key, f.key + ': its caption is in its own cell');
          var c = r.rect, pad = 1.5 * k;
          assert(Math.abs(cap.h - 2.8 * k * CAP) < 1e-9, f.key + ': caption capitals ' + cap.h / k + ' mm');
          assert(Math.abs(cap.p[0] - (c.x0 + pad)) < 1e-9 && Math.abs(cap.p[1] + cap.h - (c.y1 - pad)) < 1e-9, f.key + ': caption 1.5 mm in from the top-left corner');
          var vals = txt.filter(function (p) { return p.fmt === 'field:' + f.key && p !== cap; });
          vals.forEach(function (v) {
            var vr = HB.textRect(v), cr = HB.textRect(cap);
            assert(vr.y1 < cr.y0 - 1 * k, f.key + ': value "' + v.text + '" clear of its caption');
            assert(vr.y0 > c.y0 + 0.5 * k && vr.x1 < c.x1 + 1e-9 && Math.abs(v.p[0] - (c.x0 + pad)) < 1e-9, f.key + ': value inside its cell, on the caption inset');
            if (!f.multi) {
              var want = f.big ? 6 * k * CAP : 3.5 * k * CAP;
              assert(v.h <= want + 1e-9 && (v.h > want - 1e-9 || f.key === 'title' || f.key === 'partNo'), f.key + ': value capitals ' + v.h / k);
              var mid = (cap.p[1] + c.y0) / 2;
              assert(Math.abs((v.p[1] + v.h / 2) - mid) < 1e-6, f.key + ': value centred under the caption');
            }
          });
        });
        assert(shown >= 11, 'fields shown ' + shown);
        var title = txt.filter(function (p) { return p.fmt === 'field:title' && p.text !== 'TITLE'; })[0];
        assert(title && Math.abs(title.h - 6 * k * CAP) < 1e-9, 'TITLE capitals ' + (title && title.h / k));
        return shown + ' fields; caption ' + (2.8 * CAP).toFixed(2) + ' mm capitals, TITLE ' + (6 * CAP).toFixed(2) + ' mm';
      });
    });
    test('rfHB: the SVG, PDF and DXF carry the title block sizes (SVG font-size 2.8 / 3.5 / 6 mm, DXF TEXT heights as capitals)', function () {
      var sh = rfHBSheet('mm'), svg = HB.toSVG(sh), dxf = HB.toDXF(sh), CAP = Drawing._.CAP_EM;
      assert(svg.indexOf('font-size="2.8"') > 0 && svg.indexOf('font-size="3.5"') > 0 && svg.indexOf('font-size="6"') > 0, 'SVG font sizes');
      assert(dxf.indexOf('\n40\n' + String(Math.round(2.8 * CAP * 1e4) / 1e4)) > 0 || dxf.indexOf('\n40\n2.016\n') > 0, 'DXF caption height');
      return 'ok';
    });
  })();
