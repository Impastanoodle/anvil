  // --- sketch-dxf (DXF/DWG Output ▸ Sketch): exact pieces, construction left out unless asked, both versions ---
  function sketchDxfEnts(dxf) {
    var L = dxf.split('\n'), out = [], cur = null, inE = false;
    for (var i = 0; i + 1 < L.length; i += 2) {
      var c = L[i].trim(), v = L[i + 1].trim();
      if (c === '2' && v === 'ENTITIES') { inE = true; continue; }
      if (!inE) continue;
      if (c === '0') { if (cur) out.push(cur); cur = v === 'ENDSEC' ? null : { t: v }; if (v === 'ENDSEC') break; continue; }
      if (cur) cur[c] = isNaN(+v) ? v : +v;
    }
    return out;
  }
  test('sketch-dxf: a slot is two LINEs and two ARCs of radius w/2 meeting the lines exactly', function () {
    var ents = sketchDxfEnts(K.exportDXFSketch({ entities: [{ t: 'slot', x1: 0, y1: 0, x2: 4, y2: 0, w: 1 }] }, 'in'));
    var lines = ents.filter(function (e) { return e.t === 'LINE'; }), arcs = ents.filter(function (e) { return e.t === 'ARC'; });
    assert(lines.length === 2 && arcs.length === 2 && ents.length === 4, 'entities ' + ents.map(function (e) { return e.t; }).join(','));
    arcs.forEach(function (a) { near(a['40'], 0.5, 1e-12, 'arc radius'); });
    var ends = lines.map(function (l) { return [[l['10'], l['20']], [l['11'], l['21']]]; });
    arcs.forEach(function (a) {
      [a['50'], a['51']].forEach(function (deg) {
        var p = [a['10'] + 0.5 * Math.cos(deg * Math.PI / 180), a['20'] + 0.5 * Math.sin(deg * Math.PI / 180)];
        assert(ends.some(function (pair) { return pair.some(function (q) { return Math.hypot(q[0] - p[0], q[1] - p[1]) < 1e-9; }); }), 'arc end on a line end');
      });
    });
    return 'slot 2 LINE + 2 ARC';
  });
  test('sketch-dxf: construction geometry is left out unless asked, then on its own CONSTRUCTION layer; points never', function () {
    var s = { entities: [{ t: 'line', x1: 0, y1: -5, x2: 0, y2: 5, construction: true }, { t: 'circle', cx: 3, cy: 0, r: 1 }, { t: 'point', x: 1, y: 1 }] };
    var a = sketchDxfEnts(K.exportDXFSketch(s, 'mm')), b = K.exportDXFSketch(s, 'mm', { construction: true }), be = sketchDxfEnts(b);
    assert(a.length === 1 && a[0].t === 'CIRCLE', 'default: only the circle ' + a.map(function (e) { return e.t; }).join(','));
    assert(be.length === 2 && be.some(function (e) { return e.t === 'LINE' && e['8'] === 'CONSTRUCTION'; }), 'with construction: the centerline on CONSTRUCTION');
    assert(/\n2\nCONSTRUCTION\n/.test(b), 'CONSTRUCTION in the layer table');
    assert(!/\n2\nCONSTRUCTION\n/.test(K.exportDXFSketch(s, 'mm')), 'no CONSTRUCTION layer when it is not used');
    return 'ok';
  });
  test('sketch-dxf: R2000 output and an arc across 0° kept as drawn (300° → 30° counterclockwise)', function () {
    var dxf = K.exportDXFSketch({ entities: [{ t: 'arc', cx: 0, cy: 0, r: 2, a0: 300, a1: 30 }] }, 'in', { version: 'R2000' });
    assert(/\$ACADVER\n1\nAC1015\n/.test(dxf), 'R2000 header');
    var arc = sketchDxfEnts(dxf).filter(function (e) { return e.t === 'ARC'; })[0];
    assert(arc && Math.abs(arc['50'] - 300) < 1e-9 && Math.abs(arc['51'] - 30) < 1e-9, 'arc 300 -> 30: ' + JSON.stringify(arc));
    return 'ok';
  });
