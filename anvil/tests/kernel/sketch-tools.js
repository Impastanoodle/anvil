  // ------------------------------------------------------------------ sketch tools: mirror / pattern / trim
  group('sketch tools');
  test('mirrorEntities across the sketch Y axis doubles a profile', function () {
    var r = build('p.sketch("Top").rect(5, -20, 10, 20).circle(30, -10, 4).mirrorEntities("y").extrude(5);');
    noErrors(r);
    var s = r.model.features[0];
    assert(s.entities.length === 4, '4 entities, got ' + s.entities.length);
    assert(s.entities[2].t === 'rect' && near(s.entities[2].x, -15, 1e-9) == null, 'axis-aligned mirror keeps a rect: ' + JSON.stringify(s.entities[2]));
    nearRel(r.mp.volume, 2 * 200 * 5 + 2 * circleArea(4) * 5, 1e-9, 'two rects and two discs');
    nearVec(r.mp.bbox.min, [-34, 0, 0], 1e-6, 'bbox.min'); nearVec(r.mp.bbox.max, [34, 5, 20], 1e-6, 'bbox.max');
  });
  test('mirror across a slanted line turns a rect into a polyline and reflects arcs and polygons', function () {
    var ents = [{ t: 'rect', x: 0, y: 0, w: 10, h: 4 }, { t: 'arc', cx: 0, cy: 0, r: 5, a0: 0, a1: 90 }, { t: 'poly', cx: 20, cy: 0, r: 3, n: 5, rot: 10 }, { t: 'line', x1: 0, y1: 0, x2: 10, y2: 10 }];
    var ax = K.mirrorAxis(3, ents);
    var m = K.mirrorEntity(ents[0], ax);
    assert(m.t === 'polyline' && m.closed && m.pts.length === 4, 'rect → closed polyline: ' + JSON.stringify(m));
    nearVec([m.pts[1][0], m.pts[1][1], 0], [0, 10, 0], 1e-9, 'corner (10,0) reflects to (0,10)');
    var a = K.mirrorEntity(ents[1], ax);
    assert(a.t === 'arc', 'arc stays an arc');
    near(a.a0, 0, 1e-9, 'arc start'); near(a.a1, 90, 1e-9, 'arc end (the quarter arc is symmetric about y = x)');
    var pg = K.mirrorEntity(ents[2], ax);
    nearVec([pg.cx, pg.cy, 0], [0, 20, 0], 1e-9, 'polygon centre'); near(pg.rot, 80, 1e-9, 'polygon rotation reflects as 2φ − rot');
    var self = K.mirrorEntity(ents[3], ax);
    near(self.x2, 10, 1e-9, 'a line on the axis maps to itself');
  });
  test('patternEntities translates every type and keeps profiles separate', function () {
    var r = build('p.sketch("Top").circle(0, 0, 3).patternEntities({ dx: 10, dy: 0, count: 3, dx2: 0, dy2: -10, count2: 2 }).extrude(2);');
    noErrors(r);
    assert(r.model.features[0].entities.length === 6, '6 circles, got ' + r.model.features[0].entities.length);
    nearRel(r.mp.volume, 6 * circleArea(3) * 2, 1e-9, 'volume');
    var s = { t: 'slot', x1: 0, y1: 0, x2: 5, y2: 0, w: 2 }, t = K.translateEntity(s, 1, 2);
    assert(t.x1 === 1 && t.y1 === 2 && t.x2 === 6 && t.y2 === 2 && t.w === 2, 'slot translated: ' + JSON.stringify(t));
  });
  test('trim a line between two crossing lines, and trim its end', function () {
    var ents = [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 10, y1: -5, x2: 10, y2: 5 }, { t: 'line', x1: 20, y1: -5, x2: 20, y2: 5 }];
    var out = K.trimEntity(ents, 0, [15, 0.1]);
    assert(out.length === 4, 'line split in two: ' + out.length);
    var pieces = out.filter(function (e) { return e.y1 === 0 && e.y2 === 0; });
    near(pieces[0].x2, 10, 1e-9, 'first piece ends at the crossing'); near(pieces[1].x1, 20, 1e-9, 'second piece starts at the crossing');
    var end = K.trimEntity(ents, 0, [25, 0]);
    var kept = end.filter(function (e) { return e.y1 === 0 && e.y2 === 0; });
    assert(kept.length === 1 && Math.abs(kept[0].x2 - 20) < 1e-9, 'end trimmed back to the last crossing: ' + JSON.stringify(kept));
  });
  test('trim a circle crossed by a line leaves an arc; a circle nothing crosses is deleted', function () {
    var ents = [{ t: 'circle', cx: 0, cy: 0, r: 10 }, { t: 'line', x1: -20, y1: 0, x2: 20, y2: 0 }];
    var out = K.trimEntity(ents, 0, [0, 10]);
    var arc = out.filter(function (e) { return e.t === 'arc'; })[0];
    assert(arc, 'circle became an arc: ' + JSON.stringify(out));
    near(arc.a0, 180, 1e-9, 'arc from 180°'); near(arc.a1, 360, 1e-9, 'to 360° (the lower half remains)');
    var lone = K.trimEntity([{ t: 'circle', cx: 0, cy: 0, r: 10 }], 0, [0, 10]);
    assert(lone.length === 0, 'unconnected circle deleted');
  });
  test('r15/trimtan15: trim a circle between two lines tangent to it removes only the arc between the tangent points (a tangent touches at one point; the whole circle used to go)', function () {
    var r = 10, Q = [30, 0], al = Math.acos(r / 30), T1 = [r * Math.cos(al), r * Math.sin(al)], T2 = [r * Math.cos(-al), r * Math.sin(-al)];
    var ents = [{ t: 'circle', cx: 0, cy: 0, r: r }, { t: 'line', x1: T1[0], y1: T1[1], x2: Q[0], y2: Q[1] }, { t: 'line', x1: T2[0], y1: T2[1], x2: Q[0], y2: Q[1] }];
    var out = K.trimEntity(ents, 0, [10, 0]);
    var arc = out.filter(function (e) { return e.t === 'arc'; })[0];
    assert(arc && out.length === 3, 'the circle became an arc and both lines stay: ' + JSON.stringify(out));
    near(arc.a0, al * 180 / Math.PI, 1e-6, 'the arc starts at the upper tangent point'); near(arc.a1, 360 - al * 180 / Math.PI, 1e-6, 'and ends at the lower one');
    var sk = { entities: JSON.parse(JSON.stringify(ents)) };
    var n = SketchSolver.powerTrim(sk, [12, 0.5], [8, -0.5], null, null);
    assert(n === 1 && sk.entities.length === 3 && sk.entities[0].t === 'arc', 'Power trim removed the one span: ' + n + ' ' + JSON.stringify(sk.entities[0]));
    near(sk.entities[0].a0, al * 180 / Math.PI, 1e-3, 'Power trim: the arc starts at the upper tangent point');
  });
  test('r15/inches15: an inch document with no Image Quality of its own is built at the mm default scaled to inches (0.002 in), not 0.05 in', function () {
    function faces(units) { var m = K.newModel('T'); K.runScript(m, 'p.units("' + units + '"); p.sketch("Top").circle(0, 0, 0.5).extrude(0.1);'); var b = K.rebuild(m); return K.meshFromBody(b.body).faces.length; }
    var fin = faces('in'), fmm = faces('mm');
    // rfFE2: 32 in mm, not 16: the 12° angular limit's floor
    assert(fin === 42 && fmm === 34, 'a Ø1 in cylinder has ' + (fin - 2) + ' facets, the same numbers in mm ' + (fmm - 2) + ' (expected 40 and 32)');
  });
  test('trim a rectangle edge inside a circle gives a closed keyhole profile', function () {
    // rect 0..40 × 0..20, circle r=6 centred on the top edge at (20, 20): trim the edge inside the circle and the arc inside the rect
    var r = build('var s = p.sketch("Top").rect(0, 0, 40, 20).circle(20, 20, 6);\ns.trim(0, [20, 20]);\ns.trim(1, [20, 16]);\ns.extrude(3);');
    noErrors(r);
    var prof = K.sketchProfile(r.model.features[0]);
    assert(prof.loops.length === 1, 'one closed loop, got ' + prof.loops.length + ' (' + JSON.stringify(prof.warnings) + ')');
    var chord = 2 * Math.sqrt(36), segArea = (Math.PI * 36) / 2; // half disc above the edge
    nearRel(r.mp.volume, (800 + segArea) * 3, 0.01, 'rect plus the half disc bulge');
    consistentVolume(r);
  });
  test('trim explodes a slot into lines and arcs; open polyline splits in two', function () {
    var out = K.trimEntity([{ t: 'slot', x1: 0, y1: 0, x2: 20, y2: 0, w: 6 }, { t: 'line', x1: 10, y1: -10, x2: 10, y2: 10 }], 0, [5, 3]);
    var kinds = out.map(function (e) { return e.t; }).sort().join(',');
    assert(kinds === 'arc,arc,line,line,line', 'top side trimmed at x=10: ' + kinds);
    var pl = K.trimEntity([{ t: 'polyline', pts: [[0, 0], [10, 0], [10, 10], [20, 10]], closed: false }, { t: 'line', x1: 5, y1: -5, x2: 5, y2: 5 }, { t: 'line', x1: 10, y1: 5, x2: 20, y2: 5 }], 0, [10, 3]);
    var parts = pl.filter(function (e) { return e.t === 'polyline'; });
    assert(parts.length === 2 && parts[0].pts.length === 2 && parts[1].pts.length === 3, 'two open polylines (the trimmed edge starts at the shared vertex): ' + JSON.stringify(parts));
  });

