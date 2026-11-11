  // --- rfLA (2026-11-11, lane drawflow3, test-reports/2026-11-11-drawing-flow.md *Round 2*) --- shop drawings made with
  // mouse and key events (the console builds the parts, changes the model as its PropertyManagers would, and reads the
  // results): (1) a finished drawing of a formed bracket that follows its model through a flange length, the gauge, a
  // hole size, a deleted hole, an added flange and a suppressed cut, then saved and loaded again; (2) a flat-pattern-only
  // drawing for the laser / brake; (3) special views of a long channel. Self-contained.
  (function () {
    var RFLA_BRACKET = 'p.name("Bracket").units("in");\np.material("Plain Carbon Steel");\np.property("Description", "Formed bracket");\np.property("Part Number", "BR-100");\np.property("Revision", "A");\n' +
      'p.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[0, 0.0598, 1.5]]);\np.flange(2, [[6, 0.0598, 1.5]], { angle: 120 });\n' +
      'p.hole("Top", 1.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 4.5, -0.75, 0.281, { offset: 0.0598 });\np.hole("Top", 3, -1.5, 0.5, { offset: 0.0598 });';
    function rfLAMouse(type, p, extra) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: type === 'dblclick' ? 2 : 1 };
      if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfLAClick(p) { rfLAMouse('mousemove', p); rfLAMouse('mousedown', p); rfLAMouse('mouseup', p); }
    function rfLAMenu(name, label) {
      var lis = D.querySelectorAll('#menus > li'), m = null;
      for (var i = 0; i < lis.length; i++) if (lis[i].textContent.trim().indexOf(name) === 0) m = lis[i];
      assert(m, 'menu ' + name);
      m.dispatchEvent(new W.MouseEvent('mousedown', { bubbles: true, cancelable: true }));
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi'));
      var hit = rows.filter(function (r) { return r.textContent.replace(/\s+/g, ' ').indexOf(label) >= 0; })[0];
      assert(hit, label + ' in ' + name + ': ' + rows.map(function (r) { return r.textContent.replace(/\s+/g, ' '); }).join(' | ').slice(0, 600));
      hit.click();
      if (UI.closeMenus) UI.closeMenus();
    }
    function rfLARibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout', 'Sheet Metal'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfLAW(o) { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.orient === o; })[0]; }
    function rfLAEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfLADone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfLADims() { return UI.drawing.state.sheet.dims.filter(function (d) { return !d.auto; }).map(function (d) { return d.text + (d.dangling ? '?' : ''); }).sort(); }
    async function rfLADrawing(code) {
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      rfLAMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfLADone(); await wait(20);
      assert(UI.drawingActive(), 'drawing open');
    }
    // the part shows (Window ▸ the part), the model is changed as its PropertyManager would and rebuilt, then Window ▸
    // the drawing opens it again
    async function rfLAChange(fn) {
      UI.markClean();   // (saved first: Window ▸ part closes the drawing and would ask to save it, see Round 2)
      rfLAMenu('Window', '(part)'); await idle(); await wait(20);
      assert(!UI.drawingActive(), 'the part shows');
      UI.pushUndo(); fn(UI.App.model); await UI.rebuild(); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'rebuild: ' + JSON.stringify(anvil.summary().errors));
      rfLAMenu('Window', 'Draw'); await rfLADone(); await wait(30);
      assert(UI.drawingActive(), 'the drawing opens again');
    }
    function rfLANote(text) { return anvil.drawing.summary().notes.filter(function (n) { return n.text === text; })[0]; }
    function rfLAAnn(type) { return (UI.drawing.state.sheet.annotations || []).filter(function (a) { return a.type === type; }); }
    function rfLATb() { return Array.prototype.map.call(D.querySelectorAll('#drawing-sheet g[data-layer="SHEET"] text'), function (t) { return t.textContent; }).join(' | '); }
    function rfLAMeet(a, b) { return a.x0 < b.x1 - 1e-9 && b.x0 < a.x1 - 1e-9 && a.y0 < b.y1 - 1e-9 && b.y0 < a.y1 - 1e-9; }
    // dimension and note texts on top of another view's linework box (not their own)
    function rfLAOnOtherViews() {
      var sh = UI.drawing.state.sheet, bad = [];
      sh.prims.filter(function (p) { return p.k === 'text' && (p.layer === 'DIMENSIONS' || p.layer === 'NOTES' || p.layer === 'ANNOTATIONS'); }).forEach(function (p) {
        var r = W.Drawing.textRect(p);
        sh.views.forEach(function (w) { if (w.view.id !== p.view && !(p.dimIx != null && sh.dims[p.dimIx] && sh.dims[p.dimIx].view === w.view.id) && rfLAMeet(r, w.box)) bad.push(p.text + ' on ' + w.view.name); });
      });
      return bad;
    }

    step('rfLA: 1. a bracket drawing follows its model — Smart Dimensions, a Hole Callout and two leader notes by clicks; then a flange 1.5 → 2, 16 → 14 ga, the first hole Ø.281 → Ø.344, the second hole deleted, a flange added, the Ø.500 cut suppressed, each opened again from Window: values on the same geometry, the callout and the notes follow, what lost its geometry dangles (never dropped), the bend table and THICKNESS update; saved and loaded the same', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLADrawing(RFLA_BRACKET);
      var T = rfLAW('Top'), F = rfLAW('Front');
      UI.drawing.smartDimension(); await wait(10);
      // hole centre to the back edge (.750), centre to centre (3.000), the Ø.500, the left flange's height (1.500)
      rfLAClick(T.toSheet([1.5, -0.75])); await wait(10); rfLAClick(T.toSheet([2.2, 0])); await wait(10); rfLAClick(T.toSheet([0.6, 0.45])); await rfLADone();
      rfLAClick(T.toSheet([1.5, -0.75])); await wait(10); rfLAClick(T.toSheet([4.5, -0.75])); await wait(10); rfLAClick(T.toSheet([3.2, 0.9])); await rfLADone();
      rfLAClick(T.toSheet([3 + 0.25, -1.5])); await wait(10); rfLAClick(T.toSheet([4.1, -2.4])); await rfLADone();
      rfLAClick(F.toSheet([-0.1198, 0.9])); await wait(10); rfLAClick(F.toSheet([-0.8, 0.9])); await rfLADone();
      rfLAEnd();
      assert(rfLADims().join(' | ') === '.750 | 1.500 | 3.000 | Ø.500', 'the dimensions: ' + rfLADims().join(' | '));
      // Hole Callout on the first Ø.281 (two clicks), notes with leaders on the second hole and on the right edge
      rfLARibbon('Hole Callout').click(); await wait(10);
      rfLAClick(T.toSheet([1.5 - 0.1405, -0.75])); await wait(10); rfLAClick(T.toSheet([0.5, -1.9])); await rfLADone();
      rfLAEnd();
      rfLARibbon('Note').click(); await wait(10);
      rfLAClick(T.toSheet([4.5 + 0.1405 * Math.SQRT1_2, -0.75 - 0.1405 * Math.SQRT1_2])); await wait(10);
      rfLAClick(T.toSheet([5.2, -2.6])); await wait(10);
      st.inline.inp.value = 'DEBURR HOLE'; D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfLADone();
      rfLAClick(T.toSheet([6.1198, -2.2])); await wait(10);
      rfLAClick(T.toSheet([6.9, -3.4])); await wait(10);
      st.inline.inp.value = 'BREAK EDGE'; D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfLADone();
      rfLAEnd();
      var be0 = rfLANote('BREAK EDGE').leader.slice(), dh0 = rfLANote('DEBURR HOLE').leader.slice();
      var ndoc = function (t) { return anvil.drawing.doc().notes.filter(function (n) { return n.text === t; })[0]; };
      assert(ndoc('BREAK EDGE').anchor && ndoc('DEBURR HOLE').anchor && ndoc('DEBURR HOLE').anchor.ref.kind === 'dia', 'both leaders are attached to the geometry they were clicked on');
      assert(rfLAAnn('holeCallout')[0].text === '2X Ø.281 THRU ALL' && /\.0598/.test(rfLATb()), 'callout and THICKNESS: ' + rfLAAnn('holeCallout')[0].text);
      var base = rfLAOnOtherViews();
      // 1. the left flange 1.5 → 2
      await rfLAChange(function (m) { m.features.filter(function (f) { return f.name === 'Edge-Flange1'; })[0].length = 2; });
      assert(rfLADims().join(' | ') === '.750 | 2.000 | 3.000 | Ø.500' && !anvil.drawing.summary().dangling, 'flange 2: ' + rfLADims().join(' | '));
      var on1 = rfLAOnOtherViews().filter(function (x) { return base.indexOf(x) < 0; });
      assert(!on1.length, 'nothing lands on another view: ' + on1.join('; '));
      // 2. 16 → 14 ga (Sheet-Metal: thickness, the base flange, the flanges' edges, the cuts' sketch planes)
      await rfLAChange(function (m) {
        var t = 0.0747;
        m.sheet.thickness = t;
        m.features.forEach(function (f) {
          if (f.sheetBase) f.depth = t;
          if (f.type === 'flange') f.edges.forEach(function (e) { e.at[1] = t; });
          if (f.type === 'sketch' && f.plane && f.plane.offset) f.plane.offset = t;
        });
      });
      var be1 = rfLANote('BREAK EDGE').leader;
      assert(rfLADims().join(' | ') === '.750 | 2.000 | 3.000 | Ø.500' && /\.0747/.test(rfLATb()), '14 ga: ' + rfLADims().join(' | ') + ' / ' + rfLATb());
      near(be1[0] - be0[0], (0.0747 - 0.0598) * T.scale, 1e-6, 'the BREAK EDGE arrow follows the edge out');
      // 3. the first hole Ø.281 → Ø.344: the callout reads it (no 2X now), its leader still at the hole
      await rfLAChange(function (m) { m.features.filter(function (f) { return f.name === 'Sketch2'; })[0].entities[0].r = 0.172; });
      var hc = rfLAAnn('holeCallout')[0];
      assert(hc.text === 'Ø.344 THRU ALL' && !hc.dangling, 'callout: ' + hc.text);
      // 4. the second hole deleted: the 3.000 and the DEBURR HOLE note dangle, in the dangling colour
      await rfLAChange(function (m) { m.features = m.features.filter(function (f) { return f.name !== 'Sketch3' && f.name !== 'Cut-Extrude2'; }); });
      assert(rfLADims().join(' | ') === '.750 | 2.000 | 3.000? | Ø.500' && rfLANote('DEBURR HOLE').dangling && !rfLANote('BREAK EDGE').dangling, 'hole 2 gone: ' + rfLADims().join(' | ') + ' note ' + JSON.stringify(rfLANote('DEBURR HOLE')));
      assert(D.querySelectorAll('#drawing-sheet g[data-layer="NOTES"] [data-color="dangling"]').length >= 1, 'the note drawn in the dangling colour');
      near(rfLANote('DEBURR HOLE').leader[0], dh0[0], 1e-9, 'its arrow stays where it was');
      // 5. a flange added on the front edge: three bends; nothing else moves
      await rfLAChange(function (m) { var t = m.sheet.thickness; m.features.push({ type: 'flange', length: 1, angle: 90, reverse: false, radius: null, position: 'bendOutside', edges: [{ at: [3, t, 0] }], name: 'Edge-Flange3', miter: false, id: m.nextId++ }); });
      assert(rfLADims().join(' | ') === '.750 | 2.000 | 3.000? | Ø.500', 'flange added: ' + rfLADims().join(' | '));
      // 6. the Ø.500 cut suppressed: its Ø dangles; unsuppressed it comes back
      await rfLAChange(function (m) { W.Kernel.setSuppressed(m, m.features.filter(function (f) { return f.name === 'Cut-Extrude3'; })[0].id, true); });
      assert(rfLADims().join(' | ') === '.750 | 2.000 | 3.000? | Ø.500?' && anvil.drawing.summary().dangling === 2, 'suppressed: ' + rfLADims().join(' | '));
      // saved and loaded: the same drawing, the same dangling items
      var json = JSON.stringify(UI.App.model);
      anvil.drawing.close(); await idle();
      await anvil.load(json); await idle();
      rfLAMenu('Window', 'Draw'); await rfLADone(); await wait(30);
      assert(UI.drawingActive() && rfLADims().join(' | ') === '.750 | 2.000 | 3.000? | Ø.500?' && rfLANote('DEBURR HOLE').dangling && /\.0747/.test(rfLATb()), 'loaded: ' + rfLADims().join(' | '));
      await rfLAChange(function (m) { W.Kernel.setSuppressed(m, m.features.filter(function (f) { return f.name === 'Cut-Extrude3'; })[0].id, false); });
      assert(rfLADims().join(' | ') === '.750 | 2.000 | 3.000? | Ø.500', 'unsuppressed: ' + rfLADims().join(' | '));
      anvil.drawing.close(); await idle();
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return rfLADims().join(' | ');
    });

    var RFLA_HAT = 'p.name("Channel-Hat").units("in");\np.material("Plain Carbon Steel");\np.property("Part Number", "CH-200");\np.sheet(0.0598, 0.06, 0.71);\np.sketch("Top").rect(0, -0.32, 6, 0.32).end().baseFlange();\n' +
      'p.flange(1, [[3, 0.0598, 0]]);\np.flange(1, [[3, 0.0598, 0.32]]);\np.hole("Top", 1, -0.16, 0.201, { offset: 0.0598 });\np.hole("Top", 5, -0.16, 0.201, { offset: 0.0598 });';
    function rfLACtx(p, re) {
      rfLAMouse('mousemove', p); rfLAMouse('contextmenu', p, { button: 2 });
      var rows = Array.prototype.slice.call(D.querySelectorAll('.menu .mi')), mi = rows.filter(function (m) { return re.test(m.textContent); })[0];
      assert(mi, re + ' in the menu: ' + rows.map(function (m) { return m.textContent; }).join(' | '));
      mi.click(); if (UI.closeMenus) UI.closeMenus();
    }
    // the ENTITIES of a DXF as { type, layer, text } (group code / value pairs)
    function rfLADxfEnts(dxf) {
      var L = dxf.replace(/\r/g, '').split('\n'), out = [], cur = null, inEnt = false;
      for (var i = 0; i + 1 < L.length; i += 2) {
        var c = L[i].trim(), v = L[i + 1];
        if (c === '2' && cur === null && v === 'ENTITIES') inEnt = true;
        if (!inEnt) continue;
        if (c === '0') { if (v === 'ENDSEC') break; cur = { type: v, layer: null, text: '' }; out.push(cur); }
        else if (cur && c === '8') cur.layer = v;
        else if (cur && (c === '1' || c === '3')) cur.text += v;
      }
      return out;
    }
    function rfLAKey(k) { W.dispatchEvent(new W.KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); }

    step('rfLA: 2. a flat-pattern-only drawing for the laser / brake — the model views deleted, sheet C at 1:1, Insert ▸ Flat Pattern placed by a click, Autodimension (ordinates from the lower-left to the holes and both bend lines .48 apart), bend notes clear of each other, Bend Table, a GRAIN note; the PDF at 1:1 (the 6.000 blank is 432 pt) and the DXF with bend lines and notes on their layers', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLADrawing(RFLA_HAT);
      // delete the model views: Front (Confirm Delete ▸ Yes takes Top and Right), then the Isometric
      var F = rfLAW('Front');
      D.querySelector('#drawing-tree [data-view="' + F.view.id + '"]').click(); await wait(10);   // its FeatureManager row
      assert(st.sel && st.sel.kind === 'view' && st.sel.id === F.view.id, 'Front selected ' + JSON.stringify(st.sel));
      rfLAKey('Delete'); await wait(10);
      if (modalOpen()) clickModalButton('Yes');
      await rfLADone();
      var I = rfLAW('Isometric');
      if (I) { D.querySelector('#drawing-tree [data-view="' + I.view.id + '"]').click(); await wait(10); rfLAKey('Delete'); await rfLADone(); }
      assert(!st.sheet.views.length, 'no views left: ' + st.sheet.views.map(function (w) { return w.view.name; }));
      // right-click the sheet ▸ Properties: ANSI C at 1:1
      rfLACtx([2, 2], /^Properties/); await wait(20);
      var sels = D.querySelectorAll('#modal select');
      sels[0].value = 'ANSI C'; sels[0].dispatchEvent(new W.Event('change', { bubbles: true }));
      sels[1].value = '1:1'; sels[1].dispatchEvent(new W.Event('change', { bubbles: true }));
      assert(sels[0].value === 'ANSI C' && sels[1].value === '1:1', 'C, 1:1 offered');
      clickModalButton('Apply Changes'); await rfLADone();
      // Insert ▸ Flat Pattern, bend notes along the lines, placed by a click in the middle of the sheet
      rfLAMenu('Insert', 'Flat Pattern'); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Model View', 'Model View PM');
      await UI.pmOK(); await wait(20);
      assert(st.tool === 'place' && st.pending, 'placing the flat');
      var S = st.sheet.size, mid = [S[0] * 0.45, S[1] * 0.55];
      rfLAClick(mid); await rfLADone();
      var fw = st.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0];
      assert(fw && Math.abs(fw.scale - 1) < 1e-12, 'the flat at 1:1: ' + (fw && fw.scale));
      // Autodimension: Ordinate both ways, bend lines included
      rfLAMenu('Tools', 'Dimensions ▸ Autodimension'); await wait(10);
      assert(st.tool === 'autodim' && st.pending.view === fw.view.id, 'the only view is picked');
      await UI.pmOK(); await rfLADone();
      var dims = anvil.drawing.summary().dims;
      assert(dims.indexOf('0, 1.000, 5.000, 6.000') >= 0 && dims.some(function (t) { return /^0, 1\.080, 1\.321, 1\.561, 2\.642$/.test(t); }), 'ordinates to the holes, ends and both bend lines: ' + dims.join(' | '));
      fw = st.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0];
      var bn = st.sheet.prims.filter(function (p) { return p.layer === 'BEND_NOTES' && p.k === 'text'; });
      assert(bn.length === 2 && bn.every(function (p) { return p.text === 'UP 90° R.060'; }), 'two bend notes: ' + bn.map(function (p) { return p.text; }));
      var r0 = W.Drawing.textRect(bn[0]), r1 = W.Drawing.textRect(bn[1]);
      assert(!rfLAMeet(r0, r1), 'the bend notes .48 apart do not touch');
      var bl = st.sheet.prims.filter(function (p) { return p.layer === 'BEND_UP'; });
      assert(bl.length === 2 && Math.abs(Math.abs(bl[0].a[1] - bl[1].a[1]) - 0.4809) < 1e-3, 'bend lines .48 apart: ' + bl.map(function (p) { return p.a[1]; }));
      bn.forEach(function (p) { var r = W.Drawing.textRect(p); bl.forEach(function (l) { assert(!(l.a[1] > r.y0 && l.a[1] < r.y1), 'a bend note on a bend line'); }); });
      // the DXF before the Bend Table turns the notes into tags: the notes on BEND_NOTES, the lines on BEND_UP
      var ents = rfLADxfEnts(anvil.drawing.dxf());
      assert(ents.filter(function (e) { return (e.type === 'TEXT' || e.type === 'MTEXT') && e.layer === 'BEND_NOTES' && /^UP 90%%d R\.060$/.test(e.text); }).length === 2, 'the bend notes on BEND_NOTES: ' + ents.filter(function (e) { return e.layer === 'BEND_NOTES'; }).map(function (e) { return e.type + ' ' + e.text; }));
      assert(ents.filter(function (e) { return e.type === 'LINE' && e.layer === 'BEND_UP'; }).length === 2, 'two bend lines on BEND_UP');
      // Bend Table (Insert ▸ Tables): the notes become tags A, B
      rfLAMenu('Insert', 'Bend Table'); await rfLADone();
      var bt = (st.sheet.annotations || []).filter(function (a) { return a.type === 'bendTable'; })[0];
      assert(bt && bt.info.rows.length === 2, 'Bend Table of two bends');
      // a GRAIN note on paper above the flat
      rfLARibbon('Note').click(); await wait(10);
      rfLAClick([fw.box.x0, fw.box.y1 + 1.6]); await wait(10);
      assert(st.inline, 'the note box');
      st.inline.inp.value = 'GRAIN DIRECTION →'; D.querySelector('#dw-edit .dw-edit-btn.ok').click(); await rfLADone();
      rfLAEnd();
      assert(rfLANote('GRAIN DIRECTION →'), 'the grain note');
      // PDF at the sheet's paper size, 1 in = 72 pt: the blank's 6.000 bottom edge is 432 pt long
      var pdf = anvil.drawing.pdf();
      var mb = /MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(pdf);
      assert(mb && Math.abs(+mb[1] - 22 * 72) < 0.01 && Math.abs(+mb[2] - 17 * 72) < 0.01, 'C sheet 22 x 17 in: ' + (mb && mb[0]));
      var segs = [], re = /([\d.]+) ([\d.]+) m\s*([\d.]+) ([\d.]+) l/g, mm;
      while ((mm = re.exec(pdf))) segs.push([+mm[1], +mm[2], +mm[3], +mm[4]]);
      var y0 = fw.toSheet([0, fw.proj.bounds.vmin])[1] * 72;
      assert(segs.some(function (s) { return Math.abs(Math.abs(s[2] - s[0]) - 432) < 0.01 && Math.abs(s[1] - y0) < 0.01 && Math.abs(s[3] - y0) < 0.01; }), 'a 432 pt line at the blank\'s bottom (y ' + y0.toFixed(2) + ')');
      assert(pdf.indexOf('(GRAIN DIRECTION ->)') > 0, 'the grain note in the PDF, its arrow as -> (was ?)');
      assert(anvil.drawing.dxf().indexOf('GRAIN DIRECTION ->') > 0, 'and in the DXF');
      anvil.drawing.close(); await idle();
      if (modalOpen()) clickModalButton("Don't Save");
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return dims.join(' | ');
    });

    // a 60 in 12 ga channel, one flange bent to 120° (a slanted face for an Auxiliary View)
    var RFLA_CHANNEL = 'p.name("Channel-60").units("in");\np.sheet(0.1046, 0.12, 0.44);\np.sketch("Top").rect(0, -3, 60, 3).end().baseFlange();\n' +
      'p.flange(1.5, [[30, 0.1046, 0]]);\np.flange(1.5, [[30, 0.1046, 3]], { angle: 120 });\np.hole("Top", 2, -1.5, 0.5, { offset: 0.1046 });\np.hole("Top", 58, -1.5, 0.5, { offset: 0.1046 });';
    function rfLASel(key, val) { var s = D.querySelector('#pm select[data-key="' + key + '"]'); assert(s, 'PM box ' + key); setInput(s, val); assert(s.value === val, key + ' has no ' + val); }

    step('rfLA: 3. a 60 in channel — Break on the Top view (the 60.000 across it keeps the true length), Crop View on the Isometric, Auxiliary View off the 120° flange in the Right view, the Isometric at 1:4 with its label (SCALE 1 : 4), the Top view rotated 90° (right-click ▸ Rotate View, its dimension stays on), Hidden Lines Visible / Removed and Tangent Edges per view; each one undo step', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfLADrawing(RFLA_CHANNEL);
      var T = rfLAW('Top');
      // the 60.000: left edge, right edge, above
      UI.drawing.smartDimension(); await wait(10);
      rfLAClick(T.toSheet([0, -2.2])); await wait(10); rfLAClick(T.toSheet([60, -2.2])); await wait(10); rfLAClick(T.toSheet([30, 2])); await rfLADone();
      rfLAEnd();
      var d60 = function () { return st.sheet.dims.filter(function (d) { return !d.auto && d.view === T.view.id; })[0]; };
      assert(d60() && d60().text === '60.000', 'the 60.000: ' + rfLADims().join(' | '));
      // Break: ✓ the PM, click the two break lines on the Top view at 12 and 48 in
      var w0 = T.box.x1 - T.box.x0, u0 = UI.App.undo.length;
      rfLARibbon('Break').click(); await UI.pmOK(); await idle();
      rfLAClick(T.toSheet([12, -1.5])); await wait(10); rfLAClick(T.toSheet([48, -1.5])); await rfLADone();
      T = rfLAW('Top');
      assert(T.view.breaks && T.view.breaks.length === 1 && T.box.x1 - T.box.x0 < w0 * 0.6 && UI.App.undo.length === u0 + 1, 'broken, shorter, one step: ' + (T.box.x1 - T.box.x0) + ' of ' + w0);
      assert(d60().text === '60.000' && !d60().dangling, 'the dimension across the break reads the true length: ' + d60().text);
      rfLAEnd();
      // Crop View on the Isometric: ✓, then two corners round its middle
      var I = rfLAW('Isometric'), ib = I.box, u1 = UI.App.undo.length;
      rfLARibbon('Crop View').click(); await UI.pmOK(); await idle();
      rfLAClick([ib.x0 + (ib.x1 - ib.x0) * 0.3, ib.y0 + (ib.y1 - ib.y0) * 0.3]); await wait(10);
      rfLAClick([ib.x0 + (ib.x1 - ib.x0) * 0.7, ib.y0 + (ib.y1 - ib.y0) * 0.7]); await rfLADone();
      I = rfLAW('Isometric');
      assert(I.view.crop && I.box.x1 - I.box.x0 < (ib.x1 - ib.x0) * 0.6 && UI.App.undo.length === u1 + 1, 'cropped, one step');
      rfLAEnd();
      // Auxiliary View off the 120° flange's outer face in the Right view
      var R = rfLAW('Right'), sl = R.proj.lines.visible.filter(function (l) { var dx = l[2] - l[0], dy = l[3] - l[1]; return Math.abs(dx) > 1e-3 && Math.abs(dy) > 1e-3 && Math.hypot(dx, dy) > 1; })[0];
      assert(sl, 'a slanted edge in the Right view');
      rfLARibbon('Auxiliary View').click(); await wait(10);
      var ep = R.toSheet([(sl[0] + sl[2]) / 2, (sl[1] + sl[3]) / 2]);
      rfLAClick(ep); await wait(10);
      var pv = st.pending;
      rfLAMouse('mousemove', [ep[0] - 1.5, ep[1] + 1.5]); await wait(10);
      var to = st.preview ? [st.preview.x, st.preview.y] : [ep[0] - 1.5, ep[1] + 1.5];
      rfLAClick(to); await rfLADone();
      var av = st.sheet.views.filter(function (w) { return w.view.kind === 'aux'; })[0];
      assert(av && av.proj.lines.visible.length > 3, 'Auxiliary View placed: ' + (av && av.view.name));
      rfLAEnd();
      // the Isometric at 1:4 with Display label on: its label gives the scale; Hidden Lines Visible; Tangent Edges Visible
      I = rfLAW('Isometric');
      rfLAMouse('dblclick', [(I.box.x0 + I.box.x1) / 2, (I.box.y0 + I.box.y1) / 2]); await wait(20);
      assert(UI.hasPM(), 'the view PM');
      rfLASel('scale', '1:4'); rfLASel('display', 'hlv'); rfLASel('tangent', 'visible');
      var lab = D.querySelector('#pm input[type=checkbox][data-key="showLabel"]') || pmField('Display label');
      if (lab && !lab.checked) lab.click();
      await UI.pmOK(); await rfLADone();
      I = rfLAW('Isometric');
      var itx = st.sheet.prims.filter(function (p) { return p.k === 'text' && p.layer === I.layer; }).map(function (p) { return p.text; });
      assert(itx.indexOf('SCALE 1 : 4') >= 0 || itx.indexOf('SCALE 1:4') >= 0, 'the label gives the scale: ' + itx.join(' | '));
      assert(I.view.display === 'hlv' && I.view.tangent === 'visible' && (I.proj.lines.hidden.length > 0) && I.proj.lines.tangent.length + (I.proj.ellipses.tangent || []).length > 0, 'hidden lines and tangent edges shown');
      // the Top view: right-click ▸ Zoom/Pan/Rotate ▸ Rotate View, 90°
      T = rfLAW('Top');
      var u2 = UI.App.undo.length, tw = T.box.x1 - T.box.x0, th = T.box.y1 - T.box.y0;
      rfLACtx(T.toSheet([4, -1.5]), /Rotate View/); await wait(20);
      assert(modalOpen() && /Rotate Drawing View/.test(D.querySelector('#modal').textContent), 'Rotate Drawing View dialog');
      var ang = D.getElementById('dw-rotate-angle'); ang.value = '90';
      clickModalButton('Apply'); await rfLADone();
      T = rfLAW('Top');
      assert(T.view.rotate === 90 && Math.abs((T.box.y1 - T.box.y0) - tw) < 1e-6 && Math.abs((T.box.x1 - T.box.x0) - th) < 1e-6 && UI.App.undo.length === u2 + 1, 'turned a quarter, one step: ' + JSON.stringify(T.box));
      assert(d60().text === '60.000' && !d60().dangling && d60().kind === 'v', 'its dimension turned with it: ' + d60().kind + ' ' + d60().text);
      // Hidden Lines Removed on the Front view by its right-click menu
      var F = rfLAW('Front');
      var hid0 = F.proj.lines.hidden.length, fr = D.querySelector('#drawing-tree [data-view="' + F.view.id + '"]');
      fr.dispatchEvent(new W.MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 200 }));
      var mi = Array.prototype.filter.call(D.querySelectorAll('.menu .mi'), function (m) { return /Hidden Lines Removed/.test(m.textContent); })[0];
      assert(mi, 'Display ▸ Hidden Lines Removed in the view menu'); mi.click(); if (UI.closeMenus) UI.closeMenus(); await rfLADone();
      assert(rfLAW('Front').view.display === 'hlr' && !rfLAW('Front').proj.lines.hidden.length && hid0 > 0, 'Front: hidden lines removed (' + hid0 + ' before)');
      await UI.undo(); await rfLADone();
      await UI.undo(); await rfLADone();
      assert(!rfLAW('Top').view.rotate && d60().kind === 'h' && d60().text === '60.000', 'Ctrl+Z turns it back');
      var pdf = anvil.drawing.pdf(), dxf = anvil.drawing.dxf();
      assert(pdf.indexOf('%PDF') === 0 && dxf.indexOf('60.000') > 0, 'exports');
      anvil.drawing.close(); await idle();
      if (modalOpen()) clickModalButton("Don't Save");
      assert(errors.length === errs0, 'console errors: ' + errors.slice(errs0).join(' | '));
      return 'break, crop, aux ' + av.view.name + ', 1:4, 90°';
    });
  })();
  // --- end rfLA ---
