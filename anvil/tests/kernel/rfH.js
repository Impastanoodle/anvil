  // ---- rfH (lane H, 2026-10-12): the Polygon and Straight Slot tools draw lines and arcs, as SolidWorks does
  (function () {
    var SS = SketchSolver;
    function copy(o) { return JSON.parse(JSON.stringify(o)); }
    function cornerRadii(s, n, ci) { var c = s.entities[ci]; return s.entities.slice(0, n).map(function (l) { return Math.hypot(l.x1 - c.cx, l.y1 - c.cy); }); }
    test('rfH: explodePoly — a circumscribed hexagon becomes six lines and a construction circle held by one Polygon relation (4 degrees of freedom: centre, size, turn); a new circle diameter takes every corner onto it; an inscribed one\'s circle touches the flats and its R dimension becomes the circle\'s diameter', function () {
      var s = { entities: [{ t: 'poly', cx: 0, cy: 0, r: 10, n: 6, rot: 15 }] };
      assert(SS.explodePoly(s, 0) === 0, 'exploded');
      var E = s.entities, pg = s.rels.filter(function (x) { return x.type === 'polygon'; });
      assert(E.length === 7 && E.slice(0, 6).every(function (e) { return e.t === 'line' && !e.construction; }) && E[6].t === 'circle' && E[6].construction && E[6].r === 10, 'six lines and the circle: ' + JSON.stringify(E));
      assert(pg.length === 1 && pg[0].refs.join() === '6,0,1,2,3,4,5' && !pg[0].ins && s.rels.filter(function (x) { return x.type === 'coincident'; }).length === 6, 'one Polygon relation, six corners: ' + JSON.stringify(s.rels));
      var an = SS.analyze(s);
      assert(an.dof === 4 && an.conflicts === 0 && an.redundant === 0, 'centre, size, turn free: ' + JSON.stringify([an.status, an.dof]));
      E[6].r = 12; SS.solve(s, { mob: { 6: 1e-4 } });
      cornerRadii(s, 6, 6).forEach(function (d, k) { near(d, s.entities[6].r, 1e-7, 'corner ' + k + ' on the circle'); });
      var sides = s.entities.slice(0, 6).map(function (l) { return Math.hypot(l.x2 - l.x1, l.y2 - l.y1); });
      sides.forEach(function (d, k) { near(d, sides[0], 1e-7, 'side ' + k + ' equal'); });
      // inscribed, centred on the origin, R 8 to the flats dimensioned
      var t = { entities: [{ t: 'poly', cx: 0, cy: 0, r: 8 / Math.cos(Math.PI / 5), n: 5, rot: 36, ins: true }], rels: [{ type: 'coincident', refs: ['0.c', 'O'] }], dims: [{ e: 0, k: 'r', ang: 45, off: 12 }] };
      SS.explodePoly(t, 0);
      var c = t.entities[5], an2 = SS.analyze(t);
      near(c.r, 8, 1e-12, 'the circle touches the flats');
      assert(t.rels.some(function (x) { return x.type === 'polygon' && x.ins; }) && t.rels.some(function (x) { return x.type === 'coincident' && x.refs.join() === '5.c,O'; }), 'inscribed Polygon, centre on the origin: ' + JSON.stringify(t.rels));
      assert(t.dims.length === 1 && t.dims[0].e === 5 && t.dims[0].k === 'dia' && t.dims[0].ang === 45 && t.dims[0].off === 12, 'R 8 -> the circle\'s Ø16: ' + JSON.stringify(t.dims));
      assert(an2.dof === 1 && an2.conflicts === 0 && an2.redundant === 0, 'only the turn left: ' + JSON.stringify([an2.status, an2.dof]));
      var mid = t.entities.slice(0, 5).map(function (l) { return Math.hypot((l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2); });
      mid.forEach(function (d, k) { near(d, 8, 1e-9, 'side ' + k + ' at the flats'); });
      return 'dof ' + an.dof + ', inscribed dof ' + an2.dof;
    });
    test('rfH: the Polygon relation round-trips through the script (rel("polygon", refs, { ins: true })) and a Sketch Fillet on one corner leaves the polygon regular, its corner a virtual sharp', function () {
      var m = K.newModel('rfH'), b = new K.Builder(m), sk = b.sketch('Front');
      sk.line(10, 0, 0, 10).line(0, 10, -10, 0).line(-10, 0, 0, -10).line(0, -10, 10, 0).circle(0, 0, 10 * Math.cos(Math.PI / 4))
        .construction([4]).rel('coincident', ['0.p2', '1.p1']).rel('coincident', ['1.p2', '2.p1']).rel('coincident', ['2.p2', '3.p1']).rel('coincident', ['3.p2', '0.p1'])
        .rel('polygon', ['4', '0', '1', '2', '3'], { ins: true });
      var f = m.features[0], pg = f.rels.filter(function (x) { return x.type === 'polygon'; })[0];
      assert(pg && pg.ins, 'polygon relation with ins: ' + JSON.stringify(f.rels));
      var code = K.generateScript(m);
      assert(/\.rel\("polygon", \["4","0","1","2","3"\], \{"ins":true\}\)/.test(code), 'script form: ' + code);
      var m2 = K.newModel('rt'); K.runScript(m2, code);
      assert(JSON.stringify(m2.features[0].rels) === JSON.stringify(f.rels) && JSON.stringify(m2.features[0].entities) === JSON.stringify(f.entities), 'round trip identical');
      var s = { entities: [{ t: 'poly', cx: 0, cy: 0, r: 15, n: 6, rot: 0 }] };
      SS.explodePoly(s, 0);
      var res = SS.filletPair(s, { i: 5, uvi: [14.5, -0.8], j: 0, uvj: [14.5, 0.8] }, 2);
      assert(res.ok && res.sharp >= 0, 'filleted with a virtual sharp: ' + JSON.stringify(res));
      var sp = s.entities[res.sharp];
      near(sp.x, 15, 1e-9, 'sharp x'); near(sp.y, 0, 1e-9, 'sharp y');
      var an = SS.analyze(s);
      assert(an.conflicts === 0 && an.redundant === 0, 'solved: ' + JSON.stringify([an.status, an.dof]));
      s.entities[6].r = 18; SS.solve(s, { mob: { 6: 1e-4 } });
      var C = s.entities[6], R = C.r;
      assert(R > 17, 'the circle grew: ' + R);
      near(Math.hypot(s.entities[res.sharp].x - C.cx, s.entities[res.sharp].y - C.cy), R, 1e-6, 'the sharp follows the circle');
      near(Math.hypot(s.entities[2].x1 - C.cx, s.entities[2].y1 - C.cy), R, 1e-6, 'an untouched corner too');
      return 'fillet arc ' + res.arc + ', sharp ' + res.sharp;
    });
  })();
  // --- end rfH ---
