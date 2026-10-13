  // --- sketch-text: the Sketch Text PropertyManager, placement, editing, drag, text along an arc (ui-sketch-text.js) ---
  function txtArea() { return D.querySelector('#pm textarea.txt-str'); }
  function txtType(s) { var ta = txtArea(); assert(ta, 'no Text box in the PropertyManager'); ta.value = s; ta.dispatchEvent(new W.Event('input', { bubbles: true })); }
  function txtButton() { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return (b.getAttribute('aria-label') || '') === 'Text'; })[0]; }
  function txtRadius(t, c) {   // the first and last letters' baseline ends: their distances from c
    var g = K.textLayout(t).glyphs.filter(function (x) { return !x.blank; }), a = g[0], z = g[g.length - 1];
    return [a.p0, a.p1, z.p0, z.p1].map(function (p) { return Math.hypot(p[0] - c[0], p[1] - c[1]); });
  }
  step('sketch-text: Sketch tab ▸ Text opens Sketch Text; the typed text previews at the cursor and a click places it with the PM values (on ETCH, made from the preset); its PM then edits it (height, text, Cut mode moves it off ETCH); a drag on a letter moves it', async function () {
    var errs0 = errors.length;
    UI.loadModel(K.newModel('Text')); await idle();
    UI.cmdSketch(); clickPmButton('Front Plane'); await idle();
    UI.zoomView(1); UI.refreshRibbon();
    var b = txtButton();
    assert(b && !b.disabled, 'Text button enabled in a sketch');
    b.click();
    assert(UI.App.tool === 'text' && UI.pmTitle() === 'Sketch Text', 'tool ' + UI.App.tool + ', PM ' + UI.pmTitle());
    assert(pmField('Height') && pmField('Width factor') && pmField('Spacing') && pmField('Layer') && D.querySelector('#pm input[type=radio][value="outline"]'), 'Sketch Text PM fields');
    txtType('PN 1234');
    setInput(pmField('Height'), 5);
    vpEvent('mousemove', skScreen(10, 5));
    var tmp = UI.App.tempEntities;
    assert(tmp.length === 1 && tmp[0].t === 'text' && tmp[0].str === 'PN 1234' && tmp[0].h === 5, 'preview at the cursor: ' + JSON.stringify(tmp));
    skClick(10, 5);
    var f = activeSketch(), e = f.entities[0];
    assert(f.entities.length === 1 && e.t === 'text' && e.str === 'PN 1234' && e.h === 5 && e.x === 10 && e.y === 5 && e.layer === 'ETCH', 'placed: ' + JSON.stringify(e));
    assert((f.layers || []).some(function (l) { return l.name === 'ETCH' && l.noProfile; }), 'ETCH layer from the preset: ' + JSON.stringify(f.layers));
    assert(UI.App.tool === 'select' && UI.pmTitle() === 'Sketch Text' && UI.pmSpec()._txtEntity && UI.pmSpec()._txtEntity.index === 0, 'the new text\'s PM is open');
    var ls = UI.groups.sketches.children.filter(function (o) { return o.userData && o.userData.index === 0 && o.isLineSegments; })[0];
    assert(ls, 'the text is drawn');
    setInput(pmField('Height'), 8);
    assert(e.h === 8, 'height edited: ' + e.h);
    txtType('PN 1234\nREV B');
    assert(e.str === 'PN 1234\nREV B', 'text edited: ' + JSON.stringify(e.str));
    D.querySelector('#pm input[type=radio][value="outline"]').click();
    assert(e.mode === 'outline' && e.strokeWidth > 0 && e.layer !== 'ETCH', 'Cut mode, off ETCH: ' + JSON.stringify(e));
    assert(K.sketchProfile(f).loops.length > 5, 'Cut text makes regions');
    await UI.pmOK();
    assert(!UI.hasPM(), 'PM closed');
    // drag the text by a letter
    var s0 = K.textLayout(e).strokes.filter(function (s) { return s.t === 'line'; })[0], p0 = skScreen(s0.x1, s0.y1), p1 = [p0[0] + 40, p0[1] - 20];
    var w0 = UI.screenToPlane(p0[0], p0[1], UI.activePlane()), w1 = UI.screenToPlane(p1[0], p1[1], UI.activePlane()), x0 = e.x, y0 = e.y;
    vpEvent('mousemove', p0); vpEvent('mousedown', p0, $('viewport')); vpEvent('mousemove', [p0[0] + 20, p0[1] - 10]); vpEvent('mousemove', p1); vpEvent('mouseup', p1);
    near(e.x - x0, w1[0] - w0[0], 1e-6, 'dragged x'); near(e.y - y0, w1[1] - w0[1], 1e-6, 'dragged y');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'placed at (10, 5), edited, dragged to (' + fmt(e.x) + ', ' + fmt(e.y) + ')';
  });
  step('sketch-text: with an arc selected, Text takes it into Curves; ✓ places the text along it: the first and last letters\' baselines lie on the arc radius; the text follows the arc when it changes and keeps its place when the arc is deleted; double-click edits; the sketch DXF has the strokes on ETCH, no TEXT', async function () {
    var errs0 = errors.length, f = activeSketch();
    f.entities.push({ t: 'arc', cx: 0, cy: -60, r: 50, a0: 60, a1: 120 });
    var k = f.entities.length - 1;
    UI.updateSketches();
    UI.App.sel = { kind: 'entity', index: k };
    UI.setTool('text');
    assert(UI.pmTitle() === 'Sketch Text' && UI.sketchTextValues().pathE === k, 'Curves: the arc ' + JSON.stringify(UI.sketchTextValues()));
    txtType('ALONG ARC');
    setInput(pmField('Height'), 4);
    clickPmButton('Center');
    var orig = D.querySelector('#pm input[type=radio][value="stroke"]'); if (!orig.checked) orig.click();
    await UI.pmOK();
    var t = f.entities[f.entities.length - 1];
    assert(t.t === 'text' && t.path && t.path.e === k && t.align === 'center' && t.str === 'ALONG ARC' && t.layer === 'ETCH', 'text on the arc: ' + JSON.stringify(t));
    txtRadius(t, [0, -60]).forEach(function (r, i) { near(r, 50, 1e-9, 'baseline point ' + i + ' on R50'); });
    // the arc changes: the text follows
    f.entities[k].r = 60; UI.updateSketches();
    txtRadius(t, [0, -60]).forEach(function (r, i) { near(r, 60, 1e-9, 'after the edit, point ' + i + ' on R60'); });
    // the arc is deleted: the text stays where it was
    var before = JSON.stringify(K.textLayout(t).strokes);
    UI.closePM(); UI.deleteSketchEntity(k);
    assert(f.entities.indexOf(t) === k && t.path && t.path.e == null && t.path.g && t.path.g.r === 60 && JSON.stringify(K.textLayout(t).strokes) === before, 'kept its place: ' + JSON.stringify(t.path));
    // double-click on a letter: its PM with the text box focused
    var s0 = K.textLayout(t).strokes.filter(function (s) { return s.t === 'line'; })[0], q = skScreen((s0.x1 + s0.x2) / 2, (s0.y1 + s0.y2) / 2);
    skClick((s0.x1 + s0.x2) / 2, (s0.y1 + s0.y2) / 2);
    var r = $('viewport').getBoundingClientRect();
    $('viewport').dispatchEvent(new W.MouseEvent('dblclick', { bubbles: true, clientX: r.left + q[0], clientY: r.top + q[1] }));
    await wait(30);
    assert(UI.pmTitle() === 'Sketch Text' && UI.pmSpec()._txtEntity && UI.pmSpec()._txtEntity.index === k && D.activeElement === txtArea(), 'double-click: PM ' + UI.pmTitle() + ', focus ' + (D.activeElement && D.activeElement.tagName));
    UI.closePM();
    var dxf = anvil.dxfSketch(f.id), ents = dxf.slice(dxf.indexOf('ENTITIES'));
    assert(/\n0\nLINE\n8\nETCH\n/.test(ents) && /\n0\nARC\n8\nETCH\n/.test(ents) && !/\n0\nM?TEXT\n/.test(ents), 'DXF: strokes on ETCH, no TEXT');
    assert(/\n0\n(LW)?POLYLINE\n8\n(OUTLINE|HOLES|0)\n/.test(ents), 'DXF: the Cut text as closed polylines');
    UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'R50 → R60 followed, kept after delete';
  });
  // --- end sketch-text ---
