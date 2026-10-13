  // ---- rfAC (shop workflow findings 1 and 2, 2026-10-12): a hole circle crossing the blank's outline is refused by
  // Base Flange / Boss-Extrude with the place it crosses (never silently dropped); a Smart Dimension that over-defines a
  // typed Corner Rectangle asks Make Dimension Driven?, and a feature built from an over-defined sketch warns
  async function rfACBlank() {
    await rskNew();
    UI.setTool('rect'); rskClick([0, 0]);
    D.dispatchEvent(new W.KeyboardEvent('keydown', { key: '4', bubbles: true, cancelable: true }));
    var b = UI.sketchNumBox();
    assert(b && b.length === 2, 'rectangle box');
    b[0].value = '40'; b[0].dispatchEvent(new W.Event('input', { bubbles: true }));
    b[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
    b[1].value = '24'; b[1].dispatchEvent(new W.Event('input', { bubbles: true }));
    b[1].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await idle(); selKey('Escape'); UI.setTool('select'); await idle();
    return UI.activeSketchFeature();
  }
  step('rfAC: Smart Dimension on the bottom edge of a typed Corner Rectangle (already 40 x 24) asks Make Dimension Driven?; Make this dimension driven leaves the sketch Fully Defined', async function () {
    var errs0 = errors.length;
    var f = await rfACBlank();
    [[4, 4], [36, 4], [4, 20], [36, 20]].forEach(function (c) {
      UI.setTool('circle'); rskClick(c);
      D.dispatchEvent(new W.KeyboardEvent('keydown', { key: '1', bubbles: true, cancelable: true }));
      var b = UI.sketchNumBox(); b[0].value = '1.124'; b[0].dispatchEvent(new W.Event('input', { bubbles: true }));
      b[0].dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      selKey('Escape');
    });
    UI.setTool('line'); rskClick([40, 20]); rskClick([36, 20]); rskClick([36, 24]); selKey('Escape'); selKey('Escape');
    UI.cmdTrimEntities(); rskClick([38, 24]); rskClick([40, 22]); UI.pmOK(); await idle();
    var st0 = UI.sketchStatus();
    var nd = (f.dims || []).length, nr = (f.rels || []).length;
    UI.setTool('dimension'); rskClick([20, 0]); rskClick([20, -6]); await idle();
    var st1 = UI.sketchStatus();
    var info = 'before ' + st0.status + ' dof ' + st0.dof + ' dims ' + nd + ' rels ' + nr + '; after ' + st1.status + ' dims ' + (f.dims || []).length + ' rels ' + (f.rels || []).length + ' modal ' + modalOpen() + ' edit ' + UI.isDimEditOpen() + ' msg ' + $('status-msg').textContent;
    assert(modalOpen() && $('drv-driven'), 'Make Dimension Driven? asks: ' + info);
    assert(!UI.isDimEditOpen(), 'the question comes instead of the Modify box');
    $('drv-driven').click(); await idle();
    assert(UI.sketchStatus().status !== 'over' && f.dims[f.dims.length - 1].driven, 'the new dimension is driven, nothing over defined: ' + UI.sketchStatus().status);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return info;
  });
  step('rfAC: Leave this dimension driving keeps the sketch Over Defined; Exit Sketch and Base Flange/Tab build, but the sketch and Base-Flange1 carry an over-defined rebuild warning (tree and status)', async function () {
    var errs0 = errors.length;
    var f = await rfACBlank();
    UI.setTool('dimension'); rskClick([20, 0]); rskClick([20, -6]); await idle();
    assert(modalOpen() && $('drv-driving'), 'Make Dimension Driven? asks');
    $('drv-driving').click(); await idle();
    assert(UI.sketchStatus().status === 'over', 'over defined: ' + UI.sketchStatus().status);
    var sid = f.id;
    UI.cmdBaseFlange(); await idle();
    assert(UI.hasPM() && UI.pmTitle() === 'Base Flange/Tab', 'Base Flange PM: ' + UI.pmTitle());
    await pmAccept(); await idle();
    var bf = UI.App.model.features.filter(function (x) { return x.type !== 'sketch' && x.sketch === sid; })[0];
    assert(bf, 'Base-Flange1 on the sketch: ' + UI.App.model.features.map(function (x) { return x.type + ':' + x.sketch; }).join(','));
    var W0 = UI.App.build.warnings || {};
    assert(Object.keys(UI.App.build.errors || {}).length === 0 && anvil.summary().volume > 0, 'it builds: ' + JSON.stringify(UI.App.build.errors));
    assert(/over defined/.test(W0[sid] || '') && /over defined/.test(W0[bf.id] || ''), 'warnings: ' + JSON.stringify(W0));
    var rows = Array.prototype.filter.call(D.querySelectorAll('#tree .warn'), function (r) { return r.textContent.indexOf(bf.name) >= 0; });
    assert(rows.length > 0, 'the Base Flange row is marked');
    assert(/over defined/.test($('status-msg').textContent), 'status: ' + $('status-msg').textContent);
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return W0[bf.id];
  });
  step('rfAC: a hole circle centred on the notch corner (crossing the outline) — Base Flange/Tab is refused with "Sketch contours intersect near (36, 20)", the hole is never silently dropped', async function () {
    var errs0 = errors.length;
    await rskNew();
    var f = UI.activeSketchFeature();
    f.entities.push({ t: 'line', x1: 0, y1: 0, x2: 40, y2: 0 }, { t: 'line', x1: 40, y1: 0, x2: 40, y2: 20 }, { t: 'line', x1: 40, y1: 20, x2: 36, y2: 20 }, { t: 'line', x1: 36, y1: 20, x2: 36, y2: 24 }, { t: 'line', x1: 36, y1: 24, x2: 0, y2: 24 }, { t: 'line', x1: 0, y1: 24, x2: 0, y2: 0 },
      { t: 'circle', cx: 4, cy: 4, r: 0.562 }, { t: 'circle', cx: 36, cy: 4, r: 0.562 }, { t: 'circle', cx: 4, cy: 20, r: 0.562 }, { t: 'circle', cx: 36, cy: 20, r: 0.562 });
    UI.updateSketches();
    UI.cmdBaseFlange(); await idle();
    await pmAccept(); await idle();
    var errs = UI.App.build.errors || {}, msg = Object.keys(errs).map(function (k) { return errs[k]; }).join(' | ') + ' ' + ((D.querySelector('#pm .pm-msg, #pm .pm-error') || {}).textContent || '') + ' ' + $('status-msg').textContent;
    assert(/Sketch contours intersect near \(36(\.\d+)?, 20(\.0+)?\)/.test(msg), 'refused with the place: ' + msg);
    var bf = UI.App.model.features.filter(function (x) { return x.type !== 'sketch' && x.sketch === f.id; })[0];
    assert(!bf || errs[bf.id], 'no Base Flange built from part of the sketch');
    if (UI.hasPM()) UI.pmCancel();
    await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return msg.slice(0, 120);
  });
  // --- end rfAC ---
