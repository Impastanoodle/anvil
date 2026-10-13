  // --- p9-drawing: shop drawings of sheet-metal parts (run local-2026-10-07a): the flat-pattern view through Model
  // View, bend lines and notes, inch ANSI text, the Note tool
  var P9_INCH = 'p.name("Bracket").units("in");\np.sheet(0.06, 0.03, 0.44);\np.sketch("Top").rect(0, -2, 4, 2).end().baseFlange();\n' +
    'p.sketch("Top", 0.06).slot(1.5, -1, 2.5, -1, 0.3).cut("through", { reverse: true });\np.flange(1, [[0, 0.06, 1]]);\np.flange(1, [[4, 0.06, 1]], { reverse: true });\n' +
    'p.hole("Top", 0.5, -0.5, 0.281, { offset: 0.06 });\np.hole("Top", 3.5, -0.5, 0.281, { offset: 0.06 });\np.hole("Top", 0.5, -1.5, 0.281, { offset: 0.06 });\np.hole("Top", 3.5, -1.5, 0.281, { offset: 0.06 });';
  step('p9-drawing: Model View offers Flat pattern on an inch sheet-metal part; a click places it: bend lines UP solid on BEND_UP, DOWN dashed on BEND_DOWN, notes "UP 90° R .030", no overall dimensions until Document Properties adds them (rfV) then 6.177 × 2.000, a Ø.281 THRU ALL callout; a bend note drags', async function () {
    await anvil.newPart(); await idle();
    await anvil.run(P9_INCH); await idle();
    anvil.drawing.make(); await UI.drawing.ready(); await wait(30);
    assert(anvil.drawing.summary().dims.indexOf('4.180') >= 0, 'inch model items read ANSI (4.180): ' + anvil.drawing.summary().dims.join(' '));
    ribbonButton('Model View').click();
    assert(UI.hasPM() && pmField('View').value === 'Flat pattern', 'Model View opens on Flat pattern for a sheet-metal part: ' + (pmField('View') && pmField('View').value));
    await UI.pmOK();
    assert(UI.drawing.state.tool === 'place', 'placing mode');
    sheetMouse('mousedown', [5.2, 2.4]); await UI.drawing.ready(); await wait(30);
    var s = anvil.drawing.summary(), fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(fv && fv.flat && !fv.flat.error, 'flat view ' + JSON.stringify(fv && fv.flat));
    near(fv.x, 5.2, 0.03, 'x'); near(fv.y, 2.4, 0.03, 'y');   // (a click lands to the pixel: about .012 in on the fitted sheet)
    assert(fv.flat.bends.length === 2 && fv.flat.bends[0].up === true && fv.flat.bends[1].up === false, 'bends ' + JSON.stringify(fv.flat.bends));
    // (the note texts through Drawing.bendNoteText: the drawing's own 'UP 90° R .030', or Kernel.bendNoteText's)
    var NUP = W.Drawing.bendNoteText({ up: true, angle: 90, R: 0.03 }, 'in'), NDN = W.Drawing.bendNoteText({ up: false, angle: 90, R: 0.03 }, 'in');
    assert(fv.flat.bends[0].note === NUP && fv.flat.bends[1].note === NDN, 'notes ' + fv.flat.bends.map(function (b) { return b.note; }));
    // (rfV) SolidWorks inserts no overall dimensions on a flat-pattern view by itself; Document Properties ▸ Overall dimensions does
    assert(s.dims.indexOf('6.177') < 0, 'no overall flat dims by default ' + s.dims.join(' '));
    anvil.drawing.options({ flatDims: true }); await UI.drawing.ready(); await wait(30);
    s = anvil.drawing.summary(); fv = s.views.filter(function (v) { return v.kind === 'flat'; })[0];
    assert(s.dims.indexOf('6.177') >= 0 && s.dims.filter(function (t) { return t === '2.000'; }).length >= 2, 'overall flat dims ' + s.dims.join(' '));
    var up = D.querySelectorAll('#drawing-sheet g[data-layer="BEND_UP"] line'), dn = D.querySelectorAll('#drawing-sheet g[data-layer="BEND_DOWN"] line');
    assert(up.length === 1 && !up[0].getAttribute('stroke-dasharray') && dn.length === 1 && dn[0].getAttribute('stroke-dasharray'), 'bend lines drawn: up ' + up.length + ' down ' + dn.length);
    var nt = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="BEND_NOTES"] text'), function (t) { return t.textContent; });
    assert(nt.indexOf(NUP) >= 0 && nt.indexOf(NDN) >= 0, 'bend notes drawn ' + nt);
    assert(D.querySelector('#drawing-tree .dw-flat') && D.querySelector('#drawing-tree .dw-bendNotes'), 'tree rows');
    var hs = anvil.drawing.holeCallout(fv.id, { c: [0.5, -0.5], r: 0.1405 });
    var hc = hs.annotations.filter(function (a) { return a.type === 'holeCallout' && a.view === fv.id; });
    assert(hc.length === 1 && hc[0].text === '4X Ø.281 THRU ALL', 'flat callout ' + JSON.stringify(hc));
    // drag the UP note 0.4 in to the left: its offset is kept on the view
    // (a bend note's key is its bend's stable key, rfJ: 'bend:<feature>:<edge>')
    var k0 = fv.flat.bends[0].key, b0 = fv.flat.annotations.filter(function (a) { return a.key === k0; })[0].box, mid = boxMid(b0);
    sheetDrag(mid, [mid[0] - 0.4, mid[1]]); await wait(60);
    var own = anvil.drawing.doc().views.filter(function (v) { return v.kind === 'flat'; })[0].flatAnn;
    assert(own && own[k0] && Math.abs(own[k0].off[0] + 0.4) < 0.03, 'note dragged ' + JSON.stringify(own));
    var dxf = anvil.drawing.dxf();
    ['BEND_UP', 'BEND_DOWN', 'BEND_NOTES', 'FLAT_PATTERN'].forEach(function (l) { assert(dxf.indexOf('\n2\n' + l + '\n') >= 0, 'DXF layer ' + l); });
    assert(dxf.indexOf(NUP.replace('°', '%%d')) >= 0, 'DXF bend note');
    return fv.name + ': ' + fv.flat.bends.map(function (b) { return b.note; }).join(' / ') + ', ' + fv.flat.size.join(' × ') + ', ' + hc[0].text;
  });
  step('p9-drawing: Annotation ▸ Note: a click opens a text box, two lines typed and ✓ place the note; double-click edits it, a drag moves it, Delete removes it and Undo brings it back; SVG / DXF / PDF carry it', async function () {
    Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (b) { return b.textContent === 'Annotation'; })[0].click();
    ribbonButton('Note').click();
    assert(UI.drawing.state.tool === 'note', 'Note tool');
    sheetMouse('mousedown', [1.4, 9.8]);
    var ta = D.querySelector('#dw-edit.note textarea');
    assert(ta, 'note text box');
    ta.value = 'DEBURR ALL EDGES\nBREAK SHARP CORNERS .010 MAX';
    D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await wait(30);
    key('Escape');
    var ns = anvil.drawing.notes();
    assert(ns.length === 1 && ns[0].text === 'DEBURR ALL EDGES\nBREAK SHARP CORNERS .010 MAX' && UI.drawing.state.tool === null, 'note ' + JSON.stringify(ns));
    near(ns[0].p[0], 1.4, 0.03, 'note x');
    var tx = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="NOTES"] text'), function (t) { return t.textContent; });
    assert(tx.indexOf('DEBURR ALL EDGES') >= 0 && tx.indexOf('BREAK SHARP CORNERS .010 MAX') >= 0, 'note drawn ' + tx);
    assert(D.querySelector('#drawing-tree .dw-note'), 'tree row');
    // double-click: edit in place
    sheetMouse('dblclick', boxMid(ns[0].box));
    ta = D.querySelector('#dw-edit.note textarea');
    assert(ta && ta.value === ns[0].text, 'edit box with the text');
    ta.value = 'DEBURR ALL EDGES';
    D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await wait(30);
    ns = anvil.drawing.notes();
    assert(ns.length === 1 && ns[0].text === 'DEBURR ALL EDGES', 'edited ' + JSON.stringify(ns));
    // drag it 1 in right
    var m0 = boxMid(ns[0].box);
    sheetDrag(m0, [m0[0] + 1, m0[1]]); await wait(60);
    near(anvil.drawing.notes()[0].p[0], 2.4, 0.03, 'dragged x');
    var dxf = anvil.drawing.dxf(), pdf = anvil.drawing.pdf(), svg = anvil.drawing.svg();
    assert(dxf.indexOf('\n2\nNOTES\n') >= 0 && dxf.indexOf('DEBURR ALL EDGES') >= 0 && pdf.indexOf('(DEBURR ALL EDGES)') >= 0 && svg.indexOf('>DEBURR ALL EDGES<') >= 0, 'exports carry the note');
    // select and Delete; Undo restores
    sheetMouse('mousedown', boxMid(anvil.drawing.notes()[0].box));
    W.dispatchEvent(new W.MouseEvent('mouseup', { bubbles: true }));
    assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'note', 'selected');
    key('Delete');
    assert(anvil.drawing.notes().length === 0, 'deleted');
    await UI.undo(); await idle(); await wait(60);
    assert(UI.drawingActive() && anvil.drawing.notes().length === 1, 'undo restores the note');
    return 'note ' + JSON.stringify(anvil.drawing.notes()[0].text);
  });
  // --- end p9-drawing ---
