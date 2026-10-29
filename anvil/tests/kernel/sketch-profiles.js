  // ------------------------------------------------------------------ sketch profiles
  group('sketch profiles');
  test('rect entity gives one CCW outer loop', function () {
    var pr = K.sketchProfile({ entities: [{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }] });
    assert(pr.loops.length === 1, 'loops = ' + pr.loops.length);
    assert(!pr.loops[0].hole, 'outer should not be a hole');
    near(K.signedArea(pr.loops[0].pts), 8, 1e-9, 'area');
  });
  test('circle inside rect is detected as a hole', function () {
    var pr = K.sketchProfile({ entities: [{ t: 'rect', x: -10, y: -10, w: 20, h: 20 }, { t: 'circle', cx: 0, cy: 0, r: 3 }] });
    assert(pr.loops.length === 2, 'loops = ' + pr.loops.length);
    var holes = pr.loops.filter(function (l) { return l.hole; });
    assert(holes.length === 1, 'holes = ' + holes.length);
    nearRel(K.signedArea(holes[0].pts), polyCircleArea(3), 1e-9, 'hole area (CCW)');
  });
  test('island inside a hole is solid again (depth 2)', function () {
    var pr = K.sketchProfile({ entities: [
      { t: 'rect', x: -10, y: -10, w: 20, h: 20 }, { t: 'circle', cx: 0, cy: 0, r: 5 }, { t: 'circle', cx: 0, cy: 0, r: 2 }
    ] });
    var depths = pr.loops.map(function (l) { return l.depth; }).sort();
    assert(depths.join(',') === '0,1,2', 'depths = ' + depths.join(','));
    assert(pr.loops.filter(function (l) { return l.hole; }).length === 1, 'exactly one hole');
  });
  test('four lines chain into one closed loop', function () {
    var pr = K.sketchProfile({ entities: [
      { t: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }, { t: 'line', x1: 5, y1: 5, x2: 0, y2: 5 },
      { t: 'line', x1: 5, y1: 0, x2: 5, y2: 5 }, { t: 'line', x1: 0, y1: 5, x2: 0, y2: 0 }
    ] });
    assert(pr.loops.length === 1, 'loops = ' + pr.loops.length);
    near(Math.abs(K.signedArea(pr.loops[0].pts)), 25, 1e-9, 'area');
    assert(pr.warnings.length === 0, 'warnings: ' + pr.warnings.join(' '));
  });
  test('lines and an arc chain into a D-shaped loop', function () {
    var pr = K.sketchProfile({ entities: [
      { t: 'line', x1: 0, y1: -5, x2: 0, y2: 5 }, { t: 'arc', cx: 0, cy: 0, r: 5, a0: -90, a1: 90 }
    ] });
    assert(pr.loops.length === 1, 'loops = ' + pr.loops.length + ' warnings: ' + pr.warnings.join(' '));
    // 180° of a radius-5 arc is sampled with 9 segments, so the chordal area is ~2% under the true half-disc
    nearRel(Math.abs(K.signedArea(pr.loops[0].pts)), Math.PI * 25 / 2, 0.03, 'half-disc area');
  });
  test('an open contour is ignored with a warning', function () {
    var pr = K.sketchProfile({ entities: [{ t: 'line', x1: 0, y1: 0, x2: 5, y2: 0 }, { t: 'line', x1: 5, y1: 0, x2: 5, y2: 5 }] });
    assert(pr.loops.length === 0, 'loops = ' + pr.loops.length);
    assert(pr.warnings.length === 1 && /open contour/i.test(pr.warnings[0]), 'warning: ' + pr.warnings.join(' '));
  });
  test('construction entities do not contribute to the profile', function () {
    var pr = K.sketchProfile({ entities: [{ t: 'rect', x: 0, y: 0, w: 4, h: 2 }, { t: 'circle', cx: 2, cy: 1, r: 0.5, construction: true }] });
    assert(pr.loops.length === 1, 'loops = ' + pr.loops.length);
  });
  test('slot, polygon and centre-rect entities are closed loops with the right area', function () {
    // slot ends are half circles of segsForRadius(2) / 2 chords each (40-gon at the 10° angular limit, rfFE2), so
    // compare with the polygonal area
    var slot = K.sketchProfile({ entities: [{ t: 'slot', x1: 0, y1: 0, x2: 10, y2: 0, w: 4 }] });
    var sn = K.segsForRadius(2);
    nearRel(K.signedArea(slot.loops[0].pts), 10 * 4 + sn / 2 * 4 * Math.sin(2 * Math.PI / sn), 1e-6, 'slot area (' + sn + '-gon ends)');
    var sl = slot.loops[0].pts, tangent = sl.filter(function (q) { return Math.abs(Math.abs(q[1]) - 2) < 1e-9 && (Math.abs(q[0]) < 1e-9 || Math.abs(q[0] - 10) < 1e-9); });
    assert(tangent.length === 4, 'slot should keep all 4 tangent points where the arcs meet the straight sides (got ' + tangent.length + ')');
    var hex = K.sketchProfile({ entities: [{ t: 'poly', cx: 0, cy: 0, r: 2, n: 6 }] });
    near(K.signedArea(hex.loops[0].pts), 6 / 2 * 4 * Math.sin(Math.PI / 3), 1e-9, 'hexagon area');
    var cr = K.sketchProfile({ entities: [{ t: 'crect', cx: 1, cy: 1, w: 6, h: 4 }] });
    near(K.signedArea(cr.loops[0].pts), 24, 1e-9, 'centre-rect area');
  });
  test('entitySnapPoints returns centre and endpoints', function () {
    var sp = K.entitySnapPoints({ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 });
    assert(sp.length === 3 && sp[2][0] === 2, 'line snaps: ' + JSON.stringify(sp));
    var cs = K.entitySnapPoints({ t: 'circle', cx: 1, cy: 1, r: 2 });
    assert(cs.length === 5 && cs[0][0] === 1 && cs[1][0] === 3, 'circle snaps: ' + JSON.stringify(cs));
  });

