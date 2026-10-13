  // --- r4/drawings4 ---
  (function () {
    var DW = Drawing;
    test('a chain of lines (a curve drawn as chords) is one SVG path and one PDF path, so a hidden curve\'s dashes run on along it', function () {
      var sheet = { size: [100, 100], units: 'mm', views: [], prims: [
        { k: 'line', a: [10, 10], b: [20, 12], layer: 'V', style: 'hidden', chain: 1 },
        { k: 'line', a: [20, 12], b: [30, 16], layer: 'V', style: 'hidden', chain: 1 },
        { k: 'line', a: [30, 16], b: [40, 22], layer: 'V', style: 'hidden', chain: 1 },
        { k: 'line', a: [50, 50], b: [60, 50], layer: 'V', style: 'hidden' }
      ] };
      var svg = DW.toSVG(sheet), paths = svg.match(/<path class="hidden" d="[^"]*"[^>]*>/g) || [];
      assert(paths.length === 1 && /stroke-dasharray/.test(paths[0]), 'one dashed path: ' + paths.join(' '));
      assert((paths[0].match(/ L/g) || []).length === 3, 'three segments in it: ' + paths[0]);
      assert((svg.match(/<line class="hidden"/g) || []).length === 1, 'the lone line stays a line');
      var pdf = DW.toPDF(sheet), body = pdf.slice(pdf.indexOf('stream'), pdf.indexOf('endstream'));
      assert((body.match(/ m /g) || []).length === 2 && (body.match(/ S/g) || []).length === 2, 'PDF: two stroked paths: ' + body.slice(0, 300));
      return paths[0].length + ' chars';
    });
    test('chained view lines: consecutive pieces of a chain meet end to end and turn less than 40°; outline corners are not chained', function () {
      var r = drawingOf(AnvilExamples.filter(function (e) { return e.name === 'Mug'; })[0].code), chains = {}, n = 0;
      r.sheet.prims.forEach(function (p) { if (p.k === 'line' && p.chain) (chains[p.chain] || (chains[p.chain] = [])).push(p); });
      Object.keys(chains).forEach(function (c) {
        var l = chains[c];
        for (var i = 1; i < l.length; i++) {
          var a = l[i - 1], b = l[i], d1 = [a.b[0] - a.a[0], a.b[1] - a.a[1]], d2 = [b.b[0] - b.a[0], b.b[1] - b.a[1]];
          near(Math.hypot(a.b[0] - b.a[0], a.b[1] - b.a[1]), 0, 1e-4, 'chain ' + c + ' joins');
          assert((d1[0] * d2[0] + d1[1] * d2[1]) / (Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) > Math.cos(40 * Math.PI / 180) - 1e-9, 'chain ' + c + ' turns gently');
          n++;
        }
      });
      assert(n > 10, 'the handle\'s outline is chained: ' + n + ' joints');
      // a box's hidden rectangle keeps its corners
      var b = drawingOf('p.box(40, 20, 30); p.sketch("Front").centerRect(20, 15, 10, 10).cut("through");');
      assert(!b.sheet.prims.some(function (p) { return p.chain && p.style === 'hidden'; }), 'no chained hidden rectangle');
      return n + ' joints';
    });
    test('Tangent Edges Visible on Anvil fillets without surface records: a box edge fillet runs out on straight tangent lines', function () {
      var r = build('p.box(40, 20, 30); p.fillet(4, [[20, 30, 20]]);'); noErrors(r);
      var tp = DW.projectView(r.mesh, 'Top', { tangent: 'visible' }), iso = DW.projectView(r.mesh, 'Isometric', { tangent: 'visible' }), off = DW.projectView(r.mesh, 'Top');
      assert(tp.lines.tangent.length === 1 && iso.lines.tangent.length === 2, 'top ' + segsStr(tp.lines.tangent) + ' iso ' + iso.lines.tangent.length);
      near(Math.abs(tp.lines.tangent[0][2] - tp.lines.tangent[0][0]), 40, 1e-6, 'full length');
      assert(!off.lines.tangent.length, 'removed by default');
    });
    test('Tangent Edges Visible: an Anvil fillet round a cylinder rim, seen along the axis: the run-out onto the cap is a true circle', function () {
      var r = build('p.cylinder(20, 30); p.fillet(4, [[20, 30, 0]]);'); noErrors(r);
      var tp = DW.projectView(r.mesh, 'Top', { tangent: 'visible' });
      assert(tp.circles.tangent.length === 1 && !tp.lines.tangent.length, 'circles ' + JSON.stringify(tp.circles.tangent) + ' lines ' + tp.lines.tangent.length);
      near(tp.circles.tangent[0].r, 16, 0.05, 'r 16');
    });
  })();
  // --- end r4/drawings4 ---
