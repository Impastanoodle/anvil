  // --- rfJH (2026-11-05, lane sketchgaps): Sketch tab gaps against SolidWorks. Autodimension / Fully Define a straight
  // slot by its centre-to-centre length and centre position; Blocks ▸ Add/Remove and Rebuild (Kernel.blockAddRemove,
  // rebuildBlocks); text along a spline keeps the spline's curvature controls and conic rho (Kernel.textPathOf). ---
  (function () {
    group('rfJH: sketch gaps vs SolidWorks (slot Autodimension, Blocks Add/Remove / Rebuild, text on a curvature-controlled spline)');
    var S = SketchSolver, K = Kernel;
    function rfJHSlot(explode, x1, y1, x2, y2) {
      var f = { entities: [{ t: 'slot', x1: x1, y1: y1, x2: x2, y2: y2, w: 0.5 }] };
      if (explode) S.explodeSlot(f, 0);
      return f;
    }
    function rfJHDists(f) { return (f.rels || []).filter(function (r) { return r.type === 'distance'; }); }
    function rfJHDesc(f) { return rfJHDists(f).map(function (r) { return r.refs.join('-') + ' ' + (r.dir || '') + ' ' + r.v; }).join(', '); }

    // rfMM (2026-11-13): SolidWorks' measured rule (head-tools/sw-reference/ref3_auto.py, test-reports/2026-11-02-unchecked-items.md
    // row 10: a 2.5 → 3.5 slot by x 2.5 and its centre 3.0): the centre point and the first end centre, no centre-to-centre length
    test('rfJH: Autodimension of a drawn straight slot 1.75 → 4.25 at y 1 (inch): as SolidWorks, its centre 3.0 / 1.0 and its first end centre 1.75 from the origin, no centre-to-centre length; Fully Defined', function () {
      var f = rfJHSlot(true, 1.75, 1, 4.25, 1), r = S.fullyDefine(f, { hScheme: 'baseline', vScheme: 'baseline', units: 'in' });
      assert(r.status === 'full', 'status ' + r.status);
      assert(!(f.dims || []).some(function (d) { return d.k === 'len'; }), 'no centre-to-centre length: ' + JSON.stringify(f.dims));
      var d = rfJHDists(f);
      assert(d.length === 3, 'three positions: ' + rfJHDesc(f));
      near(d.filter(function (q) { return q.dir === 'h' && q.refs[1] === '4.mid'; })[0].v, 3, 1e-12, 'centre x'); near(d.filter(function (q) { return q.dir === 'v' && q.refs[1] === '4.mid'; })[0].v, 1, 1e-12, 'centre y');
      near(d.filter(function (q) { return q.dir === 'h' && q.refs[1] === '4.p1'; })[0].v, 1.75, 1e-12, 'first end centre x');
      assert((f.rels || []).some(function (q) { return q.type === 'horizontal' && q.refs.join() === '4'; }), 'Horizontal on the slot centerline ' + JSON.stringify(f.rels));
    });
    test('rfJH: the same for a slot entity, in Chain and Ordinate; a slot at an angle: centre, then the first end centre for its length and turn (Fully Defined)', function () {
      var f = rfJHSlot(false, 1.75, 1, 4.25, 1);
      assert(S.fullyDefine(f, { units: 'in' }).status === 'full', 'entity');
      assert(!f.dims.some(function (q) { return q.k === 'len'; }) && rfJHDists(f).length === 3 && rfJHDists(f).every(function (q) { return q.refs[1] === '0.c' || q.refs[1] === '0.p1'; }), 'entity: ' + rfJHDesc(f) + ' ' + JSON.stringify(f.dims));
      f = rfJHSlot(true, 1.75, 1, 4.25, 1);
      assert(S.fullyDefine(f, { scheme: 'chain', units: 'in' }).status === 'full', 'chain');
      assert(rfJHDists(f).every(function (q) { return q.refs[1] === '4.mid' || q.refs[1] === '4.p1'; }), 'chain: ' + rfJHDesc(f));
      f = rfJHSlot(true, 1.75, 1, 4.25, 1);
      assert(S.fullyDefine(f, { scheme: 'ordinate', units: 'in' }).status === 'full', 'ordinate');
      var od = rfJHDists(f);
      assert(od.length === 3 && od.every(function (q) { return q.ord != null && (q.refs[1] === '4.mid' || q.refs[1] === '4.p1'); }), 'ordinate: ' + rfJHDesc(f));
      f = rfJHSlot(true, 1, 1, 3, 2);
      assert(S.fullyDefine(f, { units: 'in' }).status === 'full', 'angled');
      var ad = rfJHDists(f);
      assert(ad.filter(function (q) { return q.refs[1] === '4.mid'; }).length === 2 && ad.filter(function (q) { return q.refs[1] === '4.p1'; }).length === 2 && ad.length === 4, 'angled: ' + rfJHDesc(f));
    });
    test('rfJH: a plate with a slot and a hole: the slot still gets centre + first end centre, the plate its corners, all Fully Defined', function () {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 6, y2: 0 }, { t: 'line', x1: 6, y1: 0, x2: 6, y2: 3 }, { t: 'line', x1: 6, y1: 3, x2: 0, y2: 3 }, { t: 'line', x1: 0, y1: 3, x2: 0, y2: 0 },
        { t: 'slot', x1: 1.75, y1: 1, x2: 4.25, y2: 1, w: 0.5 }, { t: 'circle', cx: 5, cy: 2, r: 0.25 }],
      rels: [{ type: 'coincident', refs: ['0.p2', '1.p1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '0.p1'] }] };
      S.explodeSlot(f, 4);
      var r = S.fullyDefine(f, { units: 'in' });
      assert(r.status === 'full', 'status ' + r.status);
      var d = rfJHDists(f);
      assert(d.filter(function (q) { return q.refs[1] === '8.mid'; }).length === 2 && d.filter(function (q) { return q.refs[1] === '8.p1'; }).length === 1 && !d.some(function (q) { return /^(4|5|6|7)\./.test(q.refs[1]) || q.refs[1] === '8.p2'; }), 'slot dims: ' + rfJHDesc(f));
      assert(!f.dims.some(function (q) { return q.e === 8 && q.k === 'len'; }), 'no slot length ' + JSON.stringify(f.dims));
    });

    function rfJHBlockSketch() {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 2, y1: 0, x2: 2, y2: 1 }, { t: 'line', x1: 2, y1: 1, x2: 0, y2: 1 }, { t: 'line', x1: 0, y1: 1, x2: 0, y2: 0 }] };
      var r = K.makeBlock(f, [0, 1, 2, 3], 'Plate', [0, 0]);
      assert(r.ok, r.error);
      var q = K.insertBlock(f, 'Plate', 5, 0, 0, 1);
      assert(q.ok, q.error);
      return { f: f, a: r.id, b: q.id };
    }
    function rfJHInst(f, id) { return K.blockInstances(f).filter(function (r) { return r.id === String(id); })[0]; }
    test('rfJH: Blocks ▸ Add/Remove: a circle added to instance 1 of a 2 × 1 block appears in instance 2 too (at its insertion point + the same offset); a side removed leaves instance 1 as ordinary geometry where it was and goes from instance 2', function () {
      var s = rfJHBlockSketch(), f = s.f;
      f.entities.push({ t: 'circle', cx: 1, cy: 0.5, r: 0.25 });
      var ci = f.entities.length - 1, r = K.blockAddRemove(f, s.a, [ci], []);
      assert(r.ok && r.added === 1 && r.removed === 0, JSON.stringify(r));
      assert(f.blocks.Plate.ents.length === 5, 'definition ' + f.blocks.Plate.ents.length);
      var b = rfJHInst(f, s.b), cb = b.ents.map(function (i) { return f.entities[i]; }).filter(function (e) { return e.t === 'circle'; })[0];
      assert(b.ents.length === 5 && cb, 'instance 2 has the circle: ' + b.ents.length);
      near(cb.cx, 6, 1e-9, 'circle x in instance 2'); near(cb.cy, 0.5, 1e-9, 'circle y');
      assert(!f.entities.some(function (e) { return e.t === 'circle' && e.blk == null; }), 'the circle is no longer loose');
      // remove the bottom side of instance 1
      var a = rfJHInst(f, s.a), bottom = a.ents.filter(function (i) { var e = f.entities[i]; return e.t === 'line' && Math.abs(e.y1) < 1e-9 && Math.abs(e.y2) < 1e-9; })[0];
      assert(bottom != null, 'bottom side of instance 1');
      var n0 = f.entities.length;
      r = K.blockAddRemove(f, s.a, [], [bottom]);
      assert(r.ok && r.removed === 1, JSON.stringify(r));
      assert(f.blocks.Plate.ents.length === 4 && rfJHInst(f, s.a).ents.length === 4 && rfJHInst(f, s.b).ents.length === 4, 'definition / instances 4 pieces');
      var loose = f.entities.filter(function (e) { return e.blk == null && e.t === 'line'; });
      assert(loose.length === 1 && loose[0].x1 === 0 && loose[0].x2 === 2 && loose[0].y1 === 0, 'removed side stays as ordinary geometry: ' + JSON.stringify(loose));
      assert(f.entities.length === n0 - 1, 'instance 2 lost its bottom side: ' + n0 + ' -> ' + f.entities.length);
      var r2 = K.blockAddRemove(f, s.a, [], rfJHInst(f, s.a).ents.slice());
      assert(!r2.ok && /explode/i.test(r2.error), 'removing every piece is refused: ' + JSON.stringify(r2));
      assert(rfJHInst(f, s.a).ents.length === 4, 'refusal leaves the block as it was');
      assert(!K.blockAddRemove(f, s.a, [], []).ok, 'nothing to do is refused');
    });
    test('rfJH: Blocks ▸ Rebuild: an instance whose piece was changed off its definition is placed again from it; a matching sketch reports 0', function () {
      var s = rfJHBlockSketch(), f = s.f;
      assert(K.rebuildBlocks(f) === 0, 'nothing to rebuild');
      var b = rfJHInst(f, s.b), e = f.entities[b.ents[1]];
      e.x2 = 7.5; e.y2 = 1.7;   // one end of a side moved by a script, the instance no longer its block
      assert(K.rebuildBlocks(f) === 1, 'one instance placed again');
      e = f.entities[rfJHInst(f, s.b).ents[1]];
      near(e.x2, 7, 1e-12, 'x back'); near(e.y2, 1, 1e-12, 'y back');
      assert(e.blk === s.b, 'still in its instance');
    });
    test('rfJH: text along a spline keeps its curvature control (tans[i][3]) and a conic its rho: the text follows the spline\'s real shape', function () {
      var sp = { t: 'spline', pts: [[0, 0], [2, 1], [4, 0]], tans: [null, [0, 1, null, 1.2], null] };
      var g = K.textPathOf(sp);
      assert(g.tans && g.tans[1] && g.tans[1][3] === 1.2, 'curvature kept: ' + JSON.stringify(g.tans));
      var a = K.splineGeom(sp).bez, b = K.splineGeom(g).bez;
      assert(JSON.stringify(a) === JSON.stringify(b), 'same curve as the spline');
      var plain = K.splineGeom({ t: 'spline', pts: sp.pts, tans: [null, [0, 1], null] }).bez;
      assert(JSON.stringify(plain) !== JSON.stringify(a), 'the curvature control changes the curve (so dropping it showed)');
      var sk = { entities: [sp, { t: 'text', text: 'ANVIL', x: 0, y: 0, h: 0.25, path: { e: 0 } }] };
      K.syncTextPaths(sk);
      assert(JSON.stringify(sk.entities[1].path.g) === JSON.stringify(g), 'syncTextPaths stores it');
      var cn = K.textPathOf({ t: 'spline', pts: [[0, 0], [1, 2], [3, 0]], conic: 0.7 });
      assert(cn.conic === 0.7, 'conic rho kept ' + JSON.stringify(cn));
      var moved = K.transformText(sk.entities[1], { s: 2, cx: 0, cy: 0 });
      assert(moved.path.g.tans, 'scaled text keeps its handles'); near(moved.path.g.tans[1][3], 0.6, 1e-12, 'curvature scales as 1 / size');
    });
  })();
