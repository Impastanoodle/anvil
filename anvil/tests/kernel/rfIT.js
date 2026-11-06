  // --- rfIT (2026-11-05, lane sketchtools) --- Offset Entities' driving dimension: a new value moves the offset and
  // keeps the original (circle: its centre and radius; line / arc likewise); Make Path on an L + tangent arc.
  (function () {
    if (typeof SketchSolver === 'undefined') return;
    group('rfIT: Offset Entities dimension moves the offset only; Make Path on an L + arc');
    var SS = SketchSolver;
    function offset(ents, d, o) {
      var s = { entities: JSON.parse(JSON.stringify(ents)) };
      var r = SS.offsetSelection(s, [0], Object.assign({ d: d, dims: true }, o || {}));
      assert(r.ok, 'offset: ' + r.error);
      var k = -1;
      (s.rels || []).forEach(function (x, i) { if (x.type === 'distance') k = i; });
      assert(k >= 0, 'an offset dimension: ' + JSON.stringify(s.rels));
      return { s: s, k: k };
    }
    test('rfIT: circle R.5 offset .1: radial distance .1 (dir r) between the concentric circles; set to .2 the offset is R.7, the original stays R.5 at its centre', function () {
      var o = offset([{ t: 'circle', cx: 1, cy: 1, r: 0.5 }], 0.1), s = o.s, rel = s.rels[o.k];
      assert(rel.dir === 'r' && rel.refs.join() === '0,1', 'radial ' + JSON.stringify(rel));
      near(rel.v, 0.1, 1e-12, 'v'); near(s.entities[1].r, 0.6, 1e-12, 'R.6');
      var r = SS.setRelValue(s, o.k, 0.2);
      assert(r.ok, r.error);
      near(s.entities[0].r, 0.5, 1e-9, 'original R'); near(s.entities[0].cx, 1, 1e-9, 'original cx'); near(s.entities[0].cy, 1, 1e-9, 'original cy');
      near(s.entities[1].r, 0.7, 1e-9, 'offset R.7');
      return 'R ' + s.entities[0].r + ' / ' + s.entities[1].r;
    });
    test('rfIT: circle offset inward (Reverse) .1, set to .3: the offset is R.2', function () {
      var o = offset([{ t: 'circle', cx: 0, cy: 0, r: 0.5 }], 0.1, { reverse: true }), s = o.s;
      near(s.entities[1].r, 0.4, 1e-12, 'R.4');
      var r = SS.setRelValue(s, o.k, 0.3);
      assert(r.ok, r.error);
      near(s.entities[0].r, 0.5, 1e-9, 'original'); near(s.entities[1].r, 0.2, 1e-9, 'offset R.2');
    });
    test('rfIT: arc R1 offset .1 (radial distance), set to .25: the offset arc is R1.25, the original keeps R1 and its ends', function () {
      var o = offset([{ t: 'arc', cx: 0, cy: 0, r: 1, a0: 0, a1: 90 }], 0.1), s = o.s, rel = s.rels[o.k];
      assert(rel.dir === 'r', 'radial ' + JSON.stringify(rel));
      var r = SS.setRelValue(s, o.k, 0.25);
      assert(r.ok, r.error);
      near(s.entities[0].r, 1, 1e-9, 'original R1'); near(s.entities[0].a0, 0, 1e-7, 'a0'); near(s.entities[0].a1, 90, 1e-7, 'a1');
      near(s.entities[1].r, 1.25, 1e-9, 'offset R1.25');
    });
    test('rfIT: line offset .25 (parallel distance), set to .5: the offset line moves, the original stays', function () {
      var o = offset([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }], 0.25), s = o.s;
      assert(!s.rels[o.k].dir, 'a plain distance');
      var r = SS.setRelValue(s, o.k, 0.5);
      assert(r.ok, r.error);
      var L = s.entities[0], M = s.entities[1];
      near(L.x1, 0, 1e-9, 'x1'); near(L.y1, 0, 1e-9, 'y1'); near(L.x2, 3, 1e-9, 'x2'); near(L.y2, 0, 1e-9, 'y2');
      near(Math.abs(M.y1), 0.5, 1e-9, 'offset y1'); near(Math.abs(M.y2), 0.5, 1e-9, 'offset y2');
    });
    test('rfIT: Make Path on an L of two lines + a tangent arc: one path in chain order; a corner (non-tangent) still chains with Make Path; a loose line is refused', function () {
      var s = { entities: [{ t: 'line', x1: 0, y1: 0, x2: 0, y2: 2 }, { t: 'line', x1: 0, y1: 2, x2: 1.5, y2: 2 }, { t: 'arc', cx: 1.5, cy: 1.5, r: 0.5, a0: 0, a1: 90 }, { t: 'line', x1: -1, y1: -1, x2: -0.2, y2: -1 }] };
      var r = Kernel.makeSketchPath(s, [2, 0, 1]);
      assert(r.ok, r.error);
      assert(r.ents.join() === '0,1,2' || r.ents.join() === '2,1,0', 'chain order ' + r.ents);
      assert(Kernel.sketchPaths(s).length === 1 && s.entities[3].pathId == null, 'one path');
      near(SS.measure(s, 'pathlength', ['0', '1', '2']), 3.5 + Math.PI / 4, 1e-12, 'its length');
      assert(!Kernel.makeSketchPath(s, [0, 3]).ok, 'a loose line is no chain');
      return 'L + arc ' + (3.5 + Math.PI / 4).toFixed(4);
    });
  })();
