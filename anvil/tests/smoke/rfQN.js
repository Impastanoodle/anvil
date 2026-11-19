  // --- rfQN (2026-11-19, lane drawflats, test-reports/2026-11-19-drawing-flats.md): the shop-flow-9 door's flat-pattern
  // drawing made with mouse and key events (Make Drawing, the model views deleted, ANSI C at 1:4, Insert > Flat
  // Pattern by a click, Autodimension, Bend Table, a linked FLAT SIZE / MATERIAL / gauge note and a GRAIN note), then
  // the door made 42 long by configuration: the drawing follows. Self-contained.
  (function () {
    var T = 0.0478, H = 0.75 - T;
    var RFQN_DOOR = 'p.name("DOOR-24").units("in");\np.material("Plain Carbon Steel");\np.sheet(null, null, null, { gaugeTable: "steel", gauge: "18" });\np.sketch("Top").rect(0, 0, 24, 36).dim(0, "h").end().baseFlange();\n' +
      'p.flange(0.75, [[12, ' + T + ', 0], [24, ' + T + ', -18], [12, ' + T + ', -36], [0, ' + T + ', -18]], { position: "inside", lengthRef: "outer", toward: [0, -1, 0], relief: "obround" });\n' +
      'p.hem(0.5, [[' + (24 - T) + ', ' + (-H) + ', -18], [' + T + ', ' + (-H) + ', -18]], { hemType: "closed", hemPosition: "inside" });\n' +
      'p.crossBreak([12, ' + T + ', -18], {});\n' +
      'p.sketch("Top").circle(1, 1, 0.1405).circle(23, 1, 0.1405).end().cut("through", { both: true });\np.linearPattern({ dir: "z", reverse: true, spacing: 34, count: 2 });\n';
    function rfQNMouse(type, p) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: type === 'contextmenu' ? 2 : 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfQNClick(p) { rfQNMouse('mousemove', p); rfQNMouse('mousedown', p); rfQNMouse('mouseup', p); }
    function rfQNMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name);
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfQNRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout', 'Sheet Metal'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfQNKey(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }
    function rfQNEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfQNDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfQNCtx(p, re) {
      rfQNMouse('mousemove', p); rfQNMouse('contextmenu', p);
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { return re.test(m.textContent); })[0];
      assert(mi, re + ' in the menu');
      mi.click(); if (UI.closeMenus) UI.closeMenus();
    }
    async function rfQNNote(p, text) {
      rfQNRibbon('Note').click(); await wait(10);
      rfQNClick(p); await wait(10);
      var st = UI.drawing.state;
      assert(st.inline, 'the note box');
      st.inline.inp.value = text; D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfQNDone();
      rfQNEnd();
    }
    function rfQNMeet(a, b) { return a.x0 < b.x1 - 1e-6 && b.x0 < a.x1 - 1e-6 && a.y0 < b.y1 - 1e-6 && b.y0 < a.y1 - 1e-6; }
    // texts on texts of other items, texts across the flat's outline / bend lines, texts past the border (zone letters
    // aside), bend lines without exactly one tag, texts missing from the R2000 DXF or the PDF
    function rfQNAudit() {
      var DW = W.Drawing, sh = UI.drawing.state.sheet, b = 10 / 25.4, S = sh.size, bad = [];
      var T2 = sh.prims.filter(function (p) { return p.k === 'text' && p.text && p.layer !== 'SHEET'; }).map(function (p) { return { p: p, r: DW.textRect(p) }; });
      var geo = sh.prims.filter(function (p) { return p.k === 'line' && (p.layer === 'FLAT_PATTERN' || /^BEND_(UP|DOWN)$/.test(p.layer || '')); });
      function cross(l, r) { for (var i = 0; i <= 32; i++) { var x = l.a[0] + (l.b[0] - l.a[0]) * i / 32, y = l.a[1] + (l.b[1] - l.a[1]) * i / 32; if (x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && y > r.y0 + 1e-6 && y < r.y1 - 1e-6) return true; } return false; }
      T2.forEach(function (x, i) {
        var r = x.r;
        if (r.x0 < b - 1e-9 || r.y0 < b - 1e-9 || r.x1 > S[0] - b + 1e-9 || r.y1 > S[1] - b + 1e-9) bad.push('off: ' + x.p.text);
        for (var j = i + 1; j < T2.length; j++) { var y = T2[j].p; if (rfQNMeet(r, T2[j].r) && !(x.p.dimIx != null && x.p.dimIx === y.dimIx) && !(x.p.annId != null && x.p.annId === y.annId)) bad.push(x.p.text + ' on ' + y.text); }
        if (geo.some(function (l) { return cross(l, r); })) bad.push('on the flat: ' + x.p.text);
      });
      var bl = sh.prims.filter(function (p) { return p.k === 'line' && /^BEND_(UP|DOWN)$/.test(p.layer || ''); }), per = bl.map(function () { return 0; });
      var bt = (sh.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      T2.filter(function (x) { return x.p.layer === 'BEND_NOTES' && /^[A-Z]{1,2}$/.test(x.p.text) && !(bt && rfQNMeet(x.r, bt.box)); }).forEach(function (x) {
        var c = [(x.r.x0 + x.r.x1) / 2, (x.r.y0 + x.r.y1) / 2], best = -1, bd = Infinity;
        bl.forEach(function (l, i) { var dx = l.b[0] - l.a[0], dy = l.b[1] - l.a[1], L2 = dx * dx + dy * dy, t = Math.max(0, Math.min(1, ((c[0] - l.a[0]) * dx + (c[1] - l.a[1]) * dy) / L2)), d = Math.hypot(l.a[0] + t * dx - c[0], l.a[1] + t * dy - c[1]); if (d < bd) { bd = d; best = i; } });
        if (best >= 0) per[best]++;
      });
      if (!bl.length || per.some(function (n) { return n !== 1; })) bad.push('tags per bend line ' + per.join(','));
      var dxf = anvil.drawing.dxf({ version: 'R2000' }), L = String(dxf).split(/\r?\n/), g1 = [];
      for (var i = 0; i + 1 < L.length; i += 2) if (L[i].trim() === '1' || L[i].trim() === '3') g1.push(L[i + 1]);
      var pdf = anvil.drawing.pdf(), ps = typeof pdf === 'string' ? pdf : Array.prototype.map.call(pdf, function (ch) { return String.fromCharCode(ch); }).join('');
      var tj = [], re = /\(((?:[^()\\]|\\.)*)\) Tj/g, m;
      while ((m = re.exec(ps))) tj.push(m[1].replace(/\\([0-7]{3})/g, function (s2, o) { return String.fromCharCode(parseInt(o, 8)); }).replace(/\\(.)/g, '$1'));
      var dxfT = function (t) { return DW.plainText(t).replace(/\n/g, ' ').replace(/Ø/g, '%%c').replace(/±/g, '%%p').replace(/°/g, '%%d').replace(/×/g, 'x').replace(/[^\x20-\x7e]/g, '?'); };
      sh.prims.forEach(function (q) {
        if (q.k !== 'text' || !q.text) return;
        if (!g1.some(function (x) { return x.indexOf(dxfT(q.text)) >= 0; })) bad.push('not in the DXF: ' + q.text);
        if (!tj.some(function (x) { return x.indexOf(DW.plainText(q.text)) >= 0; })) bad.push('not in the PDF: ' + q.text);
      });
      sh.dims.forEach(function (d) { if (d.dangling) bad.push('dangling: ' + d.text); });
      return { bad: bad, tags: per };
    }

    step('rfQN: the 18 ga door\'s flat-pattern drawing by the mouse: Make Drawing, model views deleted, ANSI C at 1:4, Insert > Flat Pattern, Autodimension, Bend Table, linked FLAT SIZE / MATERIAL / gauge note and GRAIN note: one tag per bend line, no text on text or geometry, none off the sheet, every text in the R2000 DXF and the PDF; the door made 42 long by configuration: the drawing follows, nothing dangles', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await anvil.newPart(); await idle();
      await anvil.run(RFQN_DOOR); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      rfQNMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfQNDone(); await wait(20);
      assert(UI.drawingActive(), 'drawing open');
      // the model views out: each one picked in the FeatureManager tree, Delete (Yes to its projected children)
      for (var guard = 0; guard < 6 && st.sheet.views.length; guard++) {
        var w0 = st.sheet.views[0];
        D.querySelector('#drawing-tree [data-view="' + w0.view.id + '"]').click(); await wait(10);
        rfQNKey('Delete'); await wait(10);
        if (modalOpen()) clickModalButton('Yes');
        await rfQNDone();
      }
      assert(!st.sheet.views.length, 'no views left');
      // right-click the sheet > Properties: ANSI C, 1:4
      rfQNCtx([2, 2], /^Properties/); await wait(20);
      var sels = D.querySelectorAll('#modal select');
      sels[0].value = 'ANSI C'; sels[0].dispatchEvent(new W.Event('change', { bubbles: true }));
      sels[1].value = '1:4'; sels[1].dispatchEvent(new W.Event('change', { bubbles: true }));
      assert(sels[0].value === 'ANSI C' && sels[1].value === '1:4', 'C, 1:4 offered');
      clickModalButton('Apply Changes'); await rfQNDone();
      // Insert > Flat Pattern, placed by a click in the middle of the sheet
      rfQNMenu('Insert', 'Flat Pattern'); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Model View', 'Model View PM');
      await UI.pmOK(); await wait(20);
      var S = st.sheet.size;
      rfQNClick([S[0] * 0.45, S[1] * 0.55]); await rfQNDone();
      var fw = st.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0];
      assert(fw && Math.abs(fw.scale - 0.25) < 1e-12, 'the flat at 1:4: ' + (fw && fw.scale));
      var a0 = rfQNAudit();
      assert(!a0.bad.filter(function (t) { return !/^tags per/.test(t); }).length, 'bend notes: ' + a0.bad.join(' | '));
      // Autodimension (ordinates both ways), then Insert > Bend Table
      rfQNMenu('Tools', 'Dimensions ▸ Autodimension'); await wait(10);
      assert(st.tool === 'autodim', 'Autodimension');
      await UI.pmOK(); await rfQNDone();
      rfQNMenu('Insert', 'Bend Table'); await rfQNDone();
      var bt = (st.sheet.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 6, 'Bend Table of six bends');
      fw = st.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0];
      // the notes on free paper left of the flat
      await rfQNNote([1.2, fw.box.y1 - 0.5], 'GRAIN ->');
      await rfQNNote([1.2, fw.box.y0 + 2], 'FLAT SIZE: $PRPSHEET:"Bounding Box Width" X $PRPSHEET:"Bounding Box Length"\nMATERIAL: $PRPSHEET:"Material"\n18 GA ($PRPSHEET:"Sheet Metal Thickness")');
      var txt = function () { return st.sheet.prims.filter(function (q) { return q.k === 'text'; }).map(function (q) { return q.text; }); };
      assert(txt().indexOf('FLAT SIZE: 26.3063 X 37.3429') >= 0 && txt().indexOf('MATERIAL: Plain Carbon Steel') >= 0 && txt().indexOf('18 GA (.0478)') >= 0, 'the linked note');
      var a1 = rfQNAudit();
      assert(!a1.bad.length, 'D36: ' + a1.bad.join(' | '));
      // D42: the part shows, the length and the far holes configured as the Modify box's This configuration would,
      // rebuilt, and the drawing opened again
      UI.markClean();
      rfQNMenu('Window', '(part)'); await idle(); await wait(20);
      assert(!UI.drawingActive(), 'the part shows');
      UI.pushUndo();
      var m = UI.App.model, sk = m.features[0], lp = m.features.filter(function (f) { return f.type === 'lpattern'; })[0];
      m.configurations = [{ name: 'D36', values: {} }, { name: 'D42', values: {} }]; m.activeConfiguration = 'D42';
      assert(K.configureDimension(m, { sketch: sk.id, dimIndex: 0 }, 42, 'this').ok && K.configureDimension(m, { feature: lp.id, field: 's1' }, 40, 'this').ok, 'configured');
      await UI.rebuild(); await idle();
      rfQNMenu('Window', 'Draw'); await rfQNDone(); await wait(30);
      assert(UI.drawingActive(), 'the drawing again');
      var a2 = rfQNAudit();
      assert(!a2.bad.length, 'D42: ' + a2.bad.join(' | '));
      assert(txt().indexOf('FLAT SIZE: 26.3063 X 43.3429') >= 0, 'the note follows');
      assert(st.sheet.dims.some(function (d) { return /, 43\.343$/.test(d.text || ''); }), 'the ordinates follow: ' + st.sheet.dims.map(function (d) { return d.text; }).join(' | '));
      anvil.drawing.close(); await idle();
      if (modalOpen()) clickModalButton("Don't Save");
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'tags ' + a1.tags.join(',') + '; D42 ' + st.sheet.dims.length + ' dims';
    });
  })();
