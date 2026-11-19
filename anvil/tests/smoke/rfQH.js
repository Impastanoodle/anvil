  // ---- rfQH (local-2026-11-18b, lane sketchflow9): dimension names that never renumber, the Exit Sketch guard rule,
  // and shop sketches driven by real mouse / key events on INCH parts (report test-reports/2026-11-19-sketch-flow-9.md).
  // Uses rfPR's helpers (one eval scope).
  function rfQHNames(f) {
    f = f || rfPRF();
    return UI.sketchDimItems(f).map(function (it) { return UI.sketchDimShortName(f, it.d); }).join(' ');
  }
  // the names in a fixed order: by the value each dimension holds (to 3 places) -> name
  function rfQHByValue(f) {
    f = f || rfPRF();
    var out = UI.sketchDimItems(f).map(function (it) {
      var v = it.kind === 'rel' ? it.d.v : K.dimValue(f.entities[it.d.e], it.d);
      return (+v).toFixed(3) + '=' + UI.sketchDimShortName(f, it.d);
    });
    return out.sort().join(' ');
  }
  async function rfQHDeleteLabel(re) {
    UI.setTool('select'); await wait(20);
    var t = rfPRLabelEl(re);
    assert(t, 'no label ' + re + ' in ' + rfPRLabels().join('|'));
    rfPRLabelPress(t); await wait(30);
    rfPRKey('Delete'); await idle(); await wait(30);
  }
  step('rfQH D-names never renumber: D1 4, D2 2, D3 .5, D4 = D3; D2 deleted by its label and Delete: D3 and D4 keep their names (before: D3 became D2, D4 became D3) and the equation =D3 still follows D3; a new one takes D5; Ctrl+Z / Ctrl+Y, exit and edit, open a saved copy and the script build give the same names', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 8, 5, 0.12, 0.8);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([4.1, 2.05]); await rfPREsc(2);
      await rfPRDim([[2, 0]], [2, -0.6], '4');
      await rfPRDim([[f.entities[1].x1, 1]], [4.7, 1], '2');
      UI.setTool('circle'); await wait(30);
      await rfPRClick([1, 1]); await rfPRClick([1.3, 1]); await rfPREsc(2);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([3, 1]); await rfPRClick([3.2, 1]); await rfPREsc(2);
      assert(f === rfPRF() && f.entities.length === 6, 'circles: ' + (f === rfPRF()) + ' ' + rfPREnts(rfPRF()) + ' ' + statusText());
      var c1 = f.entities[4], c2 = f.entities[5];
      await rfPRDim([[c1.cx + c1.r * 0.7071, c1.cy + c1.r * 0.7071]], [c1.cx + 0.8, c1.cy + 0.6], '1/2');
      var inp = await rfPRDim([[c2.cx + c2.r * 0.7071, c2.cy + c2.r * 0.7071]], [c2.cx + 0.8, c2.cy + 0.6], null, true);
      setInput(inp, '=D3'); pressEnter(inp); await wait(60);
      if (!$('dim-edit').hidden) { rfPRKey('Escape'); await wait(20); }
      log.push(rfQHByValue(f));
      assert(rfQHNames(f) === 'D1 D2 D3 D4', 'four in creation order: ' + rfQHNames(f));
      assert(f.dims[3].expr && /D3/.test(f.dims[3].expr), 'D4 holds =D3: ' + JSON.stringify(f.dims[3]));
      await rfQHDeleteLabel(/^2\.0+$/);
      log.push(rfQHByValue(f));
      assert(f.dims.length === 3, 'the 2 is deleted: ' + JSON.stringify(f.dims));
      assert(rfQHByValue(f) === '0.500=D3 0.500=D4 4.000=D1', 'D3 and D4 keep their names: ' + rfQHByValue(f));
      await wait(500);
      await rfPREditDim(/^(Ø|⌀)?0?\.50+$/, '3/4');
      log.push(rfQHByValue(f));
      assert(rfQHByValue(f) === '0.750=D3 0.750=D4 4.000=D1', 'D4 = D3 still follows D3: ' + rfQHByValue(f));
      await rfPRDim([[0, 1]], [-0.7, 1], '2.5');
      log.push(rfQHByValue(f));
      assert(rfQHByValue(f) === '0.750=D3 0.750=D4 2.500=D5 4.000=D1', 'the new one is D5 (no gap refilled): ' + rfQHByValue(f));
      var shown = rfQHByValue(f);
      UI.setTool('select'); await wait(20);
      rfPRKey('z', { ctrlKey: true }); await idle(); await wait(20);
      log.push('undo ' + rfQHByValue(rfPRF()));
      rfPRKey('z', { ctrlKey: true }); await idle(); await wait(20);
      rfPRKey('z', { ctrlKey: true }); await idle(); await wait(20);
      log.push('undo3 ' + rfQHByValue(rfPRF()));
      assert(rfQHByValue(rfPRF()) === '0.500=D3 0.500=D4 2.000=D2 4.000=D1', 'undo back before the delete: D1 to D4: ' + rfQHByValue(rfPRF()));
      for (var k = 0; k < 3; k++) { rfPRKey('y', { ctrlKey: true }); await idle(); await wait(20); }
      assert(rfQHByValue(rfPRF()) === shown, 'redo: the same names: ' + rfQHByValue(rfPRF()));
      var id = rfPRF().id;
      UI.exitSketch(); await idle();
      UI.enterSketch(id); await idle(); await wait(30);
      assert(rfQHByValue(rfPRF()) === shown, 'exit and edit: ' + rfQHByValue(rfPRF()));
      UI.exitSketch(); await idle();
      // the kernel (equations, Design Table) and a build of the generated script give the same names
      var sk = UI.App.model.features.filter(function (x) { return x.id === id; })[0];
      var kn = K.sketchDimItems(sk).map(function (it) { return it.name; }).join(' ');
      assert(kn === 'D1 D3 D4 D5', 'Kernel names: ' + kn);
      var script = anvil.script();
      var saved = JSON.stringify(UI.App.model);
      await rfPRPart();
      anvil.run(script); await idle();
      var sk2 = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
      assert(K.sketchDimItems(sk2).map(function (it) { return it.name; }).join(' ') === kn, 'script build: ' + K.sketchDimItems(sk2).map(function (it) { return it.name; }).join(' '));
      anvil.load(JSON.parse(saved)); await idle();
      UI.enterSketch(id); await idle(); await wait(30);
      rfPRFrame(8, 5, 0.12, 0.8); await wait(30);
      assert(rfQHByValue(rfPRF()) === shown, 'a saved copy opened: ' + rfQHByValue(rfPRF()));
      // a second delete (D1) then a new one: D6 (the highest shown + 1)
      await rfQHDeleteLabel(/^4\.0+$/);
      log.push('del1 ' + rfQHByValue(rfPRF()));
      await rfPRDim([[2, 0]], [2, -0.6], '4');
      log.push(rfQHByValue(rfPRF()));
      assert(rfQHByValue(rfPRF()) === '0.750=D3 0.750=D4 2.500=D5 4.000=D6', 'after D1 deleted the new one is D6: ' + rfQHByValue(rfPRF()));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  step('rfQH exit guard rule: the guard is asked by the user\'s exits (right-click Exit Sketch, Boss-Extrude from the open sketch: not run, double-click of another sketch in the tree: not opened) and not by a command that goes on at once (Linear Pattern: the sketch closes, its PropertyManager opens outside it) or a forced exit (undo past the sketch, a new part)', async function () {
    var log = [], asked = [];
    try {
      var f0 = await rfPRNew('Front', 8, 5, 0.12, 0.8);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([1, 1]); await rfPRClick([1.5, 1]); await rfPREsc(2);
      UI.exitSketch(); await idle();
      await UI.newSketchOnPlane('Front'); await idle();
      rfPRFrame(8, 5, 0.12, 0.8); await wait(30);
      var f = rfPRF();
      UI.setTool('rect'); await wait(30);
      await rfPRClick([3, 0]); await rfPRClick([5, 2]); await rfPREsc(2);
      UI.sketchExitGuard = function (sk) { asked.push(sk.id); return 'Kept open by the guard.'; };
      UI.setTool('select'); await wait(20);
      var rows = await rfPRMenuAt([6.5, 3.5]);
      var ex = rows.filter(function (x) { return /^Exit Sketch$/.test(x.textContent.trim()); })[0];
      assert(ex, 'an Exit Sketch row: ' + rows.map(function (x) { return x.textContent.trim(); }).join('|'));
      ex.click(); await idle();
      assert(UI.App.mode === 'sketch' && asked.length === 1, 'right-click Exit Sketch asks: ' + asked.length);
      UI.cmdExtrude(); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch' && asked.length === 2 && !/Extrude/.test(UI.pmTitle() || ''), 'Boss-Extrude from the sketch asks and does not open: ' + UI.pmTitle());
      UI.enterSketch(f0.id); await idle();
      assert(UI.App.mode === 'sketch' && UI.App.activeSketch === f.id && asked.length === 3, 'another sketch is not opened: ' + UI.App.activeSketch);
      UI.cmdLinearPattern(); await idle(); await wait(30);
      log.push('LP ' + UI.App.mode + ' ' + UI.pmTitle());
      assert(UI.App.mode !== 'sketch' && asked.length === 3, 'Linear Pattern closes the sketch without asking: ' + UI.App.mode + ' ' + asked.length);
      if (UI.closePM) UI.closePM(); await idle();
      UI.enterSketch(f.id); await idle(); await wait(30);
      assert(UI.App.mode === 'sketch' && UI.App.activeSketch === f.id, 'edit it again');
      await rfPRPart();
      assert(UI.App.mode !== 'sketch' && asked.length === 3, 'a new part closes it without asking');
      UI.sketchExitGuard = null;
      log.push('asked ' + asked.length);
    } finally { UI.sketchExitGuard = null; await rfPREnd(); }
    return rfPROut(log);
  });
  // ---------------------------------------------------------------- 3a: a gasket
  function rfQHFk(k) { return D.querySelector('#pm input[data-key="' + k + '"]'); }
  function rfQHHoles(f) { return (f || rfPRF()).entities.filter(function (e) { return e.t === 'circle' && !e.construction && Math.abs(e.r - 0.133) < 1e-9; }); }
  step('rfQH flow a: a gasket: a 6 x 6 outline with four R.5 Sketch Fillets, a centre Ø3, a construction Ø4.5 bolt circle concentric, one Ø.266 seed on it straight above the centre, Circular Sketch Pattern of 6 from the seed; right-click Edit Circular Pattern 6 -> 8, the bolt circle 4.5 -> 5: every hole follows, fully defined at each stage; Boss-Extrude .06 to the closed form volume', async function () {
    var log = [];
    try {
      var f = await rfPRNew('Front', 9, 8, 0.15, 0.85);
      UI.setTool('rect'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([6.1, 6.1]); await rfPREsc(2);
      await rfPRDim([[3, 0]], [3, -0.6], '6'); await rfPRDim([[f.entities[1].x1, 3]], [6.7, 3], '6');
      UI.cmdSketchFillet(); await wait(40);
      await rfPRTypePM(pmField('Radius'), '1/2'); pressEnter(pmField('Radius')); await wait(30);
      await rfPRClick([6, 0]); await rfPRClick([6, 6]); await rfPRClick([0, 6]); await rfPRClick([0, 0]); await wait(30);
      await UI.pmOK(); await idle();
      f = rfPRF();
      var fil = f.entities.filter(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.5) < 1e-9; });
      log.push('fillets ' + fil.length + ' ' + rfPRAn().status);
      assert(fil.length === 4, 'four R.5 fillets: ' + rfPREnts() + ' / ' + statusText());
      assert(rfPRAn().status === 'full', 'the filleted outline fully defined: ' + rfPRAn().status);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([3.1, 3.1]); await rfPRClick([4.6, 3.1]); await rfPREsc(2);
      f = rfPRF(); var cIdx = f.entities.length - 1, C = f.entities[cIdx];
      await rfPRDim([[C.cx + C.r * 0.7071, C.cy + C.r * 0.7071]], [C.cx + 2, C.cy + 2.2], '3');
      await rfPRDim([[0, 3], [C.cx, C.cy]], [1.5, 4.9], '3');
      await rfPRDim([[3, 0], [C.cx, C.cy]], [4.9, 1.5], '3');
      C = rfPRF().entities[cIdx];
      near(C.cx, 3, 1e-9, 'centre x'); near(C.cy, 3, 1e-9, 'centre y'); near(C.r, 1.5, 1e-9, 'Ø3');
      assert(rfPRAn().status === 'full', 'the centre hole fully defined: ' + rfPRAn().status);
      UI.setTool('circle'); await wait(30);
      await rfPRClick([3, 3]); await rfPRClick([5.3, 3]); await wait(30); await rfPREsc(2);
      f = rfPRF(); var bIdx = f.entities.length - 1;
      assert(rfPRRels().indexOf('coincident(' + bIdx + '.c,' + cIdx + '.c)') >= 0 || rfPRRels().indexOf('concentric(' + bIdx + ',' + cIdx + ')') >= 0 || rfPRRels().indexOf('concentric(' + cIdx + ',' + bIdx + ')') >= 0 || rfPRRels().indexOf('coincident(' + cIdx + '.c,' + bIdx + '.c)') >= 0, 'the bolt circle on the centre: ' + rfPRRels().join(' '));
      UI.setTool('select'); await wait(20); await rfPRClick([3, 3 + f.entities[bIdx].r]); await wait(30);
      var cc = pmField('For construction'); assert(cc, 'For construction box in ' + UI.pmTitle()); cc.click(); await wait(30);
      rfPREsc(1); await wait(20);
      var B = rfPRF().entities[bIdx];
      assert(B.construction, 'a construction bolt circle');
      await rfPRDim([[B.cx + B.r * 0.7071, B.cy - B.r * 0.7071]], [5.6, 1.0], '4.5');
      assert(rfPRAn().status === 'full', 'the bolt circle fully defined: ' + rfPRAn().status);
      UI.setTool('circle'); await wait(30);
      // the seed: a small hole started on the bolt circle's top quadrant; at this zoom its radius click is 6 px from the centre (it snapped back onto it: radius 0, nothing made)
      await rfPRClick([3, 5.25]); await rfPRClick([3.12, 5.25]); await wait(30); await rfPREsc(2);
      f = rfPRF(); var sIdx = f.entities.length - 1, S0 = f.entities[sIdx];
      log.push('seed rels ' + rfPRRels().filter(function (r) { return r.indexOf(sIdx + '') >= 0; }).join(' '));
      assert(rfPRRels().indexOf('coincident(' + sIdx + '.c,' + bIdx + ')') >= 0, 'the seed centre on the bolt circle: ' + rfPREnts() + ' / ' + rfPRRels().join(' '));
      await rfPRDim([[S0.cx + S0.r, S0.cy]], [S0.cx + 0.6, S0.cy + 0.6], '.266');
      if (rfPRAn().status !== 'full') {
        UI.setTool('select'); await wait(20);
        S0 = rfPRF().entities[sIdx];
        await rfPRClick([S0.cx, S0.cy]); await rfPRClick([3, 3], { ctrlKey: true }); await wait(30);
        var vb = D.querySelector('#sk-ctx [data-rel="vertical"]');
        assert(vb, 'Make Vertical on the context toolbar');
        vb.click(); await wait(40); rfPREsc(2); await wait(20);
      }
      S0 = rfPRF().entities[sIdx];
      near(S0.cx, 3, 1e-9, 'seed straight above the centre'); near(S0.cy, 5.25, 1e-9, 'seed on the Ø4.5');
      assert(rfPRAn().status === 'full', 'the seed fully defined: ' + rfPRAn().status);
      UI.setTool('select'); await wait(20); await rfPRDrag([2.7, 5.6], [3.3, 4.95]); await wait(20);
      assert(UI.selection().length >= 1, 'the seed window-selected: ' + JSON.stringify(UI.selection()));
      UI.cmdCircularSketchPattern(); await wait(40);
      await rfPRTypePM(rfQHFk('cx'), '3'); pressEnter(rfQHFk('cx')); await wait(20);
      await rfPRTypePM(rfQHFk('cy'), '3'); pressEnter(rfQHFk('cy')); await wait(20);
      await rfPRTypePM(rfQHFk('count'), '6'); pressEnter(rfQHFk('count')); await wait(20);
      rfPROK(); await idle(); await wait(50);
      f = rfPRF();
      assert(rfQHHoles(f).length === 6, 'six holes: ' + rfQHHoles(f).length);
      log.push('pattern 6 ' + rfPRAn().status);
      assert(rfPRAn().status === 'full', 'pattern of 6 fully defined: ' + rfPRAn().status + ' ' + rfPRRels().join(' '));
      var H = rfQHHoles(f)[1];
      var rows = await rfPRMenuAt([H.cx + H.r * 0.7071, H.cy - H.r * 0.7071]);
      var ed = rows.filter(function (r) { return /Edit Circular Pattern/.test(r.textContent); })[0];
      assert(ed, 'Edit Circular Pattern on the hole\'s menu: ' + rows.map(function (r) { return r.textContent; }).join('/'));
      ed.click(); await wait(60);
      await rfPRTypePM(rfQHFk('count'), '8'); pressEnter(rfQHFk('count')); await wait(20);
      rfPROK(); await idle(); await wait(50);
      f = rfPRF();
      assert(rfQHHoles(f).length === 8, 'eight holes: ' + rfQHHoles(f).length);
      log.push('pattern 8 ' + rfPRAn().status);
      assert(rfPRAn().status === 'full', 'pattern of 8 fully defined: ' + rfPRAn().status);
      await rfPREditDim(/^(Ø|⌀)4\.50*$/, '5');
      f = rfPRF();
      var ang = rfQHHoles(f).map(function (e) { near(Math.hypot(e.cx - 3, e.cy - 3), 2.5, 1e-9, 'on the Ø5'); return Math.round(Math.atan2(e.cy - 3, e.cx - 3) * 180 / Math.PI); }).sort(function (a, b) { return a - b; }).join(',');
      assert(ang === '-135,-90,-45,0,45,90,135,180', 'eight at 45°: ' + ang);
      assert(rfPRAn().status === 'full', 'Ø5 fully defined: ' + rfPRAn().status);
      assert(W.Kernel.sketchProfile(f).loops.length === 10, 'ten loops: ' + W.Kernel.sketchProfile(f).loops.length);
      var r = 0.5, v = await rfPRBuild(0.06);
      near(v, (36 - 4 * (r * r - Math.PI * r * r / 4) - Math.PI * 1.5 * 1.5 - 8 * Math.PI * 0.133 * 0.133) * 0.06, 1e-9, 'the gasket');
      log.push('volume ' + v.toFixed(6));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  // ---------------------------------------------------------------- 3b: a flat from a print
  function rfQHDxfCounts(txt) {
    var lines = txt.split(/\r?\n/).map(function (s) { return s.trim(); }), n = { LINE: 0, ARC: 0, CIRCLE: 0, other: 0 }, inE = false;
    for (var i = 0; i + 1 < lines.length; i += 2) {
      if (lines[i] === '2' && lines[i - 2] === '0' && lines[i - 1] === 'SECTION') inE = lines[i + 1] === 'ENTITIES';
      if (inE && lines[i] === '0' && lines[i + 1] !== 'SECTION' && lines[i + 1] !== 'ENDSEC' && lines[i + 1] !== 'EOF') { if (n[lines[i + 1]] != null) n[lines[i + 1]]++; else { n.other++; n.what = (n.what || '') + lines[i + 1] + ' '; } }
    }
    return n;
  }
  function rfQHSlotArcs(f, y) { return (f || rfPRF()).entities.filter(function (e) { return e.t === 'arc' && !e.construction && Math.abs(e.cy - y) < 0.3; }); }
  // the flat of flow b drawn and edited by real events up to the notch widened to 2.5 (shared by flows b and c)
  async function rfQHDrawFlat(log) {
    {
      var f = await rfPRNew('Front', 8, 6, 0.12, 0.85);
      UI.setTool('line'); await wait(30);
      await rfPRClick([0, 0]); await rfPRClick([6.1, 0]); await rfPRClick([6.1, 2.45]); await rfPRClick([4.05, 2.45]); await rfPRClick([4.05, 4.1]); await rfPRClick([0, 4.1]); await rfPRClick([0, 0]);
      await rfPREsc(2);
      assert(rfPREnts() === '0:line 1:line 2:line 3:line 4:line 5:line', 'six lines: ' + rfPREnts());
      f = rfPRF();
      await rfPRDim([[3, 0]], [3, -0.6], '6');
      await rfPRDim([[0, 2]], [-0.6, 2], '4');
      await rfPRDim([[5, f.entities[2].y1]], [5, 3.1], '2');
      await rfPRDim([[f.entities[3].x1, 3.3]], [4.6, 3.3], '1.5');
      f = rfPRF();
      log.push('outline ' + rfOICounts());
      assert(rfPRAn().status === 'full', 'the L fully defined: ' + rfOICounts() + ' ' + rfPRRels().join(' '));
      // two slots, centre to centre .469 (.75 overall), .281 wide
      var slotIdx = [];
      for (var s = 0; s < 2; s++) {
        var y = s ? 1.0 : 3.2, n0 = rfPRF().entities.length;
        UI.setTool('slot'); await wait(30);
        await rfPRClick([1.0, y]); await rfPRClick([1.5, y]); await rfPRClick([1.5, y + 0.15]); await rfPREsc(2);
        slotIdx.push(n0);
        log.push('slot ' + s + ': ' + rfPREnts().split(' ').slice(n0).join(' '));
      }
      f = rfPRF();
      var arcs = function (y) { return rfQHSlotArcs(rfPRF(), y); };
      assert(arcs(3.2).length === 2 && arcs(1.0).length === 2, 'two slots of two arcs: ' + rfPREnts());
      for (s = 0; s < 2; s++) {
        y = s ? 1.0 : 3.2;
        var A = arcs(y).sort(function (a, b) { return a.cx - b.cx; });
        // the centre distance: one arc centre to the other
        await rfPRDim([[A[0].cx, A[0].cy], [A[1].cx, A[1].cy]], [1.25, y + 0.55], '.469');
        A = arcs(y).sort(function (a, b) { return a.cx - b.cx; });
        await rfPRDim([[A[1].cx + A[1].r * 0.7071, A[1].cy + A[1].r * 0.7071]], [A[1].cx + 0.5, A[1].cy + 0.45], '.1405');
        A = arcs(y).sort(function (a, b) { return a.cx - b.cx; });
        // from the notch corner (4, 2.5) to the right cap's centre: across, then up / down
        await rfPRDim([[4, 2.5], [A[1].cx, A[1].cy]], [2.8, s ? 0.45 : 3.75], s ? '2.531' : '2.531');
        A = arcs(y).sort(function (a, b) { return a.cx - b.cx; });
        await rfPRDim([[4, 2.5], [A[1].cx, A[1].cy]], [3.4, (y + 2.5) / 2], s ? '1.5' : '.7');
        log.push('slot ' + s + ' dims ' + rfOICounts());
      }
      f = rfPRF();
      [[3.2], [1.0]].forEach(function (yy) {
        var A = arcs(yy[0]).sort(function (a, b) { return a.cx - b.cx; });
        near(A[1].cx, 4 - 2.531, 1e-9, 'right cap x'); near(A[1].cy, yy[0], 1e-9, 'cap y'); near(A[0].cx, 4 - 2.531 - 0.469, 1e-9, 'left cap x'); near(A[0].r, 0.1405, 1e-9, '.281 wide');
      });
      log.push('slots ' + rfOICounts());
      // the Ø.5 hole by ordinates from the lower left corner
      UI.setTool('circle'); await wait(30);
      await rfPRClick([5.05, 1.05]); await rfPRClick([5.3, 1.05]); await rfPREsc(2);
      f = rfPRF(); var hIdx = f.entities.length - 1, Hc = f.entities[hIdx];
      await rfPRDim([[Hc.cx + Hc.r * 0.7071, Hc.cy + Hc.r * 0.7071]], [Hc.cx + 0.5, Hc.cy + 0.6], '.5');
      Hc = rfPRF().entities[hIdx];
      rfPREsc(1); await wait(20);   // the Ø.5 just typed stays selected; Esc clears it as a user would
      await rfOIOrd('x', [0, 0], [3, 4.6], [[[Hc.cx, Hc.cy], '5']]);
      Hc = rfPRF().entities[hIdx];
      await rfOIOrd('y', [0, 0], [6.6, 2], [[[Hc.cx, Hc.cy], '1']]);
      Hc = rfPRF().entities[hIdx];
      near(Hc.cx, 5, 1e-9, 'hole x 5'); near(Hc.cy, 1, 1e-9, 'hole y 1'); near(Hc.r, 0.25, 1e-9, 'Ø.5');
      log.push('hole ' + rfOICounts());
      // the top left corner chamfered .25 x 45°
      UI.cmdSketchChamfer(); await wait(40);
      await rfPRTypePM(pmField('Distance 1'), '1/4');   // (the harness cannot type a leading '.' into a number box key by key) pressEnter(pmField('Distance 1')); await wait(30);
      await rfPRClick([0, 4]); await wait(30);
      await UI.pmOK(); await idle();
      f = rfPRF();
      var ch = f.entities.filter(function (e) { return e.t === 'line' && !e.construction && Math.abs(e.x1 - e.x2) > 1e-6 && Math.abs(e.y1 - e.y2) > 1e-6; });
      assert(ch.length === 1 && Math.abs(Math.hypot(ch[0].x2 - ch[0].x1, ch[0].y2 - ch[0].y1) - 0.25 * Math.SQRT2) < 1e-9, 'one chamfer line .25 x .25: ' + rfPREnts() + ' ' + statusText());
      log.push('chamfer ' + rfOICounts());
      assert(W.Kernel.sketchProfile(f).loops.length === 4, 'outline, two slots, the hole: ' + W.Kernel.sketchProfile(f).loops.length);
      var st0 = rfPRAn().status;
      // the notch 2 -> 2.5
      await rfPREditDim(/^2\.0+$/, '2.5');
      f = rfPRF();
      log.push('notch 2.5 ' + rfOICounts() + ' ' + statusText());
      var notch = f.entities.filter(function (e) { return e.t === 'line' && !e.construction && Math.abs(e.x1 - e.x2) < 1e-9 && Math.min(e.y1, e.y2) > 2 && e.x1 > 1; })[0];
      near(notch.x1, 3.5, 1e-9, 'the notch edge at 3.5');
      [3.2, 1.0].forEach(function (yy) {
        var A = arcs(yy).sort(function (a, b) { return a.cx - b.cx; });
        near(A[1].cx, 3.5 - 2.531, 1e-9, 'the slot follows the notch corner (' + yy + ')'); near(A[1].cy, yy, 1e-9, 'its y');
      });
      Hc = rfPRF().entities[hIdx];
      near(Hc.cx, 5, 1e-9, 'the hole stays at x 5'); near(Hc.cy, 1, 1e-9, 'y 1');
      assert(rfPRAn().status === st0, 'still ' + st0 + ': ' + rfOICounts());
      return f;
    }
  }
  step('rfQH flow b: a flat from a print: an L outline 6 x 4 with a 2 x 1.5 notch by the Line tool, two Straight Slots .281 wide, .469 between centres, dimensioned from the notch corner, a Ø.5 hole by Horizontal / Vertical Ordinate dimensions from the lower left corner, the top left corner chamfered .25 x 45° with Sketch Chamfer; the notch widened 2 -> 2.5: the slots follow it, the hole stays; the sketch DXF', async function () {
    var log = [];
    try {
      var f = await rfQHDrawFlat(log), st0 = rfPRAn().status;
      var dxf = anvil.dxfSketch(f.id), n = rfQHDxfCounts(dxf);
      log.push('dxf ' + JSON.stringify(n) + ' ' + st0);
      assert(n.LINE === 7 + 4 && n.ARC === 4 && n.CIRCLE === 1 && n.other === 0, 'the DXF: 7 outline lines, 4 slot lines, 4 arcs, 1 circle: ' + JSON.stringify(n));
      var r = 0.1405, area = 6 * 4 - 2.5 * 1.5 - 0.25 * 0.25 / 2 - 2 * (0.469 * 2 * r + Math.PI * r * r) - Math.PI * 0.0625;
      var v = await rfPRBuild(0.06);
      near(v, area * 0.06, 1e-9, 'the flat');
      log.push('volume ' + v.toFixed(6));
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });
  // ---------------------------------------------------------------- 3c: edits after the fact on the flat of flow b
  step('rfQH flow c: edits after the fact on the flat of flow b: Sketch Fillet R.25 on the lower right corner; Power trim drags take the lower slot away (lines, caps and its centerline); a line drawn short of the notch and extended to it by Extend Entities; a second sketch on the Front plane with Convert Entities of the notch edge; back in the first, Offset Entities .125 inward of the outline (Select chain) as construction; the fillet deleted with Delete and the corner made sharp again with Trim Corner; the part rebuilt', async function () {
    var log = [];
    try {
      var f = await rfQHDrawFlat(log), id = f.id;
      UI.cmdSketchFillet(); await wait(40);
      await rfPRTypePM(pmField('Radius'), '1/4'); pressEnter(pmField('Radius')); await wait(30);
      await rfPRClick([6, 0]); await wait(30);
      await UI.pmOK(); await idle();
      f = rfPRF();
      assert(f.entities.some(function (e) { return e.t === 'arc' && Math.abs(e.r - 0.25) < 1e-9; }), 'R.25 fillet: ' + rfPREnts() + ' ' + statusText());
      log.push('fillet ' + rfOICounts());
      // the lower slot (caps at x .5 and .969 after the notch edit) trimmed away by Power trim strokes
      UI.cmdTrimEntities(); await wait(40);
      await rfOITrimMode('power');
      await rfPRDrag([0.73, 1.45], [0.73, 0.55], 6);
      await rfPRDrag([0.38, 1.3], [0.38, 0.7], 6);
      await rfPRDrag([1.07, 1.3], [1.07, 0.7], 6);
      rfPROK(); await idle();
      f = rfPRF();
      var low = f.entities.filter(function (e) { return e.t !== 'point' && e.t !== 'circle' && Math.abs((e.t === 'arc' ? e.cy : (e.y1 + e.y2) / 2) - 1) < 0.2 && (e.t === 'arc' ? e.cx : (e.x1 + e.x2) / 2) < 1.5; });
      log.push('trim ' + rfOICounts() + ' left ' + JSON.stringify(low));
      assert(!low.length, 'the lower slot is gone: ' + JSON.stringify(low));
      assert(W.Kernel.sketchProfile(f).loops.length === 3, 'outline, one slot, the hole: ' + W.Kernel.sketchProfile(f).loops.length);
      // a line short of the notch, extended to it
      UI.setTool('line'); await wait(30);
      await rfPRClick([1.6, 3.0]); await rfPRClick([2.3, 3.0]); await rfPREsc(2);
      f = rfPRF(); var li = f.entities.length - 1;
      UI.cmdExtendEntities(); await wait(40);
      await rfPRClick([2.2, 3.0]); await wait(30);
      UI.setTool('select'); if (UI.hasPM()) rfPROK(); await idle();
      f = rfPRF();
      near(Math.max(f.entities[li].x1, f.entities[li].x2), 3.5, 1e-9, 'extended to the notch edge (' + statusText() + ')');
      log.push('extend ' + rfOICounts());
      // Offset Entities .125 inward of the whole outline as construction (one outline line clicked, Select chain)
      UI.setTool('select'); await wait(20);
      await rfPRClick([3, 0]); await wait(30);
      UI.cmdOffsetEntities(); await wait(40);
      var ch = pmField('Select chain'); if (ch && !ch.checked) { ch.click(); await wait(30); }
      await rfPRTypePM(pmField('Offset distance'), '1/8'); await wait(30);
      pmField('Offset geometry').click(); await wait(30);
      var pl = UI.activePlane(), inside = function () { return (UI.App.tempEntities || []).length && (UI.App.tempEntities || []).every(function (e) { return e.t === 'arc' ? true : Math.min(e.x1, e.x2) > 0.05 && Math.min(e.y1, e.y2) > 0.05; }); };
      if (!inside()) { pmField('Reverse').click(); await wait(30); }
      log.push('offset preview ' + (UI.App.tempEntities || []).length);
      assert(inside(), 'offset inward: ' + JSON.stringify((UI.App.tempEntities || []).slice(0, 3)));
      var n0 = rfPRF().entities.length;
      await UI.pmOK(); await idle();
      f = rfPRF();
      var cons = f.entities.slice(n0).filter(function (e) { return e.construction && e.t !== 'point'; });
      log.push('offset ' + rfOICounts() + ' ' + cons.length + ' construction');
      assert(cons.length >= 8, 'the offset outline, construction: ' + rfPREnts());
      assert(W.Kernel.sketchProfile(f).loops.length === 3, 'construction adds no loop: ' + W.Kernel.sketchProfile(f).loops.length);
      // the fillet deleted, the corner made sharp again by Trim Corner
      UI.setTool('select'); await wait(20);
      var fa = f.entities.filter(function (e) { return e.t === 'arc' && !e.construction && Math.abs(e.r - 0.25) < 1e-9; })[0];
      var mid = [fa.cx + fa.r * Math.cos(-Math.PI / 4), fa.cy + fa.r * Math.sin(-Math.PI / 4)];
      await rfPRClick(mid); await wait(30);
      log.push('sel ' + JSON.stringify(UI.selection()));
      rfPRKey('Delete'); await idle(); await wait(30);
      f = rfPRF();
      assert(!f.entities.some(function (e) { return e.t === 'arc' && !e.construction && Math.abs(e.r - 0.25) < 1e-9; }), 'the fillet deleted');
      log.push('deleted ' + rfOICounts());
      // the offset outline stays held by the chain less the fillet's pair (before: the chain went, 33 free; now the extended line 2, the fillet's copy 5, the lost corner dimension)
      assert(rfPRRels().some(function (r) { return /^offset\(/.test(r); }) && rfPRAn().dof <= 9, 'the offset chain stays: ' + rfOICounts());
      UI.cmdTrimEntities(); await wait(40);
      await rfOITrimMode('corner');
      await rfPRClick([5, 0]); await rfPRClick([6, 1.5]); await wait(30);
      rfPROK(); await idle();
      f = rfPRF();
      var bot = f.entities.filter(function (e) { return e.t === 'line' && !e.construction && Math.abs(e.y1) < 1e-9 && Math.abs(e.y2) < 1e-9; })[0];
      var rgt = f.entities.filter(function (e) { return e.t === 'line' && !e.construction && Math.abs(e.x1 - 6) < 1e-9 && Math.abs(e.x2 - 6) < 1e-9; })[0];
      assert(bot && rgt && Math.abs(Math.max(bot.x1, bot.x2) - 6) < 1e-9 && Math.abs(Math.min(rgt.y1, rgt.y2)) < 1e-9, 'the corner sharp: ' + JSON.stringify([bot, rgt]) + ' ' + statusText());
      assert(W.Kernel.sketchProfile(f).loops.length === 3, 'one outline again: ' + W.Kernel.sketchProfile(f).loops.length);
      log.push('corner ' + rfOICounts());
      // a second sketch on the Front plane: Convert Entities of the notch edge of the part
      var r = 0.1405, area = 6 * 4 - 2.5 * 1.5 - 0.25 * 0.25 / 2 - (0.469 * 2 * r + Math.PI * r * r) - Math.PI * 0.0625;
      var v = await rfPRBuild(0.06);
      near(v, area * 0.06, 1e-9, 'the flat less one slot');
      await UI.newSketchOnPlane('Front'); await idle();
      rfPRFrame(8, 6, 0.12, 0.85); await wait(30);
      UI.cmdConvertEntities(); await wait(30);
      await rfPRClick([3.5, 3.25]); await wait(30);
      await UI.pmOK(); await idle();
      var g = rfPRF();
      log.push('convert ' + rfPREnts(g) + ' ' + rfPRRels(g).join(' '));
      assert(g.id !== id && g.entities.length === 1 && g.entities[0].t === 'line' && Math.abs(g.entities[0].x1 - 3.5) < 1e-9 && Math.abs(g.entities[0].x2 - 3.5) < 1e-9, 'the notch edge converted: ' + rfPREnts(g) + ' ' + JSON.stringify(g.entities[0]) + ' ' + statusText());
      near(Math.abs(g.entities[0].y2 - g.entities[0].y1), 1.5, 1e-9, 'its length');
    } finally { await rfPREnd(); }
    return rfPROut(log);
  });