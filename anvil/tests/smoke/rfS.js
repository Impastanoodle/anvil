  // ---- rfS (lane S, 2026-10-12): drawing Smart Dimension with picks and a placement click; Save Drawing as DWG
  function rfSW(orient) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; }
  function rfSAt(orient, m) { return rfSW(orient).toSheet(m); }
  function rfSMouse(type, p, opts) {
    var c = paperToClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY }, opts || {})));
  }
  function rfSUser(orient) { var v = anvil.drawing.doc().views.filter(function (x) { return x.orient === orient; })[0]; return (v && v.dims) || []; }
  async function rfSDrawing(code) {
    await anvil.newPart(); await idle();
    await anvil.run(code || plateCode()); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
    UI.drawing.fit(); await wait(20);
  }
  step('rfS: drawing Smart Dimension — hole centre then the left edge then a placement click reads 10 (preview first, the Dimension PM opens on it); hole to hole 80, Shift-picked near sides 72; Esc closes the PM and ends the tool', async function () {
    var errs0 = errors.length;
    await rfSDrawing();
    ribbonButton('Smart Dimension').click();
    assert(UI.drawing.state.tool === 'dim', 'tool on');
    rfSMouse('mousedown', rfSAt('Top', [10, -10]));                     // the hole's centre
    assert(UI.drawing.state.pending && UI.drawing.state.pending.first.pick.center, 'first pick: centre ' + JSON.stringify(UI.drawing.state.pending && UI.drawing.state.pending.first.pick));
    assert(rfSUser('Top').length === 0, 'nothing placed on the first pick');
    rfSMouse('mousedown', rfSAt('Top', [0, -30]));                      // the left edge
    assert(UI.drawing.state.pending.second && UI.drawing.state.pending.second.pick.edge, 'second pick: the edge');
    rfSMouse('mousemove', rfSAt('Top', [5, 8]));
    var prev = Array.prototype.map.call(D.querySelectorAll('#dw-overlay text.dw-sdprev'), function (t) { return t.textContent; });
    assert(prev.indexOf('10') >= 0 && D.querySelectorAll('#dw-overlay line.dw-sdprev').length >= 3, 'preview 10: ' + prev);
    rfSMouse('mousedown', rfSAt('Top', [5, 8]));                        // place above the view
    var d = rfSUser('Top');
    assert(d.length === 1 && d[0].kind === 'h' && Math.abs(d[0].value - 10) < 1e-9 && d[0].refs && Math.abs(d[0].at - 8) < 0.5, 'placed: ' + JSON.stringify(d));
    assert(UI.hasPM() && /Dimension/.test($('pm').textContent || ''), 'the Dimension PM is open');
    assert(UI.drawing.state.tool === 'dim' && !UI.drawing.state.pending, 'the tool goes on');
    assert(anvil.drawing.summary().dims.indexOf('10') >= 0, 'drawn: ' + anvil.drawing.summary().dims);
    // hole to hole: two circle picks, then the placement (the next pick closes the PM)
    rfSMouse('mousedown', rfSAt('Top', [14, -10]));
    assert(!UI.hasPM() && UI.drawing.state.tool === 'dim', 'the PM closed with the next pick');
    rfSMouse('mousedown', rfSAt('Top', [86, -10]));
    rfSMouse('mousedown', rfSAt('Top', [50, 14]));
    d = rfSUser('Top');
    assert(d.length === 2 && d[1].kind === 'h' && Math.abs(d[1].value - 80) < 1e-9, 'hole to hole ' + JSON.stringify(d[1]));
    // Shift on the near sides: min 72
    rfSMouse('mousedown', rfSAt('Top', [14, -10]), { shiftKey: true });
    rfSMouse('mousedown', rfSAt('Top', [86, -10]), { shiftKey: true });
    rfSMouse('mousedown', rfSAt('Top', [50, 20]));
    d = rfSUser('Top');
    assert(d.length === 3 && Math.abs(d[2].value - 72) < 1e-9 && d[2].minmax === 'min', 'min ' + JSON.stringify(d[2]));
    var dims = anvil.drawing.summary().dims;
    assert(dims.indexOf('80') >= 0 && dims.indexOf('72') >= 0, 'drawn ' + dims);
    key('Escape');
    assert(!UI.hasPM() && UI.drawing.state.tool === null, 'Esc ended it');
    // an edge, then Esc before the placement: nothing added
    ribbonButton('Smart Dimension').click();
    rfSMouse('mousedown', rfSAt('Top', [50, 0]));
    key('Escape');
    assert(rfSUser('Top').length === 3 && UI.drawing.state.tool === null, 'Esc cancels a pending pick');
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return d.map(function (x) { return x.value; }).join(', ');
  });
  step('rfS: drawing Smart Dimension — two parallel edges give their distance, two edges at an angle give 45° in the pointer\'s quadrant, drawn with an arc and its text', async function () {
    var errs0 = errors.length;
    await rfSDrawing('p.name("Blk").units("mm");\np.box(40, 20, 10); p.chamfer(2, [[20, 10, 20]]);');
    var R = rfSW('Right');
    var ch = R.proj.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[2] - l[0]) - 2) < 1e-9 && Math.abs(Math.abs(l[3] - l[1]) - 2) < 1e-9; })[0];
    var lead = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - 10) < 1e-9 && Math.abs(l[3] - 10) < 1e-9; })[0];
    var bot = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1]) < 1e-9 && Math.abs(l[3]) < 1e-9; })[0];
    assert(ch && lead && bot, 'edges');
    var mid = function (l) { return [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2]; };
    ribbonButton('Smart Dimension').click();
    rfSMouse('mousedown', rfSAt('Right', mid(lead)));
    rfSMouse('mousedown', rfSAt('Right', mid(bot)));
    var bx = [Math.max(bot[0], bot[2]) + 6, 5];
    rfSMouse('mousedown', rfSAt('Right', bx));
    var d = rfSUser('Right');
    assert(d.length === 1 && d[0].kind === 'v' && Math.abs(d[0].value - 10) < 1e-9, 'parallel edges ' + JSON.stringify(d));
    // the angle: the chamfer line and the lead-in edge, the pointer past the vertex along the chamfer line (acute side)
    var V = W.Drawing.smartDim({ edge: [[ch[0], ch[1]], [ch[2], ch[3]]] }, { edge: [[lead[0], lead[1]], [lead[2], lead[3]]] }, null).c;
    var mc = mid(ch), ml = mid(lead), at = [V[0] - (mc[0] - V[0]) * 3 + (ml[0] - V[0]) * 1.5, V[1] - (mc[1] - V[1]) * 3 + (ml[1] - V[1]) * 1.5];
    rfSMouse('mousedown', rfSAt('Right', mc));
    rfSMouse('mousedown', rfSAt('Right', ml));
    rfSMouse('mousemove', rfSAt('Right', at));
    assert(D.querySelectorAll('#dw-overlay path.dw-sdprev').length === 1, 'angle preview arc');
    rfSMouse('mousedown', rfSAt('Right', at));
    d = rfSUser('Right');
    assert(d.length === 2 && d[1].kind === 'angle' && Math.abs(d[1].value - 45) < 1e-9, 'angle ' + JSON.stringify(d[1]));
    key('Escape');
    var texts = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] text'), function (t) { return t.textContent; });
    assert(texts.indexOf('45°') >= 0 && texts.indexOf('10') >= 0, 'sheet texts ' + texts.join('|'));
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return d.map(function (x) { return x.kind + ' ' + x.value; }).join(', ');
  });
  step('rfS: Save Drawing as DWG — File menu and View Layout ribbon entries; without a converter the part path\'s message; with one the R2000 DXF of the sheet goes to it and the .dwg is saved', async function () {
    var errs0 = errors.length;
    await rfSDrawing();
    var rows = menuRows('Save Drawing as DWG');
    assert(rows.length && rows[0].menu === 'File', 'File menu entry');
    if (UI.closeMenus) UI.closeMenus();
    // no converter on the test server (503): the message, nothing downloaded
    var toasts = [], baseToast = UI.toast, baseDl = UI.download, saved = [];
    UI.toast = function (m) { toasts.push(m); };
    UI.download = function (n, data, mime) { saved.push({ n: n, data: data, mime: mime }); };
    try {
      var r0 = await anvil.drawing.dwg();
      var conv = await UI.dwgConverter();
      if (!conv) assert(r0 === null && toasts.some(function (m) { return /DWG needs the local server/.test(m); }) && !saved.length, 'no converter: ' + toasts.join(' | '));
      // with a real converter on this machine the first call already saved a real .dwg
      if (conv) assert(r0 && /\.dwg$/.test(r0.name) && saved.length === 1, 'real converter saved one .dwg');
      saved.length = 0;
      // a converter (stubbed): gets the R2000 DXF, the .dwg is saved
      var baseConv = UI.dwgConverter, baseX = UI.dxfToDwg, sent = null;
      UI.dwgConverter = function () { return Promise.resolve('oda'); };
      UI.dxfToDwg = function (t) { sent = t; return Promise.resolve(new ArrayBuffer(64)); };
      try { var r1 = await anvil.drawing.dwg(); } finally { UI.dwgConverter = baseConv; UI.dxfToDwg = baseX; }
      assert(sent && sent.indexOf('AC1015') >= 0 && /\nTEXT\n|\nMTEXT\n/.test(sent), 'R2000 DXF sent');
      assert(r1 && /\.dwg$/.test(r1.name) && saved.length === 1 && saved[0].mime === 'application/acad', 'saved ' + JSON.stringify(saved.map(function (s) { return s.n; })));
    } finally { UI.toast = baseToast; UI.download = baseDl; }
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return saved[0].n;
  });
  // --- end rfS ---
