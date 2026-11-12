  // ---- rfLF (local-2026-11-11, lane sketchfix): Repair Sketch closes a gap the way SolidWorks does (two lines meet where
  // they cross, a line and an arc meet on the arc, a held end stays and the other end comes to it, collinear overlaps
  // merge, zero-length entities go, relations and dimensions kept, a repair that would over-define is skipped and
  // listed); Check Sketch for Feature has SolidWorks' Feature usage list and Contour type; the CommandManager keeps one
  // height on every tab and document; menus taller than the window scroll (wheel and arrows), submenus flip
  function rfLFRow(menu, text) {
    var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === menu; })[0];
    assert(li, 'menu ' + menu);
    li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
    var row = Array.prototype.filter.call(D.querySelectorAll('body > .menu .mi'), function (r) { return r.textContent.indexOf(text) >= 0; })[0];
    assert(row, 'row "' + text + '" in ' + menu);
    return row;
  }
  function rfLFLabels() { return Array.prototype.map.call(D.querySelectorAll('#pm label'), function (l) { return l.textContent.trim(); }); }
  function rfLFRels(f) { return (f.rels || []).map(function (r) { return r.type + ':' + r.refs.slice().sort().join(','); }); }
  // a new inch part with a Front sketch holding these entities / relations / dimensions
  async function rfLFSketch(ents, rels, dims) {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");'); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    if (rels) f.rels = rels;
    if (dims) f.dims = dims;
    UI.updateSketches(); UI.zoomToFit(); await wait(40);
    return f;
  }
  async function rfLFRepairByMenu() {
    var row = rfLFRow('Tools', 'Sketch Tools ▸ Repair Sketch');
    row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
    await wait(30);
    assert(UI.pmTitle() === 'Repair Sketch', 'PM ' + UI.pmTitle());
  }
  function rfLFDir(e) { var L = Math.hypot(e.x2 - e.x1, e.y2 - e.y1); return [(e.x2 - e.x1) / L, (e.y2 - e.y1) / L]; }
  function rfLFFrame(w, h, fn) {
    var f = document.getElementById('app'), old = [f.style.width, f.style.minWidth, f.style.height, f.style.minHeight];
    f.style.minWidth = '0'; f.style.minHeight = '0'; f.style.width = w + 'px'; f.style.height = h + 'px'; void f.offsetWidth;
    return (async function () {
      await wait(60); UI.fitWorkspace(); UI.refreshRibbon(); await wait(60);
      try { return await fn(); }
      finally { f.style.width = old[0]; f.style.minWidth = old[1]; f.style.height = old[2]; f.style.minHeight = old[3]; void f.offsetWidth; await wait(60); UI.fitWorkspace(); UI.refreshRibbon(); }
    })();
  }

  step('rfLF: Repair Sketch on a .0007 gap between a dimensioned horizontal line and a vertical line: the dimensioned end stays, the vertical line comes to it and stays vertical, the 3.000 dimension and every relation are kept, one undo step (it moved both ends to the middle and tilted both lines)', async function () {
    var f = await rfLFSketch([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }, { t: 'line', x1: 3.0006, y1: 0.0004, x2: 3.0006, y2: 2 }],
      [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'coincident', refs: ['0.p1', 'O'] }], [{ e: 0, k: 'len', off: -0.5 }]);
    await rfLFRepairByMenu();
    var labels = rfLFLabels();
    assert(labels.indexOf('Close gaps (1)') >= 0 && labels.indexOf('Merge overlapping / duplicate entities (0)') >= 0, 'labels ' + labels.join(' | '));
    var rows = D.querySelectorAll('#pm .lf-repair');
    assert(rows.length === 1 && /Gap of .* between Line1 and Line2 closed/.test(rows[0].textContent) && !rows[0].classList.contains('lf-skip'), 'list: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    assert(D.querySelectorAll('#dim-layer .dxi-mark').length === 1, 'one green marker');
    var u0 = UI.App.undo.length;
    await pmAccept();
    f = UI.activeSketchFeature();
    var a = f.entities[0], b = f.entities[1];
    near(a.x1, 0, 1e-12, 'Line1 start'); near(a.x2, 3, 1e-9, 'Line1 end stays (dimensioned)'); near(a.y2, 0, 1e-9, 'Line1 level');
    near(b.x1, 3, 1e-9, 'Line2 came to it'); near(b.y1, 0, 1e-9, 'Line2 bottom'); near(b.x2, 3, 1e-9, 'Line2 still vertical'); near(b.y2, 2, 1e-3, 'Line2 top');
    assert(f.dims && f.dims.length === 1 && f.dims[0].e === 0, 'dimension kept');
    var rels = rfLFRels(f);
    assert(['horizontal:0', 'vertical:1', 'coincident:0.p1,O', 'coincident:0.p2,1.p1'].every(function (r) { return rels.indexOf(r) >= 0; }), 'relations ' + rels.join(' '));
    assert(W.SketchSolver.analyze(f).status !== 'over', 'not over defined');
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    UI.undo(); await idle();
    near(UI.activeSketchFeature().entities[1].x1, 3.0006, 1e-12, 'undo puts the gap back');
    await UI.exitSketch(true); await idle();
  });

  step('rfLF: Repair Sketch where nothing is held: two slanted lines meet where they cross (each keeps its direction), a line meets an arc on the arc (centre and radius kept)', async function () {
    var f = await rfLFSketch([
      { t: 'line', x1: 0, y1: 0, x2: 2, y2: 1 }, { t: 'line', x1: 2.0005, y1: 0.9996, x2: 3, y2: -1 },
      { t: 'arc', cx: 6, cy: 0, r: 2, a0: 0, a1: 90 }, { t: 'line', x1: 9, y1: 0.0004, x2: 8.0004, y2: 0.0004 }]);
    var d0 = rfLFDir(f.entities[0]), d1 = rfLFDir(f.entities[1]);
    await rfLFRepairByMenu();
    assert(rfLFLabels().indexOf('Close gaps (2)') >= 0, 'labels ' + rfLFLabels().join(' | '));
    await pmAccept();
    f = UI.activeSketchFeature();
    var a = f.entities[0], b = f.entities[1], arc = f.entities[2], l = f.entities[3];
    near(a.x2, b.x1, 1e-9, 'lines meet (x)'); near(a.y2, b.y1, 1e-9, 'lines meet (y)');
    var n0 = rfLFDir(a), n1 = rfLFDir(b);
    near(n0[0] * d0[1] - n0[1] * d0[0], 0, 1e-12, 'Line1 keeps its direction'); near(n1[0] * d1[1] - n1[1] * d1[0], 0, 1e-12, 'Line2 keeps its direction');
    near(arc.cx, 6, 1e-12, 'arc centre x'); near(arc.cy, 0, 1e-12, 'arc centre y'); near(arc.r, 2, 1e-12, 'arc radius');
    near(Math.hypot(l.x2 - 6, l.y2), 2, 1e-9, 'the line ends on the arc'); near(l.y2, 0.0004, 1e-12, 'the line stays level');
    near(arc.cx + 2 * Math.cos(arc.a0 * Math.PI / 180), l.x2, 1e-9, 'arc end at the line end (x)'); near(2 * Math.sin(arc.a0 * Math.PI / 180), l.y2, 1e-9, 'arc end at the line end (y)');
    var rels = rfLFRels(f);
    assert(rels.indexOf('coincident:0.p2,1.p1') >= 0 && rels.indexOf('coincident:2.p1,3.p2') >= 0, 'Coincidents ' + rels.join(' '));
    await UI.exitSketch(true); await idle();
  });

  step('rfLF: Repair Sketch merges collinear overlapping lines into one (their Horizontal and the Coincident on the end that stays move to it), removes a zero-length line (its neighbours stay joined) and joins two collinear lines meeting end to end', async function () {
    var f = await rfLFSketch([
      { t: 'line', x1: 0, y1: 0, x2: 2, y2: 0 }, { t: 'line', x1: 1.5, y1: 0, x2: 4, y2: 0 }, { t: 'line', x1: 4, y1: 0, x2: 4, y2: 1 },
      { t: 'line', x1: 4, y1: 1, x2: 4, y2: 1 }, { t: 'line', x1: 4, y1: 1, x2: 3, y2: 1.5 },
      { t: 'line', x1: 0, y1: 3, x2: 1, y2: 3 }, { t: 'line', x1: 1, y1: 3, x2: 3, y2: 3 }],
      [{ type: 'horizontal', refs: ['0'] }, { type: 'horizontal', refs: ['1'] }, { type: 'coincident', refs: ['1.p2', '2.p1'] }, { type: 'vertical', refs: ['2'] },
        { type: 'coincident', refs: ['2.p2', '3.p1'] }, { type: 'coincident', refs: ['3.p2', '4.p1'] }, { type: 'coincident', refs: ['5.p2', '6.p1'] }, { type: 'horizontal', refs: ['6'] }]);
    await rfLFRepairByMenu();
    var labels = rfLFLabels();
    assert(labels.indexOf('Merge overlapping / duplicate entities (1)') >= 0 && labels.indexOf('Remove zero-length / tiny entities (below tolerance) (1)') >= 0 && labels.indexOf('Join collinear lines and co-radial arcs (1)') >= 0, 'labels ' + labels.join(' | '));
    await pmAccept();
    f = UI.activeSketchFeature();
    assert(f.entities.length === 4, 'four lines left: ' + JSON.stringify(f.entities));
    var m = f.entities[0];
    near(m.x1, 0, 1e-12, 'merged start'); near(m.x2, 4, 1e-12, 'merged end'); near(m.y1, 0, 1e-12, 'merged y');
    var j = f.entities[3];
    near(Math.min(j.x1, j.x2), 0, 1e-12, 'joined start'); near(Math.max(j.x1, j.x2), 3, 1e-12, 'joined end');
    var rels = rfLFRels(f);
    assert(rels.filter(function (r) { return r === 'horizontal:0'; }).length === 1, 'one Horizontal on the merged line: ' + rels.join(' '));
    assert(rels.indexOf('coincident:0.p2,1.p1') >= 0 && rels.indexOf('vertical:1') >= 0 && rels.indexOf('coincident:1.p2,2.p1') >= 0 && rels.indexOf('horizontal:3') >= 0, 'relations ' + rels.join(' '));
    assert(W.SketchSolver.analyze(f).status !== 'over', 'not over defined');
    await UI.exitSketch(true); await idle();
  });

  step('rfLF: a repair that would over-define the sketch is skipped and listed with the reason; nothing is changed and ✓ says why', async function () {
    var f = await rfLFSketch([{ t: 'line', x1: 0, y1: 0, x2: 3, y2: 0 }, { t: 'line', x1: 3.0006, y1: 0, x2: 3.0006, y2: 2 }],
      [{ type: 'horizontal', refs: ['0'] }, { type: 'coincident', refs: ['0.p1', 'O'] }, { type: 'vertical', refs: ['1'] }, { type: 'distance', refs: ['O', '1'], v: 3.0006, dir: 'h' }, { type: 'coincident', refs: ['1.p1', '0'] }],
      [{ e: 0, k: 'len', off: -0.5 }]);
    var st0 = W.SketchSolver.analyze(f).status;
    await rfLFRepairByMenu();
    assert(rfLFLabels().indexOf('Close gaps (0)') >= 0, 'labels ' + rfLFLabels().join(' | '));
    var rows = D.querySelectorAll('#pm .lf-repair.lf-skip');
    assert(rows.length === 1 && /skipped: (it would over-define the sketch|both ends are held)/.test(rows[0].textContent), 'skipped row: ' + Array.prototype.map.call(D.querySelectorAll('#pm .lf-repair'), function (r) { return r.textContent; }).join(' | '));
    assert(D.querySelectorAll('#dim-layer .dxi-mark.skip').length === 1, 'an amber marker');
    var u0 = UI.App.undo.length;
    await UI.pmOK(); await idle();
    assert(UI.pmTitle() === 'Repair Sketch' || UI.App.undo.length === u0, 'nothing applied');
    f = UI.activeSketchFeature();
    near(f.entities[1].x1, 3.0006, 1e-12, 'Line2 not moved');
    assert(W.SketchSolver.analyze(f).status === st0, 'status unchanged: ' + st0);
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    await UI.exitSketch(true); await idle();
  });

  step('rfLF: Check Sketch for Feature on a Base Flange\'s sketch starts on Feature usage Base Flange with its Contour type; Edge Flange profile says the closed contour is wrong and a click on the message selects its entities; Sketched Bend wants lines; General finds nothing', async function () {
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.sheet(0.06, 0.06, 0.5);\np.sketch("Top").rect(0, -4, 6, 4).line(1, -2, 5, -2).end().baseFlange();'); await idle();
    var sk = UI.App.model.features.filter(function (x) { return x.type === 'sketch'; })[0];
    UI.enterSketch(sk.id); await idle();
    assert(UI.App.mode === 'sketch', 'editing the sketch');
    UI.activeSketchFeature().entities[1].construction = true;   // the inner line as construction: one closed contour
    var row = rfLFRow('Tools', 'Sketch Tools ▸ Check Sketch for Feature');
    row.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 })); await wait(30);
    assert(UI.pmTitle() === 'Check Sketch for Feature', 'PM ' + UI.pmTitle());
    var sel = pmField('Feature usage');
    assert(sel && sel.tagName === 'SELECT' && sel.value === 'baseFlange', 'Feature usage: ' + (sel && sel.value));
    var opts = Array.prototype.map.call(sel.options, function (o) { return o.textContent; });
    ['Base / Boss Extrude', 'Cut Extrude', 'Revolve / Cut Revolve', 'Sweep section', 'Sweep path', 'Loft section', 'Rib', 'Base Flange', 'Edge Flange profile', 'Miter Flange profile', 'Sketched Bend', 'Lofted-Bend profile', 'Hem / Jog line', 'Vent'].forEach(function (t) { assert(opts.indexOf(t) >= 0, 'usage ' + t + ' in ' + opts.join(', ')); });
    var ct = D.querySelector('#pm .pm-row-static .static');
    assert(ct && /Single open contour, or disjoint \/ nested closed contours/.test(ct.textContent), 'Contour type: ' + (ct && ct.textContent));
    assert(/No problems found/.test(D.querySelector('#pm .pm-msg').textContent), 'Base Flange: ' + D.querySelector('#pm .pm-msg').textContent);
    setInput(sel, 'edgeFlange'); await wait(30);
    var rows = D.querySelectorAll('#pm [data-lfi]');
    assert(rows.length === 1 && /1 closed contour\. Edge Flange profile needs: single open contour\./.test(rows[0].textContent), 'Edge Flange: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    assert(/Single open contour/.test(D.querySelector('#pm .pm-row-static .static').textContent), 'Contour type follows');
    rows[0].click(); await wait(30);
    var picked = UI.selection().filter(function (s) { return s.kind === 'entity'; }).map(function (s) { return s.index; });
    assert(picked.join() === '0', 'the rectangle highlighted: ' + picked.join());
    assert(/1 of 1: 1 closed contour/.test(statusText()), 'status ' + statusText());
    setInput(pmField('Feature usage'), 'sketchedBend'); await wait(30);
    rows = D.querySelectorAll('#pm [data-lfi]');
    assert(Array.prototype.some.call(rows, function (r) { return /Rectangle1 is not a line/.test(r.textContent); }), 'Sketched Bend: ' + Array.prototype.map.call(rows, function (r) { return r.textContent; }).join(' | '));
    setInput(pmField('Feature usage'), 'general'); await wait(30);
    assert(!D.querySelectorAll('#pm [data-lfi]').length && /No problems found/.test(D.querySelector('#pm .pm-msg').textContent), 'General: ' + D.querySelector('#pm .pm-msg').textContent);
    UI.pmCancel();
    await UI.exitSketch(true); await idle();
  });

  step('rfLF: the CommandManager is 117 + 22 + 1 px (the measured SolidWorks size, lane swribbon; was 76.28 + 22) on every tab of a part, a drawing and an assembly at 1366 and 1024 px (the Assembly tab grew 13 px on Linear Component Pattern, Transform and View 14 px for their captions)', async function () {
    var bad = [];
    async function tabs(doc) {
      var names = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return !t.classList.contains('off'); }).map(function (t) { return t.textContent; });
      for (var i = 0; i < names.length; i++) {
        UI.setRibbonTab(names[i]); await wait(40);
        if (UI.transformCaptions) UI.transformCaptions();
        var h = $('ribbon-buttons').getBoundingClientRect().height, rh = $('ribbon').getBoundingClientRect().height;
        if (Math.abs(h - 117) > 0.02 || Math.abs(rh - 140) > 0.02) bad.push(doc + '/' + names[i] + ' ' + h.toFixed(2) + ' / ' + rh.toFixed(2));
        Array.prototype.forEach.call(D.querySelectorAll('#ribbon .rb-caption'), function (c) { if (c.getBoundingClientRect().bottom > $('ribbon-buttons').getBoundingClientRect().bottom + 0.5) bad.push(doc + '/' + names[i] + ' caption ' + c.textContent + ' below the buttons'); });
      }
    }
    async function all() {
      await anvil.newPart(); await idle();
      await tabs('part');
      await anvil.run('p.units("in");\np.sketch("Front").rect(0, 0, 2, 1).end().extrude(1);'); await idle();
      anvil.drawing.make(); await wait(300); await idle();
      await tabs('drawing');
      await anvil.newAssembly('rfLF'); await idle();
      UI.setRibbonTab('Assembly'); await wait(40);
      var lp = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return /Linear Component/.test(b.getAttribute('aria-label') || ''); })[0];
      if (lp && lp.offsetHeight) { var sp = lp.querySelector('span'); if (sp.offsetHeight > 39.5) bad.push('Linear Component Pattern label ' + sp.offsetHeight + ' px'); }
      await tabs('assembly');
      await anvil.newPart(); await idle();
    }
    await rfLFFrame(1366, 768, all);
    await rfLFFrame(1024, 600, all);
    assert(!bad.length, bad.join(' | '));
  });

  step('rfLF: at 1024 x 600 the Tools menu scrolls: SolidWorks\' arrows at the top and bottom (the top one greyed), the wheel and a press on the down arrow reach the last row; a context menu\'s submenu by the right edge opens to the left and one taller than the window scrolls', async function () {
    await anvil.newPart(); await idle();
    await rfLFFrame(1024, 600, async function () {
      var li = Array.prototype.filter.call(D.querySelectorAll('#menus > li'), function (l) { return l.textContent === 'Tools'; })[0];
      li.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      var m = D.querySelector('body > .menu');
      assert(m && m.classList.contains('menu-scroll'), 'Tools scrolls');
      var r = m.getBoundingClientRect();
      assert(r.bottom <= W.innerHeight + 0.5 && r.top >= 0, 'inside the window: ' + r.top + '..' + r.bottom + ' of ' + W.innerHeight);
      var up = m.querySelector('.mi-scroll-up'), down = m.querySelector('.mi-scroll-down');
      assert(up && down && up.classList.contains('off') && !down.classList.contains('off'), 'arrows');
      down.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
      down.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, cancelable: true, button: 0 }));
      down.dispatchEvent(new W.MouseEvent('mouseleave', { bubbles: false }));
      assert(m.scrollTop > 0 && !up.classList.contains('off'), 'the down arrow scrolls: ' + m.scrollTop);
      assert(D.querySelector('body > .menu') === m, 'the menu stays open');
      m.dispatchEvent(new W.WheelEvent('wheel', { deltaY: 100000, bubbles: true, cancelable: true }));
      await wait(20);
      assert(down.classList.contains('off'), 'the wheel reaches the end');
      var rows = m.querySelectorAll('.mi'), last = rows[rows.length - 1], lr = last.getBoundingClientRect();
      var hit = D.elementFromPoint(lr.left + 40, (lr.top + lr.bottom) / 2);
      assert(hit && last.contains(hit), 'the last row (' + last.textContent + ') can be reached: ' + (hit && hit.className));
      UI.closeMenus();
      // a context menu at the right edge with a submenu
      var many = []; for (var i = 0; i < 60; i++) many.push({ label: 'Item ' + i, action: function () { } });
      UI.showMenu(W.innerWidth - 30, 200, [{ label: 'Short', items: [{ label: 'One', action: function () { } }, { label: 'Two', action: function () { } }] }, { label: 'Long', items: many }]);
      var cm = D.querySelector('body > .menu'), rowsC = cm.querySelectorAll(':scope > .mi');
      rowsC[0].dispatchEvent(new W.MouseEvent('mouseenter'));
      var sub = cm.querySelector('.menu-sub'), cr = cm.getBoundingClientRect(), sr = sub.getBoundingClientRect();
      assert(sub && sr.right <= cr.left + 3 && sr.left >= 0, 'the submenu flips left: ' + sr.left + '..' + sr.right + ' menu ' + cr.left);
      assert(rowsC[0].classList.contains('open') && /▸/.test(rowsC[0].textContent), 'its row is lit with ▸');
      rowsC[1].dispatchEvent(new W.MouseEvent('mouseenter'));
      sub = cm.querySelector('.menu-sub'); sr = sub.getBoundingClientRect();
      assert(cm.querySelectorAll('.menu-sub').length === 1 && sub.classList.contains('menu-scroll') && sr.top >= 0 && sr.bottom <= W.innerHeight + 0.5, 'the long submenu scrolls inside the window: ' + sr.top + '..' + sr.bottom);
      var ran = false;
      many[59].action = function () { ran = true; };
      sub.scrollTop = sub.scrollHeight;
      var subRows = sub.querySelectorAll('.mi');
      subRows[subRows.length - 1].click();
      assert(ran && !D.querySelector('body > .menu'), 'its last row runs and the menus close');
    });
  });
