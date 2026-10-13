  // --- refine/drawings ---
  group('refine/drawings');
  if (DW) (function () {
    test('open facet edges a rounding step apart are paired: one piece with both faces, smooth, nothing open left', function () {
      var stub = { faces: [{ body: 0 }, { body: 0 }, { body: 0 }] }, n0 = [1, 0, 0], n1 = [Math.cos(0.1), Math.sin(0.1), 0];
      // face 0: 0 → 10 along z; face 1: the same edge a micron off, split at 4 (a T-junction); face 2: elsewhere
      var out = [
        { a: [5, 0, 0], b: [5, 0, 10], faces: [0], normals: [n0], smooth: false },
        { a: [5, 0.0006, 0], b: [5, 0.0004, 4], faces: [1], normals: [n1], smooth: false },
        { a: [5, 0.0004, 4], b: [5, 0.0006, 10], faces: [1], normals: [n1], smooth: false },
        { a: [50, 0, 0], b: [50, 0, 10], faces: [2], normals: [n0], smooth: false }
      ];
      var r = DW.pairOpenEdges(stub, out, 0.002);
      var paired = r.filter(function (pc) { return pc.faces.length === 2; });
      assert(paired.length === 2 && paired.every(function (pc) { return pc.smooth; }), 'two smooth pieces: ' + JSON.stringify(r.map(function (pc) { return pc.faces; })));
      near(paired[0].a[2] + paired[1].a[2] + paired[0].b[2] + paired[1].b[2], 0 + 4 + 4 + 10, 1e-6, 'split at 4');
      assert(r.filter(function (pc) { return pc.faces.length === 1; }).length === 1, 'the far edge stays open');
      // pieces of another body are not paired
      stub.faces[1].body = 1;
      assert(DW.pairOpenEdges(stub, out, 0.002).every(function (pc) { return pc.faces.length === 1; }), 'other body');
      return r.length + ' pieces';
    });

    test('SVG: an arc or elliptical arc of nearly 360° is written as two halves (ends a rounding step apart do not erase it)', function () {
      var sheet = { size: [100, 100], units: 'mm', views: [], prims: [
        { k: 'arc', c: [50, 50], r: 10, a0: 30, a1: 30 + 359.99999, layer: 'V', style: 'visible' },
        { k: 'ellipse', c: [50, 50], major: [20, 0], ratio: 0.5, t0: 0.3, t1: 0.3 + 2 * Math.PI - 1e-6, full: false, layer: 'V', style: 'visible' }
      ] };
      var paths = DW.toSVG(sheet).match(/<path[^>]* d="[^"]*"/g) || [];
      assert(paths.length === 2, paths.length + ' paths');
      paths.forEach(function (p) {
        var d = p.match(/ d="([^"]*)"/)[1];
        assert((d.match(/A/g) || []).length === 2, 'two arc commands: ' + d);
        // the middle point lies across the curve from the start, not next to it
        var nums = d.replace(/[MA]/g, ' ').trim().split(/\s+/).map(Number);
        assert(Math.hypot(nums[7] - nums[0], nums[8] - nums[1]) > 10, 'mid point far from the start: ' + d);
      });
      return 'ok';
    });

    test('model items: radius / diameter leaders are placed clear of each other, of the overall dimensions and of the views (a bent angle: R4 inside R6, 2 mm apart)', function () {
      // the corner of a 2 mm bent angle: concentric arcs whose default leaders (8 mm out from the middle of each arc)
      // would put the R4 and R6 texts on top of each other
      var r = drawingOf('p.sketch("Front").line(6, -120, 6, 0).arc(0, 0, 6, 0, 90).line(0, 6, -120, 6).line(-120, 6, -120, 4).line(-120, 4, 0, 4).arc(0, 0, 4, 0, 90).line(4, 0, 4, -120).line(4, -120, 6, -120).extrude(30);'), texts = [], clash = [];
      r.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; }).forEach(function (p) { texts.push({ t: p.text, r: DW.textRect(p) }); });
      assert(r.sheet.dims.filter(function (d) { return d.kind === 'rad'; }).length >= 2, 'radius dims: ' + r.sheet.dims.map(function (d) { return d.text; }).join(', '));
      function meet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
      for (var i = 0; i < texts.length; i++) for (var j = i + 1; j < texts.length; j++) if (meet(texts[i].r, texts[j].r)) clash.push(texts[i].t + ' / ' + texts[j].t);
      assert(!clash.length, 'overlapping dimension texts: ' + clash.join(', '));
      assert(!textsOnGeometry(r.sheet).length, 'text on a view\'s lines: ' + textsOnGeometry(r.sheet).join(', '));
      return texts.map(function (t) { return t.t; }).join(', ');
    });
    // dimension texts that overlap a drawn line, circle or arc of any view (paper rectangles, sampled curves)
    function textsOnGeometry(sheet) {
      var layers = {}, segs = [], out = [];
      sheet.views.forEach(function (w) { layers[w.layer] = 1; });
      sheet.prims.forEach(function (p) {
        if (!layers[p.layer]) return;
        if (p.k === 'line') segs.push([p.a, p.b]);
        else if (p.k === 'circle' || p.k === 'arc') {
          var a0 = p.k === 'arc' ? p.a0 : 0, sw = p.k === 'arc' ? (((p.a1 - p.a0) % 360) + 360) % 360 || 360 : 360, prev = null;
          for (var i = 0; i <= 90; i++) { var a = (a0 + sw * i / 90) * Math.PI / 180, q = [p.c[0] + p.r * Math.cos(a), p.c[1] + p.r * Math.sin(a)]; if (prev) segs.push([prev, q]); prev = q; }
        }
      });
      function hit(s, r) {   // segment against rectangle by sampling (independent of drawing.js's clipper)
        for (var i = 0; i <= 20; i++) { var x = s[0][0] + (s[1][0] - s[0][0]) * i / 20, y = s[0][1] + (s[1][1] - s[0][1]) * i / 20; if (x > r.x0 && x < r.x1 && y > r.y0 && y < r.y1) return true; }
        return false;
      }
      sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === 'DIMENSIONS'; }).forEach(function (p) {
        var r = DW.textRect(p);
        if (segs.some(function (s) { return hit(s, r); })) out.push(p.text);
      });
      return out;
    }

    test('model items: a diameter gets a short leader with its text beside the circle on empty paper (Flange: Ø50 bore and Ø70 hub inside the Top view), no text on any line', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Flange'; })[0];
      var r = drawingOf(ex.code), T = r.view('Top'), got = {};
      r.sheet.dims.filter(function (d) { return d.kind === 'dia' && d.view === T.view.id; }).forEach(function (d) {
        var lead = Math.hypot(d.leadNow[0], d.leadNow[1]) - d.r * T.scale;
        got[d.text] = lead;
      });
      assert(got['Ø50'] != null && got['Ø70'] != null, 'dims ' + JSON.stringify(got));
      assert(got['Ø50'] < 12 && got['Ø70'] < 12, 'short leaders (mm past the circle): ' + JSON.stringify(got));
      var on = textsOnGeometry(r.sheet);
      assert(!on.length, 'texts on lines: ' + on.join(', '));
      return Object.keys(got).map(function (k) { return k + ' ' + got[k].toFixed(1) + ' mm'; }).join(', ');
    });

    test('Tangent Edge: a filleted block\'s fillet run-outs are drawn with Tangent Edges Visible (solid) / With Font (phantom, DXF PHANTOM), not by default; never between facets of one fillet', function () {
      var ex = AnvilExamples.filter(function (e) { return e.name === 'Chamfered block'; })[0];
      var r = drawingOf(ex.code), F = r.view('Front');
      assert(!(F.proj.lines.tangent || []).length && !r.sheet.prims.some(function (p) { return p.style === 'tangent' || p.style === 'tanfont'; }), 'removed by default');
      var b = build(ex.code), pv = DW.projectView(b.mesh, 'Front', { tangent: 'visible' }), tl = pv.lines.tangent;
      // the two front fillets (R6 on the 80 × 50 block) run out at u = ±34, vertical, full height up to the chamfer
      assert(tl.length === 2 && tl.every(function (l) { return Math.abs(l[0] - l[2]) < 1e-6 && Math.abs(Math.abs(l[0]) - 34) < 1e-6 && Math.abs(l[3] - l[1]) > 20; }), 'run-outs ' + segsStr(tl));
      F.view.tangent = 'font';
      var sh = DW.compute(r.doc, r.mesh, r.model), tf = sh.prims.filter(function (p) { return p.style === 'tanfont'; });
      assert(tf.length === 2 && tf.every(function (p) { return p.layer === 'FRONT'; }), 'phantom lines ' + tf.length);
      assert(/class="tanfont" [^>]*stroke-dasharray/.test(DW.toSVG(sh)), 'SVG dashed');
      var dxf = DW.toDXF(sh);
      assert(/LINE\n8\nFRONT\n6\nPHANTOM/.test(dxf), 'DXF PHANTOM line on FRONT');
      F.view.tangent = 'visible';
      sh = DW.compute(r.doc, r.mesh, r.model);
      assert(sh.prims.filter(function (p) { return p.style === 'tangent'; }).length === 2, 'visible');
      return 'Front: ' + tl.length + ' tangent edges';
    });
  })();
