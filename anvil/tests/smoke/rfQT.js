  // ---- rfQT (local-2026-11-18b, lane sketchtools): the Sketch tab tool by tool, as a SolidWorks 2024 user clicks it, by
  // real mouse / key events on INCH parts (report test-reports/2026-11-19-sketch-tools.md). Uses rfPR's helpers.
  function rfQTFlyWrap(group) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (w) { return w._fly && w._fly.fly === group; })[0]; }
  // the ribbon flyout `group`, the row whose label starts with `label` (the caret, then the row, as a mouse does)
  function rfQTFly(group, label) {
    UI.setRibbonTab('Sketch');
    var w = rfQTFlyWrap(group); assert(w, 'flyout ' + group);
    var c = w.querySelector('.rb-caret'); c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); c.click();
    var rows = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').trim().indexOf(label) === 0; });
    assert(rows.length, label + ' in the ' + group + ' flyout: ' + Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (r) { return r.textContent; }).join('|'));
    rows[0].click(); if (UI.closeMenus) UI.closeMenus();
  }
  function rfQTPM() {
    if (!UI.hasPM()) return 'no PM';
    var h = D.querySelector('#pm .pm-head span');
    return (h ? h.textContent : '?') + ' [' + Array.prototype.map.call(D.querySelectorAll('#pm .pm-group'), function (g) {
      var t = g.querySelector('h4'), fs = Array.prototype.map.call(g.querySelectorAll('input, select'), function (i) { return (i.dataset.key || i.name || '?') + ':' + (i.type === 'radio' ? i.value + (i.checked ? '*' : '') : i.type === 'checkbox' ? (i.checked ? 'on' : 'off') : i.value); });
      return (t ? t.textContent.replace(/^[▸▾]/, '').trim() : '-') + '{' + fs.join(',') + '}';
    }).join(' ') + ']';
  }
  function rfQTSum(f) {
    f = f || rfPRF();
    var an = W.SketchSolver.analyze(f);
    return f.entities.length + ' ents [' + f.entities.map(function (e, i) {
      var g = e.t === 'line' ? [e.x1, e.y1, e.x2, e.y2] : e.t === 'circle' ? [e.cx, e.cy, e.r] : e.t === 'arc' ? [e.cx, e.cy, e.r, e.a0, e.a1] : e.t === 'point' ? [e.x, e.y] : [];
      return i + e.t + (e.construction ? '*' : '') + (e.infinite ? '~' : '') + '(' + g.map(function (v) { return (+v).toFixed(3); }).join(',') + ')';
    }).join(' ') + '] rels ' + rfPRRels(f).join(' ') + ' dims ' + (f.dims || []).length + ' ' + an.status + ' dof ' + an.dof;
  }
  function rfQTRadio(v) { var r = Array.prototype.filter.call(D.querySelectorAll('#pm input[type=radio]'), function (x) { return x.value === v; })[0]; assert(r, 'radio ' + v); r.click(); }
  function rfQTBtn(re) { UI.setRibbonTab('Sketch'); var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return re.test(x.textContent.replace(/\s+/g, ' ').trim()); })[0]; assert(b, 'ribbon button ' + re); b.click(); }
  function rfQTCtrlZ() { rfPRKey('z', { ctrlKey: true }); }
  function rfQTDbl(uv) { var c = rfPRScr(uv); rfPREv('mousedown', c); rfPREv('mouseup', c); $('viewport').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0, clientX: c[0], clientY: c[1] })); }
  async function rfQTRect(a, b) { UI.setTool('rect'); await wait(20); await rfPRClick(a); await rfPRClick(b); await rfPREsc(2); }
  async function rfQTLines(list) { UI.setTool('line'); await wait(20); for (var k = 0; k < list.length; k++) { await rfPRClick(list[k][0]); await rfPRClick(list[k][1]); await rfPREsc(1); UI.setTool('line'); await wait(10); } await rfPREsc(2); }
  function rfQTBoxes() { return Array.prototype.map.call(D.querySelectorAll('#pm .pm-pick'), function (b) { return (b.classList.contains('active') ? '*' : '') + b.textContent.trim(); }).join('|'); }
  function rfQTTemp() { return (UI.App.tempEntities || []).length; }
  // every relation in `want` is in the sketch, and nothing else when `only`
  function rfQTRels(want, only, label) {
    var have = rfPRRels();
    want.forEach(function (r) { assert(have.indexOf(r) >= 0, label + ': no ' + r + ' in ' + have.join(' ')); });
    if (only) assert(have.length === want.length, label + ': extra relations ' + have.filter(function (r) { return want.indexOf(r) < 0; }).join(' '));
  }
  function rfQTDof(dof, label) { var an = rfPRAn(); assert(an.dof === dof, label + ': dof ' + an.dof + ' (want ' + dof + ') ' + rfQTSum()); }
  function rfQTNear(a, b, label) { near(a, b, 1e-9, label); }
  async function rfQTBox(i) { var bx = D.querySelectorAll('#pm .pm-pick'); assert(bx[i], 'box ' + i + ' in ' + rfQTBoxes()); bx[i].click(); await wait(20); }
  // the tool from its flyout, the clicks, check(f); then Ctrl+Z takes it back in one step, Esc mid-tool leaves nothing
  async function rfQTDraw(group, label, pts, check) {
    await rfPRNew('Front', 8, 5, 0.3, 0.6);
    rfQTFly(group, label); await wait(30);
    var tool = UI.App.tool, u0 = UI.App.undo.length;
    for (var k = 0; k < pts.length; k++) await rfPRClick(pts[k]);
    var out = label + ': ' + rfQTSum();
    assert(UI.App.undo.length - u0 === 1, label + ': one undo step, got ' + (UI.App.undo.length - u0));
    assert(UI.App.tool === tool && UI.hasPM(), label + ': the tool stays with its PropertyManager (' + UI.App.tool + ')');
    check(rfPRF());
    rfQTCtrlZ(); await idle(); await wait(20);
    assert(rfPRF().entities.length === 0, label + ': Ctrl+Z left ' + rfPRF().entities.length);
    await rfPRClick(pts[0]); if (pts.length > 2) await rfPRClick(pts[1]); rfPREv('mousemove', rfPRScr(pts[pts.length - 1])); await wait(20);
    assert(rfQTTemp() > 0, label + ': a preview while drawing');
    rfPRKey('Escape'); await wait(20);
    assert(rfPRF().entities.length === 0 && rfQTTemp() === 0 && UI.App.tool === 'select' && !UI.hasPM(), label + ': Esc mid-tool left ' + rfPRF().entities.length + ' entities, tool ' + UI.App.tool);
    UI.cancelSketch(); await idle();
    return out;
  }
  // ---------------------------------------------------------------- 1. Line, Centerline, Midpoint Line
  step('rfQT 1 line family: Line by clicks (Horizontal / Vertical / Coincident by inference, Ctrl+Z one segment, Esc mid-line leaves nothing), by click-drag (one line, the next click starts a new one), the tangent arc by moving back over the end and by the A key, Centerline (For construction), Midpoint Line', async function () {
    var log = [];
    try {
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      rfQTFly('line', 'Line'); await wait(30);
      assert(UI.App.tool === 'line' && /^Insert Line/.test(rfQTPM()), 'Insert Line: ' + rfQTPM());
      await rfPRClick([0.5, 0.5]); await rfPRClick([2.5, 0.52]); await rfPRClick([2.52, 1.8]); await rfPRClick([1, 2.6]);
      log.push(rfQTSum());
      rfQTRels(['horizontal(0)', 'vertical(1)', 'coincident(1.p1,0.p2)', 'coincident(2.p1,1.p2)'], true, 'chain'); rfQTDof(6, 'chain');
      rfPRKey('Escape'); await wait(20);
      rfQTCtrlZ(); await idle(); await wait(20);
      assert(rfPRF().entities.length === 2, 'Ctrl+Z took back one segment: ' + rfPRF().entities.length);
      rfQTFly('line', 'Line'); await wait(30);
      await rfPRClick([-1, -1]); rfPREv('mousemove', rfPRScr([0, -1.5])); await wait(30);
      assert(rfQTTemp() === 1, 'the line follows the cursor'); rfPRKey('Escape'); await wait(20);
      assert(rfPRF().entities.length === 2 && rfQTTemp() === 0 && UI.App.tool === 'select', 'Esc mid-line: ' + rfQTSum());
      UI.cancelSketch(); await idle();
      // click-drag: one line, then click-click starts a new line
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      UI.setTool('line'); await wait(20);
      await rfPRDrag([0, 0.5], [1.5, 0.52], 10);
      assert(rfPRF().entities.length === 1 && UI.App.tool === 'line', 'click-drag: ' + rfQTSum());
      await rfPRClick([0, 2]); rfPREv('mousemove', rfPRScr([1, 2.5])); await wait(30);
      var t = (UI.App.tempEntities || [])[0];
      assert(t && t.t === 'line' && Math.abs(t.x1) < 1e-9 && Math.abs(t.y1 - 2) < 1e-9, 'the next click starts a new line: ' + JSON.stringify(t));
      await rfPREsc(2); UI.cancelSketch(); await idle();
      // tangent arc by moving back over the end, then the A key
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      UI.setTool('line'); await wait(20);
      await rfPRClick([0, 0]); await rfPRClick([2, 0]);
      var E = rfPRScr([2, 0]);
      rfPREv('mousemove', [E[0] + 30, E[1]]); await wait(20); rfPREv('mousemove', [E[0] + 2, E[1]]); await wait(20); rfPREv('mousemove', E); await wait(20);
      rfPREv('mousemove', [E[0] + 15, E[1] - 15]); await wait(20); rfPREv('mousemove', rfPRScr([2.8, 0.8])); await wait(20);
      assert(UI.App.tempEntities[0].t === 'arc', 'back over the end: an arc preview');
      await rfPRClick([2, 1]);
      var a = rfPRF().entities[1];
      assert(a.t === 'arc', 'arc made'); rfQTNear(a.cx, 2, 'arc centre x'); rfQTNear(a.cy, 0.5, 'arc centre y'); rfQTNear(a.r, 0.5, 'arc r');
      rfQTRels(['tangent(1,0)', 'coincident(1.p1,0.p2)'], false, 'tangent arc');
      rfPREv('mousemove', rfPRScr([1, 1.5])); await wait(20);
      assert(UI.App.tempEntities[0].t === 'line', 'back to Line after the arc');
      rfPRKey('a'); await wait(20); rfPREv('mousemove', rfPRScr([1, 2.2])); await wait(20);
      assert(UI.App.tempEntities[0].t === 'arc', 'A: an arc');
      await rfPRClick([2, 2]);
      rfQTRels(['tangent(2,1)', 'coincident(2.p2,1.p2)'], false, 'A arc'); rfQTDof(5, 'line + 2 tangent arcs');
      await rfPREsc(2); UI.cancelSketch(); await idle();
      // Centerline, Midpoint Line
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      rfQTFly('line', 'Centerline'); await wait(30);
      assert(D.querySelector('#pm input[data-key="construction"]').checked, 'Centerline: For construction checked');
      await rfPRClick([0, 0]); await rfPRClick([0.02, 2]);
      assert(rfPRF().entities[0].construction, 'a centerline is construction');
      rfQTRels(['vertical(0)', 'coincident(0.p1,O)'], true, 'centerline'); await rfPREsc(2);
      rfQTFly('line', 'Midpoint Line'); await wait(30);
      await rfPRClick([3, 1]); await rfPRClick([4, 1.02]);
      var m = rfPRF().entities[1];
      rfQTNear(m.x1, 2, 'midpoint line start'); rfQTNear(m.x2, 4, 'midpoint line end'); rfQTDof(1 + 3, 'centerline + midpoint line');
      log.push(rfQTSum());
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 2. the five rectangles
  step('rfQT 2 rectangles: Corner, Center (construction lines from corners / from midpoints / none), 3 Point Corner, 3 Point Center, Parallelogram by clicks: relations and DOF as SolidWorks, one undo step, Esc mid-tool leaves nothing', async function () {
    var log = [];
    try {
      var base = ['coincident(0.p2,1.p1)', 'coincident(1.p2,2.p1)', 'coincident(2.p2,3.p1)', 'coincident(3.p2,0.p1)'], hv = ['horizontal(0)', 'vertical(1)', 'horizontal(2)', 'vertical(3)'];
      log.push(await rfQTDraw('rect', 'Corner Rectangle', [[0.5, 0.5], [2.5, 1.7]], function (f) { rfQTRels(base.concat(hv), true, 'corner'); rfQTDof(4, 'corner'); rfQTNear(f.entities[1].y2, 1.7, 'corner top'); }));
      log.push(await rfQTDraw('rect', 'Center Rectangle', [[1.5, 1], [2.5, 1.7]], function (f) {
        assert(f.entities.length === 7 && f.entities[4].construction && f.entities[5].construction && f.entities[6].t === 'point', 'center: diagonals and a centre point');
        rfQTNear(f.entities[0].y1, 0.3, 'center: bottom'); rfQTRels(base.concat(hv, ['midpoint(6,4)']), false, 'center'); rfQTDof(4, 'center');
      }));
      log.push(await rfQTDraw('rect', '3 Point Corner', [[0.5, 0.5], [2.5, 1.5], [2, 2.5]], function () { rfQTRels(base.concat(['parallel(0,2)', 'parallel(1,3)', 'perpendicular(0,1)']), true, '3 point corner'); rfQTDof(5, '3 point corner'); }));
      log.push(await rfQTDraw('rect', '3 Point Center', [[1.5, 1], [2.5, 1.5], [1, 2]], function (f) { rfQTDof(5, '3 point center'); near(Math.hypot(f.entities[0].x2 - f.entities[0].x1, f.entities[0].y2 - f.entities[0].y1), Math.sqrt(5), 1e-9, '3 point center: side'); }));
      log.push(await rfQTDraw('rect', 'Parallelogram', [[0.5, 0.5], [2.5, 0.8], [3, 2]], function () { rfQTRels(base.concat(['parallel(0,2)', 'parallel(1,3)']), true, 'parallelogram'); rfQTDof(6, 'parallelogram'); }));
      // Center Rectangle: From midpoints, then no construction lines; the options put back
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      rfQTFly('rect', 'Center Rectangle'); await wait(30); rfQTRadio('true'); await wait(20);
      await rfPRClick([1.5, 1]); await rfPRClick([2.5, 1.7]);
      rfQTRels(['midpoint(4.p1,0)', 'midpoint(4.p2,2)', 'midpoint(5.p1,1)', 'midpoint(5.p2,3)', 'midpoint(6,4)'], false, 'from midpoints'); rfQTDof(4, 'from midpoints');
      rfQTCtrlZ(); await idle(); await wait(20);
      D.querySelector('#pm input[data-key="cons"]').click(); await wait(20);
      await rfPRClick([1.5, 1]); await rfPRClick([2.5, 1.7]);
      assert(rfPRF().entities.length === 4, 'no construction lines: ' + rfQTSum());
      D.querySelector('#pm input[data-key="cons"]').click(); await wait(20); rfQTRadio('false'); await wait(20);
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 3. circles, arcs, ellipses
  step('rfQT 3 circles and arcs: Circle, Perimeter Circle, Centerpoint Arc, 3 Point Arc, Ellipse, Partial Ellipse by clicks (geometry, DOF, one undo step, Esc mid-tool), a circle on the origin is Coincident, For construction in the Circle PM, Tangent Arc off a line end', async function () {
    var log = [];
    try {
      log.push(await rfQTDraw('circle', 'Circle', [[1, 1], [1.5, 1]], function (f) { rfQTNear(f.entities[0].r, 0.5, 'r'); rfQTDof(3, 'circle'); assert(/Parameters\{r:0.5,dia:1\}/.test(rfQTPM()), 'Circle PM ' + rfQTPM()); }));
      log.push(await rfQTDraw('circle', 'Perimeter Circle', [[0, 0.5], [1, 0.5], [0.5, 1]], function (f) { var c = f.entities[0]; rfQTNear(c.cx, 0.5, 'cx'); rfQTNear(c.cy, 0.5, 'cy'); rfQTNear(c.r, 0.5, 'r'); rfQTDof(3, 'perimeter'); }));
      log.push(await rfQTDraw('arc', 'Centerpoint Arc', [[1, 1], [2, 1], [1, 2]], function (f) { var c = f.entities[0]; assert(c.t === 'arc' && c.a0 === 0 && c.a1 === 90 && c.r === 1, 'arc ' + JSON.stringify(c)); rfQTDof(5, 'arc'); }));
      log.push(await rfQTDraw('arc', '3 Point Arc', [[0, 1], [2, 1], [1, 1.6]], function (f) { var c = f.entities[0]; near(c.cx, 1, 1e-9, 'cx'); near(c.r, 17 / 15, 1e-9, 'r'); rfQTDof(5, '3 point arc'); }));
      log.push(await rfQTDraw('ellipse', 'Ellipse', [[1, 1], [2.5, 1], [1, 1.6]], function (f) { var c = f.entities[0]; assert(c.t === 'ellipse' && c.rx === 1.5 && Math.abs(c.ry - 0.6) < 1e-9, JSON.stringify(c)); rfQTDof(5, 'ellipse'); }));
      log.push(await rfQTDraw('ellipse', 'Partial Ellipse', [[1, 1], [2.5, 1], [2, 1.5], [0, 1.5]], function (f) { assert(f.entities[0].t === 'pellipse', 'partial ellipse'); rfQTDof(7, 'partial ellipse'); }));
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      rfQTFly('circle', 'Circle'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([0.5, 0]);
      rfQTRels(['coincident(0.c,O)'], true, 'circle on the origin'); rfQTDof(1, 'circle on the origin');
      D.querySelector('#pm input[data-key="construction"]').click(); await wait(20);
      await rfPRClick([2, 1]); await rfPRClick([2.2, 1]);
      assert(rfPRF().entities[1].construction, 'For construction in the Circle PM: ' + rfQTSum());
      await rfPREsc(2);
      UI.setTool('line'); await wait(20); await rfPRClick([-2, -1]); await rfPRClick([0, -1]); await rfPREsc(2);
      rfQTFly('arc', 'Tangent Arc'); await wait(30);
      await rfPRClick([0, -1]); await rfPRClick([1, 0]);
      var a = rfPRF().entities[3];
      assert(a.t === 'arc', 'tangent arc'); rfQTNear(a.cx, 0, 'tangent arc cx'); rfQTNear(a.cy, 0, 'tangent arc cy'); rfQTNear(a.r, 1, 'tangent arc r');
      rfQTRels(['tangent(3,2)', 'coincident(3.p1,2.p2)'], false, 'tangent arc');
      assert(UI.App.tool === 'tarc', 'Tangent Arc stays');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 4. slots
  step('rfQT 4 slots: Straight, Centerpoint Straight, 3 Point Arc, Centerpoint Arc slot by clicks, without and with Add dimensions (DOF down by two), Overall Length', async function () {
    var log = [];
    try {
      var kinds = [['Straight Slot', [[0.5, 1], [2.5, 1.02], [2, 1.3]], 4], ['Centerpoint Straight', [[1.5, 1], [2.5, 1.02], [2, 1.3]], 4], ['3 Point Arc Slot', [[0, 1], [2, 1], [1, 1.6], [1, 1.9]], 6], ['Centerpoint Arc Slot', [[1, 1], [2, 1], [1, 2], [1, 2.3]], 6]];
      for (var dimsOn = 0; dimsOn < 2; dimsOn++) for (var t = 0; t < kinds.length; t++) {
        await rfPRNew('Front', 8, 5, 0.3, 0.6);
        rfQTFly('slot', kinds[t][0]); await wait(30);
        var cb = D.querySelector('#pm input[data-key="slotDims"]');
        if (!!cb.checked !== !!dimsOn) { cb.click(); await wait(20); }
        var u0 = UI.App.undo.length;
        for (var k = 0; k < kinds[t][1].length; k++) await rfPRClick(kinds[t][1][k]);
        log.push(kinds[t][0] + (dimsOn ? ' +dims ' : ' ') + rfPRAn().dof);
        assert(UI.App.undo.length - u0 === 1, 'one undo step');
        rfQTDof(kinds[t][2] - 2 * dimsOn, kinds[t][0] + (dimsOn ? ' with Add dimensions' : ''));
        if (t < 2) { var w = rfPRF().entities; rfQTNear(w[0].y1 - w[2].y1, 0.6, 'slot width'); rfQTNear(w[4].x2 - w[4].x1, 2, 'centre to centre'); }
        rfQTCtrlZ(); await idle(); await wait(20);
        assert(rfPRF().entities.length === 0, 'Ctrl+Z took the slot back');
        await rfPRClick(kinds[t][1][0]); await rfPRClick(kinds[t][1][1]); rfPREv('mousemove', rfPRScr(kinds[t][1][2])); await wait(20); rfPRKey('Escape'); await wait(20);
        assert(rfPRF().entities.length === 0 && rfQTTemp() === 0, 'Esc mid-slot');
        UI.cancelSketch(); await idle();
      }
      // Overall Length: the length dimension is cap to cap
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      rfQTFly('slot', 'Straight Slot'); await wait(30);
      var ov = D.querySelector('#pm [title="Overall Length"], #pm [aria-label="Overall Length"]');
      assert(ov, 'Overall Length in the Slot PM'); ov.click(); await wait(20);
      await rfPRClick([0.5, 1]); await rfPRClick([2.5, 1.02]); await rfPRClick([2, 1.3]);
      var labels = rfPRLabels();
      assert(labels.indexOf('2.600') >= 0 && labels.indexOf('.600') >= 0, 'overall 2.600 and width .600: ' + labels.join('/'));
      D.querySelector('#pm [title="Center to Center"], #pm [aria-label="Center to Center"]').click(); await wait(20);
      D.querySelector('#pm input[data-key="slotDims"]').click(); await wait(20);
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 5. polygon, spline, point
  step('rfQT 5 polygon, spline, point: Polygon 6 inscribed then 8 circumscribed (sides typed before drawing), Spline through points ended by a double-click and kept by Esc, Point clicks', async function () {
    var log = [];
    try {
      await rfPRNew('Front', 8, 5, 0.4, 0.6);
      rfQTBtn(/^Polygon$/); await wait(30);
      var n = D.querySelector('#pm input[data-key="n"]'); setInput(n, '6'); pressEnter(n); await wait(20); rfQTRadio('ins'); await wait(20);
      await rfPRClick([1, 1]); await rfPRClick([2, 1]);
      var c = rfPRF().entities[6];
      assert(c.t === 'circle' && c.construction && c.r === 1, 'inscribed circle r 1: ' + rfQTSum());
      rfQTNear(rfPRF().entities[5].x1, 2, 'a side tangent at the click'); rfQTDof(4, 'polygon');
      rfQTCtrlZ(); await idle(); await wait(20);
      n = D.querySelector('#pm input[data-key="n"]'); setInput(n, '8'); pressEnter(n); await wait(20); rfQTRadio('circ'); await wait(20);
      await rfPRClick([1, 1]); await rfPRClick([2, 1]);
      assert(rfPRF().entities.length === 9, '8 sides and a circle: ' + rfQTSum()); rfQTNear(rfPRF().entities[0].x1, 2, 'a corner at the click'); rfQTDof(4, 'octagon');
      n = D.querySelector('#pm input[data-key="n"]'); setInput(n, '6'); pressEnter(n); await wait(20); rfQTRadio('ins'); await wait(20); await rfPREsc(2);
      UI.cancelSketch(); await idle();
      await rfPRNew('Front', 8, 5, 0.4, 0.6);
      rfQTFly('spline', 'Spline'); await wait(30);
      await rfPRClick([0, 0.5]); await rfPRClick([1, 1.5]); await rfPRClick([2, 0.8]); rfQTDbl([3, 1.5]); await wait(40);
      var s = rfPRF().entities[0];
      assert(s.t === 'spline' && s.pts.length === 4 && s.pts[3][0] === 3, 'spline through 4 points: ' + JSON.stringify(s)); rfQTDof(8, 'spline');
      await rfPRClick([0, -1]); await rfPRClick([1, -0.5]); rfPREv('mousemove', rfPRScr([2, -1])); await wait(20); rfPRKey('Escape'); await wait(30);
      assert(rfPRF().entities.length === 2 && rfPRF().entities[1].pts.length === 2 && UI.App.tool === 'select', 'Esc keeps the points placed: ' + rfQTSum());
      rfQTBtn(/^Point$/); await wait(30);
      await rfPRClick([4, 1]); await rfPRClick([4, 2]);
      assert(rfPRF().entities.length === 4 && UI.App.tool === 'point', 'two points, Point stays');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 6. Sketch Fillet, Sketch Chamfer
  step('rfQT 6 Sketch Fillet two corners of a dimensioned rectangle in one command (Equal, one R dimension, the width kept on the virtual sharp, the status after OK no longer asks for another vertex), Ctrl+Z one step; Sketch Chamfer equal distance, angle-distance, distance-distance with Esc', async function () {
    var log = [];
    try {
      await rfPRNew('Front', 8, 5, 0.3, 0.6);
      await rfQTRect([0, 0], [3, 2]);
      await rfPRDim([[1.5, 0]], [1.5, -0.5], '3');
      rfQTFly('skFillet', 'Sketch Fillet'); await wait(30);
      setInput(D.querySelector('#pm input[data-key="r"]'), '0.25'); await wait(20);
      await rfPRClick([3, 0]); await rfPRClick([3, 2]);
      rfPROK(); await idle(); await wait(30);
      log.push(rfQTSum() + ' | ' + statusText());
      rfQTRels(['equal(4,6)', 'tangent(0,4)', 'tangent(1,4)', 'tangent(1,6)', 'tangent(2,6)', 'distance(0.p1,5)=3.0000'], false, 'fillet'); rfQTDof(1, 'fillet');
      assert(rfPRF().dims.length === 1 && rfPRF().dims[0].k === 'r', 'one R dimension');
      assert(!/Pick another vertex/.test(statusText()) && /R\.250 in at 2 corners/.test(statusText()), 'status after OK: ' + statusText());
      rfQTCtrlZ(); await idle(); await wait(20);
      assert(rfPRF().entities.length === 4 && rfPRF().dims.length === 1, 'Ctrl+Z: the rectangle and its width');
      rfQTFly('skFillet', 'Sketch Chamfer'); await wait(30);
      rfQTRadio('distance'); await wait(20); var eq = D.querySelector('#pm input[data-key="equal"]'); if (!eq.checked) { eq.click(); await wait(20); }
      await rfPRClick([0, 2]); rfPROK(); await idle(); await wait(30);
      rfQTRels(['distance(5,2.p2)=0.3750', 'distance(5,3.p1)=0.3750'], false, 'equal distance'); rfQTDof(1, 'chamfer');
      rfQTCtrlZ(); await idle(); await wait(20);
      rfQTFly('skFillet', 'Sketch Chamfer'); await wait(30); rfQTRadio('angle'); await wait(20);
      await rfPRClick([0, 2]); rfPROK(); await idle(); await wait(30);
      rfQTRels(['distance(5,2.p2)=0.3750', 'angle(2,4)=45.0000'], false, 'angle-distance');
      rfQTCtrlZ(); await idle(); await wait(20);
      rfQTFly('skFillet', 'Sketch Chamfer'); await wait(30); rfQTRadio('distance'); await wait(20);
      D.querySelector('#pm input[data-key="equal"]').click(); await wait(20);
      assert(D.querySelector('#pm input[data-key="d2"]'), 'Distance 2 with Equal distance off');
      await rfPRClick([0, 2]); rfPRKey('Escape'); await wait(30);
      assert(rfPRF().entities.length === 4 && !UI.hasPM(), 'Esc: no chamfer left');
      rfQTFly('skFillet', 'Sketch Chamfer'); await wait(30); D.querySelector('#pm input[data-key="equal"]').click(); await wait(20); await rfPREsc(2);
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 7. Trim, Extend
  step('rfQT 7 Trim Entities (Power trim by dragging across, Corner, Trim away inside, Trim away outside, Trim to closest) and Extend Entities on a horizontal line crossed by two verticals', async function () {
    var log = [];
    var setup = async function () { await rfPRNew('Front', 8, 5, 0.3, 0.6); await rfQTLines([[[-0.5, 1], [4, 1]], [[2, -0.5], [2.02, 2.5]], [[3, -0.5], [3.02, 2.5]]]); };
    var mode = async function (m) { await setup(); rfQTFly('trim', 'Trim'); await wait(30); rfQTRadio(m); await wait(20); };
    var L0 = function () { return rfPRF().entities[0]; };
    try {
      await mode('power');
      await rfPRDrag([3.5, 1.3], [3.6, 0.6], 8);
      rfQTNear(L0().x2, 3, 'power trim'); rfQTRels(['coincident(0.p2,2)'], false, 'power trim');
      rfQTCtrlZ(); await idle(); await wait(20); rfQTNear(L0().x2, 4, 'Ctrl+Z');
      await rfPREsc(2); UI.cancelSketch(); await idle();
      await mode('closest'); await rfPRClick([0, 1]); rfQTNear(L0().x1, 2, 'trim to closest'); await rfPREsc(2); UI.cancelSketch(); await idle();
      await mode('corner'); await rfPRClick([1, 1]); await rfPRClick([2.01, 0.2]);
      rfQTNear(L0().x2, 2, 'corner: horizontal'); rfQTNear(rfPRF().entities[1].y2, 1, 'corner: vertical'); rfQTRels(['coincident(0.p2,1.p2)'], false, 'corner');
      await rfPREsc(2); UI.cancelSketch(); await idle();
      await mode('inside'); await rfPRClick([2.01, 2]); await rfPRClick([3.01, 2]); await rfPRClick([2.5, 1]);
      assert(rfPRF().entities.length === 4, 'inside: two pieces'); rfQTNear(L0().x2, 2, 'inside left'); rfQTNear(rfPRF().entities[1].x1, 3, 'inside right');
      await rfPREsc(2); UI.cancelSketch(); await idle();
      await mode('outside'); await rfPRClick([2.01, 2]); await rfPRClick([3.01, 2]); await rfPRClick([1, 1]);
      rfQTNear(L0().x1, 2, 'outside left'); rfQTNear(L0().x2, 3, 'outside right');
      rfQTRadio('power'); await wait(20); await rfPREsc(2); UI.cancelSketch(); await idle();
      await rfPRNew('Front', 8, 5, 0.3, 0.6); await rfQTLines([[[0, 1], [1, 1]], [[2, -0.5], [2.02, 2.5]]]);
      rfQTFly('trim', 'Extend'); await wait(30);
      await rfPRClick([0.8, 1]);
      rfQTNear(L0().x2, 2, 'extend'); rfQTRels(['coincident(0.p2,1)'], false, 'extend');
      rfQTCtrlZ(); await idle(); await wait(20); rfQTNear(L0().x2, 1, 'Ctrl+Z extend');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 8. modify tools
  step('rfQT 8 Mirror Entities / Linear and Circular Sketch Pattern open with nothing selected and take clicks, Offset Entities by a click, Move / Copy by base and to points, Rotate 90 about a corner, Scale 2, Stretch by a window, Dynamic Mirror, Convert Entities of a model edge', async function () {
    var log = [];
    var setup = async function () {
      await rfPRNew('Front', 8, 5, 0.4, 0.6); await rfQTRect([0.3, 0.3], [1.3, 1.3]);
      UI.cmdCenterline(); await wait(20); await rfPRClick([-0.5, -1]); await rfPRClick([-0.5, 2]); await rfPREsc(2);
      UI.setTool('circle'); await wait(20); await rfPRClick([2, 0.5]); await rfPRClick([2.25, 0.5]); await rfPREsc(2);
      UI.setTool('select'); await wait(20); UI.setSelection([]);
    };
    try {
      await setup();
      rfQTFly('mirrorEnt', 'Mirror Entities'); await wait(30);
      assert(/^Mirror Entities/.test(rfQTPM()), 'Mirror PM with nothing selected: ' + rfQTPM());
      await rfPRClick([0.8, 0.3]); await rfPRClick([0.8, 1.3]); await rfQTBox(1); await rfPRClick([-0.5, 1.5]); rfPROK(); await idle(); await wait(20);
      rfQTRels(['symmetric(0,6,4)', 'symmetric(2,7,4)'], false, 'mirror'); rfQTNear(rfPRF().entities[6].x1, -1.3, 'mirrored'); rfQTDof(10, 'mirror');
      UI.cancelSketch(); await idle(); await setup();
      rfQTFly('skPattern', 'Linear Sketch Pattern'); await wait(30);
      assert(/^Linear Pattern/.test(rfQTPM()), 'Linear Pattern PM: ' + rfQTPM());
      await rfPRClick([2.25, 0.5]); rfPROK(); await idle(); await wait(20);
      assert(rfPRF().entities.length === 8, 'three circles'); rfQTNear(rfPRF().entities[7].cx, 3.5, 'third at 0.75 spacing'); rfQTDof(10, 'pattern');
      rfQTCtrlZ(); await idle(); await wait(20); assert(rfPRF().entities.length === 6, 'Ctrl+Z pattern');
      rfQTFly('skPattern', 'Circular Sketch Pattern'); await wait(30);
      assert(/^Circular Pattern/.test(rfQTPM()), 'Circular Pattern PM: ' + rfQTPM()); await rfPREsc(2);
      rfQTBtn(/^Offset Entities/); await wait(30);
      await rfPRClick([0.8, 0.3]); assert(rfQTTemp() === 4, 'offset preview of the chain'); rfPROK(); await idle(); await wait(20);
      rfQTRels(['offset(0,1,2,3,6,7,8,9)', 'distance(0,6)=0.3750'], false, 'offset'); near(rfPRF().entities[6].y1, -0.075, 1e-9, 'offset outward');
      rfQTCtrlZ(); await idle(); await wait(20); assert(rfPRF().entities.length === 6, 'Ctrl+Z offset');
      UI.setSelection([]); rfQTFly('moveEnt', 'Move Entities'); await wait(30);
      await rfPRClick([2.25, 0.5]); await rfQTBox(1); await rfPRClick([2, 0.5]); await rfPRClick([3, 1]);
      rfQTNear(rfPRF().entities[5].cx, 3, 'moved'); assert(!UI.hasPM(), 'Move ends at the to point');
      rfQTCtrlZ(); await idle(); await wait(20); rfQTNear(rfPRF().entities[5].cx, 2, 'Ctrl+Z move');
      UI.setSelection([]); rfQTFly('moveEnt', 'Copy Entities'); await wait(30);
      await rfPRClick([2.25, 0.5]); await rfQTBox(1); await rfPRClick([2, 0.5]); await rfPRClick([2, 2]);
      assert(rfPRF().entities.length === 7, 'copied'); rfQTNear(rfPRF().entities[6].cy, 2, 'copy');
      rfQTCtrlZ(); await idle(); await wait(20);
      UI.setSelection([]); rfQTFly('moveEnt', 'Rotate Entities'); await wait(30);
      await rfPRClick([0.8, 0.3]); await rfQTBox(1); await rfPRClick([0.3, 0.3]);
      setInput(D.querySelector('#pm input[data-key="angle"]'), '90'); await wait(20); rfPROK(); await idle(); await wait(20);
      var l = rfPRF().entities[0]; near(l.x2, 0.3, 1e-9, 'rotated end x'); near(l.y2, 1.3, 1e-9, 'rotated end y');
      rfQTCtrlZ(); await idle(); await wait(20);
      UI.setSelection([]); rfQTFly('moveEnt', 'Scale Entities'); await wait(30);
      await rfPRClick([0.8, 0.3]); await rfPRClick([1.3, 0.8], { ctrlKey: true }); await rfPRClick([0.8, 1.3], { ctrlKey: true }); await rfPRClick([0.3, 0.8], { ctrlKey: true });
      await rfQTBox(1); await rfPRClick([0.3, 0.3]);
      var cp = D.querySelector('#pm input[data-key="copy"]'), cp0 = cp.checked; if (cp.checked) { cp.click(); await wait(20); }
      setInput(D.querySelector('#pm input[data-key="scale"]'), '2'); await wait(20); rfPROK(); await idle(); await wait(20);
      near(rfPRF().entities[1].x1, 2.3, 1e-9, 'scaled 2 about the corner'); rfQTDof(10, 'scale keeps the relations');
      rfQTCtrlZ(); await idle(); await wait(20);
      if (cp0) { UI.setSelection([]); rfQTFly('moveEnt', 'Scale Entities'); await wait(30); D.querySelector('#pm input[data-key="copy"]').click(); await wait(20); await rfPREsc(2); }
      UI.setSelection([]); rfQTFly('moveEnt', 'Stretch Entities'); await wait(30);
      await rfPRDrag([1.1, 1.5], [1.5, 0.1], 8); await rfQTBox(1); await rfPRClick([1.3, 0.3]); await rfPRClick([2.3, 0.3]);
      near(rfPRF().entities[1].x1, 2.3, 1e-9, 'the right side moved 1'); near(rfPRF().entities[3].x1, 0.3, 1e-9, 'the left side stays');
      rfQTCtrlZ(); await idle(); await wait(20); await rfPREsc(2);
      // Dynamic Mirror about the centerline
      UI.setTool('select'); await wait(20); UI.setSelection([]); await rfPRClick([-0.5, 1.5]);
      rfQTFly('mirrorEnt', 'Dynamic Mirror'); await wait(30);
      assert(UI.dynamicMirrorOn(), 'Dynamic Mirror on');
      UI.setTool('line'); await wait(20); await rfPRClick([-1, -0.5]); await rfPRClick([-2, -0.5]); await rfPREsc(2);
      rfQTRels(['symmetric(6,7,4)'], false, 'dynamic mirror');
      rfQTFly('mirrorEnt', 'Dynamic Mirror'); await wait(30); assert(!UI.dynamicMirrorOn(), 'Dynamic Mirror off');
      UI.cancelSketch(); await idle();
      // Convert Entities: a block's bottom edge into a sketch on its front face
      await rfPRNew('Front', 8, 5, 0.4, 0.6);
      await anvil.run('p.units("in"); p.sketch("Front").rect(0, 0, 2, 1).end().extrude(0.5);'); await idle();
      var fi = faceWithNormal([0, 0, 1]); UI.setSelection([{ kind: 'face', index: fi }]);
      UI.cmdSketch(); await idle(); await wait(30); rfPRFrame(6, 4, 0.2, 0.7); await wait(30); UI.setSelection([]);
      rfQTFly('convert', 'Convert'); await wait(30);
      await rfPRClick([1, 0]); rfPROK(); await idle(); await wait(20);
      rfQTRels(['onEdge(0)'], true, 'convert'); rfQTDof(0, 'converted edge'); rfQTNear(rfPRF().entities[0].x2, 2, 'converted edge length');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
  // ---------------------------------------------------------------- 9. Construction Geometry, relations, Fully Define, Quick Snaps, Repair
  step('rfQT 9 Construction Geometry on a selected side (one undo step), Fully Define Sketch (Calculate, OK; Ctrl+Z one step), Display/Delete Relations buttons, Point Snap with no tool starts Line and snaps to a corner, Repair Sketch joins two collinear lines', async function () {
    var log = [];
    try {
      await rfPRNew('Front', 8, 5, 0.4, 0.6);
      await rfQTRect([0, 0], [2, 1]);
      UI.setTool('select'); await wait(20); UI.setSelection([]); await rfPRClick([1, 1]);
      var u0 = UI.App.undo.length;
      rfQTBtn(/^Construction Geometry/); await idle(); await wait(20);
      assert(rfPRF().entities[2].construction && UI.App.undo.length - u0 === 1, 'the top side construction, one step');
      rfQTCtrlZ(); await idle(); await wait(20); assert(!rfPRF().entities[2].construction, 'Ctrl+Z');
      UI.setSelection([]);
      rfQTFly('relations', 'Fully Define'); await wait(30);
      clickPmButton('Calculate'); await idle(); await wait(30); rfPROK(); await idle(); await wait(30);
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfQTSum());
      rfQTCtrlZ(); await idle(); await wait(20); rfQTDof(2, 'Ctrl+Z Fully Define');
      rfQTFly('relations', 'Display/Delete'); await wait(30);
      var bs = Array.prototype.map.call(D.querySelectorAll('#pm button'), function (b) { return b.textContent.trim(); });
      assert(['Delete', 'Delete All'].every(function (x) { return bs.indexOf(x) >= 0; }), 'Display/Delete Relations buttons ' + bs.join('|'));
      await rfPREsc(2);
      rfQTFly('quickSnaps', 'Point Snap'); await wait(30);
      assert(UI.App.tool === 'line', 'a Quick Snap with no tool starts Line');
      await rfPRClick([2.08, 1.07]); await rfPRClick([3, 2]); await rfPREsc(2);
      rfQTRels(['coincident(4.p1,1.p2)'], false, 'Point Snap'); rfQTNear(rfPRF().entities[4].x1, 2, 'snapped x');
      UI.cancelSketch(); await idle();
      await rfPRNew('Front', 8, 5, 0.4, 0.6);
      await rfQTLines([[[0, 0], [1, 0]], [[1.0005, 0], [2, 0.0004]]]);
      rfQTBtn(/^Repair Sketch/); await idle(); await wait(30); if (UI.hasPM()) { rfPROK(); await idle(); await wait(20); }
      assert(rfPRF().entities.length === 1, 'repaired into one line: ' + rfQTSum()); rfQTNear(rfPRF().entities[0].x2, 2, 'one line 2 long');
      return rfPROut(log);
    } catch (e) { throw rfQLErr(e, log); } finally { await rfPREnd(); }
  });
