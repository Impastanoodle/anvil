  // --- smooth/chrome ---
  function chromeKey(target, k) { var ev = new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); target.dispatchEvent(ev); return ev; }
  step('chrome: refreshing the ribbon and the heads-up toolbar keeps their buttons (no hover / tooltip flicker); states update in place', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).extrude(10);');
    UI.setRibbonTab('Features');
    var b = D.querySelector('#ribbon-buttons .rb'), tab = D.querySelector('#ribbon-tabs .rtab'), hb = $('hud').children[1];
    UI.refreshRibbon(); UI.refreshHud(); UI.refreshStatus();
    assert(D.querySelector('#ribbon-buttons .rb') === b && D.querySelector('#ribbon-tabs .rtab') === tab, 'ribbon buttons were rebuilt');
    assert($('hud').children[1] === hb, 'heads-up toolbar was rebuilt');
    UI.App.zoomAreaMode = true; UI.refreshHud();
    assert($('hud').children[1] === hb && hb.classList.contains('active'), 'Zoom to Area not marked active in place');
    UI.App.zoomAreaMode = false; UI.refreshHud();
    assert(!hb.classList.contains('active'), 'Zoom to Area still active');
    UI.setRibbonTab('Sketch');
    var sk = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === 'Sketch'; })[0];
    var line = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (x) { return x.getAttribute('aria-label') === 'Line'; })[0];
    assert(sk && line && !line.disabled, 'Line greyed outside a sketch');   // lane mcdirect: Line starts a sketch (Edit Sketch prompt), so it is enabled
    assert(D.querySelector('#ribbon-tabs .rtab') === tab && tab.classList.contains('active') === false, 'tab strip rebuilt on a tab switch');
    await UI.newSketchOnPlane('Top'); await idle();
    assert(sk.isConnected && sk.getAttribute('aria-label') === 'Exit Sketch' && sk.classList.contains('active'), 'Sketch button did not turn into Exit Sketch in place: ' + sk.getAttribute('aria-label'));
    assert(!line.disabled, 'Line still disabled in a sketch');
    UI.setTool('line');
    assert(line.isConnected && line.classList.contains('active'), 'Line not active');
    UI.setTool('select');
    UI.cmdSketch(); await idle();
    UI.setRibbonTab('Features');
    return 'ok';
  });
  step('chrome: a PropertyManager opens with the first value box focused and selected; Esc in it cancels, Enter on a check box accepts', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20);');
    var sk = UI.App.model.features[0];
    UI.App.sel = { kind: 'feature', id: sk.id };
    UI.cmdExtrude(false);
    var a = D.activeElement;
    assert(a && a.classList.contains('pm-num') && $('pm').contains(a), 'focus is on ' + (a && a.tagName + '.' + a.className));
    assert(a.value !== '', 'empty value box');
    chromeKey(a, 'Escape');
    assert(!UI.hasPM(), 'Esc in a value box did not cancel the PropertyManager');
    UI.App.sel = { kind: 'feature', id: sk.id };
    UI.cmdExtrude(false);
    var cb = D.querySelector('#pm input[type=checkbox]');
    assert(cb, 'no check box in the Extrude PropertyManager');
    cb.focus();
    var ev = chromeKey(cb, 'Enter');
    assert(ev.defaultPrevented && !UI.hasPM(), 'Enter on a check box did not accept');
    await idle();
    assert(UI.App.model.features.length === 2 && UI.App.model.features[1].type === 'extrude', 'no extrude made');
    return 'ok';
  });
  step('chrome: a PropertyManager re-render keeps a folded group folded and the value box being typed in', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).extrude(10);');
    UI.App.sel = null;
    UI.cmdFillet();
    var groups = D.querySelectorAll('#pm .pm-group');
    function gTitle(g) { return g.querySelector('h4').textContent.replace(/^[▸▾]/, ''); }
    var last = groups[groups.length - 1], title = gTitle(last), wasFolded = last.classList.contains('collapsed');
    last.querySelector('h4').click();
    var inp = pmNumber(0); inp.focus();
    UI.renderPM();
    var g2 = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-group'), function (g) { return gTitle(g) === title; })[0];
    assert(g2 && g2.classList.contains('collapsed') === !wasFolded, 'group "' + title + '" fold state lost on re-render');
    assert(D.activeElement && D.activeElement.getAttribute('data-key') === inp.getAttribute('data-key') && D.activeElement !== inp, 'focus not restored to the re-rendered value box');
    UI.pmCancel();
    return 'ok';
  });
  step('chrome: F2 renames the right row by id (Sketch1, not Sketch10), opening a folded feature; Esc keeps the name, Enter renames', async function () {
    var code = '';
    for (var i = 0; i < 10; i++) code += 'p.sketch("Front").line(0, 0, ' + (i + 5) + ', 10);\n';
    code += 'p.sketch("Top").rect(0, 0, 20, 20).extrude(5);';
    await anvil.run(code);
    var m = UI.App.model, s1 = m.features.filter(function (f) { return f.name === 'Sketch1'; })[0];
    // the extrude's own sketch is shown inside its (folded) feature row
    var ex = m.features.filter(function (f) { return f.type === 'extrude'; })[0], inner = K.findFeature(m, ex.sketch);
    UI.startRename(inner);
    var inp = D.querySelector('#tree input.ti-rename');
    assert(inp && inp.closest('.ti').getAttribute('data-fid') === String(inner.id) && inp.getClientRects().length, 'rename box not on the folded sketch row');
    inp.value = 'Profile'; chromeKey(inp, 'Escape');
    assert(inner.name !== 'Profile' && !D.querySelector('#tree input.ti-rename'), 'Esc renamed / left the box');
    UI.App.sel = { kind: 'feature', id: s1.id }; UI.refreshTree();
    UI.startRename(s1);
    inp = D.querySelector('#tree input.ti-rename');
    assert(inp && inp.closest('.ti').getAttribute('data-fid') === String(s1.id), 'rename box on the wrong row');
    inp.value = 'Base sketch'; chromeKey(inp, 'Enter');
    assert(s1.name === 'Base sketch' && m.features.filter(function (f) { return f.name === 'Sketch10'; }).length === 1, 'renamed ' + s1.name);
    UI.undo(); await idle();
    return 'ok';
  });
  step('chrome: tree refresh keeps the scroll position; a row selected elsewhere scrolls in by the least amount', async function () {
    var code = '';
    for (var i = 0; i < 80; i++) code += 'p.sketch("Front").line(0, 0, ' + (i + 5) + ', 10);\n';
    await anvil.run(code);
    var tree = $('tree');
    assert(tree.scrollHeight > tree.clientHeight + 200, 'tree not long enough to scroll (' + tree.scrollHeight + ' / ' + tree.clientHeight + ')');
    tree.scrollTop = 300;
    var st = tree.scrollTop;
    UI.refreshTree(); UI.refreshTree();
    assert(tree.scrollTop === st, 'scroll moved ' + st + ' -> ' + tree.scrollTop);
    // a visible row: nothing moves
    var rows = tree.querySelectorAll('.ti[data-fid]'), tr = tree.getBoundingClientRect(), vis = null;
    for (var k = 0; k < rows.length && !vis; k++) { var r = rows[k].getBoundingClientRect(); if (r.top > tr.top + 30 && r.bottom < tr.top + tree.clientHeight - 30) vis = rows[k]; }
    assert(vis, 'no visible row');
    UI.App.sel = { kind: 'feature', id: +vis.getAttribute('data-fid') }; UI.refreshTree();
    assert(tree.scrollTop === st, 'selecting a visible row scrolled the tree ' + st + ' -> ' + tree.scrollTop);
    // the last feature: brought in at the bottom edge, not centred
    var lastF = UI.App.model.features[UI.App.model.features.length - 1];
    UI.App.sel = { kind: 'feature', id: lastF.id }; UI.refreshTree();
    var row = tree.querySelector('.ti[data-fid="' + lastF.id + '"]'), rr = row.getBoundingClientRect(), tb = tree.getBoundingClientRect();
    assert(rr.bottom <= tb.top + tree.clientHeight + 1 && rr.bottom >= tb.top + tree.clientHeight - rr.height - 2 || tree.scrollTop >= tree.scrollHeight - tree.clientHeight - 1, 'row not at the bottom edge');
    UI.App.sel = null; UI.refreshTree();
    return 'ok';
  });
  step('chrome: Enter in a dialog presses its primary button; the status bar is not rewritten when nothing changed', async function () {
    var yes = 0;
    UI.confirmDialog('Smoke', 'Press Enter', function () { yes++; }, 'Do it');
    var ev = chromeKey(D, 'Enter');
    assert(yes === 1 && !modalOpen() && ev.defaultPrevented, 'Enter did not press the primary button (' + yes + ')');
    UI.refreshStatus();
    var span = $('status-right').lastElementChild;
    UI.refreshStatus(); UI.refreshStatus();
    assert($('status-right').lastElementChild === span && span.classList.contains('st-ms'), 'status bar rewritten');
    return 'ok';
  });
  step('chrome: Space over the graphics area opens the View Selector cube alone (user 2026-11-04), no View Orientation list; Space again closes it', async function () {
    var vp = $('viewport'), r = vp.getBoundingClientRect(), x = Math.round(r.left + 24), y = Math.round(r.top + 40);
    vp.dispatchEvent(new W.MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    chromeKey(D, ' ');
    assert(UI.viewSelectorShown() && !D.querySelector('.menu'), 'Space: the cube and no menu');
    chromeKey(D, ' ');
    assert(!UI.viewSelectorShown(), 'Space again closes the cube');
    return 'ok';
  });
  step('chrome: Esc with a context menu open closes only the menu; the PropertyManager stays', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20);');
    UI.App.sel = { kind: 'feature', id: UI.App.model.features[0].id };
    UI.cmdExtrude(false);
    assert(UI.hasPM(), 'no PropertyManager');
    UI.showMenu(300, 200, [{ label: 'Smoke item', action: function () { } }]);
    assert(UI.menuOpen(), 'menu not open');
    chromeKey(D, 'Escape');
    assert(!UI.menuOpen() && UI.hasPM(), 'Esc closed the PropertyManager too (menu ' + UI.menuOpen() + ', PM ' + UI.hasPM() + ')');
    chromeKey(D, 'Escape');
    assert(!UI.hasPM(), 'second Esc did not cancel');
    return 'ok';
  });
  // --- end smooth/chrome ---
