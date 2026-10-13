  // ------------------------------------------------------------------ rfAU: blocks as rigid groups in the solver, DXF BLOCK / INSERT out and in
  (function () {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null, DI = typeof DxfImport !== 'undefined' ? DxfImport : null;
    if (!Kernel.makeBlock || !S) return;
    group('rfAU: rigid block instances, DXF BLOCK / INSERT');
    // a 10 x 6 blank, a punch symbol (Ø.5 hole, a cross line, an R.4 arc) made a block at (2, 1), and a second instance
    function rfAUSketch() {
      var f = { entities: [{ t: 'rect', x: 0, y: 0, w: 10, h: 6 }, { t: 'circle', cx: 2, cy: 1, r: 0.25 }, { t: 'line', x1: 1.5, y1: 1, x2: 2.5, y2: 1 }, { t: 'arc', cx: 2, cy: 1, r: 0.4, a0: 10, a1: 100 }] };
      Kernel.makeBlock(f, [1, 2, 3], 'Punch', [2, 1]);
      Kernel.insertBlock(f, 'Punch', 7, 4, 30, 1.5);
      return f;
    }
    test('rfAU: an instance is one rigid body of 3 DOF — two instances add 6 to the blank\'s 4; dimensions on one insertion point and a Horizontal on its line define it (Fully Defined entities), the other stays under', function () {
      var f = rfAUSketch(), a0 = S.analyze(f), I = Kernel.blockInstances(f);
      assert(a0.dof === 4 + 3 + 3 && a0.status === 'under', 'dof ' + a0.dof);
      assert(S.addRelation(f, 'distance', ['O', String(I[0].ins)], { value: 3, dir: 'h' }).status === 'ok', 'h dim');
      assert(S.addRelation(f, 'distance', ['O', String(I[0].ins)], { value: 2, dir: 'v' }).status === 'ok', 'v dim');
      var hr = S.addRelation(f, 'horizontal', [String(I[0].ents[1])]);
      assert(hr.status === 'ok', 'horizontal ' + hr.status);
      var a1 = S.analyze(f);
      assert(a1.dof === 4 + 3, 'dof ' + a1.dof);
      assert(I[0].ents.concat([I[0].ins]).every(function (i) { return a1.entities[i] === 'full'; }), 'instance 1 fully defined: ' + a1.entities.join());
      assert(I[1].ents.every(function (i) { return a1.entities[i] === 'under'; }), 'instance 2 under defined');
      near(f.entities[I[0].ents[0]].cx, 3, 1e-9, 'circle followed the insertion point'); near(f.entities[I[0].ents[2]].cy, 2, 1e-9, 'arc too');
      // a Horizontal on the turned instance's line turns the whole instance (the circle stays on its insertion point)
      assert(S.addRelation(f, 'horizontal', [String(I[1].ents[1])]).status === 'ok', 'horizontal on the 30° instance');
      var L = f.entities[I[1].ents[1]], A = f.entities[I[1].ents[2]], P = f.entities[I[1].ins];
      near(L.y1, L.y2, 1e-9, 'line level'); near(Math.abs(L.x2 - L.x1), 1.5, 1e-9, 'line length (scale 1.5) kept');
      var a180 = ((P.blkAng % 180) + 180) % 180; near(Math.min(a180, 180 - a180), 0, 1e-6, 'instance angle 0 / 180: ' + P.blkAng);
      near(A.a1 - A.a0, 90, 1e-9, 'arc sweep kept'); near(A.r, 0.6, 1e-12, 'arc radius kept');
      return 'dof ' + a0.dof + ' → ' + S.analyze(f).dof;
    });
    test('rfAU: a relation that would bend an instance over-defines the sketch — a second Horizontal on its upright line is a conflict naming the block, a dimension between two of its points is redundant; SketchXpert finds the fix', function () {
      var f = { entities: [{ t: 'circle', cx: 2, cy: 1, r: 0.25 }, { t: 'line', x1: 1.5, y1: 1, x2: 2.5, y2: 1 }, { t: 'line', x1: 2, y1: 0.5, x2: 2, y2: 1.5 }] };
      Kernel.makeBlock(f, [0, 1, 2], 'Cross', [2, 1]);
      var r = Kernel.blockInstances(f)[0];
      assert(S.addRelation(f, 'horizontal', [String(r.ents[1])]).status === 'ok', 'first horizontal');
      var q = S.addRelation(f, 'horizontal', [String(r.ents[2])]);
      assert(q.status === 'conflict' && q.conflicts && q.conflicts.some(function (n) { return /Block Cross/.test(n); }), 'conflict ' + JSON.stringify(q));
      var dg = S.diagnose(f);
      assert(dg.solutions && dg.solutions.length >= 1, 'SketchXpert solutions ' + JSON.stringify(dg.solutions));
      f.rels.pop(); S.solve(f);
      var d = S.addRelation(f, 'distance', [r.ents[1] + '.p1', r.ents[1] + '.p2']);
      assert(d.status === 'redundant' && S.analyze(f).status === 'over', 'internal dimension ' + d.status);
      near(f.entities[r.ents[1]].x2 - f.entities[r.ents[1]].x1, 1, 1e-9, 'not bent');
      return q.conflicts.join('; ');
    });
    test('rfAU: dragging one of an instance\'s points moves the instance as one piece (no bending, hardly any turn)', function () {
      var f = rfAUSketch(), r = Kernel.blockInstances(f)[0], start = JSON.parse(JSON.stringify(f.entities));
      assert(S.drag(f, r.ents[1] + '.p2', [4, 3], start).ok, 'dragged');
      var L = f.entities[r.ents[1]], C = f.entities[r.ents[0]], P = f.entities[r.ins];
      near(L.x2, 4, 1e-6, 'end x'); near(L.y2, 3, 1e-6, 'end y');
      near(Math.hypot(L.x2 - L.x1, L.y2 - L.y1), 1, 1e-9, 'length kept'); near(C.cx, P.x, 1e-9, 'circle on the insertion point'); near(C.cy, P.y, 1e-9, 'y');
      near(P.x, 3.5, 1e-4, 'moved by translation'); assert(Math.abs(P.blkAng) < 1e-3, 'turned ' + P.blkAng);
      return 'P ' + P.x.toFixed(6) + ', ' + P.y.toFixed(6);
    });
    function rfAUOut(f, v) {
      var dxf = Kernel.exportDXFSketch(f, 'in', { version: v });
      var nIns = (dxf.match(/\n0\nINSERT\n/g) || []).length, nBlk = (dxf.match(/\n0\nBLOCK\n2\nPUNCH\n|\n0\nBLOCK\n(?:5\n\w+\n330\n\w+\n100\nAcDbEntity\n)?8\n0\n(?:100\nAcDbBlockBegin\n)?2\nPUNCH\n/g) || []).length;
      return { dxf: dxf, nIns: nIns, nBlk: nBlk };
    }
    ['R12', 'R2000'].forEach(function (v) {
      test('rfAU: sketch DXF ' + v + ' writes the block once (BLOCKS) and each instance as an INSERT; dxf-import reads them back as block instances with the same count, insertion points, angles and scales (1e-9) and as the same geometry exploded', function () {
        var f = rfAUSketch();
        Kernel.insertBlock(f, 'Punch', 5, 2, 247.5);
        var o = rfAUOut(f, v);
        assert(o.nIns === 3 && o.nBlk === 1, 'INSERTs ' + o.nIns + ', PUNCH blocks ' + o.nBlk);
        assert((o.dxf.match(/\nCIRCLE\n/g) || []).length === 1 && /\$ACADVER\n1\n/.test(o.dxf) && o.dxf.indexOf(v === 'R12' ? 'AC1009' : 'AC1015') > 0, 'one CIRCLE (in the block), version');
        if (v === 'R2000') assert(/\nBLOCK_RECORD\n5\n\w+\n330\n1\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n2\nPUNCH\n/.test(o.dxf) && /\nINSERT\n5\n\w+\n330\n1F\n100\nAcDbEntity\n8\nHOLES\n100\nAcDbBlockReference\n2\nPUNCH\n/.test(o.dxf), 'R2000 block record and INSERT owner');
        if (!DI) return 'no dxf-import';
        var r = DI.parse(o.dxf, { blocks: true, idPrefix: 'q' }), g = { entities: r.entities }, A = Kernel.blockInstances(f), B = Kernel.blockInstances(g);
        assert(B.length === 3 && !r.warnings.length, 'instances read back ' + B.length + ' ' + r.warnings.join(' | '));
        B.forEach(function (q, i) {
          near(q.x, A[i].x, 1e-9, 'x ' + i); near(q.y, A[i].y, 1e-9, 'y ' + i); near(q.ang, A[i].ang, 1e-9, 'angle ' + i); near(q.s, A[i].s, 1e-12, 'scale ' + i);
          assert(q.def === 'PUNCH' && q.ents.length === 3, 'definition ' + q.def);
          q.ents.forEach(function (j, k) { var a = f.entities[A[i].ents[k]], b = g.entities[j]; assert(a.t === b.t, 'type'); ['cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2'].forEach(function (key) { if (a[key] != null) near(b[key], a[key], 1e-9, key + ' ' + i + '.' + k); }); });
        });
        assert(Kernel.adoptBlocks(g) === 1 && g.blocks.PUNCH.ents.length === 3, 'definition adopted');
        assert(S.analyze(g).dof === 16 + 9, 'read-back sketch: 4 lines and 3 rigid instances, dof ' + S.analyze(g).dof);
        // exploded (no opts.blocks) it is the geometry opts.explode writes
        var ex = DI.parse(o.dxf).entities, ex2 = DI.parse(Kernel.exportDXFSketch(f, 'in', { version: v, explode: true })).entities;
        assert(ex.length === 13 && ex2.length === 13 && !ex.some(function (e) { return e.blk != null; }), 'exploded ' + ex.length + ' / ' + ex2.length);
        return o.nIns + ' INSERTs, ' + B.length + ' instances';
      });
    });
    test('rfAU: a customer DXF of punch shapes — R12 BLOCK with a nested block, an INSERT turned 90° and scaled 2, a MINSERT 2 × 1, a mirrored INSERT (exploded) — comes in as 3 block instances whose nested block is exploded into the definition; units scale the instances', function () {
      if (!DI) return 'no dxf-import';
      var L = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'BLOCKS',
        '0', 'BLOCK', '8', '0', '2', 'DOT', '70', '0', '10', '0', '20', '0', '0', 'CIRCLE', '8', '0', '10', '0', '20', '0', '40', '0.05', '0', 'ENDBLK', '8', '0',
        '0', 'BLOCK', '8', '0', '2', 'SLOT', '70', '0', '10', '1', '20', '0',
        '0', 'LINE', '8', '0', '10', '0.5', '20', '-0.1', '11', '1.5', '21', '-0.1',
        '0', 'LINE', '8', '0', '10', '0.5', '20', '0.1', '11', '1.5', '21', '0.1',
        '0', 'INSERT', '8', '0', '2', 'DOT', '10', '1', '20', '0',
        '0', 'ENDBLK', '8', '0', '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES',
        '0', 'INSERT', '8', 'PUNCH', '2', 'SLOT', '10', '5', '20', '5', '41', '2', '42', '2', '50', '90',
        '0', 'INSERT', '8', 'PUNCH', '2', 'SLOT', '10', '0', '20', '0', '70', '2', '71', '1', '44', '3',
        '0', 'INSERT', '8', 'PUNCH', '2', 'SLOT', '10', '9', '20', '9', '41', '-1', '42', '1',
        '0', 'ENDSEC', '0', 'EOF'];
      var r = DI.parse(L.join('\n'), { blocks: true, idPrefix: 'c' }), g = { entities: r.entities }, B = Kernel.blockInstances(g);
      assert(B.length === 3 && B.every(function (q) { return q.def === 'SLOT' && q.ents.length === 3; }), 'instances ' + JSON.stringify(B));
      near(B[0].x, 5, 1e-12, 'x'); near(B[0].ang, 90, 1e-12, 'angle'); near(B[0].s, 2, 1e-12, 'scale');
      near(B[1].x, 0, 1e-12, 'MINSERT cell 1'); near(B[2].x, 3, 1e-12, 'MINSERT cell 2');
      var dot = g.entities[B[0].ents[2]];   // the nested DOT at block (1, 0) -> base (1, 0) -> the insertion point
      assert(dot.t === 'circle', 'nested block exploded into the definition'); near(dot.cx, 5, 1e-12, 'dot x'); near(dot.cy, 5, 1e-12, 'dot y'); near(dot.r, 0.1, 1e-12, 'dot r');
      var l0 = g.entities[B[0].ents[0]];   // (0.5, -0.1) - base (1, 0) = (-0.5, -0.1), × 2, turned 90° -> (0.2, -1) + (5, 5)
      near(l0.x1, 5.2, 1e-12, 'line x1'); near(l0.y1, 4, 1e-12, 'line y1');
      assert(g.entities.filter(function (e) { return e.blk == null && e.t === 'line'; }).length === 2, 'the mirrored INSERT exploded');
      assert(g.entities.every(function (e) { return e.layer === 'PUNCH'; }), 'layer 0 takes the INSERT\'s layer');
      var mm = DI.transform(r.entities, { s: 25.4, rot: 30 }), Bm = Kernel.blockInstances({ entities: mm });
      near(Bm[0].s, 50.8, 1e-9, 'scaled into mm'); near(Bm[0].ang, 120, 1e-9, 'turned with the import');
      assert(S.analyze({ entities: mm }).dof === 9 + 8 + 3, 'rigid after the transform: dof ' + S.analyze({ entities: mm }).dof);
      return B.length + ' instances';
    });
  })();
  // --- end rfAU ---
