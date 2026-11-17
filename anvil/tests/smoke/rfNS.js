  // --- rfNS (2026-11-16, lane NS: dimension arrangement audit on three inch shop drawings, driven by clicks; report
  // test-reports/2026-11-16-drawing-dimension-layout.md) ---
  (function () {
    var T16 = 0.0598, T18 = 0.0478;
    var RFNS = {
      // a 16 ga tray 10 x 6, four 1.5 in walls in one Edge Flange (Material Inside), two holes in the floor
      tray: 'p.name("TRAY-1").units("in");\np.sheet(' + T16 + ', 0.06, 0.44);\np.sketch("Top").rect(0, -6, 10, 6).end().baseFlange();\n' +
        'p.flange(1.5, [[5, ' + T16 + ', 0], [5, ' + T16 + ', 6], [0, ' + T16 + ', 3], [10, ' + T16 + ', 3]], { position: "inside" });\n' +
        'p.hole("Top", 2, -3, 0.281, { offset: ' + T16 + ' });\np.hole("Top", 8, -3, 0.281, { offset: ' + T16 + ' });',
      // a 16 ga bracket 6 x 3: an UP flange at one end, a DOWN flange at the other, five holes (rfBX's)
      bracket: 'p.name("BRKT-2").units("in");\np.sheet(' + T16 + ', 0.06, 0.71);\np.sketch("Top").rect(0, -3, 6, 3).end().baseFlange();\n' +
        'p.flange(1.5, [[0, ' + T16 + ', 1.5]]);\np.flange(2, [[6, ' + T16 + ', 1.5]], { reverse: true });\n' +
        'p.hole("Top", 1.5, -0.75, 0.281, { offset: ' + T16 + ' });\np.hole("Top", 4.5, -0.75, 0.281, { offset: ' + T16 + ' });\n' +
        'p.hole("Top", 1.5, -2.25, 0.281, { offset: ' + T16 + ' });\np.hole("Top", 4.5, -2.25, 0.281, { offset: ' + T16 + ' });\np.hole("Top", 3, -1.5, 0.5, { offset: ' + T16 + ' });',
      // an 18 ga 24 x 48 panel, 1 in flanges all round, 8 x 12 Ø.25 holes
      panel: 'p.name("PNL-2448").units("in");\np.sheet(' + T18 + ', ' + T18 + ', 0.5);\np.sketch("Top").rect(0, 0, 24, 48).end().baseFlange(' + T18 + ');\n' +
        'p.sketch("Top", ' + T18 + ').circle(3, 3, 0.125).end().cut("through", { reverse: true });\n' +
        'p.linearPattern({ dir: "x", spacing: 2.5, count: 8, dir2: "z", spacing2: 3.8, count2: 12, reverse2: true });\n' +
        'p.flange(1, [[12, ' + T18 + ', 0], [12, ' + T18 + ', -48], [0, ' + T18 + ', -24], [24, ' + T18 + ', -24]], { position: "inside" });'
    };
    async function rfNSDone() { await idle(); await UI.drawing.ready(); await wait(20); }
    function rfNSMouse(type, p) {
      var svg = D.querySelector('#drawing-sheet svg'), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      pt.x = p[0]; pt.y = UI.drawing.state.sheet.size[1] - p[1];
      var q = pt.matrixTransform(m), o = { bubbles: true, cancelable: true, button: 0, buttons: type === 'mouseup' ? 0 : 1, clientX: q.x, clientY: q.y, detail: 1 };
      (type === 'mouseup' ? W : svg).dispatchEvent(new W.MouseEvent(type, o));
    }
    function rfNSClick(p) { rfNSMouse('mousemove', p); rfNSMouse('mousedown', p); rfNSMouse('mouseup', p); }
    function rfNSMenu(name, label) {
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
    function rfNSRibbon(label) {
      var find = function () { return Array.prototype.filter.call(D.querySelectorAll('#ribbon-buttons button'), function (x) { return (x.getAttribute('aria-label') || '') === label; })[0]; };
      var b = find();
      if (!b) ['Annotation', 'View Layout'].some(function (t) { var tb = Array.prototype.filter.call(D.querySelectorAll('#ribbon-tabs .rtab'), function (x) { return x.textContent === t; })[0]; if (tb) tb.click(); b = find(); return !!b; });
      assert(b, 'ribbon button ' + label);
      return b;
    }
    function rfNSEnd() { for (var i = 0; i < 4 && ((UI.hasPM && UI.hasPM()) || UI.drawing.state.tool); i++) UI.escapeCommand(); }
    async function rfNSSheet(i) { var t = D.querySelector('#drawing-tabs .dw-sheet-tab[data-sheet="' + i + '"]'); assert(t, 'sheet tab ' + i); t.click(); await rfNSDone(); }
    async function rfNSMake(code) {
      if (UI.drawingActive()) { anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save"); }
      await anvil.newPart(); await idle();
      await anvil.run(code); await idle();
      assert(!Object.keys(anvil.summary().errors || {}).length, 'part: ' + JSON.stringify(anvil.summary().errors));
      rfNSMenu('File', 'Make Drawing from Part'); await wait(30);
      if (modalOpen()) clickModalButton('OK');
      await rfNSDone();
      assert(UI.drawingActive(), 'drawing open');
    }
    function rfNSFlatW() { return UI.drawing.state.sheet.views.filter(function (w) { return w.view.kind === 'flat'; })[0]; }
    async function rfNSAutodim(w) {
      var st = UI.drawing.state, n0 = st.sheet.dims.length;
      st.sel = { kind: 'view', id: w.view.id };
      rfNSMenu('Tools', 'Autodimension'); await wait(30);
      assert(UI.hasPM() && UI.pmTitle() === 'Autodimension', 'Autodimension PM: ' + (UI.hasPM() && UI.pmTitle()));
      await UI.pmOK(); await rfNSDone();
      return st.sheet.dims.length - n0;
    }
    function rfNSMeet(a, b, m) { m = m || 0; return a.x0 < b.x1 - m && b.x0 < a.x1 - m && a.y0 < b.y1 - m && b.y0 < a.y1 - m; }
    // the arrangement audit of the shown sheet: texts on texts (different items), dimension / callout texts on the
    // views' lines, arrows on texts
    var ANN = /^(DIMENSIONS|ANNOTATIONS|NOTES|BEND_NOTES)$/, NOTGEO = /^(DIMENSIONS|ANNOTATIONS|NOTES|BEND_NOTES|SHEET|TABLES|BOM|BALLOONS)$/;
    function rfNSAudit() {
      var sh = UI.drawing.state.sheet, hit = W.Drawing._.segHitsRect, out = { texts: [], geo: [], arrows: [] };
      var texts = sh.prims.filter(function (p) { return p.k === 'text' && p.text && ANN.test(p.layer || ''); }).map(function (p) { return { p: p, r: W.Drawing.textRect(p) }; });
      texts.forEach(function (a, i) {
        texts.slice(i + 1).forEach(function (b) {
          if (a.p.dimIx != null && a.p.dimIx === b.p.dimIx) return;
          if (a.p.dimIx == null && b.p.dimIx == null && a.p.layer === b.p.layer && Math.abs(a.p.p[0] - b.p.p[0]) < 1e-9) return;   // lines of one note
          if (rfNSMeet(a.r, b.r)) out.texts.push(a.p.text + ' / ' + b.p.text);
        });
      });
      var geo = sh.prims.filter(function (p) { return p.k === 'line' && !NOTGEO.test(p.layer || '') && !/^BEND_(UP|DOWN)$/.test(p.layer || ''); });
      texts.forEach(function (t) {
        if (t.p.layer === 'BEND_NOTES') return;   // a bend note sits along its bend line by design
        var r = { x0: t.r.x0 + 1e-4, y0: t.r.y0 + 1e-4, x1: t.r.x1 - 1e-4, y1: t.r.y1 - 1e-4 };
        if (geo.some(function (l) { return hit(l.a, l.b, r); })) out.geo.push(t.p.text);
      });
      sh.prims.filter(function (p) { return p.k === 'fill' && p.dimIx != null; }).forEach(function (f) {
        var b = { x0: Math.min(f.pts[0][0], f.pts[1][0], f.pts[2][0]), x1: Math.max(f.pts[0][0], f.pts[1][0], f.pts[2][0]), y0: Math.min(f.pts[0][1], f.pts[1][1], f.pts[2][1]), y1: Math.max(f.pts[0][1], f.pts[1][1], f.pts[2][1]) };
        if (texts.some(function (t) { return rfNSMeet(b, t.r, 1e-4); })) out.arrows.push(f.dimIx);
      });
      return out;
    }
    function rfNSCount(a) { return 'texts on texts ' + a.texts.length + ', texts on lines ' + a.geo.length + ', arrows on texts ' + a.arrows.length; }
    // DXF (R12) and PDF of the shown sheet carry every dimension text at the screen's place
    function rfNSExports() {
      var sh = UI.drawing.state.sheet, dxf = anvil.drawing.dxf({ version: 'R12' }), pdf = anvil.drawing.pdf();
      var lines = String(dxf).split(/\r?\n/).map(function (s) { return s.trim(); }), ents = [], cur = null;
      for (var i = 0; i + 1 < lines.length; i += 2) { if (lines[i] === '0') { cur = { type: lines[i + 1] }; ents.push(cur); } else if (cur) cur[lines[i]] = lines[i + 1]; }
      var dtx = ents.filter(function (e) { return e.type === 'TEXT'; });
      var pdfStr = typeof pdf === 'string' ? pdf : Array.prototype.map.call(pdf, function (c) { return String.fromCharCode(c); }).join('');
      var tms = [], re = /([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+) Tm \(((?:[^()\\]|\\.)*)\) Tj/g, m;
      while ((m = re.exec(pdfStr))) tms.push({ x: +m[5] / 72, y: +m[6] / 72, rot: Math.abs(+m[2]) > 0.5, t: m[7] });
      var bad = [];
      sh.prims.filter(function (p) { return p.k === 'text' && p.dimIx != null && /^[\d.,X ]+$/.test(p.text); }).forEach(function (p) {
        var inD = dtx.some(function (e) { return e['1'] === p.text && [['10', '20'], ['11', '21']].some(function (k) { return Math.abs(+e[k[0]] - p.p[0]) < 5e-3 && Math.abs(+e[k[1]] - p.p[1]) < 5e-3; }); });
        var tr = W.Drawing.textRect(p), rot = Math.abs(p.rot || 0) > 45;
        var inP = tms.some(function (q) { return q.t === p.text && (rot ? Math.abs(q.x - p.p[0]) < 5e-3 && q.y > tr.y0 - 5e-3 && q.y < tr.y1 + 5e-3 : Math.abs(q.y - p.p[1]) < 5e-3 && q.x > tr.x0 - 5e-3 && q.x < tr.x1 + 5e-3); });
        if (!inD || !inP) bad.push(p.text + (inD ? '' : ' not in DXF') + (inP ? '' : ' not in PDF'));
      });
      return bad;
    }

    step('rfNS: a. tray flat (16 ga 10 x 6, four 1.5 in walls, bend notes): File ▸ Make Drawing from Part, Sheet2, Tools ▸ Autodimension ✓; Ordinate values .018 apart jogged apart, no text on a text, a line or an arrow; DXF / PDF texts where the screen has them', async function () {
      var errs0 = errors.length, notes = [];
      await rfNSMake(RFNS.tray);
      if (!rfNSFlatW()) await rfNSSheet(1);
      var w = rfNSFlatW();
      assert(w, 'the flat view');
      notes.push('before ' + rfNSCount(rfNSAudit()));
      var n = await rfNSAutodim(w), a = rfNSAudit();
      notes.push('Autodimension +' + n + '; after ' + rfNSCount(a));
      assert(n >= 2, 'ordinates added: ' + n);
      assert(!a.texts.length && !a.geo.length && !a.arrows.length, notes.join('; ') + ' ' + JSON.stringify(a).slice(0, 400));
      var ex = rfNSExports();
      assert(!ex.length, 'exports: ' + ex.join(', '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfNS: b. bracket with an UP and a DOWN flange: Make Drawing (three views + the flat), Smart Dimension by clicks on the Front view\'s base edge, Hole Callout on the Top view\'s Ø.500 (two clicks), Autodimension on the flat: no overlaps on either sheet; DXF / PDF match the screen', async function () {
      var errs0 = errors.length, notes = [], st = UI.drawing.state;
      await rfNSMake(RFNS.bracket);
      if (rfNSFlatW()) await rfNSSheet(0);
      notes.push('sheet1 before ' + rfNSCount(rfNSAudit()));
      var F = st.sheet.views.filter(function (w) { return w.view.orient === 'Front'; })[0], Tp = st.sheet.views.filter(function (w) { return w.view.orient === 'Top'; })[0];
      assert(F && Tp, 'Front and Top views');
      // Smart Dimension: the longest horizontal visible edge of the Front view, a quarter along, then above the view
      var L = F.proj.lines.visible.filter(function (l) { return Math.abs(l[1] - l[3]) < 1e-9; }).sort(function (a, b) { return Math.abs(b[2] - b[0]) - Math.abs(a[2] - a[0]); })[0];
      rfNSRibbon('Smart Dimension').click(); await wait(10);
      rfNSClick(F.toSheet([L[0] + (L[2] - L[0]) * 0.25, L[1]])); await wait(15);
      var top = F.box.y1 + 0.45;
      rfNSMouse('mousemove', [F.toSheet([(L[0] + L[2]) / 2, 0])[0], top]); await wait(10);
      var d0 = st.sheet.dims.length;
      rfNSClick([F.toSheet([(L[0] + L[2]) / 2, 0])[0], top]); await rfNSDone();
      rfNSEnd();
      notes.push('smart dims +' + (st.sheet.dims.length - d0));
      // Hole Callout on the Ø.500 in the Top view
      var big = Tp.proj.circles.visible.filter(function (c) { return Math.abs(c.r - 0.25) < 1e-4; })[0];
      assert(big, 'the Ø.500 in the Top view');
      rfNSRibbon('Hole Callout').click(); await wait(10);
      rfNSClick(Tp.toSheet([big.c[0] + big.r, big.c[1]])); await wait(10);
      rfNSClick(Tp.toSheet([big.c[0] + big.r, big.c[1]])); await rfNSDone();
      rfNSEnd();
      var hc = (st.sheet.annotations || []).filter(function (x) { return x.type === 'holeCallout'; });
      notes.push('callouts ' + hc.map(function (x) { return x.text; }).join(','));
      var a1 = rfNSAudit();
      notes.push('sheet1 after ' + rfNSCount(a1));
      var ex1 = rfNSExports();
      await rfNSSheet(1);
      var w = rfNSFlatW();
      assert(w, 'the flat on Sheet2');
      notes.push('flat before ' + rfNSCount(rfNSAudit()));
      var n = await rfNSAutodim(w), a2 = rfNSAudit();
      notes.push('Autodimension +' + n + '; flat after ' + rfNSCount(a2));
      var ex2 = rfNSExports();
      assert(hc.length === 1 && st.sheet.dims.length >= 2, notes.join('; '));
      assert(!a1.texts.length && !a1.geo.length && !a1.arrows.length && !a2.texts.length && !a2.geo.length && !a2.arrows.length, notes.join('; ') + ' ' + JSON.stringify([a1, a2]).slice(0, 500));
      assert(!ex1.length && !ex2.length, 'exports: ' + ex1.concat(ex2).join(', '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfNS: c. 24 x 48 panel (18 ga, 1 in flanges, 96 holes): Make Drawing, Sheet2 flat, Hole Callout on a hole (two clicks), Autodimension ✓: the 8 + 12 hole stations jogged, the two ordinate sets clear of each other; DXF / PDF match', async function () {
      var errs0 = errors.length, notes = [], st = UI.drawing.state;
      await rfNSMake(RFNS.panel);
      if (!rfNSFlatW()) await rfNSSheet(1);
      var w = rfNSFlatW();
      assert(w, 'the flat view');
      notes.push('scale ' + (w.view.scale || st.sheet.scale || '').toString() + ' before ' + rfNSCount(rfNSAudit()));
      var c = w.proj.circles.visible.filter(function (x) { return Math.abs(x.r - 0.125) < 1e-4; }).sort(function (a, b) { return (b.c[0] + b.c[1]) - (a.c[0] + a.c[1]); })[0];
      rfNSRibbon('Hole Callout').click(); await wait(10);
      rfNSClick(w.toSheet([c.c[0] + c.r, c.c[1]])); await wait(10);
      rfNSClick(w.toSheet([c.c[0] + c.r, c.c[1]])); await rfNSDone();
      rfNSEnd();
      var hc = (st.sheet.annotations || []).filter(function (x) { return x.type === 'holeCallout'; });
      notes.push('callout ' + hc.map(function (x) { return x.text; }).join(','));
      var n = await rfNSAutodim(rfNSFlatW()), a = rfNSAudit();
      notes.push('Autodimension +' + n + '; after ' + rfNSCount(a));
      assert(hc.length === 1 && n >= 2, notes.join('; '));
      assert(!a.texts.length && !a.geo.length && !a.arrows.length, notes.join('; ') + ' ' + JSON.stringify(a).slice(0, 400));
      var ex = rfNSExports();
      assert(!ex.length, 'exports: ' + ex.join(', '));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      return notes.join('; ');
    });

    step('rfNS: d. Lofted-Bend square-to-round flat: Autodimension from the menu gives the overall width and height (ordinates between the outline\'s extreme points)', async function () {
      var errs0 = errors.length, st = UI.drawing.state;
      await rfNSMake('p.name("TRANS-1").units("in");\np.sheet(0.0598, 0.0598, 0.5);\n' +
        'var a = p.sketch("Top").polyline([[0, -2], [2, -2], [2, 2], [-2, 2], [-2, -2], [-0.001, -2]], false).id();\n' +
        'var b = p.sketch("Top", 3).arc(0, 0, 1, 270.03, 360).arc(0, 0, 1, 0, 90).arc(0, 0, 1, 90, 180).arc(0, 0, 1, 180, 270).id();\n' +
        'p.loftedBend([a, b]);');
      if (!rfNSFlatW()) await rfNSSheet(1);
      var w = rfNSFlatW();
      assert(w, 'the flat view');
      var n = await rfNSAutodim(w), b = w.proj.bounds;
      var ords = st.sheet.dims.filter(function (d) { return d.view === w.view.id && d.kind === 'ordinate'; });
      var span = ords.map(function (d) { return Math.max.apply(null, d.values.map(Math.abs)); }).sort(function (x, y) { return x - y; });
      var want = [b.umax - b.umin, b.vmax - b.vmin].sort(function (x, y) { return x - y; });
      assert(ords.length === 2 && Math.abs(span[0] - want[0]) < 1e-6 && Math.abs(span[1] - want[1]) < 1e-6, 'overall ' + span + ' vs ' + want + ' (' + n + ')');
      var a = rfNSAudit(), fan = a.texts.filter(function (x) { return !/^(UP|DOWN) [\d.]+° R/.test(x.split(' / ')[0]) || !/^(UP|DOWN) [\d.]+° R/.test(x.split(' / ')[1]); });
      assert(!fan.length && !a.geo.length, rfNSCount(a) + ' ' + JSON.stringify(a).slice(0, 600));
      // the fan's bend notes still print (every bend keeps its note); those that cover another are counted on the sheet
      var notes = (st.sheet.annotations || []).filter(function (x) { return x.view === w.view.id && x.type === 'bendNote'; });
      var wn = (anvil.drawing.summary().warnings || []).filter(function (x) { return /bend notes? covers? another/.test(x); });
      assert(notes.length === 20 && notes.every(function (x) { return !x.hidden; }) && wn.length === 1, 'notes ' + notes.length + ' ' + JSON.stringify(wn));
      assert(errors.length === errs0, 'errors: ' + errors.slice(errs0).join(' | '));
      anvil.drawing.close(); await idle(); if (modalOpen()) clickModalButton("Don't Save");
      return ords.map(function (d) { return d.text; }).join(' ; ') + '; bend-note pairs on each other ' + a.texts.length + ': ' + wn.join('');
    });
  })();
