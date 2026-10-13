  // ---- rfH (lane H, 2026-10-12): Polygon and Straight Slot as lines and arcs, placed-point inference for every tool,
  // points of whole entities select as points
  function rfHRels(f) { return (f.rels || []).map(function (r) { return r.type + ' ' + r.refs.join('/'); }); }
  function rfHTypes(list) { return list.map(function (e) { return e.t + (e.construction ? '(c)' : ''); }).join(','); }
  function rfHSel() { return anvil.selection().map(function (s) { return s.kind === 'sketchPoint' ? 'pt:' + s.ref : s.kind + ':' + s.index; }).join(' '); }
  function rfHRoundTrip(f) {
    var m2 = K.newModel('RT'); K.runScript(m2, K.generateScript(UI.App.model));
    var s2 = m2.features.filter(function (x) { return x.type === 'sketch'; })[0], diff = [];
    ['entities', 'rels', 'dims'].forEach(function (k) { rfdSame(f[k], s2[k], k, diff); });
    return diff;
  }
  step('rfH: Polygon tool — a hexagon drawn from the origin is six lines and a construction circle held by one Polygon relation (one undo step, the centre Coincident with the origin, size and turn free); the tool PM\'s Circle diameter and Number of sides drive it; Display/Delete Relations lists Polygon; the script round trip is identical; the extrude has the hexagon\'s volume', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.sketchCurveOptions({ sides: 6, ins: false, slotDims: false, overall: false });
    try {
      var u0 = UI.App.undo.length;
      UI.setTool('polygon'); rskClick([0, 0]); rskClick([10, 0]);
      var f = UI.activeSketchFeature();
      assert(rfHTypes(f.entities) === 'line,line,line,line,line,line,circle(c)' && UI.App.undo.length === u0 + 1, 'six lines and a construction circle, one undo step: ' + rfHTypes(f.entities) + ' undo +' + (UI.App.undo.length - u0));
      var rl = rfHRels(f);
      assert(rl.indexOf('polygon 6/0/1/2/3/4/5') >= 0 && rl.indexOf('coincident 6.c/O') >= 0 && rl.filter(function (x) { return /\/O$/.test(x); }).length === 1 && !rl.some(function (x) { return /^(horizontal|vertical|equal) /.test(x); }), 'one Polygon relation, the centre on the origin: ' + rl.join(', '));
      var st = UI.sketchStatus();
      assert(st.status === 'under' && st.dof === 2, 'size and turn free: ' + JSON.stringify([st.status, st.dof]));
      assert(UI.pmTitle() === 'Polygon' && UI.pmSpec().values.dia === 20 && UI.pmSpec().values.n === 6, 'the tool PM shows the hexagon: ' + JSON.stringify(UI.pmSpec().values));
      UI.pmSetField('dia', '30');
      near(f.entities[6].r, 15, 1e-9, 'Ø30 circle');
      f.entities.slice(0, 6).forEach(function (l, k) { near(Math.hypot(l.x1, l.y1), 15, 1e-9, 'corner ' + k + ' on the Ø30 circle'); });
      UI.pmSetField('n', '5');
      assert(rfHTypes(f.entities) === 'line,line,line,line,line,circle(c)' && rfHRels(f).indexOf('polygon 5/0/1/2/3/4') >= 0 && rfHRels(f).indexOf('coincident 5.c/O') >= 0, 'five sides, the circle and its origin Coincident kept: ' + rfHTypes(f.entities) + ' ' + rfHRels(f).join(', '));
      UI.pmSetField('n', '6');
      selKey('Escape'); UI.setTool('select');
      UI.cmdDisplayRelations();
      var rows = Array.prototype.map.call(D.querySelectorAll('#rel-display .rel-row'), function (r) { return r.textContent; });
      assert(rows.some(function (t) { return /Polygon/.test(t); }), 'Display/Delete Relations: ' + rows.join(' | '));
      await UI.pmOK();
      var diff = rfHRoundTrip(f);
      assert(!diff.length, 'script round trip: ' + diff.slice(0, 5).join('; '));
      UI.exitSketch(); await idle();
      UI.cmdExtrude(false); await wait(30);
      UI.pmSetField('depth', '5'); await pmAccept();
      var vol = anvil.mass().volume, want = 1.5 * Math.sqrt(3) * 225 * 5;
      near(vol, want, 1e-6 * want, 'hexagon prism volume');
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'Ø30 hexagon, volume ' + vol.toFixed(3);
    } finally { UI.sketchCurveOptions({ sides: 6, ins: true }); }
  });
  step('rfH: Straight Slot — two lines, two arcs (Tangent, Equal) and a construction centerline; drawn level from the origin it has Horizontal on the centerline and its start on the origin (length and width free); the tool PM\'s width and length drive it; typed values become the centerline\'s length and the distance between the sides (Fully Defined); script round trip identical; extrude volume', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.sketchCurveOptions({ slotDims: false, overall: false });
    var u0 = UI.App.undo.length;
    UI.setTool('slot'); rskClick([0, 0]); rskClick([20, 0]); selEv('mousemove', rskScr([10, 3])); rskClick([10, 3]);
    var f = UI.activeSketchFeature();
    assert(rfHTypes(f.entities) === 'line,arc,line,arc,line(c)' && UI.App.undo.length === u0 + 1, 'two lines, two arcs, a centerline, one undo step: ' + rfHTypes(f.entities) + ' undo +' + (UI.App.undo.length - u0));
    var rl = rfHRels(f);
    ['tangent 0/1', 'tangent 2/1', 'tangent 2/3', 'tangent 0/3', 'equal 3/1', 'horizontal 4', 'coincident 4.p1/O'].forEach(function (x) { assert(rl.indexOf(x) >= 0, x + ' in ' + rl.join(', ')); });
    var st = UI.sketchStatus();
    assert(st.status === 'under' && st.dof === 2, 'length and width free: ' + JSON.stringify([st.status, st.dof]));
    UI.pmSetField('w', '8');
    near(f.entities[1].r, 4, 1e-9, 'width 8: R4 ends'); near(Math.abs(f.entities[0].y1 - f.entities[2].y1), 8, 1e-9, 'sides 8 apart');
    UI.pmSetField('len', '30');
    var cl = f.entities[4];
    near(Math.hypot(cl.x2 - cl.x1, cl.y2 - cl.y1), 30, 1e-9, 'length 30'); near(Math.hypot(cl.x1, cl.y1), 0, 1e-9, 'still on the origin');
    selKey('Escape');
    // typed L and W while drawing: driving dimensions (the centerline's length, the distance between the sides)
    UI.setTool('slot');
    rskClick([0, 30]); selEv('mousemove', rskScr([12, 30])); selKey('1');
    r3sType(UI.sketchNumBox()[0], '15'); r3sKey(UI.sketchNumBox()[0], 'Enter');
    selEv('mousemove', rskScr([7, 33])); selKey('6');
    r3sType(UI.sketchNumBox()[0], '6'); r3sKey(UI.sketchNumBox()[0], 'Enter');
    selKey('Escape'); UI.setTool('select');
    assert(rfHTypes(f.entities.slice(5)) === 'line,arc,line,arc,line(c)', 'second slot ' + rfHTypes(f.entities));
    assert((f.dims || []).some(function (d) { return d.e === 9 && d.k === 'len'; }) && (f.rels || []).some(function (x) { return x.type === 'distance' && x.refs.join() === '5,7' && x.v === 6; }), 'typed L on the centerline, W between the sides: ' + JSON.stringify([f.dims, f.rels.filter(function (x) { return x.type === 'distance'; })]));
    near(f.entities[9].x2 - f.entities[9].x1, 15, 1e-9, 'L 15');
    var diff = rfHRoundTrip(f);
    assert(!diff.length, 'script round trip: ' + diff.slice(0, 5).join('; '));
    UI.exitSketch(); await idle();
    UI.cmdExtrude(false); await wait(30);
    UI.pmSetField('depth', '2'); await pmAccept();
    var vol = anvil.mass().volume, want = ((30 * 8 + Math.PI * 16) + (15 * 6 + Math.PI * 9)) * 2;
    near(vol, want, 1e-6 * want, 'two slots extruded 2');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'slots 30 x 8 and 15 x 6, volume ' + vol.toFixed(3);
  });
  step('rfH: relations are inferred only where a tool places a point (fidelity #8, every tool): a Centerpoint Straight Slot\'s computed far end on a point gets no Coincident (nor its preview glyph); a Line from a line\'s midpoint to an arc\'s end, a Tangent Arc from a line end, a Circle centred on a point and a Point on a line still get Midpoint / Coincident / Tangent; a chain closed on its first point is Coincident there', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.sketchCurveOptions({ slotDims: false, overall: false });
    var f = fxSk([{ t: 'point', x: -10, y: 20 }, { t: 'line', x1: 30, y1: -20, x2: 50, y2: -20 }, { t: 'arc', cx: 0, cy: -40, r: 10, a0: 0, a1: 90 }, { t: 'point', x: 30, y: 20 }]);
    UI.setTool('cslot'); rskClick([0, 20]); rskClick([10, 20]); selEv('mousemove', rskScr([0, 23]));
    var pv = (UI.App.inferPreview || []).map(function (c) { return c.type; });
    assert(pv.indexOf('coincident') < 0, 'no Coincident glyph at the computed end: ' + pv.join());
    rskClick([0, 23]); selKey('Escape');
    assert(!(f.rels || []).some(function (x) { return x.refs.indexOf('0') >= 0; }) && rfHTypes(f.entities.slice(4)) === 'line,arc,line,arc,line(c),point', 'the far end on the point is not held: ' + rfHRels(f).join(', '));
    var n = f.entities.length;
    UI.setTool('line'); rskClick([40, -20]); rskClick([10, -40]); selKey('Escape'); selKey('Escape');
    var rl = rfHRels(f);
    assert(rl.indexOf('midpoint ' + n + '.p1/1') >= 0 && rl.indexOf('coincident ' + n + '.p2/2.p1') >= 0, 'line: Midpoint and Coincident where clicked: ' + rl.join(', '));
    n = f.entities.length;
    UI.setTool('tarc'); rskClick([50, -20]); selEv('mousemove', rskScr([55, -18])); selEv('mousemove', rskScr([60, -10])); rskClick([60, -10]); selKey('Escape');
    rl = rfHRels(f);
    assert(f.entities[n] && f.entities[n].t === 'arc' && rl.some(function (x) { return x === 'tangent ' + n + '/1' || x === 'tangent 1/' + n; }) && rl.some(function (x) { return new RegExp('^coincident ' + n + '\\.p[12]/1\\.p2$').test(x); }), 'tangent arc: Tangent and Coincident at the line end: ' + rl.join(', '));
    n = f.entities.length;
    UI.setTool('circle'); rskClick([30, 20]); rskClick([34, 20]); selKey('Escape');
    assert(rfHRels(f).indexOf('coincident ' + n + '.c/3') >= 0, 'circle centred on the point: ' + rfHRels(f).join(', '));
    n = f.entities.length;
    UI.setTool('point'); rskClick([35, -20]); selKey('Escape');
    assert(rfHRels(f).indexOf('coincident ' + n + '/1') >= 0, 'point on the line: ' + rfHRels(f).join(', '));
    n = f.entities.length;
    UI.setTool('line'); rskClick([60, 30]); rskClick([80, 30]); rskClick([80, 45]); selEv('mousemove', rskScr([60, 30]));
    pv = (UI.App.inferPreview || []).map(function (c) { return c.type; });
    assert(pv.indexOf('coincident') >= 0, 'the closing click shows its Coincident: ' + pv.join());
    rskClick([60, 30]); selKey('Escape'); selKey('Escape');
    rl = rfHRels(f);
    assert(f.entities.length === n + 3 && rl.some(function (x) { return x === 'coincident ' + (n + 2) + '.p2/' + n + '.p1' || x === 'coincident ' + n + '.p1/' + (n + 2) + '.p2'; }), 'the chain closed on its first point: ' + rl.join(', '));
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return rl.length + ' relations';
  });
  step('rfH: a Select-tool click on a point of a whole entity selects the point (Point PM), as a line end does: an ellipse\'s axis end, a script rectangle\'s corner, an arc slot\'s end; a click on the curve still opens the entity\'s PM; a corner rectangle\'s middle is no point', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = fxSk([{ t: 'ellipse', cx: 0, cy: 0, rx: 20, ry: 10, rot: 0 }, { t: 'rect', x: 30, y: -10, w: 20, h: 10 }, { t: 'aslot', cx: -40, cy: 0, r: 10, a0: 0, a1: 90, w: 4 }]);
    UI.setTool('select');
    rskClick([20, 0]);
    assert(rfHSel() === 'pt:0.v0' && UI.pmTitle() === 'Point', 'ellipse axis end: ' + rfHSel() + ' ' + UI.pmTitle());
    rskClick([50, 0]);
    assert(rfHSel() === 'pt:1.v2' && UI.pmTitle() === 'Point', 'rectangle corner: ' + rfHSel() + ' ' + UI.pmTitle());
    rskClick([-30, 0]);
    assert(rfHSel() === 'pt:2.p1' && UI.pmTitle() === 'Point', 'arc slot end: ' + rfHSel() + ' ' + UI.pmTitle());
    rskClick([-20 * Math.cos(Math.PI / 3), -10 * Math.sin(Math.PI / 3)]);
    assert(rfHSel() === 'entity:0' && UI.pmTitle() === 'Ellipse', 'the ellipse curve: ' + rfHSel() + ' ' + UI.pmTitle());
    UI.closePM();
    rskClick([40, -5]);
    assert(rfHSel() === '', 'nothing at a corner rectangle\'s middle: ' + rfHSel());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ellipse, rectangle and arc slot points';
  });
  // --- end rfH ---
