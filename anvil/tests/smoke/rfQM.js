  // --- rfQM (2026-11-19, lane smfinish) --- (1) Tab and Slot remembers its last values while the document is open
  // (SolidWorks keeps a command's last values in a session) and a new document starts from the defaults: the remembered
  // .01 / .005 offsets leaked from rfPT's part into rfOL's. Self-contained.
  (function () {
    var CODE = 'p.units("in");\np.sheet(0.1, 0.1, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\np.sketch("Front", 2).rect(1, 0.1, 4, 2).end().extrude(0.1, { merge: false });\n';
    function rfQMEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function rfQMClick(p) { rfQMEv('mousemove', p); rfQMEv('mousedown', p, $('viewport')); rfQMEv('mouseup', p); }
    async function rfQMPart() {
      var du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(CODE); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
    }
    async function rfQMOpenTS() {
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var btn = Array.prototype.filter.call(D.querySelectorAll('#ribbon button'), function (b) { return /Tab and\s*Slot/.test(b.textContent); })[0];
      assert(btn, 'the Tab and Slot button');
      btn.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Tab and Slot', 'Tab and Slot PM: ' + (UI.hasPM() && UI.pmTitle()));
    }
    step('rfQM: Tab and Slot remembers .01 / .005 slot offsets for the next Tab and Slot in the same part; File ▸ New part starts again from 0 / 0 with Equal offset ticked', async function () {
      var errs0 = errors.length, notes = [];
      await rfQMPart();
      await rfQMOpenTS();
      var e = edgeNear([3, 0.1, 2]);
      rfQMClick(UI.worldToScreen(e.mid)); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      setInput(pmField('Slot length offset'), 0.01); await wait(10);
      var eq = pmField('Equal offset');
      if (eq.checked) { eq.click(); await wait(20); }
      setInput(pmField('Slot width offset'), 0.005); await wait(20);
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'tabSlot' && +f.slotWidthOffset === 0.005, 'feature: ' + JSON.stringify(f));
      await rfQMOpenTS();
      near(+pmField('Slot length offset').value, 0.01, 1e-12, 'same part: length offset remembered');
      near(+pmField('Slot width offset').value, 0.005, 1e-12, 'same part: width offset remembered');
      assert(!pmField('Equal offset').checked, 'same part: Equal offset unticked as last time');
      UI.pmCancel(); await idle();
      await rfQMPart();
      await rfQMOpenTS();
      near(+pmField('Slot length offset').value, 0, 1e-12, 'new part: length offset 0');
      assert(pmField('Equal offset').checked, 'new part: Equal offset ticked');
      notes.push('new part: offsets ' + pmField('Slot length offset').value + ' / ' + (pmField('Slot width offset') ? pmField('Slot width offset').value : 'equal'));
      UI.pmCancel(); await idle();
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();

  // --- rfQM (3) Corner-Trim's Corner Edges boxes by real clicks on the flattened tray: the relief box starts with the
  // four bend corners (Collect all corners), three clicked off; Break the outer corners ticked, its box clicked active,
  // seven of the eight outer corners clicked off (the one kept is on the first flange's wall), ✓: one relief, one
  // chamfer. The first flange 1 -> 1.5 by Edit Feature: flattened again the chamfer is on the wall's moved corner.
  (function () {
    var TRAY = 'p.units("in"); p.sheet(0.06, 0.06, 0.5); p.sketch("Top").rect(0, -6, 8, 6).end().baseFlange();\n' +
      [[4, 0.06, 0], [4, 0.06, 6], [0, 0.06, 3], [8, 0.06, 3]].map(function (e) { return 'p.flange(1, [[' + e.join(', ') + ']], { position: "inside", lengthRef: "outer" });\n'; }).join('');
    function rfQMtEv(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    async function rfQMtClick(p) { rfQMtEv('mousemove', p); await wait(10); rfQMtEv('mousedown', p, $('viewport')); rfQMtEv('mouseup', p); await idle(); await wait(15); }
    function rfQMtScr(q) {
      var fb = K.flatBody(UI.App.model, UI.App.build, UI.App.flat), pl = fb.plane, w = K.to3D(pl, q[0], q[1]);
      return UI.worldToScreen([w[0] + pl.n[0] * fb.h1, w[1] + pl.n[1] * fb.h1, w[2] + pl.n[2] * fb.h1]);
    }
    async function rfQMtFlat(on) { var r = UI.toggleFlatten(on); if (r && r.then) await r; await idle(); await wait(40); await idle(); }
    function key(p) { return p.map(function (x) { return x.toFixed(6); }).join(','); }
    function boxes() { return D.querySelectorAll('#pm .pm-pick'); }

    step('rfQM: Corner-Trim Corner Edges by clicks on the flattened tray: 3 of 4 bend corners clicked off, 7 of 8 outer corners clicked off, ✓: one relief, one chamfer .1; the first flange to 1.5: the chamfer follows its wall\'s corner', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(TRAY); await idle();
      // which outer corners the first flange's length moves (the flat with that flange 1.5 long)
      var m15 = JSON.parse(JSON.stringify(UI.App.model)); m15.features.filter(function (g) { return g.type === 'flange'; })[0].length = 1.5;
      var b15 = K.rebuild(m15), f15 = K.flatPattern(m15, b15, K.meshFromBody(b15.body)), k15 = K.cornerTrimBreakCorners(f15).map(key);
      await rfQMtFlat(true);
      assert(UI.App.flat, 'flattened');
      UI.setView('Top'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(40);
      var flat0 = UI.App.flat, rc = K.cornerTrimCorners(flat0).map(function (c) { return c.at; }), bc = K.cornerTrimBreakCorners(flat0);
      var keepB = bc.filter(function (p) { return k15.indexOf(key(p)) < 0; })[0];
      assert(rc.length === 4 && bc.length === 8 && keepB, 'corners: ' + rc.length + ' bend, ' + bc.length + ' outer');
      UI.setRibbonTab('Sheet Metal'); await wait(20);
      var caret = Array.prototype.filter.call(D.querySelectorAll('#ribbon .rb-caret'), function (b) { return /Corner/.test(b.getAttribute('aria-label') || ''); })[0];
      caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click(); await wait(20);
      var mi = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (m) { return m.textContent.indexOf('Break-Corner/Corner-Trim') >= 0; })[0];
      mi.click(); await idle(); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Corner-Trim', 'Corner-Trim PM: ' + (UI.hasPM() && UI.pmTitle()));
      var rel = pmField('Relief at the bend corners');
      if (!rel.checked) { rel.click(); await wait(20); }
      setInput(pmField('Relief radius'), 0.125); await wait(20);
      assert(/4 corners/.test(boxes()[0].textContent), 'the relief box starts with every bend corner: ' + boxes()[0].textContent);
      for (var i = 1; i < 4; i++) await rfQMtClick(rfQMtScr(rc[i]));
      assert(/^1 corner$/.test(boxes()[0].textContent.trim()), 'three clicked off: ' + boxes()[0].textContent);
      // a click on the removed one adds it back, a second takes it off again
      await rfQMtClick(rfQMtScr(rc[1])); assert(/2 corners/.test(boxes()[0].textContent), 'clicked back on: ' + boxes()[0].textContent);
      await rfQMtClick(rfQMtScr(rc[1]));
      pmField('Break the outer corners').click(); await wait(20);
      setInput(pmField('Distance'), 0.1); await wait(20);
      var bx = boxes();
      assert(bx.length === 2 && /8 corners/.test(bx[1].textContent), 'the break box with the eight outer corners: ' + (bx[1] && bx[1].textContent));
      bx[1].click(); await wait(20);
      assert(boxes()[1].classList.contains('active'), 'the break box is active');
      for (var j = 0; j < bc.length; j++) if (key(bc[j]) !== key(keepB)) await rfQMtClick(rfQMtScr(bc[j]));
      assert(/^1 corner$/.test(boxes()[1].textContent.trim()) && /^1 corner$/.test(boxes()[0].textContent.trim()), 'boxes: ' + boxes()[0].textContent + ' / ' + boxes()[1].textContent);
      notes.push(statusText().slice(0, 90));
      await pmAccept(); await wait(30);
      var fs = UI.App.model.features, f = fs[fs.length - 1];
      assert(f.type === 'cornerTrim' && f.corners && f.corners.length === 1 && f.breakCorners && f.breakCorners.length === 1, 'feature: ' + JSON.stringify(f));
      near(Math.hypot(f.corners[0][0] - rc[0][0], f.corners[0][1] - rc[0][1]), 0, 1e-6, 'the kept bend corner');
      near(Math.hypot(f.breakCorners[0][0] - keepB[0], f.breakCorners[0][1] - keepB[1]), 0, 1e-6, 'the kept outer corner');
      var tr = UI.App.flat.trims[0];
      assert(tr.reliefs.length === 1 && tr.breaks === 1, 'the flat: ' + JSON.stringify(tr));
      // the first flange 1 -> 1.5 (folded, Edit Feature), flattened again: the chamfer is on the corner the wall moved to
      await rfQMtFlat(false);
      var fl1 = UI.App.model.features.filter(function (g) { return g.type === 'flange'; })[0];
      UI.editFeature(fl1); await wait(30); await idle();
      setInput(pmField('Length'), 1.5); await wait(20);
      await pmAccept(); await wait(30); await idle();
      await rfQMtFlat(true);
      tr = UI.App.flat.trims[0];
      assert(tr.reliefs.length === 1 && tr.breaks === 1, 'after the length change: ' + JSON.stringify(tr) + ' ' + JSON.stringify(UI.App.flat.warnings));
      var have = K.cornerTrimBreakCorners(UI.App.flat).map(key), gone = K.cornerTrimBreakCorners(f15).filter(function (p) { return have.indexOf(key(p)) < 0; });
      assert(gone.length === 1 && Math.abs(Math.hypot(gone[0][0] - keepB[0], gone[0][1] - keepB[1]) - 0.5) < 1e-6, 'the chamfered corner is the kept one moved .5: ' + JSON.stringify(gone) + ' from ' + JSON.stringify(keepB));
      await rfQMtFlat(false);
      UI.setView('Isometric');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();

  // --- rfQM (5) Edge-Flange Length arrow by a real drag, on a first flange (before ✓) and on Edit Feature: each frame
  // the Length box shows the dragged value and the arrow stays under the mouse; the preview's free end is at that value
  // (built in the worker: at most one frame behind, at the first moves of a drag) and exactly there when the drag ends ---
  (function () {
    var BASE = 'p.units("in");\np.sheet(0.0598, 0.06, 0.44);\np.sketch("Top").rect(0, -4, 6, 4).end().baseFlange();\n', T = 0.0598;
    function frame() { return new Promise(function (res) { var done = false; W.requestAnimationFrame(function () { if (!done) { done = true; res(); } }); setTimeout(function () { if (!done) { done = true; res(); } }, 1500); }); }
    function ev(type, p, target) {
      var r = $('viewport').getBoundingClientRect();
      (target || W).dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }));
    }
    function previewTop() { var b = new W.THREE.Box3().setFromObject(UI.groups.preview); return b.isEmpty() ? null : b.max.y; }
    function arrowEl() { return D.querySelector('#i3d-layer .i3d-handle[data-kind="pm"]'); }
    async function dragArrow(to, what, notes) {
      var h = UI.instant3DHandles().filter(function (x) { return x.kind === 'pm' && x.key === 'length'; })[0];
      assert(h, what + ': the Length arrow');
      var g = arrowEl(), vr = $('viewport').getBoundingClientRect(), gr = g.getBoundingClientRect(), s0 = h.grab, sA = UI.worldToScreen(h.pos(h.value)), sB = UI.worldToScreen(h.pos(to)), d = [sB[0] - sA[0], sB[1] - sA[1]];
      var off = [gr.left + gr.width / 2 - vr.left - s0[0], gr.top + gr.height / 2 - vr.top - s0[1]], prev = h.value, late = 0;
      ev('mousedown', s0, g);
      for (var k = 1; k <= 5; k++) {
        var m = [s0[0] + d[0] * k / 5, s0[1] + d[1] * k / 5];
        ev('mousemove', m); await frame();
        var v = +UI.pmSpec().values.length, top = previewTop();
        near(+pmField('Length').value, v, 1e-9, what + ' frame ' + k + ': the Length box');
        gr = arrowEl().getBoundingClientRect();
        assert(Math.hypot(gr.left + gr.width / 2 - vr.left - m[0] - off[0], gr.top + gr.height / 2 - vr.top - m[1] - off[1]) <= 2, what + ' frame ' + k + ': the arrow under the mouse');
        if (Math.abs(top - v) > 1e-6) { late++; near(top, prev, 1e-6, what + ' frame ' + k + ': the preview at this or the last value (' + v + ')'); }
        prev = v;
      }
      ev('mouseup', [s0[0] + d[0], s0[1] + d[1]]); await idle();
      if (UI.previewIdle) await UI.previewIdle(); await idle();
      var v1 = +UI.pmSpec().values.length;
      assert(Math.abs(v1 - to) < 0.02, what + ': Length follows the drag to about ' + to + ': ' + v1);
      near(previewTop(), v1, 1e-6, what + ': the preview\'s free end at the dragged length');
      assert(late <= 2, what + ': the preview was a frame late ' + late + ' times');
      notes.push(what + ' ' + v1.toFixed(3) + (late ? ' (preview a frame late ' + late + 'x)' : ''));
      return v1;
    }
    step('rfQM: Edge-Flange Length arrow dragged with the mouse: first flange 1 -> 1.5 before ✓, then Edit Feature 1.5 -> 2: the Length box and the arrow follow every frame, the preview follows (at most a frame late), ✓ builds the dragged length', async function () {
      var errs0 = errors.length, notes = [], du = UI.defaultUnits();
      UI.setDefaultUnits('in');
      try { await anvil.newPart(); await idle(); } finally { UI.setDefaultUnits(du); }
      await anvil.run(BASE); await idle();
      UI.setView('Isometric'); if (UI.zoomToFit) UI.zoomToFit(); await idle(); await wait(30);
      UI.cmdEdgeFlange(); await wait(30);
      var e = edgeNear([3, T, 0]), s = UI.worldToScreen(e.mid);
      ev('mousemove', s); ev('mousedown', s, $('viewport')); ev('mouseup', s); await idle(); await wait(20);
      assert(UI.pmSpec().values.edges.length === 1, 'edge taken: ' + statusText());
      setInput(pmField('Length'), 1); await wait(10);
      if (UI.previewIdle) await UI.previewIdle(); await idle();
      near(previewTop(), 1, 1e-6, 'the preview 1 tall (Float32 mesh)');
      var L1 = await dragArrow(1.5, 'first flange', notes);
      await pmAccept(); await wait(30); await idle();
      near(UI.App.build.body.getBounds().max[1], L1, 1e-9, 'built at the dragged length');
      var fl = UI.App.model.features.filter(function (g) { return g.type === 'flange'; })[0];
      UI.editFeature(fl); await idle(); if (UI.previewIdle) await UI.previewIdle(); await idle();
      var L2 = await dragArrow(2, 'Edit Feature', notes);
      await pmAccept(); await wait(30); await idle();
      near(UI.App.build.body.getBounds().max[1], L2, 1e-9, 'rebuilt at the dragged length');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });
  })();

