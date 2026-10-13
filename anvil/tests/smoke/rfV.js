  // ---- rfV (2026-10-12): Center Mark .1 in, THRU ALL, angle dimensions in the drawing's style and as an R2000
  // angular DIMENSION, typed sections drawn without the straight cutting line
  var RFV_BLOCK = 'p.name("Blk").units("in");\np.box(4, 2, 1); p.chamfer(0.2, [[2, 1, 2]]);\n' +
    'p.hole("Top", 1, -1, 0.25, { offset: 1 });\np.hole("Top", 3, -1, 0.2, { offset: 1, depth: 3 });';
  function rfVW(orient) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === orient; })[0]; }
  function rfVAt(orient, m) { return rfVW(orient).toSheet(m); }
  function rfVMouse(type, p) {
    var c = paperToClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: c.clientX, clientY: c.clientY }));
  }
  function rfVTab(name) { Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === name; })[0].click(); }
  function rfVTexts() { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="DIMENSIONS"] text, #drawing-sheet g[data-layer="ANNOTATIONS"] text'), function (t) { return t; }); }
  async function rfVDrawing(code) {
    await anvil.newPart(); await idle();
    await anvil.run(code); await idle();
    anvil.drawing.make(); await idle(); await wait(60);
    await UI.drawing.ready();
    UI.drawing.fit(); await wait(20);
  }
  step('rfV: an inch drawing: Center Mark PM shows the mark size .1 (inches), Hole Callout reads THRU ALL for a Through All cut and THRU for a blind one that clears, a Smart Dimension angle is drawn at the ANSI .125 text height and saved as an angular DIMENSION', async function () {
    var errs0 = errors.length;
    await rfVDrawing(RFV_BLOCK);
    rfVTab('Annotation');
    ribbonButton('Center Mark').click(); await wait(30);
    assert(UI.hasPM() && pmField('Mark size') && Math.abs(+pmField('Mark size').value - 0.1) < 1e-9, 'mark size ' + (pmField('Mark size') && pmField('Mark size').value));
    UI.pmCancel(); await wait(20);
    var top = rfVW('Top').view.id;
    anvil.drawing.holeCallout(top, { c: [1, -1], r: 0.125 });
    var s = anvil.drawing.holeCallout(top, { c: [3, -1], r: 0.1 }), hc = s.annotations.filter(function (a) { return a.type === 'holeCallout'; }).map(function (a) { return a.text; });
    assert(hc.join('|') === 'Ø.250 THRU ALL|Ø.200 THRU', 'callouts ' + hc.join('|'));
    var drawn = rfVTexts().map(function (t) { return t.textContent; });
    assert(drawn.indexOf('Ø.250 THRU ALL') >= 0 && drawn.indexOf('Ø.200 THRU') >= 0, 'drawn ' + drawn.join('|'));
    // the angle: the chamfer line and the lead-in edge of the Right view, the pointer on the acute side
    var R = rfVW('Right'), mid = function (l) { return [(l[0] + l[2]) / 2, (l[1] + l[3]) / 2]; };
    var ch = R.proj.lines.visible.filter(function (l) { return Math.abs(Math.abs(l[2] - l[0]) - 0.2) < 1e-9 && Math.abs(Math.abs(l[3] - l[1]) - 0.2) < 1e-9; })[0];
    var lead = R.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - 1) < 1e-9 && Math.abs(l[3] - 1) < 1e-9; })[0];
    assert(ch && lead, 'edges');
    var V = W.Drawing.smartDim({ edge: [[ch[0], ch[1]], [ch[2], ch[3]]] }, { edge: [[lead[0], lead[1]], [lead[2], lead[3]]] }, null).c;
    var mc = mid(ch), ml = mid(lead), at = [V[0] - (mc[0] - V[0]) * 3 + (ml[0] - V[0]) * 1.5, V[1] - (mc[1] - V[1]) * 3 + (ml[1] - V[1]) * 1.5];
    ribbonButton('Smart Dimension').click();
    rfVMouse('mousedown', rfVAt('Right', mc));
    rfVMouse('mousedown', rfVAt('Right', ml));
    rfVMouse('mousemove', rfVAt('Right', at));
    rfVMouse('mousedown', rfVAt('Right', at));
    key('Escape'); await wait(30);
    var t45 = rfVTexts().filter(function (t) { return t.textContent === '45°'; })[0], tlin = rfVTexts().filter(function (t) { return /^\d*\.\d{3}$/.test(t.textContent) && t.closest('g[data-layer="DIMENSIONS"]'); })[0];
    assert(t45 && tlin, 'angle and a linear dimension drawn: ' + rfVTexts().map(function (t) { return t.textContent; }).join('|'));
    assert(Math.abs(+t45.getAttribute('font-size') / +tlin.getAttribute('font-size') - 1) < 1e-6, 'same text height: ' + t45.getAttribute('font-size') + ' / ' + tlin.getAttribute('font-size'));
    var dxf = anvil.drawing.dxf({ version: 'R2000' }), nd = (dxf.match(/\n0\nDIMENSION\n/g) || []).length;
    assert(/\nAcDb3PointAngularDimension\n/.test(dxf) && nd === anvil.drawing.summary().dims.length, 'angular DIMENSION, ' + nd + ' of ' + anvil.drawing.summary().dims.length);
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return hc.join(', ') + '; ' + nd + ' DIMENSION';
  });
  step('rfV: a Half section through anvil.drawing.sectionView: the parent shows the L-shaped path only (no straight cutting line under it); no console errors', async function () {
    var errs0 = errors.length;
    await rfVDrawing('p.name("Pl").units("mm");\np.sketch("Front").rect(0, 0, 100, 50).circle(20, 25, 5).circle(80, 25, 5).extrude(10);');
    var fr = rfVW('Front').view.id;
    var s = anvil.drawing.sectionView(fr, { axis: 'h', at: 25, sign: 1, type: 'half', c: 50, side: 1 }); await UI.drawing.ready(); await wait(30);
    var sv = s.views.filter(function (v) { return v.kind === 'section'; })[0];
    assert(sv, 'section view ' + JSON.stringify(s.views.map(function (v) { return v.kind; })));
    var sh = UI.drawing.state.sheet, pw = sh.views.filter(function (w) { return w.view.id === fr; })[0];
    var chain = sh.prims.filter(function (p) { return p.layer === pw.layer && p.k === 'line' && p.style === 'chain' && p.view == null; });
    assert(chain.length >= 2 && chain.every(function (p) { return p.cutLine === sv.id; }), 'path legs only: ' + chain.length);
    anvil.drawing.close(); await idle();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
    return chain.length + ' legs';
  });
  // --- end rfV ---

