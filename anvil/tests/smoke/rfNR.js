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
