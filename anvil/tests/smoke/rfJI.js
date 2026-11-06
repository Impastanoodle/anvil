  // ---- rfJI (2026-11-06, lane drawgaps-2): a note added to the Flag Note Bank from its Properties, Annotation ▸ Flag
  // Note (item 2 with a leader: feature then place; item 1 without), View ▸ Hide/Show ▸ All Annotations / Sketches
  var JI_PART = 'p.name("JIPlate").units("in");\np.sketch("Front").rect(0, 0, 4, 2).end().extrude(0.25);';
  function rfJIClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfJIMouse(type, p) {
    var c = rfJIClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, clientX: c.clientX, clientY: c.clientY }));
  }
  function rfJIClick(p) { rfJIMouse('mousemove', p); rfJIMouse('mousedown', p); rfJIMouse('mouseup', p); }
  // the drawing's menu bar: open menu `name`, return its rows (text) and click the one equal to `label` when given
  function rfJIMenu(name, label) {
    var lis = D.querySelectorAll('#menus > li'), m = null;
    for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
    assert(m, 'menu ' + name);
    m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), texts = rows.map(function (r) { return r.textContent.replace(/\s+/g, ' ').trim(); });
    var hit = label ? rows.filter(function (r, j) { return texts[j].indexOf(label) >= 0; })[0] : null;
    if (label) { assert(hit, label + ' in ' + name + ': ' + texts.join(' | ')); hit.click(); }
    if (UI.closeMenus) UI.closeMenus();
    return texts;
  }
  function rfJISheetNotes() { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="NOTES"] text'), function (t) { return t.textContent; }); }
  step('rfJI: Note Properties ▸ Add to Flag Note Bank numbers it; Annotation ▸ Flag Note places flag 2 with a leader and flag 1 without; the bank marks both; View ▸ Hide/Show ▸ All Annotations / Sketches hide and show them, Undo restores', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run(JI_PART); await idle();
    anvil.drawing.make({ fresh: true }); await UI.drawing.ready(); await wait(30);
    UI.drawing.fit(); await wait(20);
    var S = UI.drawing.state.sheet.size, np = [S[0] * 0.12, S[1] * 0.85];
    anvil.drawing.note({ p: np, text: 'DEBURR ALL EDGES\nBREAK SHARP CORNERS\nPAINT BLACK' }); await idle();
    var nb = anvil.drawing.notes()[0].box, bankId = anvil.drawing.notes()[0].id;
    rfJIMouse('contextmenu', [(nb[0] + nb[2]) / 2, (nb[1] + nb[3]) / 2]); await idle();
    var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Properties/.test(m.textContent); })[0];
    assert(mi, 'note menu Properties…');
    mi.click(); await idle();
    assert(UI.pmTitle() === 'Note' && pmField('Add to Flag Note Bank'), 'Note PM with Add to Flag Note Bank');
    pmField('Add to Flag Note Bank').click(); await idle();
    await UI.pmOK(); await idle();
    var nd = JSON.parse(JSON.stringify(anvil.drawing.doc())).notes[0];
    assert(nd.bank === true && nd.list === 'number', 'bank ' + JSON.stringify(nd));
    assert(rfJISheetNotes().join('|').indexOf('1.|DEBURR ALL EDGES|2.|BREAK SHARP CORNERS|3.|PAINT BLACK') >= 0, 'numbered: ' + rfJISheetNotes().join('|'));
    // Flag Note: item 2, leader from the Front view's top edge
    assert(rfJIMenu('Insert').some(function (t) { return t.indexOf('Annotations ▸ Flag Note…') >= 0; }), 'Insert ▸ Annotations ▸ Flag Note…');
    ribbonButton('Flag Note').click(); await idle();
    assert(UI.drawing.state.tool === 'flagnote' && UI.pmTitle() === 'Flag Note' && pmField('Item'), 'Flag Note PM: ' + UI.pmTitle());
    setInput(pmField('Item'), bankId + ':2'); await idle();
    var F = UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0], fb = F.box;
    var tip = [(fb.x0 + fb.x1) / 2, fb.y1], at = [fb.x1 + 0.6, fb.y1 + 0.6], u0 = UI.App.undo.length;
    rfJIClick(tip); await idle();
    assert(UI.drawing.state.pending.tip, 'the arrow point taken');
    rfJIClick(at); await idle(); await wait(20);
    var fl = anvil.drawing.notes().filter(function (n) { return n.flag; });
    assert(fl.length === 1 && fl[0].text === '2' && fl[0].flag.item === 2 && fl[0].leader, 'flag 2 with a leader: ' + JSON.stringify(fl));
    assert(UI.App.undo.length === u0 + 1, 'one undo step');
    // Leader off: one click places flag 1
    pmField('Leader').click(); setInput(pmField('Item'), bankId + ':1'); await idle();
    rfJIClick([at[0] + 1, at[1]]); await idle(); await wait(20);
    fl = anvil.drawing.notes().filter(function (n) { return n.flag; });
    assert(fl.length === 2 && fl[1].text === '1' && !fl[1].leader, 'flag 1: ' + JSON.stringify(fl[1]));
    await UI.pmOK(); await idle();
    assert(UI.drawing.state.tool !== 'flagnote', 'tool ends');
    // the bank shows items 1 and 2 inside flag triangles (their numbers without the dot), 3 as '3.'
    var bt = UI.drawing.state.sheet.prims.filter(function (p) { return p.note === bankId && p.k === 'text'; }).map(function (p) { return p.text; });
    assert(bt.indexOf('1') >= 0 && bt.indexOf('2') >= 0 && bt.indexOf('3.') >= 0, 'bank markers ' + JSON.stringify(bt));
    assert(anvil.drawing.svg().indexOf('BREAK SHARP CORNERS') >= 0 && anvil.drawing.dxf().indexOf('PAINT BLACK') >= 0, 'outputs');
    // View ▸ Hide/Show
    var vr = rfJIMenu('View');
    ['Hide/Show ▸ All Annotations', 'Hide/Show ▸ Sketches', 'Hide/Show ▸ Hide/Show Edges', 'Hide/Show Annotations'].forEach(function (l) { assert(vr.some(function (t) { return t.indexOf(l) >= 0; }), l + ' in View: ' + vr.join(' | ')); });
    var u1 = UI.App.undo.length;
    rfJIMenu('View', 'Hide/Show ▸ All Annotations'); await idle(); await UI.drawing.ready(); await wait(20);
    assert(!rfJISheetNotes().length && anvil.drawing.svg().indexOf('DEBURR') < 0, 'annotations hidden: ' + rfJISheetNotes().join('|'));
    assert(UI.App.undo.length === u1 + 1 && anvil.drawing.doc().display && anvil.drawing.doc().display.annotations === false, 'one undo step, saved');
    rfJIMenu('View', 'Hide/Show ▸ All Annotations'); await idle(); await UI.drawing.ready(); await wait(20);
    assert(rfJISheetNotes().join('|').indexOf('DEBURR ALL EDGES') >= 0 && !anvil.drawing.doc().display, 'shown again');
    rfJIMenu('View', 'Hide/Show ▸ Sketches'); await idle(); await UI.drawing.ready();
    assert(anvil.drawing.doc().display && anvil.drawing.doc().display.sketches === false, 'sketches hidden');
    await UI.undo(); await idle(); await UI.drawing.ready(); await wait(20);
    assert(!anvil.drawing.doc().display, 'undo shows them again');
    anvil.drawing.close();
    assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
  });
