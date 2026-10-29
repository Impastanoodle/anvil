  // ------------------------------------------------------------------ rfDX: Draft (Neutral Plane)
  // { type: 'draft', neutral: { face: [x,y,z] } | { plane }, faces: [{ at }], angle, reverse?, propagate? } turns each
  // face about its line on the neutral plane. Planar faces are exact on Anvil's kernel (frustum volumes in closed form);
  // curved faces are refused here (OpenCascade makes them exact cones: occt-tests.html rfDX rows).
  (function () {
    group('rfDX: Draft (Neutral Plane)');
    var rfDXt5 = Math.tan(5 * Math.PI / 180);
    var rfDXblock = 'p.units("in"); p.sketch("Top").rect(-1, -1, 2, 2).end().extrude(1); ';
    var rfDXsides = '[[1, 0.5, 0], [-1, 0.5, 0], [0, 0.5, 1], [0, 0.5, -1]]';
    function rfDXfrustum(a, b, h) { return h / 3 * (a * a + b * b + a * b); }
    function rfDXerr(r) { var k = Object.keys(r.errors); return k.length ? r.errors[k[0]] : ''; }

    test('2 x 2 x 1 in block, four sides drafted 5° about the bottom face: exact frustum, top shrinks by 2 tan 5°', function () {
      var r = build(rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ');');
      noErrors(r);
      nearRel(r.mp.volume, rfDXfrustum(2, 2 - 2 * rfDXt5, 1), 1e-9, 'volume');
      consistentVolume(r);
      near(r.mp.bbox.max[1], 1, 1e-12, 'height');
      var top = r.mesh.faces.filter(function (f) { return f.normal[1] > 0.999 && Math.abs(f.w - 1) < 1e-9; })[0];
      assert(top, 'top face found');
      nearRel(top.area, Math.pow(2 - 2 * rfDXt5, 2), 1e-9, 'top face area');
      assert(r.model.features[2].name === 'Draft1', 'tree name ' + r.model.features[2].name);
      var q = K.meshQuality(r.mesh); assert(q.closed && !q.openEdges, 'closed mesh');
    });
    test('Reverse direction grows the top instead (2 + 2 tan 5°)', function () {
      var r = build(rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ', { reverse: true });');
      noErrors(r);
      nearRel(r.mp.volume, rfDXfrustum(2, 2 + 2 * rfDXt5, 1), 1e-9, 'volume');
      near(r.mp.bbox.max[0], 1 + rfDXt5, 1e-9, 'max x at the top');
      near(r.mp.bbox.min[2], -1 - rfDXt5, 1e-9, 'min z at the top');
    });
    test('neutral plane through the middle (Top Plane offset 0.5): grows below, shrinks above', function () {
      var r = build(rfDXblock + 'var pl = p.plane("Top", 0.5); p.draft(5, pl, ' + rfDXsides + ');');
      noErrors(r);
      nearRel(r.mp.volume, rfDXfrustum(2 + rfDXt5, 2, 0.5) + rfDXfrustum(2, 2 - rfDXt5, 0.5), 1e-9, 'volume');
      var r2 = build(rfDXblock + 'p.draft(5, "Top", ' + rfDXsides + ');');
      noErrors(r2);
      nearRel(r2.mp.volume, rfDXfrustum(2, 2 - 2 * rfDXt5, 1), 1e-9, 'Top Plane at the bottom: as the bottom face');
    });
    test('the pull turns toward the drafted faces: a boss on a plate tapers up from the plate\'s top face', function () {
      var r = build('p.units("in"); p.sketch("Top").rect(-2, -2, 4, 4).end().extrude(0.5); p.sketch("Top", 0.5).rect(-1, -1, 2, 2).end().extrude(1); ' +
        'p.draft(5, [1.5, 0.5, 1.5], [[1, 1, 0], [-1, 1, 0], [0, 1, 1], [0, 1, -1]]);');
      noErrors(r);
      nearRel(r.mp.volume, 8 + rfDXfrustum(2, 2 - 2 * rfDXt5, 1), 1e-9, 'volume');
    });
    test('one face of an L (a concave edge) and its outer face: exact wedges', function () {
      var r = build('p.units("in"); p.sketch("Front").polyline([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]], true).end().extrude(1); ' +
        'p.draft(5, [2, 0, 0.5], [[1, 2, 0.5], [0, 1.5, 0.5]]);');
      noErrors(r);
      nearRel(r.mp.volume, 5 - 8.5 * rfDXt5, 1e-9, 'volume (inner face: 4 tan, outer face: 4.5 tan)');
      var q = K.meshQuality(r.mesh); assert(q.closed && !q.openEdges, 'closed mesh');
    });
    test('a drafted face with a hole keeps the hole round (exact volume)', function () {
      var r = build(rfDXblock + 'p.sketch("Right").circle(0, 0.5, 0.25).end().cut(4, { midplane: true }); p.draft(5, [0, 0, 0], [[1, 0.8, 0.8], [-1, 0.8, 0.8]]);');
      noErrors(r);
      var a = Math.PI * 0.0625;
      nearRel(r.mp.volume, 4 - 2 * a - 2 * rfDXt5 + rfDXt5 * a, 1e-9, 'volume');
    });
    test('refusals: a face parallel to the neutral plane, a cylinder, the neutral face itself, no faces', function () {
      var r = build(rfDXblock + 'p.draft(5, [0, 0, 0], [[0, 1, 0]]);');
      assert(/parallel to the neutral plane/.test(rfDXerr(r)), rfDXerr(r));
      r = build('p.units("in"); p.sketch("Top").circle(0, 0, 1).end().extrude(1); p.draft(5, [0, 0, 0], [[1, 0.5, 0]]);');
      assert(/curved/.test(rfDXerr(r)) && /OpenCascade/.test(rfDXerr(r)), rfDXerr(r));
      nearRel(r.mp.volume, Math.PI, 1e-9, 'the body before the draft stays');
      r = build(rfDXblock + 'p.draft(5, [0.5, 0, 0.5], [[0, 0, 0]]);');
      assert(/neutral face/.test(rfDXerr(r)), rfDXerr(r));
      r = build(rfDXblock + 'p.draft(5, [0, 0, 0], []);');
      assert(/Select the faces/.test(rfDXerr(r)), rfDXerr(r));
      r = build(rfDXblock + 'p.draft(95, [0, 0, 0], ' + rfDXsides + ');');
      assert(/less than 89/.test(rfDXerr(r)), rfDXerr(r));
    });
    test('script round trip: p.draft with a plane neutral, reverse and Along Tangent', function () {
      var r = build(rfDXblock + 'var pl = p.plane("Top", 0.25); p.draft(3, pl, ' + rfDXsides + ', { reverse: true, propagate: "tangent" });');
      noErrors(r);
      var s = K.generateScript(r.model);
      assert(/p\.draft\(3, \{ plane: /.test(s) && /reverse: true/.test(s) && /propagate: "tangent"/.test(s), s.split('\n').filter(function (l) { return /draft/.test(l); }).join(' / '));
      var r2 = build(s);
      noErrors(r2);
      nearRel(r2.mp.volume, r.mp.volume, 1e-12, 'volume after the round trip');
      var d = r2.model.features.filter(function (f) { return f.type === 'draft'; })[0];
      assert(d && d.reverse === true && d.propagate === 'tangent' && d.faces.length === 4 && d.angle === 3, JSON.stringify(d));
      var r3 = build(K.generateScript(build(rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ');').model));
      nearRel(r3.mp.volume, rfDXfrustum(2, 2 - 2 * rfDXt5, 1), 1e-9, 'face neutral round trip');
    });
    test('Draft Analysis reports the drafted faces at the drafted angle', function () {
      var r = build(rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ');');
      var da = Evaluate.draftAnalysis(r.mesh, [0, 1, 0], 5);
      var sides = da.faces.filter(function (f) { return Math.abs(r.mesh.faces[f.index].normal[1]) < 0.5; });
      assert(sides.length === 4, sides.length + ' side faces');
      sides.forEach(function (f) { near(f.angle, 5, 1e-6, 'side draft angle'); assert(f.cls === 'positive', f.cls); });
      var da2 = Evaluate.draftAnalysis(r.mesh, [0, 1, 0], 6);
      assert(da2.faces.filter(function (f) { return Math.abs(r.mesh.faces[f.index].normal[1]) < 0.5; }).every(function (f) { return f.cls === 'requires'; }), '5° faces need draft at 6°');
    });
    test('the feature JSON drives buildTool (the PropertyManager preview) and survives pack / unpack', function () {
      var r = build(rfDXblock + 'p.draft(5, [0, 0, 0], ' + rfDXsides + ');');
      var f = r.model.features[2], before = build(rfDXblock);
      var t = K.buildTool(f, r.model, { body: before.body, planes: before.build.planes, sketches: {}, tools: {} });
      nearRel(K.massProps(K.meshFromBody(t)).volume, r.mp.volume, 1e-12, 'preview volume');
      assert(!K.isCut(f, r.model), 'not a cut');
    });
  })();
