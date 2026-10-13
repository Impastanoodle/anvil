  // ------------------------------------------------------------------ rfAT: sketch Blocks (kernel-sketch.js)
  (function () {
    var S = typeof SketchSolver !== 'undefined' ? SketchSolver : null;
    if (!Kernel.makeBlock) return;
    group('rfAT: sketch Blocks');
    function rfATBlank() {   // a 10 x 6 blank and a punch symbol (Ø.5 hole with a cross line) at (2, 1)
      return { entities: [{ t: 'rect', x: 0, y: 0, w: 10, h: 6 }, { t: 'circle', cx: 2, cy: 1, r: 0.25 }, { t: 'line', x1: 1.5, y1: 1, x2: 2.5, y2: 1, construction: true }] };
    }
    test('rfAT: Make Block — the selection becomes a definition in block coordinates and its first instance in place; Insert Block turns and scales a copy', function () {
      var f = rfATBlank(), r = Kernel.makeBlock(f, [1, 2], 'Punch', [2, 1]);
      assert(r.ok && r.name === 'Punch' && f.entities[r.ins].blkDef === 'Punch', 'made: ' + JSON.stringify(r));
      assert(JSON.stringify(f.blocks.Punch.ents) === JSON.stringify([{ t: 'circle', cx: 0, cy: 0, r: 0.25 }, { t: 'line', x1: -0.5, y1: 0, x2: 0.5, y2: 0, construction: true }]), 'definition ' + JSON.stringify(f.blocks));
      var q = Kernel.insertBlock(f, 'Punch', 5, 3, 90, 2), inst = Kernel.blockInstances(f);
      assert(q.ok && inst.length === 2 && inst[1].ents.length === 2, 'two instances');
      var c = f.entities[inst[1].ents[0]], l = f.entities[inst[1].ents[1]];
      near(c.r, 0.5, 1e-12, 'scaled radius'); near(c.cx, 5, 1e-12, 'cx'); near(l.x1, 5, 1e-12, 'turned line x'); near(l.y1, 2, 1e-12, 'turned line y1'); near(l.y2, 4, 1e-12, 'turned line y2');
      assert(l.construction && l.blk === inst[1].id, 'construction flag and tag carried');
      assert(!Kernel.insertBlock(f, 'Nope', 0, 0).ok && !Kernel.insertBlock(f, 'Punch', 0, 0, 0, 0).ok, 'bad block / scale refused');
      assert(!Kernel.makeBlock(f, [inst[0].ents[0]], 'X').ok, 'an entity in a block is not taken again');
      return inst.map(function (x) { return x.id; }).join(', ');
    });
    test('rfAT: an instance is rigid — moving its insertion point moves it, dragging one of its lines moves the whole instance, a profile and the DXF see the exploded geometry', function () {
      var f = rfATBlank();
      Kernel.makeBlock(f, [1, 2], 'Punch', [2, 1]);
      var r = Kernel.blockInstances(f)[0], P = f.entities[r.ins];
      P.x = 4; P.y = 2;
      assert(Kernel.syncBlocks(f) === 1, 'synced');
      near(f.entities[r.ents[0]].cx, 4, 1e-12, 'circle followed x'); near(f.entities[r.ents[1]].y1, 2, 1e-12, 'line followed');
      // one of its lines dragged 1 to the right: the insertion point and the circle follow
      var L = f.entities[r.ents[1]]; L.x1 += 1; L.x2 += 1;
      Kernel.syncBlocks(f);
      near(P.x, 5, 1e-12, 'insertion point followed the drag'); near(f.entities[r.ents[0]].cx, 5, 1e-12, 'circle followed the drag');
      assert(Kernel.syncBlocks(f) === 0, 'nothing more to do');
      var loops = Kernel.sketchProfile(f).loops;
      assert(loops.length === 2, 'blank and hole: ' + loops.length);
      // (rfAU: the DXF writes the block once and the instance as an INSERT; opts.explode gives the exploded geometry)
      var dxf = Kernel.exportDXFSketch(f, 'in'), dxfX = Kernel.exportDXFSketch(f, 'in', { explode: true });
      assert(/\nCIRCLE\r?\n/.test(dxf) && /\nINSERT\r?\n/.test(dxf) && /\nCIRCLE\r?\n/.test(dxfX) && !/\nINSERT\r?\n/.test(dxfX), 'DXF: BLOCK + INSERT, exploded with opts.explode');
      // Block properties: angle 90
      assert(Kernel.setBlockInstance(f, r.id, { ang: 90 }).ok, 'turned');
      near(f.entities[r.ents[1]].x1, 5, 1e-12, 'line upright x'); near(Math.abs(f.entities[r.ents[1]].y2 - f.entities[r.ents[1]].y1), 1, 1e-12, 'line upright length');
      return 'P ' + P.x + ', ' + P.y;
    });
    test('rfAT: a dimension on the insertion point places the instance (the solver moves the point, the instance follows); Explode and Edit Block', function () {
      var f = rfATBlank();
      Kernel.makeBlock(f, [1, 2], 'Punch', [2, 1]);
      Kernel.insertBlock(f, 'Punch', 7, 4);
      var r = Kernel.blockInstances(f)[0];
      if (S) {
        var d = S.addRelation(f, 'distance', ['O', String(r.ins)], { value: 3, dir: 'h' });
        assert(d.ok, 'dimension added');
        S.solve(f); Kernel.syncBlocks(f);
        near(f.entities[r.ins].x, 3, 1e-9, 'insertion point at x 3'); near(f.entities[r.ents[0]].cx, 3, 1e-9, 'instance followed');
      }
      // Edit Block: the second instance's circle made bigger becomes the definition; the first follows
      var r2 = Kernel.blockInstances(f)[1];
      f.entities[r2.ents[0]].r = 0.4;
      assert(Kernel.redefineBlock(f, r2.id).ok, 'redefined');
      near(f.blocks.Punch.ents[0].r, 0.4, 1e-12, 'definition radius');
      var all = Kernel.blockInstances(f);
      assert(all.length === 2 && all.every(function (q) { return f.entities[q.ents.filter(function (i) { return f.entities[i].t === 'circle'; })[0]].r === 0.4; }), 'every instance follows');
      var n0 = f.entities.length;
      assert(Kernel.explodeBlock(f, all[0].id).ok, 'exploded');
      assert(f.entities.length === n0 - 1 && Kernel.blockInstances(f).length === 1 && f.blocks.Punch, 'insertion point gone, definition kept for the other');
      assert(Kernel.explodeBlock(f, Kernel.blockInstances(f)[0].id).ok && !f.blocks && !f.entities.some(function (e) { return e.blk != null; }), 'last instance exploded: no blocks left');
      return 'ok';
    });
    test('rfAT: blocks survive the script round trip (.blocks line) and a saved .sldblk loads into another sketch', function () {
      var f = rfATBlank();
      Kernel.makeBlock(f, [1, 2], 'Punch', [2, 1]);
      Kernel.insertBlock(f, 'Punch', 6, 3, 30, 1.5);
      var m = Kernel.newModel('blk');
      m.features.push(Object.assign({ id: 1, type: 'sketch', name: 'Sketch1', plane: { ref: 'Front', offset: 0 } }, JSON.parse(JSON.stringify(f))));
      var src = Kernel.generateScript(m);
      assert(/\.blocks\(/.test(src), 'script writes .blocks');
      var m2 = Kernel.newModel('blk'); Kernel.runScript(m2, src);
      var f2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(JSON.stringify(f2.blocks) === JSON.stringify(f.blocks), 'definitions');
      assert(JSON.stringify(Kernel.blockInstances(f2)) === JSON.stringify(Kernel.blockInstances(f)), 'instances');
      var g = { entities: [] }, txt = Kernel.blockFile(f, 'Punch'), a = Kernel.addBlockDef(g, JSON.parse(txt));
      assert(a.ok && a.name === 'Punch' && Kernel.insertBlock(g, 'Punch', 1, 1).ok && g.entities.length === 3, 'loaded and placed');
      assert(Kernel.addBlockDef(g, JSON.parse(txt)).name === 'Punch-2', 'a second load gets its own name');
      return src.split('\n').filter(function (l) { return /\.blocks/.test(l); })[0].length + ' chars';
    });
  })();
  // --- end rfAT ---
