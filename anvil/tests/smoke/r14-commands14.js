  // --- r14/commands14 ---
  // Flyout buttons in the CommandManager, the S-key Shortcut Bar and the two-line tooltips (ui-panels.js).
  function c14Key(k, target) { var ev = new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }); (target || D.body).dispatchEvent(ev); return ev; }
  function c14Fly(group) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-fly'), function (w) { return w._fly && w._fly.fly === group; })[0]; }
  function c14MenuLabels() { var m = D.querySelector('.menu'); return m ? Array.prototype.map.call(m.querySelectorAll('.mi'), function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); }) : []; }
  function c14MenuRow(text) { var m = D.querySelector('.menu'); return m && Array.prototype.filter.call(m.querySelectorAll('.mi'), function (r) { return r.textContent.indexOf(text) >= 0; })[0]; }
  async function c14Tip(btn) {
    btn.dispatchEvent(new W.MouseEvent('mouseover', { bubbles: true, clientX: 1, clientY: 1 }));
    for (var i = 0; i < 40; i++) { var t = D.querySelector('.tip'); if (t && !t.hidden) return t; await wait(50); }
    return null;
  }
  step('r14/commands14: flyout buttons — Fillet / Chamfer, the patterns, Reference Geometry, rectangle and arc types, Trim / Extend, Convert / Offset; the ▾ lists the group, the face runs the last one picked (remembered)', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).extrude(10);'); await idle();
    ['fillet', 'pattern', 'refgeo', 'rect', 'arc', 'trim', 'convert'].forEach(function (g) { UI.ribbonFlyFace(g, 0); });
    UI.setRibbonTab('Features');
    ['fillet', 'pattern', 'refgeo'].forEach(function (g) { assert(c14Fly(g), 'Features tab has no ' + g + ' flyout'); });
    var fl = c14Fly('fillet'), face = fl.querySelector('.rb'), caret = fl.querySelector('.rb-caret');
    assert(face.getAttribute('aria-label') === 'Fillet' && caret, 'Fillet face / caret: ' + face.getAttribute('aria-label'));
    caret.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); caret.click();
    assert(c14MenuLabels().join(' | ') === 'Fillet | Chamfer', 'Fillet flyout lists ' + c14MenuLabels().join(' | '));
    assert(fl.classList.contains('open'), 'flyout not marked open');
    c14MenuRow('Chamfer').click(); await idle();
    assert(UI.hasPM() && /Chamfer/.test($('pm').textContent), 'Chamfer PropertyManager did not open');
    UI.pmCancel(); await idle();
    assert(c14Fly('fillet') === fl && face.getAttribute('aria-label') === 'Chamfer' && face.dataset.icon === 'chamfer', 'face did not become Chamfer: ' + face.getAttribute('aria-label'));
    assert(W.localStorage.getItem('anvil.fly.fillet') === '1', 'last-used not remembered');
    face.click(); await idle();
    assert(UI.hasPM() && /Chamfer/.test($('pm').textContent), 'the face does not run Chamfer');
    UI.pmCancel(); await idle();
    // Reference Geometry: Plane, Axis, Coordinate System and Point all run (lane CZ)
    var rg = c14Fly('refgeo');
    rg.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); rg.querySelector('.rb-caret').click();
    assert(c14MenuLabels().join(' | ') === 'Plane | Axis | Coordinate System | Point', 'Reference Geometry lists ' + c14MenuLabels().join(' | '));
    assert(!c14MenuRow('Plane').classList.contains('disabled') && !c14MenuRow('Axis').classList.contains('disabled'), 'Plane and Axis enabled (lane CZ: Axis, Coordinate System and Point work now)');
    UI.closeMenus();
    assert(rg.querySelector('.rb').getAttribute('aria-label') === 'Reference Geometry', 'Reference Geometry keeps its name');
    var pat = c14Fly('pattern');
    pat.querySelector('.rb-caret').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); pat.querySelector('.rb-caret').click();
    assert(c14MenuLabels().join(' | ') === 'Linear Pattern | Circular Pattern | Mirror', 'pattern flyout lists ' + c14MenuLabels().join(' | '));
    UI.closeMenus();
    // Sketch tab: the face follows the tool that is on (A, A is the 3 Point Arc)
    UI.setRibbonTab('Sketch');
    ['rect', 'arc', 'trim', 'convert'].forEach(function (g) { assert(c14Fly(g), 'Sketch tab has no ' + g + ' flyout'); });
    assert(!c14Fly('rect').querySelector('.rb').disabled, 'rectangle flyout greyed outside a sketch');   // lane mcdirect: a drawing tool starts a sketch (Edit Sketch prompt), so it is no longer greyed
    await UI.newSketchOnPlane('Front'); await idle();
    UI.setTool('arc3'); UI.refreshRibbon();
    var arc = c14Fly('arc').querySelector('.rb');
    assert(arc.getAttribute('aria-label') === '3 Point Arc' && arc.classList.contains('active'), 'arc face: ' + arc.getAttribute('aria-label'));
    UI.setTool('select'); UI.refreshRibbon();
    c14Fly('rect').querySelector('.rb-caret').click();
    c14MenuRow('Center Rectangle').click();
    assert(UI.App.tool === 'crect' && c14Fly('rect').querySelector('.rb').getAttribute('aria-label') === 'Center Rectangle', 'Center Rectangle from the flyout: ' + UI.App.tool);
    UI.setTool('select'); UI.refreshRibbon();
    c14Fly('rect').querySelector('.rb').click();
    assert(UI.App.tool === 'crect', 'the rectangle face does not run the last type');
    UI.setTool('select');
    UI.exitSketch(); await idle();
    ['fillet', 'pattern', 'refgeo', 'rect', 'arc', 'trim', 'convert'].forEach(function (g) { UI.ribbonFlyFace(g, 0); });
    UI.setRibbonTab('Features');
    return 'Features: fillet, pattern, refgeo; Sketch: rect, arc, trim, convert';
  });
  step('r14/commands14: a flyout that does not fit goes into the » menu with its whole group', async function () {
    UI.setRibbonTab('Features');
    var out = '';
    await withFrameWidth(560, async function () {
      var more = D.querySelector('#ribbon-buttons .rb-more');
      var over = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons > .rb-fly'), function (w) { return w.classList.contains('rb-over'); });
      assert(more && !more.hidden && over.length, 'no flyout in the » menu at 560 px');
      more.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); more.click();
      var labels = c14MenuLabels().join(' | ');
      over.forEach(function (w) { w._fly.items.forEach(function (it) { assert(labels.indexOf(it.label.replace(/\n/g, ' ')) >= 0, '» menu misses ' + it.label + ': ' + labels); }); });
      out = labels;
      UI.closeMenus();
    });
    return out;
  });
  step('r14/commands14: S shows the Shortcut Bar at the pointer (part / sketch / drawing / assembly sets); Esc closes only the bar; S, S starts and exits a sketch; arrows + Enter pick; another key closes it and runs its own shortcut', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).extrude(10);'); await idle();
    var vp = $('viewport').getBoundingClientRect(), cx = vp.left + vp.width / 2, cy = vp.top + vp.height / 2;
    $('viewport').dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
    c14Key('s');
    var bar = $('scbar');
    assert(UI.shortcutBar.isOpen() && bar && UI.shortcutBar.context() === 'part', 'no part Shortcut Bar');
    var labels = UI.shortcutBar.labels();
    assert(labels[0] === 'Sketch' && labels.indexOf('Extruded Boss/Base') >= 0 && labels.indexOf('Fillet') >= 0 && labels.indexOf('Chamfer') >= 0, 'part bar: ' + labels.join(', '));
    var br = bar.getBoundingClientRect(), b0 = bar.querySelector('button').getBoundingClientRect();
    assert(b0.left <= cx && cx <= b0.right && b0.top <= cy && cy <= b0.bottom, 'the pointer is not on the first button');
    assert(br.left >= vp.left && br.right <= vp.right && br.top >= vp.top && br.bottom <= vp.bottom, 'bar outside the graphics area');
    UI.closeShortcutBar();
    // Esc closes the bar and nothing else (an open PropertyManager stays; the key is not typed into its field)
    UI.cmdChamfer(); await idle(); if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
    c14Key('s'); assert(UI.shortcutBar.isOpen(), 'bar did not open over a PropertyManager');
    c14Key('Escape');
    assert(!UI.shortcutBar.isOpen() && !$('scbar') && UI.hasPM(), 'Esc should close the bar only');
    UI.pmCancel(); await idle();
    // a click elsewhere closes it
    c14Key('s'); $('viewport').dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, button: 0, clientX: cx + 200, clientY: cy + 200 })); W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0, clientX: cx + 200, clientY: cy + 200 }));
    assert(!UI.shortcutBar.isOpen(), 'a click elsewhere left the bar open');
    // S, S = Sketch (nothing selected: it asks for a plane)
    UI.App.sel = null; UI.App.sel2 = null; UI.updateHighlights();
    c14Key('s'); c14Key('s'); await idle();
    assert(!UI.shortcutBar.isOpen() && UI.hasPM() && /plane/i.test($('pm').textContent), 'S, S did not start Sketch');
    UI.pmCancel(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    c14Key('s');
    labels = UI.shortcutBar.labels();
    assert(UI.shortcutBar.context() === 'sketch' && labels[0] === 'Exit Sketch' && labels.indexOf('Line') >= 0 && labels.indexOf('Trim Entities') >= 0, 'sketch bar: ' + labels.join(', '));
    c14Key('l');   // closes the bar and goes on to L = Line
    assert(!UI.shortcutBar.isOpen() && UI.App.tool === 'line', 'L with the bar open: tool ' + UI.App.tool);
    UI.setTool('select');
    c14Key('s'); c14Key('ArrowRight'); c14Key('ArrowRight'); c14Key('Enter');
    assert(!UI.shortcutBar.isOpen() && UI.App.tool === 'line', 'arrows + Enter: tool ' + UI.App.tool);
    UI.setTool('select');
    c14Key('s'); c14Key('s'); await idle();
    assert(UI.App.mode !== 'sketch', 'S, S did not exit the sketch');
    // drawing
    anvil.drawing.make(); await idle();
    c14Key('s');
    labels = UI.shortcutBar.labels();
    assert(UI.shortcutBar.context() === 'drawing' && labels.indexOf('Model View') >= 0 && labels.indexOf('Smart Dimension') >= 0, 'drawing bar: ' + labels.join(', '));
    c14Key('Escape');
    assert(!UI.shortcutBar.isOpen() && UI.drawingActive(), 'Esc closed the drawing bar and the drawing stays');
    anvil.drawing.close(); await idle();
    // assembly
    await anvil.newAssembly('C14Asm'); await idle();
    c14Key('s');
    labels = UI.shortcutBar.labels();
    assert(UI.shortcutBar.context() === 'assembly' && labels[0] === 'Insert Components' && labels.indexOf('Mate') >= 0, 'assembly bar: ' + labels.join(', '));
    c14Key('Escape');
    await anvil.newPart(); await idle();
    return 'part ' + UI.shortcutBar.labels('part').length + ' / sketch ' + UI.shortcutBar.labels('sketch').length + ' buttons';
  });
  step('r14/commands14: tooltips — bold name + shortcut, a description line, a note on greyed buttons; heads-up toolbar titles become the same tooltip', async function () {
    await anvil.run('p.sketch("Front").rect(0, 0, 40, 20).extrude(10);'); await idle();
    UI.setRibbonTab('Features');
    var ext = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === 'Extruded Boss/Base'; })[0];
    assert(ext && !ext.hasAttribute('title'), 'ribbon button keeps a browser title (double tooltip)');
    var t = await c14Tip(ext);
    assert(t, 'no tooltip on Extruded Boss/Base');
    assert(t.querySelector('b').textContent === 'Extruded Boss/Base' && t.querySelector('.tip-key').textContent === 'E' && /Extrude a closed sketch profile/.test(t.querySelector('.tip-desc').textContent), 'tooltip: ' + t.textContent);
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    assert(t.hidden, 'a press hides the tooltip');
    var fit = $('hud').children[0];
    t = await c14Tip(fit);
    assert(t && !fit.hasAttribute('title') && fit.getAttribute('aria-label') === 'Zoom to Fit (F)', 'heads-up title not adopted: ' + fit.getAttribute('aria-label'));
    assert(t.querySelector('b').textContent === 'Zoom to Fit' && t.querySelector('.tip-key').textContent === 'F' && t.querySelector('.tip-desc'), 'heads-up tooltip: ' + t.textContent);
    var sk = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === 'Sketch'; })[0];
    UI.setRibbonTab('Sketch');
    sk = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === 'Sketch'; })[0];
    t = await c14Tip(sk);
    assert(t && t.querySelector('.tip-key').textContent === 'S, S', 'Sketch shortcut: ' + (t && t.textContent));
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    UI.setRibbonTab('Features');
    // 2026-10-29a: Draft (and the other Features-tab placeholders) work now; the greyed-button note is checked on the
    // first greyed button of the assembly ribbon instead
    await anvil.newAssembly('C14Grey'); await idle();
    UI.setRibbonTab('Assembly');
    var grey = null, gt = null, cands = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.disabled; });
    for (var gi = 0; gi < cands.length && !grey; gi++) {
      gt = await c14Tip(cands[gi]);
      if (gt && gt.querySelector('.tip-note') && /Not available/.test(gt.querySelector('.tip-note').textContent)) grey = cands[gi];
      D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    }
    assert(grey, 'no greyed assembly button with the Not available note (' + cands.length + ' disabled)');
    var greyName = grey.getAttribute('aria-label');
    await anvil.newPart(); await idle();
    return 'Extruded Boss/Base (E), ' + greyName + ' greyed, Zoom to Fit (F), Sketch (S, S)';
  });
  // --- end r14/commands14 ---

