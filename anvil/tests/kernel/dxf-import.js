  // --- dxf-import: DXF into sketches (dxf-import.js): the parser (R12 / R2000 layouts, bulges, blocks, OCS, splines,
  // ellipses, units), Check Sketch for Feature and Repair Sketch, and the round trip through Anvil's own sketch DXF ---
  group('dxf-import: DXF parser, Check Sketch for Feature, Repair Sketch');
  (function () {
    if (typeof DxfImport === 'undefined') return;
    var DI = DxfImport;
    function dxiDxf(lines) { return lines.join('\r\n') + '\r\n'; }
    function dxiSection(name, body) { return ['0', 'SECTION', '2', name].concat(body, ['0', 'ENDSEC']); }
    function dxiOf(list, t) { return list.filter(function (e) { return e.t === t; }); }
    function dxiPt(p, q, tol, label) { near(p[0], q[0], tol, label + ' x'); near(p[1], q[1], tol, label + ' y'); }
    // the hand-written R12 file of the acceptance test: a 4 × 2 in outline as one open LWPOLYLINE with a quarter-circle
    // fillet (bulge tan 22.5°) at the top right and a 0.0003 in gap where it should close, a Ø0.5 hole, the bottom edge
    // again as a LINE, an INSERT of a block holding a circle (scale 2, rotation 90°), a TEXT
    function dxiPlate() {
      var b = String(Math.tan(Math.PI / 8));
      return dxiDxf([].concat(
        dxiSection('HEADER', ['9', '$ACADVER', '1', 'AC1009', '9', '$INSUNITS', '70', '1']),
        dxiSection('TABLES', ['0', 'TABLE', '2', 'LAYER', '70', '1', '0', 'LAYER', '2', 'CUT', '70', '0', '62', '1', '6', 'CONTINUOUS', '0', 'ENDTAB']),
        dxiSection('BLOCKS', ['0', 'BLOCK', '8', '0', '2', 'HOLE', '70', '0', '10', '0.0', '20', '0.0', '30', '0.0',
          '0', 'CIRCLE', '8', '0', '10', '0.25', '20', '0.0', '30', '0.0', '40', '0.1', '0', 'ENDBLK', '8', '0']),
        dxiSection('ENTITIES', [
          '0', 'LWPOLYLINE', '8', 'CUT', '90', '6', '70', '0', '10', '0', '20', '0', '10', '4', '20', '0', '10', '4', '20', '1.5', '42', b,
          '10', '3.5', '20', '2', '10', '0', '20', '2', '10', '0', '20', '0.0003',
          '0', 'CIRCLE', '8', 'CUT', '10', '1', '20', '1', '30', '0', '40', '0.25',
          '0', 'LINE', '8', 'CUT', '10', '0', '20', '0', '30', '0', '11', '4  ', '21', '0', '31', '0',
          '0', 'INSERT', '8', 'CUT', '2', 'HOLE', '10', '2.5', '20', '1', '30', '0', '41', '2', '42', '2', '50', '90',
          '0', 'TEXT', '8', 'CUT', '10', '0', '20', '0', '40', '0.1', '1', 'PART 1']),
        ['0', 'EOF']));
    }
    test('dxf-import: an R12 plate (LWPOLYLINE with a bulged corner, CIRCLE, a duplicated LINE, an INSERT scaled 2 and turned 90°, TEXT, CRLF and trailing spaces) parses to 8 geometry entities and the TEXT as Sketch Text in inches; the bulge is the R0.5 quarter arc about (3.5, 1.5); the block circle lands at (2.5, 1.5) R0.2', function () {
      var r = DI.parse(dxiPlate());
      assert(r.units === 'in', 'units ' + r.units);
      assert(r.entities.length === 9 && dxiOf(r.entities, 'line').length === 5 && dxiOf(r.entities, 'arc').length === 1 && dxiOf(r.entities, 'circle').length === 2 && dxiOf(r.entities, 'text').length === 1, 'entities ' + JSON.stringify(r.entities));
      assert(r.layers.length === 1 && r.layers[0].name === 'CUT' && r.layers[0].count === 9 && r.layers[0].color === 1, 'layers ' + JSON.stringify(r.layers));
      var a = dxiOf(r.entities, 'arc')[0];
      near(a.cx, 3.5, 1e-12, 'arc cx'); near(a.cy, 1.5, 1e-12, 'arc cy'); near(a.r, 0.5, 1e-12, 'arc r'); near(a.a0, 0, 1e-9, 'a0'); near(a.a1, 90, 1e-9, 'a1');
      var bc = dxiOf(r.entities, 'circle')[1];
      near(bc.cx, 2.5, 1e-12, 'block circle cx'); near(bc.cy, 1.5, 1e-12, 'block circle cy'); near(bc.r, 0.2, 1e-12, 'block circle r');
      assert(r.entities.every(function (e) { return e.layer === 'CUT'; }), 'block entity on layer 0 takes the INSERT\'s layer');
      var t = dxiOf(r.entities, 'text')[0];
      assert(t.str === 'PART 1' && t.h === 0.1 && t.x === 0 && t.y === 0 && !t.mode && r.texts === 1, 'text ' + JSON.stringify(t));
      assert(!r.warnings.length, 'warnings ' + r.warnings.join(' | '));
      return r.entities.length + ' entities';
    });
    test('dxf-import: Check Sketch for Feature on the plate finds the duplicate bottom edge, the 0.0003 in gap (its size), the endpoint shared by three entities and one open contour; Repair Sketch merges the duplicate and closes the gap (no end moved more than 0.00015), after which nothing is found and the profile has three loops', function () {
      var E = DI.parse(dxiPlate()).entities, iss = DI.check(E, 0.001, { unit: 'in' });
      var kinds = iss.map(function (x) { return x.type; }).sort().join(',');
      assert(kinds === 'branch,duplicate,gap', 'issues ' + kinds + ': ' + iss.map(function (x) { return x.msg; }).join(' | '));
      var gap = iss.filter(function (x) { return x.type === 'gap'; })[0], dup = iss.filter(function (x) { return x.type === 'duplicate'; })[0];
      near(gap.size, 0.0003, 1e-12, 'gap size'); dxiPt(gap.at, [0, 0.00015], 1e-12, 'gap at');
      assert(dup.entities.join() === '0,6', 'duplicate ' + dup.entities);
      assert(iss.contours.open === 1 && iss.contours.closed === 2 && iss.summary === '1 open contour, 1 gap < 0.001 in, 1 shared endpoint, 1 duplicate', iss.summary + ' ' + JSON.stringify(iss.contours));
      var rp = DI.repair(E, { tol: 0.001 });
      // (the TEXT, entity 8, is marking: Check and Repair leave it alone)
      assert(rp.report.merged === 1 && rp.report.gaps === 1 && rp.report.removed === 0 && rp.entities.length === 8, JSON.stringify(rp.report));
      assert(rp.map.join() === '0,1,2,3,4,5,-1,6,7' && rp.entities[7].t === 'text', 'map ' + rp.map);
      assert(rp.report.maxMove <= 0.00015 + 1e-12, 'moved ' + rp.report.maxMove);
      assert(JSON.stringify(rp.report.joints) === '[["0.p1","4.p2"]]', 'joints ' + JSON.stringify(rp.report.joints));
      var after = DI.check(rp.entities, 0.001);
      assert(!after.length && after.contours.open === 0 && after.contours.closed === 3, 'after: ' + after.summary);
      var prof = K.sketchProfile({ entities: rp.entities });
      assert(prof.loops.length === 3 && !prof.warnings.length, 'loops ' + prof.loops.length + ' ' + prof.warnings);
      assert(DI.endJoints(rp.entities).length === 5, 'joints ' + JSON.stringify(DI.endJoints(rp.entities)));
      return iss.summary;
    });
    test('dxf-import: R12 POLYLINE / VERTEX (closed, a bulge), entities with extrusion 0,0,-1 (X mirrored: an arc stays an arc the right way round), $MEASUREMENT 1 (mm) without $INSUNITS, paper space skipped, nested INSERTs and a MINSERT array, HATCH counted quietly', function () {
      var txt = dxiDxf([].concat(
        dxiSection('HEADER', ['9', '$MEASUREMENT', '70', '1']),
        dxiSection('BLOCKS', ['0', 'BLOCK', '2', 'PIN', '10', '1', '20', '0', '0', 'CIRCLE', '8', '0', '10', '1', '20', '0', '40', '0.5', '0', 'ENDBLK',
          '0', 'BLOCK', '2', 'PAIR', '10', '0', '20', '0', '0', 'INSERT', '8', '0', '2', 'PIN', '10', '0', '20', '0', '0', 'INSERT', '8', '0', '2', 'PIN', '10', '10', '20', '0', '0', 'ENDBLK']),
        dxiSection('ENTITIES', [
          '0', 'POLYLINE', '8', 'P', '66', '1', '10', '0', '20', '0', '30', '0', '70', '1',
          '0', 'VERTEX', '8', 'P', '10', '0', '20', '0', '0', 'VERTEX', '8', 'P', '10', '20', '20', '0', '42', '1', '0', 'VERTEX', '8', 'P', '10', '20', '20', '10', '0', 'VERTEX', '8', 'P', '10', '0', '20', '10', '0', 'SEQEND',
          '0', 'ARC', '8', 'M', '10', '5', '20', '0', '30', '0', '40', '1', '50', '0', '51', '90', '210', '0', '220', '0', '230', '-1',
          '0', 'CIRCLE', '8', 'M', '10', '5', '20', '3', '30', '0', '40', '2', '210', '0', '220', '0', '230', '-1',
          '0', 'LINE', '8', 'PS', '67', '1', '10', '0', '20', '0', '11', '1', '21', '1',
          '0', 'INSERT', '8', 'B', '2', 'PAIR', '10', '100', '20', '0',
          '0', 'INSERT', '8', 'B', '2', 'PIN', '10', '0', '20', '50', '70', '3', '71', '2', '44', '5', '45', '7',
          '0', 'HATCH', '8', 'P']),
        ['0', 'EOF']));
      var r = DI.parse(txt), E = r.entities;
      assert(r.units === 'mm', 'units ' + r.units);
      var P = E.filter(function (e) { return e.layer === 'P'; });
      assert(P.length === 4 && dxiOf(P, 'arc').length === 1 && dxiOf(P, 'line').length === 3, 'polyline pieces ' + JSON.stringify(P));
      var pa = dxiOf(P, 'arc')[0];   // bulge 1 from (20,0) to (20,10): a half circle about (20, 5) bulging right
      near(pa.cx, 20, 1e-12, 'bulge cx'); near(pa.cy, 5, 1e-12, 'bulge cy'); near(pa.r, 5, 1e-12, 'bulge r'); near(pa.a0, 270, 1e-9, 'bulge a0'); near(pa.a1, 450, 1e-9, 'bulge a1');
      var M = E.filter(function (e) { return e.layer === 'M'; });
      near(M[0].cx, -5, 1e-12, 'mirrored arc cx'); near(M[0].a0, 90, 1e-9, 'mirrored a0'); near(M[0].a1, 180, 1e-9, 'mirrored a1');
      near(M[1].cx, -5, 1e-12, 'mirrored circle cx'); near(M[1].cy, 3, 1e-12, 'mirrored circle cy');
      var B = E.filter(function (e) { return e.layer === 'B'; }).map(function (e) { return [e.cx, e.cy]; });
      // PAIR at x 100: PIN (base 1,0; circle at 1,0) at 0 and 10 -> 100, 110; the MINSERT 3 × 2 at 0,50 spaced 5 / 7
      assert(B.length === 8, 'block circles ' + JSON.stringify(B));
      var want = [[100, 0], [110, 0], [0, 50], [0, 57], [5, 50], [5, 57], [10, 50], [10, 57]];
      want.forEach(function (w, i) { dxiPt(B[i], w, 1e-12, 'block circle ' + i); });
      assert(!E.some(function (e) { return e.layer === 'PS'; }), 'paper space skipped');
      assert(r.warnings.some(function (w) { return /paper space/.test(w); }) && !r.warnings.some(function (w) { return /HATCH/i.test(w); }), r.warnings.join(' | '));
      assert(r.skipped.HATCH === 1 && r.skippedNote === '1 hatch skipped', 'hatch counted quietly ' + JSON.stringify([r.skipped, r.skippedNote]));
      return E.length + ' entities';
    });
    test('dxf-import: SPLINE — control points with uniform knots (not Anvil\'s chord spacing) map exactly onto tangent-driving Anvil splines, a fit-point SPLINE goes through its points, a rational one (weights) becomes lines within the tolerance; ELLIPSE full and partial, mirrored by the extrusion', function () {
      var ctrl = [[0, 0], [1, 3], [4, 4], [6, 1], [9, 2], [10, 5]], knots = [0, 0, 0, 0, 1, 2, 3, 3, 3, 3];
      var sp = ['0', 'SPLINE', '8', 'S', '70', '8', '71', '3', '72', String(knots.length), '73', String(ctrl.length), '74', '0'];
      knots.forEach(function (k) { sp.push('40', String(k)); });
      ctrl.forEach(function (c) { sp.push('10', String(c[0]), '20', String(c[1]), '30', '0'); });
      var fit = ['0', 'SPLINE', '8', 'F', '70', '8', '71', '3', '72', '0', '73', '0', '74', '3', '11', '0', '21', '20', '11', '5', '21', '25', '11', '10', '21', '20'];
      var rat = ['0', 'SPLINE', '8', 'R', '70', '12', '71', '2', '72', '6', '73', '3', '40', '0', '40', '0', '40', '0', '40', '1', '40', '1', '40', '1',
        '41', '1', '41', String(Math.SQRT1_2), '41', '1', '10', '10', '20', '0', '10', '10', '20', '10', '10', '0', '20', '10'];
      var el = ['0', 'ELLIPSE', '8', 'E', '10', '30', '20', '0', '11', '0', '21', '4', '40', '0.5', '41', '0', '42', String(2 * Math.PI),
        '0', 'ELLIPSE', '8', 'E', '10', '40', '20', '0', '11', '3', '21', '0', '40', '0.5', '41', '0', '42', String(Math.PI / 2), '210', '0', '220', '0', '230', '-1'];
      var r = DI.parse(dxiDxf([].concat(dxiSection('HEADER', ['9', '$INSUNITS', '70', '4']), dxiSection('ENTITIES', [].concat(sp, fit, rat, el)), ['0', 'EOF'])));
      // the B-spline itself, by de Boor, against the Anvil splines' Bézier spans
      var S = r.entities.filter(function (e) { return e.layer === 'S'; });
      assert(S.length >= 1 && S.every(function (e) { return e.t === 'spline'; }), 'splines ' + JSON.stringify(S));
      var spans = DI._.bezSpans(ctrl, knots, 3), bez = [];
      S.forEach(function (e) { bez = bez.concat(K.splineGeom(e).bez); });
      assert(bez.length === spans.length, bez.length + ' spans, expected ' + spans.length);
      bez.forEach(function (B, i) { for (var j = 0; j < 4; j++) dxiPt(B[j], spans[i][j], 1e-9, 'span ' + i + ' cp ' + j); });
      dxiPt(K.bezPoint(bez[0], 0), [0, 0], 1e-12, 'clamped start'); dxiPt(K.bezPoint(bez[2], 1), [10, 5], 1e-12, 'clamped end');
      var F = r.entities.filter(function (e) { return e.layer === 'F'; });
      assert(F.length === 1 && F[0].t === 'spline' && JSON.stringify(F[0].pts) === '[[0,20],[5,25],[10,20]]', 'fit spline ' + JSON.stringify(F));
      var R = r.entities.filter(function (e) { return e.layer === 'R'; });
      assert(R.length > 8 && R.every(function (e) { return e.t === 'line'; }), 'rational: ' + R.length + ' lines');
      R.forEach(function (e) { [[e.x1, e.y1], [e.x2, e.y2], [(e.x1 + e.x2) / 2, (e.y1 + e.y2) / 2]].forEach(function (p) { near(Math.hypot(p[0] - 0, p[1] - 0), 10, 2.5e-3 + 1e-9, 'quarter circle (rational) point'); }); });
      dxiPt([R[0].x1, R[0].y1], [10, 0], 1e-12, 'rational start'); dxiPt([R[R.length - 1].x2, R[R.length - 1].y2], [0, 10], 1e-12, 'rational end');
      var E = r.entities.filter(function (e) { return e.layer === 'E'; });
      assert(E[0].t === 'ellipse' && E[1].t === 'pellipse', JSON.stringify(E));
      near(E[0].rx, 4, 1e-12, 'rx'); near(E[0].ry, 2, 1e-12, 'ry'); near(Math.abs(E[0].rot), 90, 1e-9, 'rot');
      // ELLIPSE is in world coordinates: the extrusion 0,0,-1 only turns its minor axis (N × major) and its sense, so the
      // quarter runs clockwise from (43, 0) to (40, -1.5): counterclockwise from (40, -1.5) to (43, 0)
      var e1 = E[1], ends = [K.ellipsePoint(e1, e1.a0 * Math.PI / 180), K.ellipsePoint(e1, e1.a1 * Math.PI / 180)];
      near(e1.cx, 40, 1e-12, 'ellipse cx'); near(e1.a1 - e1.a0, 90, 1e-9, 'quarter');
      assert((Math.hypot(ends[0][0] - 40, ends[0][1] + 1.5) < 1e-9 && Math.hypot(ends[1][0] - 43, ends[1][1]) < 1e-9), 'ends ' + JSON.stringify(ends));
      assert(r.warnings.some(function (w) { return /rational/.test(w); }) && r.warnings.some(function (w) { return /fit points/.test(w); }), r.warnings.join(' | '));
      return S.length + ' spline(s), ' + R.length + ' lines for the rational arc';
    });
    test('dxf-import: round trip — Anvil\'s own sketch DXF (R2000 and R12) of lines, an arc, a circle, open / closed / tangent-driven splines and full / partial / turned ellipses parses back to the same geometry (R2000 within 1e-6; R12\'s arcs for splines and ellipses within DXF_TOL.freeArc)', function () {
      var sk = { entities: [
        { t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'arc', cx: 10, cy: 5, r: 5, a0: -90, a1: 90 }, { t: 'line', x1: 10, y1: 10, x2: 0, y2: 10 }, { t: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
        { t: 'circle', cx: 3, cy: 5, r: 1.5 },
        { t: 'spline', pts: [[20, 0], [22, 3], [25, 1], [28, 4]] }, { t: 'spline', pts: [[40, 0], [44, 2], [42, 6], [38, 3]], closed: true },
        { t: 'spline', pts: [[50, 0], [52, 3], [55, 1]], tans: [[30, 2], null, [-45, 1]] },
        { t: 'ellipse', cx: 30, cy: 20, rx: 6, ry: 3, rot: 0 }, { t: 'pellipse', cx: 50, cy: 20, rx: 2, ry: 5, rot: 0, a0: 10, a1: 200 }, { t: 'ellipse', cx: 70, cy: 20, rx: 6, ry: 3, rot: 30 }
      ] };
      // every exact point of a (100 per curve) lies on b within tol, and the reverse
      function onCurve(a, b, tol, label) {
        function pts(e) {
          var out = [], i;
          if (e.t === 'spline') K.splineGeom(e).bez.forEach(function (B) { for (i = 0; i <= 25; i++) out.push(K.bezPoint(B, i / 25)); });
          else if (e.t === 'ellipse' || e.t === 'pellipse') { var u0 = e.t === 'ellipse' ? 0 : e.a0, u1 = e.t === 'ellipse' ? 360 : e.a1; for (i = 0; i <= 100; i++) out.push(K.ellipsePoint(e, (u0 + (u1 - u0) * i / 100) * Math.PI / 180)); }
          else if (e.t === 'arc') for (i = 0; i <= 100; i++) { var g = (e.a0 + (e.a1 - e.a0) * i / 100) * Math.PI / 180; out.push([e.cx + e.r * Math.cos(g), e.cy + e.r * Math.sin(g)]); }
          else if (e.t === 'line') for (i = 0; i <= 10; i++) out.push([e.x1 + (e.x2 - e.x1) * i / 10, e.y1 + (e.y2 - e.y1) * i / 10]);
          return out;
        }
        function dense(list) { var o = []; list.forEach(function (e) { if (e.t === 'arc') { for (var i = 0; i <= 4000; i++) { var g = (e.a0 + (e.a1 - e.a0) * i / 4000) * Math.PI / 180; o.push([e.cx + e.r * Math.cos(g), e.cy + e.r * Math.sin(g)]); } } else o = o.concat(pts(e)); }); return o; }
        var A = pts(a), Bd = dense(b);
        A.forEach(function (p, i) { var d = Infinity; Bd.forEach(function (q) { d = Math.min(d, Math.hypot(p[0] - q[0], p[1] - q[1])); }); assert(d <= tol, label + ': point ' + i + ' is ' + d + ' off'); });
      }
      var r2 = DI.parse(K.exportDXFSketch(sk, 'mm', { version: 'R2000' }));
      assert(r2.units === 'mm' && r2.entities.length === sk.entities.length && !r2.warnings.length, r2.entities.length + ' entities ' + r2.warnings);
      sk.entities.forEach(function (e, i) {
        var g = r2.entities[i];
        if (e.t === 'line') ['x1', 'y1', 'x2', 'y2'].forEach(function (k) { near(g[k], e[k], 1e-6, 'line ' + i + ' ' + k); });
        else if (e.t === 'circle') ['cx', 'cy', 'r'].forEach(function (k) { near(g[k], e[k], 1e-6, 'circle ' + k); });
        else if (e.t === 'arc') { ['cx', 'cy', 'r'].forEach(function (k) { near(g[k], e[k], 1e-6, 'arc ' + k); }); near(((g.a0 - e.a0) % 360 + 360) % 360, 0, 1e-6, 'arc a0'); near(g.a1 - g.a0, e.a1 - e.a0, 1e-6, 'arc sweep'); }
        else if (e.t === 'spline') {
          assert(g.t === 'spline' && !!g.closed === !!e.closed, 'spline ' + i + ' ' + JSON.stringify(g));
          var ba = K.splineGeom(e).bez, bb = K.splineGeom(g).bez;
          assert(ba.length === bb.length, 'spans');
          ba.forEach(function (B, k) { for (var j = 0; j < 4; j++) dxiPt(bb[k][j], B[j], 1e-6, 'spline ' + i + ' span ' + k + ' cp ' + j); });
        } else { assert(g.t === e.t, 'type ' + g.t); onCurve(e, [g], 1e-6, e.t + ' ' + i); onCurve(g, [e], 1e-6, e.t + ' ' + i + ' back'); }
      });
      var r1 = DI.parse(K.exportDXFSketch(sk, 'mm', { version: 'R12' }));
      assert(r1.entities.every(function (e) { return e.t === 'line' || e.t === 'arc' || e.t === 'circle'; }), 'R12 has lines and arcs only');
      for (var i = 0; i < 5; i++) assert(JSON.stringify(Object.keys(r1.entities[i]).sort()) === JSON.stringify(Object.keys(r2.entities[i]).sort()) && ['cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2'].every(function (k) { return r1.entities[i][k] == null || Math.abs(r1.entities[i][k] - r2.entities[i][k]) <= 1e-6; }), 'R12 entity ' + i);
      // the rest: arcs through each free curve, chained end to end
      var free = r1.entities.slice(5), ftol = K.DXF_TOL.freeArc.mm + 2e-6;
      sk.entities.slice(5).forEach(function (e, k) { onCurve(e, free, ftol, 'R12 ' + e.t + ' ' + (k + 5)); });
      // the arcs' ends, rebuilt from rounded centres and angles, miss each other by about 1e-6: Check Sketch sees the
      // gaps, Repair Sketch at 1e-5 closes them, and only the three open curves' ends are left
      var iss = DI.check(free, 1e-5);
      assert(iss.every(function (x) { return x.type === 'gap' && x.size < 1e-5 || x.type === 'open'; }), 'R12 arcs chain: ' + iss.summary);
      var fixed = DI.repair(free, { tol: 1e-5, join: false }), iss2 = DI.check(fixed.entities, 1e-5);
      assert(fixed.report.maxMove < 1e-5 && iss2.every(function (x) { return x.type === 'open'; }) && iss2.contours.open === 3 && iss2.contours.closed === 3, 'R12 repaired: ' + iss2.summary + ' ' + JSON.stringify(iss2.contours));
      return r2.entities.length + ' entities (R2000), ' + r1.entities.length + ' (R12)';
    });
    test('dxf-import: Repair Sketch — overlapping collinear lines merge into one, collinear pieces and co-radial arcs join (two half arcs make a circle), tiny entities go, crossings split (off by default); no point moves more than the tolerance; construction geometry and points are left alone', function () {
      var E = [
        { t: 'line', x1: 0, y1: 0, x2: 6, y2: 0 }, { t: 'line', x1: 4, y1: 0.0002, x2: 10, y2: 0 },     // overlap
        { t: 'line', x1: 10, y1: 0, x2: 10, y2: 4 }, { t: 'line', x1: 10, y1: 4, x2: 10, y2: 10 },      // collinear pieces
        { t: 'line', x1: 10, y1: 10, x2: 10.0001, y2: 10 },                                           // tiny
        { t: 'line', x1: 10.0001, y1: 10.0003, x2: 0, y2: 10 }, { t: 'line', x1: 0, y1: 10, x2: 0, y2: 0 },
        { t: 'arc', cx: 5, cy: 5, r: 2, a0: 0, a1: 180 }, { t: 'arc', cx: 5, cy: 5, r: 2, a0: 180, a1: 360 },
        { t: 'line', x1: -5, y1: 5, x2: 15, y2: 5, construction: true }, { t: 'point', x: 3, y: 3 }
      ];
      var rp = DI.repair(E, { tol: 0.001 }), R = rp.report;
      assert(R.removed === 1 && R.merged === 1 && R.joined === 2 && R.gaps >= 1 && R.split === 0, JSON.stringify(R));
      assert(R.maxMove <= 0.001, 'moved ' + R.maxMove);
      var out = rp.entities;
      assert(dxiOf(out, 'circle').length === 1 && dxiOf(out, 'arc').length === 0, 'arcs joined into a circle: ' + JSON.stringify(out));
      var c = dxiOf(out, 'circle')[0]; near(c.cx, 5, 1e-9, 'circle cx'); near(c.r, 2, 1e-9, 'circle r');
      assert(dxiOf(out, 'line').filter(function (e) { return !e.construction; }).length === 4, 'four sides ' + JSON.stringify(dxiOf(out, 'line')));
      assert(out.some(function (e) { return e.construction && e.x1 === -5 && e.x2 === 15; }) && out.some(function (e) { return e.t === 'point' && e.x === 3; }), 'construction and point kept');
      assert(rp.map[9] >= 0 && rp.map[10] >= 0 && rp.map[4] === -1 && rp.map[1] === -1 && rp.changed.length >= 3, 'map ' + rp.map + ' changed ' + rp.changed);
      var iss = DI.check(out, 0.001);
      assert(!iss.length && iss.contours.closed === 2, 'after repair: ' + iss.summary);
      assert(K.sketchProfile({ entities: out }).loops.length === 2, 'two loops');
      // split at crossings: a construction-free cross splits both lines in two
      var X = [{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 5, y1: -5, x2: 5, y2: 5 }, { t: 'circle', cx: 5, cy: 0, r: 3 }];
      var c0 = DI.check(X, 0.001);
      assert(c0.filter(function (x) { return x.type === 'cross'; }).length === 5, 'crossings ' + c0.summary);
      assert(DI.repair(X, { tol: 0.001 }).entities.length === 3, 'split is off by default');
      var sp = DI.repair(X, { tol: 0.001, split: true });
      assert(sp.report.split === 9 && sp.entities.length === 12 && dxiOf(sp.entities, 'arc').length === 4, 'split ' + JSON.stringify(sp.report) + ' ' + sp.entities.length);
      assert(!DI.check(sp.entities, 0.001).some(function (x) { return x.type === 'cross'; }), 'no crossing left after the split');
      return JSON.stringify({ removed: R.removed, merged: R.merged, joined: R.joined, gaps: R.gaps });
    });
    test('dxf-import: transform scales, turns and moves every entity type (arcs, ellipses, spline tangents) exactly; bounds of an arc include its quadrant points', function () {
      var E = [{ t: 'arc', cx: 1, cy: 0, r: 1, a0: 0, a1: 90 }, { t: 'ellipse', cx: 0, cy: 0, rx: 2, ry: 1, rot: 0 }, { t: 'spline', pts: [[0, 0], [1, 1]], tans: [[0, 1], null] }, { t: 'point', x: 1, y: 2 }];
      var T = DI.transform(E, { s: 25.4, rot: 90, dx: 1, dy: 2 });
      near(T[0].cx, 1, 1e-9, 'arc cx'); near(T[0].cy, 27.4, 1e-9, 'arc cy'); near(T[0].r, 25.4, 1e-12, 'arc r'); near(T[0].a0, 90, 1e-9, 'arc a0'); near(T[0].a1, 180, 1e-9, 'arc a1');
      near(T[1].rx, 50.8, 1e-12, 'rx'); near(T[1].rot, 90, 1e-12, 'ellipse rot');
      near(T[2].tans[0][0], 90, 1e-12, 'tangent turned'); near(T[2].tans[0][1], 1, 1e-12, 'weight kept');
      near(T[3].x, -49.8, 1e-9, 'point x'); near(T[3].y, 27.4, 1e-9, 'point y');
      var b = DI.bounds([{ t: 'arc', cx: 0, cy: 0, r: 1, a0: 45, a1: 135 }]);
      near(b[3], 1, 1e-12, 'arc top (the 90° quadrant)'); near(b[1], Math.SQRT1_2, 1e-12, 'arc bottom');
      return 'ok';
    });
  })();
  // --- end dxf-import ---

