  // --- rfHX (2026-11-04, lane drawing) --- a bend note dragged with the mouse keeps its bend (a flange on a wall,
  // whose bend only the kernel's id names) when an edge flange is added earlier in the tree; the Cross-Break note in
  // the flat view, dragged; Insert ▸ Drawing View ▸ Empty placed by a click and dragged with its sketch; View ▸
  // Hide/Show Annotations hiding and showing a dimension and a note by clicks. Real mouse events on the sheet.
  var HX_T = 0.0598;
  var HX_PART = 'p.name("HXBracket").units("in");\np.sheet(' + HX_T + ', ' + HX_T + ', 0.5);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
    'p.flange(1, [[4, ' + HX_T + ', 1]], { position: "inside" });\np.flange(0.75, [[4, ' + (1 + 2 * HX_T) + ', 1]], { position: "inside" });\n' +
    'p.crossBreak([1, ' + HX_T + ', 0.5]);\n';
  function rfHXClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfHXMouse(type, p) {
    var c = rfHXClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: c.clientX, clientY: c.clientY, detail: 1 }));
  }
  function rfHXClick(p) { rfHXMouse('mousemove', p); rfHXMouse('mousedown', p); rfHXMouse('mouseup', p); }
  async function rfHXDrag(from, to) {
    rfHXMouse('mousemove', from); rfHXMouse('mousedown', from);
    for (var i = 1; i <= 6; i++) { rfHXMouse('mousemove', [from[0] + (to[0] - from[0]) * i / 6, from[1] + (to[1] - from[1]) * i / 6]); await wait(10); }
    rfHXMouse('mouseup', to); await UI.drawing.ready(); await wait(30);
  }
  function rfHXMid(b) { return [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2]; }
  function rfHXAnn(pred) { UI.drawing.settle(); return UI.drawing.state.sheet.annotations.filter(pred)[0]; }
  function rfHXMenu(text) { var r = menuRows(text); assert(r.length, 'menu entry ' + text); r[0].row.click(); if (UI.closeMenus) UI.closeMenus(); return r[0]; }
  function rfHXKey(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  async function rfHXDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(HX_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.flatView({ x: 14, y: 3.5, bendNotes: 'notes' }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(30);
    return anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0].id;
  }

  step('rfHX: a bend note dragged on the flat view (the flange on a wall) stays with its bend after an edge flange is added earlier in the tree; the Cross-Break note sits at the X and drags too', async function () {
    var errs0 = errors.length;
    var fv = await rfHXDrawing();
    var wall = UI.App.model.features.filter(function (f) { return f.type === 'flange'; })[1], key = 'bend:' + wall.id + ':0';
    var note = rfHXAnn(function (a) { return a.flat && a.key === key; });
    assert(note && note.type === 'bendNote', 'the wall flange\'s note by its id: ' + JSON.stringify(UI.drawing.state.sheet.annotations.filter(function (a) { return a.flat; }).map(function (a) { return a.key; })));
    var p0 = rfHXMid(note.box);
    await rfHXDrag(p0, [p0[0] + 0.5, p0[1] + 0.25]);
    var own = anvil.drawing.doc().views.filter(function (v) { return v.id === fv; })[0].flatAnn;
    assert(own && own[key] && Math.abs(own[key].off[0] - 0.5) < 0.03 && Math.abs(own[key].off[1] - 0.25) < 0.03, 'dragged ' + JSON.stringify(own));
    var off = own[key].off.slice(), text0 = note.text;
    // an edge flange on the base's far edge, moved to the top of the tree (before both flanges)
    await anvil.append('p.flange(1, [[0, ' + HX_T + ', 1]], { position: "inside" });'); await idle();
    var F = UI.App.model.features, nf = F[F.length - 1];
    F.splice(F.length - 1, 1); F.splice(F.indexOf(F.filter(function (f) { return f.type === 'flange'; })[0]), 0, nf);
    await UI.rebuild(); await idle(); await UI.drawing.ready(); await wait(80);
    var fd = anvil.drawing.summary().views.filter(function (v) { return v.id === fv; })[0].flat;
    assert(fd.bends.length === 3 && fd.bends[0].key === 'bend:' + nf.id + ':0', 'the new flange\'s bend comes first ' + JSON.stringify(fd.bends.map(function (b) { return b.key; })));
    var moved = rfHXAnn(function (a) { return a.flat && a.key === key; });
    assert(moved && moved.text === text0 && Math.abs(moved.off[0] - off[0]) < 1e-9 && Math.abs(moved.off[1] - off[1]) < 1e-9, 'note kept ' + JSON.stringify(moved && [moved.text, moved.off]));
    var bi = fd.bends.map(function (b) { return b.key; }).indexOf(key);
    assert(moved.info.bend === bi && bi === 2, 'points at its bend ' + moved.info.bend + ' / ' + bi);
    // Cross-Break note: in the view, then dragged
    var cb = rfHXAnn(function (a) { return a.flat && a.type === 'crossBreakNote'; });
    assert(cb && /^(UP|DOWN) 1° R ?\.060$/.test(cb.text), 'Cross-Break note ' + (cb && cb.text));
    var svgT = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet svg g[data-layer="BEND_NOTES"] text'), function (t) { return t.textContent; });
    assert(svgT.indexOf(cb.text) >= 0, 'on the sheet: ' + svgT.join(' | '));
    var c0 = rfHXMid(cb.box);
    await rfHXDrag(c0, [c0[0] - 0.4, c0[1] + 0.3]);
    var cb2 = rfHXAnn(function (a) { return a.flat && a.type === 'crossBreakNote'; });
    assert(Math.abs(cb2.off[0] + 0.4) < 0.03 && Math.abs(cb2.off[1] - 0.3) < 0.03, 'Cross-Break note dragged ' + JSON.stringify(cb2.off));
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(40);
    var cb3 = rfHXAnn(function (a) { return a.flat && a.type === 'crossBreakNote'; });
    assert(!cb3.off[0] && !cb3.off[1], 'undo ' + JSON.stringify(cb3.off));
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return key + ' → bend ' + bi + ', Cross-Break ' + cb.text;
  });

  step('rfHX: Insert > Drawing View > Empty, placed with a click; a sketch line in it; the view dragged takes the line along; Undo', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.units("in");\np.box(2, 1, 0.5);'); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    var n0 = anvil.drawing.summary().views.length;
    rfHXMenu('Drawing View ▸ Empty');
    assert(UI.drawing.state.tool === 'sk:emptyview', 'tool ' + UI.drawing.state.tool);
    rfHXMouse('mousemove', [13, 3]); await wait(10);
    assert(D.querySelector('#drawing-sheet svg .dw-empty-prev'), 'placement preview');
    rfHXClick([13, 3]); await UI.drawing.ready(); await wait(30);
    var vs = anvil.drawing.summary().views, ev = vs.filter(function (v) { return v.kind === 'empty'; })[0];
    assert(vs.length === n0 + 1 && ev && Math.abs(ev.x - 13) < 0.05 && Math.abs(ev.y - 3) < 0.05, 'placed ' + JSON.stringify(ev));
    var ev0 = anvil.drawing.doc().views.filter(function (v) { return v.id === ev.id; })[0], x0 = ev0.x, y0 = ev0.y;   // (summary() rounds)
    assert(!UI.drawing.state.tool, 'tool ends');
    var row = Array.prototype.filter.call(D.querySelectorAll('#drawing-tree .ti .badge'), function (r) { return r.textContent === 'Empty'; })[0];
    assert(row, 'tree row badge Empty: ' + Array.prototype.map.call(D.querySelectorAll('#drawing-tree .ti .badge'), function (r) { return r.textContent; }).join(' | '));
    var ln = anvil.drawing.sketch.add({ t: 'line', a: [12.8, 2.9], b: [13.3, 3.2] }, ev.id); await UI.drawing.ready();
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.id === ev.id; })[0];
    // drag the view by an empty spot inside its box (not on the line)
    var from = [w.box.x0 + 0.1, w.box.y1 - 0.1];
    await rfHXDrag(from, [from[0] + 1, from[1] - 0.5]);
    var v2 = anvil.drawing.doc().views.filter(function (v) { return v.id === ev.id; })[0], l2 = anvil.drawing.sketch.get(ln.id);
    assert(Math.abs(v2.x - x0 - 1) < 0.05 && Math.abs(v2.y - y0 + 0.5) < 0.05, 'view moved to ' + [v2.x, v2.y]);
    assert(Math.abs(l2.a[0] - (12.8 + v2.x - x0)) < 1e-9 && Math.abs(l2.a[1] - (2.9 + v2.y - y0)) < 1e-9, 'line moved with it ' + JSON.stringify(l2.a));
    await UI.undo(); await idle(); await UI.drawing.ready();
    var v3 = anvil.drawing.doc().views.filter(function (v) { return v.id === ev.id; })[0];
    assert(v3 && v3.x === x0 && v3.y === y0, 'undo ' + (v3 && [v3.x, v3.y]));
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return 'empty view at 13, 3, dragged with its line';
  });

  step('rfHX: View > Hide/Show Annotations: click a dimension and a note to hide them (grey while the tool runs), Esc hides them from the sheet, the tool again shows them grey, a click shows one again', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("HXPlate").units("in");\np.box(4, 2, 0.25);'); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    anvil.drawing.modelItems(true); await UI.drawing.ready();
    anvil.drawing.note({ p: [1.5, 1.5], text: 'DEBURR' }); await UI.drawing.ready();
    UI.drawing.fit(); await wait(30);
    UI.drawing.settle();
    var sh = UI.drawing.state.sheet, nd0 = sh.dims.length, dim = sh.dims.filter(function (d) { return d.tbox; })[0], note = sh.notes.filter(function (n) { return n.text === 'DEBURR'; })[0];
    assert(dim && note, 'a dimension and the note');
    rfHXMenu('Hide/Show Annotations');
    assert(UI.drawing.state.tool === 'sk:hideann', 'tool ' + UI.drawing.state.tool);
    var dp = rfHXMid(dim.tbox), np = rfHXMid(note.box);
    rfHXClick(dp); await UI.drawing.ready(); await wait(30);
    rfHXClick(np); await UI.drawing.ready(); await wait(30);
    var dc = anvil.drawing.doc();
    assert((dc.hiddenAnn || []).indexOf(dim.key) >= 0 && dc.notes.filter(function (n) { return n.text === 'DEBURR'; })[0].hidden, 'hidden ' + JSON.stringify(dc.hiddenAnn));
    var grey = D.querySelectorAll('#drawing-sheet svg [data-color="hiddenAnn"]').length;
    assert(grey > 0, 'grey while the tool runs');
    rfHXKey('Escape'); await wait(80); await UI.drawing.ready();
    UI.drawing.settle();
    var sh2 = UI.drawing.state.sheet, texts = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet svg text'), function (t) { return t.textContent; });
    assert(!UI.drawing.state.tool && sh2.dims.length === nd0 - 1 && texts.indexOf('DEBURR') < 0 && !D.querySelector('#drawing-sheet svg [data-color="hiddenAnn"]'), 'off the sheet ' + sh2.dims.length + ' ' + texts.indexOf('DEBURR'));
    rfHXMenu('Hide/Show Annotations'); await wait(80); await UI.drawing.ready();
    assert(D.querySelectorAll('#drawing-sheet svg [data-color="hiddenAnn"]').length === grey, 'grey again');
    rfHXClick(np); await UI.drawing.ready(); await wait(30);
    assert(!anvil.drawing.doc().notes.filter(function (n) { return n.text === 'DEBURR'; })[0].hidden, 'note shown again');
    rfHXKey('Escape'); await wait(80); await UI.drawing.ready();
    texts = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet svg text'), function (t) { return t.textContent; });
    assert(texts.indexOf('DEBURR') >= 0 && UI.drawing.state.sheet.dims.length === nd0 - 1, 'note back, dimension still hidden');
    await UI.undo(); await idle(); await UI.drawing.ready();
    assert(anvil.drawing.doc().notes.filter(function (n) { return n.text === 'DEBURR'; })[0].hidden, 'undo hides the note again');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return nd0 + ' dims, one hidden; ' + grey + ' grey primitives while the tool runs';
  });
  // --- end rfHX ---
