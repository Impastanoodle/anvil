  // --- p9-sketch-curves: arc slots (3 Point / Centerpoint Arc Slot), the Polygon's inscribed circle, a slot's overall
  // length (ui-sketch-curves.js; kernel-sketch.js, sketch-solver.js, kernel-script.js) ---
  (function () {
    group('p9-sketch-curves: arc slots, inscribed polygons, overall slot length');
    var SS = window.SketchSolver, PI = Math.PI;
    // an arc slot's area: the band (sweep · r · w) plus the two half-circle caps (π w² / 4)
    function aslotArea(r, sweepDeg, w) { return sweepDeg * PI / 180 * r * w + PI * w * w / 4; }
    test('p9-sketch-curves: an arc slot is one closed loop of its four true arcs; its extrude is exact (θ·r·w + π·w²/4) × depth, a through cut removes exactly that, and the script round-trips (.arcSlot)', function () {
      var e = { t: 'aslot', cx: 0, cy: 0, r: 20, a0: 30, a1: 150, w: 6 };
      var prof = K.sketchProfile({ entities: [e] });
      assert(prof.loops.length === 1 && !prof.loops[0].cross, 'one simple loop: ' + prof.loops.length);
      assert(prof.curves && prof.curves.length === 4, 'four true arcs: ' + (prof.curves || []).length);
      assert(prof.loops[0].seg && prof.loops[0].seg.every(function (k) { return k >= 0; }), 'every segment on a true arc');
      var radii = prof.curves.map(function (c) { return fmt(c.r); }).sort(function (a, b) { return a - b; }).join(',');
      assert(radii === '3,3,17,23', 'radii r ± w/2 and the w/2 caps: ' + radii);
      var a = build('p.sketch("Front").arcSlot(0, 0, 20, 30, 150, 6).extrude(5);');
      noErrors(a);
      nearRel(a.mp.volume, aslotArea(20, 120, 6) * 5, 1e-9, 'extrude volume');
      var c = build('p.sketch("Top").rect(-40, -60, 80, 60).extrude(10);\np.sketch("Top", 10).arcSlot(0, -30, 20, 200, 340, 5).cut("through", { reverse: true });');
      noErrors(c);
      nearRel(c.mp.volume, 80 * 60 * 10 - aslotArea(20, 140, 5) * 10, 1e-9, 'plate with an arc slot cut through');
      var rt = roundTrip('p.sketch("Front").rect(-30, -10, 60, 40).arcSlot(0, 0, 20, 30, 150, 6).extrude(4);');
      assert(/\.arcSlot\(0, 0, 20, 30, 150, 6\)/.test(K.generateScript(a.model)), 'script writes .arcSlot');
      return fmt(a.mp.volume) + ' mm³, round trip ' + rt;
    });
    test('p9-sketch-curves: an arc slot\'s sketch DXF is four ARCs (r ± w/2, two w/2 caps) chaining into one closed loop, on HOLES inside a plate outline', function () {
      var s = { entities: [{ t: 'rect', x: -30, y: -10, w: 60, h: 40 }, { t: 'aslot', cx: 0, cy: 0, r: 20, a0: 30, a1: 150, w: 6 }] };
      var dxf = K.exportDXFSketch(s, 'mm', { version: 'R2000' }), ents = sketchDxfEnts(dxf);
      var arcs = ents.filter(function (x) { return x.t === 'ARC'; }), lines = ents.filter(function (x) { return x.t === 'LINE'; });
      assert(arcs.length === 4 && lines.length === 4, 'entities: ' + ents.map(function (x) { return x.t; }).join(','));
      assert(arcs.every(function (x) { return x['8'] === 'HOLES'; }) && lines.every(function (x) { return x['8'] === 'OUTLINE'; }), 'layers: ' + ents.map(function (x) { return x.t + '/' + x['8']; }).join(','));
      var radii = arcs.map(function (x) { return fmt(x['40']); }).sort(function (p, q) { return p - q; }).join(',');
      assert(radii === '3,3,17,23', 'arc radii ' + radii);
      var chk = DxfCheck.check(dxf, { units: 'mm' });
      assert(chk.ok, 'DXF check: ' + chk.errors.join('; '));
      assert(chk.loops.length === 2 && chk.loops.every(function (l) { return l.closed; }), 'two closed loops: ' + JSON.stringify(chk.loops));
      return 'ARC x4 on HOLES';
    });
    test('p9-sketch-curves: arc slot editing — mirror (runs the other way round), move, trim explodes it into arcs, Offset keeps an arc slot with a radial offset dimension that drives the width', function () {
      var e = { t: 'aslot', cx: 10, cy: 0, r: 20, a0: 30, a1: 150, w: 6 };
      var m = K.mirrorEntity(e, K.mirrorAxis('y'));
      near(m.cx, -10, 1e-12, 'mirrored centre'); near(m.a1 - m.a0, 120, 1e-9, 'sweep kept'); near(m.w, 6, 0, 'width kept');
      near(m.a0, 30, 1e-9, 'mirror of 30..150 about the Y axis is 30..150 round the mirrored centre');
      var tr = K.translateEntity(e, 5, -2);
      assert(tr.cx === 15 && tr.cy === -2 && tr.w === 6, 'moved ' + JSON.stringify(tr));
      var trimmed = K.trimEntity([e, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 40 }], 0, [10 + 23 * Math.cos(PI / 3), 23 * Math.sin(PI / 3)]);
      assert(trimmed.filter(function (x) { return x.t === 'arc'; }).length >= 4, 'exploded into arcs: ' + trimmed.map(function (x) { return x.t; }).join(','));
      var sk = { entities: [JSON.parse(JSON.stringify(e))] }, o = SS.offsetEntity(sk.entities[0], 1.5);
      assert(o && o.t === 'aslot' && o.w === 9 && o.r === 20, 'offset copy ' + JSON.stringify(o));
      sk.entities.push(o);
      SS.offsetRelations(sk, 0, 1).forEach(function (rel) { SS.addRelation(sk, rel.type, rel.refs); });
      var added = SS.offsetDimensions(sk, 0, 1, 1.5);
      assert(added.length === 1 && sk.rels[added[0]].dir === 'r', 'one radial offset dimension: ' + JSON.stringify(sk.rels));
      assert(SS.analyze(sk).status !== 'over', 'not over defined: ' + JSON.stringify(SS.analyze(sk).rels));
      assert(SS.setRelValue(sk, added[0], 2.5).ok, 'offset edited');
      near(sk.entities[1].w - sk.entities[0].w, 5, 1e-6, 'width difference 2 × 2.5');
      near(sk.entities[1].cx, sk.entities[0].cx, 1e-6, 'same centre'); near(sk.entities[1].a1, sk.entities[0].a1, 1e-6, 'same end');
      return 'ok';
    });
    test('p9-sketch-curves: arc slot relations and dimensions — its centre and cap centres are sketch points (Coincident, Concentric), R and width Smart Dimensions drive it, a fully defined arc slot is black', function () {
      var sk = { entities: [{ t: 'aslot', cx: 0.3, cy: -0.2, r: 19, a0: 28, a1: 152, w: 5 }, { t: 'circle', cx: 0, cy: 0, r: 4 }] };
      var refs = SS.pointRefs(sk, 0).map(function (p) { return p.ref; }).join(',');
      assert(refs === '0.c,0.p1,0.p2', 'point refs ' + refs);
      assert(SS.addRelation(sk, 'concentric', ['0', '1']).ok, 'concentric with the circle');
      assert(SS.addRelation(sk, 'coincident', ['1.c', 'O']).ok, 'circle on the origin');
      sk.dims = [{ e: 0, k: 'r' }, { e: 0, k: 'w' }, { e: 1, k: 'dia' }];
      assert(SS.setDim(sk, 0, 20).ok && SS.setDim(sk, 1, 6).ok, 'R 20, width 6 drive');
      near(sk.entities[0].r, 20, 1e-6, 'R'); near(sk.entities[0].w, 6, 1e-6, 'width');
      near(sk.entities[0].cx, 0, 1e-6, 'concentric x'); near(sk.entities[0].cy, 0, 1e-6, 'concentric y');
      // the cap centres: a horizontal line between them and a distance from the origin fix the sweep
      assert(SS.addRelation(sk, 'horizontal', ['0.p1', '0.p2']).ok, 'cap centres level');
      assert(SS.addRelation(sk, 'distance', ['0.p1', '0.p2'], { value: 20, dir: 'h' }).ok, 'cap centres 20 apart');
      var an = SS.analyze(sk);
      near(Math.abs(sk.entities[0].a1 - sk.entities[0].a0), 2 * Math.asin(10 / 20) * 180 / PI, 1e-6, 'sweep from the chord');
      assert(an.status === 'full' && an.entities[0] === 'full', 'fully defined: ' + an.status + ' / ' + an.entities.join(','));
      near(K.dimValue(sk.entities[0], { k: 'w' }), 6, 1e-9, 'width dimension value');
      assert(K.dimForEntity(sk.entities[0], [0, 20]).k === 'r' && K.dimForEntity(sk.entities[0], [0, -20]).k === 'w', 'Smart Dimension on a side is R, on a cap the width');
      return an.status;
    });
    test('p9-sketch-curves: a polygon with an inscribed circle (`ins`) keeps its corners; its R dimension and setDimValue go to the flats; mirror and offset keep it; .polygon(…, { inscribed: true }) round-trips', function () {
      var p = { t: 'poly', cx: 0, cy: 0, r: 10 / Math.cos(PI / 6), n: 6, rot: 30, ins: true };
      var pts = K.entityPolylines(p)[0].pts;
      near(pts[0][0], 10, 1e-9, 'flat at x = 10 (the circle touches the flats)'); near(Math.hypot(pts[1][0], pts[1][1]), p.r, 1e-9, 'corner radius');
      near(K.dimValue(p, { k: 'r' }), 10, 1e-9, 'R to the flats');
      K.setDimValue(p, { k: 'r' }, 12);
      near(K.dimValue(p, { k: 'r' }), 12, 1e-9, 'R set to 12'); near(p.r, 12 / Math.cos(PI / 6), 1e-9, 'corners follow');
      var m = K.mirrorEntity(p, K.mirrorAxis('x'));
      assert(m.ins === true, 'mirror keeps inscribed');
      var o = SS.offsetEntity(p, 1);
      assert(o.ins === true, 'offset keeps inscribed'); near(K.dimValue(o, { k: 'r' }), 13, 1e-9, 'offset flats 1 further');
      var c = { t: 'poly', cx: 0, cy: 0, r: 10, n: 6, rot: 0 };
      near(K.dimValue(c, { k: 'r' }), 10, 1e-12, 'circumscribed R to the corners');
      var a = build('p.sketch("Front").polygon(0, 0, 11.547005383792516, 6, 30, { inscribed: true }).extrude(2);');
      noErrors(a);
      nearRel(a.mp.volume, 6 * 10 * 10 * Math.tan(PI / 6) * 2, 1e-9, 'hexagon 20 across flats, area 6·a²·tan30°');
      assert(a.model.features[0].entities[0].ins === true, 'builder stores ins');
      assert(/\.polygon\(0, 0, 11\.547005383792516, 6, 30, \{ inscribed: true \}\)/.test(K.generateScript(a.model)), 'script writes { inscribed: true }: ' + K.generateScript(a.model));
      return roundTrip('p.sketch("Front").polygon(0, 0, 11.547005383792516, 6, 30, { inscribed: true }).extrude(2);');
    });
    test('p9-sketch-curves: a straight slot\'s Overall Length dimension (olen) is center to center plus the width; editing it moves the second end; the solver drives it', function () {
      var s = { t: 'slot', x1: 0, y1: 0, x2: 20, y2: 0, w: 6 };
      near(K.dimValue(s, { k: 'olen' }), 26, 1e-12, 'overall 26');
      K.setDimValue(s, { k: 'olen' }, 30);
      near(s.x2, 24, 1e-12, 'center to center 24');
      var threw = false; try { K.setDimValue(s, { k: 'olen' }, 5); } catch (er) { threw = true; }
      assert(threw, 'an overall length under the width is refused');
      var sk = { entities: [{ t: 'slot', x1: 0, y1: 0, x2: 20, y2: 0, w: 6 }], dims: [{ e: 0, k: 'olen' }, { e: 0, k: 'w' }], rels: [{ type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'horizontal', refs: ['0'] }] };
      assert(SS.setDim(sk, 1, 8).ok, 'width 8');
      near(K.dimValue(sk.entities[0], { k: 'olen' }), 26, 1e-6, 'overall length held at 26 while the width changes');
      near(sk.entities[0].x2, 18, 1e-6, 'so the centers come closer');
      assert(SS.analyze(sk).status === 'full', 'fully defined: ' + SS.analyze(sk).status);
      return 'ok';
    });
  })();
  // --- end p9-sketch-curves ---
