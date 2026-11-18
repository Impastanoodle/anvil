  // ---- rfPR (local-2026-11-17c, lane sketchflow6): sketching like a SolidWorks 2024 user on INCH parts, by real mouse /
  // key events (report test-reports/2026-11-18-sketch-flow-6.md). One step per flow and one per defect fixed.
  function rfPRScr3(p) { var s = UI.worldToScreen(p), r = $('viewport').getBoundingClientRect(); return [Math.round(r.left + s[0]), Math.round(r.top + s[1])]; }
  function rfPRScr(uv) { return rfPRScr3(K.to3D(UI.activePlane(), uv[0], uv[1])); }
  function rfPREv(type, c, mods) {
    (type === 'mousedown' ? $('viewport') : W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c[0], clientY: c[1] }, mods || {})));
  }
  async function rfPRClickAt(c, mods) { rfPREv('mousemove', [c[0] + 3, c[1] + 2], mods); await wait(15); rfPREv('mousemove', c, mods); await wait(15); rfPREv('mousedown', c, mods); rfPREv('mouseup', c, mods); await wait(25); }
  async function rfPRClick(uv, mods) { await rfPRClickAt(rfPRScr(uv), mods); }
  function rfPRKey(k, mods) { var ev = new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {})); D.dispatchEvent(ev); return ev; }
  async function rfPREsc(n) { for (var k = 0; k < (n || 1); k++) { rfPRKey('Escape'); await wait(20); } }
  async function rfPRDrag(a, b, n, mods) {
    var A = rfPRScr(a), B = rfPRScr(b);
    rfPREv('mousemove', A, mods); await wait(20); rfPREv('mousedown', A, mods); await wait(20);
    for (var k = 1; k <= (n || 8); k++) { rfPREv('mousemove', [A[0] + (B[0] - A[0]) * k / (n || 8), A[1] + (B[1] - A[1]) * k / (n || 8)], mods); await wait(20); }
    rfPREv('mouseup', B, mods); await idle(); await wait(40);
  }
  function rfPRF() { return UI.activeSketchFeature(); }
  function rfPRAn() { return W.SketchSolver.analyze(rfPRF()); }
  function rfPRState(f) { f = f || rfPRF(); return JSON.stringify([f.entities, f.rels || [], f.dims || []]); }
  function rfPRRels(f) { return ((f || rfPRF()).rels || []).map(function (r) { return r.type + '(' + r.refs.join(',') + ')' + (r.v != null ? '=' + (+r.v).toFixed(4) : ''); }); }
  function rfPRLabels() { if (UI.drawDims) UI.drawDims(true); return Array.prototype.map.call(D.querySelectorAll('#dim-layer text'), function (x) { return x.textContent; }); }
  function rfPREnts(f) { return (f || rfPRF()).entities.map(function (e, i) { return i + ':' + e.t + (e.construction ? '*' : ''); }).join(' '); }
  function rfPROut(log) { if (/[?&]dbg/.test(location.search)) throw new Error('DBG ' + log.join(' | ')); return log.join(' | '); }
  function rfPROK() { var b = D.querySelector('#pm .pm-ok'); assert(b, 'no OK button in ' + UI.pmTitle()); b.click(); }
  function rfPRLen(e) { return Math.hypot(e.x2 - e.x1, e.y2 - e.y1); }
  var rfPRGrid = null;
  // an inch part the way a user gets one: Tools > Default units > Inches, File > New (the smoke page starts parts in mm)
  async function rfPRPart() {
    var du = UI.defaultUnits();
    UI.setDefaultUnits('in');
    try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
    assert(UI.App.model.units === 'in' && UI.unitLabel() === 'in', 'an inch part: ' + UI.App.model.units);
  }
  // the view: w x h inches across the viewport, the origin at (ox, oy) of its size
  function rfPRFrame(w, h, ox, oy) {
    var a = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0)), b = UI.worldToScreen(K.to3D(UI.activePlane(), 1, 0));
    UI.zoomView(Math.hypot(b[0] - a[0], b[1] - a[1]) / Math.min(UI.size.w / (w || 10), UI.size.h / (h || 6.5)));
    var o = UI.worldToScreen(K.to3D(UI.activePlane(), 0, 0));
    UI.panView(UI.size.w * (ox == null ? 0.08 : ox) - o[0], UI.size.h * (oy == null ? 0.72 : oy) - o[1]);
    UI.updateSketches();
  }
  async function rfPRNew(plane, w, h, ox, oy, keepPart) {
    if (!keepPart) await rfPRPart();
    if (rfPRGrid == null) rfPRGrid = UI.App.view.showGrid;
    UI.App.view.showGrid = false; UI.App.gridStale = true;
    await UI.newSketchOnPlane(plane || 'Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    rfPRFrame(w, h, ox, oy); await wait(30);
    var f = UI.activeSketchFeature();
    f._u0 = UI.App.undo.length;
    return f;
  }
  async function rfPREnd() {
    if (rfPRGrid != null) { UI.App.view.showGrid = rfPRGrid; rfPRGrid = null; UI.App.gridStale = true; }
    if (UI.dynamicMirrorOn && UI.dynamicMirrorOn() && UI.cmdDynamicMirror) UI.cmdDynamicMirror();
    if (UI.App.mode === 'sketch') { UI.setTool('select'); if (UI.closePM) UI.closePM(); if (UI.cancelSketch) UI.cancelSketch(); await idle(); }
  }
  // Smart Dimension by clicks: the pieces, then the place; the Modify box takes value (null: Esc). keepOpen: the box is
  // left open (the caller types into it)
  async function rfPRDim(picks, place, value, keepOpen) {
    UI.setTool('dimension'); await wait(20);
    var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);   // quick clicks on line middles pick the line (lane NU)
    try {
      for (var k = 0; k < picks.length; k++) await rfPRClick(picks[k]);
      await rfPRClick(place); await wait(50);
    } finally { UI.dimMidDwell(dwell); }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open after dimensioning ' + JSON.stringify(picks) + ' (' + statusText() + ')');
    if (keepOpen) return inp;
    var shown = inp.value;
    if (value != null) { setInput(inp, value); pressEnter(inp); await wait(60); }
    if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
    return shown;
  }
  function rfPRLabelEl(re) { if (UI.drawDims) UI.drawDims(true); return Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return re.test(x.textContent); })[0]; }
  function rfPRLabelPress(t, button) {
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: button || 0, buttons: button === 2 ? 2 : 1, clientX: c[0], clientY: c[1] }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: button || 0, clientX: c[0], clientY: c[1] }));
  }
  async function rfPROpenDim(re) {
    UI.setTool('select'); await wait(20);
    var t = rfPRLabelEl(re);
    assert(t, 'no label ' + re + ' in ' + rfPRLabels().join('|'));
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    var evs = [0, 1].map(function () { return [new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: c[0], clientY: c[1] }), new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: c[0], clientY: c[1] })]; });
    for (var k = 0; k < 2; k++) {
      if (k) t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d === t._d; })[0] || t;
      t.dispatchEvent(evs[k][0]); W.dispatchEvent(evs[k][1]);
      await wait(40);
    }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open on ' + t.textContent + ' (' + statusText() + ' | ' + JSON.stringify(UI.App.sel) + ' | ' + UI.pmTitle() + ' | box ' + JSON.stringify(t.getBoundingClientRect()) + ')');
    return inp;
  }
  async function rfPREditDim(re, value) {
    var inp = await rfPROpenDim(re);
    setInput(inp, value); pressEnter(inp); await wait(60);
    if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
  }
  // every step back with Ctrl+Z to the sketch as it was at f._u0, forward with Ctrl+Y, then exit and edit again
  async function rfPRUndoAll() {
    var f = rfPRF(), id = f.id, u0 = f._u0, s1 = rfPRState(f), st1 = rfPRAn().status, n = 0;
    UI.setTool('select'); await wait(20);
    while (UI.App.undo.length > u0 && n < 160) { rfPRKey('z', { ctrlKey: true }); await idle(); await wait(10); n++; }
    var g = rfPRF();
    assert(g && g.id === id && UI.App.mode === 'sketch', 'still in the sketch after ' + n + ' undos');
    for (var k = 0; k < n; k++) { rfPRKey('y', { ctrlKey: true }); await idle(); await wait(10); }
    g = rfPRF();
    assert(rfPRState(g) === s1, 'redo all gives the same sketch back');
    UI.exitSketch(); await idle();
    UI.enterSketch(id); await idle(); await wait(30);
    g = rfPRF();
    assert(g && rfPRState(g) === s1 && rfPRAn().status === st1, 'exit and edit again: the same sketch, ' + st1 + ' (now ' + rfPRAn().status + ')');
    return n;
  }
  // exit the sketch, Boss-Extrude it d deep: the volume
  async function rfPRBuild(d) {
    var id = rfPRF().id;
    UI.exitSketch(); await idle();
    UI.App.sel = { kind: 'feature', id: id };
    UI.cmdExtrude(); await wait(40); setInput(pmNumber(0), String(d)); await wait(30);
    await UI.pmOK(); await idle();
    var s = anvil.summary();
    assert(!Object.keys(s.errors || {}).length, 'built without errors: ' + JSON.stringify(s.errors));
    return W.Kernel.massProps(UI.App.mesh, 1).volume;
  }

  // ---------------------------------------------------------------- flow 1: a flat blank from a customer print by typing
  // (defect 1: an equation naming a sketch dimension, =D1/2 or ="D1@Sketch1"/2, was refused "Unknown variable", and a
  // click on a dimension while "=" was typed closed the Modify box instead of putting the dimension's name in)
  step('rfPR flow 1: a blank from a print by typing: centerline, Dynamic Mirror while drawing the half profile, Smart Dimensions typed as fractions, the top width typed "=" + a click on the 6 1/2 width + "/4" (linked, Σ, follows the width at once), =D1*2 by name for the top\'s height, Fully Define, undo / redo, edit again, Boss-Extrude', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.5, 0.8);
      UI.cmdCenterline(); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([0, 4]); await rfPREsc(2);
      assert(rfPRRels().join(' ') === 'vertical(0) coincident(0.p1,O)', 'centerline up from the origin: ' + rfPRRels().join(' '));
      UI.setTool('select'); await rfPRClick([0, 2]);
      UI.cmdDynamicMirror(); await wait(30);
      assert(UI.dynamicMirrorOn(), 'Dynamic Mirror on about the selected centerline: ' + statusText());
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([3, 0]); await rfPRClick([3, 1]); await rfPRClick([2, 3]); await rfPRClick([0, 3]);
      await rfPREsc(2);
      assert(rfPREnts() === '0:line* 1:line 2:line 3:line 4:line 5:line 6:line 7:line 8:line', 'four lines and their mirror images: ' + rfPREnts());
      var sym = rfPRRels().filter(function (r) { return /^symmetric\(\d,\d,0\)$/.test(r); });
      assert(sym.length === 4 && rfPRRels().indexOf('coincident(7.p2,0)') >= 0, 'each mirrored Symmetric about the centerline, the top ends on it: ' + rfPRRels().join(' '));
      // the width between the two sides, the right side's height, both typed as fractions
      assert(await rfPRDim([[3, 0.5], [-3, 0.5]], [0, -0.8], '6 1/2') === '6', 'width shown 6');
      assert(await rfPRDim([[3.25, 0.5]], [4, 0.5], '1 1/4') === '1', 'height shown 1');
      near(f.entities[3].x1 - f.entities[4].x1, 6.5, 1e-9, 'width 6 1/2');
      near(rfPRLen(f.entities[3]), 1.25, 1e-9, 'height 1 1/4');
      // the top: "=", a click on the 6.500 label (its name goes in), "/4", Enter
      var inp = await rfPRDim([[1, 3]], [1, 3.6], null, true);
      setInput(inp, '='); inp.setSelectionRange(1, 1);
      rfPRLabelPress(rfPRLabelEl(/^6\.500$/)); await wait(40);
      assert(!$('dim-edit').hidden && D.activeElement === inp, 'the Modify box stays open with the focus after the click on 6.500');
      var nm = inp.value;
      assert(/^="D\d@Sketch1"$/.test(nm), 'the click put the dimension\'s name in: ' + nm);
      setInput(inp, nm + '/4'); pressEnter(inp); await wait(60);
      if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
      near(rfPRLen(f.entities[7]), 1.625, 1e-9, 'the top (each half) is a quarter of the width');
      var L = rfPRLabels();
      assert(L.indexOf('Σ1.625') >= 0, 'the linked dimension shows Σ: ' + L.join('|'));
      var top = f.dims.filter(function (d) { return d.e === 7; })[0];
      assert(top && '=' + top.expr === nm + '/4', 'kept (without its =, which the kernel would evaluate) as ' + (top && top.expr));
      var wrel = f.rels.filter(function (r) { return r.type === 'distance'; })[0];
      assert(wrel && wrel.name && nm.indexOf('"' + wrel.name + '@') >= 0, 'the width keeps its name stored: ' + JSON.stringify(wrel));
      // the width changes: the top follows in the same step
      var u1 = UI.App.undo.length;
      await rfPREditDim(/^6\.500$/, '8');
      near(rfPRLen(f.entities[7]), 2, 1e-9, 'the top follows the width at once');
      assert(UI.App.undo.length === u1 + 1, 'one undo step for both');
      // by name, without quotes or @: D1 is the first Smart Dimension (the height 1.250); the top's height = D1 * 2
      var y7 = f.entities[7].y1;
      await rfPRDim([[-1, 3], [-1.5, 0]], [-5, 1.5], '=D1*2');
      near(f.entities[7].y1, 2.5, 1e-9, 'the top at twice the side height (was ' + y7 + ')');
      assert(/="D1@Sketch1"\*2/.test(statusText()), 'status names the equation: ' + statusText());
      await rfPREditDim(/^1\.250$/, '1');
      near(f.entities[7].y1, 2, 1e-9, 'the top follows D1');
      UI.setTool('select'); await wait(20);
      UI.cmdFullyDefineSketch(); await wait(60);
      rfPROK(); await idle(); await wait(30);
      assert(rfPRAn().status === 'full', 'Fully Define: ' + rfPRAn().status + ' dof ' + rfPRAn().dof);
      await rfPREditDim(/^8\.000$/, '7 1/2');
      near(rfPRLen(f.entities[7]), 1.875, 1e-9, 'the top follows 7 1/2');
      assert(rfPRAn().status === 'full', 'still fully defined');
      log.push('labels ' + rfPRLabels().join(','));
      log.push(await rfPRUndoAll() + ' undos / redos');
      var v = await rfPRBuild(0.125);
      // the outline: a 7.5 x 1.25 base under a trapezoid up to the 3.75 top at its height
      log.push('volume ' + v.toFixed(5));
      near(v, 2 * (3.75 * 1 + (3.75 + 1.875) / 2 * 1) * 0.125, 1e-9, 'Boss-Extrude .125 of the 7 1/2 blank');
      var sc = anvil.script();
      assert(/"expr":"\\"D\d@Sketch1\\"\/4"/.test(sc), 'the equation is in the script: ' + sc.split('\n').filter(function (l) { return /expr/.test(l); }).join(' / '));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // typing into a PropertyManager number box key by key, as a hand does: a "/" or a space turns it into the shop-input
  // text box (ui-commands.js), the digits go in as typed
  async function rfPRTypePM(inp, text) {
    inp.focus(); setInput(inp, '');
    for (var k = 0; k < text.length; k++) {
      var c = text.charAt(k);
      if (inp.type === 'number' && !/[0-9.]/.test(c)) inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: c, bubbles: true, cancelable: true }));
      else setInput(inp, inp.value + c);
      await wait(5);
    }
  }
  // each fillet arc of the sketch: |distance from its centre to each line ending on it - r| (tangency), its radius
  function rfPRTangency(f) {
    var worst = 0, radii = [];
    f.entities.forEach(function (e) {
      if (e.t !== 'arc') return;
      radii.push(e.r);
      var ends = [e.a0, e.a1].map(function (a) { return [e.cx + e.r * Math.cos(a * Math.PI / 180), e.cy + e.r * Math.sin(a * Math.PI / 180)]; }), n = 0;
      f.entities.forEach(function (l) {
        if (l.t !== 'line' || l.construction) return;
        [[l.x1, l.y1], [l.x2, l.y2]].forEach(function (p) {
          ends.forEach(function (q) {
            if (Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-7) return;
            var dx = l.x2 - l.x1, dy = l.y2 - l.y1;
            worst = Math.max(worst, Math.abs(Math.abs((e.cx - l.x1) * dy - (e.cy - l.y1) * dx) / Math.hypot(dx, dy) - e.r)); n++;
          });
        });
      });
      assert(n === 2, 'each fillet arc joins two lines: ' + n);
    });
    return { worst: worst, radii: radii };
  }

  // ---------------------------------------------------------------- flow 2: Sketch Fillet and Chamfer, then drags
  step('rfPR flow 2: a closed five-side profile (no dimensions), Sketch Fillet typed 1/2 on two corners, Sketch Chamfer typed 3/8 on the apex, then drag a free corner, a fillet arc and the chamfer line: tangency, Equal radii and the chamfer distances hold through each drag; R .500 -> 3/4 by double-click moves both fillets; undo / redo, edit again, Boss-Extrude to the closed form', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.15, 0.85);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([6, 0]); await rfPRClick([6, 3]); await rfPRClick([3, 4.5]); await rfPRClick([0, 3]); await rfPRClick([0, 0]);
      await rfPREsc(2);
      assert(rfPREnts() === '0:line 1:line 2:line 3:line 4:line', 'five lines: ' + rfPREnts());
      UI.cmdSketchFillet(); await wait(40);
      await rfPRTypePM(pmField('Radius'), '1/2'); pressEnter(pmField('Radius')); await wait(30);
      await rfPRClick([6, 0]); await wait(30); await rfPRClick([0, 0]); await wait(30);
      await UI.pmOK(); await idle();
      UI.cmdSketchChamfer(); await wait(40);
      await rfPRTypePM(pmField('Distance 1'), '3/8'); pressEnter(pmField('Distance 1')); await wait(30);
      await rfPRClick([3, 4.5]); await wait(30);
      await UI.pmOK(); await idle();
      assert(rfPREnts() === '0:line 1:line 2:line 3:line 4:line 5:arc 6:arc 7:point* 8:line 9:point*', 'two fillet arcs, a chamfer line, their virtual sharps: ' + rfPREnts());
      assert(rfPRRels().indexOf('equal(5,6)') >= 0, 'the second fillet Equal to the first: ' + rfPRRels().join(' '));
      var L = rfPRLabels();
      assert(L.indexOf('R.500') >= 0 && L.filter(function (x) { return x === '.375'; }).length === 2, 'R.500 and the chamfer\'s two .375: ' + L.join(','));
      function holds(tag) {
        var t = rfPRTangency(f), p9 = f.entities[9], l2 = f.entities[2], l3 = f.entities[3];
        assert(t.worst < 1e-9, tag + ': tangent to 1e-9 (' + t.worst + ')');
        assert(Math.abs(t.radii[0] - t.radii[1]) < 1e-12, tag + ': Equal radii ' + t.radii);
        near(Math.hypot(p9.x - l2.x2, p9.y - l2.y2), 0.375, 1e-9, tag + ': chamfer distance 1');
        near(Math.hypot(p9.x - l3.x1, p9.y - l3.y1), 0.375, 1e-9, tag + ': chamfer distance 2');
        assert(rfPRAn().status === 'under', tag + ': still under defined, nothing over: ' + rfPRAn().status);
        return t.radii[0];
      }
      holds('drawn');
      await rfPRDrag([6, 3], [7, 3.6]);
      assert(/^Dragged Line/.test(statusText()), 'corner dragged: ' + statusText());
      near(f.entities[1].x2, 7, 0.05, 'the corner went with the mouse');
      holds('corner dragged');
      var a5 = f.entities[5], am = [a5.cx + a5.r * Math.SQRT1_2, a5.cy - a5.r * Math.SQRT1_2];
      await rfPRDrag(am, [am[0] + 0.6, am[1] - 0.3]);
      assert(/^Dragged Arc/.test(statusText()), 'fillet arc dragged: ' + statusText());
      holds('fillet arc dragged');
      await rfPREditDim(/^R\.500$/, '3/4');
      assert(holds('R 3/4') === 0.75, 'both fillets R.750');
      var c8 = f.entities[8], cm = [(c8.x1 + c8.x2) / 2, (c8.y1 + c8.y2) / 2], y0 = cm[1];
      await rfPRDrag(cm, [cm[0] - 0.4, cm[1] + 0.5]);
      assert(/^Dragged Line/.test(statusText()) && (f.entities[8].y1 + f.entities[8].y2) / 2 > y0 + 0.1, 'chamfer line dragged: ' + statusText());
      holds('chamfer line dragged');
      log.push(rfPRLabels().join(','));
      log.push(await rfPRUndoAll() + ' undos / redos');
      // the outline's area: the polygon through the line ends (arcs as chords) plus the two quarter-circle segments
      var g = rfPRF(), E = g.entities, P = [[E[0].x1, E[0].y1], [E[0].x2, E[0].y2], [E[1].x1, E[1].y1], [E[1].x2, E[1].y2], [E[8].x1, E[8].y1], [E[8].x2, E[8].y2], [E[3].x2, E[3].y2], [E[4].x2, E[4].y2]], A = 0;
      for (var k = 0; k < P.length; k++) { var p = P[k], q = P[(k + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; }
      A = Math.abs(A) / 2 + 2 * 0.75 * 0.75 / 2 * (Math.PI / 2 - 1);
      var v = await rfPRBuild(0.25);
      near(v, A * 0.25, 1e-9, 'Boss-Extrude .25 of the profile');
      log.push('volume ' + v.toFixed(5));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- flow 3: Convert / Offset from a flange face, Trim,
  // Extend, then the flange made longer (defect 2: trimming one copy of an Offset Entities chain dropped the chain's whole
  // Offset relation, so the corners nobody trimmed came apart, a drag tilted the rest and nothing followed the model)
  function rfPRUv(p) {
    var pl = UI.activePlane(), o = K.to3D(pl, 0, 0), ex = K.to3D(pl, 1, 0), ey = K.to3D(pl, 0, 1), d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
    return [d[0] * (ex[0] - o[0]) + d[1] * (ex[1] - o[1]) + d[2] * (ex[2] - o[2]), d[0] * (ey[0] - o[0]) + d[1] * (ey[1] - o[1]) + d[2] * (ey[2] - o[2])];
  }
  function rfPR3D(f) { var pl = UI.activePlane(); return f.entities.map(function (e) { var a = K.to3D(pl, e.x1, e.y1), b = K.to3D(pl, e.x2, e.y2); return [a[0], a[1], b[0], b[1]]; }); }
  step('rfPR flow 3: a 16 ga tray wall: sketch on the Edge Flange\'s face, the face clicked, Offset Entities typed 1/2 inward (converted edges + offset chain), a line across the middle, Power trim of the left half (a U), a short line Extended to the right side; drag the middle line (up and right: only right can be followed): the U stays square on its offsets, nothing flies off; Edge Flange 2 -> 3: the U and the extended line follow; undo / redo, edit again', async function () {
    var log = [];
    try {
      await rfPRPart();
      await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange(0.06);\np.flange(2, [[3, 0.06, 0]]);'); await idle();
      var fi = -1;
      UI.App.mesh.faces.forEach(function (x, i) { if (x.normal[2] < -0.999 && x.area > 5) fi = i; });
      assert(fi >= 0, 'the flange\'s outer face');
      UI.setView('Front', false); if (UI.finishViewAnimation) UI.finishViewAnimation();
      UI.App.sel = { kind: 'face', index: fi };
      UI.cmdSketch(); await idle(); await wait(40);
      UI.zoomToFit(); await wait(40);
      if (rfPRGrid == null) rfPRGrid = UI.App.view.showGrid;
      UI.App.view.showGrid = false; UI.App.gridStale = true;
      var f = rfPRF(), id = f.id;
      f._u0 = UI.App.undo.length;
      await rfPRClickAt(rfPRScr3([3, 1, 0])); await wait(20);
      assert(UI.selection()[0] && UI.selection()[0].kind === 'face', 'the wall face selected');
      UI.cmdOffsetEntities(); await wait(40);
      await rfPRTypePM(pmField('Offset distance'), '1/2'); await wait(30);
      var pl = UI.activePlane(), inside = function () { var t = UI.App.tempEntities || []; return t.length && t.filter(function (e) { return !e.construction; }).every(function (e) { var q = K.to3D(pl, e.x1, e.y1); return q[0] > 0.1 && q[0] < 5.9; }); };
      if (!inside()) { pmField('Reverse').click(); await wait(30); }
      await UI.pmOK(); await idle();
      assert(rfPREnts() === '0:line* 1:line* 2:line* 3:line* 4:line 5:line 6:line 7:line', 'four converted edges (construction) and four offset lines: ' + rfPREnts());
      var y0 = 0.62, y1 = 1.62;
      UI.setTool('line'); await wait(30);
      await rfPRClick(rfPRUv([3, y0, 0])); await rfPRClick(rfPRUv([3, y1, 0])); await rfPREsc(2);
      UI.cmdTrimEntities(); await wait(40);
      var pw = D.querySelector('#pm input[value=power]');   // (the PM remembers the last mode: Power trim, as a user picks it)
      if (pw && !pw.checked) { pw.click(); await wait(20); }
      await rfPRDrag(rfPRUv([0.3, 1.12, 0]), rfPRUv([0.8, 1.22, 0]), 6);
      await rfPRDrag(rfPRUv([1.5, y1 + 0.1, 0]), rfPRUv([1.6, y1 - 0.1, 0]), 6);
      await rfPRDrag(rfPRUv([1.5, y0 + 0.1, 0]), rfPRUv([1.6, y0 - 0.1, 0]), 6);
      rfPROK(); await idle();
      assert(rfPREnts() === '0:line* 1:line* 2:line* 3:line* 4:line 5:line 6:line 7:line', 'the U: right side, two half lines, the middle line: ' + rfPREnts());
      var ch = (f.rels || []).filter(function (r) { return r.type === 'offset'; })[0];
      assert(ch && ch.chain && ch.refs.join() === '0,1,2,3,4,5,6' && JSON.stringify(ch.chain.slot) === '[0,1,3]', 'the Offset relation holds the right side and the two pieces: ' + JSON.stringify(ch));
      assert(rfPRRels().indexOf('coincident(5.p2,4.p2)') >= 0 && rfPRRels().indexOf('coincident(6.p2,4.p1)') >= 0, 'the two corners nobody trimmed stay joined: ' + rfPRRels().join(' '));
      assert(rfPRAn().redundant === 0 && rfPRAn().conflicts === 0, 'nothing over defined');
      // Extend: a short level line from the middle line towards the right side, then Extend Entities on its free end
      UI.setTool('line'); await wait(30);
      await rfPRClick(rfPRUv([3, 1.12, 0])); await rfPRClick(rfPRUv([4.5, 1.12, 0])); await rfPREsc(2);
      UI.cmdExtendEntities(); await wait(40);
      await rfPRClick(rfPRUv([4.4, 1.12, 0])); await wait(30);
      UI.setTool('select'); if (UI.hasPM()) rfPROK(); await idle();
      var g3 = rfPR3D(f), ext = g3[8];
      near(Math.max(ext[0], ext[2]), 5.5, 1e-6, 'the short line reaches the right side: ' + JSON.stringify(ext));
      // drag the middle line: the U keeps its offsets (pieces level, corners joined)
      var m = f.entities[7], mm = K.to3D(pl, (m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2);
      await rfPRDrag(rfPRUv(mm), rfPRUv([mm[0] + 0.7, mm[1] + 0.3, 0]));
      g3 = rfPR3D(f);
      [5, 6].forEach(function (k) { near(g3[k][1], g3[k][3], 1e-6, 'piece ' + k + ' stays level'); });
      near(g3[5][1], 1.62, 1e-6, 'the top piece stays .5 below the top edge'); near(g3[6][1], 0.62, 1e-6, 'the bottom piece .5 above the bottom edge');
      near(Math.max(g3[5][0], g3[5][2]), 5.5, 1e-6, 'top piece still meets the right side');
      near(g3[7][0], 3.7, 0.02, 'the middle line went .7 right with the mouse (the up part of the move is refused: its ends ride the offsets; before the least-squares floor it flew 1,500 in off)'); near(g3[7][0], g3[7][2], 5e-3, 'and stays about square (its Midpoints went with the trim, nothing holds it upright: it is free to lean, and barely does)');
      log.push('middle at x ' + g3[7][0].toFixed(3));
      log.push(await rfPRUndoAll() + ' undos / redos');
      UI.exitSketch(); await idle();
      var ef = UI.App.model.features.filter(function (x) { return x.type === 'flange'; })[0];
      ef.length = 3; await UI.rebuild(); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'rebuilt: ' + JSON.stringify(anvil.summary().errors));
      UI.enterSketch(id); await idle(); await wait(30);
      g3 = rfPR3D(rfPRF());
      near(g3[1][1], 3.12, 1e-6, 'the converted top edge follows the flange');
      near(g3[4][3], 2.62, 1e-6, 'the right side follows'); near(g3[5][1], 2.62, 1e-6, 'the top piece follows'); near(g3[7][3], 2.62, 1e-6, 'the middle line follows');
      near(g3[6][1], 0.62, 1e-6, 'the bottom stays .5 above the bend');
      assert(rfPRAn().conflicts === 0 && rfPRAn().redundant === 0, 'solved clean: ' + rfPRAn().status);
      log.push('U top at ' + g3[5][1].toFixed(4));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- flow 4: dual dimensions on while dimensioning
  function rfPRDimLayer() {
    UI.drawDims(true);
    return Array.prototype.map.call(D.querySelectorAll('#dim-layer g.dim'), function (g) {
      var t = g.querySelector('text'), bb = t && t.textContent ? t.getBBox() : null, yb = t ? +t.getAttribute('y') : 0;
      return { label: t ? t.textContent : '', box: bb ? [bb.x - 1, yb - UI.DIM_CAP - 1, bb.x + bb.width + 1, yb + 1] : null, temp: /\btemp\b/.test(g.getAttribute('class')) };
    }).filter(function (x) { return !x.temp && x.label; });
  }
  function rfPRMeet(a, b) { return !!a && !!b && a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]; }
  // every label against every other label, and against the sketch's lines on screen
  function rfPRCrowd(f) {
    var L = rfPRDimLayer(), bad = [], pl = UI.activePlane();
    L.forEach(function (a, i) { L.forEach(function (b, j) { if (j > i && rfPRMeet(a.box, b.box)) bad.push(a.label + ' on ' + b.label); }); });
    var segs = f.entities.filter(function (e) { return e.t === 'line' && !e.construction; }).map(function (e) { return [UI.worldToScreen(K.to3D(pl, e.x1, e.y1)), UI.worldToScreen(K.to3D(pl, e.x2, e.y2))]; });
    L.forEach(function (a) {
      if (/°/.test(a.label)) return;   // (an angle's text stays where it was put on its arc, as SolidWorks: zoomed out it may sit on its own line)
      segs.forEach(function (s, k) { for (var u = 0; u <= 60; u++) { var p = [s[0][0] + (s[1][0] - s[0][0]) * u / 60, s[0][1] + (s[1][1] - s[0][1]) * u / 60]; if (p[0] > a.box[0] + 1 && p[0] < a.box[2] - 1 && p[1] > a.box[1] + 1 && p[1] < a.box[3] - 1) { bad.push(a.label + ' on line ' + k + ' box ' + a.box.map(Math.round) + ' seg ' + s.map(function (q) { return q.map(Math.round); })); break; } } });
    });
    return { n: L.length, bad: bad };
  }
  step('rfPR flow 4: dual dimensions ticked in Document Properties, then a plate dimensioned by typing: width typed 150mm reads 5.906 [150.00], height 3.000 [76.20], a hole Ø17/64 -> Ø.266 [6.75] located 1 1/2 [38.10] both ways; the Modify box and the status show the primary only; 6 typed: 6.000 [152.40]; a Sketch Fillet typed 6mm reads R.236 [6.00]; an angle stays single; no label on another or on a line at the fitted zoom, 3x and 6x out, 3x in; unticked: brackets gone; undo / redo', async function () {
    var log = [];
    try {
      await rfPRPart();
      UI.openTaskPane('props'); await idle();
      var on = D.querySelector('[data-role="dual-on"]');
      assert(on && !on.checked, 'Dual dimensions display, off');
      on.click(); await idle();
      assert(UI.App.model.dualDimensions && UI.App.model.dualDimensions.on, 'ticked: ' + JSON.stringify(UI.App.model.dualDimensions));
      var f = await rfPRNew('Front', 10, 6.5, 0.1, 0.8, true);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([5, 3]); await rfPREsc(2);
      assert(await rfPRDim([[2.5, 0]], [2.5, -0.8], '150mm') === '5', 'width shown 5 before');
      var W0 = 150 / 25.4;
      assert(/^Dimension set to 5\.906 in\.$/.test(statusText()), 'status primary only: ' + statusText());
      await rfPRDim([[W0, 1.5]], [W0 + 0.9, 1.5], '3');
      UI.setTool('circle'); await wait(30);
      await rfPRClick([1.5, 1.5]); await rfPRClick([1.8, 1.5]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfPRKey('Escape'); await wait(20); }
      await rfPREsc(2);
      await rfPRDim([[1.5 + 0.3 * 0.7071, 1.5 + 0.3 * 0.7071]], [2.6, 2.4], '17/64');
      await rfPRDim([[0, 2], [1.5, 1.5]], [0.75, 3.6], '1 1/2');
      await rfPRDim([[2.5, 0], [1.5, 1.5]], [-0.8, 0.75], '1 1/2');
      var L = rfPRLabels();
      ['5.906 [150.00]', '3.000 [76.20]', 'Ø.266 [6.75]'].forEach(function (w) { assert(L.indexOf(w) >= 0, w + ' among ' + L.join('|')); });
      assert(L.filter(function (x) { return x === '1.500 [38.10]'; }).length === 2, 'the hole located 1.500 [38.10] both ways: ' + L.join('|'));
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfPRAn().status);
      var inp = await rfPROpenDim(/^5\.906/);
      assert(inp.value === '5.9055', 'the Modify box shows the primary value only: ' + inp.value);
      setInput(inp, '6'); pressEnter(inp); await wait(60);
      if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
      assert(rfPRLabels().indexOf('6.000 [152.40]') >= 0, '6.000 [152.40]: ' + rfPRLabels().join('|'));
      UI.cmdSketchFillet(); await wait(40);
      await rfPRTypePM(pmField('Radius'), '6mm'); pressEnter(pmField('Radius')); await wait(30);
      await rfPRClick([6, 3]); await wait(30);
      await UI.pmOK(); await idle();
      L = rfPRLabels();
      assert(L.indexOf('R.236 [6.00]') >= 0, 'R.236 [6.00]: ' + L.join('|'));
      // an angle: a line from the fillet-free corner at the origin, dimensioned against the bottom: no dual
      UI.setTool('line'); await wait(30);
      await rfPRClick([3, 0]); await rfPRClick([4, 1.2]); await rfPREsc(2);
      await rfPRDim([[3.5, 0.6], [4.5, 0]], [4.4, 0.35], '30');
      L = rfPRLabels();
      assert(L.some(function (x) { return /^30(\.0+)?°$/.test(x); }), 'the angle reads 30° alone: ' + L.join('|'));
      var res = [], zs = [[1, 'fit'], [3, '3x out'], [2, '6x out'], [1 / 18, '3x in']];
      for (var z = 0; z < zs.length; z++) {
        UI.zoomView(zs[z][0]); await idle(); UI.updateSketches(); await wait(200);
        var c = rfPRCrowd(f);
        assert(c.n >= 7, zs[z][1] + ': labels drawn ' + c.n);
        assert(!c.bad.length, zs[z][1] + ': ' + c.bad.join(', '));
        res.push(zs[z][1] + ' clear');
      }
      log.push(res.join(', '));
      log.push(rfPRLabels().join(','));
      log.push(await rfPRUndoAll() + ' undos / redos');
      UI.openTaskPane('props'); await idle();
      on = D.querySelector('[data-role="dual-on"]');
      on.click(); await idle(); UI.updateSketches(); await idle();
      assert(!rfPRLabels().some(function (x) { return /\[/.test(x); }) && rfPRLabels().indexOf('6.000') >= 0, 'unticked: ' + rfPRLabels().join('|'));
    } finally { if (UI.App.model.dualDimensions) anvil.dualDimensions({ on: false }); await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- flow 5: a perforated panel with a blank zone
  // (defect 3: typing a new Number of instances into Edit Linear Pattern passed through its first digit (10 -> 11 goes
  // through 1), and that cut the Instances to Skip list down for good: the skipped holes came back)
  async function rfPRMenuAt(uv) {
    var c = rfPRScr(uv);
    rfPREv('mousemove', c); await wait(20);
    $('viewport').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 2, buttons: 2, clientX: c[0], clientY: c[1] }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 2, clientX: c[0], clientY: c[1] }));
    $('viewport').dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: c[0], clientY: c[1] }));
    await wait(40);
    return Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
  }
  async function rfPREditRel(ri, value) {
    UI.setTool('select'); await wait(20);
    UI.drawDims(true);
    var t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d.rel === ri; })[0];
    assert(t, 'the label of relation ' + ri);
    var b = t.getBoundingClientRect(), c = [Math.round(b.left + b.width / 2), Math.round(b.top + b.height / 2)];
    for (var k = 0; k < 2; k++) {
      if (k) t = Array.prototype.filter.call(D.querySelectorAll('#dim-layer text'), function (x) { return x._d && x._d.rel === ri; })[0] || t;
      t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: c[0], clientY: c[1] }));
      W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0, clientX: c[0], clientY: c[1] }));
      await wait(40);
    }
    var inp = D.querySelector('#dim-edit input');
    assert(inp && !$('dim-edit').hidden, 'Modify box open on relation ' + ri);
    setInput(inp, value); pressEnter(inp); await wait(60);
    if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
  }
  function rfPRHoles(f) { return (f || rfPRF()).entities.filter(function (e) { return e.t === 'circle'; }); }
  step('rfPR flow 5: a 12 x 6 perforated panel: a 1/2 hole located 1 x 1, Linear Sketch Pattern typed 10 x 1 by 4 x 1 with both spacings dimensioned, four holes in the middle clicked into Instances to Skip (36 holes); right-click a hole > Edit Linear Pattern, Number of instances typed 11 key by key: the four stay skipped (40 holes); the X spacing label 1 -> 7/8; a hole selected and deleted joins the skipped; undo / redo, edit again, Boss-Extrude .06 to the closed form', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 14, 8, 0.05, 0.85);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([12, 6]); await rfPREsc(2);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([1, 1]); await rfPRClick([1.25, 1]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfPRKey('Escape'); await wait(20); }
      await rfPREsc(2);
      await rfPRDim([[1.25, 1]], [1.7, 1.7], '1/2');
      await rfPRDim([[0, 3], [1, 1]], [0.5, -0.6], '1');
      await rfPRDim([[6, 0], [1, 1]], [-0.6, 0.5], '1');
      UI.setTool('select'); await rfPRClick([1.25, 1]);
      UI.cmdSketchPattern(); await wait(40);
      assert(UI.pmTitle() === 'Linear Pattern', 'PM ' + UI.pmTitle());
      function fk(k) { return D.querySelector('#pm input[data-key="' + k + '"]'); }
      await rfPRTypePM(fk('spacing'), '1'); pressEnter(fk('spacing')); await wait(20);
      await rfPRTypePM(fk('count'), '10'); pressEnter(fk('count')); await wait(20);
      await rfPRTypePM(fk('spacing2'), '1'); pressEnter(fk('spacing2')); await wait(20);
      await rfPRTypePM(fk('count2'), '4'); pressEnter(fk('count2')); await wait(20);
      var dy = D.querySelector('#pm input[type=checkbox][data-key="dimY"]'); if (dy && !dy.checked) dy.click(); await wait(20);
      D.querySelectorAll('#pm .pm-pick')[3].click(); await wait(30);
      assert(UI.pmSpec().values.box === 'skip', 'the Instances to Skip box is active');
      await rfPRClick([5, 2]); await rfPRClick([6, 2]); await rfPRClick([5, 3]); await rfPRClick([6, 3]);
      assert(UI.pmSpec().values.skip.length === 4, 'four skipped: ' + JSON.stringify(UI.pmSpec().values.skip));
      rfPROK(); await idle(); await wait(50);
      assert(rfPRHoles(f).length === 36, '36 holes: ' + rfPRHoles(f).length);
      // Edit Linear Pattern from a hole's right-click menu; 11 typed key by key
      UI.setTool('select'); await wait(20);
      var rows = await rfPRMenuAt([3.25, 2]);
      var ed = rows.filter(function (r) { return /Edit Linear Pattern/.test(r.textContent); })[0];
      assert(ed, 'Edit Linear Pattern in the menu: ' + rows.map(function (r) { return r.textContent; }).join(' / '));
      ed.click(); await wait(60);
      assert(UI.pmTitle() === 'Edit Linear Pattern' && UI.pmSpec().values.skip.length === 4, 'the edit PM with the four skipped: ' + JSON.stringify(UI.pmSpec().values.skip));
      await rfPRTypePM(fk('count'), '11');
      assert(UI.pmSpec().values.count === 11 && UI.pmSpec().values.skip.length === 4, 'typed 11, still four skipped: ' + JSON.stringify(UI.pmSpec().values.skip));
      pressEnter(fk('count')); await wait(20);
      rfPROK(); await idle(); await wait(50);
      var H = rfPRHoles(f), at = H.map(function (e) { return Math.round(e.cx * 8) / 8 + ',' + Math.round(e.cy * 8) / 8; });
      assert(H.length === 40, '11 x 4 less the four: ' + H.length);
      ['5,2', '6,2', '5,3', '6,3'].forEach(function (k) { assert(at.indexOf(k) < 0, 'still skipped at ' + k); });
      // the X spacing 1 -> 7/8 from its label
      var ri = f.rels.map(function (r, i) { return r.type === 'distance' && r.dir === 'h' && Math.abs(r.v - 1) < 1e-9 && r.refs.every(function (x) { var e = f.entities[+String(x).split('.')[0]]; return e && e.t === 'circle'; }) ? i : -1; }).filter(function (i) { return i >= 0; })[0];
      assert(ri != null, 'the X spacing relation');
      await rfPREditRel(ri, '7/8');
      H = rfPRHoles(f);
      var xs = H.map(function (e) { return e.cx; }).sort(function (a, b) { return a - b; });
      near(xs[xs.length - 1] - xs[0], 10 * 0.875, 1e-9, 'eleven columns 7/8 apart');
      // a hole selected and deleted: it becomes one more skipped instance
      var h0 = H.filter(function (e) { return Math.abs(e.cx - (1 + 2 * 0.875)) < 1e-6 && Math.abs(e.cy - 4) < 1e-6; })[0];
      assert(h0, 'a hole at column 3, row 4');
      await rfPRClick([h0.cx + h0.r, h0.cy]); await wait(20);
      rfPRKey('Delete'); await wait(40); await idle();
      assert(rfPRHoles(f).length === 39, 'deleted: ' + rfPRHoles(f).length);
      var pat = f.rels.filter(function (r) { return r.type === 'pattern'; })[0];
      assert(pat && pat.pat && pat.pat.inst && pat.pat.inst.length === 38, 'the pattern holds 38 copies: ' + (pat && pat.pat && pat.pat.inst && pat.pat.inst.length));
      log.push(rfPRLabels().join(','));
      log.push(await rfPRUndoAll() + ' undos / redos');
      var v = await rfPRBuild(0.06);
      near(v, (12 * 6 - 39 * Math.PI * 0.25 * 0.25) * 0.06, 1e-9, 'the panel less 39 holes');
      log.push('volume ' + v.toFixed(6));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- flow 6: an angled corner from a print
  async function rfPRTypeSeg(L, A) {
    var c = rfPRScr([0.5, 0.3]); rfPREv('mousemove', c); await wait(20);
    rfPRKey(String(L).charAt(0)); await wait(30);
    var a = D.activeElement;
    assert(a && a.tagName === 'INPUT', 'the on-screen box opened on the first key');
    setInput(a, String(L)); a.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })); await wait(20);
    a = D.activeElement; setInput(a, String(A)); pressEnter(a); await wait(60);
  }
  step('rfPR flow 6: a plate with a 150° corner typed in the Line chain (6 < 0, 2 < 90, 2 1/2 < 150, 1 < 180), closed by clicks; the typed angle is kept as the corner\'s 120° (fully defined), double-clicked to 135: the side swings, keeps 2 1/2; an angle to the top line placed outside reads 135° and is offered as driven (Make Dimension Driven? > driven: (135°)); fully defined; undo / redo, edit again, Boss-Extrude to the closed form', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.15, 0.8);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]);
      await rfPRTypeSeg('6', 0); await rfPRTypeSeg('2', 90); await rfPRTypeSeg('2 1/2', 150); await rfPRTypeSeg('1', 180);
      var e = f.entities;
      near(e[2].x2, 6 - 2.5 * Math.cos(Math.PI / 6), 1e-9, 'the 150° side ends at x'); near(e[2].y2, 2 + 1.25, 1e-9, 'and y');
      var last = e[e.length - 1];
      await rfPRClick([0, last.y2]); await rfPRClick([0, 0]); await rfPREsc(2);
      assert(rfPREnts() === '0:line 1:line 2:line 3:line 4:line 5:line', 'six lines: ' + rfPREnts());
      // follow-up: the typed 150° is kept as the angle to the previous segment, inside the corner (120°)
      assert(rfPRAn().dof === 0 && rfPRAn().status === 'full', 'the typed angle is a dimension: fully defined, dof ' + rfPRAn().dof);
      assert(rfPRLabels().indexOf('120°') >= 0, '120° between the side and the typed segment: ' + rfPRLabels().join('|'));
      var s;
      var lab = rfPRLabels().filter(function (x) { return /^120/.test(x); })[0];
      await rfPREditDim(new RegExp('^' + lab + '$'), '135');
      s = f.entities[2];
      near(Math.atan2(s.y2 - s.y1, s.x2 - s.x1) * 180 / Math.PI, 135, 1e-9, 'the side now runs at 135°');
      near(Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 2.5, 1e-9, 'and keeps 2 1/2');
      assert(rfPRAn().status === 'full', 'fully defined: ' + rfPRAn().status);
      var a = f.entities[3], mid3 = [(a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2], m2 = [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
      UI.setTool('dimension'); await wait(20);
      var dwell = UI.dimMidDwell(); UI.dimMidDwell(1e9);
      try { await rfPRClick(m2); await rfPRClick(mid3); await rfPRClick([a.x1 + 0.6, a.y1 + 0.5]); await wait(50); } finally { UI.dimMidDwell(dwell); }
      assert(modalOpen() && $('drv-driven'), 'Make Dimension Driven? on a fully defined sketch');
      $('drv-driven').click(); await wait(40);
      var L = rfPRLabels();
      assert(L.some(function (x) { return /^\(135(\.0+)?°\)$/.test(x); }), 'the driven angle reads (135°): ' + L.join('|'));
      assert(rfPRAn().status === 'full', 'still fully defined');
      rfPREsc(2); await wait(20);
      log.push(L.join(','));
      log.push(await rfPRUndoAll() + ' undos / redos');
      var g = rfPRF(), P = g.entities.map(function (x) { return [x.x1, x.y1]; }), A = 0;
      for (var k = 0; k < P.length; k++) { var p = P[k], q = P[(k + 1) % P.length]; A += p[0] * q[1] - q[0] * p[1]; }
      var v = await rfPRBuild(0.1);
      near(v, Math.abs(A) / 2 * 0.1, 1e-9, 'Boss-Extrude .1');
      log.push('volume ' + v.toFixed(5));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- flow 7: Mirror Entities, then the centerline goes
  // (defect 4: deleting the centerline a half was mirrored about left the mirrored copy as loose lines: only the
  // Symmetric relations held its joins; SolidWorks' copy shares its end points and keeps its shape)
  function rfPRJoined(f, list) {
    // every end of the listed lines meets an end of another listed line (a closed or end-to-end chain)
    var ends = [];
    list.forEach(function (i) { var e = f.entities[i]; ends.push({ i: i, p: [e.x1, e.y1] }, { i: i, p: [e.x2, e.y2] }); });
    return ends.filter(function (a) { return !ends.some(function (b) { return b.i !== a.i && Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]) < 1e-9; }); }).length;
  }
  step('rfPR flow 7: half a bracket drawn right of a centerline from the origin (four lines and a hole, hole Ø3/8 located 2 and 1, bottom 3), window-selected, Ctrl+click the centerline, Mirror Entities: copies held Symmetric; hole 2 -> 2 1/4 and bottom 3 -> 3 1/2 move the mirror image too; a corner dragged, the image follows; the centerline deleted: the mirrored copy keeps its joins (five Coincidents) and stays a chain through a drag; undo brings the centerline and the Symmetric relations back', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.5, 0.72);
      UI.cmdCenterline(); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([0, 4]); await rfPREsc(2);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([3, 0]); await rfPRClick([3, 2]); await rfPRClick([1, 3]); await rfPRClick([0, 3]); await rfPREsc(2);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([2, 1]); await rfPRClick([2.2, 1]); await wait(30);
      if (UI.sketchUnitBox && UI.sketchUnitBox.isOpen && UI.sketchUnitBox.isOpen()) { rfPRKey('Escape'); await wait(20); }
      await rfPREsc(2);
      await rfPRDim([[2.2, 1]], [2.8, 1.6], '3/8');
      await rfPRDim([[0, 1.6], [2, 1]], [1, -0.7], '2');
      await rfPRDim([[1.5, 0], [2, 1]], [3.8, 0.5], '1');
      await rfPRDim([[2.6, 0]], [2.6, -1.2], '3');
      UI.setTool('select'); await wait(20);
      await rfPRDrag([-0.2, -0.3], [3.4, 3.4], 8);
      var sel = UI.selection().map(function (s) { return s.index; }).sort();
      assert(sel.join() === '1,2,3,4,5', 'the window took the four lines and the hole, not the centerline: ' + sel.join());
      await rfPRClick([0, 3.6], { ctrlKey: true });
      UI.cmdMirrorEntities(); await wait(40);
      assert(UI.pmTitle() === 'Mirror Entities' && UI.pmSpec().values.axis === '0', 'Mirror Entities about the centerline');
      rfPROK(); await idle(); await wait(40);
      assert(rfPREnts() === '0:line* 1:line 2:line 3:line 4:line 5:circle 6:line 7:line 8:line 9:line 10:circle', 'copies: ' + rfPREnts());
      assert(rfPRRels().filter(function (r) { return /^symmetric\(\d+,\d+,0\)$/.test(r); }).length === 5, 'five Symmetric: ' + rfPRRels().join(' '));
      await rfPREditDim(/^2\.000$/, '2 1/4');
      near(f.entities[10].cx, -2.25, 1e-9, 'the mirrored hole follows 2 1/4');
      await rfPREditDim(/^3\.000$/, '3 1/2');
      near(f.entities[7].x1, -3.5, 1e-9, 'the mirrored side follows 3 1/2');
      await rfPRDrag([1, 3], [1.4, 3.3]);
      near(f.entities[8].x2, -f.entities[3].x2, 1e-9, 'the mirrored corner follows the drag');
      var dof0 = rfPRAn().dof;
      // the centerline deleted
      await rfPRClick([0, 3.8]); await wait(20);
      assert(UI.selection()[0] && UI.selection()[0].index === 0, 'the centerline selected');
      rfPRKey('Delete'); await wait(40); await idle();
      assert(rfPREnts() === '0:line 1:line 2:line 3:line 4:circle 5:line 6:line 7:line 8:line 9:circle', 'the centerline went: ' + rfPREnts());
      assert(/keeps its 5 joins/.test(statusText()), 'status: ' + statusText());
      assert(rfPRJoined(f, [0, 1, 2, 3, 5, 6, 7, 8]) === 0, 'both halves still one chain');
      var dof1 = rfPRAn().dof;
      assert(dof1 <= dof0 + 12, 'the copy keeps its shape (dof ' + dof0 + ' -> ' + dof1 + '; 24 when it fell apart)');
      await rfPRDrag([-3.5, 1], [-3.9, 1.2]);
      assert(rfPRJoined(f, [0, 1, 2, 3, 5, 6, 7, 8]) === 0, 'a drag of the copy keeps it joined');
      log.push('dof ' + dof0 + ' -> ' + dof1);
      // undo: the centerline and the Symmetric relations come back
      UI.setTool('select'); await wait(20);
      rfPRKey('z', { ctrlKey: true }); await idle(); await wait(20);
      rfPRKey('z', { ctrlKey: true }); await idle(); await wait(20);
      assert(rfPRF().entities.length === 11 && rfPRRels().filter(function (r) { return /^symmetric/.test(r); }).length === 5, 'undo: the centerline and its Symmetric relations: ' + rfPREnts());
      log.push(await rfPRUndoAll() + ' undos / redos');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- flow 8: a sheet on the Top plane by typed coordinates
  step('rfPR flow 8: a flat on the Top plane from a coordinate list: four Points, each clicked near its place then typed into its Point PropertyManager (0 0, 5 1/2 0, 5 1/2 3 1/4, -1/2 3 1/4), joined by a Line chain clicked point to point, Fully Define (5.500 .500 3.250), Base Flange: the blank lies at x -1/2..5 1/2, z -3 1/4..0 (Top: y = -Z), volume to the closed form; undo / redo, edit again', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Top', 10, 6.5, 0.3, 0.7);
      var P = [['0', '0'], ['5 1/2', '0'], ['5 1/2', '3 1/4'], ['-1/2', '3 1/4']], want = [[0, 0], [5.5, 0], [5.5, 3.25], [-0.5, 3.25]];
      var guess = [[0.2, 0.2], [5, 0.3], [5.2, 3], [-0.3, 3.1]];
      for (var k = 0; k < 4; k++) {
        UI.setTool('point'); await wait(20);
        await rfPRClick(guess[k]); await wait(20);
        await rfPREsc(2);
        UI.setTool('select'); await rfPRClick(guess[k]); await wait(30);
        assert(UI.pmTitle() === 'Point', 'Point PM: ' + UI.pmTitle());
        var X = pmField('X'), Y = pmField('Y');
        await rfPRTypePM(X, P[k][0]); pressEnter(X); await wait(20);
        await rfPRTypePM(Y, P[k][1]); pressEnter(Y); await wait(20);
        pressEnter(Y); await wait(30);
        var e = f.entities[f.entities.length - 1];
        near(e.x, want[k][0], 1e-12, 'point ' + k + ' x'); near(e.y, want[k][1], 1e-12, 'point ' + k + ' y');
      }
      UI.setTool('line'); await wait(30);
      for (var q = 0; q <= 4; q++) await rfPRClick(want[q % 4]);
      await rfPREsc(2);
      assert(rfPREnts() === '0:point 1:point 2:point 3:point 4:line 5:line 6:line 7:line', 'four lines through the points: ' + rfPREnts());
      assert(rfPRRels().indexOf('coincident(5.p2,2)') >= 0 && rfPRRels().indexOf('coincident(7.p2,O)') >= 0, 'each corner on its point: ' + rfPRRels().join(' '));
      UI.setTool('select'); UI.cmdFullyDefineSketch(); await wait(60); rfPROK(); await idle(); await wait(30);
      assert(rfPRAn().status === 'full', 'Fully Define: ' + rfPRAn().status);
      var L = rfPRLabels();
      assert(['5.500', '.500', '3.250'].every(function (x) { return L.indexOf(x) >= 0; }), 'the three values: ' + L.join('|'));
      log.push(L.join(','));
      log.push(await rfPRUndoAll() + ' undos / redos');
      var id = rfPRF().id;
      UI.exitSketch(); await idle();
      UI.App.sel = { kind: 'feature', id: id };
      UI.cmdBaseFlange(); await idle();
      assert(UI.pmTitle() === 'Base Flange/Tab', 'PM ' + UI.pmTitle());
      await UI.pmOK(); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'built: ' + JSON.stringify(anvil.summary().errors));
      var pos = UI.App.mesh.positions64 || UI.App.mesh.positions, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
      for (var i = 0; i < pos.length; i += 3) for (var a = 0; a < 3; a++) { mn[a] = Math.min(mn[a], pos[i + a]); mx[a] = Math.max(mx[a], pos[i + a]); }
      near(mn[0], -0.5, 1e-6, 'x from -1/2'); near(mx[0], 5.5, 1e-6, 'to 5 1/2'); near(mn[2], -3.25, 1e-6, 'z from -3 1/4 (Top: y = -Z)'); near(mx[2], 0, 1e-6, 'to 0');
      var T = mx[1] - mn[1], v = W.Kernel.massProps(UI.App.mesh, 1).volume;
      near(v, (5.5 * 3.25 + 0.5 * 3.25 / 2) * T, 1e-9, 'the blank\'s volume at thickness ' + T);
      log.push('T ' + T + ' volume ' + v.toFixed(6));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });

  // ---------------------------------------------------------------- defect 1, the rest: loops refused, renames followed
  step('rfPR defect 1: a dimension typed as an equation of itself (or through another) is refused with the reason; ="D1@Sketch1"*2 typed with quotes links; renaming D1 to WIDTH in its Dimension PropertyManager rewrites the equation ("WIDTH@Sketch1") and the link still drives; a plain number typed unlinks', async function () {
    try {
      var f = await rfPRNew('Front', 10, 6.5, 0.1, 0.8);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([4, 0]); await rfPREsc(2);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 1]); await rfPRClick([2, 1]); await rfPREsc(2);
      await rfPRDim([[2, 0]], [2, -0.6], '4');     // D1
      await rfPRDim([[1, 1]], [1, 1.6], '2');      // D2
      var inp = await rfPROpenDim(/^2\.000$/);
      setInput(inp, '=D2*2'); pressEnter(inp); await wait(60);
      assert(!$('dim-edit').hidden && /names the dimension it drives/.test(statusText() + ' ' + ($('dim-edit').getAttribute('data-error') || '') + ' ' + $('dim-edit').textContent), 'refused: ' + statusText());
      setInput(inp, '="D1@Sketch1"*2'); pressEnter(inp); await wait(60);
      if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
      near(rfPRLen(f.entities[1]), 8, 1e-9, 'D2 = D1 * 2 = 8');
      // D1 = D2 / 2 now would be a loop
      inp = await rfPROpenDim(/^4\.000$/);
      setInput(inp, '=D2/2'); pressEnter(inp); await wait(60);
      assert(!$('dim-edit').hidden, 'a loop through D2 is refused');
      rfPRKey('Escape'); await wait(20);
      // rename D1 in its Dimension PM
      UI.setTool('select'); await wait(20);
      rfPRLabelPress(rfPRLabelEl(/^4\.000$/)); await wait(60);
      var nm = D.querySelector('#pm input[data-key="name"]');
      assert(nm, 'the Dimension PM\'s name box (' + UI.pmTitle() + ')');
      setInput(nm, 'WIDTH'); pressEnter(nm); await wait(30);
      if (UI.hasPM()) rfPROK(); await idle();
      await wait(500);   // (the press that selected it is not the first half of the next double-click)
      var d2 = f.dims.filter(function (d) { return d.e === 1; })[0];
      assert(d2.expr === '"WIDTH@Sketch1"*2', 'the equation follows the rename: ' + d2.expr);
      await rfPREditDim(/^4\.000$/, '5');
      near(rfPRLen(f.entities[1]), 10, 1e-9, 'still linked: 10');
      await rfPREditDim(/^Σ10\.000$/, '7');
      assert(!d2.expr && rfPRLabels().indexOf('7.000') >= 0, 'a plain number unlinks: ' + JSON.stringify(d2));
      return rfPRLabels().join(',');
    } finally { await rfPREnd(); }
  });

  // ---------------------------------------------------------------- follow-up: Trim's mode per document
  step('rfPR follow-up: Trim Entities remembers its mode from one Trim to the next in a part, and a new part starts with Power trim again (the remembered Corner leaked into the next document)', async function () {
    try {
      await rfPRNew('Front');
      UI.setTool('line'); await wait(20);
      await rfPRClick([0, 0]); await rfPRClick([3, 0]); await rfPREsc(2);
      UI.cmdTrimEntities(); await wait(40);
      D.querySelector('#pm input[value=corner]').click(); await wait(20);
      UI.pmCancel(); await wait(20);
      UI.cmdTrimEntities(); await wait(40);
      assert(D.querySelector('#pm input[value=corner]').checked, 'remembered in the same part');
      UI.pmCancel(); await rfPREnd();
      await rfPRNew('Front');
      UI.cmdTrimEntities(); await wait(40);
      assert(D.querySelector('#pm input[value=power]').checked, 'a new part: Power trim (' + UI.trimModeRemembered() + ')');
      UI.pmCancel();
      return 'corner kept in the part, power in the next';
    } finally { await rfPREnd(); }
  });