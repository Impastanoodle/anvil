  // --- rfRD (2026-11-19, lane stepdraw: drawings of imported parts) --- the hidden-line clean-up no longer costs the
  // square of the line count, and a B-rep face known to the mesh (its polygons' face id: OpenCascade's, or an imported
  // solid's) never shows the edges between its own facets; its outline's chords run on as one smooth curve ---
  (function () {
    if (typeof Drawing === 'undefined') { group('rfRD: drawings of imported parts'); return; }
    var DW = Drawing;
    group('rfRD: drawings of imported parts (speed, one B-rep face drawn as one face)');
    // a prism 10 deep (z 0..10) over a closed free curve r(θ) = 20 + 4 cos 2θ drawn as n chords (12: 30° turns, sharper than
    // the 23° smooth limit), its wall's facets tagged as one B-rep face when tag is set (the caps each another)
    function rfRDPrism(tag, n) {
      var N = n || 12, P = [], polys = [];
      for (var k = 0; k < N; k++) { var t = 2 * Math.PI * k / N, r = 20 + 4 * Math.cos(2 * t); P.push([r * Math.cos(t), r * Math.sin(t)]); }
      function V(x, y, z) { return new CSG.Vertex(new CSG.Vector(x, y, z)); }
      function add(vs, face) { var p = new CSG.Polygon(vs); if (tag) p.face = face; polys.push(p); }
      add(P.map(function (q) { return V(q[0], q[1], 10); }), 'top');
      add(P.slice().reverse().map(function (q) { return V(q[0], q[1], 0); }), 'bottom');
      for (var i = 0; i < N; i++) {
        var a = P[i], b = P[(i + 1) % N];
        add([V(a[0], a[1], 0), V(b[0], b[1], 0), V(b[0], b[1], 10), V(a[0], a[1], 10)], 'wall');
      }
      return K.meshFromBody({ polygons: polys });
    }
    function rfRDVertical(pr) { return pr.lines.visible.filter(function (l) { return Math.abs(l[0] - l[2]) < 1e-9 && Math.abs(l[1] - l[3]) > 1; }).length; }
    test('a free-form wall tagged as one B-rep face: seen from the side only its two silhouettes are drawn, not the 30-degree seams between its facets (untagged: the seams show)', function () {
      var bare = DW.projectView(rfRDPrism(false), 'Top', {}), one = DW.projectView(rfRDPrism(true), 'Top', {});
      assert(rfRDVertical(bare) > 2, 'untagged facets: the seams are edges (' + rfRDVertical(bare) + ' vertical lines)');
      assert(rfRDVertical(one) === 2, 'one B-rep face: 2 silhouette lines (' + rfRDVertical(one) + ')');
      assert(one.lines.visible.length === 4, 'the side view is 4 lines (' + one.lines.visible.length + ')');
      near(one.bounds.umax - one.bounds.umin, 48, 1e-9, 'its true width (r = 24 at 0 and 180 degrees)');
    });
    test('the tagged wall\'s outline seen square on (Front: the free curve) is noted as a curve: a DXF R12 POLYLINE and an R2000 SPLINE, not 24 LINEs', function () {
      function dxfOf(tag, ver) {
        var model = K.newModel('rfRD'), mesh = rfRDPrism(tag, 24), doc = DW.newDrawing(model, { date: '2026-11-19', projection: 'third' });
        DW.addView(doc, 'Front', { role: 'front' }); DW.layout(doc, mesh, 'mm');
        return DW.toDXF(DW.compute(doc, mesh, model), ver ? { version: ver } : undefined);
      }
      function count(s, ent) { return (s.match(new RegExp('\\n0\\r?\\n' + ent + '\\r?\\n', 'g')) || []).length; }
      var bare = dxfOf(false), one = dxfOf(true), one2 = dxfOf(true, 'R2000');
      assert(count(bare, 'POLYLINE') === 0, 'untagged: chords (' + count(bare, 'POLYLINE') + ' POLYLINE)');
      assert(count(one, 'POLYLINE') === 1 && count(one, 'LINE') === count(bare, 'LINE') - 24, 'tagged: the outline is a POLYLINE (' + count(one, 'POLYLINE') + '; LINE ' + count(bare, 'LINE') + ' -> ' + count(one, 'LINE') + ')');
      assert(count(one2, 'SPLINE') === 1, 'R2000: a SPLINE (' + count(one2, 'SPLINE') + ')');
    });
    test('clean-up on long open chains is linear: extractCircles on 40 000 chords of a spiral, closeEnds on 15 000 short lines, each well under 2 s', function () {
      var segs = [], n = 40000, prev = null;
      for (var i = 0; i <= n; i++) { var t = i * 0.01, r = 10 + t, p = [r * Math.cos(t), r * Math.sin(t)]; if (prev) segs.push([prev[0], prev[1], p[0], p[1], 0]); prev = p; }
      var t0 = Date.now(), ec = DW._.extractCircles(segs, 1000), ms = Date.now() - t0;
      assert(ec.circles.length === 0 && ec.lines.length === n, 'a spiral is no circle (' + ec.lines.length + ' lines)');
      assert(ms < 2000, 'extractCircles ' + ms + ' ms');
      var ls = [];
      for (var j = 0; j < 15000; j++) { var x = (j % 150) * 2, y = Math.floor(j / 150) * 2; ls.push([x, y, x + 1.5, y + 0.3]); }
      t0 = Date.now(); DW._.closeEnds(ls, [], [], [], 0.05); ms = Date.now() - t0;
      assert(ms < 2000, 'closeEnds ' + ms + ' ms');
    });
  })();
