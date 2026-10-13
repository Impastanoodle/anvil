  // --- r13/trim13 ---
  // Trim Entities with SolidWorks' options, driven by real mouse events in a sketch on the Front plane.
  async function trimSketch(ents, rels) {
    // a drawing an earlier step left open would cancel this PropertyManager on its next queued redraw (drawing.js closeDrawing)
    if (anvil.drawing && anvil.drawing.isOpen && anvil.drawing.isOpen()) { anvil.drawing.close(); await idle(); }
    await rskNew(); await idle();
    var f = UI.activeSketchFeature();
    f.entities = JSON.parse(JSON.stringify(ents));
    if (rels) f.rels = JSON.parse(JSON.stringify(rels)); else delete f.rels;
    UI.App.gridStale = true; UI.updateSketches();
    return f;
  }
  function trimMode(m) { var rb = D.querySelector('#pm input[type=radio][value="' + m + '"]'); assert(rb, 'no ' + m + ' option'); rb.click(); }
  function trimRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  // press at uv[0], move through the points (sketch coordinates), release at the last
  async function trimDrag(uvs, during) {
    var p0 = rskScr(uvs[0]);
    selEv('mousemove', p0); selEv('mousedown', p0, $('viewport'));
    for (var k = 1; k < uvs.length; k++) { selEv('mousemove', rskScr(uvs[k])); if (k % 4 === 0) await wait(5); }
    if (during) during();
    selEv('mouseup', rskScr(uvs[uvs.length - 1]));
    await wait(20);
  }
  var CROSS = [{ t: 'line', x1: 0, y1: 0, x2: 30, y2: 0 }, { t: 'line', x1: 10, y1: -8, x2: 10, y2: 8 }, { t: 'line', x1: 20, y1: -8, x2: 20, y2: 8 }];
  step('r13/trim13: Trim Entities offers Power trim (default), Corner, Trim away inside / outside and Trim to closest; the option is remembered; hovering highlights exactly the span a click removes', async function () {
    await trimSketch(CROSS, [{ type: 'horizontal', refs: ['0'] }]);
    UI.cmdTrimEntities();
    var radios = Array.prototype.map.call(D.querySelectorAll('#pm input[type=radio]'), function (r) { return r.value + (r.checked ? '*' : ''); });
    assert(radios.join(',') === 'power*,corner,inside,outside,closest', 'options: ' + radios.join(','));
    selEv('mousemove', rskScr([15, 0.4]));
    var span = D.querySelector('#dim-layer .sk-trim-span');
    assert(span, 'no hover span');
    var xs = span.getAttribute('points').split(' ').map(function (s) { return +s.split(',')[0]; }), a = rskScr([10, 0])[0], b = rskScr([20, 0])[0];
    assert(xs.length === 2 && Math.abs(xs[0] - a) < 1 && Math.abs(xs[1] - b) < 1, 'span from the first crossing to the second: ' + xs + ' vs ' + a + ',' + b);
    rskClick([15, 0.4]);
    assert(rskEnts().length === 4 && !D.querySelector('#dim-layer .sk-trim-span[points="' + span.getAttribute('points') + '"]'), 'a click trims it (Power trim\'s click), the highlight follows');
    trimMode('closest');
    assert(/Click the part of an entity/.test(D.querySelector('#pm .pm-msg').textContent), 'message follows the option');
    UI.pmOK();
    UI.cmdTrimEntities();
    assert(D.querySelector('#pm input[value=closest]').checked, 'remembered');
    trimMode('power'); UI.pmOK();
    return radios.join(', ');
  });
  step('r13/trim13: Power trim — press and drag: a grey trail follows the cursor, each segment it crosses goes at once, one undo step for the drag; Ctrl+Z brings it all back', async function () {
    var f = await trimSketch(CROSS.concat([{ t: 'circle', cx: 40, cy: 0, r: 4 }, { t: 'rect', x: 50, y: -5, w: 8, h: 10 }]), [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }, { type: 'vertical', refs: ['2'] }]);
    UI.cmdTrimEntities();
    var undo0 = UI.App.undo.length, trail = 0, midCount = 0, path = [];
    for (var x = 5; x <= 54; x += 1) path.push([x, 3 + Math.sin(x / 3)]);
    await trimDrag(path.slice(0, 20), function () { trail = D.querySelectorAll('#dim-layer .sk-trim-trail').length; midCount = rskEnts().length; });
    assert(trail === 1, 'the trail is drawn while dragging: ' + trail);
    assert(midCount === 5 && Math.abs(rskEnts()[1].y2 - 0) < 1e-6 && Math.abs(rskEnts()[2].y2) < 1e-6, 'both verticals lost their tops during the drag: ' + JSON.stringify(rskEnts().slice(1, 3)));
    await trimDrag(path.slice(20));
    var kinds = rskEnts().map(function (e) { return e.t; }).join(',');
    // the circle is crossed twice by the wavy trail (it goes, nothing else crosses it); the rectangle's left edge goes
    assert(kinds === 'line,line,line,line,line,line', 'entities ' + kinds + ' (PM: ' + (D.querySelector('#pm .pm-head') ? D.querySelector('#pm .pm-head').textContent : 'closed') + ', mode ' + UI.App.mode + ', command ' + !!(UI.App.command && UI.App.command.onSketchDrag) + ')');
    assert(UI.App.undo.length === undo0 + 2, 'one undo step per drag: ' + (UI.App.undo.length - undo0));
    assert(!D.querySelector('#dim-layer .sk-trim-trail'), 'the trail goes on release');
    var st = UI.sketchStatus();
    assert(st.rels.every(function (s) { return s === 'ok'; }), 'relations ok: ' + JSON.stringify(st.rels));
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true })); await idle();
    assert(UI.App.mode === 'sketch' && rskEnts().length === 5 && rskEnts()[3].t === 'circle', 'two Ctrl+Z restore the sketch: ' + rskEnts().map(function (e) { return e.t; }).join(','));
    UI.pmOK();
    return kinds;
  });
  step('r13/trim13: Power trim extend — press on a free line end and drag along it: it follows, lands on the line in its way with a Coincident (one undo step), and drags back shorter', async function () {
    await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 20, y1: -8, x2: 20, y2: 8 }], [{ type: 'horizontal', refs: ['0'] }]);
    UI.cmdTrimEntities();
    selEv('mousemove', rskScr([10, 0]));
    assert(D.querySelector('#dim-layer .sk-trim-end'), 'the free end is marked under the cursor');
    var undo0 = UI.App.undo.length, mid = null;
    await trimDrag([[10, 0], [12, 1], [15, 2], [19.7, 1.5]], function () { mid = rskEnts()[0].x2; });
    var e = rskEnts()[0];
    assert(mid > 19 && mid <= 20 + 1e-9, 'it followed the cursor along itself: ' + mid);
    near(e.x2, 20, 1e-9, 'landed on the vertical'); near(e.y2, 0, 1e-9, 'stays horizontal');
    assert(trimRels().indexOf('coincident:0.p2,1') >= 0, trimRels().join(' '));
    assert(UI.App.undo.length === undo0 + 1, 'one undo step');
    await trimDrag([[20, 0], [14, 0.5], [7, -1]]);
    near(rskEnts()[0].x2, 7, 0.26, 'dragged back shorter (to the pixel)'); near(rskEnts()[0].y2, 0, 1e-9, 'along itself');
    assert(trimRels().join(' ') === 'horizontal:0', 'it left the vertical: ' + trimRels().join(' '));
    UI.pmOK();
    return 'end at x = ' + rskEnts()[0].x2;
  });
  step('r13/trim13: Corner — two clicks make two lines meet (the short one extended, the long one trimmed back), keeping the sides clicked; the result is previewed first', async function () {
    await trimSketch([{ t: 'line', x1: 0, y1: 0, x2: 12, y2: 0 }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 15 }], [{ type: 'horizontal', refs: ['0'] }, { type: 'vertical', refs: ['1'] }]);
    UI.cmdTrimEntities(); trimMode('corner');
    rskClick([4, 0]);
    assert(/Line1/.test(D.querySelector('#pm').textContent), 'first pick listed: ' + D.querySelector('#pm').textContent.slice(0, 200));
    selEv('mousemove', rskScr([20, 10]));
    assert(D.querySelector('#dim-layer .sk-preview') && D.querySelector('#dim-layer .sk-trim-pick'), 'dashed result preview and the first pick shown');
    var undo0 = UI.App.undo.length;
    rskClick([20, 10]);
    var E = rskEnts();
    function eq(a, b) { return Math.abs(a - b) < 1e-6; }
    assert(eq(E[0].x2, 20) && eq(E[0].y2, 0) && eq(E[1].y1, 0) && eq(E[1].y2, 15) && eq(E[0].x1, 0), 'corner: ' + JSON.stringify(E));
    assert(trimRels().indexOf('coincident:0.p2,1.p1') >= 0 && UI.App.undo.length === undo0 + 1, trimRels().join(' '));
    trimMode('power'); UI.pmOK();
    return JSON.stringify(E.map(function (e) { return [e.x1, e.y1, e.x2, e.y2]; }));
  });
  step('r13/trim13: Trim away inside / outside — two bounding entities, then each click trims the entity between them (inside) or outside them (outside); the span is highlighted first', async function () {
    var frame = [{ t: 'line', x1: 0, y1: -10, x2: 0, y2: 10 }, { t: 'line', x1: 20, y1: -10, x2: 20, y2: 10 }, { t: 'line', x1: -6, y1: 0, x2: 26, y2: 0 }, { t: 'line', x1: -6, y1: 5, x2: 26, y2: 5 }];
    await trimSketch(frame);
    UI.cmdTrimEntities(); trimMode('inside');
    rskClick([0, -7]); rskClick([20, -7]);
    selEv('mousemove', rskScr([8, 0.3]));
    var sp = D.querySelector('#dim-layer .sk-trim-span');
    assert(sp && sp.getAttribute('points').split(' ').length === 2, 'inside span highlighted');
    rskClick([8, 0.3]);
    var E = rskEnts();
    function eq(a, b) { return Math.abs(a - b) < 1e-6; }
    assert(E.length === 5 && eq(E[2].x2, 0) && eq(E[3].x1, 20) && eq(E[2].x1, -6), 'inside removed: ' + JSON.stringify(E));
    trimMode('outside');
    rskClick([0, -7]); rskClick([20, -7]);
    rskClick([8, 5]);
    E = rskEnts();
    var top = E.filter(function (e) { return eq(e.y1, 5) && eq(e.y2, 5); });
    assert(top.length === 1 && eq(top[0].x1, 0) && eq(top[0].x2, 20), 'outside removed: ' + JSON.stringify(top));
    trimMode('power'); UI.pmOK();
    return E.length + ' entities';
  });
  step('r13/trim13: Power trim stays smooth on a 90-entity sketch with relations: per pointer move cost measured (average and worst)', async function () {
    var ents = [], rels = [];
    for (var i = 0; i < 20; i++) { ents.push({ t: 'line', x1: -50, y1: -45 + i * 5, x2: 50, y2: -45 + i * 5 }); rels.push({ type: 'horizontal', refs: [String(ents.length - 1)] }); }
    for (var j = 0; j < 20; j++) { ents.push({ t: 'line', x1: -48 + j * 5, y1: -50, x2: -48 + j * 5, y2: 55 }); rels.push({ type: 'vertical', refs: [String(ents.length - 1)] }); }
    for (var c = 0; c < 30; c++) ents.push({ t: 'circle', cx: -40 + (c % 6) * 16, cy: -40 + Math.floor(c / 6) * 18, r: 4 + (c % 3) });
    for (var q = 0; q < 10; q++) ents.push({ t: 'rect', x: -45 + q * 9, y: 60, w: 6, h: 8 });
    for (var k = 0; k < 10; k++) ents.push({ t: 'arc', cx: -45 + k * 9, cy: -60, r: 5, a0: 0, a1: 180 });
    await trimSketch(ents, rels);
    UI.zoomView(0.5 / UI.cam.scale);
    UI.cmdTrimEntities();
    UI.trimStats.moves = 0; UI.trimStats.total = 0; UI.trimStats.max = 0;
    var path = [];
    for (var s = 0; s <= 80; s++) path.push([-30 + s * 0.75, -32 + s * 0.75]);
    var n0 = rskEnts().length;
    await trimDrag(path);
    var ts = UI.trimStats, avg = ts.total / Math.max(1, ts.moves);
    assert(rskEnts().length > n0 + 10, 'the trail trimmed its way across: ' + n0 + ' → ' + rskEnts().length);
    assert(avg < 12 && ts.max < 60, 'per move: average ' + avg.toFixed(2) + ' ms, worst ' + ts.max.toFixed(1) + ' ms');
    assert(UI.sketchStatus().rels.every(function (s2) { return s2 === 'ok'; }), 'relations ok');
    UI.pmOK();
    return ts.moves + ' moves, average ' + avg.toFixed(2) + ' ms, worst ' + ts.max.toFixed(1) + ' ms';
  });
  // --- end r13/trim13 ---
