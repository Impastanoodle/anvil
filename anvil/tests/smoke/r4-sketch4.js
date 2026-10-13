  // --- r4/sketch4 ---
  function r4Dims() { UI.App.dimsStale = false; return UI.drawDims(); }
  async function r4Until(fn, ms) { var t0 = performance.now(); while (!fn() && performance.now() - t0 < (ms || 3000)) await wait(15); return fn(); }
  function r4Text(label) { return Array.prototype.filter.call(D.querySelectorAll('#dim-layer g.dim:not(.temp) text'), function (t) { return t.textContent === label; })[0]; }
  function r4Press(t, dx, dy) {
    var b = t.getBoundingClientRect(), x = b.left + b.width / 2 + (dx || 0), y = b.top + b.height / 2 + (dy || 0);
    t.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, clientX: x, clientY: y }));
    return [x, y];
  }
  function r4Win(type, xy) { W.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: xy[0], clientY: xy[1] })); }
  step('r4/sketch4: Smart Dimension between two points picks horizontal above / below them, vertical beside them, aligned elsewhere; the Modify box opens next to it, the wheel over it steps the value with a live preview, Esc restores, Enter applies as one undo step', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 10, y1: 5, x2: 40, y2: 25 });
    UI.updateSketches();
    UI.setTool('dimension');
    rskClick([10, 5]); rskClick([40, 25]);
    selEv('mousemove', rskScr([25, 35]));
    assert(UI.App.tempRelDim && UI.App.tempRelDim.dir === 'h', 'above: horizontal ' + JSON.stringify(UI.App.tempRelDim));
    selEv('mousemove', rskScr([50, 15]));
    assert(UI.App.tempRelDim.dir === 'v', 'beside: vertical ' + JSON.stringify(UI.App.tempRelDim));
    selEv('mousemove', rskScr([15, 20]));
    assert(!UI.App.tempRelDim.dir, 'off the corner regions: aligned ' + JSON.stringify(UI.App.tempRelDim));
    selEv('mousemove', rskScr([25, 35]));
    rskClick([25, 35]);
    var rel = f.rels.filter(function (r) { return r.type === 'distance'; })[0];
    assert(rel && rel.dir === 'h' && rel.v === 30, 'placed ' + JSON.stringify(f.rels));
    assert(UI.isDimEditOpen(), 'Modify box open');
    r4Dims();
    var box = $('dim-edit').getBoundingClientRect(), lab = r4Text('30').getBoundingClientRect();
    assert(box.top >= lab.bottom - 2 && Math.abs(box.left - lab.left) < 60, 'box next to the value (below it): box ' + [box.left, box.top] + ' label ' + [lab.left, lab.bottom]);
    var undo0 = UI.App.undo.length;
    $('dim-edit').dispatchEvent(new W.WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }));
    await r4Until(function () { return Math.abs(f.entities[0].x2 - f.entities[0].x1 - 31) < 1e-6; });
    assert(UI.dimEditValue() === '31', 'wheel up: ' + UI.dimEditValue());
    near(f.entities[0].x2 - f.entities[0].x1, 31, 1e-6, 'live preview');
    $('dim-edit').dispatchEvent(new W.WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true }));
    await r4Until(function () { return Math.abs(f.entities[0].x2 - f.entities[0].x1 - 21) < 1e-6; });
    assert(UI.dimEditValue() === '21', 'Ctrl+wheel down steps 10: ' + UI.dimEditValue());
    near(f.entities[0].x2 - f.entities[0].x1, 21, 1e-6, 'live preview 21');
    assert(UI.App.undo.length === undo0, 'no undo step while spinning');
    UI.cancelDimEdit();
    near(f.entities[0].x2 - f.entities[0].x1, 30, 1e-9, 'Esc restores');
    assert(rel.v === 30, 'value kept ' + rel.v);
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));   // a new user action (the double-click that reopens it)
    UI.openRelDimEdit(f.rels.indexOf(rel));
    UI.spinDimEdit(1); UI.spinDimEdit(1);
    var inp = $('dim-edit').querySelector('input');
    inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    assert(!UI.isDimEditOpen() && rel.v === 32, 'applied ' + rel.v);
    near(f.entities[0].x2 - f.entities[0].x1, 32, 1e-9, 'geometry');
    assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + (UI.App.undo.length - undo0));
    return 'H 30 -> 32';
  });
  step('r4/sketch4: a click on a dimension selects it, a double-click opens the Modify box, dragging it moves it (one undo step); labels that would overlap slide apart along their dimension lines', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 0, y1: 2, x2: 40, y2: 2 });
    f.dims = [{ e: 0, k: 'len', off: 6 }, { e: 1, k: 'len', off: 4 }];
    UI.updateSketches(); UI.setTool('select');
    r4Dims();
    var ts = Array.prototype.filter.call(D.querySelectorAll('#dim-layer g.dim:not(.auto) text'), function (t) { return t.textContent === '40'; });
    assert(ts.length === 2, 'two labels');
    var b0 = ts[0].getBoundingClientRect(), b1 = ts[1].getBoundingClientRect();
    assert(b0.right <= b1.left + 1 || b1.right <= b0.left + 1 || b0.bottom <= b1.top + 1 || b1.bottom <= b0.top + 1, 'labels apart: ' + [b0.left, b0.top, b0.right, b0.bottom] + ' / ' + [b1.left, b1.top, b1.right, b1.bottom]);
    var xy = r4Press(r4Text('40')); r4Win('mouseup', xy);
    assert(UI.App.sel && UI.App.sel.kind === 'dim' && !UI.isDimEditOpen(), 'click selects only ' + JSON.stringify(UI.App.sel));
    r4Dims();
    xy = r4Press(r4Text('40')); r4Win('mouseup', xy);
    assert(UI.isDimEditOpen(), 'double-click opens the Modify box');
    UI.cancelDimEdit();
    await wait(500);
    var undo0 = UI.App.undo.length, off0 = f.dims[0].off;
    r4Dims();
    D.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true }));   // a new user action (the app clears its undo flag on any press)
    xy = r4Press(r4Text('40'));
    var to = rskScr([20, 15]), r = $('viewport').getBoundingClientRect();
    for (var k = 1; k <= 5; k++) { r4Win('mousemove', [xy[0] + (r.left + to[0] - xy[0]) * k / 5, xy[1] + (r.top + to[1] - xy[1]) * k / 5]); await wait(20); }
    r4Win('mouseup', [r.left + to[0], r.top + to[1]]);
    var moved = f.dims.filter(function (d) { return Math.abs(d.off - 15) < 1; });
    assert(moved.length === 1, 'dragged to 15 above: ' + JSON.stringify(f.dims) + ' (was ' + off0 + ')');
    assert(UI.App.undo.length === undo0 + 1 && !UI.isDimEditOpen(), 'one undo step, no Modify box');
    return 'offsets ' + f.dims.map(function (d) { return d.off; }).join(', ');
  });
  step('r4/sketch4: 3 Point Arc from a line end locks tangent near the tangent arc (glyph, Tangent relation); Centerpoint Arc: the centre locks square to a line end the cursor passed, and the arc runs the way the cursor sweeps', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: -30, y1: 10, x2: 0, y2: 10 });
    UI.updateSketches();
    UI.setTool('arc3');
    rskClick([0, 10]); rskClick([20, 20]);
    // the arc leaving (0, 10) along +x to (20, 20): centre (0, 35), radius 25
    var q = [25 * Math.cos(-60 * Math.PI / 180), 35 + 25 * Math.sin(-60 * Math.PI / 180)];
    selEv('mousemove', rskScr([q[0] + 0.6, q[1] + 0.4]));
    assert(UI.App.toolState.tanArc, 'locked tangent near the tangent arc');
    assert(r3sLayer().querySelector('.rel-badge'), 'tangent glyph');
    rskClick([q[0] + 0.6, q[1] + 0.4]);
    var a = rskEnts()[1];
    assert(a && a.t === 'arc' && Math.abs(a.r - 25) < 1e-6 && Math.abs(a.cx) < 1e-9 && Math.abs(a.cy - 35) < 1e-9, 'tangent arc ' + JSON.stringify(a));
    assert(r3sRels().indexOf('tangent:1,0') >= 0, 'Tangent inferred: ' + r3sRels().join(' '));
    // away from it: a plain three-point arc
    rskClick([-25, 30]); rskClick([-25, 45]);
    rskClick([-32.5, 37.5]);
    var b = rskEnts()[2];
    assert(b && b.t === 'arc' && Math.abs(b.cx + 25) < 1e-6 && Math.abs(b.cy - 37.5) < 1e-6 && Math.abs(b.r - 7.5) < 1e-6, 'through three points ' + JSON.stringify(b));
    // Centerpoint Arc from a free line end
    f.entities.push({ t: 'line', x1: 20, y1: -20, x2: 35, y2: -20 });
    UI.updateSketches();
    UI.setTool('arc');
    selEv('mousemove', rskScr([35.1, -19.9]));   // wakes the end
    selEv('mousemove', rskScr([35.3, -8.2]));
    assert(r3sLayer().querySelector('.rel-badge'), 'tangent glyph at the centre');
    rskClick([35.3, -8.2]);
    var c = UI.App.toolState.pts[0];
    assert(c && c[0] === 35, 'centre locked square to the end: ' + JSON.stringify(c));
    rskClick([35, -20]);
    // sweep counter-clockwise round the centre, out to the right and up
    selEv('mousemove', rskScr([41, -18])); selEv('mousemove', rskScr([45, -9])); selEv('mousemove', rskScr([41, 0]));
    rskClick([41, 0]);
    var n = rskEnts().length - 1, e = rskEnts()[n], r0 = Math.abs(-20 - c[1]);
    assert(e.t === 'arc' && Math.abs(e.r - r0) < 1e-9, 'arc ' + JSON.stringify(e));
    var s0 = [e.cx + e.r * Math.cos(e.a0 * Math.PI / 180), e.cy + e.r * Math.sin(e.a0 * Math.PI / 180)];
    assert(Math.abs(s0[0] - 35) < 1e-6 && Math.abs(s0[1] + 20) < 1e-6, 'counter-clockwise sweep: the arc starts at (35, -20): ' + JSON.stringify(s0));
    assert(r3sRels().indexOf('tangent:' + n + ',3') >= 0, 'Tangent to the line: ' + r3sRels().join(' '));
    // the same, swept the other way round: clockwise, stored from its end round to its start
    f.entities.push({ t: 'line', x1: 20, y1: -45, x2: 35, y2: -45 }); UI.updateSketches();
    selEv('mousemove', rskScr([35.1, -44.9])); selEv('mousemove', rskScr([35.3, -33.2]));
    rskClick([35.3, -33.2]); rskClick([35, -45]);
    selEv('mousemove', rskScr([29, -43])); selEv('mousemove', rskScr([25, -34])); selEv('mousemove', rskScr([29, -25]));
    rskClick([29, -25]);
    e = rskEnts()[rskEnts().length - 1];
    var s1 = [e.cx + e.r * Math.cos(e.a1 * Math.PI / 180), e.cy + e.r * Math.sin(e.a1 * Math.PI / 180)];
    assert(Math.abs(s1[0] - 35) < 1e-6 && Math.abs(s1[1] + 45) < 1e-6, 'clockwise sweep ends at (35, -45): ' + JSON.stringify(e));
    return 'arcs ' + rskEnts().filter(function (x) { return x.t === 'arc'; }).length;
  });
  step('r4/sketch4: while placing a Smart Dimension its label follows the cursor along the dimension line (past the end the line runs on to it), snaps to the middle near it, and stays where it is dropped', async function () {
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: -20, y1: 0, x2: 20, y2: 0 });
    UI.updateSketches();
    UI.setTool('dimension');
    rskClick([5, 0]);
    selEv('mousemove', rskScr([30, -12]));
    r4Dims();
    var temp = D.querySelector('#dim-layer g.dim.temp'), tt = temp && temp.querySelector('text'), cur = rskScr([30, -12]);
    assert(tt && Math.abs(+tt.getAttribute('x') - cur[0]) < 2, 'label under the cursor: ' + (tt && tt.getAttribute('x')) + ' vs ' + cur[0]);
    // r14/sketchui14: a dimension's lines are one path (M..L.. pieces), run on to the label's box (the text in a break)
    var segN = (temp.querySelector('path.dl').getAttribute('d').match(/M/g) || []).length, xs = temp.querySelector('path.dl').getAttribute('d').match(/-?[\d.]+/g).map(Number).filter(function (v, i) { return i % 2 === 0; });
    assert(segN === 4 && Math.abs(Math.max.apply(null, xs) - tt.getBBox().x) < 5, 'dimension line extended to the label: ' + segN + ' lines, reaching ' + Math.max.apply(null, xs) + ' (label from ' + tt.getBBox().x + ')');
    selEv('mousemove', rskScr([1, -12]));
    assert(UI.App.tempDim.tx == null, 'near the middle the label centres: ' + JSON.stringify(UI.App.tempDim));
    selEv('mousemove', rskScr([30, -12]));
    rskClick([30, -12]);
    UI.cancelDimEdit();
    assert(f.dims.length === 1 && Math.abs(f.dims[0].tx - 30) < 0.5 && Math.abs(f.dims[0].off + 12) < 0.5, 'placed ' + JSON.stringify(f.dims));
    r4Dims();
    var t = r4Text('40');
    assert(t && Math.abs(+t.getAttribute('x') - cur[0]) < 2, 'label stays where it was dropped');
    return 'tx ' + f.dims[0].tx;
  });
  // --- end r4/sketch4 ---
