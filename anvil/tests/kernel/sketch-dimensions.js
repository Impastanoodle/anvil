  // ------------------------------------------------------------------ sketch dimensions (Smart Dimension)
  group('dimensions');
  test('dimGeometry reads length, horizontal and vertical distances of a line', function () {
    var e = { t: 'line', x1: 0, y1: 0, x2: 30, y2: 40 };
    near(K.dimValue(e, { k: 'len' }), 50, 1e-9, 'len');
    near(K.dimValue(e, { k: 'dx' }), 30, 1e-9, 'dx');
    near(K.dimValue(e, { k: 'dy' }), 40, 1e-9, 'dy');
    var g = K.dimGeometry(e, { k: 'dx' });
    assert(g.type === 'linear' && g.dir[0] === 1 && g.dir[1] === 0, 'dx measures along +x');
    assert(K.dimGeometry(e, { k: 'dia' }) === null, 'a line has no diameter');
    assert(K.dimGeometry({ t: 'line', x1: 1, y1: 1, x2: 1, y2: 1 }, { k: 'len' }) === null, 'zero-length line has no dimension');
  });
  test('dimGeometry on rectangles, circles, arcs, slots and polylines', function () {
    var r = { t: 'rect', x: 10, y: 20, w: 40, h: 15 };
    near(K.dimValue(r, { k: 'w' }), 40, 1e-9, 'rect w'); near(K.dimValue(r, { k: 'h' }), 15, 1e-9, 'rect h');
    var top = K.dimGeometry(r, { k: 'w', i: 2 });
    near(top.P[1], 35, 1e-9, 'edge 2 anchors on the top edge');
    var c = { t: 'crect', cx: 0, cy: 0, w: 8, h: 6 };
    near(K.dimValue(c, { k: 'w' }), 8, 1e-9, 'crect w'); near(K.dimValue(c, { k: 'h' }), 6, 1e-9, 'crect h');
    var ci = K.dimGeometry({ t: 'circle', cx: 5, cy: 5, r: 4 }, { k: 'dia' });
    assert(ci.type === 'radial' && ci.prefix === '⌀', 'circle is radial with a diameter prefix');
    near(ci.value, 8, 1e-9, 'diameter');
    near(K.dimValue({ t: 'arc', cx: 0, cy: 0, r: 7, a0: 0, a1: 90 }, { k: 'r' }), 7, 1e-9, 'arc R');
    near(K.dimValue({ t: 'poly', cx: 0, cy: 0, r: 9, n: 6 }, { k: 'r' }), 9, 1e-9, 'polygon R');
    var s = { t: 'slot', x1: 0, y1: 0, x2: 30, y2: 0, w: 10 };
    near(K.dimValue(s, { k: 'len' }), 30, 1e-9, 'slot length'); near(K.dimValue(s, { k: 'w' }), 10, 1e-9, 'slot width');
    var pl = { t: 'polyline', pts: [[0, 0], [10, 0], [10, 5]], closed: false };
    near(K.dimValue(pl, { k: 'seg', i: 1 }), 5, 1e-9, 'polyline segment 1');
    assert(K.dimGeometry(pl, { k: 'seg', i: 2 }) === null, 'an open polyline has no closing segment');
    near(K.dimValue({ t: 'polyline', pts: [[0, 0], [10, 0], [10, 5]], closed: true }, { k: 'seg', i: 2 }), Math.hypot(10, 5), 1e-9, 'closed polyline closing segment');
  });
  test('setDimValue moves one entity so the dimension reads the new value', function () {
    var e = { t: 'line', x1: 10, y1: 10, x2: 40, y2: 50 };
    K.setDimValue(e, { k: 'len' }, 100);
    near(e.x1, 10, 1e-9, 'start x kept'); near(e.y1, 10, 1e-9, 'start y kept');
    near(Math.hypot(e.x2 - e.x1, e.y2 - e.y1), 100, 1e-9, 'new length');
    near((e.y2 - e.y1) / (e.x2 - e.x1), 4 / 3, 1e-9, 'direction kept');
    var h = { t: 'line', x1: 20, y1: 0, x2: 5, y2: 0 };
    K.setDimValue(h, { k: 'dx' }, 8);
    near(h.x2, 12, 1e-9, 'dx keeps the line pointing -x');
    var r = { t: 'rect', x: 10, y: 0, w: 40, h: 20 };
    K.setDimValue(r, { k: 'w', i: 3 }, 30);
    near(r.x, 20, 1e-9, 'driving the left edge keeps the right edge at 50'); near(r.w, 30, 1e-9, 'rect w');
    K.setDimValue(r, { k: 'h', i: 2 }, 12);
    near(r.y, 8, 1e-9, 'driving the top edge keeps the bottom edge at 20'); near(r.h, 12, 1e-9, 'rect h');
    var c = { t: 'circle', cx: 0, cy: 0, r: 4 };
    K.setDimValue(c, { k: 'dia' }, 10);
    near(c.r, 5, 1e-9, 'diameter 10 -> r 5');
    var s = { t: 'slot', x1: 0, y1: 0, x2: 0, y2: 20, w: 6 };
    K.setDimValue(s, { k: 'len' }, 35); K.setDimValue(s, { k: 'w' }, 8);
    near(s.y2, 35, 1e-9, 'slot centre 2 moved along the slot'); near(s.w, 8, 1e-9, 'slot width');
    var open = { t: 'polyline', pts: [[0, 0], [10, 0], [10, 5], [20, 5]], closed: false };
    K.setDimValue(open, { k: 'seg', i: 0 }, 15);
    assert(open.pts[1][0] === 15 && open.pts[2][0] === 15 && open.pts[3][0] === 25, 'open chain carried along: ' + JSON.stringify(open.pts));
    var closed = { t: 'polyline', pts: [[0, 0], [10, 0], [10, 5], [0, 5]], closed: true };
    K.setDimValue(closed, { k: 'seg', i: 0 }, 12);
    assert(closed.pts[1][0] === 12 && closed.pts[2][0] === 10, 'closed loop moves only the far vertex: ' + JSON.stringify(closed.pts));
    var threw = false;
    try { K.setDimValue(c, { k: 'dia' }, -3); } catch (err) { threw = /positive/.test(err.message); }
    assert(threw, 'negative values are rejected with a clear message');
  });
  test('dimForEntity picks the dimension a click means', function () {
    var l = { t: 'line', x1: 0, y1: 0, x2: 30, y2: 40 };
    assert(K.dimForEntity(l, [15, 60]).k === 'dx', 'above a slanted line: horizontal');
    assert(K.dimForEntity(l, [50, 20]).k === 'dy', 'beside a slanted line: vertical');
    assert(K.dimForEntity(l, [15, 20]).k === 'len', 'on the line: aligned length');
    assert(K.dimForEntity({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, [15, 60]).k === 'len', 'a horizontal line is always its length');
    var r = K.dimForEntity({ t: 'rect', x: 0, y: 0, w: 40, h: 20 }, [20, 19]);
    assert(r.k === 'w' && r.i === 2, 'near the top edge: width on edge 2, got ' + JSON.stringify(r));
    var r2 = K.dimForEntity({ t: 'rect', x: 0, y: 0, w: 40, h: 20 }, [39, 10]);
    assert(r2.k === 'h' && r2.i === 1, 'near the right edge: height on edge 1');
    assert(K.dimForEntity({ t: 'circle', cx: 0, cy: 0, r: 3 }, [0, 3]).k === 'dia', 'circle: diameter');
    assert(K.dimForEntity({ t: 'slot', x1: 0, y1: 0, x2: 30, y2: 0, w: 10 }, [15, 5]).k === 'len', 'slot side: length');
    assert(K.dimForEntity({ t: 'slot', x1: 0, y1: 0, x2: 30, y2: 0, w: 10 }, [35, 0]).k === 'w', 'slot cap: width');
    var p = K.dimForEntity({ t: 'polyline', pts: [[0, 0], [10, 0], [10, 5]], closed: false }, [10, 2]);
    assert(p.k === 'seg' && p.i === 1, 'polyline: nearest segment');
    assert(K.dimForEntity({ t: 'point', x: 0, y: 0 }, [0, 0]) === null, 'a point has no dimension');
  });
  test('SketchBuilder.dim drives the entity, is kept in the model and round-trips through generateScript', function () {
    var r = build('p.sketch("Top").rect(0, -20, 40, 20).dim(0, "w", { i: 2, off: 6, value: 50 }).dim(0, "h", { i: 1, off: 8 }).extrude(10);');
    noErrors(r);
    near(r.mp.volume, 50 * 20 * 10, 1e-6, 'width driven to 50 before the extrude');
    var sk = r.model.features[0];
    assert(sk.dims && sk.dims.length === 2 && sk.dims[0].k === 'w' && sk.dims[0].off === 6 && sk.dims[1].i === 1, 'dims stored: ' + JSON.stringify(sk.dims));
    var code = K.generateScript(r.model);
    assert(/\.dim\(0, "w", \{ i: 2, off: 6 \}\)/.test(code), 'script emits the placed dimension: ' + code);
    var m2 = K.newModel('RT'); K.runScript(m2, code);
    assert(JSON.stringify(m2.features[0].dims) === JSON.stringify(sk.dims), 'dims survive the round-trip');
    assert(JSON.stringify(m2.features[0].entities) === JSON.stringify(sk.entities), 'entities survive the round-trip');
    var bad = false;
    try { build('p.sketch("Top").circle(0, 0, 5).dim(0, "len");'); } catch (err) { bad = /does not apply/.test(err.message); }
    assert(bad, 'a kind that does not fit the entity is rejected');
  });

