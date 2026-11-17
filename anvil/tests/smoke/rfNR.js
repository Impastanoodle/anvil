  // --- rfNR (2026-11-16, lane treeorder): reorder features by dragging their rows in the FeatureManager tree, as
  // SolidWorks. Real mouse events: press on a row, move past 5 px, release between two rows. A drop above a parent or
  // below a child is refused with a status line; a feature moves with its absorbed sketch; one undo step; Save / Open
  // keeps the order; sheet parts keep Sheet-Metal first and Flat-Pattern last; the rollback bar, clicks and the
  // right-click menu are unchanged.
  var rfNRPart = 'p.units("mm");\np.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
    'p.fillet(5, [[0, 0, 10]]);\n' +
    'p.sketch("Front", 20).rect(40, 20, 20, 20).end().cut(5);';
  var rfNRSheet = 'p.sheet(2, 2, 0.71);\np.sketch("Top").rect(0, -60, 100, 60).end().baseFlange(2);\n' +
    'p.flange(20, [[0, 2, 30]]);\np.flange(20, [[100, 2, 30]]);';
  function rfNRVol() { return K.massProps(UI.App.mesh).volume; }
  function rfNRNear(a, b, label) { assert(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), label + ': volume ' + a + ', expected ' + b); }
  function rfNRKind(type, k) { return UI.App.model.features.filter(function (f) { return f.type === type; })[k || 0]; }
  function rfNRCut() { return UI.App.model.features.filter(function (f) { return f.type === 'extrude' && f.cut; })[0]; }
  function rfNRRow(f) { return D.querySelector('#tree .ti[data-fid="' + f.id + '"]'); }
  function rfNRIdx(f) { return UI.App.model.features.indexOf(K.findFeature(UI.App.model, f.id)); }
  function rfNRNames() { return UI.App.model.features.map(function (f) { return f.name; }).join(', '); }
  function rfNRMouse(type, x, y, target, button) {
    var t = target || D.elementFromPoint(x, y) || D.body;
    t.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, clientX: x, clientY: y, button: button || 0, buttons: type === 'mouseup' ? 0 : 1 }));
  }
  // press on the row of f, move in steps to y, release (hold: keep the button down)
  async function rfNRDrag(f, y, hold) {
    var row = rfNRRow(f);
    assert(row, 'tree row of ' + f.name);
    if (row.scrollIntoView) row.scrollIntoView({ block: 'center' });
    if (typeof y === 'function') y = y();
    var r = row.getBoundingClientRect(), x = r.left + 50, y0 = r.top + r.height / 2;
    rfNRMouse('mousedown', x, y0, row);
    for (var k = 1; k <= 6; k++) rfNRMouse('mousemove', x, y0 + (y - y0) * k / 6);
    if (hold) return;
    rfNRMouse('mouseup', x, y);
    await idle(); await wait(20); await idle();
  }
  // just above the top edge of a top-level row: a drop between it and the row above
  function rfNRAbove(f) { var r = rfNRRow(f); assert(r, 'tree row of ' + f.name); return r.getBoundingClientRect().top + 2; }
  function rfNRBottom() { var y = 0; D.querySelectorAll('#tree > .ti, #tree > .tc').forEach(function (r) { y = Math.max(y, r.getBoundingClientRect().bottom); }); return y + 4; }
  async function rfNROpen(code) {
    if (UI.clearTreeFilter) UI.clearTreeFilter();
    await anvil.newPart(); await idle();
    await anvil.run(code || rfNRPart); await idle();
    UI.setFmTab('tree'); UI.refreshTree();
  }

  step('rfNR: drag a Cut above a Fillet: it moves with its sketch, one rebuild, one undo step, the selection stays; the volume is the same; undo puts it back', async function () {
    await rfNROpen();
    var cut = rfNRCut(), fil = rfNRKind('fillet'), sk = K.findFeature(UI.App.model, cut.sketch), v0 = rfNRVol();
    assert(rfNRIdx(cut) > rfNRIdx(fil), 'the cut starts below the fillet: ' + rfNRNames());
    UI.App.sel = { kind: 'feature', id: cut.id }; UI.refreshTree();
    var undo0 = UI.App.undo.length, order0 = rfNRNames();
    // while held: a drop line, the arrow cursor, the dragged row dimmed
    await rfNRDrag(cut, function () { return rfNRAbove(fil); }, true);
    var line = D.querySelector('.tree-drop-line');
    assert(line && line.style.display === 'block', 'a drop line shows');
    assert(Math.abs(line.getBoundingClientRect().top - rfNRRow(fil).getBoundingClientRect().top) <= 2, 'the line is at the top of the fillet row');
    assert(!D.body.classList.contains('tree-reorder-no'), 'the drop is allowed');
    assert(/Move Cut-Extrude1 above Fillet1/.test(statusText()) || /Move .* above /.test(statusText()), 'the status says the move: ' + statusText());
    var r = rfNRRow(fil).getBoundingClientRect();
    rfNRMouse('mouseup', r.left + 50, r.top + 2);
    await idle(); await wait(20); await idle();
    assert(!D.querySelector('.tree-drop-line') && !D.body.classList.contains('tree-reordering'), 'the drag ended');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    assert(rfNRIdx(cut) < rfNRIdx(fil) && rfNRIdx(sk) === rfNRIdx(cut) - 1, 'cut and its sketch above the fillet: ' + rfNRNames());
    assert(UI.App.sel && UI.App.sel.id === cut.id && rfNRRow(cut).classList.contains('selected'), 'the cut is still selected');
    assert(!sk || !D.querySelector('#tree > .ti[data-fid="' + sk.id + '"]'), 'the sketch is still under its feature');
    rfNRNear(rfNRVol(), v0, 'after the move');
    assert(/Moved .* above Fillet1/.test(statusText()), 'status: ' + statusText());
    await UI.undoCommand(); await idle();
    assert(rfNRNames() === order0, 'undo restored the order: ' + rfNRNames());
    rfNRNear(rfNRVol(), v0, 'after undo');
    // and back by dragging: the cut to the end
    await rfNRDrag(K.findFeature(UI.App.model, cut.id), function () { return rfNRAbove(fil); });
    await rfNRDrag(rfNRCut(), function () { return rfNRBottom(); });
    assert(rfNRNames() === order0, 'dragged back to the end: ' + rfNRNames());
    rfNRNear(rfNRVol(), v0, 'dragged back');
    return 'volume ' + v0.toFixed(3) + ', order ' + order0;
  });

  step('rfNR: refused moves: a Fillet above the boss it rounds, the boss below the fillet, a sketch below its feature, anything above the origin and planes; the pointer shows not-allowed and nothing changes', async function () {
    await rfNROpen();
    var boss = rfNRKind('extrude', 0), fil = rfNRKind('fillet'), cut = rfNRCut(), order0 = rfNRNames(), undo0 = UI.App.undo.length;
    await rfNRDrag(fil, function () { return rfNRAbove(boss); }, true);
    assert(D.body.classList.contains('tree-reorder-no'), 'not-allowed cursor over the boss');
    assert(D.querySelector('.tree-drop-line').style.display === 'none', 'no drop line where the drop is refused');
    var r = rfNRRow(boss).getBoundingClientRect();
    rfNRMouse('mouseup', r.left + 50, r.top + 2);
    await idle();
    assert(/Cannot move Fillet1 above Boss-Extrude1, which it is built on/.test(statusText()), 'status: ' + statusText());
    assert(rfNRNames() === order0 && UI.App.undo.length === undo0, 'nothing moved');
    await rfNRDrag(boss, function () { return rfNRAbove(cut); });
    assert(/Cannot move Boss-Extrude1 below Fillet1, which is built on it/.test(statusText()), 'status: ' + statusText());
    assert(rfNRNames() === order0, 'nothing moved');
    // the cut's sketch (in the cut's folder) dragged alone below its cut
    var sk = K.findFeature(UI.App.model, cut.sketch);
    UI.App.sel = { kind: 'feature', id: cut.id }; UI.refreshTree();
    var tw = rfNRRow(cut).querySelector('.tw');
    tw.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W }));
    await idle();
    assert(rfNRRow(sk) && rfNRRow(sk).getClientRects().length, 'the cut\'s folder is open');
    await rfNRDrag(sk, function () { return rfNRBottom(); });
    assert(new RegExp('Cannot move ' + sk.name + ' below Cut-Extrude1, which is built on it').test(statusText()), 'status: ' + statusText());
    assert(rfNRNames() === order0, 'nothing moved');
    // above the origin and planes
    var origin = Array.prototype.filter.call(D.querySelectorAll('#tree > .ti'), function (t) { return /Origin/.test(t.textContent); })[0];
    await rfNRDrag(cut, function () { return origin.getBoundingClientRect().top + 4; });
    assert(/above the origin and the planes/.test(statusText()), 'status: ' + statusText());
    assert(rfNRNames() === order0 && UI.App.undo.length === undo0, 'nothing moved, no undo step');
    // Esc while dragging cancels
    await rfNRDrag(cut, function () { return rfNRAbove(fil); }, true);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    rfNRMouse('mouseup', 10, 10, D.body);
    await idle();
    assert(rfNRNames() === order0 && !D.body.classList.contains('tree-reordering'), 'Esc cancelled');
    return 'refused 4 ways';
  });

  step('rfNR: Save / Open keeps the new order; a move that makes a later feature fail is allowed and marks it', async function () {
    await rfNROpen();
    var cut = rfNRCut(), fil = rfNRKind('fillet'), v0 = rfNRVol();
    await rfNRDrag(cut, function () { return rfNRAbove(fil); });
    var order = rfNRNames(), saved = JSON.stringify(anvil.model());
    await anvil.newPart(); await idle();
    await anvil.load(saved); await idle(); UI.refreshTree();
    assert(rfNRNames() === order, 'the order came back: ' + rfNRNames());
    rfNRNear(rfNRVol(), v0, 'reopened');
    // a hole (sketch on Top) placed in the corner the fillet rounds, built before the fillet: the fillet's edge is gone
    await rfNROpen('p.units("mm");\np.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
      'p.fillet(5, [[0, 0, 10]]);\n' +
      'p.sketch("Front", 20).rect(-5, -5, 15, 15).end().cut(30);');
    var c2 = rfNRCut(), f2 = rfNRKind('fillet');
    assert(!(UI.App.build.errors || {})[f2.id], 'the fillet builds first');
    await rfNRDrag(c2, function () { return rfNRAbove(f2); });
    assert(rfNRIdx(c2) < rfNRIdx(f2), 'the move was allowed: ' + rfNRNames() + ' / ' + statusText());
    var err = (UI.App.build.errors || {})[f2.id] || (UI.App.build.warnings || {})[f2.id];
    if (err) assert(rfNRRow(f2).classList.contains('err') || rfNRRow(f2).classList.contains('warn'), 'the failed fillet is marked in the tree');
    await UI.undoCommand(); await idle();
    assert(!(UI.App.build.errors || {})[f2.id], 'undo: the fillet builds again');
    return 'order ' + order + '; fillet after the corner cut: ' + (err ? 'error "' + err + '"' : 'still builds');
  });

  step('rfNR: sheet metal: an Edge-Flange moves above another one; never above Base-Flange1 (it is built on it) or Sheet-Metal; the end of the tree is above Flat-Pattern', async function () {
    await rfNROpen(rfNRSheet);
    var fl = UI.App.model.features.filter(function (f) { return f.type === 'flange'; }), base = UI.App.model.features.filter(function (f) { return f.sheetBase; })[0];
    assert(fl.length === 2 && base, 'base and two flanges: ' + rfNRNames());
    var v0 = rfNRVol(), undo0 = UI.App.undo.length;
    await rfNRDrag(fl[1], function () { return rfNRAbove(fl[0]); });
    assert(rfNRIdx(fl[1]) < rfNRIdx(fl[0]), 'the second flange moved up: ' + rfNRNames() + ' / ' + statusText());
    rfNRNear(rfNRVol(), v0, 'flanges swapped');
    assert(!(UI.App.build.errors || {})[fl[0].id] && !(UI.App.build.errors || {})[fl[1].id], 'both flanges build');
    var order = rfNRNames();
    await rfNRDrag(fl[0], function () { return rfNRAbove(base); });
    assert(new RegExp('Cannot move ' + fl[0].name + ' above ' + base.name + ', which it is built on').test(statusText()), 'status: ' + statusText());
    assert(rfNRNames() === order, 'nothing moved');
    // a cut that needs nothing of the base flange still may not go above Sheet-Metal
    await anvil.append('p.sketch("Top").circle(50, -30, 5).end().cut(10);'); await idle(); UI.refreshTree();
    var cut = rfNRCut(), order2 = rfNRNames(), undo1 = UI.App.undo.length;
    await rfNRDrag(cut, function () { return rfNRAbove(base); });
    assert(/above Sheet-Metal/.test(statusText()), 'status: ' + statusText());
    assert(rfNRNames() === order2 && UI.App.undo.length === undo1, 'nothing moved');
    // the end of the tree, below the Flat-Pattern folder: the flange goes last, the folder stays last
    await rfNRDrag(fl[1], function () { return rfNRBottom(); });
    var fs = UI.App.model.features;
    assert(fs[fs.length - 1].id === fl[1].id, 'the flange is the last feature: ' + rfNRNames());
    var tops = Array.prototype.filter.call(D.querySelectorAll('#tree > .ti'), function (t) { return t.classList.contains('fp-folder') || t.hasAttribute('data-fid'); });
    assert(tops[tops.length - 1].classList.contains('fp-folder'), 'Flat-Pattern is still the last folder');
    assert(UI.App.undo.length >= undo0 + 2, 'an undo step per move');
    return 'flanges swapped, ' + fs.length + ' features';
  });

  step('rfNR: the rollback bar still drags; a rolled-back feature and a drop below the bar are refused; a plain click selects, a double-click edits, the right-click menu opens, a tiny move is still a click', async function () {
    await rfNROpen();
    var cut = rfNRCut(), fil = rfNRKind('fillet'), boss = rfNRKind('extrude', 0), order0 = rfNRNames();
    // the bar: drag it above the cut (as rfGQ)
    var bar = D.querySelector('#tree > .rollbar'), br = bar.getBoundingClientRect(), x = br.left + 20, y0 = br.top + br.height / 2, y = rfNRAbove(cut);
    rfNRMouse('mousedown', x, y0, bar);
    for (var k = 1; k <= 6; k++) rfNRMouse('mousemove', x, y0 + (y - y0) * k / 6);
    rfNRMouse('mouseup', x, y);
    await idle(); await wait(20); await idle();
    assert(UI.rollbarRolled(cut), 'the bar rolled the cut back');
    await rfNRDrag(cut, function () { return rfNRAbove(fil); });
    assert(/Roll forward before moving/.test(statusText()), 'a rolled feature does not move: ' + statusText());
    await rfNRDrag(fil, function () { return rfNRBottom(); });
    assert(/below the rollback bar/.test(statusText()), 'no drop below the bar: ' + statusText());
    assert(rfNRNames() === order0, 'nothing moved');
    await UI.rollbarEnd(); await idle();
    // a plain click selects, nothing moves
    var undo0 = UI.App.undo.length, r = rfNRRow(boss).getBoundingClientRect(), o = { bubbles: true, cancelable: true, view: W, clientX: r.left + 50, clientY: r.top + 8, button: 0, detail: 1 };
    var nm = rfNRRow(boss).querySelector('.nm');
    nm.dispatchEvent(new W.MouseEvent('mousedown', o)); rfNRMouse('mousemove', r.left + 52, r.top + 9); nm.dispatchEvent(new W.MouseEvent('mouseup', o)); nm.dispatchEvent(new W.MouseEvent('click', o));
    await idle();
    assert(UI.App.sel && UI.App.sel.kind === 'feature' && UI.App.sel.id === boss.id, 'the click selected the boss');
    assert(rfNRNames() === order0 && UI.App.undo.length === undo0, 'a click (with a 2 px wobble) moved nothing');
    // double-click edits
    rfNRRow(boss).dispatchEvent(new W.MouseEvent('dblclick', o));
    await idle();
    assert(UI.hasPM(), 'the double-click opened the PropertyManager');
    UI.pmCancel(); await idle(); await wait(50); await idle();
    // with a PropertyManager open a drag does nothing
    UI.cmdPlane(); await idle(); await wait(50); await idle();
    assert(UI.hasPM(), 'a command is open');
    UI.setFmTab('tree'); UI.refreshTree();
    await rfNRDrag(rfNRCut(), function () { return rfNRAbove(rfNRKind('fillet')); }, true);
    var st = statusText();
    rfNRMouse('mouseup', 10, 10, D.body); await idle();
    assert(/Close the open command/.test(st) && rfNRNames() === order0, 'no move with a command open: ' + st);
    UI.pmCancel(); await idle();
    // the right-click menu
    r = rfNRRow(fil).getBoundingClientRect();
    rfNRRow(fil).dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, clientX: r.left + 30, clientY: r.top + 4, button: 2 }));
    var rows = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent; }).join(' | ');
    assert(/Edit Feature/.test(rows) && /Rename tree item/.test(rows), 'the feature menu opened: ' + rows);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    D.body.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, view: W, clientX: 5, clientY: 5 }));
    await idle();
    return 'ok';
  });

  step('rfNR: UI.reorderFeature(id, beforeId) is the drop for scripts: refuses with the same message, moves with one undo step', async function () {
    await rfNROpen();
    var cut = rfNRCut(), fil = rfNRKind('fillet'), boss = rfNRKind('extrude', 0), v0 = rfNRVol(), undo0 = UI.App.undo.length;
    assert(UI.reorderFeature(fil.id, K.findFeature(UI.App.model, boss.sketch).id) === false, 'refused');
    assert(/Cannot move Fillet1 above Boss-Extrude1/.test(statusText()), statusText());
    await UI.reorderFeature(cut.id, fil.id); await idle();
    assert(rfNRIdx(cut) < rfNRIdx(fil) && UI.App.undo.length === undo0 + 1, 'moved: ' + rfNRNames());
    rfNRNear(rfNRVol(), v0, 'scripted move');
    return 'ok';
  });

  // --- rfNR2 (2026-11-16, follow-up): reordering while rolled back, the filter box, folders
  var rfNRPart4 = 'p.units("mm");\np.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
    'p.fillet(5, [[0, 0, 10]]);\n' +
    'p.sketch("Front", 20).rect(40, 20, 20, 20).end().cut(5);\n' +
    'p.sketch("Front", 20).rect(70, 20, 10, 10).end().cut(5);';
  function rfNRCuts() { return UI.App.model.features.filter(function (f) { return f.type === 'extrude' && f.cut; }); }
  function rfNRFolderRow(name) { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti.fold-row'), function (r) { return r.querySelector('.nm') && r.querySelector('.nm').textContent === name; })[0] || null; }
  async function rfNRMenuOn(el, label) {
    assert(el, 'row to right-click for ' + label);
    var r = el.getBoundingClientRect();
    el.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, clientX: r.left + 30, clientY: r.top + 4, button: 2 }));
    var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { var s = m.querySelector('span:not(.chk):not(.key)'); return s && s.textContent === label; })[0];
    assert(mi, 'menu row "' + label + '" (have: ' + rows.map(function (m) { return m.textContent; }).join(' | ') + ')');
    var o = { bubbles: true, cancelable: true, view: W, clientX: r.left + 40, clientY: r.top + 10, button: 0, detail: 1 };
    mi.dispatchEvent(new W.MouseEvent('mousedown', o)); mi.dispatchEvent(new W.MouseEvent('mouseup', o)); mi.dispatchEvent(new W.MouseEvent('click', o));
    await idle(); await wait(20); await idle();
  }
  function rfNRFilter(text) { var i = $('tree-filter-input'); i.value = text; i.dispatchEvent(new W.Event('input', { bubbles: true })); }
  function rfNRShownNames() { return Array.prototype.filter.call(D.querySelectorAll('#tree .ti'), function (r) { return r.getClientRects().length; }).map(function (r) { var n = r.querySelector('.nm'); return n ? n.textContent : ''; }); }
  async function rfNRModalButton(label, tick) {
    if (tick) { var box = D.getElementById(tick); assert(box, 'checkbox ' + tick); box.checked = true; }
    var b = Array.prototype.filter.call(D.querySelectorAll('#modal button'), function (x) { return x.textContent === label && x.getClientRects().length; })[0];
    assert(b, 'dialog button ' + label);
    b.click(); await idle(); await wait(20); await idle();
  }

  step('rfNR: rolled back: a feature above the bar drags to a new place like any other, the rolled-back ones stay below the bar and come back on Roll to End', async function () {
    await rfNROpen(rfNRPart4);
    var full = rfNRVol(), cuts = rfNRCuts(), fil = rfNRKind('fillet');
    await UI.rollbarTo(UI.App.model.features.indexOf(cuts[1])); await idle();
    assert(UI.rollbarRolled(cuts[1]) && !UI.rollbarRolled(cuts[0]), 'the second cut is rolled back');
    var v1 = rfNRVol(), undo0 = UI.App.undo.length;
    await rfNRDrag(cuts[0], function () { return rfNRAbove(fil); });
    assert(rfNRIdx(cuts[0]) < rfNRIdx(fil), 'the first cut moved above the fillet: ' + rfNRNames() + ' / ' + statusText());
    assert(UI.rollbarRolled(cuts[1]) && UI.App.undo.length === undo0 + 1, 'the second cut is still rolled back, one undo step');
    rfNRNear(rfNRVol(), v1, 'rolled-back part after the move');
    await rfNRDrag(rfNRKind('fillet'), function () { return rfNRAbove(K.findFeature(UI.App.model, cuts[0].id)); });
    assert(rfNRIdx(rfNRKind('fillet')) < rfNRIdx(cuts[0]), 'and back: ' + rfNRNames());
    await UI.rollbarEnd(); await idle();
    rfNRNear(rfNRVol(), full, 'rolled to the end');
    return 'ok';
  });

  step('rfNR: the filter box shows the matching features with their parents, hides the rest (planes, origin, material); the x and Esc clear it; no drag while filtered', async function () {
    await rfNROpen(rfNRPart4);
    var cut = rfNRCuts()[0], sk = K.findFeature(UI.App.model, cut.sketch);
    rfNRFilter(sk.name); await idle();
    var names = rfNRShownNames();
    assert(names.some(function (n) { return n.replace(/^\(.\) /, '') === sk.name; }) && names.indexOf(cut.name) >= 0, 'the sketch shows under its cut: ' + names.join(' | '));
    assert(names.indexOf('Boss-Extrude1') < 0 && names.indexOf('Front Plane') < 0 && names.indexOf('Origin') < 0 && names.indexOf('Fillet1') < 0, 'the rest is hidden: ' + names.join(' | '));
    var x = D.querySelector('.tree-filter-clear');
    assert(x && !x.hidden && x.getClientRects().length, 'the x shows');
    await rfNRDrag(cut, function () { return rfNRRow(cut).getBoundingClientRect().top - 30; });
    assert(/Clear the filter/.test(statusText()), 'no drag while filtered: ' + statusText());
    $('tree-filter-input').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await idle();
    assert(!$('tree-filter-input').value && x.hidden && rfNRShownNames().indexOf('Origin') >= 0 && rfNRShownNames().indexOf('Boss-Extrude1') >= 0, 'Esc cleared it');
    rfNRFilter('plane'); await idle();
    names = rfNRShownNames();
    assert(['Front Plane', 'Top Plane', 'Right Plane'].every(function (n) { return names.indexOf(n) >= 0; }) && names.indexOf('Boss-Extrude1') < 0, 'planes match: ' + names.join(' | '));
    x.click(); await idle();
    assert(!$('tree-filter-input').value && rfNRShownNames().indexOf('Fillet1') >= 0, 'the x cleared it');
    return 'ok';
  });

  step('rfNR: Add to New Folder on two selected neighbours, rename, collapse; drag a feature onto the folder (in), above it (out), a member to the end (out); Save / Open keeps it', async function () {
    await rfNROpen(rfNRPart4);
    var v0 = rfNRVol(), cuts = rfNRCuts(), fil = rfNRKind('fillet');
    UI.setSelection([{ kind: 'feature', id: fil.id }, { kind: 'feature', id: cuts[0].id }]);
    await rfNRMenuOn(rfNRRow(fil), 'Add to New Folder');
    var inp = D.querySelector('#tree input.ti-rename');
    assert(inp && inp.value === 'Folder1', 'the new folder\'s name is being edited');
    inp.value = 'Pockets';
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await idle();
    var fo = (UI.App.model.treeFolders || [])[0];
    assert(fo && fo.name === 'Pockets' && fo.ids.length === 2, 'a folder with two features: ' + JSON.stringify(UI.App.model.treeFolders));
    var row = rfNRFolderRow('Pockets'), box = row && row.nextElementSibling;
    assert(row && box && box.classList.contains('fold-box') && box.querySelector('.ti[data-fid="' + fil.id + '"]') && box.querySelector('.ti[data-fid="' + cuts[0].id + '"]'), 'both rows are in the folder');
    row.querySelector('.tw').dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W })); await idle();
    assert(!rfNRRow(fil).getClientRects().length, 'collapsed');
    rfNRFolderRow('Pockets').querySelector('.tw').dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W })); await idle();
    assert(rfNRRow(fil).getClientRects().length, 'expanded');
    // the second cut dropped onto the folder row goes in at its end
    await rfNRDrag(cuts[1], function () { var r = rfNRFolderRow('Pockets').getBoundingClientRect(); return r.top + r.height / 2; });
    assert(UI.App.model.treeFolders[0].ids.indexOf(cuts[1].id) >= 0, 'dropped into the folder: ' + statusText());
    assert(rfNRIdx(cuts[1]) > rfNRIdx(cuts[0]), 'at its end');
    // above the folder row: out, before the folder
    await rfNRDrag(cuts[1], function () { return rfNRFolderRow('Pockets').getBoundingClientRect().top + 2; });
    assert(UI.App.model.treeFolders[0].ids.indexOf(cuts[1].id) < 0 && rfNRIdx(cuts[1]) < rfNRIdx(fil), 'out, above the folder: ' + rfNRNames() + ' / ' + statusText());
    assert(!rfNRFolderRow('Pockets').nextElementSibling.querySelector('.ti[data-fid="' + cuts[1].id + '"]'), 'its row is outside the folder');
    // a member dragged to the end leaves the folder
    await rfNRDrag(K.findFeature(UI.App.model, cuts[0].id), function () { return rfNRBottom(); });
    assert(UI.App.model.treeFolders[0].ids.join() === String(fil.id), 'the cut left the folder: ' + JSON.stringify(UI.App.model.treeFolders));
    rfNRNear(rfNRVol(), v0, 'after the moves');
    // a refused move is refused in a folder too
    await rfNRDrag(rfNRKind('extrude', 0), function () { var r = rfNRFolderRow('Pockets').getBoundingClientRect(); return r.top + r.height / 2; });
    assert(/Cannot move Boss-Extrude1 below/.test(statusText()), 'refused: ' + statusText());
    var saved = JSON.stringify(anvil.model());
    await anvil.newPart(); await idle();
    await anvil.load(saved); await idle(); UI.refreshTree();
    assert(rfNRFolderRow('Pockets') && rfNRFolderRow('Pockets').nextElementSibling.querySelector('.ti[data-fid="' + fil.id + '"]'), 'the folder came back after Save / Open');
    rfNRNear(rfNRVol(), v0, 'reopened');
    return 'ok';
  });

  step('rfNR: a folder suppresses and unsuppresses as a unit; Delete keeps its features unless ticked; undo brings it back; features not next to each other are refused', async function () {
    await rfNROpen(rfNRPart4);
    var v0 = rfNRVol(), cuts = rfNRCuts(), fil = rfNRKind('fillet'), boss = rfNRKind('extrude', 0);
    UI.addToNewFolder([cuts[0].id, cuts[1].id]); await idle();
    var fo = UI.App.model.treeFolders[0];
    assert(fo.ids.length === 2, 'folder of the two cuts');
    await rfNRMenuOn(rfNRFolderRow(fo.name), 'Suppress');
    assert(UI.isSuppressed(cuts[0].id) && UI.isSuppressed(cuts[1].id), 'both cuts suppressed');
    assert(rfNRVol() > v0 + 1000, 'the pockets are filled: ' + rfNRVol());
    assert(rfNRFolderRow(fo.name).classList.contains('suppressed'), 'the folder row shows suppressed');
    await rfNRMenuOn(rfNRFolderRow(fo.name), 'Unsuppress');
    rfNRNear(rfNRVol(), v0, 'unsuppressed');
    await rfNRMenuOn(rfNRFolderRow(fo.name), 'Delete');
    await rfNRModalButton('Delete');
    assert(!UI.App.model.treeFolders && rfNRCuts().length === 2 && rfNRRow(cuts[0]).parentNode === D.getElementById('tree'), 'the folder is gone, the cuts stay at the top level');
    rfNRNear(rfNRVol(), v0, 'features kept');
    await UI.undoCommand(); await idle();
    assert(rfNRFolderRow(fo.name), 'undo brought the folder back');
    await rfNRMenuOn(rfNRFolderRow(fo.name), 'Delete');
    await rfNRModalButton('Delete', 'del-folder-features');
    assert(rfNRCuts().length === 0 && !UI.App.model.treeFolders, 'the cuts went with it: ' + rfNRNames());
    assert(UI.App.model.features.filter(function (f) { return f.type === 'sketch'; }).length === 1, 'their sketches too: ' + rfNRNames());
    await UI.undoCommand(); await idle();
    rfNRNear(rfNRVol(), v0, 'undo of the delete');
    // boss and the second cut are not neighbours
    UI.setSelection([{ kind: 'feature', id: boss.id }, { kind: 'feature', id: rfNRCuts()[1].id }]);
    await rfNRMenuOn(rfNRRow(boss), 'Add to New Folder');
    assert(/next to each other/.test(statusText()), 'refused: ' + statusText());
    return 'ok';
  });
  // --- rfNR3 (2026-11-17, follow-up 3): the FeatureManager audit against SolidWorks 2024: selection by mouse and keys,
  // the right-click menus, the flyout FeatureManager over the graphics area while a PropertyManager covers the tree,
  // Flat-Pattern1's children
  function rfNRKey(el, key, opts) { el.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, opts || {}))); }
  function rfNRClick(el, opts) {
    var r = el.getBoundingClientRect(), o = Object.assign({ bubbles: true, cancelable: true, view: W, clientX: r.left + 40, clientY: r.top + r.height / 2, button: 0, detail: 1 }, opts || {});
    var t = el.querySelector('.nm') || el;
    t.dispatchEvent(new W.MouseEvent('mousedown', o)); t.dispatchEvent(new W.MouseEvent('mouseup', o)); t.dispatchEvent(new W.MouseEvent('click', o));
  }
  function rfNRSelIds() { return (UI.selection ? UI.selection() : []).filter(function (s) { return s.kind === 'feature'; }).map(function (s) { return s.id; }); }
  function rfNRMenuRows(el) {
    var r = el.getBoundingClientRect();
    el.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, clientX: r.left + 30, clientY: r.top + 4, button: 2 }));
    var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')).map(function (m) { return m._menuItem; }).filter(Boolean);
    if (UI.closeMenus) UI.closeMenus();
    return rows;
  }

  step('rfNR: tree selection by mouse and keys: click, Ctrl+click, Shift+click a range (into a folder), empty space clears; the tree takes the focus, Down / Up move, Right / Left open and close, Enter edits, Esc clears', async function () {
    await rfNROpen(rfNRPart4);
    var fs = UI.App.model.features, boss = rfNRKind('extrude', 0), fil = rfNRKind('fillet'), cuts = rfNRCuts(), tree = D.getElementById('tree');
    UI.addToNewFolder([cuts[0].id, cuts[1].id]); await idle();
    rfNRClick(rfNRRow(boss)); await idle();
    assert(rfNRSelIds().join() === String(boss.id), 'click selects: ' + rfNRSelIds());
    assert(D.activeElement === tree, 'the tree has the keyboard focus');
    rfNRClick(rfNRRow(cuts[1]), { shiftKey: true }); await idle();
    var shownIds = Array.prototype.filter.call(tree.querySelectorAll('.ti[data-fid]'), function (r) { return r.getClientRects().length; }).map(function (r) { return +r.getAttribute('data-fid'); });
    var want = shownIds.slice(shownIds.indexOf(boss.id), shownIds.indexOf(cuts[1].id) + 1);
    assert(rfNRSelIds().slice().sort().join() === want.slice().sort().join() && [boss.id, fil.id, cuts[0].id, cuts[1].id].every(function (id) { return rfNRSelIds().indexOf(id) >= 0; }), 'Shift+click selected the shown rows from the boss to the second cut, into the folder: ' + rfNRSelIds() + ' / ' + want);
    var n0 = rfNRSelIds().length;
    rfNRClick(rfNRRow(fil), { ctrlKey: true }); await idle();
    assert(rfNRSelIds().indexOf(fil.id) < 0 && rfNRSelIds().length === n0 - 1, 'Ctrl+click toggles one: ' + rfNRSelIds());
    // empty tree space below the rows
    var last = tree.lastElementChild.getBoundingClientRect(), y = Math.min(tree.getBoundingClientRect().bottom - 3, last.bottom + 20);
    tree.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W, clientX: last.left + 40, clientY: y, button: 0, detail: 1 })); await idle();
    assert(!UI.App.sel, 'a click on empty tree space clears the selection');
    rfNRClick(rfNRRow(boss)); await idle();
    rfNRKey(tree, 'ArrowDown'); await idle();
    assert(UI.App.sel && UI.App.sel.id === fil.id, 'Down selects the next row: ' + JSON.stringify(UI.App.sel));
    rfNRKey(tree, 'ArrowUp'); await idle();
    assert(UI.App.sel && UI.App.sel.id === boss.id, 'Up selects the row above');
    var tw = rfNRRow(boss).querySelector('.tw');
    if (tw.textContent === '▾') { tw.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W })); await idle(); tree.focus(); }   // folders stay open per feature id across documents
    assert(rfNRRow(boss).querySelector('.tw').textContent === '▸', 'the boss row is closed');
    rfNRKey(tree, 'ArrowRight'); await idle();
    assert(rfNRRow(boss).querySelector('.tw').textContent === '▾', 'Right opened it');
    rfNRKey(tree, 'ArrowDown'); await idle();
    var sk = K.findFeature(UI.App.model, boss.sketch);
    assert(UI.App.sel && UI.App.sel.id === sk.id, 'Down goes into the open folder: ' + JSON.stringify(UI.App.sel));
    rfNRKey(tree, 'ArrowLeft'); await idle();
    assert(UI.App.sel && UI.App.sel.id === boss.id, 'Left on a child goes to its parent');
    rfNRKey(tree, 'ArrowLeft'); await idle();
    assert(rfNRRow(boss).querySelector('.tw').textContent === '▸', 'Left closed it');
    rfNRKey(tree, 'Enter'); await idle();
    assert(UI.hasPM(), 'Enter edits the feature');
    UI.pmCancel(); await idle(); await wait(30); await idle();
    UI.setFmTab('tree'); UI.refreshTree();
    rfNRClick(rfNRRow(boss)); await idle();
    tree.focus();
    rfNRKey(tree, 'Escape'); await idle();
    if (UI.App.sel) { rfNRKey(tree, 'Escape'); await idle(); }   // a first Esc ends a command a group before left on (the global rule)
    assert(!UI.App.sel, 'Esc clears: ' + JSON.stringify(UI.App.sel) + ' / ' + statusText());
    return 'ok';
  });

  step('rfNR: a face picked in the graphics area marks its feature in a 60-feature tree and scrolls it into view', async function () {
    var code = 'p.units("mm");\n';
    for (var i = 0; i < 58; i++) code += 'p.plane("Front", ' + (100 + i) + ');\n';
    code += 'p.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);';
    await rfNROpen(code);
    var boss = rfNRKind('extrude', 0), tree = D.getElementById('tree');
    tree.scrollTop = 0;
    var r0 = rfNRRow(boss).getBoundingClientRect(), tb = tree.getBoundingClientRect();
    assert(r0.top > tb.bottom, 'the boss row starts out of view (' + r0.top + ' > ' + tb.bottom + ')');
    var fi = -1;
    UI.App.mesh.faces.some(function (fc, k) { if (UI.App.triShared[fc.start] === boss.id) { fi = k; return true; } return false; });
    assert(fi >= 0, 'a face of the boss');
    UI.setSelection([{ kind: 'face', index: fi, point: UI.App.mesh.faces[fi].centroid }]); await idle(); await wait(30); await idle();
    var row = rfNRRow(boss), r1 = row.getBoundingClientRect(); tb = tree.getBoundingClientRect();
    assert(row.classList.contains('sel-owner'), 'the boss row is marked as the face\'s feature');
    assert(r1.top >= tb.top - 1 && r1.bottom <= tb.bottom + 1, 'and scrolled into view: ' + r1.top + '..' + r1.bottom + ' in ' + tb.top + '..' + tb.bottom);
    return 'scrollTop ' + tree.scrollTop;
  });

  step('rfNR: the flyout FeatureManager: with a PropertyManager over the tree it sits at the top left of the graphics area; a click on a row feeds Linear Pattern, Mirror and the new sketch\'s plane pick', async function () {
    await rfNROpen(rfNRPart4 + '\np.plane("Front", 40);');
    var cuts = rfNRCuts(), pl = rfNRKind('plane');
    UI.cmdLinearPattern(); await idle(); await wait(300);
    var fly = D.getElementById('fm-flyout');
    assert(UI.hasPM() && fly && fly.getClientRects().length, 'the flyout shows with the PropertyManager');
    var vp = D.getElementById('viewport').getBoundingClientRect(), fr = fly.getBoundingClientRect();
    assert(fr.left - vp.left < 20 && fr.top - vp.top < 20, 'at the top left of the graphics area');
    assert(!fly.querySelector('.fly-row'), 'collapsed to its title row');
    rfNRClick(fly.querySelector('.fly-head')); await idle();
    var row = fly.querySelector('.fly-row[data-fid="' + cuts[1].id + '"]');
    assert(row, 'the rows show after a click on the title');
    rfNRClick(row); await idle(); await wait(50);
    assert(UI.pmSpec().values.feature === cuts[1].id, 'Linear Pattern\'s Features to Pattern took ' + cuts[1].name + ': ' + JSON.stringify(UI.pmSpec().values.feature));
    UI.pmCancel(); await idle(); await wait(300);
    assert(!D.getElementById('fm-flyout'), 'the flyout goes with the PropertyManager');
    UI.cmdMirror(); await idle(); await wait(300);
    fly = D.getElementById('fm-flyout');
    if (!fly.querySelector('.fly-row')) { rfNRClick(fly.querySelector('.fly-head')); await idle(); }
    rfNRClick(fly.querySelector('.fly-row[data-plane="Top"]')); await idle(); await wait(50);
    assert(UI.pmSpec().values.plane === 'Top', 'Mirror plane from the flyout: ' + UI.pmSpec().values.plane);
    rfNRClick(fly.querySelector('.fly-row[data-fid="' + cuts[0].id + '"]')); await idle(); await wait(50);
    assert(UI.pmSpec().values.feature === cuts[0].id, 'Mirror feature from the flyout');
    UI.pmCancel(); await idle(); await wait(300);
    UI.setSelection([]);
    UI.cmdSketch(); await idle(); await wait(300);
    fly = D.getElementById('fm-flyout');
    assert(fly, 'the flyout shows while the sketch asks for a plane');
    if (!fly.querySelector('.fly-row')) { rfNRClick(fly.querySelector('.fly-head')); await idle(); }
    rfNRClick(fly.querySelector('.fly-row[data-fid="' + pl.id + '"]')); await idle(); await wait(100); await idle();
    assert(UI.App.mode === 'sketch', 'the sketch opened on ' + pl.name + ' from the flyout');
    var sk = UI.activeSketchFeature ? UI.activeSketchFeature() : null;
    var ok = sk && sk.plane && (sk.plane.featureId === pl.id || (sk.plane.ref === 'Front' && +sk.plane.offset === 40));
    UI.exitSketch(true); await idle();
    assert(ok, 'on that plane: ' + JSON.stringify(sk && sk.plane));
    return 'ok';
  });

  step('rfNR: right-click menus of the part tree (feature, sketch, plane, origin, Sheet-Metal, Flat-Pattern, folder, rollback bar): every enabled row runs something, every greyed row says why', async function () {
    await rfNROpen(rfNRSheet);
    UI.addToNewFolder([UI.App.model.features.filter(function (f) { return f.type === 'flange'; })[1].id]); await idle();
    var tree = D.getElementById('tree'), bad = [], seen = [];
    // the Material row's menu is ui-materials.js's (reported to its lane: Remove Material greyed without a reason)
    var targets = Array.prototype.filter.call(tree.querySelectorAll('.ti, .rollbar'), function (r) { return r.getClientRects().length && !r.classList.contains('material-row'); });
    targets.forEach(function (t) {
      var rows = rfNRMenuRows(t), name = (t.querySelector('.nm') || t).textContent || t.className;
      if (rows.length) seen.push(name + ' (' + rows.length + ')');
      rows.forEach(function (it) {
        if (it.sep || (it.items && it.items.length)) return;
        if (!it.disabled && typeof it.action !== 'function') bad.push(name + ' ▸ ' + it.label + ': no action');
        if (it.disabled && !it.why) bad.push(name + ' ▸ ' + it.label + ': greyed without a reason');
      });
    });
    assert(!bad.length, bad.join('; '));
    assert(seen.some(function (s) { return /^Origin/.test(s); }) && seen.some(function (s) { return /Flat-Pattern/.test(s); }) && seen.some(function (s) { return /Folder1/.test(s); }), 'menus seen: ' + seen.join(', '));
    return seen.length + ' menus';
  });

  step('rfNR: Flat-Pattern1 lists Bend-Lines1, Bounding-Box1 and a row per bend; Hide / Show the bend lines and the bounding box in the flat; folded it is greyed; a failed flange has the error mark with its message', async function () {
    await rfNROpen(rfNRSheet);
    var r = UI.toggleFlatten(true); if (r && r.then) await r; await idle(); await wait(50); await idle();
    assert(UI.App.model.flatState && UI.App.flat, 'flat');
    UI.refreshTree();
    var fp = D.querySelector('#tree .fp-row');
    assert(fp && !fp.classList.contains('suppressed'), 'Flat-Pattern1 is on while flat');
    fp.querySelector('.tw').dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true, view: W })); await idle();
    var kids = Array.prototype.map.call(D.querySelectorAll('#tree .fp-kid'), function (k) { return k.querySelector('.nm').textContent; });
    assert(kids.join() === 'Bend-Lines1,Bounding-Box1,EdgeBend1,EdgeBend2', 'children: ' + kids.join());
    rfNRClick(D.querySelector('#tree .fp-kid:nth-child(3)')); await idle();
    assert(/EdgeBend1 \(Edge-Flange1\): UP 90/.test(statusText()) && /BA /.test(statusText()), 'a bend row says its bend: ' + statusText());
    function obj(k) { return UI.flatGroup.children.filter(function (c) { return c.userData[k]; })[0]; }
    assert(obj('flatBends') && obj('flatBends').visible && !obj('flatBBox'), 'bend lines shown, bounding box hidden by default');
    await rfNRMenuOn(D.querySelector('#tree .fp-kid[data-fp="bendLines"]'), 'Hide');
    assert(!obj('flatBends').visible, 'Hide hid the bend lines');
    await rfNRMenuOn(D.querySelector('#tree .fp-kid[data-fp="bbox"]'), 'Show');
    assert(obj('flatBBox'), 'Show drew the bounding box');
    await rfNRMenuOn(D.querySelector('#tree .fp-kid[data-fp="bendLines"]'), 'Show');
    await rfNRMenuOn(D.querySelector('#tree .fp-kid[data-fp="bbox"]'), 'Hide');
    assert(obj('flatBends').visible && !obj('flatBBox'), 'back as they were');
    r = UI.toggleFlatten(false); if (r && r.then) await r; await idle(); UI.refreshTree();
    assert(D.querySelector('#tree .fp-row').classList.contains('suppressed'), 'folded: Flat-Pattern1 greyed');
    assert(D.querySelector('#tree .sm-folder'), 'the Sheet-Metal row');
    await anvil.append('p.flange(20, [[50, 90, 999]]);').catch(function () { }); await idle(); UI.refreshTree();
    var bad = UI.App.model.features[UI.App.model.features.length - 1], row = rfNRRow(bad), err = (UI.App.build.errors || {})[bad.id];
    assert(err && row.classList.contains('err'), 'the failed flange is marked: ' + err);
    var tip = (row.getAttribute('title') || '') + (row.querySelector('.nm').getAttribute('title') || '');
    assert(tip.indexOf(err) >= 0, 'its tooltip has the message: ' + tip);
    return kids.join();
  });
  step('rfNR: assembly tree (four components and a mate): Down / Up move the selection between component rows; the component and mate menus are listed (rows greyed without a reason belong to ui-assembly.js)', async function () {
    if (UI.clearTreeFilter) UI.clearTreeFilter();
    await anvil.newAssembly('TreeAudit');
    for (var i = 0; i < 4; i++) await anvil.insert({ script: 'p.units("mm"); p.box(40, 20, 30);' }, { position: [i * 60, 0, 0] });
    await idle();
    UI.cmdMate();
    setInput(pmSelect('type'), 'parallel');
    UI.mateSelect({ component: 2, face: [20, 30, 10] }); UI.mateSelect({ component: 1, face: [20, 30, 10] });
    await pmAccept(); await idle();
    UI.setFmTab('tree'); UI.refreshTree();
    var tree = D.getElementById('tree'), comps = Array.prototype.filter.call(tree.querySelectorAll('.ti.component-row'), function (r) { return r.getClientRects().length; });
    assert(comps.length === 4, 'four component rows: ' + comps.length);
    rfNRClick(comps[0]); await idle();
    assert(D.activeElement === tree, 'the tree has the focus');
    var sel0 = JSON.stringify(UI.App.sel);
    rfNRKey(tree, 'ArrowDown'); await idle();
    var sel1 = JSON.stringify(UI.App.sel);
    assert(sel1 !== sel0 && tree.querySelector('.ti.selected, .ti.component-row.selected'), 'Down moved the selection: ' + sel0 + ' -> ' + sel1);
    rfNRKey(tree, 'ArrowUp'); await idle();
    assert(JSON.stringify(UI.App.sel) === sel0, 'Up moved it back');
    var notes = [];
    var mate = Array.prototype.filter.call(tree.querySelectorAll('.ti'), function (r) { return /^Parallel1/.test(r.textContent.trim()) && r.getClientRects().length; })[0];
    [comps[1], mate].filter(Boolean).forEach(function (t) {
      rfNRMenuRows(t).forEach(function (it) {
        if (it.sep || (it.items && it.items.length)) return;
        if (!it.disabled && typeof it.action !== 'function') notes.push(t.textContent.trim().slice(0, 14) + ' ▸ ' + it.label + ': no action');
        if (it.disabled && !it.why) notes.push(t.textContent.trim().slice(0, 14) + ' ▸ ' + it.label + ': greyed, no reason');
      });
    });
    await anvil.newPart(); await idle();
    return notes.length ? 'menu notes: ' + notes.join('; ') : 'menus clean';
  });