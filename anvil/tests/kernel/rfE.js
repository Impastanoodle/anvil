  // --- rfE (fidelity finding 12): sketch DXF coordinates at full precision, not 6 decimals ---
  test('rfE: sketch DXF writes full precision — a 3 point arc through (1,-5), (2,-4.4), (3,-5) reads back its centre -5.5333333333333 and R 1.1333333333333 to 1e-13 (R12 and R2000); a 1e-7 offset is plain decimal; noise and -0 write 0', function () {
    var cy = -16.6 / 3, r = 3.4 / 3, a0 = Math.atan2(-5 - cy, 3 - 2) * 180 / Math.PI;
    var s = { entities: [{ t: 'arc', cx: 2, cy: cy, r: r, a0: a0, a1: 180 - a0 }, { t: 'line', x1: -1e-16, y1: 1e-7, x2: 4, y2: -0 }] };
    ['R12', 'R2000'].forEach(function (ver) {
      var dxf = K.exportDXFSketch(s, 'in', { version: ver }), ents = sketchDxfEnts(dxf);
      var arc = ents.filter(function (e) { return e.t === 'ARC'; })[0], ln = ents.filter(function (e) { return e.t === 'LINE'; })[0];
      assert(arc && ln, ver + ': ARC and LINE ' + ents.map(function (e) { return e.t; }).join(','));
      assert(Math.abs(arc['20'] - cy) < 1e-13 && Math.abs(arc['40'] - r) < 1e-13 && arc['10'] === 2, ver + ': centre / radius ' + JSON.stringify(arc));
      assert(dxf.indexOf('\n-5.5333333333333\n') > 0 && dxf.indexOf('\n1.1333333333333\n') > 0, ver + ': the digits written');
      // the arc's ends (from centre, radius and angles) land on the clicked points
      var e0 = [arc['10'] + arc['40'] * Math.cos(arc['50'] * Math.PI / 180), arc['20'] + arc['40'] * Math.sin(arc['50'] * Math.PI / 180)];
      assert(Math.hypot(e0[0] - 3, e0[1] + 5) < 1e-9, ver + ': arc start on (3,-5) ' + JSON.stringify(e0));
      var body = dxf.slice(dxf.indexOf('ENTITIES'));
      assert(!/\n-?\d*\.?\d+e[-+]?\d+\n/i.test(body), ver + ': no exponent notation');
      assert(!/\n-0\n/.test(dxf), ver + ': no -0');
      assert(ln['10'] === 0 && ln['21'] === 0 && ln['20'] === 1e-7 && body.indexOf('\n0.0000001\n') > 0, ver + ': line ' + JSON.stringify(ln));
    });
    return 'centre ' + (K._.fmtD ? K._.fmtD(cy) : '?');
  });
  // --- end sketch-dxf ---
  test('sketch DXF in inches sets INSUNITS 1', function () {
    var dxf = K.exportDXFSketch({ entities: [] }, 'in');
    assert(/\$INSUNITS\n70\n1\n/.test(dxf), 'inch units flag');
  });
  test('face DXF turns a round hole into a CIRCLE on the HOLES layer', function () {
    var r = build('p.box(20, 20, 5);\np.hole("Top", 10, -10, 6, { offset: 5 });');
    var top = -1;
    r.mesh.faces.forEach(function (f, i) { if (f.normal[1] > 0.99) top = i; });
    var dxf = K.exportDXFFace(r.mesh, top, 'mm');
    assert(dxf, 'dxf produced');
    var i = dxf.indexOf('\nCIRCLE\n');
    assert(i > 0, 'CIRCLE entity');
    assert(dxf.slice(i, i + 40).indexOf('HOLES') > 0, 'circle on HOLES layer');
    assert(dxf.indexOf('\nPOLYLINE\n') > 0, 'outline POLYLINE');
  });
  test('face DXF for a bad index is null', function () {
    var r = build('p.box(1, 1, 1);');
    assert(K.exportDXFFace(r.mesh, 99, 'mm') === null, 'should be null');
  });

