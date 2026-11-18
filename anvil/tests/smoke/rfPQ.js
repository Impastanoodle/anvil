  // --- rfPQ (2026-11-18, lane drawfinish): today's drawing tools finished. The ribbon (Alternate Position View after
  // Crop View, the Blocks flyout on Annotation), Make Block with its insertion point clicked and texts tagged as
  // attributes, Insert Block with attribute values, Block Properties, the Alternate Position view's box, and BOM cells
  // typed in place (DESCRIPTION into the part, QTY. kept on the drawing), each one undo step ---
  (function () {
    async function rfPQDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    async function rfPQClose() { if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); } }
    function rfPQMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfPQClick(p, extra) { rfPQMouse('mousemove', p, { buttons: 0 }); rfPQMouse('mousedown', p, extra); rfPQMouse('mouseup', p, extra); }
    async function rfPQDbl(p) { rfPQClick(p); await wait(10); rfPQClick(p); rfPQMouse('dblclick', p, { buttons: 0 }); await wait(40); }
    function rfPQTab(name) {
      var t = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === name; })[0];
      assert(t, 'tab ' + name);
      t.click();
    }
    function rfPQLabels() { return Array.prototype.map.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') || ''; }); }
    function rfPQBtn(label) { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb'), function (b) { return b.getAttribute('aria-label') === label; })[0] || null; }
    // the Blocks flyout's menu row `label` clicked (its caret, then the row)
    function rfPQBlocks(label) {
      rfPQTab('Annotation');
      var c = Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons .rb-caret'), function (x) { return x.getAttribute('aria-label') === 'Blocks options'; })[0];
      assert(c, 'the Blocks flyout on Annotation');
      c.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true })); c.click();
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), r = rows.filter(function (x) { return x.textContent.replace(/\s+/g, ' ').trim().indexOf(label) === 0; })[0];
      assert(r, label + ' in the Blocks flyout: ' + rows.map(function (x) { return x.textContent.trim(); }).join(' | '));
      r.click(); if (UI.closeMenus) UI.closeMenus();
    }
    function rfPQEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    function rfPQFree(w, h) {
      var sh = UI.drawing.state.sheet, S = sh.size, obs = W.Drawing.tbRects(S, sh.units || 'in').concat(sh.views.map(function (x) { return x.box; })), best = null, bs = -Infinity;
      (sh.annotations || []).concat(sh.notes || []).concat(sh.dims || []).forEach(function (a) { if (a.box && isFinite(a.box.x0)) obs.push(a.box); });
      if (sh.bom) obs.push(sh.bom.box);
      function meet(a, b) { return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1; }
      for (var i = 1; i < 60; i++) for (var j = 1; j < 40; j++) {
        var c = [S[0] * i / 60, S[1] * j / 40], r = { x0: c[0] - w / 2, x1: c[0] + w / 2, y0: c[1] - h / 2, y1: c[1] + h / 2 };
        if (r.x0 < 0.8 || r.y0 < 0.8 || r.x1 > S[0] - 0.8 || r.y1 > S[1] - 0.8 || obs.some(function (o) { return meet(r, o); })) continue;
        var d = Math.min.apply(null, obs.map(function (o) { return Math.max(o.x0 - r.x1, r.x0 - o.x1, o.y0 - r.y1, r.y0 - o.y1); }));
        if (d > bs) { bs = d; best = c; }
      }
      return best;
    }

    step('rfPQ: the drawing CommandManager: View Layout has Alternate Position View right after Crop View; Annotation has the Blocks flyout (Make Block, Insert Block, Explode Block) after Datum Target; under Mastercam View Layout keeps it and the blocks are reachable', async function () {
      anvil.profile('solidworks');
      await rfPQClose();
      await anvil.newPart(); await idle(); await anvil.run('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);'); await idle();
      anvil.drawing.make({ fresh: true }); await rfPQDone();
      try {
        rfPQTab('View Layout'); await wait(20);
        var vl = rfPQLabels(), ic = vl.indexOf('Crop View');
        assert(ic >= 0 && vl[ic + 1] === 'Alternate Position View', 'View Layout: ' + vl.join(' | '));
        var ap = rfPQBtn('Alternate Position View');
        assert(ap.querySelector('svg') && ap.querySelector('svg').innerHTML.length > 40, 'its icon');
        rfPQTab('Annotation'); await wait(20);
        var an = rfPQLabels(), ib = an.indexOf('Blocks'), idt = an.indexOf('Datum Target');
        assert(ib > idt && idt >= 0, 'Annotation: Blocks after Datum Target: ' + an.join(' | '));
        var leaves = UI.ribbonLeaves(UI.RIBBON.Annotation).map(function (it) { return it.id; });
        assert(leaves.indexOf('makeBlock') >= 0 && leaves.indexOf('insertBlock') === leaves.indexOf('makeBlock') + 1 && leaves.indexOf('explodeBlock') === leaves.indexOf('makeBlock') + 2, 'flyout items: ' + leaves.join(','));
        // a part drawing: Alternate Position View says it is for an assembly
        rfPQTab('View Layout'); rfPQBtn('Alternate Position View').click(); await wait(20);
        assert(!UI.drawing.state.tool, 'no tool in a part drawing');
        anvil.profile('mastercam'); await wait(40);
        var set = UI.profileRibbon('drawing'), where = {};
        Object.keys(set).forEach(function (t) { UI.ribbonLeaves(set[t]).forEach(function (it) { where[UI.Commands.cmdOf(it)] = t; }); });
        assert(where.altPosition === 'View Layout' && where.makeBlock && where.insertBlock && where.explodeBlock, 'Mastercam: ' + JSON.stringify({ alt: where.altPosition, make: where.makeBlock }));
      } finally { anvil.profile('solidworks'); await wait(20); UI.markClean(); anvil.drawing.close(); await idle(); }
      return 'Crop View | Alternate Position View; Blocks after Datum Target';
    });

    step('rfPQ: Make Block from the flyout: a revision stamp (frame, REV caption, value A) selected by clicks; its insertion point clicked at the top-left corner (snapped), A tagged REV; Insert Block with REV B places a second; double-click it: Block Properties, REV C, one undo step; DXF values beside the INSERTs', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfPQClose();
      await anvil.newPart(); await idle(); await anvil.run('p.units("in"); p.sketch("Front").rect(0, 0, 4, 2).extrude(0.25);'); await idle();
      anvil.drawing.make({ fresh: true }); await rfPQDone();
      UI.drawing.fit(); await wait(20);
      try {
        var c = rfPQFree(5, 3);
        assert(c, 'free paper');
        var a = [c[0] - 1, c[1] - 0.4], b = [c[0] + 1, c[1] + 0.4];
        var S = anvil.drawing.sketch;
        var lines = S.rect(a, b, null);
        var cap = S.add({ t: 'text', p: [a[0] + 0.1, c[1] + 0.1], text: 'REV', h: 0.12 }), val = S.add({ t: 'text', p: [a[0] + 0.1, c[1] - 0.25], text: 'A', h: 0.12 });
        await rfPQDone();
        // select: a click on the bottom side, Ctrl-clicks on the other sides and the two texts
        rfPQClick([c[0], a[1]]); await wait(10);
        [[b[0], c[1] + 0.2], [c[0], b[1]], [a[0], c[1] - 0.2], [cap.p[0] + 0.05, cap.p[1] + 0.04], [val.p[0] + 0.03, val.p[1] + 0.04]].forEach(function (p) { rfPQClick(p, { ctrlKey: true }); });
        await wait(20);
        assert(st.sel && st.sel.kind === 'sk' && st.sel.ids.length === 6, 'six selected: ' + JSON.stringify(st.sel) + ' of ' + lines.concat([cap.id, val.id]).join(','));
        rfPQBlocks('Make Block'); await wait(30);
        assert(UI.pmTitle() === 'Make Block' && st.tool === 'sk:blkbase', 'Make Block PM, picking the insertion point: ' + st.tool);
        setInput(D.querySelector('#pm input[data-key="name"]'), 'REVSTAMP');
        var tag = D.querySelector('#pm input[data-key="tag' + val.id + '"]');
        assert(tag && D.querySelector('#pm input[data-key="tag' + cap.id + '"]'), 'a tag box per text');
        setInput(tag, 'rev');
        rfPQClick([a[0] + 0.01, b[1] - 0.01]); await wait(30);   // near the top-left corner: it snaps
        assert(D.querySelector('#drawing-sheet .dw-blk-base'), 'the insertion point marked');
        assert(/\(/.test(D.querySelector('#pm').textContent) && D.querySelector('#pm').textContent.indexOf('lower-left corner (click') < 0, 'the PM shows the point');
        await UI.pmOK(); await rfPQDone();
        var list = S.list(null), ins = list.filter(function (e) { return e.t === 'block'; })[0];
        assert(list.length === 1 && ins && ins.name === 'REVSTAMP', 'one instance: ' + list.map(function (e) { return e.t; }).join(','));
        assert(Math.abs(ins.p[0] - a[0]) < 1e-9 && Math.abs(ins.p[1] - b[1]) < 1e-9, 'insertion point snapped to the top-left corner: ' + JSON.stringify(ins.p) + ' vs ' + JSON.stringify([a[0], b[1]]));
        var at = S.blockAttributes('REVSTAMP');
        assert(at.length === 1 && at[0].tag === 'REV' && at[0].value === 'A', 'attribute REV = A: ' + JSON.stringify(at));
        // Insert Block with REV B
        var c2 = rfPQFree(3, 1.5);
        rfPQBlocks('Insert Block'); await wait(30);
        var av = D.querySelector('#pm input[data-key="a:REVSTAMP:REV"]');
        assert(av && av.value === 'A', 'the REV box with its default: ' + (av && av.value));
        setInput(av, 'B');
        await UI.pmOK(); await wait(40);
        assert(st.tool === 'sk:block', 'placing: ' + st.tool);
        rfPQClick(c2); await rfPQDone();
        rfPQEnd();
        var b2 = S.list(null).filter(function (e) { return e.t === 'block' && e.id !== ins.id; })[0];
        assert(b2 && b2.attrs && b2.attrs.REV === 'B', 'second with REV B: ' + JSON.stringify(b2));
        assert(st.sheet.prims.some(function (p) { return p.blockIns === b2.id && p.text === 'B'; }) && st.sheet.prims.some(function (p) { return p.blockIns === ins.id && p.text === 'A'; }), 'drawn with their own values');
        // double-click it (on its frame's left side): Block Properties with REV
        await rfPQDbl([b2.p[0], b2.p[1] - 0.4]);
        assert(UI.pmTitle() === 'Block Properties', 'Block Properties: ' + (UI.hasPM() && UI.pmTitle()));
        var pv = D.querySelector('#pm input[data-key="a:REV"]');
        assert(pv && pv.value === 'B', 'REV B in it: ' + (pv && pv.value));
        setInput(pv, 'C');
        await UI.pmOK(); await rfPQDone();
        assert(S.get(b2.id).attrs.REV === 'C' && st.sheet.prims.some(function (p) { return p.blockIns === b2.id && p.text === 'C'; }), 'REV C');
        var dxf = W.Drawing.toDXF(st.sheet, { version: 'R2000' });
        assert((dxf.match(/\nINSERT\r?\n/g) || []).length === 2 && /\n1\r?\nC\r?\n/.test(dxf) && /\n1\r?\nA\r?\n/.test(dxf), 'DXF: two INSERTs, the values A and C as TEXT');
        await UI.undo(); await rfPQDone(); await rfPQDone();
        assert(S.get(b2.id).attrs.REV === 'B', 'undo: REV B again');
      } finally { rfPQEnd(); UI.ribbonFlyFace('dwBlocks', 0); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'REVSTAMP at the top-left corner; A / B -> C';
    });

    step('rfPQ: Alternate Position View from the ribbon: click the Front view, Distance1 40, ✓: the view\'s box grows to hold the phantom block', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfPQClose();
      await anvil.newAssembly('PQAlt');
      await anvil.insert({ script: 'p.name("Base"); p.box(100, 60, 10);' });
      await anvil.insert({ script: 'p.name("Block"); p.box(20, 20, 20);' }, { position: [5, 40, 5] });
      await idle();
      await anvil.mate('distance', { component: 2, face: [10, 0, 10] }, { component: 1, face: [50, 10, 30] }, { distance: 15 });
      await anvil.mate('coincident', { component: 2, face: [0, 10, 10] }, { component: 1, face: [0, 5, 30] }, { alignment: 'aligned' });
      await anvil.mate('coincident', { component: 2, face: [10, 10, 0] }, { component: 1, face: [50, 5, 0] }, { alignment: 'aligned' });
      await idle();
      var dm = UI.App.model.mates.filter(function (m) { return m.type === 'distance'; })[0];
      anvil.drawing.make({ fresh: true }); await rfPQDone();
      UI.drawing.fit(); await wait(20);
      try {
        var fw = st.sheet.views.filter(function (w) { return w.view.orient === 'Front' && !w.view.kind; })[0];
        assert(fw, 'a Front view');
        var id = fw.view.id, y1 = fw.box.y1, inside = [(fw.box.x0 + fw.box.x1) / 2, fw.box.y0 + (fw.box.y1 - fw.box.y0) * 0.2];
        st.sel = null;
        rfPQTab('View Layout'); rfPQBtn('Alternate Position View').click(); await wait(20);
        assert(st.tool === 'altpos' && rfPQBtn('Alternate Position View').classList.contains('active'), 'picking a view: ' + st.tool);
        rfPQClick(inside); await wait(40);
        assert(UI.pmTitle() === 'Alternate Position', 'the PM: ' + (UI.hasPM() && UI.pmTitle()));
        setInput(D.querySelector('#pm input[data-key="m' + dm.id + '"]'), '40');
        await UI.pmOK(); await rfPQDone();
        var w = st.sheet.views.filter(function (x) { return x.view.id === id; })[0], ph = st.sheet.prims.filter(function (p) { return p.altPos === 1 && p.k === 'line'; });
        assert(ph.length >= 4, 'phantom lines: ' + ph.length);
        var top = Math.max.apply(null, ph.map(function (p) { return Math.max(p.a[1], p.b[1]); }));
        assert(top > y1 + 1e-6 && Math.abs(w.box.y1 - top) < 1e-9, 'the box reaches the phantom top: ' + w.box.y1 + ' / ' + top + ' (was ' + y1 + ')');
        await UI.undo(); await rfPQDone(); await rfPQDone();
        var w2 = st.sheet.views.filter(function (x) { return x.view.id === id; })[0];
        assert(Math.abs(w2.box.y1 - y1) < 1e-9, 'undo: the box back');
      } finally { rfPQEnd(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'box top ' + y1.toFixed(3) + ' -> phantom top';
    });

    step('rfPQ: BOM cells typed in place: double-click a DESCRIPTION cell, type, Enter: the assembly keeps it where its own BOM writes it (Assembly.bomOverride) and the table shows it; Tab to QTY., 5, Enter: kept on the drawing; each one undo step', async function () {
      var st = UI.drawing.state, errs0 = errors.length;
      await rfPQClose();
      await anvil.newAssembly('PQBom');
      await anvil.insert({ script: 'p.name("Bracket"); p.box(40, 20, 3); p.property("Description", "BRACKET, 14 GA");' });
      await anvil.insert({ script: 'p.name("Spacer"); p.box(10, 10, 10);' }, { position: [60, 0, 0] });
      await idle();
      anvil.drawing.make({ fresh: true }); await rfPQDone();
      UI.drawing.fit(); await wait(20);
      try {
        var bom = st.sheet.bom;
        assert(bom && bom.rows.length === 2, 'a BOM with two rows');
        var cols = bom.columns.map(function (x) { return x.title; }), dc = cols.indexOf('DESCRIPTION'), qc = cols.indexOf('QTY.'), bb = bom.box;
        assert(dc >= 0 && qc === dc + 1, 'columns: ' + cols.join(','));
        var mid = function (cc, r) { return [(bb.cols[cc] + bb.cols[cc + 1]) / 2, bb.y1 - (r + 0.5) * bb.rowH]; };
        await rfPQDbl(mid(dc, 1));
        var inp = D.querySelector('#dw-edit input');
        assert(inp && inp.value === 'BRACKET, 14 GA' && !UI.hasPM(), 'the cell is typed in place (no PM): ' + (inp && inp.value));
        var key = st.sheet.bom.rows[0].key, n0 = UI.App.undo.length;
        setInput(inp, 'BRACKET, 14 GA CRS');
        inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        await rfPQDone();
        assert(UI.App.undo.length === n0 + 1, 'one undo step');
        assert(W.Assembly.bomOverride(UI.App.model, key) === 'BRACKET, 14 GA CRS', 'kept in the assembly: ' + JSON.stringify(UI.App.model.bomDescriptions));
        assert(st.sheet.bom.cells[0][dc] === 'BRACKET, 14 GA CRS' && W.Assembly.bom(UI.App.model, null, { type: 'top' })[0].description === 'BRACKET, 14 GA CRS', 'the drawing BOM and the assembly BOM show it');
        // QTY. of row 2: double-click, type 5, Tab moves on (applies), Esc
        await rfPQDbl(mid(qc, 2));
        inp = D.querySelector('#dw-edit input');
        assert(inp && inp.value === '1', 'QTY. 1: ' + (inp && inp.value));
        setInput(inp, '5');
        inp.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
        await rfPQDone();
        var nx = D.querySelector('#dw-edit input');
        var last = qc === cols.length - 1;   // (the last cell of the table: Tab applies and ends)
        assert(last ? !nx : !!(nx && st.inline && st.inline.bomCell && st.inline.bomCell.c === qc + 1), 'Tab: ' + (nx ? 'cell ' + JSON.stringify(st.inline && st.inline.bomCell) : 'closed'));
        if (nx) nx.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        await rfPQDone();
        assert(String(st.sheet.bom.cells[1][qc]) === '5' && anvil.drawing.doc().bom.overrides, 'QTY. 5 kept on the drawing: ' + JSON.stringify(anvil.drawing.doc().bom.overrides));
        await UI.undo(); await rfPQDone(); await rfPQDone();
        assert(String(st.sheet.bom.cells[1][qc]) === '1', 'undo: QTY. 1');
        await UI.undo(); await rfPQDone(); await rfPQDone();
        assert(st.sheet.bom.cells[0][dc] === 'BRACKET, 14 GA' && !UI.App.model.bomDescriptions, 'undo: the description back');
        // the header row still opens the Bill of Materials PropertyManager
        await rfPQDbl(mid(dc, 0));
        assert(UI.hasPM() && /Bill of Materials/.test(UI.pmTitle()), 'header: the BOM PM: ' + (UI.hasPM() && UI.pmTitle()));
      } finally { rfPQEnd(); }
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      UI.markClean(); anvil.drawing.close(); await idle();
      return 'DESCRIPTION into the assembly, QTY. on the drawing, undone';
    });
  })();
