  // --- r6/drawings6 ---
  (function () {
    var DW = Drawing;
    var PL6 = AnvilExamples.filter(function (e) { return e.name === 'Plate with bolt holes'; })[0].code;
    test('view scale written as SolidWorks does: SCALE 2 : 1 under detail / section / scaled views (sheet / title block keep 2:1)', function () {
      assert(DW.scaleLabel([2, 1]) === 'SCALE 2 : 1' && DW.scaleLabel([1, 2.5]) === 'SCALE 1 : 2.5', DW.scaleLabel([2, 1]));
      var r = drawingOf(PL6), T = r.view('Top').view;
      DW.addDetailView(r.doc, r.mesh, T.id, { c: [10, -10], r: 12, x: 330, y: 120 });
      r.sheet = DW.compute(r.doc, r.mesh, r.model);
      var txt = r.sheet.prims.filter(function (p) { return p.k === 'text'; }).map(function (p) { return p.text; });
      assert(txt.some(function (t) { return /^SCALE \d+(\.\d+)? : \d+(\.\d+)?$/.test(t); }), 'spaced scale text: ' + txt.filter(function (t) { return /SCALE/.test(t); }));
      assert(!txt.some(function (t) { return /SCALE \d+:\d/.test(t); }), 'no unspaced view scale');
      assert(DW.scaleText([2, 1]) === '2:1' && JSON.stringify(DW.parseScale('2 : 1')) === '[2,1]', 'values and parsing unchanged');
    });
    test('sections added by script to a full sheet: shrink or break alignment to fit on the sheet, else beside it (marked offSheet); never over another view', function () {
      var r = drawingOf(PL6), F = r.view('Front').view, T = r.view('Top').view, S = DW.sheetSize(r.doc, r.doc.units), out = [], off = 0;
      for (var i = 0; i < 6; i++) {
        var sv = DW.addSectionView(r.doc, r.mesh, (i % 2 ? T : F).id, { axis: i % 3 ? 'v' : 'h', at: 4 + i, sign: i % 4 < 2 ? 1 : -1, fit: true });
        if (sv.offSheet) off++;
        out.push(sv.label + (sv.align ? '' : '*') + (sv.scale ? DW.scaleText(sv.scale) : '') + (sv.offSheet ? '!' : ''));
      }
      var sh = DW.compute(r.doc, r.mesh, r.model), boxes = sh.views.map(function (w) { return { id: w.view.name, b: w.box, v: w.view }; });
      for (var a = 0; a < boxes.length; a++) for (var b = a + 1; b < boxes.length; b++) {
        var p = boxes[a].b, q = boxes[b].b;
        assert(p.x1 <= q.x0 || q.x1 <= p.x0 || p.y1 <= q.y0 || q.y1 <= p.y0, boxes[a].id + ' covers ' + boxes[b].id);
      }
      boxes.forEach(function (o) {
        if (o.v.kind !== 'section' || o.v.offSheet) return;
        assert(o.b.x0 >= 0 && o.b.y0 >= 0 && o.b.x1 <= S[0] && o.b.y1 <= S[1], o.id + ' on the sheet: ' + JSON.stringify(o.b));
      });
      assert(boxes.some(function (o) { return o.v.kind === 'section' && !o.v.offSheet && (!o.v.align || o.v.scale); }), 'at least one fitted by shrinking / breaking alignment: ' + out.join(' '));
      return out.join(' ') + ' (' + off + ' beside the sheet)';
    });
    test('SVG hatch: one path per run of hatch lines with relative moves; every line where the sheet has it; far smaller than a <line> each (aluminium ANSI38)', function () {
      var r = drawingOf('p.sketch("Top").rect(0, -60, 100, 60).extrude(8); p.material("6061-T6 (SS)");');
      var S = DW.addSectionView(r.doc, r.mesh, r.view('Front').view.id, { axis: 'h', at: 4, sign: 1 });
      var sh = DW.compute(r.doc, r.mesh, r.model), svg = DW.toSVG(sh), H = sh.size[1];
      var hl = sh.prims.filter(function (p) { return p.k === 'line' && p.style === 'hatch'; });
      var d = new DOMParser().parseFromString(svg, 'image/svg+xml'), pts = [];
      [].forEach.call(d.querySelectorAll('path.hatch'), function (e) {
        var cx = 0, cy = 0, re = /([Mml])(-?[\d.]+) (-?[\d.]+)/g, m;
        while ((m = re.exec(e.getAttribute('d')))) {
          if (m[1] === 'M') { cx = +m[2]; cy = +m[3]; } else { cx += +m[2]; cy += +m[3]; }
          pts.push([cx, cy]);
        }
      });
      assert(pts.length === 2 * hl.length, pts.length + ' points for ' + hl.length + ' lines');
      var worst = 0;
      hl.forEach(function (p, i) { [p.a, p.b].forEach(function (q, j) { var s = pts[2 * i + j]; worst = Math.max(worst, Math.abs(s[0] - q[0]), Math.abs(s[1] - (H - q[1]))); }); });
      assert(worst < 3e-4, 'positions within ' + worst);
      var hatchBytes = [].reduce.call(d.querySelectorAll('path.hatch'), function (n, e) { return n + e.outerHTML.length; }, 0);
      var num = function (x) { return String(Math.round(x * 1e4) / 1e4); };
      var old = hl.reduce(function (n, p) { return n + ('<line class="hatch" x1="' + num(p.a[0]) + '" y1="' + num(H - p.a[1]) + '" x2="' + num(p.b[0]) + '" y2="' + num(H - p.b[1]) + '" stroke-width="0.18"/>').length + 1; }, 0);
      assert(hatchBytes < old * 0.5, 'hatch ' + hatchBytes + ' bytes vs ' + old);
      var dxf = DW.toDXF(sh), dl = dxf.match(/\nLINE\n8\nSECTION_A\n62\n8\n10\n[^\n]+\n20\n[^\n]+\n11\n/g) || [];
      assert(dl.length === hl.length, 'DXF hatch LINEs without z: ' + dl.length + ' / ' + hl.length);
      void S;
      return hl.length + ' hatch lines: SVG hatch ' + old + ' -> ' + hatchBytes + ' bytes (' + Math.round(100 * hatchBytes / old) + '%), DXF ' + (dxf.length + 10 * hl.length) + ' -> ' + dxf.length;
    });
  })();
  // --- end r6/drawings6 ---
