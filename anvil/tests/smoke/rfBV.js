  // --- rfBV ---
  // (2026-10-13, lane BV) The sketcher driven like the shop user (inch document, a .266 hole at a working zoom of
  // 0.015 in per pixel, the Enter rules of lane BP). Findings fixed here: a small hole's edge hovered or clicked grabbed
  // the Instant2D ball of its own diameter dimension (the arrow sits on the circle) instead of selecting the hole;
  // Esc or ✕ on "Make Dimension Driven?" left the new dimension driving and the sketch Over Defined (SolidWorks'
  // Cancel does not add it); Mirror Entities' ✓ reported "Selection cleared." over its result; the Circle box now opens
  // on the field the last circle was typed in (Ø for hole sizes). Uses the helpers of refine-sketcher and selection.
  async function rfBVHoleSketch() {
    await rskNew();
    UI.App.view.showGrid = false;
    UI.zoomView(0.015 / UI.cam.scale);   // the shop zoom: a 4 x 3 in blank fills a quarter of the view
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'circle', cx: 0.5, cy: 0.5, r: 0.133 });
    f.dims = [{ e: 0, k: 'dia', ang: 45, off: 0.343 }];
    UI.updateSketches();
    await wait(20);
    return f;
  }
  function rfBVHandle() { return D.querySelector('.i2d-handle'); }

  step('rfBV: a .266 hole with its Ø dimension at 45° — hovering and clicking the hole\'s edge selects the hole (no Instant2D ball, no "dimension unchanged"); the ball still comes on the dimension\'s value', async function () {
    var errs0 = errors.length;
    var f = await rfBVHoleSketch();
    assert(UI.App.view.instant2D !== false, 'Instant2D is on');
    // the right quadrant: 9 px from the arrow tip at 45°, on the circle (the Instant2D hover listens on the viewport)
    selEv('mousemove', rskScr([0.633, 0.5]), $('viewport')); await wait(10);
    assert(!rfBVHandle(), 'no Instant2D ball while hovering the hole\'s edge');
    UI.setStatus('—');
    rskClick([0.633, 0.5]); await wait(20);
    var sel = anvil.selection();
    assert(sel.length === 1 && sel[0].kind === 'entity' && sel[0].index === 0, 'the click selected the hole: ' + JSON.stringify(sel));
    assert(!/Instant2D/.test(statusText()), 'status: ' + statusText());
    // the value still hovers (the ball shows), as in SolidWorks
    var it = (UI.drawDims() || []).filter(function (x) { return x.d === f.dims[0]; })[0];
    assert(it && it.sc && it.sc.box, 'the dimension is drawn');
    var b = it.sc.box;
    selEv('mousemove', [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], $('viewport')); await wait(10);
    assert(rfBVHandle(), 'the ball shows on the value');
    selEv('mousemove', rskScr([3, 3]), $('viewport')); await wait(10);
    assert(!rfBVHandle(), 'and goes away off it');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'hole selected';
  });

  step('rfBV: a second Ø on the same hole asks "Make Dimension Driven?" — Esc, the ✕ and Cancel do not add it (one dimension, Under Defined, status says so); "Make this dimension driven" still adds it driven', async function () {
    var errs0 = errors.length;
    var f = await rfBVHoleSketch();
    async function askAgain() {
      UI.setTool('dimension'); await wait(10);
      rskClick([0.5, 0.367]); await wait(10);   // the bottom quadrant, away from the arrow
      rskClick([0.2, -0.3]); await wait(20);
      assert(modalOpen(), 'the question is asked: ' + statusText());
      assert(/Make Dimension Driven/.test(D.getElementById('modal-title').textContent), 'title ' + D.getElementById('modal-title').textContent);
      assert(f.dims.length === 2, 'the dimension is there while the question is open');
    }
    function check(how) {
      assert(!modalOpen(), how + ': the question closed');
      assert(f.dims.length === 1 && !f.dims[0].driven, how + ': the dimension was not added: ' + JSON.stringify(f.dims));
      assert(UI.sketchStatus().status === 'under', how + ': ' + JSON.stringify(UI.sketchStatus()).slice(0, 80));
      assert(/not added/.test(statusText()), how + ': status ' + statusText());
      assert(!UI.App.drivenPrompt, how + ': no pending prompt');
    }
    await askAgain();
    selKey('Escape'); await wait(20);
    check('Esc');
    UI.setTool('select');
    await askAgain();
    D.querySelector('#modal-title button').click(); await wait(20);
    check('✕');
    UI.setTool('select');
    await askAgain();
    clickModalButton('Cancel'); await wait(20);
    check('Cancel');
    UI.setTool('select');
    await askAgain();
    clickModalButton('Make this dimension driven'); await wait(20);
    assert(!modalOpen() && f.dims.length === 2 && f.dims[1].driven === true, 'driven: ' + JSON.stringify(f.dims));
    assert(UI.sketchStatus().status === 'under', 'still Under Defined');
    UI.setTool('select');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Esc / ✕ / Cancel leave one dimension';
  });

  step('rfBV: Mirror Entities ✓ — the status bar keeps "Mirrored 2 entities …" (the PropertyManager closing said "Selection cleared." over it)', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 20, y1: -5, x2: 20, y2: 35, construction: true });
    f.entities.push({ t: 'line', x1: 2, y1: 10, x2: 10, y2: 10 });
    f.entities.push({ t: 'line', x1: 10, y1: 10, x2: 10, y2: 20 });
    UI.updateSketches();
    UI.setSelection([{ kind: 'entity', index: 1 }, { kind: 'entity', index: 2 }, { kind: 'entity', index: 0 }]); await wait(10);
    UI.cmdMirrorEntities(); await wait(20);
    assert(UI.pmTitle() === 'Mirror Entities', 'PM ' + UI.pmTitle());
    await pmAccept(); await wait(20);
    assert(f.entities.length === 5, 'two copies: ' + f.entities.length);
    assert(/^Mirrored 2 entities/.test(statusText()), 'status: ' + statusText());
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return statusText();
  });

  step('rfBV: the Circle box remembers R or Ø — a hole typed as Ø .266 (Tab, .266, Enter, Enter) makes the next circle\'s box open on Ø with the live value selected; typed in R again, the next opens on R', async function () {
    var errs0 = errors.length;
    await rskNew();
    UI.App.view.showGrid = false;
    UI.zoomView(0.015 / UI.cam.scale);
    var f = UI.activeSketchFeature();
    UI.setTool('circle'); rskClick([0.5, 0.5]); selEv('mousemove', rskScr([0.8, 0.5]));
    var b = UI.sketchNumBox();
    assert(b && b.length === 2, 'the R / Ø box');
    var tab = new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    D.activeElement.dispatchEvent(tab);
    assert(D.activeElement === b[1], 'Tab to Ø');
    r3sType(b[1], '.266'); pressEnter(b[1]); pressEnter(UI.sketchNumBox()[1]); await wait(20);
    var c = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(c.length === 1 && Math.abs(c[0].r - 0.133) < 1e-9 && UI.App.tool === 'select', 'Ø .266 hole: ' + JSON.stringify(c));
    UI.setTool('circle'); rskClick([2, 0.5]); selEv('mousemove', rskScr([2.2, 0.5]));
    b = UI.sketchNumBox();
    assert(b && D.activeElement === b[1] && b[1].getAttribute('aria-label') === 'Diameter', 'the next box opens on Ø: ' + (D.activeElement && D.activeElement.getAttribute('aria-label')));
    near(+b[1].value, 0.4, 0.01, 'live diameter');
    assert(b[1].selectionStart === 0 && b[1].selectionEnd === b[1].value.length, 'its text selected');
    r3sType(b[1], '.5'); pressEnter(b[1]); pressEnter(UI.sketchNumBox()[1]); await wait(20);
    c = f.entities.filter(function (e) { return e.t === 'circle'; });
    assert(c.length === 2 && Math.abs(c[1].r - 0.25) < 1e-9, 'Ø .5 hole: ' + JSON.stringify(c[1]));
    // typed in R: the next opens on R
    UI.setTool('circle'); rskClick([3, 0.5]); selEv('mousemove', rskScr([3.2, 0.5]));
    b = UI.sketchNumBox();
    D.activeElement.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    assert(D.activeElement === b[0], 'Tab round to R');
    r3sType(b[0], '.1'); pressEnter(b[0]); pressEnter(UI.sketchNumBox()[0]); await wait(20);
    UI.setTool('circle'); rskClick([3, 1.5]); selEv('mousemove', rskScr([3.2, 1.5]));
    b = UI.sketchNumBox();
    assert(b && D.activeElement === b[0], 'the next box opens on R again');
    selKey('Escape'); UI.setTool('select');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'Ø remembered, then R';
  });
  // --- end rfBV ---
