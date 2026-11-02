  // ---- rfGQ (2026-11-02, lane rollback): the FeatureManager's rollback bar. Real mouse events: press on the bar, moves
  // and release over the rows; right-click rows for Rollback, Roll Forward, Roll to Previous, Roll to End. The part
  // rolls (features below are suppressed in effect), new features go in at the bar, Save and undo keep the state.
  var rfGQPart = 'p.units("mm");\np.sketch("Front").rect(0, 0, 100, 60).end().extrude(20);\n' +
    'p.sketch("Front", 20).rect(10, 10, 20, 20).end().cut(5);\n' +
    'p.sketch("Front", 20).rect(60, 10, 20, 20).end().extrude(10);';
  function rfGQVol() { return K.massProps(UI.App.mesh).volume; }
  function rfGQNear(a, b, label) { assert(Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)), label + ': volume ' + a + ', expected ' + b); }
  function rfGQFeat(name) { return UI.App.model.features.filter(function (f) { return f.name === name; })[0]; }
  function rfGQKind(type, k) { return UI.App.model.features.filter(function (f) { return f.type === type; })[k || 0]; }
  function rfGQRow(f) { return D.querySelector('#tree > .ti[data-fid="' + f.id + '"]'); }
  function rfGQBar() { return D.querySelector('#tree > .rollbar'); }
  function rfGQMouse(type, x, y, target, button) {
    var t = target || D.elementFromPoint(x, y) || D.body;
    t.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, view: W, clientX: x, clientY: y, button: button || 0, buttons: type === 'mouseup' ? 0 : 1 }));
  }
  // press on the bar, move in steps to the point y, release (or keep the button down with hold)
  async function rfGQDrag(y, hold) {
    var bar = rfGQBar();
    assert(bar, 'the rollback bar is in the tree');
    var r = bar.getBoundingClientRect(), x = r.left + 20, y0 = r.top + r.height / 2;
    rfGQMouse('mousedown', x, y0, bar);
    for (var k = 1; k <= 6; k++) rfGQMouse('mousemove', x, y0 + (y - y0) * k / 6);
    if (hold) return;
    rfGQMouse('mouseup', x, y);
    await idle(); await wait(20); await idle();
  }
  // the y of the top edge of a feature row: a drop just above it
  function rfGQAbove(f) { var r = rfGQRow(f); assert(r, 'tree row of ' + f.name); var b = r.getBoundingClientRect(); return b.top + 2; }
  // below every row of the tree: a drop at the end
  function rfGQBottom() { var y = 0; D.querySelectorAll('#tree > .ti').forEach(function (r) { y = Math.max(y, r.getBoundingClientRect().bottom); }); return y + 4; }
  async function rfGQMenu(f, label) {
    var el = f ? (rfGQRow(f) || D.querySelector('#tree .ti[data-fid="' + f.id + '"]')) : rfGQBar();
    assert(el, 'row to right-click');
    var r = el.getBoundingClientRect();
    el.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: W, clientX: r.left + 30, clientY: r.top + 4, button: 2 }));
    var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { var s = m.querySelector('span:not(.chk):not(.key)'); return s && s.textContent === label; })[0];
    assert(mi, 'menu row "' + label + '" (have: ' + rows.map(function (m) { return m.textContent; }).join(' | ') + ')');
    assert(!mi.classList.contains('disabled'), 'menu row "' + label + '" is enabled');
    var o = { bubbles: true, cancelable: true, view: W, clientX: r.left + 40, clientY: r.top + 10, button: 0, detail: 1 };
    mi.dispatchEvent(new W.MouseEvent('mousedown', o)); mi.dispatchEvent(new W.MouseEvent('mouseup', o)); mi.dispatchEvent(new W.MouseEvent('click', o));
    await idle(); await wait(20); await idle();
  }
  async function rfGQOpen() {
    await anvil.newPart(); await idle();
    await anvil.run(rfGQPart); await idle();
    UI.setFmTab('tree'); UI.refreshTree();
  }
  // 100 x 60 x 20 plate, 20 x 20 x 5 pocket, 20 x 20 x 10 boss
  var rfGQBase = 120000, rfGQCut = 118000, rfGQFull = 122000;

  step('rfGQ: drag the rollback bar up the tree: the part rolls back, rows below go grey, their sketches stay out of the view, the cut\'s sketch rolls with the cut; drag it down, Esc cancels, one undo per move', async function () {
    await rfGQOpen();
    rfGQNear(rfGQVol(), rfGQFull, 'whole part');
    assert(UI.rollbarIndex() === UI.App.model.features.length, 'the bar starts at the end');
    var ex2 = rfGQKind('extrude', 1), cut = rfGQKind('extrude', 1).cut ? rfGQKind('extrude', 1) : ex2, ex3 = rfGQKind('extrude', 2);
    assert(cut.cut && !ex3.cut, 'the features are boss, cut, boss');
    var undo0 = UI.App.undo.length;
    await rfGQDrag(rfGQAbove(ex3));
    rfGQNear(rfGQVol(), rfGQCut, 'above the last boss');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    assert(rfGQRow(ex3) && rfGQRow(ex3).classList.contains('rolled') && !rfGQRow(ex3).classList.contains('suppressed'), 'the last boss row is grey (rolled), not marked suppressed');
    assert(!rfGQRow(cut).classList.contains('rolled'), 'the cut stays above the bar');
    await rfGQDrag(rfGQAbove(cut));
    rfGQNear(rfGQVol(), rfGQBase, 'above the cut');
    assert(!rfGQRow(K.findFeature(UI.App.model, cut.sketch)) && UI.rollbarRolled(K.findFeature(UI.App.model, cut.sketch)), 'the cut\'s sketch rolls with it, under its row, as SolidWorks (rfGW)');
    assert(rfGQBar().compareDocumentPosition(rfGQRow(cut)) & 4, 'the bar is above the cut');
    // Esc while dragging leaves everything where it was
    var at = UI.rollbarIndex();
    await rfGQDrag(rfGQAbove(rfGQKind('extrude', 0)), true);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    rfGQMouse('mouseup', 10, 10, D.body);
    await idle();
    assert(UI.rollbarIndex() === at, 'Esc cancelled the drag');
    assert(!D.body.classList.contains('rollbar-dragging'), 'the drag ended');
    // to the bottom of the tree: the whole part
    await rfGQDrag(rfGQBottom());
    rfGQNear(rfGQVol(), rfGQFull, 'dragged to the end');
    assert(!D.querySelector('#tree .ti.rolled'), 'nothing grey at the end');
    assert(!UI.App.model.features.some(function (f) { return f.suppressed; }), 'nothing stays suppressed');
    assert(!UI.App.model.rollbar, 'no rollback state left');
    await UI.undoCommand(); await idle();
    rfGQNear(rfGQVol(), rfGQBase, 'undo of the drag down');
    assert(UI.rollbarIndex() === at, 'undo put the bar back');
    await UI.undoCommand(); await idle();
    rfGQNear(rfGQVol(), rfGQCut, 'second undo');
    await UI.undoCommand(); await idle();
    rfGQNear(rfGQVol(), rfGQFull, 'third undo');
    assert(UI.rollbarIndex() === UI.App.model.features.length, 'the bar is at the end again');
  });

  step('rfGQ: right-click a feature for Rollback, Roll Forward, Roll to Previous, Roll to End; the bar itself has the last three', async function () {
    await rfGQOpen();
    var cut = rfGQKind('extrude', 1), ex3 = rfGQKind('extrude', 2), m = UI.App.model;
    await rfGQMenu(ex3, 'Rollback');
    rfGQNear(rfGQVol(), rfGQCut, 'Rollback on the last boss');
    await rfGQMenu(cut, 'Rollback');
    rfGQNear(rfGQVol(), rfGQBase, 'Rollback on the cut');
    assert(UI.rollbarIndex() === m.features.indexOf(cut) - 1, 'the bar is right above the cut and its sketch');
    await rfGQMenu(cut, 'Roll Forward');
    assert(UI.rollbarIndex() === UI.App.model.features.indexOf(rfGQKind('sketch', 2)), 'Roll Forward is one feature: the bar is above the third sketch');
    rfGQNear(rfGQVol(), rfGQCut, 'Roll Forward');
    await rfGQMenu(null, 'Roll to Previous');
    rfGQNear(rfGQVol(), rfGQBase, 'Roll to Previous');
    await rfGQMenu(null, 'Roll to End');
    rfGQNear(rfGQVol(), rfGQFull, 'Roll to End');
    await rfGQMenu(ex3, 'Roll to Previous');
    rfGQNear(rfGQVol(), rfGQBase, 'Roll to Previous from the end');
    await rfGQMenu(rfGQKind('extrude', 2), 'Roll to End');
    rfGQNear(rfGQVol(), rfGQFull, 'Roll to End on a rolled feature');
  });

  step('rfGQ: a new feature goes in at the bar and later features build on it when rolled forward; a feature suppressed by hand stays suppressed; every feature can be rolled away', async function () {
    await rfGQOpen();
    var cut = rfGQKind('extrude', 1), first = rfGQKind('sketch', 0), f0 = UI.App.model.features.length;
    await rfGQMenu(cut, 'Rollback');
    var at = UI.rollbarIndex();
    await anvil.append('p.sketch("Front", 20).rect(0, 40, 20, 20).end().extrude(10);');
    await idle(); await wait(20); await idle();
    var fs = UI.App.model.features;
    assert(fs.length === f0 + 2, 'two new features');
    assert(UI.rollbarIndex() === at + 2, 'the bar is under them: ' + UI.rollbarIndex());
    assert(fs[fs.length - 1].name === rfGQKind('extrude', 3).name || fs.indexOf(cut) > at, 'the rolled features stayed below');
    assert(fs.indexOf(cut) === at + 3, 'the cut and its sketch are below the new features');
    rfGQNear(rfGQVol(), rfGQBase + 4000, 'the new boss is in, the rolled ones are not');
    await rfGQMenu(cut, 'Roll to End');
    rfGQNear(rfGQVol(), rfGQFull + 4000, 'all features rolled forward');
    // suppressed by hand: stays so through a roll there and back
    await UI.setSuppression([rfGQKind('extrude', 3).id], true); await idle();
    var ex = fs.filter(function (f) { return f.type === 'extrude' && !f.cut; }), lastBoss = ex[ex.length - 1];
    assert(lastBoss.suppressed, 'the last boss is suppressed');
    await rfGQMenu(cut, 'Rollback');
    await rfGQMenu(cut, 'Roll to End');
    assert(lastBoss.suppressed, 'it stays suppressed after the roll');
    rfGQNear(rfGQVol(), rfGQFull, 'the suppressed boss is out');
    // above the very first row: nothing left, and back
    await rfGQMenu(UI.App.model.features[0], 'Rollback');
    assert(UI.rollbarIndex() === 0, 'the bar is above every feature');
    assert(D.querySelector('#tree .ti.rolled'), 'the rows are grey');
    await rfGQDrag(rfGQBottom());
    rfGQNear(rfGQVol(), rfGQFull, 'rolled back from nothing');
    assert(first.id === UI.App.model.features[0].id, 'the order is kept');
  });

  step('rfGQ: Save keeps the rollback state: a saved model loads rolled back with the bar in place, Roll to End restores it; with a command open the bar stays where it is, and an unsuppressed-in-a-configuration feature is given back', async function () {
    await rfGQOpen();
    var cut = rfGQKind('extrude', 1);
    await rfGQMenu(cut, 'Rollback');
    var at = UI.rollbarIndex(), saved = JSON.stringify(anvil.model());
    await anvil.newPart(); await idle();
    await anvil.load(saved); await idle(); UI.refreshTree();
    assert(UI.rollbarIndex() === at, 'the bar came back: ' + UI.rollbarIndex());
    rfGQNear(rfGQVol(), rfGQBase, 'loaded rolled back');
    assert(rfGQRow(rfGQKind('extrude', 1)).classList.contains('rolled'), 'the cut is grey after the load');
    await rfGQMenu(rfGQKind('extrude', 1), 'Roll to End');
    rfGQNear(rfGQVol(), rfGQFull, 'rolled to the end after the load');
    // a command open: the drag does nothing
    UI.cmdPlane(); await idle();
    assert(UI.hasPM(), 'a command is open');
    assert(UI.rollbarTo(0) === false, 'no roll with a command open');
    assert(/Close the open command/.test(statusText()), 'the status line says why: ' + statusText());
    UI.pmCancel(); await idle();
    // a configuration's "unsuppressed here" goes away while rolled and comes back
    var m = UI.App.model, ex = rfGQKind('extrude', 2);
    m.configurations = [{ name: 'Default', values: {}, suppressed: {} }]; m.activeConfiguration = 'Default';
    m.configurations[0].suppressed[ex.id] = false;
    await rfGQMenu(cut, 'Rollback');
    rfGQNear(rfGQVol(), rfGQBase, 'rolled with a configuration override');
    await rfGQMenu(cut, 'Roll to End');
    assert(UI.App.model.configurations[0].suppressed[ex.id] === false, 'the override is back');
    rfGQNear(rfGQVol(), rfGQFull, 'whole part again');
  });
