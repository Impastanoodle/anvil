  // --- rfBJ ---
  // (2026-10-13) Mastercam's Transform tab (ui-transform.js): the tab with its 15 buttons, group captions, tooltips and
  // Search Commands; Translate (window-selected, 3 copies, Join), Rotate (4 copies round a picked point), Mirror (about a
  // picked line, Move: the relations to other geometry dropped), Move to Origin, Dynamic (an arrow dragged, a value
  // typed); ✓+; the engine UI.transformEntities on every entity type. Coordinates exact, one undo step each.
  function rfBJEv(type, p, target, mods) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  async function rfBJClick(p) { rfBJEv('mousemove', p); await wait(10); rfBJEv('mousedown', p, $('viewport')); rfBJEv('mouseup', p); await idle(); await wait(20); }
  async function rfBJDrag(from, to, during) {
    rfBJEv('mousemove', from); rfBJEv('mousedown', from, $('viewport'));
    for (var k = 1; k <= 8; k++) { rfBJEv('mousemove', [from[0] + (to[0] - from[0]) * k / 8, from[1] + (to[1] - from[1]) * k / 8]); await wait(15); }
    if (during) during();
    rfBJEv('mouseup', to);
    await idle(); await wait(20);
  }
  function rfBJScr(p) { return UI.worldToScreen(K.to3D(UI.activePlane(), p[0], p[1])); }
  async function rfBJNew(ents, rels) {
    await anvil.newPart(); await idle();
    await UI.newSketchOnPlane('Front'); await idle();
    assert(UI.App.mode === 'sketch', 'not in a sketch');
    UI.zoomView(0.25 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    ents.forEach(function (e) { f.entities.push(e); });
    (rels || []).forEach(function (r) { var x = W.SketchSolver.addRelation(f, r[0], r[1]); assert(x.ok, 'relation ' + r[0] + ': ' + x.error); });
    UI.updateSketches(); UI.setSelection([]); await wait(20);
    return f;
  }
  function rfBJSquare(x, y, s) {
    return [{ t: 'line', x1: x, y1: y, x2: x + s, y2: y }, { t: 'line', x1: x + s, y1: y, x2: x + s, y2: y + s }, { t: 'line', x1: x + s, y1: y + s, x2: x, y2: y + s }, { t: 'line', x1: x, y1: y + s, x2: x, y2: y }];
  }
  function rfBJTab() {
    var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent === 'Transform'; })[0];
    assert(tab, 'a Transform tab');
    tab.click();
    return tab;
  }
  function rfBJButton(label) {
    var b = D.querySelector('#ribbon-buttons .rb[aria-label="' + label + '"]');
    assert(b, 'ribbon button ' + label);
    return b;
  }
  async function rfBJRun(label) { rfBJTab(); await wait(10); rfBJButton(label).click(); await idle(); await wait(20); }
  function rfBJToast() { var t = D.querySelector('.toast'); return t ? t.textContent : ''; }
  function rfBJLine(e, x1, y1, x2, y2, what) {
    assert(e && e.t === 'line' && e.x1 === x1 && e.y1 === y1 && e.x2 === x2 && e.y2 === y2, (what || 'line') + ': ' + JSON.stringify(e) + ' expected (' + [x1, y1, x2, y2].join(', ') + ')');
  }
  function rfBJPick(text) {   // a PM selection box by its placeholder / value text
    var b = Array.prototype.filter.call(D.querySelectorAll('#pm .pm-pick'), function (p) { return p.textContent.indexOf(text) >= 0; })[0];
    assert(b, 'PM box ' + text);
    return b;
  }
  async function rfBJOkPlus() { var b = D.querySelector('#pm .pm-actions button[title^="OK and keep open"]'); assert(b, '✓+ button'); b.click(); await idle(); await wait(20); }
  async function rfBJOk() { var b = D.querySelector('#pm .pm-actions .pm-ok'); assert(b, '✓ button'); b.click(); await idle(); await wait(20); }

  step('rfBJ: the Transform tab after Sheet Metal — Position (Dynamic … Roll), Offset (Entity, Chains), Layout (Geometry Nesting, Rectangular Array / Distribute stacked), Size (Stretch, Scale) with their captions under them, tooltips, Search Commands finds them (Mirror as "Mirror (Transform)"); outside a sketch they ask for one; a command not loaded toasts "not available yet"', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    var names = Array.prototype.map.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (t) { return t.textContent; });
    assert(names.indexOf('Transform') === names.indexOf('Sheet Metal') + 1, 'tab order: ' + names.join(', '));
    rfBJTab(); await wait(40);
    var want = ['Dynamic', 'Translate', 'Translate to Plane', 'Rotate', 'Project', 'Move to Origin', 'Mirror', 'Roll', 'Offset Entity', 'Offset Chains', 'Geometry Nesting', 'Rectangular Array', 'Distribute', 'Stretch', 'Scale'];
    var got = Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label'); });
    assert(got.join('|') === want.join('|'), 'buttons: ' + got.join(', '));
    want.forEach(function (l) { assert(!rfBJButton(l).disabled, l + ' is enabled'); });
    assert(rfBJButton('Rectangular Array').closest('.rb-stack') === rfBJButton('Distribute').closest('.rb-stack') && rfBJButton('Distribute').closest('.rb-stack'), 'Rectangular Array and Distribute stacked');
    // captions: one per group, under that group's buttons
    UI.transformCaptions(); await wait(30);
    var caps = Array.prototype.map.call(D.querySelectorAll('#ribbon .rb-caption'), function (c) { return { t: c.textContent, r: c.getBoundingClientRect() }; });
    assert(caps.map(function (c) { return c.t; }).join(',') === 'Position,Offset,Layout,Size', 'captions: ' + caps.map(function (c) { return c.t; }).join(','));
    function under(cap, label) { var r = rfBJButton(label).getBoundingClientRect(); return r.left >= cap.r.left - 1 && r.right <= cap.r.right + 1 && cap.r.top >= r.bottom - 2; }
    assert(under(caps[0], 'Dynamic') && under(caps[0], 'Roll') && under(caps[1], 'Offset Chains') && under(caps[2], 'Distribute') && under(caps[3], 'Scale') && !under(caps[0], 'Offset Entity'), 'captions sit under their groups');
    // tooltips
    var tip = rfBJButton('Translate').getAttribute('data-tip') || rfBJButton('Translate').title || '';
    if (!tip && UI.ribbonItemState) { var it = UI.RIBBON.Transform[1]; tip = UI.ribbonItemState(it).tip.desc; }
    assert(/Delta X/.test(tip), 'Translate tooltip: ' + tip);
    // Search Commands
    var hits = UI.searchCommands('translate').map(function (h) { return h.name + '@' + h.where; });
    assert(hits.indexOf('Translate@Transform') >= 0 && hits.indexOf('Translate to Plane@Transform') >= 0, 'search translate: ' + hits.join(', '));
    hits = UI.searchCommands('mirror').map(function (h) { return h.name; });
    assert(hits.indexOf('Mirror (Transform)') >= 0, 'search mirror: ' + hits.join(', '));
    assert(UI.searchCommands('geometry nesting').some(function (h) { return h.name === 'Geometry Nesting'; }), 'search nesting');
    // outside a sketch
    rfBJButton('Translate').click(); await idle();
    assert(rfBJToast() === 'Open a sketch: Transform acts on sketch geometry', 'toast: ' + rfBJToast());
    assert(!UI.pmTitle(), 'no PM outside a sketch');
    // a command that is not loaded
    var keep = UI.cmdTRoll; UI.cmdTRoll = undefined;
    rfBJButton('Roll').click(); await idle();
    UI.cmdTRoll = keep;
    assert(rfBJToast() === 'Roll is not available yet.', 'toast: ' + rfBJToast());
    UI.App.ribbonTab = 'Features'; UI.refreshRibbon(); await wait(30);
    assert(!D.querySelector('#ribbon .rb-caption'), 'no captions on the Features tab');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return got.length + ' buttons';
  });

  step('rfBJ: Translate — a 10 × 10 square window-selected with the real mouse, Join with 3 copies at Delta X 20: three copies at x 20, 40, 60, twelve join lines between corresponding corners, the circle left alone; the result selected; one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10).concat([{ t: 'circle', cx: 40, cy: 40, r: 3 }]));
    await rfBJDrag(rfBJScr([-3, 13]), rfBJScr([13, -3]));   // left to right: a window round the square only
    var sel = anvil.selection().map(function (s) { return s.index; }).sort();
    assert(sel.join() === '0,1,2,3', 'window-selected the square: ' + sel.join());
    await rfBJRun('Translate');
    assert(UI.pmTitle() === 'Translate', 'PM ' + UI.pmTitle());
    assert(UI.pmSpec().values.entities.join() === '0,1,2,3', 'the selection is in the box');
    var u0 = UI.App.undo.length;
    UI.pmSetValue('op', 'join'); UI.renderPM(); UI.pmSetValue('count', 3); UI.pmSetValue('dx', 20); UI.pmSetValue('dy', 0); await wait(20);
    assert(UI.App.tempEntities.length === 24, 'preview: 12 copies and 12 join lines, ' + UI.App.tempEntities.length);
    await rfBJOk();
    f = UI.activeSketchFeature();
    var E = f.entities;
    assert(E.length === 5 + 12 + 12, 'entities ' + E.length);
    assert(JSON.stringify(E[4]) === JSON.stringify({ t: 'circle', cx: 40, cy: 40, r: 3 }), 'circle untouched');
    for (var k = 1; k <= 3; k++) {
      var b = 5 + (k - 1) * 4, x = 20 * k;
      rfBJLine(E[b], x, 0, x + 10, 0, 'copy ' + k + ' bottom'); rfBJLine(E[b + 1], x + 10, 0, x + 10, 10, 'copy ' + k + ' right');
      rfBJLine(E[b + 2], x + 10, 10, x, 10, 'copy ' + k + ' top'); rfBJLine(E[b + 3], x, 10, x, 0, 'copy ' + k + ' left');
    }
    var joins = E.slice(17);
    [[0, 0], [10, 0], [10, 10], [0, 10]].forEach(function (c) {
      for (var j = 1; j <= 3; j++) assert(joins.some(function (e) { return e.t === 'line' && e.x1 === c[0] + 20 * (j - 1) && e.y1 === c[1] && e.x2 === c[0] + 20 * j && e.y2 === c[1]; }), 'join line from corner ' + c + ' step ' + j);
    });
    assert(anvil.selection().length === 24, 'the result is selected: ' + anvil.selection().length);
    assert(UI.App.undo.length - u0 === 1, 'one undo step: ' + (UI.App.undo.length - u0));
    UI.undo(); await idle();
    assert(UI.activeSketchFeature().entities.length === 5, 'undone');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '3 copies, 12 joins';
  });

  step('rfBJ: Rotate — a line picked with the real mouse, the centre picked on a sketch point at (5, 0), 45° × 4 copies: the 90° copy runs (5, 5)–(5, 15), the 180° one (0, 0)–(−10, 0); Total sweep 360 spreads them 90° apart; Translate keeps the direction; one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew([{ t: 'line', x1: 10, y1: 0, x2: 20, y2: 0 }, { t: 'point', x: 5, y: 0 }]);
    await rfBJClick(rfBJScr([15, 0]));
    assert(anvil.selection().map(function (s) { return s.index; }).join() === '0', 'line selected: ' + JSON.stringify(anvil.selection()));
    await rfBJRun('Rotate');
    assert(UI.pmTitle() === 'Rotate' && UI.pmSpec().values.entities.join() === '0', 'Rotate PM with the line');
    rfBJPick('Center').click(); await wait(20);
    assert(UI.pmSpec().values.box === 'center', 'the Center box takes the next click');
    await rfBJClick(rfBJScr([5, 0]));
    var v = UI.pmSpec().values;
    assert(v.center[0] === 5 && v.center[1] === 0, 'centre picked on the point: ' + v.center);
    var u0 = UI.App.undo.length;
    UI.pmSetValue('op', 'copy'); UI.renderPM(); UI.pmSetValue('count', 4); UI.pmSetValue('angle', 45); await wait(20);
    assert(UI.App.tempEntities.length === 4, 'preview 4 copies');
    await rfBJOk();
    var E = UI.activeSketchFeature().entities;
    assert(E.length === 6, 'entities ' + E.length);
    rfBJLine(E[0], 10, 0, 20, 0, 'the original');
    rfBJLine(E[3], 5, 5, 5, 15, '90° copy');
    rfBJLine(E[5], 0, 0, -10, 0, '180° copy');
    near(E[2].x1, 5 + 5 * Math.SQRT1_2, 1e-9, '45° copy x'); near(E[2].y1, 5 * Math.SQRT1_2, 1e-9, '45° copy y');
    assert(UI.App.undo.length - u0 === 1, 'one undo step');
    UI.undo(); await idle();
    // Total sweep and Translate (keep direction)
    await rfBJClick(rfBJScr([15, 0]));
    await rfBJRun('Rotate');
    UI.pmSetValue('op', 'copy'); UI.renderPM(); UI.pmSetValue('count', 4); UI.pmSetValue('angle', 360); UI.pmSetValue('spacing', 'total'); await wait(20);
    var T = UI.App.tempEntities;
    assert(T.length === 4 && T[0].x1 === 0 && T[0].y1 === 10 && T[1].x1 === -10 && T[1].y1 === 0 && T[3].x1 === 10 && T[3].y1 === 0, 'Total sweep: every 90° about the origin ' + JSON.stringify(T));
    UI.pmSetValue('method', 'translate'); await wait(20);
    T = UI.App.tempEntities;
    rfBJLine(T[0], -5, 15, 5, 15, 'Translate: the copy keeps its direction');
    UI.pmCancel(); await idle();
    assert(UI.activeSketchFeature().entities.length === 2, '✗ leaves the sketch');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '4 copies';
  });

  step('rfBJ: Mirror about a picked line, Move — a line, an arc and text mirrored about the vertical line x = 30 clicked with the real mouse: (0, 0)–(10, 5) goes to (60, 0)–(50, 5), the arc 0°–90° at (10, 0) to 90°–180° at (50, 0), the text stays readable (Mirror text on: flipped); the Coincident to a point left behind is dropped and counted; one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 5 }, { t: 'arc', cx: 10, cy: 0, r: 2, a0: 0, a1: 90 }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 20 }, { t: 'point', x: 0, y: 0 },
      { t: 'text', x: 0, y: 10, h: 2, str: 'AB' }], [['coincident', ['0.p1', '3']]]);
    UI.setSelection([{ kind: 'entity', index: 0 }, { kind: 'entity', index: 1 }, { kind: 'entity', index: 4 }]); await wait(20);
    await rfBJRun('Mirror');
    assert(UI.pmTitle() === 'Mirror', 'PM ' + UI.pmTitle());
    UI.pmSetValue('op', 'move'); UI.renderPM(); UI.pmSetValue('axis', 'line'); UI.renderPM(); await wait(20);
    assert(UI.pmSpec().values.box === 'axis', 'Line: the next click picks the mirror line');
    await rfBJClick(rfBJScr([30, 15]));
    var v = UI.pmSpec().values;
    assert(v.line === 2 && v.box === 'entities' && v.entities.join() === '0,1,4', 'mirror line picked: ' + v.line + ' box ' + v.box + ' ' + v.entities);
    var u0 = UI.App.undo.length;
    await rfBJOk();
    f = UI.activeSketchFeature();
    var E = f.entities;
    rfBJLine(E[0], 60, 0, 50, 5, 'mirrored line');
    assert(E[1].t === 'arc' && E[1].cx === 50 && E[1].cy === 0 && E[1].r === 2 && E[1].a0 === 90 && E[1].a1 === 180, 'mirrored arc ' + JSON.stringify(E[1]));
    assert(E[4].t === 'text' && !E[4].flipV && !(+E[4].rot) && E[4].x > 45, 'readable text moved to the other side ' + JSON.stringify(E[4]));
    assert(!(f.rels || []).length, 'the Coincident to the point left behind is dropped');
    assert(/1 relation to other geometry dropped/.test(statusText()), 'status: ' + statusText());
    assert(UI.App.undo.length - u0 === 1, 'one undo step');
    UI.undo(); await idle();
    rfBJLine(UI.activeSketchFeature().entities[0], 0, 0, 10, 5, 'undone');
    // Mirror text on (Copy): the copy reads mirrored
    UI.setSelection([{ kind: 'entity', index: 4 }]); await wait(20);
    await rfBJRun('Mirror');
    UI.pmSetValue('axis', 'x'); UI.pmSetValue('mirrorText', true); await wait(20);
    await rfBJOk();
    E = UI.activeSketchFeature().entities;
    assert(E.length === 6 && E[5].t === 'text' && E[5].flipV && E[5].y === -10, 'mirrored text copy ' + JSON.stringify(E[5]));
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'mirrored';
  });

  step('rfBJ: Move to Origin — nothing selected, a click on the corner (30, 20) with the real mouse moves the whole sketch so it lands on the origin at once; one undo step', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(30, 20, 10).concat([{ t: 'circle', cx: 35, cy: 25, r: 2 }]));
    await rfBJRun('Move to Origin');
    assert(UI.pmTitle() === 'Move to Origin' && UI.pmSpec().values.box === 'pt', 'Move to Origin waits for the point');
    var u0 = UI.App.undo.length;
    await rfBJClick(rfBJScr([30, 20]));
    assert(!UI.pmTitle(), 'done at once');
    var E = UI.activeSketchFeature().entities;
    rfBJLine(E[0], 0, 0, 10, 0, 'bottom'); rfBJLine(E[2], 10, 10, 0, 10, 'top');
    assert(E[4].cx === 5 && E[4].cy === 5, 'circle moved ' + JSON.stringify(E[4]));
    assert(UI.App.undo.length - u0 === 1, 'one undo step');
    UI.undo(); await idle();
    rfBJLine(UI.activeSketchFeature().entities[0], 30, 20, 40, 20, 'undone');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'moved (-30, -20)';
  });

  step('rfBJ: Dynamic — the gnomon\'s X arrow dragged with the real mouse moves the square along X (the value box shows the distance), 25 typed in the box sets it exactly; ✓ moves it 25, one undo step; the ring turns it', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew(rfBJSquare(0, 0, 10));
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; })); await wait(20);
    await rfBJRun('Dynamic');
    assert(UI.pmTitle() === 'Dynamic', 'PM ' + UI.pmTitle());
    rfBJPick('Origin').click(); await wait(20);
    await rfBJClick(rfBJScr([10, 10]));
    var v = UI.pmSpec().values;
    assert(v.origin[0] === 10 && v.origin[1] === 10, 'gnomon placed on the corner: ' + v.origin);
    await wait(40);
    var g = UI.pmSpec().transform === 'dynamic' && D.querySelector('.tf-gnomon');
    assert(g && g.childNodes.length >= 4, 'the gnomon is drawn');
    var o = rfBJScr([10, 10]), from = [o[0] + 40, o[1]];
    var box = D.querySelector('.tf-dyn-val'), during = null;
    await rfBJDrag(from, [from[0] + 60, from[1]], function () { during = box.hidden ? null : box.value; });
    v = UI.pmSpec().values;
    assert(v.dx > 0 && v.dy === 0 && v.ang === 0, 'dragged along X: ' + v.dx + ', ' + v.dy);
    assert(during != null && +during === v.dx, 'the box showed the distance while dragging: ' + during);
    assert(!box.hidden && D.activeElement === box, 'the value box takes the keyboard after the drag');
    box.value = '25';
    box.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await wait(20);
    v = UI.pmSpec().values;
    assert(v.dx === 25 && v.dy === 0, 'typed 25: ' + v.dx + ', ' + v.dy);
    var u0 = UI.App.undo.length;
    await rfBJOk();
    var E = UI.activeSketchFeature().entities;
    rfBJLine(E[0], 25, 0, 35, 0, 'bottom'); rfBJLine(E[2], 35, 10, 25, 10, 'top');
    assert(UI.App.undo.length - u0 === 1, 'one undo step');
    assert(!D.querySelector('.tf-gnomon') && !D.querySelector('.tf-dyn-val'), 'the gnomon goes with the PM');
    // the ring: a quarter turn about the gnomon
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; })); await wait(20);
    await rfBJRun('Dynamic');
    await wait(40);
    var gg = UI.pmSpec() && D.querySelector('.tf-gnomon'), c0 = rfBJScr([0, 0]);
    assert(gg, 'gnomon again');
    var q = 44 / Math.SQRT2;   // a point on the ring at 45° (screen y runs down), dragged round to 135°
    await rfBJDrag([c0[0] + q, c0[1] - q], [c0[0] - q, c0[1] - q]);
    v = UI.pmSpec().values;
    assert(v.ang !== 0 && v.dx === 0 && v.dy === 0, 'the ring turned it: ' + v.ang);
    var bx = D.querySelector('.tf-dyn-val');
    bx.value = '90'; bx.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); await wait(20);
    assert(UI.pmSpec().values.ang === 90, 'typed 90°');
    await rfBJOk();
    E = UI.activeSketchFeature().entities;
    rfBJLine(E[0], 0, 25, 0, 35, 'bottom turned 90° about the origin');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'moved 25, turned 90°';
  });

  step('rfBJ: ✓+ — Translate Delta X 5 applied twice from one PropertyManager: the line ends 10 along, two undo steps, the PM stays open with the result in its box', async function () {
    var errs0 = errors.length;
    var f = await rfBJNew([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }]);
    UI.setSelection([{ kind: 'entity', index: 0 }]); await wait(20);
    await rfBJRun('Translate');
    UI.pmSetValue('dx', 5); await wait(20);
    var u0 = UI.App.undo.length;
    await rfBJOkPlus();
    assert(UI.pmTitle() === 'Translate' && UI.pmSpec().values.entities.join() === '0', 'still open with the result');
    await rfBJOkPlus();
    rfBJLine(UI.activeSketchFeature().entities[0], 10, 0, 20, 0, 'moved twice');
    assert(UI.App.undo.length - u0 === 2, 'two undo steps');
    UI.pmCancel(); await idle();
    rfBJLine(UI.activeSketchFeature().entities[0], 10, 0, 20, 0, '✗ after ✓+ keeps what was applied');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'applied twice';
  });

  step('rfBJ: UI.transformEntities — every entity type by a rotation, a mirror and an uneven scale (circles to ellipses, arcs to partial ellipses, slots to outlines, text refused); rectangles stay rectangles on a quarter turn and turn into four lines otherwise; a block instance copies as a new instance; relations inside the selection survive a move; copies carry none', async function () {
    var errs0 = errors.length, A = UI.transformAffine;
    var ents = [{ t: 'line', x1: 0, y1: 0, x2: 4, y2: 0 }, { t: 'arc', cx: 0, cy: 0, r: 2, a0: 0, a1: 90 }, { t: 'circle', cx: 5, cy: 5, r: 1 }, { t: 'ellipse', cx: 0, cy: 8, rx: 3, ry: 1, rot: 0 },
      { t: 'pellipse', cx: 0, cy: -8, rx: 3, ry: 1, rot: 0, a0: 0, a1: 90 }, { t: 'spline', pts: [[0, 0], [2, 3], [5, 1]] }, { t: 'spline', style: true, pts: [[0, 0], [1, 2], [3, 2], [4, 0]] },
      { t: 'slot', x1: 10, y1: 0, x2: 14, y2: 0, w: 2 }, { t: 'aslot', cx: 0, cy: 0, r: 6, a0: 10, a1: 60, w: 1 }, { t: 'poly', cx: -6, cy: 0, r: 2, n: 6, rot: 0 }, { t: 'rect', x: 20, y: 0, w: 4, h: 2 },
      { t: 'crect', cx: 30, cy: 0, w: 4, h: 2 }, { t: 'polyline', pts: [[0, 20], [2, 21], [4, 20]] }, { t: 'point', x: 7, y: -3 }, { t: 'text', x: 0, y: 30, h: 2, str: 'X' }];
    var f = await rfBJNew(ents, [['horizontal', ['0']], ['coincident', ['0.p1', '1.c']]]);
    var all = ents.map(function (e, i) { return i; });
    // a quarter turn about the origin, copied: every type survives, a rectangle comes as four lines
    var r = UI.transformEntities(f, all, A.rotate(90, 0, 0), { copy: true, select: false });
    assert(r.ok, r.error);
    var E = UI.activeSketchFeature().entities, n = ents.length;
    rfBJLine(E[n], 0, 0, 0, 4, 'line turned');
    assert(E[n + 1].t === 'arc' && E[n + 1].a0 === 90 && E[n + 1].a1 === 180, 'arc turned ' + JSON.stringify(E[n + 1]));
    assert(E[n + 2].cx === -5 && E[n + 2].cy === 5, 'circle turned');
    assert(E[n + 3].t === 'ellipse' && E[n + 3].rot === 90 && E[n + 3].cx === -8, 'ellipse turned ' + JSON.stringify(E[n + 3]));
    assert(r.added.length === ents.length, 'added ' + r.added.length);
    var rc = E[n + 10];
    assert(rc.t === 'rect' && rc.x === -2 && rc.y === 20 && rc.w === 2 && rc.h === 4, 'a quarter turn keeps a rectangle a rectangle ' + JSON.stringify(rc));
    var r30 = UI.transformEntities(UI.activeSketchFeature(), [10, 11], A.rotate(30, 0, 0), { copy: true, select: false });
    assert(r30.ok && r30.added.length === 8 && r30.added.every(function (i) { return UI.activeSketchFeature().entities[i].t === 'line'; }), 'turned 30°, the rectangles are four lines each');
    E = UI.activeSketchFeature().entities;
    assert(!r.added.some(function (i) { return (UI.activeSketchFeature().rels || []).some(function (rel) { return rel.refs.some(function (x) { return parseInt(x, 10) === i; }); }); }), 'copies carry no relations');
    // a move of the line and the arc together keeps their Coincident and turns Horizontal to Vertical
    f = UI.activeSketchFeature();
    r = UI.transformEntities(f, [0, 1], A.rotate(90, 0, 0), { select: false });
    assert(r.ok && r.dropped === 0, 'moved ' + JSON.stringify(r));
    var rels = UI.activeSketchFeature().rels.map(function (x) { return x.type; }).sort().join();
    assert(rels === 'coincident,vertical', 'relations inside the selection: ' + rels);
    // a mirror about the Y axis: a partial ellipse runs backwards, text stays readable unless mirrorText
    f = UI.activeSketchFeature();
    var t0 = JSON.parse(JSON.stringify(f.entities[14]));
    r = UI.transformEntities(f, [4, 14], A.mirror(0, 0, 90), { copy: true, select: false });
    E = UI.activeSketchFeature().entities;
    var pe = E[r.added[0]], tx = E[r.added[1]];
    assert(pe.t === 'pellipse' && pe.cx === 0 && pe.rot === 180 && pe.a0 === 270 && pe.a1 === 360, 'mirrored partial ellipse ' + JSON.stringify(pe));
    assert(tx.t === 'text' && !tx.flipV && (+tx.rot || 0) === 0 && tx.y === t0.y, 'readable mirrored text ' + JSON.stringify(tx));
    r = UI.transformEntities(f, [14], A.mirror(0, 0, 90), { copy: true, mirrorText: true, select: false });
    assert(UI.activeSketchFeature().entities[r.added[0]].flipV, 'Mirror text flips it');
    // an uneven scale: a circle becomes an ellipse, an arc a partial ellipse, a slot an outline; text is refused
    f = UI.activeSketchFeature();
    r = UI.transformEntities(f, [2, 1, 7], A.scale(2, 1, 0, 0), { copy: true, select: false });
    E = UI.activeSketchFeature().entities;
    var a2 = E[r.added[0]], c2 = E[r.added[1]], s2 = E[r.added[2]];   // in index order: the arc, the circle, the slot
    assert(r.ok && c2.t === 'ellipse' && Math.abs(c2.rx - 2) < 1e-9 && Math.abs(c2.ry - 1) < 1e-9 && c2.cx === 10, 'circle stretched to an ellipse ' + JSON.stringify(c2));
    assert(a2.t === 'pellipse' && Math.abs(a2.rx - 4) < 1e-9 && Math.abs(a2.ry - 2) < 1e-9, 'arc stretched to a partial ellipse ' + JSON.stringify(a2));
    assert(s2.t === 'polyline' && s2.closed, 'slot stretched to its outline');
    var u0 = UI.App.undo.length;
    r = UI.transformEntities(f, [14], A.scale(2, 1, 0, 0), { select: false });
    assert(!r.ok && /stretched unevenly/.test(r.error) && UI.App.undo.length === u0, 'text refused, no undo step: ' + r.error);
    // a block instance: a quarter-turn copy is a new instance of the same block
    if (K.makeBlock) {
      var g = await rfBJNew(rfBJSquare(0, 0, 2));
      var mb = K.makeBlock(g, [0, 1, 2, 3], 'SQ', [0, 0]);
      assert(mb && mb.ok !== false, 'block made');
      var n0 = g.entities.length;
      r = UI.transformEntities(g, [0], A.rotate(90, 10, 0), { copy: true, select: false });
      assert(r.ok, r.error);
      var inst = K.blockInstances(UI.activeSketchFeature());
      assert(inst.length === 2 && inst[1].x === 10 && inst[1].y === -10 && inst[1].ang === 90, 'a new instance at (10, −10), 90°: ' + JSON.stringify(inst.map(function (q) { return [q.x, q.y, q.ang]; })));
      assert(UI.activeSketchFeature().entities.length === n0 * 2, 'its geometry and insertion point');
    }
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'every type';
  });
