  // ------------------------------------------------------------------ rfY: arc slots as real entities, slot cap drags
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfY: Arc Slot exploded as SolidWorks draws it, slot end-cap and side drags');
    var SS = SketchSolver, PI = Math.PI;
    function aslotArea(r, sweepDeg, w) { return sweepDeg * PI / 180 * r * w + PI * w * w / 4; }
    function arcScript(s) {
      var code = 'p.sketch("Front")';
      s.entities.forEach(function (e) { code += '.arc(' + [e.cx, e.cy, e.r, e.a0, e.a1].join(', ') + ')'; });
      return code + '.construction([4]).extrude(5);';
    }
    test('rfY: explodeSlot of an arc slot gives the outer arc, an end arc, the inner arc, an end arc and a construction arc: Coincident / Tangent joins, nothing redundant, 6 degrees of freedom; refs and dimensions follow; its extrude is the exact arc-slot volume', function () {
      var s = { entities: [{ t: 'aslot', cx: 0, cy: 0, r: 20, a0: 30, a1: 150, w: 6 }, { t: 'point', x: 0, y: 0 }], rels: [{ type: 'coincident', refs: ['0.c', '1'] }], dims: [{ e: 0, k: 'r' }, { e: 0, k: 'w' }] };
      assert(SS.explodeSlot(s, 0) === 0, 'exploded');
      var E = s.entities;
      assert(E.length === 6 && E.slice(0, 5).every(function (e) { return e.t === 'arc'; }) && E[4].construction && E[5].t === 'point', 'five arcs then the point ' + JSON.stringify(E));
      near(E[0].r, 23, 1e-12, 'outer'); near(E[2].r, 17, 1e-12, 'inner'); near(E[1].r, 3, 1e-12, 'cap'); near(E[3].r, 3, 1e-12, 'cap');
      assert(s.rels.some(function (r) { return r.type === 'coincident' && r.refs.join() === '4.c,5'; }), 'the centre ref follows to the construction arc ' + JSON.stringify(s.rels[0]));
      assert(s.dims.length === 1 && s.dims[0].e === 4 && s.dims[0].k === 'r', 'R on the construction arc ' + JSON.stringify(s.dims));
      assert(s.rels.some(function (r) { return r.type === 'distance' && r.dir === 'r' && r.refs.join() === '2,0' && r.v === 6; }), 'the width between inner and outer');
      var an = SS.analyze({ entities: E.slice(0, 5), rels: s.rels.filter(function (r) { return r.refs.every(function (x) { return !/^5/.test(x); }) && r.type !== 'distance'; }) });
      assert(an.redundant === 0 && an.conflicts === 0 && an.dof === 6, 'dof 6, nothing over defined: ' + JSON.stringify(an));
      var a = build(arcScript({ entities: E.slice(0, 5) }));
      noErrors(a);
      nearRel(a.mp.volume, aslotArea(20, 120, 6) * 5, 1e-9, 'extrude volume');
      return an.dof + ' dof, ' + fmt(a.mp.volume) + ' mm³';
    });
    test('rfY: dragging an arc slot\'s or straight slot\'s end cap (opts.cap) keeps its radius and moves its centre; slotCap / slotAxisOf find the caps and the centre line; a free arc is no cap', function () {
      var s = { entities: [{ t: 'slot', x1: 10, y1: 0, x2: 30, y2: 0, w: 6 }, { t: 'arc', cx: -30, cy: 0, r: 5, a0: 0, a1: 180 }] };
      SS.explodeSlot(s, 0);
      assert(SS.slotCap(s, 1) && SS.slotCap(s, 3) && !SS.slotCap(s, 5), 'caps 1 and 3, not the free arc');
      assert(SS.slotAxisOf(s, 0) === 4 && SS.slotAxisOf(s, 2) === 4 && SS.slotAxisOf(s, 5) === -1, 'sides hold the centerline');
      var start = JSON.parse(JSON.stringify(s.entities));
      assert(SS.drag(s, '1', [7, 3], start, { cap: true }).ok, 'drag');
      near(s.entities[1].r, 3, 1e-9, 'cap radius kept'); near(s.entities[3].r, 3, 1e-9, 'other cap');
      near(s.entities[1].cx, 37, 1e-6, 'cap centre x'); near(s.entities[1].cy, 3, 1e-6, 'cap centre y');
      near(s.entities[3].cx, 10, 0.01, 'the other end stays (about: nothing pins it)');
      start = JSON.parse(JSON.stringify(s.entities));
      assert(SS.drag(s, '0', [0, 0], start, { hold: 4 }).ok, 'side drag (no move)');
      var a = { entities: [{ t: 'aslot', cx: 0, cy: 0, r: 20, a0: 0, a1: 90, w: 4 }] };
      SS.explodeSlot(a, 0);
      assert(SS.slotCap(a, 1) && SS.slotCap(a, 3) && !SS.slotCap(a, 0) && SS.slotAxisOf(a, 0) === 4, 'arc slot caps and axis');
      start = JSON.parse(JSON.stringify(a.entities));
      assert(SS.drag(a, '1', [-5, -2], start, { cap: true }).ok, 'arc slot cap drag');
      near(a.entities[1].r, 2, 1e-9, 'cap radius kept'); near(a.entities[0].r - a.entities[2].r, 4, 1e-9, 'width kept');
      assert(a.entities[4].a1 - a.entities[4].a0 > 90, 'the sweep grew: ' + (a.entities[4].a1 - a.entities[4].a0));
      var an = SS.analyze(a);
      assert(an.redundant === 0 && an.conflicts === 0, 'still consistent ' + JSON.stringify(an.rels));
      return 'cap at ' + fmt(s.entities[1].cx) + ', arc sweep ' + fmt(a.entities[4].a1 - a.entities[4].a0) + '°';
    });
  })();
  // --- end rfY ---
