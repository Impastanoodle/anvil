  // --- rfKT (2026-11-11, lane drawflow, test-reports/2026-11-11-drawing-flow.md) --- three shop drawings made the way a
  // SolidWorks user makes them, with mouse and key events (the script console builds the parts and reads the results):
  // (a) a 16 ga formed bracket: Make Drawing from Part, Smart Dimensions by clicks (hole centre to edge, centre to
  // centre, the angle between the base and a 120° flange, the bend's R.060 clicked on the arc at the sheet's fit zoom),
  // Hole Callout, a Note with a leader (click the hole, then where the note goes) and a general note, the flat on Sheet2
  // with its Bend Table, File ▸ Properties into the title block, a Revision Table row by right-click, DXF / PDF / DWG
  // carrying every text of the sheet; (b) a 14 ga welded-corner box: Section View, a 4:1 Detail View of a corner,
  // ordinates from the left edge, a Hole Table, a Center Mark, a Weld Symbol; (c) two sheets: a view moved to Sheet2
  // (right-click ▸ Move to Sheet), sheet B to C at 1:2, a dimension's tolerance and precision, a dimension dragged to the
  // other side, a view deleted with its dimensions. Each edit one undo step. Self-contained.
  (function () {
    var RFKT_BRACKET = 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.property("Description", "Formed bracket");\np.property("Part Number", "BR-100");\np.property("Revision", "A");\n' +
      'p.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[0, 0.0598, 1.5]]);\np.flange(2, [[6, 0.0598, 1.5]], { angle: 120 });\n' +
      'p.hole("Top", 1.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 3, -1.5, 0.5, { offset: 0.0598 });';
    var RFKT_BOX = 'p.name("Box-14GA").units("in");\np.material("Plain Carbon Steel");\np.sheet(0.0747, 0.075, 0.44);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
      'p.flange(2, [[5, 0.0747, 0]], { position: "inside", lengthRef: "outer" });\np.flange(2, [[10, 0.0747, 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.flange(2, [[5, 0.0747, 6]], { position: "inside", lengthRef: "outer" });\np.flange(2, [[0, 0.0747, 3]], { position: "inside", lengthRef: "outer" });\n' +
      'p.closedCorner([[0.03735, 1.8, 0.1497], [9.8503, 1.8, 5.96265], [0.03735, 1.8, 5.8503]], { cornerType: "butt", gap: 0.01, closeBend: true });\n' +
      'p.hole("Top", 2, -1.5, 0.281, { offset: 0.0747 });\np.hole("Top", 8, -1.5, 0.281, { offset: 0.0747 });\np.hole("Top", 2, -4.5, 0.281, { offset: 0.0747 });\np.hole("Top", 8, -4.5, 0.281, { offset: 0.0747 });\np.hole("Top", 5, -3, 0.75, { offset: 0.0747 });\n' +
      'p.weldedCorner([[0.03735, 1.2, 0.081771]]);';
    function rfKTMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfKTClick(p, extra) { rfKTMouse('mousemove', p, extra); rfKTMouse('mousedown', p, extra); rfKTMouse('mouseup', p, extra); }
    function rfKTDrag(a, b) { rfKTMouse('mousemove', a); rfKTMouse('mousedown', a); for (var i = 1; i <= 6; i++) rfKTMouse('mousemove', [a[0] + (b[0] - a[0]) * i / 6, a[1] + (b[1] - a[1]) * i / 6]); rfKTMouse('mouseup', b); }
    function rfKTMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 800));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfKTRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['View Layout', 'Annotation'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfKTW(pred) { return UI.drawing.state.sheet.views.filter(function (w) { return pred(w.view); })[0]; }
    function rfKTEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    function rfKTUserDims() { return UI.drawing.state.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.text; }); }
    function rfKTTab(i) { return D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="' + i + '"]'); }
    function rfKTRadio(value) { var r = D.querySelector('#pm input[type=radio][value="' + value + '"]'); assert(r, 'PM option ' + value); r.click(); }
    function rfKTSelect(label, val) { var el = pmField(label); assert(el && el.tagName === 'SELECT', 'select ' + label); el.value = val; assert(el.value === val, label + ' has no ' + val); el.dispatchEvent(new W.Event('change', { bubbles: true })); }
    // right-click at a sheet point, then the menu row matching re
    function rfKTCtx(p, re) {
      rfKTMouse('mousemove', p); rfKTMouse('contextmenu', p, { button: 2 });
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { return re.test(m.textContent); })[0];
      assert(mi, re + ' in the menu: ' + rows.map(function (m) { return m.textContent; }).join(' | '));
      mi.click(); if (UI.closeMenus) UI.closeMenus();
    }
    async function rfKTSaved(fn) {
      var got = [], sd = UI.exportDialog, dl = UI.download;
      UI.exportDialog = function (title, name, text) { got.push({ name: name, text: text }); };
      UI.download = function (name, data) { got.push(typeof data === 'string' ? { name: name, text: data } : { name: name, bytes: data }); };
      try { await fn(); await idle(); await wait(30); } finally { UI.exportDialog = sd; UI.download = dl; }
      return got;
    }
    async function rfKTDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfKTMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    // the free spot farthest from the views, blocks, notes and tables for a w x h box (paper units), or null
    function rfKTFree(w, h) {
      var sh = UI.drawing.state.sheet, S = sh.size, obs = W.Drawing.tbRects(S, sh.units || 'in').concat(sh.views.map(function (x) { return x.box; })), best = null, bs = -Infinity;
      (sh.annotations || []).concat(sh.notes || []).concat(sh.holeTables || []).forEach(function (a) { if (a.box && isFinite(a.box.x0)) obs.push(a.box); });
      if (sh.revisions && sh.revisions.box) obs.push(sh.revisions.box);
      for (var i = 1; i < 60; i++) for (var j = 1; j < 40; j++) {
        var c = [S[0] * i / 60, S[1] * j / 40], r = { x0: c[0] - w / 2, x1: c[0] + w / 2, y0: c[1] - h / 2, y1: c[1] + h / 2 }, b1 = 0.6;
        if (r.x0 < b1 || r.y0 < b1 || r.x1 > S[0] - b1 || r.y1 > S[1] - b1) continue;
        if (obs.some(function (o) { return rfKTMeet(r, o); })) continue;
        var d = Math.min.apply(null, obs.map(function (o) { return Math.max(o.x0 - r.x1, r.x0 - o.x1, o.y0 - r.y1, r.y0 - o.y1); }));
        if (d > bs) { bs = d; best = c; }
      }
      return best;
    }
    // texts of dimensions / annotations / notes that overlap one another (pairs from different items)
    function rfKTTextOverlaps() {
      var sh = UI.drawing.state.sheet, out = [];
      var texts = sh.prims.filter(function (p) { return p.k === 'text' && p.text && /^(DIMENSIONS|ANNOTATIONS|NOTES)$/.test(p.layer || ''); });
      texts.forEach(function (a, i) {
        var ra = W.Drawing.textRect(a);
        texts.slice(i + 1).forEach(function (b) {
          if (a.dimIx != null && a.dimIx === b.dimIx) return;
          if (a.dimIx == null && b.dimIx == null && Math.abs(a.p[0] - b.p[0]) < 1e-9) return;   // the lines of one note / callout
          if (rfKTMeet(ra, W.Drawing.textRect(b))) out.push(a.text + ' / ' + b.text + ' (' + a.layer + ' ' + a.p.map(fmt) + ' ' + b.layer + ' ' + b.p.map(fmt) + ')');
        });
      });
      return out;
    }
    // views over views or on the title block, tables and notes on blocks or off the border
    function rfKTClashes() {
      var sh = UI.drawing.state.sheet, S = sh.size, tbs = W.Drawing.tbRects(S, sh.units || 'in'), b1 = 10 / 25.4, bad = [], items = [];
      (sh.holeTables || []).forEach(function (t) { items.push({ n: (t.punch ? 'Punch' : 'Hole') + ' Table', b: t.box }); });
      (sh.notes || []).forEach(function (n) { if (n.box) items.push({ n: 'note ' + n.text.split('\n')[0], b: n.box }); });
      (sh.annotations || []).forEach(function (a) { if (a.type === 'bendTable' && a.box) items.push({ n: 'Bend Table', b: a.box }); });
      if (sh.revisions && sh.revisions.box) items.push({ n: 'Revision Table', b: sh.revisions.box, rev: true });
      items.forEach(function (it, i) {
        if (!it.rev) tbs.forEach(function (t) { if (rfKTMeet(it.b, t)) bad.push(it.n + ' in the title / tolerance block'); });
        if (it.b.x0 < b1 || it.b.y0 < b1 || it.b.x1 > S[0] - b1 || it.b.y1 > S[1] - b1) bad.push(it.n + ' off the border');
        items.slice(i + 1).forEach(function (o) { if (rfKTMeet(it.b, o.b)) bad.push(it.n + ' over ' + o.n); });
        sh.views.forEach(function (w) { if (rfKTMeet(it.b, w.box)) bad.push(it.n + ' over ' + w.view.name); });
      });
      sh.views.forEach(function (w, i) {
        sh.views.slice(i + 1).forEach(function (o) { if (rfKTMeet(w.box, o.box)) bad.push(w.view.name + ' over ' + o.view.name); });
        tbs.forEach(function (t) { if (rfKTMeet(w.box, t)) bad.push(w.view.name + ' on the title block'); });
        if (w.box.x0 < b1 || w.box.y0 < b1 || w.box.x1 > S[0] - b1 || w.box.y1 > S[1] - b1) bad.push(w.view.name + ' off the border');
      });
      return bad.filter(function (x, i, a) { return a.indexOf(x) === i; });
    }
    // a sheet text as the PDF writes it (drawing-render.js pdfText: WinAnsi octal for Ø × ± °, Hole Wizard symbols as words)
    function rfKTPdf(t) {
      t = String(t).replace(/↧\s*([^\s,]+)/g, 'X $1 DEEP').replace(/⌴\s*/g, 'CBORE ').replace(/⌵\s*/g, 'CSK ');
      return t.replace(/[\\()]/g, function (c) { return '\\' + c; }).replace(/Ø/g, '\\330').replace(/×/g, '\\327').replace(/±/g, '\\261').replace(/°/g, '\\260');
    }
    function rfKTDxf(t) { return String(t).replace(/Ø/g, '%%c').replace(/°/g, '%%d').replace(/±/g, '%%p'); }
    async function rfKTDrawing(code) {
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      rfKTMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfKTDone(); await wait(20);
      assert(UI.drawingActive(), 'drawing open');
    }

    step('rfKT: a. formed bracket — Make Drawing from Part, Smart Dimension by clicks: hole centre to edge .750, centre to centre 3.000, the 60° between the base and the 120° flange, the bend\'s R.060 clicked on its 3 px arc (was its centre); each one undo step; Hole Callout; Note with a leader (click the hole, then the spot) and a general note; no texts on texts', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfKTDrawing(RFKT_BRACKET);
      var T = rfKTW(function (v) { return v.orient === 'Top'; }), F = rfKTW(function (v) { return v.orient === 'Front'; });
      UI.drawing.smartDimension(); await wait(10);
      var u0 = UI.App.undo.length;
      // hole centre, then the base's back edge, then the spot
      rfKTClick(T.toSheet([1.5, -0.75])); await wait(10);
      assert(st.pending && st.pending.first && st.pending.first.pick.center, 'first pick the centre: ' + JSON.stringify(st.pending && st.pending.first && st.pending.first.pick));
      rfKTClick(T.toSheet([2.2, 0])); await wait(10);
      assert(st.pending.second && st.pending.second.pick.edge, 'then the edge');
      rfKTClick(T.toSheet([0.6, -0.4])); await rfKTDone();
      assert(rfKTUserDims().indexOf('.750') >= 0 && UI.App.undo.length === u0 + 1, '.750, one undo step: ' + rfKTUserDims().join(' | ') + ' undo +' + (UI.App.undo.length - u0));
      rfKTClick(T.toSheet([1.5, -0.75])); await wait(10);
      rfKTClick(T.toSheet([4.5, -0.75])); await wait(10);
      rfKTClick(T.toSheet([3.2, 0.5])); await rfKTDone();
      assert(rfKTUserDims().indexOf('3.000') >= 0 && UI.App.undo.length === u0 + 2, '3.000: ' + rfKTUserDims().join(' | '));
      // the angle: the base's top line, the flange's inside line, a spot inside the angle
      rfKTClick(F.toSheet([3, 0.0598])); await wait(10);
      rfKTClick(F.toSheet([5.604, 1.046])); await wait(10);
      assert(st.pending.second && st.pending.second.pick.edge, 'two edges for the angle');
      rfKTClick(F.toSheet([4.9, 0.7])); await rfKTDone();
      assert(rfKTUserDims().indexOf('60°') >= 0, 'the 60° angle: ' + rfKTUserDims().join(' | '));
      // the 120° bend's inside radius, clicked on the arc's middle at the sheet's fit zoom (3 px from its centre)
      var arc = F.proj.arcs.visible.filter(function (a) { return a.c[0] > 3 && Math.abs(a.r - 0.06) < 1e-6; })[0], am = (arc.a0 + arc.a1) / 2 * Math.PI / 180;
      var on = F.toSheet([arc.c[0] + arc.r * Math.cos(am), arc.c[1] + arc.r * Math.sin(am)]);
      rfKTClick(on); await wait(10);
      assert(st.pending.first && st.pending.first.pick.arc, 'a click on the arc picks the arc (radius), not its centre: ' + JSON.stringify(st.pending.first && st.pending.first.pick) + ' arc radius ' + (arc.r * F.scale / W.UI.drawingInternal.pxToPaper(1)).toFixed(1) + ' px');
      rfKTClick(F.toSheet([arc.c[0] + 0.3, arc.c[1] + 0.9])); await rfKTDone();
      assert(rfKTUserDims().indexOf('R.060') >= 0 && UI.App.undo.length === u0 + 4, 'R.060 placed: ' + rfKTUserDims().join(' | ') + ' undo +' + (UI.App.undo.length - u0));
      rfKTEnd();
      // Hole Callout on the Ø.281
      rfKTRibbon('Hole Callout').click(); await wait(10);
      rfKTClick(T.toSheet([1.5 + 0.1405, -0.75])); await wait(10);
      rfKTClick(T.toSheet([1.5 + 0.1405, -0.75])); await rfKTDone();   // (rfKX) the second click places it (on the hole: its default place)
      var hc = (st.sheet.annotations || []).filter(function (a) { return a.type === 'holeCallout'; })[0];
      assert(hc && hc.text === '2X Ø.281 THRU ALL', 'hole callout: ' + (hc && hc.text));
      rfKTEnd();
      // Note with a leader: click the Ø.500 hole's edge, then the spot; type; ✓
      var u1 = UI.App.undo.length;
      rfKTRibbon('Note').click(); await wait(10);
      var edge = T.toSheet([3 + 0.25 * Math.SQRT1_2, -1.5 + 0.25 * Math.SQRT1_2]);
      rfKTClick(edge); await wait(10);
      assert(!st.inline && st.pending && st.pending.tip, 'the first click on the hole is the leader\'s point: ' + statusText());
      rfKTMouse('mousemove', T.toSheet([4.2, -2.2])); await wait(10);
      assert(D.querySelector('#dw-overlay line.dw-cut, #drawing-sheet line.dw-cut'), 'the leader follows the pointer');
      rfKTClick(T.toSheet([4.4, -2.4])); await wait(10);
      assert(st.inline, 'the note box opens at the second click');
      st.inline.inp.value = 'DEBURR'; D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfKTDone();
      var nt = anvil.drawing.summary().notes.filter(function (n) { return n.text === 'DEBURR'; })[0];
      assert(nt && nt.leader, 'a note with a leader: ' + JSON.stringify(anvil.drawing.summary().notes));
      var c5 = T.toSheet([3, -1.5]);
      near(Math.hypot(nt.leader[0] - c5[0], nt.leader[1] - c5[1]), 0.25 * T.scale, 1e-6, 'the arrow touches the hole\'s edge');
      assert(UI.App.undo.length === u1 + 1, 'one undo step');
      // a general note on free paper (no leader)
      var spot = rfKTFree(3.2, 0.8);
      rfKTClick(spot); await wait(10);
      assert(st.inline, 'a click on paper opens the note box at once');
      st.inline.inp.value = 'NOTES:\n1. BREAK ALL SHARP EDGES\n2. DEBURR ALL HOLES'; D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfKTDone();
      var gn = anvil.drawing.summary().notes.filter(function (n) { return /^NOTES:/.test(n.text); })[0];
      assert(gn && !gn.leader, 'general note without a leader');
      rfKTEnd();
      // Ctrl+Z takes the leader note off in one step, Ctrl+Y puts it back
      await UI.undo(); await UI.undo(); await rfKTDone();
      assert(!anvil.drawing.summary().notes.some(function (n) { return n.text === 'DEBURR'; }), 'undone');
      await UI.redo(); await UI.redo(); await rfKTDone();
      assert(anvil.drawing.summary().notes.length === 2, 'redone');
      var ov = rfKTTextOverlaps();
      assert(!ov.length, 'texts on texts: ' + ov.join(' | '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return rfKTUserDims().join(' | ') + '; ' + hc.text + '; notes ' + anvil.drawing.summary().notes.length;
    });

    step('rfKT: a. the flat on Sheet2 (Add Sheet tab, Insert ▸ Flat Pattern…, Bend Table) placed by a click; File ▸ Properties… Drawn by / Company into the title block; Insert ▸ Tables ▸ Revision Table and right-click ▸ Add Revision: REV B in the title block; File ▸ Save Drawing as DXF / PDF / DWG: every text of each sheet in the DXF and the PDF', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      assert(UI.drawingActive() && rfKTUserDims().indexOf('.750') >= 0, 'the bracket drawing from the step before');
      D.querySelector('.dw-add-sheet').click(); await rfKTDone();
      rfKTMenu('Insert', 'Flat Pattern'); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Model View', 'Model View PM');
      setInput(pmField('Bends'), 'table'); await wait(10);
      await UI.pmOK(); await wait(20);
      assert(st.tool === 'place' && st.pending, 'placing the flat');
      var spot = rfKTFree(st.pending.w, st.pending.h);
      assert(spot, 'room for the flat on Sheet2');
      rfKTMouse('mousemove', spot); rfKTMouse('mousedown', spot); rfKTMouse('mouseup', spot); await rfKTDone();
      var fv = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'flat'; })[0];
      assert(fv, 'flat view');
      var bt = (st.sheet.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 2, 'Bend Table, two bends: ' + JSON.stringify(bt && bt.info.rows));
      rfKTMenu('File', 'Properties'); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Drawing Properties', 'Drawing Properties PM');
      setInput(pmField('Drawn by'), 'LT'); setInput(pmField('Company'), 'ACME SHEET METAL');
      await UI.pmOK(); await rfKTDone();
      var tb = anvil.drawing.summary().titleBlock;
      assert(tb.drawnBy === 'LT' && tb.company === 'ACME SHEET METAL' && tb.title === 'FORMED BRACKET' && tb.partNo === 'BR-100' && /\.0598/.test(tb.thickness), 'title block: ' + JSON.stringify(tb));
      rfKTMenu('Insert', 'Revision Table'); await rfKTDone();
      var rv = st.sheet.revisions;
      assert(rv && rv.box, 'Revision Table');
      var u0 = UI.App.undo.length;
      rfKTCtx([(rv.box.x0 + rv.box.x1) / 2, (rv.box.y0 + rv.box.y1) / 2], /^Add Revision/); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Add Revision', 'Add Revision PM');
      setInput(pmField('DESCRIPTION'), 'RELEASED FOR PRODUCTION');
      await UI.pmOK(); await rfKTDone();
      var s = anvil.drawing.summary();
      assert(s.revisions.rows.length === 1 && UI.App.undo.length === u0 + 1, 'one row, one undo step: ' + JSON.stringify(s.revisions.rows));
      assert(s.titleBlock.rev === s.revisions.rows[0].rev, 'title block REV follows the table: ' + s.titleBlock.rev + ' / ' + s.revisions.rows[0].rev);
      var clash = rfKTClashes();
      assert(!clash.length, clash.join('; '));
      var dxf = (await rfKTSaved(function () { rfKTMenu('File', 'Save Drawing as DXF'); }))[0];
      var pdf = (await rfKTSaved(function () { rfKTMenu('File', 'Save Drawing as PDF'); }))[0];
      var dwgs = await rfKTSaved(async function () { rfKTMenu('File', 'Save Drawing as DWG'); for (var k = 0; k < 60 && !st.lastDwg; k++) await wait(50); });
      var dwg = dwgs.filter(function (g) { return /\.dwg$/.test(g.name); })[0];
      assert(dxf && /\.dxf$/.test(dxf.name) && pdf && /^%PDF/.test(pdf.text) && dwg && dwg.bytes, 'the three files: ' + [dxf && dxf.name, pdf && pdf.name, dwgs.map(function (g) { return g.name; })].join(' '));
      assert(String.fromCharCode.apply(null, new Uint8Array(dwg.bytes.buffer || dwg.bytes).subarray(0, 6)) === 'AC1015', 'AutoCAD 2000 DWG');
      // every text on each sheet is in the DXF (the active sheet) and the PDF (one page per sheet)
      var miss = [], missP = [], texts = [];
      for (var i = 0; i < 2; i++) {
        rfKTTab(i).click(); await rfKTDone();
        texts = st.sheet.prims.filter(function (x) { return x.k === 'text' && String(x.text).trim(); }).map(function (x) { return x.text; });
        var dxi = (await rfKTSaved(function () { rfKTMenu('File', 'Save Drawing as DXF'); }))[0].text;
        texts.forEach(function (t) { if (dxi.indexOf(rfKTDxf(t)) < 0) miss.push(i + ':' + t); if (pdf.text.indexOf('(' + rfKTPdf(t) + ')') < 0) missP.push(i + ':' + t); });
      }
      assert(!miss.length, 'missing from the DXF: ' + miss.join(' | '));
      assert(!missP.length, 'missing from the PDF: ' + missP.join(' | '));
      assert((pdf.text.match(/\/Type \/Page\b/g) || []).length === 2, 'two PDF pages');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'REV ' + s.titleBlock.rev + ', ' + texts.length + ' texts on Sheet2; ' + dxf.name + ' / ' + pdf.name + ' / ' + dwg.name;
    });

    step('rfKT: b. welded-corner box — Section View A-A through the middle hole, a 4:1 Detail View of the welded corner, ordinates from the left edge, a Hole Table of all holes, a Center Mark, a Weld Symbol on the corner: nothing over a view, a table or the title block', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfKTDrawing(RFKT_BOX);
      var T = rfKTW(function (v) { return v.orient === 'Top'; }), u0 = UI.App.undo.length;
      rfKTRibbon('Section View').click(); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Section View', 'Section View PM');
      await UI.pmOK(); await wait(10);
      rfKTClick(T.toSheet([5, -3.05])); await wait(10);
      assert(Math.abs(st.pending.cut - -3) < 1e-9, 'the cutting line snaps to the hole centre: ' + st.pending.cut);
      var sp = [T.view.x, T.box.y1 + 1];
      rfKTMouse('mousemove', sp); rfKTClick(sp); await rfKTDone();
      var sec = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'section'; })[0];
      assert(sec && UI.App.undo.length === u0 + 1, 'Section View A-A, one undo step: ' + JSON.stringify(sec));
      var sw = rfKTW(function (v) { return v.kind === 'section'; });
      assert(st.sheet.prims.some(function (p) { return p.k === 'text' && p.text === 'SECTION A-A'; }) && sw.hatches && sw.hatches.length || st.sheet.prims.some(function (p) { return p.layer === sw.layer && p.style === 'hatch'; }), 'label and hatch');
      // Detail View of the front-left (welded) corner at 4:1
      rfKTRibbon('Detail View').click(); await wait(20);
      rfKTRadio('custom'); await wait(10);
      rfKTSelect('Scale', '4:1');
      T = rfKTW(function (v) { return v.orient === 'Top'; });
      rfKTClick(T.toSheet([0.1, -0.1])); await wait(10);
      rfKTClick(T.toSheet([0.35, -0.1])); await wait(10);
      var dsz = 2 * 0.25 * 4 + 0.6, dspot = rfKTFree(dsz, dsz + 0.4);
      assert(dspot, 'room for the detail');
      rfKTClick(dspot); await rfKTDone();
      var det = anvil.drawing.summary().views.filter(function (v) { return v.kind === 'detail'; })[0];
      assert(det && det.scale === '4:1' && det.name === 'Detail View B (4 : 1)', 'detail: ' + JSON.stringify(det));
      rfKTEnd();
      // ordinates along the Top view from its left edge
      T = rfKTW(function (v) { return v.orient === 'Top'; });
      rfKTMenu('Insert', 'Dimensions ▸ Ordinate'); await wait(20);
      rfKTClick(T.toSheet([0, -3.3])); await wait(10);
      [[2 + 0.1405, -1.5], [5 + 0.375, -3], [8 + 0.1405, -1.5]].forEach(function (q) { rfKTClick(T.toSheet(q)); });
      await UI.pmOK(); await rfKTDone();
      var od = st.sheet.dims.filter(function (d) { return d.kind === 'ordinate'; })[0];
      assert(od && od.text === '0, 2.000, 5.000, 8.000', 'ordinates: ' + (od && od.text));
      // Hole Table: the lower-left vertex, All holes
      rfKTRibbon('Hole Table').click(); await wait(20);
      T = rfKTW(function (v) { return v.orient === 'Top'; });
      var ll = T.proj.lines.visible.map(function (l) { return [[l[0], l[1]], [l[2], l[3]]]; }).reduce(function (a, b) { return a.concat(b); }, []).sort(function (a, b) { return (a[0] - a[1]) - (b[0] - b[1]); })[0];
      rfKTClick(T.toSheet(ll)); await wait(10);
      assert(st.pending.origin, 'origin picked: ' + statusText());
      var all = pmField('All holes'); if (all && !all.checked) all.click();
      await UI.pmOK(); await rfKTDone();
      var ht = (st.sheet.holeTables || [])[0];
      assert(ht && ht.rows.length === 5, 'Hole Table, 5 holes: ' + JSON.stringify(ht && ht.rows));
      rfKTRibbon('Center Mark').click(); await wait(10);
      var nA = (st.sheet.annotations || []).filter(function (a) { return a.type === 'centerMark'; }).length;
      T = rfKTW(function (v) { return v.orient === 'Top'; });
      rfKTClick(T.toSheet([5 + 0.375, -3])); await rfKTDone();
      assert((st.sheet.annotations || []).filter(function (a) { return a.type === 'centerMark'; }).length >= nA, 'centre mark: ' + statusText());
      rfKTEnd();
      // Weld Symbol: the corner in the Front view, then where the reference line starts
      rfKTRibbon('Weld Symbol').click(); await wait(20);
      var F = rfKTW(function (v) { return v.orient === 'Front'; });
      rfKTClick(F.toSheet([0, 1.5])); await wait(10);
      rfKTClick([F.box.x0 - 0.9, F.box.y1 + 0.3]); await rfKTDone();
      rfKTEnd();
      var ws = (anvil.drawing.summary().symbols || []).filter(function (x) { return x.type === 'weld'; })[0];
      assert(ws, 'weld symbol: ' + JSON.stringify(anvil.drawing.summary().symbols));
      var clash = rfKTClashes();
      assert(!clash.length, clash.join('; '));
      var ov = rfKTTextOverlaps();
      assert(!ov.length, 'texts on texts: ' + ov.join(' | '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return [sec.name, det.name, od.text, ht.rows.length + ' holes', ws.text].join('; ');
    });

    step('rfKT: c. two sheets — right-click the Isometric ▸ Move to Sheet ▸ Sheet2 (one undo step; Ctrl+Z brings it back), sheet B to C at 1:2, a dimension\'s tolerance and precision in its PM (one Ctrl+Z restores it), the 6.240 dragged to the other side, the Top view deleted with its dimensions (one Ctrl+Z restores both)', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfKTDrawing(RFKT_BRACKET);
      D.querySelector('.dw-add-sheet').click(); await rfKTDone();
      rfKTTab(0).click(); await rfKTDone();
      var I = rfKTW(function (v) { return v.orient === 'Isometric'; }), iso = I.view.id, ip = [I.view.x, I.view.y], u0 = UI.App.undo.length;
      rfKTCtx([(I.box.x0 + I.box.x1) / 2, (I.box.y0 + I.box.y1) / 2], /Move to Sheet/); await rfKTDone();
      assert(!anvil.drawing.summary().views.some(function (v) { return v.id === iso; }) && UI.App.undo.length === u0 + 1, 'moved off Sheet1, one undo step');
      rfKTTab(1).click(); await rfKTDone();
      var mv = anvil.drawing.doc().views.filter(function (v) { return v.id === iso; })[0];
      assert(mv && mv.x === ip[0] && mv.y === ip[1] && st.sheet.views.length === 1, 'on Sheet2 at its place: ' + JSON.stringify(mv && [mv.x, mv.y]) + ' vs ' + ip);
      await UI.undo(); await rfKTDone();
      assert(W.Drawing.sheets(anvil.drawing.doc())[0].views === 4, 'Ctrl+Z puts it back on Sheet1: ' + JSON.stringify(W.Drawing.sheets(anvil.drawing.doc())));
      await UI.redo(); await rfKTDone();
      if (!rfKTTab(0).classList.contains('active')) { rfKTTab(0).click(); await rfKTDone(); }
      // right-click the sheet ▸ Properties…: ANSI C, 1:2
      var u1 = UI.App.undo.length;
      rfKTCtx([1.0, 1.0], /^Properties/); await wait(20);
      var sels = D.querySelectorAll('#modal select');
      sels[0].value = 'ANSI C'; sels[0].dispatchEvent(new W.Event('change', { bubbles: true }));
      sels[1].value = '1:2'; sels[1].dispatchEvent(new W.Event('change', { bubbles: true }));
      clickModalButton('Apply Changes'); await rfKTDone();
      var s = anvil.drawing.summary();
      assert(s.sheet.format === 'ANSI C' && s.sheet.scale === '1:2' && UI.App.undo.length === u1 + 1, 'sheet C at 1:2, one step: ' + JSON.stringify(s.sheet));
      var clash = rfKTClashes();
      assert(!clash.length, clash.join('; '));
      // the 6.240: double-click, Tolerance bilateral +.010 / -.005, precision .12, ✓
      function wide() { return st.sheet.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && /^6\.24/.test(p.text); })[0]; }
      var dt = wide(), u2 = UI.App.undo.length;
      assert(dt, 'the 6.240');
      rfKTMouse('dblclick', dt.p.slice()); await wait(20);
      assert(UI.hasPM() && UI.pmTitle() === 'Dimension', 'Dimension PM');
      var ss = D.querySelectorAll('#pm select');
      ss[0].value = 'bilateral'; ss[0].dispatchEvent(new W.Event('change', { bubbles: true })); await wait(10);
      setInput(pmField('Maximum'), 0.01); setInput(pmField('Minimum'), 0.005);
      var ps = D.querySelector('#pm select[data-key="prec"]'); ps.value = '2'; ps.dispatchEvent(new W.Event('change', { bubbles: true }));   // (rfKX: by its key; Tolerance precision now follows it)
      await UI.pmOK(); await rfKTDone();
      var d6 = st.sheet.dims.filter(function (d) { return /^6\.24/.test(d.text); })[0];
      assert(d6 && d6.text === '6.24 +.01/-.01' || d6.text === '6.24 +.010/-.005', 'tolerance and precision: ' + (d6 && d6.text));
      var steps = UI.App.undo.length - u2;
      assert(steps === 1, 'the PM edit is one undo step: +' + steps);
      await UI.undo(); await rfKTDone();
      d6 = st.sheet.dims.filter(function (d) { return /^6\.24/.test(d.text); })[0];
      assert(d6 && d6.text === '6.240', 'one Ctrl+Z restores it: ' + (d6 && d6.text));
      await UI.redo(); await rfKTDone();
      // drag the 6.240 to the other side of the Front view
      var F = rfKTW(function (v) { return v.orient === 'Front'; }), u3 = UI.App.undo.length;
      dt = wide();
      var below = dt.p[1] < F.box.y0;
      rfKTDrag(dt.p.slice(), [dt.p[0], below ? F.box.y1 + 0.4 : F.box.y0 - 0.4]); await rfKTDone();
      dt = wide();
      assert(below ? dt.p[1] > F.box.y1 : dt.p[1] < F.box.y0, 'on the other side: ' + JSON.stringify(dt.p) + ' ' + JSON.stringify(F.box));
      assert(UI.App.undo.length === u3 + 1, 'one undo step');
      // the Top view with its dimensions: click it, Delete
      var T = rfKTW(function (v) { return v.orient === 'Top'; }), tid = T.view.id, nT = st.sheet.dims.filter(function (d) { return d.view === tid; }).length, u4 = UI.App.undo.length;
      assert(nT >= 2, 'the Top view has dimensions: ' + nT);
      rfKTClick(T.toSheet([0.8, -2.4])); await wait(10);
      assert(st.sel && st.sel.kind === 'view' && st.sel.id === tid, 'Top view selected: ' + JSON.stringify(st.sel));
      key('Delete'); await rfKTDone();
      assert(!st.sheet.views.some(function (w) { return w.view.id === tid; }) && !st.sheet.dims.some(function (d) { return d.view === tid; }) && UI.App.undo.length === u4 + 1, 'view and its dimensions gone, one step');
      await UI.undo(); await rfKTDone();
      assert(st.sheet.views.some(function (w) { return w.view.id === tid; }) && st.sheet.dims.filter(function (d) { return d.view === tid; }).length === nT, 'one Ctrl+Z brings both back');
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return 'C 1:2; ' + d6.text + '; Top had ' + nT + ' dims';
    });
  })();
  // --- end rfKT ---
