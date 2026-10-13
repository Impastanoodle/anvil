  // --- r3/sketch3 ---
  function r3sLayer() { return D.querySelector('#dim-layer .sk-feedback'); }
  function r3sRels() { return (UI.activeSketchFeature().rels || []).map(function (r) { return r.type + ':' + r.refs.join(','); }); }
  function r3sKey(target, k, mods) { target.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: k, bubbles: true, cancelable: true }, mods || {}))); }
  function r3sType(inp, text) { inp.value = text; inp.dispatchEvent(new W.Event('input', { bubbles: true })); }
  step('r3/sketch3: Line tool — leaving a slanted line\'s end square to it takes the exact perpendicular (dotted inference line, Perpendicular relation); A switches to a tangent arc (Tangent, back to lines after it); the next line leaving the arc along its tangent gets Tangent', async function () {
    await rskNew();
    var px = UI.cam.scale;
    UI.setTool('line'); rskClick([0, 0]); rskClick([20, 10]);
    // the perpendicular from (20, 10) runs along (-1, 2): aim about 1.5 px off it
    var tgt = [15 + 1.2 * px, 20 + 0.8 * px];
    selEv('mousemove', rskScr(tgt));
    var dotted = Array.prototype.some.call(r3sLayer().querySelectorAll('line'), function (x) { return /dasharray/.test(x.getAttribute('style') || ''); });
    assert(dotted, 'no dotted inference line along the perpendicular');
    assert((UI.App.inferPreview || []).some(function (c) { return c.type === 'perpendicular'; }), 'no Perpendicular glyph: ' + JSON.stringify(UI.App.inferPreview));
    rskClick(tgt);
    var l = rskEnts()[1];
    near((l.x2 - l.x1) * 2 + (l.y2 - l.y1), 0, 1e-9, 'square to the first line');
    assert(r3sRels().indexOf('perpendicular:1,0') >= 0, 'relations ' + r3sRels().join(' '));
    selKey('a');
    assert(UI.App.toolState.arcMode && UI.App.tool === 'line', 'A switches the Line tool to a tangent arc');
    var P = UI.App.toolState.pts[0];
    rskClick([P[0] - 15, P[1] + 5]);
    var a = rskEnts()[2];
    assert(a && a.t === 'arc', 'tangent arc drawn: ' + JSON.stringify(a));
    assert(r3sRels().indexOf('tangent:2,1') >= 0 && r3sRels().some(function (r) { return /^coincident:2\.p\d,1\.p2$/.test(r); }), 'relations ' + r3sRels().join(' '));
    assert(!UI.App.toolState.arcMode, 'back to lines after the arc');
    var Q = UI.App.toolState.pts[0], t = W.SketchSolver.endDir(a, Q);
    var atEnd = Math.hypot(a.cx + a.r * Math.cos(a.a1 * Math.PI / 180) - Q[0], a.cy + a.r * Math.sin(a.a1 * Math.PI / 180) - Q[1]) < 1e-6;
    var fwd = atEnd ? t : [-t[0], -t[1]], tq = [Q[0] + fwd[0] * 12 + fwd[1] * 1.5 * px, Q[1] + fwd[1] * 12 - fwd[0] * 1.5 * px];
    rskClick(tq);
    assert(r3sRels().indexOf('tangent:3,2') >= 0, 'tangent line off the arc: ' + r3sRels().join(' '));
    var st = UI.sketchStatus();
    assert(st.rels.every(function (s) { return s === 'ok'; }), 'relations all satisfied: ' + JSON.stringify(st.rels));
    selKey('Escape');
    return 'arc R ' + a.r.toFixed(2) + ' · ' + r3sRels().length + ' relations';
  });
  step('r3/sketch3: typing while drawing — a digit opens the L / A box at the cursor, Tab moves to A, Enter places the line at exactly 50 at 30° with a driving length dimension; a typed length holds while the click gives the direction; a typed circle radius gives a ⌀ dimension; Esc closes the box and keeps drawing', async function () {
    await rskNew();
    UI.setTool('line'); rskClick([0, 0]);
    selEv('mousemove', rskScr([10, 3]));
    selKey('5');
    var box = UI.sketchNumBox();
    assert(box && box.length === 2 && box[0].value === '5' && D.activeElement === box[0], 'box opened with the digit typed');
    r3sType(box[0], '50');
    var tmp = UI.App.tempEntities[0];
    near(Math.hypot(tmp.x2 - tmp.x1, tmp.y2 - tmp.y1), 50, 1e-9, 'preview at the typed length');
    r3sKey(box[0], 'Tab');
    assert(D.activeElement === box[1], 'Tab moves to the angle');
    r3sType(box[1], '30');
    r3sKey(box[1], 'Enter');
    var l = rskEnts()[0], f = UI.activeSketchFeature();
    assert(!UI.sketchNumBox(), 'box closed');
    near(Math.hypot(l.x2 - l.x1, l.y2 - l.y1), 50, 1e-9, 'length'); near(Math.atan2(l.y2 - l.y1, l.x2 - l.x1) * 180 / Math.PI, 30, 1e-9, 'angle');
    assert(f.dims && f.dims.length === 1 && f.dims[0].e === 0 && f.dims[0].k === 'len', 'length dimension ' + JSON.stringify(f.dims));
    // the chain goes on: type 20, click straight above for the direction
    selKey('2'); r3sType(UI.sketchNumBox()[0], '20');
    var P = UI.App.toolState.pts[0];
    rskClick([P[0], P[1] + 7]);
    var m = rskEnts()[1];
    near(m.x2, m.x1, 1e-9, 'vertical'); near(m.y2 - m.y1, 20, 1e-9, 'typed length held');
    assert(r3sRels().indexOf('vertical:1') >= 0 && f.dims.length === 2, 'relations ' + r3sRels().join(' ') + ' dims ' + JSON.stringify(f.dims));
    selKey('Escape');
    UI.setTool('circle'); rskClick([-40, 0]); selEv('mousemove', rskScr([-35, 2]));
    selKey('7'); r3sType(UI.sketchNumBox()[0], '7.5'); r3sKey(UI.sketchNumBox()[0], 'Enter');
    var c = rskEnts()[2];
    assert(c && c.t === 'circle' && Math.abs(c.r - 7.5) < 1e-9, 'circle ' + JSON.stringify(c));
    var dd = f.dims[f.dims.length - 1];
    assert(dd.e === 2 && dd.k === 'dia' && Math.abs(K.dimValue(c, dd) - 15) < 1e-9, 'diameter dimension ' + JSON.stringify(dd));
    UI.setTool('rect'); rskClick([0, -40]); selEv('mousemove', rskScr([10, -30]));
    selKey('1'); r3sKey(UI.sketchNumBox()[0], 'Escape');
    assert(!UI.sketchNumBox() && UI.App.toolState.pts.length === 1 && UI.App.tool === 'rect', 'Esc closed the box only');
    selKey('Escape');
    return 'line ' + l.x2.toFixed(4) + ', ' + l.y2.toFixed(4);
  });
  step('r3/sketch3: dragging a circle\'s centre onto another circle\'s centre merges them (Concentric glyph while over it, Concentric on release); an arc centre dropped on a line end gets a Coincident', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 0, cy: 10, r: 10 }, { t: 'circle', cx: 30, cy: 15, r: 4 }, { t: 'line', x1: -20, y1: -20, x2: 10, y2: -20 }, { t: 'arc', cx: 30, cy: -20, r: 5, a0: 0, a1: 90 });
    UI.updateSketches(); UI.setTool('select');
    var glyph = null;
    await selDrag(rskScr([30, 15]), rskScr([0.4, 10.3]), null, null, function () { var g = r3sLayer().querySelector('.rel-badge'); glyph = g && g.innerHTML; });
    var c = rskEnts()[1];
    assert(c.cx === 0 && c.cy === 10, 'centre merged ' + JSON.stringify(c));
    assert(r3sRels().indexOf('concentric:1,0') >= 0, 'relations ' + r3sRels().join(' '));
    await selDrag(rskScr([30, -20]), rskScr([10.3, -20.2]));
    var a = rskEnts()[3];
    assert(a.cx === 10 && a.cy === -20 && r3sRels().indexOf('coincident:3.c,2.p2') >= 0, 'arc centre ' + JSON.stringify(a) + ' ' + r3sRels().join(' '));
    return r3sRels().join(' ');
  });
  step('r3/sketch3: Extend Entities previews and lengthens a line to the line in its way (Coincident there, one undo step); Sketch Fillet on a dimensioned corner on the origin keeps the rectangle Fully Defined through a virtual sharp', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 30, y1: -10, x2: 30, y2: 10 });
    UI.updateSketches();
    UI.cmdExtendEntities();
    assert(UI.hasPM(), 'Extend Entities PropertyManager');
    selEv('mousemove', rskScr([9, 0.1]));
    assert(r3sLayer().querySelector('.sk-preview'), 'no preview of the extension');
    var undo0 = UI.App.undo.length;
    rskClick([9, 0.1]);
    near(rskEnts()[0].x2, 30, 1e-9, 'extended to the line');
    assert(r3sRels().indexOf('coincident:0.p2,1') >= 0 && UI.App.undo.length === undo0 + 1, 'relations ' + r3sRels().join(' '));
    UI.pmOK();
    await rskNew();
    UI.setTool('rect'); rskClick([0, 0]); rskClick([40, 20]);
    UI.setTool('select');
    f = UI.activeSketchFeature();
    // lane C, fidelity #13: the rectangle is four lines (bottom 0, right 1, top 2, left 3): its width and height are
    // the bottom and left lines' lengths
    f.dims = [{ e: 0, k: 'len', off: -3 }, { e: 3, k: 'len', off: -3 }];
    UI.updateSketches();
    assert(UI.sketchStatus().status === 'full', 'rectangle fully defined ' + JSON.stringify(UI.sketchStatus()) + ' ' + JSON.stringify(f.rels));
    UI.cmdSketchFillet(); UI.pmSetField('r', '4');
    rskClick([0.2, 0.2]);
    UI.pmOK();
    var st = UI.sketchStatus(), sharp = rskEnts().filter(function (e) { return e.sharp; });
    assert(sharp.length === 1 && sharp[0].x === 0 && sharp[0].y === 0, 'virtual sharp ' + JSON.stringify(sharp));
    assert(st.status === 'full' && st.rels.every(function (s) { return s === 'ok'; }), 'after the fillet ' + JSON.stringify(st));
    assert((f.rels || []).filter(function (r) { return r.type === 'distance'; }).map(function (r) { return r.v; }).sort().join() === '20,40', 'lengths kept as distances to the sharp');
    return st.text;
  });
  // --- end r3/sketch3 ---
