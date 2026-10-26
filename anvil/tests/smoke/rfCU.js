  // --- rfCU (2026-10-20, lane CU: drawing annotations) --- Cosmetic Thread and Dowel Pin Symbol on a hole circle,
  // Datum Target, Multi-jog Leader (with a dragged bend point) and the Note PropertyManager (border, numbered list), all
  // from the Annotation tab with real mouse / key events on the sheet.
  var CU_PART = 'p.name("CUPlate").units("in");\np.box(4, 2, 0.25);\np.hole("Top", 1, -1, 0.159, { offset: 0.25 });\np.hole("Top", 3, -1, 0.25, { offset: 0.25 });';
  async function rfCUDrawing() {
    await anvil.newPart(); await idle();
    await anvil.run(CU_PART); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready();
    UI.drawing.fit(); await wait(20);
    return anvil.drawing.summary();
  }
  function rfCUClient(p) {
    var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
    pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
    var q = pt.matrixTransform(m);
    return { clientX: q.x, clientY: q.y };
  }
  function rfCUMouse(type, p, opts) {
    var c = rfCUClient(p);
    D.querySelector('#drawing-sheet svg').dispatchEvent(new W.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, clientX: c.clientX, clientY: c.clientY, detail: type === 'dblclick' ? 2 : 1 }, opts || {})));
  }
  function rfCUClick(p) { rfCUMouse('mousemove', p); rfCUMouse('mousedown', p); rfCUMouse('mouseup', p); }
  function rfCUKey(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
  function rfCUButton(label) {
    var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
    var b = find();
    if (!b) { var tab = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === 'Annotation'; })[0]; if (tab) { tab.click(); b = find(); } }
    assert(b, 'ribbon button ' + label);
    return b;
  }
  // the top view and a hole circle of diameter dia in it: { w, c (paper centre), edge (a paper point on the circle) }
  function rfCUHole(dia) {
    var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.role === 'top'; })[0];
    assert(w, 'top view');
    var c = w.proj.circles.visible.filter(function (q) { return Math.abs(2 * q.r - dia) < 1e-6; })[0];
    assert(c, 'hole Ø' + dia);
    var pc = w.toSheet(c.c);
    return { w: w, c: pc, edge: [pc[0], pc[1] + c.r * w.scale] };
  }
  function rfCUAnn(type) { return (anvil.drawing.annotations() || []).filter(function (a) { return a.type === type; }); }
  function rfCUTol() { return UI.drawingInternal.pxToPaper(2.5); }   // (mouse events land on whole pixels)
  function rfCUUndoDepth() { return (UI.App.undo || []).length; }
  async function rfCUClose() {
    if (UI.hasPM && UI.hasPM()) UI.pmCancel();
    anvil.drawing.close(); await wait(20);
    if (modalOpen() && /Save changes to/.test($('modal-body').textContent)) clickModalButton("Don't Save");
    await idle();
  }

  step('rfCU: Annotation ▸ Cosmetic Thread — click the #21 hole: a 3/4 thread circle and "#10-32 UNF - 2B THRU" (one undo step); one Esc ends; double-click ▸ Blind .375; drag the callout; Dowel Pin Symbol on the Ø.250 hole, Delete removes it', async function () {
    var errs0 = errors.length;
    await rfCUDrawing();
    try {
      var h = rfCUHole(0.159), u0 = rfCUUndoDepth();
      rfCUButton('Cosmetic Thread').click(); await idle();
      assert(UI.drawing.state.tool === 'cuthread' && UI.pmTitle() === 'Cosmetic Thread', 'Cosmetic Thread PM: ' + UI.pmTitle());
      assert(pmField('Size') && pmField('End Condition') && pmField('Insert callout'), 'PM fields');
      rfCUClick(h.edge); await idle();
      var ct = rfCUAnn('cosmeticThread');
      assert(ct.length === 1 && ct[0].info.callout === '#10-32 UNF - 2B THRU', 'thread ' + JSON.stringify(ct));
      assert(rfCUUndoDepth() === u0 + 1, 'one undo step: ' + (rfCUUndoDepth() - u0));
      var arc = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'arc' && p.thread === '#10-32 UNF'; })[0];
      assert(arc && Math.abs(arc.r - 0.095 * h.w.scale) < 1e-9, '3/4 circle at the major diameter');
      var tx = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="ANNOTATIONS"] text'), function (t) { return t.textContent; });
      assert(tx.indexOf('#10-32 UNF - 2B THRU') >= 0, 'callout on the sheet: ' + tx.join(' | '));
      rfCUKey('Escape'); await idle();
      assert(UI.drawing.state.tool === null && !UI.hasPM(), 'one Esc ends the tool: ' + UI.drawing.state.tool);
      // double-click the callout text: its PM; Blind .375
      var tp = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && p.text === '#10-32 UNF - 2B THRU'; })[0], tb = W.Drawing.textRect(tp), at = [(tb.x0 + tb.x1) / 2, (tb.y0 + tb.y1) / 2];
      rfCUMouse('dblclick', at); await idle();
      assert(UI.pmTitle() === 'Cosmetic Thread' && UI.drawing.state.tool === null, 'double-click opens its PM: ' + UI.pmTitle());
      setInput(pmField('End Condition'), 'blind'); await idle();
      setInput(pmField('Depth'), '0.375'); await idle();
      await UI.pmOK(); await idle();
      ct = rfCUAnn('cosmeticThread');
      assert(ct[0].info.callout === '#10-32 UNF - 2B ↧ .375', 'blind ' + ct[0].info.callout);
      // drag the callout by its text
      tp = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'text' && /^#10-32 UNF - 2B/.test(p.text); })[0]; tb = W.Drawing.textRect(tp); at = [(tb.x0 + tb.x1) / 2, (tb.y0 + tb.y1) / 2];
      rfCUMouse('mousedown', at); rfCUMouse('mousemove', [at[0] + 0.3, at[1] + 0.4]); rfCUMouse('mousemove', [at[0] + 0.6, at[1] + 0.8]); rfCUMouse('mouseup', [at[0] + 0.6, at[1] + 0.8]); await idle();
      var lead = JSON.parse(JSON.stringify(anvil.drawing.doc())).views.reduce(function (acc, v) { return acc.concat(v.annotations || []); }, []).filter(function (a) { return a.type === 'cosmeticThread'; })[0].lead;
      assert(lead && lead[1] > 0.6, 'callout dragged: ' + JSON.stringify(lead));
      // Dowel Pin Symbol
      var hd = rfCUHole(0.25);
      rfCUButton('Dowel Pin Symbol').click(); await idle();
      assert(UI.drawing.state.tool === 'cudowel' && UI.pmTitle() === 'Dowel Pin Symbol', 'Dowel Pin PM');
      rfCUClick(hd.edge); await idle();
      var dp = rfCUAnn('dowelPin');
      assert(dp.length === 1 && /Ø\.250/.test(dp[0].text), 'dowel pin ' + JSON.stringify(dp));
      assert(UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'fill' && p.layer === 'ANNOTATIONS'; }).length >= 2, 'quadrants filled');
      rfCUKey('Escape'); await idle();
      assert(UI.drawing.state.tool === null, 'Esc ends');
      rfCUClick([hd.c[0] + 0.02, hd.c[1] + 0.02]); await idle();
      assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'annot', 'selected ' + JSON.stringify(UI.drawing.state.sel));
      rfCUKey('Delete'); await idle();
      assert(rfCUAnn('dowelPin').length === 0 && rfCUAnn('cosmeticThread').length === 1, 'Delete removed the dowel pin only');
      // Insert menu rows
      var lis = D.querySelectorAll('#menus > li'), ins = null;
      for (var i = 0; i < lis.length; i++) if (/^Insert/.test(lis[i].textContent)) ins = lis[i];
      ins.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.map.call(D.querySelectorAll('.menu .mi'), function (m) { return m.textContent.replace(/\s+/g, ' ').trim(); });
      if (UI.closeMenus) UI.closeMenus();
      ['Annotations ▸ Cosmetic Thread…', 'Annotations ▸ Dowel Pin Symbol', 'Annotations ▸ Datum Target…', 'Annotations ▸ Multi-jog Leader'].forEach(function (l) { assert(rows.filter(function (r) { return r.indexOf(l) >= 0; }).length === 1, l + ' once in Insert'); });
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return ct[0].info.callout;
    } finally { await rfCUClose(); }
  });

  step('rfCU: Datum Target (target point, then the symbol: A1, A2), Note ▸ Properties (Flag Triangle border, numbered list), Multi-jog Leader from the note (two bends, double-click ends), drag a bend point, Undo puts it back', async function () {
    var errs0 = errors.length;
    await rfCUDrawing();
    try {
      var h = rfCUHole(0.25), bx = h.w.box;
      rfCUButton('Datum Target').click(); await idle();
      assert(UI.drawing.state.tool === 'cutarget' && UI.pmTitle() === 'Datum Target', 'Datum Target PM');
      rfCUClick([bx.x0 + 0.1, bx.y0 + 0.1]); rfCUClick([bx.x0 - 0.6, bx.y0 - 0.6]); await idle();
      rfCUClick([bx.x1 - 0.1, bx.y0 + 0.1]); rfCUClick([bx.x1 + 0.6, bx.y0 - 0.6]); await idle();
      var dt = anvil.drawing.symbols().filter(function (s) { return s.type === 'datumTarget'; });
      assert(dt.length === 2 && dt[0].text === 'DATUM TARGET A1' && dt[1].text === 'DATUM TARGET A2', 'targets ' + dt.map(function (s) { return s.text; }).join(' | '));
      rfCUKey('Escape'); await idle();
      assert(UI.drawing.state.tool === null && !UI.hasPM(), 'Esc ends');
      // a note, its Properties (right-click)
      var S = UI.drawing.state.sheet.size, np = [S[0] * 0.15, S[1] * 0.85];
      anvil.drawing.note({ p: np, text: 'DEBURR\nBREAK EDGES .010' }); await idle();
      var nb = anvil.drawing.notes()[0].box, nm = [(nb[0] + nb[2]) / 2, (nb[1] + nb[3]) / 2];
      rfCUMouse('contextmenu', nm); await idle();
      var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Properties/.test(m.textContent); })[0];
      assert(mi, 'note menu Properties…');
      mi.click(); await idle();
      assert(UI.pmTitle() === 'Note', 'Note PM: ' + UI.pmTitle());
      setInput(pmField('Style'), 'flag'); setInput(pmField('List'), 'number'); await idle();
      await UI.pmOK(); await idle();
      var nts = Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="NOTES"] text'), function (t) { return t.textContent; });
      assert(nts.join('|').indexOf('1.|DEBURR|2.|BREAK EDGES .010') >= 0, 'numbered: ' + nts.join('|'));
      var nid = anvil.drawing.notes()[0].id, nd = JSON.parse(JSON.stringify(anvil.drawing.doc())).notes[0];
      assert(nd.border === 'flag' && nd.list === 'number', 'saved ' + JSON.stringify(nd));
      assert(UI.drawing.state.sheet.prims.filter(function (p) { return p.note === nid && p.k === 'line'; }).length === 3, 'flag triangle');
      // Multi-jog Leader from the note
      nb = anvil.drawing.notes()[0].box;
      var a0 = [nb[0] + 0.05, (nb[1] + nb[3]) / 2], j1 = [nb[0] - 0.5, nb[1] - 0.4], j2 = [nb[0] - 0.5, nb[1] - 1.0], tip = [nb[0] - 1.1, nb[1] - 1.3];
      rfCUButton('Multi-jog Leader').click(); await idle();
      assert(UI.drawing.state.tool === 'culeader' && UI.pmTitle() === 'Multi-jog Leader', 'leader PM');
      var u0 = rfCUUndoDepth();
      // lane DF: SolidWorks' order, the arrow tip first and the note end last (double-click)
      var ld0 = function () { return (JSON.parse(JSON.stringify(anvil.drawing.doc())).symbols || []).filter(function (s) { return s.type === 'leader'; })[0] || {}; };
      rfCUClick(tip); rfCUClick(j2); rfCUClick(j1); rfCUClick(a0); rfCUMouse('mousedown', a0); rfCUMouse('mouseup', a0); rfCUMouse('dblclick', a0); await idle();
      assert(Math.hypot(ld0().leader[0] - tip[0], ld0().leader[1] - tip[1]) < rfCUTol() && Math.hypot(ld0().p[0] - a0[0], ld0().p[1] - a0[1]) < rfCUTol(), 'arrow at the first click, end on the note: ' + JSON.stringify(ld0()));
      var ld = anvil.drawing.symbols().filter(function (s) { return s.type === 'leader'; });
      assert(ld.length === 1 && /LEADER \(3 segments, NOTE/.test(ld[0].text), 'leader ' + JSON.stringify(ld));
      assert(rfCUUndoDepth() === u0 + 1, 'one undo step');
      rfCUKey('Escape'); await idle();
      assert(UI.drawing.state.tool === null && !UI.hasPM(), 'Esc ends the leader tool');
      // drag the second bend point
      rfCUMouse('mousedown', j2); rfCUMouse('mousemove', [j2[0] - 0.2, j2[1]]); rfCUMouse('mousemove', [j2[0] - 0.4, j2[1]]); rfCUMouse('mouseup', [j2[0] - 0.4, j2[1]]); await idle();
      var L = W.Drawing.findSymbol(UI.drawing.state && JSON.parse(JSON.stringify(anvil.drawing.doc())), ld[0].id);
      assert(Math.abs(L.jogs[1][0] - (j2[0] - 0.4)) < rfCUTol() && Math.abs(L.jogs[0][0] - j1[0]) < rfCUTol(), 'bend point dragged ' + JSON.stringify(L.jogs) + ' from ' + JSON.stringify([j1, j2]));
      await UI.undo(); await idle();
      L = W.Drawing.findSymbol(JSON.parse(JSON.stringify(anvil.drawing.doc())), ld[0].id);
      assert(L && Math.abs(L.jogs[1][0] - j2[0]) < rfCUTol(), 'undo puts it back ' + JSON.stringify(L && L.jogs));
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return dt.map(function (s) { return s.text; }).join(', ') + ' · ' + ld[0].text;
    } finally { await rfCUClose(); }
  });

  // rfCU2: the multi-jog leader's rubber band while its points are clicked
  step('rfCU2: Multi-jog Leader preview — after two clicks the placed segment, a live one to the pointer and the arrow show; ✓ makes the leader and the preview goes; one Esc mid-placement drops it', async function () {
    var errs0 = errors.length;
    await rfCUDrawing();
    try {
      var S = UI.drawing.state.sheet.size, a = [S[0] * 0.2, S[1] * 0.75], b = [a[0] + 0.6, a[1] - 0.3], c = [a[0] + 1.0, a[1] - 0.9];
      var prev = function () { return D.querySelector('#dw-overlay .dw-cu-leader'); };
      rfCUButton('Multi-jog Leader').click(); await idle();
      rfCUClick(a); rfCUClick(b); rfCUMouse('mousemove', c); await idle();
      var g = prev();
      assert(g, 'preview while placing');
      var pl = g.querySelector('polyline'), n = pl ? pl.getAttribute('points').trim().split(/\s+/).length : 0;
      assert(n === 3 && g.querySelector('.dw-cu-end'), 'two placed points, the live one and the arrow: ' + n);
      rfCUMouse('mousemove', [c[0] + 0.3, c[1]]); await idle();
      var last = prev().querySelector('polyline').getAttribute('points').trim().split(/\s+/).pop().split(',').map(Number);
      assert(Math.abs(last[0] - (c[0] + 0.3)) < rfCUTol(), 'follows the pointer ' + last);
      await UI.pmOK(); await idle();
      assert(!prev() && anvil.drawing.symbols().filter(function (s) { return s.type === 'leader'; }).length === 1, 'made by ✓, preview gone');
      rfCUButton('Multi-jog Leader').click(); await idle();
      rfCUClick(c); rfCUMouse('mousemove', a); await idle();
      assert(prev(), 'preview from the first click');
      rfCUKey('Escape'); await idle();
      assert(!prev() && UI.drawing.state.tool === null && !UI.hasPM() && anvil.drawing.symbols().filter(function (s) { return s.type === 'leader'; }).length === 1, 'Esc drops it, no new leader');
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return 'preview ' + n + ' points';
    } finally { await rfCUClose(); }
  });

  // shop-use pass (head, 2026-10-20): a pin's end picked with Cosmetic Thread is an external thread (2A); a datum target
  // symbol clicked on its own target point is refused; a selected leader shows its bend handles; undo / redo; a thread
  // with its callout off can still be clicked and deleted; DXF / PDF from the app carry the new annotations
  step('rfCU: shop pass — Cosmetic Thread on a pin end reads 2A; a datum target dropped on its own point is refused; leader bend handles; Undo / Redo; a callout-less thread is clickable and deletable; DXF / PDF out', async function () {
    var errs0 = errors.length;
    await anvil.newPart(); await idle();
    await anvil.run('p.name("CUPin").units("in");\np.cylinder(0.25, 1);'); await idle();
    anvil.drawing.make({ fresh: true }); await idle(); await wait(60);
    await UI.drawing.ready(); UI.drawing.fit(); await wait(20);
    try {
      var w = UI.drawing.state.sheet.views.filter(function (x) { return x.view.role === 'top'; })[0];
      var cs = w.proj.circles.visible.slice().sort(function (a, b) { return b.r - a.r; }), c0 = cs[0];
      assert(c0, 'the pin\'s end circle');
      var pc = w.toSheet(c0.c), edge = [pc[0] + c0.r * w.scale, pc[1]];
      rfCUButton('Cosmetic Thread').click(); await idle();
      rfCUClick(edge); await idle();
      var ct = rfCUAnn('cosmeticThread');
      assert(ct.length === 1 && / - 2A THRU$/.test(ct[0].info.callout) && ct[0].info.external, 'external thread: ' + JSON.stringify(ct.map(function (a) { return a.info; })));
      rfCUKey('Escape'); await idle();
      // datum target: the symbol click on the target point itself is refused, then placed away from it
      var bx = w.box;
      rfCUButton('Datum Target').click(); await idle();
      rfCUClick([bx.x1, bx.y1]); rfCUClick([bx.x1, bx.y1]); await idle();
      assert(anvil.drawing.symbols().filter(function (s) { return s.type === 'datumTarget'; }).length === 0, 'refused on its own point');
      rfCUClick([bx.x1 + 0.8, bx.y1 + 0.6]); await idle();
      assert(anvil.drawing.symbols().filter(function (s) { return s.type === 'datumTarget'; }).length === 1, 'placed away from it');
      rfCUKey('Escape'); await idle();
      // a leader: select it, its bend handles show; undo / redo
      var S = UI.drawing.state.sheet.size, p0 = [S[0] * 0.2, S[1] * 0.8];
      anvil.drawing.leader({ p: p0, jogs: [[p0[0] + 0.5, p0[1] - 0.3], [p0[0] + 0.5, p0[1] - 0.8]], leader: [p0[0] + 1, p0[1] - 1] }); await idle();
      var ld = anvil.drawing.symbols().filter(function (s) { return s.type === 'leader'; })[0];
      rfCUClick([p0[0] + 0.5, p0[1] - 0.55]); await idle();
      assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'symbol' && UI.drawing.state.sel.id === ld.id, 'leader picked on its segment');
      var ov = D.querySelector('#dw-overlay');
      assert(ov.querySelectorAll('polyline').length === 1 && ov.querySelectorAll('rect.dw-dbox').length === 2, 'polyline and two bend handles');
      await UI.undo(); await idle();
      assert(!anvil.drawing.symbols().some(function (s) { return s.type === 'leader'; }), 'undo removes the leader');
      await UI.redo(); await idle();
      assert(anvil.drawing.symbols().some(function (s) { return s.type === 'leader'; }), 'redo brings it back');
      // a thread without its callout: click its arc, Delete
      anvil.drawing.editAnnotation(ct[0].id, { callout: false }); await idle();
      var arc = UI.drawing.state.sheet.prims.filter(function (p) { return p.k === 'arc' && p.thread; })[0], ap = [arc.c[0] + arc.r * Math.cos(200 * Math.PI / 180), arc.c[1] + arc.r * Math.sin(200 * Math.PI / 180)];
      var dxf = anvil.drawing.dxf(), pdf = anvil.drawing.pdf();
      assert(dxf.indexOf('A1') > 0 && /\nARC\r?\n/.test(dxf) && pdf.indexOf('(A1)') > 0, 'DXF / PDF carry the datum target and the thread arc');
      rfCUClick(ap); await idle();
      assert(UI.drawing.state.sel && UI.drawing.state.sel.kind === 'annot' && UI.drawing.state.sel.id === ct[0].id, 'thread picked by its arc: ' + JSON.stringify(UI.drawing.state.sel));
      rfCUKey('Delete'); await idle();
      assert(rfCUAnn('cosmeticThread').length === 0, 'deleted');
      assert(errors.length === errs0, 'no errors: ' + errors.slice(errs0).join(' | '));
      return ct[0].info.callout;
    } finally { await rfCUClose(); }
  });
