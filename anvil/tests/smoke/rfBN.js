  // --- rfBN ---
  // (2026-10-13, lane BN) Transform ▸ Dynamic with Mastercam's dynamic gnomon (ui-transform.js): X / Y / Z arrows with
  // letters, the ball, the three rotation arcs; hover highlights; the X arrow dragged 10 units (snapped to the corner
  // the gnomon lands on, the value box shows the distance); the Z arc dragged shows the dotted ring and the wedge, a
  // typed -25 sets -25.00°; Shift-drag snaps to 15°; a digit typed while dragging edits the value, Tab moves on to the
  // PM; the ball dragged onto a sketch point moves the gnomon and not the geometry; with the view turned, the Z arrow
  // and the out-of-plane arcs are faded, inert and explain why; ✓ gives the exact result in one undo step.
  function rfBNEv(type, p, mods, target) {
    var r = $('viewport').getBoundingClientRect();
    (target || W).dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, buttons: type === 'mousedown' ? 1 : 0, clientX: Math.round(r.left + p[0]), clientY: Math.round(r.top + p[1]) }, mods || {})));
  }
  async function rfBNHover(p) { rfBNEv('mousemove', p); await wait(40); }
  async function rfBNDrag(from, to, during, mods) {
    rfBNEv('mousemove', from, mods); rfBNEv('mousedown', from, mods, $('viewport'));
    for (var k = 1; k <= 8; k++) { rfBNEv('mousemove', [from[0] + (to[0] - from[0]) * k / 8, from[1] + (to[1] - from[1]) * k / 8], Object.assign({ buttons: 1 }, mods || {})); await wait(15); }
    await wait(40);
    if (during) await during();
    rfBNEv('mouseup', to, mods);
    await idle(); await wait(20);
  }
  function rfBNDyn() { var s = UI.pmSpec(); assert(s && s.transform === 'dynamic' && s.dynamic, 'the Dynamic PM with its gnomon API'); return s.dynamic; }
  function rfBNAlong(g, k, px) { var d = [g.tip[k][0] - g.o[0], g.tip[k][1] - g.o[1]], n = Math.hypot(d[0], d[1]) || 1; return [g.o[0] + d[0] / n * px, g.o[1] + d[1] / n * px]; }
  function rfBNKey(el, key, mods) { el.dispatchEvent(new W.KeyboardEvent('keydown', Object.assign({ key: key, bubbles: true, cancelable: true }, mods || {}))); }

  step('rfBN: Dynamic gnomon — X / Y / Z arrows with cone heads and letters, the ball and the three coloured arcs with ticks are drawn at the origin; hovering the X arrow, the Z arc and the ball highlights them and sets the cursor', async function () {
    var errs0 = errors.length;
    await rfBJNew(rfBJSquare(0, 0, 10));
    UI.setSelection([0, 1, 2, 3].map(function (i) { return { kind: 'entity', index: i }; })); await wait(20);
    await rfBJRun('Dynamic');
    assert(UI.pmTitle() === 'Dynamic', 'PM ' + UI.pmTitle());
    await wait(60);
    var svg = D.querySelector('.tf-gnomon');
    assert(svg, 'the gnomon overlay');
    ['x', 'y', 'z'].forEach(function (k) { assert(svg.querySelector('.tf-gn-arrow-' + k + ' polygon, .tf-gn-arrow-' + k + ' circle') && svg.querySelector('.tf-gn-letter-' + k), 'arrow ' + k + ' with its head and letter'); });
    assert(svg.querySelector('.tf-gn-letter-x').textContent === 'X' && svg.querySelector('.tf-gn-letter-y').textContent === 'Y', 'axis letters');
    assert(svg.querySelector('.tf-gn-ball'), 'the ball');
    ['rz', 'rx', 'ry'].forEach(function (k) { var a = svg.querySelector('.tf-gn-arc-' + k); assert(a && a.querySelectorAll('line').length === 5, 'arc ' + k + ' with its ticks'); });
    assert(svg.querySelector('.tf-gn-arc-rz path').getAttribute('stroke') === '#2f66d6' && svg.querySelector('.tf-gn-arrow-x line').getAttribute('stroke') === '#e5322d' && svg.querySelector('.tf-gn-arrow-y line').getAttribute('stroke') === '#2fae3d', 'arc about Z blue, X red, Y green');
    var dyn = rfBNDyn(), g = dyn.geo(), o = rfBJScr([0, 0]);
    near(g.o[0], o[0], 0.5, 'gnomon x'); near(g.o[1], o[1], 0.5, 'gnomon y');
    near(Math.hypot(g.tip.x[0] - g.o[0], g.tip.x[1] - g.o[1]), 110, 1, 'X arrow 110 px long');
    assert(g.tip.x[0] > g.o[0] + 100 && Math.abs(g.tip.x[1] - g.o[1]) < 1 && g.tip.y[1] < g.o[1] - 100, 'X right, Y up in the Front view');
    // hover
    await rfBNHover([g.o[0] + 50, g.o[1]]);
    assert(dyn.state().hover === 'x', 'hover X: ' + dyn.state().hover);
    await wait(60);
    assert(svg.querySelector('.tf-gn-arrow-x.hot') && !svg.querySelector('.tf-gn-arrow-y.hot'), 'the X arrow is highlighted');
    assert($('viewport').style.cursor === 'grab', 'grab cursor: ' + $('viewport').style.cursor);
    var ap = g.arcPoint('rz', 45);
    await rfBNHover(ap);
    assert(dyn.state().hover === 'rz', 'hover the Z arc: ' + dyn.state().hover);
    await wait(60);
    assert(svg.querySelector('.tf-gn-arc-rz.hot'), 'the Z arc is highlighted');
    await rfBNHover(g.o);
    assert(dyn.state().hover === 'ball' && $('viewport').style.cursor === 'move', 'hover the ball: ' + dyn.state().hover);
    await rfBNHover([g.o[0] - 150, g.o[1] + 150]);
    assert(dyn.state().hover === null && $('viewport').style.cursor === '', 'nothing hovered away from the gnomon');
    assert(UI.pmSpec().values.entities.length === 4, 'the four lines stay in the box');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'drawn, hover ok';
  });

  step('rfBN: Dynamic gnomon — the X arrow dragged 41 px lands the gnomon on the (10, 0) corner: exactly 10 with the value box showing the distance and a guide line while dragging; the Z arc dragged shows the dotted ring, the wedge and an angle box, -25 typed gives -25.00°; Shift-drag snaps to 15°; a digit typed while dragging edits the value and Tab moves on to the PM', async function () {
    var errs0 = errors.length;
    assert(UI.pmTitle() === 'Dynamic', 'Dynamic still open');
    var dyn = rfBNDyn(), g = dyn.geo(), box = D.querySelector('.tf-dyn-val'), seen = {};
    assert(box && box.hidden, 'the value box waits hidden');
    var from = rfBNAlong(g, 'x', 50);
    await rfBNDrag(from, [from[0] + 41, from[1]], function () { seen.guide = !!D.querySelector('.tf-gn-guide'); seen.val = box.hidden ? null : box.value; seen.live = dyn.state().live && dyn.state().live.kind; });
    var v = UI.pmSpec().values;
    assert(seen.guide && seen.live === 'x', 'the guide line along X while dragging: ' + JSON.stringify(seen));
    assert(v.dx === 10 && v.dy === 0 && v.ang === 0, 'snapped onto the corner: ' + v.dx + ', ' + v.dy);
    assert(seen.val != null && +seen.val === 10 && seen.val === UI.fmtDim(10), 'the box showed the distance in the document precision: ' + seen.val);
    assert(!box.hidden && D.activeElement === box && +box.value === 10, 'the box keeps the value and the keyboard');
    assert(UI.App.tempEntities.length === 4, 'live preview of the moved square');
    // the Z arc
    g = dyn.geo();
    near(g.uv[0], 10, 1e-9, 'gnomon moved with the geometry');
    var a1 = g.arcPoint('rz', 45), a2 = g.arcPoint('rz', 20);
    await rfBNDrag(a1, a2, function () { seen.ring = !!D.querySelector('.tf-gn-ring'); seen.wedge = !!D.querySelector('.tf-gn-wedge'); seen.arrows = D.querySelectorAll('.tf-gn-ring-arrow').length; seen.ang = box.value; seen.liveR = dyn.state().live && dyn.state().live.kind; });
    v = UI.pmSpec().values;
    assert(seen.ring && seen.wedge && seen.arrows === 2 && seen.liveR === 'rz', 'the dotted ring with its arrows and the wedge while turning: ' + JSON.stringify(seen));
    assert(/^-2[3-7]\.00°$/.test(seen.ang), 'the box shows the angle: ' + seen.ang);
    assert(v.ang < -20 && v.ang > -30 && v.ang === Math.round(v.ang) && v.dx === 10 && v.dy === 0, 'turned by whole degrees: ' + v.ang);
    assert(!D.querySelector('.tf-gn-ring') && !D.querySelector('.tf-gn-wedge'), 'ring and wedge go when the drag ends');
    box.value = '-25'; rfBNKey(box, 'Enter'); await wait(20);
    v = UI.pmSpec().values;
    assert(v.ang === -25, 'typed -25: ' + v.ang);
    assert(box.value === '-25.00°' && !box.hidden, 'the box shows -25.00°: ' + box.value);
    // Shift: 15° steps
    g = dyn.geo();
    await rfBNDrag(g.arcPoint('rz', 45), g.arcPoint('rz', 20), null, { shiftKey: true });
    v = UI.pmSpec().values;
    assert(v.ang === -55, 'Shift-drag snapped the -25 raw turn to -30, total -55: ' + v.ang);
    box.value = '0'; rfBNKey(box, 'Enter'); await wait(20);
    assert(UI.pmSpec().values.ang === -25, 'typed 0 on the last drag: back to -25');
    // a digit typed while dragging
    g = dyn.geo();
    from = rfBNAlong(g, 'x', 50);
    var to = rfBNAlong(g, 'x', 70), typedWhile = {};
    await rfBNDrag(from, to, async function () {
      rfBNKey(W, '5'); await wait(20);
      typedWhile = { typing: !!(dyn.state().live && dyn.state().live.typing), val: box.value, focus: D.activeElement === box };
      rfBNEv('mousemove', rfBNAlong(g, 'x', 110), { buttons: 1 }); await wait(20);
      typedWhile.frozen = UI.pmSpec().values.dx;
    });
    assert(typedWhile.typing && typedWhile.val === '5' && typedWhile.focus, 'a digit while dragging opens the box with it: ' + JSON.stringify(typedWhile));
    assert(typedWhile.frozen === UI.pmSpec().values.dx, 'the drag is frozen while typing');
    box.value = '5'; rfBNKey(box, 'Tab'); await wait(20);
    v = UI.pmSpec().values;
    near(v.dx, 10 + 5 * Math.cos(25 * Math.PI / 180), 1e-9, 'typed 5 along the turned X: dx'); near(v.dy, -5 * Math.sin(25 * Math.PI / 180), 1e-9, 'typed 5 along the turned X: dy');
    var pmInput = D.querySelector('#pm input[data-key="dx"]');
    assert(pmInput && D.activeElement === pmInput, 'Tab moved on to the PM\'s Delta X');
    box.value = '0'; rfBNKey(box, 'Enter'); await wait(20);
    v = UI.pmSpec().values;
    assert(v.dx === 10 && v.dy === 0 && v.ang === -25, 'typed 0: back to 10, 0, -25: ' + [v.dx, v.dy, v.ang]);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return '10 along X, -25°';
  });

  step('rfBN: Dynamic gnomon — the ball dragged onto the (10, 10) corner moves the gnomon there and leaves the transform as it was; with the view turned the Z arrow and the X / Y arcs are faded, inert, show "Only in-plane moves apply in a sketch" and a drag on them changes nothing; ✓ gives the square turned -25° and moved 10 along X, exactly, in one undo step', async function () {
    var errs0 = errors.length;
    assert(UI.pmTitle() === 'Dynamic', 'Dynamic still open');
    var dyn = rfBNDyn(), g = dyn.geo(), M0 = dyn.pose(), v;
    await rfBNDrag(g.o, rfBJScr([10, 10]));
    g = dyn.geo(); v = UI.pmSpec().values;
    near(g.uv[0], 10, 1e-9, 'gnomon x'); near(g.uv[1], 10, 1e-9, 'gnomon y');
    var M1 = dyn.pose();
    for (var i = 0; i < 6; i++) near(M1[i], M0[i], 1e-9, 'transform unchanged [' + i + ']');
    assert(v.ang === -25, 'angle kept: ' + v.ang);
    assert(D.querySelector('.tf-dyn-val').hidden, 'no value box for the ball');
    // out of plane
    UI.rotateView(70, 45); await wait(80);
    g = dyn.geo();
    assert(Math.hypot(g.tip.z[0] - g.o[0], g.tip.z[1] - g.o[1]) > 30, 'the Z arrow shows once the view is turned');
    var svg = D.querySelector('.tf-gnomon');
    assert(svg.querySelector('.tf-gn-arrow-z.tf-gn-inert') && svg.querySelector('.tf-gn-arc-rx.tf-gn-inert') && svg.querySelector('.tf-gn-arc-ry.tf-gn-inert') && !svg.querySelector('.tf-gn-arrow-x.tf-gn-inert') && !svg.querySelector('.tf-gn-arc-rz.tf-gn-inert'), 'Z arrow and the X / Y arcs faded, the in-plane handles not');
    assert(svg.querySelector('.tf-gn-arrow-z').getAttribute('opacity') === '0.3', 'faded');
    var zm = [(g.o[0] + g.tip.z[0]) / 2, (g.o[1] + g.tip.z[1]) / 2];
    await rfBNHover(zm);
    var tip = D.querySelector('.tf-dyn-tip');
    assert(dyn.state().hover === 'z' && $('viewport').style.cursor === 'not-allowed', 'hover Z: ' + dyn.state().hover + ' ' + $('viewport').style.cursor);
    assert(tip && !tip.hidden && tip.textContent === 'Only in-plane moves apply in a sketch', 'the tooltip says why');
    var M2 = dyn.pose(), e2 = UI.pmSpec().values.entities.length;
    await rfBNDrag(zm, [zm[0] + 40, zm[1] + 30]);
    var M3 = dyn.pose();
    for (i = 0; i < 6; i++) near(M3[i], M2[i], 1e-12, 'Z drag changed nothing [' + i + ']');
    assert(UI.pmSpec().values.entities.length === e2, 'a press on an inert handle keeps the selection');
    await rfBNHover([10, 10]);
    assert(tip.hidden, 'tooltip gone');
    UI.setView('Front'); await wait(80);
    // ✓
    var u0 = UI.App.undo.length;
    await rfBJOk();
    assert(UI.pmTitle() !== 'Dynamic', 'PM closed');
    var E = UI.activeSketchFeature().entities, c = Math.cos(25 * Math.PI / 180), s = Math.sin(25 * Math.PI / 180);
    near(E[0].x1, 10, 1e-9, 'bottom x1'); near(E[0].y1, 0, 1e-9, 'bottom y1');
    near(E[0].x2, 10 + 10 * c, 1e-9, 'bottom x2'); near(E[0].y2, -10 * s, 1e-9, 'bottom y2');
    near(E[2].x1, 10 + 10 * c + 10 * s, 1e-9, 'top x1'); near(E[2].y1, 10 * c - 10 * s, 1e-9, 'top y1');
    assert(UI.App.undo.length - u0 === 1, 'one undo step');
    assert(!D.querySelector('.tf-gnomon') && !D.querySelector('.tf-dyn-val') && !D.querySelector('.tf-dyn-tip') && $('viewport').style.cursor === '', 'overlay, box and tooltip gone with the PM');
    await UI.exitSketch(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'ball, inert handles, ✓ exact';
  });
