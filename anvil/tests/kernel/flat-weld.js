  // --- flat-weld: Kernel.faceOutline welds vertices so a shared edge keeps its twin when the two copies of a vertex
  // straddle a 1e-4 rounding midpoint (an inch Ø.281 hole at .5 has points at x = .57025). OpenCascade's mesh hit it:
  // the interior edge counted as boundary and the flat DXF got a slit joining two holes. occt-tests has the real part. ---
  (function () {
    function fakeFace(tris) {
      return { faces: [{ normal: [0, 0, 1], w: 0, polys: tris.map(function (t) { return { vertices: t.map(function (p) { return { pos: { x: p[0], y: p[1], z: 0 } }; }) }; }) }] };
    }
    test('flat-weld: two triangles whose shared vertex copies straddle a rounding midpoint (x = .57025 ± 1e-12) outline as one 4-point loop', function () {
      var O = [0, 0], X = [1, 0], Q = [-1, 1], P1 = [0.57025 + 1e-12, 1], P2 = [0.57025 - 1e-12, 1];
      assert(Math.round(P1[0] * 1e4) !== Math.round(P2[0] * 1e4), 'the copies straddle the midpoint (else the test proves nothing)');
      var o = K.faceOutline(fakeFace([[O, X, P1], [O, P2, Q]]), 0);
      assert(o.loops.length === 1 && o.loops[0].length === 4, 'loops ' + o.loops.map(function (l) { return l.length; }).join(','));
      return '1 loop of 4';
    });
  })();
  // --- end flat-weld ---
