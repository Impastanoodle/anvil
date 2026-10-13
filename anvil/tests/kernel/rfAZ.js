  // ---- rfAZ (2026-10-13): Edit Block keeps the relations on the other instances; dxf-check reads INSERT
  (function () {
    var S = window.SketchSolver;
    group('rfAZ: Edit Block relations, INSERT in dxf-check');
    function rfAZPunch() {
      var f = { entities: [{ t: 'circle', cx: 10, cy: 10, r: 2 }, { t: 'line', x1: 6, y1: 10, x2: 14, y2: 10 }, { t: 'line', x1: 10, y1: 6, x2: 10, y2: 14 }, { t: 'line', x1: 0, y1: 0, x2: 100, y2: 0 }] };
      Kernel.makeBlock(f, [0, 1, 2], 'Punch', [10, 10]);
      Kernel.insertBlock(f, 'Punch', 40, 10, 0, 1);
      Kernel.insertBlock(f, 'Punch', 70, 10, 30, 1);
      return f;
    }
    function rfAZRefs(f) { return (f.rels || []).map(function (r) { return r.type + ':' + r.refs.map(function (x) { var e = f.entities[parseInt(x, 10)]; return e ? e.t + (e.blk != null ? '@' + e.blk : '') + String(x).replace(/^\d+/, '') : x; }).join(','); }); }
    test('rfAZ: Edit Block keeps the relations on the other instances — a bigger circle, then a line added: a Horizontal on the turned instance\'s line and a Coincident of another instance\'s line end with a plain line stay on the same pieces; a piece taken out drops only the relations on it (counted); the edited instance\'s own relations go into the definition', function () {
      var f = rfAZPunch(), I = Kernel.blockInstances(f);
      f.rels = [{ type: 'horizontal', refs: [String(I[2].ents[1])] }, { type: 'coincident', refs: [I[1].ents[1] + '.p1', '0.p2'] },
        { type: 'perpendicular', refs: [String(I[0].ents[1]), String(I[0].ents[2])] }, { type: 'vertical', refs: [String(I[0].ents[2])] }];
      var want = ['horizontal:line@b3', 'coincident:line@b2.p1,line.p2'];
      assert(rfAZRefs(f).slice(0, 2).join(' ') === want.join(' '), 'set up: ' + rfAZRefs(f).join(' '));
      f.entities[I[0].ents[0]].r = 3;   // Edit Block on the first instance: its circle made bigger
      var r = Kernel.redefineBlock(f, I[0].id);
      assert(r.ok && r.dropped === 0, 'redefined: ' + JSON.stringify(r));
      // the Perpendicular between two of the edited instance's lines is its shape now (into the definition); the
      // Vertical on one of its lines places it and stays
      assert(rfAZRefs(f).join(' ') === want.concat(['vertical:line@b1']).join(' '), 'relations kept on the same pieces: ' + rfAZRefs(f).join(' '));
      I = Kernel.blockInstances(f);
      assert(I.length === 3 && I.every(function (q) { return f.entities[q.ents[0]].r === 3 && q.ents.length === 3; }), 'every instance has the R3 circle');
      // a line drawn while editing joins the block: the relations still sit on the same pieces
      f.entities.push({ t: 'line', x1: 8, y1: 8, x2: 12, y2: 12 });
      r = Kernel.redefineBlock(f, I[0].id, [f.entities.length - 1]);
      assert(r.ok && r.dropped === 0 && rfAZRefs(f).join(' ') === want.concat(['vertical:line@b1']).join(' '), 'after adding a line: ' + JSON.stringify(r) + ' ' + rfAZRefs(f).join(' '));
      I = Kernel.blockInstances(f);
      assert(f.blocks.Punch.ents.length === 4 && I.every(function (q) { return q.ents.length === 4; }), 'four pieces each');
      if (S) {
        S.solve(f); Kernel.syncBlocks(f);
        var L = f.entities[I[2].ents[1]], a = S.analyze(f);
        near(L.y1, L.y2, 1e-9, 'the Horizontal still levels the turned instance'); assert(a.status !== 'over', 'not over defined: ' + a.status);
      }
      // the edited instance's horizontal line taken out: the relations on that piece of the other instances go
      var del = I[0].ents[1], before = f.rels.length;
      f.entities.splice(del, 1);
      f.rels.forEach(function (q) { q.refs = q.refs.map(function (x) { var m = /^(\d+)(.*)$/.exec(x); return m && +m[1] > del ? (+m[1] - 1) + m[2] : x; }); });
      r = Kernel.redefineBlock(f, Kernel.blockInstances(f)[0].id);
      assert(r.ok && r.dropped === 2 && (f.rels || []).length === before - 2, 'two relations on the removed piece dropped: ' + JSON.stringify(r) + ' ' + rfAZRefs(f).join(' '));
      I = Kernel.blockInstances(f);
      assert(f.blocks.Punch.ents.length === 3 && I.every(function (q) { return q.ents.length === 3 && f.entities[q.ents[0]].t === 'circle'; }), 'three pieces each: ' + I.map(function (q) { return q.ents.length; }));
      return rfAZRefs(f).join(' ');
    });
    test('rfAZ: a relation to an instance\'s insertion point survives Edit Block, and a dimension on another instance\'s circle stays on that circle', function () {
      var f = rfAZPunch(), I = Kernel.blockInstances(f);
      f.rels = [{ type: 'coincident', refs: [String(I[1].ins), '0'] }];
      f.dims = [{ e: I[2].ents[0], k: 'r', off: 3 }];
      f.entities[I[0].ents[1]].x1 = 5;   // the first instance's line made longer
      var r = Kernel.redefineBlock(f, I[0].id);
      I = Kernel.blockInstances(f);
      assert(r.ok && f.rels.length === 1 && f.rels[0].refs[0] === String(I[1].ins) && f.rels[0].refs[1] === '0', 'insertion point relation kept: ' + JSON.stringify(f.rels));
      assert(f.dims && f.dims.length === 1 && f.dims[0].e === I[2].ents[0] && f.entities[f.dims[0].e].t === 'circle', 'dimension kept on the circle: ' + JSON.stringify(f.dims));
      near(f.entities[I[2].ents[1]].x1, 70 - 5 * Math.cos(Math.PI / 6), 1e-9, 'the turned instance follows the longer line');
      return 'ok';
    });
    if (typeof DxfCheck === 'undefined') return;
    function rfAZDxf(ents, blocks) {
      return ['0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1', '0', 'ENDSEC', '0', 'SECTION', '2', 'BLOCKS'].concat(blocks || [], ['0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'], ents, ['0', 'ENDSEC', '0', 'EOF']).join('\n') + '\n';
    }
    function rfAZLine(L, a, b) { return ['0', 'LINE', '8', L, '10', a[0], '20', a[1], '11', b[0], '21', b[1]].map(String); }
    test('rfAZ: dxf-check understands INSERT — a sketch DXF with three instances of a square block passes in R12 and R2000 (no "duplicate INSERT"), each placed square chains closed on its layer; an INSERT of a missing or an empty block is an error; a mirrored INSERT\'s arc is placed the right way round', function () {
      var f = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 10, y1: 0, x2: 10, y2: 6 }, { t: 'line', x1: 10, y1: 6, x2: 0, y2: 6 }, { t: 'line', x1: 0, y1: 6, x2: 0, y2: 0 },
        { t: 'line', x1: 1, y1: 1, x2: 2, y2: 1 }, { t: 'line', x1: 2, y1: 1, x2: 2, y2: 2 }, { t: 'line', x1: 2, y1: 2, x2: 1, y2: 2 }, { t: 'line', x1: 1, y1: 2, x2: 1, y2: 1 }] };
      Kernel.makeBlock(f, [4, 5, 6, 7], 'SQ', [1, 1]);
      Kernel.insertBlock(f, 'SQ', 4, 2, 0, 1); Kernel.insertBlock(f, 'SQ', 7, 3, 45, 1.5);
      var out = [];
      ['R12', 'R2000'].forEach(function (v) {
        var dxf = Kernel.exportDXFSketch(f, 'in', { version: v }), c = DxfCheck.check(dxf, { units: 'in' });
        assert(/\nINSERT\r?\n/.test(dxf), v + ': INSERTs written');
        assert(c.ok, v + ': ' + c.errors.join('; '));
        var ins = c.inserts.length, closed = c.loops.filter(function (l) { return l.closed && l.kind === 'chain'; }).length;
        assert(ins === 3 && closed === 4 && !c.errors.some(function (e) { return /duplicate INSERT/.test(e); }), v + ': ' + ins + ' INSERTs, ' + closed + ' closed chains');
        out.push(v + ' ' + ins + ' INSERTs');
      });
      var sq = [].concat(rfAZLine('0', [0, 0], [1, 0]), rfAZLine('0', [1, 0], [1, 1]), rfAZLine('0', [1, 1], [0, 1]), rfAZLine('0', [0, 1], [0, 0]));
      var blk = ['0', 'BLOCK', '8', '0', '2', 'SQ', '70', '0', '10', '0', '20', '0'].concat(sq, ['0', 'ENDBLK', '8', '0'], ['0', 'BLOCK', '8', '0', '2', 'NONE', '70', '0', '10', '0', '20', '0', '0', 'ENDBLK', '8', '0']);
      var ok = DxfCheck.check(rfAZDxf(['0', 'INSERT', '8', 'HOLES', '2', 'SQ', '10', '3', '20', '3', '0', 'INSERT', '8', 'HOLES', '2', 'SQ', '10', '5', '20', '3'], blk));
      assert(ok.ok && ok.counts['LINE@HOLES'] === 8 && ok.counts['INSERT@HOLES'] === 2, 'two INSERTs of SQ: ' + ok.errors.join('; ') + ' ' + JSON.stringify(ok.counts));
      var miss = DxfCheck.check(rfAZDxf(['0', 'INSERT', '8', 'HOLES', '2', 'GONE', '10', '3', '20', '3'], blk));
      assert(!miss.ok && miss.errors.some(function (e) { return /INSERT on HOLES names block "GONE", which the BLOCKS section does not have/.test(e); }), 'missing block: ' + miss.errors.join('; '));
      var empty = DxfCheck.check(rfAZDxf(['0', 'INSERT', '8', 'HOLES', '2', 'NONE', '10', '3', '20', '3'], blk));
      assert(!empty.ok && empty.errors.some(function (e) { return /block NONE, which is empty/.test(e); }), 'empty block: ' + empty.errors.join('; '));
      // block D: an arc about (1, 0) from 90° to 180° and two lines, closed; inserted at (5, 0) mirrored in X: the arc
      // about (4, 0) from 0° to 90° (the box stays above y 0)
      var D = ['0', 'BLOCK', '8', '0', '2', 'D', '70', '0', '10', '0', '20', '0', '0', 'ARC', '8', '0', '10', '1', '20', '0', '40', '1', '50', '90', '51', '180']
        .concat(rfAZLine('0', [0, 0], [2, 0]), rfAZLine('0', [2, 0], [1, 1]), ['0', 'ENDBLK', '8', '0']);
      var m = DxfCheck.check(rfAZDxf(['0', 'INSERT', '8', 'OUTLINE', '2', 'D', '10', '5', '20', '0', '41', '-1', '42', '1'], D));
      assert(m.ok, 'mirrored D: ' + m.errors.join('; '));
      near(m.extents.min[0], 3, 1e-9, 'min x'); near(m.extents.max[0], 5, 1e-9, 'max x'); near(m.extents.min[1], 0, 1e-9, 'min y (the arc is the quarter above)'); near(m.extents.max[1], 1, 1e-9, 'max y');
      return out.join(', ');
    });
  })();
  // --- end rfAZ ---
