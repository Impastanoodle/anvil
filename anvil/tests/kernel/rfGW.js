  // --- rfGW (2026-11-02, lane swcheck) --- what the day's rounds added without a comparison, against SOLIDWORKS 2022 SP5 over COM
  // (head-tools/sw-reference/ref3_*.py; raw JSON in Output\SolidWorks Models\Anvil reference\2026-11-02\check-unmeasured).
  // Every number here was read from SolidWorks; test-reports/2026-11-02-unchecked-items.md has one row per item.
  (function () {
    group('rfGW: items checked against SolidWorks: open Base Flange, Bend Table, hole callouts, flange trims, Bend Outside jogs, Butt on Material Outside, Make Path, Derived Sketch, Cross-Break, Slot, Hinge, Symmetric');
    var T = 0.0598, HEAD = 'p.units("in");\np.sheet(0.0598, 0.0598, 0.5);\n', PLATE = HEAD + 'p.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n';
    function rfGWbuild(code) { var r = build(code); noErrors(r); return r; }
    function rfGWflat(r) { return K.flatPattern(r.model, r.build, K.meshFromBody(r.build.body)); }
    function rfGWbox(r, want, label) {
      var b = r.mp.bbox.min.concat(r.mp.bbox.max);
      want.forEach(function (v, i) { near(b[i], v, 1e-6, label + ' bbox ' + i); });
    }
    function rfGWerrs(r) { return Object.keys(r.errors || {}).map(function (k) { return r.errors[k]; }).join(' | '); }

    // ---- item 2: Base Flange from an open profile. Front sketch, depth 1, 16 ga, R = T, K .5
    var OPEN = [
      // id, chain, SolidWorks' volume, bbox (x0 y0 z0 x1 y1 z1), flat length, the fixed plate's point on the sketch, its bends read
      ['L', [[0, 0], [2, 0], [2, 1]], 0.180674477, [0, -T, 0, 2 + T, 1, 1], 3.021300431],
      ['L reversed', [[2, 1], [2, 0], [0, 0]], 0.173522369, [0, 0, 0, 2, 1, 1], 2.901700431],
      ['U', [[0, 1], [0, 0], [3, 0], [3, 1]], 0.301548719, [-T, -T, 0, 3 + T, 1, 1], 5.042600861],
      ['U reversed', [[3, 1], [3, 0], [0, 0], [0, 1]], 0.287244502, [0, 0, 0, 3, 1, 1], 4.803400861],
      ['Z', [[0, 0], [2, 0], [2, 1], [4, 1]], 0.294396611, [0, -T, 0, 4, 1, 1], 4.923000861],
      ['Z reversed', [[4, 1], [2, 1], [2, 0], [0, 0]], 0.294396611, [0, 0, 0, 4, 1 + T, 1], 4.923000861]
    ];
    function rfGWopen(pts) { return HEAD + 'p.sketch("Front").polyline(' + JSON.stringify(pts) + ', false).end().baseFlange(null, { depth: 1 });\n'; }
    OPEN.forEach(function (c) {
      test('rfGW: open Base Flange ' + c[0] + ': the thickness on the right of the chain, SolidWorks\' volume, bbox and flat', function () {
        var r = rfGWbuild(rfGWopen(c[1])), f = rfGWflat(r);
        nearRel(r.mp.volume, c[2], 1e-5, 'volume');
        rfGWbox(r, c[3], c[0]);
        near(Math.max(f.size[0], f.size[1]), c[4], 1e-8, 'flat length');
        return r.mp.volume.toFixed(6);
      });
    });
    test('rfGW: open Base Flange: lines not drawn end to end: the chain starts at the first line\'s free end, as SolidWorks', function () {
      function two(a, b) { return HEAD + 'p.sketch("Front").line(' + a.join(', ') + ').line(' + b.join(', ') + ').end().baseFlange(null, { depth: 1 });\n'; }
      nearRel(rfGWbuild(two([2, 0, 2, 1], [2, 0, 0, 0])).mp.volume, 0.173522369, 1e-5, 'first line (2,0)-(2,1): material inside');
      nearRel(rfGWbuild(two([2, 0, 0, 0], [2, 0, 2, 1])).mp.volume, 0.180674477, 1e-5, 'first line (2,0)-(0,0): material outside');
    });
    test('rfGW: open Base Flange: the fixed face is the longest plate\'s face on the sketch line; flanges toward its side read UP, the others DOWN (SolidWorks: U UP UP, reversed U DOWN DOWN)', function () {
      var u = rfGWbuild(rfGWopen([[0, 1], [0, 0], [3, 0], [3, 1]])), ur = rfGWbuild(rfGWopen([[3, 1], [3, 0], [0, 0], [0, 1]]));
      assert(rfGWflat(u).bends.every(function (b) { return b.up; }), 'U: ' + rfGWflat(u).bends.map(function (b) { return b.label; }));
      assert(rfGWflat(ur).bends.every(function (b) { return !b.up; }), 'U reversed: ' + rfGWflat(ur).bends.map(function (b) { return b.label; }));
      var fu = K.openBaseLayout(u.model.features.filter(function (x) { return x.openBase; })[0], u.model, { planes: u.build.planes }), fr = K.openBaseLayout(ur.model.features.filter(function (x) { return x.openBase; })[0], ur.model, { planes: ur.build.planes });
      near(fu.fixed[1], 0, 1e-12, 'U: the fixed point is on the sketch line'); near(fu.flatPlane.n[1], 1, 1e-12, 'U: looking away from the material');
      near(fr.fixed[1], 0, 1e-12, 'U reversed: on the sketch line'); near(fr.flatPlane.n[1], -1, 1e-12, 'U reversed: looking away from the material');
      // Z: the two 2 long plates tie: the first of the chain, both ways
      var z = rfGWbuild(rfGWopen([[4, 1], [2, 1], [2, 0], [0, 0]])), lz = K.openBaseLayout(z.model.features.filter(function (x) { return x.openBase; })[0], z.model, { planes: z.build.planes });
      near(lz.fixed[1], 1, 1e-12, 'Z reversed: the plate at y = 1 is fixed'); near(lz.flatPlane.n[1], -1, 1e-12, 'its normal');
      assert(lz.fixed[0] > 2, 'the first plate of the chain, x ' + lz.fixed[0]);
    });

    // ---- item 3: Bend Table, 4 bends made in this order: top 90° R.06, right 45°, bottom 90° R.12, left 135°
    var BEND4 = HEAD + 'p.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n' +
      'p.flange(1, [[3, 0.0598, 4]], { position: "bendOutside", lengthRef: "outer" });\n' +
      'p.flange(1, [[6, 0.0598, 2]], { angle: 45, position: "bendOutside", lengthRef: "outer", reverse: true });\n' +
      'p.flange(1, [[3, 0.0598, 0]], { position: "bendOutside", lengthRef: "outer", radius: 0.12 });\n' +
      'p.flange(1, [[0, 0.0598, 2]], { angle: 135, position: "bendOutside", lengthRef: "outer", reverse: true });\n';
    test('rfGW: the 4-bend part is SolidWorks\' to 1e-8 (2.64530447); its Bend Table: Tag / Direction / Angle / Inner Radius, the last bend made is A, the radius with its leading zero', function () {
      var r = rfGWbuild(BEND4);
      near(r.mp.volume, 2.64530447, 1e-8, 'volume');
      rfGWbox(r, [-0.1196, -0.689591767, -0.1798, 6.756646723, 1, 4.1196], 'bend4');
      var doc = DW.newDrawing(r.model, { date: '2026-11-02' }), v = DW.addFlatView(doc, r.mesh, { model: r.model, build: r.build });
      v.bendNotes = 'table'; v.bendCols = [];
      var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), tb = sh.annotations.filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(JSON.stringify(tb.info.columns) === '["Tag","Direction","Angle","Inner Radius"]', JSON.stringify(tb.info.columns));
      // SolidWorks read each direction from the side its fixed face looks: its sheet lies below the sketch, Anvil's above it,
      // so the same flange is UP there and DOWN here; the order, angles and radii are the comparison
      assert(JSON.stringify(tb.info.rows.map(function (x) { return [x[0], x[2], x[3]]; })) === '[["A","135°","0.060"],["B","90°","0.120"],["C","45°","0.060"],["D","90°","0.060"]]', JSON.stringify(tb.info.rows));
      var tags = sh.annotations.filter(function (a) { return a.type === 'bendTag'; }).map(function (a) { return a.text; }).join('');
      assert(tags === 'DCBA', 'tags on the bends in the order they were made: ' + tags);
      return tb.info.rows.map(function (x) { return x.join(' '); }).join(' / ');
    });

    // ---- item 14: hole callouts, line order read from the drawing exported to DXF
    test('rfGW: Hole Wizard callouts: the drill line on top, then the countersink, counterbore or thread, as the sheet SolidWorks exports', function () {
      function lines(spec) {
        var r = rfGWbuild('p.units("in");\np.sketch("Top").centerRect(0, 0, 3, 2).end().extrude(1);\np.holeWizard(' + JSON.stringify(Object.assign({ face: "Top", offset: 1, points: [[0.75, 0]], standard: 'ANSI Inch' }, spec)) + ');\n');
        var doc = DW.newDrawing(r.model, { date: '2026-11-02' }), v = DW.addView(doc, 'Top', {});
        DW.compute(doc, r.mesh, r.model, { build: r.build });
        DW.insertWizardCallouts(doc, r.model, null, { on: true });
        var sh = DW.compute(doc, r.mesh, r.model, { build: r.build }), a = sh.annotations.filter(function (x) { return x.type === 'holeCallout'; })[0];
        assert(a, 'a callout');
        return (a.lines || [a.text]).join(' | ');
      }
      var c = lines({ type: 'csk', size: '1/4', end: 'through' }), t = lines({ type: 'tap', size: '1/4-20 UNC', depth: 0.75, threadDepth: 0.5 }), b = lines({ type: 'cbore', size: '1/4', end: 'through' });
      assert(/^Ø [.0-9]+ THRU ALL.*⌵ Ø [.0-9]+ X 82°$/.test(c), 'countersink: ' + c);
      assert(/^Ø [.0-9]+ ↧ \.750? .*1\/4-20 UNC ↧ \.500?$/.test(t.replace(/ \| /g, ' ')), 'tap: ' + t);
      assert(/^Ø [.0-9]+ THRU ALL.*⌴ Ø [.0-9]+ ↧ [.0-9]+$/.test(b), 'counterbore: ' + b);
      return [c, t, b].join(' // ');
    });

    // ---- item 4: a flange trim past the end of the sheet
    test('rfGW: a flange that would trim past the end of the sheet is refused, as SolidWorks ("Unable to create the edge flange"); 15° on a 1 in sheet builds the same part', function () {
      function fl(w, A, pos) { return build(HEAD + 'p.sketch("Top").rect(0, -' + w + ', 4, ' + w + ').end().baseFlange();\np.flange(1, [[2, 0.0598, ' + w + ']], { angle: ' + A + ', position: "' + pos + '", lengthRef: "outer" });\n'); }
      assert(/trim the sheet away/.test(rfGWerrs(fl(0.5, 5, 'inside'))), 'Material Inside 5°');
      assert(/trim the sheet away/.test(rfGWerrs(fl(0.1, 150, 'outside'))), 'Material Outside 150°');
      var ok = fl(1, 15, 'inside');
      noErrors(ok);
      nearRel(ok.mp.volume, 0.423100665, 1e-7, '15°');
      rfGWbox(ok, [0, 0, 0, 4, 0.31658141, 1.742749188], '15°');
    });

    // ---- item 5: Jog Bend Outside (edited from another position; SolidWorks' InsertSheetMetalJog refuses it, the edit does not)
    function rfGWjog(A, pos, fix, off) { return PLATE + 'p.sketch("Top", 0.0598).line(3, 0, 3, -2).jog(' + (off || 0.5) + ', { fixed: [1, 0.0598, 1], angle: ' + A + ', position: "' + pos + '", offsetRef: "outside", reverse: true' + (fix ? ', fixLength: true' : '') + ' });\n'; }
    test('rfGW: Jog Bend Outside: volume and bbox as SolidWorks at 90°, 45°, 30°, Fix projected length on and off', function () {
      [[45, false, 0.5, 0.4784, 3.800612614], [45, true, 0.5, 0.502246731, 4], [90, false, 0.5, 0.4784, 3.576999139], [90, true, 0.5, 0.528990903, 4],
        [45, false, 0.2, 0.4784, 3.924876683], [45, true, 0.2, 0.487384749, 4], [30, false, 0.1, 0.4784, 3.975411631], [30, true, 0.1, 0.481340769, 4]].forEach(function (c) {
        var r = rfGWbuild(rfGWjog(c[0], 'bendOutside', c[1], c[2]));
        nearRel(r.mp.volume, c[3], 1e-6, 'volume ' + c);
        near(r.mp.bbox.max[0], c[4], 1e-6, 'x ' + c);
        near(r.mp.bbox.min[1], -c[2], 1e-6, 'y ' + c);
      });
    });
    test('rfGW: Jog at 90°: where the first plate stops and the far plate starts, each position, as SolidWorks\' section', function () {
      [['bendOutside', 3, 3.1794], ['outside', 2.9402, 3.1196], ['centerline', 2.92955, 3.10895], ['inside', 2.8804, 3.0598]].forEach(function (c) {
        var r = rfGWbuild(rfGWjog(90, c[0], false)), top = -Infinity, low = Infinity;
        r.build.body.polygons.forEach(function (q) { q.vertices.forEach(function (v) {
          if (Math.abs(v.pos.z) > 1e-9) return;
          if (Math.abs(v.pos.y - T) < 1e-9) top = Math.max(top, v.pos.x);
          if (Math.abs(v.pos.y + 0.5) < 1e-9) low = Math.min(low, v.pos.x);
        }); });
        near(top, c[1], 1e-5, c[0] + ': the first plate stops');
        near(low, c[2], 1e-5, c[0] + ': the far plate starts');
      });
    });

    // ---- item 5: Butt on Material Outside
    test('rfGW: Closed Corner Butt on Material Outside flanges: wall end to the other wall, open and closed bend, as SolidWorks; the blank to 1e-9', function () {
      var tray = PLATE + 'p.flange(1, [[2, 0.0598, 2]], { position: "outside", lengthRef: "outer" });\np.flange(1, [[4, 0.0598, 1]], { position: "outside", lengthRef: "outer" });\n';
      var a = rfGWbuild(tray + 'p.closedCorner([[4.0299, 0.6, 1.9402]], { cornerType: "butt", gap: 0.01 });\n');
      nearRel(a.mp.volume, 0.822069622, 1e-6, 'open bend, folded');
      near(K.flatPattern(a.model, a.build, a.mesh).loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0) * T, 0.822070059, 1e-8, 'open bend, blank');
      var b = rfGWbuild(tray + 'p.closedCorner([[4.0299, 0.6, 1.9402]], { cornerType: "butt", gap: 0.01, closeBend: true });\n');
      nearRel(b.mp.volume, 0.822292261, 1e-6, 'closed bend, folded');
      near(K.flatPattern(b.model, b.build, b.mesh).loops.reduce(function (s, l, i) { return s + (i ? -1 : 1) * Math.abs(K.signedArea(l)); }, 0) * T, 0.822570224, 1e-8, 'closed bend, blank');
      rfGWbox(b, [0, 0, 0, 4.0598, 1, 2.0598], 'bbox');
    });

    // ---- item 7: Make Path, the same selections as ISketchManager.MakeSketchChain
    test('rfGW: Make Path: one entity, a whole chain and a closed loop are paths; two entities with a gap and a branch are not (SolidWorks: "These segments do not form a continuous path")', function () {
      function L(a, b, c, d) { return { t: 'line', x1: a, y1: b, x2: c, y2: d }; }
      var chain = [L(0, 0, 1, 0), L(1, 0, 2, 1), L(2, 1, 3, 1)];
      function mk(ents, list) { return K.makeSketchPath({ type: 'sketch', entities: JSON.parse(JSON.stringify(ents)) }, list); }
      assert(mk(chain, [0]).ok, 'one');
      assert(mk(chain, [0, 1, 2]).ents.length === 3, 'whole');
      assert(!mk(chain, [0, 2]).ok, 'gap');
      assert(!mk(chain.concat([L(1, 0, 1, -1)]), [0, 1, 3]).ok, 'branch');
      assert(mk([L(0, 0, 2, 0), L(2, 0, 1, 1), L(1, 1, 0, 0)], [0, 1, 2]).ents.length === 3, 'closed');
    });

    // ---- item 8: Derived Sketch: an entity moved or added in the parent comes through; after Underive nothing does
    test('rfGW: Derived Sketch follows a moved end and a new entity of its parent; Underive keeps what is there and stops following (SolidWorks: a line added to the parent after Underive stays out)', function () {
      var m = K.newModel('d');
      K.runScript(m, 'p.units("in");\np.sketch("Front").line(2, 0, 3, 1).line(3, 1, 4, 1).end();\n');
      var parent = m.features.filter(function (f) { return f.type === 'sketch'; })[0], made = K.deriveSketch(parent);
      var d = { id: m.nextId++, type: 'sketch', plane: { ref: 'Front', offset: 2 }, entities: made.entities, derived: made.derived, name: 'Sketch2' };
      m.features.push(d);
      assert(d.entities.length === 2 && d.entities[0].x2 === 3, 'the same coordinates as the parent');
      parent.entities[0].x2 = 3.5; parent.entities[0].y2 = 1.5; parent.entities[1].x1 = 3.5; parent.entities[1].y1 = 1.5;
      K.syncDerivedSketches(m);
      assert(d.entities[0].x2 === 3.5 && d.entities[1].y1 === 1.5, 'a moved end comes through');
      parent.entities.push({ t: 'line', x1: 0, y1: 0, x2: 1, y2: 0 });
      K.syncDerivedSketches(m);
      assert(d.entities.length === 3, 'a new entity comes through');
      K.underiveSketch(d);
      assert(!d.derived && d.entities.length === 3, 'Underive keeps the entities');
      parent.entities.push({ t: 'line', x1: 0, y1: 1, x2: 1, y2: 1 });
      K.syncDerivedSketches(m);
      assert(d.entities.length === 3, 'after Underive it does not follow');
    });

    // ---- item 1: Cross-Break: cosmetic in both, corner to corner
    test('rfGW: Cross-Break: volume, bbox, faces and the blank unchanged; the X runs corner to corner of the face (SolidWorks\' Cross Break sketch: (0,0)-(4,-2), (0,-2)-(4,0))', function () {
      var r0 = rfGWbuild(PLATE), r = rfGWbuild(PLATE + 'p.crossBreak([1, 0.0598, 1]);\n'), f = K.flatPattern(r.model, r.build, K.meshFromBody(r.build.body));
      near(r.mp.volume, 0.4784, 1e-12, 'volume'); near(r.mp.volume, r0.mp.volume, 1e-12, 'same');
      near(Math.max(f.size[0], f.size[1]), 4, 1e-9, 'flat'); near(Math.min(f.size[0], f.size[1]), 2, 1e-9, 'flat');
      var marks = (f.etch || []).filter(function (it) { return it.crossBreak; });
      assert(marks.length === 2, 'two lines ' + marks.length);
      marks.forEach(function (x) { near(Math.hypot(x.a[0] - x.b[0], x.a[1] - x.b[1]), Math.hypot(4, 2), 1e-9, 'corner to corner'); assert(x.angle === 1 && Math.abs(x.R - T) < 1e-12 && x.up, 'defaults'); });
    });

    // ---- item 13: mates on the plate SolidWorks had: a 4 × 2 × .5 plate, a .5 slot with end centres at x -1.25 and .25, a Ø.5 pin
    if (typeof Assembly === 'undefined') { test('assembly.js loads', function () { fail('Assembly is not defined'); }); return; }
    var AS = Assembly, PL = 'p.units("in");\np.sketch("Top").centerRect(0, 0, 4, 2).circle(1.25, 0, 0.25).slot(-1.25, 0, 0.25, 0, 0.5).end().extrude(0.5);\n', PIN = 'p.units("in");\np.sketch("Top").circle(0, 0, 0.25).end().extrude(1);\n';
    function rfGWslot(constraint, extra) {
      var m = AS.newAssembly('in'), plate = AS.insert(m, { script: PL }, { fixed: true }).id, pin = AS.insert(m, { script: PIN }, { position: [0.5, 2, 0.7] }).id;
      var o = extra || {};
      o.constraint = constraint;
      AS.addMate(m, 'slot', { component: plate, cylinder: [-1.5, 0.25, 0] }, { component: pin, cylinder: [0.25, 0.5, 0] }, o);
      var b = AS.rebuild(m), ids = Object.keys(b.errors);
      assert(!ids.length, 'errors ' + ids.map(function (id) { return b.errors[id]; }).join(' | '));
      return AS.findComponent(m, pin).transform.position;
    }
    test('rfGW: Slot mate from the end the slot face names: Distance 0 is that end\'s arc centre, Percent runs centre to centre, Flip from the other end, as SolidWorks', function () {
      near(rfGWslot('distance', { distance: 0 })[0], -1.25, 1e-7, 'Distance 0');
      near(rfGWslot('percent', { percent: 0 })[0], -1.25, 1e-7, 'Percent 0');
      near(rfGWslot('distance', { distance: 0, flip: true })[0], 0.25, 1e-7, 'Distance 0, Flip');
      near(rfGWslot('distance', { distance: 0.3 })[0], -0.95, 1e-7, 'Distance .3');
      near(rfGWslot('percent', { percent: 50 })[0], -0.5, 1e-7, 'Percent 50');
      near(rfGWslot('percent', { percent: 25, flip: true })[0], -0.125, 1e-7, 'Percent 25, Flip');
      near(rfGWslot('center')[0], -0.5, 1e-7, 'Center');
    });
    test('rfGW: mate defaults as SolidWorks\' CreateMateData: Slot and Hinge closest, Symmetric aligned; with two free parts a Symmetric mate moves the first entity\'s part', function () {
      assert(AS.defaultAlignment({ type: 'slot' }) === 'closest', 'slot');
      assert(AS.defaultAlignment({ type: 'hinge', a2: { face: [0, 0, 0] }, b2: { face: [0, 0, 0] } }) === 'closest', 'hinge');
      assert(AS.defaultAlignment({ type: 'symmetric' }) === 'aligned', 'symmetric');
      var m = AS.newAssembly('in'), g = AS.insert(m, { script: PL }, { fixed: true }).id, a = AS.insert(m, { script: PIN }, { position: [-1.5, 2, 3] }).id, b = AS.insert(m, { script: PIN }, { position: [1.5, 2, -2.2] }).id;
      AS.addMate(m, 'symmetric', { component: a, cylinder: [0.25, 0.5, 0] }, { component: b, cylinder: [0.25, 0.5, 0] }, { a2: { plane: 'Right' } });
      var r = AS.rebuild(m);
      assert(!Object.keys(r.errors).length, 'errors');
      near(AS.findComponent(m, a).transform.position[2], -2.2, 1e-7, 'the first part moved to the mirror of the second');
      near(AS.findComponent(m, b).transform.position[2], -2.2, 1e-7, 'the second stayed');
      near(AS.findComponent(m, a).transform.position[0], -1.5, 1e-7, 'x as it was: already the mirror');
      return g;
    });
    test('rfGW: Hinge: the pin\'s end on the plate\'s top, in the hole, as SolidWorks: anti-aligned read back from the closest default', function () {
      var m = AS.newAssembly('in'), g = AS.insert(m, { script: PL }, { fixed: true }).id, p = AS.insert(m, { script: PIN }, { position: [2.5, 2, 3] }).id;
      AS.addMate(m, 'hinge', { component: g, cylinder: [1.5, 0.25, 0] }, { component: p, cylinder: [0.25, 0.5, 0] }, { a2: { component: g, face: [-1.9, 0.5, 0.9] }, b2: { component: p, face: [0, 0, 0] } });
      var r = AS.rebuild(m);
      assert(!Object.keys(r.errors).length, 'errors ' + JSON.stringify(r.errors));
      var q = AS.findComponent(m, p).transform.position;
      near(q[0], 1.25, 1e-7, 'x'); near(q[2], 0, 1e-7, 'z'); near(q[1], 0.5, 1e-7, 'the pin sits on the plate');
    });
  })();
