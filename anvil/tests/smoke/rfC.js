  // --- rfC: UI polish — the Sketch tab laid out as SolidWorks 2024's (order, flyouts, icons, tooltips with keys), the S
  // Shortcut Bar, tool cursors, the sketch's shortcut menu, the PropertyManager renderer, the status bar, dark grounds
  // (ui-panels.js, ui-commands.js, style.css, icons.js)
  function rfcTop() {   // the Sketch tab's top level: a separator, a flyout's group, a stack (grid) or a button's name
    return Array.prototype.filter.call($('ribbon-buttons').children, function (c) { return !c.classList.contains('rb-more'); }).map(function (c) {
      return c.classList.contains('rb-sep') ? '|' : c._fly ? c._fly.fly : c.classList.contains('rb-grid') ? 'grid' : c.classList.contains('rb-stack') ? 'stack' : c.getAttribute('aria-label');
    }).join(',');
  }
  function rfcSketchItems() {   // every item of the Sketch tab, flyout members and stack rows included: [{ it, fly }]
    var out = [];
    UI.RIBBON.Sketch.forEach(function (x) {
      (x.stack || [x]).forEach(function (s) { if (s.fly) s.items.forEach(function (it, i) { out.push({ it: it, fly: s.fly, i: i, face: (s.label || it.label).replace(/\n/g, ' ') }); }); else if (!s.sep) out.push({ it: s, face: s.label.replace(/\n/g, ' ') }); });   // face: the button name (a flyout with a label of its own, Quick Snaps, keeps it)
    });
    return out;
  }
  function rfcMenu() { var m = D.querySelector('.menu'); return m ? Array.prototype.map.call(m.querySelectorAll('.mi'), function (r) { return r.textContent; }) : []; }
  step('rfC: the Sketch tab in SolidWorks 2024 order — Sketch ▾, Smart Dimension ▾ | the entity grid (Line / Rectangle / Slot, Circle / Arc / Polygon, Spline / Ellipse / Sketch Fillet, Plane / Text / Point; icons only) | Trim ▾, Convert ▾, Offset, Mirror / Pattern / Move | Display/Delete Relations ▾ (Add Relation, Fully Define Sketch), Repair / Quick Snaps / Rapid Sketch … | the shop commands; every button has its own icon and a tooltip (name, help, key); greyed ones say so; the ribbon keeps its height', async function () {
    await anvil.newPart(); await idle();
    UI.setRibbonTab('Features'); var h0 = $('ribbon').offsetHeight;
    UI.setRibbonTab('Sketch');
    assert($('ribbon').offsetHeight === h0, 'the Sketch tab changes the ribbon height: ' + $('ribbon').offsetHeight + ' vs ' + h0);
    var top = rfcTop();
    assert(top === 'sketch,dim,|,grid,|,trim,convert,Offset Entities,Offset On Surface,stack,Close Arc,|,relations,Repair Sketch,|,quickSnaps,|,Rapid Sketch,Instant2D,Shaded Sketch Contours,|,stack,Levels,Sketch to DXF,stack', 'Sketch tab order: ' + top);   // as the user's SolidWorks 2024 screenshot (2026-10-13); lane BS: Mastercam's Close Arc, an Anvil extra beside the modify tools
    var grid = D.querySelector('#ribbon-buttons .rb-grid');
    var cells = Array.prototype.map.call(grid.children, function (c) { return c._fly ? c._fly.fly : c.getAttribute('aria-label'); }).join(',');
    assert(cells === 'line,rect,slot,circle,arc,Polygon,spline,ellipse,skFillet,Plane,Text,Point', 'entity grid ' + cells);
    var gs = W.getComputedStyle(grid);
    assert(gs.display === 'grid' && gs.gridAutoFlow === 'column' && W.getComputedStyle(grid.querySelector('.rb span')).display === 'none', 'grid: three rows of icons, column by column (' + gs.display + ' ' + gs.gridAutoFlow + ')');
    var rows = {}; Array.prototype.forEach.call(grid.children, function (c) { rows[Math.round(c.getBoundingClientRect().top)] = 1; });
    assert(Object.keys(rows).length === 3, 'grid rows ' + Object.keys(rows).join(','));
    // the flyouts' members, as SolidWorks groups them
    var groups = {};
    UI.RIBBON.Sketch.forEach(function (x) { (x.stack || [x]).forEach(function (s) { if (s.fly) groups[s.fly] = s.items.map(function (it) { return it.label.replace(/\n/g, ' '); }).join('|'); }); });
    assert(groups.sketch === 'Sketch|3D Sketch|3D Sketch On Plane' && groups.relations === 'Display/Delete Relations|Add Relation|Fully Define Sketch' && groups.skFillet === 'Sketch Fillet|Sketch Chamfer' && /^Spline\|Style Spline/.test(groups.spline) && /^Ellipse\|Partial Ellipse\|Parabola\|Conic$/.test(groups.ellipse), JSON.stringify(groups));
    // every item: its own icon (not the generic square) and a one-line description; greyed ones say they are not in Anvil
    var items = rfcSketchItems(), bad = [], keys = {};
    items.forEach(function (x) {
      var icon = x.it.icon || x.it.id;
      if (!W.Icons.has(icon)) bad.push(x.it.label + ': no icon ' + icon);
      if (x.fly) UI.ribbonFlyFace(x.fly, x.i);
      var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (e) { return (e.getAttribute('aria-label') || '') === x.face; })[0];
      if (!b || !b._tip) { bad.push(x.it.label + ': no button / tooltip'); return; }
      var t = b._tip;
      if (!t.desc) bad.push(x.it.label + ': no help line');
      if (t.key) keys[t.name] = t.key;
      if (!(x.it.run || x.it.tool) && !(b.disabled && /Not available in Anvil yet/.test(t.note))) bad.push(x.it.label + ': greyed without its note');
    });
    UI.RIBBON.Sketch.forEach(function (x) { (x.stack || [x]).forEach(function (s) { if (s.fly) UI.ribbonFlyFace(s.fly, 0); }); });
    assert(!bad.length, bad.join('; '));
    var want = { 'Line': 'L', 'Circle': 'C', 'Corner Rectangle': 'R', 'Centerpoint Arc': 'A', '3 Point Arc': 'A, A', 'Smart Dimension': 'D', 'Polygon': 'P', 'Straight Slot': 'T', 'Sketch': 'S, S' };
    Object.keys(want).forEach(function (n) { assert(keys[n] === want[n], n + ' key ' + keys[n]); });
    // the tooltip as drawn for a grid button: bold name, the key, the help line
    var line = c14Fly('line').querySelector('.rb'), tip = await c14Tip(line);
    assert(tip && tip.querySelector('b').textContent === 'Line' && tip.querySelector('.tip-key').textContent === 'L' && /Draw lines/.test(tip.querySelector('.tip-desc').textContent), 'Line tooltip ' + (tip && tip.textContent));
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));
    UI.setRibbonTab('Features');
    return items.length + ' commands; ' + top;
  });
  step('rfC: the Shortcut Bar (S) in a sketch — at the pointer, the sketch tools with their icons and tooltips; a pick runs the tool and closes the bar, Esc closes it', async function () {
    await rskNew();
    var vp = $('viewport').getBoundingClientRect(), cx = vp.left + vp.width * 0.4, cy = vp.top + vp.height * 0.45;
    $('viewport').dispatchEvent(new W.MouseEvent('mousemove', { bubbles: true, clientX: cx, clientY: cy }));
    c14Key('s');
    var bar = $('scbar'), labels = UI.shortcutBar.labels();
    assert(bar && UI.shortcutBar.context() === 'sketch', 'no sketch Shortcut Bar');
    ['Exit Sketch', 'Smart Dimension', 'Line', 'Corner Rectangle', 'Circle', 'Sketch Fillet', 'Trim Entities', 'Offset Entities', 'Convert Entities', 'Add Relation', 'Display/Delete Relations', 'Text'].forEach(function (n) { assert(labels.indexOf(n) >= 0, 'bar lacks ' + n + ': ' + labels.join(', ')); });
    var bad = Array.prototype.filter.call(bar.querySelectorAll('button'), function (b) { return !W.Icons.has(b.dataset.icon) || !b._tip || !b._tip.desc; }).map(function (b) { return b.getAttribute('aria-label'); });
    assert(!bad.length, 'buttons without icon / tooltip: ' + bad.join(', '));
    var b0 = bar.querySelector('button').getBoundingClientRect();
    assert(b0.left <= cx && cx <= b0.right && b0.top <= cy && cy <= b0.bottom, 'not at the pointer');
    var circ = Array.prototype.filter.call(bar.querySelectorAll('button'), function (b) { return b.getAttribute('aria-label') === 'Circle'; })[0];
    circ.click();
    assert(!UI.shortcutBar.isOpen() && UI.App.tool === 'circle', 'a pick: tool ' + UI.App.tool + ', bar ' + UI.shortcutBar.isOpen());
    UI.setTool('select');
    c14Key('s'); assert(UI.shortcutBar.isOpen(), 'bar did not open again');
    c14Key('Escape'); assert(!UI.shortcutBar.isOpen() && UI.App.mode === 'sketch', 'Esc closes the bar only');
    return labels.length + ' buttons';
  });
  step('rfC: cursors — every drawing tool shows the pencil with its glyph (Smart Dimension the arrow); the PropertyManager tools (Parallel / Tangent / Perpendicular Line, Bisector, Tangent Circle, Split / Join, Trim, ordinate and H / V dimensions) mark the graphics area and get theirs, cleared on close', async function () {
    await rskNew();
    var vp = $('viewport'), f = UI.activeSketchFeature(), bad = [];
    f.entities.push({ t: 'line', x1: -20, y1: -10, x2: 20, y2: -10 }, { t: 'circle', cx: 0, cy: 10, r: 6 }); UI.updateSketches();
    function cur() { return W.getComputedStyle(vp).cursor; }
    ['line', 'rect', 'crect', 'rect3', 'crect3', 'parallelogram', 'circle', 'pcircle', 'arc', 'tarc', 'arc3', 'polygon', 'slot', 'cslot', 'aslot3', 'aslot', 'point', 'spline', 'ellipse', 'pellipse', 'dimension', 'text'].forEach(function (t) {
      UI.setTool(t);
      if (!/^url\(/.test(cur())) bad.push(t + ': ' + cur().slice(0, 30));
      UI.setTool('select');
    });
    var pmTools = { cmdParallelLine: 'parallelLine', cmdTangentLine: 'tangentLine', cmdPerpendicularLine: 'perpLine', cmdBisectorLine: 'bisectorLine', cmdTangentCircle: 'tangentCircle', cmdSplitEntities: 'splitEnt', cmdJoinEntities: 'joinEnt', cmdTrimEntities: 'trim', cmdHorizontalDim: 'horizDim', cmdVerticalDim: 'vertDim' };
    Object.keys(pmTools).forEach(function (c) {
      if (!UI[c]) { bad.push(c + ' missing'); return; }
      UI.App.sel = null; if (UI.setSelection) UI.setSelection([]);
      UI[c]();
      if (vp.getAttribute('data-pmtool') !== pmTools[c] || !/^url\(/.test(cur())) bad.push(c + ': ' + vp.getAttribute('data-pmtool') + ' ' + cur().slice(0, 20));
      if (UI.hasPM()) UI.pmCancel();
      if (vp.hasAttribute('data-pmtool')) bad.push(c + ': mark left after ✗');
    });
    UI.cmdOrdinateDim('x');
    if (vp.getAttribute('data-pmtool') !== 'ordinateH' || !/^url\(/.test(cur())) bad.push('ordinate: ' + vp.getAttribute('data-pmtool'));
    if (UI.hasPM()) UI.pmCancel();
    UI.setTool('select');
    assert(!bad.length, bad.join('; '));
    assert(!/^url\(/.test(cur()), 'the Select tool keeps the arrow: ' + cur().slice(0, 30));
    return '22 drawing tools, 11 PropertyManager tools';
  });
  step('rfC: the sketch\'s shortcut menu (right-click) — on empty space Smart Dimension, Line, Convert / Trim, Add Relation, Display/Delete Relations, Fully Define, Zoom to Fit, Exit Sketch; on a line Construction Geometry, Smart Dimension, the relation commands, Trim / Offset / Mirror, Properties…, Delete; it never covers the clicked point', async function () {
    await rskNew();
    var f = UI.activeSketchFeature(), r = $('viewport').getBoundingClientRect();
    f.entities.push({ t: 'line', x1: -20, y1: 0, x2: 20, y2: 0 }); UI.updateSketches(); UI.setTool('select');
    function covers(px, py) { var m = D.querySelector('.menu').getBoundingClientRect(); return px >= m.left && px <= m.right && py >= m.top && py <= m.bottom; }
    var pe = rskScr([0, 30]);
    UI.sketchMenu(pe[0], pe[1]);
    var empty = rfcMenu().join(' | ');
    ['Smart Dimension', 'Line', 'Convert Entities', 'Trim Entities', 'Add Relation', 'Display/Delete Relations', 'Fully Define Sketch', 'Zoom to Fit', 'Exit Sketch', 'Discard Changes and Exit'].forEach(function (n) { assert(empty.indexOf(n) >= 0, 'empty-space menu lacks ' + n + ': ' + empty); });
    assert(!covers(r.left + pe[0], r.top + pe[1]), 'the menu covers the clicked point');
    UI.closeMenus();
    var pl = rskScr([5, 0]);
    UI.sketchMenu(pl[0], pl[1]);
    var on = rfcMenu().join(' | ');
    ['Construction Geometry', 'Smart Dimension', 'Add Relation', 'Display/Delete Relations', 'Trim Entities', 'Offset Entities', 'Mirror Entities', 'Properties…', 'Delete', 'Exit Sketch'].forEach(function (n) { assert(on.indexOf(n) >= 0, 'entity menu lacks ' + n + ': ' + on); });
    assert(!covers(r.left + pl[0], r.top + pl[1]), 'the entity menu covers the clicked point');
    Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Properties…/.test(m.textContent); })[0].click();
    assert(UI.pmTitle() === 'Line Properties', 'Properties… opens ' + UI.pmTitle());
    UI.closePM();
    // near the window's bottom-right corner the menu opens up and to the left of the point
    var Wd = W.innerWidth, Ht = W.innerHeight;
    UI.showMenu(Wd - 6, Ht - 6, UI.sketchMenuItems([]));
    var m = D.querySelector('.menu').getBoundingClientRect();
    assert(m.right <= Wd - 6 && m.left >= 0 && m.top >= 0 && !covers(Wd - 6, Ht - 6), 'corner menu at ' + JSON.stringify([m.left, m.top, m.right, m.bottom]));
    UI.closeMenus();
    return 'empty space: ' + empty.split(' | ').length + ' rows, on a line: ' + on.split(' | ').length + ' rows';
  });
  step('rfC: PropertyManager renderer — groups with the blue header band and the round collapse chevron (title text only), value boxes with the unit inside and spin arrows that step without taking the focus, the yellow Message box, a sketch tool\'s PM keeps the keyboard with the graphics area, Enter accepts and Esc cancels, opening and closing moves nothing', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 30, y1: 0, x2: 30, y2: 20 }); UI.updateSketches();
    var vp0 = $('viewport').getBoundingClientRect(), left0 = $('left').getBoundingClientRect(), rib0 = $('ribbon').offsetHeight;
    UI.cmdSketchFillet();
    var h = D.querySelector('#pm .pm-group > h4'), g = h.parentElement;
    assert(h.textContent === 'Entities to Fillet' && h.querySelector('.tw') && h.querySelector('.tw').textContent === '' && h.getAttribute('aria-expanded') === 'true', 'group header ' + h.textContent);
    assert(/gradient/.test(W.getComputedStyle(h).backgroundImage) && W.getComputedStyle(h.querySelector('.tw'), '::after').content !== 'none', 'blue band with the chevron');
    h.click();
    assert(g.classList.contains('collapsed') && h.getAttribute('aria-expanded') === 'false', 'collapse');
    h.click();
    var msg = D.querySelector('#pm .pm-msg');
    assert(msg && W.getComputedStyle(msg, '::before').content === '"Message"' && /Select a sketch vertex/.test(msg.textContent), 'Message box ' + (msg && W.getComputedStyle(msg, '::before').content));
    var inp = D.querySelector('#pm input.pm-num[data-key="r"]') || D.querySelector('#pm input.pm-num'), wrap = inp.parentElement;
    assert(wrap.classList.contains('pm-num-wrap') && wrap.querySelector('.unit').textContent === UI.unitLabel() && wrap.querySelectorAll('.pm-spin button').length === 2, 'value box: number, unit, spin arrows');
    var key = inp.getAttribute('data-key'), v0 = +UI.pmSpec().values[key];
    if (D.activeElement && D.activeElement.blur) D.activeElement.blur();
    var up = wrap.querySelector('.pm-spin-up'), ev = new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    up.dispatchEvent(ev); up.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true, button: 0 }));
    near(+UI.pmSpec().values[key], v0 + (UI.unitLabel() === 'in' ? 0.1 : 1), 1e-9, 'spin up');
    assert(ev.defaultPrevented && D.activeElement !== up, 'the spin arrow took the focus');
    // the boxes of a PM share one width (aligned)
    var widths = {}; Array.prototype.forEach.call(D.querySelectorAll('#pm .pm-num-wrap'), function (w) { widths[w.offsetWidth] = 1; });
    assert(Object.keys(widths).length === 1, 'value box widths ' + Object.keys(widths).join(','));
    inp.focus(); inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(!UI.hasPM(), 'Enter did not accept');
    UI.cmdOffsetEntities();
    $('pm').dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    assert(!UI.hasPM(), 'Esc did not cancel');
    // a sketch tool's PM (noFocus): its Message group is yellow; a click on a check box acts without focusing it
    UI.setTool('line');
    var mg = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-group'), function (x) { return x.querySelector('h4').textContent === 'Message'; })[0];
    assert(mg && mg.classList.contains('pm-group-msg'), 'Insert Line Message group');
    var cb = D.querySelector('#pm input[type=checkbox][data-key="construction"]'), md = new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 });
    cb.dispatchEvent(md);
    assert(md.defaultPrevented && D.activeElement !== cb, 'the check box took the focus in a sketch tool PM');
    UI.setTool('select');
    assert(!UI.hasPM(), 'Insert Line closed with the tool');
    // a selection list shows each item's own icon (Line1: the line glyph)
    UI.setSelection([{ kind: 'entity', index: 0 }]); UI.cmdMirrorEntities();
    var it0 = D.querySelector('#pm .pm-item'), ref = D.createElement('div'); ref.innerHTML = W.Icons('line', 14);
    assert(it0 && /^Line1/.test(it0.textContent) && it0.firstChild.outerHTML === ref.firstChild.outerHTML && it0.closest('.pm-pickwrap').classList.contains('has-list'), 'selection list row ' + (it0 && it0.textContent));
    UI.pmCancel();
    var vp1 = $('viewport').getBoundingClientRect(), left1 = $('left').getBoundingClientRect();
    assert(vp1.left === vp0.left && vp1.width === vp0.width && vp1.top === vp0.top && left1.width === left0.width && $('ribbon').offsetHeight === rib0, 'layout moved: ' + JSON.stringify([vp0.left, vp1.left, vp0.width, vp1.width, left0.width, left1.width]));
    return 'ok';
  });
  step('rfC: status bar — Under / Fully / Over Defined in SolidWorks\' colours with a dot; the pointer readout has a fixed slot, so nothing beside it moves', async function () {
    await rskNew();
    UI.refreshStatus();
    var st = D.querySelector('#status-right .sk-state');
    assert(st && st.classList.contains('under') && W.getComputedStyle(st).color === 'rgb(31, 95, 208)' && W.getComputedStyle(st, '::before').content !== 'none', 'Under Defined in blue: ' + (st && W.getComputedStyle(st).color));
    var co = $('status-coords'), right = $('status-right');
    co.textContent = 'X: 1'; var w1 = co.offsetWidth, r1 = right.getBoundingClientRect().left;
    co.textContent = 'X:   12345.67   Y:   -9876.54  mm   L 1234.56   A 179.9°'; var w2 = co.offsetWidth, r2 = right.getBoundingClientRect().left;
    co.textContent = '';
    assert(w1 === w2 && r1 === r2, 'the readout moved the bar: ' + [w1, w2, r1, r2].join(', '));
    await UI.exitSketch(true); await idle();
    return 'ok';
  });
  step('rfC: dark grounds — with the Dark background (light theme) or the dark theme the sketch overlays (dimension text and arrows, inference lines, relation glyphs) take the dark-ground colours; the Levels pane is styled from style.css', async function () {
    var dl = $('dim-layer');
    function v(name) { return W.getComputedStyle(dl).getPropertyValue(name).trim().toLowerCase(); }
    UI.setTheme('light'); UI.setBackground('gradient');
    var light = [v('--dim-text'), v('--blue')];
    UI.setBackground('dark');
    var dark = [v('--dim-text'), v('--blue')];
    UI.setBackground('gradient'); UI.setTheme('dark');
    var theme = [v('--dim-text'), v('--blue')];
    UI.setTheme('light'); UI.setBackground('gradient');
    // rfBR: the graphics area is grey-black with every background and theme: the dark-ground colours always, no blue
    assert([light, dark, theme].every(function (x) { return x[0] === '#f2f2f2' && x[1] === '#e0e0e0'; }), 'light ' + light + ' / dark bg ' + dark + ' / dark theme ' + theme);
    var css = Array.prototype.filter.call(D.styleSheets, function (s) { return /style\.css$/.test(s.href || ''); })[0];
    assert(css && Array.prototype.some.call(css.cssRules, function (r) { return r.selectorText === '.lvl-row.main'; }), 'the Levels rules are not in style.css');
    return 'ok';
  });
  step('rfC: every Sketch tab command runs in a sketch without a console error (each one, then ✗ / Esc)', async function () {
    var errs0 = errors.length, ran = [];
    await rskNew();
    function reset() {
      if (!$('modal').hidden) UI.closeModal();
      UI.closeMenus(); if (UI.closeShortcutBar) UI.closeShortcutBar();
      if (UI.hasPM()) UI.pmCancel();
      if (UI.App.mode === 'sketch' && UI.App.tool !== 'select') UI.setTool('select');
      var tree = D.querySelector('#fm-tabs button[data-tab="tree"]'); if (UI.App.fmTab === 'levels' && tree) tree.click();
    }
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: -20, y1: -10, x2: 20, y2: -10 }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 }, { t: 'circle', cx: 0, cy: 10, r: 6 }); UI.updateSketches();
    UI.setRibbonTab('Sketch');
    var skip = { sketch: 1, importDxf: 1 };   // Sketch is Exit Sketch here; Insert DXF / DWG opens the file dialog
    var list = rfcSketchItems().filter(function (x) { return (x.it.run || x.it.tool) && !skip[x.it.id]; });
    for (var k = 0; k < list.length; k++) {
      var x = list[k];
      if (UI.App.mode !== 'sketch') { await UI.newSketchOnPlane('Front'); await idle(); UI.setRibbonTab('Sketch'); }
      if (x.fly) UI.ribbonFlyFace(x.fly, x.i);
      var b = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (e) { return (e.getAttribute('aria-label') || '') === x.face; })[0];
      assert(b && !b.disabled, x.it.label + ': no live button');
      b.click(); await wait(10);
      if (x.it.id === 'shadedContours') b.click();   // a view toggle: put it back
      ran.push(x.it.label.replace(/\n/g, ' '));
      reset(); await idle();
      assert(errors.length === errs0, x.it.label + ': ' + errors.slice(errs0).join(' | '));
    }
    UI.RIBBON.Sketch.forEach(function (x) { (x.stack || [x]).forEach(function (s) { if (s.fly) UI.ribbonFlyFace(s.fly, 0); }); });
    if (UI.App.mode === 'sketch') { await UI.exitSketch(true); await idle(); }
    UI.setRibbonTab('Features');
    assert(errors.length === errs0, errors.slice(errs0).join(' | '));
    return ran.length + ' commands';
  });
  // --- end rfC ---
