  // --- r14/viewui14 ---
  function r14dir() { return UI.cam.dir.toArray(); }
  function r14press(target, x, y, opts) {
    var r = target.getBoundingClientRect(), o = { bubbles: true, cancelable: true, clientX: r.left + x, clientY: r.top + y, button: 0 };
    Object.keys(opts || {}).forEach(function (k) { o[k] = opts[k]; });
    target.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: o.clientX, clientY: o.clientY }));
    target.dispatchEvent(new W.MouseEvent('mousedown', o));
    W.dispatchEvent(new W.MouseEvent('mouseup', o));
  }
  step('r14 view: View ▸ Background Gradient / Plain / Dark, remembered per browser, keeps the viewport\'s other classes; edges stay dark on a shaded body, light in HLR on Dark', async function () {
    await anvil.run('p.box(40, 20, 30);'); await idle();
    var vp = UI.viewport, rows = menuRows('Background');
    assert(rows.length === 3 && /View/.test(rows[0].menu), 'View ▸ Background rows: ' + rows.map(function (r) { return r.menu + ': ' + r.text; }).join(' | '));
    assert(/Gradient/.test(rows[0].text) && rows[0].chk, 'Gradient is the checked default: ' + rows[0].text + ' ' + JSON.stringify(rows[0].chk));
    var plain = rows.filter(function (r) { return /Plain/.test(r.text); })[0];
    vp.classList.add('r14-probe');
    plain.row.click();
    assert(vp.classList.contains('bg-plain') && vp.classList.contains('r14-probe'), 'bg-plain set, other classes kept: ' + vp.className);
    assert(W.localStorage.getItem('anvil.bg') === 'plain', 'remembered: ' + W.localStorage.getItem('anvil.bg'));
    var dark = menuRows('Background ▸ Dark')[0]; dark.row.click();
    assert(vp.classList.contains('bg-dark') && !vp.classList.contains('bg-plain'), 'bg-dark: ' + vp.className);
    UI.setStyle('shadedEdges');
    assert(UI.mats.edge.color.getHex() < 0x404040, 'edges dark on the shaded body over a dark background: #' + UI.mats.edge.color.getHexString());
    UI.setStyle('hlr');
    assert(UI.mats.edge.color.getHex() > 0xa0a0a0, 'edges light in HLR over a dark background: #' + UI.mats.edge.color.getHexString());
    assert(UI.mats.hlr.colorWrite === false, 'the HLR occluder writes depth only (the background shows through)');
    UI.setStyle('shadedEdges');
    UI.setBackground('gradient');
    vp.classList.remove('r14-probe');
    assert(!/bg-/.test(vp.className) && W.localStorage.getItem('anvil.bg') === 'gradient', 'back to the gradient: ' + vp.className);
    // swpart: the default part in the light default look has SolidWorks' edge colour (UI.partLook.bodyEdge())
    assert(UI.mats.edge.color.getHex() === UI.partLook.bodyEdge(), 'edges dark on the shaded body over the gradient too (rfBR: grey-black)');
    var bgImg = W.getComputedStyle(vp).backgroundImage;
    assert(/gradient/.test(bgImg), 'the gradient background: ' + bgImg);
    return bgImg.slice(0, 80);
  });
  step('r14 view: face / solid selection light blue (user 2026-10-27) and pre-highlight orange, both translucent tints over the shaded face', async function () {
    var s = UI.mats.sel, h = UI.mats.hover;
    assert(s.color.b > 0.9 && s.color.g > 0.7 && s.color.r > 0.4 && s.color.r < s.color.b && s.transparent && s.opacity < 0.5, 'selection light-blue tint: #' + s.color.getHexString() + ' @' + s.opacity);
    assert(h.color.r > 0.9 && h.color.b < 0.3 && h.transparent && h.opacity < 0.5, 'pre-highlight orange tint: #' + h.color.getHexString() + ' @' + h.opacity);
    anvil.select(0); UI.tick();
    var sm = UI.groups.highlight.children.filter(function (o) { return o.material === UI.mats.sel; });
    assert(sm.length === 1, 'the selected face is drawn with the selection tint');
    UI.App.sel = null; UI.updateHighlights();
    return '#' + s.color.getHexString() + ' / #' + h.color.getHexString();
  });
  step('r14 view: triad — hover lights an axis, click views along it, again from the opposite side, Shift+click turns 90° about it', async function () {
    UI.viewAnimation = false;
    UI.setView('Isometric'); UI.render();
    var tc = D.getElementById('triad');
    assert(W.getComputedStyle(tc).pointerEvents !== 'none', 'the triad takes the mouse');
    function findAxis(a) { for (var y = 0; y < 96; y += 2) for (var x = 0; x < 96; x += 2) if (UI.triadAxisAt(x, y) === a) return [x, y]; return null; }
    var px = findAxis(0);
    assert(px, 'the X axis is on the triad');
    tc.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: tc.getBoundingClientRect().left + px[0], clientY: tc.getBoundingClientRect().top + px[1] }));
    assert(tc.style.cursor === 'pointer', 'hovering an axis shows the hand cursor');
    var pressed = 0; function cnt() { pressed++; }
    UI.viewport.addEventListener('mousedown', cnt);
    r14press(tc, px[0], px[1]);
    nearVecS(r14dir(), [1, 0, 0], 1e-6, 'X click: Right view');
    UI.render();
    var px2 = findAxis(0);
    assert(px2, 'X seen end-on is still clickable');
    r14press(tc, px2[0], px2[1]);
    nearVecS(r14dir(), [-1, 0, 0], 1e-6, 'second X click: Left view');
    UI.viewport.removeEventListener('mousedown', cnt);
    assert(pressed === 0, 'an axis click does not reach the graphics area (no rotate, no selection)');
    UI.setView('Front'); UI.render();
    var py = findAxis(1);
    r14press(tc, py[0], py[1], { shiftKey: true });
    nearVecS(r14dir(), [1, 0, 0], 1e-6, 'Shift+click Y from Front turns the view 90° about Y');
    nearVecS(UI.cam.up.toArray(), [0, 1, 0], 1e-6, 'up stays Y');
    assert(UI.triadClick(2) === 'Front', 'UI.triadClick(2) -> Front');
    tc.dispatchEvent(new W.MouseEvent('mouseleave', { bubbles: false }));
    assert(tc.style.cursor === '', 'cursor restored');
    UI.viewAnimation = undefined;
    return 'X → Right → Left, Shift+Y from Front → Right';
  });
  step('r14 view: View Selector — Space shows the cube alone (no menu, user 2026-11-04), a corner / edge / face click orients and closes it, a middle drag rotates the view with the cube still up, Space again or Esc closes it', async function () {
    UI.viewAnimation = false;
    UI.setView('Isometric'); UI.render();
    UI.showOrientationMenu();
    var vsEl = D.getElementById('view-selector');
    assert(UI.viewSelectorShown() && vsEl && !vsEl.hidden, 'the cube is shown');
    assert(!D.querySelector('body > .menu'), 'Space opens no View Orientation list, only the cube');
    // a middle drag on the cube rotates the view and leaves the cube up, turned with the view
    var vr = vsEl.getBoundingClientRect(), mx = vr.left + vr.width / 2, my = vr.top + vr.height / 2, d0 = r14dir();
    vsEl.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 1, buttons: 4, clientX: mx, clientY: my }));
    for (var mi = 1; mi <= 4; mi++) vsEl.dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, buttons: 4, clientX: mx + mi * 15, clientY: my + mi * 4 }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 1, clientX: mx + 60, clientY: my + 16 }));
    UI.render();
    var d1 = r14dir();
    assert(UI.viewSelectorShown() && !vsEl.hidden, 'a middle drag keeps the cube up');
    assert(Math.abs(d0[0] - d1[0]) + Math.abs(d0[1] - d1[1]) + Math.abs(d0[2] - d1[2]) > 0.05, 'a middle drag on the cube rotates the view: ' + d0.map(function (x) { return x.toFixed(3); }) + ' -> ' + d1.map(function (x) { return x.toFixed(3); }));
    UI.setView('Isometric'); UI.render();
    var regs = UI.viewSelectorRegions(), ids = {};
    regs.forEach(function (r) { ids[r.id] = 1; });
    // from the isometric view three faces face the viewer: their 3 × 3 cells give 19 distinct regions (7 shared)
    assert(Object.keys(ids).length === 19, 'visible regions ' + Object.keys(ids).length);
    var corner = regs.filter(function (r) { return r.id === '1,1,1'; })[0];
    r14press(vsEl, corner.center[0], corner.center[1]);
    var s3 = 1 / Math.sqrt(3);
    nearVecS(r14dir(), [s3, s3, s3], 1e-6, 'corner (1,1,1): isometric');
    assert(!UI.viewSelectorShown() && vsEl.hidden, 'a pick closes the cube');
    if (UI.closeMenus) UI.closeMenus();
    UI.showViewSelector(); UI.render();
    var edge = UI.viewSelectorRegions().filter(function (r) { return r.id === '1,0,1'; })[0];
    assert(edge, 'the front-right edge region is visible');
    r14press(vsEl, edge.center[0], edge.center[1]);
    nearVecS(r14dir(), [Math.SQRT1_2, 0, Math.SQRT1_2], 1e-6, 'edge (1,0,1)');
    UI.showViewSelector(); UI.render();
    assert(UI.viewSelectorPick('0,1,0'), 'pick Top');
    nearVecS(r14dir(), [0, 1, 0], 1e-6, 'Top'); nearVecS(UI.cam.up.toArray(), [0, 0, -1], 1e-6, 'Top up = -Z');
    UI.showOrientationMenu(); assert(UI.viewSelectorShown(), 'Space shows it');
    UI.showOrientationMenu(); assert(!UI.viewSelectorShown() && !D.querySelector('body > .menu'), 'Space again closes the cube');
    UI.showViewSelector();
    W.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    assert(!UI.viewSelectorShown(), 'Esc closes it');
    UI.showViewSelector();
    UI.viewport.querySelector('canvas.gl').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, button: 2, clientX: 5, clientY: 5 }));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 2 }));
    assert(!UI.viewSelectorShown(), 'a press in the graphics area closes it');
    UI.viewAnimation = undefined;
    UI.setView('Isometric');
    return Object.keys(ids).length + ' regions from the isometric view';
  });
  // --- end r14/viewui14 ---
