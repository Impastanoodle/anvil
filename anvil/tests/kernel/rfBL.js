  // ---- rfBL (lane BL, 2026-10-13): Mastercam's Offset Contour (Transform ▸ Offset ▸ Chains), SketchSolver.contourOffset
  (function () {
    var S = window.SketchSolver;
    group('rfBL: Offset Contour (SketchSolver.contourOffset)');
    // a closed L, counter-clockwise: a 45° chamfer (two 135° corners), a concave fillet R5 at the inside corner and a
    // convex fillet R5 at the top left; the bottom arm is 20 high, the upright 20 wide
    function rfBLL() {
      return [
        { t: 'line', x1: 0, y1: 0, x2: 60, y2: 0 },
        { t: 'line', x1: 60, y1: 0, x2: 60, y2: 15 },
        { t: 'line', x1: 60, y1: 15, x2: 55, y2: 20 },
        { t: 'line', x1: 55, y1: 20, x2: 25, y2: 20 },
        { t: 'arc', cx: 25, cy: 25, r: 5, a0: 180, a1: 270 },
        { t: 'line', x1: 20, y1: 25, x2: 20, y2: 50 },
        { t: 'line', x1: 20, y1: 50, x2: 5, y2: 50 },
        { t: 'arc', cx: 5, cy: 45, r: 5, a0: 90, a1: 180 },
        { t: 'line', x1: 0, y1: 45, x2: 0, y2: 0 }
      ];
    }
    var rfBLItems = [{ i: 0, dir: 1 }, { i: 1, dir: 1 }, { i: 2, dir: 1 }, { i: 3, dir: 1 }, { i: 4, dir: -1 }, { i: 5, dir: 1 }, { i: 6, dir: 1 }, { i: 7, dir: 1 }, { i: 8, dir: 1 }];
    function rfBLHas(list, want, label) {
      var hit = list.filter(function (e) {
        return e.t === want.t && Object.keys(want).every(function (k) { return k === 't' || Math.abs(e[k] - want[k]) < 1e-9; });
      });
      assert(hit.length === 1, label + ': ' + JSON.stringify(want) + ' not in ' + JSON.stringify(list));
    }
    var T = Math.tan(Math.PI / 8);   // the 135° corner of a chamfer: a sharp offset corner is d·tan 22.5° past the vertex
    test('rfBL: Offset Contour outside an L (right of its counter-clockwise travel), corners None / Sharp / All — sharp corners extended (chamfer corners at d·tan 22.5°), Sharp rounds the 90° corners only (R2 centred on the vertex), All rounds every outside corner; the concave fillet R5 becomes R3, the convex R5 becomes R7, concentric; lines stay lines', function () {
      assert(S && S.contourOffset, 'SketchSolver.contourOffset missing');
      var E = rfBLL(), none = S.contourOffset(E, rfBLItems, true, -2, { corners: 'none' });
      assert(none.ok && none.entities.length === 9, 'None: 9 entities ' + JSON.stringify(none));
      rfBLHas(none.entities, { t: 'line', x1: -2, y1: -2, x2: 62, y2: -2 }, 'None bottom');
      rfBLHas(none.entities, { t: 'line', x1: 62, y1: -2, x2: 62, y2: 15 + 2 * T }, 'None right side to the chamfer corner');
      rfBLHas(none.entities, { t: 'line', x1: 62, y1: 15 + 2 * T, x2: 55 + 2 * T, y2: 22 }, 'None chamfer');
      rfBLHas(none.entities, { t: 'arc', cx: 25, cy: 25, r: 3, a0: 180, a1: 270 }, 'None concave fillet');
      rfBLHas(none.entities, { t: 'arc', cx: 5, cy: 45, r: 7, a0: 90, a1: 180 }, 'None convex fillet');
      rfBLHas(none.entities, { t: 'line', x1: 22, y1: 25, x2: 22, y2: 52 }, 'None upright to its sharp corner');
      assert(!none.entities.some(function (e) { return e.corner; }), 'None: no corner arcs');
      var sharp = S.contourOffset(E, rfBLItems, true, -2, { corners: 'sharp' }), corners = sharp.entities.filter(function (e) { return e.corner; });
      assert(sharp.ok && sharp.entities.length === 12 && corners.length === 3, 'Sharp: 12 entities, 3 corner arcs ' + JSON.stringify(sharp.entities));
      rfBLHas(sharp.entities, { t: 'arc', cx: 60, cy: 0, r: 2, a0: 270, a1: 360 }, 'Sharp corner (60, 0)');
      rfBLHas(sharp.entities, { t: 'arc', cx: 0, cy: 0, r: 2, a0: 180, a1: 270 }, 'Sharp corner (0, 0)');
      rfBLHas(sharp.entities, { t: 'arc', cx: 20, cy: 50, r: 2, a0: 0, a1: 90 }, 'Sharp corner (20, 50)');
      rfBLHas(sharp.entities, { t: 'line', x1: 62, y1: 0, x2: 62, y2: 15 + 2 * T }, 'Sharp: the 135° chamfer corner stays sharp');
      var all = S.contourOffset(E, rfBLItems, true, -2, { corners: 'all' });
      assert(all.ok && all.entities.length === 14 && all.entities.filter(function (e) { return e.corner; }).length === 5, 'All: 14 entities, 5 corner arcs ' + JSON.stringify(all.entities));
      rfBLHas(all.entities, { t: 'arc', cx: 60, cy: 15, r: 2, a0: 0, a1: 45 }, 'All chamfer corner (60, 15)');
      rfBLHas(all.entities, { t: 'arc', cx: 55, cy: 20, r: 2, a0: 45, a1: 90 }, 'All chamfer corner (55, 20)');
      rfBLHas(all.entities, { t: 'line', x1: 62, y1: 0, x2: 62, y2: 15 }, 'All right side');
      // Sharp with a max angle over 135°: the chamfer corners round too (= All)
      var wide = S.contourOffset(E, rfBLItems, true, -2, { corners: 'sharp', maxAngle: 150 });
      assert(wide.entities.length === 14, 'Sharp at 150° rounds the 135° corners too: ' + wide.entities.length);
      return 'None 9 · Sharp 12 · All 14';
    });
    test('rfBL: Offset Contour inside the L — inside corners trimmed where the copies cross (no corner arcs, whatever the Corners option); at 6 the convex fillet R5 shrinks away and its neighbours meet sharp at (6, 44); at 11 the arms are gone and the loop left is the corner region: two lines and the R16 fillet copy', function () {
      assert(S && S.contourOffset, 'SketchSolver.contourOffset missing');
      var E = rfBLL(), r2 = S.contourOffset(E, rfBLItems, true, 2, { corners: 'all' });
      assert(r2.ok && r2.entities.length === 9 && !r2.entities.some(function (e) { return e.corner; }), 'inside 2: 9 entities, no corner arcs ' + JSON.stringify(r2.entities));
      rfBLHas(r2.entities, { t: 'line', x1: 2, y1: 2, x2: 58, y2: 2 }, 'inside 2 bottom');
      rfBLHas(r2.entities, { t: 'arc', cx: 25, cy: 25, r: 7, a0: 180, a1: 270 }, 'inside 2 concave fillet R7');
      rfBLHas(r2.entities, { t: 'arc', cx: 5, cy: 45, r: 3, a0: 90, a1: 180 }, 'inside 2 convex fillet R3');
      rfBLHas(r2.entities, { t: 'line', x1: 58, y1: 14 + (1 - 2 * T), x2: 54 + (1 - 2 * T), y2: 18 }, 'inside 2 chamfer');
      var r6 = S.contourOffset(E, rfBLItems, true, 6, { corners: 'none' });
      assert(r6.ok && r6.entities.length === 8, 'inside 6: 8 entities (the R5 fillet gone) ' + JSON.stringify(r6.entities));
      rfBLHas(r6.entities, { t: 'line', x1: 14, y1: 44, x2: 6, y2: 44 }, 'inside 6 top edge to the sharp corner');
      rfBLHas(r6.entities, { t: 'line', x1: 6, y1: 44, x2: 6, y2: 6 }, 'inside 6 left edge from the sharp corner');
      rfBLHas(r6.entities, { t: 'arc', cx: 25, cy: 25, r: 11, a0: 180, a1: 270 }, 'inside 6 concave fillet R11');
      var r11 = S.contourOffset(E, rfBLItems, true, 11, { corners: 'none' }), y = 25 - Math.sqrt(16 * 16 - 14 * 14);
      assert(r11.ok && r11.entities.length === 3, 'inside 11: 3 entities ' + JSON.stringify(r11.entities));
      rfBLHas(r11.entities, { t: 'line', x1: 11, y1: 11, x2: y, y2: 11 }, 'inside 11 bottom');
      rfBLHas(r11.entities, { t: 'line', x1: 11, y1: y, x2: 11, y2: 11 }, 'inside 11 left');
      var arc = r11.entities.filter(function (e) { return e.t === 'arc'; })[0];
      assert(arc && arc.cx === 25 && arc.cy === 25 && arc.r === 16, 'inside 11 arc R16 about (25, 25) ' + JSON.stringify(arc));
      var big = S.contourOffset(E, rfBLItems, true, 30, { corners: 'none' });
      assert(!big.ok && /too large/.test(big.error), 'inside 30: nothing left ' + JSON.stringify(big));
      return '9 · 8 · 3 entities';
    });
    test('rfBL: Offset Contour of an open chain (line, tangent arc, line at a 90° corner) — Left 3 copies at 3, 6, 9: the arc copies concentric R7, R4, R1 (the arc is on the left), the 90° corner is outside on the left (R3 round it with All) and inside on the right (trimmed); a reversed travel offsets the other way', function () {
      assert(S && S.contourOffset, 'SketchSolver.contourOffset missing');
      var E = [{ t: 'line', x1: 0, y1: 0, x2: 20, y2: 0 }, { t: 'arc', cx: 20, cy: 10, r: 10, a0: 270, a1: 360 }, { t: 'line', x1: 30, y1: 10, x2: 30, y2: 30 }, { t: 'line', x1: 30, y1: 30, x2: 50, y2: 30 }];
      var items = [{ i: 0, dir: 1 }, { i: 1, dir: 1 }, { i: 2, dir: 1 }, { i: 3, dir: 1 }];
      [3, 6, 9].forEach(function (d) {
        var r = S.contourOffset(E, items, false, d, { corners: 'all' });
        assert(r.ok, 'left ' + d + ' ' + JSON.stringify(r));
        rfBLHas(r.entities, { t: 'arc', cx: 20, cy: 10, r: 10 - d, a0: 270, a1: 360 }, 'left ' + d + ' arc');
        rfBLHas(r.entities, { t: 'line', x1: 0, y1: d, x2: 20, y2: d }, 'left ' + d + ' first line');
      });
      var rt = S.contourOffset(E, items, false, -3, { corners: 'all' });
      rfBLHas(rt.entities, { t: 'arc', cx: 20, cy: 10, r: 13, a0: 270, a1: 360 }, 'right 3 arc');
      rfBLHas(rt.entities, { t: 'line', x1: 33, y1: 10, x2: 33, y2: 27 }, 'right 3: the inside corner trimmed at (33, 27)');
      rfBLHas(rt.entities, { t: 'line', x1: 33, y1: 27, x2: 50, y2: 27 }, 'right 3 last line from the trimmed corner');
      assert(rt.entities.length === 4, 'right 3: 4 entities ' + JSON.stringify(rt.entities));
      var rev = S.contourOffset(E, [{ i: 3, dir: -1 }, { i: 2, dir: -1 }, { i: 1, dir: -1 }, { i: 0, dir: -1 }], false, 3, { corners: 'all' });
      rfBLHas(rev.entities, { t: 'arc', cx: 20, cy: 10, r: 13, a0: 270, a1: 360 }, 'reversed left 3 = right 3');
      var left = S.contourOffset(E, items, false, 3, { corners: 'all' });
      rfBLHas(left.entities, { t: 'arc', cx: 30, cy: 30, r: 3, a0: 90, a1: 180 }, 'left 3: R3 round the outside corner');
      rfBLHas(left.entities, { t: 'line', x1: 27, y1: 10, x2: 27, y2: 30 }, 'left 3 upright to the corner arc');
      rfBLHas(left.entities, { t: 'line', x1: 30, y1: 33, x2: 50, y2: 33 }, 'left 3 last line from the corner arc');
      return 'open chain ok';
    });
  })();
