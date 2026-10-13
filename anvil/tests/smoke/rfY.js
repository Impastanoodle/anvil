  // ---- rfY (sketch fidelity 3 fixes, 2026-10-12): slot cap / side drags, arc slots as real entities, numeric input
  // for the line angle, arc slots, ellipses and the polygon diameter, Esc on a ribbon flyout
  async function rfYDrag(a, b) {
    var p0 = rskScr(a), p1 = rskScr(b);
    selEv('mousemove', p0); selEv('mousedown', p0, $('viewport'));
    for (var k = 1; k <= 6; k++) { selEv('mousemove', [p0[0] + (p1[0] - p0[0]) * k / 6, p0[1] + (p1[1] - p0[1]) * k / 6]); await wait(25); }
    selEv('mouseup', p1); await wait(40);
  }
  // the on-screen box: typing opens it (first character), the value is set and Enter / Tab go to the focused field
  function rfYOpen(ch) { D.dispatchEvent(new W.KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true })); return UI.sketchNumBox(); }
  function rfYSet(inp, v) { inp.value = v; inp.dispatchEvent(new W.Event('input', { bubbles: true })); }
  function rfYKey(inp, k) { inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  // the arc slot drawn as five arcs from entity i (outer, end, inner, end, construction) as its aslot parameters
  function rfYSlotOf(E, i) {
    var o = E[i], ca = E[i + 4];
    if (!o || !ca || !E.slice(i, i + 5).every(function (e) { return e && e.t === 'arc'; }) || !ca.construction) return null;
    return { t: 'aslot', cx: ca.cx, cy: ca.cy, r: ca.r, a0: ca.a0, a1: ca.a1, w: o.r - E[i + 2].r };
  }
  function rfYNear(a, b, tol) { return Math.abs(a - b) < (tol || 1e-6); }
  step('rfY: dragging a straight slot\'s end cap stretches the slot and keeps its width; dragging a side changes the width symmetrically about the centerline; a free arc\'s edge drag still changes its radius', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.sketchCurveOptions({ slotDims: false, overall: false });
    UI.setTool('slot'); rskClick([10, 0]); rskClick([30, 0]); rskClick([20, 3]);
    UI.cancelTool(); UI.setTool('select');
    var E = rskEnts();
    assert(E.length === 5 && E[1].t === 'arc' && rfYNear(E[1].r, 3), 'slot drawn ' + JSON.stringify(E));
    await rfYDrag([33, 0], [40, 0]);
    E = rskEnts();
    assert(rfYNear(E[1].r, 3, 1e-6) && rfYNear(E[3].r, 3, 1e-6), 'width kept: ' + E[1].r + ' / ' + E[3].r);
    assert(E[1].cx > 35 && rfYNear(E[3].cx, 10, 1e-6), 'the dragged end moved, the other stayed: ' + E[1].cx + ', ' + E[3].cx);
    await rfYDrag([20, 3], [20, 5]);
    E = rskEnts();
    assert(rfYNear(E[0].y1, 5, 1e-3) && rfYNear(E[2].y1, -5, 1e-3) && rfYNear(E[4].y1, 0, 1e-3), 'side dragged: width 10 about the centerline ' + JSON.stringify([E[0].y1, E[2].y1, E[4].y1]));
    assert(rfYNear(E[1].r, 5, 1e-3), 'caps follow: ' + E[1].r);
    E.push({ t: 'arc', cx: -30, cy: 0, r: 5, a0: 0, a1: 180 }); UI.updateSketches();
    await rfYDrag([-30, 5], [-30, 8]);
    assert(rfYNear(rskEnts()[5].r, 8, 0.1) && rfYNear(rskEnts()[5].cx, -30, 1e-6), 'free arc: radius ' + rskEnts()[5].r);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'cap ' + E[1].cx.toFixed(2) + ', width ' + (E[0].y1 - E[2].y1).toFixed(3);
  });
  step('rfY: Centerpoint Arc Slot draws two concentric arcs, two end arcs and a construction arc (Tangent, Coincident, nothing over defined) in one undo step; its PM Parameters drive it; a cap drag keeps the width; the script round trip is identical', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.sketchCurveOptions({ slotDims: true, overall: false });
    var u0 = UI.App.undo.length;
    UI.setTool('aslot'); rskClick([0, 0]); rskClick([20, 0]); selEv('mousemove', rskScr([15, 13])); selEv('mousemove', rskScr([14, 14])); rskClick([0, 20]); rskClick([0, 23]);
    var f = UI.activeSketchFeature(), E = f.entities;
    assert(E.length === 5 && E.every(function (e) { return e.t === 'arc'; }) && E[4].construction && !E[0].construction, 'five arcs ' + JSON.stringify(E));
    assert(rfYNear(E[0].r, 23) && rfYNear(E[2].r, 17) && rfYNear(E[1].r, 3) && rfYNear(E[3].r, 3) && rfYNear(E[4].r, 20) && rfYNear(E[4].a1 - E[4].a0, 90), 'radii ' + E.map(function (e) { return e.r; }).join(','));
    assert(UI.App.undo.length === u0 + 1, 'one undo step: ' + (UI.App.undo.length - u0));
    var an = W.SketchSolver.analyze(f), nt = f.rels.filter(function (r) { return r.type === 'tangent'; }).length;
    assert(an.redundant === 0 && an.conflicts === 0 && an.status !== 'over' && nt === 4, 'relations: ' + JSON.stringify(an.rels) + ' tangents ' + nt);
    assert(f.dims && f.dims.some(function (d) { return d.e === 4 && d.k === 'r'; }) && f.rels.some(function (r) { return r.type === 'distance' && r.dir === 'r' && rfYNear(r.v, 6); }), 'Add dimensions: R on the construction arc, the width between the arcs ' + JSON.stringify(f.dims) );
    assert(UI.pmTitle() === 'Slot' && pmField('Slot width') && rfYNear(+pmField('Slot width').value, 6), 'tool PM shows the slot: ' + (pmField('Slot width') && pmField('Slot width').value));
    f.rels = f.rels.filter(function (r) { return r.type !== 'distance'; }); f.dims = f.dims.filter(function (d) { return d.k !== 'r'; });   // free to drive
    setInput(pmField('Slot width'), '8'); await wait(20);
    E = f.entities;
    assert(rfYNear(E[0].r - E[2].r, 8, 1e-6) && rfYNear(E[4].r, 20, 1e-6) && rfYNear(E[1].r, 4, 1e-6), 'Slot width 8 drives it: ' + E.map(function (e) { return e.r; }).join(','));
    setInput(pmField('Arc angle'), '60'); await wait(20);
    assert(rfYNear(E[4].a1 - E[4].a0, 60, 1e-6) && rfYNear(E[0].a1 - E[0].a0, 60, 1e-6), 'Arc angle 60: ' + (E[4].a1 - E[4].a0));
    UI.cancelTool(); UI.setTool('select');
    var cap = E[1], mid = (cap.a0 + cap.a1) / 2 * Math.PI / 180;
    await rfYDrag([cap.cx + cap.r * Math.cos(mid), cap.cy + cap.r * Math.sin(mid)], [cap.cx + cap.r * Math.cos(mid) - 6, cap.cy + cap.r * Math.sin(mid) + 4]);
    E = f.entities;
    assert(rfYNear(E[1].r, 4, 1e-4) && rfYNear(E[0].r - E[2].r, 8, 1e-4) && E[4].a1 - E[4].a0 > 61, 'cap drag: the slot runs on, width kept ' + (E[4].a1 - E[4].a0) + ' / ' + E[1].r);
    UI.exitSketch(); await idle();
    function sk() { return anvil.model().features.filter(function (x) { return x.type === 'sketch'; })[0]; }
    function norm(s) { return JSON.stringify({ e: s.entities.map(function (e) { var o = {}; Object.keys(e).sort().forEach(function (k) { o[k] = typeof e[k] === 'number' ? Math.round(e[k] * 1e6) / 1e6 : e[k]; }); return o; }), r: s.rels, d: s.dims || [] }); }
    var a = norm(sk()), src = anvil.script();
    assert(/implied/.test(src), 'the script keeps the implied join');
    await anvil.run(src); await idle();
    var b = norm(sk());
    assert(a === b, 'round trip identical:\n' + a + '\n' + b);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    UI.sketchCurveOptions({ slotDims: false });
    return 'five arcs, ' + f.rels.length + ' relations';
  });
  step('rfY: Esc on an open ribbon flyout closes it and keeps a four-entity sketch selection', async function () {
    var errs0 = errors.length;
    await rskNew();
    fxSk([{ t: 'line', x1: 0, y1: 0, x2: 10, y2: 0 }, { t: 'line', x1: 0, y1: 5, x2: 10, y2: 5 }, { t: 'line', x1: 0, y1: 10, x2: 10, y2: 10 }, { t: 'line', x1: 0, y1: 15, x2: 10, y2: 15 }]);
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; }));
    var c = D.querySelector('#ribbon .rb-caret');
    c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true })); c.dispatchEvent(new W.MouseEvent('click', { bubbles: true, cancelable: true }));
    assert(UI.menuOpen(), 'flyout open');
    D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(20);
    assert(!UI.menuOpen() && UI.selection().length === 4, 'flyout closed, selection ' + UI.selection().length);
    D.body.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); await wait(20);
    assert(UI.selection().length === 0, 'a second Esc clears it: ' + UI.selection().length);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'kept 4';
  });
  step('rfY: numeric input — Line L then Tab A sets both; Centerpoint Arc Slot boxes for the sweep and the width; Ellipse / Partial Ellipse R, A, minor R and sweep; the Polygon box takes the circle diameter', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.setTool('line'); rskClick([0, 0]); selEv('mousemove', rskScr([16, 11.5]));
    var b = rfYOpen('2'); rfYSet(b[0], '20'); rfYKey(b[0], 'Tab');
    assert(D.activeElement === b[1], 'Tab to A');
    rfYSet(b[1], '30'); rfYKey(b[1], 'Enter');
    var l = rskEnts()[0];
    assert(l && rfYNear(l.x2, 20 * Math.cos(Math.PI / 6), 1e-6) && rfYNear(l.y2, 10, 1e-6), 'line L 20 at 30°: ' + JSON.stringify(l));
    UI.cancelTool();
    // arc slot: after the start the box is A (sweep), after the end W
    UI.setTool('aslot'); rskClick([50, 0]); rskClick([70, 0]); selEv('mousemove', rskScr([62, 14]));
    b = rfYOpen('9'); assert(b && b.length === 1, 'sweep box');
    rfYSet(b[0], '90'); rfYKey(b[0], 'Enter');
    selEv('mousemove', rskScr([51, 21]));
    b = rfYOpen('4'); assert(b && b.length === 1 && UI.App.toolState.pts.length === 3, 'width box');
    rfYKey(b[0], 'Enter');
    var n0 = 1, E = rskEnts();
    assert(E.length === n0 + 5 && rfYNear(E[n0 + 4].a1 - E[n0 + 4].a0, 90) && rfYNear(E[n0].r - E[n0 + 2].r, 4), 'arc slot 90°, W 4: ' + JSON.stringify(E.slice(n0)));
    UI.cancelTool();
    // ellipse: R 20 / A 30, then the minor R 8
    UI.setTool('ellipse'); rskClick([0, -40]); selEv('mousemove', rskScr([15, -30]));
    b = rfYOpen('2'); assert(b && b.length === 2, 'R / A box'); rfYSet(b[0], '20'); rfYSet(b[1], '30'); rfYKey(b[1], 'Enter');
    selEv('mousemove', rskScr([0, -30]));
    b = rfYOpen('8'); assert(b && b.length === 1, 'minor box'); rfYKey(b[0], 'Enter');
    await wait(10);
    var el = rskEnts().filter(function (e) { return e.t === 'ellipse'; })[0];
    assert(el && rfYNear(el.rx, 20, 1e-6) && rfYNear(el.ry, 8, 1e-6) && rfYNear(el.rot, 30, 1e-6), 'ellipse ' + JSON.stringify(el));
    UI.cancelTool();
    UI.setTool('pellipse'); rskClick([60, -40]); selEv('mousemove', rskScr([75, -40]));
    b = rfYOpen('2'); rfYSet(b[0], '20'); rfYKey(b[0], 'Enter');
    selEv('mousemove', rskScr([60, -30]));
    b = rfYOpen('1'); rfYSet(b[0], '10'); rfYKey(b[0], 'Enter');
    selEv('mousemove', rskScr([55, -35]));
    b = rfYOpen('1'); assert(b && b.length === 1, 'sweep box'); rfYSet(b[0], '120'); rfYKey(b[0], 'Enter');
    await wait(10);
    var pe = rskEnts().filter(function (e) { return e.t === 'pellipse'; })[0];
    assert(pe && rfYNear(pe.rx, 20, 1e-6) && rfYNear(pe.ry, 10, 1e-6) && rfYNear(pe.a1 - pe.a0, 120, 1e-6), 'partial ellipse 120°: ' + JSON.stringify(pe));
    UI.cancelTool();
    // polygon: the typed value is the Circle diameter the PM shows
    UI.sketchCurveOptions({ sides: 6, ins: true });
    UI.setTool('polygon'); rskClick([-50, 40]); selEv('mousemove', rskScr([-40, 42]));
    b = rfYOpen('2'); assert(b && b[0].getAttribute('aria-label') === 'Diameter', 'Ø box: ' + (b && b[0].getAttribute('aria-label')));
    rfYSet(b[0], '20'); rfYKey(b[0], 'Enter');
    var circ = rskEnts().filter(function (e) { return e.t === 'circle' && e.construction; })[0];
    assert(circ && rfYNear(circ.r, 10, 1e-6), 'circle diameter 20: ' + JSON.stringify(circ));
    assert(pmField('Circle diameter') && rfYNear(+pmField('Circle diameter').value, 20, 1e-6), 'PM Circle diameter ' + (pmField('Circle diameter') && pmField('Circle diameter').value));
    UI.cancelTool();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'line 30°, arc slot, ellipses, polygon Ø20';
  });
  // --- end rfY ---
