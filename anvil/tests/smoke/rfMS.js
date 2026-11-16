  // --- rfMS (2026-11-15, lane MS: drawing leftovers) --- Show in exploded or model break state per drawing view:
  // the view Properties PM (double-click on the view) ticks it, one view exploded next to a collapsed one, one undo
  // step; the API; holes across curved faces drawn as smooth curves on the live sheet ---
  function rfMSMouse(type, p, detail) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    svg.dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: q.x, clientY: q.y, detail: detail || 1 }));
  }
  function rfMSWin(id) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.id === id; })[0]; }
  function rfMSHeight(id) { var b = rfMSWin(id).proj.bounds; return b.vmax - b.vmin; }
  // a point inside view id's box clear of its linework (a double-click there opens the view's Properties)
  function rfMSInside(id) {
    var w = rfMSWin(id), b = w.box, best = null;
    for (var i = 1; i < 10 && !best; i++) for (var j = 1; j < 10 && !best; j++) {
      var p = [b.x0 + (b.x1 - b.x0) * i / 10, b.y0 + (b.y1 - b.y0) * j / 10], e = UI.drawing.edgeAt(p);
      if (!e) best = p;
    }
    return best || [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2];
  }
  var rfMSAsmCode = 'var b = a.insert({ script: \'p.name("Base"); p.box(100, 50, 10);\' }, { fixed: true });\n' +
    'var k = a.insert({ script: \'p.name("Block"); p.box(20, 20, 10);\' }, { position: [40, 10, 15], fixed: true });\n' +
    'a.explode([k], "y", 30);';

  step('rfMS: assembly drawing — double-click a Front view, tick Show in exploded or model break state, OK: that view exploded, the other Front collapsed; one undo step; the API does the same', async function () {
    var errs0 = errors.length;
    var r = await UI.openExample({ name: 'rfMS explode', kind: 'assembly', code: rfMSAsmCode }); await idle();
    assert(!r.error && UI.isAssembly(), 'assembly opened: ' + r.error);
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await idle();
    UI.drawing.fit(); await wait(20);
    var front = dwView('Front');
    assert(front, 'a Front view');
    var h0 = rfMSHeight(front.id);
    assert(Math.abs(h0 - 20) < 1e-6, 'collapsed Front 20 high: ' + h0);
    // a second Front, collapsed, beside it (the API, one step)
    var s1 = await anvil.drawing.addView('Front', { x: 330, y: 200 });
    var other = s1.views.filter(function (v) { return v.orient === 'Front' && v.id !== front.id; })[0];
    assert(other, 'second Front ' + JSON.stringify(s1.views.map(function (v) { return v.orient; })));
    await UI.drawing.ready(); await idle();
    // the mouse: double-click inside the first Front, the Properties PM
    var p = rfMSInside(front.id);
    rfMSMouse('mousemove', p); rfMSMouse('mousedown', p); rfMSMouse('mouseup', p);
    rfMSMouse('mousedown', p, 2); rfMSMouse('mouseup', p, 2); rfMSMouse('dblclick', p, 2); await idle();
    assert(UI.hasPM() && UI.pmSpec().values.exploded === false, 'Properties PM with the box: ' + (UI.hasPM() && UI.pmTitle()));
    var box = pmField('Show in exploded or model break state');
    assert(box && box.type === 'checkbox' && !box.checked, 'the box, unticked');
    var undo0 = UI.App.undo ? UI.App.undo.length : null;
    box.click(); await idle();
    await UI.pmOK(); await idle(); await UI.drawing.ready(); await idle();
    assert(!UI.hasPM(), 'PM closed');
    var h1 = rfMSHeight(front.id), h2 = rfMSHeight(other.id);
    assert(Math.abs(h1 - 50) < 1e-6 && Math.abs(h2 - 20) < 1e-6, 'ticked Front exploded (50), the other collapsed (20): ' + h1 + ' / ' + h2);
    var sv = anvil.drawing.summary().views.filter(function (v) { return v.id === front.id; })[0];
    assert(sv.exploded === UI.App.model.explodedViews[0].id, 'summary: exploded ' + sv.exploded);
    if (undo0 != null) assert(UI.App.undo.length === undo0 + 1, 'one undo step: ' + undo0 + ' -> ' + UI.App.undo.length);
    // saved in the drawing
    assert(UI.App.model.drawings[UI.drawing.state.index].views.filter(function (v) { return v.id === front.id; })[0].exploded != null, 'saved on the view');
    // undo: collapsed again
    await UI.undo(); await idle(); await UI.drawing.ready(); await idle();
    anvil.drawing.summary();
    assert(Math.abs(rfMSHeight(front.id) - 20) < 1e-6, 'undo: collapsed ' + rfMSHeight(front.id));
    // the API on the second view, and off again
    var s3 = await anvil.drawing.exploded(other.id, true); await UI.drawing.ready(); await idle(); anvil.drawing.summary();
    assert(s3 && Math.abs(rfMSHeight(other.id) - 50) < 1e-6 && Math.abs(rfMSHeight(front.id) - 20) < 1e-6, 'API: second exploded, first collapsed');
    await anvil.drawing.exploded(other.id, false); await UI.drawing.ready(); await idle(); anvil.drawing.summary();
    assert(Math.abs(rfMSHeight(other.id) - 20) < 1e-6, 'API off: collapsed');
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    UI.markClean(); anvil.drawing.close(); await idle();
    return 'Front ' + h0 + ' -> ' + h1 + ' high, other ' + h2;
  });
